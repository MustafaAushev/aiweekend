# Makefile — qrsvc-nodejs/harness

NODE := node
NPX := npx

.PHONY: gatets skills agents all

## ============================================================
## GATE: Проверка наличия всех файлов harness
## ============================================================

gatets:
	@echo "[GATE] Verifying all harness files exist..."
	@FAIL=0; \
	for f in skills/feature.md skills/tests.md skills/review.md skills/bugfix.md skills/standard.md skills/database.md agents/resilience.md agents/contracts.md agents/test-matrix.md agents/performance.md agents/vcs.md Makefile; do \
	  if [ ! -f "$$f" ]; then \
	    echo "  FAIL: $$f not found"; FAIL=1; \
	  else \
	    echo "  OK:   $$f"; \
	  fi; \
	done; \
	if [ "$$FAIL" -eq 1 ]; then \
	  echo "[GATE] FAIL -- missing files"; exit 1; \
	else \
	  echo "[GATE] PASS -- all 12 files present"; \
	fi

## ============================================================
## SKILL TESTS (self-check)
## ============================================================

check-skills:
	@echo "[SKILL-CHECK] Scanning for contract violations in skill files..."
	@FAIL=0; \
	for f in skills/*.md; do \
	  name=$$(basename "$$f" .md); \
	  for section in "Назначение" "Входы/выходы" "Non-negotiables" "Workflow" "Stack binding" "Quality gates" "Bad/good" "Definition of Done" "Stop / escalation rules" "Audit trail"; do \
	    if ! grep -q "$$section" "$$f"; then \
	      echo "  FAIL: $$f missing section '$$section'"; FAIL=1; \
	    fi; \
	  done; \
	  if LC_ALL=C grep -qE '<[A-Z][A-Z_0-9]{6,}>' "$$f" 2>/dev/null; then \
	    echo "  FAIL: $$f contains placeholder(s)"; FAIL=1; \
	  fi; \
	done; \
	if [ "$$FAIL" -eq 1 ]; then \
	  echo "[SKILL-CHECK] FAIL"; exit 1; \
	else \
	  echo "[SKILL-CHECK] PASS"; \
	fi

## ============================================================
## AGENT RULES CHECKS
## ============================================================

check-agents:
	@echo "[AGENT-CHECK] Scanning agent rules..."
	@FAIL=0; \
	for f in agents/*.md; do \
	  lines=$$(wc -l < "$$f" | tr -d ' '); \
	  if [ "$$lines" -lt 10 ] || [ "$$lines" -gt 300 ]; then \
	    echo "  FAIL: $$f -- $$lines lines (target 10-300)"; FAIL=1; \
	  else \
	    echo "  OK:   $$f -- $$lines lines"; \
	  fi; \
	  for section in "Non-negotiables" "Quality gates" "Bad/good" "Stop rules"; do \
	    if ! grep -q "$$section" "$$f"; then \
	      echo "  FAIL: $$f missing section '$$section'"; FAIL=1; \
	    fi; \
	  done; \
	  if LC_ALL=C grep -qE '<[A-Z][A-Z_0-9]{6,}>' "$$f" 2>/dev/null; then \
	    echo "  FAIL: $$f contains placeholder(s)"; FAIL=1; \
	  fi; \
	done; \
	if [ "$$FAIL" -eq 1 ]; then \
	  echo "[AGENT-CHECK] FAIL"; exit 1; \
	else \
	  echo "[AGENT-CHECK] PASS"; \
	fi

## ============================================================
## COMPOSITE TARGETS
## ============================================================

skills: check-skills
agents: check-agents
all: gatets skills agents
	@echo "[ALL] All harness checks pass."

## ============================================================
## ECHO -- list all materialized files
## ============================================================

## ============================================================
## SYNC — проверка наличия всех обязательных файлов из root harness
## ============================================================

REQUIRED_FILES := thresholds.yaml fix_loop.yaml
REQUIRED_AGENTS := incident-log.md fix-loop.md

sync-from-root:
	@echo "[SYNC] Checking required files from root harness..."
	@FAIL=0; \
	for f in $(REQUIRED_FILES); do \
	  if [ ! -f "$$f" ]; then \
	    echo "  MISSING: $$f (copy from ../harness/$$f)"; FAIL=1; \
	  else \
	    echo "  OK: $$f"; \
	  fi; \
	done; \
	for f in $(REQUIRED_AGENTS); do \
	  if [ ! -f "agents/$$f" ]; then \
	    echo "  MISSING: agents/$$f (copy from ../harness/agents/$$f)"; FAIL=1; \
	  else \
	    echo "  OK: agents/$$f"; \
	  fi; \
	done; \
	if [ "$$FAIL" -eq 1 ]; then \
	  echo "[SYNC] FAIL — run 'make sync-from-root' to copy missing files"; exit 1; \
	else \
	  echo "[SYNC] PASS — all required files present"; \
	fi

ls-files:
	@echo "=== Skills ==="
	@ls -1 skills/*.md
	@echo "=== Agents ==="
	@ls -1 agents/*.md
	@echo "=== Config ==="
	@ls -1 Makefile thresholds.yaml fix_loop.yaml 2>/dev/null || true
	@echo "=== Total ==="
	@ls skills/*.md agents/*.md Makefile 2>/dev/null | wc -l | tr -d ' '