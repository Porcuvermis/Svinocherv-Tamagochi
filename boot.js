// ================= ЗАГРУЗЧИК: ВЕРСИЯ СБОРКИ И SERVICE WORKER =================
// Игровой логики здесь нет. Это то, что отвечает на вопрос «а точно ли на
// телефоне открыт мой последний пуш» — и делает так, чтобы ответ был «да».
//
// Три вещи:
//   1. window.APP_BUILD — идентификатор сборки из <meta name="app-build">.
//      Дублируется в консоль и в штамп #build-stamp (виден в debug-режиме).
//   2. Регистрация sw.js — сеть в приоритете, кеш как страховка (см. sw.js).
//   3. Аварийный выключатель: открыть страницу с ?sw=off — снести service
//      worker и все кеши. Нужен ровно на случай, когда обновление где-то
//      застряло, а под рукой только айфон и никакого devtools.
(function () {
    // Значения подставляются при деплое. Если подстановки не было, значит
    // файл открыт не с Pages (локально из Koder, через file:// и т.п.).
    const readMeta = (name, fallback) => {
        const meta = document.querySelector('meta[name="' + name + '"]');
        const value = meta ? meta.getAttribute('content') : '';
        return (!value || value.indexOf('__') === 0) ? fallback : value;
    };

    const build = readMeta('app-build', 'dev');
    const branch = readMeta('app-branch', 'локально');

    window.APP_BUILD = build;
    window.APP_BRANCH = branch;
    console.log('[Свиночервь] сборка:', build, '| ветка:', branch);

    document.addEventListener('DOMContentLoaded', () => {
        const stamp = document.getElementById('build-stamp');
        if (stamp) stamp.textContent = branch + ' · ' + build;
    });

    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

    const params = new URLSearchParams(location.search);

    if (params.get('sw') === 'off') {
        navigator.serviceWorker.getRegistrations()
            .then((regs) => Promise.all(regs.map((r) => r.unregister())))
            .then(() => (window.caches ? caches.keys() : []))
            .then((keys) => Promise.all(Array.from(keys).map((k) => caches.delete(k))))
            .then(() => {
                console.log('[Свиночервь] service worker и кеши снесены');
                alert('Кеш очищен. Открой ссылку без ?sw=off — загрузится свежая сборка.');
            });
        return;
    }

    // Был ли контроллер ДО регистрации: если не был, значит это первая
    // установка, и перезагружать страницу после активации не надо.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        // Управление перешло к новой сборке — показываем её целиком,
        // а не половину старых скриптов с новым HTML.
        location.reload();
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then((reg) => {
            // Проверяем обновление при каждом возврате в приложение: с
            // домашнего экрана PWA часто не перезагружается неделями.
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update().catch(() => {});
            });
        }).catch((err) => console.warn('[Свиночервь] SW не зарегистрирован:', err));
    });
})();
