import { assertEnv, ENV } from './src/config/env.js';
import { log } from './src/utils/logger.js';
import { BotApp } from './src/bot/BotApp.js';
import { testConnection, pool, initializeTables } from './src/config/db.js';

let botApp;

async function start() {
    try {
        assertEnv();
        log.info('[APP] Переменные окружения проверены');

        // Инициализируем базу данных
        log.info('[APP] Инициализация базы данных...');
        const dbConnected = await testConnection();
        if (!dbConnected) {
            throw new Error('Не удалось подключиться к базе данных');
        }

        // Инициализируем новые таблицы
        log.info('[APP] Инициализация новых таблиц...');
        const tablesInitialized = await initializeTables();
        if (!tablesInitialized) {
            log.warn('[APP] Предупреждение: не все таблицы инициализированы');
        }

        // Запускаем бота
        log.info('[APP] Запуск бота...');
        botApp = new BotApp();
        if (typeof botApp.start === 'function') {
            await botApp.start();
        }

        log.info('Bot is up and running ✅');
        log.info('[APP] Все сервисы запущены успешно');
        
    } catch (error) {
        log.error('[APP] Критическая ошибка при запуске:', error.message);
        process.exit(1);
    }
}

async function shutdown({code = 0, reason = 'SIGTERM'} = {}) {
    try {
        log.warn(`Shutting down (${reason})…`);

        if (botApp && typeof botApp.stop === 'function') {
            await botApp.stop();
        }

        // Закрываем соединения с БД
        if (pool && typeof pool.end === 'function') {
            await pool.end();
            log.info('[APP] Соединения с базой данных закрыты');
        }

        log.info('Graceful shutdown complete. Bye 👋');
        process.exit(code);
    } catch (err) {
        log.error('Shutdown error:', err?.message || err);
        process.exit(1);
    }
}

// Обработчики сигналов завершения
process.on('uncaughtException', (err) => {
    log.error('Uncaught exception:', err);
    shutdown({
        code: 1,
        reason: 'uncaughtException'
    });
});

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection:', reason);
    shutdown({
        code: 1,
        reason: 'unhandledRejection'
    });
});

process.on('SIGINT', () => shutdown({
    code: 0,
    reason: 'SIGINT'
}));

process.on('SIGTERM', () => shutdown({
    code: 0,
    reason: 'SIGTERM'
}));

// Запуск приложения
start().catch((e) => {
    log.error('Fatal on start:', e?.message || e);
    process.exit(1);
});