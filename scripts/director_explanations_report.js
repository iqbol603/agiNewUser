import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Специальный отчет для директора по объяснительным и бонусам/штрафам
 * Показывает полную статистику: кто написал, кто был лишен бонусов, общие суммы
 */

async function generateDirectorReport() {
  try {
    assertEnv();
    
    console.log('👑 ОТЧЕТ ДЛЯ ДИРЕКТОРА ПО ОБЪЯСНИТЕЛЬНЫМ И БОНУСАМ');
    console.log('=' .repeat(80));
    console.log(`📅 Дата отчета: ${new Date().toLocaleString('ru-RU')}`);
    console.log('=' .repeat(80));
    
    // 1. Общая статистика по объяснительным
    const totalExplanations = await query(`
      SELECT COUNT(*) as total FROM employee_explanations
    `);
    
    const statusStats = await query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM employee_explanations 
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('\n📊 ОБЩАЯ СТАТИСТИКА ПО ОБЪЯСНИТЕЛЬНЫМ:');
    console.log('-'.repeat(50));
    console.log(`📝 Всего объяснительных: ${totalExplanations[0].total}`);
    
    console.log('\n📈 По статусам:');
    for (const stat of statusStats) {
      const statusName = {
        'pending': '⏳ Ожидает рассмотрения',
        'accepted': '✅ Принято',
        'rejected': '❌ Отклонено',
        'bonus_penalty': '💰 С бонусами/штрафами'
      }[stat.status] || stat.status;
      console.log(`   ${statusName}: ${stat.count}`);
    }
    
    // 2. Список сотрудников с объяснительными
    const employeesWithExplanations = await query(`
      SELECT 
        e.employee_id,
        e.name,
        e.job,
        e.chat_id,
        COUNT(ee.id) as explanation_count,
        SUM(CASE WHEN ee.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN ee.status = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
        SUM(CASE WHEN ee.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN ee.status = 'bonus_penalty' THEN 1 ELSE 0 END) as bonus_penalty_count,
        SUM(COALESCE(ee.bonus_penalty_amount, 0)) as total_bonus_penalty
      FROM employees e
      INNER JOIN employee_explanations ee ON ee.employee_id = e.employee_id
      GROUP BY e.employee_id, e.name, e.job, e.chat_id
      ORDER BY explanation_count DESC, total_bonus_penalty ASC
    `);
    
    console.log('\n👥 СОТРУДНИКИ С ОБЪЯСНИТЕЛЬНЫМИ:');
    console.log('=' .repeat(80));
    
    if (employeesWithExplanations && employeesWithExplanations.length > 0) {
      for (const emp of employeesWithExplanations) {
        console.log(`\n👤 ${emp.name} (ID: ${emp.employee_id})`);
        console.log(`   💼 Должность: ${emp.job || 'Не указана'}`);
        console.log(`   💬 Chat ID: ${emp.chat_id || 'Не указан'}`);
        console.log(`   📝 Всего объяснительных: ${emp.explanation_count}`);
        console.log(`   ⏳ Ожидает рассмотрения: ${emp.pending_count}`);
        console.log(`   ✅ Принято: ${emp.accepted_count}`);
        console.log(`   ❌ Отклонено: ${emp.rejected_count}`);
        console.log(`   💰 С бонусами/штрафами: ${emp.bonus_penalty_count}`);
        
        if (emp.total_bonus_penalty && emp.total_bonus_penalty !== 0) {
          const amount = parseFloat(emp.total_bonus_penalty);
          const type = amount > 0 ? '💰 Бонус' : '💸 Штраф';
          console.log(`   ${type}: ${Math.abs(amount)}`);
        }
      }
    } else {
      console.log('❌ Сотрудники с объяснительными не найдены.');
    }
    
    // 3. Детальная статистика по бонусам/штрафам
    const bonusPenaltyDetails = await query(`
      SELECT 
        ee.id,
        ee.task_id,
        ee.employee_id,
        ee.bonus_penalty_amount,
        ee.manager_decision,
        ee.requested_at,
        ee.responded_at,
        e.name as employee_name,
        e.job as employee_job,
        t.task as task_title
      FROM employee_explanations ee
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      LEFT JOIN tasks t ON t.task_id = ee.task_id
      WHERE ee.bonus_penalty_amount IS NOT NULL 
        AND ee.bonus_penalty_amount != 0
      ORDER BY ee.requested_at DESC
    `);
    
    console.log('\n💰 ДЕТАЛЬНАЯ СТАТИСТИКА ПО БОНУСАМ/ШТРАФАМ:');
    console.log('=' .repeat(80));
    
    if (bonusPenaltyDetails && bonusPenaltyDetails.length > 0) {
      let totalBonuses = 0;
      let totalPenalties = 0;
      let bonusCount = 0;
      let penaltyCount = 0;
      
      console.log(`📊 Всего случаев с бонусами/штрафами: ${bonusPenaltyDetails.length}`);
      
      for (const detail of bonusPenaltyDetails) {
        const amount = parseFloat(detail.bonus_penalty_amount);
        const requestedAt = new Date(detail.requested_at).toLocaleString('ru-RU');
        const respondedAt = detail.responded_at ? 
          new Date(detail.responded_at).toLocaleString('ru-RU') : 'Не предоставлено';
        
        if (amount > 0) {
          totalBonuses += amount;
          bonusCount++;
        } else {
          totalPenalties += Math.abs(amount);
          penaltyCount++;
        }
        
        const type = amount > 0 ? '💰 БОНУС' : '💸 ШТРАФ';
        console.log(`\n${type} ${Math.abs(amount)}`);
        console.log(`   👤 Сотрудник: ${detail.employee_name} (${detail.employee_job || 'Не указана'})`);
        console.log(`   📌 Задача: #${detail.task_id} - ${detail.task_title || 'Без названия'}`);
        console.log(`   📅 Запрошена: ${requestedAt}`);
        console.log(`   📅 Предоставлена: ${respondedAt}`);
        if (detail.manager_decision) {
          console.log(`   🎯 Решение руководителя: ${detail.manager_decision}`);
        }
      }
      
      console.log('\n📈 ИТОГОВАЯ СТАТИСТИКА:');
      console.log(`   💰 Бонусов выдано: ${bonusCount} на сумму ${totalBonuses}`);
      console.log(`   💸 Штрафов наложено: ${penaltyCount} на сумму ${totalPenalties}`);
      console.log(`   📊 Итоговый баланс: ${totalBonuses - totalPenalties}`);
      
    } else {
      console.log('❌ Случаев с бонусами/штрафами не найдено.');
    }
    
    // 4. Сотрудники без объяснительных
    const employeesWithoutExplanations = await query(`
      SELECT 
        employee_id,
        name,
        job,
        chat_id
      FROM employees 
      WHERE employee_id NOT IN (
        SELECT DISTINCT employee_id 
        FROM employee_explanations 
        WHERE employee_id IS NOT NULL
      )
      ORDER BY name
    `);
    
    console.log('\n👥 СОТРУДНИКИ БЕЗ ОБЪЯСНИТЕЛЬНЫХ:');
    console.log('=' .repeat(80));
    
    if (employeesWithoutExplanations && employeesWithoutExplanations.length > 0) {
      console.log(`📊 Сотрудников без объяснительных: ${employeesWithoutExplanations.length}`);
      for (const emp of employeesWithoutExplanations) {
        console.log(`   👤 ${emp.name} (ID: ${emp.employee_id}) - ${emp.job || 'Не указана'}`);
      }
    } else {
      console.log('✅ Все сотрудники имеют объяснительные.');
    }
    
    // 5. Просроченные объяснительные (более 1 часа)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const overdueExplanations = await query(`
      SELECT 
        ee.id,
        ee.task_id,
        ee.employee_id,
        ee.requested_at,
        e.name as employee_name,
        e.job as employee_job,
        t.task as task_title
      FROM employee_explanations ee
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      LEFT JOIN tasks t ON t.task_id = ee.task_id
      WHERE ee.status = 'pending' 
        AND ee.requested_at < ?
      ORDER BY ee.requested_at ASC
    `, [oneHourAgo]);
    
    console.log('\n⏰ ПРОСРОЧЕННЫЕ ОБЪЯСНИТЕЛЬНЫЕ (более 1 часа):');
    console.log('=' .repeat(80));
    
    if (overdueExplanations && overdueExplanations.length > 0) {
      console.log(`⚠️ Просроченных объяснительных: ${overdueExplanations.length}`);
      
      // Группируем по сотрудникам
      const overdueByEmployee = {};
      for (const exp of overdueExplanations) {
        const empId = exp.employee_id;
        if (!overdueByEmployee[empId]) {
          overdueByEmployee[empId] = {
            name: exp.employee_name,
            job: exp.employee_job,
            count: 0
          };
        }
        overdueByEmployee[empId].count++;
      }
      
      for (const [empId, data] of Object.entries(overdueByEmployee)) {
        console.log(`   👤 ${data.name} (${data.job || 'Не указана'}): ${data.count} просроченных`);
      }
    } else {
      console.log('✅ Просроченных объяснительных нет.');
    }
    
    // 6. Рекомендации для директора
    console.log('\n💡 РЕКОМЕНДАЦИИ ДЛЯ ДИРЕКТОРА:');
    console.log('=' .repeat(80));
    
    if (employeesWithExplanations && employeesWithExplanations.length > 0) {
      // Находим сотрудников с наибольшим количеством объяснительных
      const topOffenders = employeesWithExplanations
        .filter(emp => emp.explanation_count >= 3)
        .sort((a, b) => b.explanation_count - a.explanation_count);
      
      if (topOffenders.length > 0) {
        console.log('⚠️ Сотрудники с частыми объяснительными (3+ раз):');
        for (const emp of topOffenders) {
          console.log(`   👤 ${emp.name}: ${emp.explanation_count} объяснительных`);
        }
        console.log('   💡 Рекомендация: Рассмотреть дополнительные меры дисциплинарного воздействия');
      }
      
      // Находим сотрудников с большими штрафами
      const highPenalties = employeesWithExplanations
        .filter(emp => emp.total_bonus_penalty < -100)
        .sort((a, b) => a.total_bonus_penalty - b.total_bonus_penalty);
      
      if (highPenalties.length > 0) {
        console.log('\n💸 Сотрудники с большими штрафами (100+):');
        for (const emp of highPenalties) {
          console.log(`   👤 ${emp.name}: штраф ${Math.abs(emp.total_bonus_penalty)}`);
        }
      }
    }
    
    if (overdueExplanations && overdueExplanations.length > 0) {
      console.log('\n⏰ Требуется внимание к просроченным объяснительным');
      console.log('   💡 Рекомендация: Направить уведомления сотрудникам о необходимости предоставления объяснительных');
    }
    
    console.log('\n📊 ОТЧЕТ ЗАВЕРШЕН');
    console.log('=' .repeat(80));
    
  } catch (error) {
    log.error('[DIRECTOR_EXPLANATIONS_REPORT] Ошибка:', error.message);
    console.error('❌ Ошибка при генерации отчета для директора:', error.message);
  }
}

// Запуск скрипта
async function main() {
  await generateDirectorReport();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
