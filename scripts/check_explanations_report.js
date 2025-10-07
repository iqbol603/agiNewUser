import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Скрипт для проверки объяснительных сотрудников
 * Показывает: кто написал объяснительные, статистику, бонусы/штрафы
 */

async function checkExplanationsReport() {
  try {
    assertEnv();
    
    console.log('📝 ОТЧЕТ ПО ОБЪЯСНИТЕЛЬНЫМ СОТРУДНИКОВ');
    console.log('=' .repeat(80));
    
    // Получаем все объяснительные с информацией о сотрудниках
    const explanations = await query(`
      SELECT 
        ee.id,
        ee.task_id,
        ee.employee_id,
        ee.explanation_text,
        ee.status,
        ee.requested_at,
        ee.responded_at,
        ee.manager_decision,
        ee.bonus_penalty_amount,
        e.name as employee_name,
        e.job as employee_job,
        e.chat_id,
        t.task as task_title,
        t.deadline as task_deadline
      FROM employee_explanations ee
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      LEFT JOIN tasks t ON t.task_id = ee.task_id
      ORDER BY ee.requested_at DESC
    `);
    
    if (!explanations || explanations.length === 0) {
      console.log('❌ Объяснительные не найдены.');
      return;
    }
    
    console.log(`📊 Всего объяснительных: ${explanations.length}`);
    
    // Группируем по статусам
    const statusCounts = {};
    for (const exp of explanations) {
      const status = exp.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    
    console.log('\n📈 СТАТИСТИКА ПО СТАТУСАМ:');
    console.log('-'.repeat(40));
    for (const [status, count] of Object.entries(statusCounts)) {
      const statusName = {
        'pending': '⏳ Ожидает рассмотрения',
        'accepted': '✅ Принято',
        'rejected': '❌ Отклонено',
        'bonus_penalty': '💰 Бонус/штраф'
      }[status] || status;
      console.log(`   ${statusName}: ${count}`);
    }
    
    // Группируем по сотрудникам
    const byEmployee = {};
    for (const exp of explanations) {
      const empId = exp.employee_id;
      if (!byEmployee[empId]) {
        byEmployee[empId] = {
          name: exp.employee_name,
          job: exp.employee_job,
          chat_id: exp.chat_id,
          explanations: []
        };
      }
      byEmployee[empId].explanations.push(exp);
    }
    
    console.log('\n👥 ОБЪЯСНИТЕЛЬНЫЕ ПО СОТРУДНИКАМ:');
    console.log('=' .repeat(80));
    
    for (const [empId, data] of Object.entries(byEmployee)) {
      console.log(`\n👤 ${data.name} (ID: ${empId})`);
      console.log(`   💼 Должность: ${data.job || 'Не указана'}`);
      console.log(`   💬 Chat ID: ${data.chat_id || 'Не указан'}`);
      console.log(`   📝 Количество объяснительных: ${data.explanations.length}`);
      
      // Статистика по статусам для этого сотрудника
      const empStatusCounts = {};
      let totalBonusPenalty = 0;
      let hasBonusPenalty = false;
      
      for (const exp of data.explanations) {
        const status = exp.status || 'unknown';
        empStatusCounts[status] = (empStatusCounts[status] || 0) + 1;
        
        if (exp.bonus_penalty_amount && exp.bonus_penalty_amount !== 0) {
          totalBonusPenalty += parseFloat(exp.bonus_penalty_amount);
          hasBonusPenalty = true;
        }
      }
      
      console.log('   📊 Статусы:');
      for (const [status, count] of Object.entries(empStatusCounts)) {
        const statusName = {
          'pending': '⏳ Ожидает',
          'accepted': '✅ Принято',
          'rejected': '❌ Отклонено',
          'bonus_penalty': '💰 Бонус/штраф'
        }[status] || status;
        console.log(`      ${statusName}: ${count}`);
      }
      
      if (hasBonusPenalty) {
        console.log(`   💰 Общая сумма бонусов/штрафов: ${totalBonusPenalty}`);
      }
      
      // Показываем последние объяснительные
      const recent = data.explanations.slice(0, 5);
      console.log('   📋 Последние объяснительные:');
      for (const exp of recent) {
        const requestedAt = new Date(exp.requested_at).toLocaleString('ru-RU');
        const respondedAt = exp.responded_at ? 
          new Date(exp.responded_at).toLocaleString('ru-RU') : 'Не предоставлено';
        
        console.log(`\n      📌 Задача #${exp.task_id}: ${exp.task_title || 'Без названия'}`);
        console.log(`         📅 Запрошена: ${requestedAt}`);
        console.log(`         📅 Предоставлена: ${respondedAt}`);
        console.log(`         📊 Статус: ${exp.status}`);
        
        if (exp.explanation_text && exp.explanation_text.length > 50) {
          console.log(`         💬 Текст: ${exp.explanation_text.substring(0, 50)}...`);
        } else if (exp.explanation_text) {
          console.log(`         💬 Текст: ${exp.explanation_text}`);
        }
        
        if (exp.manager_decision) {
          console.log(`         🎯 Решение руководителя: ${exp.manager_decision}`);
        }
        
        if (exp.bonus_penalty_amount && exp.bonus_penalty_amount !== 0) {
          console.log(`         💰 Бонус/штраф: ${exp.bonus_penalty_amount}`);
        }
      }
    }
    
    // Статистика по бонусам/штрафам
    console.log('\n💰 СТАТИСТИКА ПО БОНУСАМ/ШТРАФАМ:');
    console.log('=' .repeat(80));
    
    const bonusPenaltyExplanations = explanations.filter(exp => 
      exp.bonus_penalty_amount && parseFloat(exp.bonus_penalty_amount) !== 0
    );
    
    if (bonusPenaltyExplanations.length > 0) {
      console.log(`📊 Объяснительных с бонусами/штрафами: ${bonusPenaltyExplanations.length}`);
      
      let totalPositive = 0;
      let totalNegative = 0;
      
      for (const exp of bonusPenaltyExplanations) {
        const amount = parseFloat(exp.bonus_penalty_amount);
        if (amount > 0) {
          totalPositive += amount;
        } else {
          totalNegative += Math.abs(amount);
        }
      }
      
      console.log(`💰 Общая сумма бонусов: ${totalPositive}`);
      console.log(`💸 Общая сумма штрафов: ${totalNegative}`);
      console.log(`📈 Итоговый баланс: ${totalPositive - totalNegative}`);
      
      // Группируем по сотрудникам для избежания дублирования
      const bonusPenaltyByEmployee = {};
      for (const exp of bonusPenaltyExplanations) {
        const empId = exp.employee_id;
        if (!bonusPenaltyByEmployee[empId]) {
          bonusPenaltyByEmployee[empId] = {
            name: exp.employee_name,
            bonuses: 0,
            penalties: 0,
            tasks: new Set()
          };
        }
        
        const amount = parseFloat(exp.bonus_penalty_amount);
        if (amount > 0) {
          bonusPenaltyByEmployee[empId].bonuses += amount;
        } else {
          bonusPenaltyByEmployee[empId].penalties += Math.abs(amount);
        }
        bonusPenaltyByEmployee[empId].tasks.add(exp.task_id);
      }
      
      console.log('\n📋 Детали по бонусам/штрафам по сотрудникам:');
      for (const [empId, data] of Object.entries(bonusPenaltyByEmployee)) {
        console.log(`\n👤 ${data.name} (ID: ${empId})`);
        if (data.bonuses > 0) {
          console.log(`   💰 Бонусы: ${data.bonuses}`);
        }
        if (data.penalties > 0) {
          console.log(`   💸 Штрафы: ${data.penalties}`);
        }
        console.log(`   📌 Задач: ${data.tasks.size}`);
      }
    } else {
      console.log('❌ Объяснительных с бонусами/штрафами не найдено.');
    }
    
    // Сотрудники без объяснительных
    console.log('\n👥 СОТРУДНИКИ БЕЗ ОБЪЯСНИТЕЛЬНЫХ:');
    console.log('=' .repeat(80));
    
    const allEmployees = await query(`
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
    
    if (allEmployees && allEmployees.length > 0) {
      console.log(`📊 Сотрудников без объяснительных: ${allEmployees.length}`);
      for (const emp of allEmployees) {
        console.log(`   👤 ${emp.name} (ID: ${emp.employee_id}) - ${emp.job || 'Не указана'}`);
      }
    } else {
      console.log('✅ Все сотрудники имеют объяснительные.');
    }
    
  } catch (error) {
    log.error('[CHECK_EXPLANATIONS_REPORT] Ошибка:', error.message);
    console.error('❌ Ошибка при проверке объяснительных:', error.message);
  }
}

// Запуск скрипта
async function main() {
  await checkExplanationsReport();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
