import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';
import { ApiClient } from '../src/services/ApiClient.js';
import { parseHumanDateRu, toDbDateTime, setAppTimezone } from '../src/utils/datetime.js';

async function main() {
  try {
    assertEnv();
    setAppTimezone(process.env.TZ || 'Asia/Dushanbe');

    const api = new ApiClient();

    // Берём только сегодняшние задачи со статусами не 'Завершена' и не 'Отменена'
    const rows = await query(`
      SELECT t.task_id, t.task, t.employee_id, t.deadline, t.status, e.name AS employee_name
      FROM tasks t
      LEFT JOIN employees e ON e.employee_id = t.employee_id
      WHERE DATE(t.created_at) = CURDATE()
        AND COALESCE(t.status,'') NOT IN ('Завершена','Отменена')
      ORDER BY t.created_at DESC
    `);

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('Нет активных задач, созданных сегодня.');
      return;
    }

    const targetDate = parseHumanDateRu('завтра 10:00', new Date());
    const newDeadline = toDbDateTime(targetDate);

    let ok = 0;
    for (const r of rows) {
      const id = String(r.task_id);
      try {
        await api.update('tasks', id, { deadline: newDeadline });
      } catch (apiErr) {
        log.warn(`[BULK] API update failed for task #${id}: ${apiErr?.message || apiErr}`);
      }
      try {
        await query('UPDATE tasks SET deadline = ? WHERE task_id = ?', [newDeadline, id]);
      } catch (dbErr) {
        log.warn(`[BULK] DB update failed for task #${id}: ${dbErr?.message || dbErr}`);
      }
      ok += 1;
      console.log(`#${id} ${r.employee_name || r.employee_id || ''} → ${newDeadline}`);
    }

    console.log(`Готово. Обновлено: ${ok}/${rows.length}`);
  } catch (err) {
    log.error('[BULK ACTIVE] Ошибка:', err?.message || err);
    process.exit(1);
  }
}

main();
