// ================= ЗАВИСТЬ: ПЕРЕХОД ГЛАЗАМИ =================
// Покров окна зависти (src/core/mg-veil.js; образец — пена похоти,
// lust/lust-foam-veil.js). Вход: по всему экрану открываются глаза, под
// ними собирается игра, потом закрываются все, кроме рамки. Выход: глаза
// открываются в середине, игра закрывается под ними, потом закрываются все.
// В забеге каждое нажатие крестика открывает треть глаз середины.
//
// ---------- МОРГАНИЕ ----------
// Веки сходятся к оси глаза симметрично сверху и снизу (замысел игрока):
// высота миндаля — от нуля до полной, радужка обрезана веками. Закрытый
// глаз — линия нулевой высоты, его не видно; открываясь, он проявляет
// чёрное тело и зелёный зрачок.
//
// ---------- РАСКЛАДКА ПОКРОВА ----------
// Глаза рамки (EnvyEyes._eyes) — те же, что нарисованы на окне: после
// раскрытия они остаются открытыми и подменяются рамкой окна без шва.
// Остальное — свободная раскладка по всему экрану: крупнее рамочных, под
// любым углом, с теми же правилами (соседи не похожи размером и углом,
// радужки не налезают). Раскладка идёт по сетке точек в случайном порядке
// и ставит глаз на непокрытую, если крупный встаёт.
//
// ---------- ЩЕЛИ ----------
// Закрыть экран целиком одними миндалями (docs/traps.md, п. 166) — это
// пятьсот мелких глаз: миндаль узкий, щели между ним и соседями закрывали
// только мелочью. Поэтому без щелей покров делает ЧЁРНАЯ ПОДЛОЖКА под
// глазами (seal): проявляется в конце открытия и уходит в начале
// закрытия, а глаза — крупные и редкие, как в рамке.
//
// ---------- КАК ДЁШЕВО ----------
// Глаз — один путь и один круг; кадр — около полутора сотен глаз на холсте
// в единичном разрешении (MgVeil.MOTION_SCALE). Раскладка — в простое
// (prepareGen), не при нажатии.
Object.assign(EnvyEyes, {
    VEIL_MS: { cover: 650, reveal: 620, close: 520, clear: 600, burst: 280, pop: 340, finish: 420 },
    // Каждый глаз открывается за OPEN_DUR доли хода, начиная со своей
    // задержки (до STAGGER): экран моргает вразнобой, а не разом.
    STAGGER: 0.42,
    OPEN_DUR: 0.58,
    VEIL_SEED: 9137,
    VEIL_L: [80, 210],      // длины глаз середины: крупные
    VEIL_LS: [40, 80],      // и средние — где крупный не встал
    VEIL_GRID: 10,          // шаг сетки точек, на которые ставятся глаза
    VEIL_IRIS_GAP: 1.9,
    KNOCK_BATCHES: 3,
    _veil: null,

    // ---------- РАСКЛАДКА ----------
    *prepareGen() {
        if (this._veil) return;
        const frame = this._eyes || [];
        let a = this.VEIL_SEED >>> 0;
        const rng = () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const lerp = (r, t) => r[0] + (r[1] - r[0]) * t;
        const CELL = 100, grid = new Map(), key = (i, j) => i * 1000 + j;
        const add = (e) => {
            // глаз в каждой клетке, которую задевает его длина
            const h = e.w / 2;
            for (let i = Math.floor((e.x - h) / CELL); i <= Math.floor((e.x + h) / CELL); i++) {
                for (let j = Math.floor((e.y - h) / CELL); j <= Math.floor((e.y + h) / CELL); j++) {
                    const k = key(i, j);
                    if (!grid.has(k)) grid.set(k, []);
                    grid.get(k).push(e);
                }
            }
        };
        const near = (x, y) => grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) || [];
        const covered = (x, y) => near(x, y).some(e => this.inAlmond(e, x, y));
        const irisFree = (e, gap) => {
            for (const o of near(e.x, e.y)) {
                if (o.r && Math.hypot(o.x - e.x, o.y - e.y) < gap * (o.r + e.r)) return false;
            }
            return true;
        };
        const touching = (e) => near(e.x, e.y).filter(o => Math.hypot(o.x - e.x, o.y - e.y) < this.NEAR_K * (o.w + e.w));
        const cross = this.crossEyes();
        for (const e of frame) add(e);
        for (const e of cross) add(Object.assign(e, { cross: true }));

        const eyes = [];
        // Ставит глаз, накрывающий точку: сначала крупный, не встал —
        // средний, не встал и он — точку оставляет подложке.
        const place = (px, py) => {
            for (const range of [this.VEIL_L, this.VEIL_LS]) {
                const cands = [];
                for (let k = 0; k < 40 && cands.length < 8; k++) {
                    const L = lerp(range, rng()), ang = rng() * Math.PI;
                    const d = rng() * L * 0.3, t = rng() * Math.PI * 2;
                    const e = { x: px + Math.cos(t) * d, y: py + Math.sin(t) * d, w: L, r: L * this.IRIS, ang };
                    if (!this.inAlmond(e, px, py)) continue;
                    // зрачок целиком на экране
                    if (e.x - e.r < 1 || e.y - e.r < 1 || e.x + e.r > STAGE_W - 1 || e.y + e.r > STAGE_H - 1) continue;
                    if (!irisFree(e, this.VEIL_IRIS_GAP)) continue;
                    let tier = 2;
                    for (const n of touching(e)) {
                        if (!this.sizeDiff(e, n)) { tier = 0; break; }
                        if (!this.angDiff(e, n)) tier = 1;
                    }
                    cands.push({ e, tier });
                }
                if (!cands.length) continue;
                const top = Math.max(...cands.map(c => c.tier));
                const pool = cands.filter(c => c.tier === top);
                const best = pool[Math.floor(rng() * pool.length)].e;
                eyes.push(best);
                add(best);
                return;
            }
        };

        // Точки сетки в случайном порядке: глаза ложатся вразброс, а не рядами.
        const G = this.VEIL_GRID, pts = [];
        for (let y = 0; y <= STAGE_H; y += G) for (let x = 0; x <= STAGE_W; x += G) pts.push([x, y]);
        for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
        let n = 0;
        for (const [x, y] of pts) {
            if (++n % 200 === 0) yield;
            if (!covered(x, y)) place(x, y);
        }
        // Доля экрана, закрытая глазами (остальное — подложке).
        let hit = 0, all = 0;
        for (let y = 1; y < STAGE_H; y += 4) for (let x = 1; x < STAGE_W; x += 4) { all++; if (covered(x, y)) hit++; }
        this._veilCover = hit / all;

        // Задержки моргания и пачки нажатий.
        for (const e of frame) e.d = rng() * this.STAGGER;
        for (const e of cross) e.d = rng() * this.STAGGER;
        for (const e of eyes) { e.d = rng() * this.STAGGER; e.batch = Math.floor(rng() * this.KNOCK_BATCHES); }
        this._veil = { frame, cross, mid: eyes };
    },

    // ---------- КАДР ----------
    ease(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); },
    // Раскрытие глаза на доле хода p: своя задержка, плавный ход.
    openAt(e, p) { return this.ease((p - e.d) / this.OPEN_DUR); },

    // Раскрытие каждой группы на ходе mode, доле p. f — глаза рамки, m —
    // середина (функция от глаза: пачки нажатий).
    levels(mode, p) {
        const up = (e) => this.openAt(e, p), down = (e) => 1 - this.openAt(e, p);
        const k = this._knocks || 0;
        switch (mode) {
            case 'cover':  return { f: up, m: up };
            case 'reveal': return { f: () => 1, m: down };
            case 'close':  return { f: () => 1, m: up };
            case 'clear':  return { f: down, m: down };
            // нажатия: рамку на покрове не рисуем — под ним настоящая
            case 'burst':  return { f: () => 0, m: (e) => e.batch < k - 1 ? 1 : e.batch === k - 1 ? up(e) : 0 };
            case 'pop':    return { f: () => 0, m: (e) => e.batch < k ? down(e) : 0 };
            case 'finish': return { f: () => 1, m: (e) => e.batch < k ? 1 : up(e) };
        }
        return { f: () => 1, m: () => 1 };
    },

    veilStart(ctx, mode) {
        if (!this._veil) for (const _ of this.prepareGen()) { /* до конца */ }
        if (mode === 'burst') this._knocks = (this._knocks || 0) + 1;
        if (mode === 'cover' || mode === 'close') this._knocks = 0;
        this._mode = mode;
        this.clearVeil(ctx);
    },

    clearVeil(ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    },

    // Чёрная подложка под глазами: проявляется к концу открытия, уходит в
    // начале закрытия. На нажатиях её нет — под покровом идёт игра.
    seal(mode, p) {
        const e = (t) => this.ease(t);
        switch (mode) {
            case 'cover':  return e((p - 0.7) / 0.3);
            case 'reveal': return 1 - e(p / 0.35);
            case 'close':  return e((p - 0.6) / 0.4);
            case 'clear':  return 1 - e(p / 0.35);
            case 'finish': return e((p - 0.5) / 0.5);
        }
        return 0;
    },

    veil(ctx, mode, p) {
        const V = this._veil, L = this.levels(mode, p);
        this.clearVeil(ctx);
        const a = this.seal(mode, p);
        if (a > 0) {
            ctx.globalAlpha = a;
            ctx.fillStyle = this.pal().base;
            ctx.fillRect(0, 0, STAGE_W, STAGE_H);
            ctx.globalAlpha = 1;
        }
        const list = [];
        for (const e of V.frame) list.push([e, L.f(e)]);
        for (const e of V.mid) list.push([e, L.m(e)]);
        const cross = V.cross.map(e => [e, L.f(e)]);
        this.drawOpen(ctx, list, cross);
        // pop кончается пустым покровом: следующее нажатие считает с нуля
        if (mode === 'pop' && p >= 1) this._knocks = 0;
    },

    // Сначала все тела, потом все радужки (как у рамки): чужая радужка под
    // веком не пропадает. Радужка обрезается своими веками, пока глаз
    // открыт не настолько, чтобы она помещалась целиком.
    drawOpen(ctx, list, cross) {
        const P = this.pal();
        ctx.fillStyle = P.base;
        ctx.strokeStyle = P.base;
        ctx.lineWidth = 1;
        for (const [e, o] of list) {
            if (o < 0.02) continue;
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.ang);
            this.almond(ctx, e.w, o);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = P.iris;
        for (const [e, o] of list.concat(cross)) {
            if (!e.r || o < 0.02) continue;
            if (o > 0.85) { ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); continue; }
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.ang);
            this.almond(ctx, e.w, o);
            ctx.clip();
            ctx.beginPath();
            ctx.arc(0, 0, e.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    },

    // Покров стоит, пока игра дозревает: всё открыто и запечатано чёрным —
    // щелей нет, даже если раскладка где-то недосмотрела.
    veilStill(ctx) {
        const V = this._veil;
        this.clearVeil(ctx);
        ctx.fillStyle = this.pal().base;
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        this.drawOpen(ctx, V.frame.concat(V.mid).map(e => [e, 1]), V.cross.map(e => [e, 1]));
    },

    veilPending() { return false; },
    veilOpacity() { return 1; },

    // Прогрев: один глаз — создать холсты покрова заранее.
    veilWarm(ctx) {
        const V = this._veil;
        if (!V || !V.mid.length) return;
        this.drawOpen(ctx, [[V.mid[0], 1]], []);
        this.clearVeil(ctx);
    }
});
