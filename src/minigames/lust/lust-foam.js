// ================= ВАННАЯ: ПЕНА ВОКРУГ ОКНА =================
// Шкурка окна похоти (docs/plan/25-lust-foam-transition.md): рамка из плотной
// мультяшной пены по краю холста и крестик, выложенный пузырями той же пены.
// Пена здесь та, что ПРЯЧЕТ, — непрозрачная, матовая, с тёмными складками
// между пузырями, а не стеклянные шарики с бликами, как на черве.
//
// Механизм окна общий (MinigameWindow.attach, опция skin), здесь только вид:
//   rim        — толщина рамки: бока и верх (низ окно выводит само из
//                уменьшения сцены);
//   cross      — где крестик и какого он размера (окно кладёт туда зону
//                нажатия);
//   draw(ctx, inner) — нарисовать рамку на холсте 390×844, inner — край
//                уменьшенной сцены, внутрь которого пена не лезет.
//
// ---------- ОДНА РАСКЛАДКА НА ВЕСЬ ЭКРАН ----------
// Пузыри разложены по ВСЕМУ холсту, а рамка — только те из них, что у края
// (метка rim). Остальные нужны переходу: он заливает экран этой же
// раскладкой и раскрывает её до рамки, поэтому последний кадр раскрытия и
// есть рамка — подменять картинку не придётся. Раскладка выводится из сида и
// одинакова при каждом заходе.
//
// ---------- КАК ДЁШЕВО ----------
// Пузырь — готовый спрайт своего радиуса (радиусы целые, спрайтов десяток),
// рамка — тысяча с лишним drawImage один раз. В игре холст неподвижен и в
// кадре ничего не стоит.
const LustFoam = {
    SEED: 7331,
    // Толщина рамки в единицах холста. Верх толще: в нём лежит крестик.
    rim: { side: 16, top: 54 },
    // Крестик: центр там же, где была кнопка окна, но крупнее — пена даёт место.
    cross: { x: 360, y: 28, size: 42 },
    R_MIN: 5,
    R_MAX: 16,
    _bubbles: null,
    _sprites: null,
    _spriteScale: 0,

    pal() { return PALETTE.bathScene; },

    // ---------- РАСКЛАДКА ----------
    // Бросание дротиков с сеткой соседей: пузырь встаёт, если не утонул в
    // соседях глубже, чем на долю радиуса. Перекрытие разрешено нарочно —
    // пена держится гроздьями, а не выложена плиткой. Крупные идут первыми,
    // мелкие потом добивают щели.
    bubbles() {
        if (this._bubbles) return this._bubbles;
        const rng = btRng(this.SEED);
        const W = STAGE_W, H = STAGE_H, CELL = 24;
        const gw = Math.ceil(W / CELL) + 1, gh = Math.ceil(H / CELL) + 1;
        const grid = Array.from({ length: gw * gh }, () => []);
        const list = [];
        const fits = (x, y, r, k) => {
            const i0 = Math.max(0, ((x - this.R_MAX * 2) / CELL) | 0), i1 = Math.min(gw - 1, ((x + this.R_MAX * 2) / CELL) | 0);
            const j0 = Math.max(0, ((y - this.R_MAX * 2) / CELL) | 0), j1 = Math.min(gh - 1, ((y + this.R_MAX * 2) / CELL) | 0);
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                for (const b of grid[j * gw + i]) {
                    const dx = b.x - x, dy = b.y - y, m = (b.r + r) * k;
                    if (dx * dx + dy * dy < m * m) return false;
                }
            }
            return true;
        };
        const put = (b) => {
            list.push(b);
            const i = Math.max(0, Math.min(gw - 1, (b.x / CELL) | 0)), j = Math.max(0, Math.min(gh - 1, (b.y / CELL) | 0));
            grid[j * gw + i].push(b);
        };
        // Крестик — первым: пена складывается вокруг него, а не он поверх
        // неё. Две диагонали, пузыри внахлёст, чтобы линия читалась
        // сплошной, к концам чуть мельче — как мазок.
        const C = this.cross, half = C.size / 2;
        for (const [sx, sy] of [[1, 1], [1, -1]]) {
            const n = 7;
            for (let i = 0; i < n; i++) {
                const t = i / (n - 1) * 2 - 1;
                const r = 6 - Math.abs(t) * 1.2;
                if (sy < 0 && i === (n - 1) / 2) continue;   // центр уже лёг первой линией
                put({ x: C.x + t * half * sx, y: C.y + t * half * sy, r, cross: true });
            }
        }
        // Три прохода от крупных к мелким. k — насколько можно утонуть в
        // соседе: у крупных меньше (держат форму), мелкие лезут в щели.
        const passes = [
            { tries: 9000, rMin: 11, rMax: this.R_MAX, k: 0.78 },
            { tries: 14000, rMin: 7, rMax: 11, k: 0.74 },
            { tries: 18000, rMin: this.R_MIN, rMax: 7, k: 0.7 }
        ];
        for (const P of passes) {
            for (let n = 0; n < P.tries; n++) {
                const r = P.rMin + Math.pow(rng(), 1.6) * (P.rMax - P.rMin);
                const x = -4 + rng() * (W + 8), y = -4 + rng() * (H + 8);
                if (fits(x, y, r, P.k)) put({ x, y, r, cross: false });
            }
        }
        // Порядок рисования: сверху вниз, поэтому нижний пузырь ложится на
        // верхний — пена «оседает», тени падают вниз, как у пены на черве.
        list.sort((a, b) => (a.y + a.r) - (b.y + b.r));
        this.markRim(list, rng);
        return (this._bubbles = list);
    },

    // Рамка — пузыри, чей центр у края. Внутрь сцены пузырь выступает не
    // больше чем на половину радиуса (±шум), поэтому внутренний край рваный,
    // но заходит в сцену лишь на 3–8 единиц, а не на целый пузырь.
    markRim(list, rng) {
        const I = this.inner();
        for (const b of list) {
            // Насколько центр ВНЕ прямоугольника сцены (меньше нуля — внутри).
            const d = Math.max(I.x0 - b.x, b.x - I.x1, I.y0 - b.y, b.y - I.y1);
            b.rim = b.cross || d > b.r * (0.35 + rng() * 0.3);
        }
    },

    // Прямоугольник уменьшенной сцены — тем же счётом, что у окна
    // (MinigameWindow.skinGeometry): числа одни, расходиться им нельзя.
    inner() {
        return MinigameWindow.skinGeometry(this).inner;
    },

    // ---------- СПРАЙТЫ ----------
    // Один пузырь на каждый целый радиус, в разрешении холста. Тело плотное,
    // книзу темнеет к цвету складки; обводка тонкая; блик маленький и
    // матовый — «не супер блестючие».
    sprites(scale) {
        if (this._sprites && this._spriteScale === scale) return this._sprites;
        const P = this.pal();
        const make = (r, F) => {
            const pad = 2, s = Math.ceil((r + pad) * 2 * scale);
            const c = document.createElement('canvas');
            c.width = c.height = s;
            const g = c.getContext('2d');
            g.scale(scale, scale);
            const o = r + pad;
            const body = g.createRadialGradient(o - r * 0.3, o - r * 0.35, r * 0.1, o, o, r);
            // Почти плоская заливка, темнеет только у самого края: шар с
            // объёмной растяжкой читался жемчугом, а пена — мультяшная.
            body.addColorStop(0, F[500]);
            body.addColorStop(0.72, F[500]);
            body.addColorStop(1, F.lo);
            g.fillStyle = body;
            g.beginPath(); g.arc(o, o, r, 0, Math.PI * 2); g.fill();
            g.lineWidth = Math.max(0.6, STROKE.hairline * (r / 8));
            g.strokeStyle = F.rim;
            g.stroke();
            // Блик: одно матовое пятнышко, не звезда и не кольцо.
            g.globalAlpha = 0.75;
            g.fillStyle = F.hi;
            g.beginPath();
            g.ellipse(o - r * 0.36, o - r * 0.4, r * 0.26, r * 0.17, -0.6, 0, Math.PI * 2);
            g.fill();
            return { c, o: o };
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
    // Сначала подложка — тёмные складки, по увеличенному кругу на каждый
    // пузырь: без неё между кругами просвечивала бы сцена. Потом пузыри.
    draw(ctx, scale) {
        const B = this.bubbles().filter(b => b.rim);
        const S = this.sprites(scale), P = this.pal();
        // Полоса рамки целиком — цветом складки: у самого края холста
        // пузыри стоят реже, и между ними просвечивала бы сцена.
        const I = this.inner();
        ctx.fillStyle = P.foam.rim;
        ctx.beginPath();
        ctx.rect(0, 0, STAGE_W, STAGE_H);
        // Подложка кончается РОВНО по краю сцены: там её прямой край совпадает
        // с краем картинки и не виден, а рваный край рисуют пузыри поверх.
        // Заход внутрь давал прямую светлую полосу по сцене, недоход —
        // тёмную щель фона окна.
        ctx.rect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0);
        ctx.fill('evenodd');
        ctx.beginPath();
        for (const b of B) {
            ctx.moveTo(b.x + b.r * 1.08, b.y);
            ctx.arc(b.x, b.y, b.r * 1.08, 0, Math.PI * 2);
        }
        ctx.fill();
        // Крестик — последним: соседи, отсортированные по высоте, иначе
        // ложились бы на его пузыри и рвали линию.
        B.sort((a, b) => (a.cross ? 1 : 0) - (b.cross ? 1 : 0));
        for (const b of B) {
            const r = Math.max(1, Math.round(b.r));
            const sp = (b.cross ? S.cross : S.foam)[r];
            const k = b.r / r;          // радиус дробный, спрайт — целый
            const d = sp.o * 2 * k;
            ctx.drawImage(sp.c, b.x - sp.o * k, b.y - sp.o * k, d, d);
        }
    }
};
