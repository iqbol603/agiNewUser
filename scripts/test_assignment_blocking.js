import { assertEnv } from '../src/config/env.js';
import { ToolRouter } from '../src/services/ToolRouter.js';
import { EmployeesService } from '../src/services/EmployeesService.js';
import { ApiClient } from '../src/services/ApiClient.js';

async function testAssignmentBlocking() {
  try {
    assertEnv();
    
    const api = new ApiClient();
    const employees = new EmployeesService(api);
    const tools = new ToolRouter({ api, employees });
    
    // Получаем всех сотрудников
    const allEmps = await employees.list();
    console.log('Все сотрудники:');
    allEmps.forEach((emp, i) => {
      console.log(`${i+1}. ${emp.name} — ${emp.job || emp.position || 'Без должности'}`);
    });
    
    console.log('\n--- Тестируем блокировку назначений ---\n');
    
    // Тестируем назначение директору
    console.log('1. Тест назначения директору (Бахтиер Муминов):');
    const directorResult = await tools.route('create_task', {
      title: 'Тестовая задача',
      assigneeName: 'Бахтиер Муминов',
      desc: 'Тест',
      deadline: 'завтра 10:00'
    }, { requesterChatId: '123', requesterEmployee: { user_role: 'manager' } });
    console.log('Результат:', directorResult.ok ? '❌ НЕ ЗАБЛОКИРОВАНО!' : '✅ Заблокировано:', directorResult.error);
    
    // Тестируем назначение помощнице
    console.log('\n2. Тест назначения помощнице (Химматова Нигора):');
    const assistantResult = await tools.route('create_task', {
      title: 'Тестовая задача',
      assigneeName: 'Химматова Нигора',
      desc: 'Тест',
      deadline: 'завтра 10:00'
    }, { requesterChatId: '123', requesterEmployee: { user_role: 'manager' } });
    console.log('Результат:', assistantResult.ok ? '❌ НЕ ЗАБЛОКИРОВАНО!' : '✅ Заблокировано:', assistantResult.error);
    
    // Тестируем назначение сотруднику маркетинга
    console.log('\n3. Тест назначения сотруднику маркетинга (Холмуродов Икбол):');
    const marketingResult = await tools.route('create_task', {
      title: 'Тестовая задача',
      assigneeName: 'Холмуродов Икбол',
      desc: 'Тест',
      deadline: 'завтра 10:00'
    }, { requesterChatId: '123', requesterEmployee: { user_role: 'manager' } });
    console.log('Результат:', marketingResult.ok ? '✅ Разрешено' : '❌ Заблокировано:', marketingResult.error);
    
  } catch (error) {
    console.error('Ошибка теста:', error.message);
  }
}

testAssignmentBlocking();
