# run_state — qrsvc-nodejs-materialization

phase: R1 (challenge, 3 judges parallel isolated)
cycle: 1
day_of_month: 5

role_model_assignment (deterministic by (day+cycle) mod 3):
  - Скептик   → deepseek/deepseek-v4-pro   (provider order: baidu,together)
  - Реалист   → z-ai/glm-5.2               (provider sort: throughput)
  - Визионер  → moonshotai/kimi-k2.7-code  (provider default)

calls_used: 0
judge_results:
  - Скептик:   pending
  - Реалист:   pending
  - Визионер:  pending

artifact_set:
  - harness/skills/feature.md
  - harness/skills/tests.md
  - harness/skills/review.md
  - harness/skills/bugfix.md
  - harness/skills/standard.md
  - harness/skills/database.md
  - harness/agents/resilience.md
  - harness/agents/contracts.md
  - harness/agents/test-matrix.md
  - harness/agents/performance.md
  - harness/agents/vcs.md
  - harness/Makefile

fact_card: see panel/qrsvc-nodejs-materialization/fact-card.md (1 per cycle)
next_step: после R1 — выбрать ветку R2 по 4-веточной схеме expert-panel.md
