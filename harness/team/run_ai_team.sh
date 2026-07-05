#!/usr/bin/env bash
set -euo pipefail

ROOT="${AIW_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PROJECT="${AIW_PROJECT:-qrsvc-nodejs}"
PROJECT_DIR="$ROOT/$PROJECT"
TEAM_DIR="$ROOT/harness/team"
ROLE_DIR="$TEAM_DIR/role-cards"
WORK_DIR="$ROOT/.ai-team"
PROMPT_DIR="$WORK_DIR/prompts"
HANDOFF_DIR="$WORK_DIR/handoff"
LOG_DIR="$WORK_DIR/logs"
VERDICT_DIR="$WORK_DIR/verdicts"

TEAM_MODEL="${TEAM_MODEL:-devhands/z-ai/glm-5.2}"
COUNCIL_MODELS="${COUNCIL_MODELS:-devhands/deepseek/deepseek-v4-pro devhands/z-ai/glm-5.2 devhands/moonshotai/kimi-k2.7-code}"
DRY_RUN="${TEAM_DRY_RUN:-0}"

mkdir -p "$PROMPT_DIR" "$HANDOFF_DIR" "$LOG_DIR" "$VERDICT_DIR"

usage() {
  cat <<'USAGE_EOF'
Usage:
  harness/team/run_ai_team.sh first "task text"
  harness/team/run_ai_team.sh fix-review
  harness/team/run_ai_team.sh council
  harness/team/run_ai_team.sh fix-council "majority findings"

Env:
  TEAM_MODEL=devhands/z-ai/glm-5.2
  COUNCIL_MODELS="devhands/deepseek/deepseek-v4-pro devhands/z-ai/glm-5.2 devhands/moonshotai/kimi-k2.7-code"
  AIW_PROJECT=qrsvc-nodejs
  TEAM_DRY_RUN=1
USAGE_EOF
}

need_file() {
  if [ ! -f "$1" ]; then
    echo "СТОП: нет файла $1" >&2
    exit 1
  fi
}

need_project() {
  if [ ! -d "$PROJECT_DIR" ]; then
    echo "СТОП: нет проекта $PROJECT_DIR" >&2
    exit 1
  fi
}

run_model() {
  local model="$1"
  local prompt_file="$2"
  local out_file="$3"
  local log_file="$4"

  if [ "$DRY_RUN" = "1" ]; then
    {
      echo "DRY_RUN model=$model"
      echo "PROMPT=$prompt_file"
      echo "OUT=$out_file"
    } | tee "$out_file" > "$log_file"
    return 0
  fi

  opencode run --model "$model" --dir "$ROOT" "$(cat "$prompt_file")" < /dev/null | tee "$out_file" > "$log_file"
}

git_snapshot() {
  local out="$1"
  if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$PROJECT_DIR" diff --binary > "$out"
  else
    : > "$out"
  fi
}

assert_reviewer_readonly() {
  local before="$1"
  local after="$2"
  if ! cmp -s "$before" "$after"; then
    echo "СТОП: reviewer изменил проект. Он должен быть read-only." >&2
    echo "Смотри diff: git -C \"$PROJECT_DIR\" diff" >&2
    exit 1
  fi
}

write_prompt_dev_first() {
  local task="$1"
  need_file "$ROLE_DIR/dev.md"
  cat > "$PROMPT_DIR/01-dev.md" <<PROMPT_EOF
$(cat "$ROLE_DIR/dev.md")

ЗАДАЧА:
$task

Работай в каталоге запуска $ROOT. Проект: $PROJECT/.
Сначала используй project-local harness: $PROJECT/harness/skills/feature.md.
Итог запиши в $HANDOFF_DIR/01-dev.md.
PROMPT_EOF
}

write_prompt_tester() {
  need_file "$ROLE_DIR/tester.md"
  cat > "$PROMPT_DIR/02-tester.md" <<PROMPT_EOF
$(cat "$ROLE_DIR/tester.md")

Прочитай $HANDOFF_DIR/01-dev.md и изменения проекта $PROJECT/.
Сначала используй project-local harness: $PROJECT/harness/skills/tests.md.
Итог запиши в $HANDOFF_DIR/02-tester.md.
PROMPT_EOF
}

write_prompt_reviewer() {
  local round="$1"
  need_file "$ROLE_DIR/reviewer.md"
  cat > "$PROMPT_DIR/${round}-reviewer.md" <<PROMPT_EOF
$(cat "$ROLE_DIR/reviewer.md")

Прочитай handoff в $HANDOFF_DIR/ и diff проекта $PROJECT/.
Сначала используй project-local harness: $PROJECT/harness/skills/review.md.
Код не правь. Итог запиши в $HANDOFF_DIR/${round}-review.md.
PROMPT_EOF
}

write_prompt_dev_fix_review() {
  need_file "$ROLE_DIR/dev.md"
  cat > "$PROMPT_DIR/04-dev-fix-review.md" <<PROMPT_EOF
$(cat "$ROLE_DIR/dev.md")

Reviewer вернул работу. Прочитай $HANDOFF_DIR/03-review.md.
Почини только реальные findings, тесты не ослабляй, общий harness не трогай.
Итог запиши в $HANDOFF_DIR/04-dev-fix.md.
PROMPT_EOF
}

write_prompt_council() {
  need_file "$ROLE_DIR/techlead-council.md"
  cat > "$PROMPT_DIR/06-council.md" <<PROMPT_EOF
$(cat "$ROLE_DIR/techlead-council.md")

Действуй по $ROOT/harness/skills/expert-panel.md.
Артефакт на приёмку:
- проект $PROJECT/;
- project-local harness $PROJECT/harness/;
- handoff $HANDOFF_DIR/*.md.

Не доверяй reviewer слепо. Пересуди результат сам.
Пиши строки VERDICT:<criterion>:PASS|FAIL|INCONCLUSIVE - reason.
В конце напиши OVERALL: PASS|FAIL|INCONCLUSIVE.
PROMPT_EOF
}

write_prompt_dev_fix_council() {
  local findings="$1"
  need_file "$ROLE_DIR/dev.md"
  cat > "$PROMPT_DIR/07-dev-fix-council.md" <<PROMPT_EOF
$(cat "$ROLE_DIR/dev.md")

Совет-техлид вернул работу с majority findings:
$findings

Почини $PROJECT/ строго по findings. Тесты не ослабляй, общий harness не трогай.
Итог запиши в $HANDOFF_DIR/07-dev-council-fix.md.
PROMPT_EOF
}

cmd_first() {
  need_project
  local task="${1:-}"
  if [ -z "$task" ]; then
    echo "СТОП: передай задачу строкой" >&2
    usage
    exit 1
  fi

  printf '%s\n' "$task" > "$WORK_DIR/00-task.md"

  write_prompt_dev_first "$task"
  run_model "$TEAM_MODEL" "$PROMPT_DIR/01-dev.md" "$HANDOFF_DIR/01-dev.md" "$LOG_DIR/01-dev.log"

  write_prompt_tester
  run_model "$TEAM_MODEL" "$PROMPT_DIR/02-tester.md" "$HANDOFF_DIR/02-tester.md" "$LOG_DIR/02-tester.log"

  write_prompt_reviewer "03"
  local before="$WORK_DIR/reviewer-before.diff"
  local after="$WORK_DIR/reviewer-after.diff"
  git_snapshot "$before"
  run_model "$TEAM_MODEL" "$PROMPT_DIR/03-reviewer.md" "$HANDOFF_DIR/03-review.md" "$LOG_DIR/03-review.log"
  git_snapshot "$after"
  assert_reviewer_readonly "$before" "$after"

  echo "OK: первый проход команды готов. Смотри $HANDOFF_DIR/03-review.md"
}

cmd_fix_review() {
  need_project
  need_file "$HANDOFF_DIR/03-review.md"

  write_prompt_dev_fix_review
  run_model "$TEAM_MODEL" "$PROMPT_DIR/04-dev-fix-review.md" "$HANDOFF_DIR/04-dev-fix.md" "$LOG_DIR/04-dev-fix.log"

  write_prompt_reviewer "05"
  local before="$WORK_DIR/reviewer-r2-before.diff"
  local after="$WORK_DIR/reviewer-r2-after.diff"
  git_snapshot "$before"
  run_model "$TEAM_MODEL" "$PROMPT_DIR/05-reviewer.md" "$HANDOFF_DIR/05-review-r2.md" "$LOG_DIR/05-review-r2.log"
  git_snapshot "$after"
  assert_reviewer_readonly "$before" "$after"

  echo "OK: review-loop готов. Смотри $HANDOFF_DIR/05-review-r2.md"
}

cmd_council() {
  need_project
  write_prompt_council

  local pids=()
  for model in $COUNCIL_MODELS; do
    local slug="${model//\//_}"
    run_model "$model" "$PROMPT_DIR/06-council.md" "$VERDICT_DIR/council_${slug}.md" "$LOG_DIR/council_${slug}.log" &
    pids+=("$!")
  done

  local status=0
  for pid in "${pids[@]}"; do
    wait "$pid" || status=1
  done

  if [ "$status" -ne 0 ]; then
    echo "СТОП: один из судей упал, смотри $LOG_DIR/council_*.log" >&2
    exit "$status"
  fi

  echo "OK: council verdicts готовы:"
  ls "$VERDICT_DIR"/council_*.md
}

cmd_fix_council() {
  need_project
  local findings="${1:-}"
  if [ -z "$findings" ]; then
    echo "СТОП: передай majority findings строкой" >&2
    usage
    exit 1
  fi

  printf '%s\n' "$findings" > "$HANDOFF_DIR/06-council-findings.md"
  write_prompt_dev_fix_council "$findings"
  run_model "$TEAM_MODEL" "$PROMPT_DIR/07-dev-fix-council.md" "$HANDOFF_DIR/07-dev-council-fix.md" "$LOG_DIR/07-dev-council-fix.log"
  echo "OK: dev получил findings совета. Смотри $HANDOFF_DIR/07-dev-council-fix.md"
}

case "${1:-}" in
  first)
    shift
    cmd_first "$*"
    ;;
  fix-review)
    shift
    cmd_fix_review
    ;;
  council)
    shift
    cmd_council
    ;;
  fix-council)
    shift
    cmd_fix_council "$*"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "СТОП: неизвестный режим ${1:-}" >&2
    usage
    exit 1
    ;;
esac
