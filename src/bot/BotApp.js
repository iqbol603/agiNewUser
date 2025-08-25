// import fs from 'fs';
// import TelegramBot from 'node-telegram-bot-api';
// import { ENV } from '../config/env.js';
// import { log } from '../utils/logger.js';
// import { FileStorage } from '../services/FileStorage.js';
// import { OpenAIService } from '../services/OpenAIService.js';
// import { AssistantService } from '../services/AssistantService.js';
// import { EmployeesService } from '../services/EmployeesService.js';
// import { Notifier } from '../services/Notifier.js';
// import { ToolRouter } from '../services/ToolRouter.js';
// import { TelegramUI } from './TelegramUI.js';
// import { AccessControlService } from '../services/AccessControlService.js';
// import { ApiClient } from '../services/ApiClient.js';

// export class BotApp {
// 	constructor() {
// 		this.bot = new TelegramBot(ENV.TELEGRAM_TOKEN, { polling: true });

// 		const api = new ApiClient();
// 		this.files = new FileStorage();
// 		this.openai = new OpenAIService();
// 		this.assistant = new AssistantService({ bot: this.bot});
// 		this.employees = new EmployeesService(api);
// 		this.notifier = new Notifier(this.bot);
// 		this.tools = new ToolRouter({ api, employees: this.employees, notifier: this.notifier });
// 		this.acl = new AccessControlService({ employees: this.employees });
// 		this.uiState = new Map();
// 		this.pendingAssign = new Map();

// 		this.bindHandlers();
// 		log.info('BotApp initialized');
// 	}

// 	bindHandlers() {
// 		this.bot.onText(/^(\/start|\/menu)$/, async (msg) => {
// 			const auth = await this.acl.authorize(msg.from?.id);
// 			if (!auth.allowed) {
// 				console.log('not auth', msg.from?.id);
// 				return;
// 			}
// 			await this.bot.sendMessage(
// 				msg.chat.id,
// 				'🔍 Пришлите текст или голосовой вопрос — я спрошу ИИ-агента и/или выполню действия с задачами.\n\nГлавное меню:',
// 				TelegramUI.mainMenuInline()
// 			);
// 		});

// 		this.bot.on('callback_query', async (q) => this.onCallbackQuery(q));
// 		this.bot.on('message', async (msg) => this.onMessage(msg));
// 	}

// 	async start() { }
// 	async stop() { }

// 	async onCallbackQuery(q) {
// 		const auth = await this.acl.authorize(q.from?.id);
// 		if (!auth.allowed) return;
// 	}

// 	async onMessage(msg) {
// 		console.log('[TELEGRAM][GET][MESSAGE]', msg);

// 		// Если это не текст и не голос отклоняем
// 		if (!msg.text && !msg.voice) return;
// 		if (msg.text && msg.text.startsWith('/')) return;

// 		// авторизация
// 		const auth = await this.acl.authorize(msg.from?.id);

// 		console.log('auth', auth, msg.from?.id);
// 		if (!auth.allowed) return;

// 		const chatId = msg.chat.id;
		
// 		if (msg.text && !msg.text.startsWith('/')) {
// 			await this.bot.sendMessage(chatId, '⏳ Анализирую...');
// 			const aiReply = await this.assistant.ask(msg.text, { chatId, employee: auth.employee });

// 			console.log('===============================================================');
// 			console.log('[TELEGRAM][REPLY]', aiReply);
// 			console.log('===============================================================');
// 			await this.bot.sendMessage(chatId, aiReply);

// 			try {
// 				const buf = await this.openai.speak(aiReply);
// 				const out = await this.files.saveBuffer(buf, 'ogg');
// 				await this.bot.sendVoice(chatId, { source: fs.createReadStream(out), filename: 'voice.ogg', contentType: 'audio/ogg' });
// 			} catch { }

// 			return;
// 		}

// 		if (msg.voice) {
// 			try {
// 				await this.bot.sendMessage(chatId, '⏳ Обрабатываю голос…');
// 				const localPath = await this.files.downloadTelegramFile(this.bot, msg.voice.file_id, 'ogg');
// 				const text = await this.openai.transcribe(localPath);
// 				await this.bot.sendMessage(chatId, `📝 Распознал: «${text}»`);

// 				await this.bot.sendMessage(chatId, '🔍 Выполняю анализ…');
// 				const aiReply = await this.assistant.ask(text, { chatId, employee: auth.employee });
// 				await this.bot.sendMessage(chatId, aiReply);

// 				try {
// 					const buf = await this.openai.speak(aiReply);
// 					const out = await this.files.saveBuffer(buf, 'ogg');
// 					// console.log("jjj", out, "pp", buf);
// 					// // Отправляем голос
// 					// await this.bot.sendVoice(chatId, {
// 					// 	source: fs.createReadStream(out),
// 					// 	filename: 'voice.ogg',
// 					// 	contentType: 'audio/ogg'
// 					// });
// 					const voicePath = out;
// 					// Важно: sendVoice требует OGG/Opus. Если у тебя mp3 — см. примечание ниже.

// 					await this.bot.sendVoice(
// 						chatId,
// 						fs.createReadStream(voicePath),       // <— Stream/Buffer/путь
// 						// { caption: 'Ответ голосом' },         // options
// 						{ filename: 'voice.ogg' }             // fileOptions
// 					);
// 				} catch { }
// 			} catch (e) {
// 				log.error('[VOICE ERROR]', e?.message || e);
// 				await this.bot.sendMessage(chatId, '⚠️ Ошибка обработки голосового сообщения.');
// 			}
// 		}
// 	}
// }

// src/bot/BotApp.js
import fs from 'fs';
import TelegramBot from 'node-telegram-bot-api';
import { ENV } from '../config/env.js';
import { log } from '../utils/logger.js';
import { FileStorage } from '../services/FileStorage.js';
import { OpenAIService } from '../services/OpenAIService.js';
import { AssistantService } from '../services/AssistantService.js';
import { EmployeesService } from '../services/EmployeesService.js';
import { Notifier } from '../services/Notifier.js';
import { ToolRouter } from '../services/ToolRouter.js';
import { TelegramUI } from './TelegramUI.js';
import { AccessControlService } from '../services/AccessControlService.js';
import { ApiClient } from '../services/ApiClient.js';
import { startDirectorHourlyReportScheduler } from '../services/ReportScheduler.js';

// Нормализация статуса к БД
function normalizeTaskStatus(s) {
  const x = String(s || '').trim().toLowerCase();
  if (x === 'в работе' || x === 'doing' || x === 'progress') return 'В работе';
  if (x === 'на проверке' || x === 'review') return 'На проверке';
  if (x === 'завершена' || x === 'готово' || x === 'сделано' || x === 'done' || x === 'complete') return 'Завершена';
  if (x === 'отложена' || x === 'later' || x === 'deferred') return 'Отложена';
  if (x === 'отменена' || x === 'cancel') return 'Отменена';
  if (x === 'в ожидании решения' || x === 'ждём' || x === 'ожидание' || x === 'блок' || x === 'blocked') return 'В ожидании решения';
  return 'В работе';
}

export class BotApp {
  constructor() {
    this.bot = new TelegramBot(ENV.TELEGRAM_TOKEN, { polling: true });

    const api = new ApiClient();
    this.files = new FileStorage();
    this.openai = new OpenAIService();
    this.assistant = new AssistantService({ bot: this.bot }); // <-- фикс
    this.employees = new EmployeesService(api);
    this.notifier = new Notifier(this.bot);
    this.tools = new ToolRouter({ api, employees: this.employees, notifier: this.notifier });
    this.acl = new AccessControlService({ employees: this.employees });
    this.uiState = new Map();
    this.pendingAssign = new Map();

    this.bindHandlers();
    log.info('BotApp initialized');

	    // 🕒 Ежечасный отчёт директору (Asia/Dushanbe)
    process.env.TZ = process.env.TZ || 'Asia/Dushanbe';
    startDirectorHourlyReportScheduler({ api: this.api, toolRouter: this.tools, notifier: this.notifier });
  }

  bindHandlers() {
    this.bot.onText(/^(\/start|\/menu)$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed) return;

      await this.bot.sendMessage(
        msg.chat.id,
        '🔍 Пришлите текст или голосовой вопрос — я спрошу ИИ-агента и/или выполню действия с задачами.\n\nГлавное меню:',
        TelegramUI.mainMenuInline()
      );
    });

    this.bot.on('callback_query', async (q) => this.onCallbackQuery(q));
    this.bot.on('message', async (msg) => this.onMessage(msg));
  }

  async start() {}
  async stop() {}

  async onCallbackQuery(q) {
    try {
      const auth = await this.acl.authorize(q.from?.id);
      if (!auth.allowed) {
        await this.bot.answerCallbackQuery(q.id, { text: 'Доступ запрещён', show_alert: true });
        return;
      }

      const data = q.data || '';

      // Кнопки статуса: task_status|<id>|<status>
      let m = data.match(/^task_status\|(\d+)\|(.+)$/i);
      if (m) {
        const taskId = Number(m[1]);
        const status = normalizeTaskStatus(m[2]);

        const res = await this.tools.route('update_status', { taskId, status }, {
          requesterChatId: String(q.from.id),
          requesterEmployee: auth.employee
        });

        if (res?.ok) {
          try {
            if (q.message?.chat?.id && q.message?.message_id) {
              await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: q.message.chat.id,
                message_id: q.message.message_id
              });
            }
          } catch {}
          await this.bot.answerCallbackQuery(q.id, { text: `Статус: ${status}` });
        } else {
          await this.bot.answerCallbackQuery(q.id, { text: `⚠️ ${res?.error || 'Ошибка'}`, show_alert: true });
        }
        return;
      }

      // здесь можно добавить другие типы кнопок (переназначение и т.д.)

      await this.bot.answerCallbackQuery(q.id, { text: 'Неизвестное действие' });
    } catch (e) {
      await this.bot.answerCallbackQuery(q.id, { text: `⚠️ ${e?.message || e}`, show_alert: true });
    }
  }

  async onMessage(msg) {
    // Если это не текст и не голос — выходим
    if (!msg.text && !msg.voice) return;
    if (msg.text && msg.text.startsWith('/')) return;

    // Авторизация
    const auth = await this.acl.authorize(msg.from?.id);
    if (!auth.allowed) return;

    const chatId = msg.chat.id;

    if (msg.text && !msg.text.startsWith('/')) {
      await this.bot.sendMessage(chatId, '⏳ Анализирую...');
      const aiReply = await this.assistant.ask(msg.text, { chatId, employee: auth.employee });

      await this.bot.sendMessage(chatId, aiReply);

      try {
        const buf = await this.openai.speak(aiReply);
        const out = await this.files.saveBuffer(buf, 'ogg');
        await this.bot.sendVoice(
          chatId,
          fs.createReadStream(out),
          { filename: 'voice.ogg' }
        );
      } catch {}
      return;
    }

    if (msg.voice) {
      try {
        await this.bot.sendMessage(chatId, '⏳ Обрабатываю голос…');
        const localPath = await this.files.downloadTelegramFile(this.bot, msg.voice.file_id, 'ogg');
        const text = await this.openai.transcribe(localPath);
        await this.bot.sendMessage(chatId, `📝 Распознал: «${text}»`);

        await this.bot.sendMessage(chatId, '🔍 Выполняю анализ…');
        const aiReply = await this.assistant.ask(text, { chatId, employee: auth.employee });
        await this.bot.sendMessage(chatId, aiReply);

        try {
          const buf = await this.openai.speak(aiReply);
          const out = await this.files.saveBuffer(buf, 'ogg');
          await this.bot.sendVoice(
            chatId,
            fs.createReadStream(out),
            { filename: 'voice.ogg' }
          );
        } catch {}
      } catch (e) {
        log.error('[VOICE ERROR]', e?.message || e);
        await this.bot.sendMessage(chatId, '⚠️ Ошибка обработки голосового сообщения.');
      }
    }
  }
}
