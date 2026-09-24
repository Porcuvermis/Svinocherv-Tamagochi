// ================= ВАННАЯ: ОБСТАНОВКА, НАРИСОВАННАЯ РУКОЙ =================
// Запекание из 3д (bath-baked.js) дало комнате правильную перспективу, но
// не дало ей жизни. Всё прямое в нём прямо по линейке, свет лежит полосами
// ступеней, кафель — сетка, расчерченная на миллиметровке. Комната читалась
// стерильной схемой, а не местом, где моются.
//
// Здесь обстановка перерисовывается РУКОЙ, по предмету за раз
// (docs/plan/21-lust-bath.md, разд. 8). Правило одно на все предметы:
// НАРОЧИТАЯ НЕРОВНОСТЬ. Ничто не стоит идеально ровно, ни один шов не идёт
// по линейке, ни одна плитка не повторяет соседнюю. Но неровность —
// ИЗ СИДА, а не из Math.random: картинка одна и та же при каждом открытии и
// не мигает.
//
// Чего здесь нет: чисел раскладки. Где стена, где кафель и какой у него
// шаг — берётся у запекания, иначе нарисованное разъехалось бы с гнёздами
// игры и с перспективой пола.

const BATH_ROOM = {

    // ---------- СТЕНА: КАФЕЛЬ, ПОЛОЖЕННЫЙ РУКОЙ ----------
    // Сетка — та же, что у запекания (шаг и начало берутся у его швов), но
    // каждый узел сетки сдвинут на пару единиц, а вся стена чуть «ведёт»
    // волной: так кладут плитку люди, а не программа. Швы идут ломаными
    // через узлы — плитка сама прямая, неровность живёт на стыках.
    //
    // Нижний ряд узлов НЕ сдвигается: по нему к стене примыкает пол, и там
    // обязан быть ровный стык.
    WALL_SEED: 7,
    // Больше этого швы читаются уже не небрежной кладкой, а кривой сеткой
    // из детского рисунка.
    JIT: 1.3,            // сдвиг узла сетки, единиц сцены
    SWAY: 2.0,           // волна всей стены

    grid() {
        if (this._grid) return this._grid;
        const B = BATH_BAKED, box = B.items.wall.box;
        const xs = [...new Set(B.tiles.filter(t => t[0] === t[2]).map(t => t[0]))].sort((a, b) => a - b);
        const ys = [...new Set(B.tiles.filter(t => t[1] === t[3]).map(t => t[1]))].sort((a, b) => a - b);
        const rnd = btRng(this.WALL_SEED);
        const bottom = ys[ys.length - 1];
        const node = [];
        for (let i = 0; i < xs.length; i++) {
            node.push([]);
            for (let j = 0; j < ys.length; j++) {
                const x = xs[i], y = ys[j];
                const edge = j === ys.length - 1;
                const jx = (rnd() - 0.5) * 2 * this.JIT, jy = (rnd() - 0.5) * 2 * this.JIT;
                node[i].push({
                    x: x + jx + this.SWAY * Math.sin(y * 0.011 + 1.7),
                    y: edge ? bottom : y + jy + this.SWAY * 0.7 * Math.sin(x * 0.009 + 0.4)
                });
            }
        }
        return (this._grid = { xs, ys, node, box, bottom });
    },

    // Заливка стены — тон плитки: швы, трещины и блики лежат поверх и в
    // расфокусе гаснут, оставляя ровный кафельный тон (см. blurFar).
    wallBase() {
        const b = this.grid().box, T = btPal().tile;
        return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${T[500]}"/>`;
    },

    // Всё, что делает кафель кафелем: тон каждой плитки, швы, сколы,
    // трещины, глазурь. Лежит в группе дальнего плана — в финале гаснет
    // вместе с ней.
    wallTiles() {
        const G = this.grid(), T = btPal().tile, rnd = btRng(this.WALL_SEED + 11);
        const f = (v) => v.toFixed(1);
        const quad = (a, b, c, d, k) => {
            // Плитка чуть меньше своей ячейки: край уходит под затирку.
            const cx = (a.x + b.x + c.x + d.x) / 4, cy = (a.y + b.y + c.y + d.y) / 4;
            const p = (q) => `${f(q.x + (cx - q.x) * k)} ${f(q.y + (cy - q.y) * k)}`;
            return `M${p(a)}L${p(b)}L${p(c)}L${p(d)}Z`;
        };
        let light = '', dark = '', odd = '', glaze = '', chip = '', crack = '';
        const I = G.xs.length - 1, J = G.ys.length - 1;
        for (let i = 0; i < I; i++) for (let j = 0; j < J; j++) {
            const a = G.node[i][j], b = G.node[i + 1][j], c = G.node[i + 1][j + 1], d = G.node[i][j + 1];
            const r = rnd();
            // Тон плитки: большинство как есть, часть на полтона светлее или
            // темнее — партии кафеля никогда не одного цвета.
            if (r < 0.16) light += quad(a, b, c, d, 0.02);
            else if (r < 0.3) dark += quad(a, b, c, d, 0.02);
            else if (r < 0.315) odd += quad(a, b, c, d, 0.02);   // переложенная, из другой партии
            // Глазурь: блик у верхнего края — плитка блестит, а не
            // покрашена. Не на каждой и каждый свой: одинаковые косые
            // штрихи на половине плиток читались дождём, а не глянцем.
            if (rnd() < 0.22) {
                const u = 0.08 + rnd() * 0.35, w = 0.06 + rnd() * 0.1;
                const lean = 0.05 + rnd() * 0.2, len = 0.25 + rnd() * 0.35;
                const P = (s, t) => ({ x: a.x + (b.x - a.x) * s + (d.x - a.x) * t,
                                       y: a.y + (b.y - a.y) * s + (d.y - a.y) * t });
                const q1 = P(u, 0.08), q2 = P(u + w, 0.08),
                      q3 = P(u + w * 0.6 - lean, 0.08 + len), q4 = P(u - lean, 0.08 + len);
                glaze += `M${f(q1.x)} ${f(q1.y)}L${f(q2.x)} ${f(q2.y)}L${f(q3.x)} ${f(q3.y)}L${f(q4.x)} ${f(q4.y)}Z`;
            }
            // Скол угла: треугольник, из-под которого видно основу.
            if (rnd() < 0.05) {
                const s = 5 + rnd() * 6;
                const corner = [a, b, c, d][Math.floor(rnd() * 4)];
                const cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2;
                const ux = Math.sign(cx - corner.x), uy = Math.sign(cy - corner.y);
                chip += `M${f(corner.x)} ${f(corner.y)}L${f(corner.x + ux * s)} ${f(corner.y + uy * 1.5)}`
                      + `L${f(corner.x + ux * 1.2)} ${f(corner.y + uy * s * 0.8)}Z`;
            }
            // Трещина: ломаная через плитку от края до края.
            if (rnd() < 0.018) {
                let x = a.x + (b.x - a.x) * (0.2 + rnd() * 0.6), y = a.y + 2;
                crack += `M${f(x)} ${f(y)}`;
                for (let k = 0; k < 5; k++) {
                    x += (rnd() - 0.5) * 14; y += (d.y - a.y) / 5;
                    crack += `L${f(x)} ${f(y)}`;
                }
            }
        }
        // Швы: ломаные через узлы, каждая линия сетки — один кусок пути.
        let grout = '';
        for (let i = 0; i <= I; i++)
            grout += 'M' + G.node[i].map(p => `${f(p.x)} ${f(p.y)}`).join('L');
        for (let j = 0; j <= J; j++)
            grout += 'M' + G.node.map(col => `${f(col[j].x)} ${f(col[j].y)}`).join('L');
        // Сырость: затирка нижних рядов темнее — у воды она не просыхает.
        let mold = '';
        for (let j = Math.max(0, J - 3); j <= J; j++)
            mold += 'M' + G.node.map(col => `${f(col[j].x)} ${f(col[j].y)}`).join('L');
        for (let i = 0; i < G.xs.length; i++) {
            const col = G.node[i].slice(Math.max(0, J - 3));
            mold += 'M' + col.map(p => `${f(p.x)} ${f(p.y)}`).join('L');
        }
        return `<path fill="${T.hi}" fill-opacity="0.55" d="${light}"/>
            <path fill="${T.lo}" fill-opacity="0.5" d="${dark}"/>
            <path fill="${T.odd}" d="${odd}"/>
            <path fill="${T.hi}" fill-opacity="0.5" d="${glaze}"/>
            <path fill="none" stroke="${T.grout}" stroke-width="2.6" stroke-linejoin="round"
                  stroke-linecap="round" d="${grout}"/>
            <path fill="none" stroke="${T.mold}" stroke-opacity="0.35" stroke-width="2.6"
                  stroke-linejoin="round" d="${mold}"/>
            <path fill="${T.chip}" d="${chip}"/>
            <path fill="none" stroke="${T.crack}" stroke-width="1" stroke-linejoin="round"
                  stroke-linecap="round" d="${crack}"/>`;
    },

    // ---------- ЖИЗНЬ НА СТЕНЕ ----------
    // Подтёки под душем и известковый налёт над бортом. Лежат В группе
    // дальнего плана, как и кафель: в финале стена в расфокусе, и резкие
    // полосы подтёков на размытой плитке выскакивали вперёд.
    wallGrime() {
        const G = this.grid(), T = btPal().tile, rnd = btRng(this.WALL_SEED + 29);
        const A = BATH_BAKED.anchors, f = (v) => v.toFixed(1);
        const floorY = G.bottom;
        // Подтёки: вода с лейки годами стекала по стене. Узкие, неровные,
        // книзу шире и бледнее, до самой ванны.
        let streak = '';
        for (let k = 0; k < 9; k++) {
            const x0 = A.showerHead.x - 70 + rnd() * 150, y0 = A.showerHead.y + 40 + rnd() * 120;
            const len = 180 + rnd() * 320, w = 2 + rnd() * 4;
            const y1 = Math.min(floorY - 4, y0 + len);
            const sway = (rnd() - 0.5) * 10;
            streak += `M${f(x0 - w * 0.4)} ${f(y0)}`
                    + `Q${f(x0 + sway - w)} ${f((y0 + y1) / 2)} ${f(x0 + sway * 0.6 - w * 1.4)} ${f(y1)}`
                    + `L${f(x0 + sway * 0.6 + w * 1.4)} ${f(y1)}`
                    + `Q${f(x0 + sway + w)} ${f((y0 + y1) / 2)} ${f(x0 + w * 0.4)} ${f(y0)}Z`;
        }
        // Известковый налёт над бортом: белёсая полоса там, куда годами
        // доходили брызги. Край мягкий и неровный — плавными горбами, не
        // пилой, — а выше полосы засохшие капли по одной.
        const rimY = A.rimFront.y;
        let scale = `M${f(A.rimL.x - 20)} ${f(rimY + 6)}L${f(A.rimL.x - 20)} ${f(rimY - 20)}`;
        let px = A.rimL.x - 20;
        while (px < A.rimR.x + 20) {
            const step = 30 + rnd() * 50, top = rimY - 18 - rnd() * 34;
            scale += `Q${f(px + step / 2)} ${f(top)} ${f(px + step)} ${f(rimY - 16 - rnd() * 10)}`;
            px += step;
        }
        scale += `L${f(px)} ${f(rimY + 6)}Z`;
        for (let k = 0; k < 26; k++) {
            const x = A.rimL.x + rnd() * (A.rimR.x - A.rimL.x), y = rimY - 40 - rnd() * 90;
            const r = 1.2 + rnd() * 2.4;
            scale += `M${f(x - r)} ${f(y)}a${f(r)} ${f(r * 0.8)} 0 1 0 ${f(2 * r)} 0`
                   + `a${f(r)} ${f(r * 0.8)} 0 1 0 ${f(-2 * r)} 0Z`;
        }
        return `<defs>
                <linearGradient id="bt-wall-scale" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="${T.scale}" stop-opacity="0"/>
                    <stop offset="1" stop-color="${T.scale}" stop-opacity="0.55"/>
                </linearGradient>
            </defs>
            <path fill="${T.stain}" fill-opacity="0.13" d="${streak}"/>
            <path fill="url(#bt-wall-scale)" d="${scale}"/>`;
    },

    // Тень по краям стены: свет в ванной один, сверху по центру, и к углам
    // комната темнеет. Вне группы дальнего плана — это свет, а не рисунок
    // на плитке, и расфокус его не отменяет.
    wallShade() {
        const G = this.grid(), T = btPal().tile, b = G.box;
        return `<defs>
                <radialGradient id="bt-wall-shade" cx="50%" cy="42%" r="62%">
                    <stop offset="0.55" stop-color="${T.shade}" stop-opacity="0"/>
                    <stop offset="1" stop-color="${T.shade}" stop-opacity="0.38"/>
                </radialGradient>
            </defs>
            <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${G.bottom - b.y}"
                  fill="url(#bt-wall-shade)"/>`;
    }
};
