import { log } from '../utils/logger.js';

export class DecisionEngine {
  constructor(api, employeesService) {
    this.api = api;
    this.employees = employeesService;
  }

  /**
   * Анализирует команду и принимает решения по управлению
   */
  async analyzeTeamAndMakeDecisions() {
    try {
      const [employees, tasks] = await Promise.all([
        this.employees.list(),
        this.api.get('tasks')
      ]);

      const analysis = {
        teamPerformance: this.analyzeTeamPerformance(employees, tasks),
        workloadDistribution: this.analyzeWorkloadDistribution(employees, tasks),
        priorityDecisions: await this.makePriorityDecisions(tasks),
        resourceAllocation: this.analyzeResourceAllocation(employees, tasks),
        strategicRecommendations: this.generateStrategicRecommendations(employees, tasks)
      };

      return analysis;
    } catch (error) {
      log.error('[DecisionEngine] Ошибка анализа команды:', error.message);
      throw error;
    }
  }

  /**
   * Анализирует производительность команды
   */
  analyzeTeamPerformance(employees, tasks) {
    const performance = {};
    
    for (const emp of employees) {
      const empTasks = tasks.filter(t => t.employee_id == emp.employee_id);
      const completedTasks = empTasks.filter(t => t.status === 'Завершена');
      const overdueTasks = empTasks.filter(t => {
        if (!t.deadline || t.status === 'Завершена') return false;
        return new Date(t.deadline) < new Date();
      });
      
      const completionRate = empTasks.length > 0 ? (completedTasks.length / empTasks.length) * 100 : 0;
      const overdueRate = empTasks.length > 0 ? (overdueTasks.length / empTasks.length) * 100 : 0;
      
      performance[emp.employee_id] = {
        name: emp.name,
        totalTasks: empTasks.length,
        completedTasks: completedTasks.length,
        overdueTasks: overdueTasks.length,
        completionRate: Math.round(completionRate),
        overdueRate: Math.round(overdueRate),
        performance: this.calculatePerformanceScore(completionRate, overdueRate),
        recommendations: this.generatePerformanceRecommendations(completionRate, overdueRate, empTasks.length)
      };
    }
    
    return performance;
  }

  /**
   * Анализирует распределение нагрузки
   */
  analyzeWorkloadDistribution(employees, tasks) {
    const workload = {};
    const now = new Date();
    
    for (const emp of employees) {
      const empTasks = tasks.filter(t => 
        t.employee_id == emp.employee_id && 
        !['Завершена', 'Отменена'].includes(t.status)
      );
      
      const urgentTasks = empTasks.filter(t => {
        if (!t.deadline) return false;
        const deadline = new Date(t.deadline);
        const daysUntilDeadline = (deadline - now) / (1000 * 60 * 60 * 24);
        return daysUntilDeadline <= 1;
      });
      
      workload[emp.employee_id] = {
        name: emp.name,
        activeTasks: empTasks.length,
        urgentTasks: urgentTasks.length,
        workloadLevel: this.calculateWorkloadLevel(empTasks.length, urgentTasks.length),
        recommendations: this.generateWorkloadRecommendations(empTasks.length, urgentTasks.length)
      };
    }
    
    return workload;
  }

  /**
   * Принимает решения по приоритетам задач
   */
  async makePriorityDecisions(tasks) {
    const decisions = [];
    const now = new Date();
    
    for (const task of tasks) {
      if (task.status === 'Завершена' || task.status === 'Отменена') continue;
      
      const analysis = this.analyzeTaskPriority(task, now);
      if (analysis.needsAction) {
        decisions.push({
          taskId: task.task_id,
          taskTitle: task.task,
          currentPriority: task.priority || 'Средний',
          recommendedPriority: analysis.recommendedPriority,
          reasoning: analysis.reasoning,
          action: analysis.action
        });
      }
    }
    
    return decisions;
  }

  /**
   * Анализирует приоритет конкретной задачи
   */
  analyzeTaskPriority(task, now) {
    const deadline = task.deadline ? new Date(task.deadline) : null;
    const daysUntilDeadline = deadline ? (deadline - now) / (1000 * 60 * 60 * 24) : null;
    
    let recommendedPriority = task.priority || 'Средний';
    let reasoning = '';
    let needsAction = false;
    let action = '';

    // Анализ по дедлайну
    if (daysUntilDeadline !== null) {
      if (daysUntilDeadline < 0) {
        recommendedPriority = 'Критический';
        reasoning = 'Задача просрочена';
        needsAction = true;
        action = 'Требуется немедленное внимание';
      } else if (daysUntilDeadline <= 1) {
        recommendedPriority = 'Высокий';
        reasoning = 'Дедлайн в течение 24 часов';
        needsAction = true;
        action = 'Увеличить приоритет';
      }
    }

    // Анализ по ключевым словам
    const title = (task.task || '').toLowerCase();
    if (title.includes('срочно') || title.includes('критично') || title.includes('urgent')) {
      recommendedPriority = 'Критический';
      reasoning = 'Содержит ключевые слова срочности';
      needsAction = true;
      action = 'Установить критический приоритет';
    }

    // Анализ по статусу
    if (task.status === 'Новая' && daysUntilDeadline && daysUntilDeadline <= 3) {
      recommendedPriority = 'Высокий';
      reasoning = 'Новая задача с близким дедлайном';
      needsAction = true;
      action = 'Ускорить выполнение';
    }

    return {
      recommendedPriority,
      reasoning,
      needsAction,
      action
    };
  }

  /**
   * Анализирует распределение ресурсов
   */
  analyzeResourceAllocation(employees, tasks) {
    const allocation = {
      overworked: [],
      underutilized: [],
      balanced: [],
      recommendations: []
    };

    for (const emp of employees) {
      const empTasks = tasks.filter(t => 
        t.employee_id == emp.employee_id && 
        !['Завершена', 'Отменена'].includes(t.status)
      );

      if (empTasks.length >= 5) {
        allocation.overworked.push({
          employee: emp.name,
          tasks: empTasks.length,
          recommendation: 'Перераспределить задачи или добавить ресурсы'
        });
      } else if (empTasks.length <= 1) {
        allocation.underutilized.push({
          employee: emp.name,
          tasks: empTasks.length,
          recommendation: 'Назначить дополнительные задачи'
        });
      } else {
        allocation.balanced.push({
          employee: emp.name,
          tasks: empTasks.length
        });
      }
    }

    // Генерируем рекомендации
    if (allocation.overworked.length > 0 && allocation.underutilized.length > 0) {
      allocation.recommendations.push(
        `Перераспределить задачи: ${allocation.overworked[0].employee} → ${allocation.underutilized[0].employee}`
      );
    }

    return allocation;
  }

  /**
   * Генерирует стратегические рекомендации
   */
  generateStrategicRecommendations(employees, tasks) {
    const recommendations = [];
    
    // Анализ трендов производительности
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Завершена').length;
    const overdueTasks = tasks.filter(t => {
      if (!t.deadline || t.status === 'Завершена') return false;
      return new Date(t.deadline) < new Date();
    }).length;

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const overdueRate = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;

    if (overdueRate > 20) {
      recommendations.push({
        type: 'warning',
        title: 'Высокий процент просроченных задач',
        description: `${overdueRate.toFixed(1)}% задач просрочено. Рекомендуется пересмотреть планирование.`,
        action: 'Улучшить планирование и контроль дедлайнов'
      });
    }

    if (completionRate < 60) {
      recommendations.push({
        type: 'improvement',
        title: 'Низкая производительность команды',
        description: `Только ${completionRate.toFixed(1)}% задач завершено.`,
        action: 'Провести анализ причин и улучшить процессы'
      });
    }

    // Рекомендации по команде
    const activeEmployees = employees.filter(emp => {
      const empTasks = tasks.filter(t => 
        t.employee_id == emp.employee_id && 
        !['Завершена', 'Отменена'].includes(t.status)
      );
      return empTasks.length > 0;
    });

    if (activeEmployees.length < employees.length * 0.7) {
      recommendations.push({
        type: 'resource',
        title: 'Недоиспользование ресурсов команды',
        description: `Только ${activeEmployees.length} из ${employees.length} сотрудников активно работают.`,
        action: 'Оптимизировать распределение задач'
      });
    }

    return recommendations;
  }

  /**
   * Вспомогательные методы
   */
  calculatePerformanceScore(completionRate, overdueRate) {
    const baseScore = completionRate;
    const penalty = overdueRate * 2; // Штраф за просрочки
    return Math.max(0, Math.min(100, baseScore - penalty));
  }

  calculateWorkloadLevel(activeTasks, urgentTasks) {
    if (urgentTasks >= 3) return 'critical';
    if (activeTasks >= 5) return 'high';
    if (activeTasks >= 3) return 'medium';
    return 'low';
  }

  generatePerformanceRecommendations(completionRate, overdueRate, totalTasks) {
    const recommendations = [];
    
    if (completionRate < 50) {
      recommendations.push('Провести индивидуальную встречу для выяснения проблем');
    }
    
    if (overdueRate > 30) {
      recommendations.push('Улучшить планирование времени и приоритетов');
    }
    
    if (totalTasks < 2) {
      recommendations.push('Назначить дополнительные задачи');
    }
    
    return recommendations;
  }

  generateWorkloadRecommendations(activeTasks, urgentTasks) {
    const recommendations = [];
    
    if (urgentTasks >= 3) {
      recommendations.push('Критическая перегрузка - требуется немедленная помощь');
    } else if (activeTasks >= 5) {
      recommendations.push('Высокая нагрузка - рассмотреть перераспределение задач');
    } else if (activeTasks <= 1) {
      recommendations.push('Низкая загруженность - можно назначить дополнительные задачи');
    }
    
    return recommendations;
  }
}
