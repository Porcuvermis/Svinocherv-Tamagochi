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
    // Алюминиевая банка, чуть наклонена. Сверху видна крышка: серебряный
    // обод, утопленное донышко и ключ-кольцо; горлышко сужается к крышке,
    // дно скруглено. Этикетка чёрная, по ней ровная сетка розовых
    // червячков — к краям банки они сжимаются (уходят за изгиб); в центре
    // белый знак пивоварни (BREW_LOGO, от игрока). Блик — вертикальной
    // полосой по металлу и этикетке.
    reelCan(cx, cy) {
        const K = PALETTE.greedJunk.reel.can, f = this.f, M = this.MISPRINT;
        const w = 15, h = 26, x0 = cx - w / 2, yT = cy - h / 2 + 2.6, yB = cy + h / 2;
        const ry = 2.2;                                   // сплющенность верха и низа
        const neck = 2.2;                                 // сужение к крышке
        const id = 'gj-can' + Math.round(cx * 10 + cy);
        // силуэт: крышка-эллипс, плечи сужаются, низ — полуэллипс
        const body = `M${f(x0 + neck)} ${f(yT)} L${f(x0)} ${f(yT + 3.2)} L${f(x0)} ${f(yB - 2.6)} ` +
            `Q${f(x0)} ${f(yB - 1)} ${f(x0 + 1.4)} ${f(yB - 0.6)} A${f(w / 2 - 1.4)} ${ry} 0 0 0 ${f(x0 + w - 1.4)} ${f(yB - 0.6)} ` +
            `Q${f(x0 + w)} ${f(yB - 1)} ${f(x0 + w)} ${f(yB - 2.6)} L${f(x0 + w)} ${f(yT + 3.2)} L${f(x0 + w - neck)} ${f(yT)} ` +
            // верх силуэта — дальняя половина обода, а не прямая через крышку
            `A${f(w / 2 - neck)} ${ry} 0 0 0 ${f(x0 + neck)} ${f(yT)} Z`;
        let g = `<clipPath id="${id}"><path d="${body}"/></clipPath>`;
        g += `<path d="${body}" fill="${K.silver}" transform="translate(${M.x} ${M.y})"/>`;
        // этикетка между плечами и низом
        const lt = yT + 4.2, lb = yB - 3.4;
        let lab = `<rect x="${x0 - 1}" y="${f(lt)}" width="${w + 2}" height="${f(lb - lt)}" fill="${K.label}"/>`;
        // червячки: ровная сетка со сдвигом рядов; x — по цилиндру
        const R = w / 2, X = (u) => cx + R * Math.sin(Math.max(-1.5, Math.min(1.5, u / R)));
        let worms = '';
        for (let r = 0, y = lt + 1.6; y < lb - 0.8; r++, y += 2.6) {
            for (let u = -R - 2 + (r % 2) * 1.7; u < R + 2; u += 3.4) {
                const a = X(u - 0.9), b = X(u), c = X(u + 0.9), k = Math.cos(Math.max(-1.5, Math.min(1.5, u / R)));
                if (k < 0.2) continue;
                worms += `<path d="M${f(a)} ${f(y + 0.35)} Q${f((a + b) / 2)} ${f(y - 0.6)} ${f(b)} ${f(y)} T${f(c)} ${f(y - 0.35)}" stroke-width="${f(0.45 * (0.5 + 0.5 * k))}"/>`;
            }
        }
        lab += `<g fill="none" stroke="${K.worm}" stroke-linecap="round">${worms}</g>`;
        // знак пивоварни, белый, по центру этикетки
        const L = BREW_LOGO.box, sz = 10.5, sc = sz / L.h;
        const lx = cx - L.w * sc / 2 - L.x * sc, ly = (lt + lb) / 2 - sz / 2 - L.y * sc;
        lab += `<rect x="${f(cx - L.w * sc / 2 - 0.8)}" y="${f((lt + lb) / 2 - sz / 2 - 0.6)}" width="${f(L.w * sc + 1.6)}" height="${f(sz + 1.2)}" rx="1" fill="${K.label}"/>`;
        lab += `<path d="${BREW_LOGO.d}" fill="${K.logo}" transform="translate(${f(lx)} ${f(ly)}) scale(${sc.toFixed(5)})"/>`;
        g += `<g clip-path="url(#${id})">${lab}` +
            // объём: тень к правому краю, блик полосой слева
            `<rect x="${f(x0 + w * 0.7)}" y="${f(yT)}" width="${f(w * 0.3)}" height="${h}" fill="${K.silverLo}" opacity="0.3"/>` +
            `<rect x="${f(x0 + w * 0.22)}" y="${f(yT)}" width="0.8" height="${h}" fill="${K.silverHi}" opacity="0.3"/></g>`;
        // ободки этикетки
        g += `<path d="M${x0} ${f(lt)} L${x0 + w} ${f(lt)} M${x0} ${f(lb)} L${x0 + w} ${f(lb)}" stroke="${K.silverLo}" stroke-width="0.4"/>`;
        // крышка: обод, утопленное донышко, ключ
        // обод ровно по горлышку; внутри — утопленное донышко и ключ
        const rr = w / 2 - neck;
        g += `<ellipse cx="${cx}" cy="${f(yT)}" rx="${f(rr)}" ry="${ry}" fill="${K.silverHi}"/>` +
            `<ellipse cx="${cx}" cy="${f(yT + 0.25)}" rx="${f(rr - 1)}" ry="${f(ry - 0.55)}" fill="${K.silver}" stroke="${K.silverLo}" stroke-width="0.35"/>` +
            `<rect x="${f(cx - 0.6)}" y="${f(yT - 0.5)}" width="3.4" height="1.4" rx="0.7" fill="none" stroke="${K.silverLo}" stroke-width="0.4"/>` +
            `<circle cx="${f(cx - 0.6)}" cy="${f(yT + 0.2)}" r="0.4" fill="${K.silverLo}"/>` +
            `<ellipse cx="${cx}" cy="${f(yT)}" rx="${f(rr)}" ry="${ry}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
        g += `<path d="${body}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        return `<g transform="rotate(-14 ${cx} ${cy})">${g}</g>`;
    },

    // Ячейка ленты: бумага с крапом и символ. Для показа и для ленты.
    reelCell(key, x, y) {
        const R = PALETTE.greedJunk.reel, C = this.CELL, f = this.f;
        const rnd = this.rng(x * 7 + y * 13 + key.length);
        let out = `<rect x="${x}" y="${y}" width="${C.w}" height="${C.h}" fill="${R.paper}"/>`;
        for (let i = 0; i < 14; i++) out += `<circle cx="${f(x + rnd() * C.w)}" cy="${f(y + rnd() * C.h)}" r="${f(0.2 + rnd() * 0.4)}" fill="${R.speck}" opacity="0.5"/>`;
        const draw = { worm: 'reelWorm', beer: 'reelCan' }[key];
        if (draw) out += this[draw](x + C.w / 2, y + C.h / 2);
        return out;
    }
});
