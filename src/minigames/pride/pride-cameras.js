// ================= ТЩЕСЛАВИЕ: РАМКА ОКНА ИЗ ФОТОАППАРАТОВ =================
// Шкурка окна (MinigameWindow.attach, опция skin; CLAUDE.md, инвариант 8;
// docs/plan/32-pride-cameras.md). Материал греха — толпа фотографов: экран
// «снимают» со всех сторон, журналисты и зеваки суют в него объективы, кто
// какие. Рамка собрана из разных камер (профессиональные, плёночные, мыльницы,
// смартфоны), крестик — отдельная камера с закрытым объективом и крестом.
//
// Камеры нарисованы заранее (cameras/*.svg, листы — docs/cameras/*-sheet.png).
// Здесь только раскладка и вывод. ПРАВИЛА (решения игрока):
//   * все камеры повёрнуты ВЕРХОМ К ЦЕНТРУ экрана (радиальный веер), но не
//     жёстко: угол — смесь радиального и осевого плюс небольшой разброс;
//   * камеры КРУПНЫЕ и их МАЛО. Там, где можно поставить четыре мелкие, ставится
//     одна — на всю толщину полосы, а не россыпь. Это важнее всего на боках;
//   * слои: дальний — подложка, центр камеры на краю экрана, половина за краем;
//     ближний — камеры видны целиком. В слое камеры лезут друг на друга на
//     10–20 %. Дыр, сквозь которые видна сцена, быть не должно (fillHoles);
//   * рядом одинаковая модель не ставится (повтор — не ближе чем через пять);
//   * КАМЕРУ НЕ ОБРЕЗАЮТ. Если она выступает за кромку окна на сцену — пусть
//     выступает, выступы придают рамке жизнь. Полосы окна берут столько,
//     сколько выступила самая выступающая (reach()), ровного среза нет нигде.
// Всё считается один раз, из зерна: раскладка не меняется от запуска к запуску.
//
// ПЕРЕХОД (вспышки) — следующая задача плана; пока шкурка без `veil`, и окно
// открывается и закрывается как раньше.
const PrideCameras = {
    // Окно уменьшается РАВНОМЕРНО (translate+scale), поэтому верх и низ равны только
    // когда top = (844 − 800·k) / 2, где k = (390 − 2·side) / 390. Бока 30 → k = 0,846 →
    // верх = низ = 83. Шире бока (40) дали низ 137 при верхе 71 — игрок велел верх = низу.
    // Правило при смене side: пересчитать top по формуле.
    rim: { side: 30, top: 83 },
    cross: { x: 336, y: 42, size: 60 },
    CORNER: 10,
    // Насколько камера МОЖЕТ выступать за кромку окна на сцену (единицы). Больше —
    // начинает закрывать кнопки сцены (слоты наряда на боках, счёт сверху).
    PROT_SIDE: 32, PROT_TB: 14,
    MAX_FILL: 8,         // сколько камер заделки дыр допускается всего (не «засыпать мелочью»)
    RADIAL: 0.65,        // доля радиального угла (остальное — осевой, «аккуратный»)
    TILT: 7,             // случайный разброс угла, градусы
    SEED: 1717,
    DIR: 'src/minigames/pride/cameras/',
    holeTest: false,     // для проб: подложка малиновая, вуали нет — дыры видны сразу

    // Размеры — из viewBox каждого файла (единицы рисунка).
    MODELS: {
        'pro-1': { w: 563, h: 346.5, fam: 'pro' },
        'pro-2': { w: 559, h: 298.5, fam: 'pro' },
        'pro-3': { w: 543, h: 397, fam: 'pro' },
        'pro-4': { w: 551, h: 338.5, fam: 'pro' },
        'film-1': { w: 547, h: 332.5, fam: 'film' },
        'film-2': { w: 559, h: 320.5, fam: 'film' },
        'film-3': { w: 386.5, h: 403, fam: 'film' },
        'film-4': { w: 489, h: 325, fam: 'film' },
        'compact-1': { w: 495, h: 285, fam: 'compact' },
        'compact-2': { w: 491, h: 289, fam: 'compact' },
        'compact-3': { w: 220.5, h: 332.5, fam: 'compact' },
        'compact-4': { w: 486.5, h: 285, fam: 'compact' },
        'phone-1': { w: 190, h: 411, fam: 'phone' },
        'phone-2': { w: 190, h: 411, fam: 'phone' },
        'phone-3': { w: 192, h: 411, fam: 'phone' },
        'phone-4': { w: 191.5, h: 411, fam: 'phone' }
    },
    CROSS: { w: 555, h: 330 },

    get bg() { return this.holeTest ? '#ff00ff' : PALETTE.ink; },
    inner() { return MinigameWindow.skinGeometry(this).inner; },

    // Полосы окна несут только подложку (скруглённый вырез): камеры — отдельные
    // слои поверх (mountLive), они качаются и полосами не обрезаются.
    reach() { return this.CORNER; },

    // ---------- картинки грузятся сразу при подключении файла ----------
    imgs: null,
    load() {
        if (this.imgs) return this.imgs;
        const I = this.imgs = { ready: false, pic: {}, left: 0 };
        const ids = Object.keys(this.MODELS).concat('cross');
        I.left = ids.length;
        ids.forEach(id => {
            const im = new Image();
            I.pic[id] = im;
            im.onload = im.onerror = () => {
                if (--I.left > 0) return;
                I.ready = true;
                // Рамку рисовали без камер (картинки не успели) — перерисовать.
                const el = document.getElementById('pride-game'), w = el && el._mgWindow;
                if (w && w._rimScale && w._rimDrewBlank) { w._rimDrewBlank = false; w._rimScale = null; w.ensureSkin(); }
            };
            im.src = this.DIR + id + '.svg';
        });
        return I;
    },

    // ---------- раскладка ----------
    rng(seed) {
        let a = seed >>> 0;
        return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    pick(rnd, recent, minAspect) {
        const ids = Object.keys(this.MODELS).filter(id => !minAspect || this.MODELS[id].w / this.MODELS[id].h >= minAspect);
        for (let tries = 0; tries < 60; tries++) {
            const id = ids[Math.floor(rnd() * ids.length)];
            if (recent.slice(-5).includes(id)) continue;
            const f = this.MODELS[id].fam, l = recent.slice(-2).map(r => this.MODELS[r].fam);
            if (l.length === 2 && l[0] === f && l[1] === f) continue;
            return id;
        }
        return ids[0];
    },
    // Угол камеры: верх смотрит в центр. axis — «аккуратный» угол полосы
    // (верх 180, низ 0, лево 90, право 270), radial — точно на центр.
    angle(x, y, axisDeg, rnd, radial) {
        const rad = Math.atan2(STAGE_W / 2 - x, -(STAGE_H / 2 - y)) * 180 / Math.PI;
        const d = ((rad - axisDeg + 540) % 360) - 180;       // кратчайшая разность
        return axisDeg + d * (radial == null ? this.RADIAL : radial) + (rnd() * 2 - 1) * this.TILT;
    },
    // Габарит камеры с учётом поворота.
    bbox(it) {
        const r = it.rot * Math.PI / 180, W = it.w * it.s, H = it.h * it.s;
        const ex = (Math.abs(Math.cos(r)) * W + Math.abs(Math.sin(r)) * H) / 2;
        const ey = (Math.abs(Math.sin(r)) * W + Math.abs(Math.cos(r)) * H) / 2;
        return { x0: it.x - ex, x1: it.x + ex, y0: it.y - ey, y1: it.y + ey, ex, ey };
    },
    // Сдвинуть камеру так, чтобы она не выступала на сцену дальше предела.
    // Сдвиг — к краю экрана (камера уходит за край), а не срез. sides — какие
    // стороны окна учесть.
    fit(it, sides) {
        const I = this.inner(), b = this.bbox(it);
        if (sides.includes('left')) it.x = Math.min(it.x, I.x0 + this.PROT_SIDE - b.ex);
        if (sides.includes('right')) it.x = Math.max(it.x, I.x1 - this.PROT_SIDE + b.ex);
        if (sides.includes('top')) it.y = Math.min(it.y, I.y0 + this.PROT_TB - b.ey);
        if (sides.includes('bottom')) it.y = Math.max(it.y, I.y1 - this.PROT_TB + b.ey);
        return it;
    },
    // Одна лента вдоль стороны. side: 'top' | 'bottom' | 'left' | 'right'.
    //   thick — толщина по радиусу (высота камеры, повёрнутой верхом к центру);
    //   step  — на сколько длины камеры сдвигается следующая (0,86 — наложение 14 %,
    //           больше единицы — между камерами промежуток, его закрывает слой под ними);
    //   whole — камера видна целиком (не за край экрана): толщина урезается по
    //           месту, выступ на сцену — случайный до предела.
    strip(rnd, o) {
        const out = [], recent = [];
        const axis = { top: 180, bottom: 0, left: 90, right: 270 }[o.side];
        const horiz = o.side === 'top' || o.side === 'bottom';
        const I = this.inner();
        const room = { left: I.x0, right: STAGE_W - I.x1, top: I.y0, bottom: STAGE_H - I.y1 }[o.side];
        const maxProt = horiz ? this.PROT_TB : this.PROT_SIDE;
        let cur = o.from;
        while (cur < o.to) {
            const id = this.pick(rnd, recent, o.minAspect); recent.push(id);
            const M = this.MODELS[id];
            let t = o.thick * (0.92 + rnd() * 0.16);
            const prot = o.whole ? maxProt * (0.35 + rnd() * 0.65) : 0;   // выступ на сцену
            let it, tries = 0;
            do {
                const s = t / M.h, len = M.w * s, u = cur + len / 2;
                const dep = o.depth || 0;
                const x = horiz ? u : (o.side === 'left' ? dep : STAGE_W - dep);
                const y = horiz ? (o.side === 'top' ? dep : STAGE_H - dep) : u;
                it = { id, x, y, rot: this.angle(x, y, axis, rnd, o.radial), s, w: M.w, h: M.h, len };
                if (o.whole) {
                    // Внутренний край камеры — на кромке окна плюс выступ. Камера НЕ
                    // уменьшается ради посадки (игрок: микрокамеры поверх больших —
                    // это брак): если при повороте не влезает целиком, выступ на
                    // сцену углубляется до предела, и только потом — чуть ужимается
                    // (не ниже 88 % заказанной толщины).
                    const b = this.bbox(it), ext = horiz ? b.ey : b.ex;
                    const want = Math.max(room + prot, 2 * ext * (1 - (o.cut || 0)));
                    const edge = Math.min(want, room + maxProt);
                    if (horiz) it.y = o.side === 'top' ? edge - b.ey : STAGE_H - edge + b.ey;
                    else it.x = o.side === 'left' ? edge - b.ex : STAGE_W - edge + b.ex;
                    const bb = this.bbox(it);
                    const out0 = horiz ? (o.side === 'top' ? bb.y0 : STAGE_H - bb.y1) : (o.side === 'left' ? bb.x0 : STAGE_W - bb.x1);
                    if (out0 < -(o.cut || 0) * t && t > o.thick * 0.88) { t *= 0.97; continue; }
                } else this.fit(it, [o.side]);
                break;
            } while (++tries < 14);
            out.push(it);
            cur += it.len * (o.step + (rnd() * 2 - 1) * 0.05);
        }
        return out;
    },
    layout() {
        if (this._lay) return this._lay;
        const R = this.rng(this.SEED), cx = this.cross;
        const stop = cx.x - 50;                          // левый край камеры-крестика
        const lay = { back: [], mid: [], front: [] };
        // Дальний слой — подложка: центр на краю экрана, половина за краем.
        // Боковые — крупные, по одной вместо россыпи (толщина 88: видно ~44, то есть
        // вся полоса бока и выступ на сцену).
        // ГЛАВНОЕ (игрок): видимость камер. Каждая на боках видна целиком и крупно,
        // как держат в руках, а не россыпь мелочи, которой затыкают дыры.
        // Смартфон, повёрнутый верхом к центру, в полосу глубиной ~42 влезает только
        // длинной осью — выходит палочка шириной 19. Поэтому в ближнем слое на боках
        // только широкие модели, а смартфоны — в подложке, где они наполовину за краем.
        // Самый дальний слой — тоже крупные камеры, но глубже за краем: закрывает щели
        // между силуэтами подложки у самого края экрана (вместо мелочи).
        lay.back.push(
            ...this.strip(R, { side: 'left', from: 10, to: STAGE_H - 10, depth: -14, thick: 120, step: 0.8, radial: 0.2 }),
            ...this.strip(R, { side: 'right', from: 10, to: STAGE_H - 10, depth: -14, thick: 120, step: 0.8, radial: 0.2 })
        );
        lay.back.push(
            ...this.strip(R, { side: 'left', from: 40, to: STAGE_H - 40, depth: 0, thick: 120, step: 0.74, radial: 0.3 }),
            ...this.strip(R, { side: 'right', from: 40, to: STAGE_H - 40, depth: 0, thick: 120, step: 0.74, radial: 0.3 }),
            ...this.strip(R, { side: 'top', from: -40, to: STAGE_W + 40, depth: 0, thick: 112, step: 0.8 }),
            ...this.strip(R, { side: 'bottom', from: -40, to: STAGE_W + 40, depth: 0, thick: 112, step: 0.8 })
        );
        lay.front.push(
            ...this.strip(R, { side: 'left', from: 70, to: STAGE_H - 50, whole: true, cut: 0.1, thick: 62, step: 1.0, minAspect: 1.3, radial: 0.4 }),
            ...this.strip(R, { side: 'right', from: 90, to: STAGE_H - 50, whole: true, cut: 0.1, thick: 62, step: 1.0, minAspect: 1.3, radial: 0.4 }),
            ...this.strip(R, { side: 'top', from: -10, to: stop + 20, whole: true, cut: 0.1, thick: 80, step: 0.98 }),
            ...this.strip(R, { side: 'bottom', from: -10, to: STAGE_W + 10, whole: true, cut: 0.1, thick: 80, step: 0.98 })
        );
        this._lay = lay;
        this.fillHoles(lay);
        return lay;
    },

    // ---------- рисунок ----------
    put(g, it, shadow) {
        const im = this.imgs.pic[it.id];
        if (!im || !im.complete || !im.naturalWidth) return;
        g.save();
        g.translate(it.x, it.y);
        g.rotate(it.rot * Math.PI / 180);
        const w = it.w * it.s, h = it.h * it.s;
        if (shadow) { g.shadowColor = 'rgba(8,6,10,0.6)'; g.shadowBlur = 5; g.shadowOffsetY = 2; }
        g.drawImage(im, -w / 2, -h / 2, w, h);
        g.restore();
    },
    // Подложка с вырезом под сцену — одним куском.
    paintBg(g, color) {
        const I = this.inner(), R = this.CORNER;
        g.fillStyle = color;
        g.beginPath();
        g.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        if (g.roundRect) g.roundRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0, R); else g.rect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0);
        g.fill('evenodd');
    },
    putCross(g) {
        // Камера стоит прямо (крестик читается только так); крышка объектива чуть
        // ниже середины камеры, поэтому центр камеры выше зоны нажатия.
        const h = 72, c = this.cross;
        this.put(g, { id: 'cross', x: c.x, y: c.y - 6, rot: 0, s: h / this.CROSS.h, w: this.CROSS.w, h: this.CROSS.h }, true);
    },
    // ---------- ДЫРЫ ----------
    // Игрок: в рамке не должно быть дыр. Случайная раскладка их оставляет там,
    // где силуэты соседних камер (диски, горбы, выступы) не сошлись. Поэтому
    // раскладка один раз пробуется на малиновой подложке, и в каждую найденную
    // дыру ставится ещё камера (средний слой) — крупная, глубже ближних; так до
    // тех пор, пока дыр нет. Зерно то же — результат тот же при каждом запуске.
    fillHoles(lay) {
        if (!this.imgs.ready) return;
        const K = 2, cv = document.createElement('canvas');        // двойное разрешение: тонкие щели видны
        cv.width = STAGE_W * K; cv.height = STAGE_H * K;
        const g = cv.getContext('2d'), I = this.inner(), R = this.rng(this.SEED + 5);
        g.scale(K, K);
        const taken = lay.front.slice(-5).map(i => i.id);
        let added = 0;
        for (let pass = 0; pass < 10 && added < this.MAX_FILL; pass++) {
            g.clearRect(0, 0, STAGE_W, STAGE_H);
            this.paintBg(g, '#ff00ff');
            lay.back.forEach(it => this.put(g, it, false));
            lay.mid.forEach(it => this.put(g, it, false));
            lay.front.forEach(it => this.put(g, it, false));
            this.putCross(g);
            const d = g.getImageData(0, 0, STAGE_W * K, STAGE_H * K).data;
            const cells = {};
            for (let y = 0; y < STAGE_H * K; y++) for (let x = 0; x < STAGE_W * K; x++) {
                const p = (y * STAGE_W * K + x) * 4;
                if (d[p + 3] > 128 && d[p] > 200 && d[p + 1] < 80 && d[p + 2] > 200) {
                    const k = Math.floor(x / K / 14) + ',' + Math.floor(y / K / 14);
                    const c = cells[k] || (cells[k] = { n: 0, sx: 0, sy: 0 });
                    c.n++; c.sx += x / K; c.sy += y / K;
                }
            }
            // Щели в несколько точек глазом не видны — камеру на них не тратим
            // (лишние камеры — это мелочь и грязь, которую игрок запретил).
            const holes = Object.values(cells).filter(c => c.n >= 60).sort((a, b) => b.n - a.n);
            if (!holes.length) break;
            holes.slice(0, 2).forEach(c => {
                if (added++ >= this.MAX_FILL) return;
                const x = c.sx / c.n, y = c.sy / c.n;
                const id = this.pick(R, taken); taken.push(id);
                const M = this.MODELS[id], sc = (84 + R() * 26) / M.h;
                const sides = [];
                if (x < I.x0 + this.PROT_SIDE) sides.push('left'); if (x > I.x1 - this.PROT_SIDE) sides.push('right');
                if (y < I.y0 + this.PROT_TB) sides.push('top'); if (y > I.y1 - this.PROT_TB) sides.push('bottom');
                const ax = y < STAGE_H / 2 ? 180 : 0, ay = x < STAGE_W / 2 ? 90 : 270;
                const axis = (sides.includes('left') || sides.includes('right')) && !(sides.includes('top') || sides.includes('bottom')) ? ay : ax;
                const it = { id, x, y, rot: this.angle(x, y, axis, R, 0.4), s: sc, w: M.w, h: M.h };
                this.fit(it, sides);
                lay.mid.push(it);
            });
        }
    },
    // ---------- РАМКА: подложка ----------
    *drawGen(g) {
        this.load();
        g.clearRect(0, 0, STAGE_W, STAGE_H);
        // Всё вне окна сцены — тёмная подложка (скруглённый вырез): между камерами
        // не светит сцена, угол окна скруглён. Камеры — живые слои (mountLive).
        this.paintBg(g, this.bg);
        yield;
    },

    // ---------- ЖИВЫЕ КАМЕРЫ ----------
    // Игрок: слои слегка качаются от края к центру — передний и задний в
    // ПРОТИВОПОЛОЖНУЮ сторону, и не разом: у каждой камеры свой период и свой сдвиг.
    // Дёшево: камера — готовый холст со своей тенью и затемнением слоя, качает его
    // видеокарта (css transform), страница каждый кадр ничего не рисует и фильтров нет
    // (docs/traps.md, пп. 164–167). Состояния игры это не касается (инвариант 1:
    // анимация — только картинка).
    SWAY: { front: 5, mid: 3.5, back: 6 },      // размах, единицы сцены
    DARK: { back: 0.62, mid: 0.25, front: 0 },  // затемнение слоя запечено в камеру
    bake(it, dark, scale) {
        const m = 8, b = this.bbox(it), cv = document.createElement('canvas');
        const w = b.x1 - b.x0 + 2 * m, h = b.y1 - b.y0 + 2 * m;
        cv.width = Math.max(1, Math.ceil(w * scale)); cv.height = Math.max(1, Math.ceil(h * scale));
        const g = cv.getContext('2d');
        g.scale(scale, scale); g.translate(-(b.x0 - m), -(b.y0 - m));
        this.put(g, it, dark < 0.5);
        if (dark > 0) {
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'source-atop';
            g.fillStyle = 'rgba(12,10,14,' + dark + ')';
            g.fillRect(0, 0, cv.width, cv.height);
        }
        cv.style.left = (b.x0 - m) + 'px'; cv.style.top = (b.y0 - m) + 'px';
        cv.style.width = w + 'px'; cv.style.height = h + 'px';
        return cv;
    },
    mountLive(rimEl, scale) {
        if (!this.imgs || !this.imgs.ready) {
            // Картинки не успели: когда придут, загрузчик перерисует рамку (load()).
            const w = (document.getElementById('pride-game') || {})._mgWindow;
            if (w) w._rimDrewBlank = true;
            return;
        }
        const sc = Math.min(1.5, scale), L = this.layout();
        const box = document.createElement('div');
        box.className = 'mg-cams';
        const R = this.rng(this.SEED + 31);
        const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const add = (it, key, sign) => {
            const cv = this.bake(it, this.DARK[key], sc);
            cv.className = 'mg-cam';
            const dx = STAGE_W / 2 - it.x, dy = STAGE_H / 2 - it.y, n = Math.hypot(dx, dy) || 1;
            const amp = this.SWAY[key] * sign, dur = 3.4 + R() * 2.2;
            cv.style.setProperty('--dx', (dx / n * amp).toFixed(2) + 'px');
            cv.style.setProperty('--dy', (dy / n * amp).toFixed(2) + 'px');
            cv.style.setProperty('--rot', ((R() * 2 - 1) * 1.4 * sign).toFixed(2) + 'deg');
            if (!calm) { cv.style.animationDuration = dur.toFixed(2) + 's'; cv.style.animationDelay = (-R() * dur).toFixed(2) + 's'; }
            else cv.style.animation = 'none';
            box.appendChild(cv);
        };
        // К центру качается задний слой, когда передний — к краю: знаки противоположны.
        L.back.forEach(it => add(it, 'back', -1));
        L.mid.forEach(it => add(it, 'mid', -1));
        L.front.forEach(it => add(it, 'front', 1));
        // Камера-крестик — неподвижная, поверх всего.
        const h = 72, c = this.cross, cr = { id: 'cross', x: c.x, y: c.y - 6, rot: 0, s: h / this.CROSS.h, w: this.CROSS.w, h: this.CROSS.h };
        const cv = this.bake(cr, 0, sc); cv.className = 'mg-cam mg-cam-still'; box.appendChild(cv);
        rimEl.appendChild(box);
    },

    // Для проб: сколько щелей в рамке в покое (камеры в исходных местах).
    holeReport() {
        const lay = this.layout(), K = 2, cv = document.createElement('canvas');
        cv.width = STAGE_W * K; cv.height = STAGE_H * K;
        const g = cv.getContext('2d'); g.scale(K, K);
        this.paintBg(g, '#ff00ff');
        lay.back.concat(lay.mid, lay.front).forEach(it => this.put(g, it, false));
        this.putCross(g);
        const d = g.getImageData(0, 0, STAGE_W * K, STAGE_H * K).data;
        let bad = 0; const cells = {};
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] > 200 && d[i + 1] < 80 && d[i + 2] > 200) {
            bad++; const p = i / 4, x = (p % (STAGE_W * K)) / K, y = Math.floor(p / (STAGE_W * K)) / K;
            const k = Math.floor(x / 20) + ',' + Math.floor(y / 20); cells[k] = (cells[k] || 0) + 1;
        }
        return { bad, total: d.length / 4, cells: Object.keys(cells).length, png: cv.toDataURL('image/png') };
    }
};
if (typeof window !== 'undefined') PrideCameras.load();
