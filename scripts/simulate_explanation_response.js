import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

async function simulateExplanationResponse() {
  assertEnv();

  // Pick one pending explanation to simulate a response
  const pending = await query(`
    SELECT id, task_id, employee_id, requested_at
    FROM employee_explanations
    WHERE status = 'pending' AND responded_at IS NULL
    ORDER BY requested_at ASC
    LIMIT 1
  `);

  if (!pending || pending.length === 0) {
    console.log('Нет ожидающих объяснительных для симуляции ответа.');
    return;
  }

  const exp = pending[0];
  const now = new Date();

  await query(`
    UPDATE employee_explanations
    SET
      responded_at = ?,
      explanation_text = ?
    WHERE id = ?
  `, [
    now,
    'Объяснение предоставлено (симуляция).',
    exp.id
  ]);

  console.log(`Симуляция: объяснительная ID ${exp.id} (задача ${exp.task_id}, сотрудник ${exp.employee_id}) отмечена как предоставленная.`);
}

async function main() {
  try {
    await simulateExplanationResponse();
  } catch (e) {
    log.error('[simulate_explanation_response] Ошибка:', e?.message || e);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
