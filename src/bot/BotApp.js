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
import { startExplanationTimeoutService } from '../services/ExplanationTimeoutService.js';
import { startTaskStatusUpdater } from '../services/TaskStatusUpdater.js';
import { startBonusPenaltyService } from '../services/BonusPenaltyService.js';
import { query } from '../config/db.js';

// helper: "879574025" -> 879574025 (если число), иначе строка
function toNumericIfPossible(v) {
  if (v === null || v === undefined) return v;
  const s = String(v).trim();
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

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

    this.api = new ApiClient();
    this.files = new FileStorage();
    this.openai = new OpenAIService();
    this.assistant = new AssistantService({ bot: this.bot }); // <-- фикс
    this.employees = new EmployeesService(this.api);
    this.notifier = new Notifier(this.bot);
    this.explanatory = new ExplanatoryService();
    this.tools = new ToolRouter({ api: this.api, employees: this.employees, notifier: this.notifier });
    this.acl = new AccessControlService({ employees: this.employees });
    this.uiState = new Map();
    this.pendingAssign = new Map();

    this.bindHandlers();
    log.info('BotApp initialized');

	    // 🕒 Ежечасный отчёт директору (Asia/Dushanbe)
    process.env.TZ = process.env.TZ || 'Asia/Dushanbe';
    startDirectorHourlyReportScheduler({ api: this.api, toolRouter: this.tools, notifier: this.notifier, explanatoryService: this.explanatory });
    startAssigneeReminderScheduler5min({ api: this.api, toolRouter: this.tools, notifier: this.notifier });
    
    // 🚨 Мониторинг просроченных объяснительных (каждые 10 минут)
    startExplanationTimeoutService({ 
      toolRouter: this.tools, 
      notifier: this.notifier, 
      explanatoryService: this.explanatory 
    });
    
    // 📝 Автоматическое обновление статуса просроченных задач (каждые 10 минут)
    startTaskStatusUpdater({ 
      toolRouter: this.tools, 
      notifier: this.notifier, 
      api: this.api 
    });
    
    // 💰 Мониторинг бонусов и лишение за 3+ объяснительных в месяц (каждые 6 часов)
    startBonusPenaltyService({ 
      toolRouter: this.tools, 
      notifier: this.notifier 
    });
  }

  bindHandlers() {
    this.bot.onText(/^(\/start|\/menu)$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed) return;

      // Если пользователь - менеджер, показываем панель руководства
      if (auth.employee.user_role === 'manager') {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📊 Анализ команды', callback_data: 'leadership_analyze_team' },
                { text: '🎯 Стратегический отчет', callback_data: 'leadership_strategic_report' }
              ],
              [
                { text: '💡 Рекомендации по улучшению', callback_data: 'leadership_suggest_improvements' },
                { text: '🤖 Автоматические решения', callback_data: 'leadership_auto_decide' }
              ],
              [
                { text: '📝 Объяснительные', callback_data: 'leadership_explanations' },
                { text: '🚫 Лишение бонусов', callback_data: 'leadership_penalty_candidates' }
              ],
              [
                { text: '📋 Все задачи', callback_data: 'leadership_all_tasks' }
              ],
              [
                { text: '🔍 ИИ-помощник', callback_data: 'ai_assistant' },
                { text: '🔄 Обновить', callback_data: 'leadership_refresh' }
              ]
            ]
          }
        };

        await this.bot.sendMessage(
          msg.chat.id,
          `👑 **Добро пожаловать, ${auth.employee.name}!**\n\n` +
          'Вы вошли как **РУКОВОДИТЕЛЬ** с полным доступом к функциям управления командой.\n\n' +
          'Выберите действие:',
          { parse_mode: 'Markdown', ...keyboard }
        );
      } else {
        // Обычное меню для сотрудников
        await this.bot.sendMessage(
          msg.chat.id,
          `👋 Добро пожаловать, ${auth.employee.name}!\n\n` +
          '🔍 Пришлите текст или голосовой вопрос — я спрошу ИИ-агента и/или выполню действия с задачами.\n\nГлавное меню:',
          TelegramUI.mainMenuInline()
        );
      }
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

    // Обновление задачи (только для менеджеров/директоров)
    // Формат: /update_task <id> [title="..."] [desc="..."] [deadline="..."] [priority=...] [assignee="ФИО"]
    this.bot.onText(/^\/update_task\s+(\d+)(.*)$/i, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только руководители могут обновлять задачи.');
        return;
      }

      const taskId = Number(match[1]);
      const rest = match[2] || '';

      // Примитивный парсер аргументов вида key="value" key=value
      const args = {};
      const regexKV = /(title|desc|deadline|priority|assignee)\s*=\s*("([^"]*)"|([^\s]+))/gi;
      let m;
      while ((m = regexKV.exec(rest)) !== null) {
        const key = m[1];
        const val = (m[3] ?? m[4] ?? '').trim();
        args[key] = val;
      }

      // Мэппинг аргументов
      const payload = { taskId };
      if (args.title) payload.title = args.title;
      if (args.desc) payload.desc = args.desc;
      if (args.deadline) payload.deadline = args.deadline;
      if (args.priority) payload.priority = args.priority;
      if (args.assignee) payload.assigneeName = args.assignee;

      try {
        const res = await this.tools.route('update_task', payload, {
          requesterChatId: String(msg.chat.id),
          requesterEmployee: auth.employee
        });
        if (res.ok) {
          await this.bot.sendMessage(msg.chat.id, `✅ Задача #${taskId} обновлена.`);
        } else {
          await this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${res.error}`);
        }
      } catch (e) {
        await this.bot.sendMessage(msg.chat.id, `❌ Ошибка обновления задачи: ${e?.message || e}`);
      }
    });

    // Установить дедлайн (менеджер/директор)
    // Пример: /set_deadline 3 "через 10 минут"
    this.bot.onText(/^\/set_deadline\s+(\d+)\s+(.+)$/i, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только руководители могут менять дедлайны.');
        return;
      }
      const taskId = Number(match[1]);
      const deadline = match[2].trim();
      try {
        const res = await this.tools.route('set_deadline', { taskId, deadline }, {
          requesterChatId: String(msg.chat.id),
          requesterEmployee: auth.employee
        });
        if (res.ok) {
          await this.bot.sendMessage(msg.chat.id, `✅ Дедлайн задачи #${taskId} обновлен на: ${res.deadline}`);
        } else {
          await this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${res.error}`);
        }
      } catch (e) {
        await this.bot.sendMessage(msg.chat.id, `❌ Ошибка изменения дедлайна: ${e?.message || e}`);
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

    // Команда для лишения бонуса (3+ объяснительных в месяц)
    this.bot.onText(/^\/penalty_bonus\s+(\d+)\s+(\d+)\s+(.+)$/, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен.');
        return;
      }

      const employeeId = Number(match[1]);
      const bonusAmount = Number(match[2]);
      const comment = match[3];

      try {
        // Получаем информацию о сотруднике
        const employees = await this.api.get('employees');
        const employee = employees.find(emp => emp.employee_id === employeeId);
        
        if (!employee) {
          await this.bot.sendMessage(msg.chat.id, '❌ Сотрудник не найден');
          return;
        }

        log.info(`[BotApp] Лишение бонуса: ${employee.name}, сумма: ${bonusAmount}, причина: ${comment}`);

        await this.bot.sendMessage(msg.chat.id, 
          `💰 БОНУС ЛИШЕН\n\n` +
          `Сотрудник: ${employee.name}\n` +
          `Сумма: ${bonusAmount} сом\n` +
          `Причина: ${comment}\n` +
          `Дата: ${new Date().toLocaleString('ru-RU')}`
        );

        // Уведомляем сотрудника (если есть chat_id и чат доступен)
        try {
          if (employee.chat_id) {
            await this.bot.sendMessage(
              toNumericIfPossible(employee.chat_id),
              `💰 УВЕДОМЛЕНИЕ О ЛИШЕНИИ БОНУСА\n\n` +
              `Вам лишен бонус в размере ${bonusAmount} сом\n` +
              `Причина: ${comment}\n` +
              `Дата: ${new Date().toLocaleString('ru-RU')}`
            );
          } else {
            await this.bot.sendMessage(msg.chat.id, '⚠️ У сотрудника не указан chat_id — личное уведомление не отправлено.');
          }
        } catch (notifyErr) {
          log.error('[BotApp] Ошибка лишения бонуса:', notifyErr?.message || notifyErr);
          await this.bot.sendMessage(msg.chat.id, '⚠️ Не удалось отправить уведомление сотруднику (возможно, чат не найден).');
        }

        // Уведомляем всех сотрудников о лишении бонуса
        try {
          const allEmployees = await this.api.get('employees');
          const notificationMessage = `🚨 УВЕДОМЛЕНИЕ ВСЕМ СОТРУДНИКАМ\n\n` +
            `Сотрудник ${employee.name} лишен бонуса в размере ${bonusAmount} сом\n` +
            `Причина: ${comment}\n` +
            `Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `Это уведомление отправлено для поддержания дисциплины в команде.`;

          for (const emp of allEmployees) {
            if (emp.chat_id && emp.employee_id !== employeeId) {
              try {
                await this.bot.sendMessage(emp.chat_id, notificationMessage);
              } catch (notifyError) {
                log.warn(`[BotApp] Не удалось уведомить сотрудника ${emp.name}:`, notifyError.message);
              }
            }
          }
        } catch (notifyAllError) {
          log.error('[BotApp] Ошибка уведомления всех сотрудников:', notifyAllError.message);
        }

      } catch (error) {
        log.error('[BotApp] Ошибка лишения бонуса:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при лишении бонуса');
      }
    });

    // Команда для предоставления дополнительного часа на объяснительную
    this.bot.onText(/^\/give_extra_hour\s+(\d+)$/, async (msg, match) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только менеджеры могут давать дополнительное время.');
        return;
      }

      const employeeId = match[1];
      
      try {
        // Обновляем время запроса объяснительных для этого сотрудника на текущее время
        const { query } = await import('../config/db.js');
        await query(`
          UPDATE employee_explanations 
          SET requested_at = NOW() 
          WHERE employee_id = ? AND status = 'pending'
        `, [employeeId]);

        // Получаем информацию о сотруднике
        const [employeeRows] = await query(`
          SELECT name, chat_id FROM employees WHERE employee_id = ?
        `, [employeeId]);

        if (employeeRows && employeeRows.chat_id) {
          // Уведомляем сотрудника
          await this.notifier.sendText(
            employeeRows.chat_id,
            `⏰ ВАМ ПРЕДОСТАВЛЕНО ДОПОЛНИТЕЛЬНОЕ ВРЕМЯ\n\n` +
            `Директор дал вам дополнительный час для предоставления объяснительных.\n` +
            `Пожалуйста, отправьте объяснительные в течение часа.\n\n` +
            `Используйте команду: /explanation [ID_задачи] [ваше_объяснение]`
          );
        }

        await this.bot.sendMessage(
          msg.chat.id,
          `✅ Сотруднику ${employeeRows?.name || 'ID: ' + employeeId} предоставлен дополнительный час для объяснительных`
        );
      } catch (error) {
        log.error('[BotApp] Ошибка предоставления дополнительного времени:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при предоставлении дополнительного времени');
      }
    });

    // Команды руководства - только для менеджеров
    this.bot.onText(/^\/analyze_team$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только менеджеры могут анализировать команду.');
        return;
      }

      try {
        const { DecisionEngine } = await import('../services/DecisionEngine.js');
        const { LeadershipCommands } = await import('../services/LeadershipCommands.js');
        
        const decisionEngine = new DecisionEngine(this.api, this.employees);
        const leadership = new LeadershipCommands(decisionEngine, this.tools);
        
        const analysis = await leadership.analyzeTeam();
        await this.bot.sendMessage(msg.chat.id, analysis);
      } catch (error) {
        log.error('[BotApp] Ошибка анализа команды:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при анализе команды.');
      }
    });

    this.bot.onText(/^\/strategic_report$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только менеджеры могут просматривать стратегические отчеты.');
        return;
      }

      try {
        const { DecisionEngine } = await import('../services/DecisionEngine.js');
        const { LeadershipCommands } = await import('../services/LeadershipCommands.js');
        
        const decisionEngine = new DecisionEngine(this.api, this.employees);
        const leadership = new LeadershipCommands(decisionEngine, this.tools);
        
        const report = await leadership.generateStrategicReport();
        await this.bot.sendMessage(msg.chat.id, report);
      } catch (error) {
        log.error('[BotApp] Ошибка стратегического отчета:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при генерации стратегического отчета.');
      }
    });

    this.bot.onText(/^\/suggest_improvements$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только менеджеры могут получать рекомендации по улучшению.');
        return;
      }

      try {
        const { DecisionEngine } = await import('../services/DecisionEngine.js');
        const { LeadershipCommands } = await import('../services/LeadershipCommands.js');
        
        const decisionEngine = new DecisionEngine(this.api, this.employees);
        const leadership = new LeadershipCommands(decisionEngine, this.tools);
        
        const suggestions = await leadership.suggestImprovements();
        await this.bot.sendMessage(msg.chat.id, suggestions);
      } catch (error) {
        log.error('[BotApp] Ошибка рекомендаций:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при генерации рекомендаций.');
      }
    });

    this.bot.onText(/^\/auto_decide$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только менеджеры могут принимать автоматические решения.');
        return;
      }

      try {
        const { DecisionEngine } = await import('../services/DecisionEngine.js');
        const { LeadershipCommands } = await import('../services/LeadershipCommands.js');
        
        const decisionEngine = new DecisionEngine(this.api, this.employees);
        const leadership = new LeadershipCommands(decisionEngine, this.tools);
        
        const decisions = await leadership.autoDecideOnTasks();
        await this.bot.sendMessage(msg.chat.id, decisions);
      } catch (error) {
        log.error('[BotApp] Ошибка автоматических решений:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при принятии автоматических решений.');
      }
    });

    // Команда для показа кнопок руководства
    this.bot.onText(/^\/leadership$/, async (msg) => {
      const auth = await this.acl.authorize(msg.from?.id);
      if (!auth.allowed || auth.employee.user_role !== 'manager') {
        await this.bot.sendMessage(msg.chat.id, '❌ Доступ запрещен. Только менеджеры могут использовать команды руководства.');
        return;
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Анализ команды', callback_data: 'leadership_analyze_team' },
              { text: '🎯 Стратегический отчет', callback_data: 'leadership_strategic_report' }
            ],
            [
              { text: '💡 Рекомендации по улучшению', callback_data: 'leadership_suggest_improvements' },
              { text: '🤖 Автоматические решения', callback_data: 'leadership_auto_decide' }
            ],
            [
              { text: '📝 Объяснительные', callback_data: 'leadership_explanations' },
              { text: '📋 Все задачи', callback_data: 'leadership_all_tasks' }
            ],
            [
              { text: '🔄 Обновить', callback_data: 'leadership_refresh' },
              { text: '❌ Закрыть', callback_data: 'leadership_close' }
            ]
          ]
        }
      };

      await this.bot.sendMessage(msg.chat.id, 
        '👑 **ПАНЕЛЬ РУКОВОДИТЕЛЯ**\n\n' +
        'Выберите действие для управления командой:', 
        { parse_mode: 'Markdown', ...keyboard }
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

  async onCallbackQuery(q) {
    try {
      const auth = await this.acl.authorize(q.from?.id);
      if (!auth.allowed) {
        await this.bot.answerCallbackQuery(q.id, { text: 'Доступ запрещён', show_alert: true });
        return;
      }

      const data = q.data || '';

      // Обработка обычных кнопок для всех сотрудников
      if (data === 'new_task') {
        const result = '➕ Для создания новой задачи используйте команду:\n/create_task [название задачи] [описание] [приоритет] [дедлайн]\n\nПример:\n/create_task Разработать API Высокий 2024-01-15';
        await this.bot.answerCallbackQuery(q.id, { text: 'Инструкция отправлена' });
        await this.bot.sendMessage(q.from.id, result);
        return;
      }
      
      if (data === 'update_status') {
        const result = '🔄 Для обновления статуса задачи используйте команду:\n/update_task [ID_задачи] [новый_статус]\n\nПример:\n/update_task 123 В работе';
        await this.bot.answerCallbackQuery(q.id, { text: 'Инструкция отправлена' });
        await this.bot.sendMessage(q.from.id, result);
        return;
      }
      
      if (data === 'employees') {
        try {
          const empResult = await this.tools.route('list_employees', {}, {
            requesterChatId: String(q.from.id),
            requesterEmployee: auth.employee
          });
          if (empResult.ok && empResult.employees && empResult.employees.length > 0) {
            let result = '👥 СПИСОК СОТРУДНИКОВ:\n\n';
            for (const emp of empResult.employees) {
              result += `👤 ${emp.name}\n`;
              result += `💼 Должность: ${emp.job || emp.position || 'Не указана'}\n`;
              result += `📱 Chat ID: ${emp.chat_id || emp.tg_user_id || 'Не указан'}\n`;
              result += `🔑 Роль: ${emp.user_role || 'Не указана'}\n`;
              result += `\n${'─'.repeat(30)}\n\n`;
            }
            await this.bot.answerCallbackQuery(q.id, { text: 'Список сотрудников отправлен' });
            await this.bot.sendMessage(q.from.id, result);
          } else {
            await this.bot.answerCallbackQuery(q.id, { text: 'Не удалось получить список сотрудников' });
          }
        } catch (error) {
          await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка получения списка сотрудников' });
        }
        return;
      }
      
      if (data === 'report') {
        try {
          const reportResult = await this.tools.route('get_report', {}, {
            requesterChatId: String(q.from.id),
            requesterEmployee: auth.employee
          });
          if (reportResult.ok) {
            const result = reportResult.report || '📊 Отчет готов';
            await this.bot.answerCallbackQuery(q.id, { text: 'Отчет отправлен' });
            await this.bot.sendMessage(q.from.id, result);
          } else {
            await this.bot.answerCallbackQuery(q.id, { text: 'Не удалось получить отчет' });
          }
        } catch (error) {
          await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка получения отчета' });
        }
        return;
      }
      
      if (data === 'explanations') {
        try {
          if (auth.employee.user_role === 'manager') {
            const all = await this.tools.route('list_all_explanations', { limit: 10 }, {
              requesterChatId: String(q.from.id),
              requesterEmployee: auth.employee
            });
            if (all.ok) {
              let result = '🗂 ОБЪЯСНИТЕЛЬНЫЕ (для менеджера)\n\n';
              const sections = [
                { title: '⏳ Ожидают ответа сотрудника', list: all.awaitingUser || [] },
                { title: '📝 Ожидают рассмотрения', list: all.forReview || [] },
                { title: '✅ Решённые', list: all.resolved || [] }
              ];
              for (const s of sections) {
                result += `${s.title}:\n`;
                if (s.list.length === 0) {
                  result += '  —\n\n';
                  continue;
                }
                for (const exp of s.list) {
                  result += `  • ID:${exp.id} | Task:${exp.task_id} | ${exp.employee_name || '—'} | ${exp.status}` + (exp.responded_at ? ` | ответ: ${new Date(exp.responded_at).toLocaleString('ru-RU')}` : '') + '\n';
                }
                result += '\n';
              }
              await this.bot.answerCallbackQuery(q.id, { text: 'Сводка объяснительных' });
              await this.bot.sendMessage(q.from.id, result);
            } else {
              await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка загрузки объяснительных' });
            }
          } else {
            const myExp = await this.tools.route('list_my_explanations', { limit: 10 }, {
              requesterChatId: String(q.from.id),
              requesterEmployee: auth.employee
            });
            if (myExp.ok && Array.isArray(myExp.explanations) && myExp.explanations.length > 0) {
              let result = '🗂 МОИ ОБЪЯСНИТЕЛЬНЫЕ:\n\n';
              for (const exp of myExp.explanations) {
                result += `🆔 ID: ${exp.id}\n`;
                result += `📋 Задача: ${exp.task || '—'}\n`;
                result += `⏳ Запрошено: ${exp.requested_at ? new Date(exp.requested_at).toLocaleString('ru-RU') : '—'}\n`;
                result += `📝 Текст: ${exp.explanation_text || '—'}\n`;
                result += `📅 Ответ: ${exp.responded_at ? new Date(exp.responded_at).toLocaleString('ru-RU') : '—'}\n`;
                result += `⏰ Статус: ${exp.status}\n`;
                result += `\n${'─'.repeat(40)}\n\n`;
              }
              await this.bot.answerCallbackQuery(q.id, { text: 'Ваши объяснительные отправлены' });
              await this.bot.sendMessage(q.from.id, result);
            } else {
              await this.bot.answerCallbackQuery(q.id, { text: 'У вас нет объяснительных' });
            }
          }
        } catch (error) {
          await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка получения объяснительных' });
        }
        return;
      }

      // Обработка кнопок руководства
      if (data.startsWith('leadership_')) {
        if (auth.employee.user_role !== 'manager') {
          await this.bot.answerCallbackQuery(q.id, { text: 'Только менеджеры могут использовать команды руководства', show_alert: true });
          return;
        }

        // Обработка запроса отчёта по объяснительным: leadership_explanations_report|<months>
        if (data.startsWith('leadership_explanations_report|')) {
          const parts = data.split('|');
          const months = Math.max(1, parseInt(parts[1] || '1', 10) || 1);
          try {
            // Вычисляем начало периода по requested_at
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1, 0, 0, 0);

            const rows = await query(`
              SELECT 
                e.employee_id,
                e.name AS employee_name,
                e.job AS employee_job,
                COUNT(ee.id) AS requested,
                SUM(CASE WHEN ee.responded_at IS NOT NULL THEN 1 ELSE 0 END) AS provided
              FROM employees e
              LEFT JOIN employee_explanations ee 
                ON ee.employee_id = e.employee_id 
               AND ee.requested_at >= ?
              GROUP BY e.employee_id, e.name, e.job
            `, [start]);

            // Формируем краткий отчёт (сортировка по не написано)
            const enriched = rows.map(r => ({
              employee_id: r.employee_id,
              name: r.employee_name || '—',
              job: r.employee_job || '—',
              requested: Number(r.requested || 0),
              provided: Number(r.provided || 0),
              missing: Math.max(0, Number(r.requested || 0) - Number(r.provided || 0))
            })).sort((a, b) => b.missing - a.missing || b.requested - a.requested || a.name.localeCompare(b.name));

            const header = `📝 Отчет по объяснительным (за ${months === 1 ? 'текущий месяц' : months + ' мес.'})`;
            let text = `${header}\n\n`;
            const top = enriched.slice(0, 15);
            if (top.length === 0) {
              text += 'Нет данных за выбранный период.';
            } else {
              for (const r of top) {
                text += `• ${r.name}: запрошено=${r.requested}, написано=${r.provided}, не написано=${r.missing}\n`;
              }
              if (enriched.length > top.length) {
                text += `\n… и еще ${enriched.length - top.length} сотрудников`;
              }
            }

            // Кнопки для смены периода
            const keyboard = {
              inline_keyboard: [
                [
                  { text: '1 мес', callback_data: 'leadership_explanations_report|1' },
                  { text: '3 мес', callback_data: 'leadership_explanations_report|3' },
                  { text: '6 мес', callback_data: 'leadership_explanations_report|6' }
                ],
                [ { text: '🔙 Назад', callback_data: 'leadership_refresh' } ]
              ]
            };

            // Обновляем сообщение, если возможно, иначе отправляем новое
            try {
              await this.bot.editMessageText(text, {
                chat_id: q.message.chat.id,
                message_id: q.message.message_id,
                reply_markup: keyboard
              });
            } catch {
              await this.bot.sendMessage(q.message.chat.id, text, { reply_markup: keyboard });
            }

            await this.bot.answerCallbackQuery(q.id, { text: 'Отчёт обновлён' });
          } catch (e) {
            log.error('[LEADERSHIP_EXPLANATIONS_REPORT]', e?.message || e);
            await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка формирования отчёта' });
          }
          return;
        }

        // Кандидаты на лишение бонусов
        if (data === 'leadership_penalty_candidates') {
          try {
            const days = 30;
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const rows = await query(`
              SELECT 
                e.employee_id,
                e.name AS employee_name,
                e.job AS employee_job,
                COUNT(ee.id) AS explanation_count
              FROM employees e
              LEFT JOIN employee_explanations ee 
                ON ee.employee_id = e.employee_id 
               AND ee.requested_at >= ?
              GROUP BY e.employee_id, e.name, e.job
              HAVING explanation_count >= 3
              ORDER BY explanation_count DESC, e.name ASC
            `, [since]);

            if (!rows || rows.length === 0) {
              await this.bot.sendMessage(q.message.chat.id, '✅ Кандидатов на лишение бонусов за последние 30 дней не найдено.');
            } else {
              let text = '🚫 Кандидаты на лишение бонусов (за 30 дней, ≥3 объяснительных):\n\n';
              const keyboard = { inline_keyboard: [] };
              for (const r of rows.slice(0, 10)) {
                text += `• ${r.employee_name} (${r.employee_job || '—'}) — объяснительных: ${r.explanation_count}\n`;
                keyboard.inline_keyboard.push([
                  { text: `Лишить (${r.employee_name})`, callback_data: `leadership_penalty_prompt|${r.employee_id}` },
                  { text: 'Помиловать', callback_data: `leadership_penalty_pardon|${r.employee_id}` },
                  { text: 'Дать шанс', callback_data: `leadership_penalty_warn|${r.employee_id}` }
                ]);
              }
              if (rows.length > 10) {
                text += `\n… и еще ${rows.length - 10} кандидатов`;
              }
              keyboard.inline_keyboard.push([{ text: '🔙 Назад', callback_data: 'leadership_refresh' }]);
              await this.bot.sendMessage(q.message.chat.id, text, { reply_markup: keyboard });
            }
            await this.bot.answerCallbackQuery(q.id, { text: 'Список кандидатов' });
          } catch (e) {
            log.error('[LEADERSHIP_PENALTY_CANDIDATES]', e?.message || e);
            await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка формирования списка' });
          }
          return;
        }

        // Действия по кандидату: лишить/помиловать/дать шанс
        if (data.startsWith('leadership_penalty_prompt|')) {
          const empId = Number(data.split('|')[1]);
          // Быстрый выбор сумм
          const kb = {
            inline_keyboard: [
              [
                { text: '500', callback_data: `leadership_penalty_apply|${empId}|500` },
                { text: '1000', callback_data: `leadership_penalty_apply|${empId}|1000` },
                { text: '1500', callback_data: `leadership_penalty_apply|${empId}|1500` }
              ],
              [ { text: 'Отмена', callback_data: 'leadership_refresh' } ]
            ]
          };
          await this.bot.sendMessage(q.message.chat.id, `Выберите сумму лишения бонуса для сотрудника ID ${empId}:`, { reply_markup: kb });
          await this.bot.answerCallbackQuery(q.id, { text: 'Выбор суммы' });
          return;
        }

        // Применение лишения бонуса по кнопке (без команды)
        if (data.startsWith('leadership_penalty_apply|')) {
          const [, empIdStr, amountStr] = data.split('|');
          const employeeId = Number(empIdStr);
          const bonusAmount = Number(amountStr);
          const comment = 'Решение директора через панель';
          try {
            const employees = await this.api.get('employees');
            const employee = employees.find(emp => emp.employee_id === employeeId);

            if (!employee) {
              await this.bot.answerCallbackQuery(q.id, { text: 'Сотрудник не найден', show_alert: true });
              return;
            }

            log.info(`[BotApp] Лишение бонуса (кнопка): ${employee.name}, сумма: ${bonusAmount}, причина: ${comment}`);

            await this.bot.sendMessage(q.message.chat.id,
              `💰 БОНУС ЛИШЕН\n\n` +
              `Сотрудник: ${employee.name}\n` +
              `Сумма: ${bonusAmount} сом\n` +
              `Причина: ${comment}\n` +
              `Дата: ${new Date().toLocaleString('ru-RU')}`
            );

            try {
              if (employee.chat_id) {
                await this.bot.sendMessage(
                  toNumericIfPossible(employee.chat_id),
                  `💰 УВЕДОМЛЕНИЕ О ЛИШЕНИИ БОНУСА\n\n` +
                  `Вам лишен бонус в размере ${bonusAmount} сом\n` +
                  `Причина: ${comment}\n` +
                  `Дата: ${new Date().toLocaleString('ru-RU')}`
                );
              } else {
                await this.bot.sendMessage(q.message.chat.id, '⚠️ У сотрудника не указан chat_id — личное уведомление не отправлено.');
              }
            } catch (notifyErr) {
              log.warn(`[BotApp] Не удалось уведомить сотрудника ${employee.name}:`, notifyErr?.message || notifyErr);
              await this.bot.sendMessage(q.message.chat.id, '⚠️ Не удалось отправить уведомление сотруднику (возможно, чат не найден).');
            }

            await this.bot.answerCallbackQuery(q.id, { text: 'Готово' });
          } catch (e) {
            log.error('[BotApp] Ошибка лишения бонуса (кнопка):', e?.message || e);
            await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка применения', show_alert: true });
          }
          return;
        }
        if (data.startsWith('leadership_penalty_pardon|')) {
      const empId = Number(data.split('|')[1]);
      await this.bot.sendMessage(q.message.chat.id, `✅ Помилование: сотрудник ID ${empId}.`);
      try {
        const employees = await this.api.get('employees');
        const employee = employees.find(emp => emp.employee_id === empId);
        if (employee?.chat_id) {
          await this.bot.sendMessage(
            toNumericIfPossible(employee.chat_id),
            '✅ По решению директора лишение бонуса не применяется. Продолжайте работу.'
          );
        }
      } catch {}
          await this.bot.answerCallbackQuery(q.id, { text: 'Помилован' });
          return;
        }
        if (data.startsWith('leadership_penalty_warn|')) {
      const empId = Number(data.split('|')[1]);
      await this.bot.sendMessage(q.message.chat.id, `⚠️ Дать шанс: сотрудник ID ${empId}. Контроль в следующем месяце.`);
      try {
        const employees = await this.api.get('employees');
        const employee = employees.find(emp => emp.employee_id === empId);
        if (employee?.chat_id) {
          await this.bot.sendMessage(
            toNumericIfPossible(employee.chat_id),
            '⚠️ Директор дал шанс исправиться. Пожалуйста, улучшите показатели. Контроль — в следующем месяце.'
          );
        }
      } catch {}
          await this.bot.answerCallbackQuery(q.id, { text: 'Шанс дан' });
          return;
        }

        try {
          const { DecisionEngine } = await import('../services/DecisionEngine.js');
          const { LeadershipCommands } = await import('../services/LeadershipCommands.js');
          
          const decisionEngine = new DecisionEngine(this.api, this.employees);
          const leadership = new LeadershipCommands(decisionEngine, this.tools);
          
          let result = '';
          
          switch (data) {
            case 'leadership_analyze_team':
              result = await leadership.analyzeTeam();
              break;
            case 'leadership_strategic_report':
              result = await leadership.generateStrategicReport();
              break;
            case 'leadership_suggest_improvements':
              result = await leadership.suggestImprovements();
              break;
            case 'leadership_auto_decide':
              result = await leadership.autoDecideOnTasks();
              break;
            case 'leadership_explanations':
            case 'explanations': {
              // Меню отчётов по объяснительным для директора
              const text = '📝 Объяснительные — выберите период отчёта:';
              const keyboard = {
                inline_keyboard: [
                  [
                    { text: '1 мес', callback_data: 'leadership_explanations_report|1' },
                    { text: '3 мес', callback_data: 'leadership_explanations_report|3' },
                    { text: '6 мес', callback_data: 'leadership_explanations_report|6' }
                  ],
                  [ { text: '🔙 Назад', callback_data: 'leadership_refresh' } ]
                ]
              };
              await this.bot.sendMessage(q.message.chat.id, text, { reply_markup: keyboard });
              result = '';
              break;
            }
            case 'leadership_all_tasks':
              const tasksResult = await this.tools.route('list_tasks', {}, {
                requesterChatId: String(q.from.id),
                requesterEmployee: auth.employee
              });
              if (Array.isArray(tasksResult)) {
                result = `📋 Всего задач: ${tasksResult.length}\n\n`;
                for (const task of tasksResult.slice(0, 10)) {
                  result += `#${task.task_id} - ${task.task} (${task.status})\n`;
                }
                if (tasksResult.length > 10) {
                  result += `\n... и еще ${tasksResult.length - 10} задач`;
                }
              } else {
                result = '❌ Ошибка получения задач';
              }
              break;
            case 'leadership_refresh':
              // Обновляем панель руководства
              const keyboard = {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '📊 Анализ команды', callback_data: 'leadership_analyze_team' },
                      { text: '🎯 Стратегический отчет', callback_data: 'leadership_strategic_report' }
                    ],
                    [
                      { text: '💡 Рекомендации по улучшению', callback_data: 'leadership_suggest_improvements' },
                      { text: '🤖 Автоматические решения', callback_data: 'leadership_auto_decide' }
                    ],
                    [
                      { text: '📝 Объяснительные', callback_data: 'leadership_explanations' },
                      { text: '🚫 Лишение бонусов', callback_data: 'leadership_penalty_candidates' }
                    ],
                    [
                      { text: '📋 Все задачи', callback_data: 'leadership_all_tasks' }
                    ],
                    [
                      { text: '🔄 Обновить', callback_data: 'leadership_refresh' },
                      { text: '❌ Закрыть', callback_data: 'leadership_close' }
                    ]
                  ]
                }
              };
              
              await this.bot.editMessageText(
                '👑 **ПАНЕЛЬ РУКОВОДИТЕЛЯ**\n\nВыберите действие для управления командой:',
                {
                  chat_id: q.message.chat.id,
                  message_id: q.message.message_id,
                  parse_mode: 'Markdown',
                  ...keyboard
                }
              );
              await this.bot.answerCallbackQuery(q.id, { text: 'Панель обновлена' });
              return;
            case 'leadership_close':
              await this.bot.deleteMessage(q.message.chat.id, q.message.message_id);
              await this.bot.answerCallbackQuery(q.id, { text: 'Панель закрыта' });
              return;
            case 'ai_assistant':
              await this.bot.sendMessage(q.message.chat.id, 
                '🔍 **ИИ-ПОМОЩНИК РУКОВОДИТЕЛЯ**\n\n' +
                'Теперь вы можете задавать вопросы в свободной форме. Я буду отвечать как опытный руководитель:\n\n' +
                '• Анализировать ситуацию и предлагать решения\n' +
                '• Принимать решения на основе данных\n' +
                '• Давать стратегические рекомендации\n' +
                '• Помогать с управлением командой\n\n' +
                'Просто напишите ваш вопрос или задачу!',
                { parse_mode: 'Markdown' }
              );
              await this.bot.answerCallbackQuery(q.id, { text: 'ИИ-помощник активирован' });
              return;
            default:
              await this.bot.answerCallbackQuery(q.id, { text: 'Неизвестная команда' });
              return;
          }
          
          if (result) {
            await this.bot.sendMessage(q.message.chat.id, result);
            await this.bot.answerCallbackQuery(q.id, { text: 'Готово' });
          }
        } catch (error) {
          log.error('[BotApp] Ошибка выполнения команды руководства:', error.message);
          await this.bot.answerCallbackQuery(q.id, { text: 'Ошибка выполнения команды' });
        }
        return;
      }

      // Обработка кнопок объяснительных
      if (q.data.startsWith('accept_exp_') || q.data.startsWith('reject_exp_') || q.data.startsWith('penalty_exp_')) {
        const action = q.data.split('_')[0]; // accept, reject, penalty
        const expId = q.data.split('_')[2]; // ID объяснительной
        
        let result = '';
        if (action === 'accept') {
          result = `✅ Объяснительная ${expId} принята автоматически.\n\nДля добавления комментария используйте команду:\n/accept ${expId} [ваш комментарий]`;
        } else if (action === 'reject') {
          result = `❌ Объяснительная ${expId} отклонена автоматически.\n\nДля добавления комментария используйте команду:\n/reject ${expId} [ваш комментарий]`;
        } else if (action === 'penalty') {
          result = `💰 Для наложения штрафа по объяснительной ${expId} используйте команду:\n/penalty ${expId} [сумма] [комментарий]`;
        }
        
        await this.bot.sendMessage(q.message.chat.id, result);
        await this.bot.answerCallbackQuery(q.id, { text: 'Действие выполнено' });
        return;
      }

      // Остальная логика обработки callback_query...
      // (существующий код остается без изменений)

    } catch (error) {
      log.error('[BotApp] Ошибка в onCallbackQuery:', error.message);
      await this.bot.answerCallbackQuery(q.id, { text: 'Произошла ошибка' });
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
      const aiReply = await this.assistant.ask(msg.text, { chatId: String(chatId), employee: auth.employee });

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
        const aiReply = await this.assistant.ask(text, { chatId: String(chatId), employee: auth.employee });
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
          const aiReply = await this.assistant.ask(`Анализируй содержимое файла ${fileName}: ${content.substring(0, 2000)}`, { chatId: String(chatId), employee: auth.employee });
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
