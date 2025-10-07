import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Скрипт для проверки системы объяснительных
 * Проверяет: запрашиваются ли объяснительные для просроченных задач
 */

async function checkExplanatorySystem() {
  try {
    assertEnv();
    
    console.log('🔍 ПРОВЕРКА СИСТЕМЫ ОБЪЯСНИТЕЛЬНЫХ');
    console.log('=' .repeat(80));
    
    // 1. Проверяем просроченные задачи
    const overdueTasks = await query(`
      SELECT 
        t.task_id,
        t.task,
        t.status,
        t.deadline,
        t.created_at,
        e.name as employee_name,
        e.job as employee_job,
        e.chat_id
      FROM tasks t
      LEFT JOIN employees e ON e.employee_id = t.employee_id
      WHERE t.deadline < NOW() 
        AND t.status NOT IN ('completed', 'closed', 'cancelled')
      ORDER BY t.deadline ASC
    `);
    
    console.log(`\n📊 ПРОСРОЧЕННЫЕ ЗАДАЧИ`);
    console.log('-'.repeat(60));
    
    if (!overdueTasks || overdueTasks.length === 0) {
      console.log('✅ Просроченных задач не найдено.');
    } else {
      console.log(`⚠️ Найдено просроченных задач: ${overdueTasks.length}`);
      
      for (const task of overdueTasks) {
        const deadline = new Date(task.deadline);
        const now = new Date();
        const overdueDays = Math.floor((now - deadline) / (1000 * 60 * 60 * 24));
        
        console.log(`\n📌 Задача #${task.task_id}: ${task.task}`);
        console.log(`   👤 Исполнитель: ${task.employee_name || 'Не назначен'} (${task.employee_job || 'Не указана'})`);
        console.log(`   📅 Дедлайн: ${deadline.toLocaleString('ru-RU')}`);
        console.log(`   ⏰ Просрочена на: ${overdueDays} дней`);
        console.log(`   📊 Статус: ${task.status || 'Неизвестно'}`);
        console.log(`   💬 Chat ID: ${task.chat_id || 'Не указан'}`);
      }
    }
    
    // 2. Проверяем запросы объяснительных для просроченных задач
    const explanationRequests = await query(`
      SELECT 
        ee.id,
        ee.task_id,
        ee.employee_id,
        ee.status as explanation_status,
        ee.requested_at,
        ee.responded_at,
        t.task,
        t.deadline,
        e.name as employee_name,
        e.job as employee_job
      FROM employee_explanations ee
      LEFT JOIN tasks t ON t.task_id = ee.task_id
      LEFT JOIN employees e ON e.employee_id = ee.employee_id
      WHERE t.deadline < NOW() 
        AND t.status NOT IN ('completed', 'closed', 'cancelled')
      ORDER BY ee.requested_at DESC
    `);
    
    console.log(`\n📝 ЗАПРОСЫ ОБЪЯСНИТЕЛЬНЫХ ДЛЯ ПРОСРОЧЕННЫХ ЗАДАЧ`);
    console.log('-'.repeat(60));
    
    if (!explanationRequests || explanationRequests.length === 0) {
      console.log('❌ Запросы объяснительных для просроченных задач не найдены.');
      console.log('💡 Это может означать, что система не запрашивает объяснительные автоматически.');
    } else {
      console.log(`✅ Найдено запросов объяснительных: ${explanationRequests.length}`);
      
      // Группируем по статусам
      const statusCounts = {};
      for (const req of explanationRequests) {
        const status = req.explanation_status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      
      console.log('\n📊 Статистика по статусам:');
      for (const [status, count] of Object.entries(statusCounts)) {
        console.log(`   ${status}: ${count}`);
      }
      
      console.log('\n📋 Детали запросов:');
      for (const req of explanationRequests.slice(0, 10)) { // Показываем первые 10
        const requestedAt = new Date(req.requested_at).toLocaleString('ru-RU');
        const respondedAt = req.responded_at ? 
          new Date(req.responded_at).toLocaleString('ru-RU') : 'Не предоставлено';
        const deadline = new Date(req.deadline).toLocaleString('ru-RU');
        
        console.log(`\n   📌 Задача #${req.task_id}: ${req.task}`);
        console.log(`   👤 Сотрудник: ${req.employee_name || 'Неизвестно'}`);
        console.log(`   📅 Дедлайн: ${deadline}`);
        console.log(`   📝 ID объяснительной: ${req.id}`);
        console.log(`   📊 Статус: ${req.explanation_status}`);
        console.log(`   📅 Запрошена: ${requestedAt}`);
        console.log(`   📅 Предоставлена: ${respondedAt}`);
      }
      
      if (explanationRequests.length > 10) {
        console.log(`\n   ... и еще ${explanationRequests.length - 10} запросов`);
      }
    }
    
    // 3. Проверяем, какие просроченные задачи НЕ имеют запросов объяснительных
    const overdueWithoutExplanations = await query(`
      SELECT 
        t.task_id,
        t.task,
        t.deadline,
        e.name as employee_name,
        e.job as employee_job
      FROM tasks t
      LEFT JOIN employees e ON e.employee_id = t.employee_id
      LEFT JOIN employee_explanations ee ON ee.task_id = t.task_id
      WHERE t.deadline < NOW() 
        AND t.status NOT IN ('completed', 'closed', 'cancelled')
        AND ee.id IS NULL
      ORDER BY t.deadline ASC
    `);
    
    console.log(`\n❌ ПРОСРОЧЕННЫЕ ЗАДАЧИ БЕЗ ЗАПРОСОВ ОБЪЯСНИТЕЛЬНЫХ`);
    console.log('-'.repeat(60));
    
    if (!overdueWithoutExplanations || overdueWithoutExplanations.length === 0) {
      console.log('✅ Все просроченные задачи имеют запросы объяснительных.');
    } else {
      console.log(`⚠️ Найдено просроченных задач без объяснительных: ${overdueWithoutExplanations.length}`);
      
      for (const task of overdueWithoutExplanations) {
        const deadline = new Date(task.deadline);
        const now = new Date();
        const overdueDays = Math.floor((now - deadline) / (1000 * 60 * 60 * 24));
        
        console.log(`\n   📌 Задача #${task.task_id}: ${task.task}`);
        console.log(`   👤 Исполнитель: ${task.employee_name || 'Не назначен'}`);
        console.log(`   📅 Дедлайн: ${deadline.toLocaleString('ru-RU')}`);
        console.log(`   ⏰ Просрочена на: ${overdueDays} дней`);
      }
    }
    
    // 4. Проверяем настройки системы объяснительных
    console.log(`\n⚙️ НАСТРОЙКИ СИСТЕМЫ ОБЪЯСНИТЕЛЬНЫХ`);
    console.log('-'.repeat(60));
    
    // Проверяем, есть ли таблица объяснительных
    const explanationTable = await query("SHOW TABLES LIKE 'employee_explanations'");
    if (explanationTable && explanationTable.length > 0) {
      console.log('✅ Таблица employee_explanations существует');
      
      // Проверяем структуру таблицы
      const tableStructure = await query("DESCRIBE employee_explanations");
      console.log('📋 Структура таблицы:');
      for (const column of tableStructure) {
        console.log(`   ${column.Field}: ${column.Type} ${column.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
      }
    } else {
      console.log('❌ Таблица employee_explanations не найдена');
    }
    
    // 5. Рекомендации
    console.log(`\n💡 РЕКОМЕНДАЦИИ`);
    console.log('-'.repeat(60));
    
    if (overdueTasks && overdueTasks.length > 0) {
      if (!explanationRequests || explanationRequests.length === 0) {
        console.log('🔧 Настройте автоматический запрос объяснительных для просроченных задач');
        console.log('   - Проверьте ReportScheduler.js');
        console.log('   - Убедитесь, что ExplanatoryService работает');
      } else if (overdueWithoutExplanations && overdueWithoutExplanations.length > 0) {
        console.log('🔧 Некоторые просроченные задачи не имеют запросов объяснительных');
        console.log('   - Проверьте логику создания запросов');
        console.log('   - Убедитесь, что все просроченные задачи обрабатываются');
      } else {
        console.log('✅ Система объяснительных работает корректно');
      }
    } else {
      console.log('✅ Просроченных задач нет, система объяснительных не требуется');
    }
    
  } catch (error) {
    log.error('[CHECK_EXPLANATORY_SYSTEM] Ошибка:', error.message);
    console.error('❌ Ошибка при проверке системы объяснительных:', error.message);
  }
}

// Запуск скрипта
async function main() {
  await checkExplanatorySystem();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
