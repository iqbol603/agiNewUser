import { execSync } from 'child_process';
import { log } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

export class AutoCheckService {
    constructor() {
        this.checks = {
            lint: this.runLint.bind(this),
            test: this.runTests.bind(this),
            build: this.runBuild.bind(this),
            security: this.runSecurityCheck.bind(this),
            dependencies: this.checkDependencies.bind(this)
        };
    }

    async runAllChecks(taskId, taskType = 'development') {
        const results = {
            taskId,
            timestamp: new Date().toISOString(),
            checks: {},
            overall: { passed: 0, failed: 0, total: 0 }
        };

        try {
            // Определяем какие проверки нужны для типа задачи
            const requiredChecks = this.getRequiredChecks(taskType);
            
            for (const checkName of requiredChecks) {
                if (this.checks[checkName]) {
                    try {
                        const result = await this.checks[checkName]();
                        results.checks[checkName] = {
                            status: result.success ? 'passed' : 'failed',
                            details: result.details,
                            duration: result.duration
                        };
                        
                        if (result.success) {
                            results.overall.passed++;
                        } else {
                            results.overall.failed++;
                        }
                        results.overall.total++;
                    } catch (error) {
                        results.checks[checkName] = {
                            status: 'error',
                            details: error.message,
                            duration: 0
                        };
                        results.overall.failed++;
                        results.overall.total++;
                    }
                }
            }

            // Определяем общий статус
            results.overall.success = results.overall.failed === 0;
            
            log.info(`[AutoCheck] Проверки для задачи ${taskId} завершены: ${results.overall.passed}/${results.overall.total} пройдено`);
            
            return results;
        } catch (error) {
            log.error('[AutoCheck] Ошибка выполнения проверок:', error.message);
            return {
                taskId,
                timestamp: new Date().toISOString(),
                error: error.message,
                overall: { success: false, passed: 0, failed: 1, total: 1 }
            };
        }
    }

    getRequiredChecks(taskType) {
        const checkMap = {
            development: ['lint', 'test', 'dependencies'],
            testing: ['test', 'dependencies'],
            deployment: ['lint', 'test', 'build', 'security'],
            documentation: ['dependencies']
        };
        
        return checkMap[taskType] || ['lint', 'test'];
    }

    async runLint() {
        const startTime = Date.now();
        
        try {
            // Проверяем наличие ESLint
            if (!fs.existsSync('.eslintrc.js') && !fs.existsSync('.eslintrc.json')) {
                return {
                    success: true,
                    details: 'ESLint не настроен, пропускаем проверку',
                    duration: Date.now() - startTime
                };
            }

            const result = execSync('npm run lint', { 
                encoding: 'utf8',
                stdio: 'pipe'
            });
            
            return {
                success: true,
                details: 'ESLint проверка пройдена успешно',
                duration: Date.now() - startTime
            };
        } catch (error) {
            return {
                success: false,
                details: error.stdout || error.message,
                duration: Date.now() - startTime
            };
        }
    }

    async runTests() {
        const startTime = Date.now();
        
        try {
            // Проверяем наличие тестов
            if (!fs.existsSync('test') && !fs.existsSync('tests') && !fs.existsSync('__tests__')) {
                return {
                    success: true,
                    details: 'Тесты не найдены, пропускаем проверку',
                    duration: Date.now() - startTime
                };
            }

            const result = execSync('npm test', { 
                encoding: 'utf8',
                stdio: 'pipe'
            });
            
            return {
                success: true,
                details: 'Тесты пройдены успешно',
                duration: Date.now() - startTime
            };
        } catch (error) {
            return {
                success: false,
                details: error.stdout || error.message,
                duration: Date.now() - startTime
            };
        }
    }

    async runBuild() {
        const startTime = Date.now();
        
        try {
            // Проверяем наличие build скрипта
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            if (!packageJson.scripts || !packageJson.scripts.build) {
                return {
                    success: true,
                    details: 'Build скрипт не настроен, пропускаем проверку',
                    duration: Date.now() - startTime
                };
            }

            const result = execSync('npm run build', { 
                encoding: 'utf8',
                stdio: 'pipe'
            });
            
            return {
                success: true,
                details: 'Сборка прошла успешно',
                duration: Date.now() - startTime
            };
        } catch (error) {
            return {
                success: false,
                details: error.stdout || error.message,
                duration: Date.now() - startTime
            };
        }
    }

    async runSecurityCheck() {
        const startTime = Date.now();
        
        try {
            const result = execSync('npm audit --audit-level=moderate', { 
                encoding: 'utf8',
                stdio: 'pipe'
            });
            
            // Если есть уязвимости, они будут в stdout
            const hasVulnerabilities = result.includes('found') && result.includes('vulnerabilities');
            
            return {
                success: !hasVulnerabilities,
                details: hasVulnerabilities ? 'Обнаружены уязвимости безопасности' : 'Проверка безопасности пройдена',
                duration: Date.now() - startTime
            };
        } catch (error) {
            // npm audit может завершаться с ошибкой если есть уязвимости
            return {
                success: false,
                details: 'Обнаружены критические уязвимости безопасности',
                duration: Date.now() - startTime
            };
        }
    }

    async checkDependencies() {
        const startTime = Date.now();
        
        try {
            // Проверяем устаревшие зависимости
            const result = execSync('npm outdated', { 
                encoding: 'utf8',
                stdio: 'pipe'
            });
            
            const hasOutdated = result.trim().length > 0;
            
            return {
                success: !hasOutdated,
                details: hasOutdated ? 'Обнаружены устаревшие зависимости' : 'Все зависимости актуальны',
                duration: Date.now() - startTime
            };
        } catch (error) {
            // npm outdated завершается с ошибкой если нет устаревших зависимостей
            return {
                success: true,
                details: 'Все зависимости актуальны',
                duration: Date.now() - startTime
            };
        }
    }

    async generateReport(checkResults) {
        const report = {
            summary: {
                taskId: checkResults.taskId,
                timestamp: checkResults.timestamp,
                overall: checkResults.overall,
                status: checkResults.overall.success ? 'PASSED' : 'FAILED'
            },
            details: checkResults.checks,
            recommendations: this.generateRecommendations(checkResults)
        };

        return report;
    }

    generateRecommendations(checkResults) {
        const recommendations = [];
        
        if (checkResults.checks.lint?.status === 'failed') {
            recommendations.push('Исправьте ошибки линтера перед коммитом');
        }
        
        if (checkResults.checks.test?.status === 'failed') {
            recommendations.push('Исправьте падающие тесты');
        }
        
        if (checkResults.checks.build?.status === 'failed') {
            recommendations.push('Исправьте ошибки сборки');
        }
        
        if (checkResults.checks.security?.status === 'failed') {
            recommendations.push('Обновите зависимости с уязвимостями');
        }
        
        if (checkResults.checks.dependencies?.status === 'failed') {
            recommendations.push('Обновите устаревшие зависимости');
        }
        
        return recommendations;
    }
}
