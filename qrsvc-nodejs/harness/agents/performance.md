# rule: performance — Node.js 24 производительность

> Агент не считает сложность. Без явных бюджетов — N+1, SELECT *, LLM в цикле без кэша. Стек: Node.js 24, Fastify, Prisma, autocannon/k6. Ссылается на `skills/feature.md` §6, `agents/resilience.md`.

## Non-negotiables

1. **P1 — Горячий путь без суперлинейной сложности.** Запрещены: вложенные обходы (O(N·M)), N+1 к БД (Prisma `include`/`select` вместо цикла), full-scan. Keyset пагинация (Prisma `cursor`), не `skip`.
2. **P2 — Явные SLO бюджеты.** Каждый эндпоинт: `p50/p99`, `max_payload`, `max_batch`. Значения в `thresholds.yaml`. `p99 < SLO` под нагрузкой 10×.
3. **P3 — LLM-вызовы (если есть).** Не в синхронном цикле. `max_tokens` + бюджет стоимости. Кэш повторов (Map<хэш, ответ> или Redis). Batching через `Promise.allSettled` с лимитом (`p-limit`).

## Quality gates (реальные команды)

```makefile
.PHONY: eval-performance

eval-performance: p99-gate asymptote-gate nplus1-gate llm-cost-gate

p99-gate:
	node scripts/load-test.mjs  # autocannon/k6 на 10x данных; p99 < SLO

asymptote-gate:
	node scripts/asymptote-test.mjs  # прогон на x1/x10/x100; slope ≤ 1.1

nplus1-gate:
	node scripts/sql-counter.mjs  # max SQL count per request ≤ threshold

llm-cost-gate:
	node scripts/llm-cost-check.mjs  # offline eval <= cost budget
```

**`thresholds.yaml` perf-секция:**
```yaml
performance:
  p99_ms: 200          # p99 latency budget
  p50_ms: 50           # p50 latency budget
  max_payload_kb: 100  # max request payload
  max_batch: 100       # max batch size
  db_conn_limit: 10    # Prisma connection_limit
  sql_max_per_request: 5  # max SQL queries per HTTP request
  asymptote_slope_max: 1.1  # max growth slope (1=linear, 2=quadratic)
  llm_cost_usd_per_run: 0.50
```

## Bad/good примеры

❌ **Плохо:** N+1 к БД
```typescript
const users = await prisma.user.findMany();
for (const user of users) {
  const subs = await prisma.subscription.findMany({ where: { userId: user.id } }); // N+1
}
```

✅ **Хорошо:** batch через IN
```typescript
const users = await prisma.user.findMany();
const subsMap = new Map<string, Subscription[]>();
for (const sub of await prisma.subscription.findMany({
  where: { userId: { in: users.map(u => u.id) } }
})) {
  subsMap.set(sub.userId, [...(subsMap.get(sub.userId) || []), sub]);
}
```

❌ **Плохо:** OFFSET пагинация — O(N) на страницу
```typescript
app.get('/orders', async (req) => {
  return prisma.order.findMany({ skip: req.query.page * 20, take: 20 });
});
```

✅ **Хорошо:** keyset — O(1) на страницу
```typescript
app.get('/orders', async (req) => {
  return prisma.order.findMany({
    take: 20,
    cursor: req.query.cursor ? { id: req.query.cursor } : undefined,
    skip: req.query.cursor ? 1 : 0,
    orderBy: { id: 'asc' },
  });
});
```

## Stop rules

- N+1 в diff → стоп, RED FLAG
- Prisma `skip` без cursor на таблице > 10k строк → стоп
- LLM-вызов в цикле (`for (const x of items) { await llm(x) }`) → стоп
- Эндпоинт без `thresholds.yaml` SLO → стоп
- Load test: p99 > SLO на 10× → стоп, оптимизировать
- Асимптотика: slope > 1.1 (квадратичный рост) → стоп