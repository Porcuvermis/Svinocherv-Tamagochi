#!/usr/bin/env bash
# Страница со списком сборок: /preview/index.html
#
# Живёт отдельным файлом, а не heredoc'ом внутри workflow: там она попадала
# бы в YAML-блок и ломала бы отступы, да и править вёрстку в yaml неудобно.
#
# Читает переменные окружения:
#   STAMP       — время сборки (UTC)
#   TOP_BRANCH  — ветка, которая сейчас лежит в корне сайта
#   TOP_LABEL   — её версия
#   ROWS        — уже готовые <li> с ветками
#
#   STAMP=... TOP_BRANCH=... TOP_LABEL=... ROWS=... bash tools/preview-index.sh
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
<p class="sub">В приложении всегда самая свежая ветка — этот список нужен,
только если надо вернуться к какой-то конкретной. Обновлено $STAMP UTC.</p>
<ul>
    <li class="main"><a href="../">Открыть приложение</a><span>сейчас там: $TOP_BRANCH · $TOP_LABEL</span></li>
    $ROWS
</ul>
<script>
// Время коммитов приходит unix-метками, а показывать его надо по часам
// телефона — иначе ветки от разных авторов светят разными поясами.
(function () {
    var now = Date.now() / 1000;
    var units = [
        [60, 'только что', null],
        [3600, 'мин назад', 60],
        [86400, 'ч назад', 3600],
        [86400 * 7, 'дн назад', 86400]
    ];
    Array.prototype.forEach.call(document.querySelectorAll('time[data-ts]'), function (el) {
        var ts = parseInt(el.getAttribute('data-ts'), 10);
        if (!ts) return;
        var d = new Date(ts * 1000);
        var diff = now - ts;
        var text = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
                 + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        for (var i = 0; i < units.length; i++) {
            if (diff < units[i][0]) {
                text = units[i][2] ? Math.floor(diff / units[i][2]) + ' ' + units[i][1] : units[i][1];
                break;
            }
        }
        el.textContent = text;
        el.setAttribute('datetime', d.toISOString());
    });
})();
</script>
</body>
</html>
HTML
