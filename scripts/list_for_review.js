#!/usr/bin/env node
import { query } from '../src/config/db.js';

async function main() {
  try {
    const rows = await query(`
      SELECT ee.id, ee.task_id, ee.employee_id, ee.explanation_text, ee.responded_at,
             e.name as employee_name, t.task as task_title
      FROM employee_explanations ee
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      LEFT JOIN tasks t ON t.task_id = ee.task_id
      WHERE ee.status = 'pending' AND ee.responded_at IS NOT NULL
      ORDER BY ee.responded_at DESC
      LIMIT 5
    `);

    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();


