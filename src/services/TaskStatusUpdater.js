import cron from 'node-cron';
import { query } from '../config/db.js';
import { log } from '../utils/logger.js';

/**
 * Сервис для автоматического обновления статуса просроченных задач
 * Проверяет каждые 10 минут и меняет статус на "Просрочена" для задач, которые не выполнены в срок
 */
export class TaskStatusUpdater {
  constructor({ toolRouter, notifier, api }) {
    this.toolRouter = toolRouter;
    this.notifier = notifier;
    this.api = api;
    this.isRunning = false;
  }

  /**
   * Запускает планировщик обновления статусов
   */
  start() {
    if (this.isRunning) {
      log.warn('[TaskStatusUpdater] Сервис уже запущен');
      return;
    }

    // Проверяем каждые 10 минут
    this.task = cron.schedule('*/10 * * * *', async () => {
      try {
        await this.updateOverdueTaskStatuses();
      } catch (error) {
        log.error('[TaskStatusUpdater] Ошибка при обновлении статусов:', error.message);
      }
    }, { timezone: 'Asia/Dushanbe' });

    this.task.start();
    this.isRunning = true;
    log.info('[TaskStatusUpdater] Сервис запущен - проверка каждые 10 минут');
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
    log.info('[TaskStatusUpdater] Сервис остановлен');
  }

  /**
   * Обновляет статус просроченных задач
   */
  async updateOverdueTaskStatuses() {
    try {
      // Получаем все активные задачи
      const tasks = await this.getActiveTasks();
      if (!tasks || tasks.length === 0) {
        log.info('[TaskStatusUpdater] Нет активных задач для проверки');
        return;
      }

      const now = new Date();
      let updatedCount = 0;
      let errorCount = 0;

      for (const task of tasks) {
        try {
          // Проверяем, просрочена ли задача
          if (this.isTaskOverdue(task, now)) {
            // Обновляем статус на "Просрочена"
            await this.updateTaskStatus(task.task_id, 'Просрочена');
            updatedCount++;
            
            log.info(`[TaskStatusUpdater] Обновлен статус задачи ${task.task_id} на "Просрочена"`);
            
            // Уведомляем сотрудника о просрочке
            await this.notifyEmployeeAboutOverdue(task);
          }
        } catch (error) {
          errorCount++;
          log.error(`[TaskStatusUpdater] Ошибка обновления задачи ${task.task_id}:`, error.message);
        }
      }

      if (updatedCount > 0) {
        log.info(`[TaskStatusUpdater] Обновлено ${updatedCount} задач, ошибок: ${errorCount}`);
      }
    } catch (error) {
      log.error('[TaskStatusUpdater] Критическая ошибка при обновлении статусов:', error.message);
    }
  }

  /**
   * Получает все активные задачи
   */
  async getActiveTasks() {
    try {
      // Сначала пробуем через API
      if (this.api?.get) {
        const tasks = await this.api.get('tasks');
        if (Array.isArray(tasks)) {
          // Фильтруем только активные задачи
          return tasks.filter(task => {
            const status = (task.status || '').trim();
            return status && !['Завершена', 'Отменена', 'Просрочена'].includes(status);
          });
        }
      }

      // Fallback через ToolRouter
      if (this.toolRouter?.route) {
        const result = await this.toolRouter.route('list_tasks', {});
        const tasks = Array.isArray(result) ? result : (result?.tasks || result?.items || []);
        if (Array.isArray(tasks)) {
          return tasks.filter(task => {
            const status = (task.status || '').trim();
            return status && !['Завершена', 'Отменена', 'Просрочена'].includes(status);
          });
        }
      }

      return [];
    } catch (error) {
      log.error('[TaskStatusUpdater] Ошибка получения задач:', error.message);
      return [];
    }
  }

  /**
   * Проверяет, просрочена ли задача
   */
  isTaskOverdue(task, now = new Date()) {
    if (!task.deadline) return false;
    
    const deadline = new Date(task.deadline);
    return deadline < now;
  }

  /**
   * Обновляет статус задачи
   */
  async updateTaskStatus(taskId, newStatus) {
    try {
      // Пробуем через API
      if (this.api?.put) {
        await this.api.put(`tasks/${taskId}`, { status: newStatus });
        return;
      }

      // Fallback через ToolRouter
      if (this.toolRouter?.route) {
        await this.toolRouter.route('update_task', {
          task_id: taskId,
          status: newStatus
        }, {
          requesterChatId: 'system',
          requesterEmployee: { user_role: 'manager', name: 'System Status Updater' }
        });
        return;
      }

      throw new Error('Нет доступного способа обновления статуса задачи');
    } catch (error) {
      log.error(`[TaskStatusUpdater] Ошибка обновления статуса задачи ${taskId}:`, error.message);
      throw error;
    }
  }

  /**
   * Уведомляет сотрудника о просрочке задачи
   */
  async notifyEmployeeAboutOverdue(task) {
    try {
      if (!task.employee_id) return;

      // Получаем информацию о сотруднике
      const employee = await this.getEmployeeById(task.employee_id);
      if (!employee || !employee.chat_id) return;

      const message = `⚠️ ЗАДАЧА ПРОСРОЧЕНА

Задача: ${task.task}
Дедлайн: ${this.formatDate(task.deadline)}
Статус: Просрочена

Пожалуйста, ускорьте выполнение задачи или обратитесь к руководителю для корректировки дедлайна.`;

      if (this.toolRouter?.route) {
        await this.toolRouter.route('send_telegram', {
          to: employee.chat_id,
          text: message
        }, {
          requesterChatId: 'system',
          requesterEmployee: { user_role: 'manager', name: 'System Status Updater' }
        });
      } else if (this.notifier?.sendMessage) {
        await this.notifier.sendMessage(employee.chat_id, message);
      }
    } catch (error) {
      log.error(`[TaskStatusUpdater] Ошибка уведомления сотрудника о просрочке:`, error.message);
    }
  }

  /**
   * Получает сотрудника по ID
   */
  async getEmployeeById(employeeId) {
    try {
      if (this.api?.get) {
        const employees = await this.api.get('employees');
        if (Array.isArray(employees)) {
          return employees.find(emp => String(emp.employee_id || emp.id) === String(employeeId));
        }
      }

      if (this.toolRouter?.route) {
        const result = await this.toolRouter.route('list_employees', {});
        const employees = Array.isArray(result) ? result : (result?.employees || result?.items || []);
        if (Array.isArray(employees)) {
          return employees.find(emp => String(emp.employee_id || emp.id) === String(employeeId));
        }
      }

      return null;
    } catch (error) {
      log.error(`[TaskStatusUpdater] Ошибка получения сотрудника ${employeeId}:`, error.message);
      return null;
    }
  }

  /**
   * Форматирует дату
   */
  formatDate(date) {
    if (!date) return '—';
    const dt = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
}

/**
 * Запускает сервис обновления статусов задач
 */
export function startTaskStatusUpdater({ toolRouter, notifier, api }) {
  const updater = new TaskStatusUpdater({ toolRouter, notifier, api });
  updater.start();
  return updater;
}
