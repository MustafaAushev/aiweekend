# skill: feature — Node.js 24 материализация

> Агент читает как playbook задачи. Стек: Node.js 24, TypeScript strict, npm, vitest, Prisma, pino. Правила — в agents/*.md.

## Назначение и когда применять

Реализация новой фичи: эндпоинт, обработчик, интеграция, команда/query. Триггер: задача с описанием поведения в тикете или OpenAPI-спеке. Агенту разрешена только реализация; спека и harness под защитой человека.

## Входы/выходы

**Входы:** `agents/*.md`, `thresholds.yaml`, `fix-loop.md`, OpenAPI/JSON Schema спека, существующий код в `src/`.

**Выходы:**
- `src/domain/` — сущности, value-objects, доменные события
- `src/persistence/` — Prisma schema + миграции, репозитории
- `src/service/` — бизнес-логика с инъекцией зависимостей
- `src/api/` — Fastify/Express хендлеры, валидация JSON Schema
- `src/api/__tests__/` — unit, integration, e2e тесты
- `prisma/migrations/` — миграционный файл
- PR-описание со спекой, промптом, seed, eval-логом

## Non-negotiables

1. Спека изменяется ПЕРВЫМ коммитом, до кода. Без diff-спеки код не пишется.
2. Failing contract/integration-тест — защёлка: без падающего теста реализация не начинается.
3. SLO явные: p50/p99, throughput, max_payload, max_batch — в `thresholds.yaml`.
4. Каждый внешний вызов: timeout (opossum + `AbortController`), retry (`p-retry` exp backoff + jitter, ≤3), idempotency-key на мутациях, circuit breaker (opossum), bounded queue/bulkhead.
5. Каждая мутация: input validation (JSON Schema / zod), authz check, parameterized queries (Prisma), секреты из env.
6. VCS: ветка `feat/<TICKET>-<slug>`, Conventional Commits с `[agent|assisted|manual]`, коммиты атомарны, спека отдельно, PR с шаблоном.
7. Dev-стандарт по `skills/standard.md` сквозной полосой.

## Workflow (домен → persistence → service → api → tests → docs)

1. **Спека первой.** Прочитать OpenAPI/JSON Schema. Сформулировать diff: сигнатура, вход/выход схемы, примеры ошибок, инварианты, idempotency-семантика, SLO-бюджеты. Коммит: `[agent] feat(spec): add POST /orders`.
2. **Domain.** Определить сущности и value-objects: `src/domain/<entity>.ts`. Чистые функции, без зависимостей от инфраструктуры. Экспорт типов и доменных ошибок.
3. **Persistence (Prisma).** Обновить `prisma/schema.prisma`: модель, индексы, связи. Создать миграцию: `npx prisma migrate dev --name <feature>`. Реализовать репозиторий в `src/persistence/<entity>.repository.ts`.
4. **Service.** Бизнес-логика в `src/service/<feature>.service.ts`. Инъекция репозитория через конструктор. Доменные события через EventEmitter или шину.
5. **API.** Fastify/Express роут: валидация через JSON Schema / zod, authz middleware, вызов сервиса. `src/api/<feature>.routes.ts`.
6. **Tests.** Написать в порядке: unit (fast-check property-based), integration (testcontainers с БД, mock внешних HTTP), e2e-smoke (один happy-path). Каждый тип — отдельный файл.
7. **Failing test защёлка.** Убедиться, что без реализации хотя бы один тест падает. Зелёные тесты = стоп.
8. **Resilience.** На каждый внешний вызов: AbortController timeout, p-retry (exp backoff + jitter, ≤3, только ECONNRESET/5xx/429), opossum circuit breaker, idempotency-key на POST/PUT.
9. **Performance.** Горячий путь O(1)/O(log N). Пагинация keyset (Prisma `cursor`), никакого `skip` на больших таблицах. N+1 запрещён (Prisma `include`/`select` с batch).
10. **Security + observability.** Валидация входа (zod/JSON Schema), authz, Prisma parameterized, секреты из env. pino structured logs с `correlationId`, метрики latency/errors/inflight.
11. **Eval-цепочка.** `npm run test:unit && npm run test:int && npm run test:e2e && npm run lint && npx tsc --noEmit && npx stryker run`.
12. **Fix-loop.** Падающий тест → агент чинит до зелёного. Лимит 5 циклов (`fix-loop.md`). Не закрылось → эскалация.
13. **PR артефактов.** Описание: diff спеки, промпт+seed, результаты eval, тег вклада.

## Stack binding (Node.js 24 + npm)

| Компонент | Инструмент |
|---|---|
| Runtime | Node.js 24 (ESM, `--experimental-strip-types` или tsc) |
| Type system | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` |
| Форматтер | prettier (`npx prettier --check src/`) |
| Линтер | eslint + typescript-eslint (`npx eslint src/`) |
| Тест-раннер | vitest (`npx vitest run`) |
| Покрытие | vitest `--coverage` (v8/istanbul) |
| Property-based | fast-check (`import * as fc from 'fast-check'`) |
| Mutation | stryker (`npx stryker run`) |
| ORM | Prisma (`prisma.schema`, `@prisma/client`) |
| Миграции | Prisma Migrate (`npx prisma migrate dev`) |
| Логгер | pino (`pino.Logger`) |
| Конфиг | env-var + dotenv |
| Circuit breaker | opossum (`CircuitBreaker`) |
| Retry | p-retry (`pRetry`) |
| Idempotency | хэш-ключ + Prisma `upsert`/`createMany` skipDuplicates |
| HTTP-сервер | Fastify |
| HTTP-клиент | undici (`fetch`) / got |
| Schema валидация | zod |
| CVE-аудит | `npm audit` |
| Lock | `package-lock.json` (закоммичен) |
| Secret scan | `npx secretlint` / git-secrets |
| E2E | testcontainers (`testcontainers` npm) |

## Quality gates (реальные команды)

```makefile
# qrsvc-nodejs/harness/Makefile — гейты фичи
.PHONY: eval-feature

eval-feature: lint typecheck test-unit test-int test-e2e mutation contract-diff resilience perf

lint:
	npx eslint src/ --max-warnings 0
	npx prettier --check src/

typecheck:
	npx tsc --noEmit --strict

test-unit:
	npx vitest run --reporter=verbose src/**/*.unit.test.ts

test-int:
	npx vitest run --reporter=verbose src/**/*.int.test.ts

test-e2e:
	npx vitest run --reporter=verbose src/**/*.e2e.test.ts

mutation:
	npx stryker run --mutate src/**/*.ts --testRunner vitest --thresholds high=80

contract-diff:
	node scripts/contract-diff.mjs

resilience:
	node scripts/resilience-eval.mjs

perf:
	node scripts/perf-eval.mjs

coverage:
	npx vitest run --coverage --coverage.thresholds.lines 80
```

**Пороги из `thresholds.yaml`:**
```yaml
quality:
  mutation_score: 80
  coverage_lines: 80
  flaky_max_rate: 0.33
resilience:
  timeout_ms: 5000
  retry_max: 3
  cb_fail_ratio: 0.5
  cb_window_ms: 10000
  cb_open_ms: 30000
vcs:
  pr_max_lines: 500
```

## Bad/good примеры

❌ **Плохо:** синхронный HTTP-вызов в цикле без таймаута и idempotency
```typescript
async function processOrders(userId: string) {
  const orders = await db.order.findMany({ where: { userId } });
  for (const order of orders) {
    const r = await fetch(`http://billing/charge?orderId=${order.id}`);
    // нет таймаута, нет retry, нет idempotency, N+1 к billing
    await db.order.update({ where: { id: order.id }, data: { status: 'charged' } });
  }
}
```

✅ **Хорошо:** resilience + batch + idempotency
```typescript
import { CircuitBreaker } from 'opossum';
import pRetry from 'p-retry';
import { v4 as uuid } from 'uuid';

const cb = new CircuitBreaker(async (orderId: string, key: string) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  const r = await fetch('http://billing/charge', {
    method: 'POST',
    headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
    signal: ac.signal,
  });
  clearTimeout(timer);
  if (!r.ok) throw new Error(`billing ${r.status}`);
  return r.json();
}, { errorThresholdPercentage: 50, resetTimeout: 30000, timeout: 6000 });

async function chargeOrder(orderId: string) {
  const key = `charge-${orderId}-${uuid()}`;
  return pRetry(() => cb.fire(orderId, key), {
    retries: 3, minTimeout: 200, maxTimeout: 2000, factor: 2,
    onFailedAttempt: (e) => console.warn('retry', e.attemptNumber, e.retriesLeft),
  });
}
```

❌ **Плохо:** `OFFSET` пагинация на большой таблице
```typescript
const users = await db.user.findMany({ skip: page * 20, take: 20 });
```

✅ **Хорошо:** keyset пагинация
```typescript
const users = await db.user.findMany({
  take: 20,
  cursor: cursor ? { id: cursor } : undefined,
  skip: cursor ? 1 : 0,
  orderBy: { id: 'asc' },
});
```

## Definition of Done

- [ ] Спека изменена отдельным коммитом (заапрувлена в PR)
- [ ] Контракты покрыты JSON Schema/zod; примеры ошибок есть
- [ ] ≥1 unit (fast-check property), ≥1 integration (testcontainers + БД), ≥1 e2e-smoke
- [ ] Mutation score ≥ 80%; инжектированный баг пойман
- [ ] Каждый внешний вызов: timeout + retry/backoff/jitter + idempotency + circuit breaker
- [ ] Горячий путь: keyset пагинация, N+1 отсутствует, p99 load test зелёный
- [ ] Input validation (zod), authz, secrets из env, Prisma parameterized
- [ ] pino structured logs с correlationId, метрики latency/errors/inflight
- [ ] ESLint + Prettier + tsc strict без ошибок
- [ ] PR содержит спеку, промпт, seed, eval-лог, тег вклада `[agent|assisted|manual]`

## Stop / escalation rules

- Спека неясна → остановка, варианты+trade-offs человеку
- Падающие существующие тесты (не новые) → стоп + diff, тесты не править
- Лимит fix-loop (5 циклов) исчерпан → эскалация человеку
- Попытка тронуть `harness/`, `agents/*.md`, `thresholds.yaml` → стоп (protected)
- `npm audit` выявил critical CVE → стоп, эскалация

## Audit trail

В PR / `panel/<slug>/verdict.md` записать:
- версия спеки (хэш коммита)
- промпт (файл промпта)
- seed для fast-check
- результаты eval: lint/typecheck/test/mutation/perf
- тег вклада `[agent|assisted|manual]`
- ссылка на инцидент (если был)