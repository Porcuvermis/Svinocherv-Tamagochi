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
            `<radialGradient id="gj-vign" cx="0.5" cy="0.45" r="0.7">` +
            `<stop offset="0.55" stop-color="${J.hole}" stop-opacity="0"/><stop offset="1" stop-color="${J.hole}" stop-opacity="0.5"/></radialGradient>` +
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
    // jag — на сколько доски щита могут не доставать до верхнего края:
    // отпиленные на глаз, они торчат лесенкой, и силуэт перестаёт быть
    // заводским прямоугольником.
    planks(x, y, w, h, n, seed, dir, jag) {
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

    // Рельс-швеллер с пазами: в такие направляющие сверху задвигают
    // крепление. Тёмная прорезь посередине и поперечные зарубки-фиксаторы.
    rail(x, y, w, h, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = this.tin(x, y, w, h, seed, { bolts: false, scratches: 1, tilt: 0, dark: true, z: this.Z.rail });
        out += `<rect x="${f(x + w / 2 - 2)}" y="${f(y + 6)}" width="4" height="${f(h - 12)}" rx="2" fill="${J.hole}"/>`;
        for (let yy = y + 20; yy < y + h - 14; yy += 22) {
            out += `<line x1="${f(x + 2)}" y1="${f(yy)}" x2="${f(x + w - 2)}" y2="${f(yy)}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>` +
                `<line x1="${f(x + 2)}" y1="${f(yy + 1.4)}" x2="${f(x + w - 2)}" y2="${f(yy + 1.4)}" stroke="${J.tin[300]}" stroke-width="${STROKE.hairline}"/>`;
        }
        out += this.bolt(x + w / 2, y + 3.5, 1.8) + this.bolt(x + w / 2, y + h - 3.5, 1.8);
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

    // Жгут проводов, торчащий из дыры: жилы выходят вместе, провисают под
    // своим весом и к концу расходятся, каждая со своим загибом. Жила —
    // три мазка: тёмный контур, цвет изоляции и светлая полоска сверху
    // (провод круглый, свет ложится узкой линией).
    harness(x, y, len, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        const colors = [J.paint.red, J.paint.blue, J.paint.yellow];
        let out = this.hole(x, y, 4.2);
        colors.forEach((c, i) => {
            const spread = (i - 1) * (6 + rnd() * 5);
            const drift = (rnd() - 0.3) * 12;
            const pts = [
                [x + (i - 1) * 1.6, y],
                [x + (i - 1) * 1.8 + drift * 0.3, y + len * 0.35],
                [x + spread * 0.6 + drift, y + len * 0.7],
                [x + spread + drift * 1.2, y + len * (0.92 + rnd() * 0.12)],
                // загиб на конце: оборванная жила не висит отвесно
                [x + spread + drift * 1.2 + (rnd() - 0.5) * 8, y + len * (1.02 + rnd() * 0.1) - 4]
            ];
            const d = this.smooth(pts);
            out += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="3.8" stroke-linecap="round"/>` +
                `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>` +
                `<path d="${d}" fill="none" stroke="${J.paint.cream}" stroke-width="0.6" stroke-linecap="round" opacity="0.6" transform="translate(-0.6 -0.4)"/>`;
            const e = pts[pts.length - 1];
            out += `<circle cx="${f(e[0])}" cy="${f(e[1])}" r="1.3" fill="${J.rust[300]}" stroke="${PALETTE.ink}" stroke-width="0.4"/>`;
        });
        // кусок изоленты, стягивающий жилы у выхода
        out += `<rect x="${f(x - 4.5)}" y="${f(y + len * 0.18)}" width="9" height="6" rx="1.5" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        return out;
    },

    // ---------- ЧАСТИ КОРПУСА ----------
    // Задний щит с креплениями. Креплениями, а НЕ гнёздами по форме игр:
    // сначала на корпус ставится переходник своей формы, к нему цепляются
    // провода, и только на него — аппаратура (референс docs/ref/greed-machine-junk-empty.jpg).
    topBox() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        // Задняя стенка ящика: она в глубине, поэтому темнее рамки — свет до
        // неё доходит хуже.
        let out = this.planks(28, 24, 288, 270, 6, 11, 'v');
        out += `<rect x="28" y="24" width="288" height="270" fill="${J.hole}" opacity="0.28"/>`;
        out += `<rect x="28" y="24" width="288" height="270" fill="url(#gj-vign)"/>`;
        // поперечина-перекладина, на которой всё висит
        out += this.shade(42, 168, 260, 10);
        out += this.planks(42, 150, 260, 18, 1, 12, 'h');
        // жестяная решётка внизу щита
        out += this.tin(34, 270, 276, 20, 21, { bolts: false, scratches: 2, tilt: 0, z: this.Z.strap });
        for (let i = 0; i < 17; i++) {
            const vx = 46 + i * 15;
            if (vx > 140 && vx < 200) continue;
            out += `<rect x="${f(vx)}" y="275" width="7" height="10" rx="1.6" fill="${J.hole}"/>`;
        }
        out += `<rect x="146" y="273" width="48" height="14" rx="2" fill="${J.paint.red}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="150" y="276" width="16" height="3" fill="${J.paint.cream}" opacity="0.5"/>`;

        // ---- крепление колеса: крестовина и фланец со шпильками ----
        const w = S.wheel;
        // Плечи разной длины и под разными углами: крестовину собрали из двух
        // обрезков полосы, а не купили. Продольные прорези — чтобы подвинуть
        // стойку колеса, не сверля новых дыр.
        const strap = (x0, y0, len, ang, seed) => {
            let g = `<g transform="rotate(${ang} ${x0} ${y0})">` +
                this.tin(x0 - len / 2, y0 - 9, len, 18, seed, { dark: true, boltR: 2.2, tilt: 0, z: this.Z.strap });
            [-1, 1].forEach(side => {
                const sx = x0 + side * len * 0.3;
                g += `<rect x="${f(sx - 9)}" y="${f(y0 - 2)}" width="18" height="4" rx="2" fill="${J.hole}"/>`;
            });
            return g + '</g>';
        };
        out += strap(w.cx + 4, w.cy, 160, 6, 31);
        out += strap(w.cx, w.cy + 6, 138, 93, 32);
        out += this.tin(w.cx - 24, w.cy - 24, 48, 48, 33, { boltR: 2.4, tilt: -3, z: this.Z.rail });
        out += `<circle cx="${w.cx}" cy="${w.cy}" r="14" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<circle cx="${w.cx}" cy="${w.cy}" r="7" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<circle cx="${w.cx - 2}" cy="${w.cy - 2}" r="2.2" fill="${J.tin[100]}"/>`;
        [[-16, -16], [16, -16], [-16, 16], [16, 16]].forEach(([dx, dy]) => { out += this.stud(w.cx + dx, w.cy + dy); });
        // пустые отверстия по кругу — под будущую стойку колеса
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.5;
            out += this.hole(w.cx + Math.cos(a) * (w.r - 8), w.cy + Math.sin(a) * (w.r - 8));
        }
        out += this.socket(36, 40, -8);
        // Кабель от розетки провисает к фланцу: питание уже подведено, ждёт
        // колесо. Провисание — дугой вниз, кабель тяжелее, чем кажется.
        out += `<path d="M58 60 C 70 120, 84 150, ${w.cx - 12} ${w.cy + 10}" fill="none" stroke="${PALETTE.ink}" stroke-width="5.2" stroke-linecap="round"/>` +
            `<path d="M58 60 C 70 120, 84 150, ${w.cx - 12} ${w.cy + 10}" fill="none" stroke="${J.tin[900]}" stroke-width="3" stroke-linecap="round"/>` +
            `<path d="M59 64 C 70 118, 83 146, ${w.cx - 14} ${w.cy + 6}" fill="none" stroke="${J.tin[500]}" stroke-width="${STROKE.hairline}" stroke-linecap="round"/>`;
        // хомут на кабеле
        out += this.tin(66, 98, 14, 8, 36, { bolts: false, scratches: 0, tilt: 70, shadow: false });
        out += this.harness(w.cx + 40, w.cy - 70, 52, 34);
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
        out += this.rail(p.x + 2, p.y + 6, 14, p.h - 24, 41);
        out += this.rail(p.x + p.w - 16, p.y + 6, 14, p.h - 24, 42);
        // уголок-полка, на которую встанет короб
        out += this.tin(p.x - 4, p.y + p.h - 22, p.w + 8, 14, 43, { boltR: 2, tilt: 0, z: this.Z.shelf });
        out += `<line x1="${p.x}" y1="${p.y + p.h - 9}" x2="${p.x + p.w}" y2="${p.y + p.h - 9}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>`;
        // монтажная пластина между рельсами с рядами дыр
        out += this.tin(p.x + 30, p.y + 50, p.w - 60, 70, 44, { boltR: 2, tilt: 2 });
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
            out += this.hole(p.x + 40 + c * 12, p.y + 75 + r * 16, 2);
        }
        // Розетка целиком на щите, между рельсами под монтажной пластиной:
        // «странное место» — это неудобное место, а не место за краем.
        out += this.socket(p.x + 36, p.y + 132, -6);
        out += this.harness(p.x + 50, p.y + 168, 44, 45);
        out += this.topFrame();
        return out;
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
        out += this.planks(24, 30, 18, 262, 1, 13, 'v');
        out += this.planks(302, 30, 18, 262, 1, 14, 'v');
        // освещённая кромка левой боковины, тёмная — правой (её грань
        // отвёрнута от света)
        out += `<line x1="26" y1="36" x2="26" y2="288" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.6"/>`;
        out += `<line x1="317" y1="36" x2="317" y2="288" stroke="${J.wood[900]}" stroke-width="${STROKE.structure}" opacity="0.6"/>`;
        // тень крышки на боковины
        out += this.shade(24, 34, 18, 8) + this.shade(302, 34, 18, 8);
        // крышка, нависает над боковинами
        out += this.planks(16, 14, 312, 22, 1, 15, 'h');
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
