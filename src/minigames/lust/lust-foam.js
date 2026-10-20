// ================= ВАННАЯ: ПЕНА ВОКРУГ ОКНА =================
// Шкурка окна похоти (docs/plan/25-lust-foam-transition.md): рамка из плотной
// мультяшной пены по краю холста и крестик, проступающий в этой же пене.
// Пена здесь та, что ПРЯЧЕТ: густая, живая, слоями — как пена мочалки на
// черве, только плотнее.
//
// Механизм окна общий (MinigameWindow.attach, опция skin), здесь только вид:
//   rim        — толщина рамки: бока и верх (низ окно выводит само из
//                уменьшения сцены);
//   cross      — где крестик и какого он размера (окно кладёт туда зону
//                нажатия);
//   bg         — цвет фона окна под рамкой;
//   draw(ctx, scale) — нарисовать рамку на холсте 390×844.
//
// ---------- ЧТО НЕ ПОЛУЧИЛОСЬ И ПОЧЕМУ ТЕПЕРЬ ТАК ----------
// Версия 1: крупные пузыри поверх сплошной полосы цвета складки — полоса
// читалась серой рамкой «под пеной», пузыри — бусинами. Версия 2: масса из
// объединения кругов, мелкие пузыри — цельно, но «пластик»: каждый пузырь —
// непрозрачный шарик с растяжкой, и все в один слой. Оценки игрока.
//
// Пузырь теперь рисуется рецептом пены на черве (bath-art-wash.js, bubble;
// блик — lust-wash.js, glintStamp): тело ПОЛУПРОЗРАЧНОЕ, тень — толстая
// дуга снизу-справа, СВЕТЛАЯ КРОМКА по кругу (по ней пузырь и читается
// плёнкой, а не шаром), мягкий блик сверху-слева и слабый второй отблеск
// напротив. И слоёв два:
//   * глубокий — плотный, притенённый, держит массу;
//   * верхний — реже, светлее и прозрачнее, ложится поверх как попало;
//     сквозь его пузыри видны глубокие — это и есть наслоение живой пены.
// Под ними — масса: объединение кругов глубоких пузырей цветом пены в
// тени. Прямой подложки нет: геометрическая заливка стоит только глубже
// края массы и наружу не выходит никогда.
//
// ---------- ФОРМА РАМКИ ----------
// * Внутренние углы скруглены (CORNER): пена — аморфная масса, прямой угол
//   выглядел так, будто она изображает квадратную раму.
// * Пузыри крупнее у внешнего края и мельче к внутреннему — глубина t
//   (0 у края холста, 1 у края сцены) масштабирует размер, с разбросом.
// * У самого внутреннего края — бахрома из мелких полупрозрачных
//   пузырьков поверх сцены: пена истончается, а не обрывается.
// * Внутренний край НЕ ровный. Третья версия вышла «вырезанной ножницами»
//   (оценка игрока): все пузыри у края мелкие и выступают на одну и ту же
//   малую долю радиуса — силуэт повторял скруглённый прямоугольник.
//   Теперь граница гуляет плавным шумом (bulge: где-то масса выпирает в
//   сцену, где-то отступает), а у края изредка встаёт крупный «наглый»
//   пузырь (bold), который вылезает в сцену заметно дальше соседей.
//
// ---------- КРЕСТИК — ЧАСТЬ ПЕНЫ ----------
// Не выложенный по линейке ряд шариков (читался кнопкой интерфейса), а
// подкрашенные пузыри из той же случайной пены обоих слоёв: те, чей центр у
// одной из двух диагоналей, с шумом ширины. В квадрате крестика пузыри
// мельче, чтобы штрих читался линией. Цвет в тон пене, сдвинут в синеву.
//
// ---------- ОДНА РАСКЛАДКА НА ВЕСЬ ЭКРАН ----------
// Глубокий слой разложен так, что середину экрана потом можно досыпать
// вокруг стоящих пузырей (сетка соседей общая) — переход (этапы 3–4)
// заливает экран этой же раскладкой и раскрывает её до рамки. Раскладка
// выводится из сида и одинакова при каждом заходе.
//
// ---------- КАК ДЁШЕВО ----------
// Пузырь — готовый спрайт (вид × целый радиус), рамка — четыре тысячи
// drawImage один раз. В игре холст неподвижен и в кадре ничего не стоит.
// Но один раз — это ~1 с под 4× замедлением, поэтому рамка строится
// генератором (drawGen) кусками в простое после старта игры, а не при
// входе в ванную; тень массы — на холсте в четверть разрешения.
const LustFoam = {
    SEED: 7331,
    // Толщина рамки в единицах холста. Верх толще: в нём лежит крестик.
    rim: { side: 16, top: 54 },
    // Крестик: центр там же, где была кнопка окна, но крупнее — пена даёт место.
    cross: { x: 360, y: 28, size: 40 },
    CORNER: 26,
    R_MAX: 12,
    // Клетка сетки соседей не меньше дальности касания (2·R_MAX·k ≈ 19):
    // тогда проверять только 3×3 клетки.
    CELL: 20,
    // Проходы раскладки: от крупных к мелким. r — базовый радиус, его
    // масштабирует глубина (sizeAt). k — насколько можно утонуть в соседе:
    // крупные держат форму, мелкие лезут в щели.
    DEEP: [
        { density: 0.08, rMin: 6, rMax: 8.5, k: 0.8 },
        { density: 0.25, rMin: 4, rMax: 6, k: 0.76 },
        { density: 0.55, rMin: 2.5, rMax: 4, k: 0.72 }
    ],
    // Верхний слой реже и мельче; со своим слоем не слипается, с глубоким —
    // перекрывается как угодно.
    TOP: [
        { density: 0.03, rMin: 4.5, rMax: 7, k: 0.95 },
        { density: 0.06, rMin: 2.5, rMax: 4.5, k: 0.9 }
    ],
    _deep: null,
    _top: null,
    _sprites: null,
    _spriteScale: 0,

    get bg() { return this.pal().foam[500]; },

    pal() { return PALETTE.bathScene; },

    // ---------- ГЕОМЕТРИЯ ----------
    // Прямоугольник уменьшенной сцены — тем же счётом, что у окна
    // (MinigameWindow.skinGeometry): числа одни, расходиться им нельзя.
    inner() {
        return this._inner || (this._inner = MinigameWindow.skinGeometry(this).inner);
    },

    // Расстояние до края сцены со скруглёнными углами: больше нуля — в пене.
    edge(x, y) {
        const I = this.inner(), R = this.CORNER;
        const hx = (I.x1 - I.x0) / 2 - R, hy = (I.y1 - I.y0) / 2 - R;
        const px = Math.abs(x - (I.x0 + I.x1) / 2) - hx, py = Math.abs(y - (I.y0 + I.y1) / 2) - hy;
        return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - R;
    },

    // Глубина в рамке: 0 у края холста, 1 у края сцены (по ближней стороне).
    depth(x, y) {
        const I = this.inner(), W = STAGE_W, H = STAGE_H;
        return Math.max(0, Math.min(x / I.x0, (W - x) / (W - I.x1), y / I.y0, (H - y) / (H - I.y1)));
    },

    // Множитель размера от глубины: у внешнего края крупнее, к внутреннему
    // мельче. Не ровной лестницей — разброс оставляет и крупные внутри, и
    // мелкие снаружи.
    sizeAt(x, y, rng) {
        const t = Math.min(1, this.depth(x, y));
        return (1.35 - 0.65 * t) * (0.7 + rng() * 0.6);
    },

    // Плавный шум края: два слоя сглаженного шума по сетке, от 0 до amp.
    // Только ВНУТРЬ сцены: отступить пена не может — за краем сцены не
    // картинка, а плоский фон окна, и отступ открывал ровную полосу.
    BULGE: [{ cell: 70, amp: 13 }, { cell: 26, amp: 9 }, { cell: 11, amp: 4 }],
    bulge(x, y) {
        const h = (i, j) => {
            const s = Math.sin(i * 127.1 + j * 311.7 + this.SEED * 0.013) * 43758.5453;
            return (s - Math.floor(s)) * 2 - 1;
        };
        let v = 0;
        for (const o of this.BULGE) {
            const fx = x / o.cell, fy = y / o.cell, i = Math.floor(fx), j = Math.floor(fy);
            let u = fx - i, w = fy - j;
            u = u * u * (3 - 2 * u); w = w * w * (3 - 2 * w);
            const a = h(i, j) + (h(i + 1, j) - h(i, j)) * u;
            const c = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * u;
            v += (a + (c - a) * w + 1) / 2 * o.amp;
        }
        return v;
    },

    inCross(x, y) {
        const C = this.cross, h = C.size / 2 + 6;
        return Math.abs(x - C.x) < h && Math.abs(y - C.y) < h;
    },

    // ---------- РАСКЛАДКА ----------
    // Бросание дротиков с сеткой соседей по полосам рамки (rects): пузырь
    // встаёт, если не утонул в соседях глубже доли радиуса. Перекрытие
    // разрешено нарочно — пена держится гроздьями, а не плиткой. Бросать по
    // всему холсту и отсеивать середину было втрое дороже.
    // Генератор: отдаёт управление каждые YIELD попыток — раскладка строится
    // кусками в простое (см. «КАК ДЁШЕВО»), а не одним рывком.
    YIELD: 1500,
    *scatter(passes, rects, rng, layer) {
        let step = 0;
        const C = this.CELL, grid = layer.grid, list = layer.list;
        const fits = (x, y, r, k) => {
            const ci = Math.floor(x / C) + 1, cj = Math.floor(y / C) + 1;
            for (let j = cj - 1; j <= cj + 1; j++) {
                const row = grid[j];
                if (!row) continue;
                for (let i = ci - 1; i <= ci + 1; i++) {
                    const cell = row[i];
                    if (!cell) continue;
                    for (const b of cell) {
                        const dx = b.x - x, dy = b.y - y, m = (b.r + r) * k;
                        if (dx * dx + dy * dy < m * m) return false;
                    }
                }
            }
            return true;
        };
        for (const P of passes) for (const [x0, y0, x1, y1] of rects) {
            const tries = Math.round((x1 - x0) * (y1 - y0) * P.density);
            for (let n = 0; n < tries; n++) {
                if (++step % this.YIELD === 0) yield;
                const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
                let r = (P.rMin + Math.pow(rng(), 1.4) * (P.rMax - P.rMin)) * this.sizeAt(x, y, rng);
                // В квадрате крестика пузыри мельче: штрих в два-три пузыря
                // шириной читается линией, крупный пузырь рвал бы его.
                if (this.inCross(x, y)) r = Math.min(r, 2.6 + rng() * 2.4);
                // «Наглый» пузырь у внутреннего края: крупный, вопреки
                // правилу «к сцене мельче», и вылезает дальше соседей.
                const bold = layer.bold && this.depth(x, y) > 0.7 && !this.inCross(x, y) && rng() < 0.2;
                if (bold) r = 5.5 + rng() * 6.5;
                r = Math.min(this.R_MAX, r);
                if (!fits(x, y, r, P.k)) continue;
                const b = { x, y, r, bold };
                list.push(b);
                const i = Math.floor(x / C) + 1, j = Math.floor(y / C) + 1;
                const row = grid[j] || (grid[j] = []);
                (row[i] || (row[i] = [])).push(b);
            }
        }
    },

    // Полосы рамки с запасом m внутрь сцены (рваный край, скруглённые углы).
    bands() {
        // m — запас внутрь сцены: выпуклость края (BULGE) плюс наглый пузырь.
        const W = STAGE_W + 8, H = STAGE_H + 8, I = this.inner(), m = 42;
        return [
            [-8, -8, W, I.y0 + m],
            [-8, I.y1 - m, W, H],
            [-8, I.y0 + m, I.x0 + m, I.y1 - m],
            [I.x1 - m, I.y0 + m, W, I.y1 - m]
        ];
    },

    // Оба слоя рамки с метками. Порядок рисования внутри слоя — сверху
    // вниз: нижний пузырь ложится на верхний, пена «оседает».
    layers() {
        if (!this._deep) for (const _ of this.layersGen()) { /* до конца */ }
        return { deep: this._deep, top: this._top };
    },

    *layersGen() {
        if (this._deep) return;
        const deep = { list: [], grid: [], bold: true }, top = { list: [], grid: [] };
        yield* this.scatter(this.DEEP, this.bands(), btRng(this.SEED), deep);
        yield* this.scatter(this.TOP, this.bands(), btRng(this.SEED ^ 0x2f17), top);
        const mr = btRng(this.SEED ^ 0x5bd1);
        let k = 0;
        for (const b of deep.list) {
            if (++k % 400 === 0) yield;
            // d — где пузырь относительно края пены с учётом выпуклостей.
            b.d = this.edge(b.x, b.y) + this.bulge(b.x, b.y);
            // Внутрь сцены глубокий пузырь выступает на 0,2–1,0 радиуса,
            // наглый — на 0,6–1,5. Выступающие — бахрома.
            const out = b.bold ? 0.6 + mr() * 0.9 : 0.2 + mr() * 0.8;
            b.rim = b.d > -b.r * out;
            // В массу входят и слегка выступающие: силуэт массы и есть край
            // рамки, а полупрозрачная бахрома его почти не меняет.
            b.core = b.d > -b.r * 0.1 || (b.bold && b.rim);
            b.cross = this.crossHit(b, mr);
        }
        for (const b of top.list) {
            if (++k % 400 === 0) yield;
            b.d = this.edge(b.x, b.y) + this.bulge(b.x, b.y);
            // Верхний слой — только по массе, не на бахроме.
            b.rim = b.d > b.r * 0.4;
            b.cross = this.crossHit(b, mr);
        }
        this.satellites(deep.list.filter(b => b.bold && b.rim), deep.list, mr);
        yield;
        const byY = (a, b) => (a.y + a.r) - (b.y + b.r);
        this._deep = deep.list.filter(b => b.rim).sort(byY);
        this._top = top.list.filter(b => b.rim).sort(byY);
    },

    // Гроздь у наглого пузыря: 1–3 мелких пузырька прилипают к нему со
    // стороны сцены — край пены рассыпается крошками, а не обрывается
    // одиночным шаром. Сторона сцены — против роста edge (численная
    // производная). В массу они не входят: бахрома, прозрачность по d.
    satellites(bold, list, rng) {
        for (const b of bold) {
            const gx = this.edge(b.x + 1, b.y) - this.edge(b.x - 1, b.y);
            const gy = this.edge(b.x, b.y + 1) - this.edge(b.x, b.y - 1);
            const base = Math.atan2(-gy, -gx);
            const n = 1 + Math.floor(rng() * 3);
            for (let i = 0; i < n; i++) {
                const a = base + (rng() - 0.5) * 2.2;
                const r = 1.6 + rng() * 2.2;
                const dist = b.r + r * (0.55 + rng() * 0.35);
                const s = { x: b.x + Math.cos(a) * dist, y: b.y + Math.sin(a) * dist, r, rim: true, core: false };
                s.d = this.edge(s.x, s.y) + this.bulge(s.x, s.y);
                s.cross = false;
                list.push(s);
            }
        }
    },

    // Крестик: близость к одной из диагоналей квадрата, ширина штриха шумит
    // у каждого пузыря и к концам сужается.
    crossHit(b, rng) {
        const C = this.cross, h = C.size / 2;
        const u = (b.x - C.x) / h, v = (b.y - C.y) / h;
        const w = rng();
        if (Math.abs(u) > 1.05 || Math.abs(v) > 1.05) return false;
        const along = Math.max(Math.abs(u), Math.abs(v));
        const dist = Math.min(Math.abs(u - v), Math.abs(u + v)) / Math.SQRT2 * h;
        return dist < (6.4 - along * 2) * (0.75 + w * 0.5);
    },

    // ---------- СПРАЙТЫ ----------
    // Рецепт пузыря пены на черве (см. шапку). Виды:
    //   deep — глубокий: плотнее, притенён, кромка и блик приглушены;
    //   top  — верхний: прозрачнее, светлее, яркая кромка, блик со вторым
    //          отблеском.
    LOOK: {
        deep: { tint: 0.4, A: 0.92, shade: 0.55, rim: 0.55, glint: 0.55, second: 0 },
        top:  { tint: 0,    A: 0.6,  shade: 0.38, rim: 0.95, glint: 0.95, second: 0.35 }
    },

    sprites(scale) {
        if (this._sprites && this._spriteScale === scale) return this._sprites;
        const P = this.pal();
        const make = (r, F, L) => {
            const pad = 1, s = Math.ceil((r + pad) * 2 * scale);
            const c = document.createElement('canvas');
            c.width = c.height = s;
            const g = c.getContext('2d');
            g.scale(scale, scale);
            const o = r + pad;
            g.globalAlpha = L.A;
            g.fillStyle = L.tint ? mixColor(F[500], F.lo, L.tint) : F[500];
            g.beginPath(); g.arc(o, o, r, 0, Math.PI * 2); g.fill();
            // Тень снизу-справа (свет в игре сверху-слева): объём сказан ей.
            g.globalAlpha = L.shade;
            g.lineWidth = Math.max(0.6, r * 0.28);
            g.strokeStyle = F.lo;
            g.beginPath(); g.arc(o, o, r * 0.86, Math.PI * 0.05, Math.PI * 0.8); g.stroke();
            // Светлая кромка — плёнка пузыря.
            g.globalAlpha = L.rim;
            g.lineWidth = Math.max(0.5, r * 0.15);
            g.strokeStyle = F.hi;
            g.beginPath(); g.arc(o, o, r * 0.93, 0, Math.PI * 2); g.stroke();
            // Блик: мягкое пятно, сплющенное к кромке. У мелких не нужен —
            // в точку он превращается в шум.
            if (r >= 2.5) {
                const spot = (x, y, a, sq, alpha) => {
                    g.save();
                    g.translate(x, y); g.rotate(-0.85); g.scale(sq, 1);
                    const gr = g.createRadialGradient(0, 0, 0, 0, 0, a);
                    gr.addColorStop(0, F.hi); gr.addColorStop(0.45, F.hi);
                    gr.addColorStop(1, 'rgba(255,255,255,0)');
                    g.globalAlpha = alpha; g.fillStyle = gr;
                    g.beginPath(); g.arc(0, 0, a, 0, Math.PI * 2); g.fill();
                    g.restore();
                };
                spot(o - r * 0.3, o - r * 0.36, r * 0.3, 0.75, L.glint);
                if (L.second) spot(o + r * 0.48, o + r * 0.44, r * 0.14, 0.4, L.second);
            }
            return { c, o };
        };
        const out = {};
        for (const kind of ['deep', 'top']) {
            out[kind] = []; out[kind + 'X'] = [];
            for (let r = 1; r <= this.R_MAX + 1; r++) {
                out[kind][r] = make(r, P.foam, this.LOOK[kind]);
                out[kind + 'X'][r] = make(r, P.foamCross, this.LOOK[kind]);
            }
        }
        this._spriteScale = scale;
        return (this._sprites = out);
    },

    // ---------- ПЕРЕХОД (покров, src/core/mg-veil.js) ----------
    // ВРЕМЕННО (этап 3): покров — ровная пена, проявляется и тает
    // прозрачностью. Это проверка порядка входа и выхода; заливка из очагов,
    // раскрытие до рамки и лопание — этапы 4–5.
    VEIL_MS: { cover: 200, reveal: 350, close: 200, clear: 300 },
    veil(ctx, mode, p) {
        const a = mode === 'cover' || mode === 'close' ? p : 1 - p;
        ctx.globalAlpha = a * a * (3 - 2 * a);
        ctx.fillStyle = this.pal().foam[500];
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        ctx.globalAlpha = 1;
    },

    // Как далеко рисунок заходит внутрь прямоугольника сцены (единицы):
    // окно выводит рамку на экран полосами такой ширины. Запас — на тень.
    reach() {
        const I = this.inner(), L = this.layers();
        let m = 0;
        for (const b of L.deep.concat(L.top)) {
            const inside = Math.min(b.x - I.x0, I.x1 - b.x, b.y - I.y0, I.y1 - b.y);
            m = Math.max(m, inside + b.r * 1.12);
        }
        return Math.ceil(m + 8);
    },

    stamp(ctx, sp, b, alpha) {
        const r = Math.max(1, Math.round(b.r));
        const s = sp[r], k = b.r / r;          // радиус дробный, спрайт — целый
        const d = s.o * 2 * k;
        ctx.globalAlpha = alpha;
        ctx.drawImage(s.c, b.x - s.o * k, b.y - s.o * k, d, d);
    },

    // ---------- РАМКА ----------
    // Холст окна уже в единицах 390×844 (масштаб на нём выставлен окном).
    //
    // Тень массы на сцену. shadowBlur по пути из трёх тысяч кругов в полном
    // разрешении стоил 0,23 с под 4× замедлением. css-фильтр drop-shadow на
    // холсте рамки был бы бесплатным, будь он посчитан один раз, — но
    // браузер пересчитывал его каждый кадр, пока под рамкой что-то
    // двигалось: кадров становилось меньше, и блеск хвоста не успевал пройти
    // свою длину (test-lust-ripe). Поэтому тень — на маленьком холсте
    // (SHADOW_RES от разрешения рамки), где размытие дёшево, и растянута на
    // рамку: размытой тени резкость не нужна.
    SHADOW_RES: 0.25,
    shadowLayer(core, scale) {
        const P = this.pal(), k = Math.max(0.25, scale * this.SHADOW_RES);
        const c = document.createElement('canvas');
        c.width = Math.ceil(STAGE_W * k); c.height = Math.ceil(STAGE_H * k);
        const g = c.getContext('2d');
        // Сама фигура уезжает за холст, на месте остаётся только её тень.
        const off = STAGE_W * 2;
        g.setTransform(k, 0, 0, k, -off * k, 0);
        g.shadowColor = P.foamShade;
        g.shadowBlur = 6 * k;
        g.shadowOffsetX = off * k;
        g.shadowOffsetY = 1.5 * k;
        g.fillStyle = P.foam.lo;
        g.beginPath();
        for (const b of core) {
            const Rr = b.r * 1.12;
            g.moveTo(b.x + Rr, b.y);
            g.arc(b.x, b.y, Rr, 0, Math.PI * 2);
        }
        g.fill();
        return c;
    },

    draw(ctx, scale) {
        for (const _ of this.drawGen(ctx, scale)) { /* до конца */ }
    },

    // Рамка по кускам: раскладка, спрайты, масса, штампы пачками. Окно гонит
    // её в простое после старта игры (MinigameWindow.wearSkin): под 4×
    // замедлением целиком это ~1 с, и при входе в ванную такая пауза
    // стояла бы перед каждым первым кадром.
    STAMPS_PER_STEP: 300,
    *drawGen(ctx, scale) {
        yield* this.layersGen();
        const L = this.layers(), S = this.sprites(scale), P = this.pal();
        yield;
        const mass = mixColor(P.foam[500], P.foam.lo, 0.6);
        ctx.save();
        // Страховка от дыр в массе — заливка по форме рамки, но ГЛУБЖЕ края
        // массы на 4 единицы (выпуклости края только добавляют пены): наружу
        // её ровная кромка не выходит, а точка, где пузыря не хватило,
        // светится цветом пены, а не сценой.
        ctx.fillStyle = mass;
        ctx.beginPath();
        ctx.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        const I = this.inner(), e = 4;
        if (ctx.roundRect) ctx.roundRect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e, this.CORNER + e);
        else ctx.rect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e);
        ctx.fill('evenodd');
        ctx.restore();
        yield;
        // Масса — объединение кругов глубоких пузырей. Заливка пачками: цвет
        // один и непрозрачный, так что сумма пачек — то же объединение, а
        // один путь из трёх тысяч кругов заливался одним куском в 0,15 с.
        ctx.fillStyle = mass;
        const core = L.deep.filter(b => b.core);
        ctx.drawImage(this.shadowLayer(core, scale), 0, 0, STAGE_W, STAGE_H);
        yield;
        for (let i = 0; i < core.length; i += 500) {
            ctx.beginPath();
            for (const b of core.slice(i, i + 500)) {
                const Rr = b.r * 1.12;
                ctx.moveTo(b.x + Rr, b.y);
                ctx.arc(b.x, b.y, Rr, 0, Math.PI * 2);
            }
            ctx.fill();
            yield;
        }
        // Бахрома глубокого слоя (выступает в сцену) — прозрачнее, чем ближе
        // к краю сцены: пена истончается.
        const fringe = (b) => b.d >= b.r * 0.6 || b.bold ? 1
            : 0.6 + 0.4 * Math.max(0, (b.d + b.r * 0.9) / (b.r * 1.5));
        // Подкрашенные — после своих соседей по слою, иначе соседи, упавшие
        // ниже по порядку, закрывали половину штриха.
        const order = [];
        for (const [list, kind] of [[L.deep, 'deep'], [L.top, 'top']]) {
            for (const b of list) if (!b.cross) order.push([b, S[kind], kind]);
            for (const b of list) if (b.cross) order.push([b, S[kind + 'X'], kind]);
        }
        let n = 0;
        for (const [b, sp, kind] of order) {
            this.stamp(ctx, sp, b, kind === 'deep' ? fringe(b) : 1);
            if (++n % this.STAMPS_PER_STEP === 0) yield;
        }
        ctx.globalAlpha = 1;
    }
};
