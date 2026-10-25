// ================= АЛЧНОСТЬ: ВХОД И ВЫХОД — МОНЕТЫ В БЛИКЕ =================
// Покров окна (src/core/mg-veil.js) для шкурки GreedCoins. Монеты не падают и
// не текут — каждая появляется на своём месте и исчезает в блике
// (greed-coins-flip.js, замысел игрока), отработано на показе 🐞 → «Монеты».
//
//   cover  — монеты рамки и монеты сцены проявляются, экран заливает золотом
//   reveal — монеты сцены исчезают, остаётся рамка (под покровом — она же)
//   close  — монеты сцены снова проявляются поверх игры
//   clear  — исчезают все, под покровом уже комната
//
// Поток вспышек — как на показе: вспыхивают верхний слой и половина нижнего,
// пики идут ровно по всему ходу (FLOW мс), соседи не вспыхивают разом;
// остальные проступают тихо. Уход — тот же поток задом наперёд.
//
// Рисует видеокарта, все монеты одним вызовом (batchRenderer) — тот же
// рисовальщик, что у рамки: когда покров уходит, под ним монеты того же вида.
// Свой холст видеокарты лежит внутри покрова поверх его 2D-холста; щели —
// отдельный слой цвета глубины кучи, его прозрачность меняет видеокарта.
Object.assign(GreedCoins, {
    // Поток вспышек — как на показе в 🐞 (2,2 с). Сжатый до 0,9 с (была
    // такая версия) монеты вспыхивали и проступали почти разом — игрок увидел
    // «чешую» вместо отработанного перехода.
    FLOW_MS: 2200,
    // Скорость покрова: весь ход проигрывается быстрее во столько раз —
    // и поток вспышек, и поворот каждой монеты, — рисунок движения тот же,
    // что принят на показе. 1 — как на показе (вход ≈ 7 с), 1.45 — ≈ 5 с,
    // 1.7 — ≈ 4,3 с; 2.6 — ход 1,3 с, вход и выход ≤ 3 с (игрок: «по 3 с
    // максимум»).
    VEIL_SPEED: 2.6,

    // Монеты сцены: обычная куча, но только над сценой и не в кресте —
    // на стоящем покрове крест должен читаться, его зона — отмена входа.
    innerCoins() {
        if (this._inner) return this._inner;
        // Служебные слои рамки (дно креста, плотная подсыпка — only) сюда НЕ
        // идут: с ними под сценой ложилась тёмная плотная масса — игрок увидел
        // «чешую», ничем не похожую на кучу показа.
        const keep = (x, y, r, rng, L) => !(L && L.only) && this.edgeDist(x, y) < -r * 0.3 && this.crossDist(x, y) > this.CROSS_GAP + r * 0.9;
        return (this._inner = this.coinsOf(this.layout(this.SEED, keep)));
    },

    // Расписание потока: у монет списка — c[key], задержка входа. Возвращает
    // последнюю задержку.
    flowPlan(list, flow, key, seed) {
        const F = this.FLIP, run = F.toPeak + F.fromPeak;
        let st = seed >>> 0;
        const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
        const gen = this.LAYERS.map((L, i) => L.only ? -1 : i).filter(i => i >= 0);
        const used = new Set(list.map(c => c.layer)), g = gen.filter(i => used.has(i));
        const bottom = g[0], top = g[g.length - 1];
        const first = [], last = [], quiet = [];
        for (const c of list) {
            if (c.layer === top) last.push(c);
            else if (c.layer === bottom && rnd() < 0.5) first.push(c);
            else quiet.push(c);
        }
        const shuffle = (a) => a.sort(() => rnd() - 0.5);
        const fl = shuffle(first).concat(shuffle(last)), N = fl.length, step = flow / Math.max(1, N);
        const near = this.RAD * 1.5, APART = 170, peaks = [];
        for (let i = 0; i < N; i++) {
            const tp = i * step + (rnd() - 0.5) * step;
            let pick = 0;
            for (let j = 0; j < Math.min(fl.length, 40); j++) {
                const c = fl[j];
                if (!peaks.some(o => Math.abs(o._tp - tp) < APART && Math.hypot(o.x - c.x, o.y - c.y) < near)) { pick = j; break; }
            }
            const c = fl.splice(pick, 1)[0];
            c._tp = tp; c[key] = Math.max(0, Math.round(tp)); c[key + 'Q'] = false; peaks.push(c);
        }
        const half = first.length ? first.map(c => c._tp).sort((a, b) => a - b)[Math.floor(first.length / 2)] : 0;
        const qEnd = Math.max(half, flow - run * 0.5);
        for (const c of shuffle(quiet)) { c[key] = Math.round(half + rnd() * (qEnd - half)); c[key + 'Q'] = true; }
        return Math.max(0, ...list.map(c => c[key]));
    },

    // Всё, что нужно ходам, — заранее (окно зовёт в простое после рамки).
    *prepareGen() {
        if (this._veil) return;
        const rim = this.rimCoins(); yield;
        const inner = this.innerCoins(); yield;
        // общий порядок рисования — по слоям: монеты сцены и рамки вперемешку
        const all = rim.map(c => Object.assign(c, { inner: false })).concat(inner.map(c => Object.assign(c, { inner: true })))
            .sort((a, b) => a.layer - b.layer);
        // ОДНО расписание на все ходы — показа: рамка и сцена одна куча,
        // появляются вместе. Уходящие ходы — оно же задом наперёд; в reveal
        // и close двигаются только монеты сцены, рамка стоит.
        const F = this.FLIP, run = F.toPeak + F.fromPeak;
        const last = this.flowPlan(all, this.FLOW_MS, 'd', 99);
        yield;
        const total = last + run, play = Math.round(total / this.VEIL_SPEED);
        const ms = { cover: play, reveal: play, close: play, clear: play };
        this._veilTotal = total;
        // Нажатия крестика посреди крутки (MgVeil.knock): монеты сцены — тремя
        // долями ОБЛАКАМИ (игрок: «не ровными слоями, а кучками»; ровные доли
        // по потоку засыпали весь экран редкой сыпью). Первое нажатие — кучи
        // вокруг одних центров, второе — новые кучи и разрастание первых,
        // третье — остальное. Внутри кучи монеты появляются от центра к краю
        // (c.kd), край облака рваный.
        const groups = this.knockClouds(inner);
        this._veil = { all, ms, groups, innerN: inner.length };
    },

    // ---------- холст видеокарты внутри покрова ----------
    veilLayer() {
        if (this._vl) return this._vl;
        const A = this.loadAtlas();
        if (!A.ready || typeof MgVeil === 'undefined' || !MgVeil.el) return null;
        const gap = document.createElement('div');
        // фон показа: холст там лежал на тёмном фоне холстов игры (style.css, --bg-color)
        Object.assign(gap.style, { position: 'absolute', inset: '0', background: 'var(--bg-color)', opacity: '0', pointerEvents: 'none' });
        const cv = document.createElement('canvas'); cv.width = this.W; cv.height = this.H;
        const B = this.batchRenderer(cv, A.fa, A.fn, A.alb, A.nor);
        if (!B) return null;
        return (this._vl = { gap, cv, B });
    },
    veilMount() {
        const V = this.veilLayer();
        if (!V) return null;
        if (V.cv.parentNode !== MgVeil.el) { MgVeil.el.appendChild(V.gap); MgVeil.el.appendChild(V.cv); }
        V.gap.style.display = V.cv.style.display = '';
        return V;
    },
    veilHide() {
        if (this._vl) this._vl.gap.style.display = this._vl.cv.style.display = 'none';
    },

    KNOCK: { clouds: 5, rMin: 45, rMax: 85, spread: 650 },
    knockClouds(inner) {
        const K = this.KNOCK, I = this.inner();
        let st = 31337;
        const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
        const cloud = () => ({ x: (I.x0 + 25 + rnd() * (I.x1 - I.x0 - 50)) * 2, y: (I.y0 + 25 + rnd() * (I.y1 - I.y0 - 50)) * 2,
            r: (K.rMin + rnd() * (K.rMax - K.rMin)) * 2, a: rnd() * 6.28, b: rnd() * 6.28 });
        // расстояние до облака в его радиусах, с рваным краем
        const dist = (c, o) => {
            const dx = c.x - o.x, dy = c.y - o.y, th = Math.atan2(dy, dx);
            const r = o.r * (1 + 0.3 * Math.sin(3 * th + o.a) + 0.15 * Math.sin(5 * th + o.b));
            return Math.hypot(dx, dy) / r;
        };
        const A = Array.from({ length: K.clouds }, cloud), B = Array.from({ length: K.clouds }, cloud);
        for (const c of inner) c._j = (rnd() - 0.5) * 0.35;           // своя дрожь края у каждой монеты
        const n3 = Math.ceil(inner.length / 3);
        // 1: ближе всего к облакам A
        for (const c of inner) c._s = Math.min(...A.map(o => dist(c, o))) + c._j;
        const g1 = inner.slice().sort((a, b) => a._s - b._s).slice(0, n3);
        g1.forEach(c => { c.g = 0; });
        // 2: облака B и разросшиеся A (их край дальше — множитель)
        const rest = inner.filter(c => c.g !== 0);
        for (const c of rest) c._s = Math.min(...B.map(o => dist(c, o)), ...A.map(o => dist(c, o) * 0.8)) + c._j;
        const g2 = rest.sort((a, b) => a._s - b._s).slice(0, n3);
        g2.forEach(c => { c.g = 1; });
        // 3: остальное — от ближайшего к уже насыпанному
        const g3 = inner.filter(c => c.g !== 0 && c.g !== 1);
        for (const c of g3) { c.g = 2; c._s = Math.min(...A.concat(B).map(o => dist(c, o))) + c._j; }
        // задержка внутри доли: от центра облака к краю
        for (const g of [g1, g2, g3]) {
            const lo = Math.min(...g.map(c => c._s)), hi = Math.max(...g.map(c => c._s));
            for (const c of g) c.kd = Math.round((c._s - lo) / Math.max(1e-6, hi - lo) * K.spread + rnd() * 60);
        }
        return [g1, g2, g3];
    },

    // Сколько долей сцены проявлено нажатиями (для pop и finish: MgVeil
    // обнуляет свой счёт до хода pop).
    _kn: 0,
    knockCount(mode) {
        if (mode === 'burst') return Math.min(2, (typeof MgVeil !== 'undefined' && MgVeil.knocks) || 1);
        return this._kn;
    },

    // План хода: у каждой монеты роль c.r — null (не рисуется), 's' (стоит),
    // 'i' (появляется), 'o' (исчезает) — и c.off, задержка в мс показа.
    // Возвращает длительность хода в мс показа. dry — только посчитать.
    //   cover  — все появляются;       reveal — сцена уходит, рамка стоит;
    //   close  — сцена появляется;     clear  — все уходят;
    //   burst  — проявляется очередная доля сцены (рамку рисует окно);
    //   pop    — проявленные доли уходят (не нажал вовремя);
    //   finish — третье нажатие: рамка и проявленное стоят, остальное — сюда.
    planFor(mode, dry) {
        const V = this._veil, F = this.FLIP, run = F.toPeak + F.fromPeak, dmax = this._veilTotal - run;
        const n = this.knockCount(mode);
        let maxOff = 0;
        const set = (c, r, off) => {
            if (r === 'i' || r === 'o') maxOff = Math.max(maxOff, off);
            if (!dry) { c.r = r; c.off = off; }
        };
        const shownMax = Math.max(0, ...V.groups.slice(0, n).flat().map(c => c.kd));
        for (const c of V.all) {
            const inner = c.inner;
            switch (mode) {
                case 'cover': set(c, 'i', c.d); break;
                case 'clear': set(c, 'o', dmax - c.d); break;
                case 'reveal': inner ? set(c, 'o', dmax - c.d) : set(c, 's', 0); break;
                case 'close': inner ? set(c, 'i', c.d) : set(c, 's', 0); break;
                case 'burst':
                    if (!inner || c.g > n - 1) set(c, null, 0);
                    else if (c.g < n - 1) set(c, 's', 0);
                    else set(c, 'i', c.kd);
                    break;
                case 'pop':
                    if (!inner || c.g >= n) set(c, null, 0);
                    else set(c, 'o', shownMax - c.kd);
                    break;
                case 'finish':
                    if (!inner || c.g < n) set(c, 's', 0);
                    else set(c, 'i', c.kd);
                    break;
            }
        }
        return maxOff + run;
    },

    veilStart(ctx, mode) {
        if (!this._veil) for (const _ of this.prepareGen()) { /* до конца */ }
        // свой 2D-холст покрова не нужен — он пуст
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
        this._mode = mode;
        this._modeTotal = this.planFor(mode, false);
        if (mode === 'burst') this._kn = this.knockCount('burst');
        if (mode === 'cover' || mode === 'close' || mode === 'clear') this._kn = 0;
        // пик блика — по свету в начале хода, пока монеты крутятся, он не скачет
        const H = this.peakAxis(this.followTilt());
        for (const c of this._veil.all) {
            c.H = H; c.edge = this.edgeAxis(H, c.pose, c.side); c.seen = undefined;
            c.outC = { pose: c.pose, H, edge: [-c.edge[0], -c.edge[1], 0] };
        }
        this.veilMount();
    },

    // Кадр хода по плану (planFor). Время — в мс показа: покров идёт быстрее
    // (VEIL_SPEED), но расписание и повороты те же.
    veil(ctx, mode, p) {
        const V = this.veilMount();
        if (!V) return;
        const F = this.FLIP, run = F.toPeak + F.fromPeak, t = p * this._modeTotal;
        const whole = mode === 'cover' || mode === 'clear';
        V.B.begin(this.followTilt());
        let shown = 0;
        for (const c of this._veil.all) {
            if (!c.r) continue;
            let s;
            if (c.r === 's') s = this.SETTLED(c);
            else if (c.r === 'i') {
                const ti = t - c.off;
                if (ti < 0) continue;
                c.quiet = c.dQ;
                s = ti < run ? this.flipState(c, ti, 'in') : this.SETTLED(c);
            } else {
                const to = t - c.off;
                if (to >= run) continue;
                c.outC.quiet = c.dQ;
                s = to < 0 ? this.SETTLED(c) : this.flipState(c.outC, to, 'out');
            }
            if (whole || c.inner) shown++;
            V.B.add(c, s);
        }
        V.B.flush();
        if (mode === 'pop' && p >= 1) this._kn = 0;
        this._shown = shown / (whole ? this._veil.all.length : this._veil.innerN);
        // Фон под монетами густеет и редеет ТОЛЬКО вместе с монетами: тёмным
        // он становится, когда почти все монеты уже на экране, и уходит, как
        // только монеты начинают уходить. Было: на входящих ходах фон тёмный
        // с первого кадра, на уходящих держался до последней трети — автомат
        // на выходе пропадал раньше, чем появлялись монеты, а на входе
        // проявлялся уже после их ухода (игрок: «критически тупо»). На
        // нажатиях проявлено не больше двух третей — фона нет, игра видна.
        const k = Math.max(0, Math.min(1, (this._shown - 0.6) / 0.4));
        V.gap.style.opacity = (k * k * (3 - 2 * k)).toFixed(3);
    },

    // Покров стоит, пока игра дозревает: всё на месте.
    veilStill() {
        const V = this.veilMount();
        if (!V) return;
        V.B.begin(this.followTilt());
        for (const c of this._veil.all) V.B.add(c, this.SETTLED(c));
        V.B.flush();
        V.gap.style.opacity = '1';
    },
    veilPending() { return false; },
    veilOpacity() { return 1; },

    // Прогрев: создать холст видеокарты и загрузить в неё картинки заранее.
    veilWarm() {
        const V = this.veilMount();
        if (!V) return;
        V.B.begin(this._tilt || { x: 0, y: 0 }); V.B.flush();
        this.veilHide();
    }
});
// Длительности ходов — из плана хода (planFor): getter, а не поле —
// Object.assign вызвал бы его сразу при загрузке файла, до сцены и окна; и у
// нажатий длительность зависит от того, сколько их уже было.
Object.defineProperty(GreedCoins, 'VEIL_MS', {
    get() {
        if (!this._veil) for (const _ of this.prepareGen()) { /* до конца */ }
        const out = {};
        for (const m of ['cover', 'reveal', 'close', 'clear', 'burst', 'pop', 'finish']) out[m] = Math.round(this.planFor(m, true) / this.VEIL_SPEED);
        return out;
    }
});
