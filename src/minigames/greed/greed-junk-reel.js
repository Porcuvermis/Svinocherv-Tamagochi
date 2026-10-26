// ================= АППАРАТ АЛЧНОСТИ: ЛЕНТА БАРАБАНОВ =================
// Символы, отпечатанные на бумажной ленте барабана: тушевой контур,
// тусклая краска, сдвинутая относительно контура, как при старой печати.
// Не эмодзи — свой рисунок в стиле аппарата. Ячейка ленты — CELL (ширина
// окна барабана × треть его высоты); символ рисуется в ячейке с центром
// (cx, cy).
Object.assign(GreedJunk, {
    CELL: { w: 56, h: 32 },
    // сдвиг краски относительно контура — «приводка» старой печати
    MISPRINT: { x: 0.35, y: -0.25 },

    // Трубка по средней линии pts с толщиной w(t), t 0..1 вдоль: контур
    // тела (червяк). Возвращает замкнутый путь.
    // caps — скруглить оба конца полукругом (иначе концы обрублены).
    tube(pts, w, caps) {
        const f = this.f, n = pts.length, L = [], R = [], N = [];
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
            const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
            const nx = -dy / d, ny = dx / d, h = w(i / (n - 1)) / 2;
            N.push([nx, ny, h]);
            L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]);
            R.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
        }
        const P = (q) => `${f(q[0])} ${f(q[1])}`;
        if (!caps) return 'M' + L.map(P).join(' L') + ' L' + R.reverse().map(P).join(' L') + ' Z';
        const hEnd = N[n - 1][2], hStart = N[0][2];
        return 'M' + L.map(P).join(' L') +
            ` A${f(hEnd)} ${f(hEnd)} 0 0 0 ${P(R[n - 1])}` +
            ' L' + R.slice().reverse().map(P).join(' L') +
            ` A${f(hStart)} ${f(hStart)} 0 0 0 ${P(L[0])} Z`;
    },
    // точки кривой Катмулла — Рома через опорные, n на отрезок
    spline(ctrl, n) {
        const out = [];
        for (let i = 0; i < ctrl.length - 1; i++) {
            const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
            for (let k = 0; k < n; k++) {
                const t = k / n, t2 = t * t, t3 = t2 * t;
                out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
            }
        }
        out.push(ctrl[ctrl.length - 1]);
        return out;
    },

    // ---------- ЧЕРВЯК ----------
    // Дождевой червь (по референсам игрока): длинное тонкое тело лежачей S,
    // хвост сходит на острие, голова сужается и скругляется. Кольца
    // сегментов — очень частые, поперёк всего тела. Ближе к голове гладкий
    // поясок без колец, толще и светлее тела. Спина темнее, винного
    // оттенка, брюхо светлее, по спине — влажный блик. Лица нет.
    // Было: пастельная колбаса с редкими короткими кольцами.
    reelWorm(cx, cy) {
        const W = PALETTE.greedJunk.reel.worm, f = this.f, M = this.MISPRINT;
        // Форма — лежачая S с подвёрнутыми концами (набросок игрока): хвост
        // от середины уходит влево по верху, огибает левый край, по низу
        // возвращается к середине, наискось поднимается и так же огибает
        // правый край. Опорные точки симметричны относительно центра
        // (p ↔ −p) — изгибы одинаковые.
        const ctrl = [[-5, -7], [-14, -9], [-20.5, -6], [-22, 0], [-19, 6], [-12, 8], [-5, 6], [0, 0],
            [5, -6], [12, -8], [19, -6], [22, 0], [20.5, 6], [14, 9], [5, 7]]
            .map(q => [cx + q[0], cy + q[1]]);
        const pts = this.spline(ctrl, 8), n = pts.length;
        // поясок — между долями длины B0..B1 от хвоста; там тело толще
        const B0 = 0.8, B1 = 0.87;
        const w = (t) => {
            const tail = Math.min(1, t / 0.18), head = Math.min(1, (1 - t) / 0.08);
            let v = 1.2 + 3.6 * Math.sin(tail * Math.PI / 2) * (0.55 + 0.45 * Math.sin(head * Math.PI / 2));
            if (t > B0 && t < B1) v += 0.9 * Math.sin((t - B0) / (B1 - B0) * Math.PI);
            return v;
        };
        const body = this.tube(pts, w, true);
        const shift = `transform="translate(${M.x} ${M.y})"`;
        const id = 'gj-rw' + Math.round(cx * 10 + cy);
        // нормаль и полутолщина в точке i
        const nrm = (i) => {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
            return [-dy / d, dx / d, w(i / (n - 1)) / 2];
        };
        let out = `<clipPath id="${id}"><path d="${body}" ${shift}/></clipPath>`;
        out += `<path d="${body}" fill="${W.base}" ${shift}/>`;
        // спина (одна сторона тела) темнее, брюхо светлее, блик по спине
        const side = (k, dw) => pts.map((q, i) => { const N = nrm(i); return `${f(q[0] + N[0] * N[2] * k + M.x)} ${f(q[1] + N[1] * N[2] * k + M.y)}`; }).join(' L');
        out += `<g clip-path="url(#${id})">` +
            `<path d="M${side(0.55)}" fill="none" stroke="${W.back}" stroke-width="2.6" stroke-linecap="round" opacity="0.85"/>` +
            `<path d="M${side(-0.6)}" fill="none" stroke="${W.hi}" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>` +
            `<path d="M${side(0.2)}" fill="none" stroke="${W.hi}" stroke-width="0.6" stroke-linecap="round" opacity="0.9"/>`;
        // поясок: гладкая светлая полоса поверх
        const i0 = Math.round(B0 * (n - 1)), i1 = Math.round(B1 * (n - 1));
        out += `<path d="${this.tube(pts.slice(i0, i1 + 1), (t) => w(B0 + t * (B1 - B0)) + 0.3)}" fill="${W.belt}" ${shift}/>`;
        // кольца: через каждые 1.3 единицы длины, поперёк всего тела
        let len = 0, next = 1.2, rings = '';
        for (let i = 1; i < n - 1; i++) {
            len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            if (len < next) continue;
            next = len + 1.3;
            if (i >= i0 - 1 && i <= i1 + 1) continue;
            const N = nrm(i), q = pts[i];
            rings += `M${f(q[0] + N[0] * N[2] + M.x)} ${f(q[1] + N[1] * N[2] + M.y)} L${f(q[0] - N[0] * N[2] + M.x)} ${f(q[1] - N[1] * N[2] + M.y)} `;
        }
        out += `<path d="${rings}" stroke="${W.lo}" stroke-width="0.35" opacity="0.8"/></g>`;
        // края пояска
        [i0, i1].forEach(i => {
            const N = nrm(i), q = pts[i], h = N[2] + 0.2;
            out += `<path d="M${f(q[0] + N[0] * h)} ${f(q[1] + N[1] * h)} L${f(q[0] - N[0] * h)} ${f(q[1] - N[1] * h)}" stroke="${W.lo}" stroke-width="0.45" ${shift}/>`;
        });
        out += `<path d="${body}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        return out;
    },

    // ---------- БАНКА ПИВА ----------
    // Алюминиевая банка по референсу игрока: стоит ровно, бока прямые,
    // плечи плавно и выпукло сходят к короткому горлышку, обод крышки —
    // тонкий эллипс уже корпуса; снизу бока мягко загибаются внутрь к
    // узкому кольцу донышка. Крышка: обод, утопленное донышко, ключ.
    // Этикетка на прямой части: чёрная, ровная сетка розовых червячков (к
    // краям сжимаются — уходят за изгиб), в центре белый знак пивоварни
    // (BREW_LOGO, от игрока). Было: наклонённая банка с ломаными плечами —
    // читалась коробкой.
    reelCan(cx, cy) {
        const K = PALETTE.greedJunk.reel.can, f = this.f, M = this.MISPRINT;
        const w = 17, h = 27, hw = w / 2, rim = hw * 0.8;
        const yT = cy - h / 2 + 1.6, yB = cy + h / 2 - 1.2;    // обод и низ донышка
        const sh = yT + 4.6, bt = yB - 2.8;                     // конец плеч, начало низа
        const ry = 1.5, base = hw * 0.78;
        const id = 'gj-can' + Math.round(cx * 10 + cy);
        // силуэт по часовой: обод справа → плечо → бок → низ → донышко → левый бок → плечо → дальний обод
        const body = `M${f(cx + rim)} ${f(yT)} L${f(cx + rim)} ${f(yT + 0.9)} ` +
            `C${f(cx + rim + 0.6)} ${f(yT + 2.2)} ${f(cx + hw)} ${f(yT + 2.4)} ${f(cx + hw)} ${f(sh)} ` +
            `L${f(cx + hw)} ${f(bt)} C${f(cx + hw)} ${f(bt + 2)} ${f(cx + base + 0.8)} ${f(yB - 0.4)} ${f(cx + base)} ${f(yB)} ` +
            `A${f(base)} ${ry} 0 0 1 ${f(cx - base)} ${f(yB)} ` +
            `C${f(cx - base - 0.8)} ${f(yB - 0.4)} ${f(cx - hw)} ${f(bt + 2)} ${f(cx - hw)} ${f(bt)} ` +
            `L${f(cx - hw)} ${f(sh)} C${f(cx - hw)} ${f(yT + 2.4)} ${f(cx - rim - 0.6)} ${f(yT + 2.2)} ${f(cx - rim)} ${f(yT + 0.9)} ` +
            `L${f(cx - rim)} ${f(yT)} A${f(rim)} ${ry} 0 0 1 ${f(cx + rim)} ${f(yT)} Z`;
        let g = `<clipPath id="${id}"><path d="${body}"/></clipPath>`;
        g += `<path d="${body}" fill="${K.silver}" transform="translate(${M.x} ${M.y})"/>`;
        // этикетка на прямой части
        const lt = sh + 0.6, lb = bt - 0.4;
        // Края этикетки — дуги цилиндра, видимого чуть сверху; сама этикетка
        // той же формой. Было: прямоугольник, а по краю — дуга, и между ними
        // светлая щель полосой.
        const arc = (y) => `${f(cx - hw - 1)} ${f(y)} Q${f(cx)} ${f(y + 2)} ${f(cx + hw + 1)} ${f(y)}`;
        let lab = `<path d="M${arc(lt)} L${f(cx + hw + 1)} ${f(lb)} Q${f(cx)} ${f(lb + 2)} ${f(cx - hw - 1)} ${f(lb)} Z" fill="${K.label}"/>`;
        const R = hw, X = (u) => cx + R * Math.sin(Math.max(-1.5, Math.min(1.5, u / R)));
        // знак пивоварни, по центру этикетки; червячки обходят его
        const L = BREW_LOGO.box, sz = 10.5, sc = sz / L.h, my = (lt + lb) / 2, lw = L.w * sc;
        let worms = '';
        for (let r = 0, y = lt + 1.6; y < lb - 0.8; r++, y += 2.6) {
            for (let u = -R - 2 + (r % 2) * 1.7; u < R + 2; u += 3.4) {
                const a = X(u - 0.9), b = X(u), c = X(u + 0.9), k = Math.cos(Math.max(-1.5, Math.min(1.5, u / R)));
                if (k < 0.2) continue;
                if (Math.abs(b - cx) < lw / 2 + 1.2 && Math.abs(y - my) < sz / 2 + 1) continue;
                worms += `<path d="M${f(a)} ${f(y + 0.35)} Q${f((a + b) / 2)} ${f(y - 0.6)} ${f(b)} ${f(y)} T${f(c)} ${f(y - 0.35)}" stroke-width="${f(0.45 * (0.5 + 0.5 * k))}"/>`;
            }
        }
        lab += `<g fill="none" stroke="${K.worm}" stroke-linecap="round">${worms}</g>`;
        lab += `<path d="${BREW_LOGO.d}" fill="${K.logo}" transform="translate(${f(cx - L.w * sc / 2 - L.x * sc)} ${f(my - sz / 2 - L.y * sc)}) scale(${sc.toFixed(5)})"/>`;
        g += `<g clip-path="url(#${id})">${lab}` +
            // объём цилиндра: тень к правому краю, узкий блик слева
            `<rect x="${f(cx + hw * 0.4)}" y="${f(yT - 2)}" width="${f(hw * 0.6)}" height="${h + 4}" fill="${K.silverLo}" opacity="0.3"/>` +
            `<rect x="${f(cx - hw * 0.55)}" y="${f(yT - 2)}" width="0.9" height="${h + 4}" fill="${K.silverHi}" opacity="0.35"/></g>`;
        // края этикетки — тонкие дуги (цилиндр видно чуть сверху)
        [lt, lb].forEach(y => { g += `<path d="M${arc(y)}" fill="none" stroke="${K.silverLo}" stroke-width="0.35" clip-path="url(#${id})"/>`; });
        // крышка: обод, утопленное донышко, ключ
        g += `<ellipse cx="${cx}" cy="${f(yT)}" rx="${f(rim)}" ry="${ry}" fill="${K.silverHi}"/>` +
            `<ellipse cx="${cx}" cy="${f(yT + 0.2)}" rx="${f(rim - 1)}" ry="${f(ry - 0.5)}" fill="${K.silver}" stroke="${K.silverLo}" stroke-width="0.35"/>` +
            `<rect x="${f(cx - 0.8)}" y="${f(yT - 0.45)}" width="3.6" height="1.3" rx="0.65" fill="none" stroke="${K.silverLo}" stroke-width="0.4"/>` +
            `<circle cx="${f(cx - 0.8)}" cy="${f(yT + 0.2)}" r="0.4" fill="${K.silverLo}"/>` +
            `<ellipse cx="${cx}" cy="${f(yT)}" rx="${f(rim)}" ry="${ry}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
        g += `<path d="${body}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        return g;
    },

    // ---------- ШПРИЦ ----------
    // Лежит наискось (референс игрока): упор поршня слева вверху, игла
    // справа внизу, с кончика срывается капля. Цилиндр — прозрачный
    // пластик со шкалой делений, внутри ядовито-зелёная жидкость до
    // чёрного резинового поршня; впереди конус, втулка, стальная игла.
    // Рисуется вдоль оси x, потом поворачивается.
    reelSyringe(cx, cy) {
        const Y = PALETTE.greedJunk.reel.syringe, f = this.f, ink = PALETTE.ink, M = this.MISPRINT;
        const r = 3.6;                               // радиус цилиндра
        const xP = -26, xF = -11, xB = 12, xC = 15, xH = 18, xN = 28, xPis = -2;
        let g = '';
        // Толстый диск, видимый почти с ребра: задняя сторона, торцевой
        // обод в тени и лицевая сторона с бликом по краю. ry — полувысота
        // (поперёк оси), rx — сплющенность, t — толщина вдоль оси. Было:
        // плоские кружки — читались бумажными.
        const disc = (x, ry, rx, t) =>
            `<path d="M${f(x)} ${-ry} L${f(x + t)} ${-ry} A${rx} ${ry} 0 0 1 ${f(x + t)} ${ry} L${f(x)} ${ry} Z" fill="${Y.glassLo}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<ellipse cx="${f(x)}" cy="0" rx="${rx}" ry="${ry}" fill="${Y.plastic}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M${f(x - rx * 0.5)} ${f(-ry * 0.75)} A${rx * 0.6} ${ry * 0.8} 0 0 0 ${f(x - rx * 0.5)} ${f(ry * 0.75)}" fill="none" stroke="${Y.glassHi}" stroke-width="0.6"/>` +
            `<ellipse cx="${f(x)}" cy="0" rx="${f(rx * 0.35)}" ry="${f(ry * 0.35)}" fill="none" stroke="${Y.glassLo}" stroke-width="0.4"/>`;
        // шток: крестовина — светлое верхнее ребро, тёмная середина; у концов
        // утолщения, где шток входит в диски
        g += `<rect x="${xP + 1}" y="-1.9" width="${xF - xP - 1}" height="3.8" fill="${Y.plastic}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${xP + 1.4}" y="-0.5" width="${xF - xP - 1.8}" height="1.3" fill="${Y.glassLo}"/>` +
            `<line x1="${xP + 1.4}" y1="-1.3" x2="${xF}" y2="-1.3" stroke="${Y.glassHi}" stroke-width="0.5"/>` +
            `<rect x="${xP + 1.2}" y="-2.3" width="1.6" height="4.6" rx="0.5" fill="${Y.plastic}" stroke="${ink}" stroke-width="${STROKE.hairline}"/>`;
        // упор поршня — толстый диск
        g += disc(xP, 4.4, 1.5, 1.4);
        // цилиндр: стекло, жидкость, поршень, деления
        const id = 'gj-syr' + Math.round(cx * 10 + cy);
        const barrel = `M${xF} ${-r} L${xB} ${-r} Q${xB + 1.2} ${-r} ${xB + 1.2} ${-r + 1.2} L${xB + 1.2} ${r - 1.2} Q${xB + 1.2} ${r} ${xB} ${r} L${xF} ${r} Z`;
        g += `<clipPath id="${id}"><path d="${barrel}"/></clipPath>`;
        g += `<path d="${barrel}" fill="${Y.glass}"/>`;
        g += `<g clip-path="url(#${id})">` +
            // жидкость от поршня до носика, мениск у поршня
            `<path d="M${xPis + 1} ${-r} Q${xPis + 2.2} 0 ${xPis + 1} ${r} L${xB + 2} ${r} L${xB + 2} ${-r} Z" fill="${Y.liquid}" transform="translate(${M.x} ${M.y})"/>` +
            `<rect x="${xPis + 1}" y="${f(r * 0.35)}" width="${xB - xPis + 2}" height="${f(r * 0.65)}" fill="${Y.liquidLo}" opacity="0.45"/>` +
            // шток внутри цилиндра до поршня
            `<rect x="${xF}" y="-1.3" width="${xPis - xF}" height="2.6" fill="${Y.plastic}" opacity="0.8"/>` +
            // резиновый поршень с двумя рёбрами
            `<rect x="${xPis - 1.6}" y="${-r}" width="2.8" height="${2 * r}" fill="${Y.rubber}"/>` +
            `<line x1="${xPis - 0.2}" y1="${-r}" x2="${xPis - 0.2}" y2="${r}" stroke="${Y.steelLo}" stroke-width="0.3"/>` +
            // блик по стеклу
            `<rect x="${xF}" y="${f(-r + 0.8)}" width="${xB - xF}" height="0.9" fill="${Y.glassHi}" opacity="0.8"/>` +
            `</g>`;
        // деления шкалы сверху цилиндра
        let ticks = '';
        for (let i = 0, x = xF + 2.5; x < xB - 1; i++, x += 2.2)
            ticks += `M${f(x)} ${-r} L${f(x)} ${f(-r + (i % 2 ? 1.1 : 1.9))} `;
        g += `<path d="${ticks}" stroke="${ink}" stroke-width="0.35"/>`;
        g += `<path d="${barrel}" fill="none" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        // упор для пальцев — вытянутая пластина с крыльями, с толщиной
        g += `<path d="M${xF - 0.7} ${-r - 2.6} Q${xF - 0.7} ${-r - 3.4} ${xF + 0.3} ${-r - 3.4} L${xF + 1.3} ${-r - 3.4} Q${xF + 2.1} ${-r - 3.4} ${xF + 2.1} ${-r - 2.6} ` +
            `L${xF + 2.1} ${r + 2.6} Q${xF + 2.1} ${r + 3.4} ${xF + 1.3} ${r + 3.4} L${xF + 0.3} ${r + 3.4} Q${xF - 0.7} ${r + 3.4} ${xF - 0.7} ${r + 2.6} Z" ` +
            `fill="${Y.glassLo}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="M${xF - 0.7} ${-r - 2.6} L${xF + 0.8} ${-r - 2.6} L${xF + 0.8} ${r + 2.6} L${xF - 0.7} ${r + 2.6} Z" fill="${Y.plastic}"/>` +
            `<line x1="${xF - 0.1}" y1="${-r - 2}" x2="${xF - 0.1}" y2="${r + 2}" stroke="${Y.glassHi}" stroke-width="0.5"/>` +
            `<path d="M${xF - 0.7} ${-r - 2.6} Q${xF - 0.7} ${-r - 3.4} ${xF + 0.3} ${-r - 3.4} L${xF + 1.3} ${-r - 3.4} Q${xF + 2.1} ${-r - 3.4} ${xF + 2.1} ${-r - 2.6} ` +
            `L${xF + 2.1} ${r + 2.6} Q${xF + 2.1} ${r + 3.4} ${xF + 1.3} ${r + 3.4} L${xF + 0.3} ${r + 3.4} Q${xF - 0.7} ${r + 3.4} ${xF - 0.7} ${r + 2.6} Z" ` +
            `fill="none" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        // конус и втулка
        g += `<path d="M${xB + 1.2} ${-r + 1} L${xC} -1.2 L${xC} 1.2 L${xB + 1.2} ${r - 1} Z" fill="${Y.glass}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="M${xC} -1.3 L${xH} -0.7 L${xH} 0.7 L${xC} 1.3 Z" fill="${Y.plastic}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        // игла — тонкая сталь с косым срезом
        g += `<path d="M${xH} -0.35 L${xN} -0.1 L${xN + 0.8} 0.35 L${xH} 0.35 Z" fill="${Y.steel}" stroke="${ink}" stroke-width="0.35" stroke-linejoin="round"/>`;
        // наискось и чуть мельче, чтобы упор и капля влезли в ячейку
        const rot = 18, a = rot * Math.PI / 180, k = 0.8, ox = cx - 1.5;
        // капля на кончике — висит вниз по экрану, а не по оси шприца
        const tx = ox + (xN + 0.6) * k * Math.cos(a), ty = cy + (xN + 0.6) * k * Math.sin(a);
        const drop = `<path d="M${f(tx)} ${f(ty + 0.6)} Q${f(tx + 1.3)} ${f(ty + 2.8)} ${f(tx)} ${f(ty + 3.4)} Q${f(tx - 1.3)} ${f(ty + 2.8)} ${f(tx)} ${f(ty + 0.6)} Z" fill="${Y.liquid}" stroke="${ink}" stroke-width="0.4"/>`;
        return `<g transform="translate(${ox} ${cy}) rotate(${rot}) scale(${k})">${g}</g>` + drop;
    },

    // Ячейка ленты: бумага с крапом и символ. Для показа и для ленты.
    reelCell(key, x, y) {
        const R = PALETTE.greedJunk.reel, C = this.CELL, f = this.f;
        const rnd = this.rng(x * 7 + y * 13 + key.length);
        let out = `<rect x="${x}" y="${y}" width="${C.w}" height="${C.h}" fill="${R.paper}"/>`;
        for (let i = 0; i < 14; i++) out += `<circle cx="${f(x + rnd() * C.w)}" cy="${f(y + rnd() * C.h)}" r="${f(0.2 + rnd() * 0.4)}" fill="${R.speck}" opacity="0.5"/>`;
        const draw = { worm: 'reelWorm', beer: 'reelCan', syringe: 'reelSyringe' }[key];
        if (draw) out += this[draw](x + C.w / 2, y + C.h / 2);
        return out;
    }
});
