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
    // Верх равен низу: низ выходит сам (что осталось под уменьшенной сценой).
    rim: { side: 18, top: 59 },
    // Крест — пустота между обычными монетами. Мелочь между лучами (первая
    // версия) игрок забраковал: смешные монетки другого размера. Поэтому
    // монеты вдоль лучей кладутся НАРОЧНО (crossPins) — по одной в каждом
    // углу между лучами и по паре дальше вдоль лучей, с небольшим разбросом,
    // а остальное досыпается случайно и в пустоту не лезет.
    cross: { x: 336, y: 46, size: 44 },
    CROSS_GAP: 4,       // полуширина пустоты, единицы сцены
    CORNER: 26,
    OVERLAP: 1.5,       // тьма под монетами заходит на сцену — без светлой щели на стыке
    HANG: 0.45,         // насколько центр монеты может зайти за край сцены, доли радиуса

    get bg() { return PALETTE.greedCoin.gold.deep; },
    // Как далеко монеты заходят на сцену: обычный край — на полмонеты, у
    // креста — до низа нижней монеты креста.
    reach() {
        const r = this.RAD / 2, P = this.crossPins();
        const low = Math.max(this.cross.y + this.crossZone(), ...P.top.concat(P.under).map(p => p.y)) + r;
        return Math.ceil(Math.max(r * (1 + this.HANG), low - this.inner().y0)) + 2;
    },

    // Монеты вокруг креста (замысел игрока: монеты «случайно» упали так, что
    // между ними пустота крестом; все монеты обычного размера). Каждый луч с
    // обеих сторон выложен рядом монет вплотную к нему: в углах между лучами —
    // по монете (она общая для двух соседних рядов), дальше вдоль луча — ещё
    // по одной с каждой стороны, на конце — монета-заглушка.
    // Что было до: мелочь между лучами — «смешные монетки» (игрок); только
    // четыре монеты вокруг центра — выходила толстая звёздочка с короткими
    // лучами: у одинаковых кругов щель между соседями длится не дольше
    // радиуса, дальше раскрывается клином.
    crossPins() {
        if (this._pins) return this._pins;
        const C = this.cross, r = this.RAD / 2, S2 = Math.SQRT1_2;
        let st = 977;
        const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296 - 0.5; };
        const off = () => r + this.CROSS_GAP + Math.abs(rnd()) * 1.5;
        const top = [];
        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
            const t = (r + this.CROSS_GAP) / S2 + 0.5;
            top.push({ x: C.x + dx * t + rnd(), y: C.y + dy * t + rnd() });
        });
        const u1 = (r + this.CROSS_GAP) + 0.5, u2 = u1 + 2 * r * 0.93;
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([ax, ay]) => {
            const dx = ax * S2, dy = ay * S2;
            [1, -1].forEach(side => {
                const o = off();
                top.push({ x: C.x + dx * u2 - dy * side * o, y: C.y + dy * u2 + dx * side * o });
            });
            const T = this.capLen();
            top.push({ x: C.x + dx * T + rnd() * 2, y: C.y + dy * T + rnd() * 2 });
        });
        return (this._pins = { top, under: [] });
    },
    // монета-заглушка вплотную к последней паре вдоль луча
    capLen() {
        const r = this.RAD / 2, o = r + this.CROSS_GAP + 0.7, u2 = r + this.CROSS_GAP + 0.5 + 2 * r * 0.93;
        return u2 + Math.sqrt(Math.max(0, (2 * r * 0.95) ** 2 - o * o));
    },
    // Длина луча — до монеты на его конце.
    armLen() { return this.capLen() - this.RAD / 2 * 0.95; },
    crossZone() { return this.capLen() * 0.9; },

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
        const C = this.cross, a = this.armLen() * Math.SQRT1_2, seg = (x0, y0, x1, y1) => {
            const dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
        };
        return Math.min(seg(C.x - a, C.y - a, C.x + a, C.y + a), seg(C.x - a, C.y + a, C.x + a, C.y - a));
    },
    rimKeep(x, y, r, rng) {
        // Вокруг креста монеты лежат и над углом сцены: иначе нижний луч
        // креста упирался в край сцены, где монет нет, и крест читался «V».
        const nearCross = Math.hypot(x - this.cross.x, y - this.cross.y) < this.crossZone();
        if (!nearCross && this.edgeDist(x, y) < -r * this.HANG) return false;
        // запас у каждой монеты свой — край пустоты неровный, как у упавших
        // Случайные монеты (и нижних слоёв тоже) — дальше от луча, чем монеты
        // креста: иначе нижние слои подходили к лучу вплотную и закрывали
        // пустоту, крест исчезал.
        return this.crossDist(x, y) > this.CROSS_GAP + r + 3 + rng() * 2;
    },
    // Щели между монетами рамки — тёмное золото (глубина кучи), и только
    // пустота креста — чёрная. Пока все щели были одинаково чёрными, крест
    // терялся среди них: на обычном размере экрана его было не найти.
    rimUnder(g) {
        g.fillStyle = 'rgb(215,215,215)'; g.fillRect(0, 0, 390, 844);
        const C = this.cross, a = this.armLen() * Math.SQRT1_2;
        g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineWidth = 2 * this.CROSS_GAP + 12;
        g.beginPath();
        g.moveTo(C.x - a, C.y - a); g.lineTo(C.x + a, C.y + a);
        g.moveTo(C.x - a, C.y + a); g.lineTo(C.x + a, C.y - a);
        g.stroke();
    },
    // Заливает фон рамки текущим цветом: всё вне сцены и пятно под монетами
    // креста — там они лежат над углом сцены, и без подложки нижние лучи
    // креста терялись на тёмном фоне сцены.
    rimBg(g) {
        const I = this.inner(), e = this.OVERLAP;
        g.beginPath();
        g.rect(-2, -2, 394, 848);
        if (g.roundRect) g.roundRect(I.x0 + e, I.y0 + e, I.x1 - I.x0 - 2 * e, I.y1 - I.y0 - 2 * e, this.CORNER - e);
        else g.rect(I.x0 + e, I.y0 + e, I.x1 - I.x0 - 2 * e, I.y1 - I.y0 - 2 * e);
        g.fill('evenodd');
        g.beginPath();
        g.arc(this.cross.x, this.cross.y, this.capLen(), 0, Math.PI * 2);
        g.fill();
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
            ctx.save(); ctx.fillStyle = this.bg; this.rimBg(ctx); ctx.restore();
            return;
        }
        yield* this.lightRim();
        ctx.drawImage(this._glCv, 0, 0, 390, 844);
    },
    *lightRim() {
        if (this._rimDraw) return;
        const A = this.loadAtlas();
        const pile = yield* this.pileGen(A.alb, A.nor, {
            seed: this.SEED + 1, keep: (x, y, r, rng) => this.rimKeep(x, y, r, rng), bg: (g) => this.rimBg(g),
            pins: this.crossPins(), under: (g) => this.rimUnder(g), bgColor: PALETTE.greedCoin.gold.lo,
            // тени слабее, чем в куче: иначе щели темнели до черноты и
            // спорили с пустотой креста
            shadow: 0.2
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
