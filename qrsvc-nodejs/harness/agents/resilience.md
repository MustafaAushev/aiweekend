# rule: resilience — Node.js 24 отказоустойчивость

> Агент читает это как ЗАКОН. Пороги — из `thresholds.yaml`, не хардкод. Node.js 24 стек: opossum, p-retry, AbortController, fastify-rate-limit. Ссылается на `skills/feature.md` §6, `skills/database.md` §9.

## Non-negotiables

1. **Таймаут** (connect + read) на каждый внешний вызов. Node.js: `AbortController` + `setTimeout` или `opossum` options. Без него — thread starvation.
2. **Retry** только с exponential backoff + jitter, ≤ `retry_max` (3). `p-retry`: `retries: 3, minTimeout: 200, maxTimeout: 2000, factor: 2`. Ретраить ТОЛЬКО `ECONNRESET`/`ETIMEDOUT`/5xx/429 — НЕ 4xx, НЕ `AbortError`.
3. **Idempotency** на всех мутациях. HTTP: `Idempotency-Key` header. Prisma: `upsert`/`createMany({ skipDuplicates: true })`.
4. **Circuit breaker** на каждый внешний downstream. Opossum: `errorThresholdPercentage: 50, resetTimeout: 30000, timeout: 6000`. OPEN → fast-fail 503.
5. **Backpressure.** Fastify: `import rateLimit from '@fastify/rate-limit'`. Очереди — bounded (`new Array(capacity)` или `p-limit`). Переполнение → `503 Retry-After`.

## Quality gates (реальные команды)

```makefile
.PHONY: eval-resilience

eval-resilience: timeout-check retry-check idempotency-check cb-check backpressure-check

timeout-check:
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const fetchCalls = src.match(/fetch\(/g) || [];
	const hasTimeout = src.includes('AbortController') || src.includes('opossum');
	process.exit(fetchCalls.length > 0 && !hasTimeout ? 1 : 0);
	"

retry-check:
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const hasRetry = src.includes('pRetry') || src.includes('p-retry');
	const hasFetch = src.includes('fetch(');
	process.exit(hasFetch && !hasRetry ? 1 : 0);
	"

idempotency-check:
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const hasKey = src.includes('Idempotency-Key') || src.includes('.upsert(');
	process.exit(hasKey ? 0 : 1);  # warn if no mutations
	"

cb-check:
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const hasCB = src.includes('CircuitBreaker') || src.includes('opossum');
	const hasFetch = src.includes('fetch(');
	process.exit(hasFetch && !hasCB ? 1 : 0);
	"

backpressure-check:
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const hasLimit = src.includes('rateLimit') || src.includes('p-limit');
	process.exit(hasLimit ? 0 : 1);
	"
```

## Bad/good примеры

❌ **Плохо:** retry без idempotency
```typescript
import pRetry from 'p-retry';
async function charge(orderId: string) {
  return pRetry(() => fetch('/api/charge', { method: 'POST', body: JSON.stringify({ orderId }) }), { retries: 3 });
  // retry после 502 = двойное списание
}
```

✅ **Хорошо:** retry + idempotency-key + timeout
```typescript
import pRetry from 'p-retry';
async function charge(orderId: string, idempotencyKey: string) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('timeout')), 5000);
  try {
    return pRetry(() => fetch('/api/charge', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
      signal: ac.signal,
    }), { retries: 3, minTimeout: 200, factor: 2, onFailedAttempt: (e) => {
      if (e.response?.status && e.response.status < 500 && e.response.status !== 429) throw e;
    }});
  } finally {
    clearTimeout(timer);
  }
}
```

❌ **Плохо:** без circuit breaker — retry-шторм бьёт упавшую БД
```typescript
for (let i = 0; i < 3; i++) {
  try { await prisma.user.update(...); break; }
  catch { await sleep(1000 << i); }
}
```

## Stop rules

- Внешний вызов без `AbortController`/`opossum` timeout → стоп, RED FLAG
- `pRetry` без фильтра ошибок (ретраит 4xx) → стоп
- Мутация без `Idempotency-Key`/`upsert` → стоп, RED FLAG
- Circuit breaker не настроен для downstream с latency > 100ms → стоп
- Бекпрешур не настроен на публичном эндпоинте → стоп (риск OOM)
- Пороги хардкодом, не из `thresholds.yaml` → стоп