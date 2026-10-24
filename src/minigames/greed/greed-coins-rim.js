// ================= АЛЧНОСТЬ: РАМКА ОКНА ИЗ МОНЕТ =================
// Продолжение GreedCoins (greed-coins.js): шкурка окна по образцу пены похоти
// и глаз зависти — MinigameWindow.attach(..., { skin: GreedCoins }).
//   rim, cross, bg, reach(), drawGen(ctx, scale), mountLive(rimEl, scale).
//
// Монеты лежат полосой по краю экрана, внутренний край неровный: монета
// может нависать над сценой на полрадиуса. Крестика как предмета нет — это
// ПУСТОТА между монетами (замысел игрока): будто монеты «случайно» упали так,
// что между ними осталось место в форме креста. Граница пустоты неровная
// (у каждой монеты свой запас), но крест читается.
//
// Живой блеск: рамка выводится окном четырьмя полосами-холстами (не холстом
// во весь экран). Свет считает видеокарта на своём холсте вне страницы,
// а в полосы при наклоне копируется готовая картинка (mountLive).
Object.assign(GreedCoins, {
    // Верх равен низу (просьба игрока): низ выходит сам.
    rim: { side: 18, top: 59 },
    // Крест крупнее монеты втрое: при меньшем монеты не помещаются между его
    // лучами, и пустота читается ромбом, а не крестом.
    cross: { x: 338, y: 30, size: 56 },
    CROSS_GAP: 2.5,       // полуширина пустоты сверх радиуса монеты, единицы сцены
    CORNER: 26,
    OVERLAP: 1.5,       // тьма под монетами заходит на сцену — без светлой щели на стыке
    HANG: 0.45,         // насколько центр монеты может зайти за край сцены, доли радиуса

    get bg() { return PALETTE.greedCoin.gold.deep; },
    // Как далеко монеты заходят на сцену: обычный край — на полмонеты, у
    // креста — на монету (см. rimKeep).
    reach() {
        const r = this.RAD / 2, C = this.cross;
        return Math.ceil(2 * r) + 2;
    },
    CROSS_ZONE: 0.8,    // радиус окрестности креста, доли size

    inner() { return MinigameWindow.skinGeometry(this).inner; },

    // Расстояние от точки до края сцены (скруглённый прямоугольник):
    // > 0 — снаружи, в рамке; < 0 — над сценой.
    edgeDist(x, y) {
        const I = this.inner(), R = this.CORNER;
        const cx = (I.x0 + I.x1) / 2, cy = (I.y0 + I.y1) / 2;
        const qx = Math.abs(x - cx) - ((I.x1 - I.x0) / 2 - R), qy = Math.abs(y - cy) - ((I.y1 - I.y0) / 2 - R);
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
    },
    crossDist(x, y) {
        const C = this.cross, a = C.size / 2, seg = (x0, y0, x1, y1) => {
            const dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
        };
        return Math.min(seg(C.x - a, C.y - a, C.x + a, C.y + a), seg(C.x - a, C.y + a, C.x + a, C.y - a));
    },
    rimKeep(x, y, r, rng, L) {
        // Вокруг креста монеты лежат и над углом сцены: иначе нижние лучи
        // креста упирались в край сцены, где монет нет, и крест читался «V».
        const nearCross = Math.hypot(x - this.cross.x, y - this.cross.y) < this.cross.size * this.CROSS_ZONE;
        // Но не глубже радиуса: глубже — бугор на сцену (забраковал игрок).
        if (this.edgeDist(x, y) < -r * (nearCross ? 1 : this.HANG)) return false;
        if (L && L.only === 'cross' && !nearCross) return false;
        // запас у каждой монеты свой — край пустоты неровный, как у упавших
        return this.crossDist(x, y) > this.CROSS_GAP + r * (0.85 + rng() * 0.15);
    },
    // Куда падает досыпка у креста: чаще — вплотную к лучу, в случайном месте
    // вдоль него и с случайной стороны (так края лучей выкладываются плотно,
    // но неровно), иногда — куда угодно в окрестности.
    crossSample(rng, r) {
        const C = this.cross, a = C.size / 2;
        // между лучами у центра: монета, прижатая к обоим лучам, — без неё
        // середина креста раскрывалась ромбом
        const q = rng();
        if (q < 0.25) {
            const k = Math.floor(rng() * 4), t = Math.PI / 2 * k + (rng() - 0.5) * 0.5;
            const d = (this.CROSS_GAP + r) * Math.SQRT2 + rng() * r * 0.6;
            return { x: C.x + Math.cos(t) * d, y: C.y + Math.sin(t) * d };
        }
        if (q < 0.35) {
            const t = rng() * Math.PI * 2, d = Math.sqrt(rng()) * C.size * this.CROSS_ZONE;
            return { x: C.x + Math.cos(t) * d, y: C.y + Math.sin(t) * d };
        }
        const arm = Math.floor(rng() * 2), dx = Math.SQRT1_2, dy = arm ? Math.SQRT1_2 : -Math.SQRT1_2;
        const u = (rng() * 2 - 1) * a * Math.SQRT2 * 1.1, side = rng() < 0.5 ? -1 : 1;
        const o = this.CROSS_GAP + r * (0.86 + rng() * 0.16);
        return { x: C.x + dx * u - dy * side * o, y: C.y + dy * u + dx * side * o };
    },
    rimUnder(g) {
        g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, 390, 844);
        const C = this.cross, a = C.size / 2;
        g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineWidth = 2 * this.CROSS_GAP + 4;
        g.beginPath();
        g.moveTo(C.x - a, C.y - a); g.lineTo(C.x + a, C.y + a);
        g.moveTo(C.x - a, C.y + a); g.lineTo(C.x + a, C.y - a);
        g.stroke();
    },
    rimBg(g) {
        const I = this.inner(), e = this.OVERLAP;
        g.rect(-2, -2, 394, 848);
        if (g.roundRect) g.roundRect(I.x0 + e, I.y0 + e, I.x1 - I.x0 - 2 * e, I.y1 - I.y0 - 2 * e, this.CORNER - e);
        else g.rect(I.x0 + e, I.y0 + e, I.x1 - I.x0 - 2 * e, I.y1 - I.y0 - 2 * e);
    },

    // ---------- атласы грузятся сразу при подключении файла ----------
    atlas: null,
    loadAtlas() {
        if (this.atlas) return this.atlas;
        const A = this.atlas = { ready: false, alb: new Image(), nor: new Image(), wait: [] };
        let n = 0;
        const done = () => { if (++n === 2) { A.ready = true; A.wait.splice(0).forEach(f => f()); } };
        A.alb.onload = A.nor.onload = done;
        A.alb.src = 'src/minigames/greed/coins-albedo.png';
        A.nor.src = 'src/minigames/greed/coins-normal.png';
        return A;
    },

    draw(ctx, scale) { for (const _ of this.drawGen(ctx, scale)) { /* до конца */ } },

    // Атласы не успели (окно открыли сразу после запуска) — тёмная рамка без
    // монет, а монеты дорисует mountLive, когда атласы придут.
    *drawGen(ctx) {
        const A = this.loadAtlas();
        if (!A.ready) {
            ctx.save(); ctx.fillStyle = this.bg; ctx.beginPath(); this.rimBg(ctx); ctx.fill('evenodd'); ctx.restore();
            return;
        }
        yield* this.lightRim();
        ctx.drawImage(this._glCv, 0, 0, 390, 844);
    },
    *lightRim() {
        if (this._rimDraw) return;
        const A = this.loadAtlas();
        const pile = yield* this.pileGen(A.alb, A.nor, {
            seed: this.SEED + 1, keep: (x, y, r, rng, L) => this.rimKeep(x, y, r, rng, L), bg: (g) => this.rimBg(g),
            zone: { sample: (rng, r) => this.crossSample(rng, r) },
            // Щели рамки — тёмное золото с лёгкими тенями, чёрная только
            // пустота креста: пока все щели были одинаково чёрными, крест
            // терялся среди них.
            under: (g) => this.rimUnder(g), bgColor: PALETTE.greedCoin.gold.lo, shadow: 0.25
        });
        yield;
        const cv = document.createElement('canvas'); cv.width = this.W; cv.height = this.H;
        this._glCv = cv;
        this._rimDraw = this.lighter(cv, pile);
        this._tilt = { x: 0, y: 0 };
        if (this._rimDraw) this._rimDraw(this._tilt);
    },

    // ---------- ЖИВОЙ БЛЕСК В ПОЛОСАХ ----------
    mountLive(rimEl) {
        const A = this.loadAtlas();
        if (!A.ready || !this._rimDraw) {
            // поздние атласы: собрать кучу кусками и залить полосы
            const later = () => {
                const job = this.lightRim();
                const step = () => { const t0 = performance.now(); while (performance.now() - t0 < 6) if (job.next().done) { this.mountLive(rimEl); return; } setTimeout(step, 16); };
                step();
            };
            if (A.ready) later(); else A.wait.push(later);
            return;
        }
        const strips = Array.from(rimEl.querySelectorAll('canvas')).map(c => ({
            c, g: c.getContext('2d'),
            sx: parseFloat(c.style.left) * 2, sy: parseFloat(c.style.top) * 2,
            sw: parseFloat(c.style.width) * 2, sh: parseFloat(c.style.height) * 2
        }));
        const paint = () => {
            this._rimDraw(this._tilt);
            for (const s of strips) { s.g.clearRect(0, 0, s.c.width, s.c.height); s.g.drawImage(this._glCv, s.sx, s.sy, s.sw, s.sh, 0, 0, s.c.width, s.c.height); }
        };
        paint();
        const run = ++this._liveRun || (this._liveRun = 1);
        const tilt = this._tilt;
        let last = { x: tilt.x, y: tilt.y };
        const loop = () => {
            if (this._liveRun !== run || !rimEl.isConnected) return;
            // Окно скрыто — не крутимся каждый кадр, заглядываем изредка.
            if (rimEl.offsetParent === null) { setTimeout(loop, 400); return; }
            const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
            const want = T.live ? T : { x: 0, y: 0 };
            // датчик дрожит: без сглаживания монеты мерцают
            tilt.x += (want.x - tilt.x) * 0.15; tilt.y += (want.y - tilt.y) * 0.15;
            if (Math.abs(last.x - tilt.x) > 0.002 || Math.abs(last.y - tilt.y) > 0.002) { last = { x: tilt.x, y: tilt.y }; paint(); }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
});
GreedCoins.loadAtlas();
