import { log } from '../utils/logger.js';
import { query } from '../config/db.js';

export class TaskScheduler {
  constructor(api) {
    this.api = api;
  }

  /**
   * Получает активные задачи сотрудника
   */
  async getEmployeeActiveTasks(employeeId) {
    try {
      // Получаем задачи из API
      const allTasks = await this.api.get('tasks');
      const activeTasks = allTasks.filter(task => 
        task.employee_id == employeeId && 
        this.isTaskActive(task.status)
      );
      
      log.info(`[TaskScheduler] Найдено ${activeTasks.length} активных задач для сотрудника ${employeeId}`);
      return activeTasks;
    } catch (error) {
      log.error('[TaskScheduler] Ошибка получения активных задач:', error.message);
      return [];
    }
  }

  /**
   * Проверяет, является ли задача активной
   */
  isTaskActive(status) {
    const activeStatuses = ['Новая', 'В работе', 'На проверке', 'Просрочено'];
    return activeStatuses.includes(status);
  }

  /**
   * Анализирует загруженность сотрудника и предлагает оптимальный дедлайн
   */
  async analyzeEmployeeWorkload(employeeId, newTaskComplexity, newTaskEstimatedDays) {
    try {
      const activeTasks = await this.getEmployeeActiveTasks(employeeId);
      
      if (activeTasks.length === 0) {
        log.info(`[TaskScheduler] У сотрудника ${employeeId} нет активных задач`);
        return {
          hasActiveTasks: false,
          recommendedDeadline: null,
          workload: 'low',
          reasoning: 'Нет активных задач'
        };
      }

      // Анализируем дедлайны активных задач
      const now = new Date();
      const taskDeadlines = activeTasks
        .filter(task => task.deadline)
        .map(task => ({
          taskId: task.task_id,
          taskTitle: task.task,
          deadline: new Date(task.deadline),
          status: task.status,
          priority: task.prioritet || 'Средний'
        }))
        .sort((a, b) => a.deadline - b.deadline);

      log.info(`[TaskScheduler] Анализ загруженности для сотрудника ${employeeId}:`);
      log.info(`[TaskScheduler] - Активных задач: ${activeTasks.length}`);
      log.info(`[TaskScheduler] - Задач с дедлайнами: ${taskDeadlines.length}`);

      // Определяем уровень загруженности
      const workload = this.calculateWorkloadLevel(taskDeadlines, now);
      
      // Рекомендуем дедлайн с учетом загруженности
      const recommendedDeadline = this.recommendDeadline(
        taskDeadlines, 
        newTaskComplexity, 
        newTaskEstimatedDays, 
        now
      );

      const reasoning = this.generateReasoning(activeTasks, taskDeadlines, workload, recommendedDeadline);

      return {
        hasActiveTasks: true,
        activeTasksCount: activeTasks.length,
        taskDeadlines,
        workload,
        recommendedDeadline,
        reasoning
      };

    } catch (error) {
      log.error('[TaskScheduler] Ошибка анализа загруженности:', error.message);
      return {
        hasActiveTasks: false,
        recommendedDeadline: null,
        workload: 'unknown',
        reasoning: 'Ошибка анализа загруженности'
      };
    }
  }

  /**
   * Рассчитывает уровень загруженности сотрудника
   */
  calculateWorkloadLevel(taskDeadlines, now) {
    if (taskDeadlines.length === 0) return 'low';

    const upcomingTasks = taskDeadlines.filter(task => task.deadline > now);
    const overdueTasks = taskDeadlines.filter(task => task.deadline < now);

    // Критическая загруженность
    if (overdueTasks.length > 0) {
      return 'critical';
    }

    // Высокая загруженность
    if (upcomingTasks.length >= 3) {
      return 'high';
    }

    // Средняя загруженность
    if (upcomingTasks.length >= 2) {
      return 'medium';
    }

    // Низкая загруженность
    return 'low';
  }

  /**
   * Рекомендует оптимальный дедлайн с учетом загруженности
   */
  recommendDeadline(taskDeadlines, newTaskComplexity, newTaskEstimatedDays, now) {
    if (taskDeadlines.length === 0) {
      // Нет активных задач - используем стандартную оценку
      const deadline = new Date(now.getTime() + newTaskEstimatedDays * 24 * 60 * 60 * 1000);
      deadline.setHours(17, 0, 0, 0);
      return {
        date: deadline,
        strategy: 'no_active_tasks',
        reasoning: 'Нет активных задач, используем стандартную оценку'
      };
    }

    // Находим ближайший свободный период
    const sortedDeadlines = taskDeadlines.sort((a, b) => a.deadline - b.deadline);
    const lastDeadline = sortedDeadlines[sortedDeadlines.length - 1];
    
    // Рекомендуем дедлайн после завершения последней активной задачи
    const recommendedDate = new Date(lastDeadline.deadline.getTime() + newTaskEstimatedDays * 24 * 60 * 60 * 1000);
    recommendedDate.setHours(17, 0, 0, 0);

    // Проверяем, не слишком ли далеко в будущем
    const maxDaysAhead = this.getMaxDaysAhead(newTaskComplexity);
    const maxDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);
    
    if (recommendedDate > maxDate) {
      // Если рекомендуемая дата слишком далеко, используем максимальную дату
      return {
        date: maxDate,
        strategy: 'max_date_limit',
        reasoning: `Рекомендуемая дата слишком далеко (${maxDaysAhead} дней), используем максимальный лимит`
      };
    }

    return {
      date: recommendedDate,
      strategy: 'after_last_task',
      reasoning: `После завершения последней активной задачи (${lastDeadline.taskTitle})`
    };
  }

  /**
   * Определяет максимальное количество дней вперед для разных типов задач
   */
  getMaxDaysAhead(complexity) {
    switch (complexity) {
      case 'simple': return 7;    // Простые задачи - максимум неделя
      case 'medium': return 14;   // Средние задачи - максимум 2 недели
      case 'complex': return 30;  // Сложные задачи - максимум месяц
      case 'veryComplex': return 60; // Очень сложные - максимум 2 месяца
      default: return 14;
    }
  }

  /**
   * Генерирует объяснение рекомендации
   */
  generateReasoning(activeTasks, taskDeadlines, workload, recommendedDeadline) {
    const parts = [];
    
    parts.push(`У сотрудника ${activeTasks.length} активных задач`);
    
    if (taskDeadlines.length > 0) {
      const overdue = taskDeadlines.filter(t => t.deadline < new Date()).length;
      if (overdue > 0) {
        parts.push(`${overdue} просроченных задач`);
      }
      
      const upcoming = taskDeadlines.filter(t => t.deadline > new Date()).length;
      if (upcoming > 0) {
        parts.push(`${upcoming} задач с ближайшими дедлайнами`);
      }
    }
    
    parts.push(`Уровень загруженности: ${workload}`);
    parts.push(`Стратегия планирования: ${recommendedDeadline.strategy}`);
    
    return parts.join(', ');
  }

  /**
   * Форматирует дату для отображения
   */
  formatDeadline(date) {
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'сегодня 17:00';
    } else if (diffDays === 1) {
      return 'завтра 17:00';
    } else if (diffDays <= 7) {
      return `через ${diffDays} дней (${date.toLocaleDateString('ru-RU')} 17:00)`;
    } else {
      return date.toLocaleDateString('ru-RU') + ' 17:00';
    }
  }
}
