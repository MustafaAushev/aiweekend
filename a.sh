cat > /tmp/part2_prompt.txt <<PART2_EOF
Собери harness воркшопа из файла ${WORKSHOP_FILE}. Найди заголовок «Часть 2 — Сборка harness»
и выполняй ПО ПОРЯДКУ все bash-блоки от него до заголовка «## Практикум», строго дословно:
- файл читай sed-окном по 40–60 строк, не целиком;
- heredoc-блоки (cat > … <<'HARNESS_EOF_Z9' … HARNESS_EOF_Z9) копируй целиком до ограничителя;
- блоки, содержащие opencode run или создающие *_prompt.txt, ПРОПУСКАЙ — их запускает человек;
- после каждого блока сверяйся со строкой «Ожидаем» рядом с ним; команда упала — покажи вывод и остановись.
В конце покажи: ls ~/workshops/aiweekend/harness/agents (ожидается 10 файлов .md),
ls ~/workshops/aiweekend/harness/skills, ls ~/workshops/aiweekend/harness/evals,
ls ~/workshops/aiweekend/harness/*.yaml — и напиши «HARNESS СОБРАН».
PART2_EOF