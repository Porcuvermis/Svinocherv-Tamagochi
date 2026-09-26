// ================= МЫЛО: ЛЕСТНИЦА ВИДА =================
// Мыло прокачивает ширину мазка и долготу чистоты, и с каждой покупкой
// меняется сам ПРЕДМЕТ, а не оттенок: засохший обмылок → брусок → флакон →
// колба → хрустальный флакон (docs/plan/21-lust-bath.md, разд. 5в).
//
// Одна вещь в трёх местах: на полке, в руке и на иконке магазина. Поэтому
// предмет рисуется в координатах СЦЕНЫ вокруг гнезда мыла, как рисовался
// запечённый брусок: рука (BATH_ART.held) и иконка сдвигают его на гнездо
// сами и ничего не знают о ступенях.
//
// Гнездо и зона захвата не двигаются от ступени — меняется только картинка.

const BATH_SOAP = {
    // Вид на каждой ступени. Ещё не нарисованные ступени берут запечённый
    // брусок — пока лестница не закончена.
    TIERS: ['stub', 'bar', 'toilet', 'pump', 'gel', 'premium', 'elixir', 'flask', 'magic'],
    uid: 0,

    level() {
        if (typeof GameState === 'undefined' || !GameState.upgradeLevel || typeof Backend === 'undefined') return 0;
        return GameState.upgradeLevel(Backend.upgradeKey('lust', 'soap')) || 0;
    },
    tier(level) {
        const L = level == null ? this.level() : level;
        return Math.max(0, Math.min(this.TIERS.length - 1, L | 0));
    },

    // where === 'shelf' — предмет на полке: у него есть то, чего нет в руке
    // и на иконке (сопля обмылка из корзины).
    draw(level, where) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'stub') return this.stub(where);
        if (kind === 'bar') return this.bar();
        if (kind === 'toilet') return this.toilet(where);
        if (kind === 'pump') return this.pump();
        if (kind === 'gel') return this.gel();
        if (kind === 'premium') return this.premium();
        if (kind === 'elixir') return this.elixir();
        if (kind === 'flask') return this.flask();
        if (kind === 'magic') { this.wake(); return this.magic(); }
        return BATH_BAKED.draw('soap');
    },

    // Габарит на сцене — по нему иконка магазина ужимает вещь под клетку.
    box(level) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'stub') return { x: 546, y: 322, w: 60, h: 44 };
        if (kind === 'bar') return { x: 536, y: 314, w: 92, h: 64 };
        if (kind === 'toilet') return { x: 532, y: 313, w: 84, h: 38 };
        if (kind === 'pump') return { x: 550, y: 284, w: 54, h: 90 };
        if (kind === 'gel') return { x: 548, y: 276, w: 52, h: 100 };
        if (kind === 'premium') return { x: 551, y: 272, w: 46, h: 104 };
        if (kind === 'elixir') return { x: 548, y: 270, w: 62, h: 106 };
        if (kind === 'flask') return { x: 544, y: 280, w: 60, h: 96 };
        if (kind === 'magic') return { x: 546, y: 264, w: 56, h: 112 };
        return BATH_BAKED.box('soap');
    },

    // Полка перерисовывается после покупки и после debug-панели: ступень
    // меняется, пока ванная открыта.
    refresh() {
        const el = typeof document !== 'undefined' && document.getElementById('bt-soap-art');
        if (el) el.innerHTML = this.draw(null, 'shelf');
    },

    // Многоугольник со скруглёнными вершинами: у мыла острых углов нет.
    roundPoly(pts, q) {
        const pt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
        let d = '';
        for (let i = 0; i < pts.length; i++) {
            const a = pts[(i + pts.length - 1) % pts.length], p = pts[i], c = pts[(i + 1) % pts.length];
            const ka = Math.min(0.5, q / Math.hypot(a[0] - p[0], a[1] - p[1]));
            const kc = Math.min(0.5, q / Math.hypot(c[0] - p[0], c[1] - p[1]));
            const p0 = [p[0] + (a[0] - p[0]) * ka, p[1] + (a[1] - p[1]) * ka];
            const p1 = [p[0] + (c[0] - p[0]) * kc, p[1] + (c[1] - p[1]) * kc];
            d += (i ? 'L' : 'M') + pt(p0) + 'Q' + pt(p) + ' ' + pt(p1);
        }
        return d + 'Z';
    },

    // ---------- 8. ВОЛШЕБНЫЙ ФЛАКОН ----------
    // Вершина лестницы. Хрустальный гранёный флакон, и в нём — не жижа, а
    // маленький космос. Две изюминки:
    //   * ПРОБКА ПАРИТ. Кристалл-аметист висит над открытым горлом, и держат
    //     его светящиеся пузыри пара, поднимающиеся из флакона: он
    //     покачивается и поворачивается, пузыри обтекают его и тают выше.
    //   * ВНУТРИ ПЛАВАЕТ ДУХ СВИНОЧЕРВЯ. Крошечный светящийся червь — голова
    //     с ушками и пятачком, звенья за ней — плывёт восьмёркой сквозь
    //     звёздную туманность и изгибается на ходу. Мыло этой ступени — из
    //     того же вещества, что сам персонаж.
    // Хрусталь: грани разной яркости (свет сверху-слева), у части —
    // радужный отлив (дисперсия), рёбра светлые, а не чернильные.
    //
    // Живость — покадрово из кода (wake/tick), до 30 кадров, и только
    // transform, координаты и fill-opacity мелких узлов: ни фильтра, ни
    // маски, ни прозрачности группы на живом слое (docs/traps.md, п. 73).
    // Ванная закрылась — цикл стоит (lust.js, close → stop).
    MAGIC: {
        stopperY: -62,              // центр пробки: зазор над кольцом ~12, иначе парение не читается
        // Восьмёрка духа: ниже сетка корзины (с локальной 12), выше —
        // поверхность (−13) и уши не должны её пробивать.
        worm: (s) => ({ x: 12 * Math.sin(s), y: 0.5 + 4.5 * Math.sin(2 * s) }),
        SEG: [2.4, 2.1, 1.8, 1.45, 1.1],
        STARS: 12, BUBS: 5,
        SPARKS: [[-30, -30], [31, -18], [-32, -4], [31, 2], [-22, -52], [24, -60]]   // все выше сетки корзины
    },

    // Покадровая геометрия — одна функция и для первого кадра (строкой),
    // и для живого (атрибутами): картинка в магазине и на полке совпадают.
    magicFrame(t) {
        const M = this.MAGIC, out = {};
        out.stopper = `translate(0 ${(Math.sin(t * 1.6) * 2.2).toFixed(2)}) rotate(${(Math.sin(t * 0.9) * 5).toFixed(2)} 0 ${M.stopperY})`;
        const k = 1 + 0.06 * Math.sin(t * 1.3);
        out.halo = `translate(0 2) scale(${k.toFixed(3)}) translate(0 -2)`;
        out.neb = `rotate(${((t * 9) % 360).toFixed(1)} 0 8)`;
        out.stars = [];
        for (let i = 0; i < M.STARS; i++) out.stars.push((0.25 + 0.75 * Math.abs(Math.sin(t * 1.7 + i * 1.9))).toFixed(2));
        out.sparks = M.SPARKS.map(([x, y], i) => {
            const v = Math.max(0, Math.sin(t * 1.4 + i * 2.3));
            return { tr: `translate(${x} ${y}) scale(${(0.25 + 0.75 * v).toFixed(3)})`, o: (0.15 + 0.85 * v).toFixed(2) };
        });
        out.bubs = [];
        for (let i = 0; i < M.BUBS; i++) {
            const u = (t * 0.28 + i / M.BUBS) % 1;
            const side = i % 2 ? 1 : -1;
            // Пузыри обтекают пробку: расходятся в стороны, пока идут мимо неё.
            const around = Math.sin(Math.min(1, u / 0.6) * Math.PI) * 10;
            out.bubs.push({
                x: (side * around + Math.sin(u * 7 + i) * 2.2).toFixed(2),
                y: (-37 - u * 66).toFixed(2),
                r: (1.3 + u * 2.4).toFixed(2),
                o: (u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.12) / 0.88)).toFixed(2)
            });
        }
        const s = t * 0.75, P = [];
        for (let i = 0; i <= M.SEG.length; i++) P.push(M.worm(s - i * 0.26));
        const h = P[0], hb = M.worm(s - 0.06);
        const ang = Math.atan2(h.y - hb.y, h.x - hb.x) * 180 / Math.PI;
        const flip = Math.abs(ang) > 90 ? -1 : 1;
        out.head = `translate(${h.x.toFixed(2)} ${h.y.toFixed(2)}) rotate(${ang.toFixed(1)}) scale(1 ${flip})`;
        out.segs = P.slice(1).map(p => ({ x: p.x.toFixed(2), y: p.y.toFixed(2) }));
        out.aura = { x: h.x.toFixed(2), y: h.y.toFixed(2) };
        return out;
    },

    magic() {
        const P = btPal(), C = P.soapCosmos, D = C.deep, Am = C.amethyst, Au = P.soapGold, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap, M = this.MAGIC;
        const f = (v) => v.toFixed(1);
        const Fr = this.magicFrame(0);

        // Силуэт кристалла: плечи, широкий пояс, гранёный низ.
        const O = [[-5, -33], [-5, -27], [-13, -22], [-21, -12], [-24, 3], [-19, 19], [-9, 29],
                   [9, 29], [19, 19], [24, 3], [21, -12], [13, -22], [5, -27], [5, -33]];
        const poly = (pts) => 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';
        const body = poly(O);
        const inner = poly(O.map(([x, y]) => [x * 0.88, y < 0 ? y * 0.95 + 0.5 : y * 0.9]));
        const lv = -13;
        // Грани: внутренние точки «бриллианта» и тона граней. Свет сверху-
        // слева; у трёх граней — радужный отлив.
        const T = [0, -22], Lm = [-11, 3], Rm = [11, 3], Bm = [0, 24];
        const facets = [
            [[[-13, -22], [-21, -12], Lm], C.glow, 0.22],
            [[[-21, -12], [-24, 3], Lm], C.cyan, 0.16],
            [[[-24, 3], [-19, 19], Lm], C.glow, 0.07],
            [[[-19, 19], [-9, 29], Bm, Lm], C.glow, 0.03],
            [[[-13, -22], Lm, T], C.glow, 0.13],
            [[T, Lm, Bm, Rm], C.glow, 0.05],
            [[[13, -22], [21, -12], Rm], C.pink, 0.12],
            [[[21, -12], [24, 3], Rm], C.glow, 0.04],
            [[[24, 3], [19, 19], Rm], Am[2], 0.14],
            [[[19, 19], [9, 29], Bm, Rm], C.glow, 0.02],
            [[[13, -22], Rm, T], C.glow, 0.07],
            [[[-9, 29], [9, 29], Bm], C.glow, 0.04]
        ];
        let facetFill = '', ridges = '';
        for (const [pts, col, a] of facets) facetFill += `<path d="${poly(pts)}" fill="${col}" fill-opacity="${a}"/>`;
        for (const q of [[-13, -22], [-21, -12], [-24, 3], [-19, 19], [-9, 29]]) ridges += `M${q[0]} ${q[1]}L${Lm[0]} ${Lm[1]}`;
        for (const q of [[13, -22], [21, -12], [24, 3], [19, 19], [9, 29]]) ridges += `M${q[0]} ${q[1]}L${Rm[0]} ${Rm[1]}`;
        ridges += `M${T[0]} ${T[1]}L${Lm[0]} ${Lm[1]}L${Bm[0]} ${Bm[1]}L${Rm[0]} ${Rm[1]}Z`
                + `M-13 -22L${T[0]} ${T[1]}L13 -22M-9 29L${Bm[0]} ${Bm[1]}L9 29`;

        // Звёзды и туманность — из сида.
        const rnd = btRng(888);
        let stars = '';
        for (let i = 0; i < M.STARS; i++) {
            const x = -17 + rnd() * 34, y = lv + 3 + rnd() * 36, r = 0.35 + rnd() * 0.65;
            stars += `<circle class="bsm-star" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${C.glow}" fill-opacity="${Fr.stars[i]}"/>`;
        }
        const star4 = (r) => `M0 ${-r}Q0.25 -0.25 ${r} 0Q0.25 0.25 0 ${r}Q-0.25 0.25 ${-r} 0Q-0.25 -0.25 0 ${-r}Z`;

        // Дух свиночервя: голова смотрит вдоль +x.
        // Уши с розовым нутром и пятачок — по ним дух узнаётся свиночервем,
        // а не белой гусеницей.
        const head = `<path d="M-2.2 -2.6L-3.6 -6.6L-0.2 -3.4ZM0.8 -3.2L0.8 -7L3 -2.6Z" fill="${C.glow}"/>`
            + `<path d="M-2.2 -3.4L-3 -5.6L-1 -3.7ZM1.2 -3.5L1.2 -5.9L2.4 -3.2Z" fill="${C.pink}"/>`
            + `<circle r="3.7" fill="${C.glow}"/>`
            + `<ellipse cx="3.6" cy="0.5" rx="1.6" ry="1.4" fill="${C.pink}"/>`
            + `<circle cx="4" cy="0.1" r="0.35" fill="${D[1]}"/><circle cx="4" cy="0.95" r="0.35" fill="${D[1]}"/>`
            + `<circle cx="1.2" cy="-1.1" r="0.55" fill="${D[1]}"/>`;
        const segs = M.SEG.map((r, i) =>
            `<circle class="bsm-seg" cx="${Fr.segs[i].x}" cy="${Fr.segs[i].y}" r="${r}" fill="${C.glow}" fill-opacity="${(0.95 - i * 0.12).toFixed(2)}"/>`).reverse().join('');

        const bubs = Fr.bubs.map(b =>
            `<g class="bsm-bub" transform="translate(${b.x} ${b.y})"><circle r="${b.r}" fill="${C.cyan}" fill-opacity="${(b.o * 0.5).toFixed(2)}" stroke="${C.glow}" stroke-width="0.9" stroke-opacity="${b.o}"/></g>`).join('');
        const sparks = Fr.sparks.map(sp =>
            `<path class="bsm-spark" d="${star4(4)}" transform="${sp.tr}" fill="${C.glow}" fill-opacity="${sp.o}"/>`).join('');

        // Пробка-аметист: гранёный кристалл, острым концом вниз.
        const SY = M.stopperY;
        const stopper = `M0 ${SY + 13}L-7 ${SY + 3}L-5.5 ${SY - 7}L0 ${SY - 13}L5.5 ${SY - 7}L7 ${SY + 3}Z`;

        return `
        <g class="bt-soap bt-soap-magic" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <radialGradient id="${id}-halo" gradientUnits="userSpaceOnUse" cx="0" cy="2" r="62">
                    <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.6"/>
                    <stop offset="0.35" stop-color="${Am[2]}" stop-opacity="0.34"/>
                    <stop offset="1" stop-color="${Am[2]}" stop-opacity="0"/>
                </radialGradient>
                <!-- Космос: светлая бирюза под поверхностью уходит в индиго. -->
                <linearGradient id="${id}-deep" gradientUnits="userSpaceOnUse" x1="0" y1="${lv}" x2="0" y2="29">
                    <stop offset="0" stop-color="${D[3]}"/>
                    <stop offset="0.35" stop-color="${D[2]}"/>
                    <stop offset="1" stop-color="${D[0]}"/>
                </linearGradient>
                <radialGradient id="${id}-nebA" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="${C.pink}" stop-opacity="0.75"/>
                    <stop offset="1" stop-color="${C.pink}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-nebB" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.7"/>
                    <stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-aura" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="${C.glow}" stop-opacity="0.8"/>
                    <stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-vapor" gradientUnits="userSpaceOnUse" cx="0" cy="-42" r="12"
                                gradientTransform="translate(0 -42) scale(0.8 1) translate(0 42)">
                    <stop offset="0" stop-color="${C.glow}" stop-opacity="0.8"/>
                    <stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="${id}-ame" gradientUnits="userSpaceOnUse" x1="-7" y1="0" x2="7" y2="0">
                    <stop offset="0" stop-color="${Am[1]}"/>
                    <stop offset="0.35" stop-color="${Am[3]}"/>
                    <stop offset="0.55" stop-color="${Am[2]}"/>
                    <stop offset="1" stop-color="${Am[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-gold" gradientUnits="userSpaceOnUse" x1="-7.5" y1="0" x2="7.5" y2="0">
                    <stop offset="0" stop-color="${Au[0]}"/>
                    <stop offset="0.25" stop-color="${Au[4]}"/>
                    <stop offset="0.5" stop-color="${Au[2]}"/>
                    <stop offset="1" stop-color="${Au[0]}"/>
                </linearGradient>
                <clipPath id="${id}-in"><path d="${inner}"/></clipPath>
            </defs>
            <!-- Ореол дышит. -->
            <circle class="bsm-halo" cx="0" cy="2" r="62" fill="url(#${id}-halo)" transform="${Fr.halo}"/>
            <!-- Искры вокруг. -->
            ${sparks}
            <path d="${body}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <!-- Хрусталь пустой (над жижей) — светлый, чуть голубой. -->
            <path d="${body}" fill="${C.crystal}" fill-opacity="0.6"/>
            <g clip-path="url(#${id}-in)">
                <rect x="-26" y="${lv}" width="52" height="44" fill="url(#${id}-deep)"/>
                <g class="bsm-neb" transform="${Fr.neb}">
                    <ellipse cx="-7" cy="4" rx="13" ry="7" fill="url(#${id}-nebA)" transform="rotate(-25 -7 4)"/>
                    <ellipse cx="8" cy="14" rx="12" ry="6" fill="url(#${id}-nebB)" transform="rotate(20 8 14)"/>
                    <ellipse cx="4" cy="-4" rx="8" ry="4" fill="url(#${id}-nebB)"/>
                </g>
                ${stars}
                <!-- Дух свиночервя: свечение вокруг головы, звенья, голова. -->
                <circle class="bsm-aura" cx="${Fr.aura.x}" cy="${Fr.aura.y}" r="10" fill="url(#${id}-aura)"/>
                ${segs}
                <g class="bsm-head" transform="${Fr.head}">${head}</g>
                <!-- Поверхность снизу: светлый эллипс. -->
                <ellipse cx="0" cy="${lv}" rx="19" ry="2.2" fill="${C.cyan}" fill-opacity="0.45" stroke="${C.glow}" stroke-width="0.9"/>
            </g>
            <!-- Грани поверх: каждая своей яркости, у трёх — радуга. -->
            ${facetFill}
            <path d="${ridges}" fill="none" stroke="${C.glow}" stroke-width="0.6" stroke-opacity="0.55" stroke-linejoin="round"/>
            <path d="M-18 -15L-22 1" stroke="${C.glow}" stroke-width="1.6" stroke-opacity="0.95" stroke-linecap="round"/>
            <path d="M-11 -20L-15 -15" stroke="${C.glow}" stroke-width="1.1" stroke-opacity="0.8" stroke-linecap="round"/>
            <path d="${body}" fill="none" stroke="${C.glow}" stroke-width="0.8" stroke-opacity="0.6" stroke-linejoin="round"/>
            <!-- Золотое кольцо на горле с камушком. -->
            <path d="M-7 -36H7Q8 -36 8 -35V-32.5Q8 -31.5 7 -31.5H-7Q-8 -31.5 -8 -32.5V-35Q-8 -36 -7 -36Z" fill="url(#${id}-gold)" stroke="${ink}" stroke-width="1.2"/>
            <circle cx="0" cy="-33.8" r="1.3" fill="${C.pink}" stroke="${Au[0]}" stroke-width="0.5"/>
            <circle cx="-0.4" cy="-34.2" r="0.4" fill="${C.glow}"/>
            <!-- Пар из открытого горла: он и держит пробку. -->
            <ellipse cx="0" cy="-42" rx="9.6" ry="12" fill="url(#${id}-vapor)"/>
            ${bubs}
            <!-- Пробка парит. -->
            <g class="bsm-stopper" transform="${Fr.stopper}">
                <path d="${stopper}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.structure}" stroke-linejoin="round"/>
                <path d="${stopper}" fill="url(#${id}-ame)"/>
                <path d="M0 ${SY + 13}L-2 ${SY + 3}L0 ${SY - 13}M0 ${SY + 13}L2 ${SY + 3}L0 ${SY - 13}M-7 ${SY + 3}H7M-5.5 ${SY - 7}L-2 ${SY + 3}M5.5 ${SY - 7}L2 ${SY + 3}"
                      fill="none" stroke="${Am[3]}" stroke-width="0.6" stroke-opacity="0.8"/>
                <path d="M-5 ${SY - 5}L-3 ${SY - 10}" stroke="${C.glow}" stroke-width="1.2" stroke-linecap="round"/>
                <circle cx="0" cy="${SY + 3}" r="1" fill="${C.glow}"/>
            </g>
        </g>`;
    },

    // ---------- живость флакона ----------
    live: { raf: 0, last: 0, cache: new WeakMap() },

    // Проснуться: цикл нужен, пока на экране есть живой флакон. Зовётся из
    // draw, поэтому узлы появятся чуть позже — первый кадр подождёт.
    wake() {
        if (this.live.raf || typeof requestAnimationFrame === 'undefined') return;
        const step = (now) => {
            const roots = document.querySelectorAll('.bt-soap-magic');
            if (!roots.length) { this.live.raf = 0; return; }
            // 30 кадров хватает: флакон — украшение, а не игра.
            if (now - this.live.last >= 33) {
                this.live.last = now;
                const Fr = this.magicFrame(now / 1000);
                roots.forEach(r => this.applyFrame(r, Fr));
            }
            this.live.raf = requestAnimationFrame(step);
        };
        this.live.raf = requestAnimationFrame(step);
    },

    stop() {
        if (this.live.raf) cancelAnimationFrame(this.live.raf);
        this.live.raf = 0;
    },

    applyFrame(root, Fr) {
        let c = this.live.cache.get(root);
        if (!c) {
            const q = (sel) => Array.from(root.querySelectorAll(sel));
            c = { stopper: root.querySelector('.bsm-stopper'), halo: root.querySelector('.bsm-halo'),
                  neb: root.querySelector('.bsm-neb'), head: root.querySelector('.bsm-head'),
                  aura: root.querySelector('.bsm-aura'), stars: q('.bsm-star'), segs: q('.bsm-seg').reverse(),
                  bubs: q('.bsm-bub'), sparks: q('.bsm-spark') };
            c.bubC = c.bubs.map(g => g.firstChild);
            this.live.cache.set(root, c);
        }
        const set = (el, k, v) => { if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); };
        set(c.stopper, 'transform', Fr.stopper);
        set(c.halo, 'transform', Fr.halo);
        set(c.neb, 'transform', Fr.neb);
        set(c.head, 'transform', Fr.head);
        set(c.aura, 'cx', Fr.aura.x); set(c.aura, 'cy', Fr.aura.y);
        c.stars.forEach((el, i) => set(el, 'fill-opacity', Fr.stars[i]));
        c.segs.forEach((el, i) => { set(el, 'cx', Fr.segs[i].x); set(el, 'cy', Fr.segs[i].y); });
        c.sparks.forEach((el, i) => { set(el, 'transform', Fr.sparks[i].tr); set(el, 'fill-opacity', Fr.sparks[i].o); });
        c.bubs.forEach((g, i) => {
            const b = Fr.bubs[i], ci = c.bubC[i];
            set(g, 'transform', `translate(${b.x} ${b.y})`);
            set(ci, 'r', b.r);
            set(ci, 'fill-opacity', (b.o * 0.5).toFixed(2));
            set(ci, 'stroke-opacity', b.o);
        });
    },

    // ---------- 7. КОЛБА ----------
    // Алхимическая колба с круглым дном: светящаяся розовая жижа, пузыри,
    // пробка под сургучом. Качество — по уроку эликсира: толщина стекла,
    // блики слоями, свечение КОНТРАСТОМ.
    //   * шар тонкого прозрачного стекла: края плотнее, изгибом идёт
    //     блик-окошко — главный признак сферы; внутренняя стенка линией;
    //   * жижа светится: белёсое ядро, густые малиновые края, мениск снизу
    //     светлым эллипсом, розовый отсвет по стенке шара;
    //   * пузыри столбиком поднимаются со дна, кверху крупнее. Неподвижные:
    //     бесконечная css-анимация внутри общего svg красит всю сцену
    //     (docs/traps.md, пп. 36–38) — оживлять будем на ступени 8 иначе;
    //   * пробка — корка, сверху сургуч с потёками по горлу;
    //   * стоит на пробковом кольце — круглое дно само не стоит (на полке
    //     кольцо за сеткой, видно в руке);
    //   * ореол сильнее, чем у эликсира: волшебства больше.
    flask() {
        const P = btPal(), M = P.soapMagic, G = P.soapBottle, Ck = P.soapCork, Wx = P.soapWax, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        const R = 23, CY = 5;                      // шар
        const NX = 5.5, NT = -45;                  // горло
        const ny = CY - Math.sqrt(R * R - NX * NX);  // где горло входит в шар
        const flask = `M${-NX} ${f(ny)}A${R} ${R} 0 1 0 ${NX} ${f(ny)}V${NT}H${-NX}Z`;
        const innerR = R - 1.8;
        // Налита высоко: нижнюю половину шара закрывает сетка корзины, и
        // при уровне посередине над сеткой светилась одна полоска.
        const lv = -11;
        const half = Math.sqrt(innerR * innerR - (lv - CY) * (lv - CY));
        const liq = `M${f(-half)} ${lv}A${innerR} ${innerR} 0 1 0 ${f(half)} ${lv}Z`;
        // Раструб горла и пробка.
        const lipD = `M-7.5 ${NT}Q-8.5 ${NT} -8.5 ${NT - 1.5}Q-8.5 ${NT - 3} -7 ${NT - 3}H7Q8.5 ${NT - 3} 8.5 ${NT - 1.5}Q8.5 ${NT} 7.5 ${NT}Z`;
        const cork = `M-5 ${NT - 2}L-6.6 ${NT - 11}Q-6.6 ${NT - 12.5} -5 ${NT - 12.5}H5Q6.6 ${NT - 12.5} 6.6 ${NT - 11}L5 ${NT - 2}Z`;
        // Сургуч: шапка на пробке и раструбе, два потёка по горлу.
        const wax = `M-8 ${NT - 9}Q-8.4 ${NT - 14.5} 0 ${NT - 15}Q8.4 ${NT - 14.5} 8 ${NT - 9}`
                  + `L8.6 ${NT - 1}Q8.8 ${NT + 1} 7.4 ${NT + 1.2}L6.6 ${NT + 1.2}Q6.2 ${NT + 6} 5.2 ${NT + 6.5}Q4 ${NT + 6} 4.2 ${NT + 1.4}`
                  + `L-2.5 ${NT + 1.4}Q-2.8 ${NT + 3.6} -3.6 ${NT + 3.8}Q-4.5 ${NT + 3.5} -4.6 ${NT + 1.3}L-7.6 ${NT + 1}Q-8.8 ${NT + 0.8} -8.6 ${NT - 1}Z`;
        // Пробковое кольцо под шаром.
        const ring = `M-15 ${CY + R - 3}Q0 ${CY + R - 6} 15 ${CY + R - 3}L16 ${CY + R + 1.5}Q0 ${CY + R + 5} -16 ${CY + R + 1.5}Z`;

        // Пузыри: столбиком от дна к поверхности, кверху крупнее, и россыпь.
        const rnd = btRng(707);
        let bub = '';
        const bubble = (x, y, r) =>
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${M[4]}" fill-opacity="0.25" stroke="${M[4]}" stroke-width="0.6" stroke-opacity="0.9"/>`
          + `<circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(Math.max(0.35, r * 0.28))}" fill="${F.hi}"/>`;
        for (let i = 0; i < 7; i++) {
            const t = i / 6, y = CY + R - 5 - t * (CY + R - 5 - lv - 3), x = -2 + Math.sin(i * 1.7) * 1.8, r = 0.8 + t * 1.9;
            bub += bubble(x, y, r);
        }
        for (let i = 0; i < 6; i++) {
            const a = rnd() * Math.PI * 2, d = 5 + rnd() * 11;
            const x = Math.cos(a) * d, y = CY + 6 + Math.sin(a) * d * 0.7;
            if (y > lv + 3) bub += bubble(x, y, 0.6 + rnd() * 1.1);
        }
        let motes = '';
        for (let i = 0; i < 7; i++) {
            const x = -15 + rnd() * 30, y = lv + 5 + rnd() * 20;
            motes += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.35 + rnd() * 0.6)}" fill="${M[4]}"/>`;
        }
        let pores = '';
        for (let i = 0; i < 8; i++) pores += `<circle cx="${f(-4.5 + rnd() * 9)}" cy="${f(NT - 3.5 - rnd() * 5)}" r="0.45" fill="${Ck[0]}"/>`;

        return `
        <g class="bt-soap bt-soap-flask" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <radialGradient id="${id}-halo" gradientUnits="userSpaceOnUse" cx="0" cy="${CY}" r="58">
                    <stop offset="0" stop-color="${M[2]}" stop-opacity="0.6"/>
                    <stop offset="0.45" stop-color="${M[2]}" stop-opacity="0.22"/>
                    <stop offset="1" stop-color="${M[2]}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-halo2" gradientUnits="userSpaceOnUse" cx="0" cy="${CY + 4}" r="32">
                    <stop offset="0" stop-color="${M[3]}" stop-opacity="0.65"/>
                    <stop offset="1" stop-color="${M[3]}" stop-opacity="0"/>
                </radialGradient>
                <!-- Жижа: белёсое ядро, густые края — свет, а не краска. -->
                <radialGradient id="${id}-liq" gradientUnits="userSpaceOnUse" cx="-3" cy="${CY + 6}" r="${R}">
                    <stop offset="0" stop-color="${M[4]}"/>
                    <stop offset="0.2" stop-color="${M[3]}"/>
                    <stop offset="0.55" stop-color="${M[2]}"/>
                    <stop offset="0.85" stop-color="${M[1]}"/>
                    <stop offset="1" stop-color="${M[0]}"/>
                </radialGradient>
                <!-- Стекло шара: прозрачная середина, плотные края. -->
                <radialGradient id="${id}-glass" gradientUnits="userSpaceOnUse" cx="0" cy="${CY}" r="${R}">
                    <stop offset="0" stop-color="${G.wall}" stop-opacity="0.12"/>
                    <stop offset="0.75" stop-color="${G.wall}" stop-opacity="0.25"/>
                    <stop offset="1" stop-color="${G.edge}" stop-opacity="0.85"/>
                </radialGradient>
                <linearGradient id="${id}-neck" gradientUnits="userSpaceOnUse" x1="${-NX}" y1="0" x2="${NX}" y2="0">
                    <stop offset="0" stop-color="${G.edge}" stop-opacity="0.85"/>
                    <stop offset="0.35" stop-color="${G.wall}" stop-opacity="0.25"/>
                    <stop offset="1" stop-color="${G.edge}" stop-opacity="0.9"/>
                </linearGradient>
                <linearGradient id="${id}-cork" gradientUnits="userSpaceOnUse" x1="-6.6" y1="0" x2="6.6" y2="0">
                    <stop offset="0" stop-color="${Ck[0]}"/>
                    <stop offset="0.35" stop-color="${Ck[2]}"/>
                    <stop offset="1" stop-color="${Ck[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-wax" gradientUnits="userSpaceOnUse" x1="-8.6" y1="0" x2="8.6" y2="0">
                    <stop offset="0" stop-color="${Wx[0]}"/>
                    <stop offset="0.3" stop-color="${Wx[2]}"/>
                    <stop offset="0.6" stop-color="${Wx[1]}"/>
                    <stop offset="1" stop-color="${Wx[0]}"/>
                </linearGradient>
                <clipPath id="${id}-ball"><circle cx="0" cy="${CY}" r="${R}"/></clipPath>
            </defs>
            <circle cx="0" cy="${CY}" r="58" fill="url(#${id}-halo)"/>
            <circle cx="0" cy="${CY + 4}" r="32" fill="url(#${id}-halo2)"/>

            <path d="${ring}${flask}${lipD}${wax}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <!-- Пробковое кольцо (на полке — за сеткой). -->
            <path d="${ring}" fill="url(#${id}-cork)"/>
            <!-- Жижа и всё, что в ней. -->
            <path d="${liq}" fill="url(#${id}-liq)"/>
            <g clip-path="url(#${id}-ball)">
                ${motes}
                ${bub}
                <!-- Мениск снизу: светлый эллипс. -->
                <ellipse cx="0" cy="${lv}" rx="${f(half)}" ry="2.6" fill="${M[3]}" fill-opacity="0.6" stroke="${M[4]}" stroke-width="1"/>
            </g>
            <!-- Стекло поверх: шар и горло. -->
            <circle cx="0" cy="${CY}" r="${R}" fill="url(#${id}-glass)"/>
            <path d="M${-NX} ${NT}V${f(ny + 1)}H${NX}V${NT}Z" fill="url(#${id}-neck)"/>
            <g clip-path="url(#${id}-ball)">
                <!-- Толщина стенки и розовый отсвет жижи по ней. -->
                <circle cx="0" cy="${CY}" r="${innerR}" fill="none" stroke="${G.hi}" stroke-width="0.7" stroke-opacity="0.6"/>
                <path d="M${f(-half)} ${lv + 1}A${innerR} ${innerR} 0 0 0 ${f(half)} ${lv + 1}" fill="none" stroke="${M[3]}" stroke-width="2.4" stroke-opacity="0.5"/>
                <!-- Блик-окошко изгибом по сфере — главный признак шара. -->
                <path d="M-17 -7C-15 -12 -11 -15.5 -6 -17L-5 -14.2C-9 -13 -12 -10.5 -14 -6.4Z" fill="${F.hi}" fill-opacity="0.85"/>
                <path d="M-19.5 1Q-20 5 -18.8 9" fill="none" stroke="${F.hi}" stroke-width="1.4" stroke-opacity="0.8" stroke-linecap="round"/>
                <!-- Отражение снизу справа — слабее. -->
                <path d="M11 22Q16 19 18.5 13" fill="none" stroke="${F.hi}" stroke-width="1.6" stroke-opacity="0.45" stroke-linecap="round"/>
            </g>
            <!-- Горло: стенки и блик. -->
            <path d="M${-NX + 1.6} ${NT + 1}V${f(ny + 2)}" stroke="${F.hi}" stroke-width="1.3" stroke-opacity="0.85" stroke-linecap="round"/>
            <path d="M${NX - 1.2} ${NT + 1}V${f(ny + 2)}" stroke="${G.edge}" stroke-width="0.8"/>
            <path d="M${-NX} ${f(ny)}A${R} ${R} 0 1 0 ${NX} ${f(ny)}" fill="none" stroke="${mixColor(ink, G.edge, 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Раструб, пробка, сургуч. -->
            <path d="${lipD}" fill="url(#${id}-neck)" stroke="${G.edge}" stroke-width="0.6"/>
            <path d="${cork}" fill="url(#${id}-cork)"/>
            ${pores}
            <path d="${wax}" fill="url(#${id}-wax)"/>
            <path d="M-5.5 ${NT - 12.5}Q-2 ${NT - 14} 2.5 ${NT - 13.4}" fill="none" stroke="${Wx[2]}" stroke-width="1.3" stroke-linecap="round"/>
            <ellipse cx="-3.8" cy="${NT - 11.2}" rx="1.4" ry="0.7" fill="${F.hi}" fill-opacity="0.7" transform="rotate(-20 -3.8 ${NT - 11.2})"/>
            <!-- Оттиск печати на сургуче: кружок со звездой. -->
            <circle cx="0.5" cy="${NT - 6}" r="3.2" fill="none" stroke="${Wx[0]}" stroke-width="0.8"/>
            <path d="M0.5 ${NT - 8.2}L1.1 ${NT - 6.6}L2.7 ${NT - 6.6}L1.4 ${NT - 5.6}L1.9 ${NT - 4}L0.5 ${NT - 5}L-0.9 ${NT - 4}L-0.4 ${NT - 5.6}L-1.7 ${NT - 6.6}L-0.1 ${NT - 6.6}Z" fill="${Wx[0]}"/>
        </g>`;
    },

    // ---------- 6. ЭЛИКСИР ----------
    // Аптечная склянка тёмного стекла с пипеткой — здесь мыло впервые
    // перестаёт быть бытовой химией. Первая версия была «слабой моделькой»:
    // янтарный прямоугольник, жижа ровной полосой, пипетка из чёрных
    // брусков, этикетка за сеткой. Что держит качество теперь:
    //   * СТЕКЛО: видна толщина — внутренняя стенка светлой линией и толстое
    //     дно; края тёмные (там взгляд проходит больше стекла), середина
    //     прозрачная; блики двумя слоями (широкий мягкий и узкий резкий),
    //     окошко на плече; венчик-валик на горле;
    //   * ЖИЖА светится изнутри: ядро ярче краёв, мениск снизу — светлый
    //     эллипс (поверхность ловит свет изнутри), в толще — искры, по
    //     стенкам — зелёный отсвет, в толстом дне — светлый серп;
    //   * трубка пипетки на входе в жижу смещена — преломление;
    //   * пипетка: воротник с мелким рифлением и скруглённым верхом, груша
    //     с раструбом и двумя кольцами у основания;
    //   * бирка на бечёвке висит с плеча — поверх сетки её видно всегда
    //     (наклеенная этикетка пряталась за сеткой);
    //   * ореол двумя слоями — широкий слабый и тесный поярче. Градиенты, без
    //     фильтра (docs/traps.md, п. 73).
    elixir() {
        const P = btPal(), Am = P.soapAmber, Gl = P.soapGlow, Pa = P.soapParch, Ru = P.soapRubber, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        // Бостонская круглая склянка: прямые бока, круглые плечи, горло.
        const bottle = (bx, bot, r, sh, nx, ny) =>
            `M${-bx} ${bot - r}V${sh}C${-bx} ${sh - 9} ${-nx - 6} ${ny + 1} ${-nx} ${ny}V${ny - 7}H${nx}V${ny}`
          + `C${nx + 6} ${ny + 1} ${bx} ${sh - 9} ${bx} ${sh}V${bot - r}Q${bx} ${bot} ${bx - r} ${bot}H${-bx + r}Q${-bx} ${bot} ${-bx} ${bot - r}Z`;
        const BX = 22, BOT = 29, SH = -14, NX = 7.5, NY = -30;
        const body = bottle(BX, BOT, 5, SH, NX, NY);
        const inner = bottle(BX - 2.6, BOT - 5, 4, SH, NX - 2.4, NY + 2);   // полость: стенки и толстое дно
        const lv = -8;                                                       // уровень жижи
        const lip = `M-9.5 ${NY - 7}Q-10.5 ${NY - 7} -10.5 ${NY - 8.8}Q-10.5 ${NY - 10.5} -9.5 ${NY - 10.5}H9.5Q10.5 ${NY - 10.5} 10.5 ${NY - 8.8}Q10.5 ${NY - 7} 9.5 ${NY - 7}Z`;
        const CT = NY - 10.5, CB = CT - 10;                                  // воротник пипетки
        const collar = `M-10 ${CT}V${CB + 2}Q-10 ${CB} -8 ${CB}H8Q10 ${CB} 10 ${CB + 2}V${CT}Z`;
        const bulb = `M-7 ${CB}C-5 ${CB - 1} -4.8 ${CB - 2.5} -5 ${CB - 4}C-7.8 ${CB - 7} -8 ${CB - 13} -5.5 ${CB - 17}`
                   + `Q0 ${CB - 22} 5.5 ${CB - 17}C8 ${CB - 13} 7.8 ${CB - 7} 5 ${CB - 4}C4.8 ${CB - 2.5} 5 ${CB - 1} 7 ${CB}Z`;
        let ribs = '';
        for (let x = -8.6; x <= 8.7; x += 1.9) ribs += `M${f(x)} ${CB + 2.5}V${CT - 0.8}`;

        // Искры в жиже: из сида, мелкие; у двух — крестик.
        const rnd = btRng(606);
        let motes = '';
        for (let i = 0; i < 10; i++) {
            const x = -BX + 6 + rnd() * (2 * BX - 12), y = lv + 5 + rnd() * (BOT - lv - 14), r = 0.4 + rnd() * 0.8;
            motes += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${Gl[4]}" fill-opacity="${(0.6 + rnd() * 0.4).toFixed(2)}"/>`;
            if (i < 2) motes += `<path d="M${f(x - 2.6)} ${f(y)}H${f(x + 2.6)}M${f(x)} ${f(y - 2.6)}V${f(y + 2.6)}" stroke="${Gl[4]}" stroke-width="0.5" stroke-linecap="round"/>`;
        }
        // Бирка: форма бирки со срезанными углами, дырочка с кольцом.
        const tag = 'M0 0H11L13 2.5V15H0Z';

        return `
        <g class="bt-soap bt-soap-elixir" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <radialGradient id="${id}-halo" gradientUnits="userSpaceOnUse" cx="0" cy="8" r="52">
                    <stop offset="0" stop-color="${Gl[2]}" stop-opacity="0.6"/>
                    <stop offset="0.45" stop-color="${Gl[2]}" stop-opacity="0.24"/>
                    <stop offset="1" stop-color="${Gl[2]}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-halo2" gradientUnits="userSpaceOnUse" cx="0" cy="10" r="30">
                    <stop offset="0" stop-color="${Gl[3]}" stop-opacity="0.6"/>
                    <stop offset="1" stop-color="${Gl[3]}" stop-opacity="0"/>
                </radialGradient>
                <!-- Жижа светится изнутри: ядро светлее краёв. -->
                <!-- Свечение — это КОНТРАСТ: белёсое ядро и густые края.
                     Ровная мятная заливка читалась краской, а не светом. -->
                <radialGradient id="${id}-liq" gradientUnits="userSpaceOnUse" cx="-3" cy="6" r="21"
                                gradientTransform="translate(-3 6) scale(1.15 1) translate(3 -6)">
                    <stop offset="0" stop-color="${Gl[4]}"/>
                    <stop offset="0.18" stop-color="${Gl[3]}"/>
                    <stop offset="0.5" stop-color="${Gl[2]}"/>
                    <stop offset="0.82" stop-color="${Gl[1]}"/>
                    <stop offset="1" stop-color="${Gl[0]}"/>
                </radialGradient>
                <!-- Янтарь стекла поверх: края густые, середина прозрачная. -->
                <linearGradient id="${id}-amber" gradientUnits="userSpaceOnUse" x1="${-BX}" y1="0" x2="${BX}" y2="0">
                    <stop offset="0" stop-color="${Am[0]}" stop-opacity="0.95"/>
                    <stop offset="0.1" stop-color="${Am[1]}" stop-opacity="0.6"/>
                    <stop offset="0.3" stop-color="${Am[3]}" stop-opacity="0.18"/>
                    <stop offset="0.72" stop-color="${Am[3]}" stop-opacity="0.22"/>
                    <stop offset="0.9" stop-color="${Am[1]}" stop-opacity="0.65"/>
                    <stop offset="1" stop-color="${Am[0]}" stop-opacity="0.95"/>
                </linearGradient>
                <!-- Пустое стекло над жижей: тёмный янтарь. -->
                <linearGradient id="${id}-empty" gradientUnits="userSpaceOnUse" x1="${-BX}" y1="0" x2="${BX}" y2="0">
                    <stop offset="0" stop-color="${Am[0]}"/>
                    <stop offset="0.28" stop-color="${Am[3]}"/>
                    <stop offset="0.6" stop-color="${Am[2]}"/>
                    <stop offset="1" stop-color="${Am[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-rub" gradientUnits="userSpaceOnUse" x1="-10" y1="0" x2="10" y2="0">
                    <stop offset="0" stop-color="${Ru[0]}"/>
                    <stop offset="0.28" stop-color="${Ru[2]}"/>
                    <stop offset="0.45" stop-color="${Ru[1]}"/>
                    <stop offset="1" stop-color="${Ru[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-lip" gradientUnits="userSpaceOnUse" x1="0" y1="${NY - 10.5}" x2="0" y2="${NY - 7}">
                    <stop offset="0" stop-color="${Am[4]}"/>
                    <stop offset="0.45" stop-color="${Am[2]}"/>
                    <stop offset="1" stop-color="${Am[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-tag" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="13" y2="15">
                    <stop offset="0" stop-color="${Pa[2]}"/>
                    <stop offset="1" stop-color="${Pa[1]}"/>
                </linearGradient>
                <clipPath id="${id}-in"><path d="${inner}"/></clipPath>
                <clipPath id="${id}-body"><path d="${body}"/></clipPath>
            </defs>
            <!-- Ореол на кафеле. -->
            <circle cx="0" cy="8" r="52" fill="url(#${id}-halo)"/>
            <circle cx="0" cy="10" r="30" fill="url(#${id}-halo2)"/>

            <path d="${body}${lip}${collar}${bulb}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <!-- Стекло: тёмное целиком, полость — светящаяся жижа. -->
            <path d="${body}" fill="url(#${id}-empty)"/>
            <g clip-path="url(#${id}-in)">
                <rect x="${-BX}" y="${lv}" width="${2 * BX}" height="${BOT - lv}" fill="url(#${id}-liq)"/>
                ${motes}
                <!-- Трубка пипетки: над жижей — стекло, в жиже — сдвинута
                     преломлением и налита светом. -->
                <path d="M-1.6 ${NY - 8}V${lv}M1.6 ${NY - 8}V${lv}" stroke="${Am[4]}" stroke-width="0.7" stroke-opacity="0.8"/>
                <path d="M-0.4 ${lv}V${BOT - 12}Q1 ${BOT - 9.5} 2.4 ${BOT - 12}V${lv}" fill="${Gl[4]}" fill-opacity="0.55" stroke="${Gl[1]}" stroke-width="0.6"/>
                <!-- Мениск снизу: светлый эллипс — поверхность ловит свет изнутри. -->
                <ellipse cx="0" cy="${lv}" rx="${BX - 2.6}" ry="2.4" fill="${Gl[3]}" fill-opacity="0.55" stroke="${Gl[4]}" stroke-width="1"/>
                <!-- Отсвет жижи по стенкам. -->
                <path d="${inner}" fill="none" stroke="${Gl[3]}" stroke-width="2.2" stroke-opacity="0.35"/>
            </g>
            <!-- Янтарь поверх всего тела: края густые. -->
            <path d="${body}" fill="url(#${id}-amber)"/>
            <g clip-path="url(#${id}-body)">
                <!-- Толщина стекла: внутренняя стенка светлой линией. -->
                <path d="${inner}" fill="none" stroke="${Am[4]}" stroke-width="0.8" stroke-opacity="0.55"/>
                <!-- Толстое дно: серп света от жижи. -->
                <path d="M${-BX + 6} ${BOT - 2.5}Q0 ${BOT - 0.5} ${BX - 6} ${BOT - 2.5}" fill="none" stroke="${Gl[3]}" stroke-width="1.6" stroke-opacity="0.8" stroke-linecap="round"/>
                <!-- Блики: широкий мягкий, узкий резкий, окошко на плече. -->
                <path d="M${-BX + 6.5} ${SH - 2}V${BOT - 8}" stroke="${F.hi}" stroke-width="5" stroke-opacity="0.16" stroke-linecap="round"/>
                <path d="M${-BX + 5} ${SH}V${BOT - 9}" stroke="${F.hi}" stroke-width="1.6" stroke-opacity="0.9" stroke-linecap="round"/>
                <path d="M${-BX + 9} ${SH + 3}V${SH + 9}" stroke="${F.hi}" stroke-width="1.2" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="M-17 ${SH - 7}C-15 ${SH - 12} -12 ${NY + 3} -9 ${NY + 1.5}" fill="none" stroke="${F.hi}" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
                <!-- Справа край ловит зелёный свет изнутри. -->
                <path d="M${BX - 2} ${SH + 2}V${BOT - 7}" stroke="${Gl[3]}" stroke-width="1.1" stroke-opacity="0.75" stroke-linecap="round"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, Am[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Венчик горла. -->
            <path d="${lip}" fill="url(#${id}-lip)"/>
            <path d="M-8 ${NY - 9.4}H6" stroke="${Am[4]}" stroke-width="0.8" stroke-linecap="round" stroke-opacity="0.9"/>
            <!-- Бечёвка: два витка на горле, узелок, свисает к бирке. -->
            <path d="M-7.5 ${NY + 2.5}Q0 ${NY + 4.5} 7.5 ${NY + 2.5}M-7.8 ${NY + 5}Q0 ${NY + 7} 8 ${NY + 5}" fill="none" stroke="${mixColor(P.soapTwine, ink, 0.35)}" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M-7.5 ${NY + 2.5}Q0 ${NY + 4.5} 7.5 ${NY + 2.5}M-7.8 ${NY + 5}Q0 ${NY + 7} 8 ${NY + 5}" fill="none" stroke="${P.soapTwine}" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M7 ${NY + 4}C12 ${NY + 6} 17 ${NY + 9} 21.5 ${NY + 13.5}" fill="none" stroke="${P.soapTwine}" stroke-width="1" stroke-linecap="round"/>
            <path d="M7 ${NY + 4}q-1 5 1.5 8" fill="none" stroke="${P.soapTwine}" stroke-width="1" stroke-linecap="round"/>
            <circle cx="7" cy="${NY + 4}" r="1.5" fill="${P.soapTwine}" stroke="${mixColor(P.soapTwine, ink, 0.4)}" stroke-width="0.5"/>
            <!-- Бирка висит с плеча, поверх сетки её видно всегда. -->
            <g transform="translate(17 ${NY + 12}) rotate(14)">
                <path d="${tag}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.structure}" stroke-linejoin="round"/>
                <path d="${tag}" fill="url(#${id}-tag)"/>
                <path d="M11 0L13 2.5H11Z" fill="${Pa[0]}"/>
                <circle cx="4.5" cy="2.8" r="1.6" fill="${Pa[0]}"/>
                <circle cx="4.5" cy="2.8" r="0.8" fill="${Am[1]}"/>
                <path d="M3 13C3.5 9 7 6.5 10.5 6.5C10 10 7 12.8 3 13ZM3 13L8.5 8.3" fill="${Gl[1]}" stroke="${Gl[0]}" stroke-width="0.5" stroke-linejoin="round"/>
                <path d="${tag}" fill="none" stroke="${Pa[0]}" stroke-width="0.6"/>
            </g>
            <!-- Воротник пипетки. -->
            <path d="${collar}" fill="url(#${id}-rub)"/>
            <path d="${ribs}" stroke="${Ru[0]}" stroke-width="0.6" stroke-opacity="0.9"/>
            <path d="M-7 ${CB + 1}H6" stroke="${Ru[2]}" stroke-width="1" stroke-linecap="round"/>
            <path d="M-10 ${CT - 0.6}H10" stroke="${Ru[2]}" stroke-width="0.8"/>
            <!-- Груша: раструб, два кольца у основания, мягкий матовый блик. -->
            <path d="${bulb}" fill="url(#${id}-rub)"/>
            <path d="M-5.6 ${CB - 2}Q0 ${CB - 1} 5.6 ${CB - 2}M-5 ${CB - 4}Q0 ${CB - 3} 5 ${CB - 4}" fill="none" stroke="${Ru[0]}" stroke-width="0.8"/>
            <path d="M-4.8 ${CB - 15}Q-6.4 ${CB - 11} -5.4 ${CB - 6}" fill="none" stroke="${Ru[2]}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.9"/>
            <ellipse cx="-2.6" cy="${CB - 17.5}" rx="1.6" ry="0.8" fill="${F.hi}" fill-opacity="0.55" transform="rotate(-30 -2.6 ${CB - 17.5})"/>
        </g>`;
    },

    // ---------- 5. ПРЕМИУМ-ГЕЛЬ ----------
    // Прозрачный флакон с фиолетовым гелем и золотой крышкой. Отличие от
    // простого геля — не цвет, а материал и сдержанность:
    //   * стекло толстое: вокруг геля светлая кайма стенок, блики резкие
    //     (у мягкого пластика они были размытые);
    //   * в геле застыли пузырьки — примета дорогого геля;
    //   * крышка — высокий золотой колпачок: металл с резким перепадом
    //     света и рифлением;
    //   * этикетки нет — только маленькая золотая эмблема на стекле.
    // Стоит крышкой вверх: дорогую вещь ставят на показ.
    premium() {
        const P = btPal(), V = P.soapViolet, Au = P.soapGold, G = P.soapBottle, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        const bx = 18, sh = -38, bot = 29;
        // Плечи — крутой изгиб к горлышку, бока прямые.
        const body = `M${-bx} ${bot - 3}V${sh + 9}C${-bx} ${sh + 2} -12 ${sh - 2} -8 ${sh - 3}V${sh - 7}H8V${sh - 3}`
                   + `C12 ${sh - 2} ${bx} ${sh + 2} ${bx} ${sh + 9}V${bot - 3}Q${bx} ${bot} ${bx - 3} ${bot}H${-bx + 3}Q${-bx} ${bot} ${-bx} ${bot - 3}Z`;
        // Гель: внутри толстых стенок (кайма 3), налит почти до горлышка.
        const w = 3, lv = sh + 5;
        const gel = `M${-bx + w} ${lv}Q0 ${lv + 2} ${bx - w} ${lv}V${bot - 7}Q${bx - w} ${bot - 5} ${bx - w - 3} ${bot - 5}`
                  + `H${-bx + w + 3}Q${-bx + w} ${bot - 5} ${-bx + w} ${bot - 7}Z`;
        const cap = `M-9 ${sh - 7}V${sh - 27}Q-9 ${sh - 30} -6 ${sh - 30}H6Q9 ${sh - 30} 9 ${sh - 27}V${sh - 7}Z`;
        let ribs = '';
        for (let x = -7.5; x <= 7.6; x += 2.5) ribs += `M${f(x)} ${sh - 15}V${sh - 8}`;

        // Пузырьки в геле — из сида, мелкие и разные.
        const rnd = btRng(55);
        let bub = '';
        for (let i = 0; i < 11; i++) {
            const x = -bx + w + 3 + rnd() * (2 * (bx - w) - 6), y = lv + 4 + rnd() * (bot - lv - 14), r = 0.7 + rnd() * 1.7;
            bub += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${V[3]}" fill-opacity="0.5" stroke="${V[4]}" stroke-width="0.5"/>`
                 + `<circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.3)}" fill="${F.hi}" fill-opacity="0.9"/>`;
        }
        // Эмблема: золотой ромб-кристалл с гранью внутри. Листок в кольце
        // читался глазом.
        const emb = 'M0 -6L4.2 0L0 6L-4.2 0ZM0 -3L2.1 0L0 3L-2.1 0Z';

        return `
        <g class="bt-soap bt-soap-premium" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <linearGradient id="${id}-wall" gradientUnits="userSpaceOnUse" x1="${-bx}" y1="0" x2="${bx}" y2="0">
                    <stop offset="0" stop-color="${G.edge}" stop-opacity="0.8"/>
                    <stop offset="0.15" stop-color="${G.wall}" stop-opacity="0.4"/>
                    <stop offset="0.85" stop-color="${G.wall}" stop-opacity="0.3"/>
                    <stop offset="1" stop-color="${G.edge}" stop-opacity="0.85"/>
                </linearGradient>
                <!-- Гель — цилиндр: светлая середина, глубокие края. -->
                <linearGradient id="${id}-gel" gradientUnits="userSpaceOnUse" x1="${-bx + w}" y1="0" x2="${bx - w}" y2="0">
                    <stop offset="0" stop-color="${V[0]}"/>
                    <stop offset="0.3" stop-color="${V[2]}"/>
                    <stop offset="0.55" stop-color="${V[3]}"/>
                    <stop offset="1" stop-color="${V[0]}"/>
                </linearGradient>
                <!-- Золото: резкий перепад — металл, а не жёлтый пластик. -->
                <linearGradient id="${id}-gold" gradientUnits="userSpaceOnUse" x1="-9" y1="0" x2="9" y2="0">
                    <stop offset="0" stop-color="${Au[0]}"/>
                    <stop offset="0.2" stop-color="${Au[3]}"/>
                    <stop offset="0.32" stop-color="${Au[4]}"/>
                    <stop offset="0.45" stop-color="${Au[2]}"/>
                    <stop offset="0.8" stop-color="${Au[1]}"/>
                    <stop offset="0.9" stop-color="${Au[3]}"/>
                    <stop offset="1" stop-color="${Au[0]}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
            </defs>
            <path d="${body}${cap}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="url(#${id}-wall)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${gel}" fill="url(#${id}-gel)" fill-opacity="0.95"/>
                ${bub}
                <path d="M${-bx + w} ${lv}Q0 ${lv + 2} ${bx - w} ${lv}" fill="none" stroke="${V[4]}" stroke-width="1.2"/>
                <!-- Эмблема на стекле. -->
                <g transform="translate(0 -12)">
                    <path d="${emb}" fill="none" stroke="${Au[0]}" stroke-width="1.4" transform="translate(0.4 0.5)"/>
                    <path d="${emb}" fill="none" stroke="${Au[3]}" stroke-width="1"/>
                </g>
                <!-- Стекло: резкий блик слева, тонкое отражение справа, свет
                     по плечу. -->
                <path d="M${-bx + 4.5} ${sh + 8}V${bot - 6}" stroke="${G.hi}" stroke-width="2.2" stroke-opacity="0.95" stroke-linecap="round"/>
                <path d="M${-bx + 8} ${sh + 10}V${sh + 26}" stroke="${G.hi}" stroke-width="0.9" stroke-opacity="0.8" stroke-linecap="round"/>
                <path d="M${bx - 3.5} ${sh + 10}V${bot - 8}" stroke="${G.hi}" stroke-width="1.1" stroke-opacity="0.6" stroke-linecap="round"/>
                <path d="M-14 ${sh + 4}C-12 ${sh} -9 ${sh - 1.5} -7 ${sh - 2}" fill="none" stroke="${G.hi}" stroke-width="1.4" stroke-opacity="0.9" stroke-linecap="round"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, G.edge, 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Колпачок. -->
            <path d="${cap}" fill="url(#${id}-gold)"/>
            <path d="${ribs}" stroke="${Au[0]}" stroke-width="0.8" stroke-opacity="0.7"/>
            <path d="M-9 ${sh - 16}H9" stroke="${Au[4]}" stroke-width="0.9" stroke-opacity="0.8"/>
            <path d="M-6 ${sh - 28.5}H5" stroke="${Au[4]}" stroke-width="1.2" stroke-linecap="round"/>
            <path d="${cap}" fill="none" stroke="${mixColor(ink, Au[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
        </g>`;
    },

    // ---------- 4. ГЕЛЬ ----------
    // Мягкая бутылка геля для душа, стоящая крышкой вниз, — как её и держат
    // в ванной, чтобы гель стекал к горлышку. Что делает её гелем:
    //   * перевёрнутый силуэт: широко вверху, книзу сужается к широкой
    //     откидной крышке (на полке крышка за сеткой — её видно в руке, а
    //     силуэт работает и без неё);
    //   * мягкий пластик: вмятина на боку — бутылку уже сжимали;
    //   * яркий глянцевый непрозрачный цвет и этикетка без букв — белая
    //     волна с пузырьками.
    gel() {
        const P = btPal(), C = P.soapGel, W = P.soapPump, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;

        // Тело: горлышко у крышки (y 17) → плечи наверху → скруглённый верх.
        // Вытянутая: такие бутылки геля высокие. Узкая и высокая с
        // перехватом посередине читалась вазой, приземистая — не гелем;
        // здесь бока почти прямые, перехват только к горлышку.
        const top = -64;
        const body = `M-12 17C-14 8 -21 -2 -21 -18C-21 -44 -20 ${top + 3} -12 ${top}H12C20 ${top + 3} 21 -44 21 -18`
                   + `C21 -2 14 8 12 17Z`;
        // Крышка-откидушка: широкий низ, шов шарнира.
        const cap = `M-13 17H13Q15 17 15 19.5V26.5Q15 29 12.5 29H-12.5Q-15 29 -15 26.5V19.5Q-15 17 -13 17Z`;
        // Этикетка: полоса поперёк тела с волной по верхнему краю.
        // Этикетка — поясом, а не во всё тело: бутылка должна остаться
        // бирюзовой.
        const label = `M-24 -32C-12 -37 -3 -28 8 -33S19 -35 24 -33V-6H-24Z`;
        const wave = `M-24 -22C-14 -27 -5 -17 6 -22S17 -25 24 -22V-17C18 -20 12 -14 5 -17S-13 -21 -24 -16Z`;

        return `
        <g class="bt-soap bt-soap-gel" transform="translate(${A.x - 2} ${A.y + 2})">
            <defs>
                <!-- Цилиндр глянцевого пластика: тёмные края, светлая треть
                     слева, мягкое отражение справа. -->
                <linearGradient id="${id}-body" gradientUnits="userSpaceOnUse" x1="-23" y1="0" x2="23" y2="0">
                    <stop offset="0" stop-color="${C[0]}"/>
                    <stop offset="0.22" stop-color="${C[3]}"/>
                    <stop offset="0.5" stop-color="${C[2]}"/>
                    <stop offset="0.85" stop-color="${C[1]}"/>
                    <stop offset="1" stop-color="${C[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-label" gradientUnits="userSpaceOnUse" x1="-24" y1="0" x2="24" y2="0">
                    <stop offset="0" stop-color="${W[1]}"/>
                    <stop offset="0.25" stop-color="${W[4]}"/>
                    <stop offset="0.8" stop-color="${W[3]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <linearGradient id="${id}-cap" gradientUnits="userSpaceOnUse" x1="-15" y1="0" x2="15" y2="0">
                    <stop offset="0" stop-color="${W[1]}"/>
                    <stop offset="0.3" stop-color="${W[4]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
            </defs>
            <path d="${body}${cap}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="url(#${id}-body)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${label}" fill="url(#${id}-label)"/>
                <path d="${wave}" fill="${C[2]}"/>
                <path d="M-24 -16C-13 -21 -5 -11 6 -17S17 -20 24 -17" fill="none" stroke="${C[1]}" stroke-width="1.2" stroke-opacity="0.7"/>
                <!-- Пузырьки на этикетке. -->
                ${[[-8, -10, 2.6], [1, -12, 1.8], [9, -10, 2.3]].map(([x, y, r]) =>
                    `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${C[2]}" stroke-width="1.1"/>
                     <circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.28}" fill="${C[3]}"/>`).join('')}
                <!-- Край этикетки — тонкий шов. -->
                <path d="M-24 -6H24" stroke="${C[0]}" stroke-width="0.8" stroke-opacity="0.5"/>
                <!-- Вмятина от пальцев: тёмная ложбинка и светлый край. -->
                <path d="M21 -54C14 -51 13 -45 20 -41" fill="none" stroke="${C[0]}" stroke-width="3.2" stroke-opacity="0.45" stroke-linecap="round"/>
                <path d="M18.5 -55C12 -51 11.5 -46 17 -42" fill="none" stroke="${C[4]}" stroke-width="1.3" stroke-opacity="0.8" stroke-linecap="round"/>
                <!-- Глянец: длинный блик слева и горячая точка у плеча. -->
                <path d="M-14 -56C-16 -38 -16 -16 -12 4" fill="none" stroke="${C[4]}" stroke-width="3.2" stroke-opacity="0.75" stroke-linecap="round"/>
                <ellipse cx="-9" cy="-59" rx="3.4" ry="1.5" fill="${F.hi}" fill-opacity="0.95" transform="rotate(-15 -9 -59)"/>
                <!-- Горлышко темнее: туда стекает гель, стенка там толще. -->
                <path d="M-12 12H12" stroke="${C[0]}" stroke-width="6" stroke-opacity="0.35"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, C[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
            <path d="${cap}" fill="url(#${id}-cap)"/>
            <path d="M-15 22.5H15" stroke="${W[1]}" stroke-width="1"/>
            <path d="M-4 22.5V29" stroke="${W[1]}" stroke-width="0.8"/>
            <path d="${cap}" fill="none" stroke="${mixColor(ink, W[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
        </g>`;
    },

    // ---------- 3. ЖИДКОЕ ----------
    // Флакон с дозатором-помпой: первая ступень, где мыло — жидкость. Что
    // делает его дозатором, а не просто бутылкой:
    //   * головка помпы с носиком вбок, на носике висит капля; под головкой
    //     шток и рифлёный воротник на горлышке;
    //   * флакон прозрачный — внутри видна жижа, её поверхность и трубка,
    //     уходящая ко дну;
    //   * цилиндр, а не плашка: объём сказан вертикальными полосами света
    //     (блик слева, отражение справа, тёмные края).
    // Стоит в корзине, помпа чуть выше стоек — это разрешено (разд. 5в).
    pump() {
        const P = btPal(), W = P.soapPump, G = P.soapBottle, L = P.soapPeach, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        // Корпус: плечики скруглены, дно на полу корзины (низ за сеткой).
        const bx = 18, sh = -22, bot = 29;
        const body = `M${-bx} ${bot - 4}V${sh + 8}Q${-bx} ${sh} ${-bx + 8} ${sh - 2}H${bx - 8}Q${bx} ${sh} ${bx} ${sh + 8}V${bot - 4}`
                   + `Q${bx} ${bot} ${bx - 4} ${bot}H${-bx + 4}Q${-bx} ${bot} ${-bx} ${bot - 4}Z`;
        // Жижа: до уровня lv, поверхность — узкий эллипс (снизу видна
        // своей нижней кромкой).
        const lv = -11;
        const liq = `M${-bx + 1.2} ${lv}Q0 ${lv + 2.6} ${bx - 1.2} ${lv}V${bot - 4}Q${bx - 1.2} ${bot - 1.2} ${bx - 5} ${bot - 1.2}H${-bx + 5}Q${-bx + 1.2} ${bot - 1.2} ${-bx + 1.2} ${bot - 4}Z`;
        // Воротник, шток, головка и носик.
        const collar = `M-10 ${sh - 12}H10V${sh - 1}H-10Z`;
        const stem = `M-2.6 ${sh - 21}H2.6V${sh - 12}H-2.6Z`;
        const head = `M-9 ${sh - 21}V${sh - 29}Q-9 ${sh - 33} -5 ${sh - 33}H6Q9 ${sh - 33} 10 ${sh - 30}`
                   + `H24Q27 ${sh - 30} 27 ${sh - 27}V${sh - 25}H10V${sh - 21}Z`;
        let ribs = '';
        for (let x = -8; x <= 8; x += 2.7) ribs += `M${f(x)} ${sh - 11}V${sh - 2}`;
        // Трубка: от штока ко дну, чуть изогнута.
        const tube = `M0 ${sh - 1}C1 ${sh + 14} -3 ${bot - 16} -1 ${bot - 3}`;

        return `
        <g class="bt-soap bt-soap-pump" transform="translate(${A.x - 2} ${A.y + 2})">
            <defs>
                <!-- Прозрачная стенка: края плотнее (там взгляд идёт через
                     больше пластика), середина почти пустая. -->
                <linearGradient id="${id}-wall" gradientUnits="userSpaceOnUse" x1="${-bx}" y1="0" x2="${bx}" y2="0">
                    <stop offset="0" stop-color="${G.edge}" stop-opacity="0.75"/>
                    <stop offset="0.18" stop-color="${G.wall}" stop-opacity="0.35"/>
                    <stop offset="0.7" stop-color="${G.wall}" stop-opacity="0.2"/>
                    <stop offset="1" stop-color="${G.edge}" stop-opacity="0.8"/>
                </linearGradient>
                <!-- Жижа — цилиндр: светлее в середине, темнее к стенкам. -->
                <linearGradient id="${id}-liq" gradientUnits="userSpaceOnUse" x1="${-bx}" y1="0" x2="${bx}" y2="0">
                    <stop offset="0" stop-color="${L[1]}"/>
                    <stop offset="0.35" stop-color="${L[3]}"/>
                    <stop offset="0.65" stop-color="${L[2]}"/>
                    <stop offset="1" stop-color="${L[0]}"/>
                </linearGradient>
                <!-- Белый пластик помпы: тот же цилиндрический свет. -->
                <linearGradient id="${id}-cap" gradientUnits="userSpaceOnUse" x1="-10" y1="0" x2="10" y2="0">
                    <stop offset="0" stop-color="${W[1]}"/>
                    <stop offset="0.3" stop-color="${W[4]}"/>
                    <stop offset="0.7" stop-color="${W[3]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <linearGradient id="${id}-head" gradientUnits="userSpaceOnUse" x1="0" y1="${sh - 33}" x2="0" y2="${sh - 21}">
                    <stop offset="0" stop-color="${W[4]}"/>
                    <stop offset="0.6" stop-color="${W[3]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
            </defs>
            <path d="${body}${collar}${stem}${head}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="url(#${id}-wall)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${tube}" fill="none" stroke="${G.edge}" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="${liq}" fill="url(#${id}-liq)" fill-opacity="0.92"/>
                <!-- Перламутр: мягкая светлая жилка в толще. -->
                <path d="M-8 ${lv + 8}C-2 ${lv + 14} 4 ${lv + 4} 9 ${lv + 12}" fill="none" stroke="${L[4]}" stroke-width="3" stroke-opacity="0.45" stroke-linecap="round"/>
                <!-- Трубка сквозь жижу: темнее. -->
                <path d="${tube}" fill="none" stroke="${L[0]}" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round"
                      clip-path="url(#${id}-clip)"/>
                <!-- Поверхность жижи: светлая кромка. -->
                <path d="M${-bx + 1.2} ${lv}Q0 ${lv + 2.6} ${bx - 1.2} ${lv}" fill="none" stroke="${L[4]}" stroke-width="1.4"/>
                <!-- Блик стенки слева и отражение справа — это и делает цилиндр. -->
                <path d="M${-bx + 5} ${sh + 4}V${bot - 6}" stroke="${G.hi}" stroke-width="3" stroke-opacity="0.8" stroke-linecap="round"/>
                <path d="M${-bx + 9} ${sh + 6}V${sh + 22}" stroke="${G.hi}" stroke-width="1.2" stroke-opacity="0.6" stroke-linecap="round"/>
                <path d="M${bx - 4} ${sh + 6}V${bot - 8}" stroke="${G.hi}" stroke-width="1.4" stroke-opacity="0.45" stroke-linecap="round"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, G.edge, 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Воротник с рифлением. -->
            <path d="${collar}" fill="url(#${id}-cap)"/>
            <path d="${ribs}" stroke="${W[1]}" stroke-width="0.9"/>
            <path d="M-10 ${sh - 1}H10" stroke="${W[0]}" stroke-width="1.2" stroke-opacity="0.6"/>
            <path d="${stem}" fill="url(#${id}-cap)"/>
            <path d="${head}" fill="url(#${id}-head)"/>
            <path d="M-6 ${sh - 31}H5" stroke="${W[4]}" stroke-width="1.6" stroke-linecap="round"/>
            <path d="${head}" fill="none" stroke="${mixColor(ink, W[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Капля на носике. -->
            <path d="M24 ${sh - 25}C24 ${sh - 22} 22.2 ${sh - 20.5} 22.2 ${sh - 18.8}A1.9 1.9 0 0 0 26 ${sh - 18.8}C26 ${sh - 20.5} 24.2 ${sh - 22} 24.2 ${sh - 25}Z"
                  fill="${L[2]}" stroke="${mixColor(ink, L[0], 0.4)}" stroke-width="0.7"/>
            <circle cx="23.4" cy="${sh - 19.6}" r="0.6" fill="${F.hi}"/>
        </g>`;
    },

    // ---------- 2. ТУАЛЕТНОЕ ----------
    // Розоватый скруглённый брусок на мыльнице. Розовая скруглённая плашка
    // сама по себе читается ластиком или конфетой, поэтому мылом её делают
    // три вещи сразу:
    //   * МЫЛЬНИЦА (только на полке): фаянсовая ракушка с волнистым краем.
    //     Корзина выше глаза, поэтому видна не чаша изнутри, а передний борт
    //     — выпуклой дугой, ближняя точка выше всего. Борт высокий: низкую
    //     мыльницу целиком закрыла бы передняя сетка;
    //   * выпуклая эмблема — цветок в овальной рамке. Выпуклая, а не
    //     вдавленная, как у хозяйственного: свет на верхней кромке, тень на
    //     нижней;
    //   * полуглянец (мягкий отлив и точечный блик) и пара пузырьков пены у
    //     борта — им только что мылись.
    // Брусок — плоская овальная подушка лицом к нам (не углом: так он уходил
    // в глубину кирпичом). Плашкой в лоб он не выглядит, потому что объём
    // держит купол светотенью и поясок толщины снизу.
    toilet(where) {
        const P = btPal(), K = P.soapPink, Dc = P.soapDish, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);
        const pt = (p) => `${f(p[0])} ${f(p[1])}`;

        // Брусок — невысокая овальная «подушка» лицом к нам. Развёрнутый
        // углом, как хозяйственный, он уходил в глубину кирпичом: туалетное
        // мыло плоское и круглое, и объём ему даёт купол светотенью, а не
        // торец. Силуэт — суперэллипс (между овалом и прямоугольником с
        // круглыми углами); купол — такой же, чуть меньше и выше, а полоса
        // между ними внизу — боковой поясок толщины.
        const oval = (cx, cy, rx, ry, n) => {
            let d = '';
            for (let i = 0; i < 48; i++) {
                const a = 2 * Math.PI * i / 48, c = Math.cos(a), sn = Math.sin(a);
                const x = cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
                const y = cy + ry * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
                d += (i ? 'L' : 'M') + pt([x, y]);
            }
            return d + 'Z';
        };
        const sil = oval(0, -12, 40, 17, 3.2);
        const dome = oval(0, -14.5, 38.5, 14.5, 3.2);

        // Эмблема: овальная рамка и цветок из пяти лепестков.
        let petals = '';
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * 2 * Math.PI / 5, x = Math.cos(a) * 3.2, y = Math.sin(a) * 3.2;
            petals += `M${f(x - 2.2)} ${f(y)}a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0`;
        }
        const emblem = `M-12 0a12 7.5 0 1 0 24 0a12 7.5 0 1 0 -24 0` + petals + 'M-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0';
        const eT = 'translate(3 -14)';

        // Мыльница.
        let dish = '';
        if (where === 'shelf') {
            // Верхний край борта: дуга (ближняя середина выше краёв) и
            // волна-ракушка по ней.
            const W = 47, top = (x) => -4 + 6 * (x / W) * (x / W);
            let edge = `M${f(-W)} ${f(top(-W))}`;
            const n = 8;
            for (let i = 0; i < n; i++) {
                const x0 = -W + 2 * W * i / n, x1 = -W + 2 * W * (i + 1) / n, xm = (x0 + x1) / 2;
                edge += `Q${f(xm)} ${f(top(xm) - 3.6)} ${f(x1)} ${f(top(x1))}`;
            }
            const body = edge + `Q${W + 1} ${f(top(W) + 6)} ${W - 6} 20Q${W - 12} 30 ${W - 22} 31H${-W + 22}Q${-W + 12} 30 ${-W + 6} 20Q${-W - 1} ${f(top(-W) + 6)} ${-W} ${f(top(-W))}Z`;
            // Рёбрышки ракушки: веером от ножки.
            let ribs = '';
            for (let i = 1; i < n; i++) {
                const x = -W + 2 * W * i / n;
                ribs += `M${f(x)} ${f(top(x) + 1)}Q${f(x * 0.8)} ${f(top(x) + 14)} ${f(x * 0.45)} 31`;
            }
            dish = `
            <clipPath id="${id}-dish-clip"><path d="${body}"/></clipPath>
            <g class="bt-soap-dish">
                <path d="${body}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
                <path d="${body}" fill="url(#${id}-dish)"/>
                <g clip-path="url(#${id}-dish-clip)">
                    <path d="${ribs}" fill="none" stroke="${Dc[1]}" stroke-width="1.2" stroke-opacity="0.45"/>
                    <path d="${ribs}" fill="none" stroke="${Dc[4]}" stroke-width="0.8" stroke-opacity="0.6" transform="translate(-1.2 0)"/>
                    <!-- Глазурь: вертикальный блик слева и отсвет справа. -->
                    <rect x="-34" y="-12" width="9" height="44" fill="url(#${id}-glaze)"/>
                    <!-- Закатанный край борта светлее тела. -->
                    <path d="${edge}" fill="none" stroke="${Dc[4]}" stroke-width="3" stroke-opacity="0.9" transform="translate(0 1.8)"/>
                </g>
                <path d="${edge}" fill="none" stroke="${mixColor(ink, Dc[1], 0.5)}" stroke-width="${STROKE.hairline}"/>
            </g>`;
        }

        return `
        <g class="bt-soap bt-soap-toilet" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <!-- Купол: свет сверху-слева, к краям подушка уходит в тень. -->
                <radialGradient id="${id}-dome" gradientUnits="userSpaceOnUse" cx="-12" cy="-22" r="48"
                                gradientTransform="translate(-12 -22) scale(1 0.6) translate(12 22)">
                    <stop offset="0" stop-color="${K[4]}"/>
                    <stop offset="0.45" stop-color="${K[3]}"/>
                    <stop offset="0.8" stop-color="${K[2]}"/>
                    <stop offset="1" stop-color="${K[1]}"/>
                </radialGradient>
                <!-- Полуглянец: мягкий отлив по верху купола. -->
                <radialGradient id="${id}-sheen" gradientUnits="userSpaceOnUse" cx="-12" cy="-24" r="20"
                                gradientTransform="translate(-12 -24) scale(1.3 0.35) translate(12 24)">
                    <stop offset="0" stop-color="${F.hi}" stop-opacity="0.8"/>
                    <stop offset="1" stop-color="${F.hi}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="${id}-dish" gradientUnits="userSpaceOnUse" x1="0" y1="-6" x2="0" y2="31">
                    <stop offset="0" stop-color="${Dc[3]}"/>
                    <stop offset="0.35" stop-color="${Dc[2]}"/>
                    <stop offset="1" stop-color="${Dc[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-glaze" gradientUnits="userSpaceOnUse" x1="-34" y1="0" x2="-25" y2="0">
                    <stop offset="0" stop-color="${Dc[4]}" stop-opacity="0"/>
                    <stop offset="0.5" stop-color="${Dc[4]}" stop-opacity="0.85"/>
                    <stop offset="1" stop-color="${Dc[4]}" stop-opacity="0"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${sil}"/></clipPath>

            </defs>
            <path d="${sil}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <!-- Поясок толщины: темнее купола, снизу отсвет от мыльницы. -->
            <path d="${sil}" fill="${K[1]}"/>
            <g clip-path="url(#${id}-clip)">
                <path d="M-40 1Q0 9 40 1" fill="none" stroke="${K[2]}" stroke-width="2.2" stroke-opacity="0.8"/>
                <path d="${dome}" fill="url(#${id}-dome)"/>
                <!-- Кромка купола: мягкий переход в поясок, а не ребро. -->
                <path d="${dome}" fill="none" stroke="${K[2]}" stroke-width="1.4" stroke-opacity="0.7"/>
                <!-- Эмблема выпуклая: свет сверху-слева, тень снизу-справа. -->
                <g transform="${eT}">
                    <path d="${emblem}" fill="none" stroke="${K[1]}" stroke-width="1.3" stroke-opacity="0.6" transform="translate(0.6 0.7)"/>
                    <path d="${emblem}" fill="none" stroke="${K[4]}" stroke-width="1.3" transform="translate(-0.5 -0.6)"/>
                    <path d="${emblem}" fill="none" stroke="${K[3]}" stroke-width="1"/>
                </g>
                <path d="${dome}" fill="url(#${id}-sheen)"/>
                <ellipse cx="-17" cy="-24.5" rx="4.5" ry="1.4" fill="${F.hi}" fill-opacity="0.9" transform="rotate(-6 -17 -24.5)"/>
            </g>
            <path d="${sil}" fill="none" stroke="${mixColor(ink, K[0], 0.5)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            ${where === 'shelf' ? `
            <!-- Пена у борта: им только что мылись. -->
            <g class="bt-soap-suds">
                ${[[-18, -5, 3.4], [-12.5, -7, 2.4], [-8.5, -5, 1.6], [23, -4.5, 3], [28, -7, 2]].map(([x, y, r]) =>
                    `<circle cx="${x}" cy="${y}" r="${r}" fill="${F[500]}" fill-opacity="0.85" stroke="${F.rim}" stroke-width="0.5"/>
                     <circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="${F.hi}"/>`).join('')}
            </g>` : ''}
            ${dish}
        </g>`;
    },

    // ---------- 1. ХОЗЯЙСТВЕННОЕ ----------
    // Целый брусок «72%». Две прежние попытки провалились, и обе поучительны:
    //   * в обёртке — лишнее: вещь должна читаться самим мылом;
    //   * лицом к нам, светло-жёлтый, с ровными яркими фасками и крупным
    //     «72%» по центру — золотой слиток или табличка «скидка 72%».
    //     Плоская грань в лоб — это плашка, а не кирпич.
    // Что делает его мылом:
    //   * брусок развёрнут углом, видны ДВЕ грани — длинная и торец — и
    //     ближнее ребро выше всего: корзина выше глаза, поэтому верхние
    //     рёбра уходят вниз от ближнего угла (крыша «домиком»). Низ закрыт
    //     сеткой, как и у всего в корзине;
    //   * цвет тёмный коричнево-охристый и матовый, рёбра мягкие —
    //     скруглённые светом, а не срезанные фаской;
    //   * белёсый содовый налёт пятнами — по нему хозяйственное мыло
    //     узнаётся сразу;
    //   * клеймо небольшое и лежит В грани — наклонено вместе с ней.
    bar() {
        const P = btPal(), S = P.soapBar, R = S.ramp, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);
        const pt = (p) => `${f(p[0])} ${f(p[1])}`;

        // Углы. N — ближнее вертикальное ребро, L — дальний конец торца
        // (слева), Rr — дальний конец длинной грани (справа). Верхние рёбра
        // уходят вниз круче нижних: верх дальше от горизонта.
        // Снизу видно и ДНО (Bb — дальний нижний угол): без третьей грани
        // брусок читался согнутым листом картона. На полке дно закрыто
        // сеткой; ничего не опускается ниже 33 — иначе торчит из-под корзины.
        const Nt = [-12, -24], Nb = [-12, 18];
        const Rt = [50, -14.5], Rb = [50, 23];
        const Lt = [-34, -12.5], Lb = [-34, 24];
        const Bb = [Lb[0] + Rb[0] - Nb[0], Lb[1] + Rb[1] - Nb[1] + 3];
        const longF = `M${pt(Nt)}L${pt(Rt)}L${pt(Rb)}L${pt(Nb)}Z`;
        const endF = `M${pt(Lt)}L${pt(Nt)}L${pt(Nb)}L${pt(Lb)}Z`;
        const botF = `M${pt(Lb)}L${pt(Nb)}L${pt(Rb)}L${pt(Bb)}Z`;
        // Силуэт со скруглёнными углами: у мыла нет острых вершин.
        const round = (pts, q) => {
            let d = '';
            for (let i = 0; i < pts.length; i++) {
                const a = pts[(i + pts.length - 1) % pts.length], p = pts[i], c = pts[(i + 1) % pts.length];
                const ka = q / Math.hypot(a[0] - p[0], a[1] - p[1]), kc = q / Math.hypot(c[0] - p[0], c[1] - p[1]);
                const p0 = [p[0] + (a[0] - p[0]) * ka, p[1] + (a[1] - p[1]) * ka];
                const p1 = [p[0] + (c[0] - p[0]) * kc, p[1] + (c[1] - p[1]) * kc];
                d += (i ? 'L' : 'M') + pt(p0) + 'Q' + pt(p) + ' ' + pt(p1);
            }
            return d + 'Z';
        };
        const sil = round([Lt, Nt, Rt, Rb, Bb, Lb], 4);

        // Налёт: неровные пятна, гуще у рёбер — там мыло сохнет первым.
        const rnd = btRng(1972);
        const blobs = [];
        const blob = (cx, cy, rx, ry) => {
            const n = 7, q = [];
            for (let i = 0; i < n; i++) {
                const a = 2 * Math.PI * i / n, k = 0.6 + rnd() * 0.6;
                q.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
            }
            let d = `M${pt([(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2])}`;
            for (let i = 1; i <= n; i++) {
                const p = q[i % n], c = q[(i + 1) % n];
                d += `Q${pt(p)} ${pt([(p[0] + c[0]) / 2, (p[1] + c[1]) / 2])}`;
            }
            return d + 'Z';
        };
        for (const [x, y, rx, ry] of [[-9, -17, 9, 5], [44, -9, 7, 7], [22, -15, 11, 4], [-29, -5, 5, 8], [-21, 8, 4, 8],
                                      [36, 6, 7, 5], [2, 10, 8, 4], [12, -4, 5, 3], [-4, 0, 4, 5]])
            blobs.push(blob(x, y, rx, ry));
        // Поры и мелкие вмятинки.
        let pores = '';
        for (let i = 0; i < 10; i++) {
            const x = -32 + rnd() * 80, y = -18 + rnd() * 34, q = 0.35 + rnd() * 0.45;
            pores += `M${f(x - q)} ${f(y)}a${q.toFixed(2)} ${q.toFixed(2)} 0 1 0 ${(2 * q).toFixed(2)} 0a${q.toFixed(2)} ${q.toFixed(2)} 0 1 0 ${(-2 * q).toFixed(2)} 0Z`;
        }

        // Клеймо — в плоскости длинной грани: сдвиг по её наклону, сжатие
        // по ширине. Небольшое — это клеймо, а не вывеска.
        const slope = (Rt[1] - Nt[1]) / (Rt[0] - Nt[0]);
        const mark = 'M-24 -14L-12 -14L-19 4'
                   + 'M-7 -10.5Q-5 -15 -0.5 -14.5Q4 -14 3 -8.5L-7 4L4 4'
                   + 'M9 4L21 -14'
                   + 'M8.1 -10a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0'
                   + 'M17.1 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0';
        const mT = `translate(19 -3) skewY(${(Math.atan(slope) * 180 / Math.PI).toFixed(1)}) scale(0.6 0.62) translate(1 5)`;

        return `
        <g class="bt-soap bt-soap-bar" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <!-- Длинная грань смотрит вперёд-вправо: средний тон, к
                     дальнему концу темнее. -->
                <linearGradient id="${id}-long" gradientUnits="userSpaceOnUse" x1="${Nt[0]}" y1="0" x2="${Rt[0]}" y2="0">
                    <stop offset="0" stop-color="${R[2]}"/>
                    <stop offset="0.3" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${mixColor(R[1], R[0], 0.35)}"/>
                </linearGradient>
                <!-- Торец смотрит влево, к свету: светлее. -->
                <linearGradient id="${id}-end" gradientUnits="userSpaceOnUse" x1="${Lt[0]}" y1="${Lt[1]}" x2="${Nb[0]}" y2="${Nb[1]}">
                    <stop offset="0" stop-color="${mixColor(R[4], S.bloom, 0.12)}"/>
                    <stop offset="1" stop-color="${R[4]}"/>
                </linearGradient>
                <!-- Мягкое скруглённое ребро: свет растекается с него на обе
                     грани, без резкой кромки. -->
                <linearGradient id="${id}-edge" gradientUnits="userSpaceOnUse" x1="${Nt[0] - 3.5}" y1="0" x2="${Nt[0] + 1.5}" y2="0">
                    <stop offset="0" stop-color="${R[4]}" stop-opacity="0"/>
                    <stop offset="0.6" stop-color="${mixColor(R[4], S.bloom, 0.3)}" stop-opacity="0.9"/>
                    <stop offset="1" stop-color="${R[4]}" stop-opacity="0"/>
                </linearGradient>
                <!-- Налёт пыльный: пятно без края, плотнее к середине. -->
                <radialGradient id="${id}-bloom">
                    <stop offset="0" stop-color="${S.bloom}" stop-opacity="0.45"/>
                    <stop offset="0.6" stop-color="${S.bloom}" stop-opacity="0.22"/>
                    <stop offset="1" stop-color="${S.bloom}" stop-opacity="0"/>
                </radialGradient>
                <clipPath id="${id}-clip"><path d="${sil}"/></clipPath>
                <clipPath id="${id}-long-clip"><path d="${longF}"/></clipPath>
            </defs>
            <path d="${sil}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${longF}" fill="url(#${id}-long)"/>
                <path d="${endF}" fill="url(#${id}-end)"/>
                <!-- Дно смотрит вниз, от лампы: самое тёмное. -->
                <path d="${botF}" fill="${R[0]}"/>
                <path d="M${pt(Lb)}L${pt(Nb)}L${pt(Rb)}" fill="none" stroke="${R[2]}" stroke-width="1.6" stroke-opacity="0.6" stroke-linejoin="round"/>
                <rect x="${Nt[0] - 3.5}" y="${Nt[1] - 2}" width="5" height="${Nb[1] - Nt[1] + 2}" fill="url(#${id}-edge)"/>
                <!-- Верхние рёбра скруглены: узкий свет вдоль кромки. -->
                <path d="M${pt([Lt[0], Lt[1] + 1.6])}L${pt([Nt[0], Nt[1] + 1.6])}L${pt([Rt[0], Rt[1] + 1.6])}" fill="none"
                      stroke="${R[4]}" stroke-width="2.4" stroke-opacity="0.55" stroke-linejoin="round"/>
                <path d="${pores}" fill="${R[0]}" fill-opacity="0.3"/>
                <g clip-path="url(#${id}-long-clip)">
                    <g transform="${mT}">
                        <path d="${mark}" fill="none" stroke="${R[3]}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"
                              transform="translate(0.6 1)" stroke-opacity="0.8"/>
                        <path d="${mark}" fill="none" stroke="${S.mark}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                              stroke-opacity="0.75"/>
                    </g>
                </g>
                ${blobs.map(d => `<path d="${d}" fill="url(#${id}-bloom)"/>`).join('')}
            </g>
            <!-- Граница граней — не линия, а стык тонов; тонкая тень только
                 внизу, где ребро уходит от света. -->
            <path d="${sil}" fill="none" stroke="${mixColor(ink, R[1], 0.5)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
        </g>`;
    },

    // ---------- 0. ОБМЫЛОК ----------
    // Жалкий огрызок хозяйственного «72%»: то, что остаётся, когда мылом
    // мылись годами и выбросить всё жалко. Узнаётся по цвету и по обрывку
    // клейма, а жалким его делает всё остальное:
    //   * он МАЛЕНЬКИЙ — вдвое меньше бруска, и тонкий: торец — ниточка,
    //     края просвечивают (истёртое мыло на краю стекленеет);
    //   * покороблен и завален набок — стоять ровно ему уже нечем;
    //   * угол отколот, скол светлее — внутри мыло ещё свежее;
    //   * от клейма осталась «7» и кусок «2»;
    //   * трещина насквозь, сухие трещинки, въевшаяся грязь;
    //   * прилипший волос свешивается через край;
    //   * на полке — мыльная сопля тянется из корзины вниз.
    // Кусок стоит на ребре у стенки корзины: плашмя он целиком прятался бы
    // за передней сеткой (она закрывает нижние 17 единиц).
    stub(where) {
        const P = btPal(), S = P.soapStub, R = S.ramp, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;

        // Лицо: кривой обкатанный лоскут. Острые только вершины скола.
        const CHIP = [[6, -17], [10, -11], [14, -13], [19, -7]];
        // Форма — всё ещё брусок (плоский, шире, чем выше), только стёртый:
        // круглый огрызок читался картофелиной, а не мылом.
        const face = 'M-24 -12Q-22 -17 -14 -16.5Q-4 -15 6 -17'
            + CHIP.slice(1).map(p => `L${p[0]} ${p[1]}`).join('')
            + 'Q24 -4 24 4Q24 13 16 15L-16 16Q-25 16 -25 6Q-26 -6 -24 -12Z';
        // Торец — ниточка: кусок почти прозрачный по толщине.
        const T = { x: 2, y: 1.3 };
        const back = `<path d="${face}" transform="translate(${T.x} ${T.y})"`;
        const c0 = CHIP.map(p => `${p[0]} ${p[1]}`), c1 = CHIP.map(p => `${p[0] + T.x} ${p[1] + T.y}`).reverse();
        const fracture = `M${c0.join('L')}L${c1.join('L')}Z`;
        const scarRim = 'M19 -7L16 -4L11.5 -6L7.5 -10L3.5 -16L6 -17';
        const scar = `M${c0.join('L')}` + scarRim.replace(/^M19 -7/, '') + 'Z';

        const craq = 'M24 2L19.5 3.5L16 1.5M19.5 3.5L18.5 8M-25 3L-21 4.5L-18.5 2';
        const crack = 'M-4 -15.5L-6 -10L-2 -5L-4 1L-1 7';
        // Обрывок клейма: «7» и начало «2», стёртые почти до гладкого.
        const mark = 'M-20 -10L-12 -10L-16 1M-8 -7.5Q-6.5 -11 -3.5 -10.5Q-1 -10 -2 -6';
        // Въевшаяся грязь: серые точки в порах.
        const rnd = btRng(27);
        let dirt = '';
        for (let i = 0; i < 14; i++) {
            const x = -21 + rnd() * 42, y = -13 + rnd() * 25, r = 0.4 + rnd() * 0.7;
            dirt += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;
        }
        // Мыльная сопля из корзины: только на полке. Висит из-под дна
        // (передний край дна — BATH_SHELF.FLOORS[0]) и собирается в каплю.
        let goo = '';
        if (where === 'shelf') {
            const fy = BATH_SHELF.FLOORS[0], x = A.x + 6;
            const d = `M${x - 3.2} ${fy}C${x - 3} ${fy + 5} ${x - 1.2} ${fy + 7} ${x - 1.5} ${fy + 10}`
                    + `C${x - 3.4} ${fy + 12} ${x - 2.6} ${fy + 16.5} ${x} ${fy + 16.5}`
                    + `C${x + 2.6} ${fy + 16.5} ${x + 3.2} ${fy + 12} ${x + 1.3} ${fy + 10}`
                    + `C${x + 1} ${fy + 7} ${x + 3} ${fy + 5} ${x + 3.2} ${fy}Z`;
            goo = `<g class="bt-soap-goo">
                <path d="${d}" fill="none" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-opacity="0.6"/>
                <path d="${d}" fill="${S.fresh}" fill-opacity="0.8"/>
                <path d="M${x - 0.9} ${fy + 11.8}q-0.6 1.6 0.4 2.8" fill="none" stroke="${P.soapLit}" stroke-width="0.9" stroke-linecap="round"/>
            </g>`;
        }

        return `
        <g class="bt-soap bt-soap-stub" transform="translate(${A.x + 2} ${A.y + 3}) rotate(-7)">
            <defs>
                <!-- Свет сверху-слева; покоробленный кусок темнеет к
                     завёрнутому краю. -->
                <linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="-24" y1="-17" x2="22" y2="16">
                    <stop offset="0" stop-color="${R[3]}"/>
                    <stop offset="0.45" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${R[1]}"/>
                </linearGradient>
                <!-- Затёртая середина — тусклый восковой отлив. -->
                <radialGradient id="${id}-wax" gradientUnits="userSpaceOnUse" cx="-9" cy="-7" r="14"
                                gradientTransform="translate(-9 -7) scale(1.4 0.8) translate(9 7)">
                    <stop offset="0" stop-color="${P.soapLit}" stop-opacity="0.4"/>
                    <stop offset="1" stop-color="${P.soapLit}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="${id}-scar" gradientUnits="userSpaceOnUse" x1="12" y1="-14" x2="8" y2="-7">
                    <stop offset="0" stop-color="${S.fresh}"/>
                    <stop offset="1" stop-color="${mixColor(S.fresh, R[2], 0.55)}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${face}"/></clipPath>
            </defs>
            ${back} fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${face}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            ${back} fill="${R[0]}"/>
            <path d="${fracture}" fill="${S.fresh}"/>
            <path d="${face}" fill="url(#${id}-face)"/>
            <g clip-path="url(#${id}-clip)">
                <!-- Истёртый край просвечивает: светлая стеклянная кайма. -->
                <path d="${face}" fill="none" stroke="${S.fresh}" stroke-width="4.5" stroke-opacity="0.45"/>
                <!-- Покороблен: вдоль изгиба — тень прогиба. -->
                <path d="M-25 7Q0 2 24 -1" fill="none" stroke="${R[0]}" stroke-width="7" stroke-opacity="0.18" stroke-linecap="round"/>
                <path d="${face}" fill="url(#${id}-wax)"/>
                <path d="${mark}" fill="none" stroke="${P.soapLit}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
                      stroke-opacity="0.4" transform="translate(0.5 0.6)"/>
                <path d="${mark}" fill="none" stroke="${P.soapMark}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
                      stroke-opacity="0.6"/>
                <path d="${dirt}" fill="${S.crack}" fill-opacity="0.45"/>
                <path d="${scar}" fill="url(#${id}-scar)"/>
                <path d="${scarRim}" fill="none" stroke="${S.crack}" stroke-width="${STROKE.hairline}" stroke-linejoin="round" stroke-opacity="0.8"/>
                <path d="${craq}" fill="none" stroke="${S.crack}" stroke-width="${STROKE.hairline}" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="${crack}" fill="none" stroke="${P.soapLit}" stroke-width="0.6" stroke-opacity="0.5" transform="translate(0.6 0.4)"/>
                <path d="${crack}" fill="none" stroke="${S.crack}" stroke-width="1.1" stroke-linejoin="round"/>
            </g>
            <path d="${face}" fill="none" stroke="${mixColor(ink, R[1], 0.4)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            <!-- Волос: прилип к лицу и свешивается через край. -->
            <path d="M-14 -2C-8 -7 -4 1 2 -3S10 0 13 5Q17 11 15 18Q13 24 17 29" fill="none" stroke="${S.hair}"
                  stroke-width="0.55" stroke-linecap="round"/>
        </g>${goo}`;
    }
};

if (typeof window !== 'undefined') window.BATH_SOAP = BATH_SOAP;
