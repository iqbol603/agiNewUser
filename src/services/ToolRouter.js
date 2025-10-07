import { EmployeesService } from './EmployeesService.js';
import { ApiClient } from './ApiClient.js';
import { Notifier } from './Notifier.js';
import { parseHumanDateRu, toDbDateTime } from '../utils/datetime.js';
import { query } from '../config/db.js';
import { log } from '../utils/logger.js';
import { TaskComplexityAnalyzer } from './TaskComplexityAnalyzer.js';
import { TaskScheduler } from './TaskScheduler.js';
import { deadlineValidator } from './DeadlineValidator.js';

const norm = (s) => String(s || '').trim().toLowerCase();

function isDirectorOrAssistant(employee) {
  if (!employee) return false;
  const job = String(employee.job || employee.position || '').toLowerCase();
  const name = String(employee.name || '').toLowerCase();
  const userRole = String(employee.user_role || '').toLowerCase();
  
  // Исключаем только настоящих директоров и помощниц
  if (/директор/.test(job) && !/отдела маркетинга/.test(job)) return true;
  if (/помощник|помощница/.test(job)) return true;
  if (name.includes('муминов') || name.includes('бахтиёр') || name.includes('химматова') || name.includes('нигора') || name.includes('боймирзоева') || name.includes('нозима')) return true;
  if (userRole === 'manager' && /помощник|помощница/.test(job)) return true;
  
  return false;
}

function isMarketingEmployee(employee) {
  if (!employee) return false;
  const job = String(employee.job || employee.position || '').toLowerCase();
  
  // Сначала проверяем, что это сотрудник маркетинга
  if (!/маркет/.test(job)) return false;
  
  // Исключаем директоров и помощниц (даже если у них "маркетинг" в должности)
  if (isDirectorOrAssistant(employee)) return false;
  
  return true;
}

const mapTaskRow = (t, employeesById = new Map(), assignersByTaskId = new Map()) => {
	const emp = employeesById.get(t.employee_id) || null;
	const assigner = assignersByTaskId.get(t.task_id) || null;
	return {
		id: t.task_id, // В локальной БД поле называется task_id
		task: t.task,
		description: t.description || '',
		assignee: emp?.name || t.employee_id,
		deadline: t.deadline || null,
		status: t.status || null,
		priority: t.prioritet || t.priority || null,
		chat_id: emp?.chat_id || null,
		assigned_by: assigner?.name || null
	};
};

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Создать задачу и назначить исполнителя',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Заголовок задачи' },
          assigneeName: { type: 'string', description: 'Имя/ФИО исполнителя' },
          desc: { type: 'string', description: 'Описание' },
          deadline: { type: 'string', description: 'Дедлайн (например, "завтра 10:00")' },
          priority: { type: 'string', enum: ['Критический','Высокий','Средний','Низкий','Очень низкий'] }
        },
        required: ['title','assigneeName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_deadline',
      description: 'Установить дедлайн задачи (менеджер/директор)',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number' },
          deadline: { type: 'string', description: 'Относительное или абсолютное время (на 2 часа, через 10 минут, 2025-09-20 17:00)' }
        },
        required: ['taskId','deadline']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Обновить данные задачи (только для менеджера/директора)',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number' },
          title: { type: 'string' },
          desc: { type: 'string' },
          deadline: { type: 'string' },
          priority: { type: 'string' },
          assigneeName: { type: 'string' },
          employee_id: { type: 'number' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_status',
      description: 'Обновить статус существующей задачи',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'ID задачи' },
          status: { type: 'string', description: 'Новый статус' }
        },
        required: ['taskId','status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_employees',
      description: 'Вернуть список сотрудников',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_marketing_employees',
      description: 'Получить список сотрудников отдела маркетинга (исключая директоров и помощниц)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Список задач (staff видит только свои)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'report',
      description: 'Агрегированный отчёт по задачам',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_telegram',
      description: 'Отправить сообщение в Telegram сотруднику/всем',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'chat_id, имя/ФИО или "all/всем"' },
          text: { type: 'string', description: 'Текст сообщения' }
        },
        required: ['to','text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reassign_task',
      description: 'Переназначить исполнителя задачи',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'ID задачи' },
          assigneeName: { type: 'string', description: 'Имя/ФИО нового исполнителя' },
          employee_id: { type: 'number', description: 'ID сотрудника (альтернатива assigneeName)' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_dod_checklist',
      description: 'Создать DoD чек-лист для задачи',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'ID задачи' },
          checklistType: { type: 'string', enum: ['development', 'testing', 'deployment', 'documentation'], description: 'Тип чек-листа' },
          items: { type: 'array', items: { type: 'string' }, description: 'Список пунктов для проверки' }
        },
        required: ['taskId', 'checklistType', 'items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_dod_checklist',
      description: 'Обновить DoD чек-лист (отметить выполненные пункты)',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'ID задачи' },
          checklistType: { type: 'string', enum: ['development', 'testing', 'deployment', 'documentation'], description: 'Тип чек-листа' },
          completedItems: { type: 'array', items: { type: 'string' }, description: 'Список выполненных пунктов' }
        },
        required: ['taskId', 'checklistType', 'completedItems']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task_report',
      description: 'Создать отчет о выполненной работе',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'ID задачи' },
          summary: { type: 'string', description: 'Краткое описание выполненной работы' },
          details: { type: 'string', description: 'Детальное описание' },
          artifacts: { type: 'array', items: { type: 'string' }, description: 'Список артефактов (файлы, ссылки)' },
          quality: { type: 'string', enum: ['Отлично', 'Хорошо', 'Удовлетворительно', 'Требует доработки'], description: 'Оценка качества' }
        },
        required: ['taskId', 'summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_task_compliance',
      description: 'Проверить соответствие задачи требованиям и готовность к закрытию',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'ID задачи' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_artifact',
      description: 'Сохранить артефакт (файл) для задачи',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'ID задачи (опционально)' },
          artifactType: { type: 'string', enum: ['code', 'documentation', 'images', 'config', 'logs', 'tests', 'other'], description: 'Тип артефакта' },
          fileName: { type: 'string', description: 'Имя файла' },
          filePath: { type: 'string', description: 'Путь к файлу' },
          fileSize: { type: 'number', description: 'Размер файла в байтах' },
          contentPreview: { type: 'string', description: 'Предварительный просмотр содержимого' }
        },
        required: ['fileName', 'filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_explanation',
      description: 'Предоставить объяснительную по просроченной задаче',
      parameters: {
        type: 'object',
        properties: {
          explanationId: { type: 'number', description: 'ID запроса объяснительной' },
          explanationText: { type: 'string', description: 'Текст объяснения причин просрочки' }
        },
        required: ['explanationId', 'explanationText']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'review_explanation',
      description: 'Рассмотреть объяснительную и принять решение (только для директоров)',
      parameters: {
        type: 'object',
        properties: {
          explanationId: { type: 'number', description: 'ID объяснительной' },
          decision: { type: 'string', enum: ['accept', 'reject', 'penalty'], description: 'Решение: принять, отклонить, или наказать' },
          managerDecision: { type: 'string', description: 'Комментарий директора' },
          bonusPenaltyAmount: { type: 'number', description: 'Сумма штрафа/лишения бонуса (если decision=penalty)' }
        },
        required: ['explanationId', 'decision', 'managerDecision']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_pending_explanations',
      description: 'Получить список ожидающих рассмотрения объяснительных (только для директоров)',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Максимальное количество записей (по умолчанию 10)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_all_explanations',
      description: 'Получить все объяснительные (для менеджера): ожидают ответа, на рассмотрении, решённые',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Максимум записей на раздел (по умолчанию 10)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_my_explanations',
      description: 'Получить мои последние объяснительные (для staff)',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'force_close_task',
      description: 'Принудительно закрыть задачу (обходит все проверки)',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'ID задачи для закрытия' },
          reason: { type: 'string', description: 'Причина принудительного закрытия' }
        },
        required: ['taskId']
      }
    }
  }
];

export class ToolRouter {
  constructor({ api, employees, notifier } = {}) {
    this.api = api || new ApiClient();
    this.employees = employees || new EmployeesService(this.api);
    this.notifier = notifier; // <— важно
    this.complexityAnalyzer = new TaskComplexityAnalyzer();
    this.taskScheduler = new TaskScheduler(this.api);
  }

  async route(name, args, ctx = {}) {
    const A = { ...(args || {}) };
    const requesterChatId = String(ctx?.requesterChatId || '');

    // ---- CREATE TASK ----
    if (name === 'create_task') {
      try {
        if (!A.assigneeName && A.assignee) A.assigneeName = A.assignee;
        if (typeof A.desc === 'undefined') A.desc = '';
        if (typeof A.deadline === 'undefined') A.deadline = '';
        if (!A.priority) A.priority = 'Средний';

        const { match } = await this.employees.resolveByName(A.assigneeName);
        const assignee = match;
        const employee_id = assignee?.employee_id || assignee?.id || null;

        log.info(`[ToolRouter] Найденный сотрудник:`, JSON.stringify(assignee, null, 2));
        log.info(`[ToolRouter] employee_id для API:`, employee_id);

        // Блокируем назначение задач директору и помощницам
        if (assignee && isDirectorOrAssistant(assignee)) {
          return { ok: false, error: 'Назначение задач директору и его помощникам запрещено' };
        }
        // Дополнительно: назначаем только сотрудникам маркетинга (исключая директоров и помощниц)
        if (assignee && !isMarketingEmployee(assignee)) {
          return { ok: false, error: 'Назначение запрещено: исполнитель не является сотрудником отдела маркетинга' };
        }

        let deadline = String(A.deadline || '').trim();
        
        // Роль запрашивающего
        const requester = ctx?.requesterEmployee || null;
        const requesterRole = (requester && String(requester.user_role || '').toLowerCase()) || 'staff';
        const isDirector = requesterRole === 'manager' || /директор|стратегическому развитию/i.test(String(requester?.job || ''));

        // Валидируем дедлайн, если он указан (кроме руководителей/директоров)
        if (deadline && !isDirector) {
          const validation = deadlineValidator.validateDeadline(
            A.title, 
            A.desc, 
            A.priority, 
            deadline, 
            employee_id
          );
          
          if (!validation.isValid) {
            let errorMessage = '❌ ОШИБКА ВАЛИДАЦИИ ДЕДЛАЙНА:\n\n';
            validation.errors.forEach(error => {
              errorMessage += `• ${error}\n`;
            });
            
            if (validation.suggestedDeadline) {
              errorMessage += `\n💡 РЕКОМЕНДУЕМЫЙ ДЕДЛАЙН: ${validation.suggestedDeadline.toLocaleString('ru-RU')}\n`;
            }
            
            return { ok: false, error: errorMessage };
          }
          
          if (validation.warnings.length > 0) {
            let warningMessage = '⚠️ ПРЕДУПРЕЖДЕНИЯ ПО ДЕДЛАЙНУ:\n\n';
            validation.warnings.forEach(warning => {
              warningMessage += `• ${warning}\n`;
            });
            
            if (validation.suggestedDeadline) {
              warningMessage += `\n💡 РЕКОМЕНДУЕМЫЙ ДЕДЛАЙН: ${validation.suggestedDeadline.toLocaleString('ru-RU')}\n`;
            }
            
            warningMessage += `\nПродолжить создание задачи?`;
            
            log.warn(`[ToolRouter] Предупреждения валидации дедлайна: ${validation.warnings.join(', ')}`);
          }
        }
        
        // Если дедлайн не указан, анализируем сложность задачи и загруженность сотрудника
        if (!deadline) {
          try {
            const analysis = this.complexityAnalyzer.analyzeTaskComplexity(A.title, A.desc);
            
            // Анализируем загруженность сотрудника
            const workloadAnalysis = await this.taskScheduler.analyzeEmployeeWorkload(
              employee_id, 
              analysis.complexity, 
              analysis.estimatedDays
            );
            
            // Определяем финальный дедлайн с учетом загруженности
            let finalDeadline;
            if (workloadAnalysis.hasActiveTasks && workloadAnalysis.recommendedDeadline) {
              // Используем рекомендацию планировщика
              finalDeadline = this.taskScheduler.formatDeadline(workloadAnalysis.recommendedDeadline.date);
              log.info(`[ToolRouter] Планирование с учетом загруженности сотрудника:`);
              log.info(`[ToolRouter] - Активных задач: ${workloadAnalysis.activeTasksCount}`);
              log.info(`[ToolRouter] - Уровень загруженности: ${workloadAnalysis.workload}`);
              log.info(`[ToolRouter] - Стратегия: ${workloadAnalysis.recommendedDeadline.strategy}`);
              log.info(`[ToolRouter] - Обоснование: ${workloadAnalysis.reasoning}`);
            } else {
              // Используем стандартную оценку сложности
              const deadlineInfo = this.complexityAnalyzer.generateDeadline(analysis);
              finalDeadline = deadlineInfo.formatted;
              log.info(`[ToolRouter] Стандартное планирование (нет активных задач):`);
            }
            
            deadline = finalDeadline;
            
            // Обновляем приоритет на основе анализа, если он не был указан явно
            if (!A.priority || A.priority === 'Средний') {
              const priorityMap = {
                'critical': 'Критический',
                'high': 'Высокий', 
                'medium': 'Средний',
                'low': 'Низкий'
              };
              A.priority = priorityMap[analysis.priority] || 'Средний';
            }
            
            log.info(`[ToolRouter] Автоматический анализ сложности задачи:`);
            log.info(`[ToolRouter] - Сложность: ${analysis.complexity}`);
            log.info(`[ToolRouter] - Приоритет: ${analysis.priority}`);
            log.info(`[ToolRouter] - Оценка времени: ${analysis.estimatedDays} дней`);
            log.info(`[ToolRouter] - Финальный дедлайн: ${deadline}`);
            log.info(`[ToolRouter] - Уверенность: ${Math.round(analysis.confidence * 100)}%`);
            
          } catch (analysisError) {
            log.error(`[ToolRouter] Ошибка анализа сложности/планирования:`, analysisError.message);
            // Fallback на "завтра" если анализ не удался
            deadline = 'завтра 17:00';
          }
        }
        
        // Парсим относительные даты в абсолютные для API
        if (deadline) {
          try {
            const parsed = parseHumanDateRu(deadline, new Date());
            if (parsed) {
              deadline = toDbDateTime(parsed); // "YYYY-MM-DD HH:mm:00"
              log.info(`[ToolRouter] Парсинг даты: "${A.deadline}" -> "${deadline}"`);
            } else {
              log.warn(`[ToolRouter] Не удалось распарсить дату: "${A.deadline}", отправляем как есть`);
            }
          } catch (dateError) {
            log.error(`[ToolRouter] Ошибка парсинга даты "${A.deadline}":`, dateError.message);
            log.warn(`[ToolRouter] Отправляем дату как есть: "${deadline}"`);
          }
        }
        
        // Относительные даты теперь переводим в абсолютные; не очищаем
        
        // бэкенд нормализует даты, как у вас задумано

        const payload = {
          task: String(A.title || '').trim(),
          employee_id,
          description: String(A.desc || '').trim(),
          deadline,
          status: 'Новая',
          prioritet: String(A.priority || '').trim(),
        };

        log.info(`[ToolRouter] Отправляем в API payload:`, JSON.stringify(payload, null, 2));

        // 1. Создаем задачу через внешний API (основной способ)
        const created = await this.api.add('tasks', payload);
        log.info(`[ToolRouter] Ответ API при создании задачи:`, JSON.stringify(created, null, 2));
        
        const externalTaskId = created?.task_id;
        
        if (!externalTaskId) {
          log.error('[ToolRouter] Не удалось получить ID задачи от внешнего API');
          log.error('[ToolRouter] Полный ответ API:', created);
          return { ok: false, error: 'Не удалось создать задачу через внешний API' };
        }

        log.info(`[ToolRouter] Задача создана через внешний API с ID: ${externalTaskId}`);

        // 2. Синхронизируем с локальной БД для отображения в list_tasks и сохраняем назначившего
        try {
          await query(`
            INSERT INTO tasks (task_id, task, employee_id, description, deadline, status, prioritet, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
            task = VALUES(task), 
            employee_id = VALUES(employee_id), 
            description = VALUES(description), 
            deadline = VALUES(deadline), 
            status = VALUES(status), 
            prioritet = VALUES(prioritet)
          `, [externalTaskId, payload.task, payload.employee_id, payload.description, payload.deadline, payload.status, payload.prioritet]);
          
          await query(`CREATE TABLE IF NOT EXISTS task_assigners (
            task_id BIGINT PRIMARY KEY,
            assigner_employee_id BIGINT NULL,
            assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

          if (requester?.employee_id || requester?.id) {
            const assignerId = requester.employee_id || requester.id;
            await query(`INSERT INTO task_assigners (task_id, assigner_employee_id) VALUES (?, ?) 
              ON DUPLICATE KEY UPDATE assigner_employee_id = VALUES(assigner_employee_id)`, [externalTaskId, assignerId]);
          }

          log.info(`[ToolRouter] Задача синхронизирована с локальной БД, ID: ${externalTaskId}`);
        } catch (dbError) {
          log.error('[ToolRouter] Ошибка синхронизации с локальной БД:', dbError.message);
          // Не прерываем выполнение, задача уже создана через API
        }

        // 3. Отправляем уведомление исполнителю
        if (assignee && this.notifier) {
          await this.notifier.notifyAssignee(assignee, {
            id: externalTaskId, title: payload.task, desc: payload.description, deadline: payload.deadline, priority: payload.prioritet
          });
        }

        return { 
          ok: true, 
          taskId: externalTaskId,
          assignee: assignee?.name || A.assigneeName, 
          notified: !!assignee 
        };
      } catch (error) {
        log.error('[ToolRouter] Ошибка создания задачи:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- UPDATE STATUS ----
    if (name === 'update_status') {
      const id = String(A.taskId || '').trim();
      if (!id) return { ok: false, error: 'BAD_PARAMS: taskId required' };
      
      const newStatus = String(A.status || '').trim();
      const isClosing = newStatus === 'Завершена';
      
      try {
        // Если пытаемся закрыть задачу - проверяем DoD и запрашиваем отчет
        if (isClosing) {
          log.info(`[ToolRouter] Попытка закрыть задачу ${id}, проверяем DoD и запрашиваем отчет`);
          
          // Проверяем DoD чек-листы (упрощенная проверка)
          try {
            const { DoDService } = await import('./DoDService.js');
            const dodService = new DoDService();
            const dodStatus = await dodService.isTaskComplete(Number(id));
            
            if (!dodStatus.ok) {
              log.warn(`[ToolRouter] DoD проверка не удалась: ${dodStatus.error}`);
            } else if (!dodStatus.complete) {
              log.warn(`[ToolRouter] DoD не завершен: ${dodStatus.reason}, но продолжаем закрытие`);
              // Не блокируем закрытие, только предупреждаем
            }
          } catch (dodError) {
            log.error('[ToolRouter] Ошибка проверки DoD:', dodError.message);
          }
          
          // Проверяем наличие отчета (упрощенная проверка)
          try {
            const { ReportService } = await import('./ReportService.js');
            const reportService = new ReportService();
            const existingReport = await reportService.getTaskReport(Number(id));
            
            if (!existingReport.ok || !existingReport.report) {
              log.info(`[ToolRouter] Отчет для задачи ${id} не найден, создаем базовый отчет`);
              
              // Создаем базовый отчет автоматически
              try {
                await reportService.createTaskReport({
                  taskId: Number(id),
                  summary: 'Задача выполнена и готова к закрытию',
                  details: 'Автоматически созданный отчет при закрытии задачи',
                  quality: 'Хорошо'
                });
                log.info(`[ToolRouter] Базовый отчет для задачи ${id} создан автоматически`);
              } catch (autoReportError) {
                log.warn(`[ToolRouter] Не удалось создать автоматический отчет: ${autoReportError.message}`);
              }
            }
          } catch (reportError) {
            log.error('[ToolRouter] Ошибка проверки отчета:', reportError.message);
          }
          
          log.info(`[ToolRouter] Задача ${id} готова к закрытию: DoD завершен, отчет предоставлен`);
        }
        
        // 1. Получаем текущий статус для истории
        let oldStatus = null;
        try {
          const [currentTask] = await query('SELECT status FROM tasks WHERE task_id = ?', [id]);
          oldStatus = currentTask?.status || null;
        } catch (error) {
          log.warn('[ToolRouter] Не удалось получить текущий статус задачи:', error.message);
        }
        
        // 2. Обновляем на внешнем API
        const res = await this.api.update('tasks', id, { status: newStatus });
        
        // 3. Синхронизируем с локальной БД
        try {
          await query('UPDATE tasks SET status = ? WHERE task_id = ?', [newStatus, id]);
        } catch (dbError) {
          log.error('[ToolRouter] Ошибка синхронизации статуса с локальной БД:', dbError.message);
        }
        
        // 4. Записываем изменение статуса в историю
        try {
          await query(`
            INSERT INTO task_status_history 
            (task_id, old_status, new_status, changed_by, change_reason)
            VALUES (?, ?, ?, ?, ?)
          `, [
            id, 
            oldStatus, 
            newStatus, 
            requester?.employee_id || requester?.id || null,
            `Изменение статуса через ${requester?.name || 'систему'}`
          ]);
          log.info(`[ToolRouter] Записано изменение статуса задачи ${id}: ${oldStatus} → ${newStatus}`);
        } catch (historyError) {
          log.error('[ToolRouter] Ошибка записи истории изменения статуса:', historyError.message);
        }
        
        // 5. Уведомляем назначившего (директора/руководителя), если он есть в task_assigners
        try {
          const [rows] = await query('SELECT ta.assigner_employee_id, e.chat_id, e.name FROM task_assigners ta LEFT JOIN employees e ON e.employee_id = ta.assigner_employee_id WHERE ta.task_id = ?', [id]);
          const assigner = Array.isArray(rows) ? rows[0] : rows;
          if (assigner?.chat_id && this.notifier) {
            log.info(`[ToolRouter] Отправляем уведомление назначившему ${assigner.name} (${assigner.chat_id}) о смене статуса задачи ${id} на ${newStatus}`);
            await this.notifier.sendText(assigner.chat_id, `ℹ️ Статус задачи #${id} обновлен на: ${newStatus}`);
          } else {
            log.warn(`[ToolRouter] Не удалось найти назначившего для задачи ${id} или у него нет chat_id`);
          }
        } catch (notifyErr) {
          log.warn('[ToolRouter] Не удалось уведомить назначившего о смене статуса:', notifyErr.message);
        }

        // 6. Если задача закрывается - создаем финальный отчет
        if (isClosing) {
          try {
            const { ReportService } = await import('./ReportService.js');
            const reportService = new ReportService();
            await reportService.generateTaskReport(Number(id));
            log.info(`[ToolRouter] Финальный отчет для задачи ${id} сгенерирован`);
          } catch (finalReportError) {
            log.error('[ToolRouter] Ошибка генерации финального отчета:', finalReportError.message);
          }
        }
        
        return { ok: true, task: mapTaskRow(res) };
      } catch (error) {
        log.error('[ToolRouter] Ошибка обновления статуса:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- LIST EMPLOYEES ----
    if (name === 'list_employees') {
      const emps = await this.employees.list();
      return { ok: true, employees: emps };
    }

    // ---- LIST MARKETING EMPLOYEES ----
    if (name === 'list_marketing_employees') {
      const allEmps = await this.employees.list();
      const marketingEmps = allEmps.filter(emp => isMarketingEmployee(emp));
      return { ok: true, employees: marketingEmps };
    }

    // ---- LIST TASKS ----
    if (name === 'list_tasks') {
      try {
        const [emps] = await Promise.all([ this.employees.list() ]);

        // кто запросил
        const requester = ctx?.requesterEmployee || null;
        const requesterChatId = ctx?.requesterChatId || null;
        
        // Если нет requesterEmployee, пытаемся найти по chat_id
        let employeeToShow = requester;
        if (!employeeToShow && requesterChatId) {
          const chatIdStr = String(requesterChatId);
          employeeToShow = emps.find(emp => String(emp.chat_id) === chatIdStr);
          if (employeeToShow) {
            log.info(`[ToolRouter] Найден сотрудник по chat_id ${chatIdStr}: ${employeeToShow.name}`);
          } else {
            log.warn(`[ToolRouter] Не найден сотрудник по chat_id ${chatIdStr}`);
          }
        }
        
        // Убираем неправильную логику - не показываем все задачи если сотрудник не найден
        // if (!employeeToShow && requesterChatId) {
        //   log.warn(`[ToolRouter] Не удалось определить сотрудника, показываем все задачи`);
        // }
        
        const requesterRole = (employeeToShow && String(employeeToShow.user_role || '').toLowerCase()) || 'staff';
        const isManager = requesterRole === 'manager';
        const isStaff = requesterRole === 'staff';
        
        log.info(`[ToolRouter] Роль запрашивающего: ${requesterRole}, isManager: ${isManager}, isStaff: ${isStaff}`);

        let rows;
        if (isStaff && (employeeToShow?.employee_id || employeeToShow?.id)) {
          // STAFF видит только свои задачи
          rows = await query('SELECT * FROM tasks WHERE employee_id = ? ORDER BY created_at DESC', [employeeToShow.employee_id || employeeToShow.id]);
          log.info(`[ToolRouter] STAFF: показываем только задачи сотрудника ${employeeToShow.name} (ID: ${employeeToShow.employee_id || employeeToShow.id})`);
        } else if (isManager) {
          // MANAGER видит все задачи
          rows = await query('SELECT * FROM tasks ORDER BY created_at DESC');
          log.info(`[ToolRouter] MANAGER: показываем все задачи (запросил: ${employeeToShow?.name || 'неизвестный'})`);
        } else if (!employeeToShow) {
          // Если сотрудник не найден и он не manager - не показываем задачи
          log.warn(`[ToolRouter] Сотрудник не найден и не является manager, не показываем задачи`);
          return { ok: true, tasks: [], tasks_pretty: [], message: 'Доступ запрещен: сотрудник не найден' };
        } else {
          // По умолчанию для staff показываем только свои задачи, для других ролей - все
          if (isStaff) {
            log.warn(`[ToolRouter] STAFF без employee_id: не показываем задачи`);
            return { ok: true, tasks: [], tasks_pretty: [], message: 'Доступ запрещен: не удалось определить ваши задачи' };
          } else {
            rows = await query('SELECT * FROM tasks ORDER BY created_at DESC');
            log.info(`[ToolRouter] FALLBACK: показываем все задачи (роль: ${requesterRole})`);
          }
        }

        // справочник сотрудников
        const byId = new Map(emps.map(e => [e.employee_id || e.id, e]));
        // Подтягиваем назначивших по task_assigners
        let assignersByTaskId = new Map();
        try {
          const ids = (rows || []).map(r => r.task_id);
          if (ids.length) {
            const placeholders = ids.map(() => '?').join(',');
            const [assignRows] = await query(`SELECT ta.task_id, e.name FROM task_assigners ta LEFT JOIN employees e ON e.employee_id = ta.assigner_employee_id WHERE ta.task_id IN (${placeholders})`, ids);
            assignersByTaskId = new Map(assignRows.map(r => [r.task_id, { name: r.name }]));
          }
        } catch {}
        const tasks = (Array.isArray(rows) ? rows : []).map(r => mapTaskRow(r, byId, assignersByTaskId));

        // удобные строки для мгновенного вывода с ID
        const tasks_pretty = tasks.map(t =>
          `#${t.id} — ${t.task} | Исп.: ${t.assignee} | Назначил: ${t.assigned_by ?? '—'} | Дедлайн: ${t.deadline ?? '—'} | Статус: ${t.status ?? '—'} | Приоритет: ${t.priority ?? '—'}`
        );

        return { ok: true, tasks, tasks_pretty };
      } catch (error) {
        log.error('[ToolRouter] Ошибка получения списка задач:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- REPORT ----
    if (name === 'report') {
      try {
        const rows = await query('SELECT * FROM tasks');
        const total = Array.isArray(rows) ? rows.length : 0;
        const byStatus = {};
        for (const t of (rows || [])) {
          const k = t.status || '—';
          byStatus[k] = (byStatus[k] || 0) + 1;
        }
        return { ok: true, report: { total, byStatus } };
      } catch (error) {
        log.error('[ToolRouter] Ошибка получения отчета:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- SEND TELEGRAM ----
    if (name === 'send_telegram') {
      if (!this.notifier) return { ok: false, error: 'NOTIFIER_NOT_CONFIGURED' };

      const toRaw = String(A.to || '').trim();
      const text = String(A.text || '').trim();
      if (!toRaw || !text) return { ok: false, error: 'BAD_PARAMS: to and text are required' };

      const results = [];
      const sendOne = async (chatId) => {
        const r = await this.notifier.sendText(chatId, text);
        results.push({ chat_id: chatId, ...r });
      };

      if (/^(all|всем)$/i.test(toRaw)) {
        const emps = await this.employees.list();
        const list = emps.filter(e => !!(e.chat_id));
        for (const e of list) await sendOne(e.chat_id);
        return { ok: true, sent: results, count: results.length };
      }

      const num = Number(toRaw);
      if (Number.isFinite(num) && String(num) === toRaw) {
        await sendOne(num);
        return { ok: true, sent: results };
      }

      const { match, candidates } = await this.employees.resolveByName(toRaw);
      if (!match && candidates?.length > 1) {
        return { ok: false, need_choice: candidates.slice(0, 3).map(c => c.name) };
      }
      const emp = match || candidates?.[0];
      if (!emp) return { ok: false, error: 'EMPLOYEE_NOT_FOUND' };
      if (!emp.chat_id) return { ok: false, error: 'NO_CHAT_ID_FOR_EMPLOYEE' };

      await sendOne(emp.chat_id);
      return { ok: true, sent: results };
    }

    // ---- REASSIGN TASK (переназначение исполнителя) ----
    if (name === 'reassign_task') {
      const id = Number(A.taskId || A.id);
      if (!Number.isFinite(id) || id <= 0) {
        return { ok: false, error: 'BAD_PARAMS: taskId is required (number)' };
      }

      let newEmployeeId = null;
      let newAssignee = null;

      if (A.employee_id) {
        newEmployeeId = Number(A.employee_id);
        if (!Number.isFinite(newEmployeeId) || newEmployeeId <= 0) {
          return { ok: false, error: 'BAD_PARAMS: employee_id must be a positive number' };
        }
      } else if (A.assigneeName) {
        const { match, candidates } = await this.employees.resolveByName(A.assigneeName);
        if (!match && candidates?.length > 1) {
          return { ok: false, need_choice: candidates.slice(0, 3).map(c => c.name) };
        }
        newAssignee = match || candidates?.[0] || null;
        newEmployeeId = newAssignee?.employee_id || newAssignee?.id || null;
        if (!newEmployeeId) return { ok: false, error: 'EMPLOYEE_ID_NOT_FOUND' };
      } else {
        return { ok: false, error: 'BAD_PARAMS: provide assigneeName or employee_id' };
      }

      // Блокируем переназначение задач директору и помощницам
      if (newAssignee && isDirectorOrAssistant(newAssignee)) {
        return { ok: false, error: 'Переназначение задач директору и его помощникам запрещено' };
      }

      // Текущая задача
      let current = await this.api.get('tasks', { id });
      if (Array.isArray(current)) current = current[0] || null;
      const oldEmployeeId = current?.employee_id || null;

      // Обновление
      const updated = await this.api.update('tasks', String(id), { employee_id: newEmployeeId });

      // Справочник сотрудников
      const emps = await this.employees.list();
      const byId = new Map(emps.map(e => [e.employee_id || e.id, e]));

      const newEmp = newAssignee || byId.get(newEmployeeId) || null;
      const oldEmp = byId.get(oldEmployeeId) || null;

      // Уведомления
      if (this.notifier && newEmp) {
        try {
          const task = {
            id: updated?.task_id || current?.task_id || id,
            title: updated?.task || current?.task || '—',
            desc: updated?.description || current?.description || '—',
            deadline: updated?.deadline || current?.deadline || '—',
            priority: updated?.prioritet || current?.prioritet || 'Средний'
          };
          await this.notifier.notifyReassigned(newEmp, task, oldEmp);
        } catch {}
      }

      const task = mapTaskRow(updated || current, byId);
      return { ok: true, task, reassigned_to: newEmp?.name || newEmployeeId };
    }

    // ---- CREATE DOD CHECKLIST ----
    if (name === 'create_dod_checklist') {
      try {
        const { DoDService } = await import('./DoDService.js');
        const dodService = new DoDService();
        
        const result = await dodService.createChecklist(
          Number(A.taskId),
          String(A.checklistType || 'development'),
          Array.isArray(A.items) ? A.items : []
        );
        
        if (result) {
          log.info(`[ToolRouter] DoD чек-лист создан для задачи ${A.taskId}, тип: ${A.checklistType}`);
          return { ok: true, checklist: result };
        } else {
          return { ok: false, error: 'Не удалось создать DoD чек-лист' };
        }
      } catch (error) {
        log.error('[ToolRouter] Ошибка создания DoD чек-листа:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- UPDATE DOD CHECKLIST ----
    if (name === 'update_dod_checklist') {
      try {
        const { DoDService } = await import('./DoDService.js');
        const dodService = new DoDService();
        
        const result = await dodService.updateChecklist(
          Number(A.taskId),
          String(A.checklistType || 'development'),
          Array.isArray(A.completedItems) ? A.completedItems : []
        );
        
        if (result) {
          log.info(`[ToolRouter] DoD чек-лист обновлен для задачи ${A.taskId}, тип: ${A.checklistType}`);
          return { ok: true, checklist: result };
        } else {
          return { ok: false, error: 'Не удалось обновить DoD чек-лист' };
        }
      } catch (error) {
        log.error('[ToolRouter] Ошибка обновления DoD чек-листа:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- CREATE TASK REPORT ----
    if (name === 'create_task_report') {
      try {
        const { ReportService } = await import('./ReportService.js');
        const reportService = new ReportService();
        
        const result = await reportService.createTaskReport({
          taskId: Number(A.taskId),
          summary: String(A.summary || ''),
          details: String(A.details || ''),
          artifacts: Array.isArray(A.artifacts) ? A.artifacts : [],
          quality: String(A.quality || 'Хорошо')
        });
        
        if (result.ok) {
          log.info(`[ToolRouter] Отчет создан для задачи ${A.taskId}`);
          return { ok: true, report: result.report };
        } else {
          return { ok: false, error: result.error || 'Не удалось создать отчет' };
        }
      } catch (error) {
        log.error('[ToolRouter] Ошибка создания отчета:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- CHECK TASK COMPLIANCE ----
    if (name === 'check_task_compliance') {
      try {
        const { TaskComplianceService } = await import('./TaskComplianceService.js');
        const complianceService = new TaskComplianceService();
        
        const result = await complianceService.checkTaskCompliance(Number(A.taskId));
        
        if (result.ok) {
          log.info(`[ToolRouter] Проверка соответствия для задачи ${A.taskId} завершена`);
          return { ok: true, compliance: result.compliance };
        } else {
          return { ok: false, error: result.error || 'Не удалось проверить соответствие' };
        }
      } catch (error) {
        log.error('[ToolRouter] Ошибка проверки соответствия:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- SAVE ARTIFACT ----
    if (name === 'save_artifact') {
      try {
        const { ArtifactService } = await import('./ArtifactService.js');
        const artifactService = new ArtifactService();
        
        const result = await artifactService.saveArtifact({
          taskId: A.taskId ? Number(A.taskId) : null,
          artifactType: String(A.artifactType || 'documentation'),
          fileName: String(A.fileName || ''),
          filePath: String(A.filePath || ''),
          fileSize: Number(A.fileSize || 0),
          contentPreview: A.contentPreview || '',
          uploadedBy: ctx?.requesterEmployee?.id || null
        });
        
        if (result.ok) {
          log.info(`[ToolRouter] Артефакт сохранен: ${A.fileName}`);
          return { ok: true, artifact: result.artifact };
        } else {
          return { ok: false, error: result.error || 'Не удалось сохранить артефакт' };
        }
      } catch (error) {
        log.error('[ToolRouter] Ошибка сохранения артефакта:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- SUBMIT EXPLANATION ----
    if (name === 'submit_explanation') {
      try {
        const { ExplanatoryService } = await import('./ExplanatoryService.js');
        const explanatoryService = new ExplanatoryService();
        
        const result = await explanatoryService.submitExplanation(
          Number(A.explanationId),
          String(A.explanationText),
          ctx?.requesterEmployee?.id || ctx?.requesterEmployee?.employee_id
        );
        
        if (result) {
          log.info(`[ToolRouter] Объяснительная ${A.explanationId} получена`);
          return { ok: true, message: 'Объяснительная успешно отправлена на рассмотрение' };
        } else {
          return { ok: false, error: 'Не удалось отправить объяснительную' };
        }
      } catch (error) {
        log.error('[ToolRouter] Ошибка отправки объяснительной:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- REVIEW EXPLANATION ----
    if (name === 'review_explanation') {
      try {
        // Проверяем права доступа (только директора)
        if (!ctx?.requesterEmployee || ctx.requesterEmployee.user_role !== 'manager') {
          return { ok: false, error: 'Недостаточно прав для рассмотрения объяснительных' };
        }

        const { ExplanatoryService } = await import('./ExplanatoryService.js');
        const explanatoryService = new ExplanatoryService();
        
        const result = await explanatoryService.reviewExplanation(
          Number(A.explanationId),
          String(A.decision),
          String(A.managerDecision),
          Number(A.bonusPenaltyAmount || 0)
        );
        
        if (result) {
          log.info(`[ToolRouter] Решение по объяснительной ${A.explanationId}: ${A.decision}`);
          return { ok: true, message: 'Решение по объяснительной принято' };
        } else {
          return { ok: false, error: 'Не удалось принять решение' };
        }
      } catch (error) {
        log.error('[ToolRouter] Ошибка рассмотрения объяснительной:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- LIST PENDING EXPLANATIONS ----
    if (name === 'list_pending_explanations') {
      try {
        // Проверяем права доступа (только директора)
        if (!ctx?.requesterEmployee || ctx.requesterEmployee.user_role !== 'manager') {
          return { ok: false, error: 'Недостаточно прав для просмотра объяснительных' };
        }

        const { ExplanatoryService } = await import('./ExplanatoryService.js');
        const explanatoryService = new ExplanatoryService();
        
        const explanations = await explanatoryService.getExplanationsForReview();
        const limit = Number(A.limit || 10);
        
        log.info(`[ToolRouter] Получено ${explanations.length} объяснительных для рассмотрения`);
        return { ok: true, explanations: explanations.slice(0, limit) };
      } catch (error) {
        log.error('[ToolRouter] Ошибка получения объяснительных:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- LIST ALL EXPLANATIONS (manager) ----
    if (name === 'list_all_explanations') {
      try {
        if (!ctx?.requesterEmployee || ctx.requesterEmployee.user_role !== 'manager') {
          return { ok: false, error: 'Недостаточно прав для просмотра объяснительных' };
        }

        const limit = Number(args?.limit || 10);
        const { ExplanatoryService } = await import('./ExplanatoryService.js');
        const explanatoryService = new ExplanatoryService();

        // три выборки
        const awaitingUser = await query("SELECT ee.*, t.task, t.deadline, e.name as employee_name FROM employee_explanations ee LEFT JOIN tasks t ON t.task_id = ee.task_id LEFT JOIN employees e ON e.employee_id = ee.employee_id WHERE ee.status='pending' AND ee.responded_at IS NULL ORDER BY ee.requested_at DESC LIMIT ?", [limit]);
        const forReview = await query("SELECT ee.*, t.task, t.deadline, e.name as employee_name FROM employee_explanations ee LEFT JOIN tasks t ON t.task_id = ee.task_id LEFT JOIN employees e ON e.employee_id = ee.employee_id WHERE ee.status='pending' AND ee.responded_at IS NOT NULL ORDER BY ee.responded_at DESC LIMIT ?", [limit]);
        const resolved = await query("SELECT ee.*, t.task, t.deadline, e.name as employee_name FROM employee_explanations ee LEFT JOIN tasks t ON t.task_id = ee.task_id LEFT JOIN employees e ON e.employee_id = ee.employee_id WHERE ee.status IN ('accepted','rejected','bonus_penalty') ORDER BY ee.manager_reviewed_at DESC LIMIT ?", [limit]);

        return { ok: true, awaitingUser, forReview, resolved };
      } catch (error) {
        log.error('[ToolRouter] Ошибка list_all_explanations:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- LIST MY EXPLANATIONS ----
    if (name === 'list_my_explanations') {
      try {
        const requester = ctx?.requesterEmployee;
        const employeeId = requester?.employee_id || requester?.id;
        if (!employeeId) {
          return { ok: true, explanations: [], message: 'Не удалось определить сотрудника' };
        }

        const { ExplanatoryService } = await import('./ExplanatoryService.js');
        const explanatoryService = new ExplanatoryService();
        const limit = Number(args?.limit || 10);

        const list = await explanatoryService.getEmployeeExplanations(employeeId, limit);
        return { ok: true, explanations: list };
      } catch (error) {
        log.error('[ToolRouter] Ошибка получения собственных объяснительных:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- UPDATE TASK (admin) ----
    if (name === 'update_task') {
      try {
        const requester = ctx?.requesterEmployee || null;
        const requesterRole = (requester && String(requester.user_role || '').toLowerCase()) || 'staff';
        const isDirector = requesterRole === 'manager' || /директор|стратегическому развитию/i.test(String(requester?.job || ''));
        if (!isDirector) {
          return { ok: false, error: 'Недостаточно прав для обновления задачи' };
        }

        const id = Number(A.taskId);
        if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Некорректный ID задачи' };

        const changes = {};
        if (typeof A.title === 'string') changes.task = String(A.title).trim();
        if (typeof A.desc === 'string') changes.description = String(A.desc).trim();
        if (typeof A.priority === 'string') changes.prioritet = String(A.priority).trim();
        let deadline = typeof A.deadline === 'string' ? String(A.deadline).trim() : '';
        if (deadline) {
          try {
            const parsed = parseHumanDateRu(deadline, new Date());
            if (parsed) deadline = toDbDateTime(parsed);
          } catch {}
          changes.deadline = deadline;
        }

        if (A.employee_id || A.assigneeName) {
          let newEmployeeId = Number(A.employee_id || 0) || null;
          if (!newEmployeeId && A.assigneeName) {
            const { match } = await this.employees.resolveByName(A.assigneeName);
            newEmployeeId = match?.employee_id || match?.id || null;
            if (match && !isMarketingEmployee(match)) {
              return { ok: false, error: 'Переназначение запрещено: исполнитель не является сотрудником отдела маркетинга' };
            }
          }
          if (newEmployeeId) changes.employee_id = newEmployeeId;
        }

        const updated = await this.api.update('tasks', String(id), changes);

        const fields = [];
        const params = [];
        for (const [k, v] of Object.entries(changes)) { fields.push(`${k} = ?`); params.push(v); }
        if (fields.length) {
          params.push(id);
          try { await query(`UPDATE tasks SET ${fields.join(', ')} WHERE task_id = ?`, params); } catch {}
        }

        return { ok: true, task: updated };
      } catch (error) {
        log.error('[ToolRouter] Ошибка update_task:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- SET DEADLINE (admin) ----
    if (name === 'set_deadline') {
      try {
        const requester = ctx?.requesterEmployee || null;
        const requesterRole = (requester && String(requester.user_role || '').toLowerCase()) || 'staff';
        const isDirector = requesterRole === 'manager' || /директор|стратегическому развитию/i.test(String(requester?.job || ''));
        if (!isDirector) {
          return { ok: false, error: 'Недостаточно прав для обновления дедлайна' };
        }

        const id = Number(A.taskId);
        if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Некорректный ID задачи' };

        let deadline = String(A.deadline || '').trim();
        if (!deadline) return { ok: false, error: 'Пустой дедлайн' };

        try {
          const parsed = parseHumanDateRu(deadline, new Date());
          if (parsed) deadline = toDbDateTime(parsed);
        } catch {}

        // Обновляем через API и локально
        const updated = await this.api.update('tasks', String(id), { deadline });
        try { await query('UPDATE tasks SET deadline = ? WHERE task_id = ?', [deadline, id]); } catch {}

        return { ok: true, task: updated, deadline };
      } catch (error) {
        log.error('[ToolRouter] Ошибка set_deadline:', error.message);
        return { ok: false, error: error.message };
      }
    }

    // ---- FORCE CLOSE TASK ----
    if (name === 'force_close_task') {
      try {
        const taskId = Number(A.taskId);
        const reason = String(A.reason || 'Принудительное закрытие');
        
        if (!taskId || taskId <= 0) {
          return { ok: false, error: 'Некорректный ID задачи' };
        }

        log.info(`[ToolRouter] Принудительное закрытие задачи ${taskId}: ${reason}`);
        
        // 1. Создаем базовый отчет если его нет
        try {
          const { ReportService } = await import('./ReportService.js');
          const reportService = new ReportService();
          const existingReport = await reportService.getTaskReport(taskId);
          
          if (!existingReport.ok || !existingReport.report) {
            await reportService.createTaskReport({
              taskId: taskId,
              summary: `Задача принудительно закрыта: ${reason}`,
              details: 'Задача была закрыта в обход стандартных проверок',
              quality: 'Удовлетворительно'
            });
            log.info(`[ToolRouter] Базовый отчет для принудительного закрытия создан`);
          }
        } catch (reportError) {
          log.warn(`[ToolRouter] Не удалось создать отчет при принудительном закрытии: ${reportError.message}`);
        }
        
        // 2. Обновляем статус на внешнем API
        const res = await this.api.update('tasks', String(taskId), { status: 'Завершена' });
        
        // 3. Синхронизируем с локальной БД
        try {
          await query('UPDATE tasks SET status = ? WHERE task_id = ?', ['Завершена', taskId]);
        } catch (dbError) {
          log.error('[ToolRouter] Ошибка синхронизации статуса с локальной БД:', dbError.message);
        }
        
        log.info(`[ToolRouter] Задача ${taskId} принудительно закрыта`);
        return { ok: true, task: mapTaskRow(res), forceClosed: true, reason };
        
      } catch (error) {
        log.error('[ToolRouter] Ошибка принудительного закрытия задачи:', error.message);
        return { ok: false, error: error.message };
      }
    }

    return { ok: false, error: 'UNKNOWN_TOOL' };
  }
}

