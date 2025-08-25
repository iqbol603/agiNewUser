import { ApiClient } from './ApiClient.js';

function parseSkills(v) {
	if (!v) return [];
	if (Array.isArray(v)) return v;
	try {
		const j = JSON.parse(v);
		return Array.isArray(j) ? j : String(v).split(',').map(s => s.trim()).filter(Boolean);
	} catch {
		return String(v).split(',').map(s => s.trim()).filter(Boolean);
	}
}

const toEmployee = (row) => ({
	id: row.employee_id,
	name: row.name,
	position: row.job || null,
	phone: row.phone || null,
	email: row.email || null,
	skills: parseSkills(row.skills),
	tg_user_id: row.chat_id ? String(row.chat_id) : null,
	user_role: row.user_role || 'employee',
	created_at: row.created_at || null,
	updated_at: row.updated_at || null,
});

const norm = (s) => String(s || '').trim().toLowerCase();

export class EmployeesService {
	constructor(api = new ApiClient()) {
		this.api = api;
	}

	async list(params = {}) {
		const rows = await this.api.get('employees', params);
		return Array.isArray(rows) ? rows.map(toEmployee) : [];
	}

	async byChatId(chatId) {
		const rows = await this.api.get('employees', { chat_id: String(chatId) });
		const one = Array.isArray(rows) ? rows[0] : rows;
		return one ? toEmployee(one) : null;
	}

	async resolveByName(inputName) {
		const employees = await this.list();
		const q = norm(inputName || '');
		if (!q) return { match: null, candidates: [] };

		const exact = employees.filter(e => norm(e.name) === q);
		if (exact.length === 1) return { match: exact[0], candidates: [] };

		const sub = employees.filter(e => norm(e.name).includes(q));
		if (sub.length === 1) return { match: sub[0], candidates: [] };

		return { match: null, candidates: sub };
	}
}