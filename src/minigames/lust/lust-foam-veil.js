// ================= ВАННАЯ: ПЕНА ЗАЛИВАЕТ ЭКРАН И УХОДИТ =================
// Продолжение LustFoam: вид перехода для покрова (src/core/mg-veil.js;
// docs/plan/25-lust-foam-transition.md, этапы 4–5).
//
//   cover  — пена захлёстывает экран сразу из нескольких очагов (каждый
//            заход — свои), пузыри появляются рядом друг с другом;
//   reveal — пузыри лопаются от середины к краям, у краёв остаётся рамка;
//            крестик в это время наливается синим;
//   close  — рамка нарастает внутрь, крестик белеет обратно;
//   clear  — пена лопается от середины целиком, вместе с рамкой;
//   burst  — нажатие крестика посреди забега: горсть гроздей по экрану
//            (MgVeil.knock), pop — брошенное лопается, finish — третье
//            нажатие: пена дорастает от брошенного до полной.
//
// ---------- ГРОЗДИ ЦЕЛИКОМ ----------
// Пузырей на весь экран — тысяч десять; перерисовывать их по одному каждый
// кадр нельзя. Поэтому пена поделена на ГРОЗДИ — ~860 групп по ~13 соседних
// пузырей. Гроздь — две картинки в атласе (groupsGen): глубокая (своя масса
// и свои глубокие пузыри) и верхняя (свои верхние пузыри). Каждый кадр
// покров собирается заново из гроздей, которые сейчас на нём: сначала
// глубокие картинки, потом верхние, всегда в одном порядке (compose).
// Появилась гроздь — её начинают рисовать, лопнула — перестают; пузыри
// уходят ЦЕЛЫМИ, соседей никто не трогает. На месте лопнувших пузырей
// раздаются и гаснут кольца, как у горки над хвостом.
//
// Так стало после двух неудачных подходов (замечания игрока). Сначала пену
// показывали и стирали круглыми «кляксами» из одной общей картинки — край
// кляксы резал пузыри пополам. Потом грозди вырезались из общей картинки и
// стирались по своей маске — маска выкусывала полукруги у соседей, и их
// приходилось на ходу дорисовывать обратно. Из одной картинки пузырь целым
// не убрать — только вырезать; поэтому грозди теперь отдельные.
//
// Неподвижная пена (пока игра дозревает) — те же грозди в том же порядке, но
// в полном разрешении (fullGen, veilStill): между движением и покоем меняется
// только резкость.
//
// Что стоило кадров (4× замедление, кадр без покрова ~21 мс): по пузырям —
// 100–250 мс; узор из общей картинки (createPattern с масштабом) — ~60;
// главное — РАЗРЕШЕНИЕ холста покрова: в полном 50–90 мс, в единичном
// 21–30. Поэтому в движении покров в единичном разрешении
// (MgVeil.MOTION_SCALE), атлас гроздей — тоже.
//
// ---------- КРЕСТИК ----------
// В пене покрова крестик белый (его не видно в общей массе), в рамке окна —
// синий. Грозди, где есть пузыри крестика, при раскрытии тают долями
// прозрачности — из-под них проступает синий крестик рамки; при закрытии
// проявляются обратно.
Object.assign(LustFoam, {
    // Длительности ходов. Заливка — всегда одной длины и не мигом (игрок:
    // «экран моргнул пузырями — и уже готово»): игра под пеной всё равно
    // собирается ПОСЛЕ неё, а сама заливка должна успеть прочитаться.
    // Лопание — с запасом на кольца (POP_END).
    VEIL_MS: { cover: 480, reveal: 620, close: 380, clear: 560, burst: 220, pop: 340, finish: 320 },
    // Лопания укладываются в эту долю хода: остаток — догорают кольца
    // последних лопнувших пузырей.
    POP_END: 0.85,
    POP_PER_FRAME: 40,
    // Ход ещё не кончен: не всё лопнуло (потолок за кадр) или горят кольца.
    veilPending() {
        const V = this._v;
        return !!V && (V.i < V.list.length || V.grow.length > 0);
    },
    // Кольцо лопнувшего пузыря (как у горки над хвостом, BATH_ART.BURST):
    // раздаётся в GROW раз и гаснет за MS. Не мельче MIN_R, одновременно не
    // больше CAP — пузырей тысячи, кольцо у каждого было бы рябью.
    RING: { ms: 260, grow: 0.55, minR: 4.5, cap: 220 },

    // Нажатия крестика в забеге (MgVeil.knock): первое — горсть маленьких
    // гроздей, второе — крупные, вместе с рамкой ~60% экрана. Центры
    // случайные, радиус — в единицах сцены.
    BURST: [
        { n: 7, r: [26, 38] },
        { n: 14, r: [44, 64] }
    ],

    // Середина экрана тем же сыпанием, но ровная (без правила глубины) и
    // реже мелочью: пене под покровом жить полсекунды, а штампов и так
    // тысячи.
    INSIDE: [
        { density: 0.08, rMin: 6, rMax: 8.5, k: 0.8 },
        { density: 0.25, rMin: 4, rMax: 6, k: 0.76 },
        { density: 0.3, rMin: 2.5, rMax: 4, k: 0.72 }
    ],

    *insideGen() {
        if (this._inside) return;
        yield* this.layersGen();
        // m — тот же запас, что у полос рамки (bands): середина начинается
        // там, где они кончились.
        const I = this.inner(), m = 42, rect = [[I.x0 + m, I.y0 + m, I.x1 - m, I.y1 - m]];
        const deep = { list: [], grid: this._grids.deep, even: true };
        const top = { list: [], grid: this._grids.top, even: true };
        yield* this.scatter(this.INSIDE, rect, btRng(this.SEED ^ 0x77a1), deep);
        yield* this.scatter(this.TOP, rect, btRng(this.SEED ^ 0x13c9), top);
        const nz = btRng(this.SEED ^ 0x4e21);
        // Не попавшие в рамку пузыри полос — тоже середина.
        const dIn = this._deepAll.filter(b => !b.rim).concat(deep.list);
        const tIn = this._topAll.filter(b => !b.rim).concat(top.list);
        for (const b of dIn.concat(tIn)) {
            b.rim = false; b.cross = false;
            if (b.nz == null) b.nz = nz() * 2 - 1;
        }
        const byY = (a, b) => (a.y + a.r) - (b.y + b.r);
        this._inside = { deep: dIn.sort(byY), top: tIn.sort(byY) };
    },


    // ---------- ГРОЗДИ ----------
    // Пузырь — к ближайшему из центров (по одному на ячейку GROUP_CELL со
    // сдвигом). Рамка и середина — порознь: раскрытие трогает только середину.
    // Масса — под глубокими пузырями рамки, что в массе (core, ×1,12 — как у
    // окна), и под всеми глубокими середины (×MASS_K — чтобы между гроздьями
    // не было дыр).
    GROUP_CELL: 20,
    MASS_K: 1.25,
    ATLAS_W: 2048,

    *groupsGen() {
        if (this._groups) return;
        yield* this.insideGen();
        const C = this.GROUP_CELL, rng = btRng(this.SEED ^ 0x6b33);
        const gw = Math.ceil(STAGE_W / C) + 2, gh = Math.ceil(STAGE_H / C) + 2;
        const seeds = [];
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            seeds.push({ x: (i - 0.5 + rng()) * C, y: (j - 0.5 + rng()) * C });
        }
        const near = (b) => {
            const ci = Math.floor(b.x / C), cj = Math.floor(b.y / C);
            let best = 0, bd = Infinity;
            for (let j = cj - 1; j <= cj + 2; j++) for (let i = ci - 1; i <= ci + 2; i++) {
                if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
                const s = seeds[j * gw + i], d = (s.x - b.x) ** 2 + (s.y - b.y) ** 2;
                if (d < bd) { bd = d; best = j * gw + i; }
            }
            return best;
        };
        const L = this.layers(), In = this._inside, map = new Map();
        const put = (b, layer, rim) => {
            b.layer = layer;
            b.massR = layer !== 'deep' ? 0 : rim ? (b.core ? b.r * 1.12 : 0) : b.r * this.MASS_K;
            const key = near(b) * 2 + (rim ? 1 : 0);
            let g = map.get(key);
            if (!g) map.set(key, g = { rim, deep: [], top: [] });
            g[layer].push(b);
        };
        for (const b of L.deep) put(b, 'deep', true);
        for (const b of L.top) put(b, 'top', true);
        for (const b of In.deep) put(b, 'deep', false);
        for (const b of In.top) put(b, 'top', false);
        yield;
        const byY = (a, b) => (a.y + a.r) - (b.y + b.r), nz = btRng(this.SEED ^ 0x1d07);
        const box = (list, withMass) => {
            if (!list.length) return null;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const b of list) {
                const R = Math.max(b.r + 1, withMass ? b.massR : 0);
                x0 = Math.min(x0, b.x - R); y0 = Math.min(y0, b.y - R);
                x1 = Math.max(x1, b.x + R); y1 = Math.max(y1, b.y + R);
            }
            x0 = Math.floor(x0); y0 = Math.floor(y0);
            return { x0, y0, w: Math.ceil(x1 - x0) + 1, h: Math.ceil(y1 - y0) + 1 };
        };
        const groups = [...map.values()];
        for (const g of groups) {
            g.deep.sort(byY); g.top.sort(byY);
            const all = g.deep.concat(g.top);
            g.x = all.reduce((s, b) => s + b.x, 0) / all.length;
            g.y = all.reduce((s, b) => s + b.y, 0) / all.length;
            g.bottom = Math.max(...all.map(b => b.y + b.r));
            g.nz = nz() * 2 - 1;
            g.cross = all.some(b => b.cross);
            g.d = box(g.deep, true);
            g.t = box(g.top, false);
        }
        // Порядок рисования — по нижнему краю грозди (как пузыри — сверху
        // вниз): один и тот же в каждом кадре и в неподвижной пене.
        groups.sort((a, b) => a.bottom - b.bottom);
        // Атлас: полки по высоте; единица сцены — точка атласа.
        const slots = [];
        for (const g of groups) { if (g.d) slots.push(g.d); if (g.t) slots.push(g.t); }
        let ax = 0, ay = 0, row = 0;
        for (const sl of slots.slice().sort((a, b) => b.h - a.h)) {
            if (ax + sl.w > this.ATLAS_W) { ax = 0; ay += row + 1; row = 0; }
            sl.ax = ax; sl.ay = ay; ax += sl.w + 1; row = Math.max(row, sl.h);
        }
        const atlas = document.createElement('canvas');
        atlas.width = this.ATLAS_W; atlas.height = ay + row + 1;
        const a = atlas.getContext('2d'), S = this.sprites(1);
        let n = 0;
        for (const g of groups) {
            if (g.d) { a.save(); a.translate(g.d.ax - g.d.x0, g.d.ay - g.d.y0); this.paintDeep(a, g, S); a.restore(); }
            if (g.t) { a.save(); a.translate(g.t.ax - g.t.x0, g.t.ay - g.t.y0); this.paintTop(a, g, S); a.restore(); }
            if (++n % 60 === 0) yield;
        }
        this._atlas = atlas;
        this._groups = groups;
    },

    // Гроздь в координатах сцены: масса, затем свои пузыри. Крестик здесь
    // белый (спрайты пены), бахрома рамки — со своей прозрачностью.
    paintDeep(ctx, g, S) {
        const mass = g.deep.filter(b => b.massR);
        if (mass.length) {
            ctx.fillStyle = this.massColor();
            ctx.beginPath();
            for (const b of mass) { ctx.moveTo(b.x + b.massR, b.y); ctx.arc(b.x, b.y, b.massR, 0, Math.PI * 2); }
            ctx.fill();
        }
        for (const b of g.deep) this.stamp(ctx, S.deep, b, this.fringeA(b));
        ctx.globalAlpha = 1;
    },
    paintTop(ctx, g, S) {
        for (const b of g.top) this.stamp(ctx, S.top, b, 1);
        ctx.globalAlpha = 1;
    },

    // ---------- НЕПОДВИЖНАЯ ПЕНА ----------
    // Все грозди в том же порядке, что собирает покров, — в полном
    // разрешении: пока игра дозревает под пеной, мыльную видно.
    *fullGen(scale) {
        if (this._full && this._fullScale === scale) return;
        yield* this.groupsGen();
        const S = this.sprites(scale), c = document.createElement('canvas');
        c.width = Math.round(STAGE_W * scale); c.height = Math.round(STAGE_H * scale);
        const g = c.getContext('2d');
        g.setTransform(scale, 0, 0, scale, 0, 0);
        // Подложка цветом массы под всей пеной: неподвижная пена закрывает
        // экран, пока под ней сменяется сцена, и не смеет иметь ни одной
        // дырки. Без неё по шву рамки и середины (у бахромы рамки массы
        // нет) сквозь пену было видно, как комната становится ванной
        // (замечание игрока).
        g.fillStyle = this.massColor();
        g.fillRect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        let n = 0;
        for (const q of this._groups) { this.paintDeep(g, q, S); if (++n % 40 === 0) yield; }
        for (const q of this._groups) { this.paintTop(g, q, S); if (++n % 40 === 0) yield; }
        this._full = c;
        this._fullScale = scale;
    },

    // Окно гонит это в простое следом за рамкой (MinigameWindow.wearSkin).
    *prepareGen(scale) { yield* this.groupsGen(); yield* this.fullGen(scale); },

    // ---------- ОЧЕРЁДНОСТЬ ----------
    // Ключ грозди — расстояние до источника хода с шумом (nz): фронт рваный,
    // а не круг. Ход идёт по РАНГУ (доля p — доля пузырей), а не по
    // расстоянию: площадь нарастает ровно, без медленного хвоста в углах.
    // nz обязан быть у каждого: NaN в ключе ломает сортировку целиком (у
    // спутников рамки его сначала не было — уход пены шёл вразнобой).
    order(list, key, desc) {
        return list.map(b => [key(b) * (1 + 0.22 * (b.nz || 0)), b])
            .sort((a, b) => desc ? b[0] - a[0] : a[0] - b[0]).map(e => e[1]);
    },
    center() {
        const I = this.inner();
        return { x: (I.x0 + I.x1) / 2, y: (I.y0 + I.y1) / 2 };
    },
    fromCenter() {
        const C = this.center();
        return (b) => Math.hypot(b.x - C.x, (b.y - C.y) * 0.62);   // вытянуто по высоте экрана
    },
    // Очаги заливки — каждый заход свои: 4–6 точек, больше у краёв, чем в
    // середине, — пена накатывает со всех сторон.
    foci() {
        const n = 4 + Math.floor(Math.random() * 3), F = [];
        for (let i = 0; i < n; i++) {
            const edge = i < n - 1;
            const a = Math.random() * Math.PI * 2;
            const x = STAGE_W / 2 + Math.cos(a) * STAGE_W * (edge ? 0.5 : 0.15);
            const y = STAGE_H / 2 + Math.sin(a) * STAGE_H * (edge ? 0.5 : 0.15);
            F.push({ x: Math.max(0, Math.min(STAGE_W, x)), y: Math.max(0, Math.min(STAGE_H, y)) });
        }
        return F;
    },

    // ---------- КАДРЫ ----------
    veilStart(ctx, mode) {
        const G = this._groups, mid = G.filter(g => !g.rim);
        // Ходы нажатий продолжают брошенное; остальные — с нуля.
        if (!(mode === 'burst' || mode === 'pop' || mode === 'finish')) this._shown = new Set();
        this._shown = this._shown || new Set();
        let list, present;
        if (mode === 'cover') {
            const F = this.foci();
            list = this.order(G, g => Math.min(...F.map(f => Math.hypot(g.x - f.x, g.y - f.y))));
            present = new Set();
        } else if (mode === 'reveal') {
            list = this.order(mid, this.fromCenter());
            present = new Set(G);
        } else if (mode === 'close') {
            list = this.order(mid, this.fromCenter(), true);
            present = new Set();
        } else if (mode === 'clear') {
            list = this.order(G, this.fromCenter());
            present = new Set(G);
        } else if (mode === 'burst') {
            // Грозди вокруг случайных центров в середине; уже брошенные не
            // повторяются. Очередь — от центра своей горсти.
            const B = this.BURST[Math.min(this.BURST.length - 1, Math.max(0, (MgVeil.knocks || 1) - 1))];
            const I = this.inner(), P = [];
            for (let i = 0; i < B.n; i++) {
                P.push({ x: I.x0 + 20 + Math.random() * (I.x1 - I.x0 - 40),
                         y: I.y0 + 20 + Math.random() * (I.y1 - I.y0 - 40),
                         r: B.r[0] + Math.random() * (B.r[1] - B.r[0]) });
            }
            const hit = (g) => P.some(c => Math.hypot(g.x - c.x, g.y - c.y) < c.r * (1 + 0.25 * g.nz));
            present = new Set(this._shown);
            list = this.order(mid.filter(g => !this._shown.has(g) && hit(g)),
                g => Math.min(...P.map(c => Math.hypot(g.x - c.x, g.y - c.y) / c.r)));
            for (const g of list) this._shown.add(g);
        } else if (mode === 'pop') {
            present = new Set(this._shown);
            list = this.order([...this._shown], () => 1);
        } else {    // finish: пена дорастает от брошенного
            const S = [...this._shown];
            present = new Set(this._shown);
            list = this.order(mid.filter(g => !this._shown.has(g)),
                S.length ? g => Math.min(...S.map(q => Math.hypot(g.x - q.x, g.y - q.y))) : this.fromCenter(), false);
        }
        this._v = { mode, list, present, i: 0, s: ctx.canvas.width / STAGE_W, grow: [],
                    rings: (this._v && this._v.rings) || [] };
        // Вся пена на покрове — это неподвижная пена, она уже собрана теми
        // же гроздьями в том же порядке: одна картинка вместо двух тысяч
        // (первый кадр раскрытия стоил 130–170 мс под 4× замедлением).
        if (present.size === G.length && this._full && this.crossAlpha(mode, 0) !== 0) {
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(this._full, 0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
        } else {
            this.compose(ctx, this._v, this.crossAlpha(mode, 0));
        }
    },

    // Прозрачность всего покрова. В конце раскрытия, когда середина
    // лопнула (POP_END), остаток — рамка с подложкой — растворяется: под ним
    // рамка окна, и стык с ней (резкость, подложка, бахрома) не виден.
    veilOpacity(mode, p) {
        if (mode !== 'reveal' || p <= this.POP_END) return 1;
        return Math.max(0, 1 - (p - this.POP_END) / (1 - this.POP_END));
    },

    // Прозрачность гроздей с крестиком: тают при раскрытии, проявляются при
    // закрытии; в остальных ходах — как все (null).
    crossAlpha(mode, p) {
        if (mode === 'reveal') return 1 - p;
        if (mode === 'close' || mode === 'finish') return p;
        return null;
    },

    // Покров из гроздей, что на нём: глубокие картинки, потом верхние, в
    // одном и том же порядке. rects — пересобрать только эти участки
    // ([x0, y0, x1, y1] в единицах сцены); без них — весь покров.
    //
    // Целиком покров собирается только в начале хода: ~1700 картинок за
    // кадр стоили 50–120 мс под 4× замедлением. Дальше — по месту: лопнула
    // гроздь — пересобирается её участок (под ней проступает то, что было
    // ниже, целыми пузырями); появилась — кладётся поверх (veil).
    compose(ctx, V, crossA, rects) {
        const s = V.s, A = this._atlas;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        let hit = null;
        if (rects) {
            if (!rects.length) { ctx.restore(); return; }
            ctx.beginPath();
            // Края — по целым точкам холста: дробный край даёт сглаженную
            // маску обрезки, целый — простой прямоугольный регион.
            for (const r of rects) {
                const x0 = Math.floor(r[0] * s), y0 = Math.floor(r[1] * s);
                ctx.rect(x0, y0, Math.ceil(r[2] * s) - x0, Math.ceil(r[3] * s) - y0);
            }
            ctx.clip();
            const u = rects.reduce((m, r) => [Math.min(m[0], r[0]), Math.min(m[1], r[1]), Math.max(m[2], r[2]), Math.max(m[3], r[3])],
                [Infinity, Infinity, -Infinity, -Infinity]);
            ctx.clearRect(Math.floor(u[0] * s), Math.floor(u[1] * s), Math.ceil((u[2] - u[0]) * s) + 2, Math.ceil((u[3] - u[1]) * s) + 2);
            hit = (sl) => sl.x0 < u[2] && sl.x0 + sl.w > u[0] && sl.y0 < u[3] && sl.y0 + sl.h > u[1]
                && rects.some(r => sl.x0 < r[2] && sl.x0 + sl.w > r[0] && sl.y0 < r[3] && sl.y0 + sl.h > r[1]);
        } else {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
        for (const pass of ['d', 't']) {
            for (const g of this._groups) {
                const sl = g[pass];
                if (!sl || (hit && !hit(sl))) continue;
                let a = V.present.has(g) ? 1 : 0;
                if (g.cross && crossA != null) a = crossA;
                if (a <= 0) continue;
                ctx.globalAlpha = a;
                ctx.drawImage(A, sl.ax, sl.ay, sl.w, sl.h, sl.x0 * s, sl.y0 * s, sl.w * s, sl.h * s);
            }
        }
        ctx.restore();
    },

    // Участок грозди (обе её картинки) с запасом в точку.
    rectOf(g) {
        const a = g.d || g.t, b = g.t || g.d;
        return [Math.min(a.x0, b.x0) - 1, Math.min(a.y0, b.y0) - 1,
                Math.max(a.x0 + a.w, b.x0 + b.w) + 1, Math.max(a.y0 + a.h, b.y0 + b.h) + 1];
    },
    crossRect() {
        if (this._crossRect) return this._crossRect;
        const cs = this._groups.filter(g => g.cross).map(g => this.rectOf(g));
        return (this._crossRect = cs.length ? [cs.reduce((m, r) => [Math.min(m[0], r[0]), Math.min(m[1], r[1]),
            Math.max(m[2], r[2]), Math.max(m[3], r[3])], [Infinity, Infinity, -Infinity, -Infinity])] : []);
    },

    // Покров стоит, пока игра дозревает: та же пена в полном разрешении.
    veilStill(ctx) {
        if (this._full) ctx.drawImage(this._full, 0, 0, STAGE_W, STAGE_H);
    },

    veil(ctx, mode, p, scale, fx) {
        const V = this._v;
        if (!V || V.mode !== mode || !this._atlas) return;
        const add = mode === 'cover' || mode === 'close' || mode === 'burst' || mode === 'finish';
        // Появление — с мягким разгоном и торможением: первые кадры заливки
        // почти пустые и дешёвые, вход не начинается рывком.
        const q = add ? 0.5 - 0.5 * Math.cos(Math.PI * p) : Math.min(1, p / this.POP_END);
        let upto = q >= 1 ? V.list.length : Math.floor(q * V.list.length);
        // Лопается не больше POP_PER_FRAME гроздей за кадр. Под 4×
        // замедлением кадр медленный, за него «положено» лопнуть сотне
        // гроздей, участок пересборки растёт, кадр ещё медленнее — замкнутый
        // круг (100+ мс на кадр). С потолком медленный телефон растягивает
        // лопание на пару кадров (veilPending держит ход), а на живой
        // частоте за кадр лопается ~30 — потолок не мешает.
        if (!add) upto = Math.min(upto, V.i + this.POP_PER_FRAME);
        const fresh = V.list.slice(V.i, upto);
        V.i = upto;
        const crossA = this.crossAlpha(mode, p);
        // Закрылись — рамка тоже на покрове: под ним окно сейчас закроется.
        // Её грозди ложатся сразу, без вспухания: в окне под покровом та же
        // рамка уже стоит, вспухающая копия поверх неё мигнула бы.
        let instant = [];
        if (p >= 1 && (mode === 'close' || mode === 'finish')) {
            instant = this._groups.filter(g => !V.present.has(g) && !g.cross && !fresh.includes(g) && !V.grow.some(k => k.g === g));
            this._shown.clear();
        }
        if (p >= 1 && mode === 'cover') this._shown.clear();
        if (add) {
            const now = performance.now();
            for (const g of fresh) V.grow.push({ g, t0: now });
            // Доросшие — на холст покрова, как есть: целые пузыри поверх того,
            // что уже лежит, ничего не режут.
            const done = instant.concat(V.grow.filter(k => now - k.t0 >= this.GROW.ms).map(k => k.g));
            V.grow = V.grow.filter(k => now - k.t0 < this.GROW.ms);
            this.settle(ctx, V, done, crossA);
            this.growing(fx, V, now, crossA);
        } else {
            for (const g of fresh) { V.present.delete(g); if (mode === 'pop') this._shown.delete(g); }
            this.compose(ctx, V, crossA, fresh.map(g => this.rectOf(g)));
            this.ringsFor(fresh, V);
        }
        // Грозди крестика меняют прозрачность — их участок пересобирается.
        if (crossA != null) this.compose(ctx, V, crossA, this.crossRect());
        // Закрылись целиком — на покров неподвижная пена с подложкой: под ним
        // сейчас закроется игра и оживёт комната, дыр между гроздьями быть
        // не должно. Проверка — ПОСЛЕ дорастания и всех пересборок этого
        // кадра: раньше она шла до них — в последнем кадре ещё видела
        // растущие грозди (а следующего кадра уже не было), потом участок
        // крестика пересобирался без подложки поверх; комната оживала под
        // покровом с тысячами дыр (проблески у игрока).
        const sealed = p >= 1 && (mode === 'close' || mode === 'finish') && !V.grow.length && V.i >= V.list.length;
        if (sealed && this._full && !V.sealed) {
            V.sealed = true;
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(this._full, 0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
        }
        this.rings(fx, V);
    },

    // ---------- ВСПУХАНИЕ ----------
    // Гроздь не выскакивает целиком, а за GROW.ms вырастает из GROW.from
    // размера и проявляется. Пока растёт, она на слое fx (он чистится каждый
    // кадр — прозрачность не копится), доросла — один раз ложится на холст
    // покрова. Выскакивание целиком давало рывки (замечание игрока): за
    // задержавшийся кадр выпрыгивало вдвое больше гроздей. Теперь грозди
    // просто растут дальше, сколько бы их ни пришло за кадр.
    GROW: { ms: 140, from: 0.75 },
    settle(ctx, V, list, crossA) {
        if (!list.length) return;
        const s = V.s, A = this._atlas;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const pass of ['d', 't']) for (const g of list) {
            const sl = g[pass];
            if (!sl || (g.cross && crossA != null)) continue;
            ctx.drawImage(A, sl.ax, sl.ay, sl.w, sl.h, sl.x0 * s, sl.y0 * s, sl.w * s, sl.h * s);
        }
        ctx.restore();
        for (const g of list) V.present.add(g);
    },
    growing(fx, V, now, crossA) {
        if (!fx || !V.grow.length) return;
        const s = V.s, A = this._atlas, G = this.GROW;
        fx.save();
        fx.setTransform(1, 0, 0, 1, 0, 0);
        for (const pass of ['d', 't']) for (const k of V.grow) {
            const g = k.g, sl = g[pass];
            if (!sl || (g.cross && crossA != null)) continue;
            const u = Math.min(1, (now - k.t0) / G.ms), e = 1 - (1 - u) * (1 - u);
            const z = G.from + (1 - G.from) * e;
            fx.globalAlpha = Math.min(1, e * 1.4);
            fx.drawImage(A, sl.ax, sl.ay, sl.w, sl.h,
                (g.x + (sl.x0 - g.x) * z) * s, (g.y + (sl.y0 - g.y) * z) * s, sl.w * z * s, sl.h * z * s);
        }
        fx.restore();
    },

    // Прогрев (MgVeil.prewarm): по точке из атласа и неподвижной пены — чтобы
    // их загрузка в видеокарту случилась в простое, а не в миг нажатия
    // (на iPhone перед первой заливкой была заметна пауза).
    veilWarm(ctx) {
        if (!this._atlas || !this._full) return false;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._atlas, 0, 0, 1, 1, 0, 0, 1, 1);
        ctx.drawImage(this._full, 0, 0, 1, 1, 1, 0, 1, 1);
        ctx.clearRect(0, 0, 4, 4);
        ctx.restore();
        return true;
    },

    // ---------- КОЛЬЦА ЛОПНУВШИХ ----------
    ringsFor(groups, V) {
        const now = performance.now(), R = this.RING;
        for (const g of groups) for (const b of g.deep.concat(g.top)) {
            if (b.r < R.minR || V.rings.length >= R.cap) continue;
            V.rings.push({ x: b.x, y: b.y, r: b.r, t0: now + Math.random() * 60 });
        }
    },

    // Кольца — на своём слое покрова (fx), он чистится каждый кадр.
    rings(fx, V) {
        if (!fx || !V.rings.length) return;
        const now = performance.now(), R = this.RING;
        fx.strokeStyle = this.pal().foam.hi;
        V.rings = V.rings.filter(k => now - k.t0 < R.ms);
        for (const k of V.rings) {
            const u = (now - k.t0) / R.ms;
            if (u < 0) continue;
            const e = 1 - (1 - u) * (1 - u);
            fx.globalAlpha = 0.85 * (1 - u) * (1 - u);
            fx.lineWidth = Math.max(0.5, k.r * 0.16 * (1 - u));
            fx.beginPath(); fx.arc(k.x, k.y, k.r * (1 + R.grow * e), 0, Math.PI * 2); fx.stroke();
        }
        fx.globalAlpha = 1;
    }
});
