import { assertEnv } from '../src/config/env.js';
import { query } from '../src/config/db.js';
import { log } from '../src/utils/logger.js';

/**
 * Скрипт для проверки уведомлений директору о неполученных объяснительных
 * Проверяет: отправляются ли уведомления директору, если сотрудник не написал объяснительную в течение часа
 */

async function checkDirectorNotifications() {
  try {
    assertEnv();
    
    console.log('🔍 ПРОВЕРКА УВЕДОМЛЕНИЙ ДИРЕКТОРУ');
    console.log('=' .repeat(80));
    
    // 1. Находим объяснительные, которые были запрошены более 1 часа назад и не получили ответ
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const overdueExplanations = await query(`
      SELECT 
        ee.id,
        ee.task_id,
        ee.employee_id,
        ee.requested_at,
        ee.responded_at,
        ee.status as explanation_status,
        e.name as employee_name,
        e.job as employee_job,
        e.chat_id as employee_chat_id,
        t.task as task_title,
        t.deadline as task_deadline
      FROM employee_explanations ee
      LEFT JOIN employees e ON ee.employee_id = e.employee_id
      LEFT JOIN tasks t ON ee.task_id = t.task_id
      WHERE ee.status = 'pending' 
        AND ee.requested_at < ?
      ORDER BY ee.requested_at ASC
    `, [oneHourAgo]);
    
    console.log(`\n⏰ ПРОСРОЧЕННЫЕ ОБЪЯСНИТЕЛЬНЫЕ (более 1 часа)`);
    console.log('-'.repeat(60));
    
    if (!overdueExplanations || overdueExplanations.length === 0) {
      console.log('✅ Просроченных объяснительных не найдено.');
    } else {
      console.log(`⚠️ Найдено просроченных объяснительных: ${overdueExplanations.length}`);
      
      // Группируем по сотрудникам
      const overdueByEmployee = {};
      for (const explanation of overdueExplanations) {
        const empId = String(explanation.employee_id);
        if (!overdueByEmployee[empId]) {
          overdueByEmployee[empId] = {
            employee: {
              name: explanation.employee_name,
              job: explanation.employee_job,
              chat_id: explanation.employee_chat_id
            },
            explanations: []
          };
        }
        overdueByEmployee[empId].explanations.push(explanation);
      }
      
      console.log(`\n👥 ПРОСРОЧЕННЫЕ ОБЪЯСНИТЕЛЬНЫЕ ПО СОТРУДНИКАМ:`);
      
      for (const [empId, data] of Object.entries(overdueByEmployee)) {
        const { employee, explanations } = data;
        
        console.log(`\n👤 ${employee.name} (${employee.job || 'Не указана'})`);
        console.log(`   💬 Chat ID: ${employee.chat_id || 'Не указан'}`);
        console.log(`   📝 Количество просроченных объяснительных: ${explanations.length}`);
        
        for (const explanation of explanations) {
          const requestedAt = new Date(explanation.requested_at);
          const now = new Date();
          const hoursOverdue = Math.floor((now - requestedAt) / (1000 * 60 * 60));
          const minutesOverdue = Math.floor(((now - requestedAt) % (1000 * 60 * 60)) / (1000 * 60));
          
          console.log(`\n   📌 Задача #${explanation.task_id}: ${explanation.task_title}`);
          console.log(`   📅 Дедлайн задачи: ${explanation.task_deadline ? new Date(explanation.task_deadline).toLocaleString('ru-RU') : 'Не указан'}`);
          console.log(`   📅 Запрошена объяснительная: ${requestedAt.toLocaleString('ru-RU')}`);
          console.log(`   ⏰ Просрочена на: ${hoursOverdue}ч ${minutesOverdue}м`);
          console.log(`   📊 Статус: ${explanation.explanation_status}`);
        }
      }
    }
    
    // 2. Проверяем, есть ли система уведомлений директору
    console.log(`\n🔔 СИСТЕМА УВЕДОМЛЕНИЙ ДИРЕКТОРУ`);
    console.log('-'.repeat(60));
    
    // Проверяем, есть ли ExplanationTimeoutService
    try {
      const { ExplanationTimeoutService } = await import('../src/services/ExplanationTimeoutService.js');
      console.log('✅ ExplanationTimeoutService найден');
      
      // Проверяем, запущен ли сервис
      console.log('💡 Для проверки работы сервиса запустите:');
      console.log('   node -e "import(\'./src/services/ExplanationTimeoutService.js\').then(m => new m.ExplanationTimeoutService({}).checkOverdueExplanations())"');
      
    } catch (error) {
      console.log('❌ ExplanationTimeoutService не найден или недоступен');
      console.log(`   Ошибка: ${error.message}`);
    }
    
    // 3. Проверяем настройки директоров
    console.log(`\n👑 НАСТРОЙКИ ДИРЕКТОРОВ`);
    console.log('-'.repeat(60));
    
    // Проверяем переменные окружения
    const directorChatId = process.env.DIRECTOR_CHAT_ID;
    if (directorChatId) {
      console.log(`✅ DIRECTOR_CHAT_ID установлен: ${directorChatId}`);
    } else {
      console.log('❌ DIRECTOR_CHAT_ID не установлен в переменных окружения');
    }
    
    // Проверяем директоров в базе данных
    const directors = await query(`
      SELECT 
        employee_id,
        name,
        job,
        chat_id,
        tg_user_id
      FROM employees 
      WHERE job LIKE '%директор%' 
         OR job LIKE '%руководитель%'
         OR name LIKE '%директор%'
      ORDER BY name
    `);
    
    if (directors && directors.length > 0) {
      console.log(`\n👑 Директора в базе данных (${directors.length}):`);
      for (const director of directors) {
        console.log(`   👤 ${director.name} (ID: ${director.employee_id})`);
        console.log(`      💼 Должность: ${director.job || director.position || 'Не указана'}`);
        console.log(`      💬 Chat ID: ${director.chat_id || 'Не указан'}`);
        console.log(`      📱 Telegram ID: ${director.tg_user_id || 'Не указан'}`);
        console.log('');
      }
    } else {
      console.log('❌ Директора в базе данных не найдены');
    }
    
    // 4. Проверяем логи уведомлений (если есть таблица логов)
    console.log(`\n📋 ЛОГИ УВЕДОМЛЕНИЙ`);
    console.log('-'.repeat(60));
    
    try {
      // Проверяем, есть ли таблица для логов уведомлений
      const logTables = await query("SHOW TABLES LIKE '%log%'");
      if (logTables && logTables.length > 0) {
        console.log('📊 Найдены таблицы логов:');
        for (const table of logTables) {
          console.log(`   ${Object.values(table)[0]}`);
        }
      } else {
        console.log('📝 Таблицы логов не найдены');
      }
    } catch (error) {
      console.log('❌ Ошибка при проверке логов:', error.message);
    }
    
    // 5. Тестируем отправку уведомления (если есть просроченные объяснительные)
    if (overdueExplanations && overdueExplanations.length > 0) {
      console.log(`\n🧪 ТЕСТИРОВАНИЕ УВЕДОМЛЕНИЙ`);
      console.log('-'.repeat(60));
      
      console.log('💡 Для тестирования отправки уведомлений директору:');
      console.log('   1. Убедитесь, что ExplanationTimeoutService запущен');
      console.log('   2. Проверьте настройки уведомлений в коде');
      console.log('   3. Запустите проверку вручную:');
      console.log('      node -e "import(\'./src/services/ExplanationTimeoutService.js\').then(m => new m.ExplanationTimeoutService({}).checkOverdueExplanations())"');
    }
    
    // 6. Рекомендации
    console.log(`\n💡 РЕКОМЕНДАЦИИ`);
    console.log('-'.repeat(60));
    
    if (overdueExplanations && overdueExplanations.length > 0) {
      console.log('🔧 Найдены просроченные объяснительные:');
      console.log('   1. Убедитесь, что ExplanationTimeoutService запущен');
      console.log('   2. Проверьте настройки уведомлений директору');
      console.log('   3. Убедитесь, что у директоров указаны chat_id');
      console.log('   4. Проверьте работу Telegram бота для отправки уведомлений');
    } else {
      console.log('✅ Просроченных объяснительных нет');
    }
    
    if (!directorChatId && (!directors || directors.length === 0)) {
      console.log('⚠️ Не настроены директора для получения уведомлений');
      console.log('   1. Установите DIRECTOR_CHAT_ID в переменных окружения');
      console.log('   2. Или добавьте директоров в таблицу employees с указанием chat_id');
    }
    
    // 7. Статистика
    console.log(`\n📊 СТАТИСТИКА`);
    console.log('-'.repeat(60));
    console.log(`⏰ Просроченных объяснительных: ${overdueExplanations ? overdueExplanations.length : 0}`);
    console.log(`👥 Сотрудников с просроченными объяснительными: ${overdueExplanations ? new Set(overdueExplanations.map(e => e.employee_id)).size : 0}`);
    console.log(`👑 Директоров в системе: ${directors ? directors.length : 0}`);
    console.log(`🔔 DIRECTOR_CHAT_ID настроен: ${directorChatId ? 'Да' : 'Нет'}`);
    
  } catch (error) {
    log.error('[CHECK_DIRECTOR_NOTIFICATIONS] Ошибка:', error.message);
    console.error('❌ Ошибка при проверке уведомлений директору:', error.message);
  }
}

// Запуск скрипта
async function main() {
  await checkDirectorNotifications();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
