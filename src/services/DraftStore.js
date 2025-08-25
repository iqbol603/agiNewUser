// // src/ai/DraftStore.js

// /**
//  * @typedef {'Критический'|'Высокий'|'Средний'|'Низкий'|'Очень низкий'} Priority
//  */

// /**
//  * @typedef {Object} TaskDraft
//  * @property {string=} title
//  * @property {string=} assigneeName
//  * @property {string=} desc
//  * @property {string=} deadline   // сырая человеческая фраза: "завтра 15:00"
//  * @property {Priority=} priority
//  * @property {number=} updatedAt
//  */

// export class InMemoryDraftStore {
//   constructor() {
//     /** @type {Map<string, TaskDraft>} */
//     this.map = new Map(); // key: chatId
//   }
//   /** @param {string} chatId */
//   get(chatId) { return this.map.get(String(chatId)) || null; }

//   /**
//    * @param {string} chatId
//    * @param {Partial<TaskDraft>} patch
//    * @returns {TaskDraft}
//    */
//   merge(chatId, patch) {
//     const key = String(chatId);
//     const cur = this.map.get(key) || {};
//     const next = { ...cur, ...patch, updatedAt: Date.now() };
//     this.map.set(key, next);
//     return next;
//   }

//   /** @param {string} chatId */
//   clear(chatId) { this.map.delete(String(chatId)); }
// }

// /** Нормализация приоритета к перечислению БД */
// export function normalizePriority(input) {
//   const s = String(input || '').trim().toLowerCase();
//   if (!s) return 'Средний';
//   if (/^крит|critical|crit/.test(s)) return 'Критический';
//   if (/^выс|high/.test(s)) return 'Высокий';
//   if (/^очень\s*низ|very\s*low/.test(s)) return 'Очень низкий';
//   if (/^низ|low/.test(s)) return 'Низкий';
//   if (/^сред|normal|norm/.test(s)) return 'Средний';
//   return 'Средний';
// }


// src/services/DraftStore.js

/**
 * @typedef {'Критический'|'Высокий'|'Средний'|'Низкий'|'Очень низкий'} Priority
 */

/**
 * @typedef {Object} TaskDraft
 * @property {string=} title
 * @property {string=} assigneeName
 * @property {string=} desc
 * @property {string=} deadline   // сырая фраза, например "завтра 15:00"
 * @property {Priority=} priority
 * @property {number=} updatedAt
 */

export class InMemoryDraftStore {
  constructor() {
    /** @type {Map<string, TaskDraft>} */
    this.map = new Map(); // key: chatId
  }
  get(chatId) { return this.map.get(String(chatId)) || null; }
  merge(chatId, patch) {
    const key = String(chatId);
    const cur = this.map.get(key) || {};
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    this.map.set(key, next);
    return next;
  }
  clear(chatId) { this.map.delete(String(chatId)); }
}

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
