import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Monthly explanations report per employee
 * - requested: number of explanation requests in month
 * - provided: number with responded_at NOT NULL in month
 * - missing: requested - provided
 *
 * Month is derived from requested_at (when the explanation was requested).
 */
async function buildMonthlyReport({ monthsBack = 6 } = {}) {
  assertEnv();

  // Build date floor for monthsBack
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1, 0, 0, 0);

  // Pull raw rows grouped by employee and month
  const rows = await query(`
    SELECT 
      ee.employee_id,
      e.name AS employee_name,
      e.job AS employee_job,
      DATE_FORMAT(ee.requested_at, '%Y-%m') AS ym,
      COUNT(*) AS requested,
      SUM(CASE WHEN ee.responded_at IS NOT NULL THEN 1 ELSE 0 END) AS provided
    FROM employee_explanations ee
    LEFT JOIN employees e ON e.employee_id = ee.employee_id
    WHERE ee.requested_at >= ?
    GROUP BY ee.employee_id, ym, employee_name, employee_job
    ORDER BY employee_name, ym;
  `, [start]);

  // Index by employee then month
  const byEmp = new Map();
  for (const r of rows) {
    const empId = String(r.employee_id || 'unknown');
    if (!byEmp.has(empId)) {
      byEmp.set(empId, {
        employeeId: empId,
        name: r.employee_name || '—',
        job: r.employee_job || '—',
        months: new Map()
      });
    }
    const emp = byEmp.get(empId);
    const requested = Number(r.requested || 0);
    const provided = Number(r.provided || 0);
    const missing = Math.max(0, requested - provided);
    emp.months.set(r.ym, { requested, provided, missing });
  }

  // Build complete month keys for window
  const monthKeys = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthKeys.push(ym);
  }

  // Print report
  console.log('📅 МЕСЯЧНЫЙ ОТЧЕТ ПО ОБЪЯСНИТЕЛЬНЫМ (по сотрудникам)');
  console.log('='.repeat(80));
  console.log(`Период: ${monthKeys[0]} .. ${monthKeys[monthKeys.length - 1]}`);

  if (byEmp.size === 0) {
    console.log('Нет данных по объяснительным за выбранный период.');
    return;
  }

  for (const emp of Array.from(byEmp.values()).sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`\n👤 ${emp.name} (${emp.job}) [ID: ${emp.employeeId}]`);

    let sumRequested = 0;
    let sumProvided = 0;
    let sumMissing = 0;

    for (const ym of monthKeys) {
      const cell = emp.months.get(ym) || { requested: 0, provided: 0, missing: 0 };
      sumRequested += cell.requested;
      sumProvided += cell.provided;
      sumMissing += cell.missing;
      console.log(`  ${ym}: запрошено=${cell.requested} | написано=${cell.provided} | не написано=${cell.missing}`);
    }

    console.log(`  ИТОГО: запрошено=${sumRequested} | написано=${sumProvided} | не написано=${sumMissing}`);
  }

  // Totals across all employees per month
  console.log('\nΣ СВОДКА ПО МЕСЯЦАМ (все сотрудники)');
  console.log('-'.repeat(80));

  for (const ym of monthKeys) {
    let req = 0, prov = 0, miss = 0;
    for (const emp of byEmp.values()) {
      const cell = emp.months.get(ym);
      if (cell) {
        req += cell.requested;
        prov += cell.provided;
        miss += cell.missing;
      }
    }
    console.log(`  ${ym}: запрошено=${req} | написано=${prov} | не написано=${miss}`);
  }
}

async function main() {
  const monthsArg = process.argv[2] ? parseInt(process.argv[2], 10) : 6;
  try {
    await buildMonthlyReport({ monthsBack: Number.isFinite(monthsArg) && monthsArg > 0 ? monthsArg : 6 });
  } catch (e) {
    log.error('[monthly_explanations_report] Ошибка:', e?.message || e);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
