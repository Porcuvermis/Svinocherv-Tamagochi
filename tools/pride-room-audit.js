const { chromium } = require('playwright');
const fs = require('fs');

// ================= ГРИМЁРКА ТЩЕСЛАВИЯ: РЕВИЗИЯ СВЕТА И РЕЛЬЕФА =================
// Тот же набор, что у аппарата алчности (docs/bench/greed-audit.md), для
// гримёрки (pride-room.js + src/core/lit-gl.js):
//
//   1. ВДАВЛЕННОЕ — места, где деталь лежит НИЖЕ того, что нарисовано под ней
//      (как greed-sink.js): карта высот обычным проходом и проходом heightmax
//      (в каждой точке самая высокая деталь). Где второй выше — канава по
//      контуру: «кайма», «ореол», «вдавлено». Список мест с деталью сверху.
//   2. ПОТОЛОК И ДНО КАРТЫ — детали, чья высота упёрлась в край размаха
//      (H0, HMAX): такое круглое выходит плоским и матовым сверху.
//   3. СВЕТ ПО ЧАСТЯМ — кадры слагаемых шейдера (нормаль, тень, рассеянный,
//      лампы, блик, глубина, высота, затенение, уклон), кадры с выключенным
//      по одному светом и кадры при разных наклонах. Лист — одной картинкой.
//
//   python3 -m http.server 8777     # из корня, один раз
//   NODE_PATH=/opt/node22/lib/node_modules node tools/pride-room-audit.js /tmp/pra-
//   python3 tools/sheet.py /tmp/pra-f- 5 260      # лист кадров
//
// REGION=x,y,w,h — снимать только участок (единицы сцены), например зеркало:
// REGION=30,100,230,300. FRAMES=0 — только проверки 1–2, без кадров.
// Порог вдавленного — SINK_MIN единиц (0.6), площадь — SINK_AREA (1).
(async () => {
    const out = process.argv[2] || '/tmp/pra-';
    const port = process.env.PORT || 8777;
    const minDepth = +(process.env.SINK_MIN || 0.6), minArea = +(process.env.SINK_AREA || 1);
    const region = process.env.REGION ? process.env.REGION.split(',').map(Number) : null;
    const browser = await chromium.launch({ executablePath: require('./chrome-path'),
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/tools/pride-room.html?mode=albedo&nobulbs=1`);
    await page.waitForFunction(() => document.title !== '', null, { timeout: 60000 });

    // ---------- 1–2. ВДАВЛЕННОЕ, ПОТОЛОК И ДНО ----------
    const res = await page.evaluate(async ([minDepth, minArea]) => {
        const R = PRIDE_ROOM, K = R.K, S = 2, W = R.W * S, H = R.H * S;
        const raster = async (pass) => {
            const cv = await LitGL.raster(R.svg(pass), W, H);
            return { cv, d: cv.getContext('2d').getImageData(0, 0, W, H).data };
        };
        const hn = await raster('height'), hm = await raster('heightmax'), al = await raster('albedo');
        // Дыры (.pit) и нарочно утопленное (.sunk) — не канавы. В heightmax
        // они лежат внутри обёрток со смешением максимумом и пропадают там
        // не до конца, поэтому вычитаются отдельной маской: видно только их.
        const holeCv = await LitGL.raster(R.svg('mask').replace('</style>',
            '*{visibility:hidden}.pit,.pit *,.sunk,.sunk *{visibility:visible}</style>'), W, H);
        const hole = holeCv.getContext('2d').getImageData(0, 0, W, H).data;
        const unit = K.HMAX / 255;
        const dep = new Float32Array(W * H);
        let ceil = 0, floor = 0;
        for (let i = 0; i < W * H; i++) {
            if (hn.d[i * 4 + 3] < 250) continue;
            if (hn.d[i * 4] >= 254) ceil++;
            if (hn.d[i * 4] <= 1) floor++;
            if (hole[i * 4 + 3] > 10) continue;
            const dd = (hm.d[i * 4] - hn.d[i * 4]) * unit;
            if (dd >= minDepth) dep[i] = dd;
        }
        // связные места
        const seen = new Uint8Array(W * H), spots = [];
        for (let i = 0; i < W * H; i++) {
            if (!dep[i] || seen[i]) continue;
            const q = [i], px_ = []; seen[i] = 1;
            let n = 0, max = 0, at = i, x0 = W, y0 = H, x1 = 0, y1 = 0;
            while (q.length) {
                const j = q.pop(), x = j % W, y = (j / W) | 0;
                px_.push(j); n++; if (dep[j] > max) { max = dep[j]; at = j; }
                x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
                for (const k of [j - 1, j + 1, j - W, j + W]) {
                    if (k < 0 || k >= W * H || seen[k] || !dep[k]) continue;
                    if ((k === j - 1 || k === j + 1) && ((k / W) | 0) !== y) continue;
                    seen[k] = 1; q.push(k);
                }
            }
            const area = n / (S * S);
            if (area < minArea) continue;
            // Видимый край: снаружи места поверхность выше на порог — только там
            // свет рисует канаву (тот же счёт, что у greed-sink.js).
            const inSpot = new Set(px_);
            let edge = 0, step = 0;
            for (const j of px_) {
                const x = j % W, y = (j / W) | 0, hj = hn.d[j * 4], under = hm.d[j * 4] * unit;
                if (inSpot.has(j - 1) && inSpot.has(j + 1) && inSpot.has(j - W) && inSpot.has(j + W)) continue;
                let best = 0;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    const xx = x + dx, yy = y + dy, k = yy * W + xx;
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H || inSpot.has(k) || hn.d[k * 4 + 3] < 250) continue;
                    if (hn.d[k * 4] * unit < under - 0.5) continue;
                    best = Math.max(best, (hn.d[k * 4] - hj) * unit);
                }
                if (best >= minDepth) { edge++; step = Math.max(step, best); }
            }
            spots.push({ area: +area.toFixed(1), depth: +max.toFixed(1),
                box: [x0 / S, y0 / S, (x1 + 1) / S, (y1 + 1) / S].map(v => +v.toFixed(1)),
                top: +(hn.d[at * 4] * unit - K.H0).toFixed(1), under: +(hm.d[at * 4] * unit - K.H0).toFixed(1),
                edge: +(edge / S).toFixed(1), step: +step.toFixed(1),
                sample: Array.from({ length: Math.min(30, n) }, (_, k) => px_[Math.floor(k * n / Math.min(30, n))]) });
        }
        // Какая деталь сверху: тот же рисунок разметкой в странице, по
        // большинству точек места — до обёртки детали (--h, --m).
        const host = document.createElement('div');
        host.style.cssText = `position:fixed;left:0;top:0;width:${R.W}px;height:${R.H}px;opacity:0;z-index:99999`;
        host.innerHTML = R.svg('albedo').replace('<svg ', `<svg width="${R.W}" height="${R.H}" `);
        document.body.appendChild(host);
        const hx = (h) => +(parseFloat(h) * K.HMAX - K.H0).toFixed(1);
        const matName = (m) => {
            const v = (m || '').match(/\d+/g); if (!v) return '?';
            const key = v.join(',');
            const hit = Object.keys(MATERIALS).find(n => MATERIALS[n].shine.map(x => Math.round(x * 255)).join(',') === key);
            return hit || m;
        };
        const topOf = (fx, fy) => {
            const els = document.elementsFromPoint(fx, fy).filter(e => host.contains(e) && e.tagName !== 'svg');
            for (const el of els) {
                let w = el;
                while (w && w !== host) {
                    const st = (w.getAttribute && w.getAttribute('style')) || '';
                    const m = /--h:([\d.]+)/.exec(st);
                    if (m) {
                        const mat = matName((/--m:([^;"]+)/.exec(st) || [])[1]);
                        const snip = el.outerHTML.slice(0, 110).replace(/\s+/g, ' ');
                        return { key: hx(m[1]) + '|' + mat + '|' + snip, h: hx(m[1]), m: mat, el: snip };
                    }
                    w = w.parentNode;
                }
            }
            return null;
        };
        spots.forEach(s => {
            const votes = new Map();
            s.sample.forEach(j => { const t = topOf((j % W) / S + 0.25, ((j / W) | 0) / S + 0.25); if (t) { const v = votes.get(t.key) || Object.assign({ n: 0 }, t); v.n++; votes.set(t.key, v); } });
            const best = [...votes.values()].sort((a, b) => b.n - a.n)[0];
            s.part = best ? { h: best.h, m: best.m, share: best.n + '/' + s.sample.length } : null;
            s.el = best ? best.el : '';
            delete s.sample;
        });
        // Высоты, упёртые в край размаха: обёртки с --h ровно 0 или 1.
        const clamped = [];
        host.querySelectorAll('[style*="--h:"]').forEach(g => {
            const v = parseFloat(/--h:([\d.]+)/.exec(g.getAttribute('style'))[1]);
            if (v >= 0.9999 || v <= 0.0001) clamped.push((v >= 0.9999 ? 'ПОТОЛОК ' : 'ДНО ') + g.innerHTML.slice(0, 90).replace(/\s+/g, ' '));
        });
        host.remove();
        spots.sort((a, b) => b.edge * b.step - a.edge * a.step || b.area * b.depth - a.area * a.depth);
        const cv = al.cv, g = cv.getContext('2d'), im = g.getImageData(0, 0, W, H), px = im.data;
        for (let i = 0; i < W * H; i++) {
            px[i * 4] *= 0.45; px[i * 4 + 1] *= 0.45; px[i * 4 + 2] *= 0.45;
            if (dep[i]) { const k = Math.min(1, dep[i] / 6); px[i * 4] = 255; px[i * 4 + 1] *= 1 - k; px[i * 4 + 2] *= 1 - k; }
            const v = hn.d[i * 4];
            if (v >= 254) { px[i * 4] = 40; px[i * 4 + 1] = 160; px[i * 4 + 2] = 255; }
        }
        g.putImageData(im, 0, 0);
        return { spots, clamped, ceil: +(ceil / (S * S)).toFixed(0), floor: +(floor / (S * S)).toFixed(0),
                 png: cv.toDataURL().split(',')[1] };
    }, [minDepth, minArea]);

    fs.writeFileSync(out + 'map.png', Buffer.from(res.png, 'base64'));
    const minEdge = +(process.env.SINK_EDGE || 1);
    const vis = res.spots.filter(s => s.edge >= minEdge), hid = res.spots.filter(s => s.edge < minEdge);
    const line = (s, i) => `${String(i + 1).padStart(2)}. поле ${s.box.join(',')}  край с канавой ${s.edge} ед., ступенька до ${s.step}` +
        `  (площадь ${s.area}, глубина до ${s.depth})  сверху h=${s.top}, под ним h=${s.under}` +
        (s.part ? `  деталь T(${s.part.h}, ${s.part.m}) в ${s.part.share} точек` : '') + `\n    ${s.el}`;
    fs.writeFileSync(out + 'list.txt', 'ВИДНО НА ЭКРАНЕ (канава по краю детали):\n' + vis.map(line).join('\n') +
        '\n\nСКРЫТЫЕ ПРОТИВОРЕЧИЯ:\n' + hid.map(line).join('\n') +
        '\n\nВЫСОТЫ НА КРАЮ РАЗМАХА:\n' + res.clamped.join('\n') + '\n');
    console.log(vis.length ? `вдавленных мест, видных на экране: ${vis.length} (скрытых ${hid.length})\n` + vis.slice(0, 30).map(line).join('\n')
        : `вдавленных мест, видных на экране, нет (скрытых ${hid.length})`);
    console.log(`карта высот: в потолке ${res.ceil} кв. ед., на дне ${res.floor} кв. ед.; обёрток на краю размаха: ${res.clamped.length}`);
    res.clamped.slice(0, 10).forEach(c => console.log('  ' + c));

    // ---------- 3. СВЕТ ПО ЧАСТЯМ ----------
    if (process.env.FRAMES !== '0') {
        const frames = [
            ['a-lit', ''], ['a-tiltL', 'tx=-0.7'], ['a-tiltR', 'tx=0.7&ty=0.4'], ['a-tiltUp', 'ty=-0.6'],
            ['b-normal', 'dbg=normal'], ['b-shade', 'dbg=shade'], ['b-lit', 'dbg=lit'], ['b-lamps', 'dbg=lamps'],
            ['b-spec', 'dbg=spec'], ['b-depth', 'dbg=depth'], ['b-ao', 'dbg=ao'], ['b-height', 'dbg=height'],
            ['b-plane', 'dbg=plane'], ['b-noshade', 'dbg=noshade'],
            ['c-off-key', 'off=key'], ['c-off-lamps', 'off=lamps'], ['c-off-ao', 'off=ao'], ['c-off-floor', 'off=floor'],
            ['c-off-mirror', 'off=mirror'], ['c-off-shadow', 'off=shadow']
        ];
        for (const [name, q] of frames) {
            await page.goto(`http://127.0.0.1:${port}/tools/pride-room.html?mode=lit&nobulbs=1&${q}`);
            await page.waitForFunction(() => document.title !== '', null, { timeout: 60000 });
            const t = await page.title();
            if (t !== 'READY') console.log(name, t);
            const clip = region ? { x: region[0], y: region[1], width: region[2], height: region[3] } : undefined;
            await page.screenshot({ path: `${out}f-${name}.png`, clip });
        }
        console.log(`кадры: ${out}f-*.png (лист: python3 tools/sheet.py ${out}f- 5 260)`);
    }
    if (errors.length) console.log('ОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n'));
    console.log('карта: ' + out + 'map.png (красное — вдавлено, синее — потолок), список: ' + out + 'list.txt');
    await browser.close();
})();
