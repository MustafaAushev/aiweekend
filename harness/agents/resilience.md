# ~/workshops/aiweekend/harness/agents/resilience.md — правила отказоустойчивости

> Агент читает это как ЗАКОН. Реализацию пиши как угодно — но инварианты ниже обязаны быть, иначе eval красный и деплой заблокирован. Пороги — из `harness/thresholds.yaml` (примеры, тюнить под SLO), не хардкод.

## Инварианты (любой внешний вызов: HTTP / БД / брокер / LLM)

1. **Таймаут** (connect + read) в пределах latency-бюджета (обычно p99–p99.9 зависимости, не строго «= p99»). Без него — зависание до TCP-таймаута ОС, thread/goroutine starvation, каскад.
2. **Retry** только с exponential backoff + jitter, ≤ `retry_max` (по умолч. 3). Ретраить ТОЛЬКО сетевые ошибки / 5xx / 429 — НЕ 4xx. Без jitter — thundering herd (лавина повторов кладёт восстановившийся сервис).
3. **Идемпотентность** всех мутаций по клиентскому `Idempotency-Key` (или `INSERT … ON CONFLICT DO NOTHING`). Без неё retry = двойные списания/заказы.
4. **Circuit breaker** на внешние вызовы (порог ошибок → OPEN → half-open). Без него упавший downstream забивает пулы всех клиентов → домино.
5. **Backpressure**: очереди ограничены, переполнение → `503 Retry-After`. Без — неограниченная очередь → OOM.

Комбинация безопасна только вместе: **retry без идемпотентности множит сайд-эффекты**; retry без circuit breaker усиливает отказ.

## Профиль стека (заполни под свой — плейсхолдеры)

| Инвариант | `<TIMEOUT>` | `<RETRY_LIB>` | `<CB_LIB>` | `<QUEUE/BULKHEAD>` |
|---|---|---|---|---|
| Go | `context.WithTimeout` | `cenkalti/backoff` / `avast/retry-go` | `sony/gobreaker` | буфер. `chan` + `x/sync/semaphore` |
| `<ВАШ_СТЕК>` | таймаут-обёртка вызова | retry-библиотека | circuit-breaker | семафор / bulkhead |
| Python | `asyncio.timeout` / `httpx.Timeout` | `tenacity` (`retry_if_exception_type`) | `pybreaker` (`fail_max`,`reset_timeout`) | `asyncio.Semaphore` / `anyio.CapacityLimiter` |

> Пороги (`timeout_ms`, `retry_max`, `cb_fail_ratio/window/open`) — в `thresholds.yaml`, per-env override; значения там — ПРИМЕРЫ под калибровку SLO.

## Eval (как harness ловит регресс в CI)
- **Таймаут:** ToxiProxy latency 10s на downstream → клиент обрывает ≤ таймаут, отдаёт ошибку; поток свободен.
- **Retry:** downstream down 1s → интервалы растут экспоненциально, jitter есть, попыток ≤ retry_max, нет синхронного пика.
- **Идемпотентность:** 2 идентичных мутации с одним ключом (посл. и парал.) → в БД 1 запись, ответы равны.
- **Circuit breaker:** уронить зависимость → после порога fast-fail (503), к моку 0 запросов в OPEN; half-open пропускает пробу.
- **Backpressure:** burst ×10 над ёмкостью → 503 Retry-After, RSS не растёт монотонно, процесс жив.

## Пример: retry без идемпотентности = двойное списание
БЫЛО (агент обернул мутацию в retry без ключа):
```python
def charge(user_id, amount):
    for attempt in range(3):
        r = requests.post(f"{API}/charge", json={"amount": amount, "user_id": user_id})
        if r.status_code == 200:
            return r.json()
        time.sleep(1 << attempt)
    raise RuntimeError("charge failed")
```
СТАЛО (эталон — удовлетворяет ключевым инвариантам вызова: timeout + idempotency + backoff+jitter + ретрай только сеть/5xx/429; circuit breaker и backpressure — отдельными инвариантами ниже):
```python
def charge(user_id, order_id, amount, cfg):        # cfg.retry_max, cfg.timeout, cfg.jitter из thresholds.yaml
    key = f"charge-{user_id}-{order_id}"
    for attempt in range(cfg.retry_max):
        try:
            r = requests.post(f"{API}/charge",
                              json={"amount": amount, "user_id": user_id},
                              headers={"Idempotency-Key": key},
                              timeout=cfg.timeout)    # (connect, read) из cfg — иначе зависание
        except requests.RequestException:             # сеть → ретраим
            time.sleep((1 << attempt) + random.uniform(0, cfg.jitter)); continue
        if r.status_code in (200, 409):               # 409 = уже обработано (idempotency)
            return r.json()
        if r.status_code < 500 and r.status_code != 429:
            r.raise_for_status()                       # 4xx → падаем СРАЗУ, не ретраим
        time.sleep((1 << attempt) + random.uniform(0, cfg.jitter))  # 5xx/429 → backoff + JITTER
    raise RuntimeError("charge failed")
```
502 после успешного списания ловился как сетевая ошибка → ретрай POST → деньги дважды. Ключ делает повтор той же операцией; на бэкенде `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` гасит дубль. Обрати внимание: backoff БЕЗ jitter (`sleep(1<<attempt)`) сам провалит retry-eval — все реплики ретраят синхронно (thundering herd); `import random` + jitter обязателен. В проде — `tenacity` (`wait_random_exponential`) из профиля, ручной цикл здесь для наглядности.

**Что запрещено агенту:** внешний вызов без таймаута; `for i in range(N): sleep(1)` вместо backoff; мутация без idempotency; бесконечный retry в мёртвый сервис.
