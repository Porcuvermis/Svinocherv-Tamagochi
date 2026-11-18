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
        // Кнопка — по центру панели (игрок, 18.11; была справа, x 281 — над
        // лампой рычага сдвигали левее) — и по высоте посередине видимой панели.
        button: { x: 260, y: 220.5, r: 7.5 },
        nailUp: 7                           // гвоздь торчит над краской
    },
    // Лунки: ряды по 2–3 вперемешку (центр верха лунки) и что в них. Ряды
    // разведены по высоте и сдвинуты через один — шарик, падающий прямо,
    // не проходит одну колонку насквозь. Ключи — как в конфиге пачинко.
    // Крайние в рядах по три — вплотную к стенкам: щель между банкой и
    // стенкой уже шарика его зажимала. Верхний ряд опущен под дугу на
    // несколько рядов гвоздей — иначе он ловил половину шариков сразу с дуги.
    PACH_CUPS: [
        { key: 'wrath', x: 241, y: 62 }, { key: 'glut', x: 267, y: 62 },
        { key: 'lust', x: 223, y: 104 }, { key: 'gold1', x: 253.75, y: 104 }, { key: 'sloth', x: 284.5, y: 104 },
        { key: 'envy', x: 241, y: 144 }, { key: 'pride', x: 267, y: 144 },
        { key: 'greed', x: 223, y: 178 }, { key: 'gold1', x: 284.5, y: 178 }
    ],

    // Короб на аппарате крупнее своего рисунка (решение игрока: до рамки
    // сверху и справа — справа от него была пустая полоса). Рисунок, лунки,
    // физика шарика и запас запусков живут в прежних координатах короба, а
    // на аппарат он ставится подобием: угол (ax, ay) — в (x, y), масштаб s.
    // Всё «пространства короба» (щит, полка, рельсы, разметка, холсты на
    // свету, кнопка) — через pachPt / pachRect / pachG; обратно — pachInv.
    PACH_AT: { ax: 206, ay: -38, x: 206, y: -55, s: 1.205 },
    pachPt(x, y) {
        const A = this.PACH_AT;
        return [A.x + (x - A.ax) * A.s, A.y + (y - A.ay) * A.s];
    },
    pachRect(B) {
        const [x, y] = this.pachPt(B.x, B.y), s = this.PACH_AT.s;
        return { x, y, w: B.w * s, h: B.h * s };
    },
    pachInv(x, y) {
        const A = this.PACH_AT;
        return [A.ax + (x - A.x) / A.s, A.ay + (y - A.y) / A.s];
    },
    // штуцер гофры на бруске розетки короба — там, где брусок на аппарате
    pachPort() {
        const P = this.PORTS.brick, [x, y] = this.pachPt(P.x, P.y);
        return { x, y, d: P.d };
    },
    pachG(inner) {
        const A = this.PACH_AT, f = this.f;
        return `<g transform="matrix(${A.s} 0 0 ${A.s} ${f(A.x - A.ax * A.s)} ${f(A.y - A.ay * A.s)})">${inner}</g>`;
    },

    // Щит за коробом — как у колеса (wheelShield): сосновые доски на
    // саморезах прячут правую половину ящика с рельсами, подвесом, розеткой и
    // проводами (решение игрока). Тоньше щита колеса (8 против 15): на нём
    // стоит полка с коробом, и полке нужен запас карты высот (потолок — 20).
    PACH_SHIELD: { x: 208, y: 36, w: 94, h: 236, boards: 3 },
    pachShield() {
        const J = PALETTE.greedJunk, Sh = this.PACH_SHIELD;
        let out = `<rect x="${Sh.x + 2}" y="${Sh.y + 3}" width="${Sh.w}" height="${Sh.h}" class="fx" fill="${J.hole}" opacity="0.35"/>`;
        out += this.planks(Sh.x, Sh.y, Sh.w, Sh.h, Sh.boards, 4420, 'v', 0, 'pine');
        const bw = Sh.w / Sh.boards;
        for (let i = 0; i < Sh.boards; i++) {
            const x = Sh.x + bw * (i + 0.5);
            out += this.bolt(x - 5, Sh.y + 6, 1.8) + this.bolt(x + 5, Sh.y + 6, 1.8) +
                this.bolt(x - 5, Sh.y + Sh.h - 6, 1.8) + this.bolt(x + 5, Sh.y + Sh.h - 6, 1.8);
        }
        return this.T(8, 'pine', out);
    },

    // Кабель короба: из ввода на дне вниз, перед полкой, в просверленную
    // дыру щита с резиновой втулкой — к розетке за щитом. Розетка спрятана
    // (короб и щит её закрывают), а без кабеля короб был ни к чему не
    // подключён. Посередине полки — между её косынками.
    // Короб на аппарате крупнее (PACH_AT), и дыра (y 263) уехала за верх
    // табло: кабель прямо вниз и уходит за табло, дыры не видно. Было:
    // кабель с изгибом к дыре, у верха табло он загибался крюком и обрывался.
    PACH_CABLE: { x: 270, hole: { x: 270.4, y: 264 } },
    pachCable() {
        const J = PALETTE.greedJunk, f = this.f, P = this.PACH, C = this.PACH_CABLE, H = C.hole;
        const d = this.smooth([[C.x, P.y1 + 1], [C.x + 0.5, P.y1 + 10], [C.x + 0.3, P.y1 + 20], [H.x, H.y]]);
        let cable = `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="4.6" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="2.8" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" class="hl" stroke="${J.tin[500]}" stroke-width="0.7" stroke-linecap="round" opacity="0.8" transform="translate(-0.8 -0.3)"/>` +
            this.rodH(d, 4.6);
        // втулка в щите: резиновое кольцо поверх кабеля — кабель уходит внутрь
        const ring = `<circle cx="${H.x}" cy="${H.y}" r="3.6" class="pit" fill="${J.hole}"/>` +
            `<circle cx="${H.x}" cy="${H.y}" r="3.3" fill="none" stroke="${PALETTE.ink}" stroke-width="2.6"/>` +
            `<circle cx="${H.x}" cy="${H.y}" r="3.3" fill="none" stroke="${J.reel.wheel.rubber}" stroke-width="1.6"/>`;
        // кабель над полкой (её кромка — 18 над стенкой ящика)
        return this.T(19, 'rubber', cable) + this.T(8.6, 'rubber', ring);
    },

    // на аппарате: куплено — или включено в отладке (🐞 → «Пачинко»)
    pachinkoShown() {
        if (this._growAs === 'pachinko') return true;
        if (typeof Backend !== 'undefined' && Backend.greedLevel && Backend.greedLevel('pachinko') > 0) return true;
        try { return localStorage.getItem('gj-pachinko') === '1'; } catch (e) { return false; }
    },

    // Гвозди: шахматкой с шагом ~12.6 по полю под дугой, мимо лунок,
    // перегородки и стенок. Ряды чуть гуляют — прибивали на глаз.
    // От стен, дуги и банок — просвет не уже шарика с запасом (gap): в щель
    // уже шарика его зажимало, и он висел там до конца (физика пачинко,
    // greed-junk-pachinko-sim.js: так застревала половина шариков).
    pachNails() {
        if (this.PACH_TIDY) return this.pachNailsTidy();
        const P = this.PACH, A = P.arc, C = P.cup, rnd = this.rng(4401), pts = [];
        const gap = 2 * 2.5 + 1.7 + 0.9;      // диаметр шарика + шляпка + запас
        // пристенные гвозди (ниже) и крайние ряды поля — на полный шарик
        // друг от друга: в развилке уже шарика он ложился
        const wl = P.x0 + P.wall + 1.9, wr = P.sep - 1 - 1.9;
        const left = wl + 1.7 + gap, right = wr - 1.7 - gap;
        for (let row = 0, y = 4; y < P.drain - 6; row++, y += 11) {
            for (let x = left + (row % 2 ? 6.3 : 0); x <= right; x += 12.6) {
                const px = x + (rnd() - 0.5) * 1.2, py = y + (rnd() - 0.5) * 1.2;
                // под дугой
                if (py < A.cy && Math.hypot(px - A.cx, py - A.cy) > A.r - 1.2 - gap) continue;
                if (px < left - 0.7 || px > right + 0.7) continue;
                // мимо лунок, с просветом со всех сторон
                if (this.PACH_CUPS.some(c => px > c.x - C.w / 2 - gap && px < c.x + C.w / 2 + gap && py > c.y - gap && py < c.y + C.h + gap)) continue;
                pts.push([px, py]);
            }
        }
        // Гвозди вплотную к стенкам — без щели, зажать шарик им нечем: падая
        // вдоль стены по коридору, он отбивается в поле. Без них шарик со
        // дуги стекал по левой стенке прямо в левую лунку, почти не задев
        // гвоздей (70% запусков — в одну и ту же).
        // справа — ниже торца перегородки: под ним шарик балансировал на шляпке
        for (let y = A.cy + 4, k = 0; y < P.drain - 8; y += 11, k++) {
            const x = k % 2 ? wr : wl;
            if (x === wr && y < A.cy + 22) continue;
            if (this.PACH_CUPS.some(c => x > c.x - C.w / 2 - gap && x < c.x + C.w / 2 + gap && y > c.y - gap && y < c.y + C.h + gap)) continue;
            pts.push([x, y + (rnd() - 0.5) * 1.2]);
        }
        return pts;
    },

    // Гвозди версии 2 (аппарат-люкс, greed-lux*.js): та же шахматка с тем
    // же шагом и теми же просветами, но ровная и зеркальная относительно
    // середины поля (между левой стенкой и перегородкой — там же середина
    // лунок). Игрок (18.11): «внутренности съехали, не отцентровано» — у
    // гаражных гвоздей середина ~250,4, у лунок 253,75, у арки 259,5, плюс
    // разброс «на глаз»: в ар-деко это читается как брак. Под куполом поля
    // (machine.py: купол — полукруг над полем, середина та же) гвоздь
    // ставится, только если стоит и его зеркальная пара. Исход шарика решён
    // заранее (запас запусков пересчитывается под эту раскладку,
    // pachPoolId), так что игра от раскладки не меняется.
    // Включает GreedLux.mount (PACH_TIDY), снимает unmount.
    pachTidy(on) {
        if (!!this.PACH_TIDY === !!on) return;
        this.PACH_TIDY = !!on; this._pachWorld = null;
    },
    pachNailsTidy() {
        const P = this.PACH, A = P.arc, C = P.cup, pts = [];
        const gap = 2 * 2.5 + 1.7 + 0.9;
        const wl = P.x0 + P.wall + 1.9, fc = (P.x0 + P.wall + P.sep) / 2, wr = 2 * fc - wl;
        const left = wl + 1.7 + gap, right = 2 * fc - left, rd = (P.sep - P.x0 - P.wall) / 2;
        const free = (x, y) => (y >= A.cy || (Math.hypot(x - A.cx, y - A.cy) <= A.r - 1.2 - gap && Math.hypot(x - fc, y - A.cy) <= rd - 3.2)) &&
            !this.PACH_CUPS.some(c => x > c.x - C.w / 2 - gap && x < c.x + C.w / 2 + gap && y > c.y - gap && y < c.y + C.h + gap);
        for (let row = 0, y = 4; y < P.drain - 6; row++, y += 11) {
            const odd = row % 2;
            for (let k = -6; k <= 6; k++) {
                const x = fc + (odd ? 6.3 : 0) + k * 12.6;
                if (x < left - 0.01 || x > right + 0.01) continue;
                if (free(x, y) && free(2 * fc - x, y)) pts.push([x, y]);
            }
            // у стенок — парой, в рядах, где шахматка отступает от стен
            // (под торцом перегородки — нет: шарик балансировал на шляпке)
            if (odd && y >= A.cy + 22 && y < P.drain - 8 && free(wl, y) && free(wr, y)) pts.push([wl, y], [wr, y]);
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
        // монета — на кремовой бумаге: жестяная этикетка на жестяной банке
        // сливалась с ней
        if (key === 'gold1') return PALETTE.greedJunk.paint.cream;
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

        // ---- ящик: старый тёмный металл, низ-панель ----
        // Было: доски от комода и красное поле за дугой — красный кожух
        // рядом с красно-кремовым колесом сливался с ним в одно пятно, а поле
        // не отделялось от короба. Решение игрока: кожух — старый тёмный
        // металл; светится только поле за стеклом (docs/plan/30-greed-light.md).
        const Rw = J.raw;
        let frame = `<rect x="${P.x0}" y="${P.y0}" width="${P.x1 - P.x0}" height="${P.y1 - P.y0}" rx="1.5" fill="${Rw.lo}"/>`;
        // швы листов: стенки, верх и низ — отдельные полосы
        frame += `<path d="M${fx0} ${P.y0} V${P.y1} M${fx1} ${P.y0} V${P.y1} M${fx0} ${fy1} H${fx1}" fill="none" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}"/>`;
        // потёртости до светлого металла и царапины — по кромкам, где хватали
        for (let i = 0; i < 26; i++) {
            const onWall = i % 2, x = onWall ? (rnd() < 0.5 ? P.x0 + rnd() * P.wall : fx1 + rnd() * P.wall) : fx0 + rnd() * (fx1 - fx0);
            const y = onWall ? P.y0 + rnd() * (P.y1 - P.y0) : (rnd() < 0.5 ? P.y0 + rnd() * P.top : fy1 + rnd() * P.panel);
            const a = onWall ? Math.PI / 2 + (rnd() - 0.5) * 0.7 : (rnd() - 0.5) * 0.7, l = 3 + rnd() * 7;
            frame += `<path d="M${f(x)} ${f(y)} l${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}" stroke="${Rw.hi}" stroke-width="${STROKE.hairline}" stroke-linecap="round" opacity="${f(0.3 + rnd() * 0.4)}"/>`;
        }
        // ржавые пятна у углов
        [[P.x0 + 2, P.y1 - 8], [P.x1 - 6, P.y0 + 3], [P.x0 + 3, P.y0 + 30]].forEach(([x, y]) => {
            frame += `<ellipse cx="${f(x + 2)}" cy="${f(y + 2)}" rx="${f(2 + rnd() * 2)}" ry="${f(1.5 + rnd() * 2)}" fill="${J.rust[700]}" opacity="0.55"/>`;
        });
        frame += `<rect x="${P.x0}" y="${P.y0}" width="${P.x1 - P.x0}" height="${P.y1 - P.y0}" rx="1.5" fill="none" stroke="${ink}" stroke-width="${STROKE.contour}"/>`;
        frame += `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" fill="none" stroke="${ink}" stroke-width="${STROKE.structure}"/>`;

        // ---- поле: фанера, крашенная кистью; за дугой — металл кожуха ----
        let field = `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" fill="${Rw.base}"/>`;
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

        // ---- затенение углов: куда свет лампы не доходит ----
        // Вдоль стенок ящика — мягкая темнота в самом цвете поля: от
        // направления света она не зависит, поэтому не шейдером, а один раз.
        // Без неё поле читалось наклейкой поверх ящика — тень стенок узкая
        // (5–7 единиц при свете под 45°), а в углах светло, как посередине.
        // Под дугой, у перегородки и под лунками запечённой тени нет (игрок,
        // 18.11): их тень даёт шейдер по высоте, а нарисованная в краске
        // поля появлялась при сборке раньше самих деталей.
        const ao = `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" fill="none" stroke="${J.hole}" stroke-width="7"/>`;
        field += `<defs><filter id="gj-pao" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4"/></filter>` +
            `<clipPath id="gj-paoc"><rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}"/></clipPath></defs>` +
            `<g clip-path="url(#gj-paoc)"><g filter="url(#gj-pao)" opacity="0.4">${ao}</g></g>`;

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
        // клапан наверху дорожки: жестяной язычок на заклёпке — шарик
        // выпускает на дугу, назад в дорожку не пускает (физика — PACH_PHYS)
        const vy = A.cy + 12 - 2.4, vx0 = P.sep + 1, vx1 = A.cx + A.r - 1;
        steel += `<path d="M${f(vx0)} ${f(vy + 1.6)} L${f(vx1)} ${f(vy - 0.6)} L${f(vx1)} ${f(vy + 1.2)} L${f(vx0)} ${f(vy + 3)} Z" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<circle cx="${f(vx1 - 1.2)}" cy="${f(vy + 0.4)}" r="0.8" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.hairline}"/>`;
        // пружина толкателя — своей деталью (pachSpring): она сжимается

        // ---- лунки: консервные банки без крышки, прикручены к полю ----
        // Игрок (18.11): прежние — плоские крашеные коробочки с жирной
        // полосой бортика и огромным значком, «некрасивая форма и
        // исполнение». Теперь банка: жестяной цилиндр (объём — картой высот,
        // свет даёт шейдер), дно — дугой, сверху — зев с внутренней стенкой и
        // закатанный край; цвет греха — бумажная этикетка вокруг банки, жесть
        // видна сверху и снизу; значок — напечатан на этикетке, мельче.
        // Ловит банка по-прежнему прямоугольником 18×13 (pachWorld) — физика
        // и запас запусков не меняются.
        let cups = '';
        const ry = 1.9;                                   // овал горловины и дна: смотрим чуть сверху
        this.PACH_CUPS.forEach((c) => {
            const x0 = c.x - C.w / 2, x1 = c.x + C.w / 2, w = C.w, rx = w / 2, yt = c.y + 0.4, yb = c.y + C.h - ry, col = this.pachCupColor(c.key);
            const arcDn = (y) => `A${rx} ${ry} 0 0 0 ${f(x1)} ${f(y)}`;      // перёд овала: слева направо, вниз
            const body = `M${f(x0)} ${f(yt)} L${f(x0)} ${f(yb)} ${arcDn(yb)} L${f(x1)} ${f(yt)} A${rx} ${ry} 0 0 1 ${f(x0)} ${f(yt)} Z`;
            const band = (y0, y1) => `M${f(x0)} ${f(y0)} L${f(x0)} ${f(y1)} ${arcDn(y1)} L${f(x1)} ${f(y0)} A${rx} ${ry} 0 0 1 ${f(x0)} ${f(y0)} Z`;
            const clip = this.gid('cc');
            let o = `<defs><clipPath id="${clip}"><path d="${body}"/></clipPath></defs>`;
            // жесть банки
            o += this.T(6, 'steel', `<path d="${body}" fill="${J.tin[300]}"/>`);
            // этикетка: между рёбрами, цвет греха
            const l0 = yt + 3.1, l1 = yb - 1.6;
            o += `<path d="${band(l0, l1)}" fill="${col}"/>` +
                `<path d="M${f(x0)} ${f(l0)} ${arcDn(l0)} M${f(x0)} ${f(l1)} ${arcDn(l1)}" fill="none" stroke="${ink}" stroke-width="0.45" opacity="0.55"/>`;
            // рёбра жести над и под этикеткой — валики по кривизне банки
            const rib = (y) => `M${f(x0 + 0.4)} ${f(y)} A${rx - 0.4} ${ry} 0 0 0 ${f(x1 - 0.4)} ${f(y)}`;
            o += this.T(6, 'steel', `<path d="${rib(yt + 1.7)} ${rib(yb - 0.5)}" fill="none" stroke="${J.tin[500]}" stroke-width="0.55"/>` + this.rodH(rib(yt + 1.7), 0.9, 0.35) + this.rodH(rib(yb - 0.5), 0.9, 0.35));
            // значок — печать на этикетке
            o += `<g transform="translate(${f(c.x)} ${f((l0 + l1) / 2 + ry * 0.55)}) scale(0.68)">${this.pachIcon(c.key)}</g>`;
            // объём: цилиндр с осью по вертикали, по форме банки
            o += `<g clip-path="url(#${clip})">${this.cylG(this.gid('cy'), x0, yt - ry, w, yb - yt + ry * 2 + 1, 2.5, 3.5)}</g>`;
            // контур
            o += `<path d="${body}" fill="none" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
            // зев: внутренняя стенка — жесть в тени, к переду темнее
            o += `<ellipse cx="${f(c.x)}" cy="${f(yt)}" rx="${f(rx - 0.5)}" ry="${f(ry - 0.45)}" class="pit" fill="${J.tin[900]}"/>` +
                `<path d="M${f(x0 + 0.9)} ${f(yt)} A${rx - 0.9} ${ry - 0.6} 0 0 1 ${f(x1 - 0.9)} ${f(yt)}" class="pit" fill="${J.tin[700]}"/>`;
            // закатанный край — жестяной валик по всей горловине
            const lip = `M${f(x0)} ${f(yt)} A${rx} ${ry} 0 1 1 ${f(x1)} ${f(yt)} A${rx} ${ry} 0 1 1 ${f(x0)} ${f(yt)} Z`;
            o += this.T(6, 'steel', `<path d="${lip}" fill="none" stroke="${ink}" stroke-width="1.9"/>` +
                `<path d="${lip}" fill="none" stroke="${J.tin[100]}" stroke-width="0.9"/>` + this.rodH(lip, 1.5, 0.9));
            cups += o;
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

        // ---- кабельный ввод на дне короба: стальная гайка, из неё кабель ----
        const Cb = this.PACH_CABLE;
        corners += `<path d="M${Cb.x - 3.4} ${P.y1 - 1} L${Cb.x + 3.4} ${P.y1 - 1} L${Cb.x + 2.6} ${P.y1 + 2.4} L${Cb.x - 2.6} ${P.y1 + 2.4} Z" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<line x1="${Cb.x - 2.8}" y1="${P.y1 + 0.7}" x2="${Cb.x + 2.8}" y2="${P.y1 + 0.7}" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;

        // ---- кнопка: красный колпак в жестяном ободе ----
        const B = P.button;
        let button = `<circle cx="${B.x}" cy="${B.y}" r="${B.r + 2.2}" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            `<circle cx="${B.x}" cy="${B.y}" r="${B.r}" fill="${Pp.button}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            `<circle cx="${B.x}" cy="${f(B.y + 1.4)}" r="${f(B.r - 1.6)}" fill="${Pp.buttonLo}" opacity="0.45"/>` +
            `<ellipse cx="${f(B.x - 2.4)}" cy="${f(B.y - 2.6)}" rx="2.6" ry="1.6" class="hl" fill="${Pp.buttonHi}" opacity="0.8" transform="rotate(-30 ${f(B.x - 2.4)} ${f(B.y - 2.6)})"/>` +
            this.domeH(B.x, B.y, B.r, 3.6);

        return { frame, field, drain, steel, cups, nails, corners, button };
    },

    // Пружина толкателя на дне дорожки: площадка, на которую ложится шарик,
    // и витки до дна. k — сжатие 0..1: площадка опускается на SPRING_DROP.
    // Своей деталью, а не в рисунке короба: на выстреле она распрямляется
    // (greed-junk-lit-pachinko.js), было — нарисована намертво.
    SPRING_DROP: 5,
    pachSpringBox() {
        const P = this.PACH, fx1 = P.x1 - P.wall, fy1 = P.y1 - P.panel, lx = (P.sep + 2 + fx1) / 2;
        return { x: lx - 6, y: fy1 - 15, w: 12, h: 15 };
    },
    pachSpring(k) {
        const J = PALETTE.greedJunk, ink = PALETTE.ink, f = this.f, B = this.pachSpringBox(), P = this.PACH;
        const lx = B.x + 6, fy1 = P.y1 - P.panel, sy0 = fy1 - 12 + k * this.SPRING_DROP, n = 6, step = (fy1 - sy0) / n;
        let spring = `M${f(lx - 3.4)} ${f(sy0)}`;
        for (let i = 0; i < n; i++) spring += ` L${f(lx + (i % 2 ? -3.4 : 3.4))} ${f(sy0 + (i + 1) * step)}`;
        return `<path d="${spring}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>` +
            `<path d="${spring}" fill="none" stroke="${J.tin[300]}" stroke-width="0.8" stroke-linejoin="round"/>` +
            this.rodH(spring, 1.6, 0.8) +
            `<rect x="${f(lx - 4.4)}" y="${f(sy0 - 2)}" width="8.8" height="2" rx="0.6" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.hairline}"/>`;
    },

    // Стекло: мутное оргстекло поверх поля — лёгкий тон, блики полосами
    // сверху-слева, царапины, трещина из угла, заклеенная малярным скотчем.
    // Рисуется готовым видом (baked) поверх освещённого короба: у стекла нет
    // объёма, а блик на нём от наклона не ходит — он и так нарисован светом.
    // лист стекла: поверх поля, заходит на рамку на 2
    pachGlassRect() {
        const P = this.PACH;
        return { x0: P.x0 + P.wall - 2, x1: P.x1 - P.wall + 2, y0: P.y0 + P.top - 2, y1: P.y1 - P.panel + 2 };
    },
    // Блики стекла — отражение лампы: косые полосы, своим слоем больше листа
    // на m со всех сторон. На свету слой сдвигается вслед за светом
    // (greed-junk-lit-pachinko.js, pachGlareAt) — отражение ползёт по стеклу
    // при наклоне телефона. Было: нарисованы на стекле намертво, а всё
    // вокруг от наклона меняло свет.
    pachGlare(m) {
        const G = PALETTE.greedJunk.reel.jar, f = this.f, R = this.pachGlassRect();
        const x0 = R.x0 - m, x1 = R.x1 + m, y0 = R.y0 - m, y1 = R.y1 + m, H = y1 - y0, run = H * 0.58;
        // полоса от верхнего края до нижнего, наклон — как был (70 на 120)
        const band = (u, w, op) => {
            const a = R.x0 + (R.x1 - R.x0) * u + (R.y0 - y0) * 0.58, b = a + w;
            return `<path d="M${f(a)} ${y0} L${f(b)} ${y0} L${f(b - run)} ${y1} L${f(a - run)} ${y1} Z" fill="${G.glassHi}" opacity="${op}"/>`;
        };
        // к низу полосы гаснут: лампа отражается в верхней части листа
        return `<defs><linearGradient id="gj-pgf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${G.glassHi}"/>` +
            `<stop offset="${f((R.y0 - y0 + 130) / H)}" stop-color="${G.glassHi}" stop-opacity="0"/></linearGradient>` +
            `<mask id="gj-pgm"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${H}" fill="url(#gj-pgf)"/></mask></defs>` +
            `<g mask="url(#gj-pgm)">` + band(0.22, 14, 0.13) + band(0.42, 5, 0.1) + band(0.86, 9, 0.07) + '</g>';
    },
    pachGlass() {
        const J = PALETTE.greedJunk, G = J.reel.jar, P = this.PACH, f = this.f, rnd = this.rng(4403);
        const { x0, x1, y0, y1 } = this.pachGlassRect();
        let out = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${G.glass}" opacity="0.07"/>`;
        out += `<clipPath id="gj-pg"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath><g clip-path="url(#gj-pg)">`;
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
