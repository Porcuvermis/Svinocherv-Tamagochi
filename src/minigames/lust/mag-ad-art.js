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
    path(kind, w, h, d) {
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
            const r = 15, rr = r + d, e = Math.sqrt(rr * rr - d * d);
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
    // фаской, волосок внутри. Своё у каждого окна — внешний венец: лучи у
    // хвоста, фестоны у мыла, жемчуг у мочалки.
    medal(cx, cy, r, kind, inner) {
        const C = this.C(), S = STROKE, I = this.ID, n = (v) => this.n(v);
        const col = { deco: C.petrol, cart: C.plum, pearl: C.rose }[kind];
        const gid = `${I}-medal-${kind}`;
        const circ = (rr) => `M${n(cx - rr)},${n(cy)} a${rr},${rr} 0 1,0 ${n(2 * rr)},0 a${rr},${rr} 0 1,0 ${n(-2 * rr)},0Z`;
        let crown = '';
        if (kind === 'deco') {
            // Ореол ар-деко: тонкие лучи, длинный через короткий, внутри
            // волоска-ограды. Треугольные клинья наброска читались пилой.
            const p = (rr, aa) => `${n(cx + Math.cos(aa) * rr)},${n(cy + Math.sin(aa) * rr)}`;
            let lng = '', sht = '';
            for (let i = 0; i < 72; i++) {
                const a = i * Math.PI * 2 / 72;
                if (i % 2) sht += `M${p(r + 6, a)} L${p(r + 9.5, a)} `;
                else lng += `M${p(r + 6, a)} L${p(r + 13, a)} `;
            }
            crown = `<path d="${lng}" stroke="url(#${I}-gold)" stroke-width="${S.detail}"/>
                <path d="${sht}" stroke="${C.gold[500]}" stroke-opacity="0.8" stroke-width="${S.hairline}"/>
                <circle cx="${cx}" cy="${cy}" r="${n(r + 14.6)}" fill="none" stroke="${C.gold[500]}" stroke-opacity="0.7" stroke-width="${S.hairline}"/>`;
        } else if (kind === 'cart') {
            // Фестоны: полукруглые лепестки встык.
            let d = '';
            const N = 22, rr = r + 4.4;
            for (let i = 0; i < N; i++) {
                const a1 = i * Math.PI * 2 / N, a2 = (i + 1) * Math.PI * 2 / N, am = (a1 + a2) / 2;
                const p = (R, a) => `${n(cx + Math.cos(a) * R)},${n(cy + Math.sin(a) * R)}`;
                d += `M${p(rr, a1)} Q${p(rr + 6.4, am)} ${p(rr, a2)}`;
            }
            crown = `<path d="${d}" fill="${col.lo}" stroke="url(#${I}-goldV)" stroke-width="${S.detail}"/>`;
        } else {
            const N = 34, rr = r + 6.6, P = C.pearl;
            let c = `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${col.deep}" stroke-opacity="0.7" stroke-width="5.4"/>`;
            for (let i = 0; i < N; i++) {
                const a = i * Math.PI * 2 / N;
                c += `<circle cx="${n(cx + Math.cos(a) * rr)}" cy="${n(cy + Math.sin(a) * rr)}" r="2.35" fill="url(#${I}-pearl)"/>`;
            }
            crown = c;
        }
        return `<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${n(cx - r * 0.3)}" cy="${n(cy - r * 0.35)}" r="${n(r * 1.35)}">
                <stop offset="0" stop-color="${col.hi}"/><stop offset="0.55" stop-color="${col[500]}"/><stop offset="1" stop-color="${col.deep}"/></radialGradient></defs>
            <circle cx="${n(cx + 1.4)}" cy="${n(cy + 2.2)}" r="${n(r + 5)}" fill="${C.velvet.deep}" opacity="0.5"/>
            ${crown}
            <path d="${circ(r + 4.6)}${circ(r)}" fill="url(#${I}-gold)" fill-rule="evenodd"/>
            <circle cx="${cx}" cy="${cy}" r="${r + 4.6}" fill="none" stroke="${C.gold.deep}" stroke-opacity="0.6" stroke-width="${S.hairline}"/>
            <circle cx="${cx}" cy="${cy}" r="${n(r + 2.3)}" fill="none" stroke="${C.gold.glint}" stroke-opacity="0.4" stroke-width="${S.hairline}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gid})" stroke="${C.gold.deep}" stroke-width="${S.hairline}"/>
            <circle cx="${cx}" cy="${cy}" r="${n(r - 3.4)}" fill="none" stroke="${C.gold.hi}" stroke-opacity="0.45" stroke-width="${S.hairline}"/>
            ${inner || ''}`;
    }
};

if (typeof window !== 'undefined') window.MAG_AD = MAG_AD;
