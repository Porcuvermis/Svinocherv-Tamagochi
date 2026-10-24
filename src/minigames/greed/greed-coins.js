// ================= АЛЧНОСТЬ: КУЧА МОНЕТ (шкурка окна) =================
// docs/plan/27-greed-skin.md. Монеты — готовые спрайты из двух атласов
// (coins-base.png, coins-shine.png), которые печёт tools/coin-atlas.js:
//   base  — монета в своей позе при обычном свете;
//   shine — только блик «монета поймала луч» (свет вдоль её оси).
// Два вида (gold, euro), в каждом — одни и те же позы: плашмя и наклоны.
//
// ---------- БЛЕСК ОТ НАКЛОНА, КАК ЭТО ДЁШЕВО ----------
// Свет один. Монеты лежат под разными углами; поворот телефона сдвигает
// «полувектор» H, и блестит та, чья ось n смотрит вдоль H: яркость =
// сглаженная ступенька от n·H. Перерисовывать все монеты нельзя (их тысячи),
// поэтому база рисуется ОДИН раз, а блик — отдельным холстом поверх, куда
// каждый раз попадают только монеты, которые сейчас ловят луч (десятки, не
// тысячи), режимом `lighter`. Холст блика перерисовывается, только когда
// наклон сдвинулся.
// Слоёв три (глубокий, средний, верхний), у каждого свой холст базы и блика,
// иначе блик нижней монеты просвечивал бы сквозь верхнюю.
const GreedCoins = {
    // ---------- позы: общий язык запекателя и игры ----------
    MAGS: [12, 22, 32],     // наклоны оси от вертикали, градусы
    AZ: 12,                 // сторон наклона на каждую величину
    ROLLS: 2,               // поворотов вокруг своей оси (цифра смотрит по-разному)
    CELL: 64,               // клетка атласа, px (монета радиусом 29 px = 14,5 ед. при 2×)
    RAD: 29,
    COLS: 16,
    KINDS: ['gold', 'euro'],

    // Все позы: сперва плашмя, затем наклоны. n — ось монеты в виде.
    poses() {
        if (this._poses) return this._poses;
        const D = Math.PI / 180, out = [];
        for (let r = 0; r < this.ROLLS; r++) out.push({ m: 0, az: 0, roll: r * 90, n: [0, 0, 1] });
        this.MAGS.forEach((m, mi) => {
            for (let a = 0; a < this.AZ; a++) for (let r = 0; r < this.ROLLS; r++) {
                const az = a * 360 / this.AZ + mi * 360 / this.AZ / 3;      // слои наклонов сдвинуты по азимуту
                out.push({ m, az, roll: (a * 53 + r * 180 + mi * 90) % 360,
                    n: [Math.sin(m * D) * Math.cos(az * D), Math.sin(m * D) * Math.sin(az * D), Math.cos(m * D)] });
            }
        });
        return (this._poses = out);
    },
    // Клетка (вид, поза) в атласе
    cell(kind, pose) {
        const i = this.KINDS.indexOf(kind) * this.poses().length + pose;
        return { sx: (i % this.COLS) * this.CELL, sy: Math.floor(i / this.COLS) * this.CELL };
    },

    // ---------- раскладка ----------
    // Слои: s — масштаб, gap — доля диаметра между центрами (меньше — плотнее),
    // dark — затемнение слоя, gain — сила блика на слое. Числа подобраны
    // на tools/coin-pile.js и приняты игроком (смесь 50/50, плотность «хорошая»).
    LAYERS: [
        { s: 0.82, gap: 0.8, dark: 0.5, gain: 0.35 },
        { s: 1.0, gap: 0.72, dark: 0.18, gain: 0.8 },
        { s: 1.0, gap: 0.95, dark: 0, gain: 1 }
    ],
    SEED: 4242,
    W: 780, H: 1688,        // холст куч в 2×; логические 390×844
    MIX: 0.5,               // доля евро

    // Возвращает три списка монет. Детерминированно от seed.
    layout(seed) {
        let st = (seed || this.SEED) >>> 0;
        const rng = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
        const P = this.poses().length, W = this.W, H = this.H;
        return this.LAYERS.map((L) => {
            const pts = [], cell = 40 * L.s, grid = {}, minD = 2 * this.RAD * L.s * L.gap;
            for (let t = 0; t < 30000; t++) {
                const x = rng() * (W + 40) - 20, y = rng() * (H + 40) - 20;
                const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
                let ok = true;
                for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2 && ok; j++) {
                    const q = grid[(gy + j) * 1000 + gx + i];
                    if (q) for (const o of q) if (Math.hypot(o.x - x, o.y - y) < minD) { ok = false; break; }
                }
                if (!ok) continue;
                const pose = Math.floor(rng() * P), p = this.poses()[pose];
                // Ось у каждой монеты чуть своя: спрайт тот же, а блеск наступает в свой момент.
                const jx = (rng() - 0.5) * 0.12, jy = (rng() - 0.5) * 0.12;
                const nn = Math.hypot(p.n[0] + jx, p.n[1] + jy, p.n[2]);
                const c = { x, y, kind: rng() < this.MIX ? 'euro' : 'gold', pose,
                    n: [(p.n[0] + jx) / nn, (p.n[1] + jy) / nn, p.n[2] / nn] };
                (grid[gy * 1000 + gx] = grid[gy * 1000 + gx] || []).push(c);
                pts.push(c);
            }
            pts.sort((a, b) => a.y - b.y);      // нижние чуть перекрывают верхние
            return pts;
        });
    },

    // ---------- рисование ----------
    // База слоя: монеты с тенью, затем затемнение всего слоя одним мазком
    // (source-atop красит только нарисованное).
    paintLayer(ctx, coins, L, atlas) {
        const C = this.CELL, s = L.s;
        for (const c of coins) {
            const { sx, sy } = this.cell(c.kind, c.pose);
            ctx.save();
            ctx.shadowColor = 'rgba(20,10,0,0.55)'; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 3 * s;
            ctx.drawImage(atlas, sx, sy, C, C, c.x - C / 2 * s, c.y - C / 2 * s, C * s, C * s);
            ctx.restore();
        }
        if (L.dark > 0) {
            ctx.save(); ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(40,20,0,' + L.dark + ')'; ctx.fillRect(0, 0, this.W, this.H);
            ctx.restore();
        }
    },

    // Свет по наклону телефона. t = {x, y} в −1..1 (Tilt.turn()).
    // Базовый сдвиг — свет чуть сверху-слева; K — как сильно поворот телефона
    // сдвигает луч: на полном наклоне (35°) луч проходит все наклоны монет.
    SHINE: { hx0: -0.1, hy0: 0.16, K: 0.62, inDeg: 4, outDeg: 11 },
    halfVector(t) {
        const S = this.SHINE, x = S.hx0 + t.x * S.K, y = S.hy0 - t.y * S.K, z = 1;
        const l = Math.hypot(x, y, z);
        return [x / l, y / l, z / l];
    },
    // Блик слоя: чистим холст и кладём только те монеты, что ловят луч.
    // Возвращает число зажжённых — для замеров.
    paintShine(ctx, coins, L, atlas, t, gain) {
        const S = this.SHINE, H = this.halfVector(t), C = this.CELL, s = L.s;
        const cIn = Math.cos(S.inDeg * Math.PI / 180), cOut = Math.cos(S.outDeg * Math.PI / 180);
        ctx.clearRect(0, 0, this.W, this.H);
        ctx.globalCompositeOperation = 'lighter';
        let lit = 0;
        for (const c of coins) {
            const a = c.n[0] * H[0] + c.n[1] * H[1] + c.n[2] * H[2];
            if (a <= cOut) continue;
            let k = (a - cOut) / (cIn - cOut); k = k >= 1 ? 1 : k * k * (3 - 2 * k);
            ctx.globalAlpha = k * L.gain * (gain === undefined ? 1 : gain);
            const { sx, sy } = this.cell(c.kind, c.pose);
            ctx.drawImage(atlas, sx, sy, C, C, c.x - C / 2 * s, c.y - C / 2 * s, C * s, C * s);
            lit++;
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        return lit;
    }
};
