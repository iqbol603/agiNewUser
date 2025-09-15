import { log } from '../utils/logger.js';

/**
 * Сервис для валидации дедлайнов задач
 * Проверяет реалистичность установленных сроков выполнения
 */
export class DeadlineValidator {
  constructor() {
    this.workingHoursPerDay = 8; // Рабочих часов в день
    this.workingDaysPerWeek = 5; // Рабочих дней в неделю
    this.minDeadlineHours = 1; // Минимум 1 час на задачу
    this.maxDeadlineDays = 90; // Максимум 90 дней на задачу
  }

  /**
   * Валидирует дедлайн задачи
   * @param {string} task - Название задачи
   * @param {string} description - Описание задачи
   * @param {string} priority - Приоритет задачи
   * @param {string|Date} deadline - Дедлайн задачи
   * @param {string} employeeId - ID сотрудника
   * @returns {Object} Результат валидации
   */
  validateDeadline(task, description, priority, deadline, employeeId) {
    try {
      const result = {
        isValid: true,
        warnings: [],
        errors: [],
        suggestedDeadline: null,
        complexity: 'medium'
      };

      // Парсим дедлайн
      const deadlineDate = this.parseDeadline(deadline);
      if (!deadlineDate) {
        result.errors.push('Неверный формат дедлайна');
        result.isValid = false;
        return result;
      }

      // Проверяем, что дедлайн в будущем
      const now = new Date();
      if (deadlineDate <= now) {
        result.errors.push('Дедлайн не может быть в прошлом');
        result.isValid = false;
        return result;
      }

      // Анализируем сложность задачи
      const complexity = this.analyzeTaskComplexity(task, description, priority);
      result.complexity = complexity;

      // Рассчитываем рекомендуемое время выполнения
      const recommendedHours = this.calculateRecommendedTime(complexity, task, description);
      const recommendedDeadline = this.calculateRecommendedDeadline(recommendedHours);

      // Проверяем разницу между установленным и рекомендуемым дедлайном
      const timeDiff = deadlineDate.getTime() - now.getTime();
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      // Проверки на реалистичность
      if (hoursDiff < this.minDeadlineHours) {
        result.errors.push(`Слишком короткий дедлайн: ${hoursDiff.toFixed(1)} часов. Минимум: ${this.minDeadlineHours} час`);
        result.isValid = false;
      }

      if (daysDiff > this.maxDeadlineDays) {
        result.warnings.push(`Очень длинный дедлайн: ${daysDiff.toFixed(1)} дней. Максимум рекомендуется: ${this.maxDeadlineDays} дней`);
      }

      // Проверяем соответствие сложности и времени
      const recommendedDays = recommendedHours / this.workingHoursPerDay;
      const ratio = daysDiff / recommendedDays;

      if (ratio < 0.5) {
        result.warnings.push(`Дедлайн может быть слишком коротким для задачи сложности "${complexity}"`);
        result.warnings.push(`Рекомендуется: ${recommendedDays.toFixed(1)} рабочих дней`);
      } else if (ratio > 3) {
        result.warnings.push(`Дедлайн может быть слишком длинным для задачи сложности "${complexity}"`);
        result.warnings.push(`Рекомендуется: ${recommendedDays.toFixed(1)} рабочих дней`);
      }

      // Проверяем выходные и праздники
      const weekendWarning = this.checkWeekends(deadlineDate);
      if (weekendWarning) {
        result.warnings.push(weekendWarning);
      }

      // Предлагаем альтернативный дедлайн если текущий нереалистичен
      if (!result.isValid || result.warnings.length > 2) {
        result.suggestedDeadline = recommendedDeadline;
      }

      return result;

    } catch (error) {
      log.error('[DeadlineValidator] Ошибка валидации дедлайна:', error.message);
      return {
        isValid: false,
        errors: ['Ошибка при валидации дедлайна'],
        warnings: [],
        suggestedDeadline: null,
        complexity: 'unknown'
      };
    }
  }

  /**
   * Парсит дедлайн из различных форматов
   */
  parseDeadline(deadline) {
    if (!deadline) return null;

    try {
      // Если это уже Date объект
      if (deadline instanceof Date) {
        return deadline;
      }

      // Парсим строку
      const date = new Date(deadline);
      if (isNaN(date.getTime())) {
        return null;
      }

      return date;
    } catch (error) {
      return null;
    }
  }

  /**
   * Анализирует сложность задачи на основе названия и описания
   */
  analyzeTaskComplexity(task, description, priority) {
    const taskText = `${task} ${description || ''}`.toLowerCase();
    
    // Ключевые слова для определения сложности
    const lowComplexityWords = [
      'проверить', 'посмотреть', 'исправить', 'обновить', 'изменить',
      'добавить', 'удалить', 'переместить', 'копировать', 'отправить'
    ];
    
    const highComplexityWords = [
      'разработать', 'создать', 'спроектировать', 'архитектура', 'интеграция',
      'оптимизация', 'рефакторинг', 'миграция', 'тестирование', 'документация',
      'анализ', 'исследование', 'планирование', 'координация'
    ];

    const criticalWords = [
      'критический', 'срочный', 'важный', 'приоритет', 'дедлайн',
      'производство', 'продакшн', 'релиз', 'запуск'
    ];

    let complexity = 'medium';
    let score = 0;

    // Анализируем ключевые слова
    lowComplexityWords.forEach(word => {
      if (taskText.includes(word)) score -= 1;
    });

    highComplexityWords.forEach(word => {
      if (taskText.includes(word)) score += 2;
    });

    criticalWords.forEach(word => {
      if (taskText.includes(word)) score += 1;
    });

    // Анализируем длину описания
    if (description && description.length > 200) score += 1;
    if (description && description.length < 50) score -= 1;

    // Анализируем приоритет
    if (priority) {
      const priorityText = priority.toLowerCase();
      if (priorityText.includes('высокий') || priorityText.includes('критический')) score += 1;
      if (priorityText.includes('низкий')) score -= 1;
    }

    // Определяем сложность
    if (score <= -2) complexity = 'low';
    else if (score >= 3) complexity = 'high';
    else if (score >= 1) complexity = 'medium-high';
    else complexity = 'medium';

    return complexity;
  }

  /**
   * Рассчитывает рекомендуемое время выполнения в часах
   */
  calculateRecommendedTime(complexity, task, description) {
    const baseHours = {
      'low': 2,
      'medium': 8,
      'medium-high': 16,
      'high': 32
    };

    let hours = baseHours[complexity] || 8;

    // Корректируем на основе длины описания
    if (description) {
      const descriptionLength = description.length;
      if (descriptionLength > 500) hours *= 1.5;
      else if (descriptionLength > 200) hours *= 1.2;
      else if (descriptionLength < 50) hours *= 0.8;
    }

    // Корректируем на основе длины названия задачи
    if (task.length > 100) hours *= 1.3;
    else if (task.length < 20) hours *= 0.9;

    return Math.max(1, Math.round(hours));
  }

  /**
   * Рассчитывает рекомендуемый дедлайн
   */
  calculateRecommendedDeadline(hours) {
    const now = new Date();
    const workingDays = Math.ceil(hours / this.workingHoursPerDay);
    
    // Добавляем рабочие дни (пропускаем выходные)
    let targetDate = new Date(now);
    let addedDays = 0;
    
    while (addedDays < workingDays) {
      targetDate.setDate(targetDate.getDate() + 1);
      const dayOfWeek = targetDate.getDay();
      
      // Пропускаем выходные (0 = воскресенье, 6 = суббота)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        addedDays++;
      }
    }

    // Устанавливаем время на конец рабочего дня
    targetDate.setHours(18, 0, 0, 0);
    
    return targetDate;
  }

  /**
   * Проверяет, не попадает ли дедлайн на выходные
   */
  checkWeekends(deadline) {
    const dayOfWeek = deadline.getDay();
    
    if (dayOfWeek === 0) { // Воскресенье
      return 'Дедлайн установлен на воскресенье. Рекомендуется перенести на понедельник';
    }
    
    if (dayOfWeek === 6) { // Суббота
      return 'Дедлайн установлен на субботу. Рекомендуется перенести на пятницу';
    }

    return null;
  }

  /**
   * Форматирует время для отображения
   */
  formatTime(hours) {
    if (hours < 24) {
      return `${hours} часов`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (remainingHours === 0) {
        return `${days} дней`;
      } else {
        return `${days} дней ${remainingHours} часов`;
      }
    }
  }
}

export const deadlineValidator = new DeadlineValidator();
