import crypto from 'crypto';
import { EmployeesService } from './EmployeesService.js';
import { log } from '../utils/logger.js';

const asNumber = (v) => {
	const n = Number(String(v ?? '').trim());
	return Number.isFinite(n) ? n : NaN;
};

export class EmployeesCache {
	constructor({ employees = new EmployeesService(), preload = true } = {}) {
		this.employees = employees;
		this._loadedAt = 0;
		this._hash = '';
		this._employees = [];
		this._byTg = new Map();
		this._byName = new Map();
		if (preload) this.refresh().catch(e => log.warn('[EmployeesCache preload]', e?.message || e));
	}

	get loadedAt() { return this._loadedAt; }
	get count()    { return this._employees.length; }

	_set(list) {
		this._employees = Array.isArray(list) ? list : [];
		this._byTg.clear(); this._byName.clear();

		for (const e of this._employees) {
			const tg = asNumber(e?.tg_user_id);
			if (Number.isFinite(tg)) this._byTg.set(tg, e);
			const key = String(e?.name || '').trim().toLowerCase();
			if (!key) continue;
			if (!this._byName.has(key)) this._byName.set(key, []);
			this._byName.get(key).push(e);
		}

		const sha = crypto.createHash('sha1');
		sha.update(JSON.stringify(this._employees));
		this._hash = sha.digest('hex');
		this._loadedAt = Date.now();
		log.info(`[EmployeesCache] loaded: ${this._employees.length} (hash=${this._hash.slice(0,8)})`);
	}

	async refresh() {
		const list = await this.employees.list();
		this._set(list);
		return { ok: true, count: this.count };
	}

	list() { return this._employees.slice(); }
	getByTgId(tgId) {
		const id = asNumber(tgId);
		return Number.isFinite(id) ? (this._byTg.get(id) || null) : null;
	}
	resolveByName(q) {
		const key = String(q || '').trim().toLowerCase();
		if (!key) return { match: null, candidates: [] };
		const exact = this._byName.get(key) || [];
		if (exact.length === 1) return { match: exact[0], candidates: [] };

		const candidates = [];
		for (const [k, arr] of this._byName.entries()) if (k.includes(key)) candidates.push(...arr);
		if (candidates.length === 1) return { match: candidates[0], candidates: [] };
		return { match: null, candidates };
	}
}