// ================= АППАРАТ АЛЧНОСТИ: ПАЧИНКО =================
// Продолжение GreedJunk. Пачинко — покупка (Backend.greedLevel('pachinko')),
// встаёт в правое гнездо верхнего ящика, приготовленное заранее: короб
// задвинут в алюминиевые рельсы, стоит на полке с резиновыми подушками,
// вилка — в промышленной розетке за ним. Короб выше аппарата и торчит над
// верхом рамки (решение игрока): так поле выше, а лунки крупнее.
//
// Гаражное, как весь аппарат: короб — выдвижной ящик от старого комода
// (тёмный лак, стёртый до шпона), стальные уголки по углам. Поле — фанера,
// крашенная кистью кремовым с красным, как колесо: оба сделаны одной рукой.
// Штыри — гвозди, как на колесе. Лунки — стаканчики из консервных банок,
// прибитые к полю: крашены в цвет греха, на каждой значок жетона или
// монеты, без слов (инвариант 9). Мимо всех лунок — сток внизу: «пусто».
// Шарик запускает большая красная кнопка внизу справа (решение игрока),
// он взлетает по дорожке у правого края и сверху падает на гвозди.
//
// Читается без увеличения (решение игрока): поле ~80 единиц шириной, это
// ~80 точек на телефоне. Поэтому лунки крупные (18×13, значок ~10), гвоздей
// немного (шаг ~12), на поле — только крупные пятна; тонкого нет.
//
// Шанс лунки — в конфиге (ECONOMY.minigames.greed.pachinko), а не в её
// размере или месте: куда упадёт шарик, решено заранее.
//
// На свету короб — освещённый прибор своим холстом
// (greed-junk-lit-pachinko.js); стекло — неподвижный слой поверх.
Object.assign(GreedJunk, {
    // Короб: x0..x1 × y0..y1 (y0 < 0 — над полем аппарата); стенки, низ —
    // панель с кнопкой. Поле внутри; справа дорожка запуска за перегородкой;
    // сверху дуга из стальной полосы ведёт шарик с дорожки на поле.
    PACH: {
        x0: 208, x1: 312, y0: -36, y1: 234, wall: 6, top: 8, panel: 30,
        sep: 293.5,                         // перегородка дорожки (левый край)
        arc: { cx: 259.5, cy: 32, r: 45 },  // дуга над полем
        drain: 196,                         // верх стока
        cup: { w: 18, h: 13 },
        button: { x: 297, y: 219, r: 7.5 },
        nailUp: 7                           // гвоздь торчит над краской
    },
    // Лунки: ряды по 2–3 вперемешку (центр верха лунки) и что в них. Ряды
    // разведены по высоте и сдвинуты через один — шарик, падающий прямо,
    // не проходит одну колонку насквозь. Ключи — как в конфиге пачинко.
    PACH_CUPS: [
        { key: 'wrath', x: 241, y: 50 }, { key: 'glut', x: 267, y: 50 },
        { key: 'lust', x: 228, y: 94 }, { key: 'gold1', x: 254, y: 94 }, { key: 'sloth', x: 280, y: 94 },
        { key: 'envy', x: 241, y: 138 }, { key: 'pride', x: 267, y: 138 },
        { key: 'greed', x: 228, y: 176 }, { key: 'gold1', x: 280, y: 176 }
    ],

    // на аппарате: куплено — или включено в отладке (🐞 → «Пачинко»)
    pachinkoShown() {
        if (typeof Backend !== 'undefined' && Backend.greedLevel && Backend.greedLevel('pachinko') > 0) return true;
        try { return localStorage.getItem('gj-pachinko') === '1'; } catch (e) { return false; }
    },

    // Гвозди: шахматкой с шагом ~12.6 по полю под дугой, мимо лунок,
    // перегородки и стенок. Ряды чуть гуляют — прибивали на глаз.
    pachNails() {
        const P = this.PACH, A = P.arc, C = P.cup, rnd = this.rng(4401), pts = [];
        const left = P.x0 + P.wall + 4, right = P.sep - 4;
        for (let row = 0, y = 4; y < P.drain - 6; row++, y += 11) {
            for (let x = left + (row % 2 ? 6.3 : 0); x <= right; x += 12.6) {
                const px = x + (rnd() - 0.5) * 1.2, py = y + (rnd() - 0.5) * 1.2;
                // под дугой
                if (py < A.cy && Math.hypot(px - A.cx, py - A.cy) > A.r - 6) continue;
                // мимо лунок: над лункой шире — шарику нужен вход
                if (this.PACH_CUPS.some(c => px > c.x - C.w / 2 - 4 && px < c.x + C.w / 2 + 4 && py > c.y - 8 && py < c.y + C.h + 4)) continue;
                pts.push([px, py]);
            }
        }
        return pts;
    },

    // Значок лунки, середина (0, 0), ~10 в поперечнике: осколок, жетон или
    // монета. Кремом с чернильным контуром — читается на любом цвете крышки.
    pachIcon(key) {
        const J = PALETTE.greedJunk, ink = PALETTE.ink, f = this.f, cr = J.paint.cream;
        if (key === 'gold1') {
            return `<circle r="5.2" fill="${J.paint.yellow}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle r="3.4" fill="none" stroke="${J.wood[300]}" stroke-width="0.7"/>` +
                `<path d="M-3.2 -1.6 A3.6 3.6 0 0 1 -0.8 -3.6" fill="none" class="hl" stroke="${cr}" stroke-width="0.8" stroke-linecap="round"/>`;
        }
        if (key === 'envy' || key === 'pride') {
            // целый жетон — кольцо с тремя перемычками (как в кошельке)
            const ring = 'M-5.4 0 A5.4 5.4 0 1 1 5.4 0 A5.4 5.4 0 1 1 -5.4 0 Z M-2.5 0 A2.5 2.5 0 1 0 2.5 0 A2.5 2.5 0 1 0 -2.5 0 Z';
            let o = `<path d="${ring}" fill="${cr}" fill-rule="evenodd" stroke="${ink}" stroke-width="${STROKE.detail}"/>`;
            for (let t = 0; t < 3; t++) {
                const a = (t * 120 - 90) * Math.PI / 180;
                o += `<line x1="${f(Math.cos(a) * 2.2)}" y1="${f(Math.sin(a) * 2.2)}" x2="${f(Math.cos(a) * 6.2)}" y2="${f(Math.sin(a) * 6.2)}" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>`;
            }
            return o;
        }
        // Осколок — треть кольца жетона, отломанная наискось (верх-справа),
        // с рваными краями. Наискось нарочно: всё симметричное в круглом
        // стаканчике складывалось в лицо — дуга сверху читалась ртом, треть
        // снизу с пунктиром остального кольца — улыбкой с глазами.
        const Ro = 6.4, Ri = 3, cx0 = -1.6, cy0 = 2;
        const at = (r, d) => [cx0 + Math.cos(d * Math.PI / 180) * r, cy0 + Math.sin(d * Math.PI / 180) * r];
        const P = (q) => `${f(q[0])} ${f(q[1])}`;
        const tear = (d, s) => [at(Ro, d), at(Ro - 1.4, d + 9 * s), at((Ro + Ri) / 2, d - 4 * s), at(Ri + 0.8, d + 8 * s), at(Ri, d)];
        const a = tear(-112, 1), b = tear(8, -1);
        const d = `M${P(a[0])} A${Ro} ${Ro} 0 0 1 ${P(b[0])} L${b.slice(1).map(P).join(' L')} A${Ri} ${Ri} 0 0 0 ${P(a[4])} L${a.slice(1, 4).reverse().map(P).join(' L')} Z`;
        return `<path d="${d}" fill="${cr}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
    },

    // ключи пачинко короче ключей грехов: glut — это gluttony
    PACH_SIN: { glut: 'gluttony' },
    pachCupColor(key) {
        if (key === 'gold1') return PALETTE.greedJunk.tin[300];
        const s = typeof ECONOMY !== 'undefined' && ECONOMY.sins && ECONOMY.sins[this.PACH_SIN[key] || key];
        return (s && s.color) || PALETTE.greedJunk.paint.cream;
    },

    // Части короба по слоям (высота и материал — у сборщика на свету):
    // frame — доски ящика и низ-панель; field — крашеное поле; drain — сток;
    // steel — дуга, перегородка, пружина дорожки; cups — лунки; nails —
    // гвозди; corners — уголки и саморезы стекла; button — кнопка.
    pachParts() {
        const J = PALETTE.greedJunk, W = J.reel.wheel, Pp = J.reel.pachinko, P = this.PACH, A = P.arc, C = P.cup;
        const ink = PALETTE.ink, f = this.f, rnd = this.rng(4402);
        const fx0 = P.x0 + P.wall, fx1 = P.x1 - P.wall, fy0 = P.y0 + P.top, fy1 = P.y1 - P.panel;

        // ---- ящик: четыре доски от комода и низ-панель ----
        let frame = `<rect x="${P.x0}" y="${P.y0}" width="${P.x1 - P.x0}" height="${P.y1 - P.y0}" rx="1.5" fill="${J.painted.lo}"/>`;
        frame += this.planks(P.x0, P.y0, P.wall, P.y1 - P.y0, 1, 4410, 'v', 0, 'lacquer');
        frame += this.planks(P.x1 - P.wall, P.y0, P.wall, P.y1 - P.y0, 1, 4411, 'v', 0, 'lacquer');
        frame += this.planks(fx0, P.y0, fx1 - fx0, P.top, 1, 4412, 'h', 0, 'lacquer');
        frame += this.planks(fx0, fy1, fx1 - fx0, P.panel, 1, 4413, 'h', 0, 'lacquer');
        frame += `<rect x="${P.x0}" y="${P.y0}" width="${P.x1 - P.x0}" height="${P.y1 - P.y0}" rx="1.5" fill="none" stroke="${ink}" stroke-width="${STROKE.contour}"/>`;
        frame += `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" fill="none" stroke="${ink}" stroke-width="${STROKE.structure}"/>`;

        // ---- поле: фанера, крашенная кистью; за дугой — красное ----
        let field = `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" fill="${W.red}"/>`;
        // кремовое — внутри дуги и ниже неё, дорожка запуска — тоже красная
        const inner = `M${f(A.cx - A.r)} ${A.cy} A${A.r} ${A.r} 0 0 1 ${f(A.cx + A.r)} ${A.cy} L${P.sep} ${A.cy} L${P.sep} ${P.drain} L${fx0} ${P.drain} L${fx0} ${A.cy} Z`;
        field += `<path d="${inner}" fill="${W.cream}"/>`;
        // мазки кисти вдоль поля
        let br = '';
        for (let k = 0; k < 26; k++) {
            const x = fx0 + 2 + rnd() * (P.sep - fx0 - 4), y = A.cy - 20 + rnd() * (P.drain - A.cy + 10), L = 10 + rnd() * 26;
            br += `M${f(x)} ${f(y)} l${f((rnd() - 0.5) * 2)} ${f(L)} `;
        }
        field += `<path d="${br}" stroke="${W.creamLo}" stroke-width="0.7" opacity="0.35" stroke-linecap="round" fill="none"/>`;
        // сколы краски до фанеры
        for (let k = 0; k < 7; k++) {
            const x = fx0 + 3 + rnd() * (P.sep - fx0 - 6), y = A.cy + rnd() * (P.drain - A.cy - 8), s = 0.9 + rnd() * 1.6;
            field += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(s * 1.3)}" ry="${f(s)}" fill="${W.ply}" stroke="${W.plyLo}" stroke-width="0.3"/>`;
        }

        // ---- сток: щель через всю ширину, кромка — жесть ----
        let drain = `<rect x="${fx0}" y="${P.drain}" width="${P.sep - fx0}" height="${fy1 - P.drain}" class="pit" fill="${J.hole}"/>`;
        drain += `<rect x="${fx0}" y="${P.drain - 1.2}" width="${P.sep - fx0}" height="1.8" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.hairline}"/>`;

        // ---- сталь: дуга, перегородка дорожки, пружина под шариком ----
        const arcD = `M${f(A.cx - A.r)} ${f(A.cy + 6)} L${f(A.cx - A.r)} ${A.cy} A${A.r} ${A.r} 0 0 1 ${f(A.cx + A.r)} ${A.cy} L${f(A.cx + A.r)} ${fy1}`;
        let steel = `<path d="${arcD}" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linejoin="round"/>` +
            `<path d="${arcD}" fill="none" stroke="${J.tin[300]}" stroke-width="2"/>` + this.rodH(arcD, 2.6, 1.6);
        const sepD = `M${P.sep + 1} ${A.cy + 12} L${P.sep + 1} ${P.drain}`;
        steel += `<path d="${sepD}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>` +
            `<path d="${sepD}" fill="none" stroke="${J.tin[300]}" stroke-width="1.6" stroke-linecap="round"/>` + this.rodH(sepD, 2.2, 1.4);
        // пружина толкателя на дне дорожки: шарик ляжет на неё
        const lx = (P.sep + 2 + fx1) / 2, sy0 = fy1 - 12;
        let spring = `M${f(lx - 3.4)} ${f(sy0)}`;
        for (let k = 0; k < 6; k++) spring += ` L${f(lx + (k % 2 ? -3.4 : 3.4))} ${f(sy0 + (k + 1) * 2)}`;
        steel += `<rect x="${f(lx - 4.4)}" y="${f(sy0 - 2)}" width="8.8" height="2" rx="0.6" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.hairline}"/>` +
            `<path d="${spring}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>` +
            `<path d="${spring}" fill="none" stroke="${J.tin[300]}" stroke-width="0.8" stroke-linejoin="round"/>`;

        // ---- лунки: стаканчик из банки, крашен, значок, два гвоздика ----
        let cups = '';
        this.PACH_CUPS.forEach((c, i) => {
            const x = c.x - C.w / 2, y = c.y, w = C.w, h = C.h, col = this.pachCupColor(c.key);
            const body = `M${x} ${y} L${x} ${y + h - 5} Q${x} ${y + h} ${x + 5} ${y + h} L${x + w - 5} ${y + h} Q${x + w} ${y + h} ${x + w} ${y + h - 5} L${x + w} ${y} Z`;
            cups += `<path d="${body}" fill="${col}" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
            // рёбра жести банки — две бледные полосы
            cups += `<path d="M${x + 1} ${f(y + h * 0.42)} H${x + w - 1} M${x + 1} ${f(y + h * 0.78)} H${x + w - 1}" stroke="${ink}" stroke-width="0.4" opacity="0.18"/>`;
            cups += `<g transform="translate(${c.x} ${f(y + h / 2 + 0.6)})">${this.pachIcon(c.key)}</g>`;
            // закатанный край сверху — вход шарика
            const lip = `M${x - 1} ${y + 0.4} H${x + w + 1}`;
            cups += `<path d="${lip}" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/>` +
                `<path d="${lip}" stroke="${J.tin[100]}" stroke-width="1.4" stroke-linecap="round"/>` + this.rodH(lip, 2.4, 1.2);
        });

        // ---- гвозди: шляпки, как на колесе ----
        let nails = '';
        this.pachNails().forEach(([x, y]) => {
            // светлая шляпка: тёмная на кремовом читалась дыркой, а не гвоздём
            nails += `<circle cx="${f(x)}" cy="${f(y)}" r="1.7" fill="${J.tin[100]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${f(x - 0.45)}" cy="${f(y - 0.45)}" r="0.55" class="hl" fill="${PALETTE.greedJunk.reel.jar.glassHi}"/>` + this.domeH(x, y, 1.7, 1.4);
        });

        // ---- уголки ящика и саморезы стекла ----
        let corners = '';
        [[P.x0, P.y0, 1, 1], [P.x1, P.y0, -1, 1], [P.x0, P.y1, 1, -1], [P.x1, P.y1, -1, -1]].forEach(([x, y, sx, sy], i) => {
            const L = 13, w = 5;
            const d = `M${x} ${y} h${sx * L} v${sy * w} h${-sx * (L - w)} v${sy * (L - w)} h${-sx * w} Z`;
            corners += `<path d="${d}" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>` +
                this.bolt(x + sx * (L - 3), y + sy * 2.5, 1.2) + this.bolt(x + sx * 2.5, y + sy * (L - 3), 1.2);
        });
        // саморезы стекла с шайбами: в рамку по углам поля
        [[fx0 + 1, fy0 + 1], [fx1 - 1, fy0 + 1], [fx0 + 1, fy1 - 1], [fx1 - 1, fy1 - 1]].forEach(([x, y]) => {
            corners += `<circle cx="${x}" cy="${y}" r="2.6" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.hairline}"/>` + this.bolt(x, y, 1.5);
        });

        // ---- кнопка: красный колпак в жестяном ободе ----
        const B = P.button;
        let button = `<circle cx="${B.x}" cy="${B.y}" r="${B.r + 2.2}" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            `<circle cx="${B.x}" cy="${B.y}" r="${B.r}" fill="${Pp.button}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            `<circle cx="${B.x}" cy="${f(B.y + 1.4)}" r="${f(B.r - 1.6)}" fill="${Pp.buttonLo}" opacity="0.45"/>` +
            `<ellipse cx="${f(B.x - 2.4)}" cy="${f(B.y - 2.6)}" rx="2.6" ry="1.6" class="hl" fill="${Pp.buttonHi}" opacity="0.8" transform="rotate(-30 ${f(B.x - 2.4)} ${f(B.y - 2.6)})"/>` +
            this.domeH(B.x, B.y, B.r, 3.6);

        return { frame, field, drain, steel, cups, nails, corners, button };
    },

    // Стекло: мутное оргстекло поверх поля — лёгкий тон, блики полосами
    // сверху-слева, царапины, трещина из угла, заклеенная малярным скотчем.
    // Рисуется готовым видом (baked) поверх освещённого короба: у стекла нет
    // объёма, а блик на нём от наклона не ходит — он и так нарисован светом.
    pachGlass() {
        const J = PALETTE.greedJunk, G = J.reel.jar, P = this.PACH, f = this.f, rnd = this.rng(4403);
        const x0 = P.x0 + P.wall - 2, x1 = P.x1 - P.wall + 2, y0 = P.y0 + P.top - 2, y1 = P.y1 - P.panel + 2;
        let out = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${G.glass}" opacity="0.07"/>`;
        // блики: две косые полосы от верхнего левого угла
        const band = (u, w, op) => {
            const a = x0 + (x1 - x0) * u, b = a + w;
            return `<path d="M${f(a)} ${y0} L${f(b)} ${y0} L${f(b - 70)} ${f(y0 + 120)} L${f(a - 70)} ${f(y0 + 120)} Z" fill="${G.glassHi}" opacity="${op}"/>`;
        };
        out += `<clipPath id="gj-pg"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath><g clip-path="url(#gj-pg)">` +
            band(0.22, 14, 0.13) + band(0.42, 5, 0.1) + band(0.86, 9, 0.07);
        // царапины: тонкие светлые штрихи
        for (let k = 0; k < 9; k++) {
            const x = x0 + 6 + rnd() * (x1 - x0 - 12), y = y0 + 10 + rnd() * (y1 - y0 - 20), L = 5 + rnd() * 14, a = rnd() * Math.PI;
            out += `<path d="M${f(x)} ${f(y)} l${f(Math.cos(a) * L)} ${f(Math.sin(a) * L)}" stroke="${G.glassHi}" stroke-width="0.4" opacity="0.4"/>`;
        }
        // трещина из правого верхнего угла и скотч поперёк
        const cr = [[x1, y0 + 14], [x1 - 9, y0 + 21], [x1 - 13, y0 + 33], [x1 - 22, y0 + 40]];
        const crD = 'M' + cr.map(p => `${f(p[0])} ${f(p[1])}`).join(' L');
        out += `<path d="${crD}" fill="none" stroke="${PALETTE.ink}" stroke-width="0.8" opacity="0.55"/>` +
            `<path d="${crD}" fill="none" stroke="${G.glassHi}" stroke-width="0.4" opacity="0.7" transform="translate(-0.6 -0.4)"/>`;
        out += '</g>';
        const tx = x1 - 12, ty = y0 + 27;
        out += `<g transform="rotate(-38 ${tx} ${ty})">` +
            `<path d="M${tx - 14} ${ty - 4} L${tx + 13} ${ty - 4.4} L${tx + 14} ${ty - 2} L${tx + 13.2} ${ty + 0.6} L${tx + 14.2} ${ty + 3.6} L${tx - 13.6} ${ty + 4} L${tx - 14.6} ${ty + 1} Z" fill="${G.tape}" opacity="0.92" stroke="${G.tapeEdge}" stroke-width="0.4"/>` +
            `<rect x="${tx - 13}" y="${ty - 4}" width="26" height="1.2" fill="${G.tapeLo}" opacity="0.35"/></g>`;
        return out;
    }
});
