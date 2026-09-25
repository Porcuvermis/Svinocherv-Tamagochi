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
    // Свежий целый брусок «72%». После обмылка это достаток: кусок большой,
    // рёбра ровные, клеймо глубокое и целиком. Обёртку пробовали — лишнее:
    // вещь должна читаться самим мылом.
    //   * Стоит на длинном ребре лицом к нам — лёжа он весь ушёл бы за
    //     переднюю сетку корзины.
    //   * Перспектива комнаты: корзина правее точки схода, поэтому виден
    //     ЛЕВЫЙ торец — узкая полоса, уходящая вниз-влево к точке схода.
    //     Верх не виден: корзина выше глаза.
    //   * Рёбра срезаны узкой фаской: свет сверху-слева, поэтому верхняя и
    //     левая фаски светлые, нижняя и правая — тёмные. Фаска и делает
    //     брусок бруском, а не плоской плашкой.
    //   * Клеймо вдавлено: верхняя стенка канавки в тени, нижняя на свету.
    //   * Свежее мыло чуть восковое — мягкий отлив, и редкие поры.
    bar() {
        const P = btPal(), R = P.soap, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const X0 = -45, X1 = 45, Y0 = -28, Y1 = 28, r = 3, b = 3.2;

        const rect = (x0, y0, x1, y1, q) =>
            `M${x0 + q} ${y0}H${x1 - q}Q${x1} ${y0} ${x1} ${y0 + q}V${y1 - q}Q${x1} ${y1} ${x1 - q} ${y1}`
          + `H${x0 + q}Q${x0} ${y1} ${x0} ${y1 - q}V${y0 + q}Q${x0} ${y0} ${x0 + q} ${y0}Z`;
        const face = rect(X0, Y0, X1, Y1, r);
        const top = rect(X0 + b, Y0 + b, X1 - b, Y1 - b, 1.5);   // плоскость внутри фасок
        // Фаски — четыре трапеции между внешним контуром и плоскостью.
        const bev = (pts) => 'M' + pts.map(p => p.join(' ')).join('L') + 'Z';
        const bevTop = bev([[X0 + 1, Y0], [X1 - 1, Y0], [X1 - b, Y0 + b], [X0 + b, Y0 + b]]);
        const bevLeft = bev([[X0, Y0 + 1], [X0 + b, Y0 + b], [X0 + b, Y1 - b], [X0, Y1 - 1]]);
        const bevRight = bev([[X1, Y0 + 1], [X1, Y1 - 1], [X1 - b, Y1 - b], [X1 - b, Y0 + b]]);
        const bevBot = bev([[X0 + 1, Y1], [X0 + b, Y1 - b], [X1 - b, Y1 - b], [X1 - 1, Y1]]);
        // Левый торец: ребро, сдвинутое к точке схода на глубину бруска.
        // Низ срезан на уровне передней перекладины дна: ниже он торчал бы
        // из-под корзины тёмным хвостиком.
        const D = { x: -4.5, y: 8.8 };
        const end = `M${X0} ${Y0 + r}L${X0 + D.x} ${Y0 + r + D.y}V${Y1 + 3}L${X0} ${Y1}Z`;

        // Клеймо «72%» — почти по центру лица, чуть выше: на полке низ
        // бруска закрыт сеткой, а в руке виден целиком, и клеймо должно
        // сидеть прилично в обоих случаях.
        const mark = 'M-24 -14L-12 -14L-19 4'
                   + 'M-7 -10.5Q-5 -15 -0.5 -14.5Q4 -14 3 -8.5L-7 4L4 4'
                   + 'M9 4L21 -14'
                   + 'M8.1 -10a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0'
                   + 'M17.1 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0';
        // Поры: редкие мелкие точки, из сида.
        const rnd = btRng(72);
        let pores = '';
        for (let i = 0; i < 16; i++) {
            const x = X0 + 6 + rnd() * (X1 - X0 - 12), y = Y0 + 5 + rnd() * (Y1 - Y0 - 10), q = 0.35 + rnd() * 0.4;
            pores += `M${(x - q).toFixed(1)} ${y.toFixed(1)}a${q.toFixed(2)} ${q.toFixed(2)} 0 1 0 ${(2 * q).toFixed(2)} 0a${q.toFixed(2)} ${q.toFixed(2)} 0 1 0 ${(-2 * q).toFixed(2)} 0Z`;
        }

        return `
        <g class="bt-soap bt-soap-bar" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <!-- Плоскость: сверху светлее (лампа над ванной), к низу и
                     вправо темнеет. -->
                <linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="${X0}" y1="${Y0}" x2="${X1 - 20}" y2="${Y1}">
                    <stop offset="0" stop-color="${R[3]}"/>
                    <stop offset="0.55" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${R[1]}"/>
                </linearGradient>
                <!-- Восковой отлив — мягкое пятно, без края. -->
                <radialGradient id="${id}-wax" gradientUnits="userSpaceOnUse" cx="-18" cy="-14" r="30"
                                gradientTransform="translate(-18 -14) scale(1.5 0.55) translate(18 14)">
                    <stop offset="0" stop-color="${R[4]}" stop-opacity="0.85"/>
                    <stop offset="1" stop-color="${R[4]}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="${id}-end" gradientUnits="userSpaceOnUse" x1="0" y1="${Y0}" x2="0" y2="${Y1 + 3}">
                    <stop offset="0" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${R[0]}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${top}"/></clipPath>
            </defs>
            <path d="${end}${face}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${end}" fill="url(#${id}-end)"/>
            <path d="${face}" fill="${R[2]}"/>
            <path d="${bevTop}" fill="${P.soapLit}"/>
            <path d="${bevLeft}" fill="${R[4]}"/>
            <path d="${bevRight}" fill="${R[1]}"/>
            <path d="${bevBot}" fill="${R[0]}"/>
            <path d="${top}" fill="url(#${id}-face)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${top}" fill="url(#${id}-wax)"/>
                <path d="${pores}" fill="${R[0]}" fill-opacity="0.45"/>
                <!-- Канавка клейма: светлая нижняя стенка, тёмное дно, тень
                     под верхней стенкой. -->
                <path d="${mark}" fill="none" stroke="${P.soapLit}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"
                      transform="translate(0.5 0.9)"/>
                <path d="${mark}" fill="none" stroke="${R[1]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="${mark}" fill="none" stroke="${P.soapMark}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                      transform="translate(-0.3 -0.5)"/>
            </g>
            <path d="${top}" fill="none" stroke="${mixColor(ink, R[1], 0.55)}" stroke-width="${STROKE.hairline}" stroke-opacity="0.6"/>
            <path d="M${X0} ${Y0 + r}L${X0 + D.x} ${Y0 + r + D.y}" stroke="${R[3]}" stroke-width="1" stroke-linecap="round"/>
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
