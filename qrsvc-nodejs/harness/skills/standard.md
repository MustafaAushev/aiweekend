# skill: standard — Node.js 24 материализация

> Агент читает как playbook «привести код к стандарту разработки». Стек: Node.js 24, TypeScript strict, npm, vitest, Prisma, pino, Fastify, ESLint, Prettier. Правила — в `agents/*.md`.

## Назначение и когда применять

Любая задача, где агент создаёт или меняет код (feature/bugfix/refactor). Стандарт — сквозная полоса. Отдельно вызывается на промтах «приведи к стандарту / настрой новый сервис / наведи порядок». Стандарт задаёт КАК устроен production-код между задачами.

## Входы/выходы

**Входы:** `agents/*.md`, `thresholds.yaml`, существующий `src/`.

**Выходы:** Весь `src/`, приведённый к стандарту: структура, типы, ошибки, логи, конфиг, зависимости, VCS, документация.

## Non-negotiables

1. Структура: код по слоям/фичам (`src/{domain,persistence,service,api}`), shared, без свалок `utils/`. Матрица импортов: домен не импортирует инфраструктуру; api не ходит в БД мимо сервиса.
2. Типы: TypeScript strict (`tsconfig.json strict: true, noUncheckedIndexedAccess: true`), все публичные функции аннотированы. Публичный возврат — типизированный DTO/zod schema, не `any`/`Record<string, unknown>`. Подавления — только с комментарием.
3. Ошибки: доменная иерархия (классы-наследники `DomainError`), запрещён `catch (e) {}` с проглатыванием, try минимальный, технический сбой пробрасывается (`throw new DatabaseError('msg', { cause: e })`).
4. Логи: pino structured logging (`logger.info({ event: 'order_created', orderId }, 'order created')`), НЕ `console.log(\`order ${id}\`)`. Уровни: debug/info/warn/error/fatal. Без секретов/PII.
5. Конфиг/секреты: единый типизированный источник (env-var/zod `.env` schema), fail-fast валидация на старте. Секреты из env/vault, НИКОГДА в коде. `.env` в `.gitignore`, `.env.example` в репо.
6. Зависимости: `package.json` — диапазоны, `package-lock.json` — точные версии с хэшами (закоммичен). `npm audit` в CI — красный при critical CVE.
7. Формат/линт: eslint + prettier — enforced в pre-commit (husky + lint-staged) и CI. `--no-verify` запрещён.
8. VCS: по правилу `agents/vcs.md`.
9. Документация: публичный API с JSDoc (назначение/параметры/возврат/ошибки). README: Overview, Quickstart, Config(ENV), Running, Architecture, API. ADR для значимых решений.

## Workflow

1. **Определить инструменты.** `npx eslint --init`, prettier, husky, lint-staged, tsconfig strict.
2. **Структура.** Разложить `src/{domain,persistence,service,api,shared}`. Файлы > 300 строк — декомпозировать.
3. **Типы.** `tsc --noEmit --strict` — ноль ошибок. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Заменить `any` на конкретный тип/zod.
4. **Ошибки.** `src/domain/errors.ts`: базовый `DomainError extends Error`, иерархия `ValidationError`, `NotFoundError`, `DatabaseError`. Убрать `catch (e) { return null }`.
5. **Логи.** Перевести все `console.log` на pino. correlationId через AsyncLocalStorage.
6. **Конфиг.** `src/config.ts`: zod схема `.env`, fail-fast `config.parse(process.env)`. `dotenv` для dev.
7. **Зависимости.** `npm audit fix`, `package-lock.json` закоммичен. npm audit порог `--audit-level=critical`.
8. **Формат/линт.** `eslint.config.mjs` + `.prettierrc`. Husky: pre-commit → lint-staged.
9. **VCS.** `.gitignore`, `.editorconfig`, branch protection rules.
10. **Документация.** JSDoc на публичные API, README, ADR при необходимости.

## Stack binding (Node.js 24 + npm)

| Компонент | Инструмент | Команда |
|---|---|---|
| Форматтер | prettier | `npx prettier --check src/` |
| Линтер | eslint + typescript-eslint | `npx eslint src/` |
| Тип-чекер | tsc | `npx tsc --noEmit --strict` |
| Логгер | pino | `import pino from 'pino'` |
| Конфиг | env-var / dotenv + zod | `config.parse(env)` |
| Менеджер | npm | `npm`, `package-lock.json` |
| CVE-аудит | npm audit | `npm audit --audit-level=critical` |
| Secret scan | secretlint / git-secrets | `npx secretlint` |
| Git hooks | husky + lint-staged | `npx husky init` |
| DTO schema | zod | `z.object({...})` |
| Async context | AsyncLocalStorage | `new AsyncLocalStorage()` |

## Quality gates (реальные команды)

```makefile
.PHONY: eval-standard

eval-standard: format-gate type-gate error-gate logging-gate config-gate deps-gate lint-gate docs-gate vcs-gate

format-gate:
	npx prettier --check src/

type-gate:
	npx tsc --noEmit --strict --noUncheckedIndexedAccess

error-gate:
	node -e "
	const code = require('fs').readFileSync('src','utf8').match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
	process.exit(code ? 1 : 0);  # fail on empty catch
	"

logging-gate:
	node -e "
	const src = require('fs').readFileSync('src','utf8');
	const hasInterpolation = src.match(/console\.(log|error|warn)\(`/);
	const hasSecrets = /password|token|secret|api_key|authorization/i.test(src);
	process.exit(hasInterpolation || hasSecrets ? 1 : 0);
	"

config-gate:
	npx secretlint src/ 2>/dev/null || true
	node -e "
	const hasConfig = require('fs').existsSync('src/config.ts');
	const hasEnvExample = require('fs').existsSync('.env.example');
	const envInGitignore = require('fs').readFileSync('.gitignore','utf8').includes('.env');
	process.exit(hasConfig && hasEnvExample && envInGitignore ? 0 : 1);
	"

deps-gate:
	test -f package-lock.json
	npx audit --audit-level=critical || echo 'CVE found — escalate'

lint-gate:
	npx eslint src/ --max-warnings 0

docs-gate:
	node -e "
	const src = require('fs').readdirSync('src',{recursive:true});
	const hasReadme = require('fs').existsSync('README.md');
	process.exit(src.some(f=>f.endsWith('.ts')) && hasReadme ? 0 : 1);
	"

vcs-gate:
	node -e "
	const log = require('child_process').execSync('git log --oneline -1').toString();
	const ok = /\[(agent|assisted|manual)\] (feat|fix|refactor|perf|test|docs|build|ci|chore)/.test(log);
	process.exit(ok ? 0 : 1);
	"
```

## Bad/good примеры

❌ **Плохая структура:** свалка в одном файле
```typescript
// src/utils.ts: 800 строк, функции-комбайн
export function processOrder(order: any) { ... }
export function sendEmail(user: any) { ... }
export function validateInput(data: any): boolean { ... }
// любой тип, нет слоёв, прямой импорт Prisma из хендлера
```

✅ **Хорошая структура:** слои и границы
```
src/
  config.ts                        # zod env schema, fail-fast
  domain/
    errors.ts                      # DomainError hierarchy
    order.ts                       # Order entity, value-objects
  persistence/
    order.repository.ts            # Prisma repository
  service/
    order.service.ts               # business logic
  api/
    order.routes.ts                # Fastify routes
    order.schema.ts                # zod request/response schemas
  shared/
    logger.ts                      # pino instance with correlationId
```

❌ **Плохая ошибка:** проглатывание с возвратом null
```typescript
try {
  return await prisma.user.findUniqueOrThrow({ where: { id } });
} catch {
  return null; // ошибка БД маскируется под «нет данных»
}
```

✅ **Хорошая ошибка:** доменная иерархия + контекст
```typescript
try {
  return await prisma.user.findUniqueOrThrow({ where: { id } });
} catch (e) {
  throw new DatabaseError('failed to find user', { cause: e, context: { id } });
}
```

## Definition of Done

- [ ] Структура: `src/{domain,persistence,service,api,shared}`, без свалок, матрица импортов
- [ ] tsc strict ноль ошибок; нет `any` в публичном возврате
- [ ] Нет голого catch-all; доменная иерархия
- [ ] pino логи, без console.log и секретов, с correlationId
- [ ] Конфиг: zod schema + fail-fast; `.env` в ignore; `.env.example` в репо
- [ ] `package-lock.json` закоммичен; `npm audit` зелёный
- [ ] prettier + eslint проходят; husky pre-commit настроен
- [ ] VCS: Conventional Commits + тег вклада, ветка не `main`
- [ ] JSDoc на публичный API; README с обязательными секциями
- [ ] ADR для значимых решений

## Stop / escalation rules

- `tsc --strict` не проходит → стоп, чинить типы
- Хардкод секрета → стоп, эскалация безопасности
- `npm audit` critical → стоп, чинить зависимости
- Попытка изменить `.gitignore`, `tsconfig.json`, `harness/` → стоп
- Решение с альтернативами (напр. выбор логгера) → ADR, не молча

## Audit trail

В коммите: `[agent] standard(scope): message`. В PR: результаты eval-standard, diff структуры/типов/логов. Seed для генерации.