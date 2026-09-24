// ================= ВАННА: ЧАША ОДНОЙ ЭМАЛЬЮ =================
// Запечённая чаша была честной по форме и перспективе, но свет на ней
// лежал ступенями граней: полосы, зазубренные края пятен, «пластиковый»
// лист вместо эмали. Здесь та же чаша нарисована вектором, в том же ключе,
// что душ и этажерка: форма — несколькими крупными фигурами, объём —
// мягкими градиентами, без единой ступени.
//
// Силуэт НЕ меняется: верх борта остаётся на прежней высоте (по нему
// режется червь — visibleLine — и садятся капли на борт, lust-goo.js
// rimTop), габарит чаши тот же (BATH_ART.box('tub') берётся из запекания).
// Перерисована только заливка.
//
// Из чего чаша:
//   * борт-валик — толстая закатанная кромка поверх тела, со скруглёнными
//     концами. Свет сверху: валик светлый по верху и тёмный снизу;
//   * тело — боковины сходятся книзу и скругляются у пола. Объём одним
//     горизонтальным градиентом (свет слева) и затемнением к полу;
//   * крупный мягкий блик на левой трети — объём даёт он, а не обводка;
//   * тень от валика на теле — без неё валик лежит на чаше наклейкой;
//   * жизнь: рыжие потёки из-под борта, пара сколов эмали, налёт у дна.

const BATH_TUB = {
    TOP: 747,                // верх борта — как у запекания
    LIP: 13,                 // толщина валика
    X0: 89, X1: 631,         // концы валика
    BOTTOM: 937,             // низ чаши (стоит на полу)

    draw() {
        const E = btPal().enamel, T = btPal().tile, ink = PALETTE.ink;
        const f = (v) => v.toFixed(1);
        const top = this.TOP, lipB = top + this.LIP, X0 = this.X0, X1 = this.X1, bot = this.BOTTOM;
        const cx = (X0 + X1) / 2, r = this.LIP / 2;
        const inner = mixColor(ink, E[0], 0.45);

        // Тело: боковины идут внутрь от концов валика и мягко заворачивают
        // в дно. Кривые, а не ломаная: чаша литая.
        const bl = X0 + 15, br = X1 - 15;           // где тело уходит под валик
        const body = `M${f(bl)} ${f(lipB - 2)}`
            + `C${f(bl + 6)} ${f(lipB + 45)} ${f(bl + 14)} ${f(lipB + 105)} ${f(bl + 26)} ${f(bot - 38)}`
            + `C${f(bl + 32)} ${f(bot - 12)} ${f(bl + 44)} ${f(bot - 1)} ${f(bl + 76)} ${f(bot)}`
            + `L${f(br - 76)} ${f(bot)}`
            + `C${f(br - 44)} ${f(bot - 1)} ${f(br - 32)} ${f(bot - 12)} ${f(br - 26)} ${f(bot - 38)}`
            + `C${f(br - 14)} ${f(lipB + 105)} ${f(br - 6)} ${f(lipB + 45)} ${f(br)} ${f(lipB - 2)}Z`;
        const lip = `M${f(X0 + r)} ${f(top)}H${f(X1 - r)}A${f(r)} ${f(r)} 0 0 1 ${f(X1 - r)} ${f(lipB)}`
            + `H${f(X0 + r)}A${f(r)} ${f(r)} 0 0 1 ${f(X0 + r)} ${f(top)}Z`;

        // Потёки ржавой воды из-под борта: широкая мягкая полоса, которая
        // сходит на нет книзу, со скруглённым концом. Узкие острые потёки
        // читались сосульками.
        const rnd = btRng(97);
        let drips = '';
        for (const x0 of [214, 404, 486]) {
            const x = x0 + (rnd() - 0.5) * 8, len = 34 + rnd() * 40, w = 4 + rnd() * 3;
            drips += `M${f(x - w)} ${f(lipB)}C${f(x - w)} ${f(lipB + len * 0.5)} ${f(x - w * 0.5)} ${f(lipB + len)} ${f(x)} ${f(lipB + len)}`
                   + `C${f(x + w * 0.5)} ${f(lipB + len)} ${f(x + w)} ${f(lipB + len * 0.5)} ${f(x + w)} ${f(lipB)}Z`;
        }
        // Сколы эмали: неровное пятно тёмного чугуна со светлым краем.
        const chip = (x, y, s, seed) => {
            const q = btRng(seed), n = 7, pts = [];
            for (let i = 0; i < n; i++) {
                const a = 2 * Math.PI * i / n, k = 0.55 + q() * 0.6;
                pts.push({ x: x + Math.cos(a) * s * k * 1.3, y: y + Math.sin(a) * s * k * 0.8 });
            }
            let d = `M${f((pts[0].x + pts[1].x) / 2)} ${f((pts[0].y + pts[1].y) / 2)}`;
            for (let i = 1; i <= n; i++) {
                const p = pts[i % n], nx = pts[(i + 1) % n];
                d += `Q${f(p.x)} ${f(p.y)} ${f((p.x + nx.x) / 2)} ${f((p.y + nx.y) / 2)}`;
            }
            return d + 'Z';
        };
        const chips = chip(160, 900, 4, 3) + chip(566, 868, 3, 5);

        return `
        <g class="bt-tub">
            <defs>
                <!-- Тело: свет слева, правый бок уходит в тень, у краёв
                     завал — чаша круглая, а не плоский фасад. -->
                <linearGradient id="btt-body" gradientUnits="userSpaceOnUse" x1="${f(bl)}" y1="0" x2="${f(br)}" y2="0">
                    <stop offset="0" stop-color="${E[2]}"/>
                    <stop offset="0.07" stop-color="${E[4]}"/>
                    <stop offset="0.22" stop-color="${E[5]}"/>
                    <stop offset="0.5" stop-color="${E[4]}"/>
                    <stop offset="0.82" stop-color="${E[3]}"/>
                    <stop offset="0.95" stop-color="${E[2]}"/>
                    <stop offset="1" stop-color="${E[1]}"/>
                </linearGradient>
                <!-- К полу темнее: туда не доходит свет лампы. -->
                <linearGradient id="btt-floor" gradientUnits="userSpaceOnUse" x1="0" y1="${f(lipB)}" x2="0" y2="${f(bot)}">
                    <stop offset="0" stop-color="${E[1]}" stop-opacity="0"/>
                    <stop offset="0.55" stop-color="${E[1]}" stop-opacity="0.05"/>
                    <stop offset="1" stop-color="${E[0]}" stop-opacity="0.55"/>
                </linearGradient>
                <!-- Тень от валика на теле. -->
                <linearGradient id="btt-under" gradientUnits="userSpaceOnUse" x1="0" y1="${f(lipB - 1)}" x2="0" y2="${f(lipB + 22)}">
                    <stop offset="0" stop-color="${E[0]}" stop-opacity="0.45"/>
                    <stop offset="1" stop-color="${E[0]}" stop-opacity="0"/>
                </linearGradient>
                <!-- Большой мягкий блик — объём эмали. -->
                <radialGradient id="btt-glint" gradientUnits="userSpaceOnUse" cx="${f(bl + 70)}" cy="${f(lipB + 62)}" r="80"
                                gradientTransform="translate(${f(bl + 70)} ${f(lipB + 62)}) scale(0.42 1) translate(${f(-(bl + 70))} ${f(-(lipB + 62))})">
                    <stop offset="0" stop-color="${E[5]}" stop-opacity="0.95"/>
                    <stop offset="0.55" stop-color="${E[5]}" stop-opacity="0.35"/>
                    <stop offset="1" stop-color="${E[5]}" stop-opacity="0"/>
                </radialGradient>
                <!-- Валик: светлый верх, тёмный низ. -->
                <linearGradient id="btt-lip" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(lipB)}">
                    <stop offset="0" stop-color="${E[4]}"/>
                    <stop offset="0.3" stop-color="${E[5]}"/>
                    <stop offset="0.62" stop-color="${E[3]}"/>
                    <stop offset="1" stop-color="${E[1]}"/>
                </linearGradient>
                <linearGradient id="btt-drip" gradientUnits="userSpaceOnUse" x1="0" y1="${f(lipB)}" x2="0" y2="${f(lipB + 76)}">
                    <stop offset="0" stop-color="${T.rust}" stop-opacity="0.3"/>
                    <stop offset="1" stop-color="${T.rust}" stop-opacity="0"/>
                </linearGradient>
                <clipPath id="btt-clip"><path d="${body}"/></clipPath>
            </defs>
            <!-- Общий контур чаши — под заливками, наружу торчит половина. -->
            <path d="${body}${lip}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="url(#btt-body)"/>
            <g clip-path="url(#btt-clip)">
                <path d="${body}" fill="url(#btt-floor)"/>
                <rect x="${f(bl - 40)}" y="${f(lipB - 40)}" width="160" height="200" fill="url(#btt-glint)"/>
                <!-- Отсвет по правому краю — от кафеля за чашей. -->
                <path d="M${f(br - 16)} ${f(lipB + 20)}C${f(br - 12)} ${f(lipB + 70)} ${f(br - 18)} ${f(lipB + 120)} ${f(br - 36)} ${f(bot - 24)}"
                      fill="none" stroke="${E[4]}" stroke-width="7" stroke-linecap="round" stroke-opacity="0.3"/>
                <path d="${drips}" fill="url(#btt-drip)"/>
                <rect x="${f(bl - 10)}" y="${f(lipB - 1)}" width="${f(br - bl + 20)}" height="24" fill="url(#btt-under)"/>
                <!-- Налёт у дна — где высыхают брызги. -->
                <path d="M${f(bl + 40)} ${f(bot - 6)}Q${f(cx)} ${f(bot - 16)} ${f(br - 40)} ${f(bot - 6)}"
                      fill="none" stroke="${T.scale}" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
            </g>
            <path d="${lip}" fill="url(#btt-lip)" stroke="${inner}" stroke-width="${STROKE.detail}"/>
            <path d="${chips}" fill="${E[0]}" stroke="${E[3]}" stroke-width="0.7" stroke-linejoin="round"/>
            <!-- Блик по верху валика: тонкий, прерывистый — эмаль не зеркало. -->
            <path d="M${f(X0 + 24)} ${f(top + 3.2)}H${f(cx - 60)}M${f(cx - 34)} ${f(top + 3.2)}H${f(cx + 140)}"
                  fill="none" stroke="${E[5]}" stroke-width="1.8" stroke-linecap="round"/>
        </g>`;
    }
};
