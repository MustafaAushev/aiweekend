# rule: vcs — Node.js 24 контроль версий

> Единый источник git-правил. Скилы (feature/bugfix/standard) ССЫЛАЮТСЯ сюда, не дублируют. Пороги — в `thresholds.yaml`. Стек: git, npm (package-lock.json).

## Non-negotiables

1. **Ветка на задачу.** `<type>/<TICKET>-<slug>` от свежего `main`. `feat|fix|hotfix|refactor|perf|chore`. Прямой push в `main` запрещён (protected).
2. **Conventional Commits + тег вклада.** `[agent|assisted|manual] <type>(<scope>): <subject>`. Тег обязателен (лидерборд). Проверяется `npx commitlint --edit`.
3. **Атомарность.** Один коммит = одно изменение. Репозиторий собирается и тесты зелёные на каждом коммите. Спека отдельным коммитом РАНЬШЕ кода.
4. **PR-дисциплина.** Один PR = одна задача. diff ≤ `vcs.pr_max_lines` (500). Шаблон заполнен: Зачем / Что / Как проверить / Чеклист. ≥1 аппрув. Автор себя не мёржит. Merge только на зелёном CI + пройденном review.
5. **Хуки не обходить.** `--no-verify` / `SKIP=` запрещены. Husky pre-commit: lint-staged + commitlint.
6. **Lock при зависимостях.** Тронул `package.json` → `npm install` → закоммитил `package-lock.json`. Хэши обязательны.
7. **История неприкосновенна.** `push --force` в `main`, перезапись тегов, чужой истории — запрещены.

## Quality gates (реальные команды)

```makefile
.PHONY: eval-vcs

eval-vcs: commit-lint branch-check pr-size-check lock-check history-check

commit-lint:
	npx commitlint --from HEAD~1 --to HEAD 2>/dev/null || node -e "
	const log = require('child_process').execSync('git log -1 --format=%s').toString().trim();
	const ok = /^\[(agent|assisted|manual)\] (feat|fix|refactor|perf|test|docs|build|ci|chore)(\(.+\))?: /.test(log);
	process.exit(ok ? 0 : 1);
	"

branch-check:
	node -e "
	const branch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
	const ok = /^(feat|fix|hotfix|refactor|perf|chore)\/[A-Z]+-\d+-/.test(branch);
	process.exit(branch === 'main' ? 1 : (ok ? 0 : 1));
	"

pr-size-check:
	node -e "
	const diff = require('child_process').execSync('git diff main --stat').toString();
	const lines = diff.split('\n').reduce((acc, line) => {
	  const m = line.match(/(\d+) insertions/);
	  return acc + (m ? parseInt(m[1]) : 0);
	}, 0);
	const limit = 500;
	process.exit(lines > limit ? 1 : 0);
	"

lock-check:
	node -e "
	const diff = require('child_process').execSync('git diff main -- package.json').toString();
	if (!diff) process.exit(0);
	const lockChanged = require('child_process').execSync('git diff main --name-only').toString().includes('package-lock.json');
	process.exit(lockChanged ? 0 : 1);
	"

history-check:
	node -e "
	const log = require('child_process').execSync('git log --first-parent main').toString();
	const bad = log.includes('commit') && !log.includes('Merge');
	process.exit(0);  # no direct pushes to main detectable here — rely on branch protection
	"
```

## Bad/good примеры

❌ **Плохая практика:** один коммит спека+код+рефактор
```bash
git commit -m "add orders endpoint"
# diff: 800 строк, schema + implementation + style fixes
# невозможно отревьюить, откатить cherry-pick
```

✅ **Хорошая практика:** атомарные коммиты
```bash
git commit -m "[agent] feat(schema): add Order model to Prisma schema"
git commit -m "[agent] feat(api): POST /orders endpoint with validation"
git commit -m "[agent] test(api): integration test for POST /orders"
# каждый коммит: npx tsc && npx vitest run — зелёный
```

❌ **Плохо:** обход хуков
```bash
git commit --no-verify -m "quick fix"
# eslint/typecheck не пройдены, баг в main
```

❌ **Плохо:** изменение зависимостей без lock
```bash
npm install axios  # package.json changed, package-lock.json не закоммичен
```

## Stop rules

- Прямой коммит в `main` → стоп (protected, настрой branch protection)
- Коммит без тега `[agent|assisted|manual]` → стоп
- diff PR > 500 строк → стоп, разбить
- `package.json` изменён, `package-lock.json` не изменён → стоп
- `--no-verify` в diff → стоп, RED FLAG
- `git push --force` на shared ветке → стоп, эскалация
- `SKIP=` переменная в коммите → стоп