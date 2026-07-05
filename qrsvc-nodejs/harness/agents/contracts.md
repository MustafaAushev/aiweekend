# rule: contracts — Node.js 24 контракты

> Агент читает как ЗАКОН. Контракты живут в спеке, не в коде. Стек: zod, JSON Schema, TypeScript типы. Ссылается на `skills/standard.md` §2, `skills/feature.md` §1.

## Non-negotiables

1. **C1 — Каждый эндпоинт = контракт.** Fastify/zod schema для входа и выхода. Request: `{ schema: { body, querystring, params, response } }`. Response: zod `output` schema. Изменение сигнатуры/формата — только через deliberate diff.
2. **C2 — Инварианты в схеме, не в коде.** Idempotency-политика, timeout-бюджет, SLO — в `thresholds.yaml`, не в теле функции. Zod schema `describe()` для документации.
3. **C3 — Валидация входа/выхода по схеме.** Вход парсится через `zod.parse()`. Выход (особенно LLM) — structured output через `z.parse()`, валидируется до использования.

## Quality gates (реальные команды)

```makefile
.PHONY: eval-contracts

eval-contracts: contract-diff schema-validate backward-compat

contract-diff:
	node -e "
	const { execSync } = require('child_process');
	const diff = execSync('git diff main -- src/api/').toString();
	const hasSchemaChange = diff.includes('z.object') || diff.includes('.extend(');
	const hasSpecCommit = execSync('git log --oneline main..HEAD').toString().includes('spec');
	process.exit(hasSchemaChange && !hasSpecCommit ? 1 : 0);
	"

schema-validate:
	node -e "
	// Проверка: каждый Fastify роут имеет body/response schema
	const files = require('fs').readdirSync('src/api', { recursive: true });
	const routes = files.filter(f => f.endsWith('.routes.ts'));
	for (const f of routes) {
	  const src = require('fs').readFileSync('src/api/' + f, 'utf8');
	  if (src.includes('fastify') && !src.includes('schema:')) {
	    console.error('MISSING schema in', f);
	    process.exit(1);
	  }
	}
	"

backward-compat:
	node -e "
	const { execSync } = require('child_process');
	const diff = execSync('git diff main -- prisma/schema.prisma').toString();
	const hasBreaking = diff.includes('DROP') || diff.includes('REMOVE');
	process.exit(hasBreaking ? 1 : 0);
	"
```

## Bad/good примеры

❌ **Плохо:** schema в комментарии, не в коде
```typescript
// Response: { userId: number } — комментарий устареет
app.get('/user/:id', async (req) => {
  return { userId: req.params.id }; // string, а в комментарии number
});
```

✅ **Хорошо:** zod schema на каждый роут
```typescript
import z from 'zod';

const GetUserParams = z.object({ id: z.coerce.number() });
const GetUserResponse = z.object({ userId: z.number() });

app.get<{ Params: typeof GetUserParams; Reply: typeof GetUserResponse }>(
  '/user/:id',
  { schema: { params: GetUserParams, response: { 200: GetUserResponse } } },
  async (req) => ({ userId: req.params.id })
);
```

❌ **Плохо:** contract-тест, охраняющий не тот контракт
```typescript
it('returns user', async () => {
  const res = await app.inject({ method: 'GET', url: '/user/1' });
  expect(res.json()).toHaveProperty('userId'); // PASS даже после renaming user_id → userId
});
```

## Stop rules

- Изменение JSON Schema/zod без апдейта OpenAPI/спеки → стоп
- `additionalProperties: true` на публичном эндпоинте → стоп (разъедание контракта)
- Contract-тест удалён или ослаблен → стоп, RED FLAG
- Парсинг входа без zod/JSON Schema (голый `JSON.parse`) → стоп
- LLM-ответ без `z.parse()` валидации → стоп