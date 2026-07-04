# harness/evals/Makefile — гейты, которые harness гоняет в CI. Каждый привязан к правилу agents/*.md.
# Проверенные вживую: security-ssrf, contracts. Остальные — референс-команды под свой стек (<ТЕСТ_РАННЕР> и т.п.).

.PHONY: all security contracts performance resilience tests mutation

all: security contracts tests performance   ## полный гейт до merge

security:            ## agents/security.md — SSRF + секреты
	uv run --with pytest pytest test_ssrf.py -q
	gitleaks detect --no-git || true        # секреты не в коде (S2)

contracts:           ## agents/contracts.md — контракт-diff
	uv run --with pytest --with jsonschema pytest test_contract.py -q

performance:         ## agents/performance.md — p99-gate (нужен поднятый сервис на :8080)
	k6 run hot_path_load.js                  # p99<SLO; тренд ×1/×10/×100 → slope ≤ asymptote_slope_max

resilience:          ## agents/resilience.md — fault-injection (ToxiProxy)
	@echo "ToxiProxy: latency 10s → таймаут обрывает; 5xx → CB fast-fail 503; dup key → 1 запись"
	# toxiproxy-cli toxic add ... ; <ТЕСТ_РАННЕР> -m resilience

tests: mutation      ## agents/test-matrix.md — 3 типа + мутации
	<ТЕСТ_РАННЕР> unit integration e2e-smoke

mutation:            ## защита от bullshit-тестов (score ≥ thresholds.yaml quality.mutation_score)
	# Python: mutmut run ; Go: go-mutesting ./... ; <ВАШ_СТЕК>: mutation-инструмент под ваш язык
	@echo "mutation gate — под свой стек"
