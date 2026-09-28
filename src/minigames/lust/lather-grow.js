// ================= ВАННАЯ: КАК ПЕНА РАСТЁТ ПО ТЕЛУ =================
// Мытьё — это не закраска кисточкой, а время трения (решение игрока): палец
// водит по червю где угодно, прогресс копится, а пена проступает на теле
// ЗАРАНЕЕ ЗАГОТОВЛЕННЫМ узором. Закраска заставляла искать последние
// незакрашенные клетки — поиск пикселя, который плохо видно под мутью.
//
// Узор — это КАРТА ВРЕМЕНИ: у каждой точки тела есть момент τ ∈ [0, 1],
// когда на ней появляется пена. Карта строится из СЕМЯН (LATHER_GROW в
// bath-art.js): в заданный момент в заданном месте рождается пятно и
// расползается во все стороны. Где пятна встречаются — срастаются. Поэтому
// каждый следующий этап вырастает из предыдущего и ничего не убирает: это
// один и тот же рост, увиденный в десять моментов.
//
// Время выравнивается ПО ПЛОЩАДИ: при прогрессе p покрыта ровно доля p
// тела. Семена задают ПОРЯДОК и форму роста, а не темп — иначе один
// разогнавшийся край съедал бы полэтапа, а конец тянулся бы вечно.
//
// ---------- ПОЧЕМУ ЧАСТИЦЫ, А НЕ МАСКА ----------
// Картинка собрана из частиц (пятно плёнки, пучок пузырей), и у каждой своё
// τ. Показ этапа — это «дорисовать частицы, чьё время пришло»: рост
// монотонный, стирать не нужно никогда. На весь этап — сотня маленьких
// дорисовок, а не перерисовка холста на каждое движение пальца. Пузырь при
// этом не режется краем маски пополам: он появляется целиком.
const LatherGrow = {

    // Шаг карты времени в пикселях холста мытья. Карта — только ПОРЯДОК
    // появления, мелкая сетка ей ни к чему.
    STEP: 6,

    // Карта времени по маске тела. alpha — альфа маски (0/255), W×H.
    // seeds — [{ u, v, t, r }]: u, v — доля габарита тела (v вниз), t —
    // когда рождается (в «ключах», 1…10), r — как быстро расползается.
    field(alpha, W, H, seeds, opt) {
        const S = this.STEP, gw = Math.ceil(W / S), gh = Math.ceil(H / S);
        const o = opt || {};
        // Габарит тела — по самой маске: семена в долях тела, а не холста.
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        const inside = new Uint8Array(gw * gh);
        for (let j = 0; j < gh; j++) {
            for (let i = 0; i < gw; i++) {
                const px = Math.min(W - 1, i * S + (S >> 1)), py = Math.min(H - 1, j * S + (S >> 1));
                if (!alpha[py * W + px]) continue;
                inside[j * gw + i] = 1;
                if (px < x0) x0 = px; if (px > x1) x1 = px;
                if (py < y0) y0 = py; if (py > y1) y1 = py;
            }
        }
        if (x1 < 0) return null;
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        // Семя, упавшее мимо тела (ухо уже, чем думалось), переезжает на
        // ближайшую точку тела: пятно обязано родиться НА черве.
        const pts = seeds.map(s => {
            let sx = x0 + s.u * bw, sy = y0 + s.v * bh;
            const si = Math.round(sx / S - 0.5), sj = Math.round(sy / S - 0.5);
            if (!(si >= 0 && sj >= 0 && si < gw && sj < gh && inside[sj * gw + si])) {
                let best = Infinity;
                for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
                    if (!inside[j * gw + i]) continue;
                    const d = (i - si) * (i - si) + (j - sj) * (j - sj);
                    if (d < best) { best = d; sx = i * S + S / 2; sy = j * S + S / 2; }
                }
            }
            return { x: sx, y: sy, t: s.t, r: s.r || 1 };
        });
        // Шум края: пятно расползается не кругом, а неровно — как пена.
        const amp = o.noise == null ? 0.35 : o.noise, sc = (o.grain || 0.14) * bh;
        const hash = (i, j) => {
            let h = (i * 374761393 + j * 668265263 + (o.seed || 7) * 1442695041) >>> 0;
            h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
            return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        };
        const vnoise = (x, y) => {
            const fx = x / sc, fy = y / sc, i = Math.floor(fx), j = Math.floor(fy);
            const tx = fx - i, ty = fy - j, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
            const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
            return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
        };
        // Сырое время: раньше всех — то семя, что родилось раньше и ближе.
        // Скорость — доля высоты тела за «ключ».
        const V = o.speed || 0.1;
        const raw = new Float32Array(gw * gh).fill(Infinity);
        const cells = [];
        for (let j = 0; j < gh; j++) {
            for (let i = 0; i < gw; i++) {
                const k = j * gw + i;
                if (!inside[k]) continue;
                const x = i * S + S / 2, y = j * S + S / 2;
                let best = Infinity;
                for (const p of pts) {
                    const d = Math.hypot(x - p.x, y - p.y) / bh;
                    const t = p.t + d / (V * p.r);
                    if (t < best) best = t;
                }
                raw[k] = best + amp * (vnoise(x, y) + 0.5 * vnoise(x * 2.1 + 31, y * 2.1 + 17) - 0.75);
                cells.push(k);
            }
        }
        // Выравнивание по площади: ранг точки среди всех точек тела.
        cells.sort((a, b) => raw[a] - raw[b]);
        const tau = new Float32Array(gw * gh).fill(1);
        const top = o.top == null ? 0.9 : o.top;
        for (let n = 0; n < cells.length; n++) tau[cells[n]] = top * n / Math.max(1, cells.length - 1);
        return { tau, inside, gw, gh, S, W, H, box: { x: x0, y: y0, w: bw, h: bh }, seeds: pts };
    },

    // τ в точке холста (за телом — 1: там пены не бывает).
    at(F, x, y) {
        const i = Math.floor(x / F.S), j = Math.floor(y / F.S);
        if (i < 0 || j < 0 || i >= F.gw || j >= F.gh) return 1;
        return F.inside[j * F.gw + i] ? F.tau[j * F.gw + i] : 1;
    },

    // Частицы: сетка с дрожанием шагом в клетку пены, у каждой — плёнка в
    // своё τ и пузыри чуть позже. Сначала место МУТНЕЕТ, потом на нём
    // проступают пузыри — пятно становится гуще и ярче, а не возникает
    // готовым. lag — насколько пузыри отстают от плёнки.
    sprites(F, cell, opt) {
        const o = opt || {}, rng = btRng(o.seed || 11);
        const step = cell * 1.25, lag = o.lag == null ? 0.05 : o.lag;
        const out = [];
        let n = 0;
        for (let y = F.box.y; y < F.box.y + F.box.h + step; y += step * 0.87) {
            const row = Math.round((y - F.box.y) / (step * 0.87));
            for (let x = F.box.x - step; x < F.box.x + F.box.w + step; x += step) {
                const px = x + (row % 2) * step * 0.5 + (rng() - 0.5) * step * 0.6;
                const py = y + (rng() - 0.5) * step * 0.6;
                const t = this.at(F, px, py);
                n++;
                if (t >= 1) continue;
                const j = (rng() - 0.5) * 0.012;
                out.push({ x: px, y: py, t: Math.max(0, t + j), part: 'base', seed: n * 7 + 3 });
                // Мочалка ВЗБИВАЕТ (whip): на месте сперва редкая мелкая пена,
                // потом поверх — густая крупная. Мыло кладёт пузыри один раз.
                if (o.whip) {
                    out.push({ x: px, y: py, t: Math.min(0.999, t + lag * (0.2 + rng() * 0.3)), part: 'foam', k: 0.35, seed: n * 7 + 3 });
                    out.push({ x: px, y: py, t: Math.min(0.999, t + lag * (0.7 + rng() * 0.3)), part: 'foam', k: 1, seed: n * 7 + 5 });
                } else {
                    out.push({ x: px, y: py, t: Math.min(0.999, t + lag * (0.4 + rng() * 0.6)), part: 'foam', seed: n * 7 + 3 });
                }
            }
        }
        out.sort((a, b) => a.t - b.t);
        return out;
    }
};

if (typeof window !== 'undefined') window.LatherGrow = LatherGrow;
