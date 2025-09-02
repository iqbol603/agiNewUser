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
import { ExplanatoryService } from '../services/ExplanatoryService.js';
import { startDirectorHourlyReportScheduler,startAssigneeReminderScheduler5min } from '../services/ReportScheduler.js';

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
    this.explanatory = new ExplanatoryService();
    this.tools = new ToolRouter({ api, employees: this.employees, notifier: this.notifier });
    this.acl = new AccessControlService({ employees: this.employees });
    this.uiState = new Map();
    this.pendingAssign = new Map();

    this.bindHandlers();
    log.info('BotApp initialized');

	    // 🕒 Ежечасный отчёт директору (Asia/Dushanbe)
    process.env.TZ = process.env.TZ || 'Asia/Dushanbe';
    startDirectorHourlyReportScheduler({ api: this.api, toolRouter: this.tools, notifier: this.notifier, explanatoryService: this.explanatory });
    startAssigneeReminderScheduler5min({ api: this.api, toolRouter: this.tools, notifier: this.notifier });
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

    // Команда для отправки объяснительной
    this.bot.onText(/^\/explanation\s+(\d+)\s+(.+)$/, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed) return;

      const explanationId = Number(match[1]);
      const explanationText = match[2];

      try {
        const result = await this.tools.route('submit_explanation', {
          explanationId: explanationId,
          explanationText: explanationText
        }, {
          requesterChatId: String(msg.chat.id),
          requesterEmployee: auth.employee
        });

        if (result.ok) {
          await this.bot.sendMessage(msg.chat.id, '✅ Объяснительная успешно отправлена на рассмотрение директору.');
        } else {
          await this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${result.error}`);
        }
      } catch (error) {
        log.error('[BotApp] Ошибка отправки объяснительной:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при отправке объяснительной.');
      }
    });

    // Команда для просмотра ожидающих объяснительных (только для директоров)
    this.bot.onText(/^\/explanations$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed) return;

      if (auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только директора могут просматривать объяснительные.');
        return;
      }

      try {
        const result = await this.tools.route('list_pending_explanations', {
          limit: 10
        }, {
          requesterChatId: String(msg.chat.id),
          requesterEmployee: auth.employee
        });

        if (result.ok && result.explanations.length > 0) {
          let message = '📝 Ожидающие рассмотрения объяснительные:\n\n';
          
          for (const exp of result.explanations) {
            message += `ID: ${exp.id}\n`;
            message += `Задача: ${exp.task}\n`;
            message += `Сотрудник: ${exp.employee_name}\n`;
            message += `Объяснение: ${exp.explanation_text}\n`;
            message += `Дата: ${new Date(exp.responded_at).toLocaleString('ru-RU')}\n`;
            message += `\nКоманды для рассмотрения:\n`;
            message += `/accept ${exp.id} [комментарий] - принять\n`;
            message += `/reject ${exp.id} [комментарий] - отклонить\n`;
            message += `/penalty ${exp.id} [сумма] [комментарий] - наказать\n\n`;
          }
          
          await this.bot.sendMessage(msg.chat.id, message);
        } else {
          await this.bot.sendMessage(msg.chat.id, '✅ Нет ожидающих рассмотрения объяснительных.');
        }
      } catch (error) {
        log.error('[BotApp] Ошибка получения объяснительных:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при получении объяснительных.');
      }
    });

    // Команда для принятия объяснительной
    this.bot.onText(/^\/accept\s+(\d+)\s+(.+)$/, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен.');
        return;
      }

      const explanationId = Number(match[1]);
      const comment = match[2];

      try {
        const result = await this.tools.route('review_explanation', {
          explanationId: explanationId,
          decision: 'accept',
          managerDecision: comment
        }, {
          requesterChatId: String(msg.chat.id),
          requesterEmployee: auth.employee
        });

        if (result.ok) {
          await this.bot.sendMessage(msg.chat.id, '✅ Объяснительная принята.');
        } else {
          await this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${result.error}`);
        }
      } catch (error) {
        log.error('[BotApp] Ошибка принятия объяснительной:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при принятии объяснительной.');
      }
    });

    // Команда для отклонения объяснительной
    this.bot.onText(/^\/reject\s+(\d+)\s+(.+)$/, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен.');
        return;
      }

      const explanationId = Number(match[1]);
      const comment = match[2];

      try {
        const result = await this.tools.route('review_explanation', {
          explanationId: explanationId,
          decision: 'reject',
          managerDecision: comment
        }, {
          requesterChatId: String(msg.chat.id),
          requesterEmployee: auth.employee
        });

        if (result.ok) {
          await this.bot.sendMessage(msg.chat.id, '❌ Объяснительная отклонена.');
        } else {
          await this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${result.error}`);
        }
      } catch (error) {
        log.error('[BotApp] Ошибка отклонения объяснительной:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при отклонении объяснительной.');
      }
    });

    // Команда для наказания (лишение бонуса)
    this.bot.onText(/^\/penalty\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(.+)$/, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен.');
        return;
      }

      const explanationId = Number(match[1]);
      const penaltyAmount = Number(match[2]);
      const comment = match[3];

      try {
        const result = await this.tools.route('review_explanation', {
          explanationId: explanationId,
          decision: 'penalty',
          managerDecision: comment,
          bonusPenaltyAmount: penaltyAmount
        }, {
          requesterChatId: String(msg.chat.id),
          requesterEmployee: auth.employee
        });

        if (result.ok) {
          await this.bot.sendMessage(msg.chat.id, `💰 Предложено лишение бонуса в размере ${penaltyAmount} сом.`);
        } else {
          await this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${result.error}`);
        }
      } catch (error) {
        log.error('[BotApp] Ошибка наказания:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при наложении наказания.');
      }
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
          // Обрабатываем специальные ошибки для закрытия задачи
          if (res?.requires && status === 'Завершена') {
            let errorMessage = `⚠️ ${res.error}\n\n`;
            
            if (res.requires.includes('complete_dod')) {
              errorMessage += `📋 **Требуется завершить DoD чек-листы:**\n`;
              errorMessage += `• Создайте чек-листы для задачи\n`;
              errorMessage += `• Отметьте выполненные пункты\n\n`;
            }
            
            if (res.requires.includes('provide_report')) {
              errorMessage += `📝 **Требуется предоставить отчет:**\n`;
              errorMessage += `• Опишите выполненную работу\n`;
              errorMessage += `• Приложите артефакты (файлы, скриншоты)\n`;
              errorMessage += `• Оцените качество работы\n\n`;
            }
            
            errorMessage += `💡 **Используйте команды:**\n`;
            errorMessage += `• "создать DoD чек-лист для задачи ${taskId}"\n`;
            errorMessage += `• "создать отчет для задачи ${taskId}"\n`;
            errorMessage += `• "проверить готовность задачи ${taskId}"`;
            
            await this.bot.answerCallbackQuery(q.id, { text: errorMessage, show_alert: true });
          } else {
            await this.bot.answerCallbackQuery(q.id, { text: `⚠️ ${res?.error || 'Ошибка'}`, show_alert: true });
          }
        }
        return;
      }

      // здесь можно добавить другие типы кнопок (переназначение и т.д.)

      await this.bot.answerCallbackQuery(q.id, { text: 'Неизвестное действие' });
    } catch (e) {
      await this.bot.answerCallbackQuery(q.id, { text: `⚠️ ${e?.message || e}`, show_alert: true });
    }
  }

  async getActiveTask(chatId) {
    try {
      // Получаем последние сообщения из истории
      const { ConversationLog } = await import('../services/ConversationLog.js');
      const conversationLog = new ConversationLog();
      
      // Ищем упоминания задач в последних сообщениях
      const recentMessages = await conversationLog.getConversationByKeywords(chatId, ['задача', 'task'], 10);
      
      for (const message of recentMessages) {
        // Ищем ID задачи в тексте (например: "задача 71", "task 71")
        const taskIdMatch = message.content.match(/(?:задача|task)\s*(\d+)/i);
        if (taskIdMatch) {
          const taskId = Number(taskIdMatch[1]);
          
          // Проверяем, что задача существует и активна
          const taskResult = await this.tools.route('get_task', { taskId }, {
            requesterChatId: String(chatId),
            requesterEmployee: null
          });
          
          if (taskResult?.ok && taskResult.task && taskResult.task.status !== 'Завершена') {
            return taskResult.task;
          }
        }
      }
      
      return null;
    } catch (error) {
      log.warn('[BotApp] Ошибка поиска активной задачи:', error.message);
      return null;
    }
  }

  async findTaskByName(taskName) {
    try {
      // Ищем задачу по названию через API
      const result = await this.tools.route('list_tasks', {}, {
        requesterChatId: 'system',
        requesterEmployee: null
      });
      
      if (result?.ok && result.tasks) {
        // Ищем задачу с похожим названием
        const normalizedSearchName = taskName.toLowerCase().trim();
        
        for (const task of result.tasks) {
          const normalizedTaskName = task.task.toLowerCase().trim();
          
          // Проверяем точное совпадение или включение
          if (normalizedTaskName === normalizedSearchName || 
              normalizedTaskName.includes(normalizedSearchName) ||
              normalizedSearchName.includes(normalizedTaskName)) {
            
            // Возвращаем задачу независимо от статуса (включая завершенные)
            return task;
          }
        }
      }
      
      return null;
    } catch (error) {
      log.warn('[BotApp] Ошибка поиска задачи по названию:', error.message);
      return null;
    }
  }

  async onMessage(msg) {
    // Если это не текст, не голос и не документ — выходим
    if (!msg.text && !msg.voice && !msg.document) return;
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

    if (msg.document) {
      try {
        await this.bot.sendMessage(chatId, '📁 Обрабатываю документ...');
        
        // Определяем расширение файла
        const fileName = msg.document.file_name || 'document';
        const fileExt = fileName.split('.').pop()?.toLowerCase() || 'txt';
        
        // Скачиваем файл
        const localPath = await this.files.downloadTelegramFile(this.bot, msg.document.file_id, fileExt);
        
        // Читаем содержимое текстовых файлов
        if (['txt', 'md', 'js', 'py', 'java', 'cpp', 'c', 'h', 'json', 'xml', 'html', 'css'].includes(fileExt)) {
          const content = fs.readFileSync(localPath, 'utf8');
          await this.bot.sendMessage(chatId, `📄 Содержимое файла «${fileName}»:\n\n\`\`\`\n${content.substring(0, 3000)}${content.length > 3000 ? '\n... (файл обрезан)' : ''}\n\`\`\``);
          
          // Анализируем содержимое через AI
          await this.bot.sendMessage(chatId, '🔍 Анализирую содержимое файла...');
          const aiReply = await this.assistant.ask(`Анализируй содержимое файла ${fileName}: ${content.substring(0, 2000)}`, { chatId, employee: auth.employee });
          await this.bot.sendMessage(chatId, aiReply);
        } else {
          await this.bot.sendMessage(chatId, `📁 Файл «${fileName}» получен (${fileExt.toUpperCase()}). Для анализа содержимого отправьте текстовый файл.`);
        }
        
                 // Сохраняем информацию об артефакте в БД
         try {
           const fileStats = fs.statSync(localPath);
           
           // Пытаемся найти активную задачу в контексте
           let taskId = null;
           let foundTask = null;
           
           // Сначала проверяем, есть ли активная задача в разговоре
           const activeTask = await this.getActiveTask(chatId);
           if (activeTask) {
             taskId = activeTask.id;
             foundTask = activeTask;
             await this.bot.sendMessage(chatId, `📎 Файл автоматически привязан к задаче "${activeTask.task}" (ID: ${taskId})`);
           } else {
             // Если нет активной задачи, анализируем содержимое файла
             if (['txt', 'md', 'js', 'py', 'java', 'cpp', 'c', 'h', 'json', 'xml', 'html', 'css'].includes(fileExt)) {
               const content = fs.readFileSync(localPath, 'utf8');
               
                               // Ищем название задачи в содержимом файла
                const taskNameMatch = content.match(/(?:задача|task)[:\s]*["']?([^"\n\r]+)["']?/i);
                if (taskNameMatch) {
                  const taskName = taskNameMatch[1].trim();
                  foundTask = await this.findTaskByName(taskName);
                  
                  if (foundTask) {
                    taskId = foundTask.id;
                    await this.bot.sendMessage(chatId, `📎 Файл автоматически привязан к задаче "${foundTask.task}" (ID: ${taskId})`);
                  }
                }
                
                // Также ищем ID задачи в содержимом файла (улучшенное регулярное выражение)
                const taskIdMatch = content.match(/(?:задача\s*id|id\s*задачи|task\s*id|🎯\s*задача\s*id|id)[:\s]*(\d+)/i);
                log.info(`[BotApp] Поиск ID задачи в файле ${fileName}:`, {
                  contentLength: content.length,
                  taskIdMatch: taskIdMatch,
                  firstLines: content.substring(0, 200)
                });
                
                // Универсальная обработка: если найден ID в файле, привязываем к нему
                if (taskIdMatch && !foundTask) {
                  const taskIdFromFile = Number(taskIdMatch[1]);
                  log.info(`[BotApp] Найден ID задачи в файле: ${taskIdFromFile}`);
                  
                  // Привязываем к найденному ID независимо от того, существует ли задача
                  taskId = taskIdFromFile;
                  foundTask = { id: taskIdFromFile, task: `Задача ID: ${taskIdFromFile}` };
                  await this.bot.sendMessage(chatId, `📎 Файл автоматически привязан к задаче ID: ${taskIdFromFile}`);
                }
             }
             
             if (!foundTask) {
               await this.bot.sendMessage(chatId, `📁 Файл сохранен как артефакт. Чтобы привязать к задаче, напишите: "привязать файл ${fileName} к задаче [ID]"`);
             }
           }
           
           await this.tools.route('save_artifact', {
             taskId: taskId,
             fileName: fileName,
             filePath: localPath,
             fileSize: fileStats.size,
             artifactType: 'documentation'
           }, {
             requesterChatId: String(chatId),
             requesterEmployee: auth.employee
           });
           
           // Отладка - показываем что сохраняем
           await this.bot.sendMessage(chatId, `💾 Сохраняю артефакт с taskId: ${taskId}`);
         } catch (e) {
           log.warn('[FILE] Не удалось сохранить артефакт:', e?.message);
         }
        
      } catch (e) {
        log.error('[FILE ERROR]', e?.message || e);
        await this.bot.sendMessage(chatId, '⚠️ Ошибка обработки файла.');
      }
    }
  }
}
