## artifact-summary cycle-2 (post-fix) — компактная сводка 12 файлов для суда R1 цикл 2

ЦИКЛ 2: применены 8 правок цикла 1 (RED FLAG → закрыть majority-FAIL по Корректность/Риски/Альтернативы). Ниже — ИЗМЕНЕНИЯ по каждому пункту + полный инвариантный набор.

### Изменения cycle-1 → cycle-2

**[fix-1] skills/database.md — миграция + транзакция:**
- workflow шаг 2: `npx drizzle-kit generate` → forward-only `NNNN_<slug>.sql`; `drizzle-kit generate` НЕ создаёт down автоматически — `NNNN_<slug>.down.sql` авторствуешь вручную как обратную операцию (DROP INDEX → DROP COLUMN после phase-d → DROP TABLE). gate: `npm run db:migrate:test-up-down-up` (`scripts/migration-roundtrip.mjs`: up → down → up, `pg_dump --schema-only` hash-сравнение). Прод: forward-only, откат = новая миграция-компенсация (down — только тестовая БД + phase-d cleanup).
- workflow шаг 7: `db.transaction(async (tx) => {...}, { isolationLevel: 'read-committed'|'serializable' })` (Drizzle 0.36+ для postgres-js; если старее — `tx.execute(sql\`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE\`)`). Retry на 40001/40P01 — cockatiel `Retry` оборачивает `db.transaction` (не внутри), иначе partial-write.
- DoD + audit: миграция = forward + вручную down.sql; gate migration-roundtrip требует *.down.sql.
- good-пример комментарий: «drizzle-kit generate → forward-only + вручную down.sql; down проверен up→down→up».

**[fix-2] agents/resilience.md — cockatiel wrap order + exponentialBackoff + total deadline + Bulkhead/p-limit scope:**
- Stack binding: Timeout (per-attempt) + Total deadline (outer `Timeout` = `retry_max × timeout_ms + jitter margin` ИЛИ `AbortController+Date.now()`); Retry = `retry(handleAll, {maxAttempts: retry_max, delay: exponentialBackoff({baseDelay:100, maxDelay:5000, jitter:true})})` — НЕ `wait_random_exponential` (tenacity/python); CB (`failureRatio`, `resetTimeout`) — Retry ОБЕРТЫВАЕТ CB (CB считает уникальные request-failures, не per-retry); Bulkhead (`maxConcurrent`) — per-dependency; p-limit — per-request fan-out; выбирать осмысленно.
- Wrap order явно: `pipe = wrap(outerTimeout, wrap(retry, wrap(circuitBreaker, wrap(bulkhead, fn))))`. НЕ `wrap(circuitBreaker, retry, ...)` — при CB outermost каждая retry-попытка инкрементит CB counter → ложное OPEN.
- good-пример: полный cockatiel pipe с totalDeadline + retry(exponentialBackoff{jitter:true}) + cb + bulkhead + perAttemptTimeout; комментарий «retry на 40001/40P01 — cockatiel Retry оборачивает db.transaction (не внутри), иначе partial-write».
- DoD: Retry cockatiel-native, Retry оборачивает CB, outer Timeout = total deadline.

**[fix-3] skills/standard.md — §10 «Обоснование стека»:**
- Таблица ADR-обоснований: cockatiel vs opossum (TS-native, policy-composable, 4 политики в одной; opossum — только CB) · Drizzle vs Prisma/Kysely/pg (SQL-control, нет runtime-overhead, drizzle-kit generate = SQL-миграции) · Vitest vs node:test/jest (ESM-native, coverage-v8, fast-check/Stryker integration, --repeat-times) · fast-check vs faker (shrinking) · Stryker vs mutode (единственный стабильный для JS/TS) · undici vs node:fetch/axios/got (bundled Node 24, Agent pool-tuning, MockAgent) · pino vs winston/bunyan (fastest JSON-native, pino-http req.id, redact) · zod vs joi/yup/ajv (z.infer, .strict()↔additionalProperties:false, zod-to-openapi) · Pact vs OpenAPI-only (consumer-driven) · piscina vs worker_threads raw/Bottleneck (worker-pool для CPU off-event-loop) · husky+lint-staged+commitlint vs simple-git-hooks (npm-native, lint-staged staged-only, custom plugin для тега вклада).

**[fix-4] agents/performance.md — event-loop gate + P5 sizing:**
- P4: event-loop lag SLO p99≤50ms через `perf_hooks.monitorEventLoopDelay()` (programmatic, `scripts/event-loop-check.mjs` под k6) — НЕ `clinic doctor` (это интерактивный profiling, не assertion-ready CI-gate; clinic doctor — локальная диагностика).
- P5 Sizing (новый раздел): postgres-js pool max / undici Agent connections/pipelining / cockatiel Bulkhead maxConcurrent / p-limit concurrency / piscina maxThreads / k6 RPS — все из `thresholds.yaml performance`, не хардкод. Таблица с примерами.
- Gates: event-loop-gate (node scripts/event-loop-check.mjs), sizing-gate (grep хардкод размеров вне thresholds → fail). 7 gate'ов.
- DoD: sizing из thresholds, event-loop lag p99≤50ms через perf_hooks.

**[fix-5] skills/tests.md + agents/test-matrix.md — toxiproxy vs MockAgent разделение + Stryker incremental + test-scaling:**
- tests.md шаг 4: toxiproxy → network-level (timeout, ECONNRESET, latency, TCP-reset); undici MockAgent/nock → HTTP-level (5xx, 429, malformed body, duplicate-key через 409); duplicate-key на БД → testcontainers-Postgres + 2 параллельных connection (реальная UNIQUE-violation 23505). Сценарии в РАЗНЫХ it/describe, не смешивать (двойной перехват: MockAgent перехватит раньше toxiproxy).
- tests.md шаг 8: `npx stryker run --mutate src/<feature>/**/*.ts --since main` (incremental — изменённая область, полный прогон 5–30 мин непрактично на каждый PR). Nightly/staging — полный `stryker run` (неблокирующий в PR, блокирующий в nightly).
- tests.md шаг 10 (test-scaling): vitest.config.ts pool/poolOptions.threads.maxThreads; testcontainers lifecycle в globalSetup/globalTeardown (один Postgres на прогон); test isolation через transaction-rollback; --repeat-times 3 точечно для flaky-подозрительных.
- test-matrix.md T1: integration сбои РАЗДЕЛЕНЫ (toxiproxy network / MockAgent HTTP / testcontainers dup-key 23505); НЕ смешивать.
- test-matrix.md T2: Stryker `--since main` incremental для PR; полный — nightly.
- test-matrix.md Gates: integration-fault-gate с раздельными сценариями (смешивание → fail); test-scaling-gate (pool/maxThreads, globalSetup, --repeat-times точечно). 8 gate'ов.

**[fix-6] Makefile — bootstrap + gate-event-loop + gate-sizing + gate-mutation incremental + migration-roundtrip:**
- bootstrap target: создаёт package.json (если нет) + копирует templates/vitest.config.ts, templates/drizzle.config.ts, templates/stryker.config.json, templates/commitlint.config.mjs, templates/scripts/ — чтобы gate-* были исполняемы без устных договорённостей.
- gate-mutation: `npx stryker run --since main` (incremental) — комментарий «nightly: full stryker run».
- gate-migration: `npm run db:migrate:test-up-down-up` (scripts/migration-roundtrip.mjs: up → down (требует *.down.sql) → up → pg_dump hash).
- gate-event-loop: `node scripts/event-loop-check.mjs` (perf_hooks.monitorEventLoopDelay p99≤50ms под k6).
- gate-sizing: grep хардкод размеров в src/ → fail.
- eval-feature/eval-standard/eval-database/eval-resilience/eval-performance/eval-review — добавлены gate-event-loop/gate-sizing.

**[fix-7] agents/vcs.md — commitlint custom plugin:**
- Правило 2: тег вклада `[agent|assisted|manual]` через кастомный plugin (`commitlint-plugin-function-rules` или local `commitlint-plugin-contribution-tag`) с `header-pattern: /^\[(agent|assisted|manual)\] (feat|fix|hotfix|refactor|perf|test|docs|build|ci|chore)(\(.+\))?: .{1,72}$/` → error. Стандартный `@commitlint/config-conventional` НЕ покрывает prefix-тег. Конфиг в `commitlint.config.mjs` (из `make bootstrap`).

**[fix-8] skills/feature.md — service слой sizing + cockatiel wrap order:**
- Шаг 4: cockatiel wrap order (outer Timeout = total deadline → Retry(exponentialBackoff{jitter:true}) → CB → Bulkhead innermost); Retry оборачивает CB; retry на 40001/40P01 оборачивает db.transaction (не внутри); Sizing (pg pool/undici Agent/Bulkhead/p-limit/piscina/k6) из thresholds.yaml performance, не хардкод (ссылка agents/performance.md P5).
- Шаг 3 persistence: drizzle-kit generate = forward-only + вручную down.sql; npm run db:migrate:test-up-down-up.

### Полный инвариантный набор (не изменился — для полноты суда)
- 6 skills: все 10 секций контракта (назначение/когда · входы/выходы · non-negotiables · workflow(domain→db→service→api→tests→docs; persistence N/A) · stack binding без плейсхолдеров · quality gates реальные · bad/good ❌/✅ · DoD · stop/escalation S1–S6 · audit trail).
- 5 rules: одна тема каждый (resilience/contracts/test-matrix/performance/vcs) 76–124 строки; 80–250 диапазон соблюдён (кроме contracts 76 — минимально, но одна тема).
- Stack: Node 24, npm, TS strict, Vitest+coverage-v8, fast-check, Stryker, Drizzle+postgres-js+drizzle-kit, @testcontainers/postgresql, cockatiel (Timeout/Retry/CircuitBreaker/Bulkhead, wrap order зафиксирован), undici (Agent headersTimeout/bodyTimeout/connections), pino+pino-http, zod (.strict()↔additionalProperties:false, zod-to-openapi), @redocly/cli, oasdiff, husky+lint-staged+commitlint (custom plugin для тега вклада), eslint+typescript-eslint+eslint-plugin-security/promise/import, prettier, gitleaks, Semgrep, k6, toxiproxy+toxiproxy-client (network-level), prom-client, piscina, perf_hooks.monitorEventLoopDelay (event-loop gate), Pact.
- Паритет: resilience.md инварианты ↔ feature.md шаг 4 ↔ database.md шаг 9 ↔ review.md блок 2 — cockatiel wrap order, exponentialBackoff{jitter:true}, Retry-wraps-CB, total deadline, idempotency-key+onConflictDoNothing согласованы. test-matrix.md ↔ tests.md ↔ feature.md gates — Stryker --since main, toxiproxy/MockAgent разделение, flakiness --repeat-times 3. vcs.md ↔ contracts.md C1 ↔ feature.md workflow — спека раньше кода, commitlint custom plugin.
- Плейсхолдеров `<ВАШ_СТЕК>`/`<ТЕСТ_РАННЕР>`/`<ORM>`/`<...>` НЕТ. Учебных леса «Глоссарий»/«Форма правила»/«Что ломается»/`GATE:` НЕТ. Длины: skills 123–223, agents 76–124, Makefile 186.
