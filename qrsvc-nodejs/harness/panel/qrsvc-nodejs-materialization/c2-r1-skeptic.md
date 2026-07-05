# R1 cycle-2 verdict — Скептик

- роль: Скептик
- модель: z-ai/glm-5.2
- дата: 2026-07-05
- раунд: R1 cycle-2 (challenge, изолированный)
- назначение: детерминированная перестановка (day=5, cycle=2, shift 1) → z-ai/glm-5.2

---

<КОРРЕКТНОСТЬ>: FAIL — `exponentialBackoff({baseDelay:100, maxDelay:5000, jitter:true})` — неверный API cockatiel 4.x. Параметра `jitter` нет в типе `exponentialBackoff`; jitter — отдельная composable-обёртка: `fullJitter(exponentialBackoff({baseDelay, maxDelay}))` (импорт `fullJitter` из `cockatiel`). TS strict отвергнет `jitter` как unknown property. Встречается в agents/resilience.md, skills/feature.md, skills/resilience.md (паритетно — одинаково неверно везде). Остальные утверждения верны: wrap order (Retry→CB), Retry-wraps-db.transaction для 40001/40P01, Drizzle 0.36+ isolationLevel, drizzle-kit forward-only, zod .strict()↔additionalProperties:false, perf_hooks.monitorEventLoopDelay, commitlint custom plugin — корректны.
<ПОЛНОТА>: PASS — 10 секций контракта во всех 6 skills, workflow domain→db→service→api→tests→docs, persistence N/A, stack binding без `<...>`, gates реальные, bad/good, DoD, stop/escalation, audit trail. 5 rules по одной теме 76–124 строк.
<РЕАЛИЗУЕМОСТЬ>: PASS — `make bootstrap` создаёт package.json + копирует templates (vitest.config.ts, drizzle.config.ts, stryker.config.json, commitlint.config.mjs, scripts/), gate-* исполняемы, migration-roundtrip.mjs с up→down→up конкретен, event-loop-check.mjs через perf_hooks programmatic.
<РИСКИ>: PASS — fix-1..8 закрывают cycle-1 RED FLAG. Остающиеся риски на уровне имплементации, не дизайна: (a) total deadline `retry_max × timeout_ms + jitter margin` — апроксимация, реальное время зависит от фактических delay; AbortController+Date.now() как альтернатива указан; (b) pg_dump --schema-only hash в migration-roundtrip может быть недетерминированным (имена constraint/sequence ownership) — нужна нормализация `--no-owner --no-acl` или канонизация; (c) zod 4.x + @asteasolutions/zod-to-openapi — пакет под zod 3.x; zod 4.x breaking changes; (d) retry-wrapping-db.transaction требует идемпотентности non-DB side-effects (fix упоминает idempotency-key+onConflictDoNothing для DB, но queue/event side-effects не покрыты).
<АЛЬТЕРНАТИВЫ>: PASS — §10 standard.md: cockatiel vs opossum, Drizzle vs Prisma/Kysely/pg, Vitest vs node:test/jest, fast-check vs faker, Stryker vs mutode, undici vs node:fetch/axios/got, pino vs winston/bunyan, zod vs joi/yup/ajv, Pact vs OpenAPI-only, piscina vs worker_threads raw/Bottleneck, husky+lint-staged vs simple-git-hooks — обоснования конкретные.
<СООТВЕТСТВИЕ-КОНТЕКСТУ>: PASS — Node 24 LTS, ESM (.mjs scripts, vitest.config.ts), npm-native (npx, npm run), perf_hooks Node-native, undici bundled, piscina worker_threads — идиоматично для Node.js runtime.
<ПАРИТЕТ>: PASS — cockatiel wrap order / exponentialBackoff / Retry-wraps-CB / total deadline согласованы в resilience.md ↔ feature.md ↔ database.md ↔ review.md; Stryker --since main / toxiproxy-MockAgent разделение в test-matrix.md ↔ tests.md ↔ feature.md; commitlint в vcs.md ↔ contracts.md. Ошибка jitter паритетна (одинакова везде).

ОБЩИЙ ВЕРДИКТ: NEEDS WORK

СПИСОК ПРАВОК:
1. agents/resilience.md + skills/resilience.md + skills/feature.md (§good-пример, шаг 4) — заменить `exponentialBackoff({baseDelay:100, maxDelay:5000, jitter:true})` → `fullJitter(exponentialBackoff({baseDelay:100, maxDelay:5000}))`; добавить `import { fullJitter, exponentialBackoff } from 'cockatiel'`. TS strict не примет `jitter` в типе exponentialBackoff.
2. agents/resilience.md + skills/feature.md — уточнить: total deadline через AbortController+Date.now() предпочтительнее cockatiel Timeout (Timeout per-execution cancel ≠ hard wall-clock deadline для всей retry-цепочки); указать явно worst-case расчёт.
3. skills/tests.md / scripts/migration-roundtrip.mjs — pg_dump сравнение добавить флаги `--no-owner --no-acl --no-comments` или канонизировать diff; иначе hash может меняться между up→down→up из-за auto-generated constraint names.
4. skills/standard.md §10 / agents/contracts.md — зафиксировать zod 3.x (не 4.x) ИЛИ указать совместимую версию @asteasolutions/zod-to-openapi для zod 4.x; .strict() в zod 4.x переименован в `z.strictObject()` / `z.looseObject()` — если 4.x, обновить API.
