// ================= ЗАВИСТЬ: ГЛАЗА РАМКИ МОРГАЮТ =================
// Замысел игрока: на рамке не должны гореть все зрачки разом — это режет
// глаз. Открыта примерно треть, раз в 2–3 секунды один открытый глаз
// закрывается, а где-то открывается другой. Закрываясь, глаз не исчезает:
// чёрное тело остаётся, зрачок уходит под веки — в черноту. Совсем
// невидимыми глаза рамки становятся только на выходе из игры (покров,
// envy-eyes-veil.js).
//
// ---------- РАВНОМЕРНО ----------
// Глаза рамки упорядочены по обходу периметра. Открывается тот закрытый,
// что стоит посередине самого длинного ряда закрытых: открытые не
// сбиваются в кучу с одной стороны.
//
// ---------- КАК ДЁШЕВО ----------
// Тела глаз — на неподвижном холсте рамки (EnvyEyes.drawGen). Зрачок
// каждого глаза — свой маленький холст поверх рамки (mountLive): моргание
// перерисовывает один-два таких холстика, а не рамку. Кадры (rAF) идут,
// только пока кто-то моргает; расписание — setTimeout, и только пока игра
// открыта (инвариант 1: таймер — для картинки, не для состояния).
Object.assign(EnvyEyes, {
    // Два набора, моргают независимо: чёрные глаза (зелёный зрачок) —
    // открыта треть; обратные (зелёный миндаль, EnvyEyes.pickInverted) —
    // открыты почти все: закрытый обратный не виден вовсе, а форму рамке
    // дают как раз они. Общий ритм «через один» у обоих наборов совпадал с
    // чередованием видов — и на целых сторонах обратные оказывались закрыты.
    BLINK_OPEN: { k: 0.5, inv: 0.75 },
    BLINK_INV_CHANCE: 0.4,      // как часто смена задевает и обратные
    BLINK_EVERY: [2000, 3000],  // мс между сменами
    BLINK_MS: { open: 420, close: 340 },
    _live: null,

    // Глаза рамки со зрачком по обходу периметра.
    liveEyes() {
        if (this._liveList) return this._liveList;
        if (!this._eyes) return [];     // рамка ещё не разложена — не запоминать пустое
        const cx = STAGE_W / 2, cy = STAGE_H / 2;
        const list = (this._eyes || []).filter(e => e.r);
        list.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
        return (this._liveList = list);
    },

    // Набор глаз одного вида по обходу периметра.
    pool(kind) {
        // индикаторы не моргают сами — ими правит заполнение (setFill)
        return this.liveEyes().filter(e => e.ind == null && (e.kind === 'inv' ? 'inv' : 'k') === kind);
    },

    // Начальный набор: в каждом виде открыт каждый n-й по обходу со
    // случайным сдвигом.
    blinkInit() {
        for (const e of this.liveEyes()) e.live = { from: 0, to: 0, t0: 0, dur: 1 };
        for (const kind of ['k', 'inv']) {
            const list = this.pool(kind), step = 1 / this.BLINK_OPEN[kind];
            for (let k = Math.random() * step; k < list.length; k += step) {
                const L = list[Math.floor(k)].live;
                L.from = L.to = 1;
            }
        }
    },

    // Раскрытие зрачка глаза рамки сейчас (0 — под веками, 1 — открыт).
    // Для покрова: на входе он закрывает лишние зрачки до этого состояния.
    liveIo(e, now) {
        const L = e.live;
        if (!L) return 1;
        const t = this.clamp01(((now || performance.now()) - L.t0) / L.dur);
        if (t >= 1) return L.to;
        const pseudo = { d: 0, du: 1, over: 1, look: 0 };
        return L.to > L.from ? this.up(pseudo, t).o : this.down(pseudo, t).o;
    },
    liveTarget(e) { return e.live ? e.live.to : 1; },

    // ---------- ХОЛСТИКИ ЗРАЧКОВ ----------
    // Окно зовёт после того, как вывело рамку полосами (MinigameWindow.wearSkin).
    mountLive(rimEl, scale) {
        if (!this._eyes) return;
        if (!this.liveEyes()[0] || !this.liveEyes()[0].live) this.blinkInit();
        this._liveScale = scale;
        for (const e of this.liveEyes()) {
            // обратный глаз — весь миндаль зелёный, холстик под длину глаза
            const pad = 2, half = (e.kind === 'inv' ? e.w / 2 : e.r) + pad;
            const c = document.createElement('canvas');
            c.width = Math.ceil(half * 2 * scale); c.height = c.width;
            Object.assign(c.style, { left: (e.x - half) + 'px', top: (e.y - half) + 'px',
                                     width: (half * 2) + 'px', height: (half * 2) + 'px' });
            rimEl.appendChild(c);
            e.liveCv = c;
            this.paintLive(e, this.liveIo(e));
        }
    },

    paintLive(e, io) {
        const c = e.liveCv;
        if (!c) return;
        const g = c.getContext('2d'), s = this._liveScale, half = c.width / s / 2;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, c.width, c.height);
        if (io < 0.02) return;
        // Обрезка веками — только внутри save/restore. Без них обрезка
        // копилась от кадра к кадру, а clearRect стирает лишь внутри
        // текущей обрезки: от прежних кадров оставались зелёные щёлочки и
        // штриховка на закрытых глазах (нашёл игрок на iPhone).
        g.save();
        g.setTransform(s, 0, 0, s, 0, 0);
        g.translate(half, half);
        g.rotate(e.ang);
        this.almond(g, e.w, Math.min(1, io));
        g.clip();
        g.rotate(-e.ang);
        this.pupil(g, e, 0, 0);
        g.restore();
    },

    // ---------- ИНДИКАТОРЫ ----------
    // Заполнено n делений: первые n глаз веера слева открыты, остальные
    // закрыты. Меняются только те, у кого цель другая, — моргая.
    setFill(n) {
        for (const e of this.liveEyes()) {
            if (e.ind == null || !e.live) continue;
            const to = e.ind < n ? 1 : 0;
            if (e.live.to !== to) this.blinkTo(e, to);
        }
    },

    // ---------- РАСПИСАНИЕ ----------
    blinkStart() {
        this.blinkStop();
        if (!this.liveEyes().length) return;
        if (!this.liveEyes()[0].live) this.blinkInit();
        this._blinkOn = true;
        const next = () => {
            if (!this._blinkOn) return;
            this.blinkSwap(this.pool('k'));
            if (Math.random() < this.BLINK_INV_CHANCE) this.blinkSwap(this.pool('inv'));
            const [a, b] = this.BLINK_EVERY;
            this._blinkT = setTimeout(next, a + Math.random() * (b - a));
        };
        // первая смена — когда покров входа уже ушёл
        this._blinkT = setTimeout(next, 1600);
    },

    blinkStop() {
        this._blinkOn = false;
        clearTimeout(this._blinkT);
        cancelAnimationFrame(this._blinkRaf);
        this._blinkRaf = 0;
        // недоморгавшие — сразу в итог
        for (const e of this.liveEyes()) if (e.live) { e.live.from = e.live.to; this.paintLive(e, e.live.to); }
    },

    // Один открытый закрывается, открывается середина самого длинного ряда
    // закрытых (по кругу периметра).
    blinkSwap(list) {
        const n = list.length;
        if (n < 2) return;
        const open = list.map((e, i) => e.live.to ? i : -1).filter(i => i >= 0);
        if (!open.length) return;
        const shut = open[Math.floor(Math.random() * open.length)];
        this.blinkTo(list[shut], 0);
        const isOpen = (i) => list[(i + n) % n].live.to === 1;
        let best = -1, bestLen = 0;
        for (let i = 0; i < n; i++) {
            if (isOpen(i) || !isOpen(i - 1)) continue;      // начало ряда закрытых
            let len = 0;
            while (len < n && !isOpen(i + len)) len++;
            const mid = (i + Math.floor(len / 2)) % n;
            // только что закрытый не открываем сразу же
            if (len > bestLen && mid !== shut) { best = mid; bestLen = len; }
        }
        if (best >= 0) this.blinkTo(list[best], 1);
    },

    blinkTo(e, to) {
        const now = performance.now();
        e.live.from = this.liveIo(e, now);
        e.live.to = to;
        e.live.t0 = now;
        e.live.dur = to ? this.BLINK_MS.open : this.BLINK_MS.close;
        if (!this._blinkRaf) this._blinkRaf = requestAnimationFrame(() => this.blinkFrame());
    },

    blinkFrame() {
        this._blinkRaf = 0;
        const now = performance.now();
        let busy = false;
        for (const e of this.liveEyes()) {
            const L = e.live;
            if (!L || L.from === L.to) continue;
            const io = this.liveIo(e, now);
            this.paintLive(e, io);
            if (now - L.t0 >= L.dur) L.from = L.to; else busy = true;
        }
        if (busy) this._blinkRaf = requestAnimationFrame(() => this.blinkFrame());
    }
});
