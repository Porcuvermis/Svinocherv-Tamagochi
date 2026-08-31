// ================= ГРАФИКА КУХНИ: ВСЁ РИСУЕТСЯ ЗДЕСЬ =================
// Ни одного эмодзи. Кухня и продукты — свои SVG, собранные строками, как
// образы зависти в envy-art.js.
//
// ---------- ОДНА СЦЕНА, А НЕ ТРИ ЭКРАНА ----------
// Вся кухня — один SVG в системе координат 780×1688 (ровно два стейджа
// 390×844, чтобы числа были целыми). Камера не переключает экраны, а
// наезжает на участок этой сцены: холодильник, доска и плита — части одной
// картинки, а не три меню. Отсюда и правило интерфейса: игрок видит то, что
// есть, и пользуется тем, что видит. Никаких всплывающих списков.
//
// ---------- ЦВЕТ ----------
// Только из PALETTE.kitchen (CLAUDE.md: хардкод hex запрещён). Контур —
// PALETTE.ink, толщины — PALETTE.STROKE.
//
// ---------- ТРИ СОСТОЯНИЯ ПРОДУКТА ----------
// Целый кусок → крупные куски кучкой → мелкие куски, почти масса. Цвет при
// этом НЕ меняется: меняется число и размер кусков. Поэтому на каждый
// продукт хватает одной тройки цветов, а на нарезку — одного генератора
// кучки, общего для всех.

// Имена с префиксом: скрипты подключаются без модулей, в одну общую
// область, и короткие K/INK уже заняты рендерером червя.
const ktPal = () => PALETTE.kitchen;
const ktInk = () => PALETTE.ink;

// Лестница толщин — общая (STROKE в palette.js), но сцена нарисована в
// ДВОЙНОМ размере стейджа: на общем виде она ужимается вдвое, и контур 2.6
// превратился бы в 1.3, то есть в другую ступень лестницы. Поэтому здесь она
// умножена на два — на экране получаются ровно те толщины, что задуманы.
const ktStroke = () => ({
    contour: STROKE.contour * 2,
    structure: STROKE.structure * 2,
    detail: STROKE.detail * 2,
    hairline: STROKE.hairline * 2
});

// Детерминированный шум: форма кучки выводится из сида, а не хранится и не
// перебрасывается каждый кадр. Тот же приём, что у отметин на теле.
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

// Кучка кусков. Куски лежат в эллипсе, ближние (нижние) рисуются последними
// и перекрывают дальние — так плоский набор пятен читается объёмной горкой.
function ktPile(n, r, ramp, seed, opts) {
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
            light: rng()
        });
    }
    parts.sort((a, b) => a.y - b.y);
    return parts.map(p => {
        const fill = p.light > 0.62 ? ramp[300] : (p.light > 0.25 ? ramp[500] : ramp[700]);
        // Кусок — не круг: скруглённый прямоугольник со случайным поворотом
        // читается «отрезанным», а круг — «шариком».
        return `<rect x="${(p.x - p.r).toFixed(1)}" y="${(p.y - p.r * 0.72).toFixed(1)}"
                width="${(p.r * 2).toFixed(1)}" height="${(p.r * 1.44).toFixed(1)}"
                rx="${(p.r * 0.42).toFixed(1)}"
                transform="rotate(${p.rot} ${p.x.toFixed(1)} ${p.y.toFixed(1)})"
                fill="${fill}" stroke="${ktInk()}" stroke-width="${ktStroke().detail}"/>`;
    }).join('');
}

// Невидимая зона захвата. Нарезанная кучка — это отдельные куски с дырами
// между ними, и палец, попавший в дыру, проваливался мимо: предмет не
// брался, хотя игрок целился в его середину. Прозрачная заливка (не `none`:
// `none` события не ловит) закрывает эти дыры и делает захват честным по
// габаритам, а не по пикселям рисунка.
function ktGrab(rx, ry) {
    return `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="#000" fill-opacity="0"
                     pointer-events="all"/>`;
}

const KITCHEN_ART = {

    // Габариты зоны захвата продукта. Одинаковы для всех состояний нарезки:
    // кучка занимает столько же места, сколько занимал целый кусок.
    GRAB: { rx: 56, ry: 40 },

    // Размер сцены. Ровно два стейджа: 390×844 × 2.
    W: 780,
    H: 1688,

    // Куда наезжает камера. Прямоугольники в координатах сцены; камера
    // вписывает их целиком (contain), поэтому вокруг предмета всегда остаётся
    // кусок кухни — игрок не теряет, где он находится.
    FOCUS: {
        overview: { x: 0,   y: 0,    w: 780, h: 1688 },
        fridge:   { x: 0,   y: 250,  w: 300, h: 960 },
        board:    { x: 322, y: 1150, w: 450, h: 450 },
        stove:    { x: 270, y: 470,  w: 500, h: 300 }
    },

    // Куда что кладётся. Держим здесь, а не в коде мини-игры: это геометрия
    // картинки, и меняться она будет вместе с картинкой.
    SLOTS: {
        // полки холодильника: три в ряд, четыре ряда
        shelfX: [80, 141, 202],
        shelfY: [566, 716, 866, 1016],
        freezer: { x: 141, y: 372 },
        // Корзина стоит на полу справа от холодильника — в кадре наезда на
        // холодильник, чтобы полёт продукта было видно целиком.
        basket: { x: 168, y: 1116 },
        // продукты, выложенные на стол
        tableY: 1202,
        tableX: [366, 452, 538, 624, 710],
        // центр доски — там режут
        board: { x: 545, y: 1400 },
        knifeRest: { x: 686, y: 1466 },
        // нарезанные кучки ждут на столешнице рядом с кастрюлей
        pileY: 636,
        pileX: [444, 500, 556, 612],
        // бутыли
        bottleY: 620,
        bottleX: [604, 664, 724],
        pot: { x: 366, y: 560 },
        spoon: { x: 366, y: 520 }
    },

    // ---------- СЦЕНА ----------
    // Раскладка (координаты сцены 780×1688), слева направо:
    //   холодильник 20..262 · плита с духовкой 300..540 · бутыли 546..740 ·
    //   раковина 700..960 (правым краем уходит за кадр, как на эскизе)
    // Стол с доской стоит на переднем плане, ниже линии пола.
    scene() {
        const k = ktPal(), ink = ktInk(), S = ktStroke();
        return `
        <!-- стена и пол нарочно шире сцены: при любом наезде камера не
             упирается в пустоту по краям -->
        <rect x="-800" y="-800" width="2400" height="3400" fill="${PALETTE.plaster[400]}"/>
        <rect x="-800" y="1120" width="2400" height="1600" fill="${PALETTE.timber[300]}"/>
        <path d="M-800 1120 H1600" stroke="${PALETTE.timber[700]}" stroke-width="${S.structure}"/>

        <!-- окно над раковиной -->
        <g>
            <rect x="560" y="90" width="300" height="290" rx="6"
                  fill="${k.water[300]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <circle cx="640" cy="180" r="44" fill="${k.herb[500]}" opacity="0.75"/>
            <circle cx="684" cy="158" r="32" fill="${k.herb[300]}" opacity="0.7"/>
            <path d="M654 220 V346" stroke="${PALETTE.timber[700]}" stroke-width="10" opacity="0.7"/>
            <path d="M710 96 V374 M566 232 H854" stroke="${PALETTE.plaster[200]}" stroke-width="12"/>
            <rect x="560" y="90" width="300" height="290" rx="6" fill="none"
                  stroke="${PALETTE.plaster[200]}" stroke-width="16"/>
            <rect x="560" y="90" width="300" height="290" rx="6" fill="none"
                  stroke="${ink}" stroke-width="${S.detail}"/>
        </g>

        <!-- ---------- ТУМБЫ И СТОЛЕШНИЦА ---------- -->
        <rect x="280" y="706" width="640" height="414" fill="${PALETTE.plaster[600]}"
              stroke="${ink}" stroke-width="${S.structure}"/>
        <rect x="272" y="660" width="656" height="50" rx="8" fill="${k.board[500]}"
              stroke="${ink}" stroke-width="${S.contour}"/>
        <path d="M272 690 H928" stroke="${k.board[700]}" stroke-width="${S.detail}"/>

        <!-- ---------- ХОЛОДИЛЬНИК ---------- -->
        <g id="kt-fridge" class="kt-hot">
            <rect x="20" y="250" width="242" height="870" rx="18"
                  fill="${k.enamel[700]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <!-- нутро видно только с открытыми дверцами -->
            <g id="kt-fridge-inside">
                <rect x="32" y="262" width="218" height="196" rx="10" fill="${k.steel[300]}"/>
                <rect x="32" y="476" width="218" height="632" rx="10" fill="${k.enamel[100]}"/>
                <path d="M36 610 H246 M36 760 H246 M36 910 H246"
                      stroke="${k.steel[300]}" stroke-width="6"/>
            </g>
            <!-- дверцы поворачиваются вокруг ЛЕВОГО края (transform-origin в
                 css): это открывание, а не подмена картинки -->
            <g id="kt-door-freezer" class="kt-door">
                <rect x="26" y="256" width="230" height="208" rx="14"
                      fill="${k.enamel[300]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <rect x="216" y="300" width="16" height="120" rx="8"
                      fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
                <path d="M40 300 h60" stroke="${k.enamel[100]}" stroke-width="8" opacity="0.7"/>
            </g>
            <g id="kt-door-main" class="kt-door">
                <rect x="26" y="470" width="230" height="644" rx="14"
                      fill="${k.enamel[300]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <rect x="216" y="540" width="16" height="180" rx="8"
                      fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
                <path d="M40 520 h60" stroke="${k.enamel[100]}" stroke-width="8" opacity="0.7"/>
            </g>
        </g>

        <!-- ---------- ПЛИТА С ДУХОВКОЙ ---------- -->
        <!-- духовка нарисована сразу, хотя механики запекания ещё нет: она
             планируется, и пририсовывать её потом к готовой плите дороже -->
        <g id="kt-stove" class="kt-hot">
            <rect x="300" y="706" width="240" height="414" rx="8"
                  fill="${k.enamel[500]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <rect x="318" y="790" width="204" height="290" rx="10"
                  fill="${k.steel[700]}" stroke="${ink}" stroke-width="${S.structure}"/>
            <rect x="334" y="812" width="172" height="196" rx="6"
                  fill="${PALETTE.void[900]}" opacity="0.8"/>
            <rect x="322" y="748" width="196" height="16" rx="8"
                  fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
            <circle cx="350" cy="726" r="13" fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
            <circle cx="392" cy="726" r="13" fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
            <rect x="292" y="654" width="256" height="52" rx="8"
                  fill="${k.steel[700]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <ellipse cx="366" cy="680" rx="58" ry="18" fill="${k.steel[500]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <ellipse cx="482" cy="680" rx="42" ry="14" fill="${k.steel[500]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <g id="kt-flame" opacity="0">
                <ellipse cx="366" cy="680" rx="54" ry="15" fill="${k.flame[300]}"/>
                <ellipse cx="366" cy="680" rx="30" ry="9" fill="${k.flame[100]}"/>
            </g>
        </g>

        <!-- ---------- КАСТРЮЛЯ на левой конфорке ---------- -->
        <g id="kt-pot" class="kt-hot">
            <path d="M300 522 H432 L424 668 Q366 686 308 668 Z"
                  fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.contour}"
                  stroke-linejoin="round"/>
            <clipPath id="kt-pot-clip">
                <path d="M304 526 H428 L420 664 Q366 681 312 664 Z"/>
            </clipPath>
            <g clip-path="url(#kt-pot-clip)">
                <rect id="kt-pot-fill" x="300" y="670" width="136" height="0" fill="${k.water[500]}"/>
            </g>
            <ellipse cx="366" cy="522" rx="68" ry="15" fill="${k.steel[100]}"
                     stroke="${ink}" stroke-width="${S.structure}"/>
            <path d="M300 544 q-28 20 -6 50" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
            <path d="M432 544 q28 20 6 50" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
            <g id="kt-steam" opacity="0">
                <path d="M342 502 q-12 -28 4 -52 q14 -22 2 -44" fill="none"
                      stroke="${PALETTE.plaster[200]}" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
                <path d="M390 498 q12 -26 -4 -50 q-12 -20 0 -42" fill="none"
                      stroke="${PALETTE.plaster[200]}" stroke-width="6" stroke-linecap="round" opacity="0.6"/>
            </g>
        </g>

        <!-- ---------- РАКОВИНА: правым краем уходит за кадр ---------- -->
        <g id="kt-sink" class="kt-hot">
            <rect x="700" y="644" width="260" height="126" rx="14"
                  fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <rect x="716" y="658" width="230" height="98" rx="10" fill="${k.steel[700]}"/>
            <ellipse cx="770" cy="726" rx="42" ry="15" fill="${k.enamel[300]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <ellipse cx="806" cy="710" rx="34" ry="12" fill="${k.enamel[100]}"
                     stroke="${ink}" stroke-width="${S.detail}"/>
            <!-- смеситель: стойка вверх и дуга ВЛЕВО, чтобы лейка висела в
                 кадре, а не за его краем -->
            <path d="M760 648 V560 q0 -30 -30 -30 h-24" fill="none"
                  stroke="${k.steel[500]}" stroke-width="15" stroke-linecap="round"/>
            <path d="M760 648 V560 q0 -30 -30 -30 h-24" fill="none"
                  stroke="${ink}" stroke-width="${S.detail}" stroke-linecap="round" opacity="0.45"/>
        </g>

        <!-- лейка на шланге: её вытягивают пальцем к кастрюле -->
        <g id="kt-hose" class="kt-hot">
            <path id="kt-hose-line" d="M706 530 V548" fill="none"
                  stroke="${k.steel[700]}" stroke-width="8" stroke-linecap="round"/>
            <g id="kt-nozzle">
                <rect x="692" y="540" width="28" height="56" rx="10"
                      fill="${k.steel[300]}" stroke="${ink}" stroke-width="${S.detail}"/>
                <rect x="696" y="588" width="20" height="10" rx="4" fill="${k.steel[700]}"/>
                <ellipse cx="706" cy="568" rx="62" ry="72" fill="#000" fill-opacity="0"
                         pointer-events="all"/>
            </g>
        </g>

        <!-- ---------- БУТЫЛИ НА СТОЛЕШНИЦЕ ---------- -->
        <g id="kt-bottles"></g>

        <!-- ---------- СТОЛ С ДОСКОЙ (передний план) ---------- -->
        <g id="kt-table" class="kt-hot">
            <rect x="250" y="1230" width="580" height="430" fill="${PALETTE.timber[500]}"/>
            <rect x="236" y="1170" width="608" height="66" rx="10" fill="${k.board[300]}"
                  stroke="${ink}" stroke-width="${S.contour}"/>
            <path d="M236 1206 H844" stroke="${k.board[700]}" stroke-width="${S.detail}"/>
        </g>

        <g id="kt-board" class="kt-hot">
            <rect x="330" y="1262" width="430" height="286" rx="16"
                  fill="${k.board[300]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <rect x="352" y="1282" width="386" height="246" rx="10"
                  fill="${k.board[100]}" stroke="${k.board[700]}" stroke-width="${S.detail}"/>
            <path d="M394 1282 V1528 M458 1282 V1528 M522 1282 V1528 M586 1282 V1528 M650 1282 V1528"
                  stroke="${k.board[500]}" stroke-width="${S.hairline}" opacity="0.55"/>
        </g>

        <!-- ---------- КОРЗИНА У ХОЛОДИЛЬНИКА ---------- -->
        <!-- Взятый продукт должен куда-то попадать НА ГЛАЗАХ. Без корзины он
             улетал к столу, то есть за край кадра, и тап по полке выглядел
             так, будто не сработал вовсе. -->
        <g id="kt-basket" class="kt-hot">
            <path d="M-64 -30 H64 L48 46 Q0 60 -48 46 Z"
                  fill="${k.board[500]}" stroke="${ink}" stroke-width="${S.contour}"
                  stroke-linejoin="round"/>
            <path d="M-58 -6 H58 M-52 18 H52" stroke="${k.board[700]}" stroke-width="${S.detail}"/>
            <path d="M-64 -30 H64" stroke="${k.board[300]}" stroke-width="${S.structure}"/>
            <path d="M-40 -30 q40 -46 80 0" fill="none"
                  stroke="${k.board[700]}" stroke-width="9" stroke-linecap="round"/>
        </g>

        <!-- слои, которые наполняет игра -->
        <g id="kt-loose"></g>
        <g id="kt-knife">
          <g id="kt-knife-bob">
            <g id="kt-knife-body">
                <!-- Рукоять СВЕРХУ, лезвие ВНИЗ: нож смотрит на доску, а не в
                     потолок. В первой версии он был перевёрнут, и над мясом
                     висела рукоятка — читалось как «что-то сломалось». -->
                <rect x="-17" y="-168" width="34" height="100" rx="14"
                      fill="${PALETTE.timber[700]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <rect x="-20" y="-76" width="40" height="16" rx="6"
                      fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
                <path d="M-26 -60 H26 q7 42 2 74 q-5 32 -28 50 q-23 -18 -28 -50 q-5 -32 2 -74 Z"
                      fill="${k.steel[100]}" stroke="${ink}" stroke-width="${S.structure}"
                      stroke-linejoin="round"/>
                <path d="M0 -50 V44" stroke="${k.steel[500]}" stroke-width="${S.hairline}"/>
                <ellipse cx="0" cy="-60" rx="76" ry="126" fill="#000" fill-opacity="0"
                         pointer-events="all"/>
            </g>
          </g>
        </g>
        <!-- ---------- УКАЗАТЕЛЬ ----------
             Единственная подсказка, которая в игре без слов вообще возможна:
             пульсирующее кольцо на том, чего надо коснуться, и пунктирная
             стрелка с бегущей точкой, когда предмет надо ПЕРЕТАЩИТЬ. Слоем
             выше всего остального, но событий не ловит. -->
        <g id="kt-hint" opacity="0" pointer-events="none">
            <path id="kt-hint-line" d="" fill="none" stroke="${k.flame[100]}"
                  stroke-width="7" stroke-linecap="round" stroke-dasharray="14 18" opacity="0.9"/>
            <circle id="kt-hint-dot" r="11" fill="${k.flame[100]}" opacity="0"/>
            <g id="kt-hint-ring">
              <g id="kt-hint-pulse">
                <circle r="54" fill="none" stroke="${k.flame[300]}" stroke-width="8" opacity="0.95"/>
                <circle r="54" fill="none" stroke="${k.flame[100]}" stroke-width="3"/>
              </g>
            </g>
        </g>

        <g id="kt-spoon" opacity="0">
            <g id="kt-spoon-body">
                <rect x="-9" y="-150" width="18" height="150" rx="9"
                      fill="${PALETTE.timber[500]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <ellipse cx="0" cy="8" rx="26" ry="20" fill="${PALETTE.timber[300]}"
                         stroke="${ink}" stroke-width="${S.structure}"/>
                <ellipse cx="0" cy="-60" rx="54" ry="100" fill="#000" fill-opacity="0"
                         pointer-events="all"/>
            </g>
        </g>
        `;
    },

    // ---------- ПРОДУКТЫ ----------
    // stage: 0 целый, 1 крупные куски, 2 мелкие куски.
    // Возвращается содержимое <g>, центрированное в нуле.
    ingredient(key, stage, seed) {
        const k = ktPal(), ink = ktInk(), S = ktStroke();
        const sd = seed || 1;
        const ramp = {
            pork: k.meat, rib: k.meat, potato: k.potato, carrot: k.carrot,
            tomato: k.tomato, berry: k.berry, herb: k.herb, pepper: k.pepper,
            block: k.block
        }[key] || k.potato;

        const grab = ktGrab(this.GRAB.rx, this.GRAB.ry);
        if (stage === 1) return grab + ktPile(5, 17, ramp, sd, { spreadX: 40, spreadY: 16 });
        if (stage >= 2) return grab + ktPile(14, 9, ramp, sd + 7, { spreadX: 44, spreadY: 18 });

        // ---- целый вид: у каждого свой ----
        // Зона захвата идёт и здесь: у зелени и перца силуэт тонкий, попасть
        // по нему пальцем без неё почти нельзя.
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
                <circle cx="-6" cy="14" r="3" fill="${ramp[700]}"/>
                <circle cx="24" cy="-12" r="3" fill="${ramp[700]}"/>`;
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
                      stroke-width="9" stroke-linecap="round"/>
                <path d="M-14 -14 q26 12 32 38" fill="none" stroke="${ramp[300]}" stroke-width="6"/>`;
            case 'block':
            default:
                return grab + `
                <rect x="-44" y="-28" width="88" height="56" rx="6" fill="${ramp[500]}" ${line}/>
                <path d="M-44 -8 H44 M-44 10 H44 M-16 -28 V-8 M16 -8 V10 M-16 10 V28"
                      stroke="${ramp[700]}" stroke-width="${S.detail}"/>`;
        }
    },

    // ---------- БУТЫЛЬ ----------
    // Стоит на столешнице, её перетаскивают к кастрюле. Пустая — приглушённая.
    bottle(key, empty) {
        const k = ktPal(), ink = ktInk(), S = ktStroke();
        const ramp = { broth: k.broth, milk: k.milk, wine: k.wine }[key] || k.broth;
        const o = empty ? ' opacity="0.35"' : '';
        return `<g${o}>
            ${ktGrab(40, 62)}
            <path d="M-16 -46 h32 v18 q0 10 8 18 q10 10 10 24 v40 q0 10 -10 10 h-48 q-10 0 -10 -10 v-40 q0 -14 10 -24 q8 -8 8 -18 Z"
                  fill="${ramp[300]}" stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"/>
            <path d="M-22 24 h44 v22 q0 10 -10 10 h-24 q-10 0 -10 -10 Z" fill="${ramp[500]}"/>
            <rect x="-14" y="-56" width="28" height="14" rx="4"
                  fill="${k.steel[500]}" stroke="${ink}" stroke-width="${S.detail}"/>
        </g>`;
    }
};

if (typeof window !== 'undefined') {
    window.KITCHEN_ART = KITCHEN_ART;
    window.ktRng = ktRng;
}
