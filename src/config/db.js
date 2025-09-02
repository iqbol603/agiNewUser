import mysql from 'mysql2/promise';
import { ENV } from './env.js';
import { log } from '../utils/logger.js';

// Создаем пул соединений
export const pool = mysql.createPool({
    host: ENV.DB_HOST,
    port: ENV.DB_PORT,
    user: ENV.DB_USER,
    password: ENV.DB_PASSWORD,
    database: ENV.DB_NAME,
    connectionLimit: ENV.DB_CONNECTION_LIMIT,
    charset: 'utf8mb4',
    timezone: '+00:00'
    // Убираем неподдерживаемые опции
});

// Функция для выполнения запросов
export async function query(sql, params = []) {
    const connection = await pool.getConnection();
    try {
        const [results] = await connection.execute(sql, params);
        return results;
    } catch (error) {
        log.error('[DB] Ошибка запроса:', error.message);
        log.error('[DB] SQL:', sql);
        log.error('[DB] Параметры:', params);
        throw error;
    } finally {
        connection.release();
    }
}

// Функция для транзакций
export async function transaction(callback) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Тестирование соединения
export async function testConnection() {
    try {
        const result = await query('SELECT 1 as test');
        log.info('[DB] Соединение с базой данных установлено успешно');
        return true;
    } catch (error) {
        log.error('[DB] Ошибка соединения с базой данных:', error.message);
        return false;
    }
}

// Инициализация таблиц для новых функций
export async function initializeTables() {
    try {
        log.info('[DB] Инициализация таблиц для новых функций...');
        
        // Таблица для DoD чек-листов (исправляем JSON поля)
        await query(`
            CREATE TABLE IF NOT EXISTS dod_checklists (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                checklist_type ENUM('development', 'testing', 'deployment', 'documentation') NOT NULL,
                items JSON NOT NULL,
                completed_items JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_task_id (task_id),
                INDEX idx_checklist_type (checklist_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Таблица для артефактов задач
        await query(`
            CREATE TABLE IF NOT EXISTS task_artifacts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NULL,
                artifact_type ENUM('code', 'documentation', 'images', 'config', 'logs', 'tests', 'other') NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                file_size BIGINT,
                file_hash VARCHAR(64),
                content_preview TEXT,
                relevance_score FLOAT DEFAULT 0.0,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                uploaded_by INT,
                INDEX idx_task_id (task_id),
                INDEX idx_artifact_type (artifact_type),
                INDEX idx_relevance_score (relevance_score)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Таблица для отчетов о задачах
        await query(`
            CREATE TABLE IF NOT EXISTS task_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                report_data JSON NOT NULL,
                generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_task_report (task_id),
                INDEX idx_task_id (task_id),
                INDEX idx_generated_at (generated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Таблица для автоматических проверок
        await query(`
            CREATE TABLE IF NOT EXISTS auto_check_results (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                check_type ENUM('lint', 'test', 'build', 'security', 'dependencies') NOT NULL,
                status ENUM('passed', 'failed', 'error') NOT NULL,
                details TEXT,
                duration INT DEFAULT 0,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_task_id (task_id),
                INDEX idx_check_type (check_type),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Таблица для объяснительных сотрудников
        await query(`
            CREATE TABLE IF NOT EXISTS employee_explanations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                employee_id INT NOT NULL,
                explanation_text TEXT NOT NULL,
                status ENUM('pending', 'accepted', 'rejected', 'bonus_penalty') NOT NULL DEFAULT 'pending',
                manager_decision TEXT,
                bonus_penalty_amount DECIMAL(10,2) DEFAULT 0.00,
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                responded_at TIMESTAMP NULL,
                manager_reviewed_at TIMESTAMP NULL,
                INDEX idx_task_id (task_id),
                INDEX idx_employee_id (employee_id),
                INDEX idx_status (status),
                INDEX idx_requested_at (requested_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        log.info('[DB] Все таблицы инициализированы успешно');
        return true;
        
    } catch (error) {
        log.error('[DB] Ошибка инициализации таблиц:', error.message);
        return false;
    }
}

// Проверка структуры существующих таблиц
export async function checkTableStructure() {
    try {
        const tables = ['tasks', 'ai_messages'];
        const structure = {};
        
        for (const table of tables) {
            try {
                const columns = await query(`DESCRIBE ${table}`);
                structure[table] = columns.map(col => ({
                    field: col.Field,
                    type: col.Type,
                    null: col.Null,
                    key: col.Key,
                    default: col.Default,
                    extra: col.Extra
                }));
            } catch (error) {
                log.warn(`[DB] Таблица ${table} не найдена или недоступна`);
                structure[table] = null;
            }
        }
        
        return structure;
    } catch (error) {
        log.error('[DB] Ошибка проверки структуры таблиц:', error.message);
        return {};
    }
}

// Экспортируем по умолчанию
export default {
    pool,
    query,
    transaction,
    testConnection,
    initializeTables,
    checkTableStructure
};