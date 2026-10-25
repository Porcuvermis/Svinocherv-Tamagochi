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
        pivot: { x: 336, y: 420 },
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
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x - r * 0.25)}" cy="${f(y - r * 0.25)}" r="${f(r * 0.55)}" fill="${J.tin[100]}" opacity="0.7"/>` +
            `<line x1="${f(x - c)}" y1="${f(y - s)}" x2="${f(x + c)}" y2="${f(y + s)}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>`;
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
        // Тень от пластины на то, к чему она прикручена: смещение вниз-вправо,
        // от света сверху-слева. Без неё железо читается нарисованным НА
        // досках, а не прикрученным поверх них.
        if (o.shadow !== false) {
            out += `<path d="${this.wob(x + 2, y + 3, w, h, seed + 5)}" fill="${J.hole}" opacity="0.38"/>`;
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
            this.tin(x, y, w, h, Math.round(x * 3 + y), { bolts: false, scratches: 0, tilt: 0 }) +
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
        return `<circle cx="${f(x + 1.5)}" cy="${f(y + 2)}" r="4.2" fill="${J.hole}" opacity="0.45"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="3.6" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="2" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<circle cx="${f(x - 1)}" cy="${f(y - 1)}" r="0.9" fill="${J.tin[100]}"/>`;
    },

    // Рельс-швеллер с пазами: в такие направляющие сверху задвигают
    // крепление. Тёмная прорезь посередине и поперечные зарубки-фиксаторы.
    rail(x, y, w, h, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = this.tin(x, y, w, h, seed, { bolts: false, scratches: 1, tilt: 0, dark: true });
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
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${r || 2.4}" fill="${J.hole}" stroke="${J.wood[900]}" stroke-width="${STROKE.hairline}"/>` +
            `<path d="M${f(x - (r || 2.4))} ${f(y + 0.6)} a${r || 2.4} ${r || 2.4} 0 0 0 ${f((r || 2.4) * 2)} 0" fill="none" stroke="${J.wood[100]}" stroke-width="${STROKE.hairline}" opacity="0.6"/>`;
    },

    // Связка проводов: несколько разноцветных жил с общей скруткой изолентой.
    harness(x, y, pts, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const colors = [J.paint.red, J.paint.blue, J.paint.yellow];
        let out = '';
        colors.forEach((c, i) => {
            const d = 'M' + pts.map(p => f(p[0] + i * 2.2) + ' ' + f(p[1] + i * 1.2)).join(' L');
            out += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>` +
                `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        });
        // изолента на середине
        const m = pts[Math.floor(pts.length / 2)];
        out += `<rect x="${f(m[0] - 3)}" y="${f(m[1] - 2)}" width="10" height="7" rx="1.5" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        // оголённые концы
        const e = pts[pts.length - 1];
        colors.forEach((c, i) => {
            out += `<circle cx="${f(e[0] + i * 2.2)}" cy="${f(e[1] + i * 1.2)}" r="1.2" fill="${J.rust[300]}"/>`;
        });
        return out;
    },

    // ---------- ЧАСТИ КОРПУСА ----------
    // Задний щит с креплениями. Креплениями, а НЕ гнёздами по форме игр:
    // сначала на корпус ставится переходник своей формы, к нему цепляются
    // провода, и только на него — аппаратура (референс docs/ref/greed-machine-junk-empty.jpg).
    topBox() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        let out = this.planks(28, 24, 288, 270, 6, 11, 'v', 14);
        // углы щита темнее середины: свет лампы падает в центр, а не ровно
        out += `<rect x="28" y="24" width="288" height="270" fill="url(#gj-vign)"/>`;
        // поперечина-перекладина, на которой всё висит
        out += this.shade(30, 168, 284, 10);
        out += this.planks(22, 150, 300, 18, 1, 12, 'h');
        // жестяная решётка внизу щита
        out += this.tin(34, 270, 276, 20, 21, { bolts: false, scratches: 2, tilt: 0 });
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
                this.tin(x0 - len / 2, y0 - 9, len, 18, seed, { dark: true, boltR: 2.2, tilt: 0 });
            [-1, 1].forEach(side => {
                const sx = x0 + side * len * 0.3;
                g += `<rect x="${f(sx - 9)}" y="${f(y0 - 2)}" width="18" height="4" rx="2" fill="${J.hole}"/>`;
            });
            return g + '</g>';
        };
        out += strap(w.cx + 4, w.cy, 160, 6, 31);
        out += strap(w.cx, w.cy + 6, 138, 93, 32);
        out += this.tin(w.cx - 24, w.cy - 24, 48, 48, 33, { boltR: 2.4, tilt: -3 });
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
        out += this.harness(0, 0, [[w.cx + 34, w.cy - 64], [w.cx + 42, w.cy - 50], [w.cx + 38, w.cy - 36], [w.cx + 48, w.cy - 28]], 34);
        // крышка от консервной банки на дыре в доске — латка
        out += `<circle cx="64" cy="246" r="15" fill="${J.hole}" opacity="0.38" transform="translate(2 3)"/>` +
            `<circle cx="64" cy="246" r="15" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<circle cx="64" cy="246" r="11" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="64" cy="246" r="7" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<path d="M52 240 a13 13 0 0 1 10 -8" fill="none" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}"/>`;
        [0, 1, 2].forEach(i => { out += this.nail(64 + Math.cos(i * 2.1) * 13, 246 + Math.sin(i * 2.1) * 13); });

        // коробка-вентилятор от чьего-то блока питания между креплениями
        out += this.tin(160, 222, 30, 30, 39, { boltR: 1.8, tilt: -4 });
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
        out += this.tin(p.x - 4, p.y + p.h - 22, p.w + 8, 14, 43, { boltR: 2, tilt: 0 });
        out += `<line x1="${p.x}" y1="${p.y + p.h - 9}" x2="${p.x + p.w}" y2="${p.y + p.h - 9}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>`;
        // монтажная пластина между рельсами с рядами дыр
        out += this.tin(p.x + 30, p.y + 50, p.w - 60, 70, 44, { boltR: 2, tilt: 2 });
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
            out += this.hole(p.x + 40 + c * 12, p.y + 75 + r * 16, 2);
        }
        out += this.socket(p.x + p.w - 30, p.y - 14, 90);
        out += this.harness(0, 0, [[p.x + 44, p.y + 150], [p.x + 54, p.y + 170], [p.x + 46, p.y + 192], [p.x + 58, p.y + 204]], 45);
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
        out += this.tin(50, 296, 260, 172, 61, { boltR: 3, scratches: 0, stroke: STROKE.contour, tilt: 0.4 });
        // крашеное поле: синяя рамка и лучи
        out += `<rect x="62" y="306" width="236" height="144" rx="10" fill="url(#gj-blue)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
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
        // рамка окна барабанов
        out += `<rect x="78" y="332" width="204" height="112" rx="8" fill="${J.paint.blueLo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<line x1="84" y1="335" x2="276" y2="335" stroke="${J.paint.blue}" stroke-width="${STROKE.detail}"/>`;
        S.reels.forEach(r => {
            out += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        });
        // кнопки под окном: разные, как собранные с разных пультов
        [[136, J.paint.orange, 6.5], [168, J.paint.red, 5.5], [196, J.paint.orange, 6.5], [226, J.paint.yellow, 5]].forEach(([bx, c, r]) => {
            out += `<circle cx="${bx}" cy="456" r="${r + 2}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${bx}" cy="455" r="${r}" fill="${c}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
                `<circle cx="${bx - r * 0.3}" cy="${455 - r * 0.35}" r="${r * 0.32}" fill="${J.paint.cream}" opacity="0.8"/>`;
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
        out += this.tin(t.x - 8, t.y - 5, t.w + 16, t.h + 10, 101, { bolts: false, scratches: 1, tilt: 0 });
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

    // Механизм рычага: жестяная пластина на боку, две шестерни и ступица.
    leverMount() {
        const P = this.SLOTS.pivot;
        let out = this.tin(314, 352, 40, 104, 131, { boltR: 2.6 });
        out += this.gear(344, 380, 12, 9, 0.2);
        out += this.gear(P.x, P.y, 21, 12, 0);
        out += `<circle cx="${P.x}" cy="${P.y}" r="9" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        return out;
    },

    // Рычаг — отдельно: он вращается вокруг pivot, корпус при этом не
    // перерисовывается.
    leverSvg() {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot;
        const top = 300;
        return `<g class="gj-lever">` +
            `<rect x="${P.x - 5.5}" y="${top}" width="11" height="${P.y - top}" rx="4" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            `<line x1="${P.x - 2}" y1="${top + 8}" x2="${P.x - 2}" y2="${P.y - 14}" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}"/>` +
            // обмотка изолентой под рукоятью: держать удобнее, и видно, что чинили
            `<rect x="${P.x - 7}" y="${top + 6}" width="14" height="20" rx="3" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<path d="M${P.x - 7} ${top + 12} l14 -3 M${P.x - 7} ${top + 19} l14 -3" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<circle cx="${P.x + 2}" cy="${top - 10}" r="18" fill="${J.hole}" opacity="0.38"/>` +
            `<circle cx="${P.x}" cy="${top - 13}" r="18" fill="url(#gj-wood)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            `<path d="M${P.x - 12} ${top - 8} q6 6 18 2" fill="none" stroke="${J.wood[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<ellipse cx="${P.x - 6}" cy="${top - 20}" rx="6" ry="4" fill="${J.wood[100]}" opacity="0.8"/>` +
            `<circle cx="${P.x}" cy="${P.y}" r="5" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `</g>`;
    },

    // Тень от верхнего щита на табло.
    topShade() {
        return this.shade(54, 290, 252, 14);
    },

    bodySvg() {
        const clip = `<clipPath id="gj-face"><rect x="62" y="306" width="236" height="144" rx="10"/></clipPath>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}">` +
            this.defs().replace('</defs>', clip + '</defs>') +
            this.plinth() + this.body() + this.topBox() + this.head() + this.topShade() + this.leverMount() +
            this.leverSvg() +
            `</svg>`;
    }
};
