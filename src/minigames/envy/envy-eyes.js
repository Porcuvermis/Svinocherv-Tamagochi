// ================= ЗАВИСТЬ: ГЛАЗА ВОКРУГ ОКНА =================
// Шкурка окна зависти (CLAUDE.md, инвариант 8; образец — пена похоти,
// docs/plan/25-lust-foam-transition.md): рамка из хаотично расставленных
// глаз — разного размера, под разным углом, внахлёст — и крестик, выложенный
// такими же глазами. Материал греха: за тобой наблюдают отовсюду.
//
// Глаз — чёрный миндаль с зелёной радужкой. Чёрный тот же, что фон окна,
// поэтому соседние глаза сливаются в одну тьму, а читаются радужки и тонкий
// зелёный контур, который у каждого следующего глаза перекрывает контур
// предыдущего. Без контура рамка превращалась в россыпь зелёных точек.
//
// Механизм окна общий (MinigameWindow.attach, опция skin), здесь только вид:
//   rim, cross, bg, reach(), drawGen(ctx, scale) — как у LustFoam.
// Переход (veil*) — следующий этап: пока его нет, окно спрашивает «выйти?».
//
// Как дёшево: глаз — один путь и один градиент, их ~250. Рисуются один раз
// генератором в простое (MinigameWindow.wearSkin), в кадре рамка неподвижна.
const EnvyEyes = {
    SEED: 4217,
    rim: { side: 16, top: 54 },
    cross: { x: 358, y: 28, size: 46 },
    CORNER: 26,
    // Глаза заходят в сцену не дальше этого (половина длины самого крупного):
    // по нему окно нарезает рамку на полосы.
    REACH: 24,
    // Проходы раскладки от крупных к мелким. w — длина глаза, gap — во
    // сколько раз (от суммы длин) можно сблизить центры: чем меньше, тем
    // плотнее нахлёст.
    PASSES: [
        { tries: 700,  wMin: 30, wMax: 46, gap: 0.34 },
        { tries: 1400, wMin: 20, wMax: 30, gap: 0.32 },
        { tries: 2400, wMin: 11, wMax: 18, gap: 0.30 }
    ],
    CELL: 30,
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
    // Дротики по всему холсту, в рамку попадает центр, что не дальше
    // небольшого захода в сцену. Сосед проверяется по сетке; нахлёст
    // разрешён нарочно — глаза должны громоздиться друг на друга.
    *layoutGen() {
        const rng = this.rng(), eyes = [], grid = new Map();
        const key = (i, j) => i * 1000 + j;
        let step = 0;
        for (const P of this.PASSES) {
            for (let n = 0; n < P.tries; n++) {
                if (++step % this.YIELD === 0) yield;
                const x = -8 + rng() * (STAGE_W + 16), y = -8 + rng() * (STAGE_H + 16);
                const e = this.edge(x, y);
                // центр — в рамке или чуть заходит в сцену (бахрома)
                if (e < -6 || this.inCross(x, y)) continue;
                // у внешнего края крупнее, к внутреннему мельче
                const w = P.wMin + rng() * (P.wMax - P.wMin);
                const ang = rng() * Math.PI * 2;
                const ci = Math.floor(x / this.CELL), cj = Math.floor(y / this.CELL);
                let ok = true;
                for (let i = ci - 1; i <= ci + 1 && ok; i++) {
                    for (let j = cj - 1; j <= cj + 1 && ok; j++) {
                        for (const o of grid.get(key(i, j)) || []) {
                            if (Math.hypot(o.x - x, o.y - y) < P.gap * (o.w + w)) { ok = false; break; }
                        }
                    }
                }
                if (!ok) continue;
                const eye = { x, y, w, ang, k: rng() };
                eyes.push(eye);
                const kk = key(ci, cj);
                if (!grid.has(kk)) grid.set(kk, []);
                grid.get(kk).push(eye);
            }
            yield;
        }
        return eyes;
    },

    // Глаза крестика: два ряда вдоль диагоналей, каждый глаз повёрнут по
    // своему штриху, чтобы штрих читался линией.
    crossEyes() {
        const C = this.cross, out = [], n = 5, half = C.size * 0.42;
        for (const dir of [1, -1]) {
            for (let i = 0; i < n; i++) {
                const t = (i / (n - 1)) * 2 - 1;
                out.push({ x: C.x + t * half, y: C.y + dir * t * half,
                           w: C.size * 0.5, ang: dir > 0 ? Math.PI / 4 : -Math.PI / 4, cross: true });
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

    eye(ctx, e) {
        const P = this.pal(), w = e.w;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.ang);
        this.almond(ctx, w);
        ctx.fillStyle = P.base;
        ctx.fill();
        ctx.lineWidth = e.cross ? 1.4 : Math.max(0.7, w * 0.035);
        // глаза крестика обведены яркой зелёной: на фоне хаоса он должен читаться
        ctx.strokeStyle = e.cross ? P.iris : P.contour;
        ctx.globalAlpha = e.cross ? 0.95 : 0.55 + 0.35 * e.k;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // радужка: металлический градиент «светлее сверху-слева»
        const r = w * (e.cross ? 0.2 : 0.165);
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
        let n = 0;
        for (const eye of eyes) {
            this.eye(ctx, eye);
            if (++n % 60 === 0) yield;
        }
        for (const eye of this.crossEyes()) this.eye(ctx, eye);
    }
};
