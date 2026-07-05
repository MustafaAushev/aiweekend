# skill: review — Node.js 24 материализация

> Агент читает как playbook код-ревью силами агента. Стек: Node.js 24, TypeScript, vitest, Prisma, pino, Fastify. Правила — в `agents/*.md`. Ссылки на `skills/standard.md` по параграфам.

## Назначение и когда применять

После генерации фичи/фикса агентом перед созданием PR, или в autonomous fix-loop перед передачей на human-in-the-loop. Триггер: завершение работы над задачей или срабатывание guardrail'а. Линза дельты: ревью только `git diff` относительно `main`.

## Входы/выходы

**Входы:** `git diff main`, `skills/standard.md` (§1 typing, §2 DTO, §3 errors, §4 layers, §5 async, §6 resilience), `agents/*.md`, OpenAPI/JSON Schema.

**Выходы:** checklist-review в `panel/<slug>/verdict.md` с PASS/NEEDS WORK/RED FLAG по каждому блоку.

## Non-negotiables

1. Ревью только `git diff` — не читать весь файл, не искать проблемы вне дельты.
2. 8 блоков проверки: контракт (П1), resilience (П2), тесты (П3), асимптотика (П6), security, concurrency, observability, audit (П5).
3. Любой блок RED → возврат в fix-loop, PR не создаётся.
4. Ссылки на `skills/standard.md` по § в каждом замечании.
5. Не предлагать рефакторинг вне дельты.

## Workflow

1. **git diff main.** Извлечь изменённые файлы. Определить эндпоинты, мутации состояния, внешние вызовы.
2. **Контракты (П1, §1–2).** Сравнить сигнатуры с OpenAPI/zod схемами. Изменён контракт → deliberate diff в спеке? Backward compatible? `additionalProperties: false` не сломал клиента?
3. **Resilience (П2, §6).** Каждый новый fetch/Prisma/брокер: есть ли AbortController timeout? p-retry (только 5xx/ECONNRESET, ≤3)? Idempotency-Key на POST/PUT? opossum circuit breaker?
4. **Горячий путь (П6).** Циклы и запросы: N+1? Prisma `findMany` без `include`/`select` в цикле? OFFSET-пагинация? LLM-вызов синхронно?
5. **Security (§3).** Zod-валидация входа? Authz middleware? Prisma parameterized (SQL-инъекция)? Хардкод секретов? `.env` в коде?
6. **Concurrency.** Shared state без блокировки? Map/глобальный кэш без мьютекса? Event loop блокировка (CPU-bound без setImmediate/Worker)?
7. **Тесты (П3).** Есть unit + integration + e2e? Integration — testcontainers, не vi.mock драйвера? Мутация ≥80%?
8. **Observability (§4).** pino structured logs с `correlationId`? Метрики latency/errors? Секреты/PII в логах?
9. **Audit (П5).** Коммит: тег вклада + ссылка на тикет? Промпт и seed в описании PR?

## Stack binding (Node.js 24 + npm)

| Блок проверки | Инструмент |
|---|---|
| Контракт | `npx ts-json-schema`, `npx openapi-diff` |
| Resilience | grep `AbortController\|pRetry\|opossum\|Idempotency` |
| Тесты | `npx vitest run`, `npx stryker run` |
| Безопасность | `npx eslint --rules security`, `npx secretlint` |
| Типы | `npx tsc --noEmit --strict` |
| Формат | `npx prettier --check`, `npx eslint` |
| Гонки | нет TSAN в Node 24; ручная проверка shared state |
| Логи | grep `pino\.\|logger\.\|\.error(\|\.info(` |

## Quality gates (реальные команды)

```makefile
.PHONY: eval-review

eval-review: contract-diff resilience-check security-check test-check lint typecheck log-check

contract-diff:
	node -e "
	const diff = require('child_process').execSync('git diff main -- src/api/').toString();
	const hasSchema = diff.includes('z.object') || diff.includes('JSONSchema');
	process.exit(hasSchema ? 0 : 1);
	"

resilience-check:
	node -e "
	const diff = require('child_process').execSync('git diff main -- src/').toString();
	const hasFetch = diff.includes('fetch(') || diff.includes('axios(') || diff.includes('got(');
	if (hasFetch) {
	  const hasTimeout = diff.includes('AbortController') || diff.includes('timeout');
	  const hasRetry = diff.includes('pRetry') || diff.includes('retry');
	  process.exit(hasTimeout && hasRetry ? 0 : 1);
	}
	"

security-check:
	npx eslint src/ --rule '{"no-secrets/no-secrets": "error"}' 2>/dev/null || true
	npx secretlint "$$(git diff main --name-only)"

test-check:
	npx vitest run --reporter=verbose src/**/*.test.ts

lint:
	npx eslint src/ --max-warnings 0
	npx prettier --check src/

typecheck:
	npx tsc --noEmit --strict

log-check:
	node -e "
	const diff = require('child_process').execSync('git diff main -- src/').toString();
	const hasSecretInLog = /password|token|secret|api_key|authorization/i.test(diff);
	process.exit(hasSecretInLog ? 1 : 0);
	"
```

## Bad/good примеры

❌ **Плохое замечание:** размытое
```
«Улучши обработку ошибок»
```

✅ **Хорошее замечание:** конкретное, со ссылкой на стандарт
```
§3 (errors): catch-all в src/api/orders.ts:42 проглатывает Prisma ошибку.
Замени на доменную иерархию: DatabaseError extends DomainError,
пробрось с контекстом вместо return null.
```

❌ **Пропущенный дефект:** ревью не заметил N+1
```typescript
// diff добавляет:
for (const user of users) {
  const subs = await prisma.subscription.findMany({ where: { userId: user.id } });
}
```

✅ **Пойманный дефект:**
```
П6 (горячий путь): N+1 в src/service/billing.ts:15.
findMany в цикле — 1+N запросов. Заменить на:
const subs = await prisma.subscription.findMany({
  where: { userId: { in: users.map(u => u.id) } }
});
```

## Definition of Done

- [ ] git diff проверен; все 8 блоков пройдены
- [ ] Контракт кода синхронизирован со спекой (или deliberate diff)
- [ ] Все новые внешние вызовы: timeout + retry + idempotency + circuit breaker
- [ ] N+1/OFTSET отсутствуют; горячий путь O(1)/O(log N)
- [ ] Нет инъекций, хардкода секретов, authz проверена
- [ ] Тесты 3 типов написаны; mutation score ≥ 80%
- [ ] pino logs с correlationId, секреты не в логах
- [ ] Коммит: Conventional + тег вклада + ссылка на тикет

## Stop / escalation rules

- RED FLAG по любому блоку → возврат в fix-loop, PR не создаётся
- Контракт изменился без deliberate diff → стоп, согласовать
- N+1 или O(N²) на горячем пути → стоп, переписать
- Хардкод секрета → стоп, эскалация безопасности
- Существующие тесты красные → стоп, агент тесты не правит

## Audit trail

В `panel/<slug>/verdict.md`:
- хэш коммита (diff base)
- результат по каждому из 8 блоков: PASS/FAIL
- список замечаний (нумерованный)
- общий вердикт: PASS | NEEDS WORK | RED FLAG
- тег вклада `[agent|assisted|manual]`