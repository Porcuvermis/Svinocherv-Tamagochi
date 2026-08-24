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
//
// ---------- ПРО «ИГРА ЗАГРУЖАЕТСЯ ДВА РАЗА» ----------
// Симптом: с домашнего экрана открывается игра, моргает и загружается ещё
// раз. Это не кеш телефона и не подстановка старой картинки — это вот эта
// самая перезагрузка на controllerchange, только раньше она случалась НА
// ГЛАЗАХ. Механика: при каждом деплое в sw.js подставляется новый номер
// сборки, значит файл байт-в-байт другой, значит браузер ставит новый
// service worker; он делает skipWaiting + clients.claim, управление
// переходит к нему, и страница перезагружается — уже после того, как игра
// нарисовалась. Отсюда двойной запуск после каждого пуша.
//
// Перезагрузка нужна (иначе можно остаться с половиной старых скриптов при
// новом HTML), поэтому убрана не она, а её видимость:
//   • регистрация не ждёт window.load — обновление начинает ставиться,
//     пока экран ещё чёрный;
//   • пелена держится, пока идёт проверка обновления и установка новой
//     сборки, — перезагрузка происходит под чернотой, игрок видит одну
//     загрузку вместо двух;
//   • если сборка приехала на ходу (игрок вернулся в приложение, и update()
//     нашёл новую), экран сначала уходит в чёрное и только потом
//     перезагружается — не моргает.
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

    // Пелена может отсутствовать (файл не подключён, старый браузер) —
    // тогда всё работает как раньше, просто без прикрытия.
    const veil = {
        hold(token) { if (window.BootScreen) window.BootScreen.hold(token); },
        release(token) { if (window.BootScreen) window.BootScreen.release(token); },
        isVeiled() { return !!(window.BootScreen && window.BootScreen.isVeiled()); }
    };

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

    // Страховка от петли перезагрузок: если по какой-то причине контроллер
    // меняется снова и снова, лучше остаться на старой сборке, чем крутить
    // бесконечный чёрный экран. Метка живёт только в текущей сессии вкладки.
    const RELOAD_MARK = 'svinocherv:sw-reload';
    const RELOAD_GUARD_MS = 15000;

    function reloadForNewBuild() {
        let last = 0;
        try { last = Number(sessionStorage.getItem(RELOAD_MARK)) || 0; } catch (err) { /* приватный режим */ }

        if (Date.now() - last < RELOAD_GUARD_MS) {
            console.warn('[Свиночервь] перезагрузка под новую сборку уже была — пропускаем');
            veil.release('sw-check');
            veil.release('sw-install');
            return;
        }

        try { sessionStorage.setItem(RELOAD_MARK, String(Date.now())); } catch (err) { /* приватный режим */ }

        // Управление перешло к новой сборке — показываем её целиком,
        // а не половину старых скриптов с новым HTML.
        if (veil.isVeiled() || !window.BootScreen) {
            location.reload();
        } else {
            // Игрок уже видит игру: уводим экран в чёрное, чтобы обновление
            // выглядело как затемнение, а не как сбой.
            window.BootScreen.coverThenReload();
        }
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        reloadForNewBuild();
    });

    // Пока новая сборка ставится, пелена не уходит: сразу за установкой
    // прилетит перезагрузка, и увидеть её игрок не должен.
    const INSTALL_HOLD_MS = 5000;   // если установка зависла
    const UPDATE_CHECK_MS = 2500;   // если сеть не отвечает на запрос sw.js

    function holdWhileInstalling(worker) {
        if (!worker || !hadController) return;

        veil.hold('sw-install');
        const failsafe = setTimeout(() => veil.release('sw-install'), INSTALL_HOLD_MS);

        worker.addEventListener('statechange', () => {
            // 'activated' пелену НЕ снимает: следом идёт controllerchange и
            // перезагрузка, снимать черноту на один кадр незачем.
            if (worker.state === 'redundant') {
                clearTimeout(failsafe);
                veil.release('sw-install');
            }
        });
    }

    // Ключевой момент всей затеи. Браузер узнаёт о новой сборке не мгновенно:
    // он тянет sw.js и сравнивает побайтно, и это занимает столько, сколько
    // занимает сеть. Если просто открыть экран по готовности игры, ответ
    // придёт уже после — и перезагрузка случится на глазах. Ровно это и
    // выглядело как «загрузилось два раза».
    //
    // Поэтому пелена ждёт результат проверки: reg.update() резолвится, когда
    // проверка закончена (а если сборка новая — когда она уже установлена).
    // Дальше одно из двух: обновления нет — открываем экран; обновление есть
    // — его hold держит черноту до перезагрузки.
    //
    // Ждём не бесконечно: мобильная сеть умеет не отвечать вовсе, а чёрный
    // экран из-за молчащего запроса — цена явно выше пользы.
    let checkTimer = null;
    if (hadController) {
        veil.hold('sw-check');
        checkTimer = setTimeout(() => veil.release('sw-check'), UPDATE_CHECK_MS);
    }

    const doneChecking = () => {
        clearTimeout(checkTimer);
        veil.release('sw-check');
    };

    // Раньше регистрация ждала window.load. Теперь — сразу: чем раньше
    // начнётся проверка обновления, тем больше шансов, что перезагрузка
    // уложится в чёрный экран и игрок увидит одну загрузку вместо двух.
    navigator.serviceWorker.register('sw.js').then((reg) => {
        holdWhileInstalling(reg.installing || reg.waiting);
        reg.addEventListener('updatefound', () => holdWhileInstalling(reg.installing));

        // Проверяем обновление при каждом возврате в приложение: с
        // домашнего экрана PWA часто не перезагружается неделями.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });

        return reg.update();
    }).catch((err) => {
        console.warn('[Свиночервь] SW: проверка обновления не удалась:', err);
    }).then(doneChecking);
})();
