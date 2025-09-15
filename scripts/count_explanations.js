#!/usr/bin/env node
import { query } from '../src/config/db.js';

async function main() {
  try {
    const totalRes = await query('SELECT COUNT(*) as c FROM employee_explanations');
    const total = Array.isArray(totalRes) ? (totalRes[0]?.c ?? 0) : 0;

    const pendingRes = await query("SELECT COUNT(*) as c FROM employee_explanations WHERE status = 'pending'");
    const pending = Array.isArray(pendingRes) ? (pendingRes[0]?.c ?? 0) : 0;

    const forReviewRes = await query("SELECT COUNT(*) as c FROM employee_explanations WHERE status = 'pending' AND responded_at IS NOT NULL");
    const forReview = Array.isArray(forReviewRes) ? (forReviewRes[0]?.c ?? 0) : 0;

    const awaitingUserRes = await query("SELECT COUNT(*) as c FROM employee_explanations WHERE status = 'pending' AND responded_at IS NULL");
    const awaitingUser = Array.isArray(awaitingUserRes) ? (awaitingUserRes[0]?.c ?? 0) : 0;

    console.log(JSON.stringify({ total, pending, forReview, awaitingUser }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();


