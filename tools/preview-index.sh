#!/usr/bin/env bash
# Страница со списком сборок: /preview/index.html
#
# Живёт отдельным файлом, а не heredoc'ом внутри workflow: там она попадала
# бы в YAML-блок и ломала бы отступы, да и править вёрстку в yaml неудобно.
#
# Читает переменные окружения:
#   STAMP      — время сборки (UTC)
#   MAIN_LABEL — версия основной сборки
#   ROWS       — уже готовые <li> с ветками
#
#   STAMP=... MAIN_LABEL=... ROWS=... bash tools/preview-index.sh > index.html
set -e

cat <<HTML
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1a1a1a">
<title>Свиночервь: сборки</title>
<style>
    body { margin: 0; padding: 24px 16px calc(24px + env(safe-area-inset-bottom, 0px));
           background: #1a1a1a; color: #ededed;
           font: 16px/1.5 -apple-system, system-ui, sans-serif; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p.sub { margin: 0 0 24px; color: #8a8a8a; font-size: 13px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { margin: 0 0 12px; background: #242424; border-radius: 12px; }
    li a { display: block; padding: 14px 16px 2px; color: #a9e817;
           text-decoration: none; font-weight: 600; word-break: break-all; }
    li span { display: block; padding: 0 16px 14px; color: #8a8a8a;
              font-size: 13px; word-break: break-word; }
    li.main { background: #2f2431; }
    li.main a { color: #ebd1bc; }
    p.empty { color: #8a8a8a; }
</style>
</head>
<body>
<h1>Сборки Свиночервя</h1>
<p class="sub">Обновлено $STAMP UTC</p>
<ul>
    <li class="main"><a href="../">Основная версия — main</a><span>$MAIN_LABEL</span></li>
    $ROWS
</ul>
</body>
</html>
HTML
