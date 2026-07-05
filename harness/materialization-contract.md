# Materialization Contract — обязательная форма каждого материализованного файла

> Единый источник требований к материализации. Совет генерит harness под язык НЕ как краткий пересказ, а как **project-grade** артефакт уровня эталона. Правишь требования здесь — меняются для всех файлов сразу. На этот файл ссылаются §11.1 и §16.

## Золотой якорь

Каждый материализованный `skills/*.md` и `agents/*.md` обязан быть **project operating system**, а не тонкий конспект: по нему другой агент выполнит задачу **без устных пояснений**.

## Обязательные секции (каждый skill)

Материализованный skill НЕ ПРИНЯТ, если в нём нет всех секций:

1. **Назначение и когда применять** — что делает скил, по какому триггеру.
2. **Входы/выходы** — какие файлы читать (`agents/*.md`, `thresholds.yaml`, спека/OpenAPI) и какие артефакты создать (код по слоям, тесты, миграции, PR, verdict/eval-log).
3. **Non-negotiables** — что агенту ЗАПРЕЩЕНО нарушать (ссылки на `agents/*.md` и стандарт по §).
4. **Workflow** — пошагово от спеки до PR по слоям: `domain → persistence/db → service → api → tests → docs`. Нет БД в стеке → persistence помечается **N/A с объяснением**.
5. **Stack binding** — конкретные инструменты языка вместо плейсхолдеров. После материализации НЕ должно остаться `<ВАШ_СТЕК>`, `<ТЕСТ_РАННЕР>`, `<ORM>` и любых `<...>`.
6. **Quality gates** — реальные команды: lint, format, typecheck, tests, coverage, mutation, security, observability. Каждое правило по возможности машинно-проверяемо.
7. **Bad/good примеры** — ❌ плохо / ✅ хорошо в блоке кода (обязательно для файлов про код/тесты/review).
8. **Definition of Done** — чеклист.
9. **Stop / escalation rules** — когда агент ОСТАНАВЛИВАЕТСЯ и зовёт человека: неоднозначность спеки → варианты+trade-offs; падение существующих тестов → стоп+дифф, тесты сам не правит; исчерпан лимит fix-loop; попытка тронуть protected/immutable-путь.
10. **Audit trail** — что записать в PR / `panel/<slug>/verdict.md` / eval-log: версия спеки, промпт, seed, результаты eval, тег вклада `[agent|assisted|manual]`.

## Skills vs Rules — разная дисциплина (важно!)

- **`skills/*.md`** (feature, tests, review, bugfix, standard, database) — **playbook**: полный workflow спека→PR, все секции контракта, богато.
- **`agents/*.md`** (resilience, contracts, test-matrix, performance, vcs) — **ПРАВИЛО ОДНОЙ ТЕМЫ**: только свой инвариант + его non-negotiables/gates/bad-good/stop-rules. НЕ дублируй темы других правил (`vcs.md` не про resilience/perf/security; `resilience.md` не про VCS) — ССЫЛАЙСЯ на соседний файл, не копируй. Цель 80–250 строк; чужая тема (scope creep) = FAIL.

## FAIL-условие (проверяет сам совет на суде)

Материализация файла проваливает суд (FAIL) и переделывается, если файл: короче осмысленной полноты ИЛИ не содержит workflow / quality gates / bad-good examples / DoD / stop-rules; содержит хоть один плейсхолдер `<...>`; пересказывает универсальный источник вместо разворота в язык-конкретику; тащит учебные леса («Глоссарий», «Форма правила в harness», «Что ломается без скила», строку `GATE:`).

## Per-файл обязательные добавки

- **feature** — явный порядок по слоям (`domain→db→service→api→tests→docs`); спека-первой; failing-test-защёлка.
- **tests** — язык-идиомы: стиль unit; fake vs mock; property-based; integration/e2e; naming convention; forbidden testing patterns; команды запуска; пример плохого и хорошего теста.
- **review** — ссылки на `skills/standard.md` по параграфам (§1 typing, §2 DTO, §3 errors, §4 layers, §5 async…); линза дельты (ревью только `git diff`).
- **bugfix** — incident→rule→regression-eval; repro-тест отдельным коммитом.
- **standard** — reference-грейд: таблица запретов, матрица импортов слоёв, §-разделы с bad/good, чеклист самопроверки.
- **database** — схема-первой; alembic up+down; EXPLAIN-бюджет; keyset; идемпотентность; N+1.

## Ориентир объёма (за счёт конкретики, не воды)

- `agents/*.md`: 80–250 строк. `skills/standard.md`: 180–350. `skills/*.md`: сколько нужно на все секции с примерами (обычно 100–250). Тонкий конспект 40–70 строк = FAIL.
