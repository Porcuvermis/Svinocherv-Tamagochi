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
    // ---------- КАТАЛОГ ВЫСОТ ----------
    // Насколько деталь выступает над тем, к чему прикреплена (условные
    // единицы ≈ пиксели поля). От этого числа — смещение и плотность её
    // тени: плоское прижато и тени почти не даёт, выпирающее даёт густую и
    // далёкую. Отрицательное — углубление: тени не отбрасывает, а само
    // темнеет сверху (верхняя стенка дыры закрыта от света).
    //
    //   жесть заподлицо, латка, крышка банки   plate   1
    //   полоса крестовины, рамка лотка          strap   2
    //   рельс-швеллер, фланец                   rail    4
    //   коробка розетки, корпус кулисы          box     5
    //   коробка вентилятора                     fan     7
    //   полка-упор пачинко, шпилька             shelf   9
    //   отверстие, гнездо розетки, окно         hole   −4
    Z: { plate: 1, strap: 2, rail: 4, box: 5, fan: 7, shelf: 9, hole: -4 },

    W: 360,
    H: 630,

    // Где что стоит. Колесо и пачинко встанут поверх креплений в своих
    // зонах, барабаны — в окна, рычаг вращается вокруг оси pivot.
    //
    // Пропорции: верх — самая большая зона, там две игры, и мелкими они не
    // читаются. Нижний ящик — самая маленькая: на нём только табличка и лоток.
    SLOTS: {
        wheel: { cx: 108, cy: 158, r: 86 },
        pachinko: { x: 206, y: 40, w: 104, h: 232 },
        reels: [{ x: 86, y: 340, w: 58, h: 96 }, { x: 151, y: 340, w: 58, h: 96 },
                { x: 216, y: 340, w: 58, h: 96 }],
        pivot: { x: 334, y: 392 },
        plate: { x: 70, y: 496, w: 220, h: 44 },
        tray: { x: 128, y: 552, w: 104, h: 18 }
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
            // рукоять кулисы: чёрный бакелит, свет сверху-слева
            `<radialGradient id="gj-knob" cx="0.35" cy="0.3" r="0.8">` +
            `<stop offset="0" stop-color="${J.tin[700]}"/><stop offset="1" stop-color="${J.hole}"/></radialGradient>` +
            `<linearGradient id="gj-reel-shade" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${J.hole}" stop-opacity="0.75"/><stop offset="0.3" stop-color="${J.hole}" stop-opacity="0"/>` +
            `<stop offset="0.85" stop-color="${J.hole}" stop-opacity="0"/><stop offset="1" stop-color="${J.hole}" stop-opacity="0.35"/></linearGradient>` +
            `<linearGradient id="gj-shade-x" x1="0" y1="0" x2="1" y2="0">` +
            `<stop offset="0" stop-color="${J.hole}" stop-opacity="0.5"/><stop offset="1" stop-color="${J.hole}" stop-opacity="0"/></linearGradient>` +
            `<linearGradient id="gj-rust" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${J.rust[500]}" stop-opacity="0.85"/><stop offset="1" stop-color="${J.rust[300]}" stop-opacity="0"/></linearGradient>` +
            lin('gj-pine', J.pine[100], J.pine[300], 0.4, 1) +
            lin('gj-plastic', J.plastic.hi, J.plastic.lo, 0.4, 1) +
            lin('gj-alu', J.alu[300], J.alu[500], 1, 0.15) +
            lin('gj-yellowed', J.paint.cream, J.plastic.base, 0.4, 1) +
            lin('gj-slab-face', J.slab.face, J.slab.faceLo, 0.2, 1) +
            `<linearGradient id="gj-sheen" x1="0" y1="0" x2="0.4" y2="1">` +
            `<stop offset="0" stop-color="${J.painted.hi}" stop-opacity="0.35"/><stop offset="1" stop-color="${J.painted.lo}" stop-opacity="0.3"/></linearGradient>` +
            `<linearGradient id="gj-chip-light" x1="0" y1="0" x2="0.4" y2="1">` +
            `<stop offset="0" stop-color="${J.chip.hi}" stop-opacity="0.3"/><stop offset="1" stop-color="${J.chip.dark}" stop-opacity="0.25"/></linearGradient>` +
            this.chipPattern() +
            `<radialGradient id="gj-vign" cx="0.5" cy="0.45" r="0.7">` +
            `<stop offset="0.55" stop-color="${J.hole}" stop-opacity="0"/><stop offset="1" stop-color="${J.hole}" stop-opacity="0.5"/></radialGradient>` +
            `<radialGradient id="gj-dirt" cx="0.5" cy="1" r="0.9">` +
            `<stop offset="0" stop-color="${J.wood[900]}" stop-opacity="0.45"/><stop offset="1" stop-color="${J.wood[900]}" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="gj-hole" cx="0.5" cy="0.42" r="0.6">` +
            `<stop offset="0" stop-color="${J.wood[900]}"/><stop offset="1" stop-color="${J.hole}"/></radialGradient>` +
            '</defs>';
    },

    // Узор ДСП: плитка из хлопьев трёх тонов на бежевом. Одна плитка на весь
    // корпус — браузер растрирует её один раз (узор неподвижен).
    chipPattern() {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(907);
        const T = 26;
        let g = `<rect width="${T}" height="${T}" fill="${J.chip.base}"/>`;
        const tones = [J.chip.hi, J.chip.lo, J.chip.hi, J.chip.dark, J.chip.lo];
        for (let i = 0; i < 70; i++) {
            const cx = rnd() * T, cy = rnd() * T, r = 0.6 + rnd() * 1.6, a = rnd() * 6;
            const pts = [0, 2.1, 4.2].map(t => f(cx + Math.cos(a + t) * r * (0.6 + rnd() * 0.6)) + ',' + f(cy + Math.sin(a + t) * r * (0.6 + rnd() * 0.6)));
            g += `<polygon points="${pts.join(' ')}" fill="${tones[i % tones.length]}" opacity="${f(0.5 + rnd() * 0.5)}"/>`;
        }
        return `<pattern id="gj-chip" width="${T}" height="${T}" patternUnits="userSpaceOnUse">${g}</pattern>`;
    },

    // ---------- ДОСКИ ----------
    // Щит из досок: каждая доска своей заливкой чуть другого тона, шов —
    // линией структуры, волокно — тонкими дугами, у концов гвозди. Доска
    // «чуть другого тона» и даёт сборку из разного: один цвет на весь щит
    // читался бы фанерой из магазина.
    // jag — на сколько доски щита могут не доставать до верхнего края:
    // отпиленные на глаз, они торчат лесенкой, и силуэт перестаёт быть
    // заводским прямоугольником.
    planks(x, y, w, h, n, seed, dir, jag, mat) {
        const J = PALETTE.greedJunk;
        const rnd = this.rng(seed);
        const f = this.f;
        const grads = ['gj-wood', 'gj-wood-dark', 'gj-wood-light'];
        let out = '';
        const vertical = dir === 'v';
        const step = (vertical ? w : h) / n;
        const tops = [];
        for (let i = 0; i < n; i++) {
            const dy = (vertical && jag) ? Math.round(rnd() * jag) : 0;
            tops.push(dy);
            const px = vertical ? x + i * step : x;
            const py = (vertical ? y : y + i * step) + dy;
            const pw = vertical ? step : w;
            const ph = (vertical ? h : step) - dy;
            const g = grads[Math.floor(rnd() * 3) % 3];
            if (mat) {
                // доска из материала: своя фактура вместо общей заливки и волокна
                out += this.material(mat, px, py, pw, ph, seed * 31 + i, vertical);
                const top = vertical ? `M${f(px + 2)} ${f(py + 3)} L${f(px + 2)} ${f(py + ph - 3)}` : `M${f(px + 3)} ${f(py + 2)} L${f(px + pw - 3)} ${f(py + 2)}`;
                out += `<path d="${top}" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.5"/>`;
                continue;
            }
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
            // светлая кромка, на которую падает свет сверху-слева
            out += vertical
                ? `<line x1="${f(px + 2)}" y1="${f(py + 3)}" x2="${f(px + 2)}" y2="${f(py + ph - 3)}" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.55"/>`
                : `<line x1="${f(px + 3)}" y1="${f(py + 2)}" x2="${f(px + pw - 3)}" y2="${f(py + 2)}" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.55"/>`;
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
        if (vertical && jag) {
            // контур идёт по лесенке верхних концов досок
            let d = `M${f(x)} ${f(y + h)} L${f(x)} ${f(y + tops[0])}`;
            for (let i = 0; i < n; i++) {
                d += ` L${f(x + (i + 1) * step)} ${f(y + tops[i])}`;
                if (i < n - 1) d += ` L${f(x + (i + 1) * step)} ${f(y + tops[i + 1])}`;
            }
            d += ` L${f(x + w)} ${f(y + h)} Z`;
            out += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}" stroke-linejoin="round"/>`;
            return out;
        }
        out += `<path d="${this.wob(x, y, w, h, seed, 1.4)}" fill="none" ` +
            `stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>`;
        return out;
    },

    // ---------- МАТЕРИАЛЫ ДЕРЕВА ----------
    // Деревянные детали собраны из трёх материалов (PALETTE.greedJunk):
    //   pine    — сосна необработанная: светлая, волокно волнами, смоляные
    //             тёмные слои, сучки;
    //   chip    — ДСП: крошка без волокна (узор из хлопьев), рыхлый край;
    //   painted — доска от дешёвой лакированной мебели: тёмно-коричневый
    //             лак с потёками, местами стёрт до светлого шпона.
    // Один материал на всё выглядел пластиком: доски отличались только тоном.
    // Возвращает заливку и фактуру детали, без внешнего контура.
    material(mat, x, y, w, h, seed, vertical) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        const path = this.wob(x, y, w, h, seed, mat === 'chip' ? 1.8 : 1);
        const id = 'gj-c' + seed;
        let out = `<clipPath id="${id}"><path d="${path}"/></clipPath>`;
        const long = vertical ? h : w, short = vertical ? w : h;
        // точка вдоль (a — по длине, b — поперёк) в координаты поля
        const at = (a, b) => vertical ? [x + b, y + a] : [x + a, y + b];

        if (mat === 'chip') {
            out += `<path d="${path}" fill="url(#gj-chip)"/>`;
            out += `<path d="${path}" fill="url(#gj-chip-light)"/>`;
            // пятно от сырости — ДСП разбухает и темнеет
            const [sx, sy] = at(long * (0.3 + rnd() * 0.4), short * 0.5);
            out += `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(short * 0.45)}" ry="${f(short * 0.6)}" fill="${J.chip.dark}" opacity="0.18" clip-path="url(#${id})"/>`;
            return out;
        }

        if (mat === 'painted') {
            out += `<path d="${path}" fill="${J.painted.base}"/>`;
            let g = '';
            // потёки лака вдоль доски
            for (let i = 0; i < 6; i++) {
                const b = short * (0.1 + rnd() * 0.8);
                const [x1, y1] = at(rnd() * long * 0.3, b), [x2, y2] = at(long * (0.6 + rnd() * 0.4), b + (rnd() - 0.5) * 2);
                g += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${i % 2 ? J.painted.hi : J.painted.lo}" stroke-width="${STROKE.hairline}" opacity="0.6"/>`;
            }
            // стёртые места: светлый шпон с волокном, кромка лака по краю
            const peels = 2 + Math.floor(rnd() * 3);
            for (let i = 0; i < peels; i++) {
                const ca = long * (0.1 + rnd() * 0.8), cb = short * (rnd() < 0.5 ? 0.15 : 0.85);
                const ra = 6 + rnd() * long * 0.08, rb = 3 + rnd() * short * 0.35;
                const pts = [];
                for (let k = 0; k < 9; k++) {
                    const t = (k / 9) * Math.PI * 2, j = 0.6 + rnd() * 0.5;
                    pts.push(at(ca + Math.cos(t) * ra * j, cb + Math.sin(t) * rb * j));
                }
                const d = 'M' + pts.map(q => f(q[0]) + ' ' + f(q[1])).join(' L') + ' Z';
                g += `<path d="${d}" fill="${J.painted.bare}" stroke="${J.painted.hi}" stroke-width="${STROKE.detail}"/>`;
                const [lx1, ly1] = at(ca - ra * 0.7, cb), [lx2, ly2] = at(ca + ra * 0.7, cb + 0.6);
                g += `<line x1="${f(lx1)}" y1="${f(ly1)}" x2="${f(lx2)}" y2="${f(ly2)}" stroke="${J.painted.bareLo}" stroke-width="${STROKE.hairline}"/>`;
            }
            out += `<g clip-path="url(#${id})">${g}</g>`;
            out += `<path d="${path}" fill="url(#gj-sheen)"/>`;
            return out;
        }

        // сосна
        out += `<path d="${path}" fill="url(#gj-pine)"/>`;
        let g = '';
        const knot = rnd() < 0.6 ? at(long * (0.15 + rnd() * 0.7), short * (0.3 + rnd() * 0.4)) : null;
        const lines = Math.max(3, Math.round(short / 6));
        for (let l = 0; l < lines; l++) {
            const b0 = short * ((l + 0.5) / lines) + (rnd() - 0.5) * 3;
            const pts = [];
            const phase = rnd() * 6, amp = 0.8 + rnd() * 1.6;
            for (let st = 0; st <= 7; st++) {
                let [px, py] = at(long * st / 7, b0 + Math.sin(phase + st * 1.2) * amp);
                if (knot) {
                    const dx = px - knot[0], dy = py - knot[1], d = Math.hypot(dx, dy);
                    if (d < 20) {
                        if (vertical) px += Math.sign(dx || 1) * (20 - d) * 0.4;
                        else py += Math.sign(dy || 1) * (20 - d) * 0.4;
                    }
                }
                pts.push([px, py]);
            }
            // каждый третий слой — смоляной: темнее и толще
            const resin = l % 3 === 1;
            g += `<path d="${this.smooth(pts)}" fill="none" stroke="${resin ? J.pine.resin : J.pine[700]}" ` +
                `stroke-width="${resin ? STROKE.detail : STROKE.hairline}" opacity="${f(resin ? 0.55 : 0.5 + rnd() * 0.3)}"/>`;
        }
        if (knot) {
            const [rx, ry] = vertical ? [3, 5.5] : [5.5, 3];
            g += `<ellipse cx="${f(knot[0])}" cy="${f(knot[1])}" rx="${rx * 1.8}" ry="${ry * 1.8}" fill="none" stroke="${J.pine.resin}" stroke-width="${STROKE.hairline}" opacity="0.6"/>` +
                `<ellipse cx="${f(knot[0])}" cy="${f(knot[1])}" rx="${rx}" ry="${ry}" fill="${J.pine.knot}" stroke="${J.pine.resin}" stroke-width="${STROKE.detail}"/>`;
        }
        out += `<g clip-path="url(#${id})">${g}</g>`;
        return out;
    },

    // ---------- ЗАДНЯЯ СТЕНКА ----------
    // Доски с разных ящиков и кусок ДСП: разной ширины и материала, с
    // щелями, в которые видно темноту. Гвозди — тёмное железо парами на
    // высоте скрытых за стенкой брусков.
    BACK_MATS: ['pine', 'chip', 'pine', 'painted', 'pine', 'chip', 'painted', 'pine'],
    backPlanks(x, y, w, h, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        const WIDTH = { pine: [32, 14], chip: [56, 18], painted: [30, 10] };
        const parts = [];
        let total = 0, i = 0;
        while (total < w - 24) {
            const mat = this.BACK_MATS[i % this.BACK_MATS.length];
            const pw = WIDTH[mat][0] + Math.floor(rnd() * WIDTH[mat][1]);
            parts.push({ mat, pw }); total += pw; i++;
        }
        const k = w / total;
        let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${J.hole}"/>`;   // темнота в щелях
        let px = x;
        parts.forEach((p, i) => {
            const pw = p.pw * k;
            const gap = 1.2 + rnd() * 1.8;
            const bx = px + (i ? gap / 2 : 0), bw = pw - (i ? gap / 2 : 0) - (i < parts.length - 1 ? gap / 2 : 0);
            out += this.material(p.mat, bx, y - 2, bw, h + 4, seed * 7 + i * 13, true);
            // светлая кромка слева (свет сверху-слева), тёмная справа
            out += `<line x1="${f(bx + 1.2)}" y1="${y}" x2="${f(bx + 1.2)}" y2="${y + h}" stroke="${J.wood[100]}" stroke-width="${STROKE.hairline}" opacity="0.45"/>`;
            out += `<line x1="${f(bx + bw - 1)}" y1="${y}" x2="${f(bx + bw - 1)}" y2="${y + h}" stroke="${J.wood[900]}" stroke-width="${STROKE.detail}" opacity="0.55"/>`;
            [y + 18, y + h * 0.48, y + h - 16].forEach(ny => {
                [bx + bw * 0.3, bx + bw * 0.7].forEach(nx => { out += this.ironNail(nx, ny + (rnd() - 0.5) * 3); });
            });
            px += pw;
        });
        return out;
    },

    // Железный гвоздь: тёмная шляпка, рыжий ободок, светлая точка блика.
    ironNail(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="2.1" fill="${J.rust[700]}" opacity="0.5"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="1.4" fill="${J.tin[900]}"/>` +
            `<circle cx="${f(x - 0.4)}" cy="${f(y - 0.4)}" r="0.5" fill="${J.tin[300]}"/>`;
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
        // Шлиц повёрнут как попало: болты закручивали по одному, а не
        // выставляли в линию. Блик на шляпке — сверху-слева.
        const a = ((x * 7.3 + y * 3.1) % 180) * Math.PI / 180;
        const c = Math.cos(a) * r * 0.62, s = Math.sin(a) * r * 0.62;
        return `<circle cx="${f(x + 0.5)}" cy="${f(y + 0.8)}" r="${r}" fill="${J.hole}" opacity="0.35"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x - r * 0.25)}" cy="${f(y - r * 0.25)}" r="${f(r * 0.55)}" fill="${J.tin[100]}" opacity="0.7"/>` +
            `<line x1="${f(x - c)}" y1="${f(y - s)}" x2="${f(x + c)}" y2="${f(y + s)}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>`;
    },

    // Ржавый потёк под болтом: узкая полоска, тающая книзу. Раньше это был
    // сплошной треугольник одного тона — читался оранжевой морковкой.
    rustRun(x, y, len, seed) {
        const f = this.f;
        const rnd = this.rng(seed);
        const w = 0.9 + rnd() * 0.8, bend = (rnd() - 0.5) * 2;
        return `<path d="M${f(x - w)} ${f(y)} q${f(bend)} ${f(len * 0.6)} ${f(w * 0.7 + bend)} ${f(len)} ` +
            `q${f(w * 0.3)} ${f(-len * 0.4)} ${f(w * 1.3 - bend)} ${f(-len)} z" fill="url(#gj-rust)"/>`;
    },

    tin(x, y, w, h, seed, opts) {
        const J = PALETTE.greedJunk, f = this.f;
        const o = opts || {};
        const rnd = this.rng(seed);
        // Пластина прикручена чуть криво — на глаз. Угол маленький: больше
        // двух градусов уже читается как падающая деталь.
        const tilt = o.tilt != null ? o.tilt : (rnd() - 0.5) * 3;
        let out = `<g transform="rotate(${f(tilt)} ${f(x + w / 2)} ${f(y + h / 2)})">`;
        // Тень от детали на то, к чему она прикручена: вниз-вправо, от света
        // сверху-слева. Смещение и плотность — от ВЫСОТЫ детали над
        // поверхностью (o.z, каталог высот — в шапке GreedJunk.Z). Одна общая
        // тень на всё делала плоскую латку висящей в воздухе.
        const z = o.z == null ? this.Z.plate : o.z;
        if (o.shadow !== false && z > 0) {
            out += `<path d="${this.wob(x + z * 0.45, y + z * 0.7, w, h, seed + 5)}" fill="${J.hole}" ` +
                `opacity="${f(Math.min(0.5, 0.12 + z * 0.035))}"/>`;
        }
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

    // ---------- КРЕПЁЖ ----------
    // Розетка питания «мама»: жестяная коробка, в ней чёрная колодка со
    // срезанными углами и три гнезда. Стоит в странных местах нарочно —
    // её ставили туда, где было удобно сверлить, а не красиво.
    socket(x, y, rot) {
        const J = PALETTE.greedJunk, f = this.f;
        const w = 26, h = 22;
        return `<g transform="rotate(${rot || 0} ${f(x + w / 2)} ${f(y + h / 2)})">` +
            this.tin(x, y, w, h, Math.round(x * 3 + y), { bolts: false, scratches: 0, tilt: 0, z: this.Z.box }) +
            `<path d="M${f(x + 7)} ${f(y + 4)} h12 l3 3 v8 l-3 3 h-12 l-3 -3 v-8 z" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${f(x + 8.5)}" y="${f(y + 9)}" width="2" height="4" fill="${J.tin[300]}"/>` +
            `<rect x="${f(x + 15.5)}" y="${f(y + 9)}" width="2" height="4" fill="${J.tin[300]}"/>` +
            `<rect x="${f(x + 12)}" y="${f(y + 6)}" width="2" height="2.5" fill="${J.tin[300]}"/>` +
            this.bolt(x + 2.8, y + h / 2, 1.6) + this.bolt(x + w - 2.8, y + h / 2, 1.6) +
            `</g>`;
    },

    // Бытовая накладная розетка: пожелтевшая пластмасса, круглый корпус,
    // в углублении два гнезда и металлические усики заземления. Повёрнута
    // как прикрутили — под углом: ровно стоящие две дырки с винтом между
    // ними читались рожицей.
    socketHome(cx, cy) {
        const J = PALETTE.greedJunk, f = this.f;
        const z = this.Z.rail;
        let g = `<circle cx="${f(z * 0.45)}" cy="${f(z * 0.7)}" r="13" fill="${J.hole}" opacity="0.32"/>`;
        g += `<circle r="13" fill="url(#gj-yellowed)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        g += `<path d="M-10 -5 a11 11 0 0 1 9 -6" fill="none" stroke="${J.plastic.hi}" stroke-width="${STROKE.detail}" opacity="0.9"/>`;
        // углубление: тёмный верх (стенка закрыта от света), светлая нижняя кромка
        g += `<circle r="8" fill="${J.plastic.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        g += `<path d="M-7.6 1.5 a8 8 0 0 0 15.2 0" fill="none" stroke="${J.plastic.hi}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        g += `<circle cx="-3.4" cy="0" r="1.5" fill="${J.hole}"/><circle cx="3.4" cy="0" r="1.5" fill="${J.hole}"/>`;
        // усики заземления сверху и снизу
        g += `<rect x="-1.6" y="-8" width="3.2" height="2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
            `<rect x="-1.6" y="6" width="3.2" height="2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
        // крепёжный винт на ободе и трещина в пластмассе
        g += `<path d="M9 7 l2.6 2.8" stroke="${J.plastic.lo}" stroke-width="${STROKE.hairline}"/>`;
        let out = `<g transform="translate(${cx} ${cy}) rotate(-24)">${g}</g>`;
        out += this.bolt(cx - 10.5, cy - 2.5, 1.5);
        return out;
    },

    // Промышленное гнездо в железной коробке: коробка прикручена к
    // сосновому бруску (своя толщина — своя тень), в лицевой стенке
    // колодка со срезанными углами и три гнезда.
    socketPanel(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = this.material('pine', x - 4, y - 5, 36, 34, 731, false);
        out += `<path d="${this.wob(x - 4, y - 5, 36, 34, 731, 1)}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out = `<path d="${this.wob(x - 1, y, 36, 34, 731, 1)}" fill="${J.hole}" opacity="0.35"/>` + out;
        out += this.ironNail(x - 1, y - 2) + this.ironNail(x + 29, y + 26);
        out += this.tin(x, y, 28, 24, 732, { bolts: false, scratches: 1, tilt: 0, z: this.Z.box });
        out += `<path d="M${f(x + 7)} ${f(y + 4)} h14 l3 3 v10 l-3 3 h-14 l-3 -3 v-10 z" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        out += `<path d="M${f(x + 5)} ${f(y + 16)} l2 3 h14 l2 -3" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        [[x + 9.5, y + 10.5], [x + 17.5, y + 10.5], [x + 13.5, y + 6.5]].forEach(([hx, hy], i) => {
            out += `<rect x="${f(hx)}" y="${f(hy)}" width="2" height="${i === 2 ? 2.5 : 4}" fill="${J.tin[300]}"/>`;
        });
        out += this.bolt(x + 3, y + 12, 1.6) + this.bolt(x + 25, y + 12, 1.6);
        return out;
    },

    // Гофра — рифлёная трубка, в которой идёт провод: тёмный шланг с
    // поперечными рёбрами.
    conduit(pts) {
        const J = PALETTE.greedJunk;
        const d = this.smooth(pts);
        return `<path d="${d}" fill="none" stroke="${J.hole}" stroke-width="6" stroke-linecap="round" opacity="0.3" transform="translate(1.2 2)"/>` +
            `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="7" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[700]}" stroke-width="5"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="5" stroke-dasharray="1.2 1.6"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[300]}" stroke-width="0.8" opacity="0.6" transform="translate(-1 -0.6)"/>`;
    },

    // Шпилька с резьбой, торчащая из фланца: на неё наденут крепление.
    stud(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        const z = this.Z.shelf;
        return `<ellipse cx="${f(x + z * 0.35)}" cy="${f(y + z * 0.55)}" rx="4" ry="5" fill="${J.hole}" opacity="0.4" ` +
            `transform="rotate(-33 ${f(x + z * 0.35)} ${f(y + z * 0.55)})"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="3.6" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="2" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<circle cx="${f(x - 1)}" cy="${f(y - 1)}" r="0.9" fill="${J.tin[100]}"/>`;
    },

    // ---------- НАПРАВЛЯЮЩАЯ ПАЧИНКО ----------
    // Алюминиевый швеллер пазом к нам: в него сверху задвинут короб
    // пачинко. Анфас показывает паз глубоким: левая стенка паза в тени
    // (закрыта от света сверху-слева), правая освещена, дно тёмное. Сверху
    // губы отогнуты раструбом — чтобы короб попадал в пазы. Держат рельс три
    // одноухие скобы на шурупах (ухо наружу). Алюминий белёсый в пятнах
    // окисла — не ржавеет, этим и отличается от железного уголка рядом.
    // Раньше это были серые полосы с лесенкой зарубок — линейки.
    rail(x, y, w, h, side, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const A = J.alu;
        const rnd = this.rng(seed);
        const z = this.Z.rail;
        let out = '';
        const flare = 10;
        const body = `M${f(x - 3)} ${f(y)} L${f(x + w + 3)} ${f(y)} L${f(x + w)} ${f(y + flare)} L${f(x + w)} ${f(y + h)} ` +
            `L${f(x)} ${f(y + h)} L${f(x)} ${f(y + flare)} Z`;
        out += `<path d="${body}" fill="${J.hole}" opacity="0.34" transform="translate(${f(z * 0.45)} ${f(z * 0.7)})"/>`;
        out += `<path d="${body}" fill="url(#gj-alu)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        // паз
        const sx = x + 3.6, sw = w - 7.2;
        const slot = `M${f(sx - 2)} ${f(y + 1.5)} L${f(sx + sw + 2)} ${f(y + 1.5)} L${f(sx + sw)} ${f(y + flare)} L${f(sx + sw)} ${f(y + h - 3)} ` +
            `L${f(sx)} ${f(y + h - 3)} L${f(sx)} ${f(y + flare)} Z`;
        out += `<path d="${slot}" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        out += `<rect x="${f(sx)}" y="${f(y + flare)}" width="2" height="${f(h - flare - 3)}" fill="${A[700]}" opacity="0.5"/>`;
        out += `<line x1="${f(sx + sw - 0.6)}" y1="${f(y + flare)}" x2="${f(sx + sw - 0.6)}" y2="${f(y + h - 3)}" stroke="${A[300]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        // губы: освещённая кромка слева, тёмная справа
        out += `<line x1="${f(x + 1)}" y1="${f(y + flare)}" x2="${f(x + 1)}" y2="${f(y + h - 1)}" stroke="${A[100]}" stroke-width="${STROKE.detail}"/>`;
        out += `<line x1="${f(x + w - 1)}" y1="${f(y + flare)}" x2="${f(x + w - 1)}" y2="${f(y + h - 1)}" stroke="${A[700]}" stroke-width="${STROKE.detail}"/>`;
        // пятна окисла
        for (let i = 0; i < 5; i++) {
            const ox = x + 1 + rnd() * 2.2 + (rnd() < 0.5 ? 0 : w - 4.5), oy = y + flare + rnd() * (h - flare - 6);
            out += `<ellipse cx="${f(ox)}" cy="${f(oy)}" rx="1.1" ry="${f(2 + rnd() * 3)}" fill="${A.oxide}" opacity="0.7"/>`;
        }
        // одноухие скобы
        [0.22, 0.55, 0.86].forEach((t, i) => {
            const yy = y + flare + (h - flare) * t + (rnd() - 0.5) * 4;
            const ex = side < 0 ? x - 9 : x + w + 1;
            out += `<rect x="${f(x - 1.5)}" y="${f(yy - 2.5)}" width="${f(w + 3)}" height="5" rx="1.6" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<line x1="${f(x)}" y1="${f(yy - 1.4)}" x2="${f(x + w)}" y2="${f(yy - 1.4)}" stroke="${J.tin[100]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>` +
                `<rect x="${f(ex)}" y="${f(yy - 3)}" width="8" height="6" rx="2" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                this.bolt(ex + 4, yy, 1.6);
        });
        return out;
    },

    // Отверстие под болт: тёмная дырка с ободком — «здесь что-то прикрутят».
    hole(x, y, r) {
        const J = PALETTE.greedJunk, f = this.f;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${r || 2.4}" fill="${J.hole}" stroke="${J.wood[900]}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M${f(x - (r || 2.4))} ${f(y + 0.6)} a${r || 2.4} ${r || 2.4} 0 0 0 ${f((r || 2.4) * 2)} 0" fill="none" stroke="${J.wood[100]}" stroke-width="${STROKE.hairline}" opacity="0.6"/>`;
    },

    // Гладкая кривая через точки (Катмулл — Ром → кубические Безье).
    // Провод — не ломаная: он гнётся плавно, без изломов.
    smooth(pts) {
        const f = this.f;
        let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
                `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
        }
        return d;
    },

    // ---------- ЖГУТ ПРОВОДОВ ----------
    // Провода к будущим играм: выходят из круглой распаечной коробки через
    // сальник, первые сантиметры стянуты пластиковой стяжкой и скручены
    // между собой, дальше жилы расходятся под своим весом, каждая своей
    // длины. Концы разные — кто-то уже готовил подключение: кольцевая
    // клемма, колпачок-скрутка, голая медь, конец загнут и примотан.
    // Раньше жилы торчали из ниоткуда, висели коротко и параллельно, а
    // концы были оранжевыми точками.
    harness(x, y, len, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        let out = this.junctionBox(x, y - 12, seed);
        const colors = [J.paint.red, J.paint.blue, J.paint.yellow, J.tin[900]];
        const ends = ['ring', 'cap', 'bare', 'loop'];
        const top = y, tie = y + len * 0.28;
        // концы жил вразнобой
        const wires = colors.map((c, i) => {
            const side = (i - 1.5);
            const ex = x + side * (5 + rnd() * 4) + (rnd() - 0.5) * 6;
            const ey = y + len * (0.75 + rnd() * 0.45);
            return { c, end: ends[(i + seed) % 4], pts: [
                [x + side * 1.3, top],
                // скрутка: жилы меняются местами, пока стянуты
                [x + Math.sin(i * 1.7) * 1.6, top + len * 0.14],
                [x + side * 1.2, tie],
                [x + side * 3 + (rnd() - 0.5) * 3, y + len * 0.5],
                [ex, ey]
            ] };
        });
        // сначала тени всех жил, потом сами жилы — тень не ложится на соседку
        wires.forEach(w => {
            out += `<path d="${this.smooth(w.pts)}" fill="none" stroke="${J.hole}" stroke-width="3" stroke-linecap="round" opacity="0.3" transform="translate(1 1.6)"/>`;
        });
        wires.forEach(w => {
            const d = this.smooth(w.pts);
            out += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="3.4" stroke-linecap="round"/>` +
                `<path d="${d}" fill="none" stroke="${w.c}" stroke-width="2" stroke-linecap="round"/>` +
                `<path d="${d}" fill="none" stroke="${J.plastic.hi}" stroke-width="0.5" stroke-linecap="round" opacity="0.55" transform="translate(-0.5 -0.3)"/>`;
            out += this.wireEnd(w.end, w.pts[w.pts.length - 1], w.pts[w.pts.length - 2], w.c);
        });
        // стяжка: тонкий хомут поперёк жгута, замок сбоку, обрезанный хвост
        out += `<rect x="${f(x - 6)}" y="${f(tie - 1.4)}" width="12" height="2.8" rx="1.2" fill="${J.plastic.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${f(x + 5)}" y="${f(tie - 2.6)}" width="4" height="5.2" rx="0.8" fill="${J.plastic.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<line x1="${f(x + 9)}" y1="${f(tie)}" x2="${f(x + 12)}" y2="${f(tie + 1.2)}" stroke="${J.plastic.base}" stroke-width="1.6" stroke-linecap="square"/>`;
        return out;
    },

    // Круглая серая распаечная коробка: крышка на винте, выпуклый
    // обод, снизу сальник, из которого выходит жгут.
    junctionBox(x, y, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = `<circle cx="${f(x + 1.6)}" cy="${f(y + 2.6)}" r="10" fill="${J.hole}" opacity="0.35"/>`;
        out += `<circle cx="${f(x)}" cy="${f(y)}" r="10" fill="url(#gj-plastic)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="none" stroke="${J.plastic.lo}" stroke-width="${STROKE.detail}"/>`;
        out += `<path d="M${f(x - 6)} ${f(y - 3)} a7 7 0 0 1 8 -4" fill="none" stroke="${J.plastic.hi}" stroke-width="${STROKE.detail}"/>`;
        // Один винт по центру и литые рёбра крышки. Два винта рядом
        // складывались с сальником в рожицу.
        out += `<path d="M${f(x - 6.5)} ${f(y + 3.5)} L${f(x + 6.5)} ${f(y - 3.5)}" stroke="${J.plastic.lo}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        out += this.bolt(x, y, 1.8);
        // сальник снизу
        out += `<rect x="${f(x - 4)}" y="${f(y + 8.5)}" width="8" height="5" rx="1.2" fill="${J.plastic.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        return out;
    },

    // Конец жилы. dir — откуда жила пришла, чтобы клемма и колпачок
    // смотрели вдоль провода, а не все строго вниз.
    wireEnd(kind, e, prev, color) {
        const J = PALETTE.greedJunk, f = this.f;
        const ang = Math.atan2(e[1] - prev[1], e[0] - prev[0]) * 180 / Math.PI;
        const g = (inner) => `<g transform="translate(${f(e[0])} ${f(e[1])}) rotate(${f(ang)})">${inner}</g>`;
        if (kind === 'ring') {
            // кольцевая клемма: гильза и плоское кольцо
            return g(`<rect x="-1" y="-2" width="5" height="4" rx="1" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="7" cy="0" r="3.2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="7" cy="0" r="1.3" fill="${J.hole}"/>`);
        }
        if (kind === 'cap') {
            // колпачок-скрутка: оранжевый конус
            return g(`<path d="M-1 -2.6 L6 -1.6 Q8 0 6 1.6 L-1 2.6 Z" fill="${J.paint.orange}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<line x1="1.5" y1="-2" x2="1.5" y2="2" stroke="${J.rust[700]}" stroke-width="${STROKE.hairline}"/>`);
        }
        if (kind === 'bare') {
            // голая медь: изоляция снята, жилки чуть растопырены
            return g(`<path d="M0 -0.8 l5 -1.2 M0 0 l5.4 0.2 M0 0.8 l4.6 1.4" stroke="${J.copper}" stroke-width="0.9" stroke-linecap="round"/>`);
        }
        // загнут обратно и примотан изолентой
        return g(`<path d="M0 0 q4 0 4 -3 q0 -3 -3 -3" fill="none" stroke="${PALETTE.ink}" stroke-width="3.4" stroke-linecap="round"/>` +
            `<path d="M0 0 q4 0 4 -3 q0 -3 -3 -3" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>` +
            `<rect x="-2" y="-4.5" width="4" height="6" rx="1" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`);
    },

    // ---------- ЧАСТИ КОРПУСА ----------
    // Задний щит с креплениями. Креплениями, а НЕ гнёздами по форме игр:
    // сначала на корпус ставится переходник своей формы, к нему цепляются
    // провода, и только на него — аппаратура (референс docs/ref/greed-machine-junk-empty.jpg).
    topBox() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        // Задняя стенка ящика: она в глубине, поэтому темнее рамки — свет до
        // неё доходит хуже.
        let out = this.backPlanks(28, 24, 288, 270, 211);
        out += `<rect x="28" y="24" width="288" height="270" fill="${J.hole}" opacity="0.28"/>`;
        out += `<rect x="28" y="24" width="288" height="270" fill="url(#gj-vign)"/>`;
        // поперечина-перекладина, на которой всё висит
        out += this.slabBar();
        // жестяная решётка внизу щита
        out += this.tin(34, 270, 276, 20, 21, { bolts: false, scratches: 2, tilt: 0, z: this.Z.strap });
        for (let i = 0; i < 17; i++) {
            const vx = 46 + i * 15;
            if (vx > 140 && vx < 200) continue;
            out += `<rect x="${f(vx)}" y="275" width="7" height="10" rx="1.6" fill="${J.hole}"/>`;
        }
        out += `<rect x="146" y="273" width="48" height="14" rx="2" fill="${J.paint.red}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="150" y="276" width="16" height="3" fill="${J.paint.cream}" opacity="0.5"/>`;

        // ---- крепление колеса: ступица от машины на перфоуголке ----
        const w = S.wheel;
        out += this.wheelMount(w.cx, w.cy);
        out += this.socketHome(65, 58);
        out += this.powerCable();
        out += this.harness(w.cx + 72, w.cy - 70, 52, 34);
        // крышка от консервной банки на дыре в доске — латка
        out += `<circle cx="64.5" cy="246.8" r="15" fill="${J.hole}" opacity="0.18"/>` +
            `<circle cx="64" cy="246" r="15" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<circle cx="64" cy="246" r="11" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="64" cy="246" r="7" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<path d="M52 240 a13 13 0 0 1 10 -8" fill="none" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}"/>`;
        [0, 1, 2].forEach(i => { out += this.nail(64 + Math.cos(i * 2.1) * 13, 246 + Math.sin(i * 2.1) * 13); });

        // коробка-вентилятор от чьего-то блока питания между креплениями
        out += this.tin(160, 222, 30, 30, 39, { boltR: 1.8, tilt: -4, z: this.Z.fan });
        out += `<circle cx="175" cy="237" r="10" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + 0.4;
            out += `<path d="M175 237 q${f(Math.cos(a) * 6 - Math.sin(a) * 3)} ${f(Math.sin(a) * 6 + Math.cos(a) * 3)} ${f(Math.cos(a) * 9)} ${f(Math.sin(a) * 9)}" stroke="${J.tin[500]}" stroke-width="${STROKE.detail}" fill="none"/>`;
        }
        out += `<circle cx="175" cy="237" r="2.4" fill="${J.tin[300]}"/>`;

        // ---- крепление пачинко: два рельса, полка-упор и розетка сбоку ----
        const p = S.pachinko;
        out += this.rail(p.x + 8, p.y + 6, 14, p.h - 24, -1, 41);
        out += this.rail(p.x + p.w - 34, p.y + 6, 14, p.h - 24, 1, 42);
        // уголок-полка, на которую встанет короб
        out += this.tin(p.x - 4, p.y + p.h - 22, p.w + 8, 14, 43, { boltR: 2, tilt: 0, z: this.Z.shelf });
        out += `<line x1="${p.x}" y1="${p.y + p.h - 9}" x2="${p.x + p.w}" y2="${p.y + p.h - 9}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>`;
        // монтажная пластина между рельсами с рядами дыр
        out += this.tin(p.x + 32, p.y + 50, p.w - 70, 70, 44, { boltR: 2, tilt: 2 });
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
            out += this.hole(p.x + 40 + c * 12, p.y + 75 + r * 16, 2);
        }
        // Промышленное гнездо на бруске между рельсами; от него гофра к
        // распаечной коробке жгута — подводка видна, гнездо не висит само по себе.
        out += this.conduit([[p.x + 38, p.y + 156], [p.x + 37, p.y + 172], [p.x + 41, p.y + 184], [p.x + 48, p.y + 187]]);
        out += this.socketPanel(p.x + 34, p.y + 130);
        out += this.harness(p.x + 58, p.y + 197, 22, 45);
        out += this.topFrame();
        return out;
    },

    // ---------- КРЕПЛЕНИЕ КОЛЕСА ----------
    // Ось колеса — ступица с тормозным диском от старой машины: колесо
    // фортуны сядет на её колёсные шпильки, как автомобильное. Держат
    // ступицу три куска перфорированного уголка, сходящиеся к ней с разных
    // сторон и разной длины, — из чего было. Концы уголков посажены на
    // глухари с широкими шайбами: в доску по-другому не прикрутишь.
    // Раньше тут была крестовина из двух полос — читалась знаком «плюс».
    wheelMount(cx, cy) {
        let out = '';
        out += this.angleIron(156, 54, cx + 4, cy - 8, 511);
        out += this.angleIron(118, 262, cx + 2, cy + 8, 512);
        out += this.angleIron(cx + 10, cy + 2, 196, cy + 6, 513);
        // переходная пластина под ступицей: вырезана болгаркой, углы косые
        out += this.cutPlate(cx, cy, 514);
        out += this.brakeDisc(cx, cy);
        return out;
    },

    // Перфорированный уголок от (x1,y1) до (x2,y2): лицевая полка с рядом
    // дыр — круглые через одну с продолговатыми, — и вторая полка, видимая
    // ребром узкой тёмной полосой снизу. На концах — глухари с шайбами.
    angleIron(x1, y1, x2, y2, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        const W = 12, lip = 3.2;
        let g = '';
        // тень: уголок стоит на ребре второй полки, приподнят
        g += `<rect x="1.5" y="${f(-W / 2 + 3)}" width="${f(len)}" height="${W + lip}" fill="${J.hole}" opacity="0.32"/>`;
        // вторая полка ребром — тёмная
        g += `<rect x="0" y="${f(W / 2 - 0.5)}" width="${f(len)}" height="${lip}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        // лицевая полка
        g += `<rect x="0" y="${f(-W / 2)}" width="${f(len)}" height="${W}" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        g += `<line x1="1" y1="${f(-W / 2 + 1)}" x2="${f(len - 1)}" y2="${f(-W / 2 + 1)}" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        // перфорация
        let k = 0;
        for (let t = 14; t < len - 12; t += 9, k++) {
            g += k % 2
                ? `<rect x="${f(t - 3)}" y="-1.5" width="6" height="3" rx="1.5" fill="${J.hole}"/>`
                : `<circle cx="${f(t)}" cy="0" r="1.7" fill="${J.hole}"/>`;
        }
        // ржавчина по кромке
        g += `<line x1="${f(len * 0.2)}" y1="${f(W / 2 - 1)}" x2="${f(len * 0.55)}" y2="${f(W / 2 - 1)}" stroke="${J.rust[500]}" stroke-width="1.6" opacity="0.5"/>`;
        let out = `<g transform="translate(${f(x1)} ${f(y1)}) rotate(${f(ang)})">${g}</g>`;
        out += this.lagBolt(x1 + (x2 - x1) * 6 / len, y1 + (y2 - y1) * 6 / len);
        return out;
    },

    // Глухарь с шайбой: широкая шайба, шестигранная головка, блик слева сверху.
    lagBolt(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        const hex = [0, 1, 2, 3, 4, 5].map(i => {
            const a = i * Math.PI / 3 + 0.3;
            return f(x + Math.cos(a) * 3.6) + ',' + f(y + Math.sin(a) * 3.6);
        }).join(' ');
        return `<circle cx="${f(x + 0.8)}" cy="${f(y + 1.3)}" r="6" fill="${J.hole}" opacity="0.35"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<polygon points="${hex}" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x - 1)}" cy="${f(y - 1)}" r="1.2" fill="${J.tin[100]}" opacity="0.8"/>`;
    },

    // Пластина-переходник: неровный многоугольник с косыми углами.
    cutPlate(cx, cy, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        const pts = [], radii = [];
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.2, r = 45 + rnd() * 7;
            radii.push(r);
            pts.push(f(cx + Math.cos(a) * r) + ' ' + f(cy + Math.sin(a) * r));
        }
        const d = 'M' + pts.join(' L') + ' Z';
        let out = `<path d="${d}" fill="${J.hole}" opacity="0.3" transform="translate(1.2 1.8)"/>`;
        out += `<path d="${d}" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        out += `<path d="${d}" fill="url(#gj-dirt)"/>`;
        // Отверстия у каждого угла: пластину сверлили под крепёж «с запасом»,
        // а прикрутили на три болта — остальные дыры пустые, с блестящей
        // заусеницей по нижней кромке (металл свежий, не успел потемнеть).
        // Раньше пустые дыры были разбросаны по доскам кругом — ни к чему
        // не относились и висели в воздухе.
        const used = [0, 3, 5];
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.2;
            const hx = cx + Math.cos(a) * (radii[i] - 8), hy = cy + Math.sin(a) * (radii[i] - 8);
            if (used.indexOf(i) !== -1) { out += this.bolt(hx, hy, 2.6); continue; }
            out += `<circle cx="${f(hx)}" cy="${f(hy)}" r="2.7" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<path d="M${f(hx - 2.7)} ${f(hy + 0.4)} a2.7 2.7 0 0 0 5.4 0" fill="none" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        }
        // следы болгарки по краю — короткие светлые чёрточки
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.6;
            out += `<line x1="${f(cx + Math.cos(a) * 39)}" y1="${f(cy + Math.sin(a) * 39)}" x2="${f(cx + Math.cos(a) * 43)}" y2="${f(cy + Math.sin(a) * 43)}" stroke="${J.tin[300]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>`;
        }
        return out;
    },

    // Тормозной диск со ступицей. Рабочая полоса диска блестит (по ней
    // ходили колодки — концентрические риски), кромка и центр ржавые.
    // Колпак ступицы выступает выше диска — своя тень. Пять колёсных
    // шпилек и гайка оси со шплинтом.
    brakeDisc(cx, cy) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = '';
        out += `<circle cx="${cx + 2.4}" cy="${cy + 3.8}" r="31" fill="${J.hole}" opacity="0.38"/>`;
        out += `<circle cx="${cx}" cy="${cy}" r="31" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>`;
        // риски от колодок
        for (let r = 20; r <= 28; r += 1.6) {
            out += `<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="none" stroke="${r % 3.2 < 1.6 ? J.tin[100] : J.tin[700]}" stroke-width="${STROKE.hairline}" opacity="0.55"/>`;
        }
        // ржавая кромка
        out += `<circle cx="${cx}" cy="${cy}" r="29.6" fill="none" stroke="${J.rust[500]}" stroke-width="2.4" opacity="0.6"/>`;
        // блик на рабочей полосе — сверху слева
        out += `<path d="M${f(cx - 24)} ${f(cy - 8)} A25 25 0 0 1 ${f(cx - 6)} ${f(cy - 24)}" fill="none" stroke="${J.tin[100]}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`;
        // колпак ступицы
        out += `<circle cx="${cx + 1.6}" cy="${cy + 2.6}" r="17" fill="${J.hole}" opacity="0.4"/>`;
        out += `<circle cx="${cx}" cy="${cy}" r="17" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="${J.rust[700]}" stroke-width="2" opacity="0.5"/>`;
        // колёсные шпильки
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const sx = cx + Math.cos(a) * 11.5, sy = cy + Math.sin(a) * 11.5;
            out += `<circle cx="${f(sx + 1.2)}" cy="${f(sy + 1.8)}" r="2.6" fill="${J.hole}" opacity="0.45"/>` +
                `<circle cx="${f(sx)}" cy="${f(sy)}" r="2.6" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${f(sx)}" cy="${f(sy)}" r="1.4" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        }
        // гайка оси со шплинтом
        const hex = [0, 1, 2, 3, 4, 5].map(i => {
            const a = i * Math.PI / 3;
            return f(cx + Math.cos(a) * 5.6) + ',' + f(cy + Math.sin(a) * 5.6);
        }).join(' ');
        out += `<polygon points="${hex}" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${cx}" cy="${cy}" r="2.4" fill="${J.tin[900]}"/>` +
            `<path d="M${cx - 3.5} ${cy - 0.5} q3.5 -2 7 0" fill="none" stroke="${J.paint.yellow}" stroke-width="1.1" opacity="0.8"/>` +
            `<circle cx="${cx - 1.6}" cy="${cy - 2}" r="1" fill="${J.tin[100]}"/>`;
        return out;
    },

    // ---------- КАБЕЛЬ ПИТАНИЯ РОЗЕТКИ ----------
    // Розетка СВОБОДНА: в неё включат колесо, когда его купят, и занятая
    // вилкой она обещала бы, что колесо уже есть. Кабель — это подводка
    // самой розетки: выходит снизу из её коробки через сальник, спускается
    // по стенке на двух клипсах с провисом и уходит в дыру в доске, внутрь
    // автомата, к общему питанию.
    powerCable() {
        const J = PALETTE.greedJunk, f = this.f;
        const pts = [[65, 71], [64, 88], [57, 104], [53, 120], [54, 136]];
        const d = this.smooth(pts);
        let out = '';
        // тень: кабель лежит на стенке почти вплотную
        out += `<path d="${d}" fill="none" stroke="${J.hole}" stroke-width="5" stroke-linecap="round" opacity="0.32" transform="translate(1.2 2)"/>`;
        out += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="5.4" stroke-linecap="round"/>`;
        out += `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="3.4" stroke-linecap="round"/>`;
        // блик по кабелю: он круглый, свет ложится узкой линией слева-сверху
        out += `<path d="${d}" fill="none" stroke="${J.tin[500]}" stroke-width="0.8" stroke-linecap="round" opacity="0.8" transform="translate(-0.9 -0.4)"/>`;
        // сальник на коробке розетки: короткий рифлёный хвостовик
        out += `<path d="M61.5 67 L68.5 67 L67.5 74 L62.5 74 Z" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        [69.4, 71.6].forEach(y => { out += `<line x1="62.4" y1="${y}" x2="67.6" y2="${y}" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`; });
        // клипсы: белая пластиковая скоба поперёк кабеля и гвоздик
        [[64, 90, 4], [53.5, 121, -6]].forEach(([x, y, a]) => {
            out += `<g transform="rotate(${a} ${x} ${y})">` +
                `<rect x="${x - 6.5}" y="${y - 3}" width="13" height="6" rx="2.6" fill="${J.paint.cream}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<line x1="${x - 4}" y1="${y - 1.6}" x2="${x + 4}" y2="${y - 1.6}" stroke="${J.tin[100]}" stroke-opacity="0.8" stroke-width="${STROKE.hairline}"/>` +
                `</g>` + this.ironNail(x + (a > 0 ? 4 : -4), y);
        });
        // дыра в доске с резиновой втулкой: кабель уходит внутрь автомата
        out += `<ellipse cx="54" cy="138" rx="5.6" ry="5" fill="${J.wood[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<ellipse cx="54" cy="138" rx="3.4" ry="3" fill="${J.hole}"/>` +
            `<path d="M49.5 136.1 a5 4.6 0 0 1 6 -3.2" fill="none" stroke="${J.tin[500]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        return out;
    },

    // ---------- ПЕРЕКЛАДИНА: ГОРБЫЛЬ ----------
    // Своя история у перекладины: это горбыль — боковой обрезок бревна, его
    // на лесопилке отдают даром. Пиленая грань в дугах от циркулярки,
    // верхний край — в коре, брусок сужается к одному концу и прибит криво,
    // на глаз. Концы заведены за боковины ящика: доски не хватило бы
    // вплотную, и её просто положили поверх с запасом.
    slabBar() {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(313);
        const X0 = 30, X1 = 314, CY = 160, TILT = -2.6;
        const N = 18;
        const top = [], bot = [], bark = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N, x = X0 + (X1 - X0) * t;
            const half = 16 - t * 6;                       // сужается вправо
            const ty = CY - half + (rnd() - 0.5) * 5 - (rnd() < 0.15 ? 3 : 0);    // кора — край рваный, с выбоинами
            top.push([x, ty]);
            bark.push([x, ty + 4.5 + rnd() * 4]);          // толщина коры гуляет
            bot.push([x, CY + half * 0.8 + (rnd() - 0.5) * 0.8]);  // пропил — почти ровный
        }
        const line = pts => pts.map(p => f(p[0]) + ' ' + f(p[1])).join(' L');
        const body = `M${line(top)} L${line(bot.slice().reverse())} Z`;
        const barkBand = `M${line(top)} L${line(bark.slice().reverse())} Z`;
        let g = '';
        // тень на заднюю стенку: горбыль толстый
        g += `<path d="${body}" fill="${J.hole}" opacity="0.4" transform="translate(2.5 4.5)"/>`;
        g += `<clipPath id="gj-slab"><path d="${body}"/></clipPath>`;
        g += `<path d="${body}" fill="url(#gj-slab-face)"/>`;
        // дуги циркулярки: большие радиусы, шаг неровный — пилу вели рукой
        let arcs = '';
        for (let x = X0 + 4; x < X1; x += 6 + rnd() * 5) {
            const r = 60 + rnd() * 30;
            arcs += `<path d="M${f(x)} ${CY - 16} A${f(r)} ${f(r)} 0 0 1 ${f(x + 4)} ${CY + 14}" fill="none" ` +
                `stroke="${J.slab.saw}" stroke-width="${STROKE.hairline}" opacity="${f(0.35 + rnd() * 0.35)}"/>`;
        }
        // продольные трещины выветренной древесины
        for (let i = 0; i < 4; i++) {
            const x = X0 + 20 + rnd() * (X1 - X0 - 60), y = CY - 2 + (rnd() - 0.3) * 8;
            arcs += `<path d="M${f(x)} ${f(y)} q${f(10 + rnd() * 10)} ${f((rnd() - 0.5) * 2)} ${f(24 + rnd() * 20)} ${f((rnd() - 0.5) * 2)}" ` +
                `fill="none" stroke="${J.slab.faceLo}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        }
        g += `<g clip-path="url(#gj-slab)">${arcs}`;
        // луб — рыжая полоска под корой
        g += `<path d="M${line(bark)}" fill="none" stroke="${J.slab.bast}" stroke-width="2" opacity="0.9"/>`;
        // кора: тёмная подложка и поверх светлые чешуйки-пластины разной
        // ширины, разделённые трещинами. Сплошной тёмной полосой кора
        // читалась тенью.
        g += `<path d="${barkBand}" fill="${J.slab.bark}"/>`;
        for (let i = 0; i < top.length - 1; i++) {
            const a = top[i], b = top[i + 1], c = bark[i + 1], d = bark[i];
            let u = 0;
            while (u < 0.95) {
                const v = Math.min(1, u + 0.18 + rnd() * 0.3);
                const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
                const p1 = lerp(a, b, u + 0.04), p2 = lerp(a, b, v - 0.04), p3 = lerp(d, c, v - 0.06), p4 = lerp(d, c, u + 0.06);
                g += `<path d="M${f(p1[0])} ${f(p1[1] + 0.8)} L${f(p2[0])} ${f(p2[1] + 0.8)} L${f(p3[0])} ${f(p3[1] - 0.8)} L${f(p4[0])} ${f(p4[1] - 0.8)} Z" ` +
                    `fill="${J.slab.barkHi}" opacity="${f(0.55 + rnd() * 0.4)}"/>`;
                u = v;
            }
        }
        g += `</g>`;
        // нижняя кромка пропила ловит меньше света — тёмная линия
        g += `<path d="M${line(bot)}" fill="none" stroke="${J.slab.saw}" stroke-width="${STROKE.detail}" opacity="0.8" transform="translate(0 -1.2)"/>`;
        g += `<path d="${body}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}" stroke-linejoin="round"/>`;
        // гнутые гвозди: забили, согнулись, добили боком
        [[58, 1], [176, -1], [282, 1]].forEach(([x, dir]) => {
            const y = CY + 2 - (x - X0) / (X1 - X0) * 2;
            g += `<path d="M${x} ${y} q${dir * 4} -1 ${dir * 7} 3" fill="none" stroke="${PALETTE.ink}" stroke-width="2.6" stroke-linecap="round"/>` +
                `<path d="M${x} ${y} q${dir * 4} -1 ${dir * 7} 3" fill="none" stroke="${J.tin[500]}" stroke-width="1.3" stroke-linecap="round"/>` +
                `<circle cx="${x + dir * 7}" cy="${y + 3}" r="1.8" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
                this.rustRun(x, y + 2, 7, x);
        });
        return `<g transform="rotate(${TILT} ${(X0 + X1) / 2} ${CY})">${g}</g>`;
    },

    // ---------- РАМКА ЯЩИКА ----------
    // Верх — не щит, а ЯЩИК без передней стенки: в анфас его толщину видно
    // только по рамке из толстых досок (крышка и две боковины) и по теням,
    // которые рамка бросает внутрь на заднюю стенку — сверху и слева, от
    // света сверху-слева. Крышка шире боковин и нависает: её положили
    // сверху, а не вставили между ними.
    topFrame() {
        const J = PALETTE.greedJunk, f = this.f;
        const IN = { x: 42, y: 36, w: 260, h: 254 };     // проём ящика
        let out = '';
        // тени от рамки на заднюю стенку
        out += `<rect x="${IN.x}" y="${IN.y}" width="${IN.w}" height="22" fill="url(#gj-shade)"/>`;
        out += `<rect x="${IN.x}" y="${IN.y}" width="16" height="${IN.h}" fill="url(#gj-shade-x)"/>`;
        // боковины: толстые доски, торцом к нам
        out += this.planks(24, 30, 18, 262, 1, 13, 'v', 0, 'pine');
        out += this.planks(302, 30, 18, 262, 1, 14, 'v', 0, 'pine');
        // освещённая кромка левой боковины, тёмная — правой (её грань
        // отвёрнута от света)
        out += `<line x1="26" y1="36" x2="26" y2="288" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.6"/>`;
        out += `<line x1="317" y1="36" x2="317" y2="288" stroke="${J.wood[900]}" stroke-width="${STROKE.structure}" opacity="0.6"/>`;
        // тень крышки на боковины
        out += this.shade(24, 34, 18, 8) + this.shade(302, 34, 18, 8);
        // крышка, нависает над боковинами
        out += this.planks(16, 14, 312, 22, 1, 15, 'h', 0, 'painted');
        out += `<line x1="20" y1="16.5" x2="324" y2="16.5" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        out += this.cornerBracket(1) + this.cornerBracket(-1);
        return out;
    },

    // Уголок на стыке крышки и боковины: гнутая Г-образная пластина,
    // одно плечо на крышке, другое на боковине. Выдавленное ребро
    // жёсткости по диагонали угла, три шурупа, рыжая кромка там, где
    // стоит вода. side: 1 — левый, −1 — правый (зеркально по оси ящика).
    cornerBracket(side) {
        const J = PALETTE.greedJunk, f = this.f;
        const AX = 172;                                   // ось симметрии ящика
        const X = x => side > 0 ? x : AX * 2 - x;
        const pt = (x, y) => f(X(x)) + ' ' + f(y);
        // контур Г: скруглённый внешний угол, мягкая галтель внутри
        const d = `M${pt(20, 20)} Q${pt(20, 15)} ${pt(25, 15)} L${pt(60, 15)} Q${pt(62, 15)} ${pt(62, 17)} ` +
            `L${pt(62, 32)} Q${pt(62, 34)} ${pt(60, 34)} L${pt(48, 34)} Q${pt(45, 34)} ${pt(45, 37)} ` +
            `L${pt(45, 62)} Q${pt(45, 64)} ${pt(43, 64)} L${pt(22, 64)} Q${pt(20, 64)} ${pt(20, 62)} Z`;
        let out = `<path d="${d}" fill="${J.hole}" opacity="0.2" transform="translate(0.6 0.9)"/>`;
        out += `<path d="${d}" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        out += `<path d="${d}" fill="url(#gj-dirt)"/>`;
        // фаска: верхние кромки ловят свет, нижние в тени
        out += `<path d="M${pt(23, 16.6)} L${pt(60, 16.6)}" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.85"/>`;
        out += `<path d="M${pt(60, 32.6)} L${pt(48, 32.6)} M${pt(43.6, 38)} L${pt(43.6, 62.6)} L${pt(22, 62.6)}" ` +
            `fill="none" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        out += `<path d="M${pt(21.5, 21)} L${pt(21.5, 61)}" stroke="${side > 0 ? J.tin[100] : J.tin[900]}" ` +
            `stroke-width="${STROKE.detail}" opacity="${side > 0 ? 0.7 : 0.6}"/>`;
        // ребро жёсткости: светлая и тёмная дуга рядом — выдавлено наружу
        out += `<path d="M${pt(27, 25)} L${pt(37, 36)}" stroke="${J.tin[100]}" stroke-width="${STROKE.structure}" stroke-linecap="round" opacity="0.8"/>` +
            `<path d="M${pt(28.4, 26.6)} L${pt(38.4, 37.6)}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}" stroke-linecap="round" opacity="0.7"/>`;
        // ржавая кромка по низу плеч
        out += `<path d="M${pt(46, 33)} L${pt(60, 33)} M${pt(22, 63)} L${pt(43, 63)}" stroke="${J.rust[500]}" stroke-width="2" opacity="0.45"/>`;
        // шурупы и потёки под ними
        [[54, 24.5], [32.5, 48], [32.5, 58]].forEach(([x, y], i) => {
            if (i !== 1) out += this.rustRun(X(x), y + 2, 5 + i * 2, 160 + i + side);
            out += this.bolt(X(x), y, 2);
        });
        return out;
    },

    // Табло с барабанами: облезлая крашеная жесть.
    head() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        let out = '';
        // боковые доски, на которых держится табло
        out += this.planks(36, 290, 18, 182, 1, 51, 'v');
        out += this.planks(306, 290, 18, 182, 1, 52, 'v');
        // жестяной лист
        out += this.tin(50, 296, 260, 172, 61, { boltR: 3, scratches: 0, stroke: STROKE.contour, tilt: 0.4, z: this.Z.strap });
        // крашеное поле: синяя рамка и лучи
        out += `<rect x="62" y="312" width="236" height="148" rx="10" fill="url(#gj-blue)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        const cx = 180, cy = 388;
        const rays = [J.paint.orange, J.paint.yellow, J.paint.red, J.paint.yellow];
        for (let i = 0; i < 12; i++) {
            const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 0.5) / 12) * Math.PI * 2;
            const R = 170;
            out += `<path d="M${cx} ${cy} L${f(cx + Math.cos(a0) * R)} ${f(cy + Math.sin(a0) * R)} ` +
                `L${f(cx + Math.cos(a1) * R)} ${f(cy + Math.sin(a1) * R)} z" fill="${rays[i % 4]}" clip-path="url(#gj-face)"/>`;
        }
        // облезлая краска: пятна голой жести
        const rnd = this.rng(71);
        for (let i = 0; i < 14; i++) {
            const px = 66 + rnd() * 226, py = 310 + rnd() * 136;
            if (px > 72 && px < 284 && py > 326 && py < 446) continue;   // не на окне
            const k = 0.6 + rnd() * 0.8;
            out += `<path d="M${f(px)} ${f(py)} q${f(4 * k)} ${f(-3 * k)} ${f(8 * k)} 0 q${f(2 * k)} ${f(4 * k)} ${f(-2 * k)} ${f(6 * k)} q${f(-5 * k)} ${f(k)} ${f(-6 * k)} ${f(-6 * k)} z" fill="${J.tin[300]}" ` +
                `stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        }
        // ---- окно утоплено в корпус ----
        // Полосатое поле — это СКОС, уходящий от листа вглубь к окну. Свет
        // сверху-слева: верхний скос смотрит вниз и в тени, левый тоже
        // отвёрнут, нижний смотрит вверх и ловит свет, правый — чуть. Без
        // этого скос читался плоской наклейкой.
        const O = [62, 312, 298, 460], I = [78, 332, 282, 444];
        const quad = (pts, fill, op) => `<path d="M${pts.map(q => q.join(' ')).join(' L')} Z" fill="${fill}" opacity="${op}" clip-path="url(#gj-face)"/>`;
        out += quad([[O[0], O[1]], [O[2], O[1]], [I[2], I[1]], [I[0], I[1]]], J.hole, 0.5);
        out += quad([[O[0], O[1]], [I[0], I[1]], [I[0], I[3]], [O[0], O[3]]], J.hole, 0.3);
        out += quad([[I[0], I[3]], [I[2], I[3]], [O[2], O[3]], [O[0], O[3]]], J.paint.cream, 0.28);
        out += quad([[I[2], I[1]], [O[2], O[1]], [O[2], O[3]], [I[2], I[3]]], J.paint.cream, 0.12);
        // рёбра скоса — линии от углов листа к углам окна
        [[O[0], O[1], I[0], I[1]], [O[2], O[1], I[2], I[1]], [O[0], O[3], I[0], I[3]], [O[2], O[3], I[2], I[3]]].forEach(e => {
            out += `<line x1="${e[0]}" y1="${e[1]}" x2="${e[2]}" y2="${e[3]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" opacity="0.6" clip-path="url(#gj-face)"/>`;
        });
        // кромка листа над скосом ловит свет
        out += `<path d="M66 ${O[3] - 6} L66 318 Q66 314 70 314 L294 314" fill="none" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        // рамка окна барабанов
        out += `<rect x="78" y="332" width="204" height="112" rx="8" fill="${J.paint.blueLo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<line x1="84" y1="335" x2="276" y2="335" stroke="${J.paint.blue}" stroke-width="${STROKE.detail}"/>`;
        S.reels.forEach(r => {
            out += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        });
        // кнопки на полке-пульте под табло: разные, как собранные с разных пультов
        [[136, J.paint.orange, 6.5], [168, J.paint.red, 5.5], [196, J.paint.orange, 6.5], [226, J.paint.yellow, 5]].forEach(([bx, c, r]) => {
            out += `<circle cx="${bx + 0.8}" cy="${477.8}" r="${r + 2}" fill="${J.hole}" opacity="0.3"/>` +
                `<circle cx="${bx}" cy="476" r="${r + 2}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${bx}" cy="475" r="${r}" fill="${c}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
                `<circle cx="${bx - r * 0.3}" cy="${475 - r * 0.35}" r="${r * 0.32}" fill="${J.paint.cream}" opacity="0.8"/>`;
        });
        return out;
    },

    // Полка под табло и нижний ящик: низкий, на нём только табличка и лоток.
    body() {
        const J = PALETTE.greedJunk, S = this.SLOTS;
        let out = '';
        out += this.planks(40, 484, 280, 98, 2, 81, 'h');
        out += this.tin(40, 484, 22, 22, 91, { bolts: false, scratches: 1 }) + this.bolt(49, 493);
        out += this.tin(298, 484, 22, 22, 92, { bolts: false, scratches: 1 }) + this.bolt(311, 493);
        // тень от полки на ящик
        out += this.shade(40, 486, 280, 14);
        // пустая табличка выплат: светлая доска на гвоздях
        const p = S.plate;
        out += `<path d="${this.wob(p.x, p.y, p.w, p.h, 151, 1)}" fill="url(#gj-wood-light)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<line x1="${p.x + 4}" y1="${p.y + 2.5}" x2="${p.x + p.w - 4}" y2="${p.y + 2.5}" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        [[p.x + 6, p.y + 6], [p.x + p.w - 6, p.y + 6], [p.x + 6, p.y + p.h - 6], [p.x + p.w - 6, p.y + p.h - 6]]
            .forEach(([x, y]) => { out += this.nail(x, y); });
        // лоток
        const t = S.tray;
        out += this.tin(t.x - 8, t.y - 5, t.w + 16, t.h + 10, 101, { bolts: false, scratches: 1, tilt: 0, z: this.Z.strap });
        out += `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="4" fill="url(#gj-hole)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        // латка изолентой на углу
        out += `<path d="${this.wob(268, 548, 40, 10, 153, 0.8)}" fill="${J.tin[900]}" opacity="0.92" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" transform="rotate(-18 288 553)"/>`;
        // полка поверх стыка табло и ящика — торчит за края
        out += this.planks(24, 466, 312, 20, 1, 111, 'h');
        return out;
    },

    // Цоколь: толстая тёмная доска на двух брусках.
    plinth() {
        let out = this.planks(34, 598, 64, 22, 1, 121, 'h') + this.planks(262, 598, 64, 22, 1, 122, 'h');
        out += this.planks(20, 580, 320, 20, 1, 123, 'h');
        return out;
    },

    // ---------- КУЛИСА ----------
    // Рычаг — кулиса старой коробки передач: гофрированная резиновая юбка,
    // хромированный шток и круглая рукоять со схемой шести передач. Ходит
    // НА ИГРОКА, а не вбок: вбок на экране телефона места нет. Поэтому
    // корпус кулисы — коробка на боку автомата, из которой юбка смотрит
    // вверх, а шестерни декоративные, сбоку снизу, где их не задевает шток.
    leverMount() {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot, f = this.f;
        let out = this.tin(314, 384, 42, 84, 131, { boltR: 2.4, z: this.Z.box, tilt: 0 });
        out += this.gear(324, 450, 10, 8, 0.2);
        out += this.gear(342, 446, 8, 7, 0.5);
        // фланец под юбкой
        out += `<rect x="${P.x - 18}" y="${P.y - 3}" width="36" height="8" rx="3" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += this.bolt(P.x - 13, P.y + 1, 1.8) + this.bolt(P.x + 13, P.y + 1, 1.8);
        return out;
    },

    // Шток и рукоять — отдельно: при рывке шток укорачивается (уходит на
    // игрока) и рукоять опускается, корпус при этом не перерисовывается.
    // Юбка тоже живая: она сминается вместе со штоком.
    leverSvg() {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot, f = this.f;
        let boot = '';
        // юбка: стопка гофр от широкой к узкой, светлый гребень и тёмная
        // впадина по очереди — так резина читается рифлёной
        const rings = 7, h0 = 46;
        for (let i = 0; i < rings; i++) {
            const t = i / rings;
            const w = 30 - t * 16, y = P.y - (i + 1) * (h0 / rings);
            boot += `<rect x="${f(P.x - w / 2)}" y="${f(y)}" width="${f(w)}" height="${f(h0 / rings + 1.5)}" rx="${f(h0 / rings / 2)}" ` +
                `fill="${i % 2 ? J.tin[900] : J.wood[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<line x1="${f(P.x - w / 2 + 3)}" y1="${f(y + 1.6)}" x2="${f(P.x - w / 2 + w * 0.45)}" y2="${f(y + 1.6)}" stroke="${J.tin[500]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>`;
        }
        const bootTop = P.y - h0;
        const top = bootTop - 46;
        const K = { x: P.x, y: top - 12, r: 17 };
        // схема передач на рукояти: три вертикали через поперечину — шесть
        // положений, точки на концах
        let pattern = `<line x1="${K.x - 8}" y1="${K.y}" x2="${K.x + 8}" y2="${K.y}"/>`;
        [-8, 0, 8].forEach(dx => {
            pattern += `<line x1="${K.x + dx}" y1="${K.y - 8}" x2="${K.x + dx}" y2="${K.y + 8}"/>`;
        });
        let dots = '';
        [-8, 0, 8].forEach(dx => [-8, 8].forEach(dy => {
            dots += `<circle cx="${K.x + dx}" cy="${K.y + dy}" r="1.3"/>`;
        }));
        return `<g class="gj-lever">` +
            `<g class="gj-boot">${boot}</g>` +
            `<g class="gj-shaft">` +
            `<rect x="${P.x - 3.5}" y="${top}" width="7" height="${bootTop - top + 2}" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${P.x - 1.2}" y1="${top + 4}" x2="${P.x - 1.2}" y2="${bootTop - 2}" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}"/>` +
            `</g>` +
            `<g class="gj-knob">` +
            `<circle cx="${K.x + 1.5}" cy="${K.y + 2.5}" r="${K.r}" fill="${J.hole}" opacity="0.3"/>` +
            `<circle cx="${K.x}" cy="${K.y}" r="${K.r}" fill="url(#gj-knob)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            `<circle cx="${K.x}" cy="${K.y}" r="${K.r - 4}" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<g stroke="${J.paint.cream}" stroke-width="${STROKE.structure}" stroke-linecap="round">${pattern}</g>` +
            `<g fill="${J.paint.cream}">${dots}</g>` +
            `<ellipse cx="${K.x - 7}" cy="${K.y - 9}" rx="5" ry="3" fill="${J.tin[300]}" opacity="0.5"/>` +
            `</g>` +
            `</g>`;
    },

    // Тень на барабанах от верхней и левой кромки окна. Отдельным слоем:
    // в игре барабаны крутятся ПОВЕРХ корпуса, и тень должна лечь поверх
    // них, иначе окно снова станет плоским.
    reelShadeSvg() {
        const J = PALETTE.greedJunk;
        return this.SLOTS.reels.map(r =>
            `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="url(#gj-reel-shade)"/>` +
            `<rect x="${r.x}" y="${r.y}" width="8" height="${r.h}" rx="4" fill="${J.hole}" opacity="0.25"/>`
        ).join('');
    },

    // Тень от верхнего щита на табло.
    topShade() {
        return this.shade(54, 290, 252, 14);
    },

    bodySvg() {
        const clip = `<clipPath id="gj-face"><rect x="62" y="312" width="236" height="148" rx="10"/></clipPath>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}">` +
            this.defs().replace('</defs>', clip + '</defs>') +
            this.plinth() + this.body() + this.topBox() + this.head() + this.topShade() + this.leverMount() +
            this.leverSvg() +
            `</svg>`;
    }
};
