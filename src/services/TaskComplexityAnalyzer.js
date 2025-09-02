import { log } from '../utils/logger.js';

export class TaskComplexityAnalyzer {
  constructor() {
    // Ключевые слова для определения сложности задач
    this.complexityKeywords = {
      // Простые задачи (1-2 дня)
      simple: [
        'проверить', 'просмотреть', 'ознакомиться', 'изучить', 'прочитать',
        'отправить', 'написать', 'создать', 'добавить', 'удалить',
        'обновить', 'изменить', 'исправить', 'заменить', 'переместить',
        'копировать', 'вставить', 'скачать', 'загрузить', 'выгрузить',
        'экспорт', 'импорт', 'резервная копия', 'бэкап', 'архив',
        'настройка', 'конфигурация', 'параметры', 'опции'
      ],
      
      // Средние задачи (3-7 дней)
      medium: [
        'разработка', 'программирование', 'кодирование', 'реализация',
        'интеграция', 'подключение', 'настройка интеграции', 'api',
        'тестирование', 'проверка', 'отладка', 'debug', 'исправление ошибок',
        'оптимизация', 'улучшение', 'рефакторинг', 'модернизация',
        'документация', 'описание', 'инструкция', 'руководство',
        'обучение', 'тренировка', 'курс', 'презентация',
        'анализ', 'исследование', 'изучение', 'обзор'
      ],
      
      // Сложные задачи (1-4 недели)
      complex: [
        'архитектура', 'проектирование', 'планирование', 'стратегия',
        'система', 'платформа', 'фреймворк', 'библиотека',
        'миграция', 'переход', 'обновление системы', 'модернизация',
        'безопасность', 'защита', 'шифрование', 'аутентификация',
        'масштабирование', 'производительность', 'нагрузка',
        'автоматизация', 'скрипт', 'процесс', 'workflow',
        'мониторинг', 'логирование', 'аналитика', 'отчеты',
        'развертывание', 'деплой', 'production', 'продакшн',
        'внедрить систему', 'централизованное', 'производительности'
      ],
      
      // Очень сложные задачи (1-3 месяца)
      veryComplex: [
        'полная разработка', 'создание с нуля', 'новый продукт',
        'микросервисы', 'распределенная система', 'облачная архитектура',
        'машинное обучение', 'искусственный интеллект', 'нейронные сети',
        'блокчейн', 'криптография', 'алгоритмы', 'структуры данных',
        'мобильное приложение', 'веб-приложение', 'десктопное приложение',
        'игра', 'симуляция', 'визуализация', 'графика',
        'ios', 'android', 'приложение', 'платформа', 'система с нуля'
      ]
    };
    
    // Ключевые слова для определения приоритета
    this.priorityKeywords = {
      critical: ['срочно', 'критично', 'критический', 'немедленно', 'asap', 'urgent', 'блокер', 'ошибка', 'баг', 'не работает'],
      high: ['важно', 'высокий', 'приоритет', 'быстро', 'скоро', 'дедлайн', 'срок'],
      medium: ['обычно', 'стандартно', 'нормально', 'планово'],
      low: ['неважно', 'низкий', 'можно подождать', 'когда будет время', 'не срочно']
    };
  }
  
  /**
   * Анализирует сложность задачи и возвращает рекомендуемое время выполнения
   */
  analyzeTaskComplexity(taskTitle, taskDescription = '') {
    const text = `${taskTitle} ${taskDescription}`.toLowerCase();
    
    // Подсчитываем совпадения по категориям сложности
    const scores = {
      simple: 0,
      medium: 0,
      complex: 0,
      veryComplex: 0
    };
    
    // Анализируем ключевые слова
    for (const [complexity, keywords] of Object.entries(this.complexityKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          scores[complexity]++;
          
          // Дополнительные очки за контекстные фразы
          if (complexity === 'veryComplex') {
            if (text.includes('с нуля') || text.includes('полная разработка') || text.includes('новый продукт')) {
              scores[complexity] += 2; // Дополнительные очки за очень сложные фразы
            }
          }
          
          if (complexity === 'complex') {
            if (text.includes('система') || text.includes('архитектура') || text.includes('платформа')) {
              scores[complexity] += 1; // Дополнительные очки за системные задачи
            }
          }
        }
      }
    }
    
    // Определяем приоритет
    const priority = this.analyzePriority(text);
    
    // Определяем сложность на основе максимального количества совпадений
    const maxScore = Math.max(...Object.values(scores));
    const complexity = Object.keys(scores).find(key => scores[key] === maxScore) || 'medium';
    
    // Рассчитываем время выполнения
    const timeEstimate = this.calculateTimeEstimate(complexity, priority, text);
    
    log.info(`[TaskComplexityAnalyzer] Анализ задачи: "${taskTitle}"`);
    log.info(`[TaskComplexityAnalyzer] Сложность: ${complexity}, Приоритет: ${priority}, Время: ${timeEstimate.days} дней`);
    
    return {
      complexity,
      priority,
      estimatedDays: timeEstimate.days,
      estimatedHours: timeEstimate.hours,
      confidence: this.calculateConfidence(scores, maxScore),
      reasoning: this.generateReasoning(complexity, priority, scores)
    };
  }
  
  /**
   * Анализирует приоритет задачи
   */
  analyzePriority(text) {
    for (const [priority, keywords] of Object.entries(this.priorityKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          return priority;
        }
      }
    }
    return 'medium';
  }
  
  /**
   * Рассчитывает время выполнения на основе сложности и приоритета
   */
  calculateTimeEstimate(complexity, priority, text) {
    let baseDays = 1;
    
    // Базовое время по сложности
    switch (complexity) {
      case 'simple':
        baseDays = 1;
        break;
      case 'medium':
        baseDays = 3;
        break;
      case 'complex':
        baseDays = 7;
        break;
      case 'veryComplex':
        baseDays = 14;
        break;
    }
    
    // Корректировка по приоритету
    switch (priority) {
      case 'critical':
        baseDays = Math.max(1, Math.ceil(baseDays * 0.5)); // Критичные задачи делаются быстрее
        break;
      case 'high':
        baseDays = Math.ceil(baseDays * 0.8);
        break;
      case 'low':
        baseDays = Math.ceil(baseDays * 1.5); // Низкий приоритет = больше времени
        break;
    }
    
    // Дополнительные факторы
    if (text.includes('тестирование') || text.includes('проверка')) {
      baseDays += 1; // Тестирование требует дополнительного времени
    }
    
    if (text.includes('документация') || text.includes('описание')) {
      baseDays += 1; // Документация требует времени
    }
    
    if (text.includes('интеграция') || text.includes('подключение')) {
      baseDays += 2; // Интеграции часто сложнее
    }
    
    // Минимум 1 день, максимум 30 дней
    baseDays = Math.max(1, Math.min(30, baseDays));
    
    return {
      days: baseDays,
      hours: baseDays * 8 // Предполагаем 8 часов в день
    };
  }
  
  /**
   * Рассчитывает уверенность в оценке
   */
  calculateConfidence(scores, maxScore) {
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (totalScore === 0) return 0.3; // Низкая уверенность если нет ключевых слов
    
    const confidence = maxScore / totalScore;
    return Math.min(0.9, Math.max(0.3, confidence));
  }
  
  /**
   * Генерирует объяснение оценки
   */
  generateReasoning(complexity, priority, scores) {
    const reasons = [];
    
    if (scores[complexity] > 0) {
      reasons.push(`Найдены ключевые слова сложности: ${scores[complexity]} совпадений`);
    }
    
    if (priority !== 'medium') {
      reasons.push(`Определен приоритет: ${priority}`);
    }
    
    if (reasons.length === 0) {
      reasons.push('Использована стандартная оценка сложности');
    }
    
    return reasons.join(', ');
  }
  
  /**
   * Генерирует рекомендуемый дедлайн
   */
  generateDeadline(analysis, startDate = new Date()) {
    const start = new Date(startDate);
    const deadline = new Date(start.getTime() + analysis.estimatedDays * 24 * 60 * 60 * 1000);
    
    // Корректируем на рабочие дни (исключаем выходные)
    let workingDays = 0;
    let currentDate = new Date(start);
    
    while (workingDays < analysis.estimatedDays) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Не воскресенье и не суббота
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Устанавливаем время на 17:00 (конец рабочего дня)
    deadline.setHours(17, 0, 0, 0);
    
    return {
      date: deadline,
      formatted: this.formatDeadline(deadline),
      workingDays: analysis.estimatedDays,
      confidence: analysis.confidence
    };
  }
  
  /**
   * Форматирует дедлайн для отображения
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
