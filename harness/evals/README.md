# harness/evals/ — гейты качества (карта eval → правило)

Evals — это **код** (тесты/скрипты), который ловит нарушение правил `agents/*.md` на каждом прогоне. Агент не читает OWASP — агент **краснеет на тесте**. Человек владеет evals (immutable для агента, см. `fix_loop.yaml`).

| Eval | Проверяет правило | Статус |
|---|---|---|
| `test_ssrf.py` | `agents/security.md` S4 — SSRF заблокирован до сети (metadata/private/loopback) | ✅ прогнан вживую (12 passed) |
| `test_contract.py` | `agents/contracts.md` — контракт-diff ловит переименование/пропажу поля | ✅ прогнан вживую (3 passed) |
| `hot_path_load.js` | `agents/performance.md` — p99-gate (k6, open-loop) + тренд-асимптотика | референс (нужен сервис :8080) |
| `Makefile` (`resilience`) | `agents/resilience.md` — fault-injection (ToxiProxy): таймаут/CB/идемпотентность | референс-команды |
| `Makefile` (`mutation`) | `agents/test-matrix.md` — защита от bullshit-тестов | референс (mutmut/PIT/go-mutesting) |

## Запуск
```bash
cd ~/workshops/aiweekend/harness/evals
make security contracts   # рабочие сразу: pytest, без внешних сервисов
make security             # только SSRF + gitleaks
make contracts            # только jsonschema contract-diff
# make all: после того как заполнишь <ТЕСТ_РАННЕР> под свой стек и поднимешь сервис :8080
```

Пороги — из `../thresholds.yaml` (примеры под калибровку SLO). Плейсхолдеры `<ТЕСТ_РАННЕР>` заполняются под свой стек (профили — в `agents/*.md`).
