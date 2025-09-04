// // src/services/ReportScheduler.js
// import cron from 'node-cron';

// /**
//  * Настройка:
//  * - timezone: Asia/Dushanbe
//  * - каждые 5 минут
//  * - собирает статистику по задачам и дедлайнам
//  * - отправляет директору в Telegram
//  */

// const CLOSED = new Set(['Завершена', 'Отменена']);
// const OPEN   = (s) => !CLOSED.has(s || '');

// function fmtDate(d) {
//   if (!d) return '—';
//   const dt = new Date(d);
//   const pad = (n) => String(n).padStart(2, '0');
//   return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
// }

// function cutTelegram(text, limit = 3900) {
//   if (text.length <= limit) return text;
//   return text.slice(0, limit - 50) + '\n…(обрезано)';
// }

// function buildSummary(tasks) {
//   const total = tasks.length;
//   const byStatus = {};
//   for (const t of tasks) {
//     const s = t.status || '—';
//     byStatus[s] = (byStatus[s] || 0) + 1;
//   }
//   const line = Object.entries(byStatus)
//     .sort((a,b)=>b[1]-a[1])
//     .map(([s,c]) => `${s}: ${c}`).join(', ');
//   return { total, byStatus, line };
// }

// function calcDeadlineBuckets(tasks) {
//   const now = new Date();
//   const in24h = new Date(now.getTime() + 24*60*60*1000);

//   const overdue = [];
//   const due24h  = [];

//   for (const t of tasks) {
//     if (!t.deadline) continue;
//     const dl = new Date(t.deadline);
//     if (OPEN(t.status)) {
//       if (dl < now) overdue.push(t);
//       else if (dl <= in24h) due24h.push(t);
//     }
//   }

//   overdue.sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));
//   due24h.sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));

//   return { overdue, due24h };
// }

// function perEmployeeLines(tasks, employeesById) {
//   const map = new Map();
//   for (const t of tasks) {
//     const eid = t.employee_id || t.assignee_id || t.employeeId || 'unknown';
//     if (!map.has(eid)) map.set(eid, []);
//     map.get(eid).push(t);
//   }

//   const lines = [];
//   for (const [eid, list] of map.entries()) {
//     const emp = employeesById.get(String(eid)) || {};
//     const name = emp.name || `ID:${eid}`;
//     const { byStatus } = buildSummary(list);
//     const { overdue, due24h } = calcDeadlineBuckets(list);
//     const inWork = (byStatus['В работе'] || 0);
//     const onReview = (byStatus['На проверке'] || 0);

//     lines.push(`• ${name}: всего ${list.length}, В работе ${inWork}, На проверке ${onReview}, Просрочено ${overdue.length}, ≤24ч ${due24h.length}`);
//   }
//   return lines.sort();
// }

// function topList(title, arr, limit=8, employeesById) {
//   if (!arr.length) return '';
//   const rows = arr.slice(0, limit).map((t, i) => {
//     const emp = employeesById.get(String(t.employee_id)) || {};
//     const who = emp.name ? ` — ${emp.name}` : '';
//     const pr  = (t.priority || t.prioritet) ? ` [${t.priority || t.prioritet}]` : '';
//     return `${i+1}. ${fmtDate(t.deadline)} — ${t.task}${pr}${who} — ${t.status || '—'}`;
//   });
//   return `\n${title} (${arr.length}):\n` + rows.join('\n');
// }

// /* ---------- Загрузка данных через ToolRouter (фолбэк на api) ---------- */

// async function fetchEmployees(toolRouter, api) {
//   try {
//     if (toolRouter?.route) {
//       const r = await toolRouter.route('list_employees', {});
//       const emps = Array.isArray(r) ? r : (r?.employees || r?.items || []);
//       if (Array.isArray(emps)) return emps;
//     }
//   } catch (e) {
//     console.error('[ReportScheduler] list_employees via toolRouter failed:', e?.message || e);
//   }
//   if (api?.listEmployees) return await api.listEmployees();
//   return [];
// }

// async function fetchTasks(toolRouter, api) {
//   try {
//     if (toolRouter?.route) {
//       const r = await toolRouter.route('list_tasks', {});
//       const tasks = Array.isArray(r) ? r : (r?.tasks || r?.items || []);
//       if (Array.isArray(tasks)) return tasks;
//     }
//   } catch (e) {
//     console.error('[ReportScheduler] list_tasks via toolRouter failed:', e?.message || e);
//   }
//   if (api?.listTasks) return await api.listTasks({});
//   return [];
// }

// /**
//  * Собирает текст отчёта (через ToolRouter, фолбэк на api)
//  */
// async function buildReport({ toolRouter, api }) {
//   const [employees, tasks] = await Promise.all([
//     fetchEmployees(toolRouter, api),
//     fetchTasks(toolRouter, api)
//   ]);

//   if (!employees.length && !tasks.length) {
//     throw new Error('NO_DATA: ни сотрудников, ни задач не получилось получить');
//   }

//   const employeesById = new Map((employees || []).map(e => [String(e.employee_id || e.id), e]));
//   const now = new Date();
//   const header = `Отчёт по задачам — ${fmtDate(now)} (Asia/Dushanbe)`;

//   const { total, line } = buildSummary(tasks || []);
//   const { overdue, due24h } = calcDeadlineBuckets(tasks || []);
//   const perEmp = perEmployeeLines(tasks || [], employeesById);

//   let text = `${header}\n\nВсего задач: ${total}\nПо статусам: ${line}\nПросрочено: ${overdue.length}\nДедлайн ≤24ч: ${due24h.length}\n\nСотрудники:\n${perEmp.join('\n')}`;
//   text += topList('⚠️ Просроченные', overdue, 10, employeesById);
//   text += topList('⏱ Ближайшие ≤24ч', due24h, 10, employeesById);

//   return cutTelegram(text);
// }

// /**
//  * Находит директора:
//  * 1) по должности (job содержит "директор")
//  * 2) по имени "Муминов Бахтиёр"
//  * 3) из ENV.DIRECTOR_CHAT_ID (fallback)
//  */
// // function findDirectorChatIds(employees, envChatId) {
// //   const ids = new Set();
// //   for (const e of (employees || [])) {
// //     const job = String(e.job || '').toLowerCase();
// //     const name = String(e.name || '').toLowerCase();
// //     if (/директор/.test(job) || name.includes('муминов') || name.includes('бахтиёр')) {
// //       const cid = String(e.chat_id || '').trim(); // учитываем оба поля
// //       if (cid) ids.add(cid);
// //     }
// //   }
// //   if (!ids.size && envChatId) ids.add(String(envChatId));
// //   return Array.from(ids);
// // }

// function findDirectorChatIds(employees, envChatIds) {
//   const ids = new Set();
//   const envRaw = (envChatIds ?? '').toString().trim();
//   // 1) Если задано в ENV — используем сразу (поддержка нескольких ID через запятую/пробел)
//   if (envRaw) {
//     envRaw.split(/[,\s]+/).filter(Boolean).forEach(id => ids.add(id));
//     return Array.from(ids);
//   }
//   // 2) Иначе ищем директора по справочнику сотрудников
//   for (const e of (employees || [])) {
//     const job = String(e.job || '').toLowerCase();
//     const name = String(e.name || '').toLowerCase();
//     if (/директор/.test(job) || name.includes('муминов') || name.includes('бахтиёр')) {
//       const cid = String(e.chat_id || '').trim();
//       if (cid) ids.add(cid);
//     }
//   }
//   return Array.from(ids);
// }

// /**
//  * Отправляет отчёт директору(ам)
//  */
// async function deliverReport({ toolRouter, api, notifier, text }) {
//   const employees = await fetchEmployees(toolRouter, api);
//   // const directorChatIds = findDirectorChatIds(employees, process.env.DIRECTOR_CHAT_ID);
//   const directorChatIds = findDirectorChatIds(employees, process.env.DIRECTOR_CHAT_ID || ENV?.DIRECTOR_CHAT_ID);

//   if (!directorChatIds.length) {
//     throw new Error('DIRECTOR_NOT_FOUND: заполните chat_id/tg_user_id у директора или ENV.DIRECTOR_CHAT_ID');
//   }

//   for (const to of directorChatIds) {
//     // Предпочтительно через ToolRouter (уважает ACL send_telegram → manager)
//     if (toolRouter?.route) {
//       await toolRouter.route('send_telegram', { to, text }, {
//         requesterChatId: 'system',
//         requesterEmployee: { user_role: 'manager', name: 'System Scheduler' }
//       });
//     } else if (notifier?.sendMessage) {
//       // fallback напрямую через Notifier
//       await notifier.sendMessage(to, text);
//     }
//   }
// }

// /**
//  * Публичный запуск планировщика
//  */
// export function startDirectorHourlyReportScheduler({ api, toolRouter, notifier }) {
//   // Каждые 5 минут, таймзона Душанбе
//   const task = cron.schedule('*/5 * * * *', async () => {
//     try {
//       const text = await buildReport({ toolRouter, api });
//       await deliverReport({ toolRouter, api, notifier, text });
//       console.log('[ReportScheduler] sent at', new Date().toISOString());
//     } catch (e) {
//       console.error('[ReportScheduler] error:', e?.message || e);
//     }
//   }, { timezone: 'Asia/Dushanbe' });

//   task.start();
//   return task;
// }

// // Для ручного запуска (разово), удобно для теста:
// export async function runDirectorReportOnce({ api, toolRouter, notifier }) {
//   const text = await buildReport({ toolRouter, api });
//   await deliverReport({ toolRouter, api, notifier, text });
// }





// // src/services/ReportScheduler.js
// import cron from 'node-cron';
// import { ENV } from '../config/env.js';

// /**
//  * Настройка:
//  * - timezone: Asia/Dushanbe
//  * - каждые 5 минут
//  * - собирает статистику по задачам и дедлайнам
//  * - отправляет директору в Telegram
//  */

// const CLOSED = new Set(['Завершена', 'Отменена']);
// const OPEN   = (s) => !CLOSED.has(s || '');

// function fmtDate(d) {
//   if (!d) return '—';
//   const dt = new Date(d);
//   const pad = (n) => String(n).padStart(2, '0');
//   return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
// }

// function cutTelegram(text, limit = 3900) {
//   if (text.length <= limit) return text;
//   return text.slice(0, limit - 50) + '\n…(обрезано)';
// }

// function buildSummary(tasks) {
//   const total = tasks.length;
//   const byStatus = {};
//   for (const t of tasks) {
//     const s = t.status || '—';
//     byStatus[s] = (byStatus[s] || 0) + 1;
//   }
//   const line = Object.entries(byStatus)
//     .sort((a,b)=>b[1]-a[1])
//     .map(([s,c]) => `${s}: ${c}`).join(', ');
//   return { total, byStatus, line };
// }

// function calcDeadlineBuckets(tasks) {
//   const now = new Date();
//   const in24h = new Date(now.getTime() + 24*60*60*1000);

//   const overdue = [];
//   const due24h  = [];

//   for (const t of tasks) {
//     if (!t.deadline) continue;
//     const dl = new Date(t.deadline);
//     if (OPEN(t.status)) {
//       if (dl < now) overdue.push(t);
//       else if (dl <= in24h) due24h.push(t);
//     }
//   }

//   overdue.sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));
//   due24h.sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));

//   return { overdue, due24h };
// }

// function perEmployeeLines(tasks, employeesById) {
//   // группируем
//   const map = new Map();
//   for (const t of tasks) {
//     const eid = String(t.employee_id || t.assignee_id || t.employeeId || 'unknown');
//     if (!map.has(eid)) map.set(eid, []);
//     map.get(eid).push(t);
//   }

//   // сортировка: сначала те, у кого больше просрочек, затем по имени
//   const entries = Array.from(map.entries()).map(([eid, list]) => {
//     const emp = employeesById.get(String(eid)) || {};
//     const name = emp.name || (eid === 'unknown' ? 'Без исполнителя' : `ID:${eid}`);
//     const { overdue } = calcDeadlineBuckets(list);
//     return { eid, list, name, overdueCount: overdue.length };
//   });

//   entries.sort((a, b) => {
//     if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
//     return a.name.localeCompare(b.name, 'ru');
//   });

//   // отрисовка
//   const out = [];
//   for (const { eid, list, name } of entries) {
//     const emp = employeesById.get(String(eid)) || {};
//     const { byStatus } = buildSummary(list);
//     const { overdue, due24h } = calcDeadlineBuckets(list);
//     const inWork = (byStatus['В работе'] || 0);
//     const onReview = (byStatus['На проверке'] || 0);

//     let block = `• ${name}${emp.job ? ` (${emp.job})` : ''}: всего ${list.length} | в работе ${inWork} | на проверке ${onReview} | просрочено ${overdue.length} | ≤24ч ${due24h.length}`;
//     if (overdue.length) {
//       block += `\n   ├─ Просроченные (${Math.min(3, overdue.length)} из ${overdue.length}):\n` +
//         overdue.slice(0, 3)
//           .map((t, i) => `   ${i + 1}. ${fmtDate(t.deadline)} — ${t.task}${t.priority || t.prioritet ? ` [${t.priority || t.prioritet}]` : ''}`)
//           .join('\n');
//     }
//     if (due24h.length) {
//       block += `\n   └─ ≤24ч (${Math.min(3, due24h.length)} из ${due24h.length}):\n` +
//         due24h.slice(0, 3)
//           .map((t, i) => `   ${i + 1}. ${fmtDate(t.deadline)} — ${t.task}${t.priority || t.prioritet ? ` [${t.priority || t.prioritet}]` : ''}`)
//           .join('\n');
//     }
//     out.push(block);
//   }
//   return out;
// }

// function topList(title, arr, limit=8, employeesById) {
//   if (!arr.length) return '';
//   const rows = arr.slice(0, limit).map((t, i) => {
//     const emp = employeesById.get(String(t.employee_id)) || {};
//     const who = emp.name ? ` — ${emp.name}` : '';
//     const pr  = (t.priority || t.prioritet) ? ` [${t.priority || t.prioritet}]` : '';
//     return `${i+1}. ${fmtDate(t.deadline)} — ${t.task}${pr}${who} — ${t.status || '—'}`;
//   });
//   return `\n${title} (${arr.length}):\n` + rows.join('\n');
// }

// /* ---------- Загрузка данных через ToolRouter (фолбэк на api) ---------- */

// async function fetchEmployees(toolRouter, api) {
//   try {
//     if (toolRouter?.route) {
//       const r = await toolRouter.route('list_employees', {});
//       const emps = Array.isArray(r) ? r : (r?.employees || r?.items || []);
//       if (Array.isArray(emps)) return emps;
//     }
//   } catch (e) {
//     console.error('[ReportScheduler] list_employees via toolRouter failed:', e?.message || e);
//   }
//   if (api?.listEmployees) return await api.listEmployees();
//   return [];
// }

// async function fetchTasks(toolRouter, api) {
//   try {
//     if (toolRouter?.route) {
//       const r = await toolRouter.route('list_tasks', {});
//       const tasks = Array.isArray(r) ? r : (r?.tasks || r?.items || []);
//       if (Array.isArray(tasks)) return tasks;
//     }
//   } catch (e) {
//     console.error('[ReportScheduler] list_tasks via toolRouter failed:', e?.message || e);
//   }
//   if (api?.listTasks) return await api.listTasks({});
//   return [];
// }

// /* ---------- Восстановление связи задача ↔ сотрудник ---------- */

// function resolveEmployeeIdForTask(t, employees) {
//   // 1) Явный employee_id
//   const eidRaw = String(t.employee_id ?? '').trim();
//   if (eidRaw) {
//     const exists = employees.some(e => String(e.employee_id || e.id) === eidRaw);
//     if (exists) return eidRaw;
//   }
//   // 2) По tg_user_id/chat_id
//   const tg = String(t.tg_user_id ?? '').trim();
//   if (tg) {
//     const byTg = employees.find(e => String(e.tg_user_id || e.chat_id || '') === tg);
//     if (byTg) return String(byTg.employee_id || byTg.id);
//   }
//   // 3) По имени (assignee)
//   const an = String(t.assignee ?? '').trim().toLowerCase();
//   if (an) {
//     const byName = employees.find(e => String(e.name || '').trim().toLowerCase() === an);
//     if (byName) return String(byName.employee_id || byName.id);
//   }
//   // 4) Не нашли
//   return 'unknown';
// }

// function enrichTasksWithEmployees(tasks, employees) {
//   return (tasks || []).map(t => {
//     const eid = resolveEmployeeIdForTask(t, employees);
//     return { ...t, employee_id: eid };
//   });
// }

// /* ---------- Построение отчёта ---------- */

// /**
//  * Собирает текст отчёта (через ToolRouter, фолбэк на api)
//  */
// async function buildReport({ toolRouter, api }) {
//   const [employees, tasks] = await Promise.all([
//     fetchEmployees(toolRouter, api),
//     fetchTasks(toolRouter, api)
//   ]);

//   if (!employees.length && !tasks.length) {
//     throw new Error('NO_DATA: ни сотрудников, ни задач не получилось получить');
//   }

//   const employeesById = new Map((employees || []).map(e => [String(e.employee_id || e.id), e]));
//   const tasksFixed = enrichTasksWithEmployees(tasks || [], employees || []);

//   const now = new Date();
//   const header = `📊 Отчёт по задачам — ${fmtDate(now)} (Asia/Dushanbe)`;

//   const { total, line } = buildSummary(tasksFixed);
//   const { overdue, due24h } = calcDeadlineBuckets(tasksFixed);
//   const perEmp = perEmployeeLines(tasksFixed, employeesById);

//   let text =
// `${header}

// ИТОГО:
// • Всего: ${total}
// • По статусам: ${line}
// • Просрочено: ${overdue.length}
// • ≤24ч: ${due24h.length}

// ПО СОТРУДНИКАМ:
// ${perEmp.join('\n')}
// `;

//   if (overdue.length) text += topList('⚠️ Общие просроченные', overdue, 8, employeesById);
//   if (due24h.length)  text += topList('⏱ Общие ≤24ч', due24h, 8, employeesById);

//   return cutTelegram(text);
// }

// /* ---------- Получатели отчёта (директора) ---------- */

// /**
//  * Находит директора:
//  * 1) из ENV.DIRECTOR_CHAT_ID (поддержка нескольких ID через запятую/пробел)
//  * 2) иначе по справочнику сотрудников: job содержит "директор" или имя "Муминов Бахтиёр"
//  */
// function findDirectorChatIds(employees, envChatIds) {
//   const ids = new Set();
//   const envRaw = (envChatIds ?? '').toString().trim();
//   if (envRaw) {
//     envRaw.split(/[,\s]+/).filter(Boolean).forEach(id => ids.add(id));
//     return Array.from(ids);
//   }
//   for (const e of (employees || [])) {
//     const job = String(e.job || '').toLowerCase();
//     const name = String(e.name || '').toLowerCase();
//     if (/директор/.test(job) || name.includes('муминов') || name.includes('бахтиёр')) {
//       const cid = String(e.chat_id || '').trim();
//       if (cid) ids.add(cid);
//     }
//   }
//   return Array.from(ids);
// }

// /**
//  * Отправляет отчёт директору(ам)
//  */
// async function deliverReport({ toolRouter, api, notifier, text }) {
//   const employees = await fetchEmployees(toolRouter, api);
//   const directorChatIds = findDirectorChatIds(
//     employees,
//     process.env.DIRECTOR_CHAT_ID || ENV?.DIRECTOR_CHAT_ID
//   );

//   if (!directorChatIds.length) {
//     throw new Error('DIRECTOR_NOT_FOUND: заполните chat_id/tg_user_id у директора или ENV.DIRECTOR_CHAT_ID');
//   }

//   for (const to of directorChatIds) {
//     if (toolRouter?.route) {
//       await toolRouter.route('send_telegram', { to, text }, {
//         requesterChatId: 'system',
//         requesterEmployee: { user_role: 'manager', name: 'System Scheduler' }
//       });
//     } else if (notifier?.sendMessage) {
//       await notifier.sendMessage(to, text);
//     } else if (notifier?.sendText) {
//       await notifier.sendText(to, text);
//     }
//   }
// }

// /* ---------- Публичные функции ---------- */

// /**
//  * Запуск планировщика: каждые 5 минут, таймзона Душанбе
//  */
// export function startDirectorHourlyReportScheduler({ api, toolRouter, notifier }) {
//   // const task = cron.schedule('*/5 * * * *', async () => {
//   const task = cron.schedule('0 * * * *', async () => {
//     try {
//       const text = await buildReport({ toolRouter, api });
//       await deliverReport({ toolRouter, api, notifier, text });
//       console.log('[ReportScheduler] sent at', new Date().toISOString());
//     } catch (e) {
//       console.error('[ReportScheduler] error:', e?.message || e);
//     }
//   }, { timezone: 'Asia/Dushanbe' });

//   task.start();
//   return task;
// }

// // Для ручного запуска (разово), удобно для теста:
// export async function runDirectorReportOnce({ api, toolRouter, notifier }) {
//   const text = await buildReport({ toolRouter, api });
//   await deliverReport({ toolRouter, api, notifier, text });
// }



// src/services/ReportScheduler.js
import cron from 'node-cron';
import { ENV } from '../config/env.js';
import { ExplanatoryService } from './ExplanatoryService.js';

/**
 * Настройка:
 * - timezone: Asia/Dushanbe
 * - директорский отчёт: каждый час (0 * * * *)
 * - напоминания сотрудникам: каждые 5 минут (*/

const CLOSED = new Set(['Завершена', 'Отменена']);
const OPEN   = (s) => !CLOSED.has((s || '').trim());

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function cutTelegram(text, limit = 3900) {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 50) + '\n…(обрезано)';
}

function buildSummary(tasks) {
  const total = tasks.length;
  const byStatus = {};
  for (const t of tasks) {
    const s = (t.status || '—').trim();
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const line = Object.entries(byStatus)
    .sort((a,b)=>b[1]-a[1])
    .map(([s,c]) => `${s}: ${c}`).join(', ');
  return { total, byStatus, line };
}

function calcDeadlineBuckets(tasks) {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24*60*60*1000);

  const overdue = [];
  const due24h  = [];

  for (const t of tasks) {
    if (!t.deadline) continue;
    const dl = new Date(t.deadline);
    if (OPEN(t.status)) {
      if (dl < now) overdue.push(t);
      else if (dl <= in24h) due24h.push(t);
    }
  }

  overdue.sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));
  due24h.sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));

  return { overdue, due24h };
}

function perEmployeeLines(tasks, employeesById) {
  // группируем
  const map = new Map();
  for (const t of tasks) {
    const eid = String(t.employee_id || t.assignee_id || t.employeeId || 'unknown');
    if (!map.has(eid)) map.set(eid, []);
    map.get(eid).push(t);
  }

  // сортировка: сначала у кого больше просрочек, затем по имени
  const entries = Array.from(map.entries()).map(([eid, list]) => {
    const emp = employeesById.get(String(eid)) || {};
    const name = emp.name || (eid === 'unknown' ? 'Без исполнителя' : `ID:${eid}`);
    const { overdue } = calcDeadlineBuckets(list);
    return { eid, list, name, overdueCount: overdue.length };
  });

  entries.sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
    return a.name.localeCompare(b.name, 'ru');
  });

  // отрисовка
  const out = [];
  for (const { eid, list, name } of entries) {
    const emp = employeesById.get(String(eid)) || {};
    const { byStatus } = buildSummary(list);
    const { overdue, due24h } = calcDeadlineBuckets(list);
    const inWork = (byStatus['В работе'] || 0);
    const onReview = (byStatus['На проверке'] || 0);

    let block = `• ${name}${emp.job ? ` (${emp.job})` : ''}: всего ${list.length} | в работе ${inWork} | на проверке ${onReview} | просрочено ${overdue.length} | ≤24ч ${due24h.length}`;
    if (overdue.length) {
      block += `\n   ├─ Просроченные (${Math.min(3, overdue.length)} из ${overdue.length}):\n` +
        overdue.slice(0, 3)
          .map((t, i) => `   ${i + 1}. ${fmtDate(t.deadline)} — ${t.task}${t.priority || t.prioritet ? ` [${t.priority || t.prioritet}]` : ''}`)
          .join('\n');
    }
    if (due24h.length) {
      block += `\n   └─ ≤24ч (${Math.min(3, due24h.length)} из ${due24h.length}):\n` +
        due24h.slice(0, 3)
          .map((t, i) => `   ${i + 1}. ${fmtDate(t.deadline)} — ${t.task}${t.priority || t.prioritet ? ` [${t.priority || t.prioritet}]` : ''}`)
          .join('\n');
    }
    out.push(block);
  }
  return out;
}

function topList(title, arr, limit=8, employeesById) {
  if (!arr.length) return '';
  const rows = arr.slice(0, limit).map((t, i) => {
    const emp = employeesById.get(String(t.employee_id)) || {};
    const who = emp.name ? ` — ${emp.name}` : '';
    const pr  = (t.priority || t.prioritet) ? ` [${t.priority || t.prioritet}]` : '';
    return `${i+1}. ${fmtDate(t.deadline)} — ${t.task}${pr}${who} — ${t.status || '—'}`;
  });
  return `\n${title} (${arr.length}):\n` + rows.join('\n');
}

/* ---------- Загрузка данных ---------- */

async function fetchEmployees(toolRouter, api) {
  try {
    if (toolRouter?.route) {
      const r = await toolRouter.route('list_employees', {});
      const emps = Array.isArray(r) ? r : (r?.employees || r?.items || []);
      if (Array.isArray(emps)) return emps;
    }
  } catch (e) {
    console.error('[ReportScheduler] list_employees via toolRouter failed:', e?.message || e);
  }
  if (api?.listEmployees) return await api.listEmployees();
  return [];
}

async function fetchTasks(toolRouter, api) {
  try {
    // Для отчетов используем API напрямую, а не ToolRouter
    if (api?.get) {
      const tasks = await api.get('tasks');
      if (Array.isArray(tasks)) {
        console.log(`[ReportScheduler] Получено ${tasks.length} задач из API`);
        return tasks;
      }
    }
  } catch (e) {
    console.error('[ReportScheduler] Получение задач из API failed:', e?.message || e);
  }
  
  // Fallback через ToolRouter
  try {
    if (toolRouter?.route) {
      // Для директора передаем специальный контекст, чтобы он видел все задачи
      const directorContext = {
        requesterChatId: process.env.DIRECTOR_CHAT_ID,
        requesterEmployee: { user_role: 'manager' } // Принудительно устанавливаем роль manager
      };
      const r = await toolRouter.route('list_tasks', {}, directorContext);
      const tasks = Array.isArray(r) ? r : (r?.tasks || r?.items || []);
      if (Array.isArray(tasks)) return tasks;
    }
  } catch (e) {
    console.error('[ReportScheduler] list_tasks via toolRouter failed:', e?.message || e);
  }
  
  return [];
}

/* ---------- Восстановление связи задача ↔ сотрудник ---------- */

function resolveEmployeeIdForTask(t, employees) {
  // 1) Явный employee_id
  const eidRaw = String(t.employee_id ?? '').trim();
  if (eidRaw) {
    const exists = employees.some(e => String(e.employee_id || e.id) === eidRaw);
    if (exists) return eidRaw;
  }
  // 2) По tg_user_id/chat_id
  const tg = String(t.tg_user_id ?? t.chat_id ?? '').trim();
  if (tg) {
    const byTg = employees.find(e => String(e.tg_user_id || e.chat_id || '') === tg);
    if (byTg) return String(byTg.employee_id || byTg.id);
  }
  // 3) По имени (assignee)
  const an = String(t.assignee ?? '').trim().toLowerCase();
  if (an) {
    const byName = employees.find(e => String(e.name || '').trim().toLowerCase() === an);
    if (byName) return String(byName.employee_id || byName.id);
  }
  // 4) Не нашли
  return 'unknown';
}

function enrichTasksWithEmployees(tasks, employees) {
  return (tasks || []).map(t => {
    const eid = resolveEmployeeIdForTask(t, employees);
    return { ...t, employee_id: eid };
  });
}

/* ---------- Диаграммы и объяснительные ---------- */

/**
 * Создает текстовую диаграмму для статистики задач
 */
function createTaskStatusDiagram(tasks) {
  const statusCounts = {};
  for (const task of tasks) {
    const status = task.status || 'Неизвестно';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  const total = tasks.length;
  if (total === 0) return '📊 Диаграмма статусов:\n(нет данных)';

  const maxBarLength = 20;
  let diagram = '📊 Диаграмма статусов:\n';
  
  for (const [status, count] of Object.entries(statusCounts)) {
    const percentage = Math.round((count / total) * 100);
    const barLength = Math.round((count / total) * maxBarLength);
    const bar = '█'.repeat(barLength) + '░'.repeat(maxBarLength - barLength);
    diagram += `${status}: ${bar} ${count} (${percentage}%)\n`;
  }

  return diagram;
}

/**
 * Создает диаграмму просрочек по сотрудникам
 */
function createOverdueDiagram(overdueTasks, employeesById) {
  if (overdueTasks.length === 0) return '';

  const employeeOverdue = {};
  for (const task of overdueTasks) {
    const empId = String(task.employee_id || 'unknown');
    const emp = employeesById.get(empId) || { name: `ID:${empId}` };
    const name = emp.name || `ID:${empId}`;
    employeeOverdue[name] = (employeeOverdue[name] || 0) + 1;
  }

  const maxBarLength = 15;
  const maxOverdue = Math.max(...Object.values(employeeOverdue));
  
  let diagram = '\n⚠️ Просрочки по сотрудникам:\n';
  for (const [name, count] of Object.entries(employeeOverdue)) {
    const barLength = Math.round((count / maxOverdue) * maxBarLength);
    const bar = '🔴'.repeat(barLength) + '⚪'.repeat(maxBarLength - barLength);
    diagram += `${name}: ${bar} ${count}\n`;
  }

  return diagram;
}

/**
 * Запрашивает объяснительные у сотрудников с просроченными задачами
 */
async function requestExplanationsForOverdueTasks(overdueTasks, employeesById, explanatoryService) {
  const requests = [];
  
  for (const task of overdueTasks) {
    const empId = String(task.employee_id || 'unknown');
    if (empId === 'unknown') continue;
    
    const emp = employeesById.get(empId);
    if (!emp || !emp.chat_id) continue;

    try {
      const explanationId = await explanatoryService.requestExplanation(
        task.task_id,
        empId,
        task.task,
        task.deadline
      );
      requests.push({ task, employee: emp, explanationId });
    } catch (error) {
      console.error(`[ReportScheduler] Ошибка запроса объяснительной для задачи ${task.task_id}:`, error.message);
    }
  }

  return requests;
}

/**
 * Отправляет уведомления сотрудникам о необходимости объяснительных
 */
async function notifyEmployeesAboutExplanations(requests, toolRouter, notifier) {
  for (const { task, employee, explanationId } of requests) {
    const message = `⚠️ ТРЕБУЕТСЯ ОБЪЯСНИТЕЛЬНАЯ

Задача: ${task.task}
Дедлайн: ${fmtDate(task.deadline)}
Статус: Просрочена

Пожалуйста, предоставьте объяснение причин просрочки.
Используйте команду: /explanation ${explanationId} [ваш текст объяснения]

Пример: /explanation ${explanationId} Задержка произошла из-за технических проблем с сервером.`;

    try {
      if (toolRouter?.route) {
        await toolRouter.route('send_telegram', { 
          to: employee.chat_id, 
          text: message 
        }, {
          requesterChatId: 'system',
          requesterEmployee: { user_role: 'manager', name: 'System Scheduler' }
        });
      } else if (notifier?.sendMessage) {
        await notifier.sendMessage(employee.chat_id, message);
      }
    } catch (error) {
      console.error(`[ReportScheduler] Ошибка отправки уведомления сотруднику ${employee.name}:`, error.message);
    }
  }
}

/* ---------- Директорский отчёт ---------- */

async function buildReport({ toolRouter, api, explanatoryService, notifier }) {
  const [employees, tasks] = await Promise.all([
    fetchEmployees(toolRouter, api),
    fetchTasks(toolRouter, api)
  ]);

  if (!employees.length && !tasks.length) {
    throw new Error('NO_DATA: ни сотрудников, ни задач не получилось получить');
  }

  const employeesById = new Map((employees || []).map(e => [String(e.employee_id || e.id), e]));
  const tasksFixed = enrichTasksWithEmployees(tasks || [], employees || []);

  const now = new Date();
  const header = `📊 Отчёт по задачам — ${fmtDate(now)} (Asia/Dushanbe)`;

  const { total, line } = buildSummary(tasksFixed);
  const { overdue, due24h } = calcDeadlineBuckets(tasksFixed);
  const perEmp = perEmployeeLines(tasksFixed, employeesById);

  // Создаем диаграммы
  const statusDiagram = createTaskStatusDiagram(tasksFixed);
  const overdueDiagram = createOverdueDiagram(overdue, employeesById);

  // Запрашиваем объяснительные для просроченных задач
  let explanationRequests = [];
  if (overdue.length > 0 && explanatoryService) {
    try {
      explanationRequests = await requestExplanationsForOverdueTasks(overdue, employeesById, explanatoryService);
      console.log(`[ReportScheduler] Создано ${explanationRequests.length} запросов объяснительных`);
      
      // Отправляем уведомления сотрудникам о необходимости объяснительных
      if (explanationRequests.length > 0) {
        await notifyEmployeesAboutExplanations(explanationRequests, toolRouter, notifier);
        console.log(`[ReportScheduler] Отправлено ${explanationRequests.length} уведомлений сотрудникам`);
      }
    } catch (error) {
      console.error('[ReportScheduler] Ошибка создания запросов объяснительных:', error.message);
    }
  }

  let text =
`${header}

ИТОГО:
• Всего: ${total}
• По статусам: ${line}
• Просрочено: ${overdue.length}
• ≤24ч: ${due24h.length}

${statusDiagram}
${overdueDiagram}

ПО СОТРУДНИКАМ:
${perEmp.join('\n')}
`;

  if (overdue.length) text += topList('⚠️ Общие просроченные', overdue, 8, employeesById);
  if (due24h.length)  text += topList('⏱ Общие ≤24ч', due24h, 8, employeesById);

  // Добавляем информацию об объяснительных
  if (explanationRequests.length > 0) {
    text += `\n📝 ОБЪЯСНИТЕЛЬНЫЕ:\n`;
    text += `• Запрошено объяснительных: ${explanationRequests.length}\n`;
    text += `• Уведомления отправлены сотрудникам\n`;
    text += `• Ожидается рассмотрение директором\n`;
  }

  return cutTelegram(text);
}

/* ---------- Получатели отчёта (директора) ---------- */

function findDirectorChatIds(employees, envChatIds) {
  const ids = new Set();
  const envRaw = (envChatIds ?? '').toString().trim();
  if (envRaw) {
    envRaw.split(/[,\s]+/).filter(Boolean).forEach(id => ids.add(id));
    return Array.from(ids);
  }
  for (const e of (employees || [])) {
    const job = String(e.job || '').toLowerCase();
    const name = String(e.name || '').toLowerCase();
    if (/директор/.test(job) || name.includes('муминов') || name.includes('бахтиёр')) {
      const cid = String(e.chat_id || '').trim();
      if (cid) ids.add(cid);
    }
  }
  return Array.from(ids);
}

async function deliverReport({ toolRouter, api, notifier, text }) {
  const employees = await fetchEmployees(toolRouter, api);
  const directorChatIds = findDirectorChatIds(
    employees,
    process.env.DIRECTOR_CHAT_ID || ENV?.DIRECTOR_CHAT_ID
  );

  if (!directorChatIds.length) {
    throw new Error('DIRECTOR_NOT_FOUND: заполните chat_id/tg_user_id у директора или ENV.DIRECTOR_CHAT_ID');
  }

  for (const to of directorChatIds) {
    try {
      if (toolRouter?.route) {
        await toolRouter.route('send_telegram', { to: toNumericIfPossible(to), text }, {
          requesterChatId: 'system',
          requesterEmployee: { user_role: 'manager', name: 'System Scheduler' }
        });
      } else if (notifier?.sendMessage) {
        await notifier.sendMessage(toNumericIfPossible(to), text);
      } else if (notifier?.sendText) {
        await notifier.sendText(toNumericIfPossible(to), text);
      } else {
        console.error('[ReportScheduler] deliverReport: no sender available');
      }
    } catch (e) {
      console.error('[ReportScheduler] deliverReport failed:', e?.message || e);
    }
  }
}

/* ---------- Напоминания сотрудникам ---------- */

// helper: "879574025" -> 879574025 (если число), иначе строка
function toNumericIfPossible(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : s;
  }
  return s;
}

/**
 * Формирует текст-напоминание для конкретного сотрудника по его активным задачам
 * — добавлен список «Активные задачи (топ N)» на случай, если нет просрочек/≤24ч
 */
function buildAssigneeReminderText(emp, tasks) {
  const name = emp?.name || 'Коллега';
  // только активные (на входе уже активные)
  const active = tasks.filter(t => OPEN(t.status));
  const { total, line } = buildSummary(active);
  const { overdue, due24h } = calcDeadlineBuckets(active);

  // топ активных по дедлайну
  const activeSorted = [...active].sort((a,b) => {
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return ad - bd;
  });

  let text =
`👋 ${name}, у Вас активных задач: ${total}
• По статусам: ${line}
• Просрочено: ${overdue.length}
• ≤24ч: ${due24h.length}

Пожалуйста, ускорьте закрытие задач, особенно просроченных и с ближайшими дедлайнами.`;

  if (overdue.length) {
    const rows = overdue.slice(0, 5).map((t, i) => {
      const pr = (t.priority || t.prioritet) ? ` [${t.priority || t.prioritet}]` : '';
      return `${i + 1}. ${fmtDate(t.deadline)} — ${t.task}${pr}`;
    }).join('\n');
    text += `\n\n⚠️ Просроченные (${overdue.length}):\n${rows}`;
  }

  if (due24h.length) {
    const rows = due24h.slice(0, 5).map((t, i) => {
      const pr = (t.priority || t.prioritet) ? ` [${t.priority || t.prioritet}]` : '';
      return `${i + 1}. ${fmtDate(t.deadline)} — ${t.task}${pr}`;
    }).join('\n');
    text += `\n\n⏱ Дедлайн ≤24ч (${due24h.length}):\n${rows}`;
  }

  // Если нет ни просроченных, ни ≤24ч — всё равно покажем список активных
  if (!overdue.length && !due24h.length && activeSorted.length) {
    const rows = activeSorted.slice(0, 7).map((t, i) => {
      const pr = (t.priority || t.prioritet) ? ` [${t.priority || t.prioritet}]` : '';
      const dl = t.deadline ? fmtDate(t.deadline) : '—';
      return `${i + 1}. ${dl} — ${t.task}${pr} — ${t.status || '—'}`;
    }).join('\n');
    text += `\n\n🗂 Активные задачи (топ ${Math.min(7, activeSorted.length)}):\n${rows}`;
  }

  return cutTelegram(text);
}

/**
 * Группирует активные задачи по сотрудникам (без завершённых/отменённых)
 */
function groupOpenTasksByEmployee(tasks, employees) {
  const employeesById = new Map((employees || []).map(e => [String(e.employee_id || e.id), e]));
  const map = new Map();
  for (const t of tasks) {
    if (!OPEN(t.status)) continue;
    const eid = String(t.employee_id || t.assignee_id || t.employeeId || resolveEmployeeIdForTask(t, employees) || 'unknown');
    if (!map.has(eid)) map.set(eid, []);
    map.get(eid).push(t);
  }
  return { buckets: map, employeesById };
}

/**
 * Рассылает личные напоминания сотрудникам по активным задачам
 */
async function deliverAssigneeReminders({ toolRouter, api, notifier }) {
  const [employees, rawTasks] = await Promise.all([
    fetchEmployees(toolRouter, api),
    fetchTasks(toolRouter, api)
  ]);

  if (!employees.length || !rawTasks.length) {
    console.warn('[ReportScheduler] reminders: skip — employees:', employees.length, 'tasks:', rawTasks.length);
    return;
  }

  const tasks = enrichTasksWithEmployees(rawTasks, employees);
  const { buckets, employeesById } = groupOpenTasksByEmployee(tasks, employees);

  let totalCandidates = 0;
  let sent = 0;
  let skippedNoEmp = 0;
  let skippedNoChat = 0;
  let failed = 0;

  for (const [eid, list] of buckets.entries()) {
    totalCandidates++;
    const emp = employeesById.get(String(eid));
    if (!emp) {
      skippedNoEmp++;
      console.warn('[ReportScheduler] reminders: skip (no employee in map) eid=', eid);
      continue;
    }
    const rawTo = String(emp.tg_user_id || emp.chat_id || '').trim();
    if (!rawTo) {
      skippedNoChat++;
      console.warn('[ReportScheduler] reminders: skip (no chat_id) eid=', eid, 'name=', emp.name);
      continue;
    }
    const to = toNumericIfPossible(rawTo);
    const text = buildAssigneeReminderText(emp, list);

    try {
      if (toolRouter?.route) {
        await toolRouter.route('send_telegram', { to, text }, {
          requesterChatId: 'system',
          requesterEmployee: { user_role: 'manager', name: 'System Scheduler' }
        });
        sent++;
      } else if (notifier?.sendMessage) {
        await notifier.sendMessage(to, text);
        sent++;
      } else if (notifier?.sendText) {
        await notifier.sendText(to, text);
        sent++;
      } else {
        failed++;
        console.error('[ReportScheduler] reminders: no sender available (toolRouter/notifier missing)');
      }
    } catch (e) {
      failed++;
      console.error(`[ReportScheduler] assignee reminder failed for ${emp.name || eid}:`, e?.message || e);
    }
  }

  console.info('[ReportScheduler] reminders summary:', {
    employees: employees.length,
    openTaskHolders: totalCandidates,
    sent,
    skippedNoEmp,
    skippedNoChat,
    failed
  });
}

/* ---------- Публичные функции ---------- */

/**
 * Почасовой отчёт для директора(ов) + лог
 */
export function startDirectorHourlyReportScheduler({ api, toolRouter, notifier, explanatoryService }) {
  const task = cron.schedule('0 * * * *', async () => {
    try {
      const text = await buildReport({ toolRouter, api, explanatoryService, notifier });
      await deliverReport({ toolRouter, api, notifier, text });
      console.log('[ReportScheduler] director report sent at', new Date().toISOString());
    } catch (e) {
      console.error('[ReportScheduler] error (director):', e?.message || e);
    }
  }, { timezone: 'Asia/Dushanbe' });

  task.start();
  return task;
}

/**
 * Напоминания сотрудникам — КАЖДЫЕ 5 МИНУТ
 */
export function startAssigneeReminderScheduler5min({ api, toolRouter, notifier }) {
  const task = cron.schedule('0 * * * *', async () => {
    try {
      await deliverAssigneeReminders({ toolRouter, api, notifier });
      console.log('[ReportScheduler] assignee reminders sent at', new Date().toISOString());
    } catch (e) {
      console.error('[ReportScheduler] error (assignees):', e?.message || e);
    }
  }, { timezone: 'Asia/Dushanbe' });

  task.start();
  return task;
}

// Для ручного запуска (разово)
export async function runDirectorReportOnce({ api, toolRouter, notifier, explanatoryService }) {
  const text = await buildReport({ toolRouter, api, explanatoryService, notifier });
  await deliverReport({ toolRouter, api, notifier, text });
}

export async function runAssigneeRemindersOnce({ api, toolRouter, notifier }) {
  await deliverAssigneeReminders({ toolRouter, api, notifier });
}
