// ================= ВАННАЯ: ЧТО У КРАЯ ОКНА И СКОЛЬКО ДЛИТСЯ ВХОД =================
// Подготовка к пенной рамке (docs/plan/25-lust-foam-transition.md, этап 0) и
// её же проверка после зум-аута (этап 2).
//
// 1. КРАЯ. На каждой камере ванной (общий вид, тело, хвост) — габариты
//    вещей, в которые тыкают, и расстояние от них до края холста 390×844.
//    Рамка из пены съест полосу у края; всё, что ближе её толщины, уйдёт
//    под пену. Печатает таблицу и помечает ближе RIM единиц.
// 2. ВХОД. Под замедлением процессора (по умолчанию 4×): сколько главный
//    поток занят самим LustMinigame.open() и когда готовность
//    (LustLoading.wait) решила, что всё дозрело. Это то, что пена должна спрятать.
//
// Снимки камер — <префикс>edge-<камера>.png, склеить: python3 tools/sheet.py.
//
//   NODE_PATH=/opt/node22/lib/node_modules node tools/probe-lust-edges.js /tmp/edge-
//
// С пенной рамкой (lust-foam.js) печатает ещё, какая доля габарита вещи под
// пеной: ≥ FOAM_WARN процентов помечено «!» (по умолчанию 15). Крестик
// окна лежит в пене нарочно — он из неё и нарисован.
//
// Переменные: RIM (толщина рамки для пометки, по умолчанию 24),
//             SLOW (замедление процессора для замера входа, по умолчанию 4).
const { chromium } = require('playwright');
const harness = require('./harness');

const RIM = +(process.env.RIM || 24);
const SLOW = +(process.env.SLOW || 4);
// Сколько процентов вещи под пенной рамкой — уже повод посмотреть глазами.
const FOAM_WARN = +(process.env.FOAM_WARN || 15);

// Что в ванной нажимают или водят пальцем. Габарит меряется по экрану и
// переводится в единицы холста через масштаб сцены (--stage-scale).
const TARGETS = [
    ['душ (ручка)', '#bt-shower-grab'],
    ['мыло на полке', '#bt-soap-box'],
    ['мочалка на полке', '#bt-cloth-box'],
    ['журнал (магазин)', '#bt-mag-call'],
    // Габарит самого тела: у обёртки #bt-worm он с запасом под позы.
    ['червь', '#bt-worm svg > g'],
    ['хвост', '#bt-tail'],
    ['шкала финала', '#bt-gauge'],
    ['запас выстрелов', '#bt-ammo'],
    ['крестик окна', '#lust-game .mg-close']
];

(async () => {
    const browser = await chromium.launch({
        executablePath: require('./chrome-path') });
    const out = process.argv[2] || '/tmp/edge-';

    // ---------- 1. КРАЯ ----------
    const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 2 }));
    await harness.prepare(page);
    await page.goto('http://127.0.0.1:8777/index.html');
    await page.waitForTimeout(1500);
    await page.evaluate(() => LustMinigame.open());
    await page.waitForTimeout(1200);

    for (const cam of ['overview', 'body', 'tail']) {
        await page.evaluate((c) => {
            LustMinigame.setCamera(c);
            // Хвост и шкалы есть только в финале — туда и прыгаем.
            if (c === 'tail') LustDebug.jumpToFinale();
        }, cam);
        await page.waitForTimeout(1200);
        const rows = await page.evaluate((T) => {
            const st = document.getElementById('game-container').getBoundingClientRect();
            const k = st.width / 390;
            return T.map(([name, sel]) => {
                const el = document.querySelector(sel);
                if (!el) return [name, null];
                // У svg-группы габарит берётся по содержимому, у пустой — нулевой.
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) return [name, null];
                const x0 = (r.left - st.left) / k, y0 = (r.top - st.top) / k;
                const x1 = (r.right - st.left) / k, y1 = (r.bottom - st.top) / k;
                // Ушедшее за край целиком — не видно, не в счёт.
                if (x1 < 0 || y1 < 0 || x0 > 390 || y0 > 844) return [name, 'за кадром'];
                // Под пеной: доля точек габарита, накрытых массой рамки —
                // кругами глубоких пузырей (как их заливает LustFoam.draw).
                // Пены нет (окно без шкурки) — ноль.
                let foam = 0, n = 0;
                const deep = typeof LustFoam !== 'undefined' && LustMinigame.win && LustMinigame.win.skin
                    ? LustFoam.layers().deep.filter(b => b.core) : [];
                for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
                    n++;
                    if (deep.some(b => (b.x - x) ** 2 + (b.y - y) ** 2 < (b.r * 1.12) ** 2)) foam++;
                }
                return [name, { x0, y0, x1, y1, foam: n ? foam / n : 0,
                    left: x0, right: 390 - x1, top: y0, bottom: 844 - y1 }];
            });
        }, TARGETS);
        console.log(`\n== камера ${cam} (ближе ${RIM} — помечено «!»)`);
        for (const [name, r] of rows) {
            if (!r || typeof r === 'string') { console.log(`  ${name.padEnd(18)} ${r || '—'}`); continue; }
            const f = (v) => (v < RIM ? '!' : ' ') + Math.round(v).toString().padStart(4);
            const pf = Math.round(r.foam * 100);
            console.log(`  ${name.padEnd(18)} слева${f(r.left)}  справа${f(r.right)}  сверху${f(r.top)}  снизу${f(r.bottom)}`
                + `   под пеной ${(pf + '%').padStart(4)}${pf >= FOAM_WARN ? ' !' : '  '}`
                + `   [${Math.round(r.x0)},${Math.round(r.y0)} – ${Math.round(r.x1)},${Math.round(r.y1)}]`);
        }
        await page.screenshot({ path: `${out}edge-${cam}.png` });
    }
    await page.close();

    // ---------- 2. ВХОД ----------
    // Готовность — та же, что ждёт покров перехода (LustLoading.wait).
    const p2 = await browser.newPage(harness.viewport());
    await p2.goto('http://127.0.0.1:8777/index.html');
    await p2.waitForTimeout(1500);
    const cdp = await p2.context().newCDPSession(p2);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
    for (const pass of ['первый вход', 'повторный']) {
        const t = await p2.evaluate(async () => {
            const t0 = performance.now();
            LustMinigame.open();
            const tOpen = performance.now() - t0;
            await LustMinigame.veilReady();
            return { open: tOpen, ready: performance.now() - t0 };
        });
        console.log(`\n${pass} (×${SLOW}): open() ${Math.round(t.open)} мс, готово через ${Math.round(t.ready)} мс`);
        await p2.evaluate(() => LustMinigame.close());
        await p2.waitForTimeout(800);
    }
    await browser.close();
})();
