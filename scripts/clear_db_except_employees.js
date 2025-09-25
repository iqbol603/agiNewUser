#!/usr/bin/env node
import { query } from '../src/config/db.js';

async function main() {
  try {
    // Получаем список таблиц
    const rows = await query('SHOW TABLES');
    const key = Object.keys(rows[0] || {})[0];
    const tables = rows.map(r => r[key]);

    const keep = new Set(['employees']);
    const toTruncate = tables.filter(t => !keep.has(String(t).toLowerCase()))
      // На всякий случай пропустим служебные
      .filter(t => !/^mysql|^sys|^information_schema|^performance_schema/i.test(t));

    console.log('Truncating tables (except employees):', toTruncate);

    await query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of toTruncate) {
      try {
        await query(`TRUNCATE TABLE \`${t}\``);
        console.log('Truncated:', t);
      } catch (e) {
        console.error('Failed to truncate', t, e.message);
      }
    }
    await query('SET FOREIGN_KEY_CHECKS = 1');
    Отлично! ✅ Уведомление успешно отправлено на ваш chat_id 879
    console.log('Done.');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();


