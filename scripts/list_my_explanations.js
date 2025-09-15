#!/usr/bin/env node
import { query } from '../src/config/db.js';

const CHAT_ID = process.env.CHAT_ID || '879574025';

async function main() {
  try {
    const rows = await query(`
      SELECT ee.id, ee.task_id, ee.employee_id, ee.explanation_text, ee.status,
             ee.requested_at, ee.responded_at,
             e.name as employee_name, e.chat_id,
             t.task as task_title
      FROM employee_explanations ee
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      LEFT JOIN tasks t ON t.task_id = ee.task_id
      WHERE e.chat_id = ?
      ORDER BY ee.requested_at DESC
      LIMIT 10
    `, [String(CHAT_ID)]);

    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();


