// ================= АППАРАТ АЛЧНОСТИ: ЛЕНТА БАРАБАНОВ =================
// Символы, отпечатанные на бумажной ленте барабана: тушевой контур,
// тусклая краска, сдвинутая относительно контура, как при старой печати.
// Не эмодзи — свой рисунок в стиле аппарата. Ячейка ленты — CELL (ширина
// окна барабана × треть его высоты); символ рисуется в ячейке с центром
// (cx, cy).
Object.assign(GreedJunk, {
    CELL: { w: 56, h: 32 },
    // сдвиг краски относительно контура — «приводка» старой печати
    MISPRINT: { x: 0.7, y: -0.5 },

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
    // Дождевой червь волной поперёк ячейки: голова справа скруглённая,
    // хвост слева сужается; кольца сегментов поперёк тела, ближе к голове
    // широкий поясок. Лица нет — это червь, а не герой игры.
    reelWorm(cx, cy) {
        const W = PALETTE.greedJunk.reel.worm, f = this.f, M = this.MISPRINT;
        const ctrl = [[-21, 5], [-12, -5], [-2, 2], [8, 7], [16, 0], [21, -7]].map(q => [cx + q[0], cy + q[1]]);
        const pts = this.spline(ctrl, 8);
        // толщина: хвост тоньше, к голове толще, голова чуть сужается
        const w = (t) => 3 + 6 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) - (t > 0.85 ? (t - 0.85) * 8 : 0);
        const body = this.tube(pts, w, true);
        const shift = `transform="translate(${M.x} ${M.y})"`;
        const id = 'gj-rw' + Math.round(cx * 10 + cy);
        let out = `<clipPath id="${id}"><path d="${body}" ${shift}/></clipPath>`;
        out += `<path d="${body}" fill="${W.base}" ${shift}/>`;
        // светлая спина и тень брюшка — краской, в пределах тела
        const spine = pts.map(q => `${f(q[0] + M.x)} ${f(q[1] - 1.8 + M.y)}`).join(' L');
        const belly = pts.map(q => `${f(q[0] + M.x)} ${f(q[1] + 2.4 + M.y)}`).join(' L');
        out += `<g clip-path="url(#${id})"><path d="M${spine}" fill="none" stroke="${W.hi}" stroke-width="1.8" stroke-linecap="round"/>` +
            `<path d="M${belly}" fill="none" stroke="${W.lo}" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/></g>`;
        // поясок
        const n = pts.length, b0 = Math.round(n * 0.62), b1 = Math.round(n * 0.74);
        // поясок — вздутый и светлее тела, по краям — тёмные кольца
        out += `<path d="${this.tube(pts.slice(b0, b1 + 1), () => w(0.68) + 0.4)}" fill="${W.belt}" ${shift} clip-path="url(#${id})"/>`;
        [b0, b1].forEach(i => {
            const a = pts[i - 1], c = pts[i + 1], dx = c[0] - a[0], dy = c[1] - a[1], d = Math.hypot(dx, dy) || 1;
            const nx = -dy / d, ny = dx / d, h = w(i / (n - 1)) / 2, q = pts[i];
            out += `<path d="M${f(q[0] + nx * h)} ${f(q[1] + ny * h)} L${f(q[0] - nx * h)} ${f(q[1] - ny * h)}" stroke="${W.lo}" stroke-width="0.7" ${shift}/>`;
        });
        // кольца сегментов: короткие поперечные дуги тушью
        for (let i = 3; i < n - 2; i += 2) {
            if (i >= b0 && i <= b1) continue;
            const a = pts[i - 1], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
            const nx = -dy / d, ny = dx / d, h = w(i / (n - 1)) / 2 * 0.8, q = pts[i];
            out += `<path d="M${f(q[0] + nx * h)} ${f(q[1] + ny * h)} Q${f(q[0] + dx / d * 0.8)} ${f(q[1] + dy / d * 0.8)} ${f(q[0] - nx * h)} ${f(q[1] - ny * h)}" ` +
                `fill="none" stroke="${W.lo}" stroke-width="0.45" opacity="0.85"/>`;
        }
        out += `<path d="${body}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        return out;
    },

    // Ячейка ленты: бумага с крапом и символ. Для показа и для ленты.
    reelCell(key, x, y) {
        const R = PALETTE.greedJunk.reel, C = this.CELL, f = this.f;
        const rnd = this.rng(x * 7 + y * 13 + key.length);
        let out = `<rect x="${x}" y="${y}" width="${C.w}" height="${C.h}" fill="${R.paper}"/>`;
        for (let i = 0; i < 14; i++) out += `<circle cx="${f(x + rnd() * C.w)}" cy="${f(y + rnd() * C.h)}" r="${f(0.2 + rnd() * 0.4)}" fill="${R.speck}" opacity="0.5"/>`;
        const draw = { worm: 'reelWorm' }[key];
        if (draw) out += this[draw](x + C.w / 2, y + C.h / 2);
        return out;
    }
});
