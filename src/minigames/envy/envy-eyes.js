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
// Рамка в два слоя (замысел игрока): подложка из чёрных миндалей без
// зрачков сливается в массу и делает неровный край, поверх — немного
// активных глаз с зелёной обводкой и моргающим зрачком, расставленных
// свободно (см. «ДВА СЛОЯ» ниже). Сначала рисуются все тела, потом зрачки:
// чужой глаз зрачок не закрывает.
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
    cross: { x: 350, y: 32, size: 46 },
    CORNER: 26,
    // Миндали заходят в сцену не дальше этого: по числу окно нарезает рамку
    // на полосы (reach). Настоящий заход считается раскладкой.
    REACH_MAX: 40,
    // ---------- ДВА СЛОЯ (замысел игрока) ----------
    // ПОДЛОЖКА — чёрные миндали без зрачка и без обводки: сливаются в одну
    // массу, налезают как угодно и ни с кем не спорят. Ими закрыт шов рамки
    // и сделан неровный край.
    // АКТИВНЫЕ — чёрные с зелёной обводкой и моргающим зрачком: их немного,
    // и они больше не обязаны закрывать кромку, поэтому стоят свободно —
    // поодаль друг от друга, разного размера и угла, без повторов рядом.
    // Обратных (зелёный миндаль) — единицы.
    // Раньше вся рамка была из активных: чтобы закрыть кромку, их ставили
    // плотно, и рамка читалась узором одинаковых глаз.
    BASE: { L: [34, 130], off: [-0.9, 0.5], jit: 0.7 },
    ACTIVE_N: 11,            // сколько активных на периметр
    ACTIVE_JIT: 0.35,        // разброс шага между ними (доля среднего)
    // Длины активных — от эталона, глаза-индикатора (IND_L = 100):
    // ступень ниже / вровень / ступень выше и их доли. Были 28–116 — рядом
    // с рамкой почти все выглядели крошечными (оценка игрока).
    ACTIVE_L: [[[60, 82], 0.3], [[82, 112], 0.45], [[112, 140], 0.25]],
    ACTIVE_REACH: 58,        // активным можно заходить на сцену, как индикаторам
    // Семейства наклона к кромке (rel — наклон, рад; cap — наибольшая длина:
    // смелый наклон у крупного не помещается на экран).
    ACTIVE_FAM: [
        { rel: [0, 0.3], cap: 140 },        // вдоль
        { rel: [0.45, 0.85], cap: 120 },    // средний
        { rel: [0.95, 1.35], cap: 95 }      // смелый, почти поперёк
    ],
    ACTIVE_NEAR: 0.9,        // «рядом» — центры ближе этого × сумма длин
    ACTIVE_ANG_K: 0.5,       // рядом стоящие различаются углом хотя бы на ~29°
    ACTIVE_OFF: [-0.6, 0.7],
    ACTIVE_GAP: 2.6,         // зрачки активных — не ближе этого × сумма радиусов
    INV_N: 3,                // обратных на всю рамку
    GAP_STEP: 4,
    TRIES: 60,
    PICK: 8,
    // Прямоугольники, на которые глаза рамки не заходят (в координатах тела
    // окна 390×800, с запасом KEEP_PAD). Была шкала зависти; её больше нет —
    // деления показывают глаза-индикаторы внизу рамки (indicatorEyes).
    KEEP: [],
    KEEP_PAD: 5,
    IRIS: 0.16,       // радиус радужки в долях длины глаза (рисунок игрока)
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
    // 1. Подложка — обход кромки: курсор на первой открытой точке шва,
    //    глаз без зрачка накрывает её и уходит дальше (из подходящих —
    //    случайный среди накрывающих дальше всех). Правил соседства нет.
    // 2. Активные — вдоль периметра с неравным шагом, каждый — лучший из
    //    кандидатов: зрачок на экране и поодаль от чужих, соседний по
    //    периметру не похож размером и углом, веер и крестик не задеты.
    // 3. Обратные — несколько активных, как можно дальше друг от друга.
    *layoutGen() {
        const rng = this.rng(), lerp = (a, t) => a[0] + (a[1] - a[0]) * t;
        const inds = this.indicatorEyes(), cross = this.crossEyes();
        for (const e of cross) e.cross = true;
        const path = this.seamPath(), N = path.length;
        const at = (i) => path[((i % N) + N) % N];
        const covered = (eye, i) => { const q = at(i); return this.inAlmond(eye, q.x, q.y); };
        this._alike = 0; this._alikeAt = [];
        const fan = { x0: Math.min(...inds.map(d => d.x)) - 22, x1: Math.max(...inds.map(d => d.x)) + 22,
                      y0: this.inner().y1 - 30 };
        const inFan = (x, y) => x > fan.x0 && x < fan.x1 && y > fan.y0;
        const onScreenIris = (e) => e.x - e.r >= 1 && e.y - e.r >= 1 && e.x + e.r <= STAGE_W - 1 && e.y + e.r <= STAGE_H - 1;

        // 1. ПОДЛОЖКА
        const base = [];
        const B = this.BASE;
        let cur = 0, guard = 0;
        while (cur < N && guard++ < 4000) {
            if (base.some(e => covered(e, cur))) { cur++; continue; }
            const q = at(cur), tang = Math.atan2(q.ty, q.tx);
            const cands = [];
            for (let k = 0; k < this.TRIES && cands.length < this.PICK; k++) {
                const L = lerp(B.L, rng()), rel = (rng() - 0.5) * 2 * B.jit;
                const halfH = L * 0.26, off = lerp(B.off, rng()) * halfH;
                const ahead = L * 0.5 * Math.abs(Math.cos(rel)) * (0.3 + rng() * 0.6);
                const e = { x: q.x + q.tx * ahead + q.nx * off, y: q.y + q.ty * ahead + q.ny * off, w: L, r: 0, ang: tang + rel, base: true };
                if (!covered(e, cur) || this.intoScene(e) > this.REACH_MAX || this.hitsKeep(e.x, e.y, L, e.ang)) continue;
                let run = 0;
                while (run < 300 && covered(e, cur + run)) run++;
                cands.push({ e, run });
            }
            if (!cands.length) { cur += this.GAP_STEP; continue; }
            const max = Math.max(...cands.map(c => c.run));
            const pool = cands.filter(c => c.run >= max * 0.5);
            base.push(pool[Math.floor(rng() * pool.length)].e);
            if (guard % 10 === 0) yield;
        }
        yield;

        // 2. АКТИВНЫЕ
        // Сравниваются только с активными (и индикаторами, крестиком):
        // подложка глазом не читается и в правилах не участвует.
        const act = [];
        const owners = () => act.concat(inds, cross);
        const mean = N / this.ACTIVE_N;
        const pickL = (cap) => {
            let t = rng(), L = null;
            for (const [r, w] of this.ACTIVE_L) { if (t < w) { L = lerp(r, rng()); break; } t -= w; }
            if (L == null) L = lerp(this.ACTIVE_L[1][0], rng());
            return Math.min(L, cap);
        };
        // Семейства наклона к кромке: вдоль, средний, смелый (почти поперёк).
        // Поровну и без двух одинаковых подряд — иначе рамка снова
        // выстраивалась вдоль линии (оценка игрока).
        const F = this.ACTIVE_FAM;
        const fams = [];
        while (fams.length < this.ACTIVE_N + 4) {
            const trio = [0, 1, 2].sort(() => rng() - 0.5);
            if (fams.length && trio[0] === fams[fams.length - 1]) trio.push(trio.shift());
            fams.push(...trio);
        }
        let pos = rng() * mean, slot = 0;
        while (pos < N) {
            const q = at(Math.round(pos)), tang = Math.atan2(q.ty, q.tx);
            const fam = F[fams[slot++]];
            let best = null, bestScore = -1;
            for (let k = 0; k < 160; k++) {
                const L = pickL(fam.cap), halfH = L * 0.26;
                const rel = (rng() < 0.5 ? -1 : 1) * lerp(fam.rel, rng());
                const off = lerp(this.ACTIVE_OFF, rng()) * halfH;
                const slide = (rng() - 0.5) * mean * 0.3;
                const e = { x: q.x + q.tx * slide + q.nx * off, y: q.y + q.ty * slide + q.ny * off,
                            w: L, r: L * this.IRIS, ang: tang + rel, fam: fams[slot - 1] };
                // Активный виден целиком: за краем экрана он — обрубок.
                // Вылез — сдвигаем к сцене, пока не поместится (отказ на
                // этом месте съедал почти все кандидаты, и рамка пустела).
                for (let d = 0; d < 40 && !this.onScreen(e); d += 2) { e.x += q.nx * 2; e.y += q.ny * 2; }
                if (!this.onScreen(e) || this.intoScene(e) > this.ACTIVE_REACH || this.hitsKeep(e.x, e.y, L, e.ang)) continue;
                if (inFan(e.x, e.y) || inds.some(d => this.overlaps(d, e)) || cross.some(c => this.overlaps(c, e))) continue;
                if (owners().some(o => Math.hypot(o.x - e.x, o.y - e.y) < this.ACTIVE_GAP * (o.r + e.r))) continue;
                // Рядом стоящие — непохожи И размером, И углом. Это условие,
                // а не балл: баллом его перебивал перевес крупным, и наверху
                // встали два одинаковых глаза рядом.
                const near = owners().filter(o => Math.hypot(o.x - e.x, o.y - e.y) < this.ACTIVE_NEAR * (o.w + e.w));
                if (near.some(o => !this.sizeDiff(e, o) || !this.angDiffK(e, o, this.ACTIVE_ANG_K))) continue;
                // крупным — перевес: на экран они встают реже мелких
                const score = rng() * 0.5 + L / 100;
                if (score > bestScore) { best = e; bestScore = score; }
            }
            if (best) act.push(best);   // не нашлось непохожего — место пустует
            pos += mean * (1 + (rng() - 0.5) * 2 * this.ACTIVE_JIT);
            yield;
        }

        // 3. ОБРАТНЫЕ — выбираются в pickInverted.
        const eyes = base.concat(act, inds);
        let reach = 0;
        for (const e of eyes) reach = Math.max(reach, this.intoScene(e));
        this._reach = Math.ceil(reach) + 2;
        for (const e of eyes) e.rim = true;
        this.pickInverted(act, inds);
        yield;
        return eyes;
    },

    // ---------- ИНДИКАТОРЫ ----------
    // Шкалы зависти нет: деления — глаза по центру низа рамки (набросок
    // игрока). Они САМЫЕ КРУПНЫЕ на рамке и одного размера и вида — видно,
    // что это не случайность, а порядок; вся остальная рамка — нарочито
    // случайная. Стоят веером: средний вертикально, крайние наклонены
    // верхушками наружу (лучи из точки под экраном). Сколько делений — из
    // конфига (rounds), при прокачке веер перестраивается: глаза уже, шаг
    // теснее. Деление заполнено — зрачок открыт, нет — закрыт (тело с
    // обводкой). Открывает и закрывает их EnvyEyes.setFill.
    IND_L: 100,       // длина глаза-индикатора (при трёх делениях)
    IND_Y: 782,       // центр среднего
    IND_GAP: 66,      // шаг между центрами, пока веер умещается в IND_SPAN
    IND_SPAN: 290,
    IND_DROP: 14,     // насколько крайние ниже среднего (пологая дуга)
    IND_TILT: 0.38,   // наклон на шаг от середины, рад (~22°)
    IND_TILT_MAX: 0.9,// наклон крайних не больше этого (~52°)
    indicatorEyes() {
        if (this._inds) return this._inds;
        const N = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames.envy) ? ECONOMY.minigames.envy.rounds : 3;
        const gap = N > 1 ? Math.min(this.IND_GAP, this.IND_SPAN / (N - 1)) : 0;
        // глаз не шире шага: соседи стоят рядом, а не друг на друге
        const L = Math.min(this.IND_L, gap / 0.62 || this.IND_L);
        // Положение и наклон — порознь: дуга пологая при любом числе (на
        // круге лучей крайние при 5+ уезжали за низ экрана), а наклон
        // растёт к краям сам.
        const cx = STAGE_W / 2, tmax = Math.max(1, (N - 1) / 2);
        const tilt = Math.min(this.IND_TILT, this.IND_TILT_MAX / tmax);
        this._inds = [];
        for (let i = 0; i < N; i++) {
            const t = i - (N - 1) / 2;
            this._inds.push({ x: cx + t * gap, y: this.IND_Y + this.IND_DROP * (t / tmax) * (t / tmax),
                              w: L, r: L * this.IRIS, ang: t * tilt - Math.PI / 2, ind: i });
        }
        return this._inds;
    },

    // Налезают ли два миндаля (по контурам эллипсов и центрам).
    overlaps(a, b) {
        if (this.inAlmond(a, b.x, b.y) || this.inAlmond(b, a.x, a.y)) return true;
        for (const [p, q] of [[a, b], [b, a]]) {
            const c = Math.cos(p.ang), s = Math.sin(p.ang), A = p.w * 0.48, B = p.w * 0.22;
            for (let i = 0; i < 16; i++) {
                const t = i / 16 * Math.PI * 2, ex = Math.cos(t) * A, ey = Math.sin(t) * B;
                if (this.inAlmond(q, p.x + ex * c - ey * s, p.y + ex * s + ey * c)) return true;
            }
        }
        return false;
    },

    // ---------- ОБРАТНЫЕ ГЛАЗА ----------
    // Зелёный миндаль с чёрным зрачком (kind 'inv') — редкость (замысел
    // игрока): INV_N на всю рамку, как можно дальше друг от друга, и только
    // те, чей миндаль не ложится на чужой зелёный зрачок (зелёное на
    // зелёном сливается).
    pickInverted(act, inds) {
        const owners = act.concat(inds);
        const coversIris = (inv, o) => {
            if (this.inAlmond(inv, o.x, o.y)) return true;
            for (let i = 0; i < 8; i++) {
                const t = i / 8 * Math.PI * 2;
                if (this.inAlmond(inv, o.x + Math.cos(t) * o.r * 1.2, o.y + Math.sin(t) * o.r * 1.2)) return true;
            }
            return false;
        };
        const ok = act.filter(e => !owners.some(o => o !== e && o.r && coversIris(e, o)));
        const chosen = [];
        while (chosen.length < this.INV_N && ok.length) {
            let best = null, bestD = -1;
            for (const e of ok) {
                if (chosen.includes(e)) continue;
                const d = chosen.length ? Math.min(...chosen.map(c => Math.hypot(c.x - e.x, c.y - e.y))) : Math.random();
                if (d > bestD) { best = e; bestD = d; }
            }
            if (!best) break;
            best.kind = 'inv';
            chosen.push(best);
        }
    },

    // Шов, который надо закрыть: кромка видимой сцены (скруглённый
    // прямоугольник, как у edge()) на SEAM_IN единицы внутрь сцены, точками
    // через 1 единицу. tx, ty — направление обхода, nx, ny — нормаль В сцену.
    // Обход по часовой, от середины верха.
    // Подложка рамки заходит на сцену на OVERLAP, шов проверяется на
    // полединицы глубже её края (см. drawGen).
    OVERLAP: 1.5,
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
    NEAR_K: 0.5,
    ANG_K: 0.35,
    sizeDiff(a, b) { return Math.max(a.w, b.w) / Math.min(a.w, b.w) >= this.SIZE_K; },
    angDiffK(a, b, k) {
        let d = Math.abs(a.ang - b.ang) % Math.PI;
        return Math.min(d, Math.PI - d) >= k;
    },
    angDiff(a, b) {
        let d = Math.abs(a.ang - b.ang) % Math.PI;
        return Math.min(d, Math.PI - d) >= this.ANG_K;
    },

    // Миндаль целиком на холсте (по эллипсу с теми же осями).
    onScreen(e) {
        const a = e.w / 2, b = e.w * 0.27, c = Math.cos(e.ang), s = Math.sin(e.ang);
        const hx = Math.abs(a * c) + Math.abs(b * s), hy = Math.abs(a * s) + Math.abs(b * c);
        return e.x - hx >= 0 && e.x + hx <= STAGE_W && e.y - hy >= 0 && e.y + hy <= STAGE_H + 2;
    },

    tangent(x, y) {
        const I = this.inner();
        const dx = Math.max(I.x0 - x, x - I.x1, 0), dy = Math.max(I.y0 - y, y - I.y1, 0);
        return dx > dy ? Math.PI / 2 : 0;
    },

    // Крестик — один глаз наоборот: зелёный миндаль с чёрным зрачком-
    // крестиком (набросок игрока). Раньше был выложен десятью мелкими
    // зрачками по диагоналям, потом — зелёный крестик на чёрном глазу
    // (тело сливалось с тьмой, глаза не было видно).
    // r — полуразмер крестика: по нему же держат расстояние чужие зрачки.
    CROSS_W: 68,
    CROSS_R: 10,
    CROSS_ANG: 0.42,
    crossEyes() {
        const C = this.cross;
        // чуть повёрнут вместе с крестиком — в углу так приятнее (набросок
        // игрока); крестиком читается и под углом
        if (!this._cross) this._cross = [{ x: C.x, y: C.y, w: this.CROSS_W, r: this.CROSS_R, ang: this.CROSS_ANG, kind: 'x' }];
        return this._cross;
    },

    // ---------- ГЛАЗ ----------
    // Миндаль: две дуги между острыми уголками, высота ~0,52 длины — как на
    // рисунке игрока. Радужка — круг по центру с мягким бликом.
    // o — раскрытие (0 — закрыт, линия; 1 — открыт): веки сходятся к оси
    // глаза симметрично сверху и снизу (покров, envy-eyes-veil.js).
    almond(ctx, w, o = 1) {
        const a = w * 0.26 * o;
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
        // Чёрная обводка в единицу — не контур (на чёрном её не видно), а
        // нахлёст: два сглаженных края встык (глаз и глаз, глаз и подложка)
        // складывались не до полной непрозрачности, и сцена светила точками.
        ctx.strokeStyle = this.pal().base;
        ctx.lineWidth = 1;
        ctx.stroke();
        this.rimLine(ctx, e);
        ctx.restore();
    },

    // Зелёная обводка чёрных глаз рамки (просьба игрока — для контраста:
    // чёрный миндаль на чёрной рамке иначе не виден). Раньше обводки не было
    // ни у кого — когда она была у всех глаз, рамка выходила россыпью
    // листьев; теперь только у чёрных, рядом с зелёными обратными.
    RIM_LINE: 1.6,
    rimLine(ctx, e) {
        if (!e.rim || e.base || e.kind === 'x' || e.kind === 'inv') return;
        ctx.strokeStyle = this.pal().iris;
        ctx.lineWidth = this.RIM_LINE;
        ctx.stroke();
    },

    // Радужка — плоский зелёный круг: без градиента, блика и свечения
    // (оценка игрока: только чёрное тело и плоский зелёный зрачок).
    iris(ctx, e) {
        if (!e.r) return;
        this.pupil(ctx, e, e.x, e.y);
    },

    // Зрачок в точке (x, y): круг или, у глаза крестика, зелёный крестик.
    pupil(ctx, e, x, y) {
        const P = this.pal();
        if (e.kind === 'inv') {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(e.ang);
            this.almond(ctx, e.w * 0.92);
            ctx.fillStyle = P.iris;
            ctx.fill();
            ctx.fillStyle = P.base;
            ctx.beginPath();
            ctx.arc(0, 0, e.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }
        if (e.kind === 'x') {
            const h = e.r;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(e.ang);
            // зелёный «белок» чуть меньше чёрного тела — по краю тонкая тьма
            this.almond(ctx, e.w * 0.9);
            ctx.fillStyle = P.iris;
            ctx.fill();
            ctx.strokeStyle = P.base;
            ctx.lineWidth = h * 0.42;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-h, -h); ctx.lineTo(h, h);
            ctx.moveTo(h, -h); ctx.lineTo(-h, h);
            ctx.stroke();
            ctx.restore();
            return;
        }
        ctx.fillStyle = P.iris;
        ctx.beginPath();
        ctx.arc(x, y, e.r, 0, Math.PI * 2);
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
        // Тьма под глазами: всё вне сцены и ещё OVERLAP единиц на сцену. Было
        // на 4 единицы глубже края — в углах между подложкой и проверяемым
        // швом светилась сцена. Ровно край в край — тоже нельзя: по линии
        // стыка, где сходятся дуги глаз, сглаживание оставляло светящиеся
        // точки. Подложка заходит на сцену на полторы единицы, шов проверяется
        // ещё на полединицы глубже (SEAM_IN).
        ctx.save();
        ctx.fillStyle = P.base;
        ctx.beginPath();
        ctx.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        const I = this.inner(), e = -this.OVERLAP;
        if (ctx.roundRect) ctx.roundRect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e, this.CORNER + e);
        else ctx.rect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e);
        ctx.fill('evenodd');
        ctx.restore();
        yield;
        // Сначала все чёрные формы, потом все радужки: чёрное на чёрном
        // сливается, а радужку чужой глаз закрыть не может.
        // Зрачки глаз рамки здесь НЕ рисуются: они моргают и живут на своих
        // маленьких холстах поверх рамки (envy-eyes-blink.js, mountLive).
        // Неподвижен только крестик.
        const cross = this.crossEyes();
        for (const eye of eyes) this.body(ctx, eye);
        for (const eye of cross) this.body(ctx, eye);
        yield;
        for (const eye of cross) this.iris(ctx, eye);
    }
};
