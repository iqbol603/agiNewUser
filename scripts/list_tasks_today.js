import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

async function main() {
  try {
    assertEnv();
    const rows = await query(`
      SELECT 
        t.task_id,
        t.task,
        t.employee_id,
        t.deadline,
        t.status,
        t.created_at,
        e.name AS employee_name
      FROM tasks t
      LEFT JOIN employees e ON e.employee_id = t.employee_id
      WHERE DATE(t.created_at) = CURDATE()
      ORDER BY t.created_at DESC
    `);

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('Нет задач, созданных сегодня.');
      return;
    }

    console.log('Сегодняшние задачи:');
    for (const r of rows) {
      const id = r.task_id;
      const title = r.task;
      const assignee = r.employee_name || r.employee_id || 'неизвестно';
      const deadline = r.deadline || '—';
      const status = r.status || '—';
      console.log(`#${id}	${assignee}	${deadline}	${status}	${title}`);
    }
  } catch (err) {
    log.error('[LIST] Ошибка:', err?.message || err);
    process.exit(1);
  }
}

main();


