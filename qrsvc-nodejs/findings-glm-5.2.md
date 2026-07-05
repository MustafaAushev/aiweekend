# Review Findings: qrsvc-nodejs

**Дата:** 2026-07-05
**Ревьюер:** z-ai/glm-5.2 (devhands/z-ai/glm-5.2)
**Base commit:** `8558539` (HEAD `main`)
**SPEC_FILE:** `api/openapi.yaml`
**Линза:** `git diff main` пустой — весь код уже в `main`, feature-ветка отсутствует. Согласно `harness/skills/review.md` non-negotiable #1 ревьюется дельта относительно `main`; дельты нет, поэтому ревьюется фактическое состояние `src/`, `tests/`, `e2e/`, `api/` как единая «дельта». `harness/**` и корневой `harness/**` — read-only, код не правился.

## Реальные gates (исполнено)

| Gate | Команда | Результат |
|---|---|---|
| Типы | `npx tsc --noEmit --strict` | ✅ 0 ошибок |
| Линт | `npm run lint` (eslint --max-warnings 0 + prettier --check) | ✅ PASS |
| Тесты | `npm test` | ✅ 28/28 passed |
| Coverage | v8 | 94.73% stmts / 77.77% branch / 75% funcs / 100% lines |
| contract-diff (review.md) | grep `z.object`/`JSONSchema` в diff `src/api/` | ❌ FAIL — `src/api/` нет, zod-схем нет |
| log-check (review.md) | regex password/token/secret в diff | ✅ PASS (хардкода секретов нет) |
| mutation-check (test-matrix.md) | `npx stryker run` | ⛔ stryker не установлен, gate не выполним |
| commit-lint (vcs.md) | regex `^\[(agent\|assisted\|manual)\] (feat\|...)` | ❌ FAIL (`8558539 nodejs`) |
| branch-check (vcs.md) | текущая ветка | ⚠️ на `main` (правило: прямой пуш запрещён) |

---

## 8 блоков проверки

### 1. Контракты (П1, §1–2 standard.md; agents/contracts.md) — NEEDS WORK

1. **[П1/C1] Ответ не валидируется response-схемой.** `src/app.ts:10-25` Fastify-схема описывает только `body`, секции `response` нет. agents/contracts.md C1 требует `{ schema: { body, querystring, params, response } }`. Форма 201-ответа (`qr_id`, `error_correction`, `qr_size`, `image_url`, `border`) существует только в OpenAPI, код не охраняет её schema → любой drift (переименование поля, лишнее поле) останется незамеченным contract-тестами (они проверяют `toHaveProperty`, см. `e2e/smoke.test.ts:24-30` — проходят даже после renaming, ровно антипример из contracts.md).
2. **[П1/C3] Вход парсится не через `zod.parse()`.** Используется Fastify JSON Schema (`src/app.ts:13-24`). zod есть в `package.json:23` (`"zod": "^4.4.3"`) но нигде не импортируется (grep по `src/` пуст). contracts.md C3 явно требует `zod.parse()` для входа. JSON Schema ≈ zod по охвату, но правило требует именно zod-схему + `describe()` для документации (C2).
3. **[П1] spec/impl расхождение по `maxLength` data.** `api/openapi.yaml:16` декларирует `maxLength: 2953`. Реализация `src/capacity.ts:11-13` принимает максимум L[39]=1248; для длины 1249…2953 даже при `error_correction: L` возвращается 422 (`e2e/smoke.test.ts:53-61` фиксирует 422 для 1249). Контрактное поле «разрешено до 2953» не выполняется — deliberate diff в спеке отсутствует. Это backward-incompat для клиента, рассчитывающего на спецификацию.
4. **[П1] Семантика `data.length` не определена.** `src/app.ts:30` передаёт `body.data.length` (число UTF-16 code units), а ёмкости QR считаются в байтах. Для не-ASCII (кириллица, эмодзи) char-length недооценивает byte-length → может быть выбрана слишком малая version, QR физически не вместит данные. Спека не уточняет byte vs char; контракт неоднозначен. SLO-бюджеты (thresholds.yaml `max_payload_kb`) тоже в KB, а не в символах.
5. **[П1] 422-ответ не описан схемой.** `api/openapi.yaml:34-35` для 422 указан только `description`, без `schema`. Код `src/app.ts:32` шлёт `{ error: '...' }` — форма не зафиксирована ни в спеке, ни в Fastify response-schema. Неконтрактизуемое поле для клиента.

### 2. Resilience (П2, §6 standard.md; agents/resilience.md) — PASS (N/A)

Внешних вызовов нет: нет `fetch`/`axios`/`got`, нет Prisma, нет брокера, нет БД. `resilience-check` тривиально проходит. AbortController/p-retry/opossum/Idempotency-Key/rateLimit неприменимы — мутаций внешних систем нет. Замечание: эндпоинт `POST /api/v1/qr` — мутация (генерация ресурса, 201), но без side-effects вне процесса; Idempotency-Key формально не требуется, однако при появлении persistence станет обязательным — отметить как risk.

### 3. Тесты (П3, agents/test-matrix.md) — NEEDS WORK

6. **[П3/T2] Mutation score не замеряется.** `package.json` не содержит `stryker`, `thresholds.yaml:23` задаёт `mutation_score: 0.80`, gate `mutation-check` (test-matrix.md) невыполним. Учитывая, что `selectVersion`-логика (`>` без проверки равенства границ) и `border ?? 4` (`src/app.ts:29`) мутабельны (мутант `<=` → `>=`, `?? 4` → `?? 0`), stryker обязателен.
7. **[П3/T1] Integration-тип отсутствует.** test-matrix.md T1 требует минимум один тест каждого типа: unit + integration + e2e-smoke. Есть unit (`src/capacity.test.ts`), e2e-smoke (`e2e/smoke.test.ts`), property (`tests/property/invariant.test.ts`), contract (`tests/contract/border.test.ts`). Integration (testcontainers/MSW) отсутствует — формально оправдано отсутствием БД/HTTP-downstream, но T1 говорит «минимум один каждого типа» без оговорки. Хотя бы integration-тест Fastify-схемы на невалидный `error_correction` (400) и некорректный `content-type` не покрыт.
8. **[П3] Coverage веток 77.77% < 100%.** `app.ts` branch coverage 66.66%, непокрытые строки 28-29 (`src/app.ts:28-29` — ветка `body.error_correction ?? 'M'` с явной передачей). Не блокирует (thresholds не задают порог line/branch), но функциональный `app.ts` покрыт слабо.

### 4. Асимптотика / горячий путь (П6, agents/performance.md) — PASS

`selectVersion` (`src/capacity.ts:28-35`) — линейный поиск по массиву из 40 элементов, bounded → фактически O(1). N+1 отсутствует (нет БД). LLM-вызовов нет. OFFSET-пагинации нет. `qr_size = (v+1)*4 + 17` — O(1). Hot path проходит.

### 5. Security (§3 standard.md; review.md security-блок) — NEEDS WORK

9. **[Sec] Authn/authz отсутствуют.** `src/app.ts:10` эндпоинт `POST /api/v1/qr` полностью открыт. review.md security-блок требует «Authz middleware?». Для учебного QR-сервиса может быть intentional, но в `materialization-contract.md` явно перечислены опциональные `agents/security.md` — он отсутствует в `harness/agents/` (есть только 7 обязательных), значит authz-требование не снято явно. Отметить как risk.
10. **[Sec/§5] Нет `.gitignore`.** `ls .gitignore` — отсутствует. standard.md §5: «`.env` в `.gitignore`». `node_modules/`, `dist/`, `coverage/` тоже не игнорируются — `coverage/` уже закоммичен (видно в `git diff main --stat`). Риск коммита секретов и артефактов.
11. **[Sec/§5] Нет `.env.example`.** standard.md §5: «`.env.example` в репо». Отсутствует. Конфиг читается из `process.env.PORT` (`src/index.ts:4`) без валидации.
12. **[Sec/§5] Конфиг без zod/fail-fast.** `src/index.ts:4` `parseInt(process.env.PORT ?? '0', 10) || 3000` — нет `src/config.ts` с zod-схемой env. standard.md §5 требует единый типизированный источник с fail-fast валидацией на старте.
13. **[Sec] Вход валидируется** ✅ — Fastify JSON Schema с `additionalProperties: false` (`src/app.ts:17`), SQL-инъекции невозможны (Prisma нет), хардкода секретов нет (log-check PASS).

### 6. Concurrency (review.md concurrency-блок) — PASS

Shared state отсутствует. `CAPACITY` (`src/capacity.ts:9`) — константный `Record`, only-read. Глобальных кэшей/Map без синхронизации нет. CPU-bound циклов нет (поиск по 40 элементам). Event loop не блокируется.

### 7. Observability (§4 standard.md; review.md observability-блок) — **RED FLAG**

14. **[§4/O1] Fastify-логгер выключен.** `src/app.ts:6` `Fastify({ logger: false })`. standard.md §4: «pino structured logging». Все request/response/ошибочные логи Fastify отключены — прод не отлаживаем.
15. **[§4/O1] `console.error` как лог.** `src/index.ts:7` `console.error(\`server listening...\`)` — free-text лог, запрещён standard.md §4 («НЕ `console.log(\`order ${id}\`)`»).
16. **[§4] pino отсутствует в зависимостях.** `package.json:22-24` — только `fastify`, `zod`. pino не объявлен. standard.md §4 и stack-binding требуют pino.
17. **[§4/O4] Нет `correlationId`.** standard.md §4 + skill: «correlationId через AsyncLocalStorage». AsyncLocalStorage не используется (grep пуст). Сквозного id запроса нет.
18. **[§4/O2] Нет метрик.** review.md observability: «Метрики latency/errors?». RED-метрик нет, fastify-metrics не подключён.

Блок целиком нерабочий — прод без логов и метрик. Согласно `review.md` Stop-rules: **RED FLAG по любому блоку → возврат в fix-loop, PR не создаётся.**

### 8. Audit (П5, agents/vcs.md; review.md audit-блок) — NEEDS WORK

19. **[П5/VCS2] Коммит не Conventional, без тега вклада.** `git log -1` → `8558539 nodejs`. vcs.md non-negotiable #2: `[agent|assisted|manual] <type>(<scope>): <subject>`. commit-lint FAIL. Нет ссылки на тикет.
20. **[П5/VCS1] Работа ведётся на `main`.** `git branch` → `* main`. vcs.md #1: «Прямой push в `main` запрещён (protected)», ветка должна быть `feat/<TICKET>-<slug>`. branch-check FAIL.
21. **[П5/VCS5] Нет husky/lint-staged.** `package.json` не содержит husky, pre-commit не настроен. standard.md §7: «eslint + prettier — enforced в pre-commit (husky + lint-staged)». `--no-verify`-защиты нет.
22. **[§9] Нет README.** `ls README.md` — отсутствует. standard.md §9: обязательные секции Overview/Quickstart/Config/Running/Architecture/API.
23. **[П5/§9] Нет ADR.** Решение «логгер выключен, pino не подключён, zod не используется несмотря на dep» — значимые архитектурные решения без ADR (standard.md §9, stop-rule «Решение с альтернативами → ADR»).

---

## Итоговый вердикт: **RED FLAG — НЕ МЁРЖИТЬ**

**Обоснование:**
- **Блок 7 (Observability) — RED FLAG** (находки 14–18): Fastify-логгер отключён, pino отсутствует, `console.error` вместо structured logging, нет `correlationId`, нет метрик. Прямое нарушение standard.md §4 (O1/O2/O4). Per `review.md` Stop-rules — RED FLAG по любому блоку → PR не создаётся.
- **Блок 1 (Контракты, П1) — NEEDS WORK** (находки 1–5): response-схема отсутствует, zod не используется вопреки C1/C3, spec maxLength 2953 vs impl 1248 — backward-incompat без deliberate diff, семантика `data.length` (byte vs char) неоднозначна.
- **Блок 3 (Тесты, П3) — NEEDS WORK** (находки 6–8): stryker не установлен, mutation_score ≥ 0.80 не проверяется, integration-тип отсутствует.
- **Блок 5 (Security) — NEEDS WORK** (находки 9–12): нет `.gitignore`, `.env.example`, `src/config.ts` с zod fail-fast.
- **Блок 8 (Audit, П5) — NEEDS WORK** (находки 19–23): коммит без тега и conventional-формата, работа на `main`, нет husky, нет README, нет ADR.
- **Блоки 2, 4, 6 — PASS** (resilience/асимптотика/concurrency — требований неприменимы или выполнены).

Поскольку `git diff main` пуст (код уже в `main`), формальный PR не формируется — требуется human-in-the-loop для устранения RED FLAG по observability и согласования spec/impl по `maxLength`. До устранения находок 14–18 мержить нельзя.

## Приоритетный план исправления (для fix-loop)

1. **[RED FLAG, §4]** `src/app.ts:6` → `Fastify({ logger: pino({ level: 'info' }) })`; добавить `@fastify/cla...`/AsyncLocalStorage для correlationId; `src/index.ts:7` заменить `console.error` на `server.log.info`.
2. **[П1/C1]** Добавить Fastify `response: { 201: {...}, 422: {...} }` schema в `src/app.ts` синхронно с `api/openapi.yaml`.
3. **[П1]** Согласовать `maxLength` (2953 в спеке vs 1248 в impl) — либо исправить таблицу `CAPACITY` под byte-mode стандарта, либо завести deliberate diff в спеке.
4. **[П1]** Уточнить в спеке byte vs char и использовать byte-length (`Buffer.byteLength(data, 'utf8')`) в `src/app.ts:30`.
5. **[П3]** Установить stryker, добавить `mutation` script, добиться `mutation_score ≥ 0.80`.
6. **[Sec/§5]** Добавить `.gitignore`, `.env.example`, `src/config.ts` с zod-схемой env.
7. **[П5/VCS]** Перейти на ветку `feat/<TICKET>-<slug>`, переписать коммит-сообщение как `[agent] feat(qr): ...`; добавить husky + lint-staged.
8. **[§9]** Написать README; ADR для решений «no-authz», «logger off → pino», «Fastify JSON Schema vs zod».

**Тег вклада ревью:** `[agent] review(qrsvc-nodejs): findings`
