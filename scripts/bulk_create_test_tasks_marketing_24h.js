import { assertEnv } from '../src/config/env.js';
import { ToolRouter } from '../src/services/ToolRouter.js';
import { EmployeesService } from '../src/services/EmployeesService.js';
import { ApiClient } from '../src/services/ApiClient.js';
import { parseHumanDateRu, toDbDateTime, setAppTimezone } from '../src/utils/datetime.js';
import { log } from '../src/utils/logger.js';

async function main() {
  try {
    assertEnv();
    setAppTimezone(process.env.TZ || 'Asia/Dushanbe');
    const api = new ApiClient();
    const employees = new EmployeesService(api);
    const tools = new ToolRouter({ api, employees });

    // Получаем сотрудников маркетинга через наш новый тул
    const marketing = await tools.route('list_marketing_employees', {});
    const emps = marketing?.employees || [];

    // Исключаем 3 конкретных сотрудника (директор и помощницы)
    const excludeNames = new Set([
      'бахтиер муминов',
      'боймирзоева нозима',
      'химматова нигора'
    ]);

    const list = emps.filter(e => !excludeNames.has(String(e.name || '').toLowerCase()));
    if (list.length === 0) {
      console.log('Нет сотрудников маркетинга для создания задач.');
      return;
    }

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const deadline = toDbDateTime(in24h); // абсолютный формат для API

    console.log(`Создаю тестовые задачи с дедлайном: ${deadline}`);

    const created = [];
    for (const emp of list) {
      const title = `Тестовая задача (24ч) для ${emp.name}`;
      const desc = 'Автотест: проверка дедлайна через 24 часа';

      const res = await tools.route('create_task', {
        title,
        assigneeName: emp.name,
        desc,
        deadline,
        priority: 'Средний'
      }, {
        requesterChatId: '000000',
        requesterEmployee: { user_role: 'manager', job: 'Руководитель отдела Маркетинга' }
      });

      if (res?.ok) {
        created.push({ id: res.taskId, name: emp.name });
        console.log(`✅ Создана задача #${res.taskId} → ${emp.name}`);
      } else {
        console.log(`❌ Не удалось создать для ${emp.name}: ${res?.error || 'unknown error'}`);
      }
    }

    console.log(`Готово. Создано задач: ${created.length}/${list.length}`);
  } catch (err) {
    log.error('[BULK CREATE 24H] Ошибка:', err?.message || err);
    process.exit(1);
  }
}

main();


