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
        return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" class="fx" fill="url(#gj-shade)"/>`;
    },

    // ---------- ГРАДИЕНТЫ ----------
    // Свет один, сверху-слева (LIGHT в palette.js): светлое начало у всех
    // градиентов в верхнем левом углу.
    defs() {
        const J = PALETTE.greedJunk;
        // В проходе albedo градиент — это нарисованный свет, а свет даёт
        // шейдер: оба конца становятся средним цветом.
        const flat = this.pass === 'albedo';
        const lin = (id, a, b, x2, y2) => {
            if (flat) a = b = this.mid(a, b);
            return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
                `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
        };
        return '<defs>' +
            lin('gj-wood', J.wood[300], J.wood[500], 0.35, 1) +
            lin('gj-wood-dark', J.wood[500], J.wood[700], 0.35, 1) +
            lin('gj-wood-light', J.wood[100], J.wood[300], 0.35, 1) +
            lin('gj-tin', J.tin[300], J.tin[700], 0.6, 1) +
            lin('gj-tin-dark', J.tin[500], J.tin[700], 0.6, 1) +
            lin('gj-blue', J.paint.blue, J.paint.blueLo, 0.3, 1) +
            // цвета побежалости у отпиленного края: от соломенного к синему
            `<linearGradient id="gj-temper" x1="1" y1="0" x2="0" y2="0">` +
            `<stop offset="0" stop-color="${J.paint.yellow}"/><stop offset="0.5" stop-color="${J.rust[300]}"/>` +
            `<stop offset="1" stop-color="${J.paint.blueLo}" stop-opacity="0"/></linearGradient>` +
            // барабан: темнее к верху и низу — лента уходит от глаза
            `<linearGradient id="gj-drum" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${J.hole}" stop-opacity="0.75"/><stop offset="0.28" stop-color="${J.hole}" stop-opacity="0"/>` +
            `<stop offset="0.72" stop-color="${J.hole}" stop-opacity="0"/><stop offset="1" stop-color="${J.hole}" stop-opacity="0.75"/></linearGradient>` +
            lin('gj-primer', J.primer.hi, J.primer.lo, 0.4, 1) +
            lin('gj-zinc', J.zinc.hi, J.zinc.lo, 0.5, 1) +
            lin('gj-raw', J.raw.hi, J.raw.lo, 0.4, 1) +
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
            `<linearGradient id="gj-wrap" x1="0" y1="0" x2="1" y2="0">` +
            `<stop offset="0" stop-color="${J.hole}" stop-opacity="0.5"/><stop offset="0.25" stop-color="${J.hole}" stop-opacity="0"/>` +
            `<stop offset="0.75" stop-color="${J.hole}" stop-opacity="0"/><stop offset="1" stop-color="${J.hole}" stop-opacity="0.5"/></linearGradient>` +
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
                out += `<path d="${top}" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.5"/>`;
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
                ? `<line x1="${f(px + 2)}" y1="${f(py + 3)}" x2="${f(px + 2)}" y2="${f(py + ph - 3)}" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.55"/>`
                : `<line x1="${f(px + 3)}" y1="${f(py + 2)}" x2="${f(px + pw - 3)}" y2="${f(py + 2)}" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.55"/>`;
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
        out += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" class="fx" fill="url(#gj-dirt)"/>`;
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
            out += `<path d="${path}" class="fx" fill="url(#gj-chip-light)"/>`;
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
            // Стёртые места: светлый шпон с волокном. Вытерты вдоль доски
            // (руками, тряпкой), края мягкие: вокруг — лак истончён и
            // темнее, без контура. Было: многоугольники с обводкой —
            // читались наклейками.
            const peels = 2 + Math.floor(rnd() * 3);
            for (let i = 0; i < peels; i++) {
                const ca = long * (0.1 + rnd() * 0.8), cb = short * (rnd() < 0.5 ? 0.2 : 0.8);
                const ra = 6 + rnd() * long * 0.08, rb = 1.6 + rnd() * short * 0.2;
                const pts = [], rim = [];
                for (let k = 0; k < 9; k++) {
                    const t = (k / 9) * Math.PI * 2, j = 0.6 + rnd() * 0.5;
                    pts.push(at(ca + Math.cos(t) * ra * j, cb + Math.sin(t) * rb * j));
                    rim.push(at(ca + Math.cos(t) * (ra * j + 1.6), cb + Math.sin(t) * (rb * j + 1)));
                }
                const loop = (q) => this.smooth(q.concat([q[0], q[1]])) + ' Z';
                g += `<path d="${loop(rim)}" fill="${J.painted.lo}" opacity="0.35"/>`;
                g += `<path d="${loop(pts)}" fill="${J.painted.bare}" opacity="0.85"/>`;
                const [lx1, ly1] = at(ca - ra * 0.7, cb), [lx2, ly2] = at(ca + ra * 0.7, cb + 0.6);
                g += `<line x1="${f(lx1)}" y1="${f(ly1)}" x2="${f(lx2)}" y2="${f(ly2)}" stroke="${J.painted.bareLo}" stroke-width="${STROKE.hairline}"/>`;
            }
            out += `<g clip-path="url(#${id})">${g}</g>`;
            out += `<path d="${path}" class="fx" fill="url(#gj-sheen)"/>`;
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
        let out = this.T(0, 'hole', `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="pit" fill="${J.hole}"/>`);   // темнота в щелях
        let px = x;
        parts.forEach((p, i) => {
            const pw = p.pw * k;
            const gap = 1.2 + rnd() * 1.8;
            const bx = px + (i ? gap / 2 : 0), bw = pw - (i ? gap / 2 : 0) - (i < parts.length - 1 ? gap / 2 : 0);
            out += this.T(0, p.mat === 'painted' ? 'lacquer' : p.mat, this.material(p.mat, bx, y - 2, bw, h + 4, seed * 7 + i * 13, true));
            // светлая кромка слева (свет сверху-слева), тёмная справа
            out += `<line x1="${f(bx + 1.2)}" y1="${y}" x2="${f(bx + 1.2)}" y2="${y + h}" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.hairline}" opacity="0.45"/>`;
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
        return `<circle cx="${f(x + 0.5)}" cy="${f(y + 0.8)}" r="${r}" class="fx" fill="${J.hole}" opacity="0.35"/>` +
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
            out += `<path d="${this.wob(x + z * 0.45, y + z * 0.7, w, h, seed + 5)}" class="pit" fill="${J.hole}" ` +
                `opacity="${f(Math.min(0.5, 0.12 + z * 0.035))}"/>`;
        }
        out += `<path d="${this.wob(x, y, w, h, seed + 5)}" ` +
            `fill="url(#${o.fill || (o.dark ? 'gj-tin-dark' : 'gj-tin')})" stroke="${PALETTE.ink}" stroke-width="${o.stroke || STROKE.structure}"/>`;
        out += `<path d="${this.wob(x, y, w, h, seed + 5)}" class="fx" fill="url(#gj-dirt)"/>`;
        // вмятина: светлая дуга над тёмной
        if (w > 30 && h > 30 && o.dent !== false) {
            const dx = x + w * (0.25 + rnd() * 0.5), dy = y + h * (0.25 + rnd() * 0.5);
            out += `<path d="M${f(dx - 7)} ${f(dy)} q7 -5 14 0" fill="none" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>` +
                `<path d="M${f(dx - 6)} ${f(dy + 2)} q6 4 12 0" fill="none" stroke="${J.tin[900]}" stroke-width="${STROKE.hairline}" opacity="0.7"/>`;
        }
        // царапины
        for (let i = 0; i < (o.scratches == null ? 3 : o.scratches); i++) {
            const sx = x + w * (0.15 + rnd() * 0.6), sy = y + h * (0.15 + rnd() * 0.7);
            const len = Math.min(w, h) * (0.15 + rnd() * 0.25);
            out += `<line x1="${f(sx)}" y1="${f(sy)}" x2="${f(sx + len)}" y2="${f(sy - len * 0.35)}" ` +
                `class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>`;
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

    // ---------- КУЛИСА ----------
    // Рычаг — кулиса старой коробки передач: гофрированная резиновая юбка,
    // хромированный шток и круглая рукоять со схемой шести передач. Ходит
    // НА ИГРОКА, а не вбок: вбок на экране телефона места нет.
    // Корпус — кусок пола старой машины, вырезанный болгаркой вместе с
    // кулисой: заводская краска хаки, выштампованные рёбра жёсткости,
    // индикатор готовности в бывшей дренажной дырке, рамка юбки из салона. Сверху и
    // справа края заводские (скруглённая штамповка, завальцовка), снизу —
    // свежий рез с побежалостью, слева отогнут фланец и привёрнут к
    // ящику. Из кулисы трос переключения уходит в нижний ящик — это и
    // есть связь рычага с барабанами. Было: ровная серая пластина с
    // «улыбкой»-вмятиной и две шестерни сбоку ни к чему.
    leverMount() {
        const J = PALETTE.greedJunk, C = J.car, P = this.SLOTS.pivot, f = this.f;
        const rnd = this.rng(77);
        const x0 = 314, y0 = 384, x1 = 356, y1 = 464;      // низ стоит на верхней грани полки
        // Нижний край — рез болгаркой: прямой, чуть наискось (резали по
        // разметке на глаз). Было: зубчатая «пила» — так режут ножницами
        // по жести, а не диском, и смотрелось это неряшливой каймой.
        const yl = y1 - 1, yr = y1 - 3;                // рез слева и справа
        const at = (x) => yl + (yr - yl) * (x - x0) / (x1 + 0.6 - x0);
        const body = `M${x0} ${y0 + 5} Q${x0} ${y0} ${x0 + 5} ${y0} L${x1 - 4} ${y0} Q${x1} ${y0} ${x1} ${y0 + 4} L${x1 + 0.6} ${yr} L${x0} ${yl} Z`;
        let g = `<path d="${body}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(1.6 2.4)"/>` +
            `<path d="${body}" fill="${C.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        // завальцовка правого края: светлая кромка
        g += `<path d="M${x1 - 1.6} ${y0 + 4} L${x1 - 1.2} ${y1 - 3}" class="hl" stroke="${C.hi}" stroke-width="1.2"/>`;
        // рёбра жёсткости — выштамповка: вытянутые валики
        const rib = (y) => {
            const d = `M${x0 + 9} ${y} L${x1 - 7} ${y}`;
            // Без обводки: выштамповка — это изгиб того же листа, а не
            // накладка; с контуром рёбра читались прорезями-кнопками.
            return `<path d="M${x0 + 9} ${y + 1.6} L${x1 - 7} ${y + 1.6}" stroke="${C.lo}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>` +
                `<path d="M${x0 + 9} ${y - 1.4} L${x1 - 7} ${y - 1.4}" class="hl" stroke="${C.hi}" stroke-width="1.2" stroke-linecap="round"/>` +
                this.rodH(d, 4.4, 1.6);
        };
        g += rib(424) + rib(438);
        // сколы краски до грунта и ржавчины — по краям и у реза
        [[x1 - 3, y0 + 14, 2.4], [x0 + 6, y1 - 7, 3], [x1 - 6, y1 - 6, 2.2], [x0 + 20, y0 + 2.4, 1.8]].forEach(([cx, cy, r]) => {
            const pts = [];
            for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6); pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr * 0.8)}`); }
            g += `<path d="M${pts.join(' L')} Z" fill="${J.primer.base}"/>` +
                `<circle cx="${f(cx + 0.3)}" cy="${f(cy + 0.4)}" r="${f(r * 0.35)}" fill="${J.rust[500]}"/>`;
        });
        // рез: над кромкой полоса побежалости (лист грелся от диска), под
        // ней тонкая окалина и ровная полоска свежего металла по кромке
        const band = (h0, h1) => `M${x0 + 0.6} ${f(yl - h1)} L${x1 + 0.2} ${f(yr - h1)} L${x1 + 0.2} ${f(yr - h0)} L${x0 + 0.6} ${f(yl - h0)} Z`;
        const xm = (x0 + x1) / 2, ym = at(xm);
        g += `<g transform="rotate(90 ${f(xm)} ${f(ym - 3)}) rotate(${f(Math.atan2(yr - yl, x1 - x0) * 180 / Math.PI)} ${f(xm)} ${f(ym - 3)})">` +
            `<rect x="${f(xm - 3.5)}" y="${f(ym - 3 - (x1 - x0) / 2)}" width="7" height="${x1 - x0}" fill="url(#gj-temper)" opacity="0.35"/></g>`;
        g += `<path d="${band(0.4, 1.9)}" fill="${J.tin[900]}" opacity="0.85"/>`;
        g += `<path d="${band(0.4, 1.2)}" fill="${J.tin[100]}"/>`;
        g += this.readyLampBody();
        let out = this.T(7, 'paint', g);
        // фланец слева отогнут к ящику: узкая полоса в тени и три болта
        out += this.T(8, 'paint', `<path d="M${x0} ${y0 + 5} L${x0 + 4} ${y0 + 3} L${x0 + 4} ${y1 - 1.5} L${x0} ${y1 - 1} Z" fill="${C.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            [402, 430, 454].map(y => this.bolt(x0 + 2, y, 1.6)).join(''));
        // Крышка корпуса: толстый загнутый край листа, на нём рамка юбки.
        // Юбка выходит из корпуса сквозь крышку, а не стоит на кромке, как
        // на полке. Корпус почти на уровне глаз — верх крышки виден ребром.
        out += this.T(9, 'paint', `<rect x="${x0 - 2}" y="${y0 - 5}" width="${x1 - x0 + 4}" height="8" rx="2.4" fill="${C.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${x0}" y1="${y0 - 3.6}" x2="${x1}" y2="${y0 - 3.6}" class="hl" stroke="${C.hi}" stroke-width="0.9"/>` +
            this.rodH(`M${x0} ${y0 - 1} L${x1} ${y0 - 1}`, 7, 1.6) +
            this.bolt(x0 + 2.4, y0 - 1, 1.5) + this.bolt(x1 - 2.4, y0 - 1, 1.5));
        // рамка юбки — в leverSvg: она прижимает низ юбки и рисуется поверх
        out += this.shiftCable();
        return out;
    },

    // Индикатор готовности рычага — в бывшей дренажной дырке: резиновое
    // кольцо и в нём затёртый мутный колпачок из серо-зелёной резины, как
    // на старых военных приборах. Под ним тусклая лампочка: горит красным,
    // пока рычаг дёргать нельзя (идёт крутка), зелёным — когда можно. Свет
    // живой, рисуется поверх корпуса (readyLampGlow, GreedJunkLit).
    READY_LAMP: { x: 345, y: 450, r: 4.2 },
    readyLampBody() {
        const J = PALETTE.greedJunk, Lm = J.lamp, R = this.READY_LAMP, f = this.f;
        let g = `<circle cx="${R.x}" cy="${R.y}" r="${R.r + 1.6}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            this.domeH(R.x, R.y, R.r + 1.6, 1);
        let cap = `<circle cx="${R.x}" cy="${R.y}" r="${R.r}" fill="${Lm.cap}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
            // затёртость: матовые царапины и тёмный ободок у края
            `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r - 0.6)}" fill="none" stroke="${Lm.capLo}" stroke-width="0.6" opacity="0.6"/>` +
            `<path d="M${f(R.x - 2.4)} ${f(R.y + 1.2)} L${f(R.x + 0.6)} ${f(R.y - 1.8)} M${f(R.x - 0.4)} ${f(R.y + 2.4)} L${f(R.x + 2)} ${f(R.y + 0.2)}" stroke="${Lm.capLo}" stroke-width="0.3" opacity="0.7"/>` +
            this.domeH(R.x, R.y, R.r, 2);
        return this.T(2, 'rubber', g) + this.T(3, 'plastic', cap);
    },
    // Свет индикатора: red и green — накал 0..1. Колпачок рассеивает:
    // тусклая заливка его цветом, мягкое пятно нити посередине и слабый
    // ореол на краске вокруг — без резких краёв.
    readyLampDefs() {
        const Lm = PALETTE.greedJunk.lamp;
        return ['red', 'green'].map(k =>
            `<radialGradient id="gj-ind-${k}"><stop offset="0" stop-color="${Lm[k + 'Core']}" stop-opacity="0.95"/>` +
            `<stop offset="0.55" stop-color="${Lm[k]}" stop-opacity="0.55"/><stop offset="1" stop-color="${Lm[k]}" stop-opacity="0"/></radialGradient>`).join('');
    },
    readyLampGlow(red, green) {
        const R = this.READY_LAMP, f = this.f, Lm = PALETTE.greedJunk.lamp;
        let out = '';
        [['red', red], ['green', green]].forEach(([k, v]) => {
            if (v < 0.02) return;
            out += `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r * 3)}" fill="url(#gj-ind-${k})" opacity="${f(0.35 * v)}" style="mix-blend-mode:screen"/>` +
                `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r - 0.3)}" fill="${Lm[k]}" opacity="${f(0.6 * v)}"/>` +
                `<circle cx="${R.x}" cy="${f(R.y + 0.3)}" r="${f(R.r * 0.85)}" fill="url(#gj-ind-${k})" opacity="${f(0.9 * v)}" style="mix-blend-mode:screen"/>`;
        });
        // затёртость колпачка видна и на горящей лампе: свет идёт сквозь
        // царапины, они темнее
        if (out) out += `<path d="M${f(R.x - 2.4)} ${f(R.y + 1.2)} L${f(R.x + 0.6)} ${f(R.y - 1.8)} M${f(R.x - 0.4)} ${f(R.y + 2.4)} L${f(R.x + 2)} ${f(R.y + 0.2)}" stroke="${Lm.capLo}" stroke-width="0.3" opacity="0.6"/>` +
            `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r - 0.6)}" fill="none" stroke="${Lm.capLo}" stroke-width="0.6" opacity="0.45"/>`;
        return out;
    },

    // Трос переключения: чёрная оболочка из втулки внизу кулисы, дугой
    // вниз и в нижний ящик через втулку. На концах — обжатые стальные
    // наконечники оболочки.
    shiftCable() {
        const J = PALETTE.greedJunk, f = this.f;
        const pts = [[326, 454], [327, 472], [322, 492], [311, 508], [300, 516]];
        const d = this.smooth(pts);
        let out = `<path d="${d}" class="fx" fill="none" stroke="${J.hole}" stroke-width="4" stroke-linecap="round" opacity="0.3" transform="translate(1.4 2)"/>` +
            this.rodH(d, 3.6) +
            `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="4.4" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="3" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" class="hl" stroke="${J.tin[500]}" stroke-width="0.6" opacity="0.7" transform="translate(-0.6 -0.2)"/>`;
        // наконечники: короткие стальные гильзы с насечкой обжима
        const ferrule = (a, b) => {
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
            const e = [a[0] + c * 5, a[1] + s * 5];
            const dd = `M${f(a[0])} ${f(a[1])} L${f(e[0])} ${f(e[1])}`;
            // гильза выходит из дыры на нас: у дыры её торец скруглён
            return this.rodH(dd, 4.6, 2) + `<path d="${dd}" stroke="${PALETTE.ink}" stroke-width="5.4" stroke-linecap="round"/>` +
                `<path d="${dd}" stroke="${J.tin[500]}" stroke-width="4" stroke-linecap="round"/>` +
                `<path d="M${f(a[0] + c * 2.5 - s * 2)} ${f(a[1] + s * 2.5 + c * 2)} L${f(a[0] + c * 2.5 + s * 2)} ${f(a[1] + s * 2.5 - c * 2)}" stroke="${J.tin[700]}" stroke-width="0.6"/>`;
        };
        out += ferrule(pts[0], pts[1]) + ferrule(pts[4], pts[3]);
        // Обе втулки — ПОД тросом: трос выходит из самой дыры втулки и в
        // дыру же уходит. Было: верхняя втулка лежала поверх, и трос
        // вылезал из-под её края, а дыра оставалась пустой.
        return this.grommet(pts[0][0], pts[0][1]) + this.grommet(pts[4][0], pts[4][1]) + this.T(6, 'rubber', out);
    },

    // Шток и рукоять — отдельно: при рывке шток укорачивается (уходит на
    // игрока) и рукоять опускается, корпус при этом не перерисовывается.
    // Юбка тоже живая: она сминается вместе со штоком.
    // Было плоско: юбка — стопка шайб двух цветов, рукоять — монета
    // (купол 5 при радиусе 17), хром — серая полоска. Теперь:
    //   * юбка — одна чёрная резина, гофры — валики, каждый выпуклый и
    //     поперёк (эллиптический купол на карте высот), сужается кверху;
    //     кольца выше глаза, поэтому дуги гофр чуть выгнуты вверх;
    //   * сверху юбка обжата на штоке хомутом;
    //   * хром — полосами отражения вдоль (тёмная и светлая), так он и
    //     читается хромом, а не крашеной трубкой;
    //   * рукоять — шар бакелита с гравировкой схемы, на хромовой втулке.
    // Геометрия рычага при рывке pull (0 — покой, 1 — до упора, меньше
    // нуля — откат назад): рычаг заваливается НА ИГРОКА до 75°. Спереди
    // это видно так: шток короче (ракурс), рукоять ниже и крупнее (ближе),
    // юбка сминается и раздаётся вширь, как резина. Было 55° и без
    // раздутия юбки — рукоять опускалась на 21 единицу, рывок не читался. Рисунок — в покое; рывок двигает готовые
    // освещённые части по этой геометрии (GreedJunkLit, «Рычаг»).
    LEVER_TILT: 75,
    leverGeom(pull) {
        const P = this.SLOTS.pivot;
        const th = pull * this.LEVER_TILT * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
        const squash = Math.max(0, sn);
        const base = P.y - 16, h0 = 40 * (1 - 0.45 * squash), top = base - h0;
        const K = { x: P.x, y: top - 50 * cs, r: 15 * (1 + 0.15 * sn) };
        return { base, h0, top, K, s0: K.y + K.r - 2, cs, sn, bootW: 1 + 0.12 * squash };
    },
    // Части рычага отдельно — для рывка. Вместе — leverSvg.
    leverParts(noPattern) {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot, V = this.VP || { y: 388 }, f = this.f;
        const G = this.leverGeom(0);
        const base = G.base, rings = 6, h0 = G.h0, top = G.top;
        const wAt = (t) => 30 - t * 19;                  // ширина юбки по высоте 0..1
        const bow = (y, w) => w * Math.max(0, (V.y - y) / 230) * 0.5;
        // силуэт: валик шире, впадина уже
        const L = [], R = [];
        for (let i = 0; i <= rings * 2; i++) {
            const t = i / (rings * 2), y = base - t * h0, w = wAt(t) + (i % 2 ? 2.4 : -0.6);
            L.push([P.x - w / 2, y]); R.push([P.x + w / 2, y]);
        }
        const sil = this.smooth(L) + ' L' + R.slice().reverse().map(p => `${f(p[0])} ${f(p[1])}`).join(' L') + ' Z';
        let boot = `<path d="${sil}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        let bootH = '';
        for (let i = 0; i < rings; i++) {
            const tr = (i + 0.5) / rings, y = base - tr * h0, w = wAt(tr) + 2.4, b = bow(y, w);
            const yv = base - (i + 1) / rings * h0, wv = wAt((i + 1) / rings) - 0.6;
            // гребень: блик сверху валика; складка над ним — тёмная дуга
            boot += `<path d="M${f(P.x - w / 2 + 2)} ${f(y - 1.4)} Q${f(P.x)} ${f(y - 1.4 - b * 2)} ${f(P.x + w / 2 - 2)} ${f(y - 1.4)}" fill="none" class="hl" stroke="${J.tin[500]}" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>`;
            if (i < rings - 1) boot += `<path d="M${f(P.x - wv / 2)} ${f(yv)} Q${f(P.x)} ${f(yv - bow(yv, wv) * 2)} ${f(P.x + wv / 2)} ${f(yv)}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linecap="round" opacity="0.85"/>`;
            const ry = h0 / rings * 0.62;
            bootH += `<g transform="translate(${f(P.x)} ${f(y)}) scale(1 ${f(ry / (w / 2))}) translate(${f(-P.x)} ${f(-y)})">${this.domeH(P.x, y, w / 2, 4)}</g>`;
        }
        // хомут: стальная лента со стяжным винтом сбоку
        const cw = wAt(1) + 1.4;
        const clamp = `<rect x="${f(P.x - cw / 2)}" y="${f(top - 1)}" width="${f(cw)}" height="3.6" rx="1.2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${f(P.x + cw / 2 - 1)}" y="${f(top - 1.6)}" width="3.4" height="4.8" rx="0.8" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            this.rodH(`M${f(P.x - cw / 2 + 1)} ${f(top + 0.8)} L${f(P.x + cw / 2 - 1)} ${f(top + 0.8)}`, 3.4, 1.4);
        // шток
        const K = G.K;
        const s0 = G.s0, sw = 6;
        let shaft = `<rect x="${P.x - sw / 2}" y="${f(s0)}" width="${sw}" height="${f(top - s0 + 1)}" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            // отражение окружения: светлое небо слева, тёмный пол посередине,
            // светлый рефлекс у правого края
            `<rect x="${P.x - 2.2}" y="${f(s0 + 1)}" width="1.1" height="${f(top - s0 - 1)}" fill="${J.tin[100]}"/>` +
            `<rect x="${P.x + 0.2}" y="${f(s0 + 1)}" width="1.4" height="${f(top - s0 - 1)}" fill="${J.tin[700]}"/>` +
            `<rect x="${P.x + 1.9}" y="${f(s0 + 1)}" width="0.6" height="${f(top - s0 - 1)}" fill="${J.tin[100]}" opacity="0.7"/>` +
            this.rodH(`M${P.x} ${f(s0)} L${P.x} ${f(top)}`, sw, 3);
        // втулка рукояти: хромовый стакан, в который вкручен шар
        const cup = `<rect x="${P.x - 4.6}" y="${f(s0 - 1)}" width="9.2" height="6" rx="1.4" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<rect x="${P.x - 3}" y="${f(s0)}" width="1.2" height="4" fill="${J.tin[100]}"/><rect x="${P.x + 0.6}" y="${f(s0)}" width="1.6" height="4" fill="${J.tin[700]}"/>` +
            this.rodH(`M${P.x} ${f(s0)} L${P.x} ${f(s0 + 4)}`, 9, 3.4);
        // схема передач гравировкой: три вертикали через поперечину,
        // точки на концах; лежит на шаре чуть ниже его поверхности
        const KP = this.knobPattern(K.x, K.y, K.r, this.KNOB_PHI);
        let pattern = KP.lines.map(l => `<polyline points="${l.map(q => `${f(q[0])},${f(q[1])}`).join(' ')}" fill="none"/>`).join('');
        let dots = KP.dots.map(d => `<circle cx="${f(d[0])}" cy="${f(d[1])}" r="${f(d[2])}"/>`).join('');
        const rise = 12;
        const knob = `<circle cx="${K.x + 1.5}" cy="${K.y + 2.5}" r="${K.r}" class="fx" fill="${J.hole}" opacity="0.3"/>` +
            `<circle cx="${K.x}" cy="${K.y}" r="${K.r}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            this.domeH(K.x, K.y, K.r, rise) +
            (noPattern ? '' : `<g style="--dh:${this.dh(rise * 0.9)}">` +
            `<g stroke="${J.paint.cream}" stroke-width="${STROKE.structure}" stroke-linecap="round" stroke-linejoin="round">${pattern}</g>` +
            `<g fill="${J.paint.cream}">${dots}</g></g>`) +
            `<ellipse cx="${K.x - 6}" cy="${K.y - 7.5}" rx="4.6" ry="2.6" class="hl" fill="${J.tin[300]}" opacity="0.55" transform="rotate(-35 ${K.x - 6} ${K.y - 7.5})"/>`;
        return {
            boot: this.T(10, 'rubber', boot + bootH),
            frame: this.bootFrame(),
            shaft: this.T(9, 'polished', shaft),
            clamp: this.T(11, 'steel', clamp),
            knob: this.T(9, 'polished', cup) + this.T(8, 'bakelite', knob)
        };
    },
    LEVER_ORDER: ['boot', 'frame', 'shaft', 'clamp', 'knob'],
    leverSvg() {
        const L = this.leverParts();
        return '<g class="gj-lever">' + this.LEVER_ORDER.map(k => L[k]).join('') + '</g>';
    },
    // Схема передач на рукояти — на её «макушке», полюсе шара, который
    // смотрит туда же, куда шток. В покое полюс отклонён к игроку на
    // KNOB_PHI: схема на верхней части шара, сжата по высоте. На рывке
    // шар поворачивается вместе со штоком, и схема сползает через центр
    // вниз — по ней и видно, что рукоять наклоняется, а не раздувается.
    // Было: схема всегда смотрела прямо на нас, и при рывке казалось,
    // что шар просто растёт.
    // Точка схемы (u, v) лежит на сфере: от полюса p вдоль осей x и t
    // (t — вниз и к нам); на экран — проекция, обратная сторона скрыта.
    KNOB_PHI: 50,
    knobPattern(cx, cy, r, phiDeg) {
        const ph = phiDeg * Math.PI / 180, g = 7 * r / 15, R = r;
        const p = [0, -Math.cos(ph), Math.sin(ph)], t = [0, Math.sin(ph), Math.cos(ph)];
        const at = (u, v) => {
            const d = [u / R, p[1] + (v / R) * t[1], p[2] + (v / R) * t[2]];
            const n = Math.hypot(d[0], d[1], d[2]);
            return [cx + R * d[0] / n, cy + R * d[1] / n, d[2] / n];
        };
        const seg = (u0, v0, u1, v1) => {
            const pts = [];
            for (let i = 0; i <= 8; i++) {
                const q = at(u0 + (u1 - u0) * i / 8, v0 + (v1 - v0) * i / 8);
                if (q[2] > 0.08) pts.push(q);
            }
            return pts;
        };
        const lines = [seg(-g, 0, g, 0)].concat([-g, 0, g].map(u => seg(u, -g, u, g))).filter(l => l.length > 1);
        const dots = [];
        [-g, 0, g].forEach(u => [-g, g].forEach(v => {
            const q = at(u, v);
            if (q[2] > 0.08) dots.push([q[0], q[1], 1.2 * r / 15 * (0.55 + 0.45 * q[2])]);
        }));
        return { lines, dots };
    },
    // Одна часть рычага на прозрачном фоне, участком crop — для рывка.
    leverPartSvg(pass, crop, part) {
        this.pass = pass;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}">` +
            this.passStyle(pass) + this.defs() + this.leverParts(true)[part] + '</svg>';
    },

    // Рамка юбки из салона: чёрное пластиковое кольцо на двух саморезах
    // в крышку кулисы. Лежит ПОВЕРХ низа юбки и прижимает его — юбка
    // заправлена под рамку. Было: рамка рисовалась с корпусом, юбка
    // закрывала её целиком и просто стояла на крышке, ни к чему не
    // прикреплённая.
    bootFrame() {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot;
        const y = P.y - 19, w = 38, h = 6;
        return this.T(12, 'plastic', `<rect x="${P.x - w / 2 + 1}" y="${y - 1.6}" width="${w - 2}" height="2" class="fx" fill="${J.hole}" opacity="0.5"/>` +
            `<rect x="${P.x - w / 2}" y="${y}" width="${w}" height="${h}" rx="2.6" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${P.x - w / 2 + 3}" y1="${y + 1.2}" x2="${P.x + w / 2 - 3}" y2="${y + 1.2}" class="hl" stroke="${J.tin[500]}" stroke-width="${STROKE.hairline}"/>` +
            this.rodH(`M${P.x - w / 2 + 3} ${y + h / 2} L${P.x + w / 2 - 3} ${y + h / 2}`, h - 1, 1.4) +
            this.bolt(P.x - w / 2 + 3.6, y + h / 2, 1.3) + this.bolt(P.x + w / 2 - 3.6, y + h / 2, 1.3));
    },

    // Тень на барабанах от верхней и левой кромки окна. Отдельным слоем:
    // в игре барабаны крутятся ПОВЕРХ корпуса, и тень должна лечь поверх
    // них, иначе окно снова станет плоским.
    reelShadeSvg() {
        const J = PALETTE.greedJunk;
        return this.SLOTS.reels.map(r =>
            `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" class="fx" fill="url(#gj-reel-shade)"/>` +
            `<rect x="${r.x}" y="${r.y}" width="8" height="${r.h}" rx="4" class="fx" fill="${J.hole}" opacity="0.25"/>`
        ).join('');
    },

    // Тень от верхнего щита на табло.
    topShade() {
        return this.shade(54, 290, 252, 14);
    },

    // pass — проход рисунка (greed-junk-light.js): baked, albedo, height, mat.
    // crop — участок поля {x, y, w, h}: растр только его (кадры рычага).
    // lever: false — корпус без рычага.
    bodySvg(pass, crop, lever) {
        this.pass = pass || 'baked';
        const clip = `<clipPath id="gj-face"><rect x="62" y="312" width="236" height="148" rx="2"/></clipPath>`;
        const vb = crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 0 ${this.W} ${this.H}`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
            this.passStyle(this.pass) +
            this.defs().replace('</defs>', clip + '</defs>') +
            this.plinth() + this.body() + this.topBox() + this.head() + this.topShade() + this.leverMount() +
            (lever === false ? '' : this.leverSvg()) +
            `</svg>`;
    }

};
