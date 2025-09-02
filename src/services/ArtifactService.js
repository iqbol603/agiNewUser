import { query } from '../config/db.js';
import { log } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

export class ArtifactService {
    constructor() {
        this.artifactTypes = {
            code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'],
            documentation: ['md', 'txt', 'pdf', 'doc', 'docx'],
            images: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
            config: ['json', 'yaml', 'yml', 'xml', 'ini', 'env'],
            logs: ['log', 'txt', 'csv'],
            tests: ['test.js', 'spec.js', 'test.ts', 'spec.ts', 'test.py']
        };
        
        this.initializeTable();
    }

    async initializeTable() {
        try {
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
            log.info('[Artifact] Таблица task_artifacts инициализирована');
        } catch (error) {
            log.error('[Artifact] Ошибка инициализации таблицы:', error.message);
        }
    }

    async analyzeFile(filePath, taskId, uploadedBy = null) {
        try {
            if (!fs.existsSync(filePath)) {
                return { ok: false, error: 'Файл не найден' };
            }

            const stats = fs.statSync(filePath);
            const fileName = path.basename(filePath);
            const fileExtension = path.extname(fileName).toLowerCase().substring(1);
            
            // Определяем тип артефакта
            const artifactType = this.determineArtifactType(fileName, fileExtension);
            
            // Читаем содержимое файла для анализа
            const content = fs.readFileSync(filePath, 'utf8');
            const contentPreview = this.generateContentPreview(content, artifactType);
            
            // Вычисляем хеш файла
            const fileHash = this.calculateFileHash(content);
            
            // Анализируем релевантность для задачи
            const relevanceScore = await this.analyzeRelevance(content, taskId, artifactType);
            
            // Сохраняем информацию об артефакте
            const result = await query(
                `INSERT INTO task_artifacts 
                (task_id, artifact_type, file_name, file_path, file_size, file_hash, content_preview, relevance_score, uploaded_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [taskId || null, artifactType, fileName, filePath, stats.size, fileHash, contentPreview, relevanceScore, uploadedBy]
            );

            log.info(`[Artifact] Файл ${fileName} проанализирован и сохранен для задачи ${taskId}`);
            
            return {
                ok: true,
                artifactId: result.insertId,
                artifactType,
                relevanceScore,
                analysis: {
                    fileSize: stats.size,
                    fileHash,
                    contentPreview,
                    recommendations: this.generateArtifactRecommendations(artifactType, relevanceScore)
                }
            };

        } catch (error) {
            log.error('[Artifact] Ошибка анализа файла:', error.message);
            return { ok: false, error: error.message };
        }
    }

    determineArtifactType(fileName, extension) {
        // Проверяем по расширению
        for (const [type, extensions] of Object.entries(this.artifactTypes)) {
            if (extensions.includes(extension)) {
                return type;
            }
        }
        
        // Проверяем по имени файла
        const lowerFileName = fileName.toLowerCase();
        
        if (lowerFileName.includes('test') || lowerFileName.includes('spec')) {
            return 'tests';
        }
        
        if (lowerFileName.includes('readme') || lowerFileName.includes('doc')) {
            return 'documentation';
        }
        
        if (lowerFileName.includes('config') || lowerFileName.includes('conf')) {
            return 'config';
        }
        
        if (lowerFileName.includes('log') || lowerFileName.includes('error')) {
            return 'logs';
        }
        
        return 'other';
    }

    generateContentPreview(content, artifactType) {
        const maxLength = 500;
        
        if (content.length <= maxLength) {
            return content;
        }
        
        // Для кода показываем начало и конец
        if (artifactType === 'code') {
            const start = content.substring(0, 250);
            const end = content.substring(content.length - 250);
            return `${start}...\n\n...${end}`;
        }
        
        // Для документации показываем начало
        return content.substring(0, maxLength) + '...';
    }

    calculateFileHash(content) {
        // Простой хеш для демонстрации
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }

    async analyzeRelevance(content, taskId, artifactType) {
        try {
            // Получаем информацию о задаче
            const [task] = await query(
                'SELECT task, description FROM tasks WHERE task_id = ?',
                [taskId]
            );

            if (!task) {
                return 0.0;
            }

            const taskText = `${task.task} ${task.description || ''}`.toLowerCase();
            const contentLower = content.toLowerCase();
            
            let relevanceScore = 0.0;
            
            // Проверяем совпадение ключевых слов
            const taskWords = taskText.split(/\s+/).filter(word => word.length > 3);
            let matchedWords = 0;
            
            for (const word of taskWords) {
                if (contentLower.includes(word)) {
                    matchedWords++;
                }
            }
            
            // Базовый балл за совпадение слов
            relevanceScore += (matchedWords / taskWords.length) * 0.4;
            
            // Дополнительные баллы за тип артефакта
            if (artifactType === 'code' && this.isCodeFile(content)) {
                relevanceScore += 0.2;
            }
            
            if (artifactType === 'documentation' && this.isDocumentationFile(content)) {
                relevanceScore += 0.2;
            }
            
            if (artifactType === 'tests' && this.isTestFile(content)) {
                relevanceScore += 0.2;
            }
            
            // Проверяем наличие технических терминов
            const techTerms = ['function', 'class', 'api', 'database', 'server', 'client', 'config', 'test', 'error', 'log'];
            let techTermCount = 0;
            
            for (const term of techTerms) {
                if (contentLower.includes(term)) {
                    techTermCount++;
                }
            }
            
            relevanceScore += (techTermCount / techTerms.length) * 0.2;
            
            return Math.min(1.0, Math.max(0.0, relevanceScore));
            
        } catch (error) {
            log.error('[Artifact] Ошибка анализа релевантности:', error.message);
            return 0.0;
        }
    }

    isCodeFile(content) {
        const codePatterns = [
            /function\s+\w+\s*\(/,
            /class\s+\w+/,
            /import\s+.*from/,
            /const\s+\w+\s*=/,
            /let\s+\w+\s*=/,
            /var\s+\w+\s*=/,
            /if\s*\(/,
            /for\s*\(/,
            /while\s*\(/
        ];
        
        return codePatterns.some(pattern => pattern.test(content));
    }

    isDocumentationFile(content) {
        const docPatterns = [
            /^#\s+/m,
            /^##\s+/m,
            /^###\s+/m,
            /\[.*\]\(.*\)/,
            /^\*\s+/m,
            /^\d+\.\s+/m
        ];
        
        return docPatterns.some(pattern => pattern.test(content));
    }

    isTestFile(content) {
        const testPatterns = [
            /describe\s*\(/,
            /it\s*\(/,
            /test\s*\(/,
            /expect\s*\(/,
            /assert\s*\(/,
            /should\s+/
        ];
        
        return testPatterns.some(pattern => pattern.test(content));
    }

    generateArtifactRecommendations(artifactType, relevanceScore) {
        const recommendations = [];
        
        if (relevanceScore < 0.3) {
            recommendations.push('Файл имеет низкую релевантность для задачи. Проверьте правильность загрузки.');
        }
        
        if (artifactType === 'code' && relevanceScore < 0.5) {
            recommendations.push('Код может не соответствовать требованиям задачи. Проведите дополнительный анализ.');
        }
        
        if (artifactType === 'documentation' && relevanceScore < 0.4) {
            recommendations.push('Документация может быть неполной. Добавьте недостающую информацию.');
        }
        
        if (artifactType === 'tests' && relevanceScore < 0.6) {
            recommendations.push('Тесты могут не покрывать все сценарии. Расширьте покрытие тестами.');
        }
        
        if (relevanceScore >= 0.8) {
            recommendations.push('Файл отлично подходит для задачи. Может быть принят без изменений.');
        }
        
        return recommendations;
    }

    async getTaskArtifacts(taskId) {
        try {
            const artifacts = await query(
                'SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY relevance_score DESC, uploaded_at DESC',
                [taskId]
            );
            
            return { ok: true, artifacts };
        } catch (error) {
            log.error('[Artifact] Ошибка получения артефактов задачи:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async validateArtifactsForTask(taskId) {
        try {
            const artifacts = await this.getTaskArtifacts(taskId);
            if (!artifacts.ok) {
                return artifacts;
            }
            
            const validation = {
                taskId,
                totalArtifacts: artifacts.artifacts.length,
                requiredTypes: ['code', 'documentation', 'tests'],
                coverage: {},
                overallScore: 0,
                recommendations: []
            };
            
            // Проверяем покрытие по типам
            for (const requiredType of validation.requiredTypes) {
                const typeArtifacts = artifacts.artifacts.filter(a => a.artifact_type === requiredType);
                validation.coverage[requiredType] = {
                    count: typeArtifacts.length,
                    hasArtifacts: typeArtifacts.length > 0,
                    averageRelevance: typeArtifacts.length > 0 
                        ? typeArtifacts.reduce((sum, a) => sum + a.relevance_score, 0) / typeArtifacts.length 
                        : 0
                };
            }
            
            // Вычисляем общий балл
            let totalScore = 0;
            let maxScore = validation.requiredTypes.length * 100;
            
            for (const type of validation.requiredTypes) {
                const coverage = validation.coverage[type];
                if (coverage.hasArtifacts) {
                    totalScore += Math.min(100, coverage.averageRelevance * 100);
                }
            }
            
            validation.overallScore = Math.round(totalScore / validation.requiredTypes.length);
            
            // Генерируем рекомендации
            for (const type of validation.requiredTypes) {
                const coverage = validation.coverage[type];
                if (!coverage.hasArtifacts) {
                    validation.recommendations.push(`Добавьте артефакты типа: ${type}`);
                } else if (coverage.averageRelevance < 0.5) {
                    validation.recommendations.push(`Улучшите качество артефактов типа: ${type}`);
                }
            }
            
            return { ok: true, validation };
            
        } catch (error) {
            log.error('[Artifact] Ошибка валидации артефактов:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async deleteArtifact(artifactId) {
        try {
            // Получаем информацию об артефакте
            const [artifact] = await query(
                'SELECT file_path FROM task_artifacts WHERE id = ?',
                [artifactId]
            );
            
            if (!artifact) {
                return { ok: false, error: 'Артефакт не найден' };
            }
            
            // Удаляем файл с диска
            if (fs.existsSync(artifact.file_path)) {
                fs.unlinkSync(artifact.file_path);
            }
            
            // Удаляем запись из БД
            await query('DELETE FROM task_artifacts WHERE id = ?', [artifactId]);
            
            log.info(`[Artifact] Артефакт ${artifactId} удален`);
            return { ok: true };
            
        } catch (error) {
            log.error('[Artifact] Ошибка удаления артефакта:', error.message);
            return { ok: false, error: error.message };
        }
    }

    async saveArtifact(artifactData) {
        try {
            const {
                taskId,
                artifactType = 'documentation',
                fileName,
                filePath,
                fileSize = 0,
                contentPreview = '',
                uploadedBy = null
            } = artifactData;

            if (!fileName || !filePath) {
                return { ok: false, error: 'Необходимо указать имя файла и путь' };
            }

            // Проверяем существование файла
            if (!fs.existsSync(filePath)) {
                return { ok: false, error: 'Файл не найден по указанному пути' };
            }

            // Вычисляем хеш файла
            const content = fs.readFileSync(filePath, 'utf8');
            const fileHash = this.calculateFileHash(content);

            // Сохраняем информацию об артефакте
            const result = await query(
                `INSERT INTO task_artifacts 
                (task_id, artifact_type, file_name, file_path, file_size, file_hash, content_preview, uploaded_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [taskId || null, artifactType, fileName, filePath, fileSize, fileHash, contentPreview, uploadedBy]
            );

            log.info(`[Artifact] Артефакт ${fileName} сохранен с ID: ${result.insertId}`);
            
            return {
                ok: true,
                artifact: {
                    id: result.insertId,
                    taskId,
                    artifactType,
                    fileName,
                    filePath,
                    fileSize,
                    fileHash,
                    contentPreview,
                    uploadedBy,
                    uploadedAt: new Date()
                }
            };

        } catch (error) {
            log.error('[Artifact] Ошибка сохранения артефакта:', error.message);
            return { ok: false, error: error.message };
        }
    }
}
