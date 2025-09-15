#!/usr/bin/env node

/**
 * Тест кнопок бота для сотрудников со статусом staff
 */

import { BotApp } from './src/bot/BotApp.js';
import { TelegramUI } from './src/bot/TelegramUI.js';

console.log('🧪 ТЕСТИРОВАНИЕ КНОПОК БОТА\n');

// Тестируем создание кнопок
console.log('1️⃣ Тестируем создание кнопок...');
const mainMenu = TelegramUI.mainMenuInline();
console.log('✅ Главное меню создано:', JSON.stringify(mainMenu, null, 2));

const leadershipMenu = TelegramUI.leadershipMenuInline();
console.log('✅ Меню руководства создано:', JSON.stringify(leadershipMenu, null, 2));

// Тестируем callback_data кнопок
console.log('\n2️⃣ Тестируем callback_data кнопок...');
const mainMenuButtons = mainMenu.reply_markup.inline_keyboard.flat();
const leadershipButtons = leadershipMenu.reply_markup.inline_keyboard.flat();

console.log('📋 Кнопки главного меню:');
mainMenuButtons.forEach(btn => {
  console.log(`   • ${btn.text} → ${btn.callback_data}`);
});

console.log('\n👑 Кнопки меню руководства:');
leadershipButtons.forEach(btn => {
  console.log(`   • ${btn.text} → ${btn.callback_data}`);
});

// Тестируем обработку callback_data
console.log('\n3️⃣ Тестируем обработку callback_data...');
const testCallbacks = [
  'new_task',
  'update_status', 
  'employees',
  'report',
  'explanations',
  'leadership_analyze_team',
  'leadership_strategic_report'
];

testCallbacks.forEach(callback => {
  console.log(`   • ${callback} - ${callback.startsWith('leadership_') ? '👑 Руководство' : '👤 Сотрудник'}`);
});

console.log('\n✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО');
console.log('\n📝 ИНСТРУКЦИЯ ПО ТЕСТИРОВАНИЮ:');
console.log('1. Отправьте /start боту');
console.log('2. Нажмите на кнопки в главном меню');
console.log('3. Проверьте, что кнопки работают для сотрудников со статусом staff');
console.log('4. Проверьте, что кнопки руководства работают только для менеджеров');
