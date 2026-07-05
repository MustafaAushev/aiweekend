# Review Findings: qrsvc-nodejs

**Date:** 2026-07-05
**Reviewer Agent:** deepseek/deepseek-v4-flash
**Base Commit:** `8558539` (HEAD of `main`)
**SPEC_FILE:** `api/openapi.yaml`

---

## Важное замечание: отсутствие git diff

Ревью выполняется строго по `harness/skills/review.md` non-negotiable #1:

> **Ревью только `git diff` — не читать весь файл, не искать проблемы вне дельты.**

Весь код проекта находится в `main`, feature-ветки нет. `git diff main -- src/ e2e/ tests/ api/` пуст — дельта отсутствует. Формально review.md предполагает ревью дельты относительно `main`, а не всего проекта. Ниже — оценка существующего кода по 8 блокам с учётом этого ограничения.

---

## 8 блоков проверки

### 1. Контракты (П1, §1–2 standard.md) — PASS

- OpenAPI spec (`api/openapi.yaml`) и реализация (`src/app.ts`) синхронизированы: route, body schema, response fields совпадают
- `additionalProperties: false` задан и в спеке, и в Fastify-схеме
- Contract-тесты (`tests/contract/border.test.ts`) проверяют границы поля `border` (0, 40, -1, 41) — покрытие граничных значений есть
- Property-based тест (`tests/property/invariant.test.ts`) c 500 runs проверяет инвариант `error_correction`

### 2. Resilience (П2, §6 standard.md) — PASS

- Внешних HTTP-вызовов, Prisma, брокера в коде нет
- `resilience-check` тривиально проходит (нет fetch/axios/got)
- Idempotency-Key, circuit breaker, retry не требуются — нет мутаций внешних систем

### 3. Тесты (П3) — PASS (с замечанием)

- **Unit:** `src/capacity.test.ts` — 13 кейсов, граничные значения (границы версий, превышение capacity, default EC)
- **Contract:** `tests/contract/border.test.ts` — 6 кейсов на поле `border`
- **E2E:** `e2e/smoke.test.ts` — 4 кейса (happy path, defaults, 422)
- **Property:** `tests/property/invariant.test.ts` — 500 рандомных прогонов на инвариант EC
- **28/28 тестов зелёных** ✅
- **Mutation testing не настроен** — в `package.json` нет stryker, `mutation_score` из `thresholds.yaml` не проверяется

### 4. Асимптотика / горячий путь (П6) — PASS

- `selectVersion` — линейный поиск по массиву из 40 элементов (bounded, фактически O(1))
- N+1 отсутствует (нет БД)
- LLM-вызовов нет
- OFFSET-пагинации нет

### 5. Security (§3 standard.md) — PASS (с замечанием)

- **Вход валидируется** через Fastify JSON Schema — allowlist, `additionalProperties: false`
- Prisma не используется — SQL-инъекция невозможна
- Хардкод секретов отсутствует
- **Нет authn/authz** — эндпоинт полностью открыт. Per S3: «Каждый эндпоинт объявляет роль/scope; отсутствие проверки = fail». Для простого QR-сервиса может быть intentional, но правило нарушено
- **Нет `.gitignore`** — `.env`, `node_modules`, секреты могут быть случайно закоммичены
- **Нет `.env.example`** — per §5 конфиг/секреты: `.env.example` обязателен в репозитории

### 6. Concurrency — PASS

- Shared state отсутствует
- Глобальных кэшей/map без синхронизации нет
- Event loop не блокируется (нет CPU-bound циклов)

### 7. Observability (§4 standard.md) — RED FLAG

| Проблема | Стандарт | Локация |
|---|---|---|
| `logger: false` — логгер Fastify отключён полностью | O1: структурные логи | `src/app.ts:6` |
| `console.error` — free-text лог | O1: запрещён print/free-text | `src/index.ts:7` |
| Нет pino/структурного логгера | O1: JSON-логгер с level/msg/trace_id | dependency list |
| Нет `correlationId` | O4: сквозной id в логах и ответе | — |
| Нет метрик (Prometheus/latency) | O2: RED-метрики на эндпоинт | — |
| Нет трейсинга (OpenTelemetry) | O3: span на запрос | — |

Это блокирует observability целиком — прод без логов и метрик не подлежит отладке инцидентов.

### 8. Audit (П5) — NEEDS WORK

- **Commit message:** `nodejs` — не Conventional Commit, нет тега вклада `[agent|assisted|manual]`, нет ссылки на тикет
- **Нет `.gitignore`**
- **Нет `.env.example`**
- **Нет README**
- Per VCS rules: commit должен матчить `^\[(agent|assisted|manual)\] (feat|fix|...)...`

---

## Итоговый вердикт: **NEEDS WORK**

**Обоснование:**
- Блок 7 (Observability) — **RED FLAG**: логгер выключен, structured logging отсутствует, correlation-id нет. Это прямое нарушение O1/O4.
- Блок 8 (Audit) — **NEEDS WORK**: коммит без тега и Conventional формата, нет `.gitignore`, `.env.example`, README.
- Остальные блоки — PASS с непринципиальными замечаниями.
- Поскольку `review.md` требует останова при RED FLAG и возврата в fix-loop, но дельта отсутствует (весь код уже в `main`), формальный блок PR невозможен — требуется human review для устранения observability-долгов.

**Пункты к исправлению (priority):**
1. **src/app.ts:6** — заменить `logger: false` на `logger: pino({ level: 'info' })` и донастроить correlation-id через Fastify hooks (O1, O4)
2. **src/index.ts:7** — заменить `console.error` на pino-логгер (O1)
3. Добавить `.gitignore` (S5, П5)
4. Добавить `.env.example` с плейсхолдерами (§5 standard.md)
5. Добавить README с обязательными секциями (§9 standard.md)
6. Настроить mutation testing (stryker) для gate `mutation_score ≥ 0.80` (П3)