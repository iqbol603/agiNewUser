// import { EmployeesService } from './EmployeesService.js';
// import { ApiClient } from './ApiClient.js';
// import { Notifier } from './Notifier.js';
// import { parseHumanDateRu, toDbDateTime } from '../utils/datetime.js';

// const norm = (s) => String(s || '').trim().toLowerCase();

// const mapTaskRow = (t, employeesById = new Map()) => {
// 	const emp = employeesById.get(t.employee_id) || null;
// 	return {
// 		id: t.task_id,
// 		task: t.task,
// 		description: t.description || '',
// 		assignee: emp?.name || t.employee_id,
// 		deadline: t.deadline || null,
// 		status: t.status || null,
// 		priority: t.prioritet || null,
// 		tg_user_id: emp?.tg_user_id || null
// 	};
// };

// export class ToolRouter {
// 	constructor({ api, employees, notifier } = {}) {
// 		this.api = api || new ApiClient();
// 		this.employees = employees || new EmployeesService(this.api);
// 		this.notifier = notifier;
// 	}

// 	async route(name, args, ctx = {}) {
// 		const A = { ...(args || {}) };
// 		const requesterChatId = String(ctx?.requesterChatId || '');

// 		// ---- ЗАДАЧИ ----
// 		if (name === 'create_task') {
// 			console.log('action', A);
			
// 			if (!A.assigneeName && A.assignee) A.assigneeName = A.assignee;
// 			if (typeof A.desc === 'undefined') A.desc = '';
// 			if (typeof A.deadline === 'undefined') A.deadline = '';
// 			if (!A.priority) A.priority = 'Средний';

// 			// резолвим ассайни
// 			const { match } = await this.employees.resolveByName(A.assigneeName);
// 			const assignee = match;
// 			const employee_id = assignee?.id || null;

// 			let deadline = String(A.deadline || '').trim();

// 			// чеким время дедлайна
// 			if (deadline) {
// 				const parsed = parseHumanDateRu(deadline, new Date());
// 				if (parsed) deadline = toDbDateTime(parsed); // "YYYY-MM-DD HH:mm:00"
// 			}

// 			const payload = {
// 				task: String(A.title || '').trim(),
// 				employee_id,
// 				description: String(A.desc || '').trim(),
// 				deadline,
// 				status: 'новая',
// 				prioritet: String(A.priority || '').trim(),
// 			};

// 			const created = await this.api.add('tasks', payload);
// 			const taskId = created?.task_id;

// 			if (assignee && this.notifier) {
// 				await this.notifier.notifyAssignee(assignee, {
// 					id: taskId, title: payload.task, desc: payload.description, deadline: payload.deadline, priority: payload.prioritet
// 				});
// 			}
// 			return { ok: true, taskId, assignee: assignee?.name || A.assigneeName, notified: !!assignee };
// 		}
// 		// ---- REASSIGN TASK (переназначение исполнителя) ----
// if (name === 'reassign_task') {
//   const id = Number(A.taskId || A.id);
//   if (!Number.isFinite(id) || id <= 0) {
//     return { ok: false, error: 'BAD_PARAMS: taskId is required (number)' };
//   }

//   let newEmployeeId = null;
//   let newAssignee = null;

//   if (A.employee_id) {
//     newEmployeeId = Number(A.employee_id);
//     if (!Number.isFinite(newEmployeeId) || newEmployeeId <= 0) {
//       return { ok: false, error: 'BAD_PARAMS: employee_id must be a positive number' };
//     }
//   } else if (A.assigneeName) {
//     const { match, candidates } = await this.employees.resolveByName(A.assigneeName);
//     if (!match && candidates?.length > 1) {
//       return { ok: false, need_choice: candidates.slice(0, 3).map(c => c.name) };
//     }
//     newAssignee = match || candidates?.[0] || null;
//     newEmployeeId = newAssignee?.id || newAssignee?.employee_id || null;
//     if (!newEmployeeId) return { ok: false, error: 'EMPLOYEE_ID_NOT_FOUND' };
//   } else {
//     return { ok: false, error: 'BAD_PARAMS: provide assigneeName or employee_id' };
//   }

//   // Получим текущую задачу (для заголовка/дедлайна/старого исполнителя)
//   let current = await this.api.get('tasks', { id });
//   if (Array.isArray(current)) current = current[0] || null;
//   const oldEmployeeId = current?.employee_id || null;

//   // Обновляем исполнителя
//   const updated = await this.api.update('tasks', String(id), { employee_id: newEmployeeId });

//   // Справочник сотрудников
//   const emps = await this.employees.list();
//   const byId = new Map(emps.map(e => [e.id || e.employee_id, e]));

//   const newEmp = newAssignee || byId.get(newEmployeeId) || null;
//   const oldEmp = byId.get(oldEmployeeId) || null;

//   // Нормализуем строку задачи
//   const task = mapTaskRow(updated || current, byId);

//   // Отправляем уведомления (если настроен notifier)
//   if (this.notifier) {
//     try {
//       await this.notifier.notifyReassigned(newEmp, {
//         id: task.id,
//         title: task.task,
//         desc: task.description,
//         deadline: task.deadline,
//         priority: task.priority
//       }, oldEmp);
//     } catch {}
//   }

//   return { ok: true, task, reassigned_to: newEmp?.name || newEmployeeId };
// }


// 		// ---- UPDATE STATUS ----
// 		if (name === 'update_status') {
// 			const id = String(A.taskId || '').trim();
// 			if (!id) return { ok: false, error: 'BAD_PARAMS: taskId required' };
// 			const res = await this.api.update('tasks', id, { status: String(A.status || '').trim() });
// 			return { ok: true, task: mapTaskRow(res) };
// 		}

// 		// ---- LIST EMPLOYEES ----
// 		if (name === 'list_employees') {
// 			const emps = await this.employees.list();
// 			return { ok: true, employees: emps };
// 		}

// 		// ---- LIST TASKS ----
// 		if (name === 'list_tasks') {
// 			const [rows, emps] = await Promise.all([
// 				this.api.get('tasks', {}),
// 				this.employees.list()
// 			]);
// 			const byId = new Map(emps.map(e => [e.id, e]));
// 			const tasks = (Array.isArray(rows) ? rows : []).map(r => mapTaskRow(r, byId));
// 			return { ok: true, tasks };
// 		}

// 		// ---- REPORT ----
// 		if (name === 'report') {
// 			const rows = await this.api.get('tasks', {});
// 			const total = Array.isArray(rows) ? rows.length : 0;
// 			const byStatus = {};
// 			for (const t of (rows || [])) {
// 				const k = t.status || '—';
// 				byStatus[k] = (byStatus[k] || 0) + 1;
// 			}
// 			return { ok: true, report: { total, byStatus } };
// 		}

// 		// ---- SEND TELEGRAM ----
// 		if (name === 'send_telegram') {
			
// 			if (!this.notifier) return { ok: false, error: 'NOTIFIER_NOT_CONFIGURED' };

// 			const toRaw = String(A.to || '').trim();
// 			const text = String(A.text || '').trim();
// console.log('send', A);
// 			// Ошибка
// 			if (!toRaw || !text) return {
// 				ok: false, error: 'BAD_PARAMS: to and text are required'
// 			};

// 			const results = [];
// 			const sendOne = async (chatId) => {
// 				const r = await this.notifier.sendText(chatId, text);
// 				results.push({ chat_id: chatId, ...r });
// 			};

// 			if (/^(all|всем)$/i.test(toRaw)) {
// 				const emps = await this.employees.list();
// 				const list = emps.filter(e => !!e.tg_user_id);
// 				for (const e of list) await sendOne(e.tg_user_id);
				
// 				return {
// 					ok: true,
// 					sent: results,
// 					count: results.length
// 				};
// 			}

// 			const num = Number(toRaw);
// 			if (Number.isFinite(num) && String(num) === toRaw) {
// 				await sendOne(num);
// 				return { ok: true, sent: results };
// 			}

// 			const { match, candidates } = await this.employees.resolveByName(toRaw);

// 			if (!match && candidates?.length > 1) {
// 				return { ok: false, need_choice: candidates.slice(0, 3).map(c => c.name) };
// 			}
// 			const emp = match || candidates?.[0];
// 			if (!emp) return { ok: false, error: 'EMPLOYEE_NOT_FOUND' };
// 			if (!emp.tg_user_id) return { ok: false, error: 'NO_CHAT_ID_FOR_EMPLOYEE' };

// 			await sendOne(emp.tg_user_id);

// 			return {
// 				ok: true,
// 				sent: results
// 			};
// 		}

// 		return { ok: false, error: 'UNKNOWN_TOOL' };
// 	}
// }


// src/services/ToolRouter.js
import { EmployeesService } from './EmployeesService.js';
import { ApiClient } from './ApiClient.js';

// вспомогательная нормализация (как у Вас)
const norm = (s) => String(s || '').trim().toLowerCase();

const mapTaskRow = (t, employeesById = new Map()) => {
  const emp = employeesById.get(t.employee_id) || null;
  return {
    id: t.task_id,
    task: t.task,
    description: t.description || '',
    assignee: emp?.name || t.employee_id,
    deadline: t.deadline || null,
    status: t.status || null,
    priority: t.prioritet || null,
    tg_user_id: emp?.tg_user_id || emp?.chat_id || null
  };
};

export class ToolRouter {
  constructor({ api, employees, notifier } = {}) {
    this.api = api || new ApiClient();
    this.employees = employees || new EmployeesService(this.api);
    this.notifier = notifier; // <— важно
  }

  async route(name, args, ctx = {}) {
    const A = { ...(args || {}) };
    const requesterChatId = String(ctx?.requesterChatId || '');

    // ---- CREATE TASK ----
    if (name === 'create_task') {
      if (!A.assigneeName && A.assignee) A.assigneeName = A.assignee;
      if (typeof A.desc === 'undefined') A.desc = '';
      if (typeof A.deadline === 'undefined') A.deadline = '';
      if (!A.priority) A.priority = 'Средний';

      const { match } = await this.employees.resolveByName(A.assigneeName);
      const assignee = match;
      const employee_id = assignee?.employee_id || assignee?.id || null;

	  console.log ("pp",employee_id);

      let deadline = String(A.deadline || '').trim();
      if (deadline) {
        // parseHumanDateRu и toDbDateTime у Вас в utils — вызываются внутри бэкенда/ApiClient или здесь, если подключите
        // предположим, что бэкенд сам нормализует (как Вы и писали в инструкциях)
      }

	  console.log("ddf",A);

      const payload = {
        task: String(A.title || '').trim(),
        employee_id,
        description: String(A.desc || '').trim(),
        deadline,
        status: 'Новая',
        prioritet: String(A.priority || '').trim(),
      };


	  console.log("ff",payload)

      const created = await this.api.add('tasks', payload);
      const taskId = created?.task_id;

      if (assignee && this.notifier) {
        await this.notifier.notifyAssignee(assignee, {
          id: taskId, title: payload.task, desc: payload.description, deadline: payload.deadline, priority: payload.prioritet
        });
      }
      return { ok: true, taskId, assignee: assignee?.name || A.assigneeName, notified: !!assignee };
    }

    // ---- UPDATE STATUS ----
    if (name === 'update_status') {
      const id = String(A.taskId || '').trim();
      if (!id) return { ok: false, error: 'BAD_PARAMS: taskId required' };
      const res = await this.api.update('tasks', id, { status: String(A.status || '').trim() });
      return { ok: true, task: mapTaskRow(res) };
    }

    // ---- LIST EMPLOYEES ----
    if (name === 'list_employees') {
      const emps = await this.employees.list();
      return { ok: true, employees: emps };
    }

    // ---- LIST TASKS ----
    if (name === 'list_tasks') {
      const [rows, emps] = await Promise.all([
        this.api.get('tasks', {}),
        this.employees.list()
      ]);
      const byId = new Map(emps.map(e => [e.employee_id || e.id, e]));
      const tasks = (Array.isArray(rows) ? rows : []).map(r => mapTaskRow(r, byId));
      return { ok: true, tasks };
    }

    // ---- REPORT ----
    if (name === 'report') {
      const rows = await this.api.get('tasks', {});
      const total = Array.isArray(rows) ? rows.length : 0;
      const byStatus = {};
      for (const t of (rows || [])) {
        const k = t.status || '—';
        byStatus[k] = (byStatus[k] || 0) + 1;
      }
      return { ok: true, report: { total, byStatus } };
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
        const list = emps.filter(e => !!(e.tg_user_id || e.chat_id));
        for (const e of list) await sendOne(e.tg_user_id || e.chat_id);
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
      if (!(emp.tg_user_id || emp.chat_id)) return { ok: false, error: 'NO_CHAT_ID_FOR_EMPLOYEE' };

      await sendOne(emp.tg_user_id || emp.chat_id);
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

    return { ok: false, error: 'UNKNOWN_TOOL' };
  }
}

