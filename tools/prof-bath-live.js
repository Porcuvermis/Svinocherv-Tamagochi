// ============ ПРОФИЛЬ ЖИВЫХ ВЕЩЕЙ ВАННОЙ: ФЛАКОН И ОБЛАКО ============
// Кадры и куда ушло время у верхних ступеней мыла и мочалки — на полке, в
// парении и под пальцем, — против простой ступени. Под замедлением процессора
// (на быстрой машине всё упирается в 60, п. 38 в docs/traps.md).
//
//   NODE_PATH=/opt/node22/lib/node_modules node tools/prof-bath-live.js [замедление] [мыло] [мочалка] [только]
// «только» — подстрока имени сценария (например «облако»).
const { chromium } = require('playwright');
const harness = require('./harness');
const SLOW = Number(process.argv[2] || 4);
const SOAP = process.argv[3] != null ? Number(process.argv[3]) : 8;
const CLOTH = process.argv[4] != null ? Number(process.argv[4]) : 8;
const ONLY = process.argv[5] || '';
const MS = 2500;
// HIDE — css-селекторы через запятую, гасятся на время замера (что сколько стоит).
const HIDE = process.env.HIDE || '';
// FREEZE=1 — живой цикл ванной стоит (кадры без правок вещи).
const FREEZE = !!process.env.FREEZE;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const page = await browser.newPage(harness.viewport({ deviceScaleFactor: 3 }));
    await harness.prepare(page);
    const cdp = await page.context().newCDPSession(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8777/index.html');
    await page.waitForTimeout(2600);
    await page.evaluate(() => GameManager.handleSinAction('lust'));
    await page.waitForTimeout(800);
    await page.evaluate(([s, c]) => { LustDebug.setLevel('soap', s); LustDebug.setLevel('cloth', c); BATH_SOAP.refresh(); BATH_CLOTH.refresh(); }, [SOAP, CLOTH]);
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
        window.__c = {};
        const bump = (k) => { window.__c[k] = (window.__c[k] || 0) + 1; };
        const sa = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (n, v) { bump('attr'); return sa.call(this, n, v); };
    });
    if (HIDE) await page.addStyleTag({ content: HIDE.split(',').map(x => x.trim() + '{display:none!important}').join('\n') });
    if (process.env.NOPAT) await page.evaluate(() => { BATH_SOAP.skyPatterns = () => {}; });
    if (FREEZE) await page.evaluate(() => { BATH_SOAP.applyFrame = () => {}; BATH_SOAP.flaskTick = () => {}; BATH_CLOTH.liveTick = () => {}; });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });

    const air = (kind) => page.evaluate(() => { const L = LustMinigame, o = L.loose;
        return o ? SvgSpace.toClient(L.svgEl, o.pos.x, o.pos.y) : null; });
    // Палец ходит кругом в пустом месте (не над червём — без трения) или над червём.
    let mover = null;
    const startMove = (c, r, overWorm) => {
        let a = 0, stop = false;
        mover = { stop: () => { stop = true; } };
        (async () => {
            await page.mouse.move(c.x, c.y); await page.mouse.down();
            while (!stop) { a += 0.25; await page.mouse.move(c.x + r * Math.cos(a), c.y + r * 0.6 * Math.sin(a)); await page.waitForTimeout(8); }
            await page.mouse.up();
        })();
    };
    const measure = async () => {
        const ev = [];
        const on = (d) => ev.push(...d.value);
        cdp.on('Tracing.dataCollected', on);
        await page.evaluate(() => { window.__c = {}; window.__f = 0; window.__g = (window.__g || 0) + 1; const my = window.__g, d = [];
            window.__d = d; let t = performance.now();
            const st = (n) => { if (window.__g !== my) return; window.__f++; d.push(n - t); t = n; requestAnimationFrame(st); }; requestAnimationFrame(st); });
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,cc,viz', transferMode: 'ReportEvents' });
        await page.waitForTimeout(MS);
        const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
        await cdp.send('Tracing.end'); await done; cdp.off('Tracing.dataCollected', on);
        const sum = {};
        for (const e of ev) if (e.ph === 'X' && e.dur) sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
        const r = await page.evaluate(() => { const d = window.__d.slice(1).sort((a, b) => a - b); return { f: window.__f, attr: window.__c.attr || 0, p95: d[Math.floor(d.length * 0.95)] || 0 }; });
        const top = Object.entries(sum).filter(([k]) => !/^(ThreadControllerImpl|RunTask|TaskGraphRunner|ThreadPool|SequenceManager|Scheduler|MessageLoop)/.test(k))
            .sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · ');
        return { fps: Math.round(r.f / (MS / 1000)), p95: Math.round(r.p95), attr: Math.round(r.attr / Math.max(1, r.f)), top };
    };
    const run = async (name, setup, teardown) => {
        if (ONLY && !name.includes(ONLY)) return;
        await setup(); await page.waitForTimeout(700);
        const r = await measure();
        if (teardown) await teardown();
        console.log(`${name.padEnd(26)} fps ${String(r.fps).padStart(3)}  p95 ${String(r.p95).padStart(3)} мс  attr/к ${String(r.attr).padStart(4)}\n    ${r.top}`);
        await page.waitForTimeout(600);
    };
    const reset = () => page.evaluate(() => { LustMinigame.close(); GameManager.handleSinAction('lust'); });

    console.log(`ванная, мыло ${SOAP}, мочалка ${CLOTH}, замедление ${SLOW}×\n`);
    await run('полка, покой', async () => {});
    await run('мыло парит', async () => { await page.evaluate(() => { LustMinigame.phase = 'soap'; LustMinigame.liftTool('soap'); }); await page.waitForTimeout(900); });
    await run('мыло под пальцем (воздух)', async () => {
        const c = await air(); if (c) startMove({ x: 300, y: 300 }, 40, false);
    }, async () => { mover && mover.stop(); await page.waitForTimeout(300); });
    await reset(); await page.waitForTimeout(1500);
    await run('облако парит', async () => { await page.evaluate(() => { LustMinigame.phase = 'cloth'; LustMinigame.liftTool('cloth'); }); await page.waitForTimeout(900); });
    await run('облако под пальцем', async () => {
        const c = await air(); if (c) startMove({ x: c.x, y: c.y }, 40, false);
    }, async () => { mover && mover.stop(); await page.waitForTimeout(300); });
    if (errs.length) console.log('ОШИБКИ:', errs.slice(0, 5));
    await browser.close();
})();
