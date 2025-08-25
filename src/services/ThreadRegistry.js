// src/ai/ThreadRegistry.js
export class ThreadRegistry {
  constructor() {
    /** @type {Map<string, string>} chatId -> threadId */
    this.byChat = new Map();
  }
  get(chatId) { return this.byChat.get(String(chatId)) || null; }
  set(chatId, threadId) { this.byChat.set(String(chatId), String(threadId)); }
  delete(chatId) { this.byChat.delete(String(chatId)); }
}
