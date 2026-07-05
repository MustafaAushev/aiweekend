## artifact-summary (компактная сводка 12 файлов для суда R1)

### skills/feature.md
- 10 секций контракта: назначение/когда · входы/выходы · non-negotiables · workflow(domain→db→service→api→tests→docs; persistence N/A если БД нет) · stack binding · quality gates(10 реальных команд) · bad/good ❌/✅ · DoD · stop/escalation(S1–S6) · audit trail.
- Stack: Node 24, npm, TS strict, Drizzle+postgres-js, cockatiel(Timeout/Retry/CircuitBreaker/Bulkhead), undici, pino, zod, Vitest, Stryker, k6, toxiproxy, gitleaks, Semgrep.
- Workflow 9 шагов: preflight → spec(domain) → domain → db(migration) → service(cockatiel pipe) → api(zod+authz+pino corrId) → tests(3 типа+property+mutation) → docs(ADR) → eval → PR.
- Gates: format/prettier+eslint, type/tsc strict, test/vitest+coverage-v8 hot-path≥80%, mutation/stryker≥0.80, contract/redocly+contract:diff, resilience/toxiproxy, performance/k6 p99<hot_p99_ms.prod, security/gitleaks+semgrep, flakiness/--repeat-times 3, budget.

### skills/tests.md
- workflow: edge-cases ДО кода → unit(чистый домен, it.each) → property(fast-check numRuns 1000) → integration(testcontainers Postgres + undici MockAgent + toxiproxy инъекция timeout/5xx/429/dup-key) → e2e(app на эфемерном порту) → failing-first → реализация → mutation/stryker → flakiness/--repeat-times 3 → PR.
- fake vs mock: fake(in-memory интерфейс репо) для unit; mock(undici MockAgent) для HTTP; БД — реальная через testcontainers, мок Drizzle ЗАПРЕЩЁН.
- Naming: *.spec.ts; describe=единица, it=поведение; table-driven it.each.
- Gates 6: test-gate coverage hot-path≥80%; mutation≥0.80; flakiness≥1-flaky_max_rate; forbidden-pattern-gate(eslint на expect(true)/it.skip/expect.any); integration-fault-gate(timeout/5xx/429/dup-key).
- bad/good: ❌ vi.mock БД + expect.any + it.skip; ✅ testcontainers + it.each + fast-check + toxiproxy.

### skills/review.md
- линза дельты git diff main...HEAD (не всего репо).
- 7 блоков: контракты(zod vs OpenAPI responseSchema, additionalProperties:false) · resilience(cockatiel обёртка, idempotency) · hot-path(N+1/nested-await/offset) · security(gitleaks/semgrep/zod/authz/parameterized) · конкурентность(eslint-plugin-promise no-floating-promises, p-limit) · тесты(3 типа+property+mutation≥0.80, failing-first) · observability(pino структурно, corrId, redact).
- Вердикт PASS/NEEDS WORK/RED FLAG + file:line правки.
- Gates 7: contract/resilience-grep/perf-grep/security/test/observability-grep/vcs.
- bad: «вроде ок» без file:line; good: конкретные file:line правки.

### skills/bugfix.md
- цикл incident→rule→regression-eval: воспроизвести(failing test) → repro коммит `repro: INC-NNN` → корневая аксиома → правило в agents/*.md(grep-проверяемо) → фикс по слоям → regression-eval(property/fault/mutation) → полный прогон → audit.
- regression-eval: НЕ проходит на баговом коде, проходит на фиксе; для resilience — fault-injection(toxiproxy), для инварианта — property(fast-check), для логики — mutation(Stryker).
- fix-loop лимит ≤3 hotfix / ≤5 общий.
- Gates 7: repro-gate(stash-фикс → тест красный) · rule-gate(grep) · regression-gate · full-suite · mutation · contract · incident-log.
- bad: уменьшили retry_max вместо idempotency; good: repro + Idempotency-Key + onConflictDoNothing + property.

### skills/standard.md
- reference-grade: таблица запретов Z1–Z10(any, словарь в возврате, catch{}, log-интерполяция, хардкод секрета, sql.raw, offset, N+1 nested-await, --no-verify, коммит в main) с проверкой.
- матрица импортов слоёв: domain←zod only; db←domain+config/logger; services←domain+db+config; api←domain+services+config (api НЕ ходит в db). eslint no-restricted-imports per-layer.
- §1–§9: typing(tsc strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes) · DTO(zod .strict() vs OpenAPI) · ошибки(DomainError иерархия, cause wrap) · слои · async(bounded concurrency p-limit/Bulkhead, no-floating-promises, HTTP/LLM вне транзакции) · логи(pino redact, corrId) · конфиг(zod EnvSchema.parse fail-fast, .env.example) · зависимости(npm ci, lock integrity, npm audit --audit-level=high) · VCS+доки(TSDoc, README секции, ADR).
- Gates 9: format/type/layer/error/logging/config/deps/docs/vcs.
- Чеклист самопроверки + DoD + Stop S1–S5 + Audit.

### skills/database.md
- workflow 12 шагов: preflight → schema(diff в drizzle/schema) → migration(drizzle-kit generate up+down, up→down→up на testcontainers, expand-contract) → failing test(testcontainers, НЕ мок Drizzle) → parameterized запросы → N+1→batch(inArray/leftJoin + Map) → keyset(gt(key,cursor).orderBy.limit) → транзакции(db.transaction isolationLevel, оптимистичная version/пессимистичная for('update'), НЕТ HTTP/LLM внутри) → идемпотентность(onConflictDoNothing target idempotencyKey UNIQUE) → пул(postgres max, statement_timeout) → большие объёмы(стриминг/батчи) → безопасность(least-privilege, DATABASE_URL из config) → observability(тег /* corrId */, slow-query log, prom-client).
- Stack: PostgreSQL 15+, Drizzle, postgres-js, drizzle-kit, cockatiel Retry(wait_random_exponential на 40001/40P01), @testcontainers/postgresql, EXPLAIN(ANALYZE,BUFFERS).
- Gates 9: migration(up→down→up байт-в-байт) · constraint(UNIQUE/FK/CHECK нарушение) · plan(EXPLAIN не Seq Scan) · nplus1(счётчик SQL константен) · concurrency(две транзакции, оптимистика+retry) · idempotency(один key→одна запись) · security(sql.raw grep, fuzz) · load(pgbench/k6 p99) · budget.
- bad: N+1 цикл, offset 900000, sql.raw, миграция без down, charge без idempotency; good: inArray+Map, keyset, sql`...${url}`, onConflictDoNothing.

### agents/resilience.md
- 5 инвариантов: timeout · retry(wait_random_exponential, ≤retry_max, только сеть/5xx/429) · idempotency(Idempotency-Key+onConflictDoNothing) · circuit breaker(cockatiel) · backpressure(Bulkhead+p-limit, 503 Retry-After).
- isTransient(err): UND_ERR_SOCKET/ECONNRESET/ECONNREFUSED/ETIMEDOUT, 5xx, 429 → true; 4xx(кроме 429) → false.
- Пороги из thresholds.yaml (timeout_ms, retry_max, cb_fail_ratio, open_s), per-env {default,prod}.
- Gates 6: timeout(toxiproxy 10s) · retry(down 1s, интервалы+jitter) · idempotency(2× один key→1 запись) · circuit breaker(OPEN fast 503) · backpressure(burst×10→503) · static-grep(cockatiel обёртка).
- bad: retry без idempotency/timeout/jitter, ретраит 4xx; good: cockatiel wrap(CB,Retry,Bulkhead,Timeout) + Idempotency-Key + onConflictDoNothing.
- Stop S1–S5. Одна тема (resilience), vcs/perf — ссылки на соседей.

### agents/contracts.md
- C1: каждый эндпоинт = OpenAPI 3.1 + zod-схема; zod-to-openapi (@asteasolutions/zod-to-openapi) синхрон; изменение — diff спеки отдельным коммитом раньше кода.
- C2: инварианты(idempotency/retry/timeout/SLO/max_payload) в спеке + thresholds.yaml, не в коде.
- C3: zod-парсинг входа(fail-fast 400 со схемой) + выход LLM structured output под JSON Schema; ResponseSchema.parse(out) перед res.json.
- C4: consumer-driven Pact (@pact-foundation/pact) для межсервисных.
- Gates 5: contract-diff(redocly lint + zod→OpenAPI regen diff) · schema-validation(вне схемы→400) · rename-gate(additionalProperties:false ловит userId) · pact-gate · backward-compat(oasdiff breaking vs main).
- bad: рефактор user_id→userId, unit зелёный; good: zod .strict() + required ловит рассинхрон.
- Stop S1–S5. Одна тема (контракты).

### agents/test-matrix.md
- T1: каждый PR — ≥1 unit + ≥1 integration(инъекция сбоя) + ≥1 e2e-smoke; Vitest; testcontainers Postgres; undici MockAgent + toxiproxy.
- T2: Stryker mutation ≥ quality.mutation_score (0.80); выжившие мутанты = дыры → чинить тест, не ослаблять порог.
- T3: fast-check property на инвариант; numRuns≥1000 для критичных.
- Non-negotiables: vi.mock Drizzle запрещён; expect(true)/it.skip/expect.any без схемы запрещены; существующие тесты immutable (fix_loop.yaml create_new_ok__modify_existing_forbidden).
- Gates 7: type-coverage / mutation / property / forbidden-pattern(eslint) / flakiness(–repeat-times 3) / integration-fault / immutability(git diff не трогает tests/** существующие).
- bad: vi.mock БД + expect.any + skip; good: testcontainers + property numRuns 1000.

### agents/performance.md
- P1: горячий путь без суперлинейной сложности; N+1 запрещён; Map/Set O(1) lookup; Drizzle inArray/leftJoin.
- P2: бюджеты p50/p99/max_payload/max_batch/max_sql_per_req в thresholds.yaml + openapi.yaml x-slo.
- P3: LLM не в синхронном цикле; batch + кэш по sha1(prompt); max_tokens; cost-метрика prom-client llm_cost_usd.
- P4: Node single-threaded — *Sync crypto/fs, большой JSON.parse(>1MB→stream-json) на hot-path запрещены; CPU-тяжёлое в piscina worker_threads; event-loop lag p99≤50ms (clinic doctor).
- Gates 6: p99(k6 p(99)<hot_p99_ms.prod) · asymptote(показатель степени роста p99 ≤asymptote_slope_max 1.3; НЕ абсолютный ratio) · nplus1(счётчик SQL≤max_sql_per_req) · llm-cost(≤cost_budget_usd) · event-loop(clinic doctor lag p99≤50ms, eslint no-sync) · static-grep(offset на растущей → fail).
- bad: N+1 цикл, SELECT *+filter в коде, offset 900000, LLM в for без cache, pbkdf2Sync; good: inArray+Map, keyset, batch+cache mget/mset, piscina pool.run.
- Stop S1–S5. Одна тема (performance).

### agents/vcs.md
- 7 правил: ветка <type>/<TICKET>-<slug> · Conventional+[agent|assisted|manual] тег(commitlint) · атомарность(спека раньше кода) · PR-дисциплина(≤vcs.pr_max_lines, шаблон Зачем/Что/Как проверить/Чеклист, ≥1 аппрув, не self-merge, squash-merge) · хуки не обходить(husky pre-commit lint-staged+tsc, pre-push vitest; --no-verify/SKIP_HUSKY запрещены) · lock при зависимостях(npm install --package-lock-only, integrity) · история неприкосновенна(no force-push main).
- PR-шаблон включён.
- Gates 7: commit-msg-gate(регекс) · branch-gate(≠main, first-parent) · pr-size-gate(≤порога) · lock-consistency(npm ci --dry-run, integrity) · hooks-gate · atomicity-gate(спека коммит раньше src/) · history-gate(no force main).
- bad: commit в main, "fixed qr", --no-verify, force main, package.json без lock; good: ветка, [agent] fix(scope): spec — INC-123 ... (спека первой), [agent] fix(scope): INC-123 — ..., npm install --package-lock-only, squash-merge.
- Stop S1–S6. Одна тема (vcs).

### Makefile
- targets: install(npm ci), clean, gate-* (format/type/lint/test/coverage/mutation/contract/resilience/performance/security/flakiness/vcs/layer/error/logging/config/deps/docs/nplus1/migration/constraint/plan/concurrency/idempotency/load/budget).
- eval-* составные: eval-feature, eval-tests, eval-review, eval-bugfix, eval-standard, eval-database, eval-resilience, eval-contracts, eval-test-matrix, eval-performance, eval-vcs, eval-all.
- Пороги читаются из harness/thresholds.yaml (через node scripts/*).
- Реальные команды: npx prettier --check, npx eslint . --max-warnings=0, npx tsc --noEmit, npx vitest run [--coverage|--repeat-times 3], npx stryker run, npx redocly lint openapi.yaml, npm run contract:diff, gitleaks detect, npx semgrep --config p/typescript --config p/security-audit --error, npx commitlint --from main, npm ci --dry-run, npm audit --audit-level=high.
- scripts/*: vcs-size-check.mjs, config-smoke.mjs, docs-check.mjs, repro-check.mjs, rule-grep-check.mjs, test-type-presence.mjs, test-immutability.mjs, eval-budget-check.mjs (заглушки — оркестрация, бизнес-логика в package.json scripts).
