// ================= ЗАВИСТЬ: ГЛАЗА ВОКРУГ ОКНА =================
// Шкурка окна зависти (CLAUDE.md, инвариант 8; образец — пена похоти,
// docs/plan/25-lust-foam-transition.md): рамка из хаотично расставленных
// глаз — разного размера, под разным углом, внахлёст — и крестик, выложенный
// такими же глазами. Материал греха: за тобой наблюдают отовсюду.
//
// Глаз — чёрный миндаль с зелёной радужкой. Чёрный тот же, что фон окна,
// поэтому глаза сливаются друг с другом и с тьмой: где начинается и кончается
// форма, видно не всегда, и так задумано (оценка игрока). Контура у глаз НЕТ
// — зелёная обводка превращала рамку в россыпь листьев.
//
// Правила раскладки (оценка игрока):
//   * миндали могут налезать друг на друга только чёрным на чёрное: сначала
//     рисуются ВСЕ миндали, потом ВСЕ радужки — ни один глаз не закрывает
//     чужую радужку;
//   * радужки не ставятся близко друг к другу (IRIS_GAP — доля от суммы
//     радиусов), а радужка целиком лежит в рамке: ни на сцену, ни за край
//     холста она не выходит, поэтому в узких боках глаза мельче, наверху и
//     внизу крупнее.
//
// Механизм окна общий (MinigameWindow.attach, опция skin), здесь только вид:
//   rim, cross, bg, reach(), drawGen(ctx, scale) — как у LustFoam.
// Переход (veil*) — следующий этап: пока его нет, окно спрашивает «выйти?».
//
// Как дёшево: глаз — один путь и один градиент, их несколько десятков.
// Рисуются один раз генератором в простое (MinigameWindow.wearSkin), в кадре
// рамка неподвижна.
const EnvyEyes = {
    SEED: 4217,
    rim: { side: 16, top: 54 },
    cross: { x: 358, y: 28, size: 46 },
    CORNER: 26,
    // Миндали заходят в сцену не дальше этого: по числу окно нарезает рамку
    // на полосы (reach). Настоящий заход считается раскладкой.
    REACH_MAX: 60,
    // Глаза кромки по стороне: сверху и снизу — крупнее, по бокам — средние
    // и почти вдоль. big — доля крупных, L / Ls — длины крупных и мелких,
    // off — сдвиг центра от кромки в долях полувысоты (минус — в рамку),
    // tilt + jit — наклон к кромке (наименьший и разброс), diag — доля
    // диагональных.
    SIDES: {
        h: { big: 0.55, L: [70, 110], Ls: [36, 56], off: [-0.5, 0.5], tilt: 0.12, jit: 0.4, diag: 0.25 },
        // Низ — над шкалой всего ~11 единиц: глаза глубже в рамке, чтобы
        // наклон не доставал до шкалы (иначе внизу шли одинаковые плоские).
        b: { big: 0.5, L: [64, 110], Ls: [34, 54], off: [-1.2, -0.3], tilt: 0.1, jit: 0.55, diag: 0.1 },
        v: { big: 0.4, L: [58, 84], Ls: [36, 56], off: [-0.3, 0.6], tilt: 0.18, jit: 0.45, diag: 0.25 }
    },
    // Сколько кромки можно оставить открытой подряд, если ни один глаз не
    // встал (единиц холста). Цель — почти нигде.
    GAP_STEP: 4,
    TRIES: 200,
    PICK: 8,          // сколько подходящих глаз сравнивать на каждом шаге
    // Шкалу зависти перекрывать нельзя (оценка игрока). Прямоугольник шкалы
    // в координатах тела окна (390×800) — тот же, что в envy.css
    // (.envy-gauge-wrap: left/right 7%, bottom 18px, height 18px), с запасом
    // KEEP_PAD. Поменял шкалу там — поменяй и здесь.
    KEEP: [{ x0: 27.3, y0: 764, x1: 362.7, y1: 782 }],
    KEEP_PAD: 5,
    // Мелкие глаза в чёрных просветах рамки — после цепочки.
    FILL: { tries: 400, L: [20, 34] },
    IRIS: 0.16,       // радиус радужки в долях длины глаза (рисунок игрока)
    IRIS_GAP: 2.1,    // центры радужек не ближе этого × сумма радиусов
    FILL_GAP: 2.6,    // у мелких в глубине рамки — реже
    CELL: 40,
    YIELD: 1500,
    _eyes: null,

    get bg() { return this.pal().base; },
    pal() { return PALETTE.envyEyes; },
    reach() { return this._reach || this.REACH_MAX; },

    inner() {
        return this._inner || (this._inner = MinigameWindow.skinGeometry(this).inner);
    },

    // Расстояние до края сцены со скруглёнными углами: больше нуля — в рамке.
    edge(x, y) {
        const I = this.inner(), R = this.CORNER;
        const hx = (I.x1 - I.x0) / 2 - R, hy = (I.y1 - I.y0) / 2 - R;
        const px = Math.abs(x - (I.x0 + I.x1) / 2) - hx, py = Math.abs(y - (I.y0 + I.y1) / 2) - hy;
        return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - R;
    },

    inCross(x, y) {
        const C = this.cross, h = C.size / 2 + 13;
        return Math.abs(x - C.x) < h && Math.abs(y - C.y) < h;
    },

    rng() {
        let a = this.SEED >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    // ---------- РАСКЛАДКА ----------
    // Кромка сцены должна быть закрыта глазами почти везде (оценка игрока:
    // ровная рамка не должна читаться), но без наплывов без зрачков — край
    // ломают только сами глаза. Поэтому раскладка — обход кромки: курсор
    // стоит на первой открытой точке, подбирается глаз (длина, угол, сдвиг —
    // случайно), который накрывает эту точку и уходит дальше; курсор
    // переезжает на конец накрытого. Не встал ни один из TRIES — кромка
    // остаётся открытой на GAP_STEP. Радужки — не ближе IRIS_GAP × сумма
    // радиусов, шкалу и крестик не трогают.
    // Потом мелкие глаза в глубине рамки, чтобы чёрное не пустовало.
    *layoutGen() {
        const rng = this.rng(), eyes = [], grid = new Map();
        const key = (i, j) => i * 1000 + j;
        const fits = (x, y, r, gap) => {
            const ci = Math.floor(x / this.CELL), cj = Math.floor(y / this.CELL);
            for (let i = ci - 2; i <= ci + 2; i++) {
                for (let j = cj - 2; j <= cj + 2; j++) {
                    for (const o of grid.get(key(i, j)) || []) {
                        // к мелким зрачкам крестика можно ближе: иначе у угла
                        // оставалась открытая полоса кромки
                        const g = o.cross ? Math.min(gap, 1.5) : gap;
                        if (Math.hypot(o.x - x, o.y - y) < g * (o.r + r)) return false;
                    }
                }
            }
            return true;
        };
        const put = (eye) => {
            eyes.push(eye);
            const kk = key(Math.floor(eye.x / this.CELL), Math.floor(eye.y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(eye);
        };
        const lerp = (a, t) => a[0] + (a[1] - a[0]) * t;
        for (const e of this.crossEyes()) {
            e.cross = true;
            const kk = key(Math.floor(e.x / this.CELL), Math.floor(e.y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(e);
        }

        const path = this.seamPath(), N = path.length;
        const at = (i) => path[((i % N) + N) % N];
        const covered = (eye, i) => { const q = at(i); return this.inAlmond(eye, q.x, q.y); };
        // Начинаем с середины верха: там крупные глаза, шов на углу не нужен.
        let cur = 0, guard = 0;
        const chain = [];
        // счёт похожих соседей — для tools/probe-envy-rim.js
        this._alike = 0; this._alikeAt = [];
        const recent = [];
        while (cur < N && guard++ < 5000) {
            const q = at(cur);
            const P = this.SIDES[Math.abs(q.tx) > Math.abs(q.ty) ? (q.ny < 0 ? 'b' : 'h') : 'v'];
            const tang = Math.atan2(q.ty, q.tx);
            // Из подходящих — тот, что накрывает кромку дальше всех: глаза
            // встают уголок к уголку, а не наползают друг на друга (сильный
            // нахлёст прятал уголки, и кромка выходила гребешком пены).
            // Соседи не похожи (оценка игрока: одинаковые глаза подряд
            // бросаются в глаза). Уровни: 2 — с предыдущим различие и размером,
            // и углом; 1 — только размером (угол «старается», размер —
            // обязательно); 0 — похож, это исключение, считается. С тем, что
            // через один, — хотя бы одно различие, иначе уровень 0. Берётся
            // высший уровень, в нём — кто дальше накрыл кромку.
            const p1 = chain[chain.length - 1], p2 = chain[chain.length - 2];
            let best = null, bestRun = 0, bestTier = -1, found = 0;
            for (let k = 0; k < this.TRIES && found < this.PICK; k++) {
                const L = lerp(rng() < P.big ? P.L : P.Ls, rng());
                // Не вдоль кромки, а с наклоном: один уголок острым выходит на
                // сцену, другой прячется в рамке. Глаз, лежащий ровно вдоль,
                // показывал из-под кромки только круглый бок — гребешок пены.
                let rel = (rng() < 0.5 ? -1 : 1) * (P.tilt + rng() * P.jit);
                if (rng() < P.diag) rel = (rng() < 0.5 ? -1 : 1) * (0.55 + rng() * 0.45);
                const halfH = L * 0.26, off = lerp(P.off, rng()) * halfH;
                // центр впереди курсора: глаз накрывает курсор своим задним краем
                const ahead = L * 0.5 * Math.abs(Math.cos(rel)) * (0.55 + rng() * 0.45);
                const x = q.x + q.tx * ahead + q.nx * off, y = q.y + q.ty * ahead + q.ny * off;
                const eye = { x, y, w: L, r: L * this.IRIS, ang: tang + rel };
                if (!covered(eye, cur) || !fits(x, y, eye.r, this.IRIS_GAP)) continue;
                if (this.hitsKeep(x, y, L, eye.ang) || this.intoScene(eye) > this.REACH_MAX) continue;
                let run = 0;
                while (run < 200 && covered(eye, cur + run)) run++;
                let tier = 2;
                if (p1 && !this.sizeDiff(eye, p1)) tier = 0;
                else if (p1 && !this.angDiff(eye, p1)) tier = 1;
                if (p2 && !this.sizeDiff(eye, p2) && !this.angDiff(eye, p2)) tier = 0;
                if (tier === 2) found++;
                if (tier > bestTier || (tier === bestTier && run > bestRun)) { best = eye; bestRun = run; bestTier = tier; }
            }
            if (!best) { cur += this.GAP_STEP; continue; }
            if (bestTier === 0) { this._alike++; this._alikeAt.push([Math.round(best.x), Math.round(best.y)]); }
            put(best);
            chain.push(best);
            recent.push(best);
            if (recent.length > 6) recent.shift();
            // курсор — на первую точку, которую не накрыл никто из последних
            while (cur < N && recent.some(e => covered(e, cur))) cur++;
            if (guard % 8 === 0) yield;
        }

        // Мелкие в глубине рамки: радужка целиком в рамке.
        const F = this.FILL;
        for (let n = 0; n < F.tries; n++) {
            const x = rng() * STAGE_W, y = rng() * STAGE_H;
            const e = this.edge(x, y);
            if (e <= 0 || this.inCross(x, y)) continue;
            const w = lerp(F.L, rng()), r = w * this.IRIS;
            if (r > Math.min(e, x, y, STAGE_W - x, STAGE_H - y) - 2 || !fits(x, y, r, this.FILL_GAP)) continue;
            const eye = { x, y, w, r, ang: this.tangent(x, y) + (rng() - 0.5) * 1.4 };
            if (this.hitsKeep(x, y, w, eye.ang)) continue;
            // мелкие — под крупными: в списке первыми, рисуются раньше
            eyes.unshift(eye);
            const kk = key(Math.floor(x / this.CELL), Math.floor(y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(eye);
        }
        let reach = 0;
        for (const e of eyes) reach = Math.max(reach, this.intoScene(e));
        this._reach = Math.ceil(reach) + 2;
        yield;
        return eyes;
    },

    // Шов, который надо закрыть: кромка видимой сцены (скруглённый
    // прямоугольник, как у edge()) на SEAM_IN единицы внутрь сцены, точками
    // через 1 единицу. tx, ty — направление обхода, nx, ny — нормаль В сцену.
    // Обход по часовой, от середины верха.
    SEAM_IN: 2,
    seamPath() {
        const I = this.inner(), d = this.SEAM_IN, R = this.CORNER - d;
        const x0 = I.x0 + d, y0 = I.y0 + d, x1 = I.x1 - d, y1 = I.y1 - d;
        const pts = [];
        const line = (ax, ay, bx, by) => {
            const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len;
            for (let s = 0; s < len; s += 1) pts.push({ x: ax + tx * s, y: ay + ty * s, tx, ty, nx: -ty, ny: tx });
        };
        const arc = (cx, cy, a0) => {
            const n = Math.ceil(R * Math.PI / 2);
            for (let i = 0; i < n; i++) {
                const a = a0 + (i / n) * Math.PI / 2, ox = Math.cos(a), oy = Math.sin(a);
                pts.push({ x: cx + ox * R, y: cy + oy * R, tx: -oy, ty: ox, nx: -ox, ny: -oy });
            }
        };
        const mx = (x0 + x1) / 2;
        line(mx, y0, x1 - R, y0);
        arc(x1 - R, y0 + R, -Math.PI / 2);
        line(x1, y0 + R, x1, y1 - R);
        arc(x1 - R, y1 - R, 0);
        line(x1 - R, y1, x0 + R, y1);
        arc(x0 + R, y1 - R, Math.PI / 2);
        line(x0, y1 - R, x0, y0 + R);
        arc(x0 + R, y0 + R, Math.PI);
        line(x0 + R, y0, mx, y0);
        return pts;
    },

    // Точка внутри миндаля: в системе глаза |v| не выше верхней дуги.
    // Дуга — та же кубическая Безье, что в almond(); её высота от u
    // берётся по таблице (ALMOND_T), посчитанной один раз.
    inAlmond(e, x, y) {
        const c = Math.cos(e.ang), s = Math.sin(e.ang), dx = x - e.x, dy = y - e.y;
        const u = (dx * c + dy * s) / e.w, v = Math.abs(-dx * s + dy * c) / e.w;
        if (u <= -0.5 || u >= 0.5) return false;
        const T = this.almondTable(), f = (u + 0.5) * (T.length - 1), i = Math.floor(f);
        const h = T[i] + (T[Math.min(i + 1, T.length - 1)] - T[i]) * (f - i);
        return v < h;
    },

    almondTable() {
        if (this._almondT) return this._almondT;
        // верхняя дуга almond() при w = 1: (-0.5,0) → (0.5,0), опоры ±0.22, высота a·1.38
        const a = 0.26 * 1.38, n = 64, T = new Array(n + 1).fill(0);
        for (let k = 0; k <= 400; k++) {
            const t = k / 400, m = 1 - t;
            const bx = m * m * m * -0.5 + 3 * m * m * t * -0.22 + 3 * m * t * t * 0.22 + t * t * t * 0.5;
            const by = 3 * m * m * t * a + 3 * m * t * t * a;
            const j = Math.round((bx + 0.5) * n);
            T[j] = Math.max(T[j], by);
        }
        return (this._almondT = T);
    },

    // Те же прямоугольники шкалы в координатах холста: тело окна уменьшено
    // в k и сдвинуто в угол сцены (MinigameWindow.skinGeometry).
    keepRects() {
        if (this._keep) return this._keep;
        const G = MinigameWindow.skinGeometry(this), I = G.inner, p = this.KEEP_PAD;
        return (this._keep = this.KEEP.map(r => ({
            x0: I.x0 + r.x0 * G.k - p, y0: I.y0 + r.y0 * G.k - p,
            x1: I.x0 + r.x1 * G.k + p, y1: I.y0 + r.y1 * G.k + p })));
    },

    // Заходит ли глаз на шкалу: углы прямоугольника и точки контура глаза.
    hitsKeep(x, y, w, ang) {
        const e = { x, y, w, ang }, a = w / 2;
        for (const R of this.keepRects()) {
            if (x + a < R.x0 || x - a > R.x1 || y + a < R.y0 || y - a > R.y1) continue;
            for (let px = R.x0; px <= R.x1; px += 3) {
                if (this.inAlmond(e, px, R.y0) || this.inAlmond(e, px, R.y1)) return true;
            }
            for (let py = R.y0; py <= R.y1; py += 3) {
                if (this.inAlmond(e, R.x0, py) || this.inAlmond(e, R.x1, py)) return true;
            }
            if (x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1) return true;
        }
        return false;
    },

    // Насколько глубоко миндаль заходит в сцену (по эллипсу с теми же осями).
    intoScene(e) {
        const I = this.inner(), a = e.w / 2, b = e.w * 0.27, c = Math.cos(e.ang), sn = Math.sin(e.ang);
        let m = 0;
        for (let i = 0; i < 24; i++) {
            const t = i / 24 * Math.PI * 2, ex = Math.cos(t) * a, ey = Math.sin(t) * b;
            const px = e.x + ex * c - ey * sn, py = e.y + ex * sn + ey * c;
            m = Math.max(m, Math.min(px - I.x0, I.x1 - px, py - I.y0, I.y1 - py));
        }
        return m;
    },

    // Направление кромки сцены рядом с точкой: у верха и низа горизонталь, у
    // боков вертикаль.
    // Различие соседей: длины — не ближе SIZE_K раз, углы (миндаль
    // симметричен, сравнение по модулю π) — не ближе ANG_K.
    SIZE_K: 1.3,
    ANG_K: 0.35,
    sizeDiff(a, b) { return Math.max(a.w, b.w) / Math.min(a.w, b.w) >= this.SIZE_K; },
    angDiff(a, b) {
        let d = Math.abs(a.ang - b.ang) % Math.PI;
        return Math.min(d, Math.PI - d) >= this.ANG_K;
    },

    tangent(x, y) {
        const I = this.inner();
        const dx = Math.max(I.x0 - x, x - I.x1, 0), dy = Math.max(I.y0 - y, y - I.y1, 0);
        return dx > dy ? Math.PI / 2 : 0;
    },

    // Глаза крестика: два ряда вдоль диагоналей, каждый глаз повёрнут по
    // своему штриху, чтобы штрих читался линией.
    crossEyes() {
        const C = this.cross, out = [], n = 5, half = C.size * 0.42;
        for (const dir of [1, -1]) {
            for (let i = 0; i < n; i++) {
                const t = (i / (n - 1)) * 2 - 1;
                out.push({ x: C.x + t * half, y: C.y + dir * t * half,
                           w: C.size * 0.5, r: C.size * 0.125, ang: dir > 0 ? Math.PI / 4 : -Math.PI / 4 });
            }
        }
        return out;
    },

    // ---------- ГЛАЗ ----------
    // Миндаль: две дуги между острыми уголками, высота ~0,52 длины — как на
    // рисунке игрока. Радужка — круг по центру с мягким бликом.
    almond(ctx, w) {
        const a = w * 0.26;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.bezierCurveTo(-w * 0.22, -a * 1.38, w * 0.22, -a * 1.38, w / 2, 0);
        ctx.bezierCurveTo(w * 0.22, a * 1.38, -w * 0.22, a * 1.38, -w / 2, 0);
        ctx.closePath();
    },

    // Миндаль — только чёрная заливка, без контура.
    body(ctx, e) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.ang);
        this.almond(ctx, e.w);
        ctx.fillStyle = this.pal().base;
        ctx.fill();
        ctx.restore();
    },

    // Радужка — плоский зелёный круг: без градиента, блика и свечения
    // (оценка игрока: только чёрное тело и плоский зелёный зрачок).
    iris(ctx, e) {
        if (!e.r) return;
        ctx.fillStyle = this.pal().iris;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
    },

    draw(ctx, scale) {
        for (const _ of this.drawGen(ctx, scale)) { /* до конца */ }
    },

    *drawGen(ctx, scale) {
        const P = this.pal();
        const job = this.layoutGen();
        let r = job.next();
        while (!r.done) { yield; r = job.next(); }
        const eyes = this._eyes || (this._eyes = r.value);
        // Тьма под глазами: всё вне сцены, но на 4 единицы глубже её края —
        // там, где глаза не легли, рамка не должна светиться сценой.
        ctx.save();
        ctx.fillStyle = P.base;
        ctx.beginPath();
        ctx.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        const I = this.inner(), e = 4;
        if (ctx.roundRect) ctx.roundRect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e, this.CORNER + e);
        else ctx.rect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e);
        ctx.fill('evenodd');
        ctx.restore();
        yield;
        // Сначала все чёрные формы, потом все радужки: чёрное на чёрном
        // сливается, а радужку чужой глаз закрыть не может.
        const cross = this.crossEyes();
        for (const eye of eyes) this.body(ctx, eye);
        yield;
        for (const eye of eyes) this.iris(ctx, eye);
        for (const eye of cross) this.iris(ctx, eye);
    }
};
