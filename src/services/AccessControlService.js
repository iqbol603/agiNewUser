import { EmployeesService } from './EmployeesService.js';
import { log } from '../utils/logger.js';
import { query } from '../config/db.js';

const asNumber = (v) => {
    const n = Number(String(v ?? '').trim());
    return Number.isFinite(n) ? n : NaN;
};

export class AccessControlService {
	constructor({ employees = new EmployeesService(), disableCache = false, ttlMs = 60_000 } = {}) {
		this.employees = employees;
		this.disableCache = !!disableCache;
		this.ttlMs = Number.isFinite(ttlMs) ? ttlMs : 60_000;
		this._cache = { at: 0, byTg: new Map(), raw: [] };
	}

	async _refreshIfNeeded(force = false) {
		const now = Date.now();

		const shouldBypass = this.disableCache || this.ttlMs <= 0;

		if (!force && !shouldBypass && (now - this._cache.at < this.ttlMs)) {
		return;
		}

		try {
			const list = await this.employees.list?.({ noCache: true }) ?? [];
			const byTg = new Map();

			for (const e of list) {
				const id = asNumber(e?.tg_user_id ?? e?.chat_id);
				if (Number.isFinite(id)) byTg.set(id, e);
			}

			this._cache = { at: now, byTg, raw: list };
			log.info('[ACL] employees fetched via API, count:', byTg.size);
		} catch (error) {
			log.warn('[ACL] Ошибка получения сотрудников из API:', error.message);
			// Используем кэш если он есть, иначе пустой список
			if (this._cache.raw.length === 0) {
				this._cache = { at: now, byTg: new Map(), raw: [] };
			}
		}
	}

	async authorize(tgUserId) {
		await this._refreshIfNeeded(false);
		const id = asNumber(tgUserId);
		
		if (!Number.isFinite(id)) return { allowed: false, employee: null };

		let emp = this._cache.byTg.get(id) || null;

		// Если не нашли через API — пробуем локальную таблицу employees
		if (!emp) {
			try {
				const rows = await query('SELECT * FROM employees WHERE chat_id = ? LIMIT 1', [String(id)]);
				const row = Array.isArray(rows) ? rows[0] : rows;
				if (row) {
					emp = {
						id: row.employee_id || row.id || id,
						employee_id: row.employee_id || row.id || id,
						name: row.name || `Employee ${id}`,
						job: row.job || null,
						chat_id: String(row.chat_id || id),
						tg_user_id: String(row.chat_id || id),
						user_role: row.user_role || 'staff'
					};
					log.info('[ACL] найден сотрудник в локальной БД по chat_id:', id, 'роль:', emp.user_role);
				}
			} catch (e) {
				log.warn('[ACL] Ошибка запроса локальной таблицы employees:', e.message);
			}
		}

		return { allowed: !!emp, employee: emp };
	}

	async refresh() { await this._refreshIfNeeded(true); }

	flush() {
		this._cache = { at: 0, byTg: new Map(), raw: [] };
		log.info('[ACL] cache flushed');
	}
}