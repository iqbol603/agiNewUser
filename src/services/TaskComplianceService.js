import { query } from '../config/db.js';
import { log } from '../utils/logger.js';
import { DoDService } from './DoDService.js';
import { ArtifactService } from './ArtifactService.js';
import { AutoCheckService } from './AutoCheckService.js';

export class TaskComplianceService {
    constructor() {
        this.dodService = new DoDService();
        this.artifactService = new ArtifactService();
        this.autoCheckService = new AutoCheckService();
    }

    async checkTaskCompliance(taskId) {
        try {
            // Получаем информацию о задаче
            const [task] = await query(
                'SELECT * FROM tasks WHERE task_id = ?',
                [taskId]
            );

            if (!task) {
                return { ok: false, error: 'Задача не найдена' };
            }

            const compliance = {
                taskId,
                taskTitle: task.task,
                status: task.status,
                checkTimestamp: new Date().toISOString(),
                
                // Проверка DoD чек-листов
                dod: await this.checkDoDCompliance(taskId),
                
                // Проверка артефактов
                artifacts: await this.checkArtifactsCompliance(taskId),
                
                // Проверка автоматических проверок
                autoChecks: await this.checkAutoChecksCompliance(taskId, task),
                
                // Общая оценка соответствия
                overall: {
                    score: 0,
                    maxScore: 100,
                    percentage: 0,
                    grade: 'F',
                    status: 'INCOMPLETE',
                    recommendations: []
                }
            };

            // Вычисляем общую оценку
            compliance.overall = this.calculateOverallCompliance(compliance);
            
            // Генерируем рекомендации
            compliance.overall.recommendations = this.generateComplianceRecommendations(compliance);
            
            log.info(`[Compliance] Проверка соответствия для задачи ${taskId} завершена. Оценка: ${compliance.overall.score}/${compliance.overall.maxScore}`);
            
            return { ok: true, compliance };
            
        } catch (error) {
            log.error('[Compliance] Ошибка проверки соответствия:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async checkDoDCompliance(taskId) {
        try {
            const dodStatus = await this.dodService.isTaskComplete(taskId);
            const checklists = await this.dodService.getDoDChecklists(taskId);
            
            let totalItems = 0;
            let completedItems = 0;
            
            for (const checklist of checklists) {
                totalItems += checklist.total;
                completedItems += checklist.completed;
            }
            
            const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
            
            return {
                status: dodStatus.complete ? 'COMPLETED' : 'INCOMPLETE',
                progress: Math.round(progress),
                totalItems,
                completedItems,
                checklists: checklists.map(cl => ({
                    type: cl.type,
                    progress: cl.progress,
                    total: cl.total,
                    completed: cl.completed
                })),
                score: Math.round(progress),
                maxScore: 100
            };
        } catch (error) {
            log.error('[Compliance] Ошибка проверки DoD:', error.message);
            return {
                status: 'ERROR',
                progress: 0,
                totalItems: 0,
                completedItems: 0,
                checklists: [],
                score: 0,
                maxScore: 100,
                error: error.message
            };
        }
    }

    async checkArtifactsCompliance(taskId) {
        try {
            const artifacts = await this.artifactService.getTaskArtifacts(taskId);
            const validation = await this.artifactService.validateArtifactsForTask(taskId);
            
            if (!artifacts.ok || !validation.ok) {
                return {
                    status: 'ERROR',
                    totalArtifacts: 0,
                    coverage: {},
                    score: 0,
                    maxScore: 100,
                    error: 'Ошибка проверки артефактов'
                };
            }
            
            return {
                status: validation.validation.overallScore >= 70 ? 'ADEQUATE' : 'INSUFFICIENT',
                totalArtifacts: artifacts.artifacts.length,
                coverage: validation.validation.coverage,
                score: validation.validation.overallScore,
                maxScore: 100,
                recommendations: validation.validation.recommendations
            };
        } catch (error) {
            log.error('[Compliance] Ошибка проверки артефактов:', error.message);
            return {
                status: 'ERROR',
                totalArtifacts: 0,
                coverage: {},
                score: 0,
                maxScore: 100,
                error: error.message
            };
        }
    }

    async checkAutoChecksCompliance(taskId, task) {
        try {
            const taskType = this.determineTaskType(task);
            const checkResults = await this.autoCheckService.runAllChecks(taskId, taskType);
            
            if (!checkResults.overall) {
                return {
                    status: 'ERROR',
                    passed: 0,
                    failed: 0,
                    total: 0,
                    score: 0,
                    maxScore: 100,
                    error: 'Ошибка выполнения автоматических проверок'
                };
            }
            
            const score = checkResults.overall.total > 0 
                ? (checkResults.overall.passed / checkResults.overall.total) * 100 
                : 0;
            
            return {
                status: checkResults.overall.success ? 'PASSED' : 'FAILED',
                passed: checkResults.overall.passed,
                failed: checkResults.overall.failed,
                total: checkResults.overall.total,
                score: Math.round(score),
                maxScore: 100,
                details: checkResults.checks,
                recommendations: checkResults.recommendations || []
            };
        } catch (error) {
            log.error('[Compliance] Ошибка проверки автоматических проверок:', error.message);
            return {
                status: 'ERROR',
                passed: 0,
                failed: 0,
                total: 0,
                score: 0,
                maxScore: 100,
                error: error.message
            };
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

    calculateOverallCompliance(compliance) {
        const weights = {
            dod: 0.4,        // 40% - DoD чек-листы
            artifacts: 0.3,   // 30% - Артефакты
            autoChecks: 0.3   // 30% - Автоматические проверки
        };
        
        let totalScore = 0;
        let maxScore = 100;
        
        // DoD чек-листы
        if (compliance.dod.score !== undefined) {
            totalScore += (compliance.dod.score / compliance.dod.maxScore) * weights.dod * maxScore;
        }
        
        // Артефакты
        if (compliance.artifacts.score !== undefined) {
            totalScore += (compliance.artifacts.score / compliance.artifacts.maxScore) * weights.artifacts * maxScore;
        }
        
        // Автоматические проверки
        if (compliance.autoChecks.score !== undefined) {
            totalScore += (compliance.autoChecks.score / compliance.autoChecks.maxScore) * weights.autoChecks * maxScore;
        }
        
        const finalScore = Math.round(totalScore);
        const percentage = Math.round((finalScore / maxScore) * 100);
        
        return {
            score: finalScore,
            maxScore,
            percentage,
            grade: this.getGrade(finalScore),
            status: this.getStatus(finalScore)
        };
    }

    getGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    getStatus(score) {
        if (score >= 80) return 'READY';
        if (score >= 60) return 'NEEDS_IMPROVEMENT';
        return 'INCOMPLETE';
    }

    generateComplianceRecommendations(compliance) {
        const recommendations = [];
        
        // DoD рекомендации
        if (compliance.dod.progress < 100) {
            recommendations.push(`Завершите DoD чек-листы: ${compliance.dod.completedItems}/${compliance.dod.totalItems} пунктов выполнено`);
        }
        
        // Рекомендации по артефактам
        if (compliance.artifacts.status === 'INSUFFICIENT') {
            recommendations.push('Улучшите качество и количество артефактов');
        }
        
        if (compliance.artifacts.recommendations) {
            recommendations.push(...compliance.artifacts.recommendations);
        }
        
        // Рекомендации по автоматическим проверкам
        if (compliance.autoChecks.status === 'FAILED') {
            recommendations.push('Исправьте ошибки автоматических проверок');
        }
        
        if (compliance.autoChecks.recommendations) {
            recommendations.push(...compliance.autoChecks.recommendations);
        }
        
        // Общие рекомендации
        if (compliance.overall.status === 'READY') {
            recommendations.push('Задача готова к принятию! 🎉');
        } else if (compliance.overall.status === 'NEEDS_IMPROVEMENT') {
            recommendations.push('Задача требует доработки перед принятием');
        } else {
            recommendations.push('Задача не готова к принятию. Выполните все обязательные требования');
        }
        
        return recommendations;
    }

    async canTaskBeCompleted(taskId) {
        try {
            const compliance = await this.checkTaskCompliance(taskId);
            
            if (!compliance.ok) {
                return { ok: false, error: compliance.error };
            }
            
            const canComplete = compliance.compliance.overall.status === 'READY';
            
            return {
                ok: true,
                canComplete,
                score: compliance.compliance.overall.score,
                status: compliance.compliance.overall.status,
                recommendations: compliance.compliance.overall.recommendations
            };
            
        } catch (error) {
            log.error('[Compliance] Ошибка проверки возможности завершения задачи:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async generateComplianceReport(taskId) {
        try {
            const compliance = await this.checkTaskCompliance(taskId);
            
            if (!compliance.ok) {
                return compliance;
            }
            
            const report = {
                taskId,
                taskTitle: compliance.compliance.taskTitle,
                generatedAt: compliance.compliance.checkTimestamp,
                summary: {
                    overallScore: compliance.compliance.overall.score,
                    grade: compliance.compliance.overall.grade,
                    status: compliance.compliance.overall.status,
                    canBeCompleted: compliance.compliance.overall.status === 'READY'
                },
                details: {
                    dod: compliance.compliance.dod,
                    artifacts: compliance.compliance.artifacts,
                    autoChecks: compliance.compliance.autoChecks
                },
                recommendations: compliance.compliance.overall.recommendations,
                nextSteps: this.generateNextSteps(compliance.compliance)
            };
            
            return { ok: true, report };
            
        } catch (error) {
            log.error('[Compliance] Ошибка генерации отчета о соответствии:', error.message);
            return { ok: false, error: error.message };
        }
    }

    generateNextSteps(compliance) {
        const nextSteps = [];
        
        if (compliance.dod.progress < 100) {
            nextSteps.push('1. Завершите все пункты DoD чек-листов');
        }
        
        if (compliance.artifacts.status === 'INSUFFICIENT') {
            nextSteps.push('2. Добавьте недостающие артефакты и улучшите качество существующих');
        }
        
        if (compliance.autoChecks.status === 'FAILED') {
            nextSteps.push('3. Исправьте ошибки автоматических проверок');
        }
        
        if (nextSteps.length === 0) {
            nextSteps.push('Задача готова к принятию!');
        }
        
        return nextSteps;
    }
}
