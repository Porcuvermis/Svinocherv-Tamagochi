// ================= ТЩЕСЛАВИЕ: ГРИМЁРКА =================
// Хаб тщеславия — хорошая гримёрка Голливуда восьмидесятых (решение игрока):
// на фоне зеркало с лампами и шкаф, червь посередине. Ничего вычурного:
// кремовые обои в полоску, орех, латунь, слоновая кость, пыльная роза.
//
// Нарисована ОДИН раз и без своего света: свет, блики и тени считает
// видеокарта (src/core/lit-gl.js, docs/materials.md). Каждая деталь обёрнута
// в K.T(высота, материал, разметка) — отсюда карта высот и карта материалов.
// Без видеокарты показывается проход baked: тот же рисунок с градиентами и
// нарисованными тенями (классы fx и hl).
//
// ---------- ЧЕТЫРЕ КУСКА, И ЭТО НЕ УКРАШАТЕЛЬСТВО ----------
// На старте выхода гримёрка разъезжается, как декорации у рабочих сцены:
// стена вверх, пол вниз, туалетный столик с зеркалом влево, шкаф вправо
// (pride.js, setDecor). Поэтому рисунок собран из четырёх частей — back,
// floor, left, right, — и каждую можно вывести отдельно: силуэтом (проход
// mask) по ним режется освещённая картинка, а в запасном виде каждая часть
// ложится в свою группу.
//
// ---------- ПОЧЕМУ ЧЕРВЬ НЕ ПО ЦЕНТРУ ----------
// Справа висит колонка ячеек наряда, и между ней и червём выезжает список
// слота (pride-store.js). Червь стоит на ROOM.CX — посередине того, что
// остаётся слева, — и зеркало с лампами отцентрировано по нему же: лампы
// вокруг стекла — над головой звезды, как в настоящей гримёрке.
const PRIDE_ROOM = {
    W: 390,
    H: 844,
    CX: 137,          // где стоит червь в гримёрке (на дорожке — PRIDE_ART.CX)
    WORM_K: 0.94,     // во сколько раз червь в гримёрке мельче, чем на дорожке:
                      // рядом с колонкой ячеек и зеркалом полный рост не влезал
    FLOOR_Y: 584,     // стык стены и пола
    RAIL_Y: 452,      // поручень над ореховыми панелями
    // Рама зеркала (снаружи) и стекло в ней.
    MIR: { x: 44, y: 116, w: 186, h: 274, r: 12 },
    GLASS: { x: 62, y: 134, w: 150, h: 238, r: 8 },
    WARD: { x: 252, y: 110, w: 150 },
    // Карта высот: щели до −6, самое высокое (шкаф, розы) — до 30.
    K: (typeof Lit !== 'undefined') ? Lit.kit({ H0: 6, HMAX: 36, prefix: 'prr' }) : null,

    // Лампы рамы: верхний ряд и два боковых столбика. Одна таблица на всё —
    // гнёзда в рисунке, светящиеся колбы поверх и источники света шейдера.
    bulbs() {
        if (this._bulbs) return this._bulbs;
        const M = this.MIR, out = [];
        const inset = 9;
        for (let i = 0; i < 5; i++) out.push({ x: M.x + 26 + i * (M.w - 52) / 4, y: M.y + inset, row: 'top' });
        for (let i = 0; i < 6; i++) {
            const y = M.y + 42 + i * (M.h - 70) / 5;
            out.push({ x: M.x + inset, y, row: 'left' });
            out.push({ x: M.x + M.w - inset, y, row: 'right' });
        }
        return (this._bulbs = out);
    },

    // Опоры для шейдера: где светят лампы, что отражает зеркало.
    litOptions(scale) {
        const M = this.MIR, G = this.GLASS;
        const warm = (k) => [1.0 * k, 0.8 * k, 0.52 * k];
        return {
            W: this.W, H: this.H, scale: scale || 2,
            H0: this.K.H0, HMAX: this.K.HMAX,
            svg: (pass) => this.svg(pass),
            // Основной свет ниже обычного (0.6 против 0.7): тени длиннее, и
            // шкаф с рамой зеркала отходят от стены, а не лежат на ней.
            light: [-0.5, -0.6, 0.6],
            key: 0.86, keyRgb: [1.0, 0.95, 0.88], amb: 0.46,
            shadow: 0.62, depthK: 0.3, vignette: 0.3,
            relief: 16, ao: 0.55,
            floorY: this.FLOOR_Y, floorGloss: 0.16,
            lights: [
                { x: M.x + M.w / 2, y: M.y + 8, z: 20, r: 120, rgb: warm(0.3) },
                { x: M.x + 9, y: M.y + M.h * 0.5, z: 20, r: 105, rgb: warm(0.26) },
                { x: M.x + M.w - 9, y: M.y + M.h * 0.5, z: 20, r: 105, rgb: warm(0.26) },
                // Свет ламп добирает до пола и ковра: без него низ кадра
                // жил только основным светом и выглядел другой комнатой.
                { x: this.CX, y: 470, z: 110, r: 280, rgb: warm(0.12) }
            ],
            mirror: { x: G.x, y: G.y, w: G.w, h: G.h, r: G.r, pad: 14, shift: 9,
                      svg: () => this.reflection() }
        };
    },

    // ---------- СБОРКА ----------
    // pass — проход (baked, albedo, height, mat, mask), parts — какие куски.
    svg(pass, parts) {
        const K = this.K;
        K.pass = pass; K._gid = 0;
        const P = parts || ['back', 'floor', 'left', 'right'];
        const body = P.map(p => this[p]()).join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}">` +
               this.defs() + K.passStyle(pass) + body + '</svg>';
    },

    // Разметка куска для запасного вида (baked) — прямо в группу сцены.
    // Градиенты и обрезки — один раз, вместе со стеной: все четыре группы
    // лежат в одном svg, и ссылка по id находит их из любой.
    part(name) {
        const K = this.K;
        K.pass = 'baked';
        return (name === 'back' ? this.defs() + K.passStyle('baked') : '') + this[name]();
    },

    // Градиенты нарисованного света — только для baked.
    defs() {
        const D = PALETTE.dressing, M = this.MIR, G = this.GLASS;
        return `<defs>
            <radialGradient id="prr-glow" cx="${M.x + M.w / 2}" cy="${M.y + M.h * 0.45}" r="330" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="${D.bulb.glow}" stop-opacity="0.32"/>
                <stop offset="0.45" stop-color="${D.bulb.glow}" stop-opacity="0.08"/>
                <stop offset="1" stop-color="${D.shade[900]}" stop-opacity="0.38"/>
            </radialGradient>
            <linearGradient id="prr-floor-fx" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${D.shade[900]}" stop-opacity="0.35"/>
                <stop offset="0.3" stop-color="${D.shade[900]}" stop-opacity="0"/>
                <stop offset="1" stop-color="${D.shade[900]}" stop-opacity="0.4"/>
            </linearGradient>
            <linearGradient id="prr-glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="${D.glass[300]}"/>
                <stop offset="1" stop-color="${D.glass[700]}"/>
            </linearGradient>
            <clipPath id="prr-glass-clip"><rect x="${G.x}" y="${G.y}" width="${G.w}" height="${G.h}" rx="${G.r}"/></clipPath>
            <clipPath id="prr-frame-clip"><rect x="${M.x}" y="${M.y}" width="${M.w}" height="${M.h}" rx="${M.r}"/></clipPath>
        </defs>`;
    },

    // Детерминированный разброс: одна и та же гримёрка при каждой сборке,
    // иначе доски паркета и блёстки «перетасовывались» бы на каждом входе.
    rng(seed) {
        let s = (seed | 0) || 1;
        return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
    },

    // ================= СТЕНА =================
    back() {
        const K = this.K, D = PALETTE.dressing, W = this.W, f = K.f;
        const FY = this.FLOOR_Y, RY = this.RAIL_Y;
        let s = '';
        // Обои: кремовая бумага и атласные полосы. Полоса — другой МАТЕРИАЛ на
        // той же высоте: рельефа нет, а отлив бежит по стене за наклоном.
        s += K.T(0, 'wallpaper', `<rect x="0" y="0" width="${W}" height="${FY}" fill="${D.paper[300]}"/>`);
        let stripes = '', pins = '';
        for (let x = -6; x < W + 20; x += 34) {
            stripes += `<rect x="${x}" y="0" width="14" height="${RY}" fill="${D.paper[100]}"/>`;
            pins += `<rect x="${x - 3}" y="0" width="0.8" height="${RY}" fill="${D.paper[500]}"/>` +
                    `<rect x="${x + 16.2}" y="0" width="0.8" height="${RY}" fill="${D.paper[500]}"/>`;
        }
        s += K.T(0, 'satin', stripes) + K.T(0, 'wallpaper', pins);

        // Карниз под потолком: эмаль, два валика.
        s += K.T(2, 'enamel',
            `<rect x="0" y="62" width="${W}" height="30" fill="${D.ivory[500]}"/>` +
            K.rodH(`M-10 74 H${W + 10}`, 12, 3.5) +
            `<rect x="0" y="89" width="${W}" height="5" fill="${D.ivory[700]}"/>` +
            K.rodH(`M-10 91.5 H${W + 10}`, 5, 1.6) +
            `<rect class="fx" x="0" y="94" width="${W}" height="6" fill="${D.shade[900]}" opacity="0.18"/>`);

        // Поручень и ореховые панели под ним.
        s += K.T(1.5, 'walnut', `<rect x="0" y="${RY + 8}" width="${W}" height="${FY - RY - 8}" fill="${D.walnut[500]}"/>`);
        let panels = '';
        const pitch = 65, rnd = this.rng(17);
        for (let i = 0; i < 7; i++) {
            const x = -20 + i * pitch + 8, y = RY + 18, w = pitch - 16, h = FY - RY - 46;
            let grain = '';
            for (let g = 0; g < 4; g++) {
                const gx = x + 6 + rnd() * (w - 12);
                grain += `<path class="nh" d="M${f(gx)} ${y + 4} q${f(rnd() * 6 - 3)} ${f(h * 0.5)} ${f(rnd() * 4 - 2)} ${h - 8}"
                                fill="none" stroke="${D.walnut[700]}" stroke-width="${STROKE.hairline}" opacity="0.45"/>`;
            }
            // Профиль высот — ПОСЛЕ плоской заливки: в проходе высот заливка
            // ложится ровной полкой и затирает то, что нарисовано под ней
            // (ревизия 28.11: фаски филёнок пропадали целиком, и место
            // читалось вдавленным, tools/pride-room-audit.js).
            panels += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${D.walnut[300]}"/>` +
                `<rect class="nh" x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" fill="${D.walnut[100]}" opacity="0.35"/>` +
                grain + K.bevelH(x, y, w, h, 1.5, 1.6, 5) +
                `<rect class="hl" x="${x}" y="${y}" width="${w}" height="2" fill="${D.oak[100]}" opacity="0.45"/>` +
                `<rect class="fx" x="${x}" y="${y + h - 2}" width="${w}" height="2" fill="${D.shade[900]}" opacity="0.4"/>`;
        }
        s += K.T(1.5, 'walnut', panels);
        s += K.T(3, 'walnut', `<rect x="0" y="${RY}" width="${W}" height="11" fill="${D.walnut[300]}"/>` +
            K.cylH(0, RY, W, 11, 2.2, 2.4, { vertical: false }) +
            `<rect class="hl" x="0" y="${RY + 2}" width="${W}" height="1.6" fill="${D.oak[100]}" opacity="0.6"/>` +
            `<rect class="fx" x="0" y="${RY + 11}" width="${W}" height="4" fill="${D.shade[900]}" opacity="0.3"/>`);
        // Плинтус.
        s += K.T(3, 'walnut', `<rect x="0" y="${FY - 20}" width="${W}" height="20" fill="${D.walnut[700]}"/>` +
            K.cylH(0, FY - 20, W, 5, 2.4, 1.4, { vertical: false }));

        // Нарисованный свет для запасного вида: тепло у зеркала, сумрак в углах.
        s += `<rect class="fx" x="0" y="0" width="${W}" height="${FY}" fill="url(#prr-glow)"/>`;
        return s;
    },

    // ================= ПОЛ И КОВЁР =================
    floor() {
        const K = this.K, D = PALETTE.dressing, W = this.W, H = this.H, f = K.f;
        const FY = this.FLOOR_Y, VX = 195, VY = 300;
        const at = (xb, y) => VX + (xb - VX) * (y - VY) / (H - VY);
        let s = K.T(0, 'walnut', `<rect x="0" y="${FY}" width="${W}" height="${H - FY}" fill="${D.oak[500]}"/>`);
        // Паркет: доски сходятся к точке над полом, швы — щелью (pit).
        const rnd = this.rng(5);
        const tones = [D.oak[500], D.oak[300], D.oak[700], D.oak[300]];
        let planks = '', seams = '';
        const step = 46;
        for (let i = -14; i <= 14; i++) {
            const a = VX + i * step, b = a + step;
            const tone = tones[Math.floor(rnd() * tones.length)];
            planks += `<polygon points="${f(at(a, FY))},${FY} ${f(at(b, FY))},${FY} ${b},${H} ${a},${H}" fill="${tone}" opacity="0.55"/>`;
            seams += `<path d="M${f(at(a, FY))} ${FY} L${a} ${H}"/>`;
            // Торцевые стыки досок — в перспективе: чем ближе, тем реже.
            let u = rnd() * 0.25;
            while (u < 1) {
                const y = FY + (H - FY) * Math.pow(u, 1.5);
                seams += `<path d="M${f(at(a, y))} ${f(y)} L${f(at(b, y))} ${f(y)}"/>`;
                u += 0.3 + rnd() * 0.25;
            }
        }
        s += K.T(0, 'walnut', planks);
        s += `<g class="pit" fill="none" stroke="${D.walnut[700]}" stroke-width="${STROKE.detail}" opacity="0.8">${seams}</g>`;
        s += `<rect class="fx" x="0" y="${FY}" width="${W}" height="${H - FY}" fill="url(#prr-floor-fx)"/>`;

        // Ковёр — пыльная роза, овал под червём: на нём и тень, и свет ламп.
        const cx = this.CX, cy = 648, rx = 156, ry = 40;
        let orn = '';
        for (let i = 0; i < 28; i++) {
            const t = i / 28 * Math.PI * 2;
            orn += `<circle cx="${f(cx + Math.cos(t) * (rx - 26))}" cy="${f(cy + Math.sin(t) * (ry - 9))}" r="2.2" fill="${D.rose[100]}"/>`;
        }
        s += K.T(0.6, 'velvet',
            `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${D.rose[700]}"/>` +
            K.domeH(cx, cy, rx, 1.0, ry) +
            `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 12}" ry="${ry - 5}" fill="${D.rose[500]}"/>` +
            `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 40}" ry="${ry - 15}" fill="none" stroke="${D.rose[300]}" stroke-width="2"/>` +
            orn +
            `<ellipse class="hl" cx="${cx - 30}" cy="${cy - 10}" rx="${rx * 0.5}" ry="${ry * 0.35}" fill="${D.rose[100]}" opacity="0.2"/>`);
        return s;
    },

    // ================= ТУАЛЕТНЫЙ СТОЛИК С ЗЕРКАЛОМ =================
    left() {
        return this.mirror() + this.table() + this.tableProps();
    },

    mirror() {
        const K = this.K, D = PALETTE.dressing, M = this.MIR, G = this.GLASS, f = K.f;
        let s = '';
        // Рама — эмаль цвета слоновой кости, фаска внутрь к стеклу.
        s += K.T(6, 'enamel',
            `<rect x="${M.x}" y="${M.y}" width="${M.w}" height="${M.h}" rx="${M.r}" fill="${D.ivory[500]}"
                   stroke="${D.ivory[700]}" stroke-width="${STROKE.detail}"/>` +
            `<g clip-path="url(#prr-frame-clip)">${K.bevelH(M.x - 1, M.y - 1, M.w + 2, M.h + 2, 6, 2.5, G.x - 7 - M.x + 1, true)}</g>` +
            `<rect class="hl" x="${M.x + 3}" y="${M.y + 2}" width="${M.w - 6}" height="3" rx="1.5" fill="${D.ivory[300]}" opacity="0.8"/>`);
        // Губа вокруг стекла и само стекло — утоплено ниже рамы: рама кладёт на
        // него тень, и стекло читается вставленным, а не наклеенным.
        s += K.T(6, 'enamel', `<rect class="nh" x="${G.x - 4}" y="${G.y - 4}" width="${G.w + 8}" height="${G.h + 8}" rx="${G.r + 3}"
                fill="none" stroke="${D.ivory[700]}" stroke-width="3"/>` + K.bevelH(G.x - 7, G.y - 7, G.w + 14, G.h + 14, 8.5, -2.5, 5));
        // Стекло утоплено в раму НАРОЧНО (sunk): рама кладёт на него тень, и
        // ревизия вдавленного (tools/pride-room-audit.js) его не считает.
        s += `<g class="sunk">` + K.T(3.5, 'mirror', `<rect x="${G.x}" y="${G.y}" width="${G.w}" height="${G.h}" rx="${G.r}"
                fill="${K.paint('prr-glass', D.glass[300], D.glass[700])}"/>`) + `</g>`;
        // В запасном виде отражение лежит прямо в стекле, без сдвига.
        if (K.pass === 'baked') {
            s += `<g clip-path="url(#prr-glass-clip)"><g transform="translate(${G.x - 14},${G.y - 14})" opacity="0.85">${this.reflectionBody()}</g>` +
                 `<path d="M${G.x + 20} ${G.y + G.h} L${G.x + G.w * 0.8} ${G.y} L${G.x + G.w} ${G.y} L${G.x + 50} ${G.y + G.h} Z" fill="${D.glass[100]}" opacity="0.18"/></g>`;
        }
        // Гнёзда ламп: латунные чашки с тёмной серединой. Сами колбы светятся
        // поверх освещённой картинки (overlay) — они источник, а не предмет.
        let sockets = '';
        this.bulbs().forEach(b => {
            sockets += `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="6.6" fill="${D.brass[500]}" stroke="${D.brass[700]}" stroke-width="${STROKE.hairline}"/>` +
                K.domeH(b.x, b.y, 6.6, 1.8) +
                `<circle class="pit" cx="${f(b.x)}" cy="${f(b.y)}" r="2.8" fill="${D.shade[900]}"/>`;
        });
        s += K.T(9.5, 'gilt', sockets);
        // Фотокарточки за рамой — пасхалка: сердечко и звезда, без единой буквы.
        s += K.T(10.5, 'paper', this.photo(G.x + 2, G.y + G.h - 46, -9, 'heart') +
                                this.photo(G.x + G.w - 30, G.y + 6, 8, 'star'));
        return s;
    },

    photo(x, y, rot, kind) {
        const D = PALETTE.dressing.props, w = 32, h = 38;
        const pic = kind === 'heart'
            ? `<path d="M${w / 2} ${h * 0.62} c-9 -6 -11 -12 -7 -16 c3 -3 6 -2 7 1 c1 -3 4 -4 7 -1 c4 4 2 10 -7 16 Z" fill="${PALETTE.dressing.rose[500]}"/>`
            : `<path d="M${w / 2} ${h * 0.18} l3.2 6.6 7.2 1 -5.2 5 1.3 7.2 -6.5 -3.4 -6.5 3.4 1.3 -7.2 -5.2 -5 7.2 -1 Z" fill="${D.star}"/>`;
        return `<g transform="translate(${x},${y}) rotate(${rot} ${w / 2} ${h / 2})">
            <rect x="0" y="0" width="${w}" height="${h}" fill="${D.photo}" stroke="${D.photoInk}" stroke-width="${STROKE.hairline}"/>
            <rect x="3" y="3" width="${w - 6}" height="${h - 11}" fill="${PALETTE.dressing.glass[500]}" opacity="0.55"/>
            ${pic}
            <rect class="fx" x="0" y="${h}" width="${w}" height="2" fill="${PALETTE.dressing.shade[900]}" opacity="0.25"/>
        </g>`;
    },

    table() {
        const K = this.K, D = PALETTE.dressing, f = K.f, FY = this.FLOOR_Y;
        const x0 = 26, x1 = 249, top = 388;
        let s = '';
        // Ножки — точёные, сужаются к полу.
        [[34, 46], [232, 244]].forEach(([a, b]) => {
            s += K.T(9, 'walnut',
                `<path d="M${a} ${top + 70} L${b} ${top + 70} L${b - 2} ${FY - 4} L${a + 2} ${FY - 4} Z" fill="${D.walnut[500]}"
                       stroke="${D.walnut[700]}" stroke-width="${STROKE.hairline}"/>` +
                K.cylH(a, top + 70, b - a, FY - 4 - top - 70, 9, 1.6)) +
                K.T(11, 'gilt', `<rect x="${a - 1}" y="${FY - 8}" width="${b - a + 2}" height="6" rx="2" fill="${D.brass[500]}"/>`);
        });
        // Царга с тремя ящиками.
        let drawers = '';
        [[34, 92], [96, 182], [186, 244]].forEach(([a, b]) => {
            drawers += `<rect x="${a}" y="${top + 24}" width="${b - a}" height="44" rx="2" fill="${D.walnut[300]}"
                       stroke="${D.walnut[700]}" stroke-width="${STROKE.hairline}"/>` + K.bevelH(a, top + 24, b - a, 44, 10.5, 1.4, 3) +
                `<rect class="hl" x="${a + 2}" y="${top + 25}" width="${b - a - 4}" height="1.4" fill="${D.oak[100]}" opacity="0.5"/>`;
        });
        let knobs = '';
        [63, 139, 215].forEach(x => {
            knobs += `<circle cx="${x}" cy="${top + 46}" r="3.6" fill="${D.brass[300]}" stroke="${D.brass[700]}" stroke-width="${STROKE.hairline}"/>` +
                     K.domeH(x, top + 46, 3.6, 2.2);
        });
        s += K.T(10.5, 'walnut', `<rect x="${x0 + 2}" y="${top + 18}" width="${x1 - x0 - 4}" height="56" fill="${D.walnut[500]}"/>` + drawers);
        s += K.T(12, 'gilt', knobs);
        // Столешница: видна сверху узкой полосой и торцом.
        s += K.T(12.5, 'walnut',
            `<rect x="${x0 + 2}" y="${top}" width="${x1 - x0 - 4}" height="9" fill="${D.walnut[100]}"/>` +
            `<rect x="${x0}" y="${top + 8}" width="${x1 - x0}" height="11" rx="3" fill="${D.walnut[300]}"
                   stroke="${D.walnut[700]}" stroke-width="${STROKE.hairline}"/>` +
            K.cylH(x0, top + 8, x1 - x0, 11, 12.5, 1.6, { vertical: false, rx: 3 }) +
            `<rect class="hl" x="${x0 + 3}" y="${top + 1}" width="${x1 - x0 - 8}" height="2" fill="${D.ivory[300]}" opacity="0.35"/>` +
            `<rect class="fx" x="${x0}" y="${top + 19}" width="${x1 - x0}" height="5" fill="${D.shade[900]}" opacity="0.35"/>`);
        return s;
    },

    // Мелочь на столешнице — только по краям: середину закрывает червь.
    tableProps() {
        const K = this.K, D = PALETTE.dressing, P = D.props, f = K.f;
        const top = 392;
        let s = '';
        // Слева — низкая хрустальная чаша с розами. Низкая нарочно: колбы
        // нижнего угла рамы светят ПОВЕРХ картинки, и высокий букет уходил
        // под лампы — розы на столе оказывались за зеркалом.
        const vx = 44;
        const leaves = `<ellipse cx="${vx - 15}" cy="${top - 13}" rx="8" ry="3.2" transform="rotate(-24 ${vx - 15} ${top - 13})" fill="${P.leaf}"/>` +
                       `<ellipse cx="${vx + 16}" cy="${top - 12}" rx="8" ry="3.2" transform="rotate(26 ${vx + 16} ${top - 12})" fill="${P.leafHi}"/>`;
        s += K.T(14, 'velvet', leaves);
        // Каждая следующая роза лежит поверх предыдущей — и выше её больше,
        // чем на подъём купола: иначе край верхней проваливался в купол
        // нижней (ревизия 28.11, канава по контуру бутона).
        [[vx, top - 18, 7.4], [vx - 9, top - 13, 6.8], [vx + 8, top - 14, 7.2], [vx - 15, top - 8, 5.6], [vx + 15, top - 8, 5.8]].forEach(([x, y, r], i) => {
            s += K.T(15 + i * 1.8, 'velvet', `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.roseRed}" stroke="${D.velvet[700]}" stroke-width="${STROKE.hairline}"/>` +
                K.domeH(x, y, r, 1.6) +
                `<path class="nh" d="M${f(x - r * 0.5)} ${f(y)} q${f(r * 0.5)} ${f(-r * 0.7)} ${f(r)} 0 q${f(-r * 0.3)} ${f(r * 0.5)} ${f(-r * 0.6)} ${f(r * 0.1)}"
                       fill="none" stroke="${P.roseHi}" stroke-width="1.1"/>` +
                `<circle class="hl" cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.3)}" fill="${P.roseHi}" opacity="0.6"/>`);
        });
        // Передний борт чаши закрывает низ роз — значит, он выше их.
        s += K.T(24, 'glass',
            `<path d="M${vx - 17} ${top - 9} Q${vx - 15} ${top} ${vx - 8} ${top} L${vx + 8} ${top} Q${vx + 15} ${top} ${vx + 17} ${top - 9} Z"
                   fill="${D.glass[300]}" stroke="${D.glass[700]}" stroke-width="${STROKE.hairline}" opacity="0.92"/>` +
            K.cylH(vx - 17, top - 9, 34, 9, 24, 1.2, { vertical: false }) +
            `<path class="hl" d="M${vx - 12} ${top - 6} h14" fill="none" stroke="${D.glass[100]}" stroke-width="1.4"/>`);

        // Справа: флакон духов с грушей, пудреница, помада.
        const px = 232;
        s += K.T(13, 'glass',
            `<rect x="${px - 8}" y="${top - 22}" width="16" height="22" rx="5" fill="${P.perfume}"
                   stroke="${D.glass[700]}" stroke-width="${STROKE.hairline}"/>` +
            K.cylH(px - 8, top - 22, 16, 22, 13, 3, { rx: 5 }) +
            `<rect class="hl" x="${px - 5}" y="${top - 19}" width="2.4" height="15" rx="1.2" fill="${D.glass[100]}" opacity="0.8"/>`);
        s += K.T(15, 'gilt',
            `<rect x="${px - 3.5}" y="${top - 29}" width="7" height="8" rx="1.5" fill="${D.brass[500]}"/>` +
            K.cylH(px - 3.5, top - 29, 7, 8, 15, 1.2) +
            `<path d="M${px + 3} ${top - 26} q8 -2 10 6" fill="none" stroke="${D.brass[700]}" stroke-width="1"/>`);
        s += K.T(14, 'velvet', `<circle cx="${px + 14}" cy="${top - 18}" r="4.6" fill="${P.perfume}"/>` + K.domeH(px + 14, top - 18, 4.6, 2.4));
        s += K.T(13.5, 'gilt',
            `<ellipse cx="${px + 14}" cy="${top - 2}" rx="6" ry="2.4" fill="${D.brass[300]}" stroke="${D.brass[700]}" stroke-width="${STROKE.hairline}"/>` +
            K.domeH(px + 14, top - 2, 6, 1.2, 2.4));
        return s;
    },

    // ================= ШКАФ =================
    right() {
        const K = this.K, D = PALETTE.dressing, P = D.props, f = K.f;
        const X = this.WARD.x, Y = this.WARD.y, FY = this.FLOOR_Y, X1 = 402;
        let s = '';
        // Корпус и боковина.
        s += K.T(13, 'walnut', `<rect x="${X}" y="${Y}" width="${X1 - X}" height="${FY - Y}" fill="${D.walnut[500]}"/>` +
            `<rect x="${X}" y="${Y}" width="7" height="${FY - Y}" fill="${D.walnut[700]}"/>` +
            `<rect class="fx" x="${X + 7}" y="${Y}" width="3" height="${FY - Y}" fill="${D.shade[900]}" opacity="0.3"/>`);
        // Карниз и цоколь.
        s += K.T(15, 'walnut',
            `<rect x="${X - 6}" y="${Y - 14}" width="${X1 - X + 6}" height="15" rx="2" fill="${D.walnut[300]}"
                   stroke="${D.walnut[700]}" stroke-width="${STROKE.hairline}"/>` +
            K.cylH(X - 6, Y - 14, X1 - X + 6, 15, 15, 2, { vertical: false, rx: 2 }) +
            `<rect class="hl" x="${X - 4}" y="${Y - 12}" width="${X1 - X}" height="2" fill="${D.oak[100]}" opacity="0.5"/>`);
        s += K.T(14, 'walnut', `<rect x="${X - 2}" y="${FY - 20}" width="${X1 - X + 2}" height="20" fill="${D.walnut[700]}"/>` +
            K.cylH(X - 2, FY - 20, X1 - X + 2, 5, 14, 1.2, { vertical: false }));
        // Двери: рамка и две утопленные филёнки на каждой. Левая приоткрыта —
        // в щель видно нутро, и оттуда свисает рукав в блёстках.
        const doors = [[X + 12, X + 76], [X + 80, X1 - 4]];
        doors.forEach(([a, b], di) => {
            const top = Y + 8, bot = FY - 24;
            const pans = [[top + 12, top + (bot - top) * 0.48], [top + (bot - top) * 0.52, bot - 12]];
            let d = `<rect x="${a}" y="${top}" width="${b - a}" height="${bot - top}" fill="${D.walnut[300]}"
                           stroke="${D.walnut[700]}" stroke-width="${STROKE.hairline}"/>`;
            pans.forEach(([y0, y1]) => {
                d += `<rect x="${a + 9}" y="${f(y0)}" width="${b - a - 18}" height="${f(y1 - y0)}" fill="${D.walnut[500]}"
                            stroke="${D.walnut[700]}" stroke-width="${STROKE.hairline}"/>` +
                     `<rect class="fx" x="${a + 9}" y="${f(y0)}" width="${b - a - 18}" height="3" fill="${D.shade[900]}" opacity="0.35"/>`;
            });
            // Профили — после заливок (иначе заливка их затирает): рама двери
            // поднимается к краю, филёнки утоплены от рамы внутрь.
            d += K.bevelH(a, top, b - a, bot - top, 14, 1.6, 4);
            pans.forEach(([y0, y1]) => { d += K.bevelH(a + 9, y0, b - a - 18, y1 - y0, 15.6, -2.4, 6); });
            s += K.T(14, 'walnut', d);
            // ручка: латунная скоба
            const hx = di === 0 ? b - 7 : a + 7;
            s += K.T(16, 'gilt',
                `<rect x="${hx - 2}" y="${FY * 0.5 + 10}" width="4" height="34" rx="2" fill="${D.brass[300]}"
                       stroke="${D.brass[700]}" stroke-width="${STROKE.hairline}"/>` +
                K.cylH(hx - 2, FY * 0.5 + 10, 4, 34, 15.8, 1.6, { rx: 2 }));
        });
        // Щель приоткрытой двери: тёмное нутро.
        s += `<rect class="pit" x="${X + 8}" y="${Y + 8}" width="5" height="${FY - Y - 32}" fill="${D.shade[900]}"/>`;
        s += this.sleeve(X + 4, 250) + this.boa(X + 6, Y + 18);
        s += this.hatBox(X + 34, Y - 52);
        return s;
    },

    // Рукав в блёстках свисает из щели: блёстки — мелкие купола, каждый ловит
    // свет по-своему, и от наклона телефона они мерцают.
    sleeve(x, y) {
        const K = this.K, D = PALETTE.dressing, P = D.props, f = K.f;
        const rnd = this.rng(41);
        const path = `M${x} ${y} C${x + 10} ${y + 30} ${x + 14} ${y + 70} ${x + 8} ${y + 116} L${x - 6} ${y + 120} C${x - 2} ${y + 80} ${x - 4} ${y + 36} ${x - 8} ${y + 4} Z`;
        let seq = '';
        for (let i = 0; i < 46; i++) {
            const t = rnd(), u = rnd();
            const yy = y + 6 + t * 110;
            const half = 5 + t * 4;
            const xx = x + (u - 0.5) * 2 * half + t * 6 - 2;
            const c = rnd() < 0.6 ? P.sequin : P.sequinLo;
            seq += `<circle cx="${f(xx)}" cy="${f(yy)}" r="1.7" fill="${c}"/>` + K.domeH(xx, yy, 1.7, 0.9 + rnd() * 0.8);
        }
        return K.T(15, 'sequin', `<path d="${path}" fill="${P.sequinLo}" stroke="${D.walnut[900]}" stroke-width="${STROKE.hairline}"/>` + seq);
    },

    // Боа свисает с верха двери: пух без блика, мягкий край.
    boa(x, y) {
        const K = this.K, P = PALETTE.dressing.props, f = K.f;
        // Пух — россыпь мелких перьев вокруг извилистой оси, а не бусы из
        // одинаковых шаров: бусы читались гусеницей.
        // Высота — одним валиком вдоль оси боа, а пушки — только цветом (nh):
        // купол на каждом пушке ложился на пик соседнего, и между ними шли
        // канавы (ревизия 28.11) — гроздь из куполов без канав не сложить.
        const rnd = this.rng(77);
        let axis = '';
        for (let i = 0; i <= 12; i++) {
            const t = i / 12;
            axis += (i ? ' L' : 'M') + f(x - 4 + Math.sin(t * 5.5) * 5 - t * 6) + ' ' + f(y + t * 150);
        }
        let puffs = '', fluff = '';
        for (let i = 0; i < 64; i++) {
            const t = i / 63;
            const ax = x - 4 + Math.sin(t * 5.5) * 5 - t * 6, ay = y + t * 150;
            const a = rnd() * Math.PI * 2, d = rnd() * 6;
            const xx = ax + Math.cos(a) * d, yy = ay + Math.sin(a) * d * 0.7;
            const r = 3 + rnd() * 3.4;
            puffs += `<circle class="nh" cx="${f(xx)}" cy="${f(yy)}" r="${f(r)}" fill="${rnd() < 0.55 ? P.boa : P.boaLo}"/>`;
            if (i % 2 === 0) {
                const ex = ax + Math.cos(a) * 8, ey = ay + Math.sin(a) * 6;
                fluff += `<path class="nh" d="M${f(ax)} ${f(ay)} L${f(ex)} ${f(ey)}" stroke="${P.boa}" stroke-width="0.9" fill="none" opacity="0.8"/>`;
            }
        }
        return K.T(16, 'feather', `<path d="${axis}" fill="none" stroke="${P.boaLo}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.001"/>` +
            K.rodH(axis, 14, 3) + fluff + puffs);
    },

    // Шляпная коробка на шкафу: в полоску, со звездой на крышке.
    hatBox(x, y) {
        const K = this.K, D = PALETTE.dressing, P = D.props, f = K.f;
        const w = 60, h = 40;
        let stripes = '';
        for (let i = 0; i < 6; i++) stripes += `<rect x="${x + 4 + i * 10}" y="${y + 9}" width="5" height="${h - 9}" fill="${D.ivory[500]}" opacity="0.8"/>`;
        return K.T(17.5, 'velvet',
            `<rect x="${x}" y="${y + 8}" width="${w}" height="${h - 8}" rx="4" fill="${D.rose[300]}"
                   stroke="${D.rose[700]}" stroke-width="${STROKE.hairline}"/>` + stripes +
            K.cylH(x, y + 8, w, h - 8, 17.5, 3, { rx: 4 })) +
            K.T(20.5, 'velvet',
            `<rect x="${x - 3}" y="${y}" width="${w + 6}" height="11" rx="3" fill="${D.rose[500]}"
                   stroke="${D.rose[700]}" stroke-width="${STROKE.hairline}"/>` +
            K.cylH(x - 3, y, w + 6, 11, 20.5, 2, { rx: 3 })) +
            K.T(23, 'gilt',
            `<path d="M${x + w / 2} ${y + 14} l3.4 7 7.6 1.1 -5.5 5.3 1.3 7.6 -6.8 -3.6 -6.8 3.6 1.3 -7.6 -5.5 -5.3 7.6 -1.1 Z"
                   fill="${P.star}" stroke="${D.brass[700]}" stroke-width="${STROKE.hairline}"/>` +
            K.domeH(x + w / 2, y + 24, 8, 1.2));
    },

    // ================= ОТРАЖЕНИЕ В ЗЕРКАЛЕ =================
    // Что за спиной у зрителя: противоположная стена гримёрки — дверь со
    // звездой, вешалка с костюмами, бра. Размыто и притушено: это отражение,
    // а не окно. Картинка шире стекла на pad с каждой стороны — наклон
    // сдвигает её, и край не должен вылезать.
    reflection() {
        const G = this.GLASS, pad = 14;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G.w + pad * 2} ${G.h + pad * 2}">${this.reflectionBody()}</svg>`;
    },

    reflectionBody() {
        const D = PALETTE.dressing, P = D.props, G = this.GLASS, pad = 14;
        const w = G.w + pad * 2, h = G.h + pad * 2;
        let st = '';
        for (let x = -4; x < w; x += 22) st += `<rect x="${x}" y="0" width="9" height="${h * 0.66}" fill="${D.paper[300]}"/>`;
        let rack = '';
        [[w * 0.66, P.satin], [w * 0.74, D.velvet[500]], [w * 0.82, P.sequin], [w * 0.9, D.glass[700]]].forEach(([x, c]) => {
            rack += `<path d="M${x - 9} ${h * 0.34} L${x + 9} ${h * 0.34} L${x + 12} ${h * 0.72} L${x - 12} ${h * 0.72} Z" fill="${c}"/>`;
        });
        return `<defs><filter id="prr-rb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.8"/></filter>
                <radialGradient id="prr-rg" cx="0.28" cy="0.3" r="0.7"><stop offset="0" stop-color="${D.bulb.glow}" stop-opacity="0.35"/>
                <stop offset="1" stop-color="${D.shade[900]}" stop-opacity="0.45"/></radialGradient></defs>
            <g filter="url(#prr-rb)">
                <rect x="0" y="0" width="${w}" height="${h}" fill="${D.paper[500]}"/>
                ${st}
                <rect x="0" y="${h * 0.66}" width="${w}" height="${h * 0.34}" fill="${D.walnut[500]}"/>
                <rect x="0" y="${h * 0.66}" width="${w}" height="5" fill="${D.walnut[300]}"/>
                <rect x="${w * 0.12}" y="${h * 0.16}" width="${w * 0.36}" height="${h * 0.72}" fill="${D.walnut[300]}"/>
                <rect x="${w * 0.16}" y="${h * 0.21}" width="${w * 0.28}" height="${h * 0.26}" fill="${D.walnut[500]}"/>
                <rect x="${w * 0.16}" y="${h * 0.51}" width="${w * 0.28}" height="${h * 0.3}" fill="${D.walnut[500]}"/>
                <path d="M${w * 0.3} ${h * 0.25} l5 10 11 1.6 -8 7.8 1.9 11 -9.9 -5.2 -9.9 5.2 1.9 -11 -8 -7.8 11 -1.6 Z" fill="${P.star}"/>
                <circle cx="${w * 0.42}" cy="${h * 0.5}" r="2.6" fill="${D.brass[300]}"/>
                <rect x="${w * 0.58}" y="${h * 0.3}" width="${w * 0.4}" height="3" fill="${D.brass[500]}"/>
                ${rack}
                <circle cx="${w * 0.58}" cy="${h * 0.12}" r="9" fill="${D.bulb.body}"/>
                <rect x="0" y="0" width="${w}" height="${h}" fill="url(#prr-rg)"/>
            </g>`;
    },

    // ================= ПОВЕРХ СВЕТА =================
    // Колбы ламп и их ореол. Они источник света, а не предмет: освещать их
    // шейдером незачем, а вектором они резкие при любом масштабе.
    bulbsOverlay() {
        const D = PALETTE.dressing, f = (n) => Math.round(n * 10) / 10;
        let halo = '', glass = '';
        this.bulbs().forEach(b => {
            halo += `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="26" fill="url(#prr-halo)"/>`;
            glass += `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="7.2" fill="url(#prr-bulb)"/>` +
                     `<circle cx="${f(b.x - 2.2)}" cy="${f(b.y - 2.4)}" r="1.8" fill="${D.bulb.core}" opacity="0.95"/>`;
        });
        return `<defs>
            <radialGradient id="prr-halo"><stop offset="0" stop-color="${D.bulb.glow}" stop-opacity="0.42"/>
                <stop offset="0.35" stop-color="${D.bulb.glow}" stop-opacity="0.16"/>
                <stop offset="1" stop-color="${D.bulb.glow}" stop-opacity="0"/></radialGradient>
            <radialGradient id="prr-bulb" cx="0.42" cy="0.4" r="0.62"><stop offset="0" stop-color="${D.bulb.core}"/>
                <stop offset="0.55" stop-color="${D.bulb.body}"/><stop offset="1" stop-color="${D.bulb.glow}"/></radialGradient>
        </defs><g class="prr-halos">${halo}</g><g class="prr-bulbs">${glass}</g>`;
    }
};

if (typeof window !== 'undefined') window.PRIDE_ROOM = PRIDE_ROOM;
