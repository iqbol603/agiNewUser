// import { log } from '../utils/logger.js';

// export class Notifier {
// 	constructor(bot) {
// 		this.bot = bot;
// 	}

// 	async sendText(chatId, text, extra = {}) {
// 		try {
// 			const id = Number(String(chatId).trim());
// 			if (!id || !text) return { ok: false, error: 'BAD_PARAMS' };
// 			const m = await this.bot.sendMessage(id, text, extra);
// 			return { ok: true, message_id: m?.message_id };
// 		} catch (e) {
// 			return { ok: false, error: e?.message || String(e) };
// 		}
// 	}

// 	async notifyAssignee(emp, task) {
// 		if (!emp?.tg_user_id) return;
// 		const chatId = Number(String(emp.tg_user_id).trim());
// 		if (!chatId) return;

// 		const kb = {
// 		reply_markup: {
// 			inline_keyboard: [
// 				[{ text: '▶️ В работу', callback_data: `task_status|${task.id}|в работе` }],
// 				[{ text: '⛔ Блок',     callback_data: `task_status|${task.id}|блокирована` }],
// 				[{ text: '✅ Готово',   callback_data: `task_status|${task.id}|выполнена` }]
// 			]
// 		}
// 		};

// 		const lines = [
// 			'🆕 *Новая задача*',
// 			`ID: \`${task.id}\``,
// 			`*Задача:* ${task.title}`,
// 			`*Описание:* ${task.desc || '—'}`,
// 			`*Дедлайн:* ${task.deadline || '—'}`,
// 			`*Приоритет:* ${task.priority || 'нормальный'}`
// 		];

// 		try {
// 			await this.bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown', ...kb });
// 		} catch (e) {
// 			log.warn('[NOTIFY WARN]', e?.message || e);
// 		}
// 	}
// }

// src/services/Notifier.js
import { log } from '../utils/logger.js';

export class Notifier {
  constructor(bot) {
    this.bot = bot;
  }

  async sendText(chatId, text, extra = {}) {
    try {
      const id = Number(String(chatId).trim());
      if (!id || !text) return { ok: false, error: 'BAD_PARAMS' };
      const m = await this.bot.sendMessage(id, text, extra);
      return { ok: true, message_id: m?.message_id };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /**
   * Уведомление новому исполнителю при создании задачи
   */
  async notifyAssignee(emp, task) {
    const chatId = this._pickChatId(emp);
    if (!chatId) return;

    const kb = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '▶️ В работу', callback_data: `task_status|${task.id}|в работе` }],
          [{ text: '⛔ Блок',     callback_data: `task_status|${task.id}|в ожидании решения` }],
          [{ text: '✅ Готово',   callback_data: `task_status|${task.id}|завершена` }]
        ]
      }
    };

    const lines = [
      '🆕 *Новая задача*',
      `ID: \`${task.id}\``,
      `*Задача:* ${task.title}`,
      `*Описание:* ${task.desc || '—'}`,
      `*Дедлайн:* ${task.deadline || '—'}`,
      `*Приоритет:* ${task.priority || 'Средний'}`
    ];

    try {
      await this.bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown', ...kb });
    } catch (e) {
      log.warn('[NOTIFY WARN]', e?.message || e);
    }
  }

  /**
   * Уведомление при ПЕРЕНАЗНАЧЕНИИ задачи (новому исполнителю)
   * oldEmp — опционально, если хотите уведомлять прежнего исполнителя
   */
  async notifyReassigned(newEmp, task, oldEmp = null) {
    const newChatId = this._pickChatId(newEmp);
    if (newChatId) {
      const kb = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '▶️ В работу', callback_data: `task_status|${task.id}|в работе` }],
            [{ text: '⛔ Блок',     callback_data: `task_status|${task.id}|в ожидании решения` }],
            [{ text: '✅ Готово',   callback_data: `task_status|${task.id}|завершена` }]
          ]
        }
      };
      const lines = [
        '🔄 *Вам переназначена задача*',
        `ID: \`${task.id}\``,
        `*Задача:* ${task.title || '—'}`,
        `*Описание:* ${task.desc || '—'}`,
        `*Дедлайн:* ${task.deadline || '—'}`,
        `*Приоритет:* ${task.priority || 'Средний'}`
      ];
      try {
        await this.bot.sendMessage(newChatId, lines.join('\n'), { parse_mode: 'Markdown', ...kb });
      } catch (e) {
        log.warn('[NOTIFY WARN]', e?.message || e);
      }
    }

    if (oldEmp) {
      const oldChatId = this._pickChatId(oldEmp);
      if (oldChatId) {
        const txt = [
          'ℹ️ Задача передана другому сотруднику',
          `ID: ${task.id}`,
          `Название: ${task.title || '—'}`,
          `Новый исполнитель: ${newEmp?.name || '—'}`
        ].join('\n');
        try {
          await this.bot.sendMessage(oldChatId, txt);
        } catch (e) {
          log.warn('[NOTIFY WARN]', e?.message || e);
        }
      }
    }
  }

  _pickChatId(emp) {
    return Number(String(emp?.tg_user_id || emp?.chat_id || '').trim()) || null;
  }
}
