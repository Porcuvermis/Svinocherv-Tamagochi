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
        const fine = o.fine || 0, fk = o.fineGrain ? (o.grain || 0.14) / o.fineGrain : 4;
        // Сырое время: раньше всех — то семя, что родилось раньше и ближе.
        // Скорость — доля высоты тела за «ключ».
        const V = o.speed || 0.1;
        const raw = new Float32Array(gw * gh).fill(Infinity);
        // Чьё это место: семя, пришедшее первым. По этой карте пена потом
        // СХОДИТ кусками (chunks ниже) — теми же пятнами, что росли. Граница
        // между соседними пятнами чуть шумит: ровная дуга на стыке двух
        // кругов читалась бы вырезом по циркулю.
        const own = new Int16Array(gw * gh).fill(-1);
        const cells = [];
        for (let j = 0; j < gh; j++) {
            for (let i = 0; i < gw; i++) {
                const k = j * gw + i;
                if (!inside[k]) continue;
                const x = i * S + S / 2, y = j * S + S / 2;
                let best = Infinity, ob = Infinity;
                for (let q = 0; q < pts.length; q++) {
                    const p = pts[q];
                    const d = Math.hypot(x - p.x, y - p.y) / bh;
                    const t = p.t + d / (V * p.r);
                    if (t < best) best = t;
                    const to = t + 0.6 * amp * (vnoise(x * 1.7 + q * 37, y * 1.7 - q * 23) - 0.5);
                    if (to < ob) { ob = to; own[k] = q; }
                }
                raw[k] = best + amp * (vnoise(x, y) + 0.5 * vnoise(x * 2.1 + 31, y * 2.1 + 17) - 0.75)
                    // Мелкий рваный край: разлив и колония растут не
                    // кругом, а языками и заливами. Без этого пятна мути
                    // одним слоем выходили гладкими кругами.
                    + fine * (vnoise(x * fk + 53, y * fk + 11) + 0.55 * vnoise(x * fk * 2.3 + 7, y * fk * 2.3 + 91) - 0.775);
                cells.push(k);
            }
        }
        // Выравнивание по площади: ранг точки среди всех точек тела.
        cells.sort((a, b) => raw[a] - raw[b]);
        const tau = new Float32Array(gw * gh).fill(1);
        const top = o.top == null ? 0.9 : o.top;
        for (let n = 0; n < cells.length; n++) tau[cells[n]] = top * n / Math.max(1, cells.length - 1);
        return { tau, own, inside, gw, gh, S, W, H, box: { x: x0, y: y0, w: bw, h: bh }, seeds: pts };
    },

    // ---------- ПЕНА СХОДИТ КУСКАМИ ----------
    // Пена с тела смывается не разом и не россыпью, а n цельными кусками
    // (docs/plan/21-lust-bath.md, разд. 5г) — нарезанными по ТОЙ ЖЕ карте,
    // по которой она росла. Кусок — это пятно одного семени (own) или
    // несколько соседних, сросшихся: семян двадцать, кусков десять.
    //
    // Почему не полосы карты времени: доля τ ∈ [a, b) — это не пятно, а
    // кольца вокруг всех уже живых пятен разом, и кусок выходил тонкими
    // серпами по всему телу — та самая россыпь.
    //
    // Куски выравниваются по площади: каждый тап смывает примерно 1/n.
    // Самое мелкое пятно сливается с самым мелким соседом, пока кусков
    // больше n; слишком крупное (раннее семя успевает разрастись) режется
    // пополам поперёк своей длинной оси. Ответ:
    //   lab   — номер куска на клетку карты (−1 — не тело);
    //   order — в каком порядке куски сходят: последним выросший — первым
    //           (обратный порядок появления, как у горки над хвостом);
    //   area  — сколько клеток в каждом куске.
    chunks(F, n) {
        const { gw, gh, inside, own, tau } = F, N = gw * gh;
        const lab = new Int16Array(N).fill(-1);
        for (let k = 0; k < N; k++) if (inside[k]) lab[k] = own ? Math.max(0, own[k]) : 0;
        // Сводка по кускам — типизированными массивами: перебор идёт десятки
        // раз, и на Map с соседями он стоил сотню миллисекунд.
        const L = 128, area = new Float64Array(L), sx = new Float64Array(L), sy = new Float64Array(L),
              st = new Float64Array(L), adj = new Uint32Array(L * L);
        const stats = () => {
            area.fill(0); sx.fill(0); sy.fill(0); st.fill(0); adj.fill(0);
            for (let k = 0; k < N; k++) {
                const l = lab[k];
                if (l < 0) continue;
                const i = k % gw, j = (k / gw) | 0;
                area[l]++; sx[l] += i; sy[l] += j; st[l] += tau[k];
                if (i < gw - 1) { const o = lab[k + 1]; if (o >= 0 && o !== l) { adj[l * L + o]++; adj[o * L + l]++; } }
                if (k + gw < N) { const o = lab[k + gw]; if (o >= 0 && o !== l) { adj[l * L + o]++; adj[o * L + l]++; } }
            }
            const R = [];
            for (let l = 0; l < L; l++) if (area[l] > 0) R.push(l);
            R.sort((a, b) => area[a] - area[b]);
            return R;
        };
        const relabel = (from, to) => { for (let k = 0; k < N; k++) if (lab[k] === from) lab[k] = to; };
        // Мелкое — к самому мелкому соседу по общей границе; без соседей
        // (оторванный кусочек уха) — к ближайшему по середине.
        const mergeSmallest = (R) => {
            const r = R[0];
            let to = -1;
            for (const o of R) if (o !== r && adj[r * L + o] && (to < 0 || area[o] < area[to])) to = o;
            if (to < 0) {
                let best = Infinity;
                for (const o of R) if (o !== r) {
                    const d = Math.hypot(sx[o] / area[o] - sx[r] / area[r], sy[o] / area[o] - sy[r] / area[r]);
                    if (d < best) { best = d; to = o; }
                }
            }
            relabel(r, to);
        };
        let next = 1 + Math.max(0, ...Array.from(lab));
        // Слияние и разрез могут ходить по кругу; из всех нарезок ровно на n
        // кусков берётся самая ровная (меньше всего разброс площади).
        let best = null, bestQ = Infinity;
        for (let guard = 0; guard < 40 && next < L; guard++) {
            const R = stats();
            const total = R.reduce((s2, l) => s2 + area[l], 0), target = total / n;
            if (R.length === n) {
                const q = area[R[R.length - 1]] / Math.max(1, area[R[0]]);
                if (q < bestQ) { bestQ = q; best = lab.slice(); }
                if (q < 1.6) break;
            }
            if (R.length > n) { mergeSmallest(R); continue; }
            const big = R[R.length - 1];
            // Мешает мелкое, а крупных нет — мелкое сливается, и пополам на
            // следующем шаге идёт самое крупное: кусков снова n.
            if (R.length === n && area[big] < target * 1.3) { mergeSmallest(R); continue; }
            // Крупное — пополам поперёк длинной оси, по медиане.
            const cx = sx[big] / area[big], cy = sy[big] / area[big];
            let xx = 0, yy = 0, xy = 0;
            const ks = [];
            for (let k = 0; k < N; k++) if (lab[k] === big) {
                const dx = k % gw - cx, dy = ((k / gw) | 0) - cy;
                xx += dx * dx; yy += dy * dy; xy += dx * dy; ks.push(k);
            }
            const ang = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(ang), uy = Math.sin(ang);
            const pr = ks.map(k => (k % gw - cx) * ux + (((k / gw) | 0) - cy) * uy);
            const med = pr.slice().sort((a, b) => a - b)[pr.length >> 1];
            ks.forEach((k, q) => { if (pr[q] > med) lab[k] = next; });
            next++;
        }
        if (best) lab.set(best);
        // Номера кусков — подряд, порядок схода — от выросшего последним.
        const R = stats().sort((a, b) => st[b] / area[b] - st[a] / area[a]);
        const remap = new Int16Array(L).fill(-1);
        R.forEach((l, i) => { remap[l] = i; });
        for (let k = 0; k < N; k++) if (lab[k] >= 0) lab[k] = remap[lab[k]];
        return { lab, n: R.length, area: R.map(l => area[l]), gw, gh, S: F.S };
    },

    // Номер куска в точке холста. Точка за телом (пузырь у кромки, краевая
    // клетка мути) берёт кусок ближайшей клетки тела рядом.
    chunkAt(C, x, y) {
        const i0 = Math.floor(x / C.S), j0 = Math.floor(y / C.S);
        for (let r = 0; r <= 3; r++) {
            for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
                if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
                const i = i0 + di, j = j0 + dj;
                if (i < 0 || j < 0 || i >= C.gw || j >= C.gh) continue;
                const l = C.lab[j * C.gw + i];
                if (l >= 0) return l;
            }
        }
        return 0;
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
