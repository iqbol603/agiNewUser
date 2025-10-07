import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Скрипт для показа дат изменения статусов задач
 * Показывает историю изменений статусов для всех задач или конкретной задачи
 */

async function showTaskStatusHistory(taskId = null) {
  try {
    assertEnv();
    
    // Сначала проверим, есть ли таблица для истории изменений статусов
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
      await restoreHistoryFromTasks();
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
    
    historyQuery += ' ORDER BY tsh.changed_at DESC';
    
    const history = await query(historyQuery, params);
    
    if (!history || history.length === 0) {
      console.log('📋 История изменений статусов не найдена.');
      if (taskId) {
        console.log(`Для задачи #${taskId} история изменений пуста.`);
      }
      return;
    }
    
    console.log('\n📊 ИСТОРИЯ ИЗМЕНЕНИЙ СТАТУСОВ ЗАДАЧ');
    console.log('=' .repeat(80));
    
    if (taskId) {
      console.log(`\n🎯 Задача #${taskId}: ${history[0].task_title || 'Неизвестно'}`);
      console.log('=' .repeat(80));
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
    
    console.log('\n📈 СТАТИСТИКА:');
    console.log(`• Всего изменений: ${history.length}`);
    console.log(`• Уникальных задач: ${Object.keys(tasksHistory).length}`);
    
  } catch (error) {
    log.error('[TASK_STATUS_HISTORY] Ошибка:', error.message);
    console.error('❌ Ошибка при получении истории изменений статусов:', error.message);
  }
}

/**
 * Восстанавливает историю изменений из существующих задач
 */
async function restoreHistoryFromTasks() {
  try {
    console.log('🔄 Восстанавливаем историю из существующих задач...');
    
    // Получаем все задачи с их текущими статусами
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
    `);
    
    if (!tasks || tasks.length === 0) {
      console.log('📝 Нет задач для восстановления истории.');
      return;
    }
    
    let restored = 0;
    for (const task of tasks) {
      // Создаем запись о первоначальном статусе
      await query(`
        INSERT IGNORE INTO task_status_history 
        (task_id, old_status, new_status, changed_by, changed_at, change_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        task.task_id,
        null, // old_status
        task.status || 'new',
        task.assigner_employee_id,
        task.created_at,
        'Создание задачи'
      ]);
      restored++;
    }
    
    console.log(`✅ Восстановлено ${restored} записей истории.`);
    
  } catch (error) {
    log.error('[RESTORE_HISTORY] Ошибка восстановления:', error.message);
  }
}

/**
 * Добавляет запись об изменении статуса задачи
 */
export async function logStatusChange(taskId, oldStatus, newStatus, changedBy, reason = null) {
  try {
    await query(`
      INSERT INTO task_status_history 
      (task_id, old_status, new_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `, [taskId, oldStatus, newStatus, changedBy, reason]);
    
    log.info(`[TASK_STATUS_HISTORY] Зафиксировано изменение статуса задачи ${taskId}: ${oldStatus} → ${newStatus}`);
  } catch (error) {
    log.error('[TASK_STATUS_HISTORY] Ошибка записи изменения статуса:', error.message);
  }
}

// Запуск скрипта
async function main() {
  const args = process.argv.slice(2);
  const taskId = args[0] ? parseInt(args[0]) : null;
  
  if (taskId) {
    console.log(`🔍 Показываем историю изменений для задачи #${taskId}`);
  } else {
    console.log('📋 Показываем историю изменений для всех задач');
  }
  
  await showTaskStatusHistory(taskId);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
