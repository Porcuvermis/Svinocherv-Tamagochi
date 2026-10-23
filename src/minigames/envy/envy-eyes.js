// ================= ЗАВИСТЬ: ГЛАЗА ВОКРУГ ОКНА =================
// Шкурка окна зависти (CLAUDE.md, инвариант 8; образец — пена похоти,
// docs/plan/25-lust-foam-transition.md): рамка из хаотично расставленных
// глаз — разного размера, под разным углом, внахлёст — и крестик, выложенный
// такими же глазами. Материал греха: за тобой наблюдают отовсюду.
//
// Глаз — чёрный миндаль с зелёной радужкой. Чёрный тот же, что фон окна,
// поэтому глаза сливаются друг с другом и с тьмой: где начинается и кончается
// форма, видно не всегда, и так задумано (оценка игрока). Контура у глаз НЕТ
// — зелёная обводка превращала рамку в россыпь листьев.
//
// Правила раскладки (оценка игрока):
//   * миндали могут налезать друг на друга только чёрным на чёрное: сначала
//     рисуются ВСЕ миндали, потом ВСЕ радужки — ни один глаз не закрывает
//     чужую радужку;
//   * радужки не ставятся близко друг к другу (IRIS_GAP — доля от суммы
//     радиусов), а радужка целиком лежит в рамке: ни на сцену, ни за край
//     холста она не выходит, поэтому в узких боках глаза мельче, наверху и
//     внизу крупнее.
//
// Механизм окна общий (MinigameWindow.attach, опция skin), здесь только вид:
//   rim, cross, bg, reach(), drawGen(ctx, scale) — как у LustFoam.
// Переход (veil*) — следующий этап: пока его нет, окно спрашивает «выйти?».
//
// Как дёшево: глаз — один путь и один градиент, их несколько десятков.
// Рисуются один раз генератором в простое (MinigameWindow.wearSkin), в кадре
// рамка неподвижна.
const EnvyEyes = {
    SEED: 4217,
    rim: { side: 16, top: 54 },
    cross: { x: 358, y: 28, size: 46 },
    CORNER: 26,
    // Миндали заходят в сцену не дальше этого: по числу окно нарезает рамку
    // на полосы (reach). Настоящий заход считается раскладкой.
    REACH_MAX: 60,
    // Цепочка вдоль кромки, по стороне (рисунок игрока): сверху и снизу —
    // несколько очень крупных глаз внахлёст и мелкие между ними, по бокам —
    // средние, почти вертикальные, впритык. big — доля крупных, L — длины,
    // off — сдвиг центра от кромки в долях полувысоты глаза (минус — в
    // рамку), jit — разброс угла от кромки, diag — доля диагональных.
    SIDES: {
        h: { big: 0.7, L: [56, 100], Ls: [24, 36], off: [-0.5, 0.25], jit: 0.4, diag: 0.3, step: 0.42 },
        v: { big: 0.25, L: [50, 66],  Ls: [32, 48], off: [-0.2, 0.9],   jit: 0.6,  diag: 0.2,  step: 0.47 }
    },
    // Шкалу зависти перекрывать нельзя (оценка игрока). Прямоугольник шкалы
    // в координатах тела окна (390×800) — тот же, что в envy.css
    // (.envy-gauge-wrap: left/right 7%, bottom 18px, height 18px), с запасом
    // KEEP_PAD. Поменял шкалу там — поменяй и здесь.
    KEEP: [{ x0: 27.3, y0: 764, x1: 362.7, y1: 782 }],
    KEEP_PAD: 5,
    // Чёрные наплывы по шву рамки и сцены: шаг, длины, сдвиг в полувысотах.
    SEAM: { step: [12, 22], L: [26, 46], off: [-0.3, 0.8] },
    // Мелкие глаза в чёрных просветах рамки — после цепочки.
    FILL: { tries: 250, L: [20, 28] },
    IRIS: 0.16,       // радиус радужки в долях длины глаза (рисунок игрока)
    IRIS_GAP: 2.4,    // центры радужек не ближе этого × сумма радиусов
    CELL: 40,
    YIELD: 1500,
    _eyes: null,

    get bg() { return this.pal().base; },
    pal() { return PALETTE.envyEyes; },
    reach() { return this._reach || this.REACH_MAX; },

    inner() {
        return this._inner || (this._inner = MinigameWindow.skinGeometry(this).inner);
    },

    // Расстояние до края сцены со скруглёнными углами: больше нуля — в рамке.
    edge(x, y) {
        const I = this.inner(), R = this.CORNER;
        const hx = (I.x1 - I.x0) / 2 - R, hy = (I.y1 - I.y0) / 2 - R;
        const px = Math.abs(x - (I.x0 + I.x1) / 2) - hx, py = Math.abs(y - (I.y0 + I.y1) / 2) - hy;
        return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - R;
    },

    inCross(x, y) {
        const C = this.cross, h = C.size / 2 + 13;
        return Math.abs(x - C.x) < h && Math.abs(y - C.y) < h;
    },

    rng() {
        let a = this.SEED >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    // ---------- РАСКЛАДКА ----------
    // Не дротики по всей рамке (вышло ровной россыпью — оценка игрока), а
    // цепочка вдоль каждой стороны сцены: глаз за глазом, повёрнутые по
    // кромке с разбросом, центр у самой кромки — миндаль заходит и в рамку,
    // и на сцену. Потом мелкие в чёрных просветах. Радужки не ближе
    // IRIS_GAP × сумма радиусов, и в крестик чужие радужки не лезут.
    *layoutGen() {
        const rng = this.rng(), eyes = [], grid = new Map();
        const key = (i, j) => i * 1000 + j;
        const fits = (x, y, r) => {
            const ci = Math.floor(x / this.CELL), cj = Math.floor(y / this.CELL);
            for (let i = ci - 2; i <= ci + 2; i++) {
                for (let j = cj - 2; j <= cj + 2; j++) {
                    for (const o of grid.get(key(i, j)) || []) {
                        if (Math.hypot(o.x - x, o.y - y) < this.IRIS_GAP * (o.r + r)) return false;
                    }
                }
            }
            return true;
        };
        const put = (eye) => {
            const kk = key(Math.floor(eye.x / this.CELL), Math.floor(eye.y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(eye);
        };
        const lerp = (a, t) => a[0] + (a[1] - a[0]) * t;
        for (const e of this.crossEyes()) put(e);

        // Стороны: начало, направление вдоль, нормаль В СЦЕНУ, длина пути.
        const I = this.inner();
        const sides = [
            { k: 'h', x: 0, y: I.y0, ux: 1, uy: 0, nx: 0, ny: 1, len: STAGE_W },
            { k: 'v', x: I.x1, y: I.y0 + 14, ux: 0, uy: 1, nx: -1, ny: 0, len: I.y1 - I.y0 - 28 },
            { k: 'h', x: STAGE_W, y: I.y1, ux: -1, uy: 0, nx: 0, ny: -1, len: STAGE_W },
            { k: 'v', x: I.x0, y: I.y1 - 14, ux: 0, uy: -1, nx: 1, ny: 0, len: I.y1 - I.y0 - 28 }
        ];
        let reach = 0;
        for (const S of sides) {
            const P = this.SIDES[S.k], tang = Math.atan2(S.uy, S.ux);
            let s = rng() * 10, prevL = 0;
            while (s < S.len) {
                const big = rng() < P.big;
                const L = lerp(big ? P.L : P.Ls, rng());
                s += prevL ? P.step * (prevL + L) : 0;
                if (s >= S.len) break;
                prevL = L;
                // угол от кромки: обычно вдоль с разбросом, иногда диагональ
                let rel = (rng() - 0.5) * 2 * P.jit;
                if (rng() < P.diag) rel = (rng() < 0.5 ? -1 : 1) * (0.55 + rng() * 0.4);
                const halfH = L * 0.26;
                const off = lerp(P.off, rng()) * halfH;
                const x = S.x + S.ux * s + S.nx * off, y = S.y + S.uy * s + S.ny * off;
                const r = L * this.IRIS;
                // сколько миндаль заходит в сцену поперёк кромки
                const into = off + Math.abs(Math.sin(rel)) * L / 2 + Math.abs(Math.cos(rel)) * halfH;
                if (into > this.REACH_MAX || this.inCross(x, y) || !fits(x, y, r)) continue;
                const eye = { x, y, w: L, r, ang: tang + rel };
                // Задел шкалу — не выбрасываем, а уводим глубже в рамку:
                // иначе низ оставался без крупных глаз.
                if (!this.pushOut(eye, S, halfH * 2) || !fits(eye.x, eye.y, r)) continue;
                eyes.push(eye);
                put(eye);
                reach = Math.max(reach, into);
            }
            yield;
        }

        // Шов: ровная кромка сцены не должна читаться между глазами. Вдоль
        // неё — чёрные миндали без радужки (глаза, закрытые соседями), центр
        // то в рамке, то на сцене: край массы становится бугристым.
        const SM = this.SEAM;
        for (const S of sides) {
            const tang = Math.atan2(S.uy, S.ux);
            for (let s = -6; s < S.len + 6; s += lerp(SM.step, rng())) {
                const L = lerp(SM.L, rng()), halfH = L * 0.26;
                const off = lerp(SM.off, rng()) * halfH;
                const lump = { x: S.x + S.ux * s + S.nx * off, y: S.y + S.uy * s + S.ny * off,
                               w: L, r: 0, ang: tang + (rng() - 0.5) * 0.7 };
                if (!this.pushOut(lump, S, halfH * 2)) continue;
                eyes.unshift(lump);
                reach = Math.max(reach, off + halfH * 1.3);
            }
        }
        yield;

        // Мелкие в просветах: радужка целиком в рамке.
        const F = this.FILL;
        for (let n = 0; n < F.tries; n++) {
            if (n % this.YIELD === this.YIELD - 1) yield;
            const x = rng() * STAGE_W, y = rng() * STAGE_H;
            const e = this.edge(x, y);
            if (e <= 0 || this.inCross(x, y)) continue;
            const w = lerp(F.L, rng()), r = w * this.IRIS;
            if (r > Math.min(e, x, y, STAGE_W - x, STAGE_H - y) - 2 || !fits(x, y, r)) continue;
            const eye = { x, y, w, r, ang: this.tangent(x, y) + (rng() - 0.5) * 1.4 };
            if (this.hitsKeep(x, y, w, eye.ang)) continue;
            eyes.push(eye);
            put(eye);
        }
        this._reach = Math.ceil(reach) + 2;
        return eyes;
    },

    // Направление кромки сцены рядом с точкой: у верха и низа горизонталь, у
    // боков вертикаль.
    // Те же прямоугольники в координатах холста: тело окна уменьшено в k
    // и сдвинуто в угол сцены (MinigameWindow.skinGeometry).
    keepRects() {
        if (this._keep) return this._keep;
        const G = MinigameWindow.skinGeometry(this), I = G.inner, p = this.KEEP_PAD;
        return (this._keep = this.KEEP.map(r => ({
            x0: I.x0 + r.x0 * G.k - p, y0: I.y0 + r.y0 * G.k - p,
            x1: I.x0 + r.x1 * G.k + p, y1: I.y0 + r.y1 * G.k + p })));
    },

    // Заходит ли глаз на шкалу. Миндаль лежит внутри эллипса с теми же
    // осями — проверка по эллипсу с запасом и дешёвая.
    hitsKeep(x, y, w, ang) {
        const a = w / 2, b = w * 0.27, c = Math.cos(ang), sn = Math.sin(ang);
        for (const R of this.keepRects()) {
            if (x + a < R.x0 || x - a > R.x1 || y + a < R.y0 || y - a > R.y1) continue;
            for (let i = 0; i < 20; i++) {
                const t = i / 20 * Math.PI * 2, ex = Math.cos(t) * a, ey = Math.sin(t) * b;
                const px = x + ex * c - ey * sn, py = y + ex * sn + ey * c;
                if (px > R.x0 && px < R.x1 && py > R.y0 && py < R.y1) return true;
            }
            if (x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1) return true;
        }
        return false;
    },

    // Сдвиг глаза от сцены в рамку (против нормали стороны S), пока он
    // задевает шкалу; не дальше max. false — так и не освободил.
    pushOut(e, S, max) {
        for (let d = 0; d <= max; d += 2) {
            if (!this.hitsKeep(e.x, e.y, e.w, e.ang)) return true;
            e.x -= S.nx * 2; e.y -= S.ny * 2;
        }
        return false;
    },

    tangent(x, y) {
        const I = this.inner();
        const dx = Math.max(I.x0 - x, x - I.x1, 0), dy = Math.max(I.y0 - y, y - I.y1, 0);
        return dx > dy ? Math.PI / 2 : 0;
    },

    // Глаза крестика: два ряда вдоль диагоналей, каждый глаз повёрнут по
    // своему штриху, чтобы штрих читался линией.
    crossEyes() {
        const C = this.cross, out = [], n = 5, half = C.size * 0.42;
        for (const dir of [1, -1]) {
            for (let i = 0; i < n; i++) {
                const t = (i / (n - 1)) * 2 - 1;
                out.push({ x: C.x + t * half, y: C.y + dir * t * half,
                           w: C.size * 0.5, r: C.size * 0.125, ang: dir > 0 ? Math.PI / 4 : -Math.PI / 4 });
            }
        }
        return out;
    },

    // ---------- ГЛАЗ ----------
    // Миндаль: две дуги между острыми уголками, высота ~0,52 длины — как на
    // рисунке игрока. Радужка — круг по центру с мягким бликом.
    almond(ctx, w) {
        const a = w * 0.26;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.bezierCurveTo(-w * 0.22, -a * 1.38, w * 0.22, -a * 1.38, w / 2, 0);
        ctx.bezierCurveTo(w * 0.22, a * 1.38, -w * 0.22, a * 1.38, -w / 2, 0);
        ctx.closePath();
    },

    // Миндаль — только чёрная заливка, без контура.
    body(ctx, e) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.ang);
        this.almond(ctx, e.w);
        ctx.fillStyle = this.pal().base;
        ctx.fill();
        ctx.restore();
    },

    // Радужка — плоский зелёный круг: без градиента, блика и свечения
    // (оценка игрока: только чёрное тело и плоский зелёный зрачок).
    iris(ctx, e) {
        if (!e.r) return;
        ctx.fillStyle = this.pal().iris;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
    },

    draw(ctx, scale) {
        for (const _ of this.drawGen(ctx, scale)) { /* до конца */ }
    },

    *drawGen(ctx, scale) {
        const P = this.pal();
        const job = this.layoutGen();
        let r = job.next();
        while (!r.done) { yield; r = job.next(); }
        const eyes = this._eyes || (this._eyes = r.value);
        // Тьма под глазами: всё вне сцены, но на 4 единицы глубже её края —
        // там, где глаза не легли, рамка не должна светиться сценой.
        ctx.save();
        ctx.fillStyle = P.base;
        ctx.beginPath();
        ctx.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        const I = this.inner(), e = 4;
        if (ctx.roundRect) ctx.roundRect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e, this.CORNER + e);
        else ctx.rect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e);
        ctx.fill('evenodd');
        ctx.restore();
        yield;
        // Сначала все чёрные формы, потом все радужки: чёрное на чёрном
        // сливается, а радужку чужой глаз закрыть не может.
        const cross = this.crossEyes();
        for (const eye of eyes) this.body(ctx, eye);
        yield;
        for (const eye of eyes) this.iris(ctx, eye);
        for (const eye of cross) this.iris(ctx, eye);
    }
};
