// ================= ВАННАЯ: ПЕНА ВОКРУГ ОКНА =================
// Шкурка окна похоти (docs/plan/25-lust-foam-transition.md): рамка из плотной
// мультяшной пены по краю холста и крестик, проступающий в этой же пене.
// Пена здесь та, что ПРЯЧЕТ, — непрозрачная, мягкая, одной массой, а не
// стеклянные шарики с бликами, как на черве.
//
// Механизм окна общий (MinigameWindow.attach, опция skin), здесь только вид:
//   rim        — толщина рамки: бока и верх (низ окно выводит само из
//                уменьшения сцены);
//   cross      — где крестик и какого он размера (окно кладёт туда зону
//                нажатия);
//   bg         — цвет фона окна под рамкой;
//   draw(ctx, scale) — нарисовать рамку на холсте 390×844.
//
// ---------- ПЕНА — МАССА, А НЕ ГОРСТЬ ШАРИКОВ ----------
// Первый вариант (решение игрока — провал): крупные пузыри по отдельности
// поверх сплошной полосы цвета складки. Полоса читалась серой рамкой «под
// пеной», а пузыри — россыпью бусин. Теперь:
//   * никакой полосы нет. Масса — это объединение кругов всех пузырей
//     рамки, чуть увеличенных, залитое СВЕТЛЫМ цветом пены. Щелей между
//     пузырями поэтому нет, а внутренний край массы сам выходит волнистым;
//   * пузыри мелкие и тесные, контраст у них слабый: складка только по
//     нижней дуге, блик — маленькое матовое пятно. Глаз видит одну
//     пушистую массу, а уже в ней — пузырьки;
//   * фон окна под рамкой — тоже цвет пены (bg): если где-то у края
//     останется точка без пузыря, сквозь неё не проглянет тёмное.
//
// ---------- КРЕСТИК — ЧАСТЬ ПЕНЫ ----------
// Не выложенный по линейке ряд шариков (тоже провал первого варианта:
// читался кнопкой интерфейса), а ПОДКРАШЕННЫЕ пузыри из той же случайной
// массы: те, чей центр у одной из двух диагоналей, с шумом ширины. Размеры у
// них разные, стоят они неровно, и цвет — мягкий, в тон пене, сдвинутый в
// синеву, а не насыщенная синяя заливка.
//
// ---------- ОДНА РАСКЛАДКА НА ВЕСЬ ЭКРАН ----------
// Пузыри раскладываются от края; рамка — те, что у края (метка rim).
// Остальное понадобится переходу (этапы 3–4): он заливает экран этой же
// раскладкой и раскрывает её до рамки, поэтому последний кадр раскрытия и
// есть рамка. Середина экрана досыпается лениво (fillAll) — рамке она не
// нужна, а тысячи лишних пузырей при входе — лишнее время. Раскладка
// выводится из сида и одинакова при каждом заходе.
//
// ---------- КАК ДЁШЕВО ----------
// Пузырь — готовый спрайт своего радиуса (радиусы целые, спрайтов десяток на
// цвет), рамка — полторы тысячи drawImage один раз. В игре холст неподвижен
// и в кадре ничего не стоит.
const LustFoam = {
    SEED: 7331,
    // Толщина рамки в единицах холста. Верх толще: в нём лежит крестик.
    rim: { side: 16, top: 54 },
    // Крестик: центр там же, где была кнопка окна, но крупнее — пена даёт место.
    cross: { x: 360, y: 28, size: 40 },
    R_MIN: 3,
    R_MAX: 9,
    // Клетка сетки соседей не меньше дальности касания (2·R_MAX·k ≈ 14,4):
    // тогда проверять только 3×3 клетки, а не 5×5.
    CELL: 16,
    _list: null,
    _grid: null,
    _rng: null,
    _sprites: null,
    _spriteScale: 0,

    get bg() { return this.pal().foam[500]; },

    pal() { return PALETTE.bathScene; },

    // ---------- РАСКЛАДКА ----------
    // Бросание дротиков с сеткой соседей: пузырь встаёт, если не утонул в
    // соседях глубже, чем на долю радиуса. Перекрытие разрешено нарочно —
    // пена держится гроздьями, а не выложена плиткой. Крупные идут первыми,
    // мелкие потом добивают щели.
    PASSES: [
        { density: 0.10, rMin: 6.5, rMax: 9, k: 0.8 },
        { density: 0.30, rMin: 4.5, rMax: 6.5, k: 0.76 },
        { density: 0.50, rMin: 3, rMax: 4.5, k: 0.72 }
    ],

    // Насколько точка ВНЕ прямоугольника сцены (меньше нуля — внутри).
    outside(x, y) {
        const I = this.inner();
        return Math.max(I.x0 - x, x - I.x1, I.y0 - y, y - I.y1);
    },

    // Сыплет пузыри в прямоугольники rects ([x0, y0, x1, y1]). Площадь задаёт
    // число попыток: плотность у прохода — попыток на единицу площади.
    // Бросать по всему холсту и отсеивать середину было втрое дороже:
    // раскладка стоила 110 мс на компьютере — полсекунды на телефоне.
    scatter(rects) {
        const C = this.CELL, rng = this._rng;
        const grid = this._grid;
        const reach = Math.ceil(this.R_MAX * 2 * 0.8 / C);
        const fits = (x, y, r, k) => {
            const ci = Math.floor(x / C) + 1, cj = Math.floor(y / C) + 1;
            for (let j = cj - reach; j <= cj + reach; j++) {
                const row = grid[j];
                if (!row) continue;
                for (let i = ci - reach; i <= ci + reach; i++) {
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
        const put = (b) => {
            this._list.push(b);
            const i = Math.floor(b.x / C) + 1, j = Math.floor(b.y / C) + 1;
            const row = grid[j] || (grid[j] = []);
            (row[i] || (row[i] = [])).push(b);
        };
        for (const P of this.PASSES) for (const [x0, y0, x1, y1] of rects) {
            const tries = Math.round((x1 - x0) * (y1 - y0) * P.density);
            for (let n = 0; n < tries; n++) {
                const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
                let r = P.rMin + Math.pow(rng(), 1.4) * (P.rMax - P.rMin);
                // В квадрате крестика пузыри мельче: штрих в два-три пузыря
                // шириной читается линией, крупный пузырь рвал бы его.
                if (this.inCross(x, y)) r = Math.min(r, 3 + rng() * 2.4);
                if (fits(x, y, r, P.k)) put({ x, y, r });
            }
        }
    },

    inCross(x, y) {
        const C = this.cross, h = C.size / 2 + 6;
        return Math.abs(x - C.x) < h && Math.abs(y - C.y) < h;
    },

    // Пузыри полосы рамки (с запасом внутрь — для рваного края). Порядок
    // рисования — сверху вниз: нижний пузырь ложится на верхний, пена
    // «оседает», складки смотрят вниз.
    bubbles() {
        if (this._list) return this._list;
        this._list = [];
        this._grid = [];
        this._rng = btRng(this.SEED);
        const W = STAGE_W + 6, H = STAGE_H + 6, I = this.inner(), m = 12;
        // Четыре полосы рамки с запасом m внутрь. Середина досыпается потом
        // вокруг уже стоящих пузырей (сетка соседей общая) — без шва.
        this.scatter([
            [-6, -6, W, I.y0 + m],
            [-6, I.y1 - m, W, H],
            [-6, I.y0 + m, I.x0 + m, I.y1 - m],
            [I.x1 - m, I.y0 + m, W, I.y1 - m]
        ]);
        this.mark();
        return this._list;
    },

    // Метки: рамка и крестик. Внутрь сцены пузырь рамки выступает на
    // 0–0,6 радиуса — край рваный, но неглубокий.
    mark() {
        const rng = btRng(this.SEED ^ 0x5bd1);
        const C = this.cross, h = C.size / 2;
        for (const b of this._list) {
            if (b.rim == null) {
                const d = this.outside(b.x, b.y);
                b.rim = d > b.r * (-0.6 + rng() * 0.6);
            }
            // Крестик: близость к одной из диагоналей квадрата, ширина
            // полосы шумит у каждого пузыря, к концам сужается.
            const u = (b.x - C.x) / h, v = (b.y - C.y) / h;
            if (Math.abs(u) > 1.05 || Math.abs(v) > 1.05) { b.cross = false; continue; }
            const along = Math.max(Math.abs(u), Math.abs(v));
            const dist = Math.min(Math.abs(u - v), Math.abs(u + v)) / Math.SQRT2 * h;
            const w = (6.6 - along * 2) * (0.75 + rng() * 0.5);
            b.cross = b.rim && dist < w;
        }
        this._list.sort((a, b) => (a.y + a.r) - (b.y + b.r));
    },

    // Прямоугольник уменьшенной сцены — тем же счётом, что у окна
    // (MinigameWindow.skinGeometry): числа одни, расходиться им нельзя.
    inner() {
        return this._inner || (this._inner = MinigameWindow.skinGeometry(this).inner);
    },

    // ---------- СПРАЙТЫ ----------
    // Один пузырь на каждый целый радиус, в разрешении холста. Мягкий:
    // светлый центр, к краю едва темнеет; складка — только по нижней дуге,
    // полупрозрачная; блик — маленькое матовое пятно.
    sprites(scale) {
        if (this._sprites && this._spriteScale === scale) return this._sprites;
        const P = this.pal();
        const make = (r, F) => {
            const pad = 1.5, s = Math.ceil((r + pad) * 2 * scale);
            const c = document.createElement('canvas');
            c.width = c.height = s;
            const g = c.getContext('2d');
            g.scale(scale, scale);
            const o = r + pad;
            const body = g.createRadialGradient(o - r * 0.3, o - r * 0.35, r * 0.05, o, o, r);
            body.addColorStop(0, F.hi);
            body.addColorStop(0.62, F[500]);
            body.addColorStop(1, F.lo);
            g.fillStyle = body;
            g.beginPath(); g.arc(o, o, r, 0, Math.PI * 2); g.fill();
            // Складка — снизу и справа, где пузырь упирается в соседа.
            g.globalAlpha = 0.4;
            g.lineWidth = Math.max(0.5, r * 0.11);
            g.lineCap = 'round';
            g.strokeStyle = F.rim;
            g.beginPath(); g.arc(o, o, r * 0.94, -0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
            g.globalAlpha = 0.85;
            g.fillStyle = F.hi;
            g.beginPath();
            g.ellipse(o - r * 0.38, o - r * 0.42, r * 0.24, r * 0.16, -0.6, 0, Math.PI * 2);
            g.fill();
            return { c, o };
        };
        const out = { foam: [], cross: [] };
        for (let r = 1; r <= this.R_MAX + 1; r++) {
            out.foam[r] = make(r, P.foam);
            out.cross[r] = make(r, P.foamCross);
        }
        this._spriteScale = scale;
        return (this._sprites = out);
    },

    // ---------- РАМКА ----------
    // Холст окна уже в единицах 390×844 (масштаб на нём выставлен окном).
    // Сначала масса — объединение увеличенных кругов светлым цветом пены, с
    // мягкой тенью на сцену: по ней пена и лежит ПОВЕРХ картинки, а не
    // вырезана в ней. Потом пузыри.
    draw(ctx, scale) {
        const B = this.bubbles().filter(b => b.rim);
        const S = this.sprites(scale), P = this.pal();
        ctx.save();
        ctx.fillStyle = P.foam[500];
        ctx.shadowColor = P.foamShade;
        ctx.shadowBlur = 6 * scale;
        ctx.shadowOffsetY = 1.5 * scale;
        ctx.beginPath();
        for (const b of B) {
            const R = b.r * 1.15;
            ctx.moveTo(b.x + R, b.y);
            ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
        // Подкрашенные — вторым проходом, поверх соседей: иначе соседи,
        // упавшие ниже по порядку, закрывали половину штриха. Места и
        // размеры у них те же случайные, что у всей пены.
        for (const b of B.filter(q => !q.cross).concat(B.filter(q => q.cross))) {
            const r = Math.max(1, Math.round(b.r));
            const sp = (b.cross ? S.cross : S.foam)[r];
            const k = b.r / r;          // радиус дробный, спрайт — целый
            const d = sp.o * 2 * k;
            ctx.drawImage(sp.c, b.x - sp.o * k, b.y - sp.o * k, d, d);
        }
    }
};
