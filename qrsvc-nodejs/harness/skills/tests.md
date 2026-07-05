# skill: tests — Node.js 24 материализация

> Агент читает как playbook «покрыть задачу тестами». Стек: Node.js 24, TypeScript, vitest, fast-check, stryker, testcontainers. Правила — в `agents/test-matrix.md`.

## Назначение и когда применять

Любая задача, где агент пишет или меняет логику (feature/bugfix/refactor). Тесты — руль генерации: падающий тест = промпт агенту. Триггер: завершение реализации, перед коммитом или PR.

## Входы/выходы

**Входы:** `agents/test-matrix.md`, `thresholds.yaml`, `src/` код, OpenAPI/JSON Schema.

**Выходы:**
- `src/**/*.unit.test.ts` — unit-тесты (fast-check property-based, table-driven)
- `src/**/*.int.test.ts` — integration-тесты (testcontainers, mock HTTP)
- `src/**/*.e2e.test.ts` — e2e-smoke (один happy-path до конца)
- `repro/<incident-id>.test.ts` — regression-тест для bugfix

## Non-negotiables

1. Три типа тестов = три источника лжи: unit (алгоритм), integration (контракты), e2e (система).
2. Failing-first: без реализации тест падает. Зелёный тест до кода = спека не зафиксирована.
3. Mutation score ≥ 80% (stryker). Тест, не убивающий мутанта, — bullshit.
4. `assert true`, дублирующие логику тесты, `skip`/`xfail` ради зелёного — запрещены.
5. Агент создаёт новые тесты, но не правит существующие (immutable, см. `fix-loop.md`).
6. Property-based на ключевые инварианты (round-trip, монотонность, отсутствие паники).

## Workflow

1. **Edge-cases ДО кода.** Формулировка unit-тестов на граничные случаи: пустой вход, null, лимиты, невалидные значения. fast-check для генерации.
2. **Unit.** Чистый алгоритм: табличные случаи + property-based инварианты. `vitest` + `fast-check`.
3. **Integration.** Контракты внешних систем: Prisma (testcontainers с PostgreSQL), HTTP (nock/MSW), с инъекцией сбоев (timeout, 5xx, duplicate key).
4. **E2E-smoke.** Ключевой путь до конца: запуск сервера, реальные env/секреты, проверка ответа.
5. **Failing-first.** `npx vitest run` — хотя бы один тест красный без реализации.
6. **Mutation.** `npx stryker run` — score ≥ 80%.
7. **Regression eval (для bugfix).** Тест, гарантирующий, что баг не вернётся.
8. **Flakiness.** Прогон ×3 с jitter: pass-rate ≥ 0.67.

## Stack binding (Node.js 24 + npm)

| Компонент | Инструмент |
|---|---|
| Тест-раннер | vitest (`npx vitest run`) |
| Assertions | vitest встроенные (`expect`, `toBe`, `toEqual`, `toThrow`) |
| Property-based | fast-check (`fc.assert(fc.property(...))`) |
| Mutation | stryker (`npx stryker run`) |
| Тест. контейнеры | testcontainers (`PostgreSqlContainer`) |
| HTTP mock | MSW (`setupServer`) / nock |
| Покрытие | vitest `--coverage` (`v8` provider) |
| SQL счётчик | prismock / `prisma.$use` middleware |

## Quality gates (реальные команды)

```makefile
.PHONY: eval-tests

eval-tests: test-unit test-int test-e2e mutation flakiness

test-unit:
	npx vitest run --reporter=verbose src/**/*.unit.test.ts

test-int:
	npx vitest run --reporter=verbose --test-timeout=30000 src/**/*.int.test.ts

test-e2e:
	npx vitest run --reporter=verbose --test-timeout=60000 src/**/*.e2e.test.ts

mutation:
	npx stryker run --mutate "src/**/*.ts,!src/**/*.test.ts" --testRunner vitest --thresholds high=80

flakiness:
	for i in 1 2 3; do npx vitest run --reporter=json 2>/dev/null | jq '.pass'; done

coverage:
	npx vitest run --coverage --coverage.provider=v8 --coverage.thresholds.lines=80
```

## Bad/good примеры

❌ **Плохой unit:** testId не вызывает logic, проверяет константу
```typescript
import { describe, it, expect } from 'vitest';
import { calculateTotal } from './order';

describe('calculateTotal', () => {
  it('should work', () => {
    const result = calculateTotal([{ price: 10, qty: 2 }]);
    expect(result).toBe(20); // только happy-path, нет null/отрицательных/пустого
  });
});
```

✅ **Хороший unit:** table-driven + property-based
```typescript
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateTotal } from './order';

describe('calculateTotal', () => {
  it.each([
    { items: [], expected: 0 },
    { items: [{ price: 10, qty: 2 }], expected: 20 },
    { items: [{ price: 5, qty: 0 }], expected: 0 },
    { items: [{ price: 3.5, qty: 3 }], expected: 10.5 },
  ])('returns $expected for $items', ({ items, expected }) => {
    expect(calculateTotal(items)).toBeCloseTo(expected);
  });

  it('is non-negative for any valid input', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ price: fc.float({ min: 0, max: 10000 }), qty: fc.integer({ min: 0, max: 100 }) })),
      (items) => calculateTotal(items) >= 0,
    ));
  });

  it('throws on negative price', () => {
    expect(() => calculateTotal([{ price: -1, qty: 1 }])).toThrow('negative');
  });
});
```

❌ **Плохой integration:** мок драйвера вместо реальной БД
```typescript
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    order = { findMany: () => Promise.resolve([{ id: '1' }]) };
  },
}));
```

✅ **Хороший integration:** testcontainers с PostgreSQL
```typescript
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

describe('OrderRepository (integration)', () => {
  let container: PostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();
    prisma = new PrismaClient({ datasources: { db: { url: container.getConnectionUri() } } });
    await prisma.$executeRawUnsafe(`CREATE TABLE "Order" (id TEXT PRIMARY KEY, amount DECIMAL)`);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it('inserts and finds an order', async () => {
    await prisma.order.create({ data: { id: 'o1', amount: 100 } });
    const order = await prisma.order.findUnique({ where: { id: 'o1' } });
    expect(order?.amount).toBe(100);
  });

  it('rejects duplicate id', async () => {
    await prisma.order.create({ data: { id: 'dup', amount: 10 } });
    await expect(prisma.order.create({ data: { id: 'dup', amount: 20 } })).rejects.toThrow();
  });
});
```

## Definition of Done

- [ ] ≥1 unit (fast-check property), ≥1 integration (testcontainers + БД), ≥1 e2e-smoke
- [ ] Property-based на ключевой инвариант (fc.assert, ≥1000 examples для критичных)
- [ ] Mutation score ≥ 80%; stryker убивает мутантов
- [ ] Тесты падали до реализации (failing-first)
- [ ] Нет `assert true`, дублирующих логику, `skip`/`xfail`
- [ ] Новые тесты СОЗДАНЫ агентом (существующие не тронуты)
- [ ] Flakiness: pass-rate ≥ 0.67 на 3 прогонах

## Stop / escalation rules

- Существующие тесты красные из-за изменений → стоп, не править тесты, согласовать
- `stryker run` не установлен → `npm install --save-dev stryker`
- Mutation score < 80% → улучшить тесты, не снижать порог
- Тесты проходят без реализации (failing-first не выполнен) → стоп, нет защёлки

## Audit trail

В коммит/PR записать:
- seed для fast-check
- mutation score
- результаты прогона: unit/int/e2e pass/fail
- flakiness rate на 3 прогонах
- тег вклада `[agent|assisted|manual]`