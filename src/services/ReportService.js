import { query } from '../config/db.js';
import { log } from '../utils/logger.js';
import { DoDService } from './DoDService.js';
import { AutoCheckService } from './AutoCheckService.js';

export class ReportService {
    constructor() {
        this.dodService = new DoDService();
        this.autoCheckService = new AutoCheckService();
    }

    async generateTaskReport(taskId) {
        try {
            // Получаем информацию о задаче
            const [task] = await query(
                'SELECT * FROM tasks WHERE task_id = ?',
                [taskId]
            );

            if (!task) {
                return { ok: false, error: 'Задача не найдена' };
            }

            // Получаем статус DoD чек-листов
            const dodStatus = await this.dodService.isTaskComplete(taskId);
            
            // Получаем результаты автоматических проверок
            const autoCheckResults = await this.autoCheckService.runAllChecks(taskId, this.determineTaskType(task));
            
            // Генерируем отчет
            const report = {
                taskId,
                taskTitle: task.task,
                assignee: task.employee_id,
                status: task.status,
                priority: task.prioritet,
                deadline: task.deadline,
                createdAt: task.created_at,
                reportGeneratedAt: new Date().toISOString(),
                
                dod: {
                    status: dodStatus.complete ? 'COMPLETED' : 'INCOMPLETE',
                    reason: dodStatus.reason,
                    checklists: await this.getDoDChecklists(taskId)
                },
                
                autoChecks: {
                    status: autoCheckResults.overall.success ? 'PASSED' : 'FAILED',
                    summary: autoCheckResults.overall,
                    details: autoCheckResults.checks,
                    recommendations: autoCheckResults.recommendations || []
                },
                
                quality: this.calculateQualityScore(dodStatus, autoCheckResults),
                
                recommendations: this.generateOverallRecommendations(dodStatus, autoCheckResults)
            };

            // Сохраняем отчет в БД
            await this.saveReport(taskId, report);
            
            log.info(`[Report] Отчет для задачи ${taskId} сгенерирован`);
            return { ok: true, report };
            
        } catch (error) {
            log.error('[Report] Ошибка генерации отчета:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async getDoDChecklists(taskId) {
        try {
            const checklists = await query(
                'SELECT checklist_type, items, completed_items, updated_at FROM dod_checklists WHERE task_id = ?',
                [taskId]
            );

            return checklists.map(checklist => ({
                type: checklist.checklist_type,
                total: JSON.parse(checklist.items).length,
                completed: JSON.parse(checklist.completed_items).length,
                progress: Math.round((JSON.parse(checklist.completed_items).length / JSON.parse(checklist.items).length) * 100),
                lastUpdated: checklist.updated_at
            }));
        } catch (error) {
            log.error('[Report] Ошибка получения DoD чек-листов:', error.message);
            return [];
        }
    }

    determineTaskType(task) {
        const title = task.task.toLowerCase();
        const description = (task.description || '').toLowerCase();
        
        if (title.includes('тест') || title.includes('test') || description.includes('тест')) {
            return 'testing';
        }
        
        if (title.includes('документ') || title.includes('doc') || description.includes('документ')) {
            return 'documentation';
        }
        
        if (title.includes('деплой') || title.includes('deploy') || description.includes('деплой')) {
            return 'deployment';
        }
        
        return 'development';
    }

    calculateQualityScore(dodStatus, autoCheckResults) {
        let score = 0;
        let maxScore = 100;
        
        // DoD чек-листы (40% от общего балла)
        if (dodStatus.complete) {
            score += 40;
        } else {
            // Частичные баллы за прогресс
            score += Math.min(40, 20); // Минимум 20 баллов если есть чек-листы
        }
        
        // Автоматические проверки (60% от общего балла)
        const autoCheckScore = (autoCheckResults.overall.passed / autoCheckResults.overall.total) * 60;
        score += autoCheckScore;
        
        return {
            score: Math.round(score),
            maxScore,
            percentage: Math.round((score / maxScore) * 100),
            grade: this.getGrade(score)
        };
    }

    getGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    generateOverallRecommendations(dodStatus, autoCheckResults) {
        const recommendations = [];
        
        // DoD рекомендации
        if (!dodStatus.complete) {
            recommendations.push('Завершите все пункты Definition of Done чек-листов');
        }
        
        // Автоматические проверки рекомендации
        if (autoCheckResults.overall.failed > 0) {
            recommendations.push('Исправьте ошибки автоматических проверок');
        }
        
        // Общие рекомендации
        if (recommendations.length === 0) {
            recommendations.push('Задача готова к принятию');
        }
        
        return recommendations;
    }

    async saveReport(taskId, report) {
        try {
            await query(
                'INSERT INTO task_reports (task_id, report_data, generated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE report_data = ?, generated_at = ?',
                [taskId, JSON.stringify(report), report.reportGeneratedAt, JSON.stringify(report), report.reportGeneratedAt]
            );
        } catch (error) {
            // Если таблица не существует, создаем её
            if (error.message.includes("doesn't exist")) {
                await this.createReportsTable();
                await this.saveReport(taskId, report);
            } else {
                throw error;
            }
        }
    }

    async createReportsTable() {
        try {
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
            log.info('[Report] Таблица task_reports создана');
        } catch (error) {
            log.error('[Report] Ошибка создания таблицы отчетов:', error.message);
        }
    }

    async getTaskReport(taskId) {
        try {
            const [report] = await query(
                'SELECT report_data FROM task_reports WHERE task_id = ?',
                [taskId]
            );
            
            if (report) {
                return { ok: true, report: JSON.parse(report.report_data) };
            } else {
                return { ok: false, error: 'Отчет не найден' };
            }
        } catch (error) {
            log.error('[Report] Ошибка получения отчета:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async generateProjectReport(projectId = null, dateFrom = null, dateTo = null) {
        try {
            let whereClause = '1=1';
            const params = [];
            
            if (projectId) {
                whereClause += ' AND project_id = ?';
                params.push(projectId);
            }
            
            if (dateFrom) {
                whereClause += ' AND created_at >= ?';
                params.push(dateFrom);
            }
            
            if (dateTo) {
                whereClause += ' AND created_at <= ?';
                params.push(dateTo);
            }
            
            const tasks = await query(
                `SELECT task_id, task, status, created_at FROM tasks WHERE ${whereClause}`,
                params
            );
            
            const projectReport = {
                period: { from: dateFrom, to: dateTo },
                totalTasks: tasks.length,
                tasksByStatus: {},
                qualityMetrics: {
                    averageScore: 0,
                    totalScore: 0,
                    grades: { A: 0, B: 0, C: 0, D: 0, F: 0 }
                },
                generatedAt: new Date().toISOString()
            };
            
            let totalScore = 0;
            let scoredTasks = 0;
            
            for (const task of tasks) {
                const report = await this.getTaskReport(task.task_id);
                if (report.ok && report.report.quality) {
                    const quality = report.report.quality;
                    totalScore += quality.score;
                    scoredTasks++;
                    projectReport.qualityMetrics.grades[quality.grade]++;
                }
                
                // Статистика по статусам
                const status = task.status || 'Неизвестно';
                projectReport.tasksByStatus[status] = (projectReport.tasksByStatus[status] || 0) + 1;
            }
            
            if (scoredTasks > 0) {
                projectReport.qualityMetrics.averageScore = Math.round(totalScore / scoredTasks);
                projectReport.qualityMetrics.totalScore = totalScore;
            }
            
            return { ok: true, report: projectReport };
            
        } catch (error) {
            log.error('[Report] Ошибка генерации отчета проекта:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async createTaskReport(reportData) {
        try {
            const {
                taskId,
                summary = '',
                details = '',
                artifacts = [],
                quality = 'Хорошо'
            } = reportData;

            if (!taskId) {
                return { ok: false, error: 'ID задачи обязателен' };
            }

            // Создаем отчет
            const report = {
                taskId,
                summary,
                details,
                artifacts,
                quality,
                createdAt: new Date().toISOString(),
                status: 'active'
            };

            // Сохраняем в БД
            await this.saveReport(taskId, report);
            
            log.info(`[Report] Отчет для задачи ${taskId} создан`);
            return { ok: true, report };
            
        } catch (error) {
            log.error('[Report] Ошибка создания отчета:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async saveReport(taskId, reportData) {
        try {
            await query(
                `INSERT INTO task_reports (task_id, report_data) 
                 VALUES (?, ?) 
                 ON DUPLICATE KEY UPDATE 
                 report_data = VALUES(report_data)`,
                [taskId, JSON.stringify(reportData)]
            );
            
            log.info(`[Report] Отчет для задачи ${taskId} сохранен в БД`);
            return true;
            
        } catch (error) {
            log.error('[Report] Ошибка сохранения отчета в БД:', error.message);
            return false;
        }
    }
}
