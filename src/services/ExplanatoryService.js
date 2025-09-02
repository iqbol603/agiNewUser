import { query } from '../config/db.js';
import { log } from '../utils/logger.js';

export class ExplanatoryService {
  constructor() {
    this.initializeTable();
  }

  async initializeTable() {
    try {
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
      log.info('[ExplanatoryService] Таблица employee_explanations инициализирована');
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка инициализации таблицы:', error.message);
    }
  }

  /**
   * Создает запрос объяснительной для просроченной задачи
   */
  async requestExplanation(taskId, employeeId, taskTitle, deadline) {
    try {
      const result = await query(`
        INSERT INTO employee_explanations (task_id, employee_id, explanation_text, status)
        VALUES (?, ?, ?, 'pending')
      `, [taskId, employeeId, `Explanation request for task: ${taskTitle}`, 'pending']);

      log.info(`[ExplanatoryService] Запрос объяснительной создан для задачи ${taskId}, сотрудника ${employeeId}`);
      return result.insertId;
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка создания запроса объяснительной:', error.message);
      throw error;
    }
  }

  /**
   * Получает все ожидающие объяснительные
   */
  async getPendingExplanations() {
    try {
      const explanations = await query(`
        SELECT ee.*, t.task, t.deadline, e.name as employee_name, e.chat_id
        FROM employee_explanations ee
        LEFT JOIN tasks t ON ee.task_id = t.task_id
        LEFT JOIN employees e ON ee.employee_id = e.employee_id
        WHERE ee.status = 'pending'
        ORDER BY ee.requested_at ASC
      `);

      return explanations;
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка получения ожидающих объяснительных:', error.message);
      return [];
    }
  }

  /**
   * Сохраняет объяснительную от сотрудника
   */
  async submitExplanation(explanationId, explanationText, employeeId) {
    try {
      await query(`
        UPDATE employee_explanations 
        SET explanation_text = ?, responded_at = NOW()
        WHERE id = ? AND employee_id = ? AND status = 'pending'
      `, [explanationText, explanationId, employeeId]);

      log.info(`[ExplanatoryService] Объяснительная ${explanationId} получена от сотрудника ${employeeId}`);
      return true;
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка сохранения объяснительной:', error.message);
      return false;
    }
  }

  /**
   * Получает объяснительные для рассмотрения директором
   */
  async getExplanationsForReview() {
    try {
      const explanations = await query(`
        SELECT ee.*, t.task, t.deadline, e.name as employee_name, e.job
        FROM employee_explanations ee
        LEFT JOIN tasks t ON ee.task_id = t.task_id
        LEFT JOIN employees e ON ee.employee_id = e.employee_id
        WHERE ee.status = 'pending' AND ee.responded_at IS NOT NULL
        ORDER BY ee.responded_at ASC
      `);

      return explanations;
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка получения объяснительных для рассмотрения:', error.message);
      return [];
    }
  }

  /**
   * Принимает решение директора по объяснительной
   */
  async reviewExplanation(explanationId, decision, managerDecision, bonusPenaltyAmount = 0) {
    try {
      let status = 'accepted';
      if (decision === 'reject') {
        status = 'rejected';
      } else if (decision === 'penalty') {
        status = 'bonus_penalty';
      }

      await query(`
        UPDATE employee_explanations 
        SET status = ?, manager_decision = ?, bonus_penalty_amount = ?, manager_reviewed_at = NOW()
        WHERE id = ?
      `, [status, managerDecision, bonusPenaltyAmount, explanationId]);

      log.info(`[ExplanatoryService] Решение по объяснительной ${explanationId}: ${status}`);
      return true;
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка принятия решения:', error.message);
      return false;
    }
  }

  /**
   * Получает статистику по объяснительным
   */
  async getExplanatoryStats() {
    try {
      const stats = await query(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(bonus_penalty_amount) as avg_penalty
        FROM employee_explanations 
        WHERE requested_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY status
      `);

      return stats;
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка получения статистики:', error.message);
      return [];
    }
  }

  /**
   * Получает объяснительные сотрудника
   */
  async getEmployeeExplanations(employeeId, limit = 10) {
    try {
      const explanations = await query(`
        SELECT ee.*, t.task, t.deadline
        FROM employee_explanations ee
        LEFT JOIN tasks t ON ee.task_id = t.task_id
        WHERE ee.employee_id = ?
        ORDER BY ee.requested_at DESC
        LIMIT ?
      `, [employeeId, limit]);

      return explanations;
    } catch (error) {
      log.error('[ExplanatoryService] Ошибка получения объяснительных сотрудника:', error.message);
      return [];
    }
  }
}
