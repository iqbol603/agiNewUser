import 'dotenv/config';

export const ENV = {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    TELECOM_ASSISTANT_ID: process.env.TELECOM_ASSISTANT_ID,
    SHEETS_APP_URL: process.env.SHEETS_APP_URL,

    APP_TZ: process.env.APP_TZ || 'Asia/Karachi',
    DB_HOST: process.env.DB_HOST,
    DB_PORT: Number(process.env.DB_PORT) || 3306,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME,
    DB_CONNECTION_LIMIT: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    DB_CHARSET: process.env.DB_CHARSET || 'utf8mb4'
};

if (ENV.APP_TZ && process.env.TZ !== ENV.APP_TZ) {
    process.env.TZ = ENV.APP_TZ;
}

export function assertEnv() {
    const miss = Object.entries(ENV)
        .filter(([k, v]) => !v && k !== 'NODE_ENV')
        .map(([k]) => k);
    if (miss.length) {
        throw new Error(`Отсутствуют переменные окружения: ${miss.join(', ')}`);
    }
}