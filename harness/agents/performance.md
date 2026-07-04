# ~/workshops/aiweekend/harness/agents/performance.md — правила производительности

> Агент не считает сложность и не знает ваших SLO. Без явных бюджетов он напишет цикл-в-цикле, `SELECT *`, N+1, LLM-вызов в горячем пути без кэша. Бюджеты задаём явно; eval меряет поведение, не форму кода.

## P1. Горячий путь — без суперлинейной сложности
Запрещены вложенные обходы (O(N·M)), N+1 к базе, полное сканирование. Линейный проход по результату допустим; квадратичный по объёму данных — нет. Использовать индексы/мапы/пагинацию/keyset.
Профиль: Go `map[K]V` + sqlc/index · Python `dict`/`set` + SQLAlchemy `selectinload` · `<ВАШ_СТЕК>` — хеш-структуры + JOIN/пагинация + индексы.

## P2. Явные бюджеты на эндпоинт
Каждый эндпоинт горячего пути объявляет: `p50/p99` (из SLA), `max_payload`, `max_batch`. Значения — в `thresholds.yaml`.

## P3. LLM-вызовы (если продукт зовёт LLM)
Не в синхронном цикле по массиву. `max_tokens` + бюджет стоимости на запрос; кэш повторов; batching. Стоимость — метрикой (см. observability).

## Eval (поведенческий, кросс-язычный — НЕ AST)
- **p99-gate:** сид БД/вход датасетом ×10 от прод-объёма → k6 на горячем пути → `p99 < SLO`. (k6 `thresholds: http_req_duration p(99)<...`.)
- **Асимптотика (ловит O(N²) по факту):** прогон на ×1/×10/×100 → **показатель степени** роста p99 по объёму ≤ `asymptote_slope_max` (1=линейно, 2=квадратично). НЕ абсолютный ratio — он ложно валит честно-линейные эндпоинты; горячий путь обязан быть paginated (bounded working set) → рост ≈ константа.
- **N+1 (по числу, не AST):** счётчик SQL-запросов на один HTTP-запрос ≤ порога; всплеск при росте объёма = N+1.
- **LLM-cost:** оффлайн eval-прогон ≤ cost-бюджета; метрика `llm_cost_usd` присутствует.

## Пример: N+1 на горячем пути
БЫЛО (запрос в базу на каждого пользователя):
```python
users = db.query(User).all()
for user in users:
    subs = db.query(Subscription).filter(Subscription.user_id == user.id).all()  # N+1
    process(user, subs)
```
СТАЛО (один запрос `IN` + группировка в словарь, O(N+M)):
```python
users = db.query(User).all()
subs_map = {}
for sub in db.query(Subscription).filter(
        Subscription.user_id.in_([u.id for u in users])).all():
    subs_map.setdefault(sub.user_id, []).append(sub)
for user in users:
    process(user, subs_map.get(user.id, []))
```
N отдельных запросов (по одному на пользователя) → один `IN`-запрос; на горячем пути с сотнями users убирает лавину round-trip'ов к БД. Eval: счётчик SQL/запрос ≤ порога.

**Что запрещено агенту:** `for x in items: db.query(...)` (N+1); `SELECT *` + фильтр в коде; линейный `in list` на горячем пути; LLM-вызов в цикле без batch/cache; хардкод порога вместо `thresholds.yaml`.
