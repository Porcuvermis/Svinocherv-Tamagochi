// ================= РЕКЛАМНЫЙ ЛИСТ ЖУРНАЛА: РИСУНОК =================
// Страница-прилавок внутри журнала на унитазе (lust-mag.js). Замысел игрока
// (утверждённый концепт): лист 330×442, портрет 3:4 как обложка VELOUR;
// сверху во всю ширину реклама хвоста, внизу два высоких окна — мочалка и
// мыло. Бархат обложки: винный, золото, плотные тона, ажур.
//
// Три рамки РАЗНЫЕ, но одного семейства: одно золото, тонкая внутренняя
// линия, медальон. Хвост — ар-деко (ступенчатые углы, веера, рябь),
// петроль; мыло — вогнутые углы-картуш, баклажан; мочалка — жемчужная
// кайма, розовое вино. По углам НИЧЕГО точечного: кружки и ромбики на углу
// читались винтами и заклёпками (замечание игрока к наброску).
//
// ---------- ПОЧЕМУ СТРОКА SVG, А НЕ DOM ----------
// Лист статичен: рисуется один раз на открытие журнала и после покупки.
// Журнал — 3d-слой, растрируется своим разрешением, и всё, что здесь стоит
// (фильтр ворса, маски, сотни чешуек ряби), платится ОДИН раз на растр, а не
// каждый кадр полёта (правило кадров, CLAUDE.md разд. 3).
//
// ---------- ЧТО ЗДЕСЬ НЕ РЕШАЕТСЯ ----------
// Цены, ступени и покупка — LustShop / ECONOMY (инварианты 2 и 3). Сюда
// приходят готовые числа, рисунок их только показывает.

const MAG_AD = {
    W: 330, H: 442,
    // Окна листа в его точках: [x, y, w, h]. Раскладка утверждена игроком.
    BOX: {
        tail:  [12, 12, 306, 180],
        cloth: [12, 202, 148, 228],
        soap:  [170, 202, 148, 228]
    },
    // Префикс id: лист может стоять на экране дважды (журнал и стенд), а id
    // градиентов в документе общие.
    ID: 'mad',

    C() { return PALETTE.bathScene.magazine.ad; },
    n(v) { return Math.round(v * 100) / 100; },

    // ---------- ЛИСТ ЦЕЛИКОМ ----------
    // o.windows — что рисовать в окнах (по ключу: функция (w, h) → разметка).
    // Без o — пустые рамки: каркас для оценки раскладки.
    page(o) {
        o = o || {};
        const B = this.BOX, win = o.windows || {};
        const slot = (key, kind) => {
            const [x, y, w, h] = B[key];
            return `<g transform="translate(${x} ${y})">${this.frame(kind, w, h)}${win[key] ? win[key](w, h) : ''}</g>`;
        };
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}" class="mad-page">
            <defs>${this.defs()}</defs>
            ${this.velvet()}
            ${slot('tail', 'deco')}${slot('cloth', 'pearl')}${slot('soap', 'cart')}
        </svg>`;
    },

    // ---------- ОБЩИЕ ГРАДИЕНТЫ И ФАКТУРЫ ----------
    defs() {
        const C = this.C(), G = C.gold, V = C.velvet, I = this.ID;
        const stops = (list) => list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
        // Золото — не одна заливка, а «полосы» металла: свет и тень чередуются
        // по диагонали, как на гнутой ленте под одной лампой. На длинной
        // кромке рамки это и есть игра света; на ровной двухцветной заливке
        // золото читалось охрой.
        const gold = stops([[0, G.lo], [0.14, G.hi], [0.27, G[500]], [0.46, G.lo], [0.6, G.hi], [0.7, G.glint], [0.78, G[500]], [1, G.lo]]);
        return `
        <linearGradient id="${I}-gold" x1="0" y1="0" x2="1" y2="1">${gold}</linearGradient>
        <linearGradient id="${I}-goldV" x1="0" y1="0" x2="0" y2="1">${stops([[0, G.hi], [0.45, G[500]], [1, G.lo]])}</linearGradient>
        <radialGradient id="${I}-goldR" cx="0.36" cy="0.3" r="0.8">${stops([[0, G.glint], [0.25, G.hi], [0.6, G[500]], [1, G.lo]])}</radialGradient>
        <radialGradient id="${I}-velvet" gradientUnits="userSpaceOnUse" cx="140" cy="150" r="380">${stops([[0, V.hi], [0.38, V[500]], [0.75, V.lo], [1, V.deep]])}</radialGradient>
        <linearGradient id="${I}-sheen" x1="0" y1="0" x2="1" y2="1">${stops([[0.15, V.hi, 0], [0.32, V.hi, 0.35], [0.42, V.hi, 0], [0.62, V.hi, 0], [0.7, V.hi, 0.18], [0.8, V.hi, 0]])}</linearGradient>
        <radialGradient id="${I}-vign" cx="0.5" cy="0.45" r="0.75">${stops([[0.55, V.deep, 0], [1, V.deep, 0.75]])}</radialGradient>
        <radialGradient id="${I}-pearl" cx="0.36" cy="0.32" r="0.75">${stops([[0, C.pearl.hi], [0.45, C.pearl[500]], [1, C.pearl.lo]])}</radialGradient>
        ${this.pileFilter()}
        ${this.dropFilter()}
        ${this.damaskPattern(`${I}-damask`, V.hi, 0.26, 0.14)}
        ${this.damaskPattern(`${I}-damask-plum`, C.plum.hi, 0.3, 0.1)}
        ${this.damaskPattern(`${I}-damask-rose`, C.rose.hi, 0.3, 0.1)}`;
    },

    // Ворс бархата: мелкий шум светом ворса. Без него градиент — пластик, с
    // ним — ткань. Цвет шума берётся из палитры, а не белый: белый шум на
    // винном читался пылью.
    pileFilter() {
        const rgb = (hex, k) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(c => this.n(c / 255 * (k || 1))); };
        const [r, g, b] = rgb(this.C().velvet.hi);
        return `<filter id="${this.ID}-pile" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="7" stitchTiles="stitch"/>
            <feColorMatrix values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0.5 0 0 0 -0.12"/>
        </filter>`;
    },

    // Тень предмета, лежащего на окне (бирка, печать с лентами): мягкая,
    // вниз-вправо от лампы. Фильтр, а не сдвинутая копия: у копии край
    // резкий, и бумага читалась вырезанной из той же плашки.
    dropFilter() {
        return `<filter id="${this.ID}-drop" x="-20%" y="-20%" width="150%" height="150%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.1"/>
            <feOffset dx="1.1" dy="1.8" result="b"/>
            <feFlood flood-color="${this.C().velvet.deep}" flood-opacity="0.75"/>
            <feComposite in2="b" operator="in"/>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>`;
    },

    // ---------- ДАМАСК ----------
    // Тон в тон, как ткань с жаккардом: заливка светом ворса той же ткани и
    // волосок золота по контуру. Мотив симметричный — правая половина
    // зеркалится; два мотива в раппорте вразбежку.
    damaskPattern(id, tone, fillA, lineA) {
        const C = this.C(), S = STROKE;
        const half = [
            // пламя-навершие
            'M0,-25 C3.5,-21 6.5,-16 5.5,-11 C4.8,-7.5 2,-5.5 0,-4',
            // завиток-лист: из стебля вбок, вверх и внутрь спиралью
            'M0,-3 C5,-6 11,-7 14,-2.5 C16.5,1.5 14.5,6.5 10.5,7 C7.5,7.4 6,5 7,3 C7.8,1.6 9.6,1.8 10,3',
            // нижняя капля и бутон
            'M0,1 C3.6,5 5,10 3.2,15 C2.4,17.5 1,19 0,20',
            'M0,21 C2.2,22.5 2.6,25 0,27'
        ];
        const shape = half.join(' ');
        const motif = (x, y) => `<g transform="translate(${x} ${y})">
            <path d="${shape}" /><path d="${shape}" transform="scale(-1 1)"/>
            <path d="M-2.4,-14 a2.4,2.4 0 1,0 4.8,0 a2.4,2.4 0 1,0 -4.8,0Z"/>
        </g>`;
        const set = (x, y) => motif(x, y);
        return `<pattern id="${id}" width="44" height="60" patternUnits="userSpaceOnUse">
            <g fill="${tone}" fill-opacity="${fillA}" stroke="${C.gold.hi}" stroke-opacity="${lineA}" stroke-width="${S.hairline}">
                ${set(22, 30)}${set(0, 0)}${set(44, 0)}${set(0, 60)}${set(44, 60)}
            </g>
        </pattern>`;
    },

    // ---------- ФОН ЛИСТА ----------
    velvet() {
        const I = this.ID, W = this.W, H = this.H;
        return `<rect width="${W}" height="${H}" fill="url(#${I}-velvet)"/>
            <rect width="${W}" height="${H}" fill="url(#${I}-damask)"/>
            <rect width="${W}" height="${H}" fill="url(#${I}-sheen)"/>
            <rect width="${W}" height="${H}" filter="url(#${I}-pile)"/>
            <rect width="${W}" height="${H}" fill="url(#${I}-vign)"/>`;
    },

    // ---------- КОНТУРЫ РАМОК ----------
    // path(kind, w, h, d) — контур рамки, сдвинутый ВНУТРЬ на d. Каждая
    // следующая линия рамки — тот же контур с бОльшим d, поэтому линии
    // параллельны везде, в том числе на углах: у наброска внутренняя линия
    // повторяла внешнюю масштабом, и на ступенях и вогнутостях линии
    // сходились и расходились.
    path(kind, w, h, d, rc) {
        const n = (v) => this.n(v);
        if (kind === 'deco') {
            // Двойная ступень на каждом углу: c — глубина выреза, ступени по c/2.
            const c = 18, s = c / 2, L = d, T = d, R = w - d, B = h - d;
            const p = [
                [L, T + c], [L + s, T + c], [L + s, T + s], [L + c, T + s], [L + c, T],
                [R - c, T], [R - c, T + s], [R - s, T + s], [R - s, T + c], [R, T + c],
                [R, B - c], [R - s, B - c], [R - s, B - s], [R - c, B - s], [R - c, B],
                [L + c, B], [L + c, B - s], [L + s, B - s], [L + s, B - c], [L, B - c]
            ];
            // Сдвиг на d уже параллельный: каждая точка ступени уходит на
            // (d, d) к середине, и вертикальные и горизонтальные отрезки выреза
            // сдвигаются вдоль своих нормалей.
            return 'M' + p.map(([x, y]) => `${n(x)},${n(y)}`).join(' L') + 'Z';
        }
        if (kind === 'cart') {
            // Вогнутый угол — четверть окружности с центром В углу листа.
            // Сдвинутая внутрь линия — окружность того же центра радиусом
            // r + d, пересечённая с краями, сдвинутыми на d.
            const r = rc || 15, rr = r + d, e = Math.sqrt(rr * rr - d * d);
            const a = `A${n(rr)},${n(rr)} 0 0 0`;
            return `M${n(e)},${n(d)} H${n(w - e)} ${a} ${n(w - d)},${n(e)} V${n(h - e)} ${a} ${n(w - e)},${n(h - d)} H${n(e)} ${a} ${n(d)},${n(h - e)} V${n(e)} ${a} ${n(e)},${n(d)}Z`;
        }
        // pearl — скруглённый прямоугольник, радиус уменьшается вместе со сдвигом.
        const r = Math.max(2, 24 - d), L = d, T = d, R = w - d, B = h - d;
        const a = `A${n(r)},${n(r)} 0 0 1`;
        return `M${n(L + r)},${n(T)} H${n(R - r)} ${a} ${n(R)},${n(T + r)} V${n(B - r)} ${a} ${n(R - r)},${n(B)} H${n(L + r)} ${a} ${n(L)},${n(B - r)} V${n(T + r)} ${a} ${n(L + r)},${n(T)}Z`;
    },

    // Золотая линия с фаской: тело металла градиентом и поверх тонкий свет,
    // сдвинутый к лампе (вверх-влево). Одна линия, а читается гранью.
    goldLine(d, width, opt) {
        const C = this.C(), I = this.ID, o = opt || {};
        const w = width;
        return `<path d="${d}" fill="none" stroke="${C.gold.deep}" stroke-width="${this.n(w + 0.9)}" stroke-opacity="0.55" stroke-linejoin="${o.join || 'miter'}" transform="translate(0.45 0.6)"/>
            <path d="${d}" fill="none" stroke="url(#${I}-gold)" stroke-width="${w}" stroke-linejoin="${o.join || 'miter'}"/>
            <path d="${d}" fill="none" stroke="${C.gold.glint}" stroke-opacity="0.45" stroke-width="${this.n(w * 0.3)}" stroke-linejoin="${o.join || 'miter'}" transform="translate(-0.25 -0.3)"/>`;
    },

    // ---------- РАМКА ОКНА ----------
    frame(kind, w, h) {
        const C = this.C(), I = this.ID, S = STROKE;
        const col = { deco: C.petrol, cart: C.plum, pearl: C.rose }[kind];
        const gid = `${I}-plate-${kind}`;
        // Плашка окна: свой бархат своего цвета, свет сверху-слева — та же
        // лампа, что у листа.
        const plate = `<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${this.n(w * 0.38)}" cy="${this.n(h * 0.3)}" r="${this.n(Math.max(w, h) * 0.95)}">
                <stop offset="0" stop-color="${col.hi}"/><stop offset="0.45" stop-color="${col[500]}"/><stop offset="0.85" stop-color="${col.lo}"/><stop offset="1" stop-color="${col.deep}"/></radialGradient>
            <clipPath id="${gid}-clip"><path d="${this.path(kind, w, h, 1)}"/></clipPath>`;
        const outer = this.path(kind, w, h, 1);
        let fill;
        if (kind === 'deco') fill = this.ripple(w, h, gid);
        else fill = `<rect width="${w}" height="${h}" fill="url(#${I}-damask-${kind === 'cart' ? 'plum' : 'rose'})"/>`;
        // Тень окна на бархат листа: окно лежит НА ткани, а не вырезано в ней.
        const shadow = `<path d="${outer}" fill="${C.velvet.deep}" opacity="0.55" transform="translate(1.6 2.4)"/>`;
        const body = `<g clip-path="url(#${gid}-clip)">
                <rect width="${w}" height="${h}" fill="url(#${gid})"/>
                ${fill}
                <rect width="${w}" height="${h}" filter="url(#${I}-pile)" opacity="0.8"/>
                ${this.innerShade(kind, w, h, col)}
            </g>`;
        return `<defs>${plate}</defs>${shadow}${body}${this['trim_' + kind](w, h)}`;
    },

    // Затенение у кромки изнутри: плашка утоплена под золотой бортик.
    innerShade(kind, w, h, col) {
        return `<path d="${this.path(kind, w, h, 3.5)}" fill="none" stroke="${col.deep}" stroke-opacity="0.55" stroke-width="5"/>`;
    },

    // ---------- ХВОСТ: АР-ДЕКО ----------
    // Рябь — японская чешуя-волна (сэйгайха): ряды полукругов, каждый
    // следующий ряд перекрывает нижние половины предыдущего. Перекрытие
    // делает ЗАЛИВКА чешуи тем же градиентом, что и плашка (одни координаты
    // окна), поэтому шва не видно. У наброска круги просто накладывались и
    // давали муар.
    ripple(w, h, gid) {
        const C = this.C(), S = STROKE, R = 8, n = (v) => this.n(v);
        const circ = (cx, cy, r) => `M${n(cx - r)},${n(cy)} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0Z`;
        let out = '';
        for (let row = 0, y = -R; y <= h + R; row++, y += R / 2) {
            const off = (row % 2) ? R : 0;
            let fillD = '', ringD = '';
            for (let x = -R + off; x <= w + R; x += 2 * R) {
                fillD += circ(x, y, R);
                ringD += circ(x, y, R * 0.68) + circ(x, y, R * 0.36);
            }
            out += `<path d="${fillD}" fill="url(#${gid})" stroke="${C.gold.hi}" stroke-opacity="0.2" stroke-width="${S.hairline}"/>
                <path d="${ringD}" fill="none" stroke="${C.gold.hi}" stroke-opacity="0.11" stroke-width="${S.hairline}"/>`;
        }
        return out;
    },

    trim_deco(w, h) {
        const C = this.C(), S = STROKE, I = this.ID, mid = w / 2, n = (v) => this.n(v);
        let s = this.goldLine(this.path('deco', w, h, 1.2), S.structure);
        s += `<path d="${this.path('deco', w, h, 5)}" fill="none" stroke="${C.gold[500]}" stroke-opacity="0.85" stroke-width="${S.hairline}"/>`;
        s += this.goldLine(this.path('deco', w, h, 8), S.detail);
        // Три «скоростные» линии от веера к углам — подпись ар-деко. Они
        // идут ВДОЛЬ кромки и обрываются ступенью, а не точкой.
        const lines = (y, dir) => [0, 1, 2].map(k => {
            const yy = y + dir * k * 2.2, len = 62 - k * 14;
            return `<path d="M${n(mid - 24)},${n(yy)} H${n(mid - 24 - len)} M${n(mid + 24)},${n(yy)} H${n(mid + 24 + len)}" stroke="${C.gold[500]}" stroke-opacity="${0.75 - k * 0.18}" stroke-width="${S.hairline}"/>`;
        }).join('');
        s += lines(12.5, 1) + lines(h - 12.5, -1);
        s += this.fan(mid, 1.2, 1) + this.fan(mid, h - 1.2, -1);
        return s;
    },

    // Веер-солнце на кромке: полукруг, лучи и две дуги. Лежит ПОВЕРХ линий
    // рамки и сам их перекрывает своей плашкой, а не обрывает их кодом.
    fan(cx, cy, dir) {
        const C = this.C(), S = STROKE, I = this.ID, R = 21, n = (v) => this.n(v);
        const arc = (r) => `M${n(cx - r)},${n(cy)} A${r},${r} 0 0,${dir > 0 ? 0 : 1} ${n(cx + r)},${n(cy)}`;
        let rays = '';
        const N = 11;
        for (let i = 1; i < N; i++) {
            const a = Math.PI * i / N, x1 = cx - Math.cos(a) * R * 0.34, y1 = cy + dir * Math.sin(a) * R * 0.34;
            const x2 = cx - Math.cos(a) * (R - 2.4), y2 = cy + dir * Math.sin(a) * (R - 2.4);
            rays += `M${n(x1)},${n(y1)} L${n(x2)},${n(y2)} `;
        }
        return `<path d="${arc(R)}Z" fill="${C.petrol.lo}"/>
            <path d="${rays}" stroke="url(#${I}-goldV)" stroke-width="${S.detail}" stroke-linecap="round"/>
            <path d="${arc(R * 0.62)}" fill="none" stroke="${C.gold.hi}" stroke-opacity="0.55" stroke-width="${S.hairline}"/>
            ${this.goldLine(arc(R), S.detail, { join: 'round' })}
            <path d="${arc(R * 0.3)}Z" fill="url(#${I}-goldR)"/>
            <path d="M${n(cx - R - 3)},${n(cy)} H${n(cx + R + 3)}" stroke="url(#${I}-gold)" stroke-width="${S.structure}"/>`;
    },

    // ---------- МЫЛО: КАРТУШ ----------
    trim_cart(w, h) {
        const C = this.C(), S = STROKE;
        let s = this.goldLine(this.path('cart', w, h, 1.2), S.structure);
        s += `<path d="${this.path('cart', w, h, 4.6)}" fill="none" stroke="${C.gold[500]}" stroke-opacity="0.85" stroke-width="${S.hairline}"/>`;
        s += this.goldLine(this.path('cart', w, h, 7.5), S.detail);
        // В каждой вогнутости — лист аканта, растущий из угла внутрь.
        // Именно лист, вытянутый по диагонали, а не точка: точка в углу —
        // заклёпка.
        [[0, 0, 0], [w, 0, 90], [w, h, 180], [0, h, 270]].forEach(([x, y, a]) => { s += this.acanthus(x, y, a); });
        s += this.crest(w / 2, 1.2, 1) + this.crest(w / 2, h - 1.2, -1);
        return s;
    },

    acanthus(x, y, ang) {
        const C = this.C(), S = STROKE, I = this.ID;
        // Лист нарисован для левого верхнего угла и поворачивается.
        const leaf = 'M13.5,13.5 C15,9 19.5,7.5 22,9.5 C19.5,10 18,11.5 18.2,13.6 C20.5,12.6 23,13.6 23.4,16 C21,15.4 19,16.6 18.6,18.6 C16,18.4 14,16.6 13.5,13.5Z';
        const mirror = 'M13.5,13.5 C9,15 7.5,19.5 9.5,22 C10,19.5 11.5,18 13.6,18.2 C12.6,20.5 13.6,23 16,23.4 C15.4,21 16.6,19 18.6,18.6';
        return `<g transform="translate(${x} ${y}) rotate(${ang})">
            <path d="${leaf}" fill="url(#${I}-goldR)" stroke="${C.gold.deep}" stroke-opacity="0.6" stroke-width="${S.hairline}"/>
            <path d="${mirror}" fill="url(#${I}-goldR)" stroke="${C.gold.deep}" stroke-opacity="0.6" stroke-width="${S.hairline}"/>
            <path d="M13.5,13.5 L19,19" stroke="${C.gold.deep}" stroke-opacity="0.5" stroke-width="${S.hairline}"/>
        </g>`;
    },

    // Гребень картуша по середине кромки: пара С-завитков навстречу,
    // между ними ланцет. Тот же язык, что листья в углах.
    crest(cx, cy, dir) {
        const C = this.C(), S = STROKE, I = this.ID;
        const sc = `<path d="M0,0 C-4,0 -9,1.5 -11,5 C-12.5,7.6 -10.5,10 -8.2,9 C-6.4,8.2 -7,5.6 -8.8,6.1" fill="none" stroke="url(#${I}-goldV)" stroke-width="${S.detail}" stroke-linecap="round"/>`;
        return `<g transform="translate(${cx} ${cy}) scale(1 ${dir})">
            ${sc}<g transform="scale(-1 1)">${sc}</g>
            <path d="M0,1 C2.2,4 2.2,7.5 0,10.5 C-2.2,7.5 -2.2,4 0,1Z" fill="url(#${I}-goldR)" stroke="${C.gold.deep}" stroke-opacity="0.6" stroke-width="${S.hairline}"/>
        </g>`;
    },

    // ---------- МОЧАЛКА: ЖЕМЧУЖНАЯ КАЙМА ----------
    // Жемчуг идёт сплошной нитью — бусина к бусине, — поэтому читается
    // каймой, а не рядом заклёпок. Бусины расставлены по длине контура с
    // одинаковым шагом, на скруглениях тоже (иначе там «редеют»).
    trim_pearl(w, h) {
        const C = this.C(), S = STROKE, I = this.ID;
        let s = this.goldLine(this.path('pearl', w, h, 1.2), S.structure);
        const d0 = 7.2, P = C.pearl;
        // гнездо нити — тёмная канавка под жемчугом
        s += `<path d="${this.path('pearl', w, h, d0)}" fill="none" stroke="${C.rose.deep}" stroke-opacity="0.7" stroke-width="5.6"/>`;
        const pts = this.alongRounded(w, h, d0, Math.max(2, 24 - d0), 5.6);
        s += pts.map(([x, y]) => `<circle cx="${this.n(x)}" cy="${this.n(y)}" r="2.45" fill="url(#${I}-pearl)"/>`).join('');
        // Блик у каждой бусины — с одной стороны (одна лампа на лист).
        s += `<path d="${pts.map(([x, y]) => `M${this.n(x - 0.85)},${this.n(y - 0.9)} h0.01`).join(' ')}" stroke="${P.hi}" stroke-width="1.1" stroke-linecap="round"/>`;
        s += this.goldLine(this.path('pearl', w, h, 12.6), S.detail, { join: 'round' });
        return s;
    },

    // Точки с равным шагом по скруглённому прямоугольнику (сдвиг d, радиус r).
    alongRounded(w, h, d, r, step) {
        const L = d, T = d, R = w - d, B = h - d;
        const segs = [
            { len: R - L - 2 * r, at: (t) => [L + r + t, T] },
            { len: Math.PI * r / 2, at: (t) => { const a = -Math.PI / 2 + t / r; return [R - r + r * Math.cos(a), T + r + r * Math.sin(a)]; } },
            { len: B - T - 2 * r, at: (t) => [R, T + r + t] },
            { len: Math.PI * r / 2, at: (t) => { const a = t / r; return [R - r + r * Math.cos(a), B - r + r * Math.sin(a)]; } },
            { len: R - L - 2 * r, at: (t) => [R - r - t, B] },
            { len: Math.PI * r / 2, at: (t) => { const a = Math.PI / 2 + t / r; return [L + r + r * Math.cos(a), B - r + r * Math.sin(a)]; } },
            { len: B - T - 2 * r, at: (t) => [L, B - r - t] },
            { len: Math.PI * r / 2, at: (t) => { const a = Math.PI + t / r; return [L + r + r * Math.cos(a), T + r + r * Math.sin(a)]; } }
        ];
        const total = segs.reduce((a, s) => a + s.len, 0);
        const N = Math.round(total / step), k = total / N, out = [];
        for (let i = 0; i < N; i++) {
            let t = i * k, j = 0;
            while (t > segs[j].len) { t -= segs[j].len; j++; }
            out.push(segs[j].at(t));
        }
        return out;
    },

    // ---------- МЕДАЛЬОН ----------
    // Общая часть семейства: тёмная чаша своего цвета, золотой обод с
    // фаской, волосок внутри. Своё у каждого окна — форма и внешний венец
    // (решение игрока): хвост — овал стоймя с лучами, мыло — овал лёжа с
    // фестонами, мочалка — скруглённый прямоугольник в жемчуге.
    // В чаше — СЛЕДУЮЩАЯ ступень товара: реклама того, что купишь.
    //   a, b — полуоси чаши по x и y.
    MEDAL_R: 16,   // радиус скругления чаши мочалки

    // Контур чаши, раздутый наружу на d (d < 0 — внутрь). Для овала это
    // овал с полуосями a + d, b + d: настоящий эквидистант овала — не овал,
    // но на сдвиге в пару точек глаз разницы не видит.
    medalPath(kind, cx, cy, a, b, d) {
        const n = (v) => this.n(v), A = a + d, B = b + d;
        if (kind !== 'pearl') return `M${n(cx - A)},${n(cy)} a${n(A)},${n(B)} 0 1,0 ${n(2 * A)},0 a${n(A)},${n(B)} 0 1,0 ${n(-2 * A)},0Z`;
        const r = Math.max(2, this.MEDAL_R + d), L = cx - A, T = cy - B, R = cx + A, Bo = cy + B, q = `A${n(r)},${n(r)} 0 0 1`;
        return `M${n(L + r)},${n(T)} H${n(R - r)} ${q} ${n(R)},${n(T + r)} V${n(Bo - r)} ${q} ${n(R - r)},${n(Bo)} H${n(L + r)} ${q} ${n(L)},${n(Bo - r)} V${n(T + r)} ${q} ${n(L + r)},${n(T)}Z`;
    },

    // Точки с равным шагом по контуру (сдвиг d) и наружные нормали к ним:
    // по ним стоят лучи, фестоны и бусины. Шаг — по длине дуги, а не по
    // углу: на овале по углу лучи густели на узких концах.
    medalPoints(kind, cx, cy, a, b, d, step) {
        const A = a + d, B = b + d, r = Math.max(2, this.MEDAL_R + d), M = 720, dense = [];
        for (let i = 0; i < M; i++) {
            const t = i / M * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
            if (kind !== 'pearl') { dense.push([cx + A * c, cy + B * s]); continue; }
            // Скруглённый прямоугольник по углу: луч из центра до контура.
            const ax = A - r, by = B - r;
            let x, y;
            const k = Math.min(Math.abs(c) > 1e-9 ? A / Math.abs(c) : 1e9, Math.abs(s) > 1e-9 ? B / Math.abs(s) : 1e9);
            x = c * k; y = s * k;
            if (Math.abs(x) > ax && Math.abs(y) > by) {
                // угол: пересечение луча с четвертью окружности
                const ox = Math.sign(x) * ax, oy = Math.sign(y) * by;
                const pb = -(c * ox + s * oy), pc = ox * ox + oy * oy - r * r, kk = -pb + Math.sqrt(pb * pb - pc);
                x = c * kk; y = s * kk;
            }
            dense.push([cx + x, cy + y]);
        }
        const len = [0];
        for (let i = 1; i <= M; i++) { const p = dense[i % M], q = dense[i - 1]; len.push(len[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1])); }
        const total = len[M], N = Math.max(8, Math.round(total / step)), out = [];
        for (let k = 0, j = 0; k < N; k++) {
            const L = k * total / N;
            while (len[j + 1] < L) j++;
            const p = dense[j], q = dense[(j + 1) % M], f = (L - len[j]) / (len[j + 1] - len[j] || 1);
            const tx = q[0] - p[0], ty = q[1] - p[1], tl = Math.hypot(tx, ty) || 1;
            out.push([p[0] + tx * f, p[1] + ty * f, ty / tl, -tx / tl]);
        }
        return out;
    },

    // Ушко для шнура бирки: точка на ободе (параметр овала t, градусы) и
    // наружная нормаль. Одна функция на медальон и на бирку — шнур
    // приходит ровно в отверстие ушка.
    // У скруглённого прямоугольника (мочалка) точка — пересечение луча из
    // центра под тем же углом с контуром, нормаль — по соседним точкам.
    lug(cx, cy, a, b, deg, kind) {
        const t = deg * Math.PI / 180, A = a + 4.6, B = b + 4.6, c = Math.cos(t), sn = Math.sin(t);
        let base, nx, ny;
        if (kind === 'pearl') {
            const at = (tt) => { const p = this.medalPoints('pearl', cx, cy, a, b, 4.6, 1).reduce((best, q) => {
                const da = Math.abs(Math.atan2(Math.sin(Math.atan2(q[1] - cy, q[0] - cx) - tt), Math.cos(Math.atan2(q[1] - cy, q[0] - cx) - tt)));
                return da < best[0] ? [da, q] : best; }, [9, null]); return p[1]; };
            const q = at(t); base = [q[0], q[1]]; nx = q[2]; ny = q[3];
        } else {
            base = [cx + A * c, cy + B * sn]; nx = c / A; ny = sn / B;
            const l = Math.hypot(nx, ny); nx /= l; ny /= l;
        }
        const R = 5.6, off = 7.2;
        return { base, nx, ny, R, hole: [base[0] + nx * off, base[1] + ny * off] };
    },

    // o.lug — градусы на овале, где у обода ушко. Ушко ОТЛИТО заодно с
    // ободом: тот же градиент металла, основание уходит под ленту обода, и
    // венец (фестоны) под ним прерывается. Отдельное колечко поверх рамки
    // читалось прилипшей чужой деталью (замечание игрока).
    medal(cx, cy, a, b, kind, inner, o) {
        const C = this.C(), S = STROKE, I = this.ID, n = (v) => this.n(v);
        const col = { deco: C.petrol, cart: C.plum, pearl: C.rose }[kind];
        const gid = `${I}-medal-${kind}`, P = (d) => this.medalPath(kind, cx, cy, a, b, d);
        let crown = '';
        if (kind === 'deco') {
            // Ореол ар-деко: тонкие лучи, длинный через короткий, внутри
            // волоска-ограды. Треугольные клинья наброска читались пилой.
            let lng = '', sht = '';
            this.medalPoints(kind, cx, cy, a, b, 6, 2.9).forEach(([x, y, nx, ny], i) => {
                const L = i % 2 ? 3.5 : 7, seg = `M${n(x)},${n(y)} L${n(x + nx * L)},${n(y + ny * L)} `;
                if (i % 2) sht += seg; else lng += seg;
            });
            crown = `<path d="${lng}" stroke="url(#${I}-gold)" stroke-width="${S.detail}"/>
                <path d="${sht}" stroke="${C.gold[500]}" stroke-opacity="0.8" stroke-width="${S.hairline}"/>
                <path d="${P(14.6)}" fill="none" stroke="${C.gold[500]}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>`;
        } else if (kind === 'cart') {
            // Фестоны: полукруглые лепестки встык.
            const pts = this.medalPoints(kind, cx, cy, a, b, 4.4, 10);
            let d = '';
            pts.forEach(([x, y], i) => {
                const [x2, y2] = pts[(i + 1) % pts.length], mx = (x + x2) / 2, my = (y + y2) / 2;
                const nx = (pts[i][2] + pts[(i + 1) % pts.length][2]) / 2, ny = (pts[i][3] + pts[(i + 1) % pts.length][3]) / 2;
                d += `M${n(x)},${n(y)} Q${n(mx + nx * 6.4)},${n(my + ny * 6.4)} ${n(x2)},${n(y2)}`;
            });
            crown = `<path d="${d}" fill="${col.lo}" stroke="url(#${I}-goldV)" stroke-width="${S.detail}"/>`;
        } else {
            let c = `<path d="${P(6.6)}" fill="none" stroke="${col.deep}" stroke-opacity="0.7" stroke-width="5.4"/>`;
            const pts = this.medalPoints(kind, cx, cy, a, b, 6.6, 5.4);
            c += pts.map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="2.35" fill="url(#${I}-pearl)"/>`).join('');
            c += `<path d="${pts.map(([x, y]) => `M${n(x - 0.8)},${n(y - 0.85)} h0.01`).join(' ')}" stroke="${C.pearl.hi}" stroke-width="1.05" stroke-linecap="round"/>`;
            crown = c;
        }
        const R = Math.max(a, b);
        let lug = '';
        if (o && o.lug != null) {
            const L = this.lug(cx, cy, a, b, o.lug, kind), [hx, hy] = L.hole, px = -L.ny, py = L.nx, bw = 2.6;
            const b1 = [L.base[0] - L.nx * 2 + px * bw * 1.4, L.base[1] - L.ny * 2 + py * bw * 1.4];
            const b2 = [L.base[0] - L.nx * 2 - px * bw * 1.4, L.base[1] - L.ny * 2 - py * bw * 1.4];
            // Шейка от обода сужается к кольцу плавными дугами, как у литой
            // подвески; кольцо — целый круг поверх шейки, поэтому переход
            // без ступеньки, а контур кольца замкнут при любом угле ушка.
            const s1 = [hx + px * L.R * 0.55, hy + py * L.R * 0.55], s2 = [hx - px * L.R * 0.55, hy - py * L.R * 0.55];
            const neck = `M${n(b1[0])},${n(b1[1])} Q${n(L.base[0] + L.nx * 2 + px * bw * 0.45)},${n(L.base[1] + L.ny * 2 + py * bw * 0.45)} ${n(s1[0])},${n(s1[1])}`
                + ` L${n(s2[0])},${n(s2[1])} Q${n(L.base[0] + L.nx * 2 - px * bw * 0.45)},${n(L.base[1] + L.ny * 2 - py * bw * 0.45)} ${n(b2[0])},${n(b2[1])}Z`;
            const body = neck + ` M${n(hx + L.R)},${n(hy)} a${L.R},${L.R} 0 1,0 ${-2 * L.R},0 a${L.R},${L.R} 0 1,0 ${2 * L.R},0Z`;
            lug = `<path d="${body}" fill="${C.velvet.deep}" opacity="0.5" transform="translate(0.9 1.4)"/>
                <path d="${neck}" fill="url(#${I}-goldR)" stroke="${C.gold.deep}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>
                <circle cx="${n(hx)}" cy="${n(hy)}" r="${L.R}" fill="url(#${I}-goldR)" stroke="${C.gold.deep}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>
                <circle cx="${n(hx)}" cy="${n(hy)}" r="2.9" fill="${C.velvet.deep}" stroke="${C.gold.deep}" stroke-width="${S.hairline}"/>
                <path d="M${n(hx - 2)},${n(hy + 2.2)} A3,3 0 0 0 ${n(hx + 2.8)},${n(hy + 0.8)}" fill="none" stroke="${C.gold.hi}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>
                <path d="M${n(hx - L.R * 0.75)},${n(hy - L.R * 0.35)} A${n(L.R * 0.8)},${n(L.R * 0.8)} 0 0 1 ${n(hx + L.R * 0.1)},${n(hy - L.R * 0.8)}" fill="none" stroke="${C.gold.glint}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>`;
        }
        return `<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${n(cx - a * 0.3)}" cy="${n(cy - b * 0.35)}" r="${n(R * 1.35)}">
                <stop offset="0" stop-color="${col.hi}"/><stop offset="0.55" stop-color="${col[500]}"/><stop offset="1" stop-color="${col.deep}"/></radialGradient>
                <clipPath id="${gid}-clip"><path d="${P(0)}"/></clipPath></defs>
            <path d="${P(5)}" fill="${C.velvet.deep}" opacity="0.5" transform="translate(1.4 2.2)"/>
            ${crown}
            ${lug}
            <path d="${P(4.6)}${P(0)}" fill="url(#${I}-gold)" fill-rule="evenodd"/>
            <path d="${P(4.6)}" fill="none" stroke="${C.gold.deep}" stroke-opacity="0.6" stroke-width="${S.hairline}"/>
            <path d="${P(2.3)}" fill="none" stroke="${C.gold.glint}" stroke-opacity="0.4" stroke-width="${S.hairline}"/>
            <path d="${P(0)}" fill="url(#${gid})" stroke="${C.gold.deep}" stroke-width="${S.hairline}"/>
            <path d="${P(-3.4)}" fill="none" stroke="${C.gold.hi}" stroke-opacity="0.45" stroke-width="${S.hairline}"/>
            ${inner ? `<g clip-path="url(#${gid}-clip)">${inner}</g>` : ''}`;
    }
    ,
    // ---------- ОКНО-ПОЛКА ЦЕЛИКОМ ----------
    // Раскладка каждого окна в его точках. Утверждена игроком на мыле
    // (раунд 2): медальон со следующей ступенью, бирка на шнурке от ушка
    // медальона, печать рядом с биркой, звёзды. У хвоста окно лежачее, и
    // связка «бирка — печать» стоит справа от медальона, а не под ним.
    //   medal: [cx, cy, a, b]; lug — угол ушка на ободе; tag: [правый край,
    //   середина]; seal: [x, y, r, углы лент, длина лент]; stars: [cx, верх].
    LAYOUT: {
        tail:  { kind: 'deco',  medal: [100, 88, 46, 62], lug: 2, tag: [234, 100], seal: [270, 88, 23, [20, -20], 0.9], stars: [228, 134] },
        cloth: { kind: 'pearl', medal: [74, 60, 50, 36],  lug: 68,  tag: [132, 134], seal: [38, 132, 24, [20, -20], 1.25], stars: [74, 188] },
        soap:  { kind: 'cart',  medal: [74, 60, 50, 35],  lug: 68,  tag: [132, 134], seal: [38, 132, 24, [20, -20], 1.25], stars: [74, 188] }
    },

    // d.item — { svg, box } предмета следующей ступени (box — его габарит в
    //          своих координатах: по нему вещь вписывается в чашу);
    // d.bought — сколько ступеней куплено (литых звёзд);
    // d.price — цена следующей ступени, null — ветка выкуплена: ни бирки,
    //          ни ушка, ни печати, полка остаётся (решение игрока);
    // d.canBuy — жетонов хватает: только тогда стоит печать.
    shelf(key, d) {
        const L = this.LAYOUT[key], [cx, cy, a, b] = L.medal, has = d.price != null;
        let inner = '';
        if (d.item && d.item.svg) {
            const bx = d.item.box, k = Math.min(2 * a * 0.78 / bx.w, 2 * b * 0.84 / bx.h);
            const ink = this.inkLines(d.item.svg, k, [PALETTE.ink, d.item.ink]);
            inner = `<g transform="translate(${cx} ${cy}) scale(${k.toFixed(3)}) translate(${-(bx.x + bx.w / 2)} ${-(bx.y + bx.h / 2)})">${ink.svg}</g>`;
            inner = `<defs>${this.outlineFilter(key)}</defs><g filter="url(#${this.ID}-outline-${key})">${inner}</g>`;
        }
        let s = this.medal(cx, cy, a, b, L.kind, inner, { lug: has ? L.lug : null });
        s += this.stars(key, L.stars[0], L.stars[1], d.bought);
        if (has) {
            if (d.canBuy) s += this.seal(L.seal[0], L.seal[1], L.seal[2], key, L.seal[3], L.seal[4]);
            s += this.priceTag(L.tag[0], L.tag[1], d.price, this.lug(cx, cy, a, b, L.lug, L.kind));
        }
        return s;
    },

    // ---------- ОДИН КОНТУР У ВСЕХ ТРЁХ ТОВАРОВ ----------
    // Предметы приходят из ванны каждый со своим контуром в СВОИХ
    // координатах, а в чашу ужимаются каждый в своё число раз: у флакона
    // контур выходил обычным, у хвоста — жирным, у морской губки его нет
    // вовсе. Три товара читались тремя разными стилями (замечание игрока).
    // Поэтому контур рисуется ОДИН на всех — фильтром по силуэту, снаружи
    // вещи, одной толщины на листе. Свои чернильные линии предмета
    // ужимаются так, чтобы самая толстая легла на листе INK_OWN — тонкой
    // линией под общим контуром, а внутренние сохранили своё соотношение с
    // ней. Одного выравнивания чернил мало: у бруска, губки, перчатки
    // контур своего тёмного тона, не чернильного, — по цвету его не
    // распознать, а силуэт есть у всех.
    INK_W: 1.5,
    INK_OWN: 0.7,
    inkLines(svg, k, inks) {
        const set = inks.filter(Boolean).map(c => String(c).toLowerCase());
        const isInk = (tag) => { const m = tag.match(/\sstroke="([^"]+)"/); return m && set.includes(m[1].toLowerCase()); };
        let W = 0;
        svg.replace(/<[a-z][^>]*>/gi, (t) => { if (isInk(t)) { const m = t.match(/stroke-width="([\d.]+)"/); if (m) W = Math.max(W, +m[1]); } return t; });
        if (!W) return { svg, found: false };
        const f = this.INK_OWN / (W * k);
        return { found: true, svg: svg.replace(/<[a-z][^>]*>/gi, (t) => isInk(t)
            ? t.replace(/stroke-width="([\d.]+)"/, (m0, v) => `stroke-width="${(+v * f).toFixed(3)}"`) : t) };
    },
    // Силуэт по непрозрачности, раздутый и залитый чернилами, — под вещью.
    // Перед порогом силуэт размывается: иначе пух по краю губки давал
    // рваный, зубчатый контур. Раздутие — INK_W минус половина своей линии
    // предмета (она тоже выходит наружу): контур один на глаз.
    outlineFilter(key) {
        return `<filter id="${this.ID}-outline-${key}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.1"/>
            <feComponentTransfer result="a"><feFuncA type="discrete" tableValues="0 0 0 1"/></feComponentTransfer>
            <feMorphology in="a" operator="dilate" radius="${this.n(this.INK_W - this.INK_OWN / 2)}" result="d"/>
            <feFlood flood-color="${PALETTE.ink}"/>
            <feComposite in2="d" operator="in"/>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>`;
    },

    // ---------- ХВОСТ В МЕДАЛЬОНЕ ----------
    // Хвост следующей ступени — ТОТ ЖЕ, что всплывёт в ванне: разметка
    // BATH_ART.tail и пути BATH_ART.tailPieces при данном виде ступени
    // (TAIL_LOOKS). Свой рисунок для журнала разошёлся бы с ванной с первой
    // же правки хвоста. Разметка ванны рассчитана на живой узел (пути
    // пустые, их пишет lust.js, drawTail) — здесь они заполняются один раз в
    // отсоединённом документе, а id переименовываются: живой хвост ванны с
    // теми же id может стоять в том же документе.
    //   model — модель червя (тон хвоста от кожи особи), null — палитра.
    // Возвращает { svg, box }; box — без нижней трети: основание уходит за
    // край чаши, как в ванне под воду, и хвост встаёт из-под рамки.
    tailItem(level, model) {
        if (typeof BATH_ART === 'undefined' || typeof DOMParser === 'undefined') return null;
        const A = BATH_ART, keep = A.tailLevel;
        A.setTailLevel(level);
        try {
            const bend = 0.42, c = A.tailD(bend, 1).curve, P = A.tailPieces(c, 1), f1 = (v) => v.toFixed(1);
            const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${A.tail(model, 1)}</svg>`, 'image/svg+xml');
            const root = doc.documentElement, el = (id) => root.querySelector(`[id="${id}"]`);
            const set = (id, a, v) => { const e = el(id); if (e && v != null) e.setAttribute(a, v); };
            set('bt-tail-body', 'd', c.d); set('bt-tail-edge', 'd', c.d);
            P.segs.forEach((d, i) => set(`bt-tail-seg-${i}`, 'd', d));
            set('bt-tail-glans', 'd', P.glans); set('bt-tail-clit', 'd', P.clit); set('bt-tail-wrinkle', 'd', P.wrinkles);
            [['bt-tail-vein-sh', 'veinSh'], ['bt-tail-vein', 'vein'], ['bt-tail-vein-hi', 'veinHi']].forEach(([id, k]) => set(id, 'd', P[k]));
            P.creases.forEach((q, i) => {
                set(`bt-tail-cr-${i}`, 'd', q.d); set(`bt-tail-cr-${i}`, 'stroke-opacity', (0.3 * q.k).toFixed(3));
                set(`bt-tail-crl-${i}`, 'd', q.d); set(`bt-tail-crl-${i}`, 'stroke-opacity', (0.55 * q.k).toFixed(3));
            });
            [['bt-tail-sheen', 'sheen'], ['bt-tail-shine', 'shine'], ['bt-tail-stretch', 'stretch'],
             ['bt-tail-gwet', 'gwet'], ['bt-tail-grim', 'grim'], ['bt-tail-gspark', 'spark']].forEach(([id, k]) => set(id, 'd', P.lights[k]));
            if (P.piercing) {
                const Pc = P.piercing;
                [['bt-tail-ring-back', 'back'], ['bt-tail-ring-back-m', 'back'], ['bt-tail-ring', 'front'],
                 ['bt-tail-ring-m', 'front'], ['bt-tail-ring-hi', 'front'], ['bt-tail-holes', 'holes']].forEach(([id, k]) => set(id, 'd', Pc[k]));
                set('bt-tail-bead', 'cx', f1(Pc.bead.x)); set('bt-tail-bead', 'cy', f1(Pc.bead.y)); set('bt-tail-bead', 'r', f1(Pc.bead.r));
            }
            if (P.legend) {
                const Lg = P.legend;
                [['bt-tail-sweep', 'sweep'], ['bt-tail-glow', 'glow'], ['bt-tail-stars', 'stars']].forEach(([id, k]) => set(id, 'd', Lg[k]));
                set('bt-tail-halo', 'rx', f1(Lg.halo.rx)); set('bt-tail-halo', 'ry', f1(Lg.halo.ry));
                set('bt-tail-halo', 'transform', `translate(${f1(Lg.halo.x)} ${f1(Lg.halo.y)}) rotate(${f1(Lg.halo.deg)})`);
            }
            const q = P.neck;
            set('bt-tail-neck', 'rx', f1(q.rx)); set('bt-tail-neck', 'ry', f1(q.ry));
            set('bt-tail-neck', 'transform', `translate(${f1(q.x)} ${f1(q.y)}) rotate(${f1(q.deg)})`);
            // Потёки (gooLive) в рекламе не нужны: хвост с витрины чистый.
            root.querySelectorAll('[id^="bt-tail-goo"]').forEach(e => (e.parentNode.tagName === 'g' && e.parentNode !== root ? e.parentNode : e).remove());
            const svg = new XMLSerializer().serializeToString(root).replace(/^<svg[^>]*>|<\/svg>$/g, '').replace(/bt-tail-/g, `${this.ID}-tail-`);
            const xs = c.left.concat(c.right).map(p => p.x), ys = c.left.concat(c.right).map(p => p.y);
            const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            return { svg, ink: A.tailTone(model, 1, 0).ink, box: { x: x0 - 6, y: y0 - 8, w: x1 - x0 + 12, h: (y1 - y0) * 0.86 } };
        } finally { A.setTailLevel(keep); }
    },

    // ---------- ЗВЁЗДЫ-СТУПЕНИ ----------
    // Одна звезда — одна покупка (решение игрока): сколько ступеней в
    // ветке, столько и звёзд, у хвоста 10, у мыла и мочалки по 8. Число
    // берётся из конфига (длина лестницы), а раскладка рядов — у каждого
    // окна своя (STARS ниже), потому что у окон разная ширина.
    // Купленная — литое золото с фаской и искрой; некупленная — гнездо:
    // тёмная вдавленная звезда с тонким золотым ободком.
    star(cx, cy, r, on) {
        const C = this.C(), S = STROKE, I = this.ID, n = (v) => this.n(v);
        let d = '';
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r;
            d += (i ? 'L' : 'M') + n(cx + rr * Math.cos(a)) + ',' + n(cy + rr * Math.sin(a));
        }
        d += 'Z';
        if (!on) return `<path d="${d}" fill="${C.velvet.deep}" fill-opacity="0.55" stroke="${C.gold[500]}" stroke-opacity="0.75" stroke-width="${S.hairline}" stroke-linejoin="round"/>`;
        return `<path d="${d}" fill="${C.velvet.deep}" opacity="0.6" transform="translate(0.5 0.8)"/>
            <path d="${d}" fill="url(#${I}-goldR)" stroke="${C.gold.deep}" stroke-width="${S.hairline}" stroke-linejoin="round"/>
            <path d="M${n(cx)},${n(cy - r * 0.78)} L${n(cx)},${n(cy - r * 0.1)}" stroke="${C.gold.glint}" stroke-opacity="0.7" stroke-width="${S.hairline}" stroke-linecap="round"/>`;
    },

    // Ряды звёзд: каждая строка — сколько звёзд в ряду. Сумма = число
    // ступеней ветки; заполняются слева направо, сверху вниз.
    STARS: {
        tail:  { rows: [5, 5], r: 8.2, gap: 21, dy: 19 },
        soap:  { rows: [4, 4], r: 7.4, gap: 21, dy: 20 },
        cloth: { rows: [4, 4], r: 7.4, gap: 21, dy: 20 }
    },
    stars(key, cx, top, bought) {
        const L = this.STARS[key];
        let s = '', k = 0;
        L.rows.forEach((cnt, row) => {
            const x0 = cx - (cnt - 1) * L.gap / 2, y = top + row * L.dy;
            for (let i = 0; i < cnt; i++, k++) s += this.star(x0 + i * L.gap, y, L.r, k < bought);
        });
        return s;
    }
    ,
    // ---------- ГЕОМЕТРИЯ ДЛЯ БИРКИ ----------
    // Многоугольник со скруглёнными углами: на каждом углу дуга радиуса r
    // (квадратичная, через сам угол). Острый угол бумаги на журнальной
    // бирке читался вырезанным ножницами из картона.
    roundPoly(pts, r) {
        const n = (v) => this.n(v), N = pts.length;
        let d = '';
        for (let i = 0; i < N; i++) {
            const p = pts[i], a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
            const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
            const rr = Math.min(r, la / 2, lb / 2);
            const s = [p[0] + (a[0] - p[0]) / la * rr, p[1] + (a[1] - p[1]) / la * rr];
            const e = [p[0] + (b[0] - p[0]) / lb * rr, p[1] + (b[1] - p[1]) / lb * rr];
            d += `${i ? 'L' : 'M'}${n(s[0])},${n(s[1])} Q${n(p[0])},${n(p[1])} ${n(e[0])},${n(e[1])} `;
        }
        return d + 'Z';
    },
    // Выпуклый многоугольник, сдвинутый ВНУТРЬ на d: каждая сторона уходит
    // по своей нормали, углы — пересечения соседних сторон. Рамка-волосок
    // бирки поэтому параллельна краю везде, и у острия тоже (у наброска
    // она была масштабом и у острия уезжала).
    insetPoly(pts, d) {
        const N = pts.length, lines = [];
        // обход по часовой (y вниз): внутренняя нормаль стороны — (-dy, dx)
        for (let i = 0; i < N; i++) {
            const p = pts[i], q = pts[(i + 1) % N], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
            const nx = -dy / l, ny = dx / l;
            lines.push([p[0] + nx * d, p[1] + ny * d, dx, dy]);
        }
        return lines.map((L1, i) => {
            const L0 = lines[(i + N - 1) % N];
            const det = L0[2] * L1[3] - L0[3] * L1[2];
            const t = ((L1[0] - L0[0]) * L1[3] - (L1[1] - L0[1]) * L1[2]) / det;
            return [L0[0] + L0[2] * t, L0[1] + L0[3] * t];
        });
    },

    // Значок валюты рядом с числом: «значок + число» читается ценой без
    // слов, голое число в кружке — нет (замечание игрока к монете).
    token(x, y, size) {
        if (typeof TokenArt === 'undefined') return '';
        return TokenArt.svg('lust_token', 0, { whole: true, size }).replace('<svg ', `<svg x="${this.n(x)}" y="${this.n(y - size / 2)}" `);
    },
    numW(num, fs) { return String(num).length * fs * 0.62; },   // цифра Georgia ≈ 0.62 кегля

    // Витой шнур: тёмная подложка, тело металлом и светлые косые штрихи
    // пунктиром поверх — пряди, которые ловят свет. Ровная золотая линия
    // читалась проволокой.
    cord(d, w) {
        const C = this.C(), G = C.gold, I = this.ID, n = (v) => this.n(v);
        return `<path d="${d}" fill="none" stroke="${G.deep}" stroke-width="${n(w + 0.8)}" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${d}" fill="none" stroke="url(#${I}-goldV)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${d}" fill="none" stroke="${G.glint}" stroke-opacity="0.8" stroke-width="${n(w * 0.45)}" stroke-dasharray="${n(w * 0.55)} ${n(w * 0.75)}" stroke-linecap="round"/>
            <path d="${d}" fill="none" stroke="${G.lo}" stroke-opacity="0.7" stroke-width="${n(w * 0.3)}" stroke-dasharray="${n(w * 0.55)} ${n(w * 0.75)}" stroke-dashoffset="${n(w * 0.65)}"/>`;
    },

    // ---------- ЦЕНА: БУМАЖНАЯ БИРКА НА ЗОЛОТОМ ШНУРКЕ ----------
    // Выбор игрока (раунд 2). Бирка привязана к медальону буквально, как
    // ярлык в лавке: шнур висит на золотом колечке-ушке, продетом в обод
    // медальона, проходит в люверс бирки и обнимает её острие — две пряди
    // сходятся в узел над биркой. У наброска шнур обрывался в воздухе:
    // начинался под фестонами и ни на чём не висел.
    //   xR, y — правый край и середина бирки; L — ушко на ободе
    //   медальона (MAG_AD.lug(...)): шнур захлёстнут за его нижнюю
    //   перемычку — две пряди из отверстия сходятся в обмотку под кольцом.
    // Бумага — самое светлое пятно окна, поэтому цена заметна без отделки.
    priceTag(xR, y, num, L) {
        const C = this.C(), S = STROKE, G = C.gold, I = this.ID, n = (v) => this.n(v);
        const fs = 21, tk = 16, h = 30, w = this.numW(num, fs) + tk + 30;
        const ang = -6 * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
        // Бирка в своих координатах: люверс в нуле, острие слева.
        const pts = [[-9, 0], [3, -h / 2], [w - 9, -h / 2], [w - 9, h / 2], [3, h / 2]];
        const hx = xR - (w - 9), hy = y;
        const W = ([x, yy]) => [hx + x * ca - yy * sa, hy + x * sa + yy * ca];
        const body = this.roundPoly(pts, 2.6);
        // Узел — у самого люверса, на прямой к ушку, и того же шнура: лишь
        // утолщение, где сходятся пряди. Блестящий шарик посреди шнура
        // перетягивал взгляд с цены на себя (замечание игрока).
        const hole = W([0, 0]), tipTop = W([-6.5, -2.4]);
        const H = L.hole, px = -L.ny, py = L.nx, wr = L.R + 2.6;
        const ring = [H[0] + L.nx * wr, H[1] + L.ny * wr];
        const dl = Math.hypot(ring[0] - hole[0], ring[1] - hole[1]);
        const kx = hole[0] + (ring[0] - hole[0]) / dl * 6, ky = hole[1] + (ring[1] - hole[1]) / dl * 6;
        // Прядь из люверса — прямо к узлу; вторая огибает острие: от острия
        // сзади бирки (её часть за бумагой не видна) и вверх к узлу.
        const strandA = `M${n(hole[0])},${n(hole[1] - 0.6)} Q${n(hole[0] + 1)},${n((hole[1] + ky) / 2)} ${n(kx)},${n(ky)}`;
        const strandB = `M${n(tipTop[0])},${n(tipTop[1])} Q${n(tipTop[0] + 0.5)},${n(ky - 0.5)} ${n(kx)},${n(ky)}`;
        // Провис к ушку: шнур тяжёлый, середина ниже прямой. Кончается
        // обмоткой под кольцом, от неё две пряди уходят в отверстие —
        // захлёст за перемычку, как вешают ярлык.
        const mx = (kx + ring[0]) / 2, my = (ky + ring[1]) / 2 + 4;
        const hang = `M${n(kx)},${n(ky)} Q${n(mx - 3)},${n(my)} ${n(ring[0])},${n(ring[1])}`;
        const pair = [1, -1].map(k => `M${n(ring[0] + px * k * 1.3)},${n(ring[1] + py * k * 1.3)} L${n(H[0] + px * k * 1.5)},${n(H[1] + py * k * 1.5)}`).join(' ');
        const wrap = `M${n(ring[0] - px * 1.3 - L.nx * 0.6)},${n(ring[1] - py * 1.3 - L.ny * 0.6)} L${n(ring[0] + px * 1.3 + L.nx * 0.6)},${n(ring[1] + py * 1.3 + L.ny * 0.6)}`;
        const tagG = `transform="translate(${n(hx)} ${n(hy)}) rotate(-6)"`;
        const paper = `${I}-paper`;
        return `<defs><linearGradient id="${paper}" x1="0" y1="0" x2="0.35" y2="1">
                <stop offset="0" stop-color="${C.pearl.hi}"/><stop offset="0.5" stop-color="${C.cream}"/><stop offset="1" stop-color="${C.pearl[500]}"/></linearGradient></defs>
            <g filter="url(#${I}-drop)">
                <g ${tagG}>
                    <path d="${body}" fill="url(#${paper})"/>
                    <path d="${body}" fill="none" stroke="${C.pearl.lo}" stroke-width="${S.hairline}"/>
                    <path d="${this.roundPoly(this.insetPoly(pts, 2.6), 1.2)}" fill="none" stroke="${G[500]}" stroke-width="${S.hairline}"/>
                    <path d="${this.roundPoly(this.insetPoly(pts, 3.9), 0.8)}" fill="none" stroke="${G[500]}" stroke-opacity="0.45" stroke-width="${S.hairline}"/>
                    <circle r="2.9" fill="url(#${I}-goldR)" stroke="${G.deep}" stroke-width="${S.hairline}"/>
                    <circle r="1.55" fill="${C.velvet.deep}"/>
                    <path d="M-1.9,-1.2 A2.3,2.3 0 0 1 0.6,-2.2" fill="none" stroke="${G.glint}" stroke-opacity="0.8" stroke-width="${S.hairline}"/>
                    ${this.token(w - 9 - 7 - this.numW(num, fs) - tk - 3, 0, tk)}
                    <text x="${n(w - 9 - 7)}" y="${n(fs * 0.35)}" text-anchor="end" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fs}" fill="${C.velvet.deep}">${num}</text>
                </g>
            </g>
            ${this.cord(strandB, 1.5)}
            ${this.cord(hang, 1.6)}
            ${this.cord(pair, 1.3)}
            ${this.cord(wrap, 1.9)}
            ${this.cord(strandA, 1.5)}
            ${this.cord(`M${n(kx - (kx - hole[0]) * 0.2)},${n(ky - (ky - hole[1]) * 0.2)} L${n(kx + (ring[0] - kx) * 0.06)},${n(ky + (ring[1] - ky) * 0.06)}`, 2.3)}`;
    },

    // ---------- ПЕЧАТЬ-КОРЗИНКА ----------
    // Сургучная печать на двух лентах. Появляется, только когда цена по
    // карману (решение игрока): печать — это «можно купить». Стоит слева
    // от бирки, в одной строке с ценой (выбор игрока, раунд 2).
    //
    // Как устроен сургуч (у наброска был плоский круг с кольцом и читался
    // пуговицей): натёк неровного края с толстым валиком, оттиск штампа —
    // УТОПЛЕННЫЙ диск с поднятой вокруг губой, по кругу оттиска бисер, в
    // середине золочёная корзинка рельефом. Свет один на лист — сверху
    // слева: у валика светлая верхняя-левая сторона, у ямки — наоборот,
    // освещена дальняя (нижняя правая) стенка. Глянец — один сочный блик.
    //   key — окно: хвосту рубиновый сургуч, мылу и мочалке изумрудный;
    //   tails — углы лент от вертикали (°), len — длина лент в радиусах.
    seal(cx, cy, r, key, tails, len) {
        const C = this.C(), S = STROKE, I = this.ID, n = (v) => this.n(v);
        const W = key === 'tail' ? C.ruby : C.emerald;
        const g = `${I}-wax-${key}`;
        const P = (k, a) => [k * Math.cos(a), k * Math.sin(a)];
        // Край натёка: две гармоники и три наплыва — капли сургуча, которые
        // успели растечься до штампа. Наплывы — колоколом по углу, а не
        // острым зубом.
        // Через 120°: иначе натёк смещает «центр тяжести» печати, и оттиск
        // с корзинкой кажется съехавшим с середины (замечание игрока).
        const bumps = [[0.5, 0.1], [2.6, 0.1], [4.7, 0.1]];
        const edge = (k) => {
            let d = '';
            for (let i = 0; i <= 160; i++) {
                const a = i * Math.PI * 2 / 160;
                let m = 1 + 0.04 * Math.sin(5 * a + 0.7) + 0.025 * Math.sin(9 * a + 2.1);
                bumps.forEach(([a0, h]) => { const da = Math.atan2(Math.sin(a - a0), Math.cos(a - a0)); m += h * Math.exp(-da * da / 0.09); });
                const [x, y] = P(r * k * m, a);
                d += (i ? 'L' : 'M') + n(x) + ',' + n(y);
            }
            return d + 'Z';
        };
        const ri = r * 0.6, lip = r * 0.7;
        // Бисер по кругу оттиска: каждая бусина — свет сверху-слева и тень
        // снизу-справа, то есть выпуклость, а не нарисованная точка.
        let beadsHi = '', beadsLo = '';
        for (let i = 0; i < 30; i++) {
            const a = i * Math.PI * 2 / 30, [x, y] = P(ri * 0.86, a);
            beadsLo += `M${n(x + 0.35)},${n(y + 0.45)} h0.01 `;
            beadsHi += `M${n(x - 0.25)},${n(y - 0.3)} h0.01 `;
        }
        const ribbons = (tails || [20, -20]).map((deg, i) => this.ribbon(deg, r, len || 1.5, W, `${g}-rb${i}`)).join('');
        return `<defs>
                <radialGradient id="${g}" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stop-color="${W.hi}"/><stop offset="0.42" stop-color="${W[500]}"/><stop offset="0.85" stop-color="${W.lo}"/><stop offset="1" stop-color="${W.deep}"/></radialGradient>
                <linearGradient id="${g}-rim" x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stop-color="${W.hi}"/><stop offset="0.45" stop-color="${W[500]}" stop-opacity="0"/><stop offset="1" stop-color="${W.deep}"/></linearGradient>
                <linearGradient id="${g}-wall" x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stop-color="${W.deep}"/><stop offset="0.55" stop-color="${W.lo}" stop-opacity="0"/><stop offset="1" stop-color="${W.hi}"/></linearGradient>
                <radialGradient id="${g}-pit" cx="0.62" cy="0.66" r="0.8"><stop offset="0" stop-color="${W[500]}"/><stop offset="1" stop-color="${W.lo}"/></radialGradient>
            </defs>
            <g transform="translate(${n(cx)} ${n(cy)})">
                <g filter="url(#${I}-drop)">${ribbons}<path d="${edge(1)}" fill="url(#${g})"/></g>
                <path d="${edge(0.93)}" fill="none" stroke="url(#${g}-rim)" stroke-width="${n(r * 0.12)}" stroke-opacity="0.75"/>
                <path d="${edge(1)}" fill="none" stroke="${W.deep}" stroke-opacity="0.6" stroke-width="${S.hairline}"/>
                <circle r="${n(lip)}" fill="none" stroke="url(#${g}-rim)" stroke-width="${n(r * 0.14)}"/>
                <circle r="${n(ri)}" fill="url(#${g}-pit)"/>
                <circle r="${n(ri)}" fill="none" stroke="url(#${g}-wall)" stroke-width="${n(r * 0.07)}"/>
                <path d="${beadsLo}" stroke="${W.deep}" stroke-opacity="0.8" stroke-width="${n(r * 0.075)}" stroke-linecap="round"/>
                <path d="${beadsHi}" stroke="${W.hi}" stroke-width="${n(r * 0.06)}" stroke-linecap="round"/>
                ${this.basket(0, 0, ri * 0.78)}
                <path d="M${n(-r * 0.78)},${n(-r * 0.32)} C${n(-r * 0.74)},${n(-r * 0.62)} ${n(-r * 0.5)},${n(-r * 0.82)} ${n(-r * 0.2)},${n(-r * 0.86)} C${n(-r * 0.46)},${n(-r * 0.72)} ${n(-r * 0.66)},${n(-r * 0.55)} ${n(-r * 0.78)},${n(-r * 0.32)}Z" fill="${C.pearl.hi}" fill-opacity="0.38"/>
                <ellipse cx="${n(-r * 0.5)}" cy="${n(-r * 0.66)}" rx="${n(r * 0.07)}" ry="${n(r * 0.04)}" transform="rotate(-38 ${n(-r * 0.5)} ${n(-r * 0.66)})" fill="${C.pearl.hi}" fill-opacity="0.85"/>
            </g>`;
    },

    // Лента: из-под печати вниз, с лёгким изгибом и вырезом «ласточкин
    // хвост». Атлас — свет поперёк ленты (тёмные края, светлая полоса
    // ближе к лампе), по краям золотая кромка. Начало лент спрятано глубоко
    // под сургучом: у наброска ленты начинались у края и торчали обрубком.
    ribbon(deg, r, len, Wc, id) {
        const C = this.C(), S = STROKE, n = (v) => this.n(v);
        const a = deg * Math.PI / 180, ux = Math.sin(a), uy = Math.cos(a), px = uy, py = -ux;
        const L = r * len + r * 0.55, w = r * 0.24, bend = r * 0.1 * Math.sign(deg || 1);
        // Средняя линия — квадратичная кривая; края — сдвиг по нормали.
        const c0 = [ux * r * 0.15, uy * r * 0.15], c2 = [ux * L, uy * L], c1 = [ux * L * 0.5 + px * bend, uy * L * 0.5 + py * bend];
        const pt = (t) => [(1 - t) * (1 - t) * c0[0] + 2 * (1 - t) * t * c1[0] + t * t * c2[0], (1 - t) * (1 - t) * c0[1] + 2 * (1 - t) * t * c1[1] + t * t * c2[1]];
        const nrm = (t) => { const d = [2 * (1 - t) * (c1[0] - c0[0]) + 2 * t * (c2[0] - c1[0]), 2 * (1 - t) * (c1[1] - c0[1]) + 2 * t * (c2[1] - c1[1])], l = Math.hypot(d[0], d[1]); return [d[1] / l, -d[0] / l]; };
        const side = (s, k) => { const out = []; for (let i = 0; i <= 16; i++) { const t = i / 16, p = pt(t), q = nrm(t); out.push([p[0] + q[0] * s * k, p[1] + q[1] * s * k]); } return out; };
        const A = side(w, 1), B = side(w, -1), end = pt(1), nr = nrm(1);
        // Вырез на конце: вглубь ленты по её оси.
        const tang = [end[0] - pt(0.96)[0], end[1] - pt(0.96)[1]], tl = Math.hypot(tang[0], tang[1]);
        const notch = [end[0] - tang[0] / tl * w * 1.1, end[1] - tang[1] / tl * w * 1.1];
        const pl = (arr) => arr.map(([x, y]) => `${n(x)},${n(y)}`).join(' L');
        const body = `M${pl(A)} L${n(notch[0])},${n(notch[1])} L${pl(B.slice().reverse())}Z`;
        const mid = pt(0.6), q = nrm(0.6);
        const edgeA = side(w - 1, 1).slice(3, 16), edgeB = side(w - 1, -1).slice(3, 16);
        return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(mid[0] + q[0] * w)}" y1="${n(mid[1] + q[1] * w)}" x2="${n(mid[0] - q[0] * w)}" y2="${n(mid[1] - q[1] * w)}">
                <stop offset="0" stop-color="${Wc.deep}"/><stop offset="0.3" stop-color="${Wc[500]}"/><stop offset="0.45" stop-color="${Wc.hi}"/><stop offset="0.62" stop-color="${Wc[500]}"/><stop offset="1" stop-color="${Wc.lo}"/></linearGradient></defs>
            <path d="${body}" fill="url(#${id})" stroke="${Wc.deep}" stroke-width="${S.hairline}" stroke-linejoin="round"/>
            <path d="M${pl(edgeA)} M${pl(edgeB)}" fill="none" stroke="${C.gold[500]}" stroke-opacity="0.85" stroke-width="${S.hairline}"/>`;
    },

    // Корзинка, вытиснутая золотом в оттиске: обод с витой кромкой, ручка,
    // короб с плетением рядами (кирпичиком, как настоящая лоза) и стойками.
    // Перекрёстная штриховка наброска читалась сеткой, а не корзиной.
    // Рельеф: тень вниз-вправо, свет по верхним кромкам.
    basket(cx, cy, s) {
        const C = this.C(), S = STROKE, I = this.ID, G = C.gold, n = (v) => this.n(v);
        // Габарит корзинки по y — от верха ручки (−0.72) до дна (0.84):
        // середина габарита ставится в (cx, cy), а не начало координат.
        const X = (v) => n(cx + v * s), Y = (v) => n(cy + (v - 0.06) * s);
        const body = `M${X(-0.74)},${Y(0.02)} L${X(0.74)},${Y(0.02)} L${X(0.56)},${Y(0.74)} Q${X(0.53)},${Y(0.84)} ${X(0.43)},${Y(0.84)} L${X(-0.43)},${Y(0.84)} Q${X(-0.53)},${Y(0.84)} ${X(-0.56)},${Y(0.74)}Z`;
        const clipId = `${I}-bk-${Math.round(cx * 10)}-${Math.round(cy * 10)}-${Math.round(s * 10)}`;
        const handle = `M${X(-0.5)},${Y(-0.02)} C${X(-0.52)},${Y(-0.95)} ${X(0.52)},${Y(-0.95)} ${X(0.5)},${Y(-0.02)}`;
        // Плетение: три ряда, в каждом «кирпичи» вразбежку с соседним рядом.
        let rows = '', bricks = '';
        [0.28, 0.54].forEach(y => { rows += `M${X(-0.9)},${Y(y)} H${X(0.9)} `; });
        [[0.02, 0.28, 0], [0.28, 0.54, 0.17], [0.54, 0.84, 0]].forEach(([y0, y1, off]) => {
            for (let x = -0.85 + off; x < 0.9; x += 0.34) bricks += `M${X(x)},${Y(y0)} V${Y(y1)} `;
        });
        const rim = `M${X(-0.84)},${Y(-0.06)} H${X(0.84)} Q${X(0.9)},${Y(-0.06)} ${X(0.9)},${Y(0.0)} Q${X(0.9)},${Y(0.07)} ${X(0.84)},${Y(0.07)} H${X(-0.84)} Q${X(-0.9)},${Y(0.07)} ${X(-0.9)},${Y(0.0)} Q${X(-0.9)},${Y(-0.06)} ${X(-0.84)},${Y(-0.06)}Z`;
        let twist = '';
        for (let x = -0.82; x < 0.85; x += 0.12) twist += `M${X(x)},${Y(0.06)} L${X(x + 0.07)},${Y(-0.05)} `;
        const sh = `transform="translate(${n(s * 0.05)} ${n(s * 0.07)})"`;
        return `<defs><clipPath id="${clipId}"><path d="${body}"/></clipPath></defs>
            <path d="${handle}" fill="none" stroke="${G.deep}" stroke-opacity="0.8" stroke-width="${n(s * 0.17)}" stroke-linecap="round" ${sh}/>
            <path d="${body}" fill="${G.deep}" fill-opacity="0.8" ${sh}/>
            <path d="${rim}" fill="${G.deep}" fill-opacity="0.8" ${sh}/>
            <path d="${handle}" fill="none" stroke="url(#${I}-goldV)" stroke-width="${n(s * 0.14)}" stroke-linecap="round"/>
            <path d="${handle}" fill="none" stroke="${G.glint}" stroke-opacity="0.6" stroke-width="${n(s * 0.04)}" stroke-linecap="round" transform="translate(${n(-s * 0.02)} ${n(-s * 0.03)})"/>
            <path d="${body}" fill="url(#${I}-goldR)"/>
            <g clip-path="url(#${clipId})">
                <path d="${rows}" stroke="${G.deep}" stroke-opacity="0.75" stroke-width="${n(s * 0.045)}"/>
                <path d="${rows}" stroke="${G.glint}" stroke-opacity="0.5" stroke-width="${n(s * 0.025)}" transform="translate(0 ${n(s * 0.04)})"/>
                <path d="${bricks}" stroke="${G.lo}" stroke-width="${n(s * 0.035)}"/>
            </g>
            <path d="${body}" fill="none" stroke="${G.deep}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>
            <path d="${rim}" fill="url(#${I}-gold)" stroke="${G.deep}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>
            <path d="${twist}" stroke="${G.lo}" stroke-width="${n(s * 0.03)}"/>`;
    }
};

if (typeof window !== 'undefined') window.MAG_AD = MAG_AD;
