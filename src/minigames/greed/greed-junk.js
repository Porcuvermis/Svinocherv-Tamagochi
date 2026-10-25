// ================= АППАРАТ АЛЧНОСТИ: ГАРАЖНЫЙ КОРПУС =================
// Корпус первого уровня: автомат, сколоченный из досок, жести от чужой
// техники и ржавого крепежа. Сверху два ПУСТЫХ гнезда — круглое под колесо
// фортуны и прямоугольное под пачинко: пока игры не куплены, видно, куда
// они встанут (docs/plan/28-greed-machine.md, референсы docs/ref/greed-machine-*).
//
// Анфас, без перспективы: три игры на экране телефона читаются только так.
// Рычаг СПРАВА, под большой палец правой руки, хотя на референсах он слева.
//
// Рисунок строится строкой SVG из PALETTE.greedJunk и STROKE, а не лежит
// файлом: хардкод цвета в рендерере запрещён (docs/bench/art.md, разд. 1).
// Корпус неподвижен и рисуется ОДИН раз — живое (рычаг, барабаны, колесо)
// идёт отдельными слоями поверх (там же, «Дёшево, а выглядит дорого»).
//
// Координаты — в поле 360×640. Гнёзда и окно барабанов отдаются наружу
// числами (GreedJunk.SLOTS), чтобы игры ставились по ним, а не на глаз.
const GreedJunk = {
    W: 360,
    H: 640,

    // Где что стоит. Колесо и пачинко встают в гнёзда, барабаны — в окна,
    // рычаг вращается вокруг оси pivot.
    SLOTS: {
        wheel: { cx: 116, cy: 140, r: 60 },
        pachinko: { x: 204, y: 86, w: 92, h: 110 },
        reels: [{ x: 86, y: 252, w: 58, h: 98 }, { x: 151, y: 252, w: 58, h: 98 },
                { x: 216, y: 252, w: 58, h: 98 }],
        pivot: { x: 324, y: 336 },
        plate: { x: 72, y: 446, w: 216, h: 92 },
        tray: { x: 122, y: 556, w: 116, h: 22 }
    },

    // Детерминированный шум: волокна досок и царапины не должны прыгать от
    // перерисовки к перерисовке.
    rng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    },

    f(n) { return Math.round(n * 10) / 10; },

    // Прямоугольник от руки: углы и середины сторон чуть гуляют. Ровный
    // прямоугольник читается заводской деталью, а это сборка из гаража —
    // доска отпилена на глаз, жесть отрезана ножницами.
    wob(x, y, w, h, seed, amp) {
        const rnd = this.rng(seed), f = this.f;
        const a = amp == null ? Math.min(2.2, Math.min(w, h) * 0.06) : amp;
        const j = () => (rnd() - 0.5) * 2 * a;
        const pts = [
            [x + j(), y + j()], [x + w / 2 + j(), y + j() * 0.6], [x + w + j(), y + j()],
            [x + w + j() * 0.6, y + h / 2 + j()], [x + w + j(), y + h + j()],
            [x + w / 2 + j(), y + h + j() * 0.6], [x + j(), y + h + j()], [x + j() * 0.6, y + h / 2 + j()]
        ];
        return 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join(' L') + ' Z';
    },

    // Тень, которую отбрасывает выступ на то, что под ним: мягкая полоса
    // градиентом сверху вниз. Объём корпусу даёт она, а не обводка.
    shade(x, y, w, h) {
        const f = this.f;
        return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#gj-shade)"/>`;
    },

    // ---------- ГРАДИЕНТЫ ----------
    // Свет один, сверху-слева (LIGHT в palette.js): светлое начало у всех
    // градиентов в верхнем левом углу.
    defs() {
        const J = PALETTE.greedJunk;
        const lin = (id, a, b, x2, y2) =>
            `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
            `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
        return '<defs>' +
            lin('gj-wood', J.wood[300], J.wood[500], 0.35, 1) +
            lin('gj-wood-dark', J.wood[500], J.wood[700], 0.35, 1) +
            lin('gj-wood-light', J.wood[100], J.wood[300], 0.35, 1) +
            lin('gj-tin', J.tin[300], J.tin[700], 0.6, 1) +
            lin('gj-tin-dark', J.tin[500], J.tin[700], 0.6, 1) +
            lin('gj-blue', J.paint.blue, J.paint.blueLo, 0.3, 1) +
            `<linearGradient id="gj-shade" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${J.hole}" stop-opacity="0.55"/><stop offset="1" stop-color="${J.hole}" stop-opacity="0"/></linearGradient>` +
            // грязь: тёмное пятно, гуще к низу детали — там копится пыль
            `<radialGradient id="gj-dirt" cx="0.5" cy="1" r="0.9">` +
            `<stop offset="0" stop-color="${J.wood[900]}" stop-opacity="0.45"/><stop offset="1" stop-color="${J.wood[900]}" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="gj-hole" cx="0.5" cy="0.42" r="0.6">` +
            `<stop offset="0" stop-color="${J.wood[900]}"/><stop offset="1" stop-color="${J.hole}"/></radialGradient>` +
            '</defs>';
    },

    // ---------- ДОСКИ ----------
    // Щит из досок: каждая доска своей заливкой чуть другого тона, шов —
    // линией структуры, волокно — тонкими дугами, у концов гвозди. Доска
    // «чуть другого тона» и даёт сборку из разного: один цвет на весь щит
    // читался бы фанерой из магазина.
    planks(x, y, w, h, n, seed, dir) {
        const J = PALETTE.greedJunk;
        const rnd = this.rng(seed);
        const f = this.f;
        const grads = ['gj-wood', 'gj-wood-dark', 'gj-wood-light'];
        let out = '';
        const vertical = dir === 'v';
        const step = (vertical ? w : h) / n;
        for (let i = 0; i < n; i++) {
            const px = vertical ? x + i * step : x;
            const py = vertical ? y : y + i * step;
            const pw = vertical ? step : w;
            const ph = vertical ? h : step;
            const g = grads[Math.floor(rnd() * 3) % 3];
            out += `<path d="${this.wob(px, py, pw, ph, seed * 31 + i, 1.2)}" fill="url(#${g})" stroke="${J.wood[900]}" stroke-width="${STROKE.structure}"/>`;
            // волокно: две-три дуги вдоль доски
            const lines = 2 + Math.floor(rnd() * 2);
            for (let k = 0; k < lines; k++) {
                if (vertical) {
                    const gx = px + pw * (0.2 + rnd() * 0.6);
                    const bend = (rnd() - 0.5) * pw * 0.5;
                    out += `<path d="M${f(gx)} ${f(py + 4)} q${f(bend)} ${f(ph / 2)} 0 ${f(ph - 8)}" ` +
                        `fill="none" stroke="${J.wood[700]}" stroke-width="${STROKE.hairline}" opacity="0.7"/>`;
                } else {
                    const gy = py + ph * (0.22 + rnd() * 0.56);
                    const bend = (rnd() - 0.5) * ph * 0.6;
                    out += `<path d="M${f(px + 5)} ${f(gy)} q${f(pw / 2)} ${f(bend)} ${f(pw - 10)} 0" ` +
                        `fill="none" stroke="${J.wood[700]}" stroke-width="${STROKE.hairline}" opacity="0.7"/>`;
                }
            }
            // сучок — не на каждой доске
            if (rnd() < 0.45) {
                const kx = px + pw * (0.2 + rnd() * 0.6), ky = py + ph * (0.25 + rnd() * 0.5);
                out += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(vertical ? 2.2 : 4)}" ry="${f(vertical ? 4 : 2.2)}" ` +
                    `fill="${J.wood[700]}" stroke="${J.wood[900]}" stroke-width="${STROKE.hairline}"/>`;
            }
            // гвозди у концов
            const nails = vertical
                ? [[px + pw / 2, py + 6], [px + pw / 2, py + ph - 6]]
                : [[px + 6, py + ph / 2], [px + pw - 6, py + ph / 2]];
            nails.forEach(([nx, ny]) => { out += this.nail(nx, ny); });
        }
        out += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#gj-dirt)"/>`;
        out += `<path d="${this.wob(x, y, w, h, seed, 1.4)}" fill="none" ` +
            `stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>`;
        return out;
    },

    nail(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="${J.tin[300]}" stroke="${J.wood[900]}" stroke-width="${STROKE.hairline}"/>`;
    },

    // ---------- ЖЕСТЬ ----------
    // Пластина: тусклый градиент, болты по углам, под болтами ржавые потёки,
    // несколько царапин. Потёк — вниз от болта: вода стекает, а не
    // расползается кругом.
    bolt(x, y, r) {
        const J = PALETTE.greedJunk, f = this.f;
        r = r || 2.6;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<line x1="${f(x - r * 0.6)}" y1="${f(y)}" x2="${f(x + r * 0.6)}" y2="${f(y)}" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
    },

    rustRun(x, y, len, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        const w = 1.6 + rnd() * 1.6;
        return `<path d="M${f(x - w)} ${f(y)} q${f(w * 0.4)} ${f(len * 0.6)} ${f(w)} ${f(len)} q${f(w * 0.6)} ${f(-len * 0.4)} ${f(w)} ${f(-len)} z" ` +
            `fill="${J.rust[500]}" opacity="0.75"/>`;
    },

    tin(x, y, w, h, seed, opts) {
        const J = PALETTE.greedJunk, f = this.f;
        const o = opts || {};
        const rnd = this.rng(seed);
        // Пластина прикручена чуть криво — на глаз. Угол маленький: больше
        // двух градусов уже читается как падающая деталь.
        const tilt = o.tilt != null ? o.tilt : (rnd() - 0.5) * 3;
        let out = `<g transform="rotate(${f(tilt)} ${f(x + w / 2)} ${f(y + h / 2)})">`;
        out += `<path d="${this.wob(x, y, w, h, seed + 5)}" ` +
            `fill="url(#${o.dark ? 'gj-tin-dark' : 'gj-tin'})" stroke="${PALETTE.ink}" stroke-width="${o.stroke || STROKE.structure}"/>`;
        out += `<path d="${this.wob(x, y, w, h, seed + 5)}" fill="url(#gj-dirt)"/>`;
        // вмятина: светлая дуга над тёмной
        if (w > 30 && h > 30) {
            const dx = x + w * (0.25 + rnd() * 0.5), dy = y + h * (0.25 + rnd() * 0.5);
            out += `<path d="M${f(dx - 7)} ${f(dy)} q7 -5 14 0" fill="none" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>` +
                `<path d="M${f(dx - 6)} ${f(dy + 2)} q6 4 12 0" fill="none" stroke="${J.tin[900]}" stroke-width="${STROKE.hairline}" opacity="0.7"/>`;
        }
        // царапины
        for (let i = 0; i < (o.scratches == null ? 3 : o.scratches); i++) {
            const sx = x + w * (0.15 + rnd() * 0.6), sy = y + h * (0.15 + rnd() * 0.7);
            const len = Math.min(w, h) * (0.15 + rnd() * 0.25);
            out += `<line x1="${f(sx)}" y1="${f(sy)}" x2="${f(sx + len)}" y2="${f(sy - len * 0.35)}" ` +
                `stroke="${J.tin[100]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>`;
        }
        if (o.bolts !== false) {
            const m = Math.min(6, Math.min(w, h) * 0.22);
            [[x + m, y + m], [x + w - m, y + m], [x + m, y + h - m], [x + w - m, y + h - m]].forEach(([bx, by], i) => {
                if (rnd() < 0.55) out += this.rustRun(bx, by + 2, 5 + rnd() * 9, seed + i * 7);
                out += this.bolt(bx, by, o.boltR);
            });
        }
        return out + '</g>';
    },

    // ---------- ШЕСТЕРНЯ ----------
    gear(cx, cy, r, teeth, rot) {
        const J = PALETTE.greedJunk, f = this.f;
        const pts = [];
        const inner = r * 0.8;
        for (let i = 0; i < teeth * 4; i++) {
            const a = (i / (teeth * 4)) * Math.PI * 2 + (rot || 0);
            const rr = (i % 4 === 1 || i % 4 === 2) ? r : inner;
            pts.push(f(cx + Math.cos(a) * rr) + ',' + f(cy + Math.sin(a) * rr));
        }
        return `<polygon points="${pts.join(' ')}" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.52)}" fill="none" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.2)}" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
    },

    // Провод, торчащий из пустого гнезда: «отсюда что-то вынули».
    wire(x, y, dx, dy, color) {
        const f = this.f;
        return `<path d="M${f(x)} ${f(y)} q${f(dx * 0.2)} ${f(dy * 0.9)} ${f(dx)} ${f(dy)}" fill="none" ` +
            `stroke="${PALETTE.ink}" stroke-width="3.4" stroke-linecap="round"/>` +
            `<path d="M${f(x)} ${f(y)} q${f(dx * 0.2)} ${f(dy * 0.9)} ${f(dx)} ${f(dy)}" fill="none" ` +
            `stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>` +
            `<circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="1.3" fill="${PALETTE.greedJunk.rust[300]}"/>`;
    },

    // ---------- ЧАСТИ КОРПУСА ----------
    // Верхний ящик с двумя пустыми гнёздами.
    topBox() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        let out = this.planks(30, 70, 284, 132, 4, 11, 'h');
        // жестяная полоса-решётка снизу ящика, как на референсе
        out += this.tin(36, 186, 272, 18, 21, { bolts: false, scratches: 2 });
        for (let i = 0; i < 18; i++) {
            const vx = 52 + i * 13.6;
            if (vx > 150 && vx < 194) continue;
            out += `<rect x="${f(vx)}" y="190" width="6" height="10" rx="1.5" fill="${J.hole}"/>`;
        }
        // табличка без слов посередине решётки
        out += `<rect x="150" y="188" width="44" height="14" rx="2" fill="${J.paint.red}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;

        // гнездо колеса: жестяное кольцо прямо на досках, болты по кругу.
        // Кольцо, а не квадратная пластина: пластина закрывала весь ящик, и
        // от «сколочено из досок» сверху не оставалось ничего.
        const w = S.wheel;
        out += `<circle cx="${w.cx}" cy="${w.cy}" r="${w.r + 11}" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>`;
        out += `<circle cx="${w.cx}" cy="${w.cy}" r="${w.r + 11}" fill="url(#gj-dirt)"/>`;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.3;
            const bx = w.cx + Math.cos(a) * (w.r + 5.5), by = w.cy + Math.sin(a) * (w.r + 5.5);
            if (i % 3 === 0) out += this.rustRun(bx, by + 2, 6 + i, 33 + i);
            out += this.bolt(bx, by, 2.4);
        }
        // скоба-подпорка под кольцом: колесо тяжёлое
        out += this.tin(w.cx - 8, w.cy + w.r + 4, 16, 20, 35, { bolts: false, scratches: 0, tilt: 0 }) + this.bolt(w.cx, w.cy + w.r + 16, 2.2);
        out += `<circle cx="${w.cx}" cy="${w.cy}" r="${w.r}" fill="url(#gj-hole)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>`;
        out += `<circle cx="${w.cx}" cy="${w.cy}" r="${w.r - 5}" fill="none" stroke="${J.wood[900]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>`;
        // ось, на которую сядет колесо
        out += `<circle cx="${w.cx}" cy="${w.cy}" r="7" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<circle cx="${w.cx - 2}" cy="${w.cy - 2}" r="2" fill="${J.tin[100]}"/>`;
        out += this.wire(w.cx + 28, w.cy - 40, 14, 22, J.paint.red);
        out += this.wire(w.cx - 36, w.cy + 30, -8, 20, J.paint.blue);

        // гнездо пачинко: прямоугольная жестяная рамка-скоба
        const p = S.pachinko;
        out += this.tin(p.x - 10, p.y - 10, p.w + 20, p.h + 20, 41, { boltR: 3 });
        out += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="url(#gj-hole)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>`;
        // направляющие пазы по бокам
        out += `<rect x="${p.x + 4}" y="${p.y + 6}" width="5" height="${p.h - 12}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
        out += `<rect x="${p.x + p.w - 9}" y="${p.y + 6}" width="5" height="${p.h - 12}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
        out += this.wire(p.x + 30, p.y + p.h - 8, 10, -26, J.paint.yellow);
        out += this.wire(p.x + 60, p.y + p.h - 8, -6, -18, J.paint.red);
        return out;
    },

    // Табло с барабанами: облезлая крашеная жесть.
    head() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        let out = '';
        // боковые доски, на которых держится табло
        out += this.planks(36, 204, 18, 190, 1, 51, 'v');
        out += this.planks(306, 204, 18, 190, 1, 52, 'v');
        // жестяной лист
        out += this.tin(50, 210, 260, 182, 61, { boltR: 3, scratches: 0, stroke: STROKE.contour, tilt: 0.4 });
        // крашеное поле: синяя рамка и лучи
        out += `<rect x="62" y="222" width="236" height="150" rx="10" fill="url(#gj-blue)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        const cx = 180, cy = 300;
        const rays = [J.paint.orange, J.paint.yellow, J.paint.red, J.paint.yellow];
        for (let i = 0; i < 12; i++) {
            const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 0.5) / 12) * Math.PI * 2;
            const R = 170;
            out += `<path d="M${cx} ${cy} L${f(cx + Math.cos(a0) * R)} ${f(cy + Math.sin(a0) * R)} ` +
                `L${f(cx + Math.cos(a1) * R)} ${f(cy + Math.sin(a1) * R)} z" fill="${rays[i % 4]}" clip-path="url(#gj-face)"/>`;
        }
        // облезлая краска: пятна голой жести
        const rnd = this.rng(71);
        for (let i = 0; i < 9; i++) {
            const px = 70 + rnd() * 220, py = 228 + rnd() * 138;
            if (px > 80 && px < 280 && py > 244 && py < 358) continue;   // не на окне
            out += `<path d="M${f(px)} ${f(py)} q4 -3 8 0 q2 4 -2 6 q-5 1 -6 -6 z" fill="${J.tin[300]}" ` +
                `stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        }
        // рамка окна барабанов
        out += `<rect x="78" y="244" width="204" height="114" rx="8" fill="${J.paint.blueLo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        S.reels.forEach(r => {
            out += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        });
        // три кнопки под окном
        [140, 180, 220].forEach(bx => {
            out += `<circle cx="${bx}" cy="378" r="7" fill="${J.paint.orange}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
                `<circle cx="${bx - 2}" cy="376" r="2.2" fill="${J.paint.cream}" opacity="0.8"/>`;
        });
        return out;
    },

    // Полка-подоконник под табло и нижний ящик с пустой табличкой и лотком.
    body() {
        const J = PALETTE.greedJunk, S = this.SLOTS;
        let out = '';
        out += this.planks(40, 410, 280, 180, 3, 81, 'v');
        // жестяные уголки
        out += this.tin(40, 410, 26, 26, 91, { bolts: false, scratches: 1 }) + this.bolt(50, 420);
        out += this.tin(294, 410, 26, 26, 92, { bolts: false, scratches: 1 }) + this.bolt(310, 420);
        out += this.tin(40, 564, 26, 26, 93, { bolts: false, scratches: 1 }) + this.bolt(50, 580);
        out += this.tin(294, 564, 26, 26, 94, { bolts: false, scratches: 1 }) + this.bolt(310, 580);
        // пустая табличка выплат: светлая доска на гвоздях
        const p = S.plate;
        out += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" fill="url(#gj-wood-light)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        [[p.x + 7, p.y + 7], [p.x + p.w - 7, p.y + 7], [p.x + 7, p.y + p.h - 7], [p.x + p.w - 7, p.y + p.h - 7]]
            .forEach(([x, y]) => { out += this.nail(x, y); });
        // лоток
        const t = S.tray;
        out += this.tin(t.x - 8, t.y - 6, t.w + 16, t.h + 12, 101, { bolts: false, scratches: 1 });
        out += `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="4" fill="url(#gj-hole)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        // тень от полки на ящик
        out += this.shade(40, 412, 280, 16);
        // латка: кусок жести поверх треснувшей доски и полоса изоленты
        out += this.tin(250, 520, 34, 26, 141, { boltR: 2 });
        out += `<path d="${this.wob(44, 470, 22, 40, 143, 1)}" fill="${J.tin[900]}" opacity="0.92" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M48 478 l14 3 M48 492 l14 -2" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        // полка поверх стыка табло и ящика — торчит за края
        out += this.planks(24, 390, 312, 22, 1, 111, 'h');
        return out;
    },

    // Цоколь: толстая тёмная доска на двух брусках.
    plinth() {
        let out = this.planks(30, 600, 70, 24, 1, 121, 'h') + this.planks(260, 600, 70, 24, 1, 122, 'h');
        out += this.planks(18, 586, 324, 20, 1, 123, 'h');
        return out;
    },

    // Механизм рычага: жестяная пластина на боку, две шестерни и ступица.
    leverMount() {
        const P = this.SLOTS.pivot;
        let out = this.tin(304, 270, 46, 106, 131, { boltR: 2.6 });
        out += this.gear(334, 300, 13, 9, 0.2);
        out += this.gear(P.x, P.y, 22, 12, 0);
        out += `<circle cx="${P.x}" cy="${P.y}" r="9" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        return out;
    },

    // Рычаг — отдельно: он вращается вокруг pivot, корпус при этом не
    // перерисовывается.
    leverSvg() {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot;
        const top = 186;
        return `<g class="gj-lever">` +
            `<rect x="${P.x - 4}" y="${top}" width="8" height="${P.y - top}" rx="3" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            `<line x1="${P.x - 1.5}" y1="${top + 6}" x2="${P.x - 1.5}" y2="${P.y - 12}" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${P.x}" cy="${top - 10}" r="15" fill="url(#gj-wood)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            `<ellipse cx="${P.x - 5}" cy="${top - 15}" rx="5" ry="3.5" fill="${J.wood[100]}" opacity="0.8"/>` +
            `<circle cx="${P.x}" cy="${P.y}" r="5" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `</g>`;
    },

    // Весь неподвижный корпус одной строкой.
    // Тень от верхнего ящика на табло: ящик выступает над ним.
    topShade() {
        return this.shade(54, 204, 252, 14);
    },

    bodySvg() {
        const clip = `<clipPath id="gj-face"><rect x="62" y="222" width="236" height="150" rx="10"/></clipPath>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}">` +
            this.defs().replace('</defs>', clip + '</defs>') +
            this.plinth() + this.body() + this.head() + this.topShade() + this.topBox() + this.leverMount() +
            this.leverSvg() +
            `</svg>`;
    }
};
