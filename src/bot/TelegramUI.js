export class TelegramUI {
	static mainMenuInline() {
		return {
			reply_markup: {
				inline_keyboard: [
				[{ text: '➕ Новая задача',    callback_data: 'new_task' }],
				[{ text: '🔄 Обновить статус', callback_data: 'update_status' }],
				[{ text: '👥 Сотрудники',      callback_data: 'employees' }],
				[{ text: '📊 Отчёт',           callback_data: 'report' }]
				]
			}
		};
	}
}