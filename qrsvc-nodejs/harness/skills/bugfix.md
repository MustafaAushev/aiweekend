# skill: bugfix — Node.js 24 материализация

> Агент читает как playbook для исправления дефекта. Стек: Node.js 24, TypeScript, vitest, Prisma, pino, Fastify. Правила — в `agents/*.md`. Цикл: incident → rule → regression eval.

## Назначение и когда применять

Обнаружен дефект с воспроизводимым сценарием: production-инцидент, упавший CI, пользовательский баг-репорт. Триггер: `bug: <описание>` в тикете или ссылка на инцидент.

## Входы/выходы

**Входы:** `agents/*.md`, `agents/incident-log.md`, `thresholds.yaml`, тикет с симптомами, логи/metrics/traces.

**Выходы:**
- `repro/<incident-id>.test.ts` — воспроизводящий тест (падает до фикса)
- `src/` — фикс
- `agents/*.md` — обновлённое правило (предотвращает повтор)
- `agents/incident-log.md` — запись инцидента
- Коммит `repro: <incident-id>` + коммит фикса

## Non-negotiables

1. Воспроизводящий тест — отдельным коммитом (`repro: <incident-id>`) ДО фикса.
2. Корневая аксиома модели → новое правило в `agents/*.md`.
3. Regression eval — тест, гарантирующий невозврат бага.
4. Все существующие тесты зелёные после фикса.
5. Mutation testing подтверждает: тест убивает мутанта, связанного с багом.
6. Audit trail: каждый коммит — ссылка на инцидент, версию спеки, промпт.

## Workflow

1. **Воспроизвести баг.** Написать минимальный тест (integration или e2e), стабильно падающий. Использовать testcontainers, если баг в persistence.
2. **Зафиксировать failing test.** `git commit -m '[agent] repro: INC-123'`. Только тест, без фикса.
3. **Выявить корневую аксиому.** Например: «считала, что ответ всегда 200», «не учла гонку данных», «не добавила таймаут».
4. **Сформулировать правило.** Явно запрещающее аксиому на языке спек. Пример: «каждый внешний вызов обязан иметь таймаут в диапазоне p99–p99.9 зависимости».
5. **Добавить правило** в соответствующий `agents/*.md` (resilience/contracts/performance/vcs и т.д.).
6. **Реализовать фикс** по новому правилу. Тест проходит.
7. **Regression eval.** Добавить property-based или mutation тест, проверяющий невозврат.
8. **Полный прогон.** `npx vitest run && npx tsc --noEmit && npx stryker run && npx eslint src/`.
9. **Обновить `agents/incident-log.md`**: симптом → неверная аксиома → новое правило.
10. **PR.** Фикс + repro-тест + правило + regression eval. Коммиты атомарны.

## Stack binding (Node.js 24 + npm)

| Компонент | Инструмент |
|---|---|
| Тест-раннер | vitest |
| Property-based | fast-check |
| Mutation | stryker |
| Integration | testcontainers (PostgreSqlContainer) |
| HTTP mock | MSW / nock |
| Resilience lib | opossum, p-retry |
| Линтер | eslint + typescript-eslint |
| Тип-чекер | tsc --strict |

## Quality gates (реальные команды)

```makefile
.PHONY: eval-bugfix

eval-bugfix: repro-check rule-check fix-check regression-check full-suite

repro-check:
	test -f repro/INC-*.test.ts && npx vitest run repro/ --reporter=verbose

rule-check:
	node -e "
	const ruleFiles = ['resilience','contracts','performance','vcs'];
	const log = require('fs').readFileSync('agents/incident-log.md','utf8');
	const match = log.match(/\[INC-\d+\]/);
	process.exit(match ? 0 : 1);
	"

fix-check:
	npx vitest run --changed HEAD~1

regression-check:
	npx stryker run --mutate src/service/*.ts --testRunner vitest --thresholds high=80

full-suite:
	npx vitest run
	npx tsc --noEmit --strict
	npx eslint src/ --max-warnings 0
	npx prettier --check src/
```

## Bad/good примеры

❌ **Плохой bugfix:** фикс симптома без теста и правила
```typescript
// Баг: таймаут не ставился, запрос висел 2 минуты
// «Фикс» — просто добавил AbortController, но:
// - нет repro-теста
// - нет правила в resilience.md
// - баг вернётся в следующей фиче
async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`); // timeout? нет
}
```

✅ **Хороший bugfix:** repro → правило → фикс → regression
```typescript
// Шаг 1: repro/INC-42.test.ts
it('times out and throws', async () => {
  await expect(fetchWithTimeout('http://slow:9999', 100))
    .rejects.toThrow('timeout');
});

// Шаг 2: agents/resilience.md добавлено правило
// «Каждый fetch обязан иметь AbortController timeout из thresholds.yaml»

// Шаг 3: фикс
import { setTimeout } from 'timers/promises';

export async function fetchWithTimeout(url: string, ms: number) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(new Error('timeout')), ms);
  try {
    return await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(id);
  }
}

// Шаг 4: regression eval — stryker мутирует ms=0 → тест ловит
```

❌ **Плохой repro:** тест проходит до фикса
```typescript
// Такой тест ничего не проверяет — баг уже мог быть исправлен
it('should not crash', () => {
  expect(service.process([])).toBeDefined();
});
```

✅ **Хороший repro:** стабильно падает
```typescript
it('throws on empty input (INC-42)', () => {
  expect(() => service.process([])).toThrow('empty');
  // До фикса service.process([]) возвращал undefined без ошибки
});
```

## Definition of Done

- [ ] Воспроизводящий тест добавлен отдельным коммитом и падал до фикса
- [ ] Regression eval добавлен и проходит
- [ ] Правило в `agents/*.md` обновлено
- [ ] Все существующие тесты (unit, integration, e2e) проходят
- [ ] Mutation testing: stryker score ≥ 80%
- [ ] Если баг затрагивал контракты — zod/JSON Schema обновлены
- [ ] Если баг затрагивал resilience — fault-injection eval проходит
- [ ] `agents/incident-log.md` обновлён
- [ ] Audit trail: коммит содержит ссылку на инцидент, версию спеки

## Stop / escalation rules

- Баг не воспроизводится тестом → стоп, недостаточно данных, эскалация
- Фикс ломает существующие тесты → стоп, не править тесты
- Лимит fix-loop (5 циклов) исчерпан → эскалация
- Mutation score < 80% после фикса → улучшить тесты
- Баг в protected-пути (`harness/`, `agents/`, `thresholds.yaml`) → стоп

## Audit trail

В `agents/incident-log.md`:
```
[INC-42] fetch без таймаута → неверная аксиома «ответ всегда быстр» →
правило «каждый fetch обязан иметь AbortController timeout из thresholds.yaml» →
regression: repro/INC-42.test.ts | stryker: 85% → PASS
```

В PR: ссылка на INC-42, хэш repro-коммита, версия спеки, seed, тег вклада.