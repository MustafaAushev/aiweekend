# rule: test-matrix — Node.js 24 тесты

> Три типа проверяют три разных источника лжи. Coverage 90% на одних unit = доверие 0%. Стек: vitest, fast-check, stryker, testcontainers. Ссылается на `skills/tests.md`.

## Non-negotiables

1. **T1 — Каждый PR: минимум один тест каждого типа.**
   - **unit** — чистый алгоритм, edge-cases, fast-check property-based. `vitest` + `fc.assert`.
   - **integration** — контракты внешних (testcontainers PostgreSQL, MSW для HTTP). Инъекция сбоев: timeout, 5xx, duplicate key.
   - **e2e-smoke** — один happy-path: запуск Fastify, запрос через `app.inject()`, проверка ответа до конца.
2. **T2 — Mutation (stryker).** Score ≥ 80%. Инжект мутантов: `>` → `>=`, `return x` → `return null`, убрать `commit`. Тесты ДОЛЖНЫ упасть.
3. **T3 — Property-based (fast-check).** Инварианты: round-trip, монотонность, отсутствие паники. `fc.assert(fc.property(...), { numRuns: 1000 })` для критичных.
4. Запрещено: `assert(true)`, тест, дублирующий реализацию, `skip`/`xfail`.
5. Агент создаёт НОВЫЕ тесты; существующие/harness/пороги — immutable.

## Quality gates (реальные команды)

```makefile
.PHONY: eval-test-matrix

eval-test-matrix: unit-check int-check e2e-check mutation-check property-check flakiness-check

unit-check:
	npx vitest run --reporter=verbose src/**/*.unit.test.ts

int-check:
	npx vitest run --reporter=verbose --test-timeout=30000 src/**/*.int.test.ts

e2e-check:
	npx vitest run --reporter=verbose --test-timeout=60000 src/**/*.e2e.test.ts

mutation-check:
	npx stryker run --mutate 'src/**/*.ts,!src/**/*.test.ts' --testRunner vitest --thresholds high=80

property-check:
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const hasProperty = src.includes('fc.assert') || src.includes('fast-check');
	process.exit(hasProperty ? 0 : 1);
	"

flakiness-check:
	for i in 1 2 3; do npx vitest run --reporter=json 2>/dev/null | node -e "
	  let d = ''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
	    const r = JSON.parse(d);
	    process.exit(r.pass ? 0 : 1);
	  });
	"; done
```

## Bad/good примеры

❌ **Плохой unit:** тест, проходящий после любой реализации
```typescript
it('adds order', () => {
  const result = service.addOrder({ userId: '1', items: [] });
  expect(result).toBeDefined(); // undefined тоже defined
});
```

✅ **Хороший unit:** table-driven + property
```typescript
import fc from 'fast-check';
it.each([
  { input: { userId: '1', items: [] }, expected: false },
  { input: { userId: '1', items: [{ id: 'i1', qty: 1 }] }, expected: true },
])('validates order', ({ input, expected }) => {
  expect(validateOrder(input)).toBe(expected);
});

it('round-trip serialization', () => {
  fc.assert(fc.property(
    fc.record({ id: fc.uuid(), amount: fc.float({ min: 0 }) }),
    (order) => {
      const serialized = JSON.stringify(order);
      return JSON.parse(serialized).amount === order.amount;
    }
  ));
});
```

❌ **Плохой integration:** vi.mock драйвера
```typescript
vi.mock('@prisma/client');
```

✅ **Хороший integration:** testcontainers
```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';
const container = await new PostgreSqlContainer().start();
const prisma = new PrismaClient({ datasources: { db: { url: container.getConnectionUri() } } });
```

## Stop rules

- PR без любого из трёх типов → стоп
- `stryker` score < 80% → стоп, улучшить тесты
- `assert(true)` или тест без assert → стоп, RED FLAG
- `skip`/`test.skip` → стоп (подозрение на хитрый пропуск)
- Существующий тест изменён агентом → стоп (immutable)
- Flakiness > 1/3 → стоп, стабилизировать