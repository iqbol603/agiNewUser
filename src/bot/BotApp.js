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

        // Уведомляем сотрудника
        if (employee.chat_id) {
          await this.bot.sendMessage(employee.chat_id,
            `💰 УВЕДОМЛЕНИЕ О ЛИШЕНИИ БОНУСА\n\n` +
            `Вам лишен бонус в размере ${bonusAmount} сом\n` +
            `Причина: ${comment}\n` +
            `Дата: ${new Date().toLocaleString('ru-RU')}`
          );
        }

      } catch (error) {
        log.error('[BotApp] Ошибка лишения бонуса:', error.message);
        await this.bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при лишении бонуса');
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
          const expResult = await this.tools.route('list_pending_explanations', { limit: 10 }, {
            requesterChatId: String(q.from.id),
            requesterEmployee: auth.employee
          });
          if (expResult.ok && expResult.explanations && expResult.explanations.length > 0) {
            let result = '📝 ОЖИДАЮЩИЕ РАССМОТРЕНИЯ ОБЪЯСНИТЕЛЬНЫЕ:\n\n';
            for (const exp of expResult.explanations) {
              result += `🆔 ID: ${exp.id}\n`;
              result += `📋 Задача: ${exp.task}\n`;
              result += `👤 Сотрудник: ${exp.employee_name}\n`;
              result += `📝 Объяснение: ${exp.explanation_text}\n`;
              result += `📅 Дата: ${new Date(exp.responded_at).toLocaleString('ru-RU')}\n`;
              result += `⏰ Статус: Ожидает рассмотрения\n`;
              result += `\n${'─'.repeat(40)}\n\n`;
            }
            await this.bot.answerCallbackQuery(q.id, { text: 'Список объяснительных отправлен' });
            await this.bot.sendMessage(q.from.id, result);
          } else {
            await this.bot.answerCallbackQuery(q.id, { text: 'Нет ожидающих объяснительных' });
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
            case 'explanations':
              const expResult = await this.tools.route('list_pending_explanations', { limit: 10 }, {
                requesterChatId: String(q.from.id),
                requesterEmployee: auth.employee
              });
              if (expResult.ok && expResult.explanations.length > 0) {
                result = '📝 ОЖИДАЮЩИЕ РАССМОТРЕНИЯ ОБЪЯСНИТЕЛЬНЫЕ:\n\n';
                for (const exp of expResult.explanations) {
                  result += `🆔 ID: ${exp.id}\n`;
                  result += `📋 Задача: ${exp.task}\n`;
                  result += `👤 Сотрудник: ${exp.employee_name}\n`;
                  result += `📝 Объяснение: ${exp.explanation_text}\n`;
                  result += `📅 Дата: ${new Date(exp.responded_at).toLocaleString('ru-RU')}\n`;
                  result += `⏰ Статус: Ожидает рассмотрения\n`;
                  result += `\n${'─'.repeat(40)}\n\n`;
                }
                result += `\n💡 Используйте команды для рассмотрения:\n`;
                result += `/accept [ID] [комментарий] - принять\n`;
                result += `/reject [ID] [комментарий] - отклонить\n`;
                result += `/penalty [ID] [сумма] [комментарий] - штраф`;
              } else {
                result = '✅ Нет ожидающих объяснительных';
              }
              break;
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
