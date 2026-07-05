# R1 verdict — Реалист

- роль: Реалист
- модель: z-ai/glm-5.2
- дата: 2026-07-05
- раунд: R1 (challenge, изолированный)
- назначение: детерминированная перестановка (day=5, cycle=1) → z-ai/glm-5.2

---

1. Корректность: VERDICT=PASS — Drizzle API (onConflictDoNothing, inArray, db.transaction isolationLevel, for('update'), keyset gt().orderBy().limit()) верны; postgres-js + drizzle-kit generate up/down корректен для 0.36+; cockatiel Timeout/Retry/CircuitBreaker/Bulkhead реальные политики; 40001/40P01 — правильные коды Postgres для serialization_failure/deadlock_detected; zod .strict() ↔ additionalProperties:false синхрон через @asteasolutions/zod-to-openapi корректен; undici MockAgent + headersTimeout/bodyTimeout реальны в Node 24. Единственная неточность: `wait_random_exponential` — не нативное имя cockatiel API (cockatiel использует exponentialBackoff + custom jitter функцию в delay); агент может реализовать эквивалент, но терминология из tenacity/python, не из cockatiel — не блокирующе.

2. Полнота: VERDICT=PASS — все 10 секций контракта в 6 skills (проверено grep по fact-card); 5 правил по одной теме; workflow domain→db→service→api→tests→docs с persistence N/A fallback; stack binding без плейсхолдеров; gates реальные команды; bad/good ❌/✅; DoD; stop/escalation S1–S6; audit trail. Нет `<...>`, нет «Глоссарий»/«Форма правила»/«Что ломается», нет строки `GATE:`.

3. Реализуемость: VERDICT=INCONCLUSIVE — Makefile targets вызывают реальные CLI (npx prettier/eslint/tsc/vitest/stryker/redocly/semgrep/gitleaks/commitlint), но scripts/*.mjs описаны как «заглушки — оркестрация», а package.json scripts НЕ входят в артефакт — агент должен их реконструировать из Makefile. toxiproxy в CI реален (toxiproxy-client + service-container или testcontainers), k6 реален через GitHub Action, НО Stryker mutation на каждый PR — 5–30 мин для нетривиального кода, clinic doctor не предназначен для автоматического CI-gate (это интерактивный profiling инструмент, не assertion-раннер). Агент выполнит задачу по skill-файлу, но eval-* цели потребуют доопределения package.json + scripts/*.mjs.

4. Риски: VERDICT=FAIL — (a) Stryker на каждый PR = непрактично по времени для кодовой базы >2000 LOC; нужен incremental mutation (--since main) или nightly gate; (b) toxiproxy + undici MockAgent одновременно — двойной перехват HTTP, MockAgent перехватит до toxiproxy, fault-injection не сработает; нужно разделять сценарии; (c) clinic doctor event-loop lag p99≤50ms — clinic doctor не выдаёт assertion-ready JSON с p99, это человекочитаемый отчёт; нужен custom event-loop-monitor (perf_hooks.monitorEventLoopDelay) или --on-address в скрипте; (d) testcontainers в CI требует Docker-in-Docker/privileged runner — не везде доступно; (e) fast-check numRuns 1000 × несколько property-тестов в одном PR pipeline = кумулятивное время.

5. Альтернативы: VERDICT=FAIL — ни в одном из 12 файлов нет обоснования выбора cockatiel vs opossum, Drizzle vs Prisma, Vitest vs node:test, Pact vs spring-cloud-contract. Стек зафиксирован декларативно без ADR-уровневого rationale. Для reference-grade harness ожидается хотя бы §«Почему этот стек» в standard.md или отдельный ADR.

6. Соответствие контексту: VERDICT=PASS — Node.js-идиомы соблюдены: async-first (no-floating-promises, p-limit bounded concurrency), worker_threads через piscina для CPU-тяжёлого, event-loop lag осознан, ESM-native (Vitest, undici bundled), npm ci + package-lock integrity, no-restricted-imports per-layer, noUncheckedIndexedAccess + exactOptionalPropertyTypes — Node 24 + TS 5 strict корректны. *Sync запрет на hot-path осмыслен. zod EnvSchema.parse fail-fast — идиоматично.

7. Паритет: VERDICT=PASS — resilience.md (Timeout/Retry/CB/Bulkhead + Idempotency-Key) ↔ feature.md шаг 4 (cockatiel pipe) ↔ database.md шаг 9 (onConflictDoNothing + idempotencyKey UNIQUE) ↔ review.md блок 2 (cockatiel обёртка, idempotency) — инварианты наблюдаемо одинаковы во всех файлах. test-matrix.md (mutation≥0.80, property numRuns 1000, forbidden patterns) ↔ tests.md gates ↔ feature.md quality gates — консистентно. vcs.md (atomicity spec-before-code) ↔ contracts.md C1 (diff спеки раньше кода) ↔ feature.md workflow (spec → domain → ... → docs) — паритет соблюдён.

ОБЩИЙ ВЕРДИКТ: NEEDS WORK

СПИСОК ПРАВОК:
1. agents/resilience.md: заменить `wait_random_exponential` на cockatiel-нативную конструкцию: `retry(handleAll, { maxAttempts: retry_max, delay: exponentialBackoff({ baseDelay, maxDelay, jitter: true }) })` или сослаться на cockatiel API явно.
2. agents/performance.md / Makefile: gate event-loop — заменить clinic doctor на programmatic gate через `perf_hooks.monitorEventLoopDelay()` + p99 assertion, либо `clinic doctor --on-address` + JSON-парсинг; clinic doctor оставить для локальной диагностики, не для CI gate.
3. Makefile / skills/tests.md: Stryker gate — добавить `--since main` (incremental mutation) или вынести gate-mutation в nightly/staging, из eval-feature оставить `--check` режим; в test-matrix.md указать что mutation gate может быть неблокирующим в PR и блокирующим в nightly.
4. skills/tests.md / agents/test-matrix.md: раздельно описать когда toxiproxy (real HTTP fault injection) и когда undici MockAgent (unit-level HTTP mock) — не одновременно; integration-fault-gate должен использовать toxiproxy на реальном HTTP-вызове, а не MockAgent, иначе инъекция не достигнет цели.
5. skills/standard.md: добавить §«Обоснование стека» или ADR-001 — 1 абзац: cockatiel vs opossum (TypeScript-native, policy-composable, нет external deps), Drizzle vs Prisma (SQL-control, no runtime ORM overhead, drizzle-kit generate), Vitest vs node:test (coverage-v8 native, ESM-first, fast-check integration).
6. Makefile: добавить комментарий или target `gate-event-loop` с конкретной командой (node scripts/event-loop-check.mjs), где скрипт использует perf_hooks и k6; сейчас gate перечислен но реализация clinic doctor в CI не assertion-ready.
7. skills/database.md / agents/resilience.md: уточнить что retry на 40001/40P01 должен быть внутри db.transaction с retry-обёрткой (cockatiel wrap вокруг transaction, не внутри), иначе partial-write при deadlock; добавить пример кода.
