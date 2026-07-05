# skill: database — Node.js 24 материализация

> Агент читает как playbook работы с базой данных. Стек: Node.js 24, TypeScript, Prisma, PostgreSQL, testcontainers. Правила — в `agents/*.md`.

## Назначение и когда применять

Задача трогает хранилище: «добавь таблицу/поле», «напиши запрос/репозиторий», «сделай миграцию», «оптимизируй медленный запрос». Триггер: задача с упоминанием схемы, БД, данных.

## Входы/выходы

**Входы:** `prisma/schema.prisma`, `agents/*.md` (resilience, contracts, performance, security), `thresholds.yaml`, спека.

**Выходы:**
- `prisma/schema.prisma` — обновлённая схема
- `prisma/migrations/` — новая миграция (up + down проверен)
- `src/persistence/*.repository.ts` — репозиторий
- `src/**/*.int.test.ts` — тест против testcontainers БД
- EXPLAIN план горячих запросов

## Non-negotiables

1. Схема первой (Prisma schema) — отдельный коммит; миграция — вторая.
2. Инварианты в БД: `NOT NULL`, `UNIQUE`, `FK ON DELETE`, `CHECK` — через `@map`/`@ constraint`, а не только в коде приложения.
3. Failing test против testcontainers БД ДО репозитория.
4. EXPLAIN (ANALYZE) на горячем запросе: индексный доступ, без Seq Scan, read rows ≤ бюджет.
5. N+1 запрещён: Prisma `include`/`select` + batch, не цикл `findMany`.
6. Keyset пагинация (`cursor`), не `skip`/`OFFSET` на растущих таблицах.
7. Parameterized запросы (Prisma — всегда параметризован, но raw SQL через `$queryRaw` с шаблоном).
8. Транзакция с явной изоляцией; идемпотентность (`upsert`/`createMany skipDuplicates`).
9. Connection pool: Prisma `connection_limit`, `statement_timeout` через `$executeRaw`.
10. Secrets из env: `DATABASE_URL` в `.env`, не в коде.

## Workflow (схема → миграция → репозиторий → тесты → EXPLAIN)

1. **Схема первой.** Обновить `prisma/schema.prisma`: модели, поля, `@id`, `@unique`, `@relation`, `@@index`, `@@map`. Коммит: `[agent] feat(schema): add Order table`.
2. **Миграция.** `npx prisma migrate dev --name <feature>` — создаёт `prisma/migrations/`. Проверить откат: `npx prisma migrate down 1 && npx prisma migrate up`.
3. **Тест против testcontainers.** PostgreSqlContainer + PrismaClient. Проверить: create, read, constraint violation (unique, fk), concurrent insert.
4. **Failing test защёлка.** Тест падает без реализации репозитория.
5. **Репозиторий.** `src/persistence/<entity>.repository.ts`. Параметризованные запросы (Prisma API). Индексы в `@@index`.
6. **EXPLAIN.** На копии данных: `EXPLAIN ANALYZE` — подтвердить index scan.
7. **N+1 проверка.** `prisma.$use` middleware считает запросы. На N сущностей — константное число.
8. **Keyset пагинация.** `findMany({ cursor, take, orderBy })`. Без `skip` на больших таблицах.
9. **Транзакция + идемпотентность.** `$transaction([...])` с изоляцией. `upsert` для идемпотентности.
10. **Пул + таймауты.** `connection_limit: 10` в datasource. `statement_timeout` через `$executeRawUnsafe('SET statement_timeout = 5000')`.

## Stack binding (Node.js 24 + npm)

| Компонент | Инструмент |
|---|---|
| БД | PostgreSQL 16+ |
| ORM | Prisma (`@prisma/client`) |
| Миграции | Prisma Migrate (`npx prisma migrate`) |
| Тест. контейнеры | `@testcontainers/postgresql` |
| SQL-счётчик | Prisma middleware (`$use`) |
| Пул | Prisma `connection_limit` |
| EXPLAIN | `npx prisma db execute --stdin` + ручной анализ |
| Таймаут | `SET statement_timeout = <ms>` |
| Retry | p-retry (только deadlock/serialization) |
| Correlation | prisma `$on('query', ...)` с тегом `/* svc:<id> */` |

## Quality gates (реальные команды)

```makefile
.PHONY: eval-database

eval-database: migration-gate constraint-gate plan-gate nplus1-gate concurrency-gate idempotency-gate security-gate load-gate

migration-gate:
	npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://test:test@localhost:5433/test"
	npx prisma migrate dev --name test-rollback 2>/dev/null; npx prisma migrate down 1 2>/dev/null; npx prisma migrate up
	npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma

constraint-gate:
	npx vitest run src/persistence/**/*.int.test.ts -t "rejects|constraint"

plan-gate:
	node scripts/explain-check.mjs

nplus1-gate:
	node scripts/sql-counter.mjs

concurrency-gate:
	npx vitest run src/persistence/**/*.int.test.ts -t "concurrent"

idempotency-gate:
	npx vitest run src/persistence/**/*.int.test.ts -t "idempotent"

security-gate:
	node -e "
	const schemas = require('fs').readFileSync('prisma/schema.prisma','utf8');
	const hasRaw = schemas.includes('@map');  # at least
	"
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const hasInjection = /\\\$$rawQuery\s*\`[^`]*\\\${/.test(src);
	process.exit(hasInjection ? 1 : 0);
	"

load-gate:
	node scripts/load-test.mjs  # p99 < SLO на 10x данных
```

## Bad/good примеры

❌ **Плохо:** N+1 через Prisma в цикле
```typescript
async function getOrdersWithItems(userId: string) {
  const orders = await prisma.order.findMany({ where: { userId } });
  for (const order of orders) {
    order.items = await prisma.orderItem.findMany({ where: { orderId: order.id } }); // N+1
  }
  return orders;
}
```

✅ **Хорошо:** batch через Prisma `include`
```typescript
async function getOrdersWithItems(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: true },  // один JOIN, не N+1
  });
}
```

❌ **Плохо:** OFFSET пагинация
```typescript
const orders = await prisma.order.findMany({ skip: page * 20, take: 20 });
```

✅ **Хорошо:** keyset пагинация
```typescript
const orders = await prisma.order.findMany({
  take: 20,
  cursor: lastId ? { id: lastId } : undefined,
  skip: lastId ? 1 : 0,
  orderBy: { id: 'asc' },
});
```

❌ **Плохо:** неидемпотентная вставка
```typescript
await prisma.payment.create({ data: { orderId, amount } });
// retry клиента создаст дубль
```

✅ **Хорошо:** идемпотентная вставка
```typescript
await prisma.payment.upsert({
  where: { idempotencyKey },
  update: {},
  create: { idempotencyKey, orderId, amount },
});
```

## Definition of Done

- [ ] Prisma schema обновлена; миграция создана (up+down проверен)
- [ ] Инварианты в схеме: `@unique`, `@relation`, `@@index`
- [ ] ≥1 int тест против testcontainers (create, constraint violation, concurrent)
- [ ] EXPLAIN горячих запросов: index scan, read rows ≤ бюджет
- [ ] N+1 отсутствует; Prisma `include`/`select` вместо цикла
- [ ] Keyset пагинация (cursor), без skip
- [ ] Транзакция с явной изоляцией; upsert/idempotency
- [ ] `connection_limit`, `statement_timeout` настроены
- [ ] DATABASE_URL из env, не в коде
- [ ] correlationId в комментарии запроса

## Stop / escalation rules

- Миграция не откатывается (down не работает) → стоп
- EXPLAIN показывает Seq Scan на большой таблице → стоп, добавить индекс
- N+1 обнаружен → стоп, переписать на batch
- `prisma migrate dev` на проде → стоп, использовать `prisma migrate deploy`
- Секреты в коде/промпте → стоп, эскалация безопасности

## Audit trail

В коммите: версия schema.prisma, хэш миграции. В PR: EXPLAIN вывод, результаты migration-gate, стryker score. Seed для fast-check. Тег вклада.