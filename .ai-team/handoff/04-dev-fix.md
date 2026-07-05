Все гейты зелёные. Запишу handoff.
Готово. Применил минимальный фикс из review: добавил `ajv.customOptions` (`coerceTypes: false`, `removeAdditional: false`, `useDefaults: false`) в `qrsvc-nodejs/src/app.ts:5`. Gate зелёный: `Tests 45 passed (45)`, lint, typecheck OK. Handoff записан в `.ai-team/handoff/04-dev-fix.md`.

RESULT: DONE
нструктор `buildServer`): добавлены явные
`ajv.customOptions`, отключающие дефолты Fastify/ajv, которые обходили собственную схему
валидации и OpenAPI-контракт:

```ts
const server = Fastify({
  logger: false,
  ajv: {
    customOptions: {
      coerceTypes: false,
      removeAdditional: false,
      useDefaults: false,
    },
  },
})
```

Это минимальный фикс, рекомендованный REVIEWER (findings #1, #2, #3 из `03-review.md`).
Тесты, спека (`api/openapi.yaml`), остальные исходники — не тронуты.

### Почему безопасно

- `useDefaults: false` — не ломает поведение `error_correction` / `border`: handler уже
  имеет явный fallback в коде (`body.error_correction ?? 'M'`, `body.border ?? 4`),
  совпадающий со значениями `default` в JSON Schema. Существующие контракт-тесты
  (`border.test.ts`, `label.test.ts`) проходят без изменений.
- `coerceTypes: false` — `label: 42 | true | ['x'] | null | {k:'v'}` теперь даёт 400
  вместо тихого приведения к строке. Соответствует `type: string` в спеке.
- `removeAdditional: false` — `{label:'ok', extra:1}` теперь даёт 400 вместо вырезания
  `extra`. Соответствует `additionalProperties: false` в спеке.

## Тесты

Новые тесты не добавлял — правило «не ослаблять тесты» и контракт-первый подход:
REVIEWER/TESTER уже защёлклили 5 красных кейсов в `tests/contract/label-negative.test.ts`.
Фикс реализации переводит их из RED → GREEN без правки тестов.

## Gate

Локальный gate из `03-review.md` RECHECK_COMMANDS:

```bash
cd qrsvc-nodejs && npx vitest run && npm run lint && npm run typecheck
```

Результат:
- `Test Files 7 passed (7), Tests 45 passed (45)` — все 5 ранее красных кейсов
  `label-negative.test.ts` (`number`, `boolean`, `array`, `null`, `object`, `extra`)
  теперь зелёные; 40 ранее зелёных — остались зелёными.
- `npm run lint` — OK (eslint 0 warnings, prettier clean).
- `npm run typecheck` — OK (tsc --strict).

## Что не успел / вне дельты

- Findings #4 (нет `400`-ответа в `api/openapi.yaml` для validation errors) и #5
  (`logger: false`, нет correlationId/метрик) — REVIEWER явно пометил как pre-existing
  tech-debt **вне дельты `label`**, не блокирующие. По правилу «только git diff» не трогал.
- Mutation-тестирование (stryker) — tooling отсутствует в проекте, отмечено обоими
  агентами как tech-debt. Не запускал.
- Коммитов не делал (роль DEV не коммитит).

## Риски

- Поведение валидатора изменилось **глобально** для всего сервера, а не только для
  `POST /api/v1/qr`. Все 7 тест-файлов (45 кейсов) зелёные, но если в проект добавят
  новые эндпоинты, рассчитанные на дефолты ajv (`coerceTypes`/`removeAdditional`/
  `useDefaults`), им потребуется явная схема. Это соответствует контракту и
  `feature.md` (input validation через JSON Schema), поэтому считаю допустимым.
- `label: ""` по-прежнему принимается как валидное значение и возвращается verbatim —
  сознательное решение, зафиксированное в `01-dev.md` и покрытое тестом
  `label.test.ts:59`. Без изменений.

---

## RESULT: DONE

## FILES
- `qrsvc-nodejs/src/app.ts` — добавлены `ajv.customOptions` в `buildServer()`.

## TESTS
- Без изменений. Все 45 кейсов (7 файлов) зелёные: `npx vitest run` → `Tests 45 passed (45)`.

## RISKS
- Глобальное отключение дефолтов ajv затрагивает весь сервер, а не только `label`.
  Все существующие тесты зелёные; новые эндпоинты должны явно объявлять схему.
- Findings #4, #5 (pre-existing tech-debt вне дельты) не чинил по правилу «только git diff».
