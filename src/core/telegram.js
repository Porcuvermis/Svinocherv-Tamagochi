// ================= МОСТ В TELEGRAM =================
// Игра живёт двумя жизнями: как обычная страница (иконка на домашнем экране,
// вся разработка идёт так — инвариант 7) и как мини-приложение Telegram.
// Здесь всё, что нужно сделать ВТОРОЙ жизни, и ничего из того, без чего не
// работает первая.
//
// ---------- ПОЧЕМУ БИБЛИОТЕКА ГРУЗИТСЯ ОТСЮДА, А НЕ ИЗ index.html ----------
// telegram-web-app.js — единственная внешняя зависимость игры в рантайме, и
// подключать её тегом в head нельзя: это запрос на чужой хост при КАЖДОМ
// запуске, включая запуск иконкой с домашнего экрана и запуск без сети. А
// нужна она ровно в одном случае из всех — когда игру открыли внутри
// Telegram.
//
// Поэтому здесь то же решение, что с three.js у зависти: библиотека
// подгружается только тогда, когда её есть кому использовать. Признак —
// параметры, которые Telegram сам дописывает в адрес мини-приложения
// (`tgWebAppData`, `tgWebAppVersion`) или мост вебвью на iOS. Нет признака —
// нет запроса, и игра работает как обычная страница (инвариант 7).
//
// ---------- ЧТО ЗДЕСЬ ДЕЛАЕТСЯ И ЗАЧЕМ ----------
//   ready()               — сказать Telegram, что можно убирать свой заглушку;
//   expand()              — развернуть на всю высоту, иначе игра открывается
//                           в половину экрана и холст ужимается вдвое;
//   disableVerticalSwipes() — САМОЕ ВАЖНОЕ для этой игры. Без этого любой
//                           вертикальный жест внутри мини-приложения тянет
//                           вниз само окно Telegram и сворачивает его. А у
//                           нас вертикальными жестами сделано управление:
//                           рычаг автомата тянут вниз, хвост в ванной водят
//                           вверх-вниз, по грядке ведут лопатой. Без запрета
//                           половина игры в Telegram неиграбельна;
//   цвета шапки и фона    — чёрные, как пелена загрузки: иначе вокруг игры
//                           светлая рамка клиента и та самая вспышка белым,
//                           с которой боролись в самой игре.
//
// Тактильная отдача живёт не здесь, а в src/core/haptics.js: она нужна и вне
// Telegram (Android умеет vibrate), и знать про неё должен один слой.
const TelegramBridge = {

    SDK: 'https://telegram.org/js/telegram-web-app.js',

    app() {
        const w = (typeof window !== 'undefined') ? window : null;
        return (w && w.Telegram && w.Telegram.WebApp) ? w.Telegram.WebApp : null;
    },

    // Открыты ли мы ВНУТРИ Telegram. Три признака, любого достаточно:
    // библиотека уже есть (клиент вставил её сам), в адресе лежат параметры
    // мини-приложения, или это вебвью iOS-клиента со своим мостом.
    inTelegram() {
        if (this.app()) return true;
        if (typeof window === 'undefined') return false;
        if (window.TelegramWebviewProxy) return true;
        const addr = (location.hash || '') + (location.search || '');
        return addr.indexOf('tgWebApp') !== -1;
    },

    init() {
        if (!this.inTelegram()) return;     // обычная страница — и хорошо
        const app = this.app();
        if (app) { this.setup(app); return; }

        const el = document.createElement('script');
        el.src = this.SDK;
        el.async = true;
        // Не приехала (нет сети, заблокирован хост) — игра просто работает
        // как страница: ни одна механика от этой библиотеки не зависит.
        el.onload = () => { const a = this.app(); if (a) this.setup(a); };
        document.head.appendChild(el);
    },

    // Каждый вызов обёрнут отдельно: методы появлялись в разных версиях Bot
    // API, и на клиенте постарше отсутствующий метод — это исключение, а не
    // молчаливый ноль. Один упавший вызов не должен уносить остальные.
    setup(app) {
        const call = (name, arg) => {
            try {
                if (typeof app[name] === 'function') app[name](arg);
            } catch (err) {
                /* этот клиент так не умеет — живём без */
            }
        };

        call('ready');
        call('expand');
        // Bot API 7.7+. На клиентах постарше метода нет, и там свайп вниз
        // по-прежнему сворачивает окно: лечится только обновлением Telegram.
        call('disableVerticalSwipes');
        call('setHeaderColor', '#000000');
        call('setBackgroundColor', '#000000');
        call('lockOrientation');

        // ---------- ХОЛСТ МЕРЯЕТСЯ ПО ВИДИМОЙ ВЫСОТЕ ----------
        // Её знает только клиент (см. Stage.viewport), и отдаёт он её не
        // сразу: сначала разворот, потом событие о новой высоте. Поэтому
        // пересчёт идёт и сразу, и с задержкой, и по каждому событию
        // клиента: свернули-развернули окно, вылезла клавиатура, поменялись
        // безопасные зоны.
        const relayout = () => {
            if (typeof Stage !== 'undefined' && typeof Stage.apply === 'function') Stage.apply();
        };
        relayout();
        setTimeout(relayout, 250);
        setTimeout(relayout, 800);

        if (typeof app.onEvent === 'function') {
            ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged',
             'fullscreenChanged'].forEach(name => {
                try { app.onEvent(name, relayout); } catch (err) { /* нет такого события */ }
            });
        }
    }
};

if (typeof window !== 'undefined') window.TelegramBridge = TelegramBridge;

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TelegramBridge.init());
    } else {
        TelegramBridge.init();
    }
}
