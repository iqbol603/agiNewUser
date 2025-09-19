import cron from 'node-cron';
import { query } from '../config/db.js';
import { log } from '../utils/logger.js';

/**
 * Сервис для отслеживания объяснительных и автоматического лишения бонусов
 * Проверяет каждые 6 часов, есть ли сотрудники с 3+ объяснительными за месяц
 */
export class BonusPenaltyService {
  constructor({ toolRouter, notifier }) {
    this.toolRouter = toolRouter;
    this.notifier = notifier;
    this.isRunning = false;
  }

  /**
   * Запускает планировщик проверки бонусов
   */
  start() {
    if (this.isRunning) {
      log.warn('[BonusPenaltyService] Сервис уже запущен');
      return;
    }

    // Проверяем каждые 6 часов
    this.task = cron.schedule('0 */6 * * *', async () => {
      try {
        await this.checkMonthlyExplanations();
      } catch (error) {
        log.error('[BonusPenaltyService] Ошибка при проверке бонусов:', error.message);
      }
    }, { timezone: 'Asia/Dushanbe' });

    this.task.start();
    this.isRunning = true;
    log.info('[BonusPenaltyService] Сервис запущен - проверка каждые 6 часов');
  }

  /**
   * Останавливает сервис
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this.isRunning = false;
    log.info('[BonusPenaltyService] Сервис остановлен');
  }

  /**
   * Проверяет объяснительные за последний месяц и уведомляет о лишении бонусов
   */
  async checkMonthlyExplanations() {
    try {
      // Получаем дату месяц назад
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      // Находим сотрудников с 3+ объяснительными за месяц
      const [rows] = await query(`
        SELECT 
          ee.employee_id,
          e.name as employee_name,
          e.job as employee_job,
          e.chat_id as employee_chat_id,
          COUNT(*) as explanation_count,
          GROUP_CONCAT(ee.task_id ORDER BY ee.requested_at DESC) as tasks
        FROM employee_explanations ee
        LEFT JOIN employees e ON ee.employee_id = e.employee_id
        WHERE ee.requested_at >= ? 
          AND ee.status IN ('accepted', 'rejected', 'bonus_penalty')
        GROUP BY ee.employee_id, e.name, e.job, e.chat_id
        HAVING explanation_count >= 3
        ORDER BY explanation_count DESC
      `, [oneMonthAgo]);

      if (!rows || rows.length === 0) {
        log.info('[BonusPenaltyService] Нет сотрудников с 3+ объяснительными за месяц');
        return;
      }

      // Уведомляем директора о каждом сотруднике
      for (const row of rows) {
        await this.notifyDirectorAboutBonusPenalty(row);
      }

      log.info(`[BonusPenaltyService] Уведомлено о ${rows.length} сотрудниках для лишения бонуса`);

    } catch (error) {
      log.error('[BonusPenaltyService] Ошибка проверки месячных объяснительных:', error.message);
    }
  }

  /**
   * Уведомляет директора о необходимости лишения бонуса
   */
  async notifyDirectorAboutBonusPenalty(employeeData) {
    try {
      const { employee_name, employee_job, explanation_count, tasks } = employeeData;
      
      const taskList = tasks.split(',').slice(0, 5).join(', ');
      const moreTasks = tasks.split(',').length > 5 ? ` и еще ${tasks.split(',').length - 5} задач` : '';

      const message = `🚨 РЕКОМЕНДАЦИЯ ПО ЛИШЕНИЮ БОНУСА

Сотрудник: ${employee_name}
Должность: ${employee_job || 'Не указана'}
Период: Последний месяц
Количество объяснительных: ${explanation_count}

Задачи с объяснительными:
• ${taskList}${moreTasks}

РЕКОМЕНДАЦИЯ: Лишить бонуса за неудовлетворительное выполнение обязанностей.

Используйте команду для лишения бонуса:
/penalty_bonus ${employeeData.employee_id} [сумма_бонуса] [комментарий]`;

      // Отправляем директору
      if (this.toolRouter?.route) {
        await this.toolRouter.route('send_telegram', {
          to: process.env.DIRECTOR_CHAT_ID,
          text: message
        }, {
          requesterChatId: 'system',
          requesterEmployee: { user_role: 'manager', name: 'System Bonus Monitor' }
        });
      } else if (this.notifier?.sendMessage) {
        await this.notifier.sendMessage(process.env.DIRECTOR_CHAT_ID, message);
      }

      log.info(`[BonusPenaltyService] Уведомление о лишении бонуса отправлено для ${employee_name}`);

    } catch (error) {
      log.error(`[BonusPenaltyService] Ошибка уведомления о бонусе:`, error.message);
    }
  }

  /**
   * Получает статистику объяснительных за месяц для конкретного сотрудника
   */
  async getEmployeeExplanationStats(employeeId, monthOffset = 0) {
    try {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() - monthOffset);
      targetDate.setDate(1); // Начало месяца
      targetDate.setHours(0, 0, 0, 0);

      const nextMonth = new Date(targetDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const [rows] = await query(`
        SELECT 
          COUNT(*) as total_explanations,
          SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN status = 'penalty' THEN 1 ELSE 0 END) as penalties
        FROM employee_explanations 
        WHERE employee_id = ? 
          AND requested_at >= ? 
          AND requested_at < ?
      `, [employeeId, targetDate, nextMonth]);

      return rows[0] || { total_explanations: 0, accepted: 0, rejected: 0, penalties: 0 };

    } catch (error) {
      log.error(`[BonusPenaltyService] Ошибка получения статистики для ${employeeId}:`, error.message);
      return { total_explanations: 0, accepted: 0, rejected: 0, penalties: 0 };
    }
  }
}

/**
 * Запускает сервис мониторинга бонусов
 */
export function startBonusPenaltyService({ toolRouter, notifier }) {
  const service = new BonusPenaltyService({ toolRouter, notifier });
  service.start();
  return service;
}
