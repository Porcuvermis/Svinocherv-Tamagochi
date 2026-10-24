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
    // Крест — пустота между обычными монетами (замысел игрока: монеты
    // «случайно» упали так, что между ними осталось место крестом).
    // Четыре монеты обычного размера, по одной в каждом углу между лучами;
    // щели между соседними — лучи. Крест чуть повёрнут, у каждого луча свой
    // угол и своя ширина, монеты сдвинуты — читается, но не выверен.
    // Что было до (всё забраковано игроком): мелочь между лучами — «смешные
    // монетки»; ряды монет вдоль лучей с заглушками на концах — крест
    // огромный, идеально симметричный, выпирал бугром в угол сцены.
    cross: { x: 338, y: 38, size: 40 },
    CROSS_GAP: 1.6,     // полуширина пустоты (у каждого луча своя, ±0.6)
    CROSS_TURN: 0.12,   // поворот креста целиком, радианы
    CORNER: 26,
    OVERLAP: 1.5,       // тьма под монетами заходит на сцену — без светлой щели на стыке
    HANG: 0.45,         // насколько центр монеты может зайти за край сцены, доли радиуса

    get bg() { return PALETTE.greedCoin.gold.deep; },
    reach() { return Math.ceil(this.RAD / 2 * (1 + this.HANG)) + 2; },

    // Лучи и четыре монеты между ними. Всё от своего зерна — крест одинаков
    // при каждом входе.
    crossPins() {
        if (this._pins) return this._pins;
        const C = this.cross, r = this.RAD / 2;
        let st = 977;
        const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296 - 0.5; };
        const arms = [0, 1, 2, 3].map(k => ({
            a: Math.PI / 4 + k * Math.PI / 2 + this.CROSS_TURN + rnd() * 0.14,
            g: this.CROSS_GAP + rnd() * 1.2
        }));
        const top = [];
        for (let k = 0; k < 4; k++) {
            const A = arms[k], B = arms[(k + 1) % 4];
            let b = B.a; if (b < A.a) b += Math.PI * 2;
            const mid = (A.a + b) / 2, half = (b - A.a) / 2;
            // вплотную к обоим лучам: от центра на (r + щель) / sin(полуугла)
            const t = (r + Math.max(A.g, B.g)) / Math.sin(half) + Math.abs(rnd()) * 0.8;
            top.push({ x: C.x + Math.cos(mid) * t, y: C.y + Math.sin(mid) * t });
        }
        // Верхние лучи длиннее: вдоль них по монете с каждой стороны,
        // внахлёст на угловые (в куче монеты лежат друг на друге). Нижние
        // лучи — только угловые монеты: крест несимметричен и не лезет на
        // сцену бугром.
        for (const A of arms) {
            const dx = Math.cos(A.a), dy = Math.sin(A.a);
            A.len = (r + A.g) + 6;
            if (dy > 0) continue;
            const u = (r + A.g) + 2 * r * 0.68 + rnd() * 3;
            [1, -1].forEach(side => {
                if (rnd() > 0.38 && side === -1 && A.len > 30) return;    // иногда без пары
                const o = r + A.g + 0.4 + Math.abs(rnd()) * 1.2, uu = u + rnd() * 4;
                top.push({ x: C.x + dx * uu - dy * side * o, y: C.y + dy * uu + dx * side * o });
                A.len = Math.max(A.len, uu);
            });
        }
        this._arms = arms;
        return (this._pins = { top, under: [] });
    },

    inner() { return MinigameWindow.skinGeometry(this).inner; },

    // Расстояние от точки до края сцены (скруглённый прямоугольник):
    // > 0 — снаружи, в рамке; < 0 — над сценой.
    edgeDist(x, y) {
        const I = this.inner(), R = this.CORNER;
        const cx = (I.x0 + I.x1) / 2, cy = (I.y0 + I.y1) / 2;
        const qx = Math.abs(x - cx) - ((I.x1 - I.x0) / 2 - R), qy = Math.abs(y - cy) - ((I.y1 - I.y0) / 2 - R);
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
    },
    // Расстояние до ближайшего луча за вычетом его полуширины.
    crossDist(x, y) {
        this.crossPins();
        const C = this.cross;
        let best = Infinity;
        for (const A of this._arms) {
            const dx = Math.cos(A.a), dy = Math.sin(A.a);
            const t = Math.max(0, Math.min(A.len, (x - C.x) * dx + (y - C.y) * dy));
            best = Math.min(best, Math.hypot(x - C.x - dx * t, y - C.y - dy * t) - A.g);
        }
        return best;
    },
    rimKeep(x, y, r, rng) {
        if (this.edgeDist(x, y) < -r * this.HANG) return false;
        // Монеты всех слоёв не заходят на луч (и нижние тоже — иначе они
        // закрывали пустоту). Запас у каждой свой — край неровный.
        return this.crossDist(x, y) > r * (0.97 + rng() * 0.1);
    },
    // Щели между монетами рамки — тёмное золото (глубина кучи), и только
    // пустота креста — чёрная. Пока все щели были одинаково чёрными, крест
    // терялся среди них: на обычном размере экрана его было не найти.
    // Под лучами — узкая трещина темноты (не шире самой щели) и только там,
    // где луч с обеих сторон закрыт монетами. Широкая или длинная полоса
    // вылезала за монеты и читалась намалёванным крестом, тёмное пятно
    // вокруг центра — пятном.
    rimUnder(g) {
        g.fillStyle = 'rgb(175,175,175)'; g.fillRect(0, 0, 390, 844);
        this.crossPins();
        const C = this.cross;
        g.strokeStyle = '#000'; g.lineCap = 'round';
        for (const A of this._arms) {
            // луч — докуда его с обеих сторон закрывают монеты
            const len = A.len - 4;
            g.lineWidth = 2 * A.g + 5;   // шире щели: края уходят под монеты, золота между лучом и монетой не видно
            g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(C.x + Math.cos(A.a) * len, C.y + Math.sin(A.a) * len); g.stroke();
        }
    },
    // Заливает фон рамки текущим цветом: всё вне сцены.
    rimBg(g) {
        const I = this.inner(), e = this.OVERLAP;
        g.beginPath();
        g.rect(-2, -2, 394, 848);
        if (g.roundRect) g.roundRect(I.x0 + e, I.y0 + e, I.x1 - I.x0 - 2 * e, I.y1 - I.y0 - 2 * e, this.CORNER - e);
        else g.rect(I.x0 + e, I.y0 + e, I.x1 - I.x0 - 2 * e, I.y1 - I.y0 - 2 * e);
        g.fill('evenodd');
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
