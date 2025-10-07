import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Скрипт для детальной истории одной задачи
 * Показывает: кто назначил, кому, даты всех изменений статуса от создания до закрытия
 */

async function showTaskDetailedHistory(taskId) {
  try {
    assertEnv();
    
    if (!taskId) {
      console.log('❌ Необходимо указать ID задачи');
      console.log('Использование: node task_detailed_history.js <task_id>');
      return;
    }
    
    console.log(`🔍 Детальная история задачи #${taskId}`);
    console.log('=' .repeat(80));
    
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
    console.log(`📄 Описание: ${task.description || 'Нет описания'}`);
    console.log(`👤 Исполнитель: ${task.assignee_name || 'Не назначен'} (ID: ${task.assignee_id || 'N/A'})`);
    console.log(`💼 Должность исполнителя: ${task.assignee_job || 'Не указана'}`);
    console.log(`🎯 Назначил: ${task.assigner_name || 'Система'} (ID: ${task.assigner_id || 'N/A'})`);
    console.log(`💼 Должность назначившего: ${task.assigner_job || 'Не указана'}`);
    console.log(`📅 Создана: ${new Date(task.created_at).toLocaleString('ru-RU')}`);
    console.log(`📅 Назначена: ${task.assigned_at ? new Date(task.assigned_at).toLocaleString('ru-RU') : 'Не указано'}`);
    console.log(`⏰ Дедлайн: ${task.deadline ? new Date(task.deadline).toLocaleString('ru-RU') : 'Не установлен'}`);
    console.log(`📊 Приоритет: ${task.priority || 'Не указан'}`);
    console.log(`🔄 Текущий статус: ${task.status || 'Неизвестно'}`);
    
    // Получаем историю изменений статусов
    const statusHistory = await query(`
      SELECT 
        tsh.old_status,
        tsh.new_status,
        tsh.changed_at,
        tsh.changed_by,
        e.name as changed_by_name,
        e.job as changed_by_job,
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
        const job = change.changed_by_job ? ` (${change.changed_by_job})` : '';
        const reason = change.change_reason ? `\n    💬 Причина: ${change.change_reason}` : '';
        
        console.log(`  ${date}`);
        console.log(`  ${oldStatus} → ${newStatus}`);
        console.log(`  👤 Изменил: ${changedBy}${job}${reason}`);
        console.log('');
      }
    } else {
      console.log(`\n📈 ИСТОРИЯ ИЗМЕНЕНИЙ СТАТУСОВ`);
      console.log('-'.repeat(60));
      console.log('📝 История изменений статусов не найдена.');
      console.log('💡 Возможно, статус задачи не изменялся с момента создания.');
    }
    
    // Получаем объяснительные по задаче
    const explanations = await query(`
      SELECT 
        ee.id,
        ee.explanation_text,
        ee.status as explanation_status,
        ee.requested_at,
        ee.responded_at,
        ee.manager_decision,
        ee.bonus_penalty_amount,
        e.name as employee_name,
        e.job as employee_job
      FROM employee_explanations ee
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      WHERE ee.task_id = ?
      ORDER BY ee.requested_at DESC
    `, [taskId]);
    
    if (explanations && explanations.length > 0) {
      console.log(`\n📝 ОБЪЯСНИТЕЛЬНЫЕ`);
      console.log('-'.repeat(60));
      
      for (const explanation of explanations) {
        const requestedAt = new Date(explanation.requested_at).toLocaleString('ru-RU');
        const respondedAt = explanation.responded_at ? 
          new Date(explanation.responded_at).toLocaleString('ru-RU') : 'Не предоставлено';
        
        console.log(`📋 ID объяснительной: ${explanation.id}`);
        console.log(`👤 Сотрудник: ${explanation.employee_name || 'Неизвестно'} (${explanation.employee_job || 'Не указана'})`);
        console.log(`📅 Запрошена: ${requestedAt}`);
        console.log(`📅 Предоставлена: ${respondedAt}`);
        console.log(`📊 Статус: ${explanation.explanation_status}`);
        console.log(`💬 Текст: ${explanation.explanation_text || 'Нет текста'}`);
        
        if (explanation.manager_decision) {
          console.log(`🎯 Решение руководителя: ${explanation.manager_decision}`);
        }
        
        if (explanation.bonus_penalty_amount && explanation.bonus_penalty_amount !== 0) {
          console.log(`💰 Сумма бонуса/штрафа: ${explanation.bonus_penalty_amount}`);
        }
        
        console.log('');
      }
    }
    
    // Получаем артефакты задачи
    const artifacts = await query(`
      SELECT 
        ta.file_name,
        ta.artifact_type,
        ta.file_size,
        ta.uploaded_at,
        e.name as uploaded_by_name
      FROM task_artifacts ta
      LEFT JOIN employees e ON e.employee_id = ta.uploaded_by
      WHERE ta.task_id = ?
      ORDER BY ta.uploaded_at DESC
    `, [taskId]);
    
    if (artifacts && artifacts.length > 0) {
      console.log(`\n📎 АРТЕФАКТЫ`);
      console.log('-'.repeat(60));
      
      for (const artifact of artifacts) {
        const uploadedAt = new Date(artifact.uploaded_at).toLocaleString('ru-RU');
        const fileSize = artifact.file_size ? `${(artifact.file_size / 1024).toFixed(1)} KB` : 'Неизвестно';
        
        console.log(`📄 ${artifact.file_name}`);
        console.log(`   Тип: ${artifact.artifact_type}`);
        console.log(`   Размер: ${fileSize}`);
        console.log(`   Загружен: ${uploadedAt} (${artifact.uploaded_by_name || 'Неизвестно'})`);
        console.log('');
      }
    }
    
    // Статистика
    console.log(`\n📊 СТАТИСТИКА ЗАДАЧИ`);
    console.log('-'.repeat(60));
    console.log(`🔄 Изменений статуса: ${statusHistory ? statusHistory.length : 0}`);
    console.log(`📝 Объяснительных: ${explanations ? explanations.length : 0}`);
    console.log(`📎 Артефактов: ${artifacts ? artifacts.length : 0}`);
    
    // Время выполнения
    const createdAt = new Date(task.created_at);
    const now = new Date();
    const timeDiff = now - createdAt;
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    console.log(`⏱️ Время в работе: ${days} дней ${hours} часов`);
    
    if (task.deadline) {
      const deadline = new Date(task.deadline);
      const deadlineDiff = deadline - now;
      const deadlineDays = Math.floor(deadlineDiff / (1000 * 60 * 60 * 24));
      
      if (deadlineDiff > 0) {
        console.log(`⏰ До дедлайна: ${deadlineDays} дней`);
      } else {
        console.log(`⚠️ Просрочена на: ${Math.abs(deadlineDays)} дней`);
      }
    }
    
  } catch (error) {
    log.error('[TASK_DETAILED_HISTORY] Ошибка:', error.message);
    console.error('❌ Ошибка при получении детальной истории задачи:', error.message);
  }
}

// Запуск скрипта
async function main() {
  const args = process.argv.slice(2);
  const taskId = args[0] ? parseInt(args[0]) : null;
  
  if (!taskId) {
    console.log('❌ Необходимо указать ID задачи');
    console.log('Использование: node task_detailed_history.js <task_id>');
    console.log('Пример: node task_detailed_history.js 123');
    process.exit(1);
  }
  
  await showTaskDetailedHistory(taskId);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
