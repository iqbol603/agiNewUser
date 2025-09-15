export class TelegramUI {
	static mainMenuInline() {
		return {
			reply_markup: {
				inline_keyboard: [
					[{ text: '➕ Новая задача', callback_data: 'new_task' }],
					[{ text: '🔄 Обновить статус', callback_data: 'update_status' }],
					[{ text: '👥 Сотрудники', callback_data: 'employees' }],
					[{ text: '📊 Отчёт', callback_data: 'report' }],
					[{ text: '📝 Объяснительные', callback_data: 'explanations' }]
				]
			}
		};
	}

	static leadershipMenuInline() {
		return {
			reply_markup: {
				inline_keyboard: [
					[
						{ text: '📊 Анализ команды', callback_data: 'leadership_team_analysis' },
						{ text: '🎯 Приоритеты', callback_data: 'leadership_priorities' }
					],
					[
						{ text: '🤖 Автоматические решения', callback_data: 'leadership_auto_decide' }
					],
					[
						{ text: '📝 Объяснительные', callback_data: 'leadership_explanations' },
						{ text: '📋 Все задачи', callback_data: 'leadership_all_tasks' }
					],
					[
						{ text: '🔙 Главное меню', callback_data: 'main_menu' }
					]
				]
			}
		};
	}

	static explanationActionsInline(explanationId) {
		return {
			reply_markup: {
				inline_keyboard: [
					[
						{ text: '✅ Принять', callback_data: `accept_exp_${explanationId}` },
						{ text: '❌ Отклонить', callback_data: `reject_exp_${explanationId}` }
					],
					[
						{ text: '💰 Штраф', callback_data: `penalty_exp_${explanationId}` }
					],
					[
						{ text: '🔙 Назад к объяснительным', callback_data: 'leadership_explanations' }
					]
				]
			}
		};
	}
}
