import { assertEnv, ENV } from './src/config/env.js';
import { log } from './src/utils/logger.js';
import { BotApp } from './src/bot/BotApp.js';
// import { testConnection, pool } from './src/config/db.js';

let botApp;

async function start() {
    assertEnv();

    botApp = new BotApp();
    if (typeof botApp.start === 'function') {
        await botApp.start();
    }

    log.info('Bot is up and running ✅');
}

async function shutdown({code = 0, reason = 'SIGTERM'} = {}) {
    try {
        log.warn(`Shutting down (${reason})…`);

        if (botApp && typeof botApp.stop === 'function') {
            await botApp.stop();
        }

        await pool.end();

        log.info('Graceful shutdown complete. Bye 👋');
        process.exit(code);
    } catch (err) {
        log.error('Shutdown error:', err?.message || err);
        process.exit(1);
    }
}

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

start().catch((e) => {
    log.error('Fatal on start:', e?.message || e);
    process.exit(1);
});