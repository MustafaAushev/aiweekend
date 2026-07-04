# ~/workshops/aiweekend/harness/agents/observability.md — правила наблюдаемости

> Агент генерит тысячи строк «по аналогии». Без наблюдаемости расследование инцидента (петля инцидент→правило→eval) невозможно; correlation-id связывает промпт/спеку → запрос → сбой.

## O1. Структурные логи (JSON, не строки)
Все логи — key-value с уровнем, без секретов, с `trace_id`/`correlation_id`. Профиль: Go `log/slog` · Python `structlog` · `<ВАШ_СТЕК>` — структурный JSON-логгер с MDC/контекстом. Никаких `print`/`fmt.Println`.
**Eval:** вывод парсится как JSON, есть обязательные поля (`ts,level,msg,trace_id,service`), нет полей из secret-denylist; lint запрещает `print`/`forbidigo`.

## O2. Метрики RED/USE
Каждый эндпоинт/внешний вызов экспонирует histogram latency + счётчики ошибок/запросов (Prometheus). Latency — histogram (для p99), не gauge среднего. Профиль: Go `client_golang` · Python `prometheus-client` · `<ВАШ_СТЕК>` — Prometheus-клиент под ваш язык.
**Eval:** `/metrics` контракт-тест — есть `http_request_duration_seconds_bucket` с бакетами вокруг SLO; p99 вычислим. *(p99-gate из performance.md читает эти метрики.)*

## O3. Распределённый трейсинг (OpenTelemetry)
Span на запрос, контекст трейса в downstream (`traceparent`), span на каждый внешний и LLM-вызов.
**Eval:** in-memory span-exporter → один `trace_id` на цепочку, parent-child совпадает с фактическими вызовами.

## O4. Correlation-id сквозной
`X-Correlation-Id`/`trace_id` в контекст → логи → исходящие → ответ клиенту. Профиль: Go `context` · Python `contextvars` · `<ВАШ_СТЕК>` — контекст/MDC под ваш язык.
**Eval:** e2e — id из входящего заголовка во всех логах обработки и в исходящих хопах.

## Пример: free-text лог vs structured JSON с trace_id
БЫЛО:
```python
print(f"user {uid} failed")   # какой запрос? когда? где искать?
```
СТАЛО (structlog, JSON, протащенный контекст):
```python
import structlog
structlog.configure(processors=[
    structlog.processors.add_log_level,                 # -> level
    structlog.processors.TimeStamper(fmt="iso", key="ts"),   # -> ts (не timestamp)
    structlog.processors.EventRenamer("msg"),           # event -> msg
    structlog.processors.JSONRenderer(),
])
# service биндится один раз при старте сервиса (обязательное поле eval O1)
log = structlog.get_logger().bind(service="qr-api", correlation_id=cid, trace_id=trace_id)
log.error("charge_failed", user_id=uid, reason="insufficient_funds")
# {"service":"qr-api","correlation_id":"c-9f3","trace_id":"t-1a2","user_id":42,"reason":"insufficient_funds",
#  "level":"error","ts":"2026-07-02T10:15:03Z","msg":"charge_failed"}
```
Free-text в проде — соболезнование, не сигнал: инцидент не склеить с запросом. `bind(trace_id)` тянет контекст через все логи запроса; поиск `grep '"trace_id":"t-1a2"' log.jsonl | grep charge_failed` (или тот же фильтр в Loki/ELK) даёт цепочку за секунды.

**Что запрещено агенту:** `print`/free-text логи в проде; latency как среднее вместо гистограммы; внешний вызов без span; терять correlation-id между хопами.
