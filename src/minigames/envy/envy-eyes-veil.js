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
    VEIL_MS: { cover: 1000, reveal: 900, close: 800, clear: 900, burst: 380, pop: 420, finish: 600 },
    // Доля хода, за которую моргает один глаз (своя у каждого).
    BLINK: [0.28, 0.5],
    VEIL_SEED: 9137,
    // Крупные середины по наброску игрока: четыре глаза почти во всю
    // ширину, друг над другом, наклоны в разные стороны, внахлёст. x, y —
    // центр (он же зрачок), L — длина, ang — наклон. Соседние различаются
    // размером.
    VEIL_BIG: [
        { x: 180, y: 150, L: 420, ang: 0.47 },
        { x: 250, y: 302, L: 330, ang: -0.1 },
        { x: 155, y: 452, L: 425, ang: -0.6 },
        { x: 222, y: 642, L: 325, ang: 0.52 }
    ],
    // Зрачки крупных — ближе обычного (только не касаются): иначе такие
    // глаза внахлёст не встают.
    VEIL_BIG_GAP: 1.12,
    VEIL_L_MAX: 260,        // дальше — не длиннее этого
    VEIL_MIN: 7,            // дыры мельче (радиус, ед.) глазами не закрываются
    VEIL_GRID: 6,           // шаг сетки дыр
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
        const fitsScreen = (e) => e.x - e.r >= 1 && e.y - e.r >= 1 && e.x + e.r <= STAGE_W - 1 && e.y + e.r <= STAGE_H - 1;
        const tierOf = (e) => {
            let tier = 2;
            for (const n of touching(e)) {
                if (!this.sizeDiff(e, n)) return 0;
                if (!this.angDiff(e, n)) tier = 1;
            }
            return tier;
        };

        // 1. Несколько крупных — большая часть экрана (набросок игрока):
        // друг над другом, а не один гигант по центру.
        for (const B of this.VEIL_BIG) {
            const e = { x: B.x + (rng() - 0.5) * 12, y: B.y + (rng() - 0.5) * 12,
                        w: B.L * (0.96 + rng() * 0.08), ang: B.ang + (rng() - 0.5) * 0.1 };
            e.r = e.w * this.IRIS;
            if (!fitsScreen(e) || !irisFree(e, this.VEIL_BIG_GAP)) continue;
            eyes.push(e);
            add(e);
        }
        yield;

        // 2. По убыванию: следующий глаз — в самую большую оставшуюся дыру
        // сцены и по её размеру. Дыра меряется расстоянием до закрытого
        // (двухпроходная карта расстояний по сетке). Дыры мельче VEIL_MIN —
        // подложке.
        const G = this.VEIL_GRID, NX = Math.floor(STAGE_W / G) + 1, NY = Math.floor(STAGE_H / G) + 1;
        const inScene = new Uint8Array(NX * NY), done = new Uint8Array(NX * NY);
        for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
            const x = i * G, y = j * G;
            inScene[j * NX + i] = this.edge(x, y) < -2 ? 1 : 0;
        }
        const refresh = () => {
            for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
                const k = j * NX + i;
                if (!done[k] && (!inScene[k] || covered(i * G, j * G))) done[k] = 1;
            }
        };
        const dist = new Float32Array(NX * NY);
        const distMap = () => {
            const D1 = 1, D2 = Math.SQRT2;
            for (let k = 0; k < NX * NY; k++) dist[k] = done[k] ? 0 : 1e9;
            for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
                const k = j * NX + i; let d = dist[k];
                if (i > 0) d = Math.min(d, dist[k - 1] + D1);
                if (j > 0) d = Math.min(d, dist[k - NX] + D1);
                if (i > 0 && j > 0) d = Math.min(d, dist[k - NX - 1] + D2);
                if (i < NX - 1 && j > 0) d = Math.min(d, dist[k - NX + 1] + D2);
                dist[k] = d;
            }
            for (let j = NY - 1; j >= 0; j--) for (let i = NX - 1; i >= 0; i--) {
                const k = j * NX + i; let d = dist[k];
                if (i < NX - 1) d = Math.min(d, dist[k + 1] + D1);
                if (j < NY - 1) d = Math.min(d, dist[k + NX] + D1);
                if (i < NX - 1 && j < NY - 1) d = Math.min(d, dist[k + NX + 1] + D2);
                if (i > 0 && j < NY - 1) d = Math.min(d, dist[k + NX - 1] + D2);
                dist[k] = d;
            }
        };
        // сколько ещё открытых точек сетки закроет глаз
        const gain = (e) => {
            const h = e.w / 2;
            let n = 0;
            for (let j = Math.max(0, Math.floor((e.y - h) / G)); j <= Math.min(NY - 1, Math.ceil((e.y + h) / G)); j++) {
                for (let i = Math.max(0, Math.floor((e.x - h) / G)); i <= Math.min(NX - 1, Math.ceil((e.x + h) / G)); i++) {
                    if (!done[j * NX + i] && this.inAlmond(e, i * G, j * G)) n++;
                }
            }
            return n;
        };
        refresh();
        for (let step = 0; step < 300; step++) {
            distMap();
            let best = -1, bk = -1;
            for (let k = 0; k < NX * NY; k++) if (dist[k] > best) { best = dist[k]; bk = k; }
            const clear = best * G;
            if (clear < this.VEIL_MIN) break;
            const px = (bk % NX) * G, py = Math.floor(bk / NX) * G;
            // длина — по дыре: полувысота миндаля чуть больше радиуса дыры
            const L0 = Math.min(this.VEIL_L_MAX, Math.max(26, clear * 4.4));
            let pick = null, pickTier = -1, pickGain = 0;
            for (let k = 0; k < 36; k++) {
                const L = L0 * (0.85 + rng() * 0.4);
                const t = rng() * Math.PI * 2, d = rng() * L * 0.15;
                const e = { x: px + Math.cos(t) * d, y: py + Math.sin(t) * d, w: L, r: L * this.IRIS, ang: rng() * Math.PI };
                if (!this.inAlmond(e, px, py) || !fitsScreen(e) || !irisFree(e, this.VEIL_IRIS_GAP)) continue;
                const tier = tierOf(e), g = gain(e);
                if (tier > pickTier || (tier === pickTier && g > pickGain)) { pick = e; pickTier = tier; pickGain = g; }
            }
            if (pick) { eyes.push(pick); add(pick); refresh(); }
            else done[bk] = 1;      // сюда глаз не встаёт — точку отдаём подложке
            if (step % 6 === 0) yield;
        }
        // Доля сцены, закрытая глазами (остальное — подложке).
        let hit = 0, all = 0;
        for (let k = 0; k < NX * NY; k++) if (inScene[k]) { all++; if (covered((k % NX) * G, Math.floor(k / NX) * G)) hit++; }
        this._veilCover = hit / all;

        // Задержки моргания и пачки нажатий.
        // Каждому глазу — своя длительность и своя задержка в пределах хода:
        // моргают вразнобой по всему экрану, как живые, а не волной и не
        // разом. Крупные — медленнее.
        const time = (e) => {
            e.du = this.BLINK[0] + rng() * (this.BLINK[1] - this.BLINK[0]) + Math.min(0.12, e.w / 2500);
            e.d = rng() * (1 - e.du);
            // свой размах перелёта и своя сторона взгляда
            e.over = 0.9 + rng() * 0.8;
            e.look = (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.5);
        };
        for (const e of frame) time(e);
        for (const e of cross) time(e);
        for (const e of eyes) { time(e); e.batch = Math.floor(rng() * this.KNOCK_BATCHES); }
        this._veil = { frame, cross, mid: eyes };
    },

    // ---------- КАДР ----------
    ease(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); },
    clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; },

    // ---------- ДВИЖЕНИЕ ВЕК ----------
    // Не ровный ход, а приёмы анимации (живее и плавнее):
    //   * открытие — с перелётом: веки распахиваются чуть шире нормы и
    //     мягко оседают (ease-out-back, размах у каждого глаза свой — over);
    //   * закрытие — с замахом: глаз сперва чуть расширяется, потом веки
    //     разгоняются и схлопываются (ease-in-back) — моргание, а не
    //     гаснущая лампа;
    //   * вторичное движение — взгляд: открываясь, зрачок сдвинут вдоль
    //     глаза и доводится в центр, закрываясь — уводится в сторону (look);
    //   * у каждого глаза своя длительность и задержка (prepareGen).
    // К концу хода всё ровно в покое (o = 1 или 0, зрачок в центре):
    // открытый покров без шва подменяется рамкой окна.
    up(e, p) {
        const t = this.clamp01((p - e.d) / e.du), u = t - 1, c = 1.1 * e.over;
        const o = t <= 0 ? 0 : t >= 1 ? 1 : 1 + (c + 1) * u * u * u + c * u * u;
        return { o, lk: e.look * 0.09 * (1 - t) * (1 - t) * (t > 0 ? 1 : 0) };
    },
    down(e, p) {
        const t = this.clamp01((p - e.d) / e.du), c = 0.7 * e.over;
        const o = t <= 0 ? 1 : t >= 1 ? 0 : 1 - ((c + 1) * t * t * t - c * t * t);
        return { o, lk: -e.look * 0.06 * t };
    },

    // Раскрытие каждой группы на ходе mode, доле p. f — глаза рамки, m —
    // середина (функция от глаза: пачки нажатий).
    //
    // Глаза рамки моргают (envy-eyes-blink.js): тело на месте, зрачок то
    // открыт, то под веками. Покров приводит их к тому же: на входе
    // раскрываются все, а уходя (reveal), закрывают зрачки тех, что на
    // рамке сейчас закрыты (io — раскрытие век над зрачком при открытом
    // теле); на выходе берёт их как есть и гасит целиком только в clear.
    levels(mode, p) {
        const up = (e) => this.up(e, p), down = (e) => this.down(e, p);
        const ONE = () => 1, NONE = () => 0;
        const live = (e) => ({ o: 1, io: this.liveIo ? this.liveIo(e) : 1, lk: 0 });
        const settle = (e) => (this.liveTarget && !this.liveTarget(e)) ? { o: 1, io: down(e).o, lk: 0 } : 1;
        const fade = (e) => { const d = down(e), io = this.liveIo ? this.liveIo(e) : 1; return { o: d.o, io: Math.min(io, d.o), lk: 0 }; };
        const k = this._knocks || 0;
        switch (mode) {
            case 'cover':  return { f: up, m: up };
            case 'reveal': return { f: settle, m: down };
            case 'close':  return { f: live, m: up };
            case 'clear':  return { f: fade, m: down };
            // нажатия: рамку на покрове не рисуем — под ним настоящая
            case 'burst':  return { f: NONE, m: (e) => e.batch < k - 1 ? 1 : e.batch === k - 1 ? up(e) : 0 };
            case 'pop':    return { f: NONE, m: (e) => e.batch < k ? down(e) : 0 };
            case 'finish': return { f: live, m: (e) => e.batch < k ? 1 : up(e) };
        }
        return { f: ONE, m: ONE };
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
    // Состояние глаза — число (раскрытие) или { o, lk }: lk — сдвиг зрачка
    // вдоль глаза в долях длины (взгляд).
    drawOpen(ctx, list, cross) {
        const P = this.pal();
        const st = (s) => typeof s === 'number' ? { o: s, io: s, lk: 0 } : s;
        ctx.fillStyle = P.base;
        ctx.strokeStyle = P.base;
        ctx.lineWidth = 1;
        for (const [e, s] of list) {
            const o = st(s).o;
            if (o < 0.02) continue;
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.ang);
            this.almond(ctx, e.w, o);
            ctx.fill();
            ctx.stroke();
            // у глаз рамки — та же зелёная обводка, что на окне
            if (e.rim) { this.rimLine(ctx, e); ctx.strokeStyle = P.base; ctx.lineWidth = 1; }
            ctx.restore();
        }
        ctx.fillStyle = P.iris;
        for (const [e, s] of list.concat(cross)) {
            const S = st(s), lk = S.lk || 0;
            // веки над зрачком: не шире тела
            const o = Math.min(S.o, S.io == null ? S.o : S.io);
            if (!e.r || o < 0.02) continue;
            // открыт и смотрит прямо — радужка целиком в веках, без обрезки
            if (o > 0.85 && Math.abs(lk) < 0.005) { this.pupil(ctx, e, e.x, e.y); if (e.rim) this.lidLine(ctx, e, o); continue; }
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.ang);
            this.almond(ctx, e.w, o);
            ctx.clip();
            ctx.rotate(-e.ang);
            const c = Math.cos(e.ang), sn = Math.sin(e.ang);
            this.pupil(ctx, e, lk * e.w * c, lk * e.w * sn);
            ctx.restore();
            if (e.rim) this.lidLine(ctx, e, o);
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
