# REVIEWER (round 2) handoff — POST /api/v1/qr optional `label`

- Skill-источник: `qrsvc-nodejs/harness/skills/review.md` (project-local, найден, fallback не потребовался).
- Режим read-only: код/тесты/спека/harness не правились.
- Базис ревью: `git diff main` (П1 — только дельта), плюс верификация находок round-1 (`03-review.md`) и фикса DEV (`04-dev-fix.md`).
- Линза: повторная проверка после fix-loop'а. Верификация по файлам, словам DEV не доверяем.

## Верификация фикса (по файлам, не по handoff)

1. `git diff main -- src/app.ts` — фикс присутствует именно там, где обещано:
   `src/app.ts:6-15` — `Fastify({ logger:false, ajv:{ customOptions:{ coerceTypes:false, removeAdditional:false, useDefaults:false } } })`.
   Минимальный, точечный, не разрастается за пределы `label`-фичи.
2. Спека (`api/openapi.yaml`) и тесты тестером не правлены (правило immutable) — `git diff main --stat` подтверждает: менялись только `api/openapi.yaml` (round-0, `label`) и `src/app.ts`.
3. Локальный gate `RECHECK_COMMANDS` из `03-review.md` воспроизведён:
   - `npx vitest run` → **Test Files 7 passed (7), Tests 45 passed (45)** (раньше было 40 passed / 5 failed).
   - `npm run lint` → eslint 0 warnings, prettier clean.
   - `npm run typecheck` → tsc --strict без ошибок.
   Все 5 ранее красных кейсов `tests/contract/label-negative.test.ts` (`number`, `boolean`, `array`, `null`, `object`, `extra`) теперь зелёные — failing-first → green без правки тестов, как и ожидалось из round-1.

## Контракт-паритет со спекой (П1, §1–2) — PASS

- Вход: `api/openapi.yaml:13` `additionalProperties: false` + `:19` `label: {type: string, maxLength: 64}` — теперь enforced в коде
  (`coerceTypes:false` отвергает number/bool/array, `removeAdditional:false` — extra-поля дают 400, `useDefaults:false` — null не мутирует в "").
- `label: null` → 400 (соответствует спеке; `nullable` не объявлено в OpenAPI 3.0 — null невалиден по умолчанию). Тест `label-negative.test.ts:34` зелёный.
- Выход: `api/openapi.yaml:27` `additionalProperties: false` + `:35` `label` (не required) — соблюдён: ответ формируется явно в `src/app.ts:45-55`, `label` добавляется только при `hasOwnProperty`.
- Backward compatibility: добавление опционального `label` additive; существующие клиенты не ломаются (контракт-тесты `border.test.ts`, `label.test.ts` зелёные).
- Отдельных изменений контракта сверх round-0 нет — deliberate diff в спеке отсутствует, расхождение спека↔импл устранено.

## П2 Resilience (§6) — N/A в дельте

- В дельте нет новых `fetch`/брокеров/Prisma/LLM. `randomUUID` — синхронно, локально.
- Timeout/retry/circuit-breaker/Idempotency-Key к добавленной логике не применимы.
- Pre-existing: POST без `Idempotency-Key` — вне дельты `label`, по правилу «только git diff» не трогаю (как и в round-1).

## П3 Тесты (§3) — PASS

- Контракт-тесты DEV: `tests/contract/label.test.ts` (5 кейсов) — зелёные.
- Контракт-тесты TESTER: `tests/contract/label-negative.test.ts` (8 кейсов: number/boolean/array/null/object/extra/whitespace/unicode) — все зелёные, каждый подписан инжект-багом.
- Property-тесты TESTER: `tests/property/label-invariant.test.ts` (4 кейса, fast-check) — round-trip verbatim, present⇔present, absent⇔absent, boundary 65→400 — зелёные.
- Покрытие инвариантов «returned iff provided» и границы 64/65 — достаточное.
- Mutation (stryker) — tooling отсутствует в проекте (отмечено обоими агентами как tech-debt). Не блокер: failing-first набор TESTER'а фактически эквивалентен ручной мутации 8 инжект-багов — все пойманы.

## П6 Горячий путь — PASS

- Дельта: O(1) — `hasOwnProperty` + условное добавление поля. Циклов нет, БД нет. N+1/OFFSET — не применимо.

## Security (§3) — PASS

- Type-confusion на входе (number/bool/array→string) устранена фиксом ajv (`coerceTypes:false`).
- `removeAdditional:false` восстанавливает strict-контракт — extra-поля отвергаются, leak через вырезание устранён.
- Хардкода секретов в дельте нет; `grep` по diff не нашёл `password|token|secret|api_key|authorization`.
- `logger:false` — pino не используется; PII/секреты в логи не утекают (логирования нет). `label` потенциально PII, но в дельте не логируется и не персистится.
- SQL-инъекций нет (Prisma в дельте не используется).

## Concurrency — PASS

- Shared state отсутствует; `randomUUID` — thread-safe. Event loop не блокируется (CPU-bound нет).

## Observability (§4) — N/A

- `logger:false` — pre-existing настройка всего сервера, вне дельты `label`. correlationId/метрики отсутствуют, но вне скоупа ревью (правило «только git diff»). Tech-debt, не блокер.

## Audit (П5) — N/A

- Коммитов нет (DEV по роли не коммитит). `panel/<slug>/verdict.md` не используется проектом — аудит-трейл ведётся в `.ai-team/handoff/`. Тег вклада: `[agent]` (dev + tester + reviewer + dev-fix + reviewer-r2, autonomous loop).

## FINDINGS (round-2)

1. **(П1, контракт) — FIXED & VERIFIED:** `src/app.ts:6-15` — добавлены `ajv.customOptions({ coerceTypes:false, removeAdditional:false, useDefaults:false })`. 5 ранее красных кейсов `tests/contract/label-negative.test.ts:23,34,44,55` теперь зелёные. Спека↔импл расхождение устранено.
2. **(Security, §3) — FIXED:** как следствие п.1 — type-confusion на входе устранён.
3. **(Audit/tech-debt, вне дельты — НЕ БЛОКИРУЮЩЕЕ, перенесено из round-1):** `api/openapi.yaml:20` — не объявлен `400`-ответ для validation errors (только 201/422). Pre-existing; Fastify возвращает 400 по умолчанию, но это не отражено в спеке. Отдельный тикет.
4. **(Audit/tech-debt, вне дельты — НЕ БЛОКИРУЮЩЕЕ, перенесено из round-1):** `src/app.ts:7` — `logger:false` для всего сервера; нет `correlationId`, метрик latency/errors. Pre-existing; вне дельты `label`.
5. **(Регрессия-риск, НЕ БЛОКИРУЮЩЕЕ):** фикс отключает дефолты ajv **глобально** для всего сервера (`buildServer()`), а не только для `label`. Все 45 кейсов (7 файлов) зелёные, регрессий не обнаружено, но при добавлении новых эндпоинтов, рассчитанных на `coerceTypes`/`removeAdditional`/`useDefaults`, потребуется явная схема. Соответствует `feature.md` (input validation через JSON Schema). DEV задокументировал это в `04-dev-fix.md:68-72`. Принимается как сознательное решение.

## MISSING_TESTS

- Явный тест `label` + максимальный `data` (capacity boundary в комбинации) — не добавлен, но property-тест `label-invariant.test.ts` варьирует `data`; добор не требуется.
- Тест `label` + `error_correction:'H'` + `border:40` — не критичен, schema-валидация полей независима.
- Mutation (stryker) — tooling отсутствует; failing-first набор TESTER'а фактически покрывает mutation-сценарии.

## RECHECK_COMMANDS

```bash
cd qrsvc-nodejs && \
  npx vitest run && \
  npm run lint && \
  npm run typecheck
```
Воспроизведённый результат: `Test Files 7 passed (7), Tests 45 passed (45)`, lint OK, typecheck OK.

---

## VERDICT: MERGE

RED FLAG из round-1 (П1, контракт: дефолты ajv обходят `additionalProperties:false` и `type:string`) — **устранён минимальным фикс** в `src/app.ts:6-15` и **верифицирован по файлам и прогоном gate**. Все 8 блоков проверки пройдены (П1 PASS, П2 N/A, П3 PASS, П6 PASS, security PASS, concurrency PASS, observability N/A, audit N/A). Регрессий не обнаружено. Tech-debt findings №3, №4 — pre-existing, вне дельты `label`, не блокирующие (перенесены отдельным тикетом). Готов к атомарным коммитам: `[agent] feat(spec): add POST /api/v1/qr label` + `[agent] feat(api): support optional label` + `[agent] fix(ajv): enforce strict input contract`.

Тег вклада: `[agent]` (autonomous loop: dev → tester → reviewer-r1 → dev-fix → reviewer-r2).
