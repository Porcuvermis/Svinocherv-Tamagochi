// ================= ТЩЕСЛАВИЕ: РАМКА ОКНА ИЗ ФОТОАППАРАТОВ =================
// Шкурка окна (MinigameWindow.attach, опция skin; CLAUDE.md, инвариант 8;
// docs/plan/32-pride-cameras.md). Материал греха — толпа фотографов: рамка
// собрана из разных камер (профессиональные, плёночные, мыльницы, смартфоны),
// крестик — отдельная камера с закрытым объективом и крестом на крышке.
//
// Камеры нарисованы заранее (cameras/*.svg, лист — docs/cameras/*-sheet.png).
// Здесь только раскладка и вывод:
//   * верх и низ — широкие камеры внахлёст, наклон ±6°;
//   * бока (18 единиц) — смартфоны и «высокие» камеры стоймя, широкие —
//     лёжа на боку, чтобы влезть в узкую полосу;
//   * рядом одинаковая модель не ставится, и три камеры одного семейства
//     подряд тоже (как правило «похожий сосед» у глаз зависти);
//   * два ряда: дальний придавлен тёмным слоем, ближний с тенью.
// Всё считается один раз, из зерна: раскладка не меняется от запуска к запуску.
//
// ПЕРЕХОД (вспышки) — следующая задача плана; пока шкурка без `veil`, и окно
// открывается и закрывается как раньше.
const PrideCameras = {
    // Бока 24 вместо 18 и верх/низ 71 вместо 59: камеры в 18 единицах не помещаются,
    // пропорция верх : бок почти прежняя (3,0 против 3,3), окно уменьшается на 4 %.
    rim: { side: 24, top: 71 },
    cross: { x: 336, y: 36, size: 60 },
    CORNER: 10,
    HANG: 18,            // насколько камеры заходят на сцену; полосы окна берут ровно столько
    RADIAL: 0.65,        // доля радиального угла (остальное — осевой, «аккуратный»)
    TILT: 7,             // случайный разброс угла, градусы
    SEED: 1717,
    DIR: 'src/minigames/pride/cameras/',
    holeTest: false,     // для проб: подложка малиновая, вуали нет — дыры видны сразу

    // Размеры — из viewBox каждого файла (единицы рисунка). kind: wide — лежат
    // на верху и низу, tall — стоят на боках, оба — годятся и там и там.
    MODELS: {
        'pro-1': { w: 563, h: 346.5, fam: 'pro', kind: 'wide' },
        'pro-2': { w: 559, h: 298.5, fam: 'pro', kind: 'wide' },
        'pro-3': { w: 543, h: 397, fam: 'pro', kind: 'wide' },
        'pro-4': { w: 551, h: 338.5, fam: 'pro', kind: 'wide' },
        'film-1': { w: 547, h: 332.5, fam: 'film', kind: 'wide' },
        'film-2': { w: 559, h: 320.5, fam: 'film', kind: 'wide' },
        'film-3': { w: 386.5, h: 403, fam: 'film', kind: 'both' },
        'film-4': { w: 489, h: 325, fam: 'film', kind: 'wide' },
        'compact-1': { w: 495, h: 285, fam: 'compact', kind: 'wide' },
        'compact-2': { w: 491, h: 289, fam: 'compact', kind: 'wide' },
        'compact-3': { w: 220.5, h: 332.5, fam: 'compact', kind: 'both' },
        'compact-4': { w: 486.5, h: 285, fam: 'compact', kind: 'wide' },
        'phone-1': { w: 190, h: 411, fam: 'phone', kind: 'tall' },
        'phone-2': { w: 190, h: 411, fam: 'phone', kind: 'tall' },
        'phone-3': { w: 192, h: 411, fam: 'phone', kind: 'tall' },
        'phone-4': { w: 191.5, h: 411, fam: 'phone', kind: 'tall' }
    },
    CROSS: { w: 555, h: 330 },

    get bg() { return this.holeTest ? '#ff00ff' : PALETTE.ink; },
    reach() { return this.HANG; },
    inner() { return MinigameWindow.skinGeometry(this).inner; },

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
    // Замысел игрока: экран фотографируют со всех сторон — журналисты и зеваки
    // суют в него объективы, кто какие. Поэтому:
    //   * камеры повёрнуты ВЕРХОМ К ЦЕНТРУ экрана (радиальный веер), но не
    //     жёстко: угол — смесь радиального и осевого плюс небольшой разброс;
    //   * камеры КРУПНЫЕ и их мало: толщина по радиусу задана полосой;
    //   * два слоя. Дальний — подложка: центр камеры на краю экрана, половина
    //     ушла за край. Ближний — камеры видны целиком, не за край;
    //   * в слое камеры лезут друг на друга на 10–20 %, без дыр и без кучи;
    //   * рядом одинаковая модель не ставится (моделей 16, повтор — не ближе
    //     чем через пять соседей);
    //   * дыр, сквозь которые видна сцена, быть не должно: проверка —
    //     tools/probe-pride-rim.js, подложка на тесте ярко-малиновая.
    rng(seed) {
        let a = seed >>> 0;
        return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    pick(rnd, recent) {
        const ids = Object.keys(this.MODELS);
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
    angle(x, y, axisDeg, rnd) {
        const rad = Math.atan2(STAGE_W / 2 - x, -(STAGE_H / 2 - y)) * 180 / Math.PI;
        let d = ((rad - axisDeg + 540) % 360) - 180;       // кратчайшая разность
        return axisDeg + d * this.RADIAL + (rnd() * 2 - 1) * this.TILT;
    },
    // Камера не должна упираться во внутренний обрез полосы (иначе срез ровной
    // линией по сцене): считаем габарит с поворотом и, если он дальше HANG,
    // сдвигаем камеру к краю экрана. sides — какие стороны учесть.
    fit(x, y, rot, W, H, sides) {
        const r = rot * Math.PI / 180, I = this.inner();
        const ex = (Math.abs(Math.cos(r)) * W + Math.abs(Math.sin(r)) * H) / 2;
        const ey = (Math.abs(Math.sin(r)) * W + Math.abs(Math.cos(r)) * H) / 2;
        if (sides.includes('left')) x = Math.min(x, I.x0 + this.HANG - 1 - ex);
        if (sides.includes('right')) x = Math.max(x, I.x1 - this.HANG + 1 + ex);
        if (sides.includes('top')) y = Math.min(y, I.y0 + this.HANG - 1 - ey);
        if (sides.includes('bottom')) y = Math.max(y, I.y1 - this.HANG + 1 + ey);
        return { x, y };
    },
    // Одна лента вдоль стороны. side: 'top' | 'bottom' | 'left' | 'right'.
    // depth — расстояние центра камеры от края экрана, thick — толщина по
    // радиусу, step — доля ширины, на которую камеры НЕ накладываются.
    strip(rnd, o) {
        const out = [], recent = [];
        const axis = { top: 180, bottom: 0, left: 90, right: 270 }[o.side];
        const horiz = o.side === 'top' || o.side === 'bottom';
        let cur = o.from;
        while (cur < o.to) {
            const id = this.pick(rnd, recent); recent.push(id);
            const M = this.MODELS[id];
            const t = o.thick * (0.92 + rnd() * 0.16);
            const s = t / M.h, len = M.w * s;               // вдоль ленты — ширина камеры
            const u = cur + len / 2;
            let dep = o.depth + (rnd() * 2 - 1) * o.jit;
            let x = horiz ? u : (o.side === 'left' ? dep : STAGE_W - dep);
            let y = horiz ? (o.side === 'top' ? dep : STAGE_H - dep) : u;
            const rot = this.angle(x, y, axis, rnd);
            const f = this.fit(x, y, rot, M.w * s, M.h * s, [o.side]);
            x = f.x; y = f.y;
            out.push({ id, x, y, rot, s, w: M.w, h: M.h });
            cur += len * (o.step + (rnd() * 2 - 1) * 0.04);
        }
        return out;
    },
    layout() {
        if (this._lay) return this._lay;
        const R = this.rng(this.SEED), cx = this.cross;
        const stop = cx.x - 50;                          // левый край камеры-крестика
        // Три слоя: дальний — подложка, половина за краем экрана; средний —
        // глубже ближнего и сдвинут относительно него, закрывает его щели;
        // ближний — камеры видны целиком.
        const P = {
            back:  { depS: 0,  thS: 80, depT: 0,  thT: 92, step: 0.84 },
            mid:   { depS: 14, thS: 62, depT: 42, thT: 82, step: 0.84 },
            front: { depS: 21, thS: 42, depT: 54, thT: 66, step: 0.86 }
        };
        const strips = (layer) => {
            const q = P[layer], step = q.step, from = layer === 'mid' ? -60 : -20;
            return [
                ...this.strip(R, { side: 'left', from, to: STAGE_H + 20, depth: q.depS, jit: 2, thick: q.thS, step }),
                ...this.strip(R, { side: 'right', from, to: STAGE_H + 20, depth: q.depS, jit: 2, thick: q.thS, step }),
                ...this.strip(R, { side: 'top', from, to: stop + 30, depth: q.depT, jit: 2, thick: q.thT, step }),
                ...this.strip(R, { side: 'bottom', from, to: STAGE_W + 20, depth: q.depT, jit: 2, thick: q.thT, step })
            ];
        };
        const lay = { back: strips('back'), mid: strips('mid'), front: strips('front') };
        // Углы окна: в скруглении сцены между лентами остаётся клин. Закрываем
        // его по камере в каждом углу (в среднем слое, под ближним).
        const I = this.inner(), taken = lay.front.slice(-6).map(i => i.id);
        [['left', 'top', I.x0, I.y0], ['right', 'top', I.x1, I.y0], ['left', 'bottom', I.x0, I.y1], ['right', 'bottom', I.x1, I.y1]].forEach(([sx, sy, px, py], k) => {
            const id = this.pick(R, taken); taken.push(id);
            const M = this.MODELS[id], t = 40, sc = t / M.h;
            const ax = sy === 'top' ? 180 : 0;
            const rot = this.angle(px, py, ax, R);
            const f = this.fit(px + (sx === 'left' ? -6 : 6), py + (sy === 'top' ? -6 : 6), rot, M.w * sc, M.h * sc, [sx, sy]);
            lay.mid.push({ id, x: f.x, y: f.y, rot, s: sc, w: M.w, h: M.h });
        });
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
    *drawGen(g) {
        const I = this.inner(), R = this.CORNER;
        this.load();
        g.clearRect(0, 0, STAGE_W, STAGE_H);
        // Всё вне окна сцены — тёмная подложка (скруглённый вырез), чтобы
        // между камерами не светила сцена и угол окна был скруглён.
        this.paintBg(g, this.bg);
        yield;
        const handle = (document.getElementById('pride-game') || {})._mgWindow;
        if (!this.imgs.ready) { if (handle) handle._rimDrewBlank = true; return; }
        const L = this.layout();
        // Дальний ряд, затем тёмная вуаль на всё кольцо рамки, затем ближний.
        const veil = (a) => {
            if (this.holeTest) return;
            g.fillStyle = 'rgba(12,10,14,' + a + ')';
            g.beginPath();
            g.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
            g.rect(I.x0 + this.HANG * 0.3, I.y0 + this.HANG * 0.3, I.x1 - I.x0 - this.HANG * 0.6, I.y1 - I.y0 - this.HANG * 0.6);
            g.fill('evenodd');
        };
        L.back.forEach(it => this.put(g, it, false));
        yield;
        veil(0.6);
        L.mid.forEach(it => this.put(g, it, true));
        yield;
        veil(0.32);
        L.front.forEach(it => this.put(g, it, true));
        yield;
        // Камера-крестик — поверх всего, в углу. Ширина по высоте полосы.
        // Камера стоит прямо (крестик читается только так); крышка объектива чуть ниже
        // середины камеры, поэтому центр камеры выше зоны нажатия.
        this.putCross(g);
    },
    putCross(g) {
        const h = 62, c = this.cross;
        this.put(g, { id: 'cross', x: c.x, y: c.y - 5, rot: 0, s: h / this.CROSS.h, w: this.CROSS.w, h: this.CROSS.h }, true);
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
    // ---------- ДЫРЫ ----------
    // Игрок: в рамке не должно быть дыр. Случайная раскладка их оставляет там,
    // где силуэты соседних камер (диски, горбы, выступы) не сошлись. Поэтому
    // раскладка один раз пробуется на малиновой подложке, и в каждую найденную
    // дыру ставится ещё камера (средний слой); так до тех пор, пока дыр нет.
    // Зерно то же — результат тот же при каждом запуске.
    fillHoles(lay) {
        if (!this.imgs.ready) return;
        const cv = document.createElement('canvas');
        const K = 2;                                        // пробуем в двойном разрешении: тонкие щели видны
        cv.width = STAGE_W * K; cv.height = STAGE_H * K;
        const g = cv.getContext('2d'), I = this.inner(), R = this.rng(this.SEED + 5);
        g.scale(K, K);
        const taken = lay.front.slice(-5).map(i => i.id);
        for (let pass = 0; pass < 24; pass++) {
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
            const holes = Object.values(cells).filter(c => c.n >= 1).sort((a, b) => b.n - a.n);
            if (!holes.length) break;
            holes.slice(0, 8).forEach(c => {
                const x = c.sx / c.n, y = c.sy / c.n;
                const id = this.pick(R, taken); taken.push(id);
                const M = this.MODELS[id], sc = (38 + R() * 12) / M.h;
                const sides = [];
                if (x < I.x0 + this.HANG - 2) sides.push('left'); if (x > I.x1 - this.HANG + 2) sides.push('right');
                if (y < I.y0 + this.HANG - 2) sides.push('top'); if (y > I.y1 - this.HANG + 2) sides.push('bottom');
                const ax = y < STAGE_H / 2 ? 180 : 0, ay = x < STAGE_W / 2 ? 90 : 270;
                const axis = (sides.includes('left') || sides.includes('right')) && !(sides.includes('top') || sides.includes('bottom')) ? ay : ax;
                const rot = this.angle(x, y, axis, R);
                const f = this.fit(x, y, rot, M.w * sc, M.h * sc, sides);
                lay.mid.push({ id, x: f.x, y: f.y, rot, s: sc, w: M.w, h: M.h });
            });
        }
    }
};
if (typeof window !== 'undefined') PrideCameras.load();
