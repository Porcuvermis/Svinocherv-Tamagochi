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
    // Поток вспышек — как на показе (FULL_DEMO.flow). Сжатый до 0,9 с (была
    // такая версия) монеты вспыхивали и проступали почти разом — игрок увидел
    // «чешую» вместо отработанного перехода.
    FLOW_MS: 2200,

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
        const total = last + run, ms = { cover: total, reveal: total, close: total, clear: total };
        this._veil = { all, ms };
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

    veilStart(ctx, mode) {
        if (!this._veil) for (const _ of this.prepareGen()) { /* до конца */ }
        // свой 2D-холст покрова не нужен — он пуст
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
        this._mode = mode;
        // пик блика — по свету в начале хода, пока монеты крутятся, он не скачет
        const H = this.peakAxis(this.followTilt());
        for (const c of this._veil.all) {
            c.H = H; c.edge = this.edgeAxis(H, c.pose, c.side); c.seen = undefined;
            c.outC = { pose: c.pose, H, edge: [-c.edge[0], -c.edge[1], 0] };
        }
        this.veilMount();
    },

    // Кадр хода. Входящие ходы (cover, close) — по своему плану; уходящие
    // (reveal, clear) — тот же поток задом наперёд.
    veil(ctx, mode, p) {
        const V = this.veilMount();
        if (!V) return;
        const F = this.FLIP, run = F.toPeak + F.fromPeak, total = this._veil.ms[mode], t = p * total;
        const into = mode === 'cover' || mode === 'close', anim = (c) => mode === 'cover' || mode === 'clear' || c.inner;
        const key = 'd', last = total - run;
        V.B.begin(this.followTilt());
        let shown = 0, moving = 0;
        for (const c of this._veil.all) {
            if (!anim(c)) { V.B.add(c, this.SETTLED(c)); continue; }
            moving++;
            let s;
            const quiet = c[key + 'Q'];
            if (into) {
                const ti = t - c[key];
                if (ti < 0) continue;
                shown++;
                c.quiet = quiet;
                s = ti < run ? this.flipState(c, ti, 'in') : this.SETTLED(c);
            } else {
                const to = t - (last - c[key]);
                if (to >= run) continue;
                shown++;
                c.outC.quiet = quiet;
                s = to < 0 ? this.SETTLED(c) : this.flipState(c.outC, to, 'out');
            }
            V.B.add(c, s);
        }
        V.B.flush();
        this._shown = moving ? shown / moving : 1;
        // Фон под монетами — как на показе: на входящих ходах тёмный с первого
        // кадра (на нём видны только искры и вспышки); на уходящих редеет
        // вместе с монетами — доля ещё не ушедших, втрое быстрее.
        V.gap.style.opacity = into ? '1' : Math.min(1, 3 * this._shown).toFixed(3);
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
// Длительности ходов берутся из расписания — getter, а не поле: Object.assign
// вызвал бы его сразу при загрузке файла, до сцены и окна.
Object.defineProperty(GreedCoins, 'VEIL_MS', {
    get() {
        if (!this._veil) for (const _ of this.prepareGen()) { /* до конца */ }
        return this._veil.ms;
    }
});
