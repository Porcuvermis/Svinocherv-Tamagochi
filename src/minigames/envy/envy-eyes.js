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
    // Миндали заходят в сцену не дальше половины длины самого крупного:
    // по этому числу окно нарезает рамку на полосы.
    REACH: 36,
    // Проходы раскладки от крупных к мелким: длина глаза w, попыток tries.
    PASSES: [
        { tries: 500, wMin: 46, wMax: 66 },
        { tries: 900, wMin: 34, wMax: 46 },
        { tries: 900, wMin: 26, wMax: 34 },
        { tries: 1500, wMin: 19, wMax: 26 }
    ],
    IRIS: 0.17,       // радиус радужки в долях длины глаза
    IRIS_GAP: 2.4,    // центры радужек не ближе этого × сумма радиусов
    CELL: 40,
    YIELD: 1500,
    _eyes: null,

    get bg() { return this.pal().base; },
    pal() { return PALETTE.envyEyes; },
    reach() { return this.REACH; },

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
    // Дротики по рамке. Радужка целиком внутри рамки и на расстоянии от
    // соседних радужек; миндали при этом налезают друг на друга как угодно.
    *layoutGen() {
        const rng = this.rng(), eyes = [], grid = new Map();
        const key = (i, j) => i * 1000 + j;
        let step = 0;
        for (const P of this.PASSES) {
            for (let n = 0; n < P.tries; n++) {
                if (++step % this.YIELD === 0) yield;
                const x = rng() * STAGE_W, y = rng() * STAGE_H;
                const e = this.edge(x, y);
                if (e <= 0 || this.inCross(x, y)) continue;
                const w = P.wMin + rng() * (P.wMax - P.wMin), r = w * this.IRIS;
                // свободное место для радужки: до сцены и до края холста
                const room = Math.min(e, x, y, STAGE_W - x, STAGE_H - y) - 2;
                if (r > room) continue;
                const ci = Math.floor(x / this.CELL), cj = Math.floor(y / this.CELL);
                let ok = true;
                for (let i = ci - 1; i <= ci + 1 && ok; i++) {
                    for (let j = cj - 1; j <= cj + 1 && ok; j++) {
                        for (const o of grid.get(key(i, j)) || []) {
                            if (Math.hypot(o.x - x, o.y - y) < this.IRIS_GAP * (o.r + r)) { ok = false; break; }
                        }
                    }
                }
                if (!ok) continue;
                // Вдоль кромки с разбросом: так рамка выглядит выложенной, а не
                // насыпанной; четверть глаз — под любым углом, для хаоса.
                const tang = this.tangent(x, y);
                const ang = rng() < 0.25 ? rng() * Math.PI : tang + (rng() - 0.5) * 1.3;
                const eye = { x, y, w, r, ang };
                eyes.push(eye);
                const kk = key(ci, cj);
                if (!grid.has(kk)) grid.set(kk, []);
                grid.get(kk).push(eye);
            }
            yield;
        }
        return eyes;
    },

    // Направление кромки сцены рядом с точкой: у верха и низа горизонталь, у
    // боков вертикаль.
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
        if (!e.noHaze) {
            // Дымка: чуть светлее чёрного у зрачка, к краям — в ноль. Края
            // формы от этого растворяются в массе, а не режутся линией.
            ctx.clip();
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.w * 0.5);
            g.addColorStop(0, this.pal().haze);
            g.addColorStop(1, this.pal().base);
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = g;
            ctx.fillRect(-e.w / 2, -e.w / 2, e.w, e.w);
        }
        ctx.restore();
    },

    // Радужка: металлический градиент «светлее сверху-слева» и блик.
    iris(ctx, e) {
        const P = this.pal(), r = e.r;
        ctx.save();
        ctx.translate(e.x, e.y);
        const g = ctx.createLinearGradient(-r, -r, r, r);
        g.addColorStop(0, P.irisHi);
        g.addColorStop(0.45, P.iris);
        g.addColorStop(1, P.irisLo);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.glint;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.4, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
