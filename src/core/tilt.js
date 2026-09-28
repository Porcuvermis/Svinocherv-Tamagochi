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
    // Наклон вперёд-назад (beta). Его «ноль» — не горизонт, а то, как игрок
    // держит телефон: кто-то лёжа, кто-то сидя, под 30° или под 70°. Поэтому
    // отдаётся ОТКЛОНЕНИЕ от медленно ползущей средней: держишь ровно —
    // ноль, качнул — видно, продолжаешь держать по-новому — через несколько
    // секунд снова ноль. Так делает и эффект глубины на обоях айфона.
    let rawY = 0, baseY = null;
    const BASE_K = 0.006;      // ~3 с на подстройку при 60 событиях в секунду
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

    function feedY(v) {
        if (typeof v !== 'number' || !isFinite(v) || unit === null) return;
        const deg = unit === 'rad' ? v * 180 / Math.PI : v;
        if (baseY === null) baseY = deg;
        baseY += (deg - baseY) * BASE_K;
        rawY = Math.max(-1, Math.min(1, (deg - baseY) / FULL_DEG));
    }

    // ПОВОРОТ ОТ ПОЗЫ ХВАТА — для бликов. Телефон никогда не лежит экраном
    // вверх: его держат почти стоймя, чуть запрокинув экран, и ЭТО — ноль
    // (замечание игрока). У стоящего телефона самое естественное движение
    // руки — поворот вокруг вертикали, и в gamma его нет вовсе: он уходит в
    // alpha. Поэтому здесь полная ориентация (alpha, beta, gamma → матрица) и
    // отклонение от медленно ползущей позы хвата, в осях САМОГО телефона:
    // x — поворот вокруг его длинной оси (для лежащего это тот же gamma),
    // y — вокруг поперечной (для лежащего — beta). Ориентация матрицей, а не
    // углами: у стоящего телефона углы вырождаются (gamma и alpha скачут
    // вместе), а матрица — нет.
    const TURN_TAU = 3000;      // мс: за сколько поза хвата догоняет новую
    let turnB = null, turnAt = 0, turnX = 0, turnY = 0, turnLive = false;
    function rotm(a, b, g) {
        const r = Math.PI / 180, ca = Math.cos(a * r), sa = Math.sin(a * r), cb = Math.cos(b * r),
              sb = Math.sin(b * r), cg = Math.cos(g * r), sg = Math.sin(g * r);
        // R = Rz(alpha) · Rx(beta) · Ry(gamma) — как в спецификации W3C.
        return [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg,
                sa * cg + ca * sb * sg,  ca * cb, sa * sg - ca * sb * cg,
                -cb * sg,                sb,      cb * cg];
    }
    function orth(m) {
        // Грам — Шмидт по столбцам: среднее матриц — уже не поворот.
        const c = [[m[0], m[3], m[6]], [m[1], m[4], m[7]]];
        const n = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(x => x / l); };
        const x = n(c[0]), d = x[0] * c[1][0] + x[1] * c[1][1] + x[2] * c[1][2];
        const y = n([c[1][0] - d * x[0], c[1][1] - d * x[1], c[1][2] - d * x[2]]);
        const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
        return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
    }
    function feedTurn(a, b, g) {
        if (typeof b !== 'number' || typeof g !== 'number' || !isFinite(b) || !isFinite(g) || unit === null) return;
        const k = unit === 'rad' ? 180 / Math.PI : 1;
        const R = rotm((typeof a === 'number' && isFinite(a) ? a : 0) * k, b * k, g * k);
        const now = Date.now();
        if (!turnB) turnB = R.slice();
        else {
            const w = 1 - Math.exp(-Math.min(500, now - turnAt) / TURN_TAU);
            turnB = orth(turnB.map((v, i) => v + (R[i] - v) * w));
        }
        turnAt = now;
        // D = Bᵀ·R — поворот от позы хвата в осях телефона; при малых углах
        // D ≈ I + [ω]×, отсюда ω.
        const B = turnB, D = (i, j) => B[i] * R[j] + B[3 + i] * R[3 + j] + B[6 + i] * R[6 + j];
        const wx = (D(2, 1) - D(1, 2)) / 2, wy = (D(0, 2) - D(2, 0)) / 2;
        const full = FULL_DEG * Math.PI / 180;
        turnX = Math.max(-1, Math.min(1, wy / full));
        turnY = Math.max(-1, Math.min(1, wx / full));
        turnLive = true;
    }

    function onOrient(e) { if (e) { feed(e.gamma); feedY(e.beta); feedTurn(e.alpha, e.beta, e.gamma); } }

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

        // Обе оси сразу и БЕЗ сглаживания: x() сглаживает при каждом вызове,
        // и второй потребитель ускорил бы его для первого. Кто берёт lean(),
        // сглаживает у себя. y > 0 — верх телефона пошёл к игроку.
        lean() {
            return { live: live && unit !== null, x: raw, y: rawY };
        },

        // Поворот от позы хвата по обеим осям телефона, −1..1 (единица —
        // 35°), без сглаживания. Знаки как у lean(): x > 0 — правый край
        // уходит назад-вниз, y > 0 — верх к игроку. Держишь как держал —
        // через несколько секунд снова ноль.
        turn() {
            return { live: live && turnLive && unit !== null, x: turnX, y: turnY };
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
                    app.onEvent('deviceOrientationChanged', () => { feed(dev.gamma); feedY(dev.beta); feedTurn(dev.alpha, dev.beta, dev.gamma); });
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
