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



// // src/services/AssistantService.js
// import OpenAI from 'openai';
// import { ENV } from '../config/env.js';
// import { log } from '../utils/logger.js';

// import { EmployeesService } from './EmployeesService.js';
// import { ToolRouter } from './ToolRouter.js';
// import { ApiClient } from './ApiClient.js';
// import { Notifier } from './Notifier.js';

// import { ThreadRegistry } from './ThreadRegistry.js';
// import { InMemoryDraftStore, normalizePriority } from './DraftStore.js';

// /* ===== Ваши хелперы — оставлены ===== */
// function isPathParamErr(e) {
//   const msg = (e && (e.message || e.toString())) || '';
//   return /Path parameters|invalid segments|is not a valid path parameter/i.test(msg);
// }

// async function retrieveRunSafe(openai, threadId, runId) {
//   try { return await openai.beta.threads.runs.retrieve(threadId, runId); }
//   catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId }); }
// }

// async function submitToolOutputsSafe(openai, threadId, runId, tool_outputs) {
//   try { return await openai.beta.threads.runs.submitToolOutputs(threadId, runId, { tool_outputs }); }
//   catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs }); }
// }

// function deriveRole(employee) {
//   const roleFromDb = String(employee?.user_role || '').toLowerCase();
//   if (roleFromDb === 'manager') return 'manager';
//   if (roleFromDb === 'staff') return 'staff';

//   const p = String(employee?.job || '').toLowerCase();
//   const isMgr = /(руковод|начальник|директор|lead|team lead|head|manager)/i.test(p);
//   return isMgr ? 'manager' : 'staff';
// }

// /* ===== Описание внутренних tools для черновика (добавьте в ассистента один раз) ===== */
// export const DRAFT_TOOLS_SCHEMAS = [
//   { type: 'function', function: { name: 'draft_get', description: 'Получить текущий черновик задачи', parameters: { type: 'object', properties: {} } } },
//   { type: 'function', function: {
//       name: 'draft_merge',
//       description: 'Мердж полей черновика (title, assigneeName, deadline, priority, desc)',
//       parameters: { type: 'object', properties: {
//         title: { type: 'string' },
//         assigneeName: { type: 'string' },
//         desc: { type: 'string' },
//         deadline: { type: 'string' },
//         priority: { type: 'string', enum: ['Критический','Высокий','Средний','Низкий','Очень низкий'] }
//       } }
//   } },
//   { type: 'function', function: { name: 'draft_clear', description: 'Очистить черновик', parameters: { type: 'object', properties: {} } } }
// ];

// export class AssistantService {
//   constructor({ bot } = {}) {
//     this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

//     const api = new ApiClient();
//     const employees = new EmployeesService(api);
//     const notifier = bot ? new Notifier(bot) : null;

//     this.tools = new ToolRouter({ api, employees, notifier });

//     this.threadRegistry = new ThreadRegistry();
//     this.drafts = new InMemoryDraftStore();
//   }

//   async ask(userText, ctx = {}) {
//     try {
//       const v = (process.versions.node || '0.0.0').split('.').map(Number);
//       if (v[0] < 18) return 'Ошибка: требуется Node.js 18+ для работы с OpenAI SDK.';
//     } catch {}

//     const assistantId = ENV.TELECOM_ASSISTANT_ID;
//     if (!assistantId || !/^asst_/.test(assistantId)) {
//       return 'Ошибка конфигурации: TELECOM_ASSISTANT_ID отсутствует или некорректен.';
//     }

//     try {
//       const userMeta = {
//         tg_chat_id: ctx?.chatId ? String(ctx.chatId) : '',
//         employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
//         employee_name: ctx?.employee?.name || '',
//         employee_position: ctx?.employee?.position || '',
//         user_role: deriveRole(ctx?.employee)
//       };
// console.log("kk",userMeta);
//       // один thread на chatId
//       let threadId = this.threadRegistry.get(userMeta.tg_chat_id);
//       if (!threadId) {
//         const thread = await this.client.beta.threads.create({ metadata: userMeta });
//         threadId = thread?.id;
//         log.info('[AI] threadId =', threadId);
//         if (!threadId || !threadId.startsWith('thread_')) throw new Error('THREAD_CREATE_FAILED');
//         this.threadRegistry.set(userMeta.tg_chat_id, threadId);
//       }

//       await this.client.beta.threads.messages.create(threadId, {
//         role: 'user',
//         content: userText,
//         metadata: userMeta
//       });
// const now = new Date();
// const offsetMs = 5 * 60 * 60 * 1000; // 5 часов в миллисекундах
// const tzDate = new Date(now.getTime() + offsetMs);

// console.log("dd", tzDate.toISOString());
//       const nowIso = new Date().toISOString();
//     //   const nowIso = tzDate.toISOString();
//       console.log("dddd",nowIso);
//       const additional_instructions =
// `Текущие дата/время:
// - now_utc: ${nowIso}
// - app_timezone: ${process.env.TZ || 'Asia/Dushanbe'}

// ПРАВИЛА:
// 1) Пошаговое создание задачи ведите через ЧЕРНОВИК:
//    - Сначала вызовите tool "draft_get".
//    - Найденные поля добавляйте через "draft_merge" (не перетирайте уже записанные).
// 2) Если не хватает полей — задайте ОДИН короткий вопрос ровно по следующему полю:
//    title → assigneeName → deadline → priority.
// 3) Когда все поля собраны — вызовите "create_task" (только если роль = manager). После успеха — "draft_clear".
// 4) Относительные даты ("завтра 10:00") передавайте как есть в deadline — бэкенд сам нормализует.
// 5) Действия с задачами и рассылками только через tools; ACL: staff не может вызывать create_task, send_telegram, reassign_task.
// 6) Отвечайте кратко.
// 7) Если пользователь спросить о себе, поиши и преддоставь информацию по его чат ID ${userMeta.tg_chat_id}.
// 8) Покажи id задачи рядом с задачи.
// 9) Также приветствуй пользователя по имени.`;

//       let run = await this.client.beta.threads.runs.create(threadId, {
//         assistant_id: assistantId,
//         metadata: userMeta,
//         additional_instructions
//       });

//       let runId = run?.id;
//       if (!runId || !runId.startsWith('run_')) throw new Error('RUN_CREATE_FAILED');

//       const started = Date.now();
//       let guard = 0;

//       while (true) {
//         run = await retrieveRunSafe(this.client, threadId, runId);

//         if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
//           const calls = run.required_action.submit_tool_outputs.tool_calls || [];
//           const outputs = [];

//           for (const c of calls) {
//             const name = c.function?.name || '';
//             let args = {};
//             try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}

//             // Внутренние tools черновика
//             if (name === 'draft_get') {
//               const draft = this.drafts.get(userMeta.tg_chat_id);
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: draft || null }) });
//               continue;
//             }
//             if (name === 'draft_merge') {
//               if (args && args.priority) args.priority = normalizePriority(args.priority);
//               const merged = this.drafts.merge(userMeta.tg_chat_id, args || {});
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: merged }) });
//               continue;
//             }
//             if (name === 'draft_clear') {
//               this.drafts.clear(userMeta.tg_chat_id);
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true }) });
//               continue;
//             }

//             // ACL для боевых tools
//             if (userMeta.user_role !== 'manager' && (name === 'create_task' || name === 'send_telegram' || name === 'reassign_task')) {
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
//               continue;
//             }

//             // Вызов Вашего ToolRouter
//             let result;
//             try {
//               result = await this.tools.route(name, args, {
//                 requesterChatId: userMeta.tg_chat_id,
//                 requesterEmployee: ctx?.employee
//               });

//               // подстраховка: очистить черновик после успешного создания
//               if (name === 'create_task' && result?.ok) {
//                 this.drafts.clear(userMeta.tg_chat_id);
//               }
//             } catch (err) {
//               result = { ok: false, error: err?.message || String(err) };
//             }

//             outputs.push({ tool_call_id: c.id, output: JSON.stringify(result) });
//           }

//           run = await submitToolOutputsSafe(this.client, threadId, runId, outputs);
//           runId = run?.id || runId;
//           guard++;
//           if (guard > 12) throw new Error('TOOL_LOOP_GUARD');
//           continue;
//         }

//         if (run.status === 'completed') break;
//         if (['failed', 'cancelled', 'expired'].includes(run.status)) {
//           const msg = run.last_error?.message || run.status || 'unknown';
//           return 'Операция не выполнена: ' + msg;
//         }

//         if (Date.now() - started > 90_000) return 'Операция не выполнена: timeout';
//         await new Promise(r => setTimeout(r, 800));
//       }

//       const messages = await this.client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
//       const reply = messages.data?.find(m => m.role === 'assistant');
//       const text = (reply?.content || []).filter(c => c.type === 'text').map(c => c.text?.value || '').join('\n').trim();

//       return text || 'Нет ответа от ассистента.';
//     } catch (err) {
//       const http = err?.status || err?.response?.status;
//       const body = err?.response?.data || err?.error || err?.message || err;
//       return `Ошибка при обращении к ИИ-агенту${http ? ` (HTTP ${http})` : ''}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
//     }
//   }
// }



// // src/services/AssistantService.js
// import OpenAI from 'openai';
// import { ENV } from '../config/env.js';
// import { log } from '../utils/logger.js';

// import { EmployeesService } from './EmployeesService.js';
// import { ToolRouter } from './ToolRouter.js';
// import { ApiClient } from './ApiClient.js';
// import { Notifier } from './Notifier.js';

// import { ThreadRegistry } from './ThreadRegistry.js';

// // ВАЖНО: используем БД-версию драфт-хранилища
// import { DbDraftStore, normalizePriority } from './DraftStoreDb.js';
// // Лог разговоров в БД
// import { logMessage, getConversation } from './ConversationLog.js';

// /* ===== Вспомогательные функции ===== */
// function isPathParamErr(e) {
//   const msg = (e && (e.message || e.toString())) || '';
//   return /Path parameters|invalid segments|is not a valid path parameter/i.test(msg);
// }

// async function retrieveRunSafe(openai, threadId, runId) {
//   try { return await openai.beta.threads.runs.retrieve(threadId, runId); }
//   catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId }); }
// }

// async function submitToolOutputsSafe(openai, threadId, runId, tool_outputs) {
//   try { return await openai.beta.threads.runs.submitToolOutputs(threadId, runId, { tool_outputs }); }
//   catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs }); }
// }

// function deriveRole(employee) {
//   const roleFromDb = String(employee?.user_role || '').toLowerCase();
//   if (roleFromDb === 'manager') return 'manager';
//   if (roleFromDb === 'staff') return 'staff';

//   const p = String(employee?.job || '').toLowerCase();
//   const isMgr = /(руковод|начальник|директор|lead|team lead|head|manager)/i.test(p);
//   return isMgr ? 'manager' : 'staff';
// }

// /* ===== Внутренние tools ===== */
// // 1) Черновик
// export const DRAFT_TOOLS_SCHEMAS = [
//   { type: 'function', function: { name: 'draft_get', description: 'Получить текущий черновик задачи', parameters: { type: 'object', properties: {} } } },
//   { type: 'function', function: {
//       name: 'draft_merge',
//       description: 'Мердж полей черновика (title, assigneeName, deadline, priority, desc)',
//       parameters: { type: 'object', properties: {
//         title: { type: 'string' },
//         assigneeName: { type: 'string' },
//         desc: { type: 'string' },
//         deadline: { type: 'string' },
//         priority: { type: 'string', enum: ['Критический','Высокий','Средний','Низкий','Очень низкий'] }
//       } }
//   } },
//   { type: 'function', function: { name: 'draft_clear', description: 'Очистить черновик', parameters: { type: 'object', properties: {} } } }
// ];

// // 2) История диалога из БД
// export const HISTORY_TOOLS_SCHEMAS = [
//   { type: 'function', function: {
//       name: 'history_get',
//       description: 'Вернуть последние сообщения из памяти (ai_messages) для текущего chatId',
//       parameters: {
//         type: 'object',
//         properties: {
//           limit: { type: 'integer', description: 'Сколько сообщений вернуть (по умолчанию 20)' },
//           order: { type: 'string', enum: ['asc','desc'], description: 'Порядок сортировки по времени, default=desc' }
//         }
//       }
//   } }
// ];

// export class AssistantService {
//   constructor({ bot } = {}) {
//     this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

//     const api = new ApiClient();
//     const employees = new EmployeesService(api);
//     const notifier = bot ? new Notifier(bot) : null;

//     this.tools = new ToolRouter({ api, employees, notifier });

//     this.threadRegistry = new ThreadRegistry();
//     this.drafts = new DbDraftStore(); // <-- теперь в БД
//   }

//   async ask(userText, ctx = {}) {
//     try {
//       const v = (process.versions.node || '0.0.0').split('.').map(Number);
//       if (v[0] < 18) return 'Ошибка: требуется Node.js 18+ для работы с OpenAI SDK.';
//     } catch {}

//     const assistantId = ENV.TELECOM_ASSISTANT_ID;
//     if (!assistantId || !/^asst_/.test(assistantId)) {
//       return 'Ошибка конфигурации: TELECOM_ASSISTANT_ID отсутствует или некорректен.';
//     }

//     try {
//       const userMeta = {
//         tg_chat_id: ctx?.chatId ? String(ctx.chatId) : '',
//         employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
//         employee_name: ctx?.employee?.name || '',
//         employee_position: ctx?.employee?.position || '',
//         user_role: deriveRole(ctx?.employee)
//       };

//       // один thread на chatId
//       let threadId = this.threadRegistry.get(userMeta.tg_chat_id);
//       if (!threadId) {
//         const thread = await this.client.beta.threads.create({ metadata: userMeta });
//         threadId = thread?.id;
//         log.info('[AI] threadId =', threadId);
//         if (!threadId || !threadId.startsWith('thread_')) throw new Error('THREAD_CREATE_FAILED');
//         this.threadRegistry.set(userMeta.tg_chat_id, threadId);
//       }

//       // Записываем пользовательское сообщение в OpenAI Thread
//       await this.client.beta.threads.messages.create(threadId, {
//         role: 'user',
//         content: userText,
//         metadata: userMeta
//       });

//       // И сразу лог в БД (вечная память)
//       await logMessage({ chatId: userMeta.tg_chat_id, role: 'user', content: userText, meta: userMeta });

//       // Текущие дата/время (для промпта)
//       const nowIso = new Date().toISOString();

//       // Инструкции ассистенту (ПРОМПТ): как использовать черновик и историю
//       const additional_instructions =
// `Текущие дата/время:
// - now_utc: ${nowIso}
// - app_timezone: ${process.env.TZ || 'Asia/Dushanbe'}

// ВАЖНО: У вас есть «память» (MySQL).
// — Для черновика задачи используйте инструменты: draft_get, draft_merge, draft_clear.
// — Если вам нужен контекст последних сообщений (что обсуждалось ранее) — вызовите history_get(limit=20).
// — Не спрашивайте пользователя о полях, которые уже есть в черновике; сначала посмотрите draft_get.
// — Поля задачи собирайте строго по порядку: title → assigneeName → deadline → priority → desc.
// — По готовности всех полей вызовите create_task (только если роль=manager). После успеха — вызовите draft_clear.
// — Относительные даты (например, "завтра 10:00") передавайте как есть в deadline — бэкенд нормализует.
// — Действия с задачами и рассылками только через tools; ACL: staff не может вызывать create_task, send_telegram, reassign_task.
// — Отвечайте кратко, приветствуйте пользователя по имени.
// — Всегда выводите ID задачи рядом с задачей.
// — Если пользователь спрашивает «что мы обсуждали раньше», «покажи историю», «напомни, что я писал» — используйте history_get, а затем кратко перескажите главное.`;

//       // Запуск Run с подключенными функциями
//       let run = await this.client.beta.threads.runs.create(threadId, {
//         assistant_id: assistantId,
//         metadata: userMeta,
//         additional_instructions,
//         // ВАЖНО: добавьте описания функций в самом ассистенте один раз.
//         // Здесь мы их не передаём в runs.create, т.к. SDK держит schema на ассистенте.
//         // Если же вы хотите передавать здесь, используйте поле tools: [...DRAFT_TOOLS_SCHEMAS, ...HISTORY_TOOLS_SCHEMAS]
//       });

//       let runId = run?.id;
//       if (!runId || !runId.startsWith('run_')) throw new Error('RUN_CREATE_FAILED');

//       const started = Date.now();
//       let guard = 0;

//       while (true) {
//         run = await retrieveRunSafe(this.client, threadId, runId);

//         if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
//           const calls = run.required_action.submit_tool_outputs.tool_calls || [];
//           const outputs = [];

//           for (const c of calls) {
//             const name = c.function?.name || '';
//             let args = {};
//             try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}

//             // Логируем сам вызов инструмента (без секретов)
//             await logMessage({
//               chatId: userMeta.tg_chat_id,
//               role: 'tool',
//               content: name,
//               meta: { args: args }
//             });

//             // Внутренние tools черновика (из БД)
//             if (name === 'draft_get') {
//               const draft = await this.drafts.get(userMeta.tg_chat_id);
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: draft || null }) });
//               continue;
//             }
//             if (name === 'draft_merge') {
//               if (args && args.priority) args.priority = normalizePriority(args.priority);
//               const merged = await this.drafts.merge(userMeta.tg_chat_id, args || {});
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: merged }) });
//               continue;
//             }
//             if (name === 'draft_clear') {
//               await this.drafts.clear(userMeta.tg_chat_id);
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true }) });
//               continue;
//             }

//             // История (вечная память диалога)
//             if (name === 'history_get') {
//               const limit = Number(args?.limit) > 0 ? Number(args.limit) : 20;
//               const order = (args?.order === 'asc' || args?.order === 'desc') ? args.order : 'desc';
//               const rows = await getConversation(userMeta.tg_chat_id, { limit, order });
//               // отрезаем длинные payloads
//               const safe = rows.map(r => ({
//                 id: r.id, role: r.role, created_at: r.created_at,
//                 content: typeof r.content === 'string' && r.content.length > 5000
//                   ? r.content.slice(0, 5000) + '…(обрезано)'
//                   : r.content
//               }));
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, messages: safe }) });
//               continue;
//             }

//             // ACL для боевых tools
//             if (userMeta.user_role !== 'manager' &&
//                 (name === 'create_task' || name === 'send_telegram' || name === 'reassign_task')) {
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
//               continue;
//             }

//             // Вызов Вашего ToolRouter (боевые действия)
//             let result;
//             try {
//               result = await this.tools.route(name, args, {
//                 requesterChatId: userMeta.tg_chat_id,
//                 requesterEmployee: ctx?.employee
//               });

//               // очистить черновик после успешного создания
//               if (name === 'create_task' && result?.ok) {
//                 await this.drafts.clear(userMeta.tg_chat_id);
//               }
//             } catch (err) {
//               result = { ok: false, error: err?.message || String(err) };
//             }

//             outputs.push({ tool_call_id: c.id, output: JSON.stringify(result) });
//           }

//           run = await submitToolOutputsSafe(this.client, threadId, runId, outputs);
//           runId = run?.id || runId;
//           guard++;
//           if (guard > 12) throw new Error('TOOL_LOOP_GUARD');
//           continue;
//         }

//         if (run.status === 'completed') break;
//         if (['failed', 'cancelled', 'expired'].includes(run.status)) {
//           const msg = run.last_error?.message || run.status || 'unknown';
//           return 'Операция не выполнена: ' + msg;
//         }

//         if (Date.now() - started > 90_000) return 'Операция не выполнена: timeout';
//         await new Promise(r => setTimeout(r, 800));
//       }

//       // Достаём последний ответ ассистента
//       const messages = await this.client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
//       const reply = messages.data?.find(m => m.role === 'assistant');
//       const text = (reply?.content || []).filter(c => c.type === 'text').map(c => c.text?.value || '').join('\n').trim();

//       // Логируем ответ ассистента в БД
//       await logMessage({
//         chatId: userMeta.tg_chat_id,
//         role: 'assistant',
//         content: text || '',
//         meta: { threadId, runId }
//       });

//       return text || 'Нет ответа от ассистента.';
//     } catch (err) {
//       const http = err?.status || err?.response?.status;
//       const body = err?.response?.data || err?.error || err?.message || err;
//       return `Ошибка при обращении к ИИ-агенту${http ? ` (HTTP ${http})` : ''}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
//     }
//   }
// }



// // src/services/AssistantService.js
// import OpenAI from 'openai';
// import { ENV } from '../config/env.js';
// import { log } from '../utils/logger.js';

// import { EmployeesService } from './EmployeesService.js';
// import { ToolRouter } from './ToolRouter.js';
// import { ApiClient } from './ApiClient.js';
// import { Notifier } from './Notifier.js';

// import { ThreadRegistry } from './ThreadRegistry.js';

// // БД-хранилище черновиков + нормализация приоритета
// import { DbDraftStore, normalizePriority } from './DraftStoreDb.js';
// // Память в ОЗУ — фолбэк, если БД недоступна
// import { InMemoryDraftStore } from './DraftStore.js';

// // Логи разговоров в БД
// import { logMessage, getConversation } from './ConversationLog.js';
// // Проверка соединения с БД
// import { testConnection } from '../config/db.js';

// /* ===== Вспомогательные функции ===== */
// function isPathParamErr(e) {
//   const msg = (e && (e.message || e.toString())) || '';
//   return /Path parameters|invalid segments|is not a valid path parameter/i.test(msg);
// }

// async function retrieveRunSafe(openai, threadId, runId) {
//   try { return await openai.beta.threads.runs.retrieve(threadId, runId); }
//   catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId }); }
// }

// async function submitToolOutputsSafe(openai, threadId, runId, tool_outputs) {
//   try { return await openai.beta.threads.runs.submitToolOutputs(threadId, runId, { tool_outputs }); }
//   catch (e) { if (!isPathParamErr(e)) throw e; return await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs }); }
// }

// function deriveRole(employee) {
//   const roleFromDb = String(employee?.user_role || '').toLowerCase();
//   if (roleFromDb === 'manager') return 'manager';
//   if (roleFromDb === 'staff') return 'staff';
//   const p = String(employee?.job || '').toLowerCase();
//   const isMgr = /(руковод|начальник|директор|lead|team lead|head|manager)/i.test(p);
//   return isMgr ? 'manager' : 'staff';
// }

// /* ===== Схемы внутренних tools ===== */
// // 1) Черновик
// export const DRAFT_TOOLS_SCHEMAS = [
//   { type: 'function', function: { name: 'draft_get', description: 'Получить текущий черновик задачи', parameters: { type: 'object', properties: {} } } },
//   { type: 'function', function: {
//       name: 'draft_merge',
//       description: 'Мердж полей черновика (title, assigneeName, deadline, priority, desc)',
//       parameters: { type: 'object', properties: {
//         title: { type: 'string' },
//         assigneeName: { type: 'string' },
//         desc: { type: 'string' },
//         deadline: { type: 'string' },
//         priority: { type: 'string', enum: ['Критический','Высокий','Средний','Низкий','Очень низкий'] }
//       } }
//   } },
//   { type: 'function', function: { name: 'draft_clear', description: 'Очистить черновик', parameters: { type: 'object', properties: {} } } }
// ];

// // 2) История диалога из БД
// export const HISTORY_TOOLS_SCHEMAS = [
//   { type: 'function', function: {
//       name: 'history_get',
//       description: 'Вернуть последние сообщения из памяти (ai_messages) для текущего chatId',
//       parameters: {
//         type: 'object',
//         properties: {
//           limit: { type: 'integer', description: 'Сколько сообщений вернуть (по умолчанию 20)' },
//           order: { type: 'string', enum: ['asc','desc'], description: 'Порядок сортировки по времени, default=desc' }
//         }
//       }
//   } }
// ];

// export class AssistantService {
//   constructor({ bot } = {}) {
//     this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

//     const api = new ApiClient();
//     const employees = new EmployeesService(api);
//     const notifier = bot ? new Notifier(bot) : null;

//     this.tools = new ToolRouter({ api, employees, notifier });

//     this.threadRegistry = new ThreadRegistry();

//     // Память: по умолчанию хотим БД, но умеем фолбэк в ОЗУ
//     this.useDb = true;
//     this.storageReady = false;
//     this.drafts = new DbDraftStore();       // основное
//     this.memDrafts = new InMemoryDraftStore(); // фолбэк
//   }

//   async ensureStorage() {
//     if (this.storageReady) return;
//     try {
//       await testConnection();        // проверяем, что БД и пароль живы
//       this.useDb = true;
//       log.info('[AI] storage = MySQL');
//     } catch (e) {
//       this.useDb = false;
//       log.warn('[AI] MySQL недоступна, переключаюсь на память в ОЗУ (fallback). Причина:', e?.message || e);
//     } finally {
//       this.storageReady = true;
//     }
//   }

//   async safeLogMessage(payload) {
//     if (!this.useDb) return false;
//     try {
//       await logMessage(payload);
//       return true;
//     } catch (e) {
//       log.warn('[AI] logMessage failed:', e?.message || e);
//       return false;
//     }
//   }

//   async ask(userText, ctx = {}) {
//     try {
//       const v = (process.versions.node || '0.0.0').split('.').map(Number);
//       if (v[0] < 18) return 'Ошибка: требуется Node.js 18+ для работы с OpenAI SDK.';
//     } catch {}

//     const assistantId = ENV.TELECOM_ASSISTANT_ID;
//     if (!assistantId || !/^asst_/.test(assistantId)) {
//       return 'Ошибка конфигурации: TELECOM_ASSISTANT_ID отсутствует или некорректен.';
//     }

//     try {
//       await this.ensureStorage(); // ← ключевое: решаем, БД или ОЗУ

//       const userMeta = {
//         tg_chat_id: ctx?.chatId ? String(ctx.chatId) : '',
//         employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
//         employee_name: ctx?.employee?.name || '',
//         employee_position: ctx?.employee?.position || '',
//         user_role: deriveRole(ctx?.employee)
//       };

//       // один thread на chatId
//       let threadId = this.threadRegistry.get(userMeta.tg_chat_id);
//       if (!threadId) {
//         const thread = await this.client.beta.threads.create({ metadata: userMeta });
//         threadId = thread?.id;
//         log.info('[AI] threadId =', threadId);
//         if (!threadId || !threadId.startsWith('thread_')) throw new Error('THREAD_CREATE_FAILED');
//         this.threadRegistry.set(userMeta.tg_chat_id, threadId);
//       }

//       // Сообщение пользователя в Thread
//       await this.client.beta.threads.messages.create(threadId, {
//         role: 'user',
//         content: userText,
//         metadata: userMeta
//       });

//       // Лог в "вечную" память (если БД есть)
//       await this.safeLogMessage({ chatId: userMeta.tg_chat_id, role: 'user', content: userText, meta: userMeta });

//       const nowIso = new Date().toISOString();

//       // Инструкции ассистенту
//       const additional_instructions =
// `Текущие дата/время:
// - now_utc: ${nowIso}
// - app_timezone: ${process.env.TZ || 'Asia/Dushanbe'}

// ВАЖНО: у вас есть память.
// — Для черновика задачи используйте инструменты: draft_get, draft_merge, draft_clear.
// — Если нужен контекст последних сообщений — вызовите history_get(limit=20).
// — Не спрашивайте пользователя о полях, которые уже есть в черновике; сначала posmotrite draft_get.
// — Поля задачи собирайте строго по порядку: title → assigneeName → deadline → priority → desc.
// — По готовности вызовите create_task (только если роль=manager). После успеха — draft_clear.
// — Относительные даты (например, "завтра 10:00") передавайте как есть в deadline — бэкенд нормализует.
// — Действия с задачами и рассылками только через tools; ACL: staff не может вызывать create_task, send_telegram, reassign_task.
// — Отвечайте кратко, приветствуйте пользователя по имени.
// — Если пользователь спросить о себе, поиши и преддоставь информацию по его чат ID ${userMeta.tg_chat_id}.
// — Всегда выводите ID задачи рядом с задачей.
// — Если пользователь спрашивает «что мы обсуждали раньше», «покажи историю», «напомни, что я писал» — используйте history_get, затем кратко перескажите главное.`;

//       // Запуск Run
//       let run = await this.client.beta.threads.runs.create(threadId, {
//         assistant_id: assistantId,
//         metadata: userMeta,
//         additional_instructions
//         // схемы функций добавьте в ассистенте; сюда можно тоже передать tools при желании
//       });

//       let runId = run?.id;
//       if (!runId || !runId.startsWith('run_')) throw new Error('RUN_CREATE_FAILED');

//       const started = Date.now();
//       let guard = 0;

//       while (true) {
//         run = await retrieveRunSafe(this.client, threadId, runId);

//         if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
//           const calls = run.required_action.submit_tool_outputs.tool_calls || [];
//           const outputs = [];

//           for (const c of calls) {
//             const name = c.function?.name || '';
//             let args = {};
//             try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}

//             // Логируем факт вызова tool (если БД доступна; ошибки — в warn)
//             await this.safeLogMessage({
//               chatId: userMeta.tg_chat_id,
//               role: 'tool',
//               content: name,
//               meta: { args }
//             });

//             // Выбираем активное хранилище черновиков
//             const store = this.useDb ? this.drafts : this.memDrafts;

//             // Внутренние tools черновика
//             if (name === 'draft_get') {
//               let draft = null;
//               try { draft = await store.get(userMeta.tg_chat_id); } catch (e) {
//                 log.warn('[AI] draft_get failed:', e?.message || e);
//               }
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: draft || null, storage: this.useDb ? 'db' : 'memory' }) });
//               continue;
//             }
//             if (name === 'draft_merge') {
//               try {
//                 if (args && args.priority) args.priority = normalizePriority(args.priority);
//                 const merged = await store.merge(userMeta.tg_chat_id, args || {});
//                 outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: merged, storage: this.useDb ? 'db' : 'memory' }) });
//               } catch (e) {
//                 outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: String(e?.message || e) }) });
//               }
//               continue;
//             }
//             if (name === 'draft_clear') {
//               try { await store.clear(userMeta.tg_chat_id); } catch (e) {
//                 log.warn('[AI] draft_clear failed:', e?.message || e);
//               }
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, storage: this.useDb ? 'db' : 'memory' }) });
//               continue;
//             }

//             // История (вечная память диалога)
//             if (name === 'history_get') {
//               if (!this.useDb) {
//                 outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, messages: [], note: 'history disabled (DB not available)' }) });
//                 continue;
//               }
//               try {
//                 const limit = Number(args?.limit) > 0 ? Number(args.limit) : 20;
//                 const order = (args?.order === 'asc' || args?.order === 'desc') ? args.order : 'desc';
//                 const rows = await getConversation(userMeta.tg_chat_id, { limit, order });
//                 const safe = rows.map(r => ({
//                   id: r.id, role: r.role, created_at: r.created_at,
//                   content: typeof r.content === 'string' && r.content.length > 5000
//                     ? r.content.slice(0, 5000) + '…(обрезано)'
//                     : r.content
//                 }));
//                 outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, messages: safe }) });
//               } catch (e) {
//                 outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: String(e?.message || e) }) });
//               }
//               continue;
//             }

//             // ACL для боевых tools
//             if (userMeta.user_role !== 'manager' &&
//                 (name === 'create_task' || name === 'send_telegram' || name === 'reassign_task')) {
//               outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
//               continue;
//             }

//             // Вызов Вашего ToolRouter (боевые действия)
//             let result;
//             try {
//               result = await this.tools.route(name, args, {
//                 requesterChatId: userMeta.tg_chat_id,
//                 requesterEmployee: ctx?.employee
//               });

//               // Очистить черновик после успешного создания
//               if (name === 'create_task' && result?.ok) {
//                 try { await store.clear(userMeta.tg_chat_id); } catch {}
//               }
//             } catch (err) {
//               result = { ok: false, error: err?.message || String(err) };
//             }

//             outputs.push({ tool_call_id: c.id, output: JSON.stringify(result) });
//           }

//           run = await submitToolOutputsSafe(this.client, threadId, runId, outputs);
//           runId = run?.id || runId;
//           guard++;
//           if (guard > 12) throw new Error('TOOL_LOOP_GUARD');
//           continue;
//         }

//         if (run.status === 'completed') break;
//         if (['failed', 'cancelled', 'expired'].includes(run.status)) {
//           const msg = run.last_error?.message || run.status || 'unknown';
//           return 'Операция не выполнена: ' + msg;
//         }

//         if (Date.now() - started > 90_000) return 'Операция не выполнена: timeout';
//         await new Promise(r => setTimeout(r, 800));
//       }

//       // Достаём последний ответ ассистента
//       const messages = await this.client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
//       const reply = messages.data?.find(m => m.role === 'assistant');
//       const text = (reply?.content || []).filter(c => c.type === 'text').map(c => c.text?.value || '').join('\n').trim();

//       // Логируем ответ ассистента (если БД доступна)
//       await this.safeLogMessage({
//         chatId: userMeta.tg_chat_id,
//         role: 'assistant',
//         content: text || '',
//         meta: { threadId, runId }
//       });

//       return text || 'Нет ответа от ассистента.';
//     } catch (err) {
//       const http = err?.status || err?.response?.status;
//       const body = err?.response?.data || err?.error || err?.message || err;
//       return `Ошибка при обращении к ИИ-агенту${http ? ` (HTTP ${http})` : ''}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
//     }
//   }
// }


// src/services/AssistantService.js
import OpenAI from 'openai';
import { ENV } from '../config/env.js';
import { log } from '../utils/logger.js';

import { EmployeesService } from './EmployeesService.js';
import { ToolRouter, TOOL_SCHEMAS as BUSINESS_TOOL_SCHEMAS } from './ToolRouter.js';
import { ApiClient } from './ApiClient.js';
import { Notifier } from './Notifier.js';
import { ThreadRegistry } from './ThreadRegistry.js';

// БД-хранилище черновиков + нормализация приоритета
import { DbDraftStore, normalizePriority } from './DraftStoreDb.js';
// Память в ОЗУ — фолбэк, если БД недоступна
import { InMemoryDraftStore } from './DraftStore.js';

// Логи разговоров в БД
import { logMessage, getConversation, getConversationByKeywords } from './ConversationLog.js';
// Проверка соединения с БД
import { testConnection } from '../config/db.js';

/* ===== Вспомогательные функции ===== */
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

// Функция для извлечения ключевых слов из текста пользователя
function extractKeywords(userText) {
  // Убираем общие слова и оставляем только значимые
  const stopWords = [
    'помнишь', 'наш', 'разговор', 'о', 'об', 'мы', 'с', 'тобой', 'говорили', 'обсуждали',
    'что', 'как', 'где', 'когда', 'почему', 'зачем', 'какой', 'какая', 'какие',
    'это', 'то', 'вот', 'так', 'же', 'ли', 'бы', 'был', 'была', 'были',
    'есть', 'нет', 'не', 'ни', 'да', 'нет', 'хорошо', 'плохо', 'давайте'
  ];
  
  // Разбиваем текст на слова и фильтруем
  const words = userText.toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Убираем знаки препинания
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  // Возвращаем уникальные слова
  return [...new Set(words)];
}

/* ===== Схемы внутренних tools ===== */
// 1) Черновик
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

// 2) История диалога из БД
export const HISTORY_TOOLS_SCHEMAS = [
  { type: 'function', function: {
      name: 'history_get',
      description: 'Вернуть последние сообщения из памяти (ai_messages) для текущего chatId с возможностью фильтрации по дате и ключевым словам',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Сколько сообщений вернуть (по умолчанию 20)' },
          order: { type: 'string', enum: ['asc','desc'], description: 'Порядок сортировки по времени, default=desc' },
          date_filter: { type: 'string', description: 'Фильтр по дате: "сегодня", "вчера", "позавчера", "2024-01-15" или относительные даты' },
          keywords: { type: 'array', items: { type: 'string' }, description: 'Ключевые слова для поиска в содержании сообщений' }
        }
      }
  } }
];

export class AssistantService {
  constructor({ bot } = {}) {
    this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

    const api = new ApiClient();
    const employees = new EmployeesService(api);
    const notifier = bot ? new Notifier(bot) : null;

    this.tools = new ToolRouter({ api, employees, notifier });

    this.threadRegistry = new ThreadRegistry();

    // Память: по умолчанию хотим БД, но умеем фолбэк в ОЗУ
    this.useDb = true;
    this.storageReady = false;
    this.drafts = new DbDraftStore();       // основное
    this.memDrafts = new InMemoryDraftStore(); // фолбэк
  }

  async ensureStorage() {
    if (this.storageReady) return;
    try {
      await testConnection();        // проверяем, что БД и пароль живы
      this.useDb = true;
      log.info('[AI] storage = MySQL');
    } catch (e) {
      this.useDb = false;
      log.warn('[AI] MySQL недоступна, переключаюсь на память в ОЗУ (fallback). Причина:', e?.message || e);
    } finally {
      this.storageReady = true;
    }
  }

  async safeLogMessage(payload) {
    if (!this.useDb) return false;
    try {
      await logMessage(payload);
      return true;
    } catch (e) {
      log.warn('[AI] logMessage failed:', e?.message || e);
      return false;
    }
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
      await this.ensureStorage(); // ← ключевое: решаем, БД или ОЗУ

      const userMeta = {
        tg_chat_id: ctx?.chatId ? String(ctx.chatId) : '',
        employee_id: ctx?.employee?.id ? String(ctx.employee.id) : '',
        employee_name: ctx?.employee?.name || '',
        employee_position: ctx?.employee?.position || '',
        user_role: deriveRole(ctx?.employee)
      };

      // один thread на chatId
      let threadId = this.threadRegistry.get(userMeta.tg_chat_id);
      if (!threadId) {
        const thread = await this.client.beta.threads.create({ metadata: userMeta });
        threadId = thread?.id;
        log.info('[AI] threadId =', threadId);
        if (!threadId || !threadId.startsWith('thread_')) throw new Error('THREAD_CREATE_FAILED');
        this.threadRegistry.set(userMeta.tg_chat_id, threadId);
      }

      // Сообщение пользователя в Thread
      await this.client.beta.threads.messages.create(threadId, {
        role: 'user',
        content: userText,
        metadata: userMeta
      });

      // Лог в "вечную" память (если БД есть)
      await this.safeLogMessage({ chatId: userMeta.tg_chat_id, role: 'user', content: userText, meta: userMeta });

      // Автоматически определяем, спрашивает ли пользователь об истории
      const historyKeywords = [
        'история', 'историю', 'истории', 'историей',
        'обсуждали', 'говорили', 'писал', 'писала', 'писали',
        'напомни', 'напомнить', 'покажи', 'показать',
        'раньше', 'ранее', 'предыдущие', 'последние',
        'что мы', 'о чем мы', 'наши разговоры'
      ];

      // Определяем конкретные даты
      const dateKeywords = {
        'сегодня': 'сегодня',
        'вчера': 'вчера',
        'позавчера': 'позавчера',
        'на этой неделе': 'на этой неделе',
        'на прошлой неделе': 'на прошлой неделе',
        'в этом месяце': 'в этом месяце',
        'в прошлом месяце': 'в прошлом месяце'
      };

      // Ищем ключевые слова дат
      let detectedDate = null;
      for (const [keyword, dateValue] of Object.entries(dateKeywords)) {
        if (userText.toLowerCase().includes(keyword.toLowerCase())) {
          detectedDate = dateValue;
          break;
        }
      }

      // Проверяем на конкретные даты (например, "15 января", "2024-01-15")
      const specificDateMatch = userText.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
      if (specificDateMatch) {
        const day = specificDateMatch[1];
        const month = specificDateMatch[2];
        const monthMap = {
          'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
          'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
          'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'
        };
        const currentYear = new Date().getFullYear();
        detectedDate = `${currentYear}-${monthMap[month.toLowerCase()]}-${day.padStart(2, '0')}`;
      }

      // Проверяем на формат YYYY-MM-DD
      const isoDateMatch = userText.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoDateMatch) {
        detectedDate = isoDateMatch[1];
      }

      const isHistoryQuestion = historyKeywords.some(keyword => 
        userText.toLowerCase().includes(keyword.toLowerCase())
      );

      // Извлекаем ключевые слова для поиска по содержанию
      const extractedKeywords = extractKeywords(userText);
      
      if (isHistoryQuestion || detectedDate || extractedKeywords.length > 0) {
        log.info(`[AI] History question detected: "${userText}", date_filter: ${detectedDate || 'none'}, keywords: ${JSON.stringify(extractedKeywords)}`);
      }

      const nowIso = new Date().toISOString();

      // Инструкции ассистенту (исправил опечатку "posmotrite")
      const additional_instructions =
`Текущие дата/время:
- now_utc: ${nowIso}
- app_timezone: ${process.env.TZ || 'Asia/Dushanbe'}

ВАЖНО: у вас есть память.
— Для черновика задачи используйте инструменты: draft_get, draft_merge, draft_clear.
— Если нужен контекст последних сообщений — вызовите history_get(limit=20).
— Не спрашивайте пользователя о полях, которые уже есть в черновике; сначала посмотрите draft_get.
— Поля задачи собирайте строго по порядку: title → assigneeName → deadline → priority → desc.
— По готовности вызовите create_task (только если роль=manager). После успеха — draft_clear.
— Относительные даты (например, "завтра 10:00") передавайте как есть в deadline — бэкенд нормализует.
— ВАЖНО: Если deadline не указан, система автоматически проанализирует сложность задачи и установит реалистичный дедлайн на основе содержания задачи.
— Действия с задачами и рассылками только через tools; ACL: staff не может вызывать create_task, send_telegram, reassign_task.
— Отвечайте кратко, приветствуйте пользователя по имени.
— Если пользователь спросит о себе, поищите и предоставьте информацию по его чат ID ${userMeta.tg_chat_id}.
— Всегда выводите ID задачи рядом с задачей.

${isHistoryQuestion || detectedDate || extractedKeywords.length > 0 ? '🚨 ВНИМАНИЕ: Пользователь спрашивает об истории разговоров!' + (detectedDate ? ` Запрошена конкретная дата: ${detectedDate}` : '') + (extractedKeywords.length > 0 ? ` Ключевые слова: ${extractedKeywords.join(', ')}` : '') + ' ОБЯЗАТЕЛЬНО вызовите history_get и покажите историю!' : ''}

${detectedDate ? `ВАЖНО: Пользователь запросил историю за конкретную дату: "${detectedDate}". Используйте history_get(limit=50, date_filter="${detectedDate}") для получения сообщений только за эту дату.` : ''}

${extractedKeywords.length > 0 ? `ВАЖНО: Пользователь упомянул ключевые слова: ${extractedKeywords.join(', ')}. Используйте history_get(limit=100, keywords=${JSON.stringify(extractedKeywords)}) для поиска сообщений по содержанию.` : ''}

ОБЯЗАТЕЛЬНО: Если пользователь спрашивает о прошлых разговорах, истории, предыдущих сообщениях или использует фразы типа:
• "что мы обсуждали раньше?"
• "покажи историю наших разговоров"
• "напомни, о чем мы говорили"
• "что я писал ранее?"
• "покажи последние сообщения"
• "история чата"
• "предыдущие разговоры"
• "что мы обсуждали?"
• "напомни мне"
• "покажи что я писал"
• "история сообщений"
• "что мы обсуждали вчера?"
• "покажи разговоры за 15 января"
• "история за прошлую неделю"
• "сообщения за 2024-01-15"

ТО СРАЗУ вызывайте history_get с соответствующими параметрами:
- Для общих вопросов: history_get(limit=20)
- Для конкретных дат: history_get(limit=50, date_filter="вчера")
- Для относительных дат: history_get(limit=50, date_filter="3 дня назад")

И кратко перескажите пользователю главное из истории диалога.

ПРИМЕР ОТВЕТА С ИСТОРИЕЙ:
"📚 История наших разговоров:

Сегодня в 14:30 вы спрашивали о создании задачи для разработчика.
Вчера в 10:15 мы обсуждали статус проекта "Обновление сайта".
2 дня назад вы создали задачу на проверку документации.

Всего найдено X сообщений в истории чата."

ВАЖНО: После вызова history_get:
1. Проанализируйте сообщения по времени
2. Группируйте по дням (сегодня, вчера, 2 дня назад, и т.д.)
3. Кратко опишите главные темы каждого дня
4. Если сообщений много, покажите только самые важные
5. Всегда указывайте общее количество найденных сообщений
6. Используйте поле grouped_by_day для удобной группировки по времени
7. Если получаете ошибку, попробуйте history_get(limit=10) для меньшего количества сообщений`;

      // 👇 САМЫЙ ВАЖНЫЙ МОМЕНТ: передаём ВСЕ схемы tools в run
      const ALL_TOOLS = [
        ...DRAFT_TOOLS_SCHEMAS,        // draft_get / draft_merge / draft_clear
        ...HISTORY_TOOLS_SCHEMAS,      // history_get
        ...BUSINESS_TOOL_SCHEMAS,      // create_task, list_tasks, report, send_telegram, reassign_task, ...
      ];

      // Запуск Run
      let run = await this.client.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        metadata: userMeta,
        additional_instructions,
        tools: ALL_TOOLS,              // ← ВАЖНО!
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

            // Логируем факт вызова tool (если БД доступна; ошибки — в warn)
            await this.safeLogMessage({
              chatId: userMeta.tg_chat_id,
              role: 'tool',
              content: name,
              meta: { args }
            });

            // Выбираем активное хранилище черновиков
            const store = this.useDb ? this.drafts : this.memDrafts;

            // Внутренние tools черновика
            if (name === 'draft_get') {
              let draft = null;
              try { draft = await store.get(userMeta.tg_chat_id); } catch (e) {
                log.warn('[AI] draft_get failed:', e?.message || e);
              }
              outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: draft || null, storage: this.useDb ? 'db' : 'memory' }) });
              continue;
            }
            if (name === 'draft_merge') {
              try {
                if (args && args.priority) args.priority = normalizePriority(args.priority);
                const merged = await store.merge(userMeta.tg_chat_id, args || {});
                outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, draft: merged, storage: this.useDb ? 'db' : 'memory' }) });
              } catch (e) {
                outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: String(e?.message || e) }) });
              }
              continue;
            }
            if (name === 'draft_clear') {
              try { await store.clear(userMeta.tg_chat_id); } catch (e) {
                log.warn('[AI] draft_clear failed:', e?.message || e);
              }
              outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, storage: this.useDb ? 'db' : 'memory' }) });
              continue;
            }

            // История (вечная память диалога)
            if (name === 'history_get') {
              if (!this.useDb) {
                outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: true, messages: [], note: 'history disabled (DB not available)' }) });
                continue;
              }
              try {
                // Безопасно извлекаем и валидируем аргументы
                const limit = Math.max(1, Math.min(100, Number(args?.limit) || 20));
                const order = (args?.order === 'asc' || args?.order === 'desc') ? args.order : 'desc';
                const dateFilter = args?.date_filter || null;
                const keywords = args?.keywords || null;
                
                console.log(`[DEBUG] history_get: args=${JSON.stringify(args)}, limit=${limit}, order=${order}, date_filter=${dateFilter}, keywords=${JSON.stringify(keywords)}`);
                
                let rows;
                if (keywords && Array.isArray(keywords) && keywords.length > 0) {
                  // Поиск по ключевым словам
                  rows = await getConversationByKeywords(userMeta.tg_chat_id, keywords, { limit, order });
                  console.log(`[DEBUG] history_get: поиск по ключевым словам ${JSON.stringify(keywords)}, найдено ${rows.length} сообщений`);
                } else {
                  // Обычный поиск по дате
                  rows = await getConversation(userMeta.tg_chat_id, { limit, order, date_filter: dateFilter });
                  console.log(`[DEBUG] history_get: найдено ${rows.length} сообщений для chat_id ${userMeta.tg_chat_id}${dateFilter ? ` с фильтром даты: ${dateFilter}` : ''}`);
                }
                
                // Форматируем сообщения для лучшего понимания (уменьшаем размер)
                const safe = rows.map(r => {
                  let content = r.content;
                  // Уменьшаем максимальную длину для лучшей обработки
                  if (typeof content === 'string' && content.length > 1000) {
                    content = content.slice(0, 1000) + '…(обрезано)';
                  }
                  
                  // Форматируем время для читаемости
                  let timeStr = '';
                  if (r.created_at) {
                    try {
                      const date = new Date(r.created_at);
                      const now = new Date();
                      const diffMs = now - date;
                      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      
                      if (diffDays > 0) {
                        timeStr = `${diffDays} дн. назад`;
                      } else if (diffHours > 0) {
                        timeStr = `${diffHours} ч. назад`;
                      } else {
                        timeStr = 'сегодня';
                      }
                    } catch (e) {
                      timeStr = r.created_at;
                    }
                  }
                  
                  return {
                    id: r.id,
                    role: r.role,
                    created_at: r.created_at,
                    time_ago: timeStr,
                    content: content
                  };
                });
                
                // Группируем сообщения по дням для лучшего понимания
                const groupedByDay = {};
                safe.forEach(msg => {
                  if (msg.time_ago) {
                    if (!groupedByDay[msg.time_ago]) {
                      groupedByDay[msg.time_ago] = [];
                    }
                    groupedByDay[msg.time_ago].push(msg);
                  }
                });
                
                // Создаем краткое резюме для ассистента
                const summary = `Найдено ${safe.length} сообщений в истории чата. Последние темы: ${safe.slice(0, 3).map(m => `${m.role}: ${m.content?.substring(0, 50)}...`).join('; ')}`;
                
                outputs.push({ tool_call_id: c.id, output: JSON.stringify({ 
                  ok: true, 
                  messages: safe,
                  grouped_by_day: groupedByDay,
                  summary: summary,
                  note: 'Используйте эту информацию для ответа пользователю о прошлых разговорах. Сообщения сгруппированы по дням для удобства.'
                }) });
                
                console.log(`[DEBUG] history_get: успешно отправлен результат для ${safe.length} сообщений`);
              } catch (e) {
                console.error(`[ERROR] history_get failed:`, e);
                outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: String(e?.message || e) }) });
              }
              continue;
            }

            // ACL для боевых tools
            if (userMeta.user_role !== 'manager' &&
                (name === 'create_task' || name === 'send_telegram' || name === 'reassign_task')) {
              outputs.push({ tool_call_id: c.id, output: JSON.stringify({ ok: false, error: 'ACCESS_DENIED_FOR_STAFF' }) });
              continue;
            }

            // Вызов Вашего ToolRouter (боевые действия)
            let result;
            try {
              result = await this.tools.route(name, args, {
                requesterChatId: userMeta.tg_chat_id,
                requesterEmployee: ctx?.employee
              });

              // Очистить черновик после успешного создания
              if (name === 'create_task' && result?.ok) {
                try { await store.clear(userMeta.tg_chat_id); } catch {}
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

      // Достаём последний ответ ассистента
      const messages = await this.client.beta.threads.messages.list(threadId, { order: 'desc', limit: 10 });
      const reply = messages.data?.find(m => m.role === 'assistant');
      const text = (reply?.content || []).filter(c => c.type === 'text').map(c => c.text?.value || '').join('\n').trim();

      // Логируем ответ ассистента (если БД доступна)
      await this.safeLogMessage({
        chatId: userMeta.tg_chat_id,
        role: 'assistant',
        content: text || '',
        meta: { threadId, runId }
      });

      return text || 'Нет ответа от ассистента.';
    } catch (err) {
      const http = err?.status || err?.response?.status;
      const body = err?.response?.data || err?.error || err?.message || err;
      return `Ошибка при обращении к ИИ-агенту${http ? ` (HTTP ${http})` : ''}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
    }
  }
}
