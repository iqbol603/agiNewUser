import { log } from '../utils/logger.js';

export class LeadershipCommands {
  constructor(decisionEngine, toolRouter) {
    this.decisionEngine = decisionEngine;
    this.toolRouter = toolRouter;
  }

  /**
   * Анализирует команду и выдает рекомендации
   */
  async analyzeTeam() {
    try {
      const analysis = await this.decisionEngine.analyzeTeamAndMakeDecisions();
      
      let report = '📊 АНАЛИЗ КОМАНДЫ - РУКОВОДИТЕЛЬСКИЙ ОТЧЕТ\n\n';
      
      // Производительность команды
      report += '👥 ПРОИЗВОДИТЕЛЬНОСТЬ КОМАНДЫ:\n';
      for (const [empId, perf] of Object.entries(analysis.teamPerformance)) {
        const status = perf.performance >= 80 ? '🟢' : perf.performance >= 60 ? '🟡' : '🔴';
        report += `${status} ${perf.name}: ${perf.performance}% (${perf.completedTasks}/${perf.totalTasks} задач)\n`;
        if (perf.recommendations.length > 0) {
          report += `   💡 Рекомендации: ${perf.recommendations.join(', ')}\n`;
        }
      }
      
      report += '\n⚖️ РАСПРЕДЕЛЕНИЕ НАГРУЗКИ:\n';
      for (const [empId, workload] of Object.entries(analysis.workloadDistribution)) {
        const level = workload.workloadLevel === 'critical' ? '🔴' : 
                     workload.workloadLevel === 'high' ? '🟠' : 
                     workload.workloadLevel === 'medium' ? '🟡' : '🟢';
        report += `${level} ${workload.name}: ${workload.activeTasks} активных, ${workload.urgentTasks} срочных\n`;
        if (workload.recommendations.length > 0) {
          report += `   💡 ${workload.recommendations.join(', ')}\n`;
        }
      }
      
      // Решения по приоритетам
      if (analysis.priorityDecisions.length > 0) {
        report += '\n🎯 РЕКОМЕНДАЦИИ ПО ПРИОРИТЕТАМ:\n';
        for (const decision of analysis.priorityDecisions.slice(0, 5)) {
          report += `• #${decision.taskId} "${decision.taskTitle}"\n`;
          report += `  ${decision.currentPriority} → ${decision.recommendedPriority}\n`;
          report += `  💭 ${decision.reasoning}\n`;
          report += `  ⚡ ${decision.action}\n\n`;
        }
      }
      
      // Стратегические рекомендации
      if (analysis.strategicRecommendations.length > 0) {
        report += '\n🚀 СТРАТЕГИЧЕСКИЕ РЕКОМЕНДАЦИИ:\n';
        for (const rec of analysis.strategicRecommendations) {
          const icon = rec.type === 'warning' ? '⚠️' : rec.type === 'improvement' ? '📈' : '💡';
          report += `${icon} ${rec.title}\n`;
          report += `   ${rec.description}\n`;
          report += `   🎯 ${rec.action}\n\n`;
        }
      }
      
      return report;
    } catch (error) {
      log.error('[LeadershipCommands] Ошибка анализа команды:', error.message);
      return '❌ Ошибка при анализе команды. Попробуйте позже.';
    }
  }

  /**
   * Генерирует стратегический отчет
   */
  async generateStrategicReport() {
    try {
      const analysis = await this.decisionEngine.analyzeTeamAndMakeDecisions();
      
      let report = '🎯 СТРАТЕГИЧЕСКИЙ ОТЧЕТ РУКОВОДИТЕЛЯ\n\n';
      
      // Общая статистика
      const totalEmployees = Object.keys(analysis.teamPerformance).length;
      const avgPerformance = Object.values(analysis.teamPerformance)
        .reduce((sum, perf) => sum + perf.performance, 0) / totalEmployees;
      
      report += `📈 ОБЩИЕ ПОКАЗАТЕЛИ:\n`;
      report += `• Команда: ${totalEmployees} сотрудников\n`;
      report += `• Средняя производительность: ${avgPerformance.toFixed(1)}%\n`;
      report += `• Перегруженных: ${analysis.workloadDistribution.overworked?.length || 0}\n`;
      report += `• Недогруженных: ${analysis.workloadDistribution.underutilized?.length || 0}\n\n`;
      
      // Критические решения
      const criticalDecisions = analysis.priorityDecisions.filter(d => 
        d.recommendedPriority === 'Критический'
      );
      
      if (criticalDecisions.length > 0) {
        report += `🚨 КРИТИЧЕСКИЕ ЗАДАЧИ (${criticalDecisions.length}):\n`;
        for (const decision of criticalDecisions.slice(0, 3)) {
          report += `• #${decision.taskId}: ${decision.taskTitle}\n`;
        }
        report += '\n';
      }
      
      // Рекомендации по ресурсам
      if (analysis.resourceAllocation.recommendations.length > 0) {
        report += `💼 РЕКОМЕНДАЦИИ ПО РЕСУРСАМ:\n`;
        for (const rec of analysis.resourceAllocation.recommendations) {
          report += `• ${rec}\n`;
        }
        report += '\n';
      }
      
      // Стратегические рекомендации
      if (analysis.strategicRecommendations.length > 0) {
        report += `🎯 СТРАТЕГИЧЕСКИЕ ДЕЙСТВИЯ:\n`;
        for (const rec of analysis.strategicRecommendations) {
          report += `• ${rec.action}\n`;
        }
      }
      
      return report;
    } catch (error) {
      log.error('[LeadershipCommands] Ошибка генерации стратегического отчета:', error.message);
      return '❌ Ошибка при генерации стратегического отчета.';
    }
  }

  /**
   * Предлагает улучшения для команды
   */
  async suggestImprovements() {
    try {
      const analysis = await this.decisionEngine.analyzeTeamAndMakeDecisions();
      
      let suggestions = '💡 РЕКОМЕНДАЦИИ ПО УЛУЧШЕНИЮ КОМАНДЫ\n\n';
      
      // Анализ проблемных зон
      const lowPerformers = Object.entries(analysis.teamPerformance)
        .filter(([id, perf]) => perf.performance < 60)
        .map(([id, perf]) => perf);
      
      if (lowPerformers.length > 0) {
        suggestions += '🔴 ТРЕБУЮТ ВНИМАНИЯ:\n';
        for (const perf of lowPerformers) {
          suggestions += `• ${perf.name} (${perf.performance}% производительность)\n`;
          suggestions += `  - ${perf.recommendations.join(', ')}\n`;
        }
        suggestions += '\n';
      }
      
      // Рекомендации по оптимизации
      const overworked = analysis.workloadDistribution.overworked || [];
      const underutilized = analysis.workloadDistribution.underutilized || [];
      
      if (overworked.length > 0 && underutilized.length > 0) {
        suggestions += '⚖️ ОПТИМИЗАЦИЯ НАГРУЗКИ:\n';
        suggestions += `• Перераспределить задачи от ${overworked[0].employee} к ${underutilized[0].employee}\n`;
        suggestions += `• Это улучшит баланс команды\n\n`;
      }
      
      // Рекомендации по процессам
      suggestions += '🔄 УЛУЧШЕНИЕ ПРОЦЕССОВ:\n';
      suggestions += '• Внедрить ежедневные стендапы для контроля прогресса\n';
      suggestions += '• Установить четкие критерии приоритизации задач\n';
      suggestions += '• Создать систему раннего предупреждения о рисках\n';
      suggestions += '• Регулярно проводить ретроспективы команды\n';
      
      return suggestions;
    } catch (error) {
      log.error('[LeadershipCommands] Ошибка генерации рекомендаций:', error.message);
      return '❌ Ошибка при генерации рекомендаций.';
    }
  }

  /**
   * Автоматически принимает решения по задачам
   */
  async autoDecideOnTasks() {
    try {
      const analysis = await this.decisionEngine.analyzeTeamAndMakeDecisions();
      const decisions = analysis.priorityDecisions;
      
      let report = '🤖 АВТОМАТИЧЕСКИЕ РЕШЕНИЯ РУКОВОДИТЕЛЯ\n\n';
      
      if (decisions.length === 0) {
        report += '✅ Все задачи имеют корректные приоритеты. Действий не требуется.\n';
        return report;
      }
      
      report += `📋 НАЙДЕНО ${decisions.length} ЗАДАЧ ДЛЯ ОБНОВЛЕНИЯ:\n\n`;
      
      for (const decision of decisions.slice(0, 10)) {
        report += `🎯 Задача #${decision.taskId}: "${decision.taskTitle}"\n`;
        report += `   Текущий приоритет: ${decision.currentPriority}\n`;
        report += `   Рекомендуемый: ${decision.recommendedPriority}\n`;
        report += `   Обоснование: ${decision.reasoning}\n`;
        report += `   Действие: ${decision.action}\n\n`;
      }
      
      if (decisions.length > 10) {
        report += `... и еще ${decisions.length - 10} задач\n`;
      }
      
      report += '💡 Для применения изменений используйте команду /apply_decisions\n';
      
      return report;
    } catch (error) {
      log.error('[LeadershipCommands] Ошибка автоматических решений:', error.message);
      return '❌ Ошибка при принятии автоматических решений.';
    }
  }
}

