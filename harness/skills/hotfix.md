# skill: hotfix (dev-скил, язык-агностик playbook)

> Агент читает как playbook задачи. Плейсхолдеры <ТЕСТ_РАННЕР>/<ЛИНТЕР>/<ORM> под свой стек. Правила — в agents/*.md.

## Скил: HOTFIX — горячая правка в прод (минимальный diff + feature flag + откат + post-mortem)

**Когда:** прод-инцидент P0/P1 (платёж/доставка/авторизация падают, регрессия SLA, утечка данных) либо падающий regression eval из `agents/incident-log.md`. Триггер: страница дежурного, алерт p99 > SLO, failing contract-diff или fault-injection eval.

**Форма правила в harness:** дописать в `agents/incident-log.md` раздел `## hotfix-protocol`:
- «HOTFIX-коммит ≤ 50 строк диффа (rule `diff --stat | tail` ≤ 50), без рефактора/ренеймов/чистки импортов».
- «Каждая правка обёрнута в feature flag `cfg.<FLAG_NAME>` (env-gated), default = поведение ДО фикса, если только фикс не восстанавливает контракт из спеки».
- «Обязательны: 1 regression eval (сценарий инцидента → зелёный) + 1 mutation-проверка (инжект возвращённого бага → тест падает) + smoke e2e env=staging».
- «Обязателен `audit-trail.md` комментарий в коммите: версия спеки + промпт + seed + ID инцидента + аксиомы из `incident-log`».
- «Если фикс меняет контракт (сигнатура/статус/поле) → это НЕ hotfix, переход на `feature`-скил».
- «Автономный fix-loop ограничен ≤3 итерации (hotfix строже общего ≤5 — минимальный риск в прод; см. `agents/fix-loop.md`), после — эскалация человеку».

**Шаги (что делает агент):**
1. Прочитать запись в `agents/incident-log.md` для инцидента: [симптом] → [аксиома модели] → [правило спеки] → [regression eval]. Если записи нет — агент НЕ начинает правку, просит человека оформить инцидент (П4).
2. Воспроизвести падение локально: запустить `<ТЕСТ_РАННЕР> --filter <regression_eval_id>` и зафиксировать traceback + стек вызовов внешних зависимостей (БД/брокер/LLM-API).
3. Назвать минимальную правящую поверхность: один файл/метод/запрос, ни одного попутного рефактора. Сформулировать дифф в одну фразу: «меняем X в Y, потому что Z».
4. Ввести feature flag `cfg.<FLAG_NAME>` (булев, per-env override, default=false если фикс рискованный; default=true только если чинит нарушенный контракт и regression eval покрывает).
5. Применить правку **только** под флагом: `if cfg.<FLAG_NAME> { new_path } else { old_path }`. Внешние вызовы под флагом сохраняют таймаут/retry/idempotency из `agents/resilience.md` (П2, паттерн таймаутов/ретраев).
6. Добавить regression eval: падавший сценарий из шага 2 → тест зелёный. Инжектировать возвращённый баг (mutation) → тест ДОЛЖЕН упасть (П3, защита от bullshit-теста).
7. Прогон contract-diff: `<ЛИНТЕР> openapi-diff`/`protolint`/`jsonschema` между старой и новой спекой → 0 breaking changes. Если есть breaking → скил прерывается.
8. smoke e2e на staging с `FLAG=true`: целевой путь (платёж/заказ) доходит до конца, latency в p99-бюджете из `agents/performance.md`.
9. Сгенерировать коммит-сообщение по шаблону:
   ```
   hotfix(<scope>): <симптом из инцидента>
   incident: <ID>
   spec-version: <sha специ OpenAPI/JSON Schema>
   prompt-seed: <seed агента>
   diff-bounds: <одна фраза из шага 3>
   flag: <FLAG_NAME>=<default>
   regression-eval: <id>, mutation: pass
   ```
10. Запустить audit-trail-генератор: `harness audit-trail <commit>` сохраняет версия спеки + промпт + seed (П5).
11. Не закрывать инцидент: скил заканчивается записью draft post-mortem в `incident-log.md` (симптом → аксиома → правило → eval → владелец фоллоу-апа).

**Definition of Done:**
- [ ] diff ≤ 50 строк, один scope, нет попутного рефактора
- [ ] правка обёрнута в feature flag, default задокументирован
- [ ] regression eval зелёный; mutation (возвращённый баг) падает
- [ ] contract-diff: 0 breaking (OpenAPI/JSON Schema/proto)
- [ ] smoke e2e на staging с флагом: p99 ≤ SLO, путь доходит до конца
- [ ] сохранены resilience-инварианты: таймаут/ретраи/идемпотентность не убраны
- [ ] observability: структурный лог с correlation-id в точке правки, метрика флага (`<FLAG_NAME>.enabled{env}`)
- [ ] audit-trail: версия спеки + промпт + seed + incident ID в коммите
- [ ] откат проверен: `FLAG=false` → поведение до фикса, regression eval снова падает (подтверждает, что фикс именно тут)
- [ ] draft post-mortem в `incident-log.md` с owner фоллоу-апа

**Eval (как harness проверяет):**
- `gate:hotfix-diff-size` — CI-скрипт `git diff origin/main...HEAD --stat | tail -1` парсит строки вставок+удалений, > 50 → fail.
- `gate:feature-flag-present` — grep/AST-проверка: дифф трогает код, защищённый `cfg.<FLAG_NAME>` (или эквивалент config-схемы); без флага → fail (контракт-восстанавливающий фикс исключён, если regression eval покрывает нарушение).
- `gate:regression-eval-green` — `<ТЕСТ_РАННЕР>` фильтр по тегу `@regression @incident-<ID>` → 0 failed.
- `gate:mutation-anti-bullshit` — `mutmut`/`go-mutesting`/`PIT` на изменённой строке: инжект возвращённого бага → regression eval падает. Не падает → fail.
- `gate:contract-diff` — `openapi-diff`/`protolock` → `NoBreakingChanges`.
- `gate:smoke-e2e` — staging, флаг=true, k6/locust 1 RPS целевой путь → success ≥ 99%, p99 ≤ SLO из `performance.md`.
- `gate:audit-trail` — коммит-сообщение парсится регэкспом ключей (incident, spec-version, prompt-seed, flag), пусто → fail.
- `gate:resilience-not-stripped` — AST-чек: таймаут/ретраи в изменённом внешнем вызове сохранены (или добавлены, если их не было — это отдельный фикс).
- `gate:rollback` — CI переворачивает флаг=false, regression eval снова краснеет (фикс локализован).
- Бюджет: gate-пайплайн ≤ 10 мин, mutation ≤ 2 мин (стоимость chaos/mutation под контролем — пороги в `thresholds.yaml`).

**Per-язык идиома:**
- **Go:** флаг `envconfig`/`viper` в `context.Context`-пропагации; gate через `go test -run '@regression @incident-<ID>'` + `go-mutesting`; rollback — `env FLAG=false go test`.
- **`<ВАШ_СТЕК>`:** feature-flag/конфиг + resilience-библиотека; gate через тег-фильтр + mutation-инструмент под ваш язык (подставь идиомы своего стека или удали строку из профиля).
- **Python:** `pydantic-settings`/`dynaconf` + `anyio` taskgroup; gate `pytest -m regression_incident_<ID>` + `mutmut`; rollback `FEATURE_FLAG=false pytest`.

🎬 **Что ломается без скила:**
- Агент «по аналогии» генерит 800-строчный дифф с попутным рефактором → откат невозможен, при rollback теряется и баг, и чужой фикс (П5 ломается).
- Правка не под флагом → выкатка сразу на 100% трафика, второй раз тот же инцидент, нет безопасного наблюдения.
- Нет regression eval → тот же класс отказа повторяется на следующей итерации агента (П4 не закрыта).
- Нет mutation → агент пишет `assert True`-обёртку, eval зелёный, баг жив.
- Убран таймаут «потому что тут и так быстро» → П2 ломается, при откате/downstream-лаге каскад.
- Нет audit-trail → расследование на дни, агент при следующем промпте генерит тот же баг (П5).
- Контракт молча меняется → клиенты падают, hotfix становится новым инцидентом.
