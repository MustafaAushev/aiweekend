# materialization-contract.md — контракт материализации qrsvc-nodejs

> Определяет, какие файлы из root `harness/` ОБЯЗАТЕЛЬНЫ для qrsvc-nodejs,
> какие — опциональны, а какие не применимы.

## Обязательные (должны быть в каждой материализации)
- `Makefile` — CI/CD оркестрация
- `thresholds.yaml` — пороги (адаптированы под стек)
- Все 6 skills: `feature.md`, `tests.md`, `review.md`, `bugfix.md`, `standard.md`, `database.md`
- Все 7 agents: `resilience.md`, `contracts.md`, `test-matrix.md`, `performance.md`, `vcs.md`, `incident-log.md`, `fix-loop.md`
- `fix_loop.yaml` — лимиты авто-починки

## Опциональные (если применимы к стеку)
- `agents/concurrency.md` — если стек использует shared state / workers
- `agents/observability.md` — если есть метрики/трейсинг
- `agents/security.md` — если есть authz/audit
- `agents/llm-harness.md` — если есть LLM-вызовы
- `evals/` — если есть eval-датасеты

## Не применимы
- Нет (все файлы из root harness имеют аналог в этом стеке или опциональны)

## Синхронизация
При обновлении root `harness/`:
1. Обновить `thresholds.yaml` — особенно пороги (они зависят от стека)
2. Проверить `agents/*.md` на новые/изменённые правила
3. Запустить `make sync-from-root` для проверки полноты