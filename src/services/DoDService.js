import { query } from '../config/db.js';
import { log } from '../utils/logger.js';

export class DoDService {
    constructor() {
        this.initializeTable();
    }

    async initializeTable() {
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS dod_checklists (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    task_id INT NOT NULL,
                    checklist_type ENUM('development', 'testing', 'deployment', 'documentation') NOT NULL,
                    items JSON NOT NULL,
                    completed_items JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_task_id (task_id),
                    INDEX idx_checklist_type (checklist_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            log.info('[DoD] Таблица dod_checklists инициализирована');
        } catch (error) {
            log.error('[DoD] Ошибка инициализации таблицы:', error.message);
        }
    }

    async createChecklist(taskId, checklistType, items) {
        try {
            const result = await query(
                'INSERT INTO dod_checklists (task_id, checklist_type, items, completed_items) VALUES (?, ?, ?, ?)',
                [taskId, checklistType, JSON.stringify(items), JSON.stringify([])]
            );
            log.info(`[DoD] Чек-лист создан для задачи ${taskId}, тип: ${checklistType}`);
            return { ok: true, id: result.insertId };
        } catch (error) {
            log.error('[DoD] Ошибка создания чек-листа:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async getChecklist(taskId, checklistType) {
        try {
            const [checklist] = await query(
                'SELECT * FROM dod_checklists WHERE task_id = ? AND checklist_type = ?',
                [taskId, checklistType]
            );
            return { ok: true, checklist };
        } catch (error) {
            log.error('[DoD] Ошибка получения чек-листа:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async updateChecklist(taskId, checklistType, completedItems) {
        try {
            await query(
                'UPDATE dod_checklists SET completed_items = ?, updated_at = CURRENT_TIMESTAMP WHERE task_id = ? AND checklist_type = ?',
                [JSON.stringify(completedItems), taskId, checklistType]
            );
            log.info(`[DoD] Чек-лист обновлен для задачи ${taskId}, тип: ${checklistType}`);
            return { ok: true };
        } catch (error) {
            log.error('[DoD] Ошибка обновления чек-листа:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async getDefaultChecklist(checklistType) {
        const checklists = {
            development: [
                'Код написан и отформатирован',
                'Код протестирован локально',
                'Добавлены комментарии к сложным участкам',
                'Проверена производительность',
                'Код соответствует стандартам проекта'
            ],
            testing: [
                'Написаны unit-тесты',
                'Написаны integration-тесты',
                'Проведено тестирование в dev-среде',
                'Проведено тестирование в staging-среде',
                'Все тесты проходят успешно'
            ],
            deployment: [
                'Код замержен в основную ветку',
                'Проведено code review',
                'Проведено тестирование в production',
                'Документация обновлена',
                'Уведомлены заинтересованные стороны'
            ],
            documentation: [
                'README обновлен',
                'API документация обновлена',
                'Созданы примеры использования',
                'Добавлены комментарии к коду',
                'Создан changelog'
            ]
        };

        return checklists[checklistType] || [];
    }

    async isTaskComplete(taskId) {
        try {
            const checklists = await query(
                'SELECT checklist_type, items, completed_items FROM dod_checklists WHERE task_id = ?',
                [taskId]
            );

            if (checklists.length === 0) {
                return { ok: true, complete: false, reason: 'Нет чек-листов' };
            }

            for (const checklist of checklists) {
                const items = JSON.parse(checklist.items || '[]');
                const completed = JSON.parse(checklist.completed_items || '[]');
                
                if (completed.length < items.length) {
                    return { 
                        ok: true, 
                        complete: false, 
                        reason: `Чек-лист ${checklist.checklist_type} не завершен: ${completed.length}/${items.length}` 
                    };
                }
            }

            return { ok: true, complete: true };
        } catch (error) {
            log.error('[DoD] Ошибка проверки завершения задачи:', error.message);
            return { ok: false, error: error.message };
        }
    }
}
