import { assertEnv, ENV } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';
import { ApiClient } from '../src/services/ApiClient.js';
import { parseHumanDateRu, toDbDateTime, setAppTimezone } from '../src/utils/datetime.js';

async function main() {
  try {
    assertEnv();
    setAppTimezone(process.env.TZ || 'Asia/Dushanbe');
    log.info('[BULK] Таймзона:', process.env.TZ);

    const api = new ApiClient();

    // Находим задачи, созданные сегодня директором/менеджером (по assigner в task_assigners)
    const rows = await query(`
      SELECT 
        t.task_id,
        t.task,
        t.employee_id,
        t.deadline,
        t.created_at,
        ta.assigner_employee_id,
        e.name AS assigner_name,
        LOWER(COALESCE(e.user_role, '')) AS assigner_role,
        LOWER(COALESCE(e.job, '')) AS assigner_job
      FROM tasks t
      LEFT JOIN task_assigners ta ON ta.task_id = t.task_id
      LEFT JOIN employees e ON e.employee_id = ta.assigner_employee_id
      WHERE DATE(t.created_at) = CURDATE()
        AND ta.assigner_employee_id IS NOT NULL
        AND (
          LOWER(COALESCE(e.user_role, '')) = 'manager' OR
          COALESCE(e.job, '') REGEXP 'директор|стратегическому развитию'
        )
      ORDER BY t.created_at DESC
    `);

    if (!Array.isArray(rows) || rows.length === 0) {
      log.info('[BULK] Нет задач, созданных сегодня директором/менеджером. Нечего обновлять.');
      return;
    }

    const targetDate = parseHumanDateRu('завтра 10:00', new Date());
    const newDeadline = toDbDateTime(targetDate);
    log.info(`[BULK] Новый дедлайн: ${newDeadline}`);

    let updated = 0;
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
      updated += 1;
      log.info(`[BULK] Задача #${id} → deadline '${newDeadline}' (assigner: ${r.assigner_name || 'unknown'})`);
    }

    log.info(`[BULK] Готово. Обновлено задач: ${updated}/${rows.length}`);
  } catch (err) {
    log.error('[BULK] Ошибка выполнения:', err?.message || err);
    process.exit(1);
  }
}

main();


