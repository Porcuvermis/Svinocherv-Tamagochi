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
    // Один набор на все активные глаза рамки (индикаторы — не рамка, ими
    // правит заполнение). Открыто около BLINK_OPEN, но НЕ МЕНЬШЕ BLINK_MIN
    // (просьба игрока: бывало по пять секунд ни одного открытого глаза).
    // Было два набора по видам, и в каждом «закрыть один, открыть середину
    // ряда закрытых»: закрылся последний открытый — рядов после открытого
    // нет, набор больше не открывался никогда, и глаза вымирали.
    BLINK_OPEN: 0.35,
    BLINK_MIN: 4,
    // Каждый открытый горит свой срок — не дольше 5 с (просьба игрока: один
    // глаз открылся и не закрывался, пока остальные моргали; смена «раз в
    // 2–3 с закрыть случайный» могла обходить его сколько угодно).
    BLINK_LIFE: [2500, 5000],
    BLINK_TICK: 400,            // мс между проверками сроков
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

    // Активные глаза рамки по обходу периметра (без индикаторов).
    pool() {
        return this.liveEyes().filter(e => e.ind == null);
    },
    openTarget(n) {
        return Math.min(n, Math.max(this.BLINK_MIN, Math.round(n * this.BLINK_OPEN)));
    },

    // Начальный набор: открыт каждый n-й по обходу со случайным сдвигом.
    blinkInit() {
        for (const e of this.liveEyes()) e.live = { from: 0, to: 0, t0: 0, dur: 1 };
        const list = this.pool(), want = this.openTarget(list.length);
        if (!want) return;
        const step = list.length / want;
        for (let k = Math.random() * step, c = 0; c < want; k += step, c++) {
            const L = list[Math.floor(k) % list.length].live;
            L.from = L.to = 1;
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
            // холстик под длину глаза: на нём и зрачок, и край век
            const pad = 2, half = e.w / 2 + pad;
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
        // край век — зелёная обводка открытого глаза, сужается с веками
        g.save();
        g.setTransform(s, 0, 0, s, 0, 0);
        this.lidLine(g, Object.assign({}, e, { x: half, y: half }), io);
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
        // Уже открытым — случайный остаток срока, чтобы не закрылись разом.
        const now = performance.now(), [a, b] = this.BLINK_LIFE;
        for (const e of this.pool()) if (e.live.to) e.live.until = now + 1600 + Math.random() * (b - 1600);
        const next = () => {
            if (!this._blinkOn) return;
            this.blinkTick(this.pool());
            this._blinkT = setTimeout(next, this.BLINK_TICK);
        };
        this._blinkT = setTimeout(next, this.BLINK_TICK);
    },

    blinkStop() {
        this._blinkOn = false;
        clearTimeout(this._blinkT);
        cancelAnimationFrame(this._blinkRaf);
        this._blinkRaf = 0;
        // недоморгавшие — сразу в итог
        for (const e of this.liveEyes()) if (e.live) { e.live.from = e.live.to; this.paintLive(e, e.live.to); }
    },

    // Проверка: у кого вышел срок — смена (сначала замена, потом закрытие);
    // открытых меньше цели — добрать.
    blinkTick(list) {
        const now = performance.now();
        for (const e of list) {
            if (e.live.to && e.live.until && now >= e.live.until) this.blinkSwap(list, e);
        }
        const open = list.filter(e => e.live.to).length;
        if (open < this.openTarget(list.length)) this.blinkSwap(list, null);
    },

    // Смена: СНАЧАЛА открывается середина самого длинного ряда закрытых
    // (по кругу периметра; открытых нет — любой), ПОТОМ, если открытых
    // больше цели, закрывается один из прежних открытых. Открытых не
    // бывает меньше цели дольше, чем длится одно моргание.
    // shut — кого закрыть (вышел срок); нет — только добрать открытых.
    blinkSwap(list, shutEye) {
        const n = list.length;
        if (n < 2) return;
        // закрываемый в поиске ряда считается закрытым — замена встаёт не
        // на его место, а в середину пустоты
        if (shutEye) shutEye.live.to = 0;
        const isOpen = (i) => list[(i + n) % n].live.to === 1;
        const openBefore = list.map((e, i) => e.live.to ? i : -1).filter(i => i >= 0);
        let best = -1, bestLen = 0;
        if (!openBefore.length) best = Math.floor(Math.random() * n);
        for (let i = 0; i < n && openBefore.length; i++) {
            if (isOpen(i) || !isOpen(i - 1)) continue;      // начало ряда закрытых
            let len = 0;
            while (len < n && !isOpen(i + len)) len++;
            let mid = (i + Math.floor(len / 2)) % n;
            if (list[mid] === shutEye) mid = (mid + 1) % n;     // не он же снова
            if (len > bestLen && !isOpen(mid)) { best = mid; bestLen = len; }
        }
        if (best >= 0) this.blinkTo(list[best], 1);
        if (shutEye) { shutEye.live.to = 1; this.blinkTo(shutEye, 0); }
    },

    blinkTo(e, to) {
        const now = performance.now();
        e.live.from = this.liveIo(e, now);
        e.live.to = to;
        e.live.t0 = now;
        e.live.dur = to ? this.BLINK_MS.open : this.BLINK_MS.close;
        if (to) { const [a, b] = this.BLINK_LIFE; e.live.until = now + a + Math.random() * (b - a); }
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
