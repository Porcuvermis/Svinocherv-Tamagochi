// ================= АППАРАТ АЛЧНОСТИ: ТАБЛИЧКА ВЫПЛАТ =================
// Продолжение GreedJunk. На сосновой доске под табло — таблица выигрышей
// без слов: «три символа → награда». Нанесена чёрной краской из баллончика
// по трафарету (решение игрока): у фигур перемычки трафарета, вокруг —
// напыл (мягкий ореол и мелкие брызги), из-под некоторых краска потекла.
// Значения — из конфига (ECONOMY.minigames.greed): поменяется баланс —
// поменяется и табличка. Цифры — свои, сегментами трафарета, а не
// шрифтом: шрифт внутри картинки на iPhone может подмениться.
Object.assign(GreedJunk, {
    // Строки таблицы из конфига: тройки по убыванию выплаты, затем пара.
    // give — что вместо монет при жетонном исходе (alt).
    payRows() {
        const G = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames && ECONOMY.minigames.greed) || null;
        if (!G) return [];
        const rows = G.reel.filter(s => s.pay > 0).sort((a, b) => b.pay - a.pay)
            .map(s => ({ key: s.key, n: 3, pay: s.pay, alt: s.alt ? s.alt.altKey : null }));
        if (G.pair) rows.push({ key: G.pair.key, n: 2, pay: G.pair.pay, alt: null });
        return rows;
    },

    // ---------- ЦИФРЫ ТРАФАРЕТА ----------
    // Семь сегментов с промежутками — они же перемычки трафарета.
    SEG: { a: [[0.5, 0], [3.5, 0]], b: [[4, 0.5], [4, 3]], c: [[4, 4], [4, 6.5]], d: [[0.5, 7], [3.5, 7]],
        e: [[0, 4], [0, 6.5]], f: [[0, 0.5], [0, 3]], g: [[0.6, 3.5], [3.4, 3.5]] },
    DIGIT: ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'],
    // число n с левым верхним углом (x, y), высота цифры 7·k; возвращает
    // { d: путь сегментов, w: ширина }
    stencilNumber(n, x, y, k = 1) {
        const f = this.f;
        let d = '', cx = x;
        String(n).split('').forEach(ch => {
            this.DIGIT[+ch].split('').forEach(sg => {
                const [[x1, y1], [x2, y2]] = this.SEG[sg];
                d += `M${f(cx + x1 * k)} ${f(y + y1 * k)} L${f(cx + x2 * k)} ${f(y + y2 * k)} `;
            });
            cx += 6 * k;
        });
        return { d, w: cx - x - 2 * k };
    },

    // ---------- ТРАФАРЕТЫ СИМВОЛОВ ----------
    // Свои упрощённые фигуры, а не силуэты ленты барабана: у тех рёбра рыбы и
    // игла шприца — тонкие линии, и в размере таблички трафарет их съедал
    // (на iPhone значки не читались). Здесь толстые формы в коробке 22×12
    // с центром в (0,0); paint — краска, cut — перемычки (вырезаются маской).
    stencilArt(art, ink) {
        const F = `fill="${ink}"`, S = (w) => `fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
        const C = (w) => `fill="none" stroke="#000" stroke-width="${w}"`;
        switch (art) {
        case 'worm': return {
            paint: `<path d="M-10 3 C-7 -4 -3 -4 -1 0 S5 4 7.5 -0.5" ${S(4)}/><circle cx="8.6" cy="-1.6" r="3.2" ${F}/>`,
            cut: `<circle cx="9.4" cy="-2.4" r="0.95" fill="#000"/><path d="M-6 -3.5 L-4.6 1.5 M2.4 -1.5 L3.6 3.6" ${C(0.7)}/>` };
        case 'syringe': return {
            paint: `<rect x="-7" y="-3" width="12" height="6" rx="0.8" ${F}/><rect x="-11" y="-0.9" width="4.5" height="1.8" ${F}/>` +
                `<rect x="-12.4" y="-3.6" width="1.6" height="7.2" rx="0.5" ${F}/><rect x="-8.2" y="-4.8" width="1.3" height="9.6" rx="0.5" ${F}/>` +
                `<rect x="4.6" y="-1.3" width="2.2" height="2.6" ${F}/><path d="M6.5 0 L11.4 0" ${S(1.1)}/>`,
            cut: `<path d="M-4 -3.2 L-4 -0.6 M-1.5 -3.2 L-1.5 -0.6 M1 -3.2 L1 -0.6 M3.4 -3.2 L3.4 -0.6" ${C(0.6)}/>` };
        case 'beer': return {
            paint: `<rect x="-4.6" y="-6" width="9.2" height="12" rx="1.6" ${F}/>`,
            cut: `<path d="M-5 -4 L5 -4 M-5 4.2 L5 4.2" ${C(0.6)}/><path d="M-1.8 1.4 C-1.2 -1.6 1.2 1.6 1.8 -1.4" ${C(0.8)}/>` };
        case 'fish': return {
            paint: `<path d="M-7.5 0 L5 0" ${S(1.6)}/>` +
                [-4.4, -1.6, 1.2].map(x => `<path d="M${x} -4.2 L${x + 1.4} 0 L${x} 4.2" ${S(1.3)}/>`).join('') +
                `<path d="M4 -4.2 Q11 -4.4 11 0 Q11 4.4 4 4.2 Z" ${F}/><path d="M-7 0 L-11 -4.5 L-9.8 0 L-11 4.5 Z" ${F}/>`,
            cut: `<circle cx="7.6" cy="-1.3" r="0.95" fill="#000"/><path d="M8.6 1.8 L11.5 1.8" ${C(0.6)}/>` };
        case 'token': return {
            paint: `<circle r="6" ${F}/>`,
            cut: `<circle r="4" ${C(0.7)} stroke-dasharray="7.4 1.0"/><circle r="1.3" fill="#000"/>` };
        case 'shard': return {
            paint: `<path d="M-5.5 5 L-2 -6 L0.8 -2 L3.6 -5 L6 4.6 Z" ${F}/>`,
            cut: `<path d="M-2 -6 L-1 -1 L2.5 1.5 L1.5 5" ${C(0.6)}/>` };
        }
        return null;
    },

    // ---------- ТАБЛИЧКА ----------
    // Строка: один символ, «×n», стрелка, выплата (и «/ жетон» при жетонном
    // исходе). Три символа в строке съедали ширину, и каждый выходил втрое
    // мельче. Под каждой строкой — пятно светлого грунта: волокна доски и
    // сучок рисунок больше не перебивают. Левая колонка — три строки, правая
    // — две; между ними промежуток под висячей лампой (HANG_LAMP.x), чтобы
    // её кабель не ложился на значки.
    payPlate(p) {
        const f = this.f, R = PALETTE.greedJunk.reel, ink = R.spray;
        const rows = this.payRows();
        if (!rows.length) return '';
        const rnd = this.rng(4711);
        const SC = 1.1, NK = 1.3, rh = 14;            // масштаб символа, масштаб цифр, шаг строк
        const lampX = (this.HANG_LAMP && this.HANG_LAMP.x) || p.x + p.w / 2;
        let paint = '', cut = '', primer = '';
        const drips = [];
        // Каждый трафарет подставлен рукой: свой сдвиг и наклон. Символ, «×n»,
        // стрелка и число — разные трафареты, поэтому и сбиты друг от друга.
        const J = (v) => (rnd() - 0.5) * 2 * v;
        const tilt = (a, cx, cy, svg) => `<g transform="rotate(${f(a)} ${f(cx)} ${f(cy)})">${svg}</g>`;
        const artOf = (key) => this.REEL_ART[key] || key;
        const sym = (key, cx0, cy0, k = SC) => {
            const A = this.stencilArt(artOf(key), ink);
            if (!A) return;
            const cx = cx0 + J(0.6), cy = cy0 + J(0.8), a = J(5);
            const tr = `translate(${f(cx)} ${f(cy)}) rotate(${f(a)}) scale(${f(k)})`;
            paint += `<g transform="${tr}">${A.paint}</g>`;
            cut += `<g transform="${tr}">${A.cut}</g>`;
            if (rnd() < 0.35) drips.push([cx - 4 + rnd() * 8, cy + 5 * k]);
        };
        const times = (x0, y0, n) => {
            const x = x0 + J(0.5), y = y0 + J(0.8);
            const num = this.stencilNumber(n, x + 3.4, y - 3.2, 0.9);
            paint += tilt(J(7), x + 4, y, `<path d="M${f(x)} ${f(y - 1.2)} L${f(x + 2.4)} ${f(y + 1.2)} M${f(x + 2.4)} ${f(y - 1.2)} L${f(x)} ${f(y + 1.2)}" ${''}fill="none" stroke="${ink}" stroke-width="1" stroke-linecap="round"/>` +
                `<path d="${num.d}" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>`);
            return 3.4 + num.w;
        };
        const arrow = (x0, y0) => { const x = x0 + J(0.6), y = y0 + J(0.8); paint += tilt(J(8), x + 2.7, y, `<path d="M${f(x)} ${f(y)} L${f(x + 5)} ${f(y)} M${f(x + 3)} ${f(y - 2)} L${f(x + 5.4)} ${f(y)} L${f(x + 3)} ${f(y + 2)}" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`); };
        // колонки: слева от лампы и справа от неё, с отступом от гвоздей
        const L0 = p.x + 14, R0 = lampX + 10;
        const left = rows.filter((r, i) => i < 3), right = rows.filter((r, i) => i >= 3);
        // правая: пара сверху (короткая строка), тройки — под ней
        right.sort((a, b) => a.n - b.n);
        const place = (list, x0, n) => list.map((r, j) => [r, x0, p.y + p.h / 2 + (j - (n - 1) / 2) * rh]);
        const cells = place(left, L0, 3).concat(place(right, R0, right.length));
        // полуширина фигуры: банка и жетон узкие — без неё за ними зияла дыра
        const half = (key) => ({ beer: 5, token: 6, shard: 6 }[artOf(key)] || 11) * SC;
        cells.forEach(([r, x0, cy0]) => {
            const x = x0 + rnd() * 2, cy = cy0 + J(1);
            let cx = x + half(r.key);
            sym(r.key, cx, cy);
            cx += half(r.key) + 2;
            cx += times(cx, cy + 1, r.n) + 3;
            arrow(cx, cy);
            cx += 8.5;
            const nx = cx + J(0.6), ny = cy - 3.5 * NK + J(0.8);
            const num = this.stencilNumber(r.pay, nx, ny, NK);
            paint += tilt(J(5), nx + num.w / 2, cy, `<path d="${num.d}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`);
            if (rnd() < 0.6) drips.push([nx + rnd() * num.w, ny + 7 * NK + 0.5, 0.4]);
            cx += num.w;
            if (r.alt) {
                paint += `<path d="M${f(cx + 2)} ${f(cy + 3.8)} L${f(cx + 4.6)} ${f(cy - 3.8)}" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>`;
                sym(r.alt, cx + 10.5, cy, 0.85);
                cx += 16;
            }
            // грунт: неровное пятно чуть шире строки, края — мягким напылом
            const gx = x - 1.5 + J(0.8), gw = cx - x + 5 + J(1), gy = cy - 6.8 + J(0.5), gh = 13.6 + J(0.6);
            primer += tilt(J(1.5), gx + gw / 2, cy, `<rect x="${f(gx)}" y="${f(gy)}" width="${f(gw)}" height="${f(gh)}" rx="2.5" fill="${R.primer}"/>`);
        });
        // подтёки: струйка вниз с каплей
        drips.forEach(([x, y, s = 1]) => {
            // сужается книзу, капля на конце; короткие и разные
            const L = (1 + rnd() * 3.2) * s, w = 0.6 + rnd() * 0.3, cw = w * 0.35;
            paint += `<path d="M${f(x - w)} ${f(y - 1.2)} Q${f(x - cw)} ${f(y + L * 0.4)} ${f(x - cw)} ${f(y + L)} A${f(cw * 1.6)} ${f(cw * 1.6)} 0 1 0 ${f(x + cw)} ${f(y + L)} Q${f(x + cw)} ${f(y + L * 0.4)} ${f(x + w)} ${f(y - 1.2)} Z" fill="${ink}"/>`;
        });
        // брызги напыла
        let specks = '';
        for (let i = 0; i < 70; i++) {
            const x = p.x + 4 + rnd() * (p.w - 8), y = p.y + 3 + rnd() * (p.h - 6);
            specks += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.12 + rnd() * 0.25)}" fill="${ink}" opacity="${f(0.25 + rnd() * 0.45)}"/>`;
        }
        const id = 'gj-spray';
        return `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}">` +
            `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fff"/>${cut}</mask>` +
            `<filter id="${id}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
            `<filter id="${id}-g" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="0.7"/></filter>` +
            // Класс nh: краска плоская и в карту высот не попадает. Иначе она
            // ложилась туда на своей высоте, а не на высоте доски, — шейдер
            // видел ступеньку и отбрасывал от рисунка тень.
            `<g class="nh"><g filter="url(#${id}-g)" opacity="0.93">${primer}</g>` +
            // напыл — та же краска, широко размытая и слабая; поверх — чёткая
            `<g mask="url(#${id}-m)"><g filter="url(#${id})" opacity="0.14">${paint}</g>` +
            `<g opacity="0.92">${paint}</g></g>${specks}</g>`;
    }
});
