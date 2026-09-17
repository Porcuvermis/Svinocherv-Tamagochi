// ================= НАКЛОН ТЕЛЕФОНА =================
// Один датчик на всю игру: на сколько телефон завален вбок. Отдаёт число
// −1..1 и НИЧЕГО не решает сам — что с ним делать, знает тот, кто спросил.
// Сейчас спрашивает рендерер: по нему висящие детали наряда (фалды, ленты,
// подвески) отклоняются, как отклонилась бы тряпка в реальной руке.
//
// ---------- ТРИ ИСТОЧНИКА, И ПОРЯДОК ВАЖЕН ----------
//   1. Telegram (Bot API 8.0+) — `WebApp.DeviceOrientation`. Главный путь:
//      игра живёт в Telegram, и разрешение там спрашивает САМ КЛИЕНТ, а не мы.
//      Включается сразу, как только мост поднял библиотеку.
//   2. Обычное событие `deviceorientation` — Android, компьютер, старые
//      клиенты Telegram. Разрешения не требует, подписываемся на старте.
//   3. iOS вне Telegram (и старый клиент на iOS): датчик закрыт до
//      разрешения, и просить его можно ТОЛЬКО из настоящего касания. Поэтому
//      просим на первом же касании экрана — молча, без своих окон: системное
//      покажет сам браузер. Своего окна у нас и не может быть, в игре нет слов.
//
// Нет датчика или отказ — x() отдаёт 0, и всё работает как раньше. Это
// штатный режим, а не поломка (инвариант 7 по духу).
//
// ---------- ПОЧЕМУ ЕДИНИЦЫ ОПРЕДЕЛЯЮТСЯ, А НЕ ЗАДАНЫ ----------
// Веб отдаёт gamma в ГРАДУСАХ (−90..90), а Telegram в своём объекте — в
// радианах. Написать «делим на 35» нельзя: в радианах это полный завал, а в
// градусах — почти ничего. Ошибка тут не видна в коде и вылезает только на
// телефоне, поэтому единицу мы НЕ УГАДЫВАЕМ, а узнаём по данным: первую
// секунду копим размах и решаем. Вышло больше π — градусы, иначе радианы.
// Пока не решили, отдаём 0: лучше секунда без наклона, чем секунда, в которую
// ткань улетает на полный угол от дрожания руки.
const Tilt = (function () {
    const FULL_DEG = 35;        // дальше телефон не заваливают, а кладут
    const DECIDE_MS = 1000;     // сколько копим размах, прежде чем решить
    const RAD_LIMIT = 3.2;      // больше π — значит это точно не радианы

    let raw = 0;        // −1..1, уже приведённое к долям
    let smooth = 0;
    let live = false;
    let unit = null;    // 'deg' | 'rad' | null пока не решили
    let seenMax = 0;
    let firstAt = 0;
    let source = 'нет';

    function feed(v) {
        if (typeof v !== 'number' || !isFinite(v)) return;
        const now = Date.now();
        if (!firstAt) firstAt = now;
        const abs = Math.abs(v);
        if (seenMax < abs) seenMax = abs;

        if (unit === null) {
            // Решаем, как только становится ясно: большой размах — градусы.
            if (seenMax > RAD_LIMIT) unit = 'deg';
            else if (now - firstAt > DECIDE_MS) unit = 'rad';
            else { live = true; return; }   // датчик есть, но угол ещё не отдаём
        }
        const deg = unit === 'rad' ? v * 180 / Math.PI : v;
        raw = Math.max(-1, Math.min(1, deg / FULL_DEG));
        live = true;
    }

    function onOrient(e) { if (e) feed(e.gamma); }

    function listenWeb(tag) {
        if (typeof window === 'undefined' || !window.addEventListener) return;
        window.removeEventListener('deviceorientation', onOrient);
        window.addEventListener('deviceorientation', onOrient, { passive: true });
        if (source === 'нет') source = tag || 'событие';
    }

    // Разрешение нужно? На iOS 13+ у события есть requestPermission.
    function needsAsk() {
        return typeof DeviceOrientationEvent !== 'undefined'
            && typeof DeviceOrientationEvent.requestPermission === 'function';
    }

    let asked = false;
    function ask() {
        if (asked) return Promise.resolve(live);
        asked = true;
        if (!needsAsk()) { listenWeb(); return Promise.resolve(true); }
        return DeviceOrientationEvent.requestPermission()
            .then(r => { if (r === 'granted') { listenWeb('событие (разрешено)'); return true; }
                         return false; })
            .catch(() => false);
    }

    return {
        // Наклон −1..1, сглаженный. Ноль, если датчика нет или единица ещё
        // не определена.
        x() {
            if (!live || unit === null) return 0;
            smooth += (raw - smooth) * 0.12;
            return smooth;
        },

        // Для debug-панели: откуда пришёл наклон и что с ним сейчас. Панель —
        // не игра, слова там разрешены.
        info() {
            return { live, unit: unit || '?', source, x: +this.x().toFixed(2),
                     max: +seenMax.toFixed(2) };
        },

        ask,

        // ---------- ГЛАВНЫЙ ПУТЬ: TELEGRAM ----------
        // Зовётся мостом, когда библиотека уже поднята. Клиент сам решает
        // вопрос с разрешением, нам остаётся включить и слушать.
        telegram(app) {
            const dev = app && app.DeviceOrientation;
            if (!dev || typeof dev.start !== 'function') return false;
            try {
                if (app.onEvent) {
                    app.onEvent('deviceOrientationChanged', () => feed(dev.gamma));
                    // Не вышло — не беда: остаётся обычное событие, оно уже
                    // подписано. Молчать об этом нельзя только в debug-панели.
                    app.onEvent('deviceOrientationFailed', () => { source += ' (Telegram отказал)'; });
                }
                dev.start({ refresh_rate: 60 }, (ok) => {
                    if (ok) source = 'Telegram';
                });
                return true;
            } catch (e) { return false; }
        },

        // Старт при загрузке страницы.
        start() {
            if (typeof window === 'undefined') return;
            const tg = window.Telegram && window.Telegram.WebApp;
            if (tg) this.telegram(tg);
            // Обычное событие — там, где разрешение не нужно. Оно же страхует
            // старые клиенты Telegram, где своего датчика ещё нет.
            if (!needsAsk()) listenWeb();
            // А где нужно — просим на первом касании. Своего окна не рисуем:
            // системное покажет браузер, и другого способа нет.
            else {
                const once = () => {
                    document.removeEventListener('pointerdown', once);
                    document.removeEventListener('touchstart', once);
                    ask();
                };
                document.addEventListener('pointerdown', once, { passive: true });
                document.addEventListener('touchstart', once, { passive: true });
            }
        }
    };
})();

if (typeof window !== 'undefined') {
    window.Tilt = Tilt;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Tilt.start(), { once: true });
    } else {
        Tilt.start();
    }
}
