const { chromium } = require('playwright');
const fs = require('fs');

// ================= ВЕРСИЯ 1 АППАРАТА НЕ ПОМЕНЯЛАСЬ =================
// Правило редизайна (docs/plan/31-greed-premium.md, разд. 2, п. 9): гаражный
// аппарат — первая ступень, и правки ради версии 2 не сдвигают в нём ни
// точки. Прогон снимает версию 1 во всех сочетаниях колеса и пачинко здесь
// и на принятой версии (BASE_PORT) и сравнивает кадры попиксельно.
//
//   git worktree add /tmp/base <коммит>; (cd /tmp/base && python3 -m http.server 8778 &)
//   BASE_PORT=8778 NODE_PATH=/opt/node22/lib/node_modules node tools/greed-v1-same.js /tmp/v1-
//
// Без BASE_PORT — только снимки (смотреть глазами или сравнить позже).
// Случайность страницы зафиксирована: ленты барабанов при входе встают
// по Math.random, и два запуска одной версии иначе расходились в окне
// барабанов.

const STATES = [['none', 0, 0], ['wheel', 1, 0], ['pach', 0, 1], ['both', 1, 1]];

(async () => {
    const out = process.argv[2] || '/tmp/v1-';
    const port = process.env.PORT || 8777, basePort = process.env.BASE_PORT;
    const browser = await chromium.launch({ executablePath: require('./chrome-path') });
    const errors = [];

    const shoot = async (p, name, wheel, pach) => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        page.on('pageerror', e => errors.push(`${p} ${name}: ${e.message}`));
        await page.addInitScript(([w, pc]) => {
            let s = 12345;
            Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
            localStorage.setItem('gj-wheel', w ? '1' : '0'); localStorage.setItem('gj-pachinko', pc ? '1' : '0');
            ['slots', 'wheel', 'pachinko'].forEach(g => localStorage.setItem('gj-skin-' + g, '1'));
        }, [wheel, pach]);
        await page.goto(`http://127.0.0.1:${p}/index.html`);
        await page.waitForTimeout(2500);
        await page.evaluate(([w, pc]) => {
            Backend.grantCurrency('gold', 200);
            const u = GameState.data.upgrades || (GameState.data.upgrades = {});
            u.greed_wheel = w; u.greed_pachinko = pc; GameState.save();
            GreedMinigame.play = { slots: null, wheel: null, pachinko: null };
            GameManager.handleSinAction('greed');
        }, [wheel, pach]);
        await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 25000 }).catch(() => {});
        // Пузырьки шкалы идут по часам кадров — у двух запусков разные.
        // Шаг пузырей отключён и всплывшие убраны: сравниваем рисунок, а не миг.
        await page.evaluate(() => {
            Tilt.turn = () => ({ live: true, x: 0, y: 0 });
            if (GreedJunkLit.bubbleStep) GreedJunkLit.bubbleStep = () => {};
            if (GreedJunkLit._meter) { GreedJunkLit._meter.bubbles = []; GreedJunkLit._meter.foam = []; }
        });
        await page.waitForTimeout(2500);
        const r = await page.evaluate(() => { const b = GreedJunkLit.wrapEl.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; });
        const file = `${out}${p === basePort ? 'base' : 'now'}-${name}.png`;
        await page.screenshot({ path: file, clip: r });
        await page.close();
        return file;
    };

    let bad = 0;
    for (const [name, w, pc] of STATES) {
        const now = await shoot(port, name, w, pc);
        if (!basePort) { console.log('  снято', now); continue; }
        const base = await shoot(basePort, name, w, pc);
        const page = await browser.newPage();
        const diff = await page.evaluate(async ([a, b]) => {
            const load = (src) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
            const [A, B] = await Promise.all([load(a), load(b)]);
            if (A.width !== B.width || A.height !== B.height) return { size: true };
            const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
            const g = c.getContext('2d');
            g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
            g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
            let n = 0, max = 0;
            for (let i = 0; i < da.length; i += 4) {
                const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
                if (d > 0) n++; if (d > max) max = d;
            }
            return { n, max };
        }, ['data:image/png;base64,' + fs.readFileSync(now).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(base).toString('base64')]);
        await page.close();
        const same = !diff.size && diff.n === 0;
        if (!same) bad++;
        console.log(`  ${same ? 'ok' : '✗ '} ${name}: ${diff.size ? 'другой размер' : diff.n + ' точек отличаются, сильнее всего на ' + diff.max}`);
    }
    await browser.close();
    if (errors.length) { console.log('\nошибки страницы:\n' + errors.join('\n')); bad++; }
    console.log(bad ? '\nверсия 1 изменилась' : '\nверсия 1 та же');
    process.exit(bad ? 1 : 0);
})();
