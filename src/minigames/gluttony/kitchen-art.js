// ================= ГРАФИКА КУХНИ: ВСЁ РИСУЕТСЯ ЗДЕСЬ =================
// Ни одного эмодзи. Кухня и продукты — свои SVG, собранные строками, как
// образы зависти в envy-art.js.
//
// ---------- ДВА СЛОЯ, И ЭТО ГЛАВНОЕ РЕШЕНИЕ ФАЙЛА ----------
// Кухня живёт в системе координат СЦЕНЫ 900×1948 (ровно два стейджа 390×844
// по пропорции), по которой ездит камера. А разделочная доска, нож и то, что
// на них лежит, живут в системе координат ЭКРАНА 390×844 и камере не
// подчиняются.
//
// Так и должно быть: доска — предмет, который игрок держит перед собой. Она
// ближе камеры, поэтому и не уезжает вместе с кухней, а въезжает и выезжает
// сама. Если бы она лежала в сцене, пришлось бы каждый раз пересчитывать её
// положение под текущий наезд — и она бы то пряталась за плитой, то уползала
// за край.
//
// ---------- ЦВЕТ И ЛИНИЯ ----------
// Только из PALETTE.kitchen (CLAUDE.md: хардкод hex запрещён). Лестница
// толщин — общая STROKE, умноженная на два для сцены: она нарисована в
// двойном размере стейджа, и контур 2.6 иначе превратился бы в 1.3, то есть
// в другую ступень лестницы.
//
// ---------- НАРЕЗКА ----------
// Ингредиенты режутся ВСЕ СРАЗУ, поэтому кучка рисуется не по одному
// продукту, а по НАБОРУ типов: мясо даёт красные куски, овощи жёлтые, зелень
// зелёные, и в общей куче видно, из чего блюдо. Отдельного рисунка на каждую
// комбинацию не нужно — цвета берутся из типов, которые лежат на доске.

// Имена с префиксом: скрипты подключаются без модулей, в одну общую область,
// и короткие K/INK уже заняты рендерером червя.
const ktPal = () => PALETTE.kitchen;
const ktInk = () => PALETTE.ink;
const ktStroke = () => ({
    contour: STROKE.contour * 2,
    structure: STROKE.structure * 2,
    detail: STROKE.detail * 2,
    hairline: STROKE.hairline * 2
});

// Детерминированный шум: форма кучки выводится из сида, а не хранится.
function ktRng(seed) {
    let h = (seed >>> 0) ^ 0x9e3779b9;
    return function () {
        h = (h + 0x6D2B79F5) >>> 0;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Невидимая зона захвата. Кучка — это отдельные куски с дырами между ними, и
// палец, попавший в дыру, проваливается мимо. Прозрачная заливка (не `none`:
// `none` событий не ловит) делает захват честным по габаритам.
function ktGrab(rx, ry, cy) {
    return `<ellipse cx="0" cy="${cy || 0}" rx="${rx}" ry="${ry}"
                     fill="#000" fill-opacity="0" pointer-events="all"/>`;
}

// Кучка кусков из НЕСКОЛЬКИХ рамп сразу. Ближние (нижние) рисуются
// последними и перекрывают дальние — так плоский набор пятен читается горкой.
function ktPile(n, r, ramps, seed, opts) {
    const o = opts || {};
    const rng = ktRng(seed);
    const spreadX = o.spreadX || 46;
    const spreadY = o.spreadY || 20;
    const parts = [];
    for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng());
        parts.push({
            x: Math.cos(a) * d * spreadX,
            y: Math.sin(a) * d * spreadY,
            r: r * (0.72 + rng() * 0.56),
            rot: (rng() * 60 - 30).toFixed(1),
            ramp: ramps[Math.floor(rng() * ramps.length)],
            light: rng()
        });
    }
    parts.sort((a, b) => a.y - b.y);
    return parts.map(p => {
        const fill = p.light > 0.62 ? p.ramp[300] : (p.light > 0.25 ? p.ramp[500] : p.ramp[700]);
        // Кусок — не круг: скруглённый прямоугольник со случайным поворотом
        // читается «отрезанным», а круг — «шариком».
        return `<rect x="${(p.x - p.r).toFixed(1)}" y="${(p.y - p.r * 0.72).toFixed(1)}"
                width="${(p.r * 2).toFixed(1)}" height="${(p.r * 1.44).toFixed(1)}"
                rx="${(p.r * 0.42).toFixed(1)}"
                transform="rotate(${p.rot} ${p.x.toFixed(1)} ${p.y.toFixed(1)})"
                fill="${fill}" stroke="${ktInk()}" stroke-width="${ktStroke().detail}"/>`;
    }).join('');
}

const KITCHEN_ART = {

    W: 900,
    H: 1948,

    // Габариты зоны захвата продукта — одинаковы во всех состояниях нарезки.
    GRAB: { rx: 58, ry: 42 },

    // Куда наезжает камера. Прямоугольники вписываются целиком (contain),
    // поэтому вокруг предмета всегда виден кусок кухни.
    FOCUS: {
        overview: { x: 0,   y: 0,    w: 900, h: 1948 },
        fridge:   { x: 0,   y: 300,  w: 330, h: 1010 },
        chop:     { x: 300, y: 1400, w: 520, h: 520 },
        stove:    { x: 330, y: 540,  w: 560, h: 460 },
        pot:      { x: 400, y: 540,  w: 260, h: 320 }
    },

    // Геометрия. Держим здесь, а не в коде мини-игры: это разметка картинки,
    // и меняться она будет вместе с картинкой.
    SLOTS: {
        // Полки холодильника — по типам: мясо, овощи, зелень. Так игрок
        // понимает устройство холодильника с первого взгляда.
        shelfY: { meat: 566, veg: 736, spice: 906 },
        shelfX: [92, 156, 220],
        freezer: { x: 156, y: 410 },
        // Кастрюля и её зона: зона нарочно ВЫШЕ кастрюли, чтобы жидкость
        // можно было держать над ней и лить, а не вставлять внутрь.
        pot: { x: 530, y: 700 },
        // Зона кастрюли шире и ВЫШЕ самой кастрюли: и жидкость держат над
        // ней, и кучки бросают сверху — целиться в горловину пальцем неудобно.
        potZone: { x: 428, y: 468, w: 214, h: 336 },
        spoon: { x: 530, y: 640 },
        // Столешница слева от плиты — сюда встаёт доска с нарезанным.
        boardRest: { x: 372, y: 726 },
        // Бутыли стоят с глубиной, друг за другом, а не шеренгой.
        // Бутыли стоят В РЯД вдоль столешницы, с лёгким разбросом по глубине,
        // но БЕЗ наложения: раньше они висели друг на друге, и попасть в
        // нужную было нельзя. Шаг 58 при полуширине 28 — между ними всегда
        // остаётся зазор.
        // Донца стоят на линии столешницы, а не висят над ней. Дальняя бутыль
        // мельче и ЧУТЬ ВЫШЕ — так читается глубина, а не полёт.
        bottles: [
            { x: 752, y: 722, s: 0.6 },
            { x: 810, y: 714, s: 0.54 },
            { x: 868, y: 722, s: 0.6 }
        ],
        // Лейка висит ВЫШЕ бутылей и не спорит с ними за касания.
        hose: { x: 852, y: 596 }
    },

    // ---------- ЭКРАННЫЙ СЛОЙ ----------
    // Доска и нож в координатах стейджа 390×844.
    FG: {
        // Доска в трапеции: низ шире верха — она ближе к камере.
        board: { hidden: { x: 470, y: 1080 }, fridge: { x: 195, y: 700 }, chop: { x: 195, y: 620 } },
        // Гнёзда под продукты на доске: три в ряд.
        slots: [{ x: -84, y: -6 }, { x: 0, y: -6 }, { x: 84, y: -6 }],
        knife: { x: 262, y: 470 },
        knifeRest: { x: 322, y: 748 },
        knifePivot: 96      // длина от оси вращения до кончика лезвия
    },

    // ================= СЦЕНА =================
    scene() {
        const k = ktPal(), ink = ktInk(), S = ktStroke();
        return `
        <rect x="-900" y="-900" width="2700" height="3900" fill="${PALETTE.plaster[400]}"/>
        <rect x="-900" y="1290" width="2700" height="1800" fill="${PALETTE.timber[300]}"/>
        <path d="M-900 1290 H1800" stroke="${PALETTE.timber[700]}" stroke-width="${S.structure}"/>

        <!-- окно над раковиной -->
        <g>
            <rect x="640" y="120" width="320" height="300" rx="6"
                  fill="${k.water[300]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <circle cx="726" cy="216" r="46" fill="${k.herb[500]}" opacity="0.75"/>
            <circle cx="772" cy="192" r="34" fill="${k.herb[300]}" opacity="0.7"/>
            <path d="M742 258 V388" stroke="${PALETTE.timber[700]}" stroke-width="10" opacity="0.7"/>
            <path d="M800 126 V414 M646 268 H954" stroke="${PALETTE.plaster[200]}" stroke-width="12"/>
            <rect x="640" y="120" width="320" height="300" rx="6" fill="none"
                  stroke="${PALETTE.plaster[200]}" stroke-width="16"/>
            <rect x="640" y="120" width="320" height="300" rx="6" fill="none"
                  stroke="${ink}" stroke-width="${S.detail}"/>
        </g>

        <!-- ---------- ТУМБЫ И СТОЛЕШНИЦА ---------- -->
        <rect x="300" y="812" width="800" height="480" fill="${PALETTE.plaster[600]}"
              stroke="${ink}" stroke-width="${S.structure}"/>
        <rect x="292" y="760" width="816" height="56" rx="8" fill="${k.board[500]}"
              stroke="${ink}" stroke-width="${S.contour}"/>
        <path d="M292 794 H1108" stroke="${k.board[700]}" stroke-width="${S.detail}"/>

        <!-- ---------- ХОЛОДИЛЬНИК ---------- -->
        <g id="kt-fridge" class="kt-hot">
            <rect x="20" y="300" width="270" height="990" rx="18"
                  fill="${k.enamel[700]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <g id="kt-fridge-inside">
                <rect x="32" y="312" width="246" height="200" rx="10" fill="${k.steel[300]}"/>
                <rect x="32" y="530" width="246" height="748" rx="10" fill="${k.enamel[100]}"/>
                <path d="M36 636 H274 M36 806 H274 M36 976 H274"
                      stroke="${k.steel[300]}" stroke-width="7"/>
            </g>
            <g id="kt-door-freezer" class="kt-door">
                <rect x="26" y="306" width="258" height="212" rx="14"
                      fill="${k.enamel[300]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <rect x="244" y="350" width="16" height="120" rx="8"
                      fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
            </g>
            <g id="kt-door-main" class="kt-door">
                <rect x="26" y="524" width="258" height="760" rx="14"
                      fill="${k.enamel[300]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <rect x="244" y="600" width="16" height="190" rx="8"
                      fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
                ${ktGrab(120, 340, 904)}
            </g>
        </g>

        <!-- ---------- ПЛИТА С ДУХОВКОЙ ---------- -->
        <g id="kt-stove" class="kt-hot">
            <rect x="470" y="812" width="260" height="480" rx="8"
                  fill="${k.enamel[500]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <rect x="490" y="906" width="220" height="330" rx="10"
                  fill="${k.steel[700]}" stroke="${ink}" stroke-width="${S.structure}"/>
            <rect x="508" y="930" width="184" height="222" rx="6"
                  fill="${PALETTE.void[900]}" opacity="0.8"/>
            <rect x="494" y="856" width="212" height="16" rx="8"
                  fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
            <circle cx="524" cy="834" r="13" fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
            <circle cx="568" cy="834" r="13" fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
            <rect x="462" y="754" width="276" height="58" rx="8"
                  fill="${k.steel[700]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <ellipse cx="530" cy="782" rx="62" ry="19" fill="${k.steel[500]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <ellipse cx="664" cy="782" rx="44" ry="15" fill="${k.steel[500]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <g id="kt-flame" opacity="0">
                <ellipse cx="530" cy="782" rx="58" ry="16" fill="${k.flame[300]}"/>
                <ellipse cx="530" cy="782" rx="32" ry="9" fill="${k.flame[100]}"/>
            </g>
        </g>

        <!-- ---------- КАСТРЮЛЯ ---------- -->
        <g id="kt-pot" class="kt-hot">
            <path d="M462 610 H598 L590 770 Q530 788 470 770 Z"
                  fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.contour}"
                  stroke-linejoin="round"/>
            <clipPath id="kt-pot-clip">
                <path d="M466 614 H594 L586 766 Q530 783 474 766 Z"/>
            </clipPath>
            <g clip-path="url(#kt-pot-clip)">
                <rect id="kt-pot-fill" x="462" y="772" width="140" height="0" fill="${k.water[500]}"/>
            </g>
            <ellipse cx="530" cy="610" rx="70" ry="16" fill="${k.steel[100]}"
                     stroke="${ink}" stroke-width="${S.structure}"/>
            <path d="M462 632 q-30 22 -6 54" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
            <path d="M598 632 q30 22 6 54" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
            <g id="kt-steam" opacity="0">
                <path d="M504 588 q-12 -30 4 -54 q14 -22 2 -46" fill="none"
                      stroke="${PALETTE.plaster[200]}" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
                <path d="M556 584 q12 -28 -4 -52 q-12 -22 0 -44" fill="none"
                      stroke="${PALETTE.plaster[200]}" stroke-width="6" stroke-linecap="round" opacity="0.6"/>
            </g>
            ${ktGrab(96, 150, 660)}
        </g>

        <!-- струя: рисуется при наливе, от носика до кастрюли -->
        <path id="kt-pour" d="" fill="none" stroke="${k.water[300]}"
              stroke-width="14" stroke-linecap="round" opacity="0"/>

        <!-- ---------- РАКОВИНА ---------- -->
        <g id="kt-sink" class="kt-hot">
            <rect x="830" y="744" width="270" height="130" rx="14"
                  fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <rect x="846" y="758" width="240" height="102" rx="10" fill="${k.steel[700]}"/>
            <ellipse cx="900" cy="828" rx="44" ry="15" fill="${k.enamel[300]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <ellipse cx="938" cy="810" rx="35" ry="12" fill="${k.enamel[100]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <path d="M896 748 V632 q0 -34 -34 -34 h-10" fill="none"
                  stroke="${k.steel[500]}" stroke-width="15" stroke-linecap="round"/>
        </g>

        <g id="kt-hose" class="kt-hot">
            <path id="kt-hose-line" d="M852 604 V620" fill="none"
                  stroke="${k.steel[700]}" stroke-width="8" stroke-linecap="round"/>
            <g id="kt-nozzle">
                <rect x="838" y="612" width="28" height="56" rx="10"
                      fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
                <rect x="842" y="660" width="20" height="10" rx="4" fill="${k.steel[700]}"/>
                ${ktGrab(54, 52, 640)}
            </g>
        </g>

        <g id="kt-bottles"></g>

        <!-- доска, поставленная на столешницу у плиты (появляется после нарезки) -->
        <g id="kt-board-rest" opacity="0"></g>

        <!-- ---------- СТОЛ ДЛЯ НАРЕЗКИ (задник этапа) ---------- -->
        <g id="kt-table" class="kt-hot">
            <rect x="270" y="1420" width="640" height="500" fill="${PALETTE.timber[500]}"/>
            <rect x="256" y="1350" width="668" height="76" rx="10" fill="${k.board[300]}"
                  stroke="${ink}" stroke-width="${S.contour}"/>
            <path d="M256 1392 H924" stroke="${k.board[700]}" stroke-width="${S.detail}"/>
        </g>

        <g id="kt-loose"></g>

        <!-- указатель -->
        <g id="kt-hint" opacity="0" pointer-events="none">
            <path id="kt-hint-line" d="" fill="none" stroke="${k.flame[100]}"
                  stroke-width="8" stroke-linecap="round" stroke-dasharray="16 20" opacity="0.9"/>
            <g id="kt-hint-ring">
              <g id="kt-hint-pulse">
                <circle r="58" fill="none" stroke="${k.flame[300]}" stroke-width="9" opacity="0.95"/>
                <circle r="58" fill="none" stroke="${k.flame[100]}" stroke-width="3"/>
              </g>
            </g>
        </g>

        <g id="kt-spoon" opacity="0">
            <g id="kt-spoon-body">
                <rect x="-9" y="-150" width="18" height="150" rx="9"
                      fill="${PALETTE.timber[500]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <ellipse cx="0" cy="8" rx="26" ry="20" fill="${PALETTE.timber[300]}"
                         stroke="${ink}" stroke-width="${S.structure}"/>
                ${ktGrab(56, 104, -60)}
            </g>
        </g>
        `;
    },

    // ================= ПЕРЕДНИЙ ПЛАН =================
    // Доска и нож в координатах ЭКРАНА: они ближе камеры и ей не подчиняются.
    foreground() {
        const k = ktPal(), ink = ktInk();
        const S = { contour: STROKE.contour, structure: STROKE.structure, detail: STROKE.detail };
        return `
        <!-- ДОСКА. Трапеция: низ шире верха — это и есть перспектива, из
             которой видно, что доска лежит перед игроком, а не приклеена к
             стене. Всё, что на неё кладут, лежит ВНУТРИ этой группы, поэтому
             доска уезжает вместе с содержимым одним движением. -->
        <g id="kt-board" class="kt-fg-board">
            <path d="M-150 -78 H150 L186 78 H-186 Z" fill="${k.board[300]}"
                  stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"/>
            <path d="M-138 -66 H138 L170 66 H-170 Z" fill="${k.board[100]}"
                  stroke="${k.board[700]}" stroke-width="${S.detail}" stroke-linejoin="round"/>
            <path d="M-92 -66 L-108 66 M-30 -66 L-36 66 M32 -66 L38 66 M94 -66 L110 66"
                  stroke="${k.board[500]}" stroke-width="${S.detail}" opacity="0.5"/>
            <!-- ободок-ручка справа: по нему видно, что доску можно взять -->
            <path d="M150 -78 l36 156" stroke="${k.board[700]}" stroke-width="${S.detail}"/>
            <g id="kt-board-items"></g>
            <rect x="-186" y="-78" width="372" height="156" fill="#000" fill-opacity="0"
                  pointer-events="all"/>
        </g>

        <!-- ШЕФ-НОЖ. Ось вращения — у ТОРЦА РУЧКИ (нулевая точка группы),
             поэтому свайп вверх-вниз поднимает и опускает лезвие, как в жизни:
             режут не всем ножом сразу, а качая его на пятке. -->
        <g id="kt-knife" opacity="0">
          <g id="kt-knife-arm">
            <rect x="4" y="-13" width="74" height="26" rx="10"
                  fill="${PALETTE.timber[700]}" stroke="${ink}" stroke-width="${S.structure}"/>
            <rect x="-6" y="-15" width="16" height="30" rx="4"
                  fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
            <!-- клинок шеф-ножа: обух прямой, брюшко выпуклое, остриё далеко -->
            <path d="M-6 -15 H-96 q-28 2 -44 12 q-26 8 -42 14 q16 8 44 10 q40 4 78 4 H-6 Z"
                  fill="${k.steel[100]}" stroke="${ink}" stroke-width="${S.structure}"
                  stroke-linejoin="round"/>
            <path d="M-14 -6 H-120" stroke="${k.steel[300]}" stroke-width="${S.detail}" opacity="0.8"/>
            <!-- Зона захвата ПОВОРАЧИВАЕТСЯ вместе с ножом, поэтому она
                 заметно выше самого лезвия: на поднятом ноже узкая полоса
                 уходит из-под пальца, и нож перестаёт браться. -->
            <rect x="-210" y="-92" width="300" height="184" fill="#000" fill-opacity="0"
                  pointer-events="all"/>
          </g>
        </g>
        `;
    },

    // ---------- ПРОДУКТЫ ----------
    ingredient(key, seed) {
        const k = ktPal(), ink = ktInk(), S = ktStroke();
        const ramp = this.ramp(key);
        const grab = ktGrab(this.GRAB.rx, this.GRAB.ry);
        const line = `stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"`;

        switch (key) {
            case 'pork':
            case 'rib':
                return grab + `
                <path d="M-46 -8 q-8 -34 26 -40 q40 -8 62 12 q22 20 12 44 q-10 24 -44 26 q-46 4 -56 -42 Z"
                      fill="${ramp[500]}" ${line}/>
                <path d="M-30 -20 q22 -12 46 -2 q20 8 20 26" fill="none"
                      stroke="${ramp[300]}" stroke-width="7" stroke-linecap="round"/>
                <path d="M-46 -8 q-14 22 8 34 q14 8 22 -2" fill="${ramp.fat}"
                      stroke="${ink}" stroke-width="${S.detail}"/>`;
            case 'potato':
                return grab + `
                <ellipse cx="0" cy="0" rx="46" ry="32" fill="${ramp[500]}" ${line}/>
                <ellipse cx="-14" cy="-10" rx="16" ry="9" fill="${ramp[300]}" opacity="0.7"/>
                <circle cx="16" cy="6" r="4" fill="${ramp[700]}"/>
                <circle cx="-6" cy="14" r="3" fill="${ramp[700]}"/>`;
            case 'carrot':
                return grab + `
                <path d="M-38 -26 q46 4 68 44 q6 12 -8 14 q-42 4 -66 -44 q-4 -12 6 -14 Z"
                      fill="${ramp[500]}" ${line}/>
                <path d="M-24 -14 q30 8 44 34" fill="none" stroke="${ramp[300]}" stroke-width="6"/>
                <path d="M-38 -26 q-16 -22 -4 -30 M-38 -26 q-24 -8 -30 2 M-38 -26 q-6 -26 8 -30"
                      fill="none" stroke="${k.herb[500]}" stroke-width="8" stroke-linecap="round"/>`;
            case 'tomato':
                return grab + `
                <circle cx="0" cy="4" r="38" fill="${ramp[500]}" ${line}/>
                <path d="M-18 -12 q8 -14 24 -14" fill="none" stroke="${ramp[300]}" stroke-width="8" stroke-linecap="round"/>
                <path d="M0 -34 l-16 -12 l14 2 l-6 -16 l10 12 l8 -14 l2 16 l14 -6 l-10 14 Z"
                      fill="${k.herb[500]}" stroke="${ink}" stroke-width="${S.detail}"/>`;
            case 'berry':
                return grab + `
                <circle cx="-16" cy="6" r="20" fill="${ramp[500]}" ${line}/>
                <circle cx="14" cy="-2" r="22" fill="${ramp[700]}" ${line}/>
                <circle cx="2" cy="20" r="16" fill="${ramp[300]}" ${line}/>`;
            case 'herb':
                return grab + `
                <path d="M0 34 q-4 -40 6 -66" fill="none" stroke="${ramp[700]}" stroke-width="7" stroke-linecap="round"/>
                <path d="M4 6 q-30 -6 -34 -28 q26 -4 36 18 Z" fill="${ramp[500]}" ${line}/>
                <path d="M6 -12 q30 -8 36 -30 q-28 -2 -38 20 Z" fill="${ramp[300]}" ${line}/>
                <path d="M8 -34 q-26 -10 -26 -32 q24 2 30 24 Z" fill="${ramp[500]}" ${line}/>`;
            case 'pepper':
                return grab + `
                <path d="M-30 -30 q40 6 50 44 q6 24 -14 26 q-30 2 -44 -46 q-4 -20 8 -24 Z"
                      fill="${ramp[500]}" ${line}/>
                <path d="M-30 -30 q-4 -18 10 -22" fill="none" stroke="${k.herb[500]}"
                      stroke-width="9" stroke-linecap="round"/>`;
            case 'block':
            default:
                return grab + `
                <rect x="-44" y="-28" width="88" height="56" rx="6" fill="${ramp[500]}" ${line}/>
                <path d="M-44 -8 H44 M-44 10 H44 M-16 -28 V-8 M16 -8 V10 M-16 10 V28"
                      stroke="${ramp[700]}" stroke-width="${S.detail}"/>`;
        }
    },

    ramp(key) {
        const k = ktPal();
        return {
            pork: k.meat, rib: k.meat, potato: k.potato, carrot: k.carrot,
            tomato: k.tomato, berry: k.berry, herb: k.herb, pepper: k.pepper,
            block: k.block
        }[key] || k.potato;
    },

    // ---------- СИЛУЭТ ----------
    // Взятый продукт не исчезает с полки, а остаётся призраком: видно, что
    // именно взяли и что его можно вернуть. Форма та же — только контур.
    ghost(key, seed) {
        const k = ktPal();
        const body = this.ingredient(key, seed)
            .replace(/fill="(?!#000)[^"]*"/g, 'fill="' + k.enamel[100] + '"')
            .replace(/stroke="[^"]*"/g, 'stroke="' + k.steel[500] + '"');
        return `<g opacity="0.42">${body}</g>`;
    },

    // ---------- НАРЕЗАННОЕ ----------
    // Кучка из НЕСКОЛЬКИХ типов сразу: мясо красное, овощи жёлтые, зелень
    // зелёная — и по цвету видно, из чего блюдо. Отдельного рисунка на каждую
    // комбинацию не нужно, они собираются из типов.
    chopped(keys, stage, seed) {
        const ramps = keys.map(key => this.ramp(key));
        const grab = ktGrab(96, 54);
        if (stage <= 0) return '';
        if (stage === 1) return grab + ktPile(4 + keys.length * 3, 16, ramps, seed, { spreadX: 78, spreadY: 26 });
        return grab + ktPile(10 + keys.length * 7, 9, ramps, seed + 7, { spreadX: 86, spreadY: 30 });
    },

    // ---------- БУТЫЛЬ ----------
    bottle(key, empty) {
        const k = ktPal(), ink = ktInk(), S = ktStroke();
        const ramp = { broth: k.broth, milk: k.milk, wine: k.wine }[key] || k.broth;
        const o = empty ? ' opacity="0.35"' : '';
        return `<g${o}>
            ${ktGrab(46, 70)}
            <path d="M-16 -46 h32 v18 q0 10 8 18 q10 10 10 24 v40 q0 10 -10 10 h-48 q-10 0 -10 -10 v-40 q0 -14 10 -24 q8 -8 8 -18 Z"
                  fill="${ramp[300]}" stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"/>
            <path d="M-22 24 h44 v22 q0 10 -10 10 h-24 q-10 0 -10 -10 Z" fill="${ramp[500]}"/>
            <rect x="-14" y="-56" width="28" height="14" rx="4"
                  fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
        </g>`;
    },

    // Доска, поставленная на столешницу у плиты: маленькая, без интерактива.
    boardRest() {
        const k = ktPal(), ink = ktInk(), S = ktStroke();
        return `<path d="M-72 -30 H72 L86 30 H-86 Z" fill="${k.board[300]}"
                      stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"/>`;
    }
};

if (typeof window !== 'undefined') {
    window.KITCHEN_ART = KITCHEN_ART;
    window.ktRng = ktRng;
}
