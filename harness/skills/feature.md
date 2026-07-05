# skill: feature (dev-скил, язык-агностик playbook)

> Агент читает как playbook задачи. Плейсхолдеры <ТЕСТ_РАННЕР>/<ЛИНТЕР>/<ORM> под свой стек. Правила — в agents/*.md.

## Скил: FEATURE — реализация новой фичи агентом

**Когда:** Задача типа «добавь эндпоинт / метод / обработчик / интеграцию»; любой стек (Go, Python и другие); агенту разрешена только реализация, спека и harness — под защитой человека.

**Preflight (предполётная проверка окружения):** файлы `agents/*.md`, `thresholds.yaml`, `fix-loop.md` и каталог `harness/` создаются в блоке harness (часть 2), а не в этом плейбуке. Перед запуском скила убедись, что они на месте: `ls ~/workshops/aiweekend/harness/agents/`. Если каталога нет, сначала пройди блок harness, потом возвращайся сюда.

**Глоссарий (жаргон плейбука):** SLO: целевой уровень сервиса, договорённая граница латентности и надёжности. p50/p99: медианная и хвостовая (99-й перцентиль) задержка. idempotency-key: ключ, при повторе запроса не создающий двойного эффекта. circuit breaker: предохранитель, размыкающий вызовы к упавшей зависимости. bounded queue / backpressure: ограниченная очередь и обратное давление, которое отбивает наплыв нагрузки вместо переполнения.

**Форма правила в harness:** Дописать в `harness/skills/feature.md` и связать с `agents/contracts.md`, `agents/resilience.md`, `agents/performance.md`, `agents/security.md`, `agents/observability.md`, `agents/test-matrix.md` (и `agents/incident-log.md` — не по умолчанию, только если в ходе фичи всплыл новый класс отказа, как в карте активации выше):

```markdown
## [FEATURE] Новая фича
Агенту запрещено писать код, пока:
1. Нет изменения спеки (OpenAPI/JSON Schema/спецификация метода) в отдельном файле.
2. Нет failing contract/integration-теста, который требует нового поведения.
3. Нет явно заданных SLO: p50/p99/latency-бюджет, throughput, max payload, max batch.
Для каждого внешнего вызова обязательны: timeout, retry (exp backoff + jitter, ≤3), idempotency-key на мутациях, circuit breaker, bounded queue/backpressure.
Для каждой мутации с побочным эффектом обязательны: input validation, authz/authn check, parameterized queries, secret/env-only.
Каждый коммит агента должен содержать: версию спеки, промпт, seed, результаты eval.
Git-workflow (agents/vcs.md, обязателен):
- Работа ТОЛЬКО в ветке `feat/<TICKET>-<slug>`; прямой коммит/push в `<DEFAULT_BRANCH>` запрещён (protected).
- Каждый коммит — Conventional Commit с тегом вклада: `[agent|assisted|manual] feat(<scope>): <subject>`; коммиты атомарны (репозиторий собирается и тесты зелёные на каждом).
- Смена контракта — ОТДЕЛЬНЫМ коммитом со спекой раньше кода; спека+код+рефактор в одном коммите запрещены.
- Слияние только через PR: один PR = одна фича, diff ≤ `vcs.pr_max_lines`, шаблон заполнен, ≥1 аппрув, автор себя не мёржит, merge лишь на зелёном CI + пройденном review-скиле.
- `--no-verify`/`SKIP=` (обход хуков) запрещены; тронул зависимости → пересобрал lock с хэшами тем же PR.
Dev-стандарт (skills/standard.md, сквозная полоса): типизированный публичный контракт, доменные ошибки, структурные логи с correlation-id, конфиг/секреты из env — держатся на каждой фиче.
```

**Шаги (что делает агент):**

1. **Спека первой.** Прочитать текущую спеку. Сформулировать изменение как diff-спеки: сигнатура, входные/выходные схемы, примеры ошибок, инварианты, idempotency-семантика, SLO-бюджеты. Не трогать `main` без PR.
2. **Контракт → тесты раньше кода.** Сгенерировать:
   - unit: чистый алгоритм через <ТЕСТ_РАННЕР> (table-driven, property-based);
   - integration: mock-контракты БД/брокера/LLM/HTTP с ошибками (timeout, 5xx, duplicate key);
   - e2e-smoke: один happy-path до конца в CI-like окружении (testcontainers / docker-compose / staging).
3. **Failing test защёлка.** Убедиться, что без новой реализации хотя бы один тест падает по спеке. Если тесты зелёные — спека не зафиксирована, работа остановлена.
4. **Реализация под спеку.** Писать код, не меняя сигнатуры и схем без обновления спеки и тестов. Не добавлять неявных глобальных состояний; не хардкодить секреты.
5. **Resilience на каждый внешний вызов.** Применить ВСЕ инварианты из `agents/resilience.md` (единый источник — пороги не пересказывать): timeout (p99–p99.9, из `thresholds.yaml`), retry exp backoff+jitter (≤ `retry_max`), idempotency-key на мутациях, circuit breaker (пороги из конфига), bounded queue / 503 Retry-After.
6. **Performance горячего пути.** Зафиксировать асимптотику: горячий путь без согласования человека — O(1) или O(log N); pagination/индексы/<ORM>-batch; кэш или batching LLM-вызовов.
7. **Security + observability.** Валидация входа по JSON Schema, authz check, parameterized queries/<ORM>, никаких секретов в коде. Добавить structured logs с `correlation_id`, метрики latency/errors/inflight, трейсинг внешних вызовов.
8. **Прогон eval-цепочки.**
   - Запустить `<ТЕСТ_РАННЕР>` (unit/integration/e2e);
   - `<ЛИНТЕР>` + type-check;
   - race-detector / TSAN / concurrency-анализ;
   - mutation testing: инжектировать баг → тесты должны упасть;
   - fault-injection (ToxiProxy/chaos): downstream latency/5xx → проверить timeout, retry, CB, fast-fail;
   - load test (k6/locust): p99 ≤ SLO на 10× датасете.
9. **Fix-loop с лимитом.** Падающий тест → агент чинит до зелёного; лимит из `agents/fix-loop.md` (общий ≤5; hotfix строже ≤3) или бюджет времени/денег. Не закрылось — эскалация человеку, инцидент в `agents/incident-log.md`.
10. **PR артефактов.** Описание PR: diff спеки, промпт+seed, результаты eval, обновление `incident-log.md` если был новый класс отказа.

**Definition of Done:**

- [ ] Спека изменена и отдельно заапрувлена/защищена в PR (protected branch).
- [ ] Контракты покрыты OpenAPI/JSON Schema или эквивалентом; примеры ошибок есть.
- [ ] ≥1 unit, ≥1 integration, ≥1 e2e-smoke тест на фичу.
- [ ] Mutation test: инжектированный баг пойман.
- [ ] Каждый внешний вызов имеет timeout + retry/backoff/jitter + idempotency на мутациях + circuit breaker.
- [ ] Горячий путь: задокументирована сложность и SLO; p99-load test зелёный.
- [ ] Security: input validation, authz, no secrets, parameterized queries.
- [ ] Observability: correlation_id, метрики, трейсинг.
- [ ] Линтер/type-checker/race-detector без ошибок.
- [ ] PR содержит спеку, промпт, seed, eval-лог.

**Eval (как harness проверяет):**

> Команды ниже (`make eval-feature`, ToxiProxy, k6) это референс-гейты под свой стек, а не готовый скрипт воркшопа: свой `Makefile` и SLO задаёшь сам. Expected: зелёный гейт, все проверки проходят до merge. В демо-стенде воркшопа инфраструктуры нет, поэтому нагрузочный и chaos-гейты помечаются N/A (см. живой пример ниже). Где взять инструменты: ToxiProxy (github.com/Shopify/toxiproxy), k6 (k6.io), mutation (mutmut/go-mutesting), secret-scan (git-secrets/truffleHog).

CI-гейт `make eval-feature` (bash/Makefile) обязателен до merge:
1. `contract-diff-gate`: diff спеки vs. реализация — расхождения блокируют merge.
2. `pytest/<ТЕСТ_РАННЕР> --cov` unit+integration+e2e — fail при <80% по hot-path и любом падении.
3. `mutation-gate`: скрипт вносит 1–3 семантических бага (убирает `commit`, меняет `timeout`, удаляет `idempotency_key`) → тесты **должны** упасть, иначе fail.
4. `resilience-gate`: ToxiProxy — downstream задержка 10 с / 5xx 100% / разрыв TCP. Ожидаем: ответ ≤ timeout, нет retry-шторма, CB OPEN → fast 503, bounded queue не падает.
5. `performance-gate`: k6/locust на 10× данных, p99 ≤ SLO, throughput ≥ target, CPU/memory не растут неограниченно.
6. `security-gate`: secret-scan (git-secrets/truffleHog), dependency check, статический анализ инъекций.
7. `flakiness-gate`: eval прогоняется 3× с jitter; fail, если >1 прогон красный.
8. Бюджет gate: eval ≤ 15 мин CPU / $X на chaos+LLM-вызовы.

**Per-язык идиома:**

- **Go:** `context.WithTimeout`/`http.Client.Timeout` + `sony/gobreaker` + property-based `gopter` + `-race` + `stretchr/testify`.
- **`<ВАШ_СТЕК>`:** таймаут/retry/circuit-breaker + property-тесты + mutation + p99-гейт под ваш язык (подставь идиомы своего стека или удали строку из профиля).
- _(конкретику под язык — `<TIMEOUT>`/`<RETRY_LIB>`/`<CB_LIB>`/`<PROPERTY>`/`<ТЕСТ_РАННЕР>` — материализует совет; профиль-пример Python в §11.1)_

🎬 **Что ломается без скила:**

Агент на втором промпте меняет сигнатуру эндпоинта, убирает `idempotency-key` или timeout, пишет синхронный LLM-вызов в горячем пути, добавляет цикл-в-цикле (O(N²)), генерит unit-тесты с `assert True` и не покрывает сбой downstream. В результате: двойные списания при retry, зависание всех потоков на одном медленном вызове, retry-шторм убивает восставшую БД, p99 взлетает с 20 мс до 8 с на 10k RPS, откат не помогает — агент при той же спеке/промпте воспроизводит тот же баг, а расследование затягивается на дни из-за отсутствия correlation_id и audit trail.
