import cron from 'node-cron';
import { query } from '../config/db.js';
import { log } from '../utils/logger.js';

/**
 * Сервис для отслеживания просроченных объяснительных
 * Проверяет каждые 10 минут, есть ли объяснительные, которые не были предоставлены в течение 1 часа
 */
export class ExplanationTimeoutService {
  constructor({ toolRouter, notifier, explanatoryService }) {
    this.toolRouter = toolRouter;
    this.notifier = notifier;
    this.explanatoryService = explanatoryService;
    this.isRunning = false;
  }

  /**
   * Запускает планировщик проверки просроченных объяснительных
   */
  start() {
    if (this.isRunning) {
      log.warn('[ExplanationTimeoutService] Сервис уже запущен');
      return;
    }

    // Проверяем каждые 10 минут
    this.task = cron.schedule('*/10 * * * *', async () => {
      try {
        await this.checkOverdueExplanations();
      } catch (error) {
        log.error('[ExplanationTimeoutService] Ошибка проверки просроченных объяснительных:', error.message);
      }
    }, { timezone: 'Asia/Dushanbe' });

    this.task.start();
    this.isRunning = true;
    log.info('[ExplanationTimeoutService] Сервис запущен - проверка каждые 10 минут');
  }

  /**
   * Останавливает планировщик
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this.isRunning = false;
    log.info('[ExplanationTimeoutService] Сервис остановлен');
  }

  /**
   * Проверяет просроченные объяснительные и уведомляет директора
   */
  async checkOverdueExplanations() {
    try {
      // Находим объяснительные, которые были запрошены более 1 часа назад и не получили ответ
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const rows = await query(`
        SELECT 
          ee.id,
          ee.task_id,
          ee.employee_id,
          ee.requested_at,
          e.name as employee_name,
          e.chat_id as employee_chat_id,
          e.job as employee_job,
          t.task as task_title
        FROM employee_explanations ee
        LEFT JOIN employees e ON ee.employee_id = e.employee_id
        LEFT JOIN tasks t ON ee.task_id = t.task_id
        WHERE ee.status = 'pending' 
          AND ee.requested_at < ?
        ORDER BY ee.requested_at ASC
      `, [oneHourAgo]);

      if (!rows || rows.length === 0) {
        return; // Нет просроченных объяснительных
      }

      log.info(`[ExplanationTimeoutService] Найдено ${Array.isArray(rows) ? rows.length : 0} просроченных объяснительных`);

      // Группируем по сотрудникам для удобства
      const overdueByEmployee = {};
      for (const row of rows) {
        const empId = String(row.employee_id);
        if (!overdueByEmployee[empId]) {
          overdueByEmployee[empId] = {
            employee: {
              name: row.employee_name,
              chat_id: row.employee_chat_id,
              job: row.employee_job
            },
            explanations: []
          };
        }
        overdueByEmployee[empId].explanations.push(row);
      }

      // Отправляем уведомления директору
      await this.notifyDirectorAboutOverdueExplanations(overdueByEmployee);

        // Логируем просроченные объяснительные (оставляем статус 'pending')
        const explanationIds = (Array.isArray(rows) ? rows : []).map(row => row.id);
        if (explanationIds.length > 0) {
          log.info(`[ExplanationTimeoutService] Найдено ${explanationIds.length} просроченных объяснительных (статус остается 'pending')`);
        }

    } catch (error) {
      log.error('[ExplanationTimeoutService] Ошибка проверки просроченных объяснительных:', error.message);
    }
  }

  /**
   * Уведомляет директора о просроченных объяснительных
   */
  async notifyDirectorAboutOverdueExplanations(overdueByEmployee) {
    try {
      // Получаем список директоров
      const directorChatIds = await this.getDirectorChatIds();
      
      if (directorChatIds.length === 0) {
        log.warn('[ExplanationTimeoutService] Не найдены директора для уведомления');
        return;
      }

      // Формируем сообщение
      const message = this.buildOverdueExplanationMessage(overdueByEmployee);

      // Отправляем каждому директору
      for (const directorChatId of directorChatIds) {
        try {
          if (this.toolRouter?.route) {
            await this.toolRouter.route('send_telegram', { 
              to: directorChatId, 
              text: message 
            }, {
              requesterChatId: 'system',
              requesterEmployee: { user_role: 'manager', name: 'System Timeout Monitor' }
            });
          } else if (this.notifier?.sendMessage) {
            await this.notifier.sendMessage(directorChatId, message);
          } else if (this.notifier?.sendText) {
            await this.notifier.sendText(directorChatId, message);
          }
          
          log.info(`[ExplanationTimeoutService] Уведомление отправлено директору ${directorChatId}`);
        } catch (error) {
          log.error(`[ExplanationTimeoutService] Ошибка отправки уведомления директору ${directorChatId}:`, error.message);
        }
      }

    } catch (error) {
      log.error('[ExplanationTimeoutService] Ошибка уведомления директора:', error.message);
    }
  }

  /**
   * Получает список chat_id директоров
   */
  async getDirectorChatIds() {
    try {
      const [rows] = await query(`
        SELECT chat_id, name, job 
        FROM employees 
        WHERE (LOWER(job) LIKE '%директор%' 
               OR LOWER(job) LIKE '%руководитель%'
               OR LOWER(name) LIKE '%муминов%'
               OR LOWER(name) LIKE '%бахтиёр%')
          AND chat_id IS NOT NULL 
          AND chat_id != ''
      `);

      return Array.isArray(rows) ? rows.map(row => row.chat_id).filter(Boolean) : [rows.chat_id].filter(Boolean);
    } catch (error) {
      log.error('[ExplanationTimeoutService] Ошибка получения директоров:', error.message);
      return [];
    }
  }

  /**
   * Формирует сообщение о просроченных объяснительных
   */
  buildOverdueExplanationMessage(overdueByEmployee) {
    const now = new Date();
    const totalOverdue = Object.values(overdueByEmployee)
      .reduce((sum, emp) => sum + emp.explanations.length, 0);

    let message = `🚨 УВЕДОМЛЕНИЕ ДИРЕКТОРУ\n\n`;
    message += `⏰ Время: ${now.toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe' })}\n`;
    message += `📝 Просроченных объяснительных: ${totalOverdue}\n\n`;

    message += `⚠️ СОТРУДНИКИ НЕ ПРЕДОСТАВИЛИ ОБЪЯСНИТЕЛЬНЫЕ В ТЕЧЕНИЕ 1 ЧАСА:\n\n`;

    for (const [empId, data] of Object.entries(overdueByEmployee)) {
      const { employee, explanations } = data;
      const hoursOverdue = Math.floor((now - new Date(explanations[0].requested_at)) / (1000 * 60 * 60));
      
      message += `👤 ${employee.name} (${employee.job || 'Должность не указана'})\n`;
      message += `⏱ Просрочено на: ${hoursOverdue} ч.\n`;
      message += `📋 Задач требующих объяснения: ${explanations.length}\n`;
      
      // Показываем первые 3 задачи
      const tasksToShow = explanations.slice(0, 3);
      for (const exp of tasksToShow) {
        const requestedTime = new Date(exp.requested_at).toLocaleString('ru-RU');
        message += `   • Задача #${exp.task_id}: "${exp.task_title || 'Название не указано'}"\n`;
        message += `     Запрошено: ${requestedTime}\n`;
      }
      
      if (explanations.length > 3) {
        message += `   ... и еще ${explanations.length - 3} задач\n`;
      }
      
      message += `\n`;
    }

    message += `🔧 ДЕЙСТВИЯ ДЛЯ ДИРЕКТОРА:\n`;
    for (const [empId, data] of Object.entries(overdueByEmployee)) {
      const { employee } = data;
      message += `• Дать дополнительный час ${employee.name}: /give_extra_hour ${empId}\n`;
      message += `• Лишить бонуса ${employee.name}: /penalty_bonus ${empId} [сумма] [причина]\n`;
    }
    message += `\n💡 ДОПОЛНИТЕЛЬНО:\n`;
    message += `• Использовать команду /explanations для просмотра всех объяснительных\n`;
    message += `• Связаться с сотрудниками напрямую\n`;

    return message;
  }

  /**
   * Ручная проверка (для тестирования)
   */
  async checkNow() {
    log.info('[ExplanationTimeoutService] Ручная проверка просроченных объяснительных');
    await this.checkOverdueExplanations();
  }
}

/**
 * Запускает сервис мониторинга просроченных объяснительных
 */
export function startExplanationTimeoutService({ toolRouter, notifier, explanatoryService }) {
  const service = new ExplanationTimeoutService({ toolRouter, notifier, explanatoryService });
  service.start();
  return service;
}
