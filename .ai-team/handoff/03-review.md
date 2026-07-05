# REVIEWER handoff — POST /api/v1/qr optional `label`

- Skill-источник: `qrsvc-nodejs/harness/skills/review.md` (project-local, найден, fallback неВерификация подтверждает находки TESTER: 5 тестов красные, lint/typecheck зелёные. Пишу итог ревью.
Готово. Итог записан в `/Users/mus/workshops/aiweekend/.ai-team/handoff/03-review.md`.

**VERDICT: DO_NOT_MERGE** — RED FLAG по контракту.

Ключевая находка: `src/app.ts:6` использует `Fastify({ logger: false })` без явного `ajv.customOptions`, и дефолты ajv (`coerceTypes`, `removeAdditional`, `useDefaults`) обходят `additionalProperties:false` и `type:string` из собственной схемы и OpenAPI-спеки. Фактически подтверждено прогоном `npx vitest run`: **5 failed / 40 passed (45)** — `tests/contract/label-negative.test.ts` красный (`label: 42→"42"`, `label: null→""`, `extra`-поле вырезано вместо 400). Lint и typecheck зелёные.

Вердикт DEV «33/33 passed» относился к срезу до тестов TESTER'а; вердикт TESTER «5 дефектов» подтверждён по файлам. Минимальный фикс у DEV: `ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } }` — после него 5 красных тестов станут зелёными без правки тестов (failing-first → green). Остальные 7 блоков (П2, П3-добор, П6, security, concurrency, observability, audit) — PASS или N/A вне дельты; по 2 tech-debt-замечания (нет `400`-ответа в спеке, `logger:false`) отмечены как pre-existing и не блокирующие.
1, `label:""` (ожидалось 400, `nullable` не объявлено) — `label-negative.test.ts:34`;
  - `{label:"ok", extra:1}` → 201, `extra` вырезан (ожидалось 400) — `label-negative.test.ts:55`.
- Корневая причина: `Fastify({ logger: false })` без явного `ajv.customOptions` (`src/app.ts:6`). Спека и схема врут относительно поведения валидатора — расхождение спека↔импл.
- OpenAPI 201 response `additionalProperties: false` (`api/openapi.yaml:27`) в коде соблюдено (ответ формируется явно), а вот входной контракт — нет.

### П2 Resilience (§6) — N/A в дельте
- В дельте нет новых `fetch`/брокеров/Prisma. `randomUUID` — локально. Timeout/retry/circuit-breaker/idempotency не применимы к добавленной логике.
- Замечание вне дельты (не блокирующее): POST без `Idempotency-Key` — pre-existing, не трогаю по правилу «только git diff».

### П3 Тесты (§3) — NEEDS WORK
- Контракт-тесты DEV (`tests/contract/label.test.ts`) — 5 зелёных, покрывают happy-path и границу 64/65.
- Новые тесты TESTER'а (`label-negative.test.ts` 8 кейсов, `label-invariant.test.ts` 4 property) — качественные, каждый подписан инжект-багом.
- **5 кейсов красные** — см. П1. Mutation score / stryker — не запускался (tooling отсутствует, что зафиксировано обоими агентами; не блокер).
- Покрытие инвариантов: round-trip verbatim, present⇔present, absent⇔absent, boundary 65→400 — достаточное.

### П6 Горячий путь — PASS
- Дельта: O(1) — `hasOwnProperty` + условное добавление поля. Циклов нет. N+1/OFFSET — не применимо (in-memory, без БД).

### Security (§3) — NEEDS WORK
- Zod не используется; валидация на ajv-схеме Fastify — но из-за дефолтов (см. П1) тип-инъекция проходит. Это security-relevant: клиент может передать `label: 42` и получить строку в ответе, что ломает type-контракт下游.
- Хардкода секретов в дельте нет (`grep` по diff не нашёл `password|token|secret|api_key|authorization`).
- `logger: false` — PII/секреты в логи не утекают (логирования нет). `label` — потенциально PII, но в дельте не логируется и не персистится — ок.
- SQL-инъекций нет (Prisma не используется в дельте).

### Concurrency — PASS
- Shared state отсутствует; `randomUUID` — thread-safe. Event loop не блокируется (CPU-bound нет).

### Observability (§4) — N/A
- `logger: false` — pino не используется. `correlationId` отсутствует, но это pre-existing настройки всего сервера, вне дельты `label`.

### Audit (П5) — N/A
- Коммитов нет (DEV по роли не коммитит). В дельте нет `panel/<slug>/verdict.md` — проект не использует `panel/`-структуру; аудит-трейл ведётся в `.ai-team/handoff/`.

## Дополнительные находки (edge cases, регрессии)

- `src/app.ts:31` — `hasLabel` через `Object.prototype.hasOwnProperty.call(body, 'label')` корректен и устойчив к `__proto__`/`Object.create(null)`. Хорошее решение.
- `src/app.ts:36` — `response: Record<string, unknown>` + условное добавление `label` — соответствует «returned only when provided» из спеки.
- `api/openapi.yaml:35` — `label` в response не required — согласовано с условным возвратом. OK.
- Backward compatibility: добавление опционального `label` в request и response — additive, не ломает существующих клиентов. OK.
- `label: ""` трактуется как заданное значение и возвращается — зафиксировано тестом `label.test.ts:59`, сознательное решение DEV. Риск задокументирован в `01-dev.md`. OK.
- Спека не объявляет `400`-ответ для validation errors (только 201/422) — pre-existing паттерн (тест `border.test.ts` также полагается на 400). Вне дельты, не блокер, но стоит зафиксировать как tech-debt.
- `nullable` для `label` не объявлено в OpenAPI 3.0 — по умолчанию null невалиден. Спека корректна; баг в реализации (ajv coerce). После фикса контракта спека правок не требует.

## MISSING_TESTS
- Явный тест на `label` + максимальный `data` (capacity boundary) — не добавлен, но property-тест `label-invariant.test.ts:54` варьирует `data` при отсутствии `label`. Покрытие достаточно, добор не требуется.
- Тест на `label` при `error_correction: 'H'` + `border: 40` (комбинации с другими полями) — не критичен, schema-валидация не зависит от комбинаций.
- Mutation-тестирование (stryker) — tooling отсутствует; зафиксировано как tech-debt обоими агентами.

## FINDINGS
1. **RED FLAG (П1, контракт):** `src/app.ts:6` — `Fastify({ logger: false })` без `ajv.customOptions` обходит `additionalProperties:false` и `type:string` из схемы. 5 кейсов в `tests/contract/label-negative.test.ts:23,34,55` красные. Фикс у DEV: `ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } }` + явное решение по `null` (см. п.2).
2. **(П1, контракт null):** `api/openapi.yaml:19` — `label` без `nullable`. После фикса п.1 `null` начнёт давать 400 (соответствует спеке). Подтвердить тестом `label-negative.test.ts:34` (уже есть, станет зелёным). Доп. опция в спеку не требуется.
3. **(Security/§3):** как следствие п.1 — type-confusion на входе (`number/bool/array→string`). Лечится тем же фиксом ajv.
4. **(Audit/tech-debt, вне дельты):** `api/openapi.yaml:20` — не объявлен `400`-ответ для validation errors. Pre-existing; не блокер для `label`, но стоит отдельно оформить (отдельный тикет).
5. **(Audit/tech-debt, вне дельты):** `src/app.ts:6` — `logger: false` для всего сервера; нет `correlationId`, метрик. Pre-existing; вне дельты `label`.

## RECHECK_COMMANDS
```bash
cd qrsvc-nodejs && \
  npx vitest run && \
  npm run lint && \
  npm run typecheck
```
Ожидаемый результат после фикса DEV: `Test Files 7 passed (7), Tests 45 passed (45)`, lint OK, typecheck OK.

---

## VERDICT: DO_NOT_MERGE

RED FLAG по блоку П1 (контракт): реализация не обеспечивает собственную схему валидации и OpenAPI-спеку из-за дефолтов ajv во Fastify. 5 контракт-тестов красные. Возврат в fix-loop к DEV с минимальным фиксом: `ajv.customOptions({ coerceTypes: false, removeAdditional: false, useDefaults: false })` в `src/app.ts:6`. После фикса 5 красных тестов станут зелёными без правки тестов (failing-first → green).

Тег вклада: `[agent]` (dev + tester + reviewer, autonomous loop).
