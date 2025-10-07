#!/usr/bin/env node

import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Главный скрипт для проверки системы управления задачами
 * Включает:
 * 1. Показ дат изменения статусов задач
 * 2. Детальную историю одной задачи
 * 3. Проверку системы объяснительных
 * 4. Проверку уведомлений директору
 */

async function showTaskStatusHistory(taskId = null) {
  console.log('\n📊 ИСТОРИЯ ИЗМЕНЕНИЙ СТАТУСОВ ЗАДАЧ');
  console.log('=' .repeat(80));
  
  try {
    // Проверяем, есть ли таблица для истории изменений статусов
    const tables = await query("SHOW TABLES LIKE 'task_status_history'");
    
    if (!tables || tables.length === 0) {
      console.log('❌ Таблица task_status_history не найдена.');
      console.log('📝 Создаем таблицу для отслеживания истории изменений статусов...');
      
      await query(`
        CREATE TABLE IF NOT EXISTS task_status_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          task_id BIGINT NOT NULL,
          old_status VARCHAR(50),
          new_status VARCHAR(50) NOT NULL,
          changed_by BIGINT,
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          change_reason TEXT,
          INDEX idx_task_id (task_id),
          INDEX idx_changed_at (changed_at),
          INDEX idx_new_status (new_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log('✅ Таблица task_status_history создана.');
      
      // Попробуем восстановить историю из существующих задач
      const tasks = await query(`
        SELECT 
          t.task_id,
          t.task,
          t.status,
          t.created_at,
          ta.assigner_employee_id
        FROM tasks t
        LEFT JOIN task_assigners ta ON ta.task_id = t.task_id
        ORDER BY t.created_at ASC
        LIMIT 10
      `);
      
      if (tasks && tasks.length > 0) {
        console.log('🔄 Восстанавливаем историю из существующих задач...');
        let restored = 0;
        for (const task of tasks) {
          await query(`
            INSERT IGNORE INTO task_status_history 
            (task_id, old_status, new_status, changed_by, changed_at, change_reason)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            task.task_id,
            null,
            task.status || 'new',
            task.assigner_employee_id,
            task.created_at,
            'Создание задачи'
          ]);
          restored++;
        }
        console.log(`✅ Восстановлено ${restored} записей истории.`);
      }
    }
    
    // Получаем историю изменений статусов
    let historyQuery = `
      SELECT 
        tsh.task_id,
        t.task as task_title,
        tsh.old_status,
        tsh.new_status,
        tsh.changed_at,
        tsh.changed_by,
        e.name as changed_by_name,
        tsh.change_reason
      FROM task_status_history tsh
      LEFT JOIN tasks t ON t.task_id = tsh.task_id
      LEFT JOIN employees e ON e.employee_id = tsh.changed_by
    `;
    
    const params = [];
    if (taskId) {
      historyQuery += ' WHERE tsh.task_id = ?';
      params.push(taskId);
    }
    
    historyQuery += ' ORDER BY tsh.changed_at DESC LIMIT 20';
    
    const history = await query(historyQuery, params);
    
    if (!history || history.length === 0) {
      console.log('📋 История изменений статусов не найдена.');
      return;
    }
    
    // Группируем по задачам
    const tasksHistory = {};
    for (const record of history) {
      if (!tasksHistory[record.task_id]) {
        tasksHistory[record.task_id] = {
          title: record.task_title,
          changes: []
        };
      }
      tasksHistory[record.task_id].changes.push(record);
    }
    
    // Выводим историю
    for (const [taskId, taskData] of Object.entries(tasksHistory)) {
      console.log(`\n📌 Задача #${taskId}: ${taskData.title || 'Без названия'}`);
      console.log('-'.repeat(60));
      
      for (const change of taskData.changes) {
        const date = new Date(change.changed_at).toLocaleString('ru-RU');
        const oldStatus = change.old_status || 'Новый';
        const newStatus = change.new_status || 'Неизвестно';
        const changedBy = change.changed_by_name || `ID:${change.changed_by}` || 'Система';
        const reason = change.change_reason ? ` (${change.change_reason})` : '';
        
        console.log(`  ${date} | ${oldStatus} → ${newStatus} | ${changedBy}${reason}`);
      }
    }
    
    console.log(`\n📈 Статистика: ${history.length} изменений, ${Object.keys(tasksHistory).length} задач`);
    
  } catch (error) {
    log.error('[TASK_STATUS_HISTORY] Ошибка:', error.message);
    console.error('❌ Ошибка при получении истории изменений статусов:', error.message);
  }
}

async function checkExplanatorySystem() {
  console.log('\n📝 ПРОВЕРКА СИСТЕМЫ ОБЪЯСНИТЕЛЬНЫХ');
  console.log('=' .repeat(80));
  
  try {
    // Проверяем просроченные задачи
    const overdueTasks = await query(`
      SELECT 
        t.task_id,
        t.task,
        t.status,
        t.deadline,
        e.name as employee_name,
        e.job as employee_job
      FROM tasks t
      LEFT JOIN employees e ON e.employee_id = t.employee_id
      WHERE t.deadline < NOW() 
        AND t.status NOT IN ('completed', 'closed', 'cancelled')
      ORDER BY t.deadline ASC
      LIMIT 10
    `);
    
    if (!overdueTasks || overdueTasks.length === 0) {
      console.log('✅ Просроченных задач не найдено.');
    } else {
      console.log(`⚠️ Найдено просроченных задач: ${overdueTasks.length}`);
      
      for (const task of overdueTasks) {
        const deadline = new Date(task.deadline);
        const now = new Date();
        const overdueDays = Math.floor((now - deadline) / (1000 * 60 * 60 * 24));
        
        console.log(`\n📌 Задача #${task.task_id}: ${task.task}`);
        console.log(`   👤 Исполнитель: ${task.employee_name || 'Не назначен'}`);
        console.log(`   📅 Дедлайн: ${deadline.toLocaleString('ru-RU')}`);
        console.log(`   ⏰ Просрочена на: ${overdueDays} дней`);
        console.log(`   📊 Статус: ${task.status || 'Неизвестно'}`);
      }
    }
    
    // Проверяем запросы объяснительных
    const explanationRequests = await query(`
      SELECT 
        ee.id,
        ee.task_id,
        ee.status as explanation_status,
        ee.requested_at,
        ee.responded_at,
        t.task,
        e.name as employee_name
      FROM employee_explanations ee
      LEFT JOIN tasks t ON t.task_id = ee.task_id
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      WHERE t.deadline < NOW() 
        AND t.status NOT IN ('completed', 'closed', 'cancelled')
      ORDER BY ee.requested_at DESC
      LIMIT 10
    `);
    
    if (!explanationRequests || explanationRequests.length === 0) {
      console.log('\n❌ Запросы объяснительных для просроченных задач не найдены.');
    } else {
      console.log(`\n✅ Найдено запросов объяснительных: ${explanationRequests.length}`);
      
      const statusCounts = {};
      for (const req of explanationRequests) {
        const status = req.explanation_status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      
      console.log('\n📊 Статистика по статусам:');
      for (const [status, count] of Object.entries(statusCounts)) {
        console.log(`   ${status}: ${count}`);
      }
    }
    
  } catch (error) {
    log.error('[CHECK_EXPLANATORY_SYSTEM] Ошибка:', error.message);
    console.error('❌ Ошибка при проверке системы объяснительных:', error.message);
  }
}

async function checkDirectorNotifications() {
  console.log('\n🔔 ПРОВЕРКА УВЕДОМЛЕНИЙ ДИРЕКТОРУ');
  console.log('=' .repeat(80));
  
  try {
    // Находим просроченные объяснительные (более 1 часа)
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
      LEFT JOIN employees e ON ee.employee_id = e.employee_id
      LEFT JOIN tasks t ON ee.task_id = t.task_id
      WHERE ee.status = 'pending' 
        AND ee.requested_at < ?
      ORDER BY ee.requested_at ASC
      LIMIT 10
    `, [oneHourAgo]);
    
    if (!overdueExplanations || overdueExplanations.length === 0) {
      console.log('✅ Просроченных объяснительных не найдено.');
    } else {
      console.log(`⚠️ Найдено просроченных объяснительных: ${overdueExplanations.length}`);
      
      for (const explanation of overdueExplanations) {
        const requestedAt = new Date(explanation.requested_at);
        const now = new Date();
        const hoursOverdue = Math.floor((now - requestedAt) / (1000 * 60 * 60));
        
        console.log(`\n📌 Задача #${explanation.task_id}: ${explanation.task_title}`);
        console.log(`   👤 Сотрудник: ${explanation.employee_name || 'Неизвестно'}`);
        console.log(`   📅 Запрошена: ${requestedAt.toLocaleString('ru-RU')}`);
        console.log(`   ⏰ Просрочена на: ${hoursOverdue} часов`);
      }
    }
    
    // Проверяем настройки директоров
    const directorChatId = process.env.DIRECTOR_CHAT_ID;
    if (directorChatId) {
      console.log(`\n✅ DIRECTOR_CHAT_ID установлен: ${directorChatId}`);
    } else {
      console.log('\n❌ DIRECTOR_CHAT_ID не установлен в переменных окружения');
    }
    
    const directors = await query(`
      SELECT 
        employee_id,
        name,
        job,
        chat_id
      FROM employees 
      WHERE job LIKE '%директор%' 
         OR job LIKE '%руководитель%'
         OR name LIKE '%директор%'
      ORDER BY name
      LIMIT 5
    `);
    
    if (directors && directors.length > 0) {
      console.log(`\n👑 Директора в системе (${directors.length}):`);
      for (const director of directors) {
        console.log(`   👤 ${director.name} (ID: ${director.employee_id})`);
        console.log(`      💼 Должность: ${director.job || 'Не указана'}`);
        console.log(`      💬 Chat ID: ${director.chat_id || 'Не указан'}`);
      }
    } else {
      console.log('\n❌ Директора в базе данных не найдены');
    }
    
  } catch (error) {
    log.error('[CHECK_DIRECTOR_NOTIFICATIONS] Ошибка:', error.message);
    console.error('❌ Ошибка при проверке уведомлений директору:', error.message);
  }
}

async function showTaskDetailedHistory(taskId) {
  if (!taskId) return;
  
  console.log(`\n🔍 ДЕТАЛЬНАЯ ИСТОРИЯ ЗАДАЧИ #${taskId}`);
  console.log('=' .repeat(80));
  
  try {
    // Получаем основную информацию о задаче
    const taskInfo = await query(`
      SELECT 
        t.task_id,
        t.task,
        t.description,
        t.status,
        t.prioritet as priority,
        t.deadline,
        t.created_at,
        assignee.name as assignee_name,
        assignee.employee_id as assignee_id,
        assignee.job as assignee_job,
        assigner.name as assigner_name,
        assigner.employee_id as assigner_id,
        assigner.job as assigner_job,
        ta.assigned_at
      FROM tasks t
      LEFT JOIN employees assignee ON assignee.employee_id = t.employee_id
      LEFT JOIN task_assigners ta ON ta.task_id = t.task_id
      LEFT JOIN employees assigner ON assigner.employee_id = ta.assigner_employee_id
      WHERE t.task_id = ?
    `, [taskId]);
    
    if (!taskInfo || taskInfo.length === 0) {
      console.log(`❌ Задача #${taskId} не найдена.`);
      return;
    }
    
    const task = taskInfo[0];
    
    // Выводим основную информацию
    console.log(`\n📌 ЗАДАЧА #${task.task_id}`);
    console.log(`📝 Название: ${task.task || 'Без названия'}`);
    console.log(`👤 Исполнитель: ${task.assignee_name || 'Не назначен'} (ID: ${task.assignee_id || 'N/A'})`);
    console.log(`🎯 Назначил: ${task.assigner_name || 'Система'} (ID: ${task.assigner_id || 'N/A'})`);
    console.log(`📅 Создана: ${new Date(task.created_at).toLocaleString('ru-RU')}`);
    console.log(`⏰ Дедлайн: ${task.deadline ? new Date(task.deadline).toLocaleString('ru-RU') : 'Не установлен'}`);
    console.log(`🔄 Текущий статус: ${task.status || 'Неизвестно'}`);
    
    // Получаем историю изменений статусов
    const statusHistory = await query(`
      SELECT 
        tsh.old_status,
        tsh.new_status,
        tsh.changed_at,
        tsh.changed_by,
        e.name as changed_by_name,
        tsh.change_reason
      FROM task_status_history tsh
      LEFT JOIN employees e ON e.employee_id = tsh.changed_by
      WHERE tsh.task_id = ?
      ORDER BY tsh.changed_at ASC
    `, [taskId]);
    
    if (statusHistory && statusHistory.length > 0) {
      console.log(`\n📈 ИСТОРИЯ ИЗМЕНЕНИЙ СТАТУСОВ`);
      console.log('-'.repeat(60));
      
      for (const change of statusHistory) {
        const date = new Date(change.changed_at).toLocaleString('ru-RU');
        const oldStatus = change.old_status || 'Новый';
        const newStatus = change.new_status || 'Неизвестно';
        const changedBy = change.changed_by_name || `ID:${change.changed_by}` || 'Система';
        const reason = change.change_reason ? ` (${change.change_reason})` : '';
        
        console.log(`  ${date} | ${oldStatus} → ${newStatus} | ${changedBy}${reason}`);
      }
    } else {
      console.log(`\n📈 ИСТОРИЯ ИЗМЕНЕНИЙ СТАТУСОВ`);
      console.log('-'.repeat(60));
      console.log('📝 История изменений статусов не найдена.');
    }
    
    // Получаем объяснительные по задаче
    const explanations = await query(`
      SELECT 
        ee.id,
        ee.explanation_text,
        ee.status as explanation_status,
        ee.requested_at,
        ee.responded_at,
        e.name as employee_name
      FROM employee_explanations ee
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      WHERE ee.task_id = ?
      ORDER BY ee.requested_at DESC
    `, [taskId]);
    
    if (explanations && explanations.length > 0) {
      console.log(`\n📝 ОБЪЯСНИТЕЛЬНЫЕ (${explanations.length})`);
      console.log('-'.repeat(60));
      
      for (const explanation of explanations) {
        const requestedAt = new Date(explanation.requested_at).toLocaleString('ru-RU');
        const respondedAt = explanation.responded_at ? 
          new Date(explanation.responded_at).toLocaleString('ru-RU') : 'Не предоставлено';
        
        console.log(`📋 ID: ${explanation.id} | Сотрудник: ${explanation.employee_name || 'Неизвестно'}`);
        console.log(`   📅 Запрошена: ${requestedAt}`);
        console.log(`   📅 Предоставлена: ${respondedAt}`);
        console.log(`   📊 Статус: ${explanation.explanation_status}`);
        console.log('');
      }
    }
    
  } catch (error) {
    log.error('[TASK_DETAILED_HISTORY] Ошибка:', error.message);
    console.error('❌ Ошибка при получении детальной истории задачи:', error.message);
  }
}

// Главная функция
async function main() {
  try {
    assertEnv();
    
    const args = process.argv.slice(2);
    const command = args[0];
    const taskId = args[1] ? parseInt(args[1]) : null;
    
    console.log('🔍 СИСТЕМА УПРАВЛЕНИЯ ЗАДАЧАМИ - ПРОВЕРКА');
    console.log('=' .repeat(80));
    
    if (command === 'history' && taskId) {
      await showTaskDetailedHistory(taskId);
    } else if (command === 'status') {
      await showTaskStatusHistory(taskId);
    } else if (command === 'explanatory') {
      await checkExplanatorySystem();
    } else if (command === 'notifications') {
      await checkDirectorNotifications();
    } else if (command === 'all') {
      await showTaskStatusHistory();
      await checkExplanatorySystem();
      await checkDirectorNotifications();
    } else {
      console.log('📋 Доступные команды:');
      console.log('  node task_management_check.js status [task_id]     - История изменений статусов');
      console.log('  node task_management_check.js history <task_id>    - Детальная история задачи');
      console.log('  node task_management_check.js explanatory          - Проверка системы объяснительных');
      console.log('  node task_management_check.js notifications        - Проверка уведомлений директору');
      console.log('  node task_management_check.js all                  - Все проверки');
      console.log('');
      console.log('Примеры:');
      console.log('  node task_management_check.js status');
      console.log('  node task_management_check.js history 123');
      console.log('  node task_management_check.js all');
    }
    
  } catch (error) {
    log.error('[MAIN] Ошибка:', error.message);
    console.error('❌ Ошибка выполнения:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
