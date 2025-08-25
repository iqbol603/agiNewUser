import mysql from 'mysql2/promise';
import { ENV, assertEnv } from './env.js';

assertEnv();

export const pool = mysql.createPool({
    host: ENV.DB_HOST,
    port: ENV.DB_PORT,
    user: ENV.DB_USER,
    password: ENV.DB_PASSWORD,
    database: ENV.DB_NAME,
    waitForConnections: true,
    connectionLimit: ENV.DB_CONNECTION_LIMIT,
    charset: ENV.DB_CHARSET
});

export async function query(sql, params) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

export async function testConnection() {
    const [rows] = await pool.query('SELECT 1 AS ok, NOW() AS now');
  if (!rows?.length) throw new Error('MySQL test query returned no rows');
}