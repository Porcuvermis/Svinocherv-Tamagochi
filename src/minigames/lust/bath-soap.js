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
    TIERS: ['stub', 'bar', 'baked', 'baked', 'baked', 'baked', 'baked', 'baked', 'baked'],
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
        return BATH_BAKED.draw('soap');
    },

    // Габарит на сцене — по нему иконка магазина ужимает вещь под клетку.
    box(level) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'stub') return { x: 546, y: 322, w: 60, h: 44 };
        if (kind === 'bar') return { x: 522, y: 306, w: 106, h: 68 };
        return BATH_BAKED.box('soap');
    },

    // Полка перерисовывается после покупки и после debug-панели: ступень
    // меняется, пока ванная открыта.
    refresh() {
        const el = typeof document !== 'undefined' && document.getElementById('bt-soap-art');
        if (el) el.innerHTML = this.draw(null, 'shelf');
    },

    // ---------- 1. ХОЗЯЙСТВЕННОЕ ----------
    // Целый брусок «72%» в обрывке обёртки. После обмылка это достаток:
    // кусок большой, края ровные, клеймо читается целиком.
    //   * Стоит на длинном ребре лицом к нам — лёжа он весь ушёл бы за
    //     переднюю сетку корзины.
    //   * Перспектива комнаты: корзина правее точки схода, поэтому виден
    //     ЛЕВЫЙ торец (узкая полоса, уходящая вниз-влево к точке схода).
    //     Верх не виден — корзина выше глаза.
    //   * Обёртка — серая бумага на правой части: рваный край с белёсыми
    //     волокнами, отогнутый уголок оборотной стороной, мятые складки,
    //     две выцветшие полосы печати. Букв на ней нет — инвариант 9.
    bar() {
        const P = btPal(), R = P.soap, W = P.soapWrap, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);
        const X0 = -45, X1 = 45, Y0 = -28, Y1 = 28, r = 4;

        // Лицо бруска — прямоугольник со слегка скруглёнными рёбрами.
        const face = `M${X0 + r} ${Y0}H${X1 - r}Q${X1} ${Y0} ${X1} ${Y0 + r}V${Y1 - r}Q${X1} ${Y1} ${X1 - r} ${Y1}`
                   + `H${X0 + r}Q${X0} ${Y1} ${X0} ${Y1 - r}V${Y0 + r}Q${X0} ${Y0} ${X0 + r} ${Y0}Z`;
        // Левый торец: ребро, сдвинутое к точке схода на глубину бруска.
        const D = { x: -4.5, y: 8.8 };
        // Низ торца срезан на уровне передней перекладины дна: ниже он
        // торчал бы из-под корзины тёмным хвостиком.
        const end = `M${X0} ${Y0 + r}L${X0 + D.x} ${Y0 + r + D.y}V${Y1 + 3}L${X0} ${Y1}Z`;

        // Рваный край обёртки: зигзаг сверху вниз из сида.
        const rnd = btRng(1972), tear = [];
        for (let y = Y0 - 2.5; y <= Y1 + 2.5 + 0.01; y += 3.2)
            tear.push([12 + Math.sin(y * 0.21) * 3 + (rnd() - 0.5) * 3.4, Math.min(y, Y1 + 2.5)]);
        tear[tear.length - 1][1] = Y1 + 2.5;
        const tearD = 'M' + tear.map(p => `${f(p[0])} ${f(p[1])}`).join('L');
        const paper = tearD + `L${X1 - 1} ${Y1 + 2.5}Q${X1 + 3} ${Y1 + 2.5} ${X1 + 3} ${Y1 - 1}`
                    + `V${Y0 + 1}Q${X1 + 3} ${Y0 - 2.5} ${X1 - 1} ${Y0 - 2.5}Z`;
        // Отогнутый уголок у верха разрыва — изнанкой наружу.
        const t0 = tear[0], t2 = tear[2];
        const flap = `M${f(t0[0])} ${f(t0[1])}L${f(t0[0] - 10)} ${f(t0[1] - 7)}Q${f(t0[0] - 9)} ${f(t0[1] - 2)} ${f(t2[0] - 3)} ${f(t2[1])}L${f(t2[0])} ${f(t2[1])}Z`;
        // Мятые складки бумаги: тёмная ложбинка и светлый гребень рядом.
        // Прямые штрихи читались царапинами — складка мягкая и длинная.
        let creaseLo = '', creaseHi = '';
        for (const [x, y, dx, dy, bx, by] of [[16, -24, 26, 14, 10, 2], [20, 22, 22, -18, 8, -4], [30, -2, 14, 6, 6, -3]]) {
            creaseLo += `M${x} ${y}q${bx} ${by} ${dx} ${dy}`;
            creaseHi += `M${x + 0.9} ${y - 0.9}q${bx} ${by} ${dx} ${dy}`;
        }

        // Клеймо «72%» — вдавленное: тёмное дно, светлая нижняя стенка.
        const mark = 'M-38 -18L-26 -18L-33 -1'
                   + 'M-22 -15Q-20 -19 -15.5 -18.5Q-11 -18 -12 -12.5L-22 -1L-11 -1'
                   + 'M-6 -1L6 -19'
                   + 'M-6.9 -15a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0'
                   + 'M2.1 -5a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0';

        return `
        <g class="bt-soap bt-soap-bar" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="${X0}" y1="${Y0}" x2="${X1 - 10}" y2="${Y1}">
                    <stop offset="0" stop-color="${R[4]}"/>
                    <stop offset="0.4" stop-color="${R[3]}"/>
                    <stop offset="1" stop-color="${R[2]}"/>
                </linearGradient>
                <linearGradient id="${id}-paper" gradientUnits="userSpaceOnUse" x1="10" y1="${Y0}" x2="${X1}" y2="${Y1}">
                    <stop offset="0" stop-color="${W.hi}"/>
                    <stop offset="0.5" stop-color="${W.paper}"/>
                    <stop offset="1" stop-color="${W.lo}"/>
                </linearGradient>
                <clipPath id="${id}-face-clip"><path d="${face}"/></clipPath>
                <clipPath id="${id}-paper-clip"><path d="${paper}"/></clipPath>
            </defs>
            <path d="${end}${face}${paper}${flap}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${end}" fill="${R[1]}"/>
            <path d="M${X0} ${Y0 + r}L${X0 + D.x} ${Y0 + r + D.y}" stroke="${R[3]}" stroke-width="1.2" stroke-linecap="round"/>
            <path d="${face}" fill="url(#${id}-face)"/>
            <g clip-path="url(#${id}-face-clip)">
                <!-- Скруглённые рёбра: свет по верхнему и левому, тень по нижнему. -->
                <path d="M${X0 + 1.5} ${Y1 - 3}V${Y0 + 2}Q${X0 + 1.5} ${Y0 + 1.5} ${X0 + 4} ${Y0 + 1.5}H${X1 - 2}"
                      fill="none" stroke="${P.soapLit}" stroke-width="2.4" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="M${X0} ${Y1 - 1.5}H${X1}" stroke="${R[1]}" stroke-width="3.5" stroke-opacity="0.45"/>
                <path d="${mark}" fill="none" stroke="${P.soapLit}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"
                      transform="translate(0.8 0.9)"/>
                <path d="${mark}" fill="none" stroke="${P.soapMark}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- Тень от края обёртки на мыле. -->
                <path d="${tearD}" fill="none" stroke="${R[0]}" stroke-width="3" stroke-opacity="0.3" transform="translate(-1.6 0)"/>
            </g>
            <path d="${face}" fill="none" stroke="${mixColor(ink, R[1], 0.4)}" stroke-width="${STROKE.hairline}"/>
            <path d="${paper}" fill="url(#${id}-paper)"/>
            <g clip-path="url(#${id}-paper-clip)">
                <!-- Печать: две выцветшие полосы и кольцо эмблемы, рваные
                     вместе с бумагой. -->
                <path d="M0 -9H${X1 + 4}M0 7H${X1 + 4}" stroke="${W.print}" stroke-width="3.2" stroke-opacity="0.75"/>
                <circle cx="33" cy="-19" r="5.5" fill="none" stroke="${W.print}" stroke-width="1.6" stroke-opacity="0.7"/>
                <path d="${creaseLo}" fill="none" stroke="${W.lo}" stroke-width="1.4" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="${creaseHi}" fill="none" stroke="${W.hi}" stroke-width="1" stroke-opacity="0.8" stroke-linecap="round"/>
                <!-- Бумага огибает торец: справа темнеет. -->
                <path d="M${X1 + 1} ${Y0 - 2}V${Y1 + 2}" stroke="${W.lo}" stroke-width="4" stroke-opacity="0.6"/>
            </g>
            <!-- Рваный край: белёсые волокна поверх, тонкая тень под ними. -->
            <path d="${tearD}" fill="none" stroke="${W.fiber}" stroke-width="2" stroke-linejoin="round" transform="translate(0.9 0)"/>
            <path d="${tearD}" fill="none" stroke="${mixColor(ink, W.lo, 0.5)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            <path d="${flap}" fill="${W.back}" stroke="${mixColor(ink, W.lo, 0.5)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
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
