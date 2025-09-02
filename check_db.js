import { query } from './src/config/db.js';

async function checkDatabase() {
    try {
        console.log('🔍 Проверяю базу данных...\n');
        
        // Проверяем таблицы
        const tables = await query('SHOW TABLES');
        console.log('📋 Таблицы в БД:');
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`  - ${tableName}`);
        });
        
        console.log('\n📊 Содержимое таблицы tasks:');
        const tasks = await query('SELECT * FROM tasks LIMIT 5');
        if (tasks.length === 0) {
            console.log('  ❌ Задач нет!');
        } else {
            console.log(`  ✅ Найдено задач: ${tasks.length}`);
            tasks.forEach((task, i) => {
                console.log(`    ${i+1}. ID: ${task.id}, Название: ${task.task}, Статус: ${task.status}`);
            });
        }
        
        console.log('\n💬 Последние сообщения AI:');
        const messages = await query('SELECT * FROM ai_messages ORDER BY created_at DESC LIMIT 3');
        if (messages.length === 0) {
            console.log('  ❌ Сообщений нет!');
        } else {
            console.log(`  ✅ Найдено сообщений: ${messages.length}`);
            messages.forEach((msg, i) => {
                console.log(`    ${i+1}. ID: ${msg.id}, Chat: ${msg.tg_chat_id}, Время: ${msg.created_at}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    }
    
    process.exit(0);
}

checkDatabase();
