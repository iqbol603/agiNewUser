// import OpenAI from 'openai';
// import { ENV } from '../config/env.js';
// import { log } from '../utils/logger.js';

// import { EmployeesService } from './EmployeesService.js';
// import { ToolRouter } from './ToolRouter.js';
// import { ApiClient } from './ApiClient.js';

// function isPathParamErr(e) {
//     const msg = (e && (e.message || e.toString())) || '';
//     return /Path parameters|invalid segments|is not a valid path parameter/i.test(msg);
// }

// async function retrieveRunSafe(openai, threadId, runId) {
//     try { return await openai.beta.threads.runs.retrieve(threadId, runId); }
//     catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId }); }
// }

// async function submitToolOutputsSafe(openai, threadId, runId, tool_outputs) {
//     try { return await openai.beta.threads.runs.submitToolOutputs(threadId, runId, { tool_outputs }); }
//     catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs }); }
// }

// function deriveRole(employee) {
//     const roleFromDb = String(employee?.user_role || '').toLowerCase();
//     if (roleFromDb === 'manager') return 'manager';
//     if (roleFromDb === 'staff') return 'staff';

//     const p = String(employee?.position || '').toLowerCase();
//     const isMgr = /(руковод|начальник|директор|lead|team lead|head|manager)/i.test(p);
//     return isMgr ? 'manager' : 'staff';
// }

// export class AssistantService {
//     constructor() {
//         this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
//         const api = new ApiClient();
//         const employees = new EmployeesService(api);
//         this.tools = new ToolRouter({ api, employees });
//     }

//     async ask(userText, ctx = {}) {
//         try {
//             const v = (process.versions.node || '0.0.0').split('.').map(Number);
//             if (v[0] < 18) return 'Ошибка: требуется Node.js 18+ для работы с OpenAI SDK.';
//         } catch {}

//         const assistantId = ENV.TELECOM_ASSISTANT_ID;

//         // При ошибке
//         if (!assistantId || !/^asst_/.test(assistantId)) {
//             return 'Ошибка конфигурации: TELECOM_ASSISTANT_ID отсутствует или некорректен.';
//         }

//         try {
//             const userMeta = {
//                 tg_chat_id: ctx?.chatId ? String(ctx.chatId) : '',
//                 employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
//                 employee_name: ctx?.employee?.name || '',
//                 employee_position: ctx?.employee?.position || '',
//                 user_role: deriveRole(ctx?.employee)
//             };

//             const thread = await this.client.beta.threads.create({ metadata: userMeta });
//             const threadId = thread?.id;

//             log.info('[AI] threadId =', threadId);
//             if (!threadId || !threadId.startsWith('thread_')) throw new Error('THREAD_CREATE_FAILED');

//             await this.client.beta.threads.messages.create(threadId, {
//                 role: 'user',
//                 content: userText,
//                 metadata: userMeta
//             });

//             const now = new Date();
//             const nowIso = now.toISOString();
            
//             console.log('userMeta', userMeta);

//             const additional_instructions =
//                 `Текущие дата/время:
//                 - now_utc: ${nowIso}
//                 - app_timezone: ${process.env.TZ || 'UTC'}
//                 Важно: если пользователь даёт относительную дату/время ("завтра в 10 утра", "в пятницу"), НЕ пытайся сам превращать в абсолютную дату. 
//                 Передавай эту фразу напрямую в аргументе deadline при вызове create_task — бэкенд нормализует в app_timezone.
//                 Если нужна абсолютная дата в ответе, используй ответ бэкенда из create_task/list_tasks (там уже нормализовано).

//                 Контекст пользователя:
//                 — Telegram chat_id: ${userMeta.tg_chat_id}
//                 — Сотрудник: ${userMeta.employee_name || '—'} (${userMeta.employee_position || '—'}), роль: ${userMeta.user_role}.

//                 Отвечай кратко и по делу.`;

//             let run = await this.client.beta.threads.runs.create(threadId, {
//                 assistant_id: assistantId,
//                 metadata: userMeta,
//                 additional_instructions
//             });

//             let runId = run?.id;
//             if (!runId || !runId.startsWith('run_')) throw new Error('RUN_CREATE_FAILED');

//             const started = Date.now();
//             let guard = 0;

//             while (true) {
//                 run = await retrieveRunSafe(this.client, threadId, runId);

//                 if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
//                 const calls = run.required_action.submit_tool_outputs.tool_calls || [];

//                 const outputs = [];
//                 for (const c of calls) {
//                     const name = c.function?.name || '';
//                     let args = {};
                    
//                     try {
//                         args = JSON.parse(c.function?.arguments || '{}');
//                     } catch {}

//                     if (userMeta.user_role !== 'manager' && (name === 'create_task' || name === 'send_telegram')) {
//                         outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
//                         continue;
//                     }

//                     let result;
//                     try {
//                         result = await this.tools.route(name, args, {
//                             requesterChatId: userMeta.tg_chat_id,
//                             requesterEmployee: ctx?.employee
//                         });
//                     } catch (err) {
//                         result = { ok: false, error: err?.message || String(err) };
//                     }

//                     outputs.push({ tool_call_id: c.id, output: JSON.stringify(result) });
//                 }

//                 run = await submitToolOutputsSafe(this.client, threadId, runId, outputs);
//                 runId = run?.id || runId;
//                 guard++;
//                 if (guard > 12) throw new Error('TOOL_LOOP_GUARD');
//                     continue;
//                 }

//                 if (run.status === 'completed') break;
//                 if (['failed', 'cancelled', 'expired'].includes(run.status)) {
//                     const msg = run.last_error?.message || run.status || 'unknown';
//                     return 'Операция не выполнена: ' + msg;
//                 }
                
//                 if (Date.now() - started > 90_000) return 'Операция не выполнена: timeout';
//                 await new Promise(r => setTimeout(r, 800));
//             }

//             const messages = await this.client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
//             const reply = messages.data?.find(m => m.role === 'assistant');
//             const text = (reply?.content || []).filter(c => c.type === 'text').map(c => c.text?.value || '').join('\n').trim();

//             return text || 'Нет ответа от ассистента.';
//         } catch (err) {
//             const http = err?.status || err?.response?.status;
//             const body = err?.response?.data || err?.error || err?.message || err;
//             return `Ошибка при обращении к ИИ-агенту${http ? ` (HTTP ${http})` : ''}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
//         }
//     }
// }

// // src/ai/AssistantService.js
// import OpenAI from 'openai';
// import { ENV } from '../config/env.js';
// import { log } from '../utils/logger.js';

// // import { EmployeesService } from './EmployeesService.js';
// // import { ToolRouter } from './ToolRouter.js';
// // import { ApiClient } from './ApiClient.js';
// import { EmployeesService } from './EmployeesService.js';
// import { ToolRouter } from './ToolRouter.js';
// import { ApiClient } from './ApiClient.js';
// import { Notifier } from './Notifier.js';

// import { ThreadRegistry } from './ThreadRegistry.js';
// import { InMemoryDraftStore, normalizePriority } from './DraftStore.js';
// import { Notifier } from './Notifier.js'; // <— добавить

// /* ===== Helpers from your original file (оставлено без изменений) ===== */
// function isPathParamErr(e) {
//     const msg = (e && (e.message || e.toString())) || '';
//     return /Path parameters|invalid segments|is not a valid path parameter/i.test(msg);
// }

// async function retrieveRunSafe(openai, threadId, runId) {
//     try { return await openai.beta.threads.runs.retrieve(threadId, runId); }
//     catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId }); }
// }

// async function submitToolOutputsSafe(openai, threadId, runId, tool_outputs) {
//     try { return await openai.beta.threads.runs.submitToolOutputs(threadId, runId, { tool_outputs }); }
//     catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs }); }
// }

// function deriveRole(employee) {
//     // Исправлено: используем job (а не position), как в Вашей БД
//     const roleFromDb = String(employee?.user_role || '').toLowerCase();
//     if (roleFromDb === 'manager') return 'manager';
//     if (roleFromDb === 'staff') return 'staff';

//     const p = String(employee?.job || '').toLowerCase();
//     const isMgr = /(руковод|начальник|директор|lead|team lead|head|manager)/i.test(p);
//     return isMgr ? 'manager' : 'staff';
// }

// /* ===== Опционально: схемы внутренних инструментов draft_* =====
//    ВАЖНО: Чтобы ассистент мог их вызывать, добавьте эти tools в настройках ассистента
//    (через панель OpenAI или однократным апдейтом ассистента по API).
//    Эти инструменты НЕ создают задачи — только управляют черновиком в памяти. */
// export const DRAFT_TOOLS_SCHEMAS = [
//   {
//     type: 'function',
//     function: {
//       name: 'draft_get',
//       description: 'Получить текущий черновик задачи для этого пользователя',
//       parameters: { type: 'object', properties: {} }
//     }
//   },
//   {
//     type: 'function',
//     function: {
//       name: 'draft_merge',
//       description: 'Дополнить/изменить поля черновика (не затирать уже заполненные)',
//       parameters: {
//         type: 'object',
//         properties: {
//           title: { type: 'string', description: 'Короткое название задачи' },
//           assigneeName: { type: 'string', description: 'Имя/фамилия исполнителя' },
//           desc: { type: 'string', description: 'Описание' },
//           deadline: { type: 'string', description: 'Относительная дата/время ("завтра 10:00")' },
//           priority: {
//             type: 'string',
//             enum: ['Критический','Высокий','Средний','Низкий','Очень низкий']
//           }
//         }
//       }
//     }
//   },
//   {
//     type: 'function',
//     function: {
//       name: 'draft_clear',
//       description: 'Очистить черновик задачи после создания или отмены',
//       parameters: { type: 'object', properties: {} }
//     }
//   }
// ];

// export class AssistantService {
//     // constructor() {
//      constructor({ bot } = {}) {
//         this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

//         const api = new ApiClient();
//         const employees = new EmployeesService(api);
//         // this.tools = new ToolRouter({ api, employees });
//             const notifier = bot ? new Notifier(bot) : null;
//     this.tools = new ToolRouter({ api, employees, notifier });
//                 // Инициализируйте Notifier согласно Вашей реализации
//         // Например, если он принимает bot instance или токен:
//         // const notifier = new Notifier({
//         //   tgToken: ENV.TG_BOT_TOKEN,  // или передайте уже созданный bot
//         //   // bot: yourTelegramBotInstance,
//         // });
//         // this.tools = new ToolRouter({ api, employees, notifier });

//         // Новое: реестр тредов и черновики
//         this.threadRegistry = new ThreadRegistry();
//         this.drafts = new InMemoryDraftStore();
//     }

//     /**
//      * Основной вход: запрос к ассистенту
//      * @param {string} userText
//      * @param {{ chatId?: string, employee?: any }} ctx
//      * @returns {Promise<string>}
//      */
//     async ask(userText, ctx = {}) {
//         try {
//             const v = (process.versions.node || '0.0.0').split('.').map(Number);
//             if (v[0] < 18) return 'Ошибка: требуется Node.js 18+ для работы с OpenAI SDK.';
//         } catch {}

//         const assistantId = ENV.TELECOM_ASSISTANT_ID;

//         if (!assistantId || !/^asst_/.test(assistantId)) {
//             return 'Ошибка конфигурации: TELECOM_ASSISTANT_ID отсутствует или некорректен.';
//         }

//         try {
//             const userMeta = {
//                 tg_chat_id: ctx?.chatId ? String(ctx.chatId) : '',
//                 // employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
//                 employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
//                 employee_name: ctx?.employee?.name || '',
//                 employee_position: ctx?.employee?.position || '',
//                 user_role: deriveRole(ctx?.employee) // manager/staff
//             };

//             console.log("ffff",userMeta);

//             // ==== ПЕРЕИСПОЛЬЗОВАТЬ THREAD ПО CHAT_ID ====
//             let threadId = this.threadRegistry.get(userMeta.tg_chat_id);
//             if (!threadId) {
//                 const thread = await this.client.beta.threads.create({ metadata: userMeta });
//                 threadId = thread?.id;
//                 log.info('[AI] threadId =', threadId);
//                 if (!threadId || !threadId.startsWith('thread_')) throw new Error('THREAD_CREATE_FAILED');
//                 this.threadRegistry.set(userMeta.tg_chat_id, threadId);
//             }

//             // ==== Сообщение от пользователя ====
//             await this.client.beta.threads.messages.create(threadId, {
//                 role: 'user',
//                 content: userText,
//                 metadata: userMeta
//             });

//             const now = new Date();
//             const nowIso = now.toISOString();

//             const additional_instructions =
// `Текущие дата/время:
// - now_utc: ${nowIso}
// - app_timezone: ${process.env.TZ || 'UTC'}

// ПРАВИЛА:
// 1) Любое пошаговое создание задачи ведите через ЧЕРНОВИК.
//    - Перед обработкой запроса вызовите tool "draft_get".
//    - Любые найденные поля (title, assigneeName, deadline, priority, desc) добавляйте через "draft_merge".
//    - Не перетирайте уже сохранённые поля.
// 2) Если каких-то полей нет — задайте ОДИН короткий уточняющий вопрос ровно по следующему отсутствующему полю в порядке:
//    title → assigneeName → deadline → priority.
// 3) Когда все поля собраны — вызовите "create_task" (только если роль пользователя = manager).
//    После успешного ответа вызовите "draft_clear".
// 4) Относительные даты ("завтра 10:00") передавайте как есть в аргументе deadline — бэкенд сам нормализует.
// 5) Все действия с задачами и рассылками выполняйте только через tools и соблюдайте ACL (staff не может вызывать create_task и send_telegram).
// 6) Отвечайте кратко и по делу.`;

//             // ==== Запускаем run ====
//             let run = await this.client.beta.threads.runs.create(threadId, {
//                 assistant_id: assistantId,
//                 metadata: userMeta,
//                 additional_instructions
//                 // ВНИМАНИЕ: tools с функциями draft_* должны быть добавлены в конфиг ассистента заранее
//             });

//             let runId = run?.id;
//             if (!runId || !runId.startsWith('run_')) throw new Error('RUN_CREATE_FAILED');

//             const started = Date.now();
//             let guard = 0;

//             // ==== Петля выполнения с tool calls ====
//             while (true) {
//                 run = await retrieveRunSafe(this.client, threadId, runId);

//                 if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
//                     const calls = run.required_action.submit_tool_outputs.tool_calls || [];
//                     const outputs = [];

//                     for (const c of calls) {
//                         const name = c.function?.name || '';
//                         let args = {};
//                         try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}

//                         // ---- ВНУТРЕННИЕ draft_* ИНСТРУМЕНТЫ ----
//                         if (name === 'draft_get') {
//                             const draft = this.drafts.get(userMeta.tg_chat_id);
//                             outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: draft || null }) });
//                             continue;
//                         }

//                         if (name === 'draft_merge') {
//                             // нормализуем приоритет, если пришёл
//                             if (args && args.priority) args.priority = normalizePriority(args.priority);
//                             const merged = this.drafts.merge(userMeta.tg_chat_id, args || {});
//                             outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: merged }) });
//                             continue;
//                         }

//                         if (name === 'draft_clear') {
//                             this.drafts.clear(userMeta.tg_chat_id);
//                             outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true }) });
//                             continue;
//                         }

//                         // ---- ACL для "боевых" tools ----
//                         // if (userMeta.user_role !== 'manager' && (name === 'create_task' || name === 'send_telegram')) {
//                         //     outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
//                         //     continue;
//                         // }
//                         if (userMeta.user_role !== 'manager' && (name === 'create_task' || name === 'send_telegram' || name === 'reassign_task')) {
//     outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
//     continue;
// }

//                         // ---- ВЫЗОВ ВАШЕГО ToolRouter (оставлено как было) ----
//                         let result;
//                         try {
//                             result = await this.tools.route(name, args, {
//                                 requesterChatId: userMeta.tg_chat_id,
//                                 requesterEmployee: ctx?.employee
//                             });

//                             // Дублирующая подстраховка: если create_task прошёл, чистим черновик
//                             if (name === 'create_task' && result?.ok) {
//                                 this.drafts.clear(userMeta.tg_chat_id);
//                             }
//                         } catch (err) {
//                             result = { ok: false, error: err?.message || String(err) };
//                         }

//                         outputs.push({ tool_call_id: c.id, output: JSON.stringify(result) });
//                     }

//                     run = await submitToolOutputsSafe(this.client, threadId, runId, outputs);
//                     runId = run?.id || runId;
//                     guard++;
//                     if (guard > 12) throw new Error('TOOL_LOOP_GUARD');
//                     continue;
//                 }

//                 if (run.status === 'completed') break;
//                 if (['failed', 'cancelled', 'expired'].includes(run.status)) {
//                     const msg = run.last_error?.message || run.status || 'unknown';
//                     return 'Операция не выполнена: ' + msg;
//                 }

//                 if (Date.now() - started > 90_000) return 'Операция не выполнена: timeout';
//                 await new Promise(r => setTimeout(r, 800));
//             }

//             // ==== Ответ ассистента ====
//             const messages = await this.client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
//             const reply = messages.data?.find(m => m.role === 'assistant');
//             const text = (reply?.content || []).filter(c => c.type === 'text').map(c => c.text?.value || '').join('\n').trim();

//             return text || 'Нет ответа от ассистента.';
//         } catch (err) {
//             const http = err?.status || err?.response?.status;
//             const body = err?.response?.data || err?.error || err?.message || err;
//             return `Ошибка при обращении к ИИ-агенту${http ? ` (HTTP ${http})` : ''}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
//         }
//     }
// }



// src/services/AssistantService.js
import OpenAI from 'openai';
import { ENV } from '../config/env.js';
import { log } from '../utils/logger.js';

import { EmployeesService } from './EmployeesService.js';
import { ToolRouter } from './ToolRouter.js';
import { ApiClient } from './ApiClient.js';
import { Notifier } from './Notifier.js';

import { ThreadRegistry } from './ThreadRegistry.js';
import { InMemoryDraftStore, normalizePriority } from './DraftStore.js';

/* ===== Ваши хелперы — оставлены ===== */
function isPathParamErr(e) {
  const msg = (e && (e.message || e.toString())) || '';
  return /Path parameters|invalid segments|is not a valid path parameter/i.test(msg);
}

async function retrieveRunSafe(openai, threadId, runId) {
  try { return await openai.beta.threads.runs.retrieve(threadId, runId); }
  catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId }); }
}

async function submitToolOutputsSafe(openai, threadId, runId, tool_outputs) {
  try { return await openai.beta.threads.runs.submitToolOutputs(threadId, runId, { tool_outputs }); }
  catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs }); }
}

function deriveRole(employee) {
  const roleFromDb = String(employee?.user_role || '').toLowerCase();
  if (roleFromDb === 'manager') return 'manager';
  if (roleFromDb === 'staff') return 'staff';

  const p = String(employee?.job || '').toLowerCase();
  const isMgr = /(руковод|начальник|директор|lead|team lead|head|manager)/i.test(p);
  return isMgr ? 'manager' : 'staff';
}

/* ===== Описание внутренних tools для черновика (добавьте в ассистента один раз) ===== */
export const DRAFT_TOOLS_SCHEMAS = [
  { type: 'function', function: { name: 'draft_get', description: 'Получить текущий черновик задачи', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: {
      name: 'draft_merge',
      description: 'Мердж полей черновика (title, assigneeName, deadline, priority, desc)',
      parameters: { type: 'object', properties: {
        title: { type: 'string' },
        assigneeName: { type: 'string' },
        desc: { type: 'string' },
        deadline: { type: 'string' },
        priority: { type: 'string', enum: ['Критический','Высокий','Средний','Низкий','Очень низкий'] }
      } }
  } },
  { type: 'function', function: { name: 'draft_clear', description: 'Очистить черновик', parameters: { type: 'object', properties: {} } } }
];

export class AssistantService {
  constructor({ bot } = {}) {
    this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

    const api = new ApiClient();
    const employees = new EmployeesService(api);
    const notifier = bot ? new Notifier(bot) : null;

    this.tools = new ToolRouter({ api, employees, notifier });

    this.threadRegistry = new ThreadRegistry();
    this.drafts = new InMemoryDraftStore();
  }

  async ask(userText, ctx = {}) {
    try {
      const v = (process.versions.node || '0.0.0').split('.').map(Number);
      if (v[0] < 18) return 'Ошибка: требуется Node.js 18+ для работы с OpenAI SDK.';
    } catch {}

    const assistantId = ENV.TELECOM_ASSISTANT_ID;
    if (!assistantId || !/^asst_/.test(assistantId)) {
      return 'Ошибка конфигурации: TELECOM_ASSISTANT_ID отсутствует или некорректен.';
    }

    try {
      const userMeta = {
        tg_chat_id: ctx?.chatId ? String(ctx.chatId) : '',
        employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
        employee_name: ctx?.employee?.name || '',
        employee_position: ctx?.employee?.position || '',
        user_role: deriveRole(ctx?.employee)
      };
console.log("kk",userMeta);
      // один thread на chatId
      let threadId = this.threadRegistry.get(userMeta.tg_chat_id);
      if (!threadId) {
        const thread = await this.client.beta.threads.create({ metadata: userMeta });
        threadId = thread?.id;
        log.info('[AI] threadId =', threadId);
        if (!threadId || !threadId.startsWith('thread_')) throw new Error('THREAD_CREATE_FAILED');
        this.threadRegistry.set(userMeta.tg_chat_id, threadId);
      }

      await this.client.beta.threads.messages.create(threadId, {
        role: 'user',
        content: userText,
        metadata: userMeta
      });
const now = new Date();
const offsetMs = 5 * 60 * 60 * 1000; // 5 часов в миллисекундах
const tzDate = new Date(now.getTime() + offsetMs);

console.log("dd", tzDate.toISOString());
      const nowIso = new Date().toISOString();
    //   const nowIso = tzDate.toISOString();
      console.log("dddd",nowIso);
      const additional_instructions =
`Текущие дата/время:
- now_utc: ${nowIso}
- app_timezone: ${process.env.TZ || 'Asia/Dushanbe'}

ПРАВИЛА:
1) Пошаговое создание задачи ведите через ЧЕРНОВИК:
   - Сначала вызовите tool "draft_get".
   - Найденные поля добавляйте через "draft_merge" (не перетирайте уже записанные).
2) Если не хватает полей — задайте ОДИН короткий вопрос ровно по следующему полю:
   title → assigneeName → deadline → priority.
3) Когда все поля собраны — вызовите "create_task" (только если роль = manager). После успеха — "draft_clear".
4) Относительные даты ("завтра 10:00") передавайте как есть в deadline — бэкенд сам нормализует.
5) Действия с задачами и рассылками только через tools; ACL: staff не может вызывать create_task, send_telegram, reassign_task.
6) Отвечайте кратко.
7) Если пользователь спросить о себе, поиши и преддоставь информацию по его чат ID ${userMeta.tg_chat_id}.
8) Также приветствуй пользователя по имени.`;

      let run = await this.client.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        metadata: userMeta,
        additional_instructions
      });

      let runId = run?.id;
      if (!runId || !runId.startsWith('run_')) throw new Error('RUN_CREATE_FAILED');

      const started = Date.now();
      let guard = 0;

      while (true) {
        run = await retrieveRunSafe(this.client, threadId, runId);

        if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
          const calls = run.required_action.submit_tool_outputs.tool_calls || [];
          const outputs = [];

          for (const c of calls) {
            const name = c.function?.name || '';
            let args = {};
            try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}

            // Внутренние tools черновика
            if (name === 'draft_get') {
              const draft = this.drafts.get(userMeta.tg_chat_id);
              outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: draft || null }) });
              continue;
            }
            if (name === 'draft_merge') {
              if (args && args.priority) args.priority = normalizePriority(args.priority);
              const merged = this.drafts.merge(userMeta.tg_chat_id, args || {});
              outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: merged }) });
              continue;
            }
            if (name === 'draft_clear') {
              this.drafts.clear(userMeta.tg_chat_id);
              outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true }) });
              continue;
            }

            // ACL для боевых tools
            if (userMeta.user_role !== 'manager' && (name === 'create_task' || name === 'send_telegram' || name === 'reassign_task')) {
              outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
              continue;
            }

            // Вызов Вашего ToolRouter
            let result;
            try {
              result = await this.tools.route(name, args, {
                requesterChatId: userMeta.tg_chat_id,
                requesterEmployee: ctx?.employee
              });

              // подстраховка: очистить черновик после успешного создания
              if (name === 'create_task' && result?.ok) {
                this.drafts.clear(userMeta.tg_chat_id);
              }
            } catch (err) {
              result = { ok: false, error: err?.message || String(err) };
            }

            outputs.push({ tool_call_id: c.id, output: JSON.stringify(result) });
          }

          run = await submitToolOutputsSafe(this.client, threadId, runId, outputs);
          runId = run?.id || runId;
          guard++;
          if (guard > 12) throw new Error('TOOL_LOOP_GUARD');
          continue;
        }

        if (run.status === 'completed') break;
        if (['failed', 'cancelled', 'expired'].includes(run.status)) {
          const msg = run.last_error?.message || run.status || 'unknown';
          return 'Операция не выполнена: ' + msg;
        }

        if (Date.now() - started > 90_000) return 'Операция не выполнена: timeout';
        await new Promise(r => setTimeout(r, 800));
      }

      const messages = await this.client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
      const reply = messages.data?.find(m => m.role === 'assistant');
      const text = (reply?.content || []).filter(c => c.type === 'text').map(c => c.text?.value || '').join('\n').trim();

      return text || 'Нет ответа от ассистента.';
    } catch (err) {
      const http = err?.status || err?.response?.status;
      const body = err?.response?.data || err?.error || err?.message || err;
      return `Ошибка при обращении к ИИ-агенту${http ? ` (HTTP ${http})` : ''}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
    }
  }
}
