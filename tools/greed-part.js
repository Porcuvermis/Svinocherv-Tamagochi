const { chromium } = require('playwright');
const fs = require('fs');

// ================= РЕВИЗИЯ ДЕТАЛИ АППАРАТА АЛЧНОСТИ =================
// Снимает одну деталь аппарата во всех состояниях, в которых её видит игрок,
// — чтобы смотреть не один кадр покоя, а всё сразу одним листом.
// Порядок работы и что искать на кадрах — docs/bench/greed-audit.md.
//
//   PART=lever NODE_PATH=/opt/node22/lib/node_modules node tools/greed-part.js /tmp/gp-
//   python3 tools/sheet.py /tmp/gp- 4 300
//
// PART — имя из PARTS ниже или участок поля «x0,y0,x1,y1».
// Что снимается (файлы по порядку — в листе в том же порядке):
//   a-rest           покой, телефон ровно
//   b-tilt-*         наклон влево / вправо / к себе / от себя
//   c-off-*          покой с выключенным одним светом (кто что даёт)
//   d-lever-*        рывок по кадрам (только если деталь рядом с рычагом)
//   e-diff           разность с прошлой версией (если BASE_PORT задан) —
//                    белое там, где изменилось; ореол виден сразу
//   g-term-*         свет корпуса по слагаемым (шейдер с отладочным выводом,
//                    GreedJunkLit.DBG_TERMS): normal — направление поверхности,
//                    shade — тень основного света, lit — рассеянный, lamps —
//                    источники, spec — блики, depth, height, plane — уклон для
//                    тени, noshade — цвет без теней. Кайма на одном из них —
//                    подсказка, откуда она (docs/bench/greed-audit.md, разд. 8)
//   f-map-*          карты корпуса на этом участке: цвет, высота (растянута
//                    по контрасту), материал — что видит шейдер. Только
//                    корпус: колесо, короб пачинко и живой слой — не в них.
//                    Числа высот — f-heights.txt (строка посередине участка
//                    и столбец посередине: ступени и потолок видны цифрами)
// Прошлая версия: `git worktree add /tmp/base <коммит>`, в /tmp/base —
// `python3 -m http.server 8778`, и BASE_PORT=8778.

const PARTS = {
    lever:    [270, 255, 345, 440],
    knob:     [292, 284, 338, 334],
    lamp:     [290, 252, 342, 300],
    meter:    [22, 285, 100, 625],
    wheel:    [20, -57, 210, 290],
    pachinko: [200, -57, 340, 290],
    reels:    [60, 300, 300, 470],
    bulbs:    [130, 440, 250, 490],
    wc:       [180, 470, 300, 560],
    tray:     [110, 540, 260, 625],
    jar:      [250, 480, 340, 625]
};

(async () => {
    const out = process.argv[2] || '/tmp/gp-';
    const part = process.env.PART || 'lever';
    const box = PARTS[part] || part.split(',').map(Number);
    const port = process.env.PORT || 8777, basePort = process.env.BASE_PORT;
    const browser = await chromium.launch();
    const errors = [];

    const open = async (p) => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { localStorage.setItem('gj-wheel', '1'); localStorage.setItem('gj-pachinko', '1'); });
        await page.goto(`http://127.0.0.1:${p}/index.html`);
        await page.waitForTimeout(2500);
        await page.evaluate(() => {
            Backend.grantCurrency('gold', 200);
            const u = GameState.data.upgrades || (GameState.data.upgrades = {});
            u.greed_wheel = 1; u.greed_pachinko = 1; GameState.save();
            GreedMinigame.play = { slots: null, wheel: null, pachinko: null };
            GameManager.handleSinAction('greed');
        });
        // сборка аппарата и картинок рычага — до 7 с
        await page.waitForFunction(() => window.GreedJunkLit && GreedJunkLit.lever, null, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);
        return page;
    };
    // участок поля → прямоугольник экрана
    const clipOf = (page) => page.evaluate((b) => {
        const r = GreedJunkLit.wrapEl.getBoundingClientRect(), G = GreedJunk;
        const X = (x) => r.left + x / G.W * r.width, Y = (y) => r.top + (y - G.Y0) / G.H * r.height;
        return { x: X(b[0]), y: Y(b[1]), width: X(b[2]) - X(b[0]), height: Y(b[3]) - Y(b[1]) };
    }, box);
    const tilt = (page, x, y) => page.evaluate(([x, y]) => { Tilt.turn = () => ({ live: true, x, y }); }, [x, y]);

    const page = await open(port);
    const clip = await clipOf(page);
    const shot = (name) => page.screenshot({ path: out + name + '.png', clip });
    await tilt(page, 0, 0); await page.waitForTimeout(400);
    await shot('a-rest');

    for (const [n, x, y] of [['left', -0.7, 0], ['right', 0.7, 0], ['near', 0, -0.7], ['far', 0, 0.7]]) {
        await tilt(page, x, y); await page.waitForTimeout(700);
        await shot('b-tilt-' + n);
    }
    await tilt(page, 0, 0); await page.waitForTimeout(500);

    // по одному свету выключить: какой источник даёт что на детали
    const offs = {
        lamp: 'L.LIGHTS[0].rgb = [0, 0, 0]; L.KEY.leverLamp.warm = 0;',
        shade: 'L.LIGHTS[1].rgb = [0, 0, 0];',
        tube: 'L.LIGHTS[2].rgb = [0, 0, 0];',
        reelspill: 'L.LIGHTS[3].rgb = [0, 0, 0];',
        glow: 'L.KEY.reel.warm = 0; L.KEY.pach.cool = 0; L.KEY.pach.coolLow = 0; L.KEY.button.warm = 0;',
        flag: 'L.KEY.leverFlag.k = 0;'
    };
    for (const [n, code] of Object.entries(offs)) {
        await page.evaluate((code) => {
            const L = GreedJunkLit;
            if (!L.__orig) L.__orig = JSON.stringify({ l: L.LIGHTS, k: L.KEY });
            const o = JSON.parse(L.__orig); L.LIGHTS = o.l; L.KEY = o.k;
            new Function('L', code)(L);
            L._keyCv = null; L.keyBind(L.gl, L.prog, 6); L.draw(L.lightFor({ x: 0, y: 0 }));
        }, code);
        await page.waitForTimeout(150);
        await shot('c-off-' + n);
    }
    await page.evaluate(() => {
        const L = GreedJunkLit, o = JSON.parse(L.__orig); L.LIGHTS = o.l; L.KEY = o.k;
        L._keyCv = null; L.keyBind(L.gl, L.prog, 6); L.draw(L.lightFor({ x: 0, y: 0 }));
    });

    // рычаг — два механизма (в покое — корпус шейдером, в движении —
    // готовые картинки частей): смотреть оба и переход между ними
    const nearLever = box[2] > 270 && box[0] < 345 && box[3] > 255 && box[1] < 440;
    if (nearLever) {
        const k = await page.evaluate(() => {
            const r = GreedJunkLit.wrapEl.getBoundingClientRect(), G = GreedJunk, K = G.leverGeom(0).K;
            return { X: r.left + K.x / G.W * r.width, Y: r.top + (K.y - G.Y0) / G.H * r.height };
        });
        await page.mouse.move(k.X, k.Y); await page.mouse.down(); await page.waitForTimeout(150);
        await shot('d-lever-1touch');
        for (let i = 1; i <= 12; i++) { await page.mouse.move(k.X, k.Y + i * 6); await page.waitForTimeout(30); }
        await shot('d-lever-2pulled');
        await page.mouse.up();
        let t = 0;
        for (const at of [120, 400, 1200, 5000]) { await page.waitForTimeout(at - t); t = at; await shot('d-lever-3after' + String(at).padStart(4, '0')); }
    }

    if (basePort) {
        const base = await open(basePort);
        await tilt(base, 0, 0); await base.waitForTimeout(400);
        const bclip = await clipOf(base);
        const a = (await base.screenshot({ clip: bclip })).toString('base64');
        const b = fs.readFileSync(out + 'a-rest.png').toString('base64');
        // разность считает сама страница: |a − b| ×4, рядом — было и стало
        const png = await page.evaluate(async ([a, b]) => {
            const load = (s) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
            const [A, B] = await Promise.all([load(a), load(b)]);
            const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
            const cv = document.createElement('canvas'); cv.width = w * 3 + 12; cv.height = h;
            const g = cv.getContext('2d');
            g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, h);
            g.drawImage(A, 0, 0); g.drawImage(B, w + 6, 0);
            const t = document.createElement('canvas'); t.width = w; t.height = h;
            const tg = t.getContext('2d');
            tg.drawImage(A, 0, 0); const da = tg.getImageData(0, 0, w, h).data;
            tg.drawImage(B, 0, 0); const db = tg.getImageData(0, 0, w, h);
            for (let i = 0; i < da.length; i += 4) {
                const v = Math.min(255, 4 * Math.max(Math.abs(da[i] - db.data[i]), Math.abs(da[i + 1] - db.data[i + 1]), Math.abs(da[i + 2] - db.data[i + 2])));
                db.data[i] = db.data[i + 1] = db.data[i + 2] = v; db.data[i + 3] = 255;
            }
            tg.putImageData(db, 0, 0);
            g.drawImage(t, w * 2 + 12, 0);
            return cv.toDataURL('image/png').split(',')[1];
        }, [a, b]);
        fs.writeFileSync(out + 'e-diff.png', Buffer.from(png, 'base64'));
    }

    // свет корпуса по слагаемым — живой слой и холст рычага убраны: только корпус
    await page.evaluate(() => { GreedJunkLit.live.style.visibility = 'hidden'; });
    for (const t of Object.keys(await page.evaluate(() => GreedJunkLit.DBG_TERMS))) {
        await page.evaluate((t) => {
            const L = GreedJunkLit, gl = L.gl;
            L._dbgP = L._dbgP || {};
            if (!L._dbgP[t]) { L._dbgP[t] = L.program(gl, L.DBG_TERMS[t]); L.keyBind(gl, L._dbgP[t], 6); }
            L._prog0 = L._prog0 || L.prog; L.prog = L._dbgP[t];
            L.draw(L.lightFor({ x: 0, y: 0 }));
        }, t);
        await page.waitForTimeout(60);
        await shot('g-term-' + t);
    }
    await page.evaluate(() => { const L = GreedJunkLit; L.prog = L._prog0; L.draw(L.lightFor({ x: 0, y: 0 })); L.live.style.visibility = ''; });

    const maps = await page.evaluate(async (b) => {
        const C = { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] }, S = 6, G = GreedJunk, out = {};
        for (const ps of ['albedo', 'height', 'mat']) {
            const svg = G.bodySvg(ps, C).replace('<svg ', `<svg width="${C.w * S}" height="${C.h * S}" `);
            G.pass = 'baked';
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            const img = new Image(); await new Promise(r => { img.onload = r; img.src = url; });
            const cv = document.createElement('canvas'); cv.width = C.w * S; cv.height = C.h * S;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
            if (ps === 'height') {
                const d = g.getImageData(0, 0, cv.width, cv.height), px = d.data;
                const row = [], col = [], my = Math.floor(cv.height / 2), mx = Math.floor(cv.width / 2);
                for (let x = 0; x < cv.width; x += 3) row.push(px[(my * cv.width + x) * 4]);
                for (let y = 0; y < cv.height; y += 3) col.push(px[(y * cv.width + mx) * 4]);
                out.heights = 'высота 0..255 (255 — потолок карты, h = v/255·HMAX − H0 = v/255·' + G.HMAX + ' − ' + G.H0 + ')\n' +
                    'строка y=' + (C.y + my / S).toFixed(1) + ', шаг 0.5 ед.:\n' + row.join(' ') + '\nстолбец x=' + (C.x + mx / S).toFixed(1) + ':\n' + col.join(' ');
                let lo = 255, hi = 0;
                for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); }
                for (let i = 0; i < px.length; i += 4) { const v = hi > lo ? (px[i] - lo) / (hi - lo) * 255 : 0; px[i] = px[i + 1] = px[i + 2] = v; }
                g.putImageData(d, 0, 0);
            }
            out[ps] = cv.toDataURL().split(',')[1];
        }
        return out;
    }, box);
    for (const k of ['albedo', 'height', 'mat']) fs.writeFileSync(out + 'f-map-' + k + '.png', Buffer.from(maps[k], 'base64'));
    fs.writeFileSync(out + 'f-heights.txt', maps.heights + '\n');

    console.log(errors.length ? 'ОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n') : 'ошибок страницы нет');
    console.log('кадры: ' + out + '*.png  →  python3 tools/sheet.py ' + out + ' 4 300');
    await browser.close();
})();
