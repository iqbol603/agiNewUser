#!/usr/bin/env node

import { BotApp } from './src/bot/BotApp.js';
import { ApiClient } from './src/services/ApiClient.js';
import { EmployeesService } from './src/services/EmployeesService.js';
import { ToolRouter } from './src/services/ToolRouter.js';
import { Notifier } from './src/services/Notifier.js';
import { log } from './src/utils/logger.js';

// Тестовые данные
const TEST_EMPLOYEE = {
  id: 1,
  employee_id: 1,
  name: 'Тестовый Сотрудник',
  chat_id: '123456789',
  user_role: 'staff',
  position: 'Разработчик'
};

const TEST_MANAGER = {
  id: 2,
  employee_id: 2,
  name: 'Тестовый Менеджер',
  chat_id: '987654321',
  user_role: 'manager',
  position: 'Руководитель'
};

async function testBotFunctions() {
  console.log('🚀 Начинаем тестирование функций бота...\n');

  try {
    // Инициализируем сервисы
    const api = new ApiClient();
    const employees = new EmployeesService(api);
    const notifier = new Notifier(null); // Без бота для тестов
    const tools = new ToolRouter({ api, employees, notifier });

    console.log('✅ Сервисы инициализированы');

    // Тест 1: Создание задачи
    console.log('\n📝 Тест 1: Создание задачи');
    try {
      const createResult = await tools.route('create_task', {
        title: 'Тестовая задача для проверки системы',
        assigneeName: 'Тестовый Сотрудник',
        desc: 'Описание тестовой задачи',
        deadline: 'завтра 17:00',
        priority: 'Средний'
      }, {
        requesterChatId: '987654321',
        requesterEmployee: TEST_MANAGER
      });

      console.log('Результат создания задачи:', createResult);
      if (createResult.ok) {
        console.log('✅ Задача успешно создана');
      } else {
        console.log('❌ Ошибка создания задачи:', createResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при создании задачи:', error.message);
    }

    // Тест 2: Получение списка задач
    console.log('\n📋 Тест 2: Получение списка задач');
    try {
      const listResult = await tools.route('list_tasks', {}, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат получения задач:', listResult);
      if (listResult.ok) {
        console.log(`✅ Получено ${listResult.tasks.length} задач`);
        if (listResult.tasks.length > 0) {
          console.log('Первая задача:', listResult.tasks[0]);
        }
      } else {
        console.log('❌ Ошибка получения задач:', listResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при получении задач:', error.message);
    }

    // Тест 3: Получение списка сотрудников
    console.log('\n👥 Тест 3: Получение списка сотрудников');
    try {
      const employeesResult = await tools.route('list_employees', {}, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат получения сотрудников:', employeesResult);
      if (employeesResult.ok) {
        console.log(`✅ Получено ${employeesResult.employees.length} сотрудников`);
        if (employeesResult.employees.length > 0) {
          console.log('Первый сотрудник:', employeesResult.employees[0]);
        }
      } else {
        console.log('❌ Ошибка получения сотрудников:', employeesResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при получении сотрудников:', error.message);
    }

    // Тест 4: Обновление статуса задачи
    console.log('\n🔄 Тест 4: Обновление статуса задачи');
    try {
      const updateResult = await tools.route('update_status', {
        taskId: '1',
        status: 'В работе'
      }, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат обновления статуса:', updateResult);
      if (updateResult.ok) {
        console.log('✅ Статус задачи обновлен');
      } else {
        console.log('❌ Ошибка обновления статуса:', updateResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при обновлении статуса:', error.message);
    }

    // Тест 5: Создание DoD чек-листа
    console.log('\n📋 Тест 5: Создание DoD чек-листа');
    try {
      const dodResult = await tools.route('create_dod_checklist', {
        taskId: 1,
        checklistType: 'development',
        items: [
          'Код написан и оттестирован',
          'Документация обновлена',
          'Код проверен коллегой'
        ]
      }, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат создания DoD:', dodResult);
      if (dodResult.ok) {
        console.log('✅ DoD чек-лист создан');
      } else {
        console.log('❌ Ошибка создания DoD:', dodResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при создании DoD:', error.message);
    }

    // Тест 6: Создание отчета
    console.log('\n📊 Тест 6: Создание отчета');
    try {
      const reportResult = await tools.route('create_task_report', {
        taskId: 1,
        summary: 'Тестовая задача выполнена',
        details: 'Все требования выполнены согласно спецификации',
        quality: 'Хорошо'
      }, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат создания отчета:', reportResult);
      if (reportResult.ok) {
        console.log('✅ Отчет создан');
      } else {
        console.log('❌ Ошибка создания отчета:', reportResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при создании отчета:', error.message);
    }

    // Тест 7: Проверка соответствия задачи
    console.log('\n✅ Тест 7: Проверка соответствия задачи');
    try {
      const complianceResult = await tools.route('check_task_compliance', {
        taskId: 1
      }, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат проверки соответствия:', complianceResult);
      if (complianceResult.ok) {
        console.log('✅ Проверка соответствия выполнена');
      } else {
        console.log('❌ Ошибка проверки соответствия:', complianceResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при проверке соответствия:', error.message);
    }

    // Тест 8: Сохранение артефакта
    console.log('\n💾 Тест 8: Сохранение артефакта');
    try {
      const artifactResult = await tools.route('save_artifact', {
        taskId: 1,
        artifactType: 'documentation',
        fileName: 'test_document.txt',
        filePath: '/tmp/test_document.txt',
        fileSize: 1024,
        contentPreview: 'Тестовый документ'
      }, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат сохранения артефакта:', artifactResult);
      if (artifactResult.ok) {
        console.log('✅ Артефакт сохранен');
      } else {
        console.log('❌ Ошибка сохранения артефакта:', artifactResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при сохранении артефакта:', error.message);
    }

    // Тест 9: Отправка объяснительной
    console.log('\n📝 Тест 9: Отправка объяснительной');
    try {
      const explanationResult = await tools.route('submit_explanation', {
        explanationId: 1,
        explanationText: 'Тестовая объяснительная по просрочке'
      }, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат отправки объяснительной:', explanationResult);
      if (explanationResult.ok) {
        console.log('✅ Объяснительная отправлена');
      } else {
        console.log('❌ Ошибка отправки объяснительной:', explanationResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при отправке объяснительной:', error.message);
    }

    // Тест 10: Получение отчета
    console.log('\n📈 Тест 10: Получение отчета');
    try {
      const reportResult = await tools.route('report', {}, {
        requesterChatId: '123456789',
        requesterEmployee: TEST_EMPLOYEE
      });

      console.log('Результат получения отчета:', reportResult);
      if (reportResult.ok) {
        console.log('✅ Отчет получен');
        console.log('Общее количество задач:', reportResult.report.total);
        console.log('Распределение по статусам:', reportResult.report.byStatus);
      } else {
        console.log('❌ Ошибка получения отчета:', reportResult.error);
      }
    } catch (error) {
      console.log('❌ Ошибка при получении отчета:', error.message);
    }

    console.log('\n🎉 Тестирование завершено!');

  } catch (error) {
    console.error('❌ Критическая ошибка при тестировании:', error.message);
  }
}

// Запускаем тесты
testBotFunctions().catch(console.error);
