// src/services/DraftStoreDb.js
import { query } from '../config/db.js'; // путь подправьте под ваш db.js

/**
 * @typedef {'Критический'|'Высокий'|'Средний'|'Низкий'|'Очень низкий'} Priority
 */
export function normalizePriority(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return 'Средний';
  if (/^крит|critical|crit/.test(s)) return 'Критический';
  if (/^выс|high/.test(s)) return 'Высокий';
  if (/^очень\s*низ|very\s*low/.test(s)) return 'Очень низкий';
  if (/^низ|low/.test(s)) return 'Низкий';
  if (/^сред|normal|norm/.test(s)) return 'Средний';
  return 'Средний';
}

/**
 * Совместим по API с InMemoryDraftStore: get/merge/clear
 */
export class DbDraftStore {
  async get(chatId) {
    const rows = await query(
      `SELECT title, assignee, description, deadline, priority,
              UNIX_TIMESTAMP(updated_at)*1000 AS updatedAt
       FROM ai_drafts WHERE chat_id = ? LIMIT 1`,
      [String(chatId)]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      title: r.title ?? undefined,
      assigneeName: r.assignee ?? undefined,
      desc: r.description ?? undefined,
      deadline: r.deadline ?? undefined,
      priority: r.priority ?? undefined,
      updatedAt: r.updatedAt ? Number(r.updatedAt) : undefined,
    };
  }

  async merge(chatId, patch = {}) {
    const cur = (await this.get(chatId)) || {};
    const next = { ...cur, ...patch };
    if (typeof next.priority === 'string') {
      next.priority = normalizePriority(next.priority);
    }

    await query(
      `INSERT INTO ai_drafts (chat_id, title, assignee, description, deadline, priority, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         title=VALUES(title),
         assignee=VALUES(assignee),
         description=VALUES(description),
         deadline=VALUES(deadline),
         priority=VALUES(priority),
         updated_at=CURRENT_TIMESTAMP`,
      [
        String(chatId),
        next.title ?? null,
        next.assigneeName ?? null,
        next.desc ?? null,
        next.deadline ?? null,
        next.priority ?? null,
      ]
    );

    next.updatedAt = Date.now();
    return next;
  }

  async clear(chatId) {
    await query('DELETE FROM ai_drafts WHERE chat_id = ?', [String(chatId)]);
  }
}
