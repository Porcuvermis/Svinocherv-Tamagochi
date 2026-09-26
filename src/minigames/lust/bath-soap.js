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
    TIERS: ['stub', 'bar', 'toilet', 'pump', 'gel', 'premium', 'baked', 'baked', 'baked'],
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
