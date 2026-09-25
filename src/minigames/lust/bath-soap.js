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
    TIERS: ['stub', 'baked', 'baked', 'baked', 'baked', 'baked', 'baked', 'baked', 'baked'],
    uid: 0,

    level() {
        if (typeof GameState === 'undefined' || !GameState.upgradeLevel || typeof Backend === 'undefined') return 0;
        return GameState.upgradeLevel(Backend.upgradeKey('lust', 'soap')) || 0;
    },
    tier(level) {
        const L = level == null ? this.level() : level;
        return Math.max(0, Math.min(this.TIERS.length - 1, L | 0));
    },

    draw(level) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'stub') return this.stub();
        return BATH_BAKED.draw('soap');
    },

    // Габарит на сцене — по нему иконка магазина ужимает вещь под клетку.
    box(level) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'stub') return { x: 532, y: 300, w: 86, h: 73 };
        return BATH_BAKED.box('soap');
    },

    // Полка перерисовывается после покупки и после debug-панели: ступень
    // меняется, пока ванная открыта.
    refresh() {
        const el = typeof document !== 'undefined' && document.getElementById('bt-soap-art');
        if (el) el.innerHTML = this.draw();
    },

    // ---------- 0. ОБМЫЛОК ----------
    // Тонкий засохший кусок хозяйственного «72%», прислонённый к стенке
    // корзины. Что делает его обмылком, а не просто маленьким бруском:
    //   * края стёрты в округлость — им мылись годами;
    //   * угол отколот, и скол СВЕТЛЕЕ поверхности — видно, что откололся;
    //   * толщина — узкая полоса торца: кусок тонкий, почти пластинка;
    //   * сквозная трещина от верхнего края и сетка сухих трещинок —
    //     хозяйственное мыло, высыхая, трескается паутиной;
    //   * клеймо стёрто наполовину, а «%» срезан сколом;
    //   * прилипший волос.
    stub() {
        const P = btPal(), S = P.soapStub, R = S.ramp, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        // Лицевая сторона. Кусок стоит на ребре, прислонённый к стенке
        // корзины: плашмя тонкий обмылок целиком прятался бы за передней
        // сеткой (она закрывает нижние 17 единиц). Скол — острыми
        // вершинами, всё остальное стёрто кривыми: у старого мыла нет ни
        // одного острого угла, кроме свежего.
        const CHIP = [[14, -36], [19, -27], [24, -29], [30, -21]];
        const face = 'M-26 -34Q-4 -38 14 -36'
            + CHIP.slice(1).map(p => `L${p[0]} ${p[1]}`).join('')
            + 'Q36 -16 36 -4Q37 16 32 24Q0 28 -30 26Q-37 24 -36 8Q-37 -20 -34 -28Q-32 -33 -26 -34Z';
        // Торец: та же форма, сдвинутая назад-вправо, — толщина пластинки.
        const T = { x: 4, y: 2.5 };
        const back = `<path d="${face}" transform="translate(${T.x} ${T.y})"`;
        // Скол по толщине: полоса между краем скола и его копией на заднем
        // слое. И след скола на лице — неглубокая светлая выемка: откололся
        // не только угол, но и кусок лицевой стороны, и под ним свежее,
        // ещё не потемневшее мыло. Внутренний край выемки — ступенька.
        const c0 = CHIP.map(p => `${p[0]} ${p[1]}`), c1 = CHIP.map(p => `${p[0] + T.x} ${p[1] + T.y}`).reverse();
        const fracture = `M${c0.join('L')}L${c1.join('L')}Z`;
        const scarRim = 'M30 -21L26.5 -16.5L21 -18.5L15.5 -23L10 -33L14 -36';
        const scar = `M${c0.join('L')}` + scarRim.replace(/^M30 -21/, '') + 'Z';

        // Сухие трещинки у краёв — хозяйственное мыло, высыхая, трескается.
        // Короткие, ветвистые, от кромки внутрь.
        const craq = 'M36 -3L30.5 -1L26 -3.5L21 0.5M30.5 -1L28.5 5'
                   + 'M36.5 8L31 9.5L27 13M-36.5 1L-31 3.5L-27.5 0.5M-31 3.5L-29 8';
        // Сквозная трещина от верхнего края вниз, зигзагом между цифрами.
        const crack = 'M-8 -36.5L-10 -29L-6 -23L-8 -16L-5 -8L-7 1';

        // Клеймо «72%» — канавка: тёмное дно и светлая нижняя стенка, как на
        // запечённом бруске. Стёрто — полупрозрачное; верх «%» ушёл со
        // сколом (выемка рисуется поверх).
        const mark = 'M-26 -26L-16 -26L-21 -12'
                   + 'M-11 -23Q-9 -27 -5 -26.5Q-1 -26 -2 -21.5L-11 -12L-2 -12'
                   + 'M5 -12L17 -28'
                   + 'M5 -24a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'
                   + 'M13 -14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0';

        return `
        <g class="bt-soap bt-soap-stub" transform="translate(${A.x} ${A.y + 1}) rotate(-6)">
            <defs>
                <!-- Свет сверху-слева: светлый угол, тёмный противоположный. -->
                <linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="-34" y1="-36" x2="32" y2="26">
                    <stop offset="0" stop-color="${R[4]}"/>
                    <stop offset="0.35" stop-color="${R[3]}"/>
                    <stop offset="0.75" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${R[1]}"/>
                </linearGradient>
                <!-- Затёртое место посередине — восковой отлив, которым мыло
                     блестит там, где им тёрли. -->
                <radialGradient id="${id}-wax" gradientUnits="userSpaceOnUse" cx="-12" cy="-18" r="26"
                                gradientTransform="translate(-12 -18) scale(1.2 0.8) translate(12 18)">
                    <stop offset="0" stop-color="${P.soapLit}" stop-opacity="0.55"/>
                    <stop offset="1" stop-color="${P.soapLit}" stop-opacity="0"/>
                </radialGradient>
                <!-- Выемка скола: светлая у сломанного края, к ступеньке
                     темнеет — она ниже лица и уходит в тень. -->
                <linearGradient id="${id}-scar" gradientUnits="userSpaceOnUse" x1="24" y1="-31" x2="17" y2="-20">
                    <stop offset="0" stop-color="${S.fresh}"/>
                    <stop offset="1" stop-color="${mixColor(S.fresh, R[2], 0.55)}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${face}"/></clipPath>
            </defs>
            <!-- Контур вокруг лица и торца разом — наружу торчит половина. -->
            ${back} fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${face}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            ${back} fill="${R[0]}"/>
            <path d="${fracture}" fill="${S.fresh}" stroke="${mixColor(S.fresh, R[0], 0.5)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            <path d="${face}" fill="url(#${id}-face)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${face}" fill="url(#${id}-wax)"/>
                <path d="${mark}" fill="none" stroke="${P.soapLit}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
                      stroke-opacity="0.35" transform="translate(0.7 0.8)"/>
                <path d="${mark}" fill="none" stroke="${P.soapMark}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
                      stroke-opacity="0.45"/>
                <path d="${scar}" fill="url(#${id}-scar)"/>
                <path d="${scarRim}" fill="none" stroke="${S.crack}" stroke-width="${STROKE.detail}" stroke-linejoin="round" stroke-opacity="0.7"/>
                <path d="${scarRim}" fill="none" stroke="${P.soapLit}" stroke-width="0.8" stroke-opacity="0.8" transform="translate(-0.9 0.6)"/>
                <path d="${craq}" fill="none" stroke="${S.crack}" stroke-width="${STROKE.detail}" stroke-opacity="0.6" stroke-linejoin="round" stroke-linecap="round"/>
                <path d="${crack}" fill="none" stroke="${P.soapLit}" stroke-width="0.8" stroke-opacity="0.6" transform="translate(0.8 0.5)"/>
                <path d="${crack}" fill="none" stroke="${S.crack}" stroke-width="1.4" stroke-linejoin="round"/>
                <!-- Кромка у торца светлее — стёртый край ловит свет. -->
                <path d="M-33 -27Q-31 -32 -25 -32.5Q-8 -36 11 -34" fill="none" stroke="${R[4]}" stroke-width="2.2"
                      stroke-linecap="round" stroke-opacity="0.8" transform="translate(0.8 1.4)"/>
            </g>
            <path d="${face}" fill="none" stroke="${mixColor(ink, R[1], 0.4)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            <!-- Волос, прилипший к мылу. -->
            <path d="M-31 -6C-23 -12 -19 -2 -11 -8S1 -4 5 -10Q8 -14 12 -11" fill="none" stroke="${S.hair}" stroke-width="0.6" stroke-opacity="0.85" stroke-linecap="round"/>
        </g>`;
    }
};

if (typeof window !== 'undefined') window.BATH_SOAP = BATH_SOAP;
