const { chromium } = require('playwright');
const fs = require('fs');

// ================= АППАРАТ АЛЧНОСТИ: ПОИСК «ВДАВЛЕННЫХ» ДЕТАЛЕЙ =================
// Ищет на корпусе места, где деталь лежит НИЖЕ того, что нарисовано под ней
// (колба ниже доски, шар рычага ниже панели слева). Шейдер видит там канаву
// по контуру детали: тень на освещённой стороне, светлая кромка на другой —
// «вдавлено», «ореол», «пространство продавливается» (игрок, 28–29.10.2026).
//
// Как: карта высот рисуется дважды — обычным проходом (верхняя деталь
// закрывает нижние) и проходом heightmax (в каждой точке — самая высокая из
// всех деталей, смешение lighten). Где второй выше первого — верхняя деталь
// ниже того, что под ней. Дыры (.pit) и нарочно утопленное (.sunk) не
// считаются. Подробно — docs/bench/greed-audit.md, разд. «Аномалии».
//
//   NODE_PATH=/opt/node22/lib/node_modules node tools/greed-sink.js /tmp/sink-
//
// Пишет: <out>map.png — корпус, вдавленное красным (ярче — глубже), и список
// мест: где (поле), площадь, глубина, какая деталь сверху (высота, материал,
// начало разметки — по нему её находят в коде поиском).
// Порог — SINK_MIN единиц глубины (по умолчанию 0.6), меньшие места —
// SINK_AREA кв. единиц (по умолчанию 1). Колесо и короб пачинко включены, как
// у игрока со всеми покупками, и что под ними — не проверяется (не видно);
// DEVICES=0 — без них, тогда виден весь верхний ящик.

(async () => {
    const out = process.argv[2] || '/tmp/sink-';
    const port = process.env.PORT || 8777;
    const minDepth = +(process.env.SINK_MIN || 0.6), minArea = +(process.env.SINK_AREA || 1);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const devices = process.env.DEVICES !== '0';
    await page.addInitScript((on) => { localStorage.setItem('gj-wheel', on ? '1' : '0'); localStorage.setItem('gj-pachinko', on ? '1' : '0'); }, devices);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.waitForTimeout(2500);

    const res = await page.evaluate(async ([minDepth, minArea, devices]) => {
        const G = GreedJunk, S = 2, W = G.W * S, H = G.H * S;
        G.wheelApart = devices && G.wheelShown();      // как в игре: колесо — своим холстом
        // закрыто колесом и коробом пачинко — не видно, не проверяем
        const hidden = (x, y) => {
            if (!devices) return false;
            const Wh = G.SLOTS.wheel, P = G.PACH;
            if (G.wheelShown() && Math.hypot(x - Wh.cx, y - Wh.cy) < Wh.r + 2) return true;
            if (G.pachinkoShown()) { const R = G.pachRect({ x: P.x0, y: P.y0, w: P.x1 - P.x0, h: P.y1 - P.y0 }); if (x > R.x && x < R.x + R.w && y > R.y && y < R.y + R.h) return true; }
            return false;
        };
        const raster = async (pass) => {
            const svg = G.bodySvg(pass).replace('<svg ', `<svg width="${W}" height="${H}" `);
            G.pass = 'baked';
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            const img = new Image();
            await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
            return { cv, d: g.getImageData(0, 0, W, H).data };
        };
        const [hn, hm, al] = [await raster('height'), await raster('heightmax'), await raster('albedo')];
        const unit = G.HMAX / 255;                       // уровень карты → единицы высоты
        const dep = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) {
            if (hn.d[i * 4 + 3] < 250) continue;          // край рисунка — без проверки
            if (hidden((i % W) / S, ((i / W) | 0) / S + G.Y0)) continue;
            const dd = (hm.d[i * 4] - hn.d[i * 4]) * unit;
            if (dd >= minDepth) dep[i] = dd;
        }
        // места — связные области
        const seen = new Uint8Array(W * H), spots = [];
        for (let i = 0; i < W * H; i++) {
            if (!dep[i] || seen[i]) continue;
            const q = [i], px_ = []; seen[i] = 1;
            let n = 0, sum = 0, max = 0, at = i, x0 = W, y0 = H, x1 = 0, y1 = 0;
            while (q.length) {
                const j = q.pop(), x = j % W, y = (j / W) | 0;
                px_.push(j); n++; sum += dep[j]; if (dep[j] > max) { max = dep[j]; at = j; }
                x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
                for (const k of [j - 1, j + 1, j - W, j + W]) {
                    if (k < 0 || k >= W * H || seen[k] || !dep[k]) continue;
                    if ((k === j - 1 || k === j + 1) && ((k / W) | 0) !== y) continue;
                    seen[k] = 1; q.push(k);
                }
            }
            const area = n / (S * S);
            if (area < minArea) continue;
            // Видимый край: точка на краю места, рядом с которой снаружи (в
            // обычном проходе, то есть на экране) поверхность выше на порог.
            // Только там свет рисует канаву. Если выше лежащее целиком закрыто
            // деталью (шарнир под планкой), края-ступеньки нет — и на экране
            // ничего не видно: «скрытое противоречие».
            // Засчитывается только край (точка, у которой сосед по стороне —
            // не из места) и только если снаружи видна та самая поверхность,
            // что под деталью выше её (не ниже своей высоты под деталью без
            // полуединицы): так скат соседней детали не выдаёт себя за канаву.
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
            spots.push({ area: +area.toFixed(1), depth: +max.toFixed(1), mean: +(sum / n).toFixed(1),
                box: [x0 / S, y0 / S + G.Y0, (x1 + 1) / S, (y1 + 1) / S + G.Y0].map(v => +v.toFixed(1)),
                at: [(at % W) / S, ((at / W) | 0) / S + G.Y0].map(v => +v.toFixed(1)),
                top: +(hn.d[at * 4] * unit - G.H0).toFixed(1), under: +(hm.d[at * 4] * unit - G.H0).toFixed(1),
                edge: +(edge / S).toFixed(1), step: +step.toFixed(1),
                sample: Array.from({ length: Math.min(30, n) }, (_, k) => px_[Math.floor(k * n / Math.min(30, n))]) });
        }
        // Какая деталь сверху: тот же рисунок разметкой в странице, точка —
        // elementFromPoint; вверх до обёртки детали (--h, --m).
        const host = document.createElement('div');
        host.style.cssText = `position:fixed;left:0;top:0;width:${G.W}px;height:${G.H}px;opacity:0;z-index:99999`;
        host.innerHTML = G.bodySvg('albedo').replace('<svg ', `<svg width="${G.W}" height="${G.H}" `);
        G.pass = 'baked';
        document.body.appendChild(host);
        const hx = (h) => +(parseFloat(h) * G.HMAX - G.H0).toFixed(1);
        // деталь сверху — по большинству из ~30 точек места: одна точка
        // (самая глубокая) часто попадала в дыру или штрих поверх детали
        const topOf = (fx, fy) => {
            const els = document.elementsFromPoint(fx, fy - G.Y0).filter(e => host.contains(e) && e.tagName !== 'svg');
            for (const el of els) {
                let w = el;
                while (w && w !== host) {
                    const st = (w.getAttribute && w.getAttribute('style')) || '';
                    const m = /--h:([\d.]+)/.exec(st);
                    if (m) return { key: hx(m[1]) + '|' + ((/--m:([^;"]+)/.exec(st) || [])[1] || '?') + '|' + el.outerHTML.slice(0, 120).replace(/\s+/g, ' '),
                        h: hx(m[1]), m: (/--m:([^;"]+)/.exec(st) || [])[1], el: el.outerHTML.slice(0, 120).replace(/\s+/g, ' ') };
                    w = w.parentNode;
                }
            }
            return null;
        };
        spots.forEach(s => {
            const votes = new Map();
            s.sample.forEach(j => { const t = topOf((j % W) / S + 0.25, ((j / W) | 0) / S + G.Y0 + 0.25); if (t) { const v = votes.get(t.key) || Object.assign({ n: 0 }, t); v.n++; votes.set(t.key, v); } });
            const best = [...votes.values()].sort((a, b) => b.n - a.n)[0];
            s.part = best ? { h: best.h, m: best.m, share: best.n + '/' + s.sample.length } : null;
            s.el = best ? best.el : '';
            delete s.sample;
        });
        host.remove();
        // главное — длина видимого края со ступенькой и её высота
        spots.sort((a, b) => b.edge * b.step - a.edge * a.step || b.area * b.depth - a.area * a.depth);
        // картинка: цвет корпуса тусклее, вдавленное — красным
        const cv = al.cv, g = cv.getContext('2d'), im = g.getImageData(0, 0, W, H), px = im.data;
        for (let i = 0; i < W * H; i++) {
            px[i * 4] *= 0.45; px[i * 4 + 1] *= 0.45; px[i * 4 + 2] *= 0.45;
            if (dep[i]) { const k = Math.min(1, dep[i] / 6); px[i * 4] = 255; px[i * 4 + 1] *= 1 - k; px[i * 4 + 2] *= 1 - k; px[i * 4 + 3] = 255; }
        }
        g.putImageData(im, 0, 0);
        return { spots, png: cv.toDataURL().split(',')[1] };
    }, [minDepth, minArea, devices]);

    fs.writeFileSync(out + 'map.png', Buffer.from(res.png, 'base64'));
    const minEdge = +(process.env.SINK_EDGE || 1);
    const seen_ = res.spots.filter(s => s.edge >= minEdge), hidden_ = res.spots.filter(s => s.edge < minEdge);
    const line = (s, i) => `${String(i + 1).padStart(2)}. поле ${s.box.join(',')}  край с канавой ${s.edge} ед., ступенька до ${s.step}` +
        `  (площадь ${s.area}, глубина до ${s.depth})  сверху h=${s.top}, под ним h=${s.under}` +
        (s.part ? `  деталь T(${s.part.h}, ${s.part.m || '?'}) в ${s.part.share} точек` : '') + `\n    ${s.el}`;
    const lines = seen_.map(line), hid = hidden_.map(line);
    fs.writeFileSync(out + 'list.txt', 'ВИДНО НА ЭКРАНЕ (канава по краю детали):\n' + lines.join('\n') +
        '\n\nСКРЫТЫЕ ПРОТИВОРЕЧИЯ (выше лежащее закрыто деталью целиком, ступеньки на краю нет):\n' + hid.join('\n') + '\n');
    console.log(seen_.length ? `вдавленных мест, видных на экране: ${seen_.length} (скрытых противоречий ещё ${hidden_.length})\n` + lines.slice(0, 40).join('\n')
        : `вдавленных мест, видных на экране, нет (скрытых противоречий ${hidden_.length})`);
    if (errors.length) console.log('ОШИБКИ СТРАНИЦЫ:\n' + errors.join('\n'));
    console.log('карта: ' + out + 'map.png, список: ' + out + 'list.txt');
    await browser.close();
})();
