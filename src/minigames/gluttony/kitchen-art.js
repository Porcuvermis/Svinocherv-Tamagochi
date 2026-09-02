// ============ ГРАФИКА КУХНИ: ИГРОВОЙ СЛОЙ ПОВЕРХ СКЛАДА ============
//
// Этот файл БОЛЬШЕ НЕ РИСУЕТ кухню. Кухню рисует склад предметов
// (kitchen-objects.js, разбор — docs/kitchen-objects.md), а здесь остаётся
// то, что знает только игра:
//
//   • какие предметы попадают в кадр и в каком порядке;
//   • какие из них ИНТЕРАКТИВНЫ — им нужны id, классы и зоны захвата;
//   • куда наезжает камера и где лежат гнёзда (FOCUS, SLOTS, FG);
//   • продукты, кучки нарезанного и прочее, чего в референсе нет.
//
// ---------- ПОЧЕМУ ТАК, А НЕ ОДНОЙ ПРОСТЫНЁЙ ----------
// Прежняя версия рисовала кухню прямо здесь, одной строкой в шестьсот
// строк, и правка картинки означала правку игрового файла. Теперь картинка
// правится в мастерской (tools/kitchen-objects.html) по одному предмету, а
// игра о ней знает ровно одно: имена предметов и точки, куда что кладут.
//
// ---------- ДВА СЛОЯ КООРДИНАТ (не изменилось) ----------
// Кухня живёт в координатах СЦЕНЫ 720×1500, по ней ездит камера. Доска и
// нож живут в координатах ЭКРАНА 390×844 и камере не подчиняются: доска —
// предмет, который игрок держит перед собой, она ближе камеры.
//
// ---------- ЧИСЛА СЦЕНЫ ЖИВУТ ЗДЕСЬ ----------
// Уровень жидкости, вылет горлышка бутыли, точка выхода лейки — всё это
// РАЗМЕТКА КАРТИНКИ, а не правила игры. Раньше эти числа лежали в
// gluttony.js, и смена картинки означала правку игровой логики. Теперь
// gluttony.js спрашивает их отсюда и о геометрии не знает ничего.

// Имена с префиксом: скрипты подключаются без модулей, в одну общую область.
const ktPal = () => PALETTE.kitchen;
const ktScene = () => PALETTE.kitchenScene;
const ktInk = () => PALETTE.ink;
const ktStroke = () => ({
    contour: STROKE.contour * 1.6,
    structure: STROKE.structure * 1.6,
    detail: STROKE.detail * 1.6,
    hairline: STROKE.hairline * 1.6
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

// Невидимая зона захвата. Прозрачная заливка (не `none`: `none` событий не
// ловит) делает захват честным по габаритам.
//
// cx/cy обязательны там, где группа нарисована в АБСОЛЮТНЫХ координатах
// сцены (дверца, лейка): по умолчанию центр в нуле, и такая зона уезжает в
// стену — предмет остаётся кликабельным только по своим тонким деталям.
function ktGrab(rx, ry, cy, cx) {
    return `<ellipse cx="${cx || 0}" cy="${cy || 0}" rx="${rx}" ry="${ry}"
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

    // Сцена = кадр референса плюс поля сверху и снизу: камера вписывает её в
    // стейдж по меньшей стороне, и без полей по краям виден фон страницы.
    W: 720,
    H: 1500,

    // Во сколько раз продукты мельче, чем нарисованы. Склад и продукты
    // рисовались в разных масштабах; вместо переписывания всех путей
    // продукты ужимаются одним множителем при отрисовке.
    ITEM: 0.78,

    // Габариты зоны захвата продукта — одинаковы во всех состояниях нарезки.
    GRAB: { rx: 58, ry: 42 },

    // Куда наезжает камера. Прямоугольники вписываются целиком (contain),
    // поэтому вокруг предмета всегда виден кусок кухни.
    FOCUS: {
        overview: { x: 0,   y: -60,  w: 720, h: 1560 },
        fridge:   { x: 8,   y: 230,  w: 310, h: 790 },
        // Кадр нарезки подобран так, чтобы столешница стола НАКРЫВАЛА доску
        // переднего плана всеми четырьмя углами (проверяет
        // tools/check-kitchen-fit.js, раздел 5). Прежний, более общий кадр
        // оставлял доску висеть НИЖЕ стола — резали на весу.
        chop:     { x: 358, y: 598,  w: 244, h: 528 },
        stove:    { x: 255, y: 300,  w: 465, h: 400 },
        pot:      { x: 307, y: 360,  w: 250, h: 250 }
        // Отдельного кадра под кормёжку нет: червь приходит на ОБЩИЙ ВИД
        // кухни и встаёт у стола.
    },

    // Геометрия. Держим здесь, а не в коде мини-игры: это разметка картинки,
    // и меняться она будет вместе с картинкой.
    SLOTS: {
        // Полки холодильника — по типам: мясо, овощи, зелень. Так игрок
        // понимает устройство холодильника с первого взгляда. Числа — это
        // линии полок из KITCHEN_OBJECTS.fridgeInside минус высота продукта.
        shelfY: { meat: 566, veg: 666, spice: 766 },
        // Полка — не три точки, а ОТРЕЗОК: сколько на ней продуктов, столько
        // мест на нём и раскладывается.
        //   x0/x1 — края отрезка, cx — середина полки,
        //   gap   — шаг, когда места ещё вдоволь,
        //   tight — шаг, ниже которого продукты начинают мельчать.
        shelf: { x0: 84, x1: 262, cx: 173, gap: 52, tight: 42 },
        freezer: { x: 172, y: 340 },
        // Куда указывать на общем виде: середина двери холодильника.
        fridgeDoor: { x: 170, y: 700 },

        // Кастрюля и её зона. Зона нарочно ВЫШЕ кастрюли: жидкость держат
        // НАД ней и льют, а не вставляют внутрь.
        pot: { x: 392, y: 470 },
        // Зона ШИРЕ кастрюли с каждой стороны и уходит ЗА ВЕРХ кадра (план,
        // §2.5): и жидкость держат над кастрюлей, и кучку отпускают сверху —
        // целиться пальцем в горловину неудобно. Промаха по вертикали не
        // существует вовсе. Правая кромка не доходит до бутылей: иначе
        // бутыль начинала бы лить, стоя на своём месте.
        potZone: { x: 302, y: -120, w: 176, h: 660 },
        // Куда целится струя: в САМУ горловину. Ниже кромки целиться нельзя —
        // струю обрезает передняя стенка, и выглядит это так, будто жидкость
        // льётся ЗА кастрюлю, мимо.
        potMouth: { x: 392, y: 416 },
        spoon: { x: 392, y: 428 },

        // Доска с нарезанным встаёт на ПРАВЫЙ край столешницы, у мойки.
        // План (§2.4) говорит «слева от плиты», но в этой кухне слева от
        // плиты стоит холодильник — свободной столешницы там нет вовсе.
        // Отступление сознательное: место выбрано единственное, где доска и
        // три кучки не налезают ни на бутыли, ни на варочную панель.
        boardRest: { x: 640, y: 482 },
        // Гнёзда кучек — НА доске и ВДОЛЬ неё, а не тремя точками в ряд по
        // горизонтали: доска нарисована в перспективе, и ровный ряд съезжал
        // с неё левым краем на голую столешницу.
        piles: [{ x: 602, y: 490 }, { x: 640, y: 480 }, { x: 678, y: 470 }],
        pileScale: 0.44,

        // Бутыли стоят В РЯД вдоль столешницы, на месте декоративных бутылок
        // референса. Шаг 46 при полуширине 19 — между ними всегда зазор,
        // иначе попасть пальцем в нужную нельзя.
        // Жидкости стоят У ПЛИТЫ (план, §1): наливают их там же, где варят.
        // Донце каждой лежит В ПЛОСКОСТИ столешницы, а не над ней: бутыль,
        // висящая на пять единиц выше кромки, глазом не ловится, а числом
        // ловится сразу (check-kitchen-fit, раздел 1) — и именно так они и
        // стояли после переезда на новую графику.
        bottles: [
            { x: 490, y: 442, s: 0.92 },
            { x: 530, y: 438, s: 0.92 },
            { x: 570, y: 433, s: 0.92 }
        ],
        // Лейка КРАНА (план, §2.4: «бутыль или лейка крана»). В покое сидит
        // в изливе смесителя и с ним сливается; её вытягивают на шланге и
        // несут к кастрюле. Отдельная лейка-ведро, которой это заменили при
        // первом переезде на новую графику, была ошибкой: она читалась
        // второй кастрюлей и отменяла кран как предмет.
        hose: { x: 678, y: 432 }
    },

    // ---------- ЭКРАННЫЙ СЛОЙ ----------
    // Доска и нож в координатах стейджа 390×844. Числа не менялись при
    // переезде на новую графику: передний план камере не подчиняется, и
    // размер сцены на него не влияет.
    FG: {
        // Доска в трапеции: низ шире верха — она ближе к камере.
        // hidden — из-за нижнего правого края (доска ВЪЕЗЖАЕТ оттуда),
        // away — за верхний край: туда она уходит, когда её уносят к плите.
        board: { hidden: { x: 470, y: 1080 }, fridge: { x: 195, y: 700 },
                 chop: { x: 195, y: 620 }, away: { x: 195, y: -220 } },
        // Гнёзда под продукты на доске: три в ряд.
        slots: [{ x: -84, y: -6 }, { x: 0, y: -6 }, { x: 84, y: -6 }],
        // Ось ножа стоит так, чтобы в нижней точке лезвие входило в кучку на
        // доске, а не парило над ней: доска на y=620, верх кучки ≈590, кромка
        // лезвия при KNIFE_DOWN приходит на ≈604. Числа связаны — двигать
        // одно без другого нельзя.
        knife: { x: 294, y: 578 },
        knifeRest: { x: 314, y: 742 },
        knifePivot: 96      // длина от оси вращения до кончика лезвия
    },

    // ---------- ЧИСЛА КАРТИНКИ, КОТОРЫЕ НУЖНЫ ЛОГИКЕ ----------
    // Уровень в кастрюле: докуда доходит дно и насколько высоко поднимается
    // жидкость. Оба числа — из формы кастрюли, а не из правил игры.
    // Полный уровень останавливается ЧУТЬ НИЖЕ венчика: дойдя до него,
    // жидкость закрывала стальной поясок, и кастрюля превращалась в стакан.
    POT_FILL: { bottom: 516, max: 76 },
    // Лейка: вокруг какой точки она растёт в руке и где у неё выход.
    // Лейка крана: вокруг какой точки она растёт в руке, где у неё выход и
    // откуда тянется шланг. Шланг идёт из излива — потому и якорь отдельно.
    HOSE: { pivot: { x: 678, y: 432 }, out: { x: 678, y: 452 },
            anchor: { x: 678, y: 422 }, zoom: 2 },
    // От центра бутыли до её горлышка, в единицах сцены.
    BOTTLE_NECK: 48,
    // Куда приходит червь — точка ПОЛА, перед разделочным столом.
    FEED_SPOT: { x: 372, y: 1330 },

    // Цвет жидкости: бутыли, струи и уровня в кастрюле. Один источник на
    // все три — иначе налитое из красной бутыли оказывается жёлтым.
    liquid(key) {
        const s = ktScene();
        return s[key] || s.broth;
    },

    // ================= СЦЕНА =================
    scene() {
        const O = KITCHEN_OBJECTS;
        const s = ktScene();
        return `
        <defs>
            <!-- «Гуашь»: сильное размытие плюс резкий порог по альфе. Шарики
                 под этим фильтром сливаются в одну текучую массу — границы
                 каждого пропадают, объединение остаётся. -->
            <filter id="kt-goo" x="-25%" y="-15%" width="150%" height="130%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="b"/>
                <feColorMatrix in="b" type="matrix" values="
                    1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 26 -11"/>
            </filter>
            <!-- Кастрюлю режем по её же корпусу: уровень жидкости виден
                 СКВОЗЬ сталь. Это сознательный отход от правды ради
                 читаемости — иначе налив не видно вовсе: смотрим мы на
                 кастрюлю почти сбоку, внутрь заглянуть нечем. -->
            <clipPath id="kt-pot-clip">
                <path d="M322 437 Q392 451 462 437 L456 511 Q392 528 328 511 Z"/>
            </clipPath>
        </defs>

        ${O.wall.draw()}
        ${O.tileWall.draw()}
        ${O.window.draw()}
        ${O.sill.draw()}
        ${O.floor.draw()}
        ${O.floorShade.draw()}
        ${O.counter.draw()}
        ${O.cooktop.draw()}

        <!-- Огонь конфорки под кастрюлей. Отдельной группой поверх панели:
             включается, когда на плиту приносят нарезанное. -->
        <g id="kt-flame" opacity="0">
            <ellipse cx="392" cy="522" rx="44" ry="14" fill="${ktPal().flame[300]}" opacity="0.8"/>
            <ellipse cx="392" cy="522" rx="26" ry="8" fill="${ktPal().flame[100]}"/>
        </g>

        ${O.oven.draw()}
        ${O.cabinet.draw()}
        ${O.sink.draw()}
        ${O.table.draw()}
        <!-- Доска и нож НА СТОЛЕ (план, §1: «стол с разделочной доской и
             ножом»). Пока игрок не полез в холодильник, кухня выглядит ровно
             как в референсе. Как только доску забирают, набор гаснет: она
             теперь в руках, и лежать на столе одновременно не может. -->
        <g id="kt-table-set">
            ${O.boardShadow.draw()}
            ${O.board.draw()}
            ${O.knife.draw()}
        </g>
        ${O.sparkle.draw()}

        <!-- ---------- КАСТРЮЛЯ ---------- -->
        <!-- Тень кастрюли — отдельный предмет склада, а не часть самой
             кастрюли. Пока размывка жила внутри pot.draw(), силуэт мерился
             по краю тени, а не по краю металла, и проверка силуэтов считала,
             что кастрюля сливается с плитой. -->
        ${O.potShade.draw()}
        <g id="kt-pot" class="kt-hot">
            ${O.pot.draw({ lid: false })}
            <g clip-path="url(#kt-pot-clip)">
                <rect id="kt-pot-fill" x="320" y="516" width="146" height="0"
                      fill="${s.broth[500]}" opacity="0.82"/>
            </g>
            <g id="kt-steam" opacity="0">
                <path d="M357 400 q-10 -26 4 -46 q12 -20 2 -40" fill="none"
                      stroke="${s.wall.hi}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
                <path d="M419 396 q10 -24 -4 -44 q-10 -20 0 -38" fill="none"
                      stroke="${s.wall.hi}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
            </g>
            ${ktGrab(84, 76, 468, 392)}
        </g>

        <!-- ---------- ХОЛОДИЛЬНИК ---------- -->
        <!-- Холодильник идёт ПОСЛЕ кастрюли: он ближе к камере. Пока он был
             раньше, левая ручка кастрюли рисовалась поверх белой дверцы —
             тёмный крюк посреди холодильника, и это было первое, что видно
             на общем виде.
             Ручки лежат ВНУТРИ дверей: они к ним привинчены и обязаны
             уезжать вместе с ними. Снаружи они оставались висеть в воздухе
             посреди открытого холодильника. -->
        <g id="kt-fridge" class="kt-hot">
            ${O.fridgeBody.draw()}
            <g id="kt-fridge-inside">${O.fridgeInside.draw()}</g>
            <g id="kt-door-freezer" class="kt-door">
                ${O.fridgeDoorTop.draw()}
                ${O.fridgeHandleTop.draw()}
                ${ktGrab(126, 150, 350, 172)}
            </g>
            <g id="kt-door-main" class="kt-door">
                ${O.fridgeDoorBottom.draw()}
                ${O.fridgeHandleBottom.draw()}
                ${ktGrab(126, 210, 700, 172)}
            </g>
        </g>

        <!-- Струя из бутыли или лейки. Стоит ПОСЛЕ кастрюли и целится в саму
             горловину: спрятанная за переднюю стенку, она обрывалась на
             кромке и читалась как «льётся мимо». -->
        <g id="kt-pour-blobs" filter="url(#kt-goo)"></g>

        <!-- ---------- КРАН С ВЫДВИЖНОЙ ЛЕЙКОЙ ---------- -->
        <!-- Смеситель — часть кухни и стоит всегда. Двигается только его
             головка: её вытягивают из излива, за ней тянется шланг. Пока
             головка на месте, шланг вырожден в незаметный огрызок, и кран
             выглядит целым. -->
        ${O.faucetShade.draw()}
        ${O.faucet.draw()}
        <g id="kt-hose" class="kt-hot">
            <path id="kt-hose-line" d="M678 422 V430" fill="none"
                  stroke="${ktScene().chrome[700]}" stroke-width="7"
                  stroke-linecap="round"/>
            <g id="kt-nozzle">
                <g transform="translate(678 432)">${O.sprayHead.draw()}</g>
            </g>
        </g>

        <g id="kt-bottles"></g>

        <!-- доска, поставленная на столешницу (появляется после нарезки) -->
        <g id="kt-board-rest" opacity="0"></g>

        <g id="kt-loose"></g>

        <g id="kt-spoon" opacity="0">
            <g id="kt-spoon-body">
                ${O.spoon.draw()}
                ${ktGrab(46, 88, -56)}
            </g>
        </g>
        `;
    },

    // ================= ПЕРЕДНИЙ ПЛАН =================
    // Доска и нож в координатах ЭКРАНА: они ближе камеры и ей не подчиняются.
    // Нарисованы по правилам склада — без контура, объём держит перепад
    // граней, — но крупнее: это предметы в руках, а не в кадре кухни.
    foreground() {
        const b = ktScene().board, k = ktScene().knife, t = ktScene().table;
        return `
        <defs>
            <linearGradient id="kt-fg-board" gradientUnits="userSpaceOnUse"
                            x1="-186" y1="0" x2="186" y2="0">
                <stop offset="0" stop-color="${b[500]}"/>
                <stop offset="0.4" stop-color="${b.hi}"/>
                <stop offset="1" stop-color="${b[500]}"/>
            </linearGradient>
            <linearGradient id="kt-fg-blade" gradientUnits="userSpaceOnUse"
                            x1="-8" y1="0" x2="-186" y2="0">
                <stop offset="0" stop-color="${k.bladeLo}"/>
                <stop offset="0.25" stop-color="${k.bladeMid}"/>
                <stop offset="0.5" stop-color="${k.blade}"/>
                <stop offset="0.72" stop-color="${k.bladeLo}"/>
                <stop offset="0.88" stop-color="${k.bladeMid}"/>
                <stop offset="1" stop-color="${k.bladeHi}"/>
            </linearGradient>
            <linearGradient id="kt-fg-handle" gradientUnits="userSpaceOnUse"
                            x1="0" y1="-14" x2="0" y2="14">
                <stop offset="0" stop-color="${k.handleHi}"/>
                <stop offset="0.35" stop-color="${k.handle}"/>
                <stop offset="1" stop-color="${k.handle}"/>
            </linearGradient>
        </defs>

        <!-- ДОСКА. Трапеция: низ шире верха — это и есть перспектива, из
             которой видно, что доска лежит перед игроком, а не приклеена к
             стене. Всё, что на неё кладут, лежит ВНУТРИ этой группы, поэтому
             доска уезжает вместе с содержимым одним движением. -->
        <g id="kt-board" class="kt-fg-board">
            <path d="M-150 -78 H150 L186 78 H-186 Z" fill="url(#kt-fg-board)"/>
            <!-- торец: доска толстая, и её толщина видна снизу -->
            <path d="M-186 78 H186 L188 92 H-188 Z" fill="${b.shadow}"/>
            <!-- канавка по краю: две линии, как на доске из референса -->
            <path d="M-128 -60 H128 L158 60 H-158 Z" fill="none"
                  stroke="${b.line}" stroke-width="2.6"/>
            <path d="M-120 -52 H120 L148 52 H-148 Z" fill="none"
                  stroke="${b.line}" stroke-width="1.6" opacity="0.7"/>
            <!-- Зона захвата САМОЙ доски идёт ДО продуктов: она сплошная и,
                 стоя выше, съедала все касания по тому, что на доске лежит. -->
            <rect x="-186" y="-78" width="372" height="156" fill="#000" fill-opacity="0"
                  pointer-events="all"/>
            <g id="kt-board-items"></g>
            <!-- Ручка справа: единственное место доски, которое НИКОГДА не
                 занято продуктом, и потому идёт ПОВЕРХ них. -->
            <rect id="kt-board-grip" x="118" y="-78" width="70" height="156"
                  fill="#000" fill-opacity="0" pointer-events="all"/>
        </g>

        <!-- ШЕФ-НОЖ. Ось вращения — у ТОРЦА РУЧКИ (нулевая точка группы),
             поэтому свайп вверх-вниз поднимает и опускает лезвие, как в
             жизни: режут не всем ножом сразу, а качая его на пятке. -->
        <g id="kt-knife" opacity="0">
          <g id="kt-knife-arm">
            <path d="M8 -13 H70 q10 0 10 9 v8 q0 9 -10 9 H8 Z" fill="url(#kt-fg-handle)"/>
            <circle cx="24" cy="0" r="3.4" fill="${k.rivet}"/>
            <circle cx="44" cy="1" r="3.4" fill="${k.rivet}"/>
            <circle cx="64" cy="2" r="3.4" fill="${k.rivet}"/>
            <!-- клинок шеф-ножа: обух прямой, брюшко выпуклое, остриё далеко -->
            <path d="M8 -14 H-150 q-26 3 -36 13 q26 8 66 11 q60 4 112 4 H8 Z"
                  fill="url(#kt-fg-blade)"/>
            <!-- Спуск: узкая светлая полоса вдоль кромки. Идёт на полторы
                 единицы ВЫШЕ самой кромки: обводка шириной 3.4 иначе
                 вылезает наружу, и под клинком висит белая нитка. -->
            <path d="M-172 -3 q30 8 74 10 q46 4 98 3" fill="none"
                  stroke="${k.bladeHi}" stroke-width="3" stroke-linecap="round"/>
            <!-- Зона захвата ПОВОРАЧИВАЕТСЯ вместе с ножом, поэтому она
                 заметно выше самого лезвия: на поднятом ноже узкая полоса
                 уходит из-под пальца, и нож перестаёт браться. -->
            <rect x="-210" y="-92" width="300" height="184" fill="#000" fill-opacity="0"
                  pointer-events="all"/>
          </g>
        </g>

        <!-- УКАЗАТЕЛЬ. Живёт в переднем плане и ПОСЛЕДНИМ: в сцене он
             оказывался ПОД доской и ножом. Заодно один слой снимает вопрос
             масштаба: в сцене кольцо меняло размер вместе с наездом камеры,
             здесь оно всегда одного размера. -->
        <g id="kt-hint" opacity="0" pointer-events="none">
            <path id="kt-hint-line" d="" fill="none" stroke="${ktPal().flame[100]}"
                  stroke-width="6" stroke-linecap="round" stroke-dasharray="13 16" opacity="0.9"/>
            <g id="kt-hint-ring">
              <g id="kt-hint-pulse">
                <circle r="44" fill="none" stroke="${ktPal().flame[300]}" stroke-width="7" opacity="0.95"/>
                <circle r="44" fill="none" stroke="${ktPal().flame[100]}" stroke-width="2.5"/>
              </g>
            </g>
        </g>
        `;
    },

    // ---------- ПРОДУКТЫ ----------
    // Рисуются в своём старом масштабе и ужимаются целиком: сцена стала
    // мельче (720 против 900), и переписывать все пути ради этого дороже,
    // чем один множитель.
    ingredient(key, seed) {
        return `<g transform="scale(${this.ITEM})">${this.ingredientRaw(key, seed)}</g>`;
    },

    ingredientRaw(key, seed) {
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
        const s = ktScene();
        const body = this.ingredientRaw(key, seed)
            .replace(/fill="(?!#000)[^"]*"/g, 'fill="' + s.inside.shelf + '"')
            .replace(/stroke="[^"]*"/g, 'stroke="' + s.inside.shelfEdge + '"');
        return `<g opacity="0.42" transform="scale(${this.ITEM})">${body}</g>`;
    },

    // ---------- НАРЕЗАННОЕ ----------
    // Кучка из НЕСКОЛЬКИХ типов сразу: мясо красное, овощи жёлтые, зелень
    // зелёная — и по цвету видно, из чего блюдо.
    chopped(keys, stage, seed) {
        const ramps = keys.map(key => this.ramp(key));
        const grab = ktGrab(96, 54);
        if (stage <= 0) return '';
        const body = stage === 1
            ? grab + ktPile(4 + keys.length * 3, 16, ramps, seed, { spreadX: 78, spreadY: 26 })
            : grab + ktPile(10 + keys.length * 7, 9, ramps, seed + 7, { spreadX: 86, spreadY: 30 });
        return `<g transform="scale(${this.ITEM})">${body}</g>`;
    },

    // ---------- БУТЫЛЬ ----------
    // Рисует склад: бутыль — такой же предмет кухни, как кастрюля, и правится
    // там же, в мастерской.
    bottle(key, empty) {
        return KITCHEN_OBJECTS.liquidBottle.draw({ key, empty });
    },

    // Доска, поставленная на столешницу у мойки: маленькая, без интерактива.
    boardRest() {
        const b = ktScene().board;
        // Та же доска, что в переднем плане, только маленькая и в
        // перспективе столешницы: кучки нарезанного лежат НА НЕЙ, а не на
        // голой столешнице. Без доски они выглядели рассыпанными в мойку.
        return `<g>
            <path d="M-84 -4 L38 -38 L86 -8 L-36 28 Z" fill="${b.hi}"/>
            <path d="M-79 -2 L38 -33 L78 -9 L-33 24 Z" fill="none"
                  stroke="${b.line}" stroke-width="1.6" opacity="0.7"/>
            <path d="M-36 28 L86 -8 L86 2 L-36 38 Z" fill="${b.shadow}"/>
        </g>`;
    },

    // Кастрюля, которую держат над червём на кормёжке. Отдельный svg со своим
    // viewBox, потому что живёт в вёрстке (её наклоняют поворотом обёртки),
    // а не в сцене. Рисуется теми же рампами, что кастрюля на плите: одна и
    // та же вещь не может быть в кадре из двух разных наборов.
    potHeld(liquid) {
        const st = ktScene().steel;
        const soup = this.liquid(liquid || 'broth');
        const ramp = [[0, st[500]], [0.08, st[100]], [0.15, st[300]], [0.3, st.spec],
                      [0.46, st[300]], [0.66, st[500]], [1, st[700]]]
            .map(s => `<stop offset="${s[0]}" stop-color="${s[1]}"/>`).join('');
        return `<svg viewBox="0 0 200 224" preserveAspectRatio="xMidYMid meet"
                     style="width:100%;height:100%;display:block;overflow:visible">
            <defs>
                <linearGradient id="kt-held-body" gradientUnits="userSpaceOnUse"
                                x1="26" y1="0" x2="174" y2="0">${ramp}</linearGradient>
            </defs>
            <path d="M26 76 q-34 26 -6 62" fill="none" stroke="${st[900]}"
                  stroke-width="11" stroke-linecap="round"/>
            <path d="M174 76 q34 26 6 62" fill="none" stroke="${st[900]}"
                  stroke-width="11" stroke-linecap="round"/>
            <path d="M26 46 H174 V70 Q100 92 26 70 Z" fill="url(#kt-held-body)"/>
            <path d="M26 68 Q100 90 174 68 L162 190 Q100 212 38 190 Z"
                  fill="url(#kt-held-body)"/>
            <ellipse cx="100" cy="46" rx="74" ry="15" fill="${st[900]}"/>
            <ellipse cx="100" cy="48" rx="64" ry="12" fill="${soup[500]}"/>
            <ellipse cx="80" cy="46" rx="22" ry="5" fill="${soup.hi}" opacity="0.75"/>
        </svg>`;
    }
};

if (typeof window !== 'undefined') {
    window.KITCHEN_ART = KITCHEN_ART;
    window.ktRng = ktRng;
}
