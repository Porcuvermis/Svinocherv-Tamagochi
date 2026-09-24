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
    // Кафель кладут так: сетка ровная, но КАЖДАЯ плитка — отдельный предмет,
    // положенный руками, а между ними промазан шов. Отсюда вся жизнь стены:
    //   * плитка прямая, со скруглёнными углами и фаской — светлая кромка
    //     сверху-слева, тёмная снизу-справа: видно, что она лежит на стене,
    //     а не нарисована на ней;
    //   * у каждой свой крошечный люфт — сдвиг в доли единицы и поворот в
    //     доли градуса, у редких заметнее. Не у всех: люфт возможен, но не
    //     обязателен;
    //   * шов — не линия, а ЗАТИРКА: промежуток своего цвета, который виден
    //     между плитками. Внизу, у воды, она темнее — не просыхает.
    //
    // Первая версия гнула саму сетку — узлы вразброс и волна по всей стене,
    // швы ломаными линиями. Вся стена «плыла», и это било по глазам сильнее
    // идеальной сетки: так не кладут, так рисуют сон.
    //
    // Работа делается один раз, как ремонт: раскладка считается при постройке
    // сцены и дальше не трогается — ни одного пересчёта за кадр.
    WALL_SEED: 7,
    GAP: 3.4,            // ширина шва, единиц сцены
    ROUND: 3,            // скругление угла плитки
    PLAY: { shift: 0.45, turn: 0.35, loose: 0.1, looseTurn: 1.1 },

    grid() {
        if (this._grid) return this._grid;
        const B = BATH_BAKED, box = B.items.wall.box;
        const xs = [...new Set(B.tiles.filter(t => t[0] === t[2]).map(t => t[0]))].sort((a, b) => a - b);
        const ys = [...new Set(B.tiles.filter(t => t[1] === t[3]).map(t => t[1]))].sort((a, b) => a - b);
        return (this._grid = { xs, ys, box, bottom: ys[ys.length - 1] });
    },

    // Плитки: у каждой четыре угла после люфта. Считается один раз.
    tiles() {
        if (this._tiles) return this._tiles;
        const G = this.grid(), P = this.PLAY, rnd = btRng(this.WALL_SEED);
        const h = this.GAP / 2, out = [];
        for (let i = 0; i < G.xs.length - 1; i++) for (let j = 0; j < G.ys.length - 1; j++) {
            const x0 = G.xs[i] + h, x1 = G.xs[i + 1] - h, y0 = G.ys[j] + h, y1 = G.ys[j + 1] - h;
            const loose = rnd() < P.loose;
            const turn = (rnd() - 0.5) * 2 * (loose ? P.looseTurn : P.turn) * Math.PI / 180;
            const dx = (rnd() - 0.5) * 2 * P.shift, dy = (rnd() - 0.5) * 2 * P.shift;
            const cx = (x0 + x1) / 2 + dx, cy = (y0 + y1) / 2 + dy;
            const c = Math.cos(turn), s = Math.sin(turn), hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
            const at = (u, v) => ({ x: cx + u * c - v * s, y: cy + u * s + v * c });
            out.push({ i, j, cx, cy, hw, hh, at,
                       corners: [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)] });
        }
        return (this._tiles = out);
    },

    // Путь плитки со скруглёнными углами. k — ужать к центру (0 — как есть).
    tilePath(t, k) {
        const f = (v) => v.toFixed(1), r = this.ROUND, sh = 1 - (k || 0);
        const hw = t.hw * sh, hh = t.hh * sh;
        const P = (u, v) => { const q = t.at(u, v); return `${f(q.x)} ${f(q.y)}`; };
        return `M${P(-hw + r, -hh)}L${P(hw - r, -hh)}Q${P(hw, -hh)} ${P(hw, -hh + r)}`
             + `L${P(hw, hh - r)}Q${P(hw, hh)} ${P(hw - r, hh)}`
             + `L${P(-hw + r, hh)}Q${P(-hw, hh)} ${P(-hw, hh - r)}`
             + `L${P(-hw, -hh + r)}Q${P(-hw, -hh)} ${P(-hw + r, -hh)}Z`;
    },

    // Заливка стены — тон плитки. Затирка, фаски и всё мелкое лежат поверх,
    // в группе дальнего плана, и в расфокусе гаснут до ровного кафельного
    // тона (см. blurFar).
    wallBase() {
        const b = this.grid().box, T = btPal().tile;
        return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${T[500]}"/>`;
    },

    // Кафель: затирка, плитки поверх неё, фаски, глазурь, сколы, трещины.
    wallTiles() {
        const G = this.grid(), T = btPal().tile, rnd = btRng(this.WALL_SEED + 11);
        const f = (v) => v.toFixed(1), b = G.box;
        let base = '', light = '', dark = '', odd = '';
        let hiEdge = '', loEdge = '', glaze = '', chip = '', crack = '';
        const r = this.ROUND;
        for (const t of this.tiles()) {
            const d = this.tilePath(t);
            const tone = rnd();
            // Тон плитки: большинство как есть, часть на полтона светлее или
            // темнее — партии кафеля никогда не одного цвета.
            // Разброс — полутоном ПОВЕРХ общего: светлая и тёмная плитка
            // целиком другим цветом рябила стену шахматкой.
            base += d;
            if (tone < 0.14) light += d;
            else if (tone < 0.27) dark += d;
            else if (tone < 0.285) odd += d;     // переложенная, из другой партии
            // Фаска: светлая кромка сверху и слева, тёмная снизу и справа.
            const P = (u, v) => { const q = t.at(u, v); return `${f(q.x)} ${f(q.y)}`; };
            const e = 1.1, hw = t.hw - e, hh = t.hh - e;
            hiEdge += `M${P(-hw, hh - r)}L${P(-hw, -hh + r)}Q${P(-hw, -hh)} ${P(-hw + r, -hh)}L${P(hw - r, -hh)}`;
            loEdge += `M${P(hw, -hh + r)}L${P(hw, hh - r)}Q${P(hw, hh)} ${P(hw - r, hh)}L${P(-hw + r, hh)}`;
            // Глазурь: блик у верхнего края, не на каждой и каждый свой.
            if (rnd() < 0.22) {
                const u = -0.7 + rnd() * 0.8, w = 0.12 + rnd() * 0.15, lean = 0.1 + rnd() * 0.3;
                const len = 0.4 + rnd() * 0.6;
                glaze += `M${P(t.hw * u, -t.hh * 0.84)}L${P(t.hw * (u + w), -t.hh * 0.84)}`
                       + `L${P(t.hw * (u + w * 0.6 - lean), -t.hh * (0.84 - len))}`
                       + `L${P(t.hw * (u - lean), -t.hh * (0.84 - len))}Z`;
            }
            // Скол угла: кусок эмали отлетел, в углу видна затирка.
            if (rnd() < 0.05) {
                const sx = rnd() < 0.5 ? -1 : 1, sy = rnd() < 0.5 ? -1 : 1, s = 4 + rnd() * 5;
                chip += `M${P(sx * t.hw, sy * t.hh)}L${P(sx * (t.hw - s), sy * t.hh)}`
                      + `Q${P(sx * (t.hw - s * 0.4), sy * (t.hh - s * 0.3))} ${P(sx * t.hw, sy * (t.hh - s * 0.8))}Z`;
            }
            // Трещина: ломаная через плитку.
            if (rnd() < 0.02) {
                let u = (rnd() - 0.5) * t.hw, v = -t.hh + 2;
                crack += `M${P(u, v)}`;
                for (let k = 0; k < 5; k++) {
                    u += (rnd() - 0.5) * 12; v += (t.hh * 2 - 4) / 5;
                    crack += `L${P(u, v)}`;
                }
            }
        }
        // Сырость: затирка трёх нижних рядов темнее. Рисуется ПОД плитками —
        // видна только в швах.
        const wetTop = G.ys[Math.max(0, G.ys.length - 4)];
        return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${G.bottom - b.y}" fill="${T.grout}"/>
            <rect x="${b.x}" y="${f(wetTop)}" width="${b.w}" height="${f(G.bottom - wetTop)}"
                  fill="${T.mold}" fill-opacity="0.3"/>
            <path fill="${T[500]}" d="${base}"/>
            <path fill="${T.hi}" fill-opacity="0.55" d="${light}"/>
            <path fill="${T.lo}" fill-opacity="0.4" d="${dark}"/>
            <path fill="${T.odd}" d="${odd}"/>
            <path fill="none" stroke="${T.hi}" stroke-width="1.6" stroke-linecap="round"
                  stroke-linejoin="round" stroke-opacity="0.9" d="${hiEdge}"/>
            <path fill="none" stroke="${T.lo}" stroke-width="1.6" stroke-linecap="round"
                  stroke-linejoin="round" d="${loEdge}"/>
            <path fill="${T.hi}" fill-opacity="0.55" d="${glaze}"/>
            <path fill="${T.grout}" d="${chip}"/>
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
    },

    // ---------- ПОЛ: ТА ЖЕ КЛАДКА, В ПЕРСПЕКТИВЕ ----------
    // Сетка — лучи и ряды запекания: лучи сходятся в ту же точку, что у всей
    // комнаты, ряды сжимаются с глубиной. Плитка внутри ячейки задаётся
    // ДОЛЯМИ ячейки (u, v от 0 до 1) и переводится в сцену
    // билинейно по её четырём углам — так перспектива у каждой плитки своя и
    // правильная, а шов, фаска и люфт считаются в долях.
    //
    // Шов в долях постоянный: плитка квадратная, и шов на ней занимает одну
    // и ту же долю, как бы далеко она ни лежала. В пикселях он сам тоньшает
    // к стене — ровно так, как должна вести себя перспектива.
    FLOOR_SEED: 13,
    FLOOR_GAP: 0.05,     // шов, доля плитки
    FLOOR_ROUND: 0.07,   // скругление угла, доля плитки

    floorGrid() {
        if (this._floor) return this._floor;
        const B = BATH_BAKED;
        const rays = B.seams.filter(t => Math.abs(t[1] - t[3]) > 0.01)
            .map(t => ({ xt: t[0], yt: t[1], xb: t[2], yb: t[3] }))
            .sort((a, b) => a.xt - b.xt);
        const rows = B.seams.filter(t => Math.abs(t[1] - t[3]) <= 0.01)
            .map(t => t[1]).sort((a, b) => a - b);
        const at = (i, y) => { const r = rays[i]; return { x: r.xt + (r.xb - r.xt) * (y - r.yt) / (r.yb - r.yt), y }; };
        return (this._floor = { rays, rows, at, top: rows[0] });
    },

    // Плитки пола: четыре угла ячейки и свой люфт в долях.
    floorTiles() {
        if (this._floorTiles) return this._floorTiles;
        const F = this.floorGrid(), rnd = btRng(this.FLOOR_SEED), out = [];
        for (let i = 0; i < F.rays.length - 1; i++) for (let j = 0; j < F.rows.length - 1; j++) {
            const a = F.at(i, F.rows[j]), b = F.at(i + 1, F.rows[j]),
                  c = F.at(i + 1, F.rows[j + 1]), d = F.at(i, F.rows[j + 1]);
            const loose = rnd() < 0.1, m = loose ? 0.02 : 0.006;
            const du = (rnd() - 0.5) * 2 * m, dv = (rnd() - 0.5) * 2 * m, sk = (rnd() - 0.5) * 2 * m;
            // Точка плитки (u, v) в сцене: билинейно по углам ячейки, с
            // люфтом — сдвигом и лёгким перекосом.
            const map = (u, v) => {
                u += du + sk * (v - 0.5); v += dv;
                const top = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
                const bot = { x: d.x + (c.x - d.x) * u, y: d.y + (c.y - d.y) * u };
                return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
            };
            out.push({ i, j, map });
        }
        return (this._floorTiles = out);
    },

    // Контур плитки в долях: скруглённый квадрат, ужатый на полшва.
    floorPath(t) {
        const f = (v) => v.toFixed(1), g = this.FLOOR_GAP / 2, r = this.FLOOR_ROUND;
        const lo = g, hi = 1 - g, pts = [];
        const arc = (cu, cv, a0) => {
            for (let k = 0; k <= 3; k++) {
                const a = a0 + Math.PI / 2 * k / 3;
                pts.push(t.map(cu + Math.cos(a) * r, cv + Math.sin(a) * r));
            }
        };
        arc(hi - r, lo + r, -Math.PI / 2);
        arc(hi - r, hi - r, 0);
        arc(lo + r, hi - r, Math.PI / 2);
        arc(lo + r, lo + r, Math.PI);
        return 'M' + pts.map(p => `${f(p.x)} ${f(p.y)}`).join('L') + 'Z';
    },

    // Заливка пола — тон плитки: как у стены, всё мелкое лежит поверх, в
    // группе дальнего плана.
    floorBase() {
        const F = this.floorGrid(), T = btPal().floor, f = (v) => v.toFixed(1);
        const L = F.rays[0], R = F.rays[F.rays.length - 1], H = 1500;
        const x = (r, y) => r.xt + (r.xb - r.xt) * (y - r.yt) / (r.yb - r.yt);
        return `<path fill="${T[500]}" d="M${f(L.xt)} ${f(F.top)}L${f(R.xt)} ${f(F.top)}`
             + `L${f(x(R, H))} ${H}L${f(x(L, H))} ${H}Z"/>`;
    },

    floorPlate() {
        const F = this.floorGrid(), f = (v) => v.toFixed(1);
        const L = F.rays[0], R = F.rays[F.rays.length - 1], H = 1500;
        const x = (r, y) => r.xt + (r.xb - r.xt) * (y - r.yt) / (r.yb - r.yt);
        return `M${f(L.xt)} ${f(F.top)}L${f(R.xt)} ${f(F.top)}L${f(x(R, H))} ${H}L${f(x(L, H))} ${H}Z`;
    },

    // Пол: затирка, плитки, фаски, лужи.
    floorTiles2() {
        const T = btPal().floor, rnd = btRng(this.FLOOR_SEED + 5), f = (v) => v.toFixed(1);
        let base = '', light = '', dark = '', hiEdge = '', loEdge = '';
        const g = this.FLOOR_GAP / 2 + 0.03, r = this.FLOOR_ROUND;
        for (const t of this.floorTiles()) {
            base += this.floorPath(t);
            const tone = rnd();
            if (tone < 0.15) light += this.floorPath(t);
            else if (tone < 0.3) dark += this.floorPath(t);
            // Фаска: дальняя кромка светлая (свет сверху), ближняя тёмная.
            const P = (u, v) => { const q = t.map(u, v); return `${f(q.x)} ${f(q.y)}`; };
            hiEdge += `M${P(g + r, g)}L${P(1 - g - r, g)}`;
            loEdge += `M${P(g + r, 1 - g)}L${P(1 - g - r, 1 - g)}`;
        }
        return `<path fill="${T.seam}" d="${this.floorPlate()}"/>
            <path fill="${T[500]}" d="${base}"/>
            <path fill="${T.hi}" fill-opacity="0.5" d="${light}"/>
            <path fill="${T.lo}" fill-opacity="0.45" d="${dark}"/>
            <path fill="none" stroke="${T.hi}" stroke-width="1.4" stroke-linecap="round" d="${hiEdge}"/>
            <path fill="none" stroke="${T.lo}" stroke-width="1.4" stroke-linecap="round" d="${loEdge}"/>
            ${this.floorWet()}`;
    },

    // Лужицы у ванны: натекло с душа. Тёмное мокрое пятно, приплюснутое
    // перспективой, и блик окна на нём; рядом отдельные капли.
    floorWet() {
        const T = btPal().floor, rnd = btRng(this.FLOOR_SEED + 9), A = BATH_BAKED.anchors;
        const tub = BATH_BAKED.items.tub.box, f = (v) => v.toFixed(1);
        const floorY = tub.y + tub.h;
        let wet = '', glint = '';
        const blob = (cx, cy, rx, ry) => {
            const n = 9, pts = [];
            for (let k = 0; k < n; k++) {
                const a = 2 * Math.PI * k / n, q = 0.7 + rnd() * 0.5;
                pts.push({ x: cx + Math.cos(a) * rx * q, y: cy + Math.sin(a) * ry * q });
            }
            return BATH_ART.gooCurve(pts);
        };
        for (const [u, w] of [[0.12, 120], [0.66, 160], [0.95, 70]]) {
            const cx = tub.x + tub.w * u, cy = floorY + 22 + rnd() * 22;
            wet += blob(cx, cy, w, w * 0.16);
            glint += blob(cx - w * 0.25, cy - w * 0.03, w * 0.4, w * 0.035);
        }
        for (let k = 0; k < 14; k++) {
            const cx = tub.x - 30 + rnd() * (tub.w + 60), cy = floorY + 10 + rnd() * 80, rr = 3 + rnd() * 5;
            wet += blob(cx, cy, rr, rr * 0.35);
        }
        // Мокрое темнее сухого, а блик на луже — это отражённый свет, он
        // холодный и светлее самой плитки: по нему лужа и читается водой.
        const W = btPal().water;
        return `<path fill="${T.shade}" fill-opacity="0.32" d="${wet}"/>
            <path fill="${W.surfHi}" fill-opacity="0.6" d="${glint}"/>`;
    },

    // Свет на полу: угол у стены темнее, под ванной — тень, в которой она
    // стоит. Без неё чаша висела над полом.
    floorShade() {
        const F = this.floorGrid(), T = btPal().floor, tub = BATH_BAKED.items.tub.box;
        const floorY = tub.y + tub.h, f = (v) => v.toFixed(1);
        return `<defs>
                <linearGradient id="bt-floor-corner" x1="0" y1="${F.top}" x2="0" y2="${F.top + 40}"
                                gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="${T.shade}" stop-opacity="0.55"/>
                    <stop offset="1" stop-color="${T.shade}" stop-opacity="0"/>
                </linearGradient>
                <radialGradient id="bt-floor-tub" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0.35" stop-color="${T.shade}" stop-opacity="0.75"/>
                    <stop offset="1" stop-color="${T.shade}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <path fill="url(#bt-floor-corner)" d="${this.floorPlate()}"/>
            <ellipse cx="${f(tub.x + tub.w / 2)}" cy="${f(floorY - 2)}" rx="${f(tub.w * 0.58)}"
                     ry="26" fill="url(#bt-floor-tub)"/>`;
    }
};
