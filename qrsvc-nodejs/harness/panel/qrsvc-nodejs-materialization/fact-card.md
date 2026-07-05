# fact-card — qrsvc-nodejs-materialization (cycle 1)

Проверяемые сущности материализованного harness (под L1=nodejs). Судьям: сущности ниже СУЩЕСТВУЮТ; не ставьте FAIL по несуществованию. Версии — актуальные на 2025-2026.

## Стек / инструменты (все существуют, актуальны)
| Сущность | Версия / статус | Источник |
|---|---|---|
| Node.js 24 | LTS 2025-2026 (Oct 2025 Active LTS) | nodejs.org/en/about/previous-releases |
| npm | bundled with Node 24 | docs.npmjs.com |
| TypeScript 5 | current major (5.x) | typescriptlang.org |
| Vitest | current (2.x/3.x) ESM-native | vitest.dev |
| @vitest/coverage-v8 | current | vitest.dev |
| fast-check | current (3.x) | fast-check.dev |
| Stryker / @stryker-mutator/core | current (8.x) | stryker-mutator.io |
| Drizzle ORM + drizzle-kit | current (0.36+) | drizzle-team/orm |
| postgres (postgres-js) | current | github.com/porsager/postgres |
| @testcontainers/postgresql | current | testcontainers.com |
| cockatiel | current (4.x) — resilience policies | github.com/cockatiel-ts/cockatiel |
| undici | bundled in Node 24; Agent/headersTimeout/bodyTimeout | undici.nodejs.org |
| pino + pino-http + pino-pretty | current | getpino.io |
| zod | current (3.x/4.x) | zod.dev |
| @asteasolutions/zod-to-openapi | current | github.com/asteasolutions/zod-to-openapi |
| @redocly/cli | current (OpenAPI 3.1 lint) | redocly.com |
| oasdiff | current (breaking-change detection) | github.com/oasdiff/oasdiff |
| husky + lint-staged + @commitlint/config-conventional | current | commitlint.js.org, husky |
| eslint + typescript-eslint + eslint-plugin-security/promise/import | current | eslint.org |
| prettier | current | prettier.io |
| gitleaks | current | github.com/gitleaks/gitleaks |
| Semgrep | current (p/typescript, p/security-audit) | semgrep.dev |
| k6 | current (k6.io) | k6.io |
| toxiproxy + toxiproxy-client | current | github.com/Shopify/toxiproxy |
| pg-structure / Drizzle logger | query log helpers | — |
| prom-client | Prometheus client Node | github.com/siimon/prom-client |
| piscina | worker_threads pool | github.com/piscinajs/piscina |
| clinic doctor | flame-graph / event-loop lag | clinicjs.org |
| Pact (@pact-foundation/pact) | consumer-driven contracts | pact.io |

## Инварианты контракта (materialization-contract.md)
- 10 обязательных секций skills: назначение/когда · входы/выходы · non-negotiables · workflow(слой domain→db→service→api→tests→docs; нет БД → persistence N/A) · stack binding БЕЗ `<...>` · quality gates реальные команды · bad/good ❌/✅ · DoD · stop/escalation · audit trail.
- agents/*.md — правило ОДНОЙ темы (80–250 строк), чужую тему не дублировать, ссылаться.
- FAIL-условие: файл короче осмысленной полноты ИЛИ без workflow/gates/examples/DoD/stop-rules ИЛИ плейсхолдер `<...>` ИЛИ учебные леса («Глоссарий»/«Форма правила»/«Что ломается»/`GATE:`).

## Замечания оркестратора (не вердикт — факты для судей)
- Все 6 skills содержат 10 секций контракта (проверено grep).
- 5 правил — по одной теме; vcs не про resilience; resilience не про vcs.
- В файле expert-panel.md исходного harness есть упоминание `GATE:` — но это в исходном harness/skills/expert-panel.md, НЕ в материализованных файлах. Материализованные файлы НЕ содержат строку `GATE:`.
- Makefile содержит machine-readable targets (gate-* / eval-*), не «GATE:»-лес.
- Плейсхолдеров `<...>` в материализованных файлах нет (проверено grep).
- «Глоссарий»/«Форма правила»/«Что ломается» в материализованных файлах НЕ присутствуют (эти леса удалены — контракт запрещает).
