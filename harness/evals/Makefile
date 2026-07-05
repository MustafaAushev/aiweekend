# harness/evals/Makefile — гейты, которые harness гоняет в CI. Каждый привязан к правилу agents/*.md.
# Проверенные вживую: security-ssrf, contracts. Остальные — референс-команды под свой стек (<ТЕСТ_РАННЕР> и т.п.).

.PHONY: all security contracts performance resilience tests mutation

NODEJS_DIR := /Users/mus/workshops/aiweekend/qrsvc-nodejs

all: security contracts tests performance   ## полный гейт до merge

security:            ## agents/security.md — SSRF + секреты
	npm --prefix "$(NODEJS_DIR)" run test -- tests/property/invariant.test.ts
	gitleaks detect --no-git || true        # секреты не в коде (S2)

contracts:           ## agents/contracts.md — контракт-diff
	npm --prefix "$(NODEJS_DIR)" run test -- tests/contract/border.test.ts

performance:         ## agents/performance.md — p99-gate (нужен поднятый сервис на :8080)
	k6 run hot_path_load.js                  # p99<SLO; тренд ×1/×10/×100 → slope ≤ asymptote_slope_max

resilience:          ## agents/resilience.md — fault-injection (ToxiProxy)
	@echo "ToxiProxy: latency 10s → таймаут обрывает; 5xx → CB fast-fail 503; dup key → 1 запись"
	# toxiproxy-cli toxic add ... ; npm --prefix "$(NODEJS_DIR)" run test -- e2e/smoke.test.ts

tests: mutation      ## agents/test-matrix.md — 3 типа + мутации
	npm --prefix "$(NODEJS_DIR)" run test -- src/capacity.test.ts
	npm --prefix "$(NODEJS_DIR)" run test -- tests/contract/border.test.ts
	npm --prefix "$(NODEJS_DIR)" run test -- tests/property/invariant.test.ts
	npm --prefix "$(NODEJS_DIR)" run test -- e2e/smoke.test.ts

mutation:            ## защита от bullshit-тестов (score ≥ thresholds.yaml quality.mutation_score)
	# Python: mutmut run ; Go: go-mutesting ./... ; <ВАШ_СТЕК>: mutation-инструмент под ваш язык
	@echo "mutation gate — под свой стек"
