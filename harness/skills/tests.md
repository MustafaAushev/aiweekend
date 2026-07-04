# skill: tests (dev-скил, язык-агностик playbook)

> Агент читает как playbook «покрыть задачу тестами». Плейсхолдеры `<ТЕСТ_РАННЕР>`/`<MUTATION_TOOL>`/`<PROPERTY_LIB>` под свой стек. Правила — в `agents/test-matrix.md`.

**Когда:** любая задача, где агент пишет/меняет логику (feature/bugfix/refactor). Тесты — не «в конце», а руль генерации (падающий тест = промпт агенту).

**Форма правила в harness:** следует `agents/test-matrix.md` (T1–T3). Каждый PR агента — ≥1 тест каждого типа + mutation.

**Шаги (что делает агент):**
1. **Edge-cases ДО кода.** Сформулировать unit-тесты на граничные случаи (пустой/невалидный вход, лимиты) — до генерации реализации. Table-driven / property-based.
2. **Три типа = три источника лжи:**
   - **unit** — чистый алгоритм (модель правильно записала);
   - **integration** — контракты внешних (БД/брокер/LLM/HTTP) с инъекцией сбоев (timeout/5xx/duplicate key) через testcontainers/мок;
   - **e2e-smoke** — ключевой путь до конца в staging-like окружении (env/секреты/rate limits).
3. **Property-based на инварианты** (round-trip, монотонность, отсутствие паники) — дефолт фреймворка обычно сотни кейсов, для критичных инвариантов поднимается до ≥1000 (`max_examples`); фреймворк shrink'ает контрпример.
4. **Failing-first.** Убедиться, что без реализации хотя бы один тест падает (иначе спека не зафиксирована).
5. **Mutation — защита от bullshit-тестов.** Инжектить мутантов (`>`→`>=`, убрать `commit`, `return x`→`return null`) → тесты ДОЛЖНЫ упасть; mutation score ≥ `thresholds.yaml quality.mutation_score`.
6. **Недетерминизм LLM (если есть):** не ассертить точный текст — проверять схему/инварианты (см. `agents/llm-harness.md` L4).

**Definition of Done:**
- [ ] ≥1 unit, ≥1 integration (с инъекцией сбоя), ≥1 e2e-smoke.
- [ ] Property-based на ключевой инвариант.
- [ ] Mutation score ≥ порога; инжектированный баг пойман.
- [ ] Тесты падали до реализации (failing-first).
- [ ] Нет `assert True`/дублирующих логику; нет `skip`/`xfail` ради зелёного.
- [ ] Новые тесты СОЗДАНЫ агентом (существующие/harness — immutable, см. fix-loop.md).

**Eval (как harness проверяет):**
- `<ТЕСТ_РАННЕР>` unit+integration+e2e — все зелёные; покрытие hot-path ≥ порога.
- `mutation-gate`: инжект 1–3 семантических багов → тесты падают, иначе fail (bullshit-тесты).
- `flakiness-gate`: прогон ×3 с jitter → pass-rate ≥ `flaky_max_rate`.

**Per-язык идиома:**
- **Go:** `go test` (table-driven) + `-race` + property `gopter`/`rapid` + mutation `go-mutesting`/`gremlins`.
- **`<ВАШ_СТЕК>`:** тест-раннер + property + mutation-инструмент + контейнеры для интеграции под ваш язык (подставь идиомы своего стека или удали строку из профиля).
- **Python:** `pytest`(-asyncio) + `hypothesis` (property) + `mutmut` (mutation) + testcontainers.

🎬 **Что ломается без скила:**
Агент выдаёт 100% coverage на unit с `assert True`, integration нет — в проде не проходит оплата; рефактор теряет `commit`, unit зелёные, e2e ловит; mutation не гоняется → тесты не ловят возвращённый баг. Coverage 90% на bullshit = доверие 0%.
