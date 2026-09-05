// ============ ТЕХОСМОТР КАДРА: ЧТО ДЕЛАЕТ ПРОЦЕССОР НА КАЖДОМ ЭКРАНЕ ============
//
// Обходит все экраны игры и по каждому печатает две вещи:
//
//   1. ЧТО ДЕЛАЕТСЯ ЗА КАДР — сколько раз игра трогает дерево (setAttribute,
//      innerHTML) и сколько раз заставляет браузер пересчитать раскладку
//      (getBBox, getScreenCTM, getBoundingClientRect). Раскладка в этом
//      списке главная: одно её чтение стоит дороже сотни записей.
//
//   2. КУДА УШЛО ВРЕМЯ — разбор трассировки Chrome по статьям: Paint,
//      Style, Layout, JS. Здесь видно, что легло на процессор, а что уехало
//      на видеокарту (у чисто композиторской анимации Paint нулевой).
//
// Всё под ЗАМЕДЛЕНИЕМ процессора: на быстрой машине любая игра упирается в
// потолок 60 кадров, и разницы между хорошим и плохим кадром не видно.
// Ровно на этом однажды и записали «оптимизация не дала ничего»
// (docs/traps.md, п. 38).
//
// Запуск (из корня, при поднятом python3 -m http.server 8777):
//     NODE_PATH=/opt/node22/lib/node_modules node tools/audit-frames.js [замедление]
const { chromium } = require('playwright');

const SLOW = Number(process.argv[2] || 6);

// Экраны и как их открыть. Комната — это просто «ничего не открыто».
const SCREENS = [
    { name: 'комната',    open: null },
    { name: 'кухня',      open: 'GluttonyMinigame' },
    { name: 'сад',        open: 'SlothMinigame' },
    { name: 'тщеславие',  open: 'PrideMinigame' },
    { name: 'зависть',    open: 'EnvyMinigame' },
    { name: 'алчность',   open: 'GreedMinigame' },
    { name: 'гнев',       open: 'WrathMinigame' },
    { name: 'ванная',     open: 'LustMinigame' }
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 },
                                         deviceScaleFactor: 3 });
    const cdp = await page.context().newCDPSession(page);
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    await page.goto('http://127.0.0.1:8777/index.html');
    await page.waitForTimeout(2000);

    // Счётчики обращений к дереву и к раскладке. Патчим один раз на страницу.
    await page.evaluate(() => {
        window.__c = {};
        const bump = (k) => { window.__c[k] = (window.__c[k] || 0) + 1; };
        const E = Element.prototype, S = SVGGraphicsElement.prototype;
        const sa = E.setAttribute;
        E.setAttribute = function (n, v) { bump('attr'); return sa.call(this, n, v); };
        const gb = S.getBBox;
        S.getBBox = function () { bump('layout'); return gb.call(this); };
        const gc = S.getScreenCTM;
        S.getScreenCTM = function () { bump('layout'); return gc.call(this); };
        const gcr = E.getBoundingClientRect;
        E.getBoundingClientRect = function () { bump('layout'); return gcr.call(this); };
        const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        Object.defineProperty(Element.prototype, 'innerHTML', {
            get: ih.get,
            set: function (v) {
                bump('html');
                window.__c.chars = (window.__c.chars || 0) + String(v).length;
                return ih.set.call(this, v);
            }
        });
    });

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });

    const MS = 2500;
    const measure = async () => {
        const events = [];
        const onData = (d) => events.push(...d.value);
        cdp.on('Tracing.dataCollected', onData);
        await page.evaluate(() => {
            window.__c = {}; window.__frames = 0;
            // Метка поколения: прошлый счётчик кадров обязан умереть, иначе
            // на следующем экране считают сразу несколько циклов и fps
            // выходит кратно завышенным.
            window.__gen = (window.__gen || 0) + 1;
            const my = window.__gen;
            const st = () => {
                if (window.__gen !== my) return;
                window.__frames++; requestAnimationFrame(st);
            };
            requestAnimationFrame(st);
        });
        await cdp.send('Tracing.start',
            { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
        await page.waitForTimeout(MS);
        const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
        await cdp.send('Tracing.end');
        await done;
        cdp.off('Tracing.dataCollected', onData);

        const sum = {};
        for (const e of events) {
            if (e.ph !== 'X' || !e.dur) continue;
            sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
        }
        const r = await page.evaluate(() => ({ f: window.__frames, c: window.__c,
            anims: document.getAnimations().filter(a => a.playState === 'running').length }));
        const ms = (n) => Math.round(sum[n] || 0);
        return {
            fps: Math.round(r.f / (MS / 1000)),
            attr: (r.c.attr || 0) / r.f, html: (r.c.html || 0) / r.f,
            chars: Math.round((r.c.chars || 0) / r.f),
            layout: (r.c.layout || 0) / r.f, anims: r.anims,
            paint: ms('Paint'), style: ms('UpdateLayoutTree'),
            lay: ms('Layout'), js: ms('FireAnimationFrame') + ms('FunctionCall'),
            layerize: ms('Layerize')
        };
    };

    console.log(`техосмотр кадра, замедление ${SLOW}×, плотность 3, по ${MS} мс на экран\n`);
    const head = ['экран', 'fps', 'аним', 'attr/к', 'html/к', 'симв/к', 'раскл/к',
                  'Paint', 'Style', 'Layout', 'JS', 'Layerize'];
    const w = [12, 4, 5, 7, 7, 7, 8, 6, 6, 7, 5, 9];
    const row = (v) => v.map((x, i) => String(x).padStart(w[i])).join(' ');
    console.log(row(head));

    const bad = [];
    for (const s of SCREENS) {
        if (s.open) {
            const ok = await page.evaluate((g) => {
                const M = window[g] || (typeof eval(g) !== 'undefined' ? eval(g) : null);
                if (!M || !M.open) return false;
                M.open(); return true;
            }, s.open).catch(() => false);
            if (!ok) { console.log(`  ${s.name}: не открылся`); continue; }
            await page.waitForTimeout(2500);
        }
        const r = await measure();
        console.log(row([s.name, r.fps, r.anims, r.attr.toFixed(0), r.html.toFixed(1),
                         r.chars, r.layout.toFixed(1), r.paint, r.style, r.lay,
                         r.js, r.layerize]));
        // Пороги: раскладка за кадр вообще не должна читаться, разметка не
        // должна пересобираться килобайтами.
        if (r.layout > 0.5) bad.push(`${s.name}: раскладка ${r.layout.toFixed(1)} раз за кадр`);
        if (r.chars > 2000) bad.push(`${s.name}: ${r.chars} символов разметки за кадр`);
        if (s.open) {
            await page.evaluate((g) => { const M = window[g] || eval(g); if (M && M.close) M.close(); }, s.open);
            await page.waitForTimeout(1200);
        }
    }

    console.log();
    if (errs.length) { console.log('ОШИБКИ НА СТРАНИЦЕ:'); errs.forEach(e => console.log('  ' + e)); }
    if (bad.length) { console.log('НА ЧТО СМОТРЕТЬ:'); bad.forEach(e => console.log('  ' + e)); }
    else console.log('явных потерь по счётчикам нет');
    await browser.close();
})();
