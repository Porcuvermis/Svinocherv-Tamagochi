// ================= НАКЛОН ТЕЛЕФОНА =================
// Один датчик на всю игру: на сколько телефон завален вбок. Отдаёт число
// −1..1 и НИЧЕГО не решает сам — что с ним делать, знает тот, кто спросил.
// Сейчас спрашивает рендерер: по нему висящие детали наряда (фалды, ленты,
// подвески) отклоняются, как отклонилась бы тряпка в реальной руке.
//
// ---------- ПОЧЕМУ ЭТО НЕ ПРОСТО addEventListener ----------
// Три причины, и каждая ломает наивный вариант:
//
//   1. На iOS 13+ доступ к датчику закрыт до РАЗРЕШЕНИЯ, и просить его можно
//      только из обработчика настоящего касания. Спрашивать при загрузке
//      нельзя — браузер откажет молча.
//   2. Системное окно «разрешить доступ к движению» игрок не заказывал.
//      Поэтому сами мы его не показываем: подписка идёт только там, где
//      разрешение не нужно, а на iOS ждёт явного включения (Tilt.ask()).
//   3. Датчика может не быть вовсе — компьютер, эмулятор, отказ. Это
//      штатный режим, а не поломка: x() отдаёт 0, и всё работает как раньше.
//      Игра обязана быть полноценной без телефона (инвариант 7 по духу).
//
// Внутри Telegram с Bot API 8.0 есть свой DeviceOrientation — он и
// предпочтительнее: разрешение там спрашивает сам клиент.
const Tilt = (function () {
    // Сырое значение с датчика, уже сглаженное. Читается каждый кадр, поэтому
    // сглаживание живёт здесь, а не у каждого, кто спросит.
    let raw = 0;
    let smooth = 0;
    let live = false;

    // gamma — завал вбок в градусах. ±35° считаем полным отклонением: дальше
    // человек телефон не кладёт, а держит.
    const FULL_DEG = 35;

    function feed(gammaDeg) {
        if (typeof gammaDeg !== 'number' || !isFinite(gammaDeg)) return;
        raw = Math.max(-1, Math.min(1, gammaDeg / FULL_DEG));
        live = true;
    }

    function onOrient(e) { feed(e && e.gamma); }

    function listen() {
        if (typeof window === 'undefined' || !window.addEventListener) return;
        window.addEventListener('deviceorientation', onOrient, { passive: true });
    }

    return {
        // Наклон −1..1, сглаженный. Ноль, если датчика нет или он молчит.
        x() {
            if (!live) return 0;
            smooth += (raw - smooth) * 0.12;
            return smooth;
        },

        // Есть ли вообще живой датчик — нужно debug-панели, чтобы отличить
        // «наклона нет» от «наклон ноль».
        alive() { return live; },

        // Подписаться там, где разрешение не требуется. Зовётся при старте.
        start() {
            if (typeof window === 'undefined') return;
            // Внутри Telegram — его собственный датчик: разрешение спрашивает
            // клиент, а не мы.
            const tg = window.Telegram && window.Telegram.WebApp;
            const dev = tg && tg.DeviceOrientation;
            if (dev && dev.start) {
                try {
                    dev.start({ refresh_rate: 60 }, () => {});
                    tg.onEvent && tg.onEvent('deviceOrientationChanged', () => {
                        // gamma у Telegram в РАДИАНАХ — переводим.
                        if (typeof dev.gamma === 'number') feed(dev.gamma * 180 / Math.PI);
                    });
                    return;
                } catch (e) { /* не вышло — пробуем обычный путь */ }
            }
            if (typeof DeviceOrientationEvent === 'undefined') return;
            // Где разрешение не требуется (Android, компьютер) — подписываемся
            // сразу. Где требуется — ждём Tilt.ask().
            if (typeof DeviceOrientationEvent.requestPermission !== 'function') listen();
        },

        // Явно попросить разрешение. Звать ТОЛЬКО из обработчика касания:
        // иначе iOS откажет, не показав окна.
        ask() {
            if (typeof DeviceOrientationEvent === 'undefined') return Promise.resolve(false);
            if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
                listen();
                return Promise.resolve(true);
            }
            return DeviceOrientationEvent.requestPermission()
                .then(r => { if (r === 'granted') { listen(); return true; } return false; })
                .catch(() => false);
        }
    };
})();

if (typeof window !== 'undefined') {
    window.Tilt = Tilt;
    // Подписка на старте — тихая: там, где нужно разрешение, ничего не
    // происходит и никаких окон не всплывает.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Tilt.start(), { once: true });
    } else {
        Tilt.start();
    }
}
