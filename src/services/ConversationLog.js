// src/services/ConversationLog.js
import { query } from '../config/db.js';

export async function logMessage({ chatId, role, content, meta = null, tokensIn = null, tokensOut = null }) {
  await query(
    `INSERT INTO ai_messages (chat_id, role, content, meta, tokens_in, tokens_out)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(chatId),
      role,            // 'user' | 'assistant' | 'system' | 'tool'
      String(content ?? ''),
      meta ? JSON.stringify(meta) : null,
      tokensIn,
      tokensOut,
    ]
  );
}

export async function getConversation(chatId, { limit = 50, order = 'desc', date_filter = null, keywords = null } = {}) {
  // Убеждаемся, что аргументы имеют правильные типы
  const safeChatId = String(chatId || '');
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50)); // Ограничиваем от 1 до 100
  
  console.log(`[DEBUG] getConversation: chatId=${safeChatId}, limit=${safeLimit}, order=${order}, date_filter=${date_filter}, keywords=${keywords}`);
  
  let sql = `SELECT id, chat_id, role, content, meta, tokens_in, tokens_out, created_at
              FROM ai_messages
              WHERE chat_id = ?`;
  
  let params = [safeChatId];
  
  // Добавляем фильтр по дате если указан
  if (date_filter) {
    const dateCondition = buildDateFilter(date_filter);
    if (dateCondition) {
      sql += ` AND ${dateCondition.condition}`;
      params.push(...dateCondition.params);
    }
  }
  
  // Добавляем поиск по ключевым словам если указан
  if (keywords && Array.isArray(keywords) && keywords.length > 0) {
    const keywordConditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
    sql += ` AND (${keywordConditions})`;
    params.push(...keywords.map(kw => `%${kw.toLowerCase()}%`));
  }
  
  sql += ` ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'} LIMIT ${safeLimit}`;
  
  console.log(`[DEBUG] getConversation: SQL=${sql}, params=${JSON.stringify(params)}`);
  
  const rows = await query(sql, params);
  
  console.log(`[DEBUG] getConversation: найдено ${rows?.length || 0} сообщений`);
  return rows || [];
}

// Новая функция для поиска по ключевым словам с расширенным поиском
export async function getConversationByKeywords(chatId, keywords, { limit = 100, order = 'desc' } = {}) {
  const safeChatId = String(chatId || '');
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return [];
  }
  
  console.log(`[DEBUG] getConversationByKeywords: chatId=${safeChatId}, keywords=${JSON.stringify(keywords)}, limit=${safeLimit}`);
  
  // Создаем условия поиска для каждого ключевого слова
  const keywordConditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
  
  const sql = `SELECT id, chat_id, role, content, meta, tokens_in, tokens_out, created_at
               FROM ai_messages
               WHERE chat_id = ? AND (${keywordConditions})
               ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'} LIMIT ${safeLimit}`;
  
  const params = [safeChatId, ...keywords.map(kw => `%${kw.toLowerCase()}%`)];
  
  console.log(`[DEBUG] getConversationByKeywords: SQL=${sql}, params=${JSON.stringify(params)}`);
  
  const rows = await query(sql, params);
  
  console.log(`[DEBUG] getConversationByKeywords: найдено ${rows?.length || 0} сообщений по ключевым словам`);
  return rows || [];
}

// Функция для построения SQL-условия фильтра по дате
function buildDateFilter(dateFilter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (dateFilter.toLowerCase()) {
    case 'сегодня':
      return {
        condition: 'DATE(created_at) = CURDATE()',
        params: []
      };
    
    case 'вчера':
      return {
        condition: 'DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)',
        params: []
      };
    
    case 'позавчера':
      return {
        condition: 'DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 2 DAY)',
        params: []
      };
    
    case 'на этой неделе':
      return {
        condition: 'YEARWEEK(created_at) = YEARWEEK(CURDATE())',
        params: []
      };
    
    case 'на прошлой неделе':
      return {
        condition: 'YEARWEEK(created_at) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK))',
        params: []
      };
    
    case 'в этом месяце':
      return {
        condition: 'YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())',
        params: []
      };
    
    case 'в прошлом месяце':
      return {
        condition: 'YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))',
        params: []
      };
    
    default:
      // Проверяем, является ли это конкретной датой в формате YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
        return {
          condition: 'DATE(created_at) = ?',
          params: [dateFilter]
        };
      }
      
      // Проверяем относительные даты типа "3 дня назад", "2 недели назад"
      const relativeMatch = dateFilter.match(/^(\d+)\s+(день|дня|дней|неделя|недели|недель|месяц|месяца|месяцев)\s+назад$/i);
      if (relativeMatch) {
        const count = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        
        let interval;
        if (unit.includes('день')) interval = 'DAY';
        else if (unit.includes('недел')) interval = 'WEEK';
        else if (unit.includes('месяц')) interval = 'MONTH';
        else return null;
        
        return {
          condition: 'DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL ? ' + interval + ')',
          params: [count]
        };
      }
      
      return null;
  }
}

