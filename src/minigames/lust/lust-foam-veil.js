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
// ---------- КАК ДЁШЕВО ----------
// Пузырей на весь экран — тысяч десять; перерисовывать их каждый кадр
// нельзя. Поэтому вся пена рисуется ОДИН раз — «полная пена» во весь экран
// (fullGen, в простое после рамки), — а переход только показывает и прячет
// её кругами пузырей:
//   * заливка: грозди кадра (см. ниже) ложатся копиями из атласа;
//   * раскрытие и уход: лопнувшие стираются по своей форме, а живые соседи,
//     чьи края задела маска, тут же ложатся поверх целыми (popped); на месте
//     лопнувших пузырей раздаются и гаснут кольца, как у горки над хвостом.
//     Без этого пузыри исчезали «вырезанными» — с выкушенными полукругами
//     (замечание игрока).
// Холст покрова между кадрами не чистится — за кадр работы ровно столько,
// сколько появилось или лопнуло.
//
// Показывают и прячут не сами пузыри, а ГРОЗДИ (groupsGen): ~860 групп по
// ~13 соседних пузырей, каждая — одна картинка в атласе. Фронт поэтому из
// целых пузырей. До гроздей были «кляксы» — круги, вырезанные из полной
// пены: их край резал пузыри пополам, и фронт читался круглыми клочками
// (замечание игрока).
//
// Что стоило кадров (4× замедление, кадр без покрова ~21 мс): по пузырям
// (~900 кругов за кадр) — 100–250 мс; кляксы через clip — ~60; узор из
// полной пены (createPattern с масштабом) — ~60 мс, он пересчитывал всю
// картинку на каждой заливке; главное — РАЗРЕШЕНИЕ холста покрова: в
// полном 50–90 мс, в единичном 21–30. Поэтому в движении покров в
// единичном разрешении (MgVeil.MOTION_SCALE), а неподвижный — в полном (veilStill).
//
// ---------- ПОДМЕНЫ НЕ ВИДНО ----------
// Под покровом при раскрытии уже стоит окно со своей рамкой — той же
// раскладкой, теми же пузырями. Стёртое в покрове открывает окно, где на
// этом месте нарисовано то же самое; когда середина стёрта, покров
// снимается, и под ним — та же рамка. Отличается только крестик: в полной
// пене он белый (его не видно в общей массе), в рамке — синий. Покров над
// ним тает долями прозрачности, и синий проступает плавно.
Object.assign(LustFoam, {
    // Длительности ходов. Заливка — всегда одной длины и не мигом (игрок:
    // «экран моргнул пузырями — и уже готово»): игра под пеной всё равно
    // собирается ПОСЛЕ неё, а сама заливка должна успеть прочитаться.
    // Лопание — с запасом на кольца (POP_END).
    VEIL_MS: { cover: 480, reveal: 620, close: 380, clear: 560, burst: 220, pop: 340, finish: 320 },
    // Ходы лопания укладываются в эту долю хода: остаток — догорают кольца
    // последних лопнувших пузырей.
    POP_END: 0.85,
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

    // ---------- ПОЛНАЯ ПЕНА ----------
    // Весь экран: сплошная масса и оба слоя пузырей, рамка и середина
    // вместе. Крестик здесь БЕЛЫЙ — им он становится синим только в рамке.
    *fullGen(scale) {
        if (this._full && this._fullScale === scale) return;
        yield* this.insideGen();
        const L = this.layers(), In = this._inside, S = this.sprites(scale);
        const c = document.createElement('canvas');
        c.width = Math.round(STAGE_W * scale); c.height = Math.round(STAGE_H * scale);
        const g = c.getContext('2d');
        g.setTransform(scale, 0, 0, scale, 0, 0);
        g.fillStyle = this.massColor();
        g.fillRect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        yield;
        const byY = (a, b) => (a.y + a.r) - (b.y + b.r);
        let n = 0;
        for (const [list, sp] of [[L.deep.concat(In.deep).sort(byY), S.deep], [L.top.concat(In.top).sort(byY), S.top]]) {
            for (const b of list) {
                this.stamp(g, sp, b, 1);
                if (++n % this.STAMPS_PER_STEP === 0) yield;
            }
        }
        g.globalAlpha = 1;
        this._full = c;
        this._fullScale = scale;
    },

    // Окно гонит это в простое следом за рамкой (MinigameWindow.wearSkin).
    *prepareGen(scale) { yield* this.fullGen(scale); yield* this.groupsGen(); },

    // ---------- ГРОЗДИ ----------
    // Пена делится на грозди по ~13 соседних пузырей (ячейка GROUP_CELL со
    // сдвигом, пузырь — к ближайшему центру). Рамка и середина — порознь:
    // раскрытие трогает только середину. Картинка грозди — полная пена,
    // вырезанная по объединению кругов её пузырей (×GROUP_K, с массой между
    // ними), — лежит в общем атласе. На перекрытиях у соседних гроздей
    // одни и те же пиксели полной пены, поэтому собранные в любом порядке
    // они дают ровно полную пену: ни шва, ни подмены в конце заливки.
    GROUP_CELL: 20,
    GROUP_K: 1.2,
    ATLAS_W: 2048,

    *groupsGen() {
        if (this._groups) return;
        yield* this.fullGen(this._fullScale || 1);
        const C = this.GROUP_CELL, rng = btRng(this.SEED ^ 0x6b33);
        const gw = Math.ceil(STAGE_W / C) + 2, gh = Math.ceil(STAGE_H / C) + 2;
        // Центры гроздей: по одному на ячейку, со сдвигом.
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
        const put = (b, rim) => {
            const key = near(b) * 2 + (rim ? 1 : 0);
            let g = map.get(key);
            if (!g) map.set(key, g = { rim, list: [] });
            g.list.push(b);
        };
        for (const b of L.deep) { b.layer = 'deep'; put(b, true); }
        for (const b of L.top) { b.layer = 'top'; put(b, true); }
        for (const b of In.deep) { b.layer = 'deep'; put(b, false); }
        for (const b of In.top) { b.layer = 'top'; put(b, false); }
        yield;
        const groups = [...map.values()], K = this.GROUP_K;
        for (const g of groups) for (const b of g.list) b.grp = g;
        const nz = btRng(this.SEED ^ 0x1d07);
        for (const g of groups) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0;
            for (const b of g.list) {
                const R = b.r * K;
                x0 = Math.min(x0, b.x - R); y0 = Math.min(y0, b.y - R);
                x1 = Math.max(x1, b.x + R); y1 = Math.max(y1, b.y + R);
                sx += b.x; sy += b.y;
            }
            Object.assign(g, { x0: Math.floor(x0), y0: Math.floor(y0), w: Math.ceil(x1 - Math.floor(x0)) + 1,
                               h: Math.ceil(y1 - Math.floor(y0)) + 1,
                               x: sx / g.list.length, y: sy / g.list.length, nz: nz() * 2 - 1 });
        }
        // Атлас: полки по высоте, единица сцены — точка атласа (как покров в
        // движении, MgVeil.MOTION_SCALE).
        const order = groups.slice().sort((a, b) => b.h - a.h);
        let ax = 0, ay = 0, row = 0;
        for (const g of order) {
            if (ax + g.w > this.ATLAS_W) { ax = 0; ay += row + 1; row = 0; }
            g.ax = ax; g.ay = ay; ax += g.w + 1; row = Math.max(row, g.h);
        }
        const atlas = document.createElement('canvas');
        atlas.width = this.ATLAS_W; atlas.height = ay + row + 1;
        const a = atlas.getContext('2d'), full = this._full, fs = full.width / STAGE_W;
        let n = 0;
        for (const g of groups) {
            a.save();
            a.translate(g.ax - g.x0, g.ay - g.y0);
            a.beginPath();
            for (const b of g.list) {
                const R = b.r * K;
                a.moveTo(b.x + R, b.y);
                a.arc(b.x, b.y, R, 0, Math.PI * 2);
            }
            a.clip();
            a.drawImage(full, g.x0 * fs, g.y0 * fs, g.w * fs, g.h * fs, g.x0, g.y0, g.w, g.h);
            a.restore();
            if (++n % 60 === 0) yield;
        }
        // Соседи грозди — чужие пузыри, которые её маска задевает. Когда
        // гроздь лопается, её маска стирает и их края; живых соседей покров
        // тут же дорисовывает целыми (veil) — иначе оставались пузыри с
        // выкушенным полукругом (замечание игрока).
        const NC = 24, hash = new Map(), hk = (i, j) => i * 4096 + j;
        for (const g of groups) for (const b of g.list) {
            const k = hk(Math.floor(b.x / NC), Math.floor(b.y / NC));
            (hash.get(k) || hash.set(k, []).get(k)).push(b);
        }
        n = 0;
        for (const g of groups) {
            const seen = new Set();
            for (const b of g.list) {
                const ci = Math.floor(b.x / NC), cj = Math.floor(b.y / NC);
                for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
                    for (const q of hash.get(hk(i, j)) || []) {
                        if (q.grp === g || seen.has(q)) continue;
                        // Задет заметно, а не краешком: краешек под соседней
                        // массой не виден, а дорисовка стоит кадров.
                        if (Math.hypot(q.x - b.x, q.y - b.y) < b.r * K + q.r * 0.6) seen.add(q);
                    }
                }
            }
            g.near = [...seen].sort((a, c) => (a.layer === c.layer ? (a.y + a.r) - (c.y + c.r) : a.layer === 'deep' ? -1 : 1));
            if (++n % 80 === 0) yield;
        }
        this._atlas = atlas;
        this._groups = groups;
    },

    // ---------- ОЧЕРЁДНОСТЬ ----------
    // Ключ пузыря — расстояние до источника хода с шумом (nz): фронт рваный,
    // а не круг. Ход идёт по РАНГУ (доля p — доля пузырей), а не по
    // расстоянию: площадь нарастает ровно, без медленного хвоста в углах.
    all() {
        const L = this.layers(), In = this._inside;
        return L.deep.concat(L.top, In.deep, In.top);
    },
    // nz обязан быть у КАЖДОГО пузыря: NaN в ключе ломает сортировку целиком
    // (у спутников рамки его сначала не было — уход пены шёл вразнобой).
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
        const full = this._full;
        // Ходы нажатий продолжают то, что уже на покрове; остальные — с нуля.
        const keep = mode === 'burst' || mode === 'pop' || mode === 'finish';
        if (!keep) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
            this._shown = new Set();
        }
        this._shown = this._shown || new Set();
        // Раскрытие и закрытие — только грозди середины: рамка под покровом
        // уже стоит в окне (на последнем кадре раскрытия покров снимается
        // целиком, и под ним та же рамка).
        const G = this._groups, mid = G.filter(g => !g.rim);
        let list;
        if (mode === 'cover') {
            const F = this.foci();
            list = this.order(G, g => Math.min(...F.map(f => Math.hypot(g.x - f.x, g.y - f.y))));
        } else if (mode === 'reveal') {
            list = this.order(mid, this.fromCenter());
        } else if (mode === 'close') {
            list = this.order(mid, this.fromCenter(), true);
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
            list = this.order(mid.filter(g => !this._shown.has(g) && hit(g)),
                g => Math.min(...P.map(c => Math.hypot(g.x - c.x, g.y - c.y) / c.r)));
            for (const g of list) this._shown.add(g);
        } else if (mode === 'pop') {
            list = this.order([...this._shown], () => 1);
        } else if (mode === 'finish') {
            // Пена дорастает от уже брошенных гроздей.
            const S = [...this._shown];
            list = this.order(mid.filter(g => !this._shown.has(g)),
                S.length ? g => Math.min(...S.map(q => Math.hypot(g.x - q.x, g.y - q.y))) : this.fromCenter(), false);
        } else {
            list = this.order(G, this.fromCenter());
        }
        if (mode === 'reveal' || mode === 'clear') ctx.drawImage(full, 0, 0, STAGE_W, STAGE_H);
        const L = this.layers();
        // s — точек покрова на единицу сцены: круги кладутся в точках холста
        // при тождественном преобразовании (покров бывает мельче полной пены —
        // MgVeil.MOTION_SCALE).
        const s = ctx.canvas.width / STAGE_W;
        const rank = new Map();
        list.forEach((g, i) => rank.set(g, i));
        this._v = { mode, list, rank, i: 0, cross: 0, s, sp: this.sprites(s), popped: new Set(),
                    rings: (this._v && this._v.rings) || [],
                    crossList: L.deep.concat(L.top).filter(b => b.cross) };
    },

    // Покров стоит, пока игра дозревает: полная пена в полном разрешении.
    veilStill(ctx) {
        if (this._full) ctx.drawImage(this._full, 0, 0, STAGE_W, STAGE_H);
    },

    // ---------- ЛОПАНИЕ ----------
    // Гроздь лопнула: живые соседи, чьи края задела её маска, ложатся
    // поверх целыми пузырями, а на месте её пузырей вспыхивают кольца.
    // Живой — тот, чья гроздь ещё на покрове: в ходе 'pop' это брошенные
    // нажатием (_shown), в остальных — не лопнувшие в этом ходе.
    // Сосед, чья гроздь сама лопнет в ближайшие POP_AHEAD хода, не
    // дорисовывается: он исчезнет через кадр-другой, а дорисовка всех
    // соседей подряд стоила 30–40 мс кадра под 4× замедлением.
    POP_AHEAD: 0.1,
    RESTAMP_CAP: 150,
    popped(ctx, fresh, V, mode) {
        const soon = V.i + V.list.length * this.POP_AHEAD;
        const alive = (g) => {
            if (mode === 'pop' ? !this._shown.has(g) : V.popped.has(g)) return false;
            const r = V.rank.get(g);
            return r == null || r > soon;
        };
        const seen = new Set();
        for (const g of fresh) for (const b of g.near) if (!seen.has(b) && alive(b.grp)) seen.add(b);
        // Не больше RESTAMP_CAP за кадр, крупные первыми: у мелкого пузыря
        // выкушенный край почти не виден. Порядок рисования — как в полной
        // пене: глубокий слой под верхним, сверху вниз.
        let todo = [...seen];
        if (todo.length > this.RESTAMP_CAP) todo = todo.sort((a, c) => c.r - a.r).slice(0, this.RESTAMP_CAP);
        todo.sort((a, c) => (a.layer === c.layer ? (a.y + a.r) - (c.y + c.r) : a.layer === 'deep' ? -1 : 1));
        for (const b of todo) this.stamp(ctx, b.layer === 'top' ? V.sp.top : V.sp.deep, b, 1);
        ctx.globalAlpha = 1;
        const now = performance.now(), R = this.RING;
        for (const g of fresh) for (const b of g.list) {
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
    },

    // Путь из кругов. s — множитель координат: 1 в единицах сцены, scale —
    // в пикселях холста (при тождественном преобразовании).
    discs(ctx, list, k, s) {
        s = s || 1;
        ctx.beginPath();
        for (const b of list) {
            const R = b.r * k * s, x = b.x * s, y = b.y * s;
            ctx.moveTo(x + R, y);
            ctx.arc(x, y, R, 0, Math.PI * 2);
        }
    },

    veil(ctx, mode, p, scale, fx) {
        const V = this._v, full = this._full;
        if (!V || V.mode !== mode || !full || !this._atlas) return;
        const add = mode === 'cover' || mode === 'close' || mode === 'burst' || mode === 'finish';
        const q = add ? p : Math.min(1, p / this.POP_END);
        const upto = q >= 1 ? V.list.length : Math.floor(q * V.list.length);
        const fresh = V.list.slice(V.i, upto);
        V.i = upto;
        if (mode === 'pop') for (const g of fresh) this._shown.delete(g);
        for (const g of fresh) V.popped.add(g);
        if (fresh.length) {
            // Гроздь — одна копия из атласа: появилась — кладётся, лопнула —
            // стирается по своей же форме (destination-out берёт альфу
            // картинки: уходят ровно её пузыри).
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            if (!add) ctx.globalCompositeOperation = 'destination-out';
            const s = V.s, A = this._atlas;
            for (const g of fresh) ctx.drawImage(A, g.ax, g.ay, g.w, g.h, g.x0 * s, g.y0 * s, g.w * s, g.h * s);
            ctx.restore();
            if (!add) this.popped(ctx, fresh, V, mode);
        }
        this.rings(fx, V);
        // Крестик: при раскрытии покров над ним тает (под ним синий крестик
        // рамки), при закрытии белая пена ложится на него обратно. Доля
        // прозрачности за кадр — такая, чтобы в сумме вышло ровно p.
        if ((mode === 'reveal' || mode === 'close' || mode === 'finish') && V.crossList.length && p > V.cross) {
            const a = (p - V.cross) / Math.max(1e-6, 1 - V.cross);
            V.cross = p;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = Math.min(1, a);
            this.discs(ctx, V.crossList, 1.25, V.s);
            if (mode === 'reveal') { ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); }
            else { ctx.clip(); ctx.drawImage(full, 0, 0, ctx.canvas.width, ctx.canvas.height); }
            ctx.restore();
        }
        if (p >= 1) {
            // Последний кадр — без дыр, что бы ни недорисовали круги.
            if (mode === 'cover' || mode === 'close' || mode === 'finish') {
                ctx.drawImage(full, 0, 0, STAGE_W, STAGE_H);
                this._shown.clear();
            }
            if (mode === 'clear' || mode === 'reveal' || (mode === 'pop' && !this._shown.size)) {
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.restore();
            }
        }
    }
});
