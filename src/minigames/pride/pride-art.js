// ================= КОВРОВАЯ ДОРОЖКА: КАРТИНКА И ПЕРСПЕКТИВА =================
// Здесь лежит ВСЯ геометрия сцены тщеславия и ни одного правила игры. Правила
// (зоны, ажиотаж, поцелуи, покупки) — в pride.js, числа баланса — в
// src/config/economy.js. Замысел сцены — docs/plan/17-pride.md, раздел 4.
//
// ---------- ПОЧЕМУ НЕ КОМНАТА ----------
// rooms.js описывает КОРОБКУ: пол, три стены, камера внутри. Дорожка не
// коробка — она уходит в горизонт, и стен у неё нет вовсе. Поэтому вторая
// сцена игры описана здесь своими данными, но именно ДАННЫМИ: цвет ковра,
// плотность толпы, ступени машины — таблицы, а не разбросанные по коду числа.
//
// ---------- ОДНА ФОРМУЛА НА ВСЮ СЦЕНУ ----------
// Всё в кадре стоит на одной плоскости и описывается одной глубиной z:
// 0 — у самой камеры (уже за нижним краем экрана), Z_FAR — у горизонта.
// Отсюда и размер, и положение:
//
//     s(z) = F / (F + z)      — во сколько раз предмет уменьшился
//     y(z) = HORIZON + (GROUND − HORIZON) · s(z)
//     half(z) = HALF0 · s(z)  — полуширина ковра на этой глубине
//
// ---------- КУДА ИДЁТ ЧЕРВЬ: НА ЗРИТЕЛЯ ----------
// Движение — это УВЕЛИЧЕНИЕ z у всего, что стоит на дорожке: мир уходит от
// камеры вглубь, а значит червь идёт НАМ НАВСТРЕЧУ. Сам он при этом не
// двигается вовсе: он всегда в одной точке кадра. Кода вдвое меньше, а
// глазу разницы нет (план, раздел 4).
//
// Направление здесь не деталь, а всё. Первая версия ехала наоборот — мир
// НАДВИГАЛСЯ на камеру, — и червь читался уходящим спиной вперёд: морда
// смотрит на зрителя, а сцена говорит, что он удаляется. Выход звезды снимают
// в лоб, звезда идёт НА камеры, и вся сцена держится на этом: машина, из
// которой он вышел, и арка входа остаются позади и уменьшаются, толпа
// проплывает мимо и уходит за спину, а вспышки летят в лицо.
//
// Из формулы бесплатно берётся правильное ускорение: далёкий предмет ползёт,
// ближний проносится. Линейная анимация «снизу вверх» этого не даёт, и
// дорожка сразу читается плоской картинкой.
const PRIDE_ART = {
    W: 390,
    H: 844,
    CX: 195,

    // ---------- ОПОРНЫЕ ЧИСЛА ПЕРСПЕКТИВЫ ----------
    HORIZON: 190,    // линия горизонта: выше неё только ночь, зарево и лучи
                     // прожекторов. Высоко в кадре её держать нельзя: пустое
                     // небо над дорожкой — это выброшенная треть экрана, а
                     // играют по ковру
    GROUND: 980,     // куда проецируется точка z = 0 — НИЖЕ края экрана
                     // намеренно: у ковра не должно быть видно ближнего края,
                     // иначе дорожка кончается прямо под ногами зрителя
    F: 9,            // фокус. Меньше — резче сходятся линии, сильнее глубина
    HALF0: 290,      // полуширина ковра при z = 0

    Z_FAR: 120,      // горизонт дорожки: до этой глубины уходит всё, что червь
                     // прошёл, и туда же уезжает арка входа — по ней и видно,
                     // сколько дорожки осталось
    Y_FEET: 632,     // экранная строка, на которой стоят ноги червя. Глубина
                     // червя (Z_WORM) считается из неё формулой ниже, а не
                     // задаётся вторым числом: два числа об одном и том же
                     // рано или поздно разъезжаются

    // Рост человека в толпе В ЕДИНИЦАХ ГЛУБИНЫ 0 — то есть каким бы он был,
    // стоя вплотную к камере. Настоящий экранный размер получается умножением
    // на s(z), поэтому одно число задаёт всю толпу на любой глубине.
    CROWD_H: 520,
    Z_CROWD_MIN: 7,  // ближе этой глубины толпу не пускаем: вплотную к камере
                     // силуэт вырастает во весь кадр и читается не человеком,
                     // а чёрной кляксой, накрывшей полдорожки
    RAIL_H: 70,      // высота ограждения там же
    LANE: 1.34,      // насколько дальше ограждения от центра стоит толпа
                     // (в долях полуширины ковра)
    Z_START: 25,     // где в НАЧАЛЕ выхода стоит машина — она же начало
                     // расстеленного ковра и она же шкала выхода (см. ниже).
                     // Ближе ставить нельзя: машина шириной во всю дорожку,
                     // и вплотную к камере она закрывает собой сцену

    // ---------- ФОРМУЛЫ ----------
    s(z) { return this.F / (this.F + Math.max(0, z)); },
    y(z) { return this.HORIZON + (this.GROUND - this.HORIZON) * this.s(z); },
    half(z) { return this.HALF0 * this.s(z); },

    // Обратный ход: на какой глубине лежит экранная строка. Нужен раскладке —
    // червя ставят по строке кадра, а всё остальное считается от глубины.
    zAtY(y) {
        const s = (y - this.HORIZON) / (this.GROUND - this.HORIZON);
        if (s <= 0.001) return 1e6;
        return this.F * (1 - s) / s;
    },

    // ---------- СТАТИЧЕСКАЯ ЧАСТЬ СЦЕНЫ ----------
    // Ночь, зарево, ковёр и оба ограждения не движутся вовсе: они и есть та
    // самая уходящая вдаль геометрия, вдоль которой всё едет. Перерисовывать
    // их каждый кадр незачем — этим и держится кадр (docs/traps.md, п. 37).
    scene() {
        const C = PALETTE.redCarpet;
        return `
        <defs>
            <linearGradient id="pr-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${C.night[900]}"/>
                <stop offset="0.72" stop-color="${C.night[700]}"/>
                <stop offset="1" stop-color="${C.glow[700]}"/>
            </linearGradient>
            <radialGradient id="pr-glow" cx="0.5" cy="1" r="0.75">
                <stop offset="0" stop-color="${C.glow[300]}" stop-opacity="0.75"/>
                <stop offset="0.45" stop-color="${C.glow[500]}" stop-opacity="0.32"/>
                <stop offset="1" stop-color="${C.glow[700]}" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="pr-floor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${C.night[700]}"/>
                <stop offset="1" stop-color="${C.night[900]}"/>
            </linearGradient>
            <!-- Ковёр светлеет к зрителю: дальний конец уходит в темноту, и
                 именно этим читается длина дорожки. Ровная заливка делала её
                 плоской наклейкой. -->
            <linearGradient id="pr-carpet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${C.carpet[700]}"/>
                <stop offset="0.55" stop-color="${C.carpet[500]}"/>
                <stop offset="1" stop-color="${C.carpet[300]}"/>
            </linearGradient>
            <linearGradient id="pr-beam" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stop-color="${C.glow[300]}" stop-opacity="0.3"/>
                <stop offset="1" stop-color="${C.glow[300]}" stop-opacity="0"/>
            </linearGradient>
            <radialGradient id="pr-spot" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stop-color="${C.flash[300]}" stop-opacity="0.5"/>
                <stop offset="0.6" stop-color="${C.flash[500]}" stop-opacity="0.18"/>
                <stop offset="1" stop-color="${C.flash[500]}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="pr-zone-flash" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stop-color="${C.flash[300]}" stop-opacity="0.62"/>
                <stop offset="0.55" stop-color="${C.flash[500]}" stop-opacity="0.3"/>
                <stop offset="1" stop-color="${C.flash[500]}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="pr-zone-kiss" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stop-color="${C.kiss[300]}" stop-opacity="0.66"/>
                <stop offset="0.55" stop-color="${C.kiss[500]}" stop-opacity="0.34"/>
                <stop offset="1" stop-color="${C.kiss[500]}" stop-opacity="0"/>
            </radialGradient>
        </defs>

        <!-- ДАЛЬНИЙ ПЛАН. Отдельной группой не ради порядка рисования, а ради
             ПЕРЕЕЗДА: при смене декораций небо уезжает вверх, земля вниз, а
             толпа с ограждениями разъезжается по сторонам — как будто рабочие
             сцены увезли одно и привезли другое. Каждому куску нужна своя
             группа, иначе двигать их порознь нечем. -->
        <g id="pr-far">
        <rect x="0" y="0" width="${this.W}" height="${this.HORIZON + 2}" fill="url(#pr-sky)"/>
        <!-- Лучи прожекторов. Не украшение: над ночным горизонтом иначе
             остаётся пустое место в треть кадра, а лучи разом объясняют, что
             это за место и почему тут светло. Статичные — качающийся луч
             внутри общего холста заставляет перекрашивать всю сцену каждый
             кадр (docs/traps.md, п. 36). -->
        ${this.beams()}
        <ellipse cx="${this.CX}" cy="${this.HORIZON}" rx="300" ry="150" fill="url(#pr-glow)"/>
        </g>

        <g id="pr-ground">
        <rect x="0" y="${this.HORIZON}" width="${this.W}" height="${this.H - this.HORIZON}" fill="url(#pr-floor)"/>

        <!-- КОВЁР — ЭТО И ЕСТЬ ШКАЛА ВЫХОДА.
             Он расстелен от МАШИНЫ до камеры, и его дальний конец привязан
             к ней: червь идёт на зрителя, машина остаётся позади, и красная
             полоса за его спиной становится всё длиннее. К концу выхода она
             дотягивается до горизонта.

             Отдельных ворот у входа не будет. Они тут были, и машина с ними
             спорила: два предмета на одной осевой, в одной точке кадра и с
             одним и тем же смыслом «здесь начало». Машина объясняет начало
             лучше — на ней звезду сюда и привезли.
             Дальний край переставляет pride.js каждый кадр — одна запись
             на три узла, дешевле некуда. -->
        <ellipse id="pr-shadow" cx="${this.CX}" cy="${this.Y_FEET}" rx="0" ry="0"
                 fill="${PALETTE.ink}" opacity="0.34"/>
        <polygon id="pr-carpet-poly" points="${this.carpetPoints(this.Z_START)}" fill="url(#pr-carpet)"/>
        <!-- Кант ковра: тонкая светлая линия по обеим кромкам. Без неё край
             ковра сливается с тёмным полом, и дорожка теряет форму. -->
        <polyline id="pr-edge-l" points="${this.edgePoints(-1, this.Z_START)}" fill="none"
                  stroke="${C.carpet[300]}" stroke-width="${STROKE.detail}" opacity="0.8"/>
        <polyline id="pr-edge-r" points="${this.edgePoints(1, this.Z_START)}" fill="none"
                  stroke="${C.carpet[300]}" stroke-width="${STROKE.detail}" opacity="0.8"/>

        <!-- Тень червя. Лежит в СЦЕНЕ, а не в холсте персонажа: персонаж
             живёт в отдельном html-слое поверх, и его собственная тень
             оказалась бы НАД ковром вместо того, чтобы лежать на нём.
             Размер выставляет pride.js по измеренному силуэту. -->

        <!-- Порядок слоёв — это порядок в глубину: толпа стоит ЗА
             ограждением, поэтому и рисуется до него. Пока было наоборот,
             люди перелезали через перила и накрывали их собой. -->
        <g id="pr-stripes"></g>
        </g>

        <!-- Толпа стоит ЗА ограждением, поэтому и рисуется до него. Стороны
             разведены по двум группам: при смене декораций левая уезжает
             влево, правая вправо. -->
        <g id="pr-side-l"><g id="pr-crowd-l"></g>${this.rail(-1)}</g>
        <g id="pr-side-r"><g id="pr-crowd-r"></g>${this.rail(1)}</g>
        <g id="pr-props"></g>`;
    },

    beams() {
        const list = [[-120, -34], [40, 12], [170, 40]];
        return list.map(([x, tilt]) => {
            const bx = this.CX + x;
            const top = -60;
            const spread = 70;
            return `<polygon points="${bx},${this.HORIZON} ${bx + tilt - spread},${top} ${bx + tilt + spread},${top}"
                             fill="url(#pr-beam)"/>`;
        }).join('');
    },

    carpetPoints(zFar) {
        const zN = 0, zF = zFar == null ? this.Z_FAR : zFar;
        const p = [
            [this.CX - this.half(zN), this.y(zN)],
            [this.CX - this.half(zF), this.y(zF)],
            [this.CX + this.half(zF), this.y(zF)],
            [this.CX + this.half(zN), this.y(zN)]
        ];
        return p.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
    },

    edgePoints(side, zFar) {
        const zN = 0, zF = zFar == null ? this.Z_FAR : zFar;
        return `${(this.CX + side * this.half(zN)).toFixed(1)},${this.y(zN).toFixed(1)} ` +
               `${(this.CX + side * this.half(zF)).toFixed(1)},${this.y(zF).toFixed(1)}`;
    },

    // Ограждение — плоская лента вдоль кромки ковра. Строится по двум
    // глубинам: перспектива прямой линии остаётся прямой, промежуточные
    // точки не нужны.
    rail(side) {
        const C = PALETTE.redCarpet;
        const zN = 0.6, zF = this.Z_FAR;
        const xN = this.CX + side * this.half(zN) * this.LANE * 0.86;
        const xF = this.CX + side * this.half(zF) * this.LANE * 0.86;
        const yN = this.y(zN), yF = this.y(zF);
        const topN = yN - this.RAIL_H * this.s(zN);
        const topF = yF - this.RAIL_H * this.s(zF);
        // Лента тёмная, а светлая только её ВЕРХНЯЯ кромка: сплошная латунь
        // во всю высоту забирала кадр себе и спорила с ковром.
        return `<polygon points="${xN.toFixed(1)},${yN.toFixed(1)} ${xN.toFixed(1)},${topN.toFixed(1)} ` +
               `${xF.toFixed(1)},${topF.toFixed(1)} ${xF.toFixed(1)},${yF.toFixed(1)}"
                        fill="${C.night[900]}" opacity="0.92"/>` +
               `<polyline points="${xN.toFixed(1)},${topN.toFixed(1)} ${xF.toFixed(1)},${topF.toFixed(1)}"
                          fill="none" stroke="${C.rail[500]}" stroke-width="${STROKE.structure}"/>`;
    },

    // ---------- ПОПЕРЕЧИНА КОВРА ----------
    // Единственное, что показывает СКОРОСТЬ. Считается как трапеция между
    // двумя глубинами, а не масштабированием прямоугольника: у ближней и
    // дальней кромки разная ширина, и подобием их не связать.
    stripePoints(z, dz) {
        const zA = Math.max(0, z), zB = Math.max(0, z + dz);
        const p = [
            [this.CX - this.half(zA), this.y(zA)],
            [this.CX - this.half(zB), this.y(zB)],
            [this.CX + this.half(zB), this.y(zB)],
            [this.CX + this.half(zA), this.y(zA)]
        ];
        return p.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
    },

    // ---------- ТОЛПА ----------
    // Люди рисуются НЕ по одному. Один transform на человека — это сорок
    // записей в дерево каждый кадр только ради массовки; вместо этого толпа
    // собрана ГРОЗДЬЯМИ по несколько силуэтов, и грозди едет уже целиком.
    // Человек внутри грозди нарисован ростом 1000 единиц (ноги в нуле,
    // голова в −1000), поэтому масштаб грозди — это прямо экранный рост.
    //
    // rows — сколько силуэтов; больше их становится от покупки массовки:
    // купленная толпа обязана быть видна, иначе покупка «дороже поцелуй»
    // ничем не отличается от строчки в меню.
    crowdCluster(rows, seed) {
        const C = PALETTE.redCarpet;
        const rnd = this.rng(seed);
        const tones = [C.crowd[500], C.crowd[700], C.crowd[900]];
        let out = '';
        for (let i = 0; i < rows; i++) {
            // Дальние ряды выше по кадру, мельче и светлее — так гроздь сама
            // читается глубиной, а не плоской гребёнкой.
            const back = i / Math.max(1, rows - 1);
            const k = 1 - back * 0.22;
            const x = (rnd() - 0.5) * 420;
            const y = -back * 110;
            // Ближний ряд СВЕТЛЕЕ дальнего, а не наоборот: дальние обязаны
            // уходить в ночь, иначе задние головы вылезают на фоне неба
            // светлыми пятнами и толпа читается плоской гребёнкой.
            const tone = tones[Math.min(2, Math.floor(back * 3))];
            out += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)}) scale(${k.toFixed(3)})">` +
                   this.person(rnd, tone) + '</g>';
        }
        return out;
    },

    // Один силуэт. Три позы, и все три — про то, зачем эти люди тут стоят:
    // снимает, тянется через ограждение, машет.
    person(rnd, tone) {
        const C = PALETTE.redCarpet;
        const pose = Math.floor(rnd() * 3);
        const head = `<circle cx="0" cy="-870" r="96" fill="${tone}"/>`;
        const body = `<path d="M -150 0 L -150 -640 Q -150 -760 0 -760 Q 150 -760 150 -640 L 150 0 Z" fill="${tone}"/>`;
        let arms = '';
        if (pose === 0) {
            // С фотоаппаратом у лица: коробочка и есть весь «фотоаппарат» —
            // на таком размере больше ничего и не прочитается.
            arms = `<path d="M -150 -600 L -260 -800 L -190 -840 L -80 -700 Z" fill="${tone}"/>` +
                   `<path d="M 150 -600 L 260 -800 L 190 -840 L 80 -700 Z" fill="${tone}"/>` +
                   `<rect x="-95" y="-960" width="190" height="130" rx="26" fill="${tone}"/>`;
        } else if (pose === 1) {
            arms = `<path d="M -150 -620 L -300 -960 L -215 -1000 L -70 -700 Z" fill="${tone}"/>` +
                   `<path d="M 150 -620 L 250 -900 L 330 -860 L 90 -690 Z" fill="${tone}"/>`;
        } else {
            arms = `<path d="M -150 -620 L -280 -420 L -200 -370 L -70 -560 Z" fill="${tone}"/>` +
                   `<path d="M 150 -620 L 290 -980 L 370 -930 L 80 -690 Z" fill="${tone}"/>`;
        }
        return body + arms + head;
    },

    // ---------- МАШИНА ----------
    // Вид СЗАДИ и строго по центру дорожки: машина подвезла звезду к началу
    // ковра и остановилась на нём, дверь открыта — червь только что вышел.
    // Она же и шкала выхода: уезжает назад ровно за двадцать секунд.
    // Сбоку она стояла раньше и читалась припаркованной у обочины, то есть
    // случайной деталью улицы, а не тем, на чём его привезли.
    //
    // Из вида сзади следует и всё остальное: она уезжает назад по той же
    // осевой линии, по которой червь идёт вперёд, и сама показывает, откуда
    // он пришёл. Четыре ступени покупки — четыре кузова, и различаются они
    // тем, что видно сзади: шириной, посадкой и количеством хрома.
    //
    // Единицы местные, те же, что у человека в толпе: 1000 = его рост.
    car(level) {
        const C = PALETTE.redCarpet;
        const lvl = Math.max(0, Math.min(3, level));
        const body = C.car.body[lvl];
        // Ржавое корыто узкое и высокое, лимузин широкий и низкий: разницу
        // между ступенями видно силуэтом, а не только цветом.
        const w = [430, 480, 520, 600][lvl];       // полуширина кузова
        const h = [820, 800, 730, 700][lvl];       // высота крыши над землёй
        const glassTop = h - 260;
        const sill = 300;                          // низ окна
        const SW6 = STROKE.structure * 6;
        return `
        <g>
            <!-- Тень под машиной: без неё она висит над ковром. -->
            <ellipse cx="0" cy="-10" rx="${w * 1.15}" ry="90" fill="${PALETTE.ink}" opacity="0.4"/>
            <!-- Колёса выглядывают из-под кузова по бокам. -->
            <rect x="${-w - 40}" y="-260" width="120" height="260" rx="40" fill="${C.car.tyre}"/>
            <rect x="${w - 80}" y="-260" width="120" height="260" rx="40" fill="${C.car.tyre}"/>
            <!-- Кузов. -->
            <path d="M ${-w} 0 L ${-w} ${-sill - 60}
                     Q ${-w} ${-h} ${-w * 0.62} ${-h}
                     L ${w * 0.62} ${-h} Q ${w} ${-h} ${w} ${-sill - 60}
                     L ${w} 0 Z"
                  fill="${body[500]}" stroke="${PALETTE.ink}" stroke-width="${SW6}"/>
            <!-- Заднее стекло. -->
            <path d="M ${-w * 0.72} ${-sill - 90} L ${-w * 0.56} ${-glassTop}
                     L ${w * 0.56} ${-glassTop} L ${w * 0.72} ${-sill - 90} Z"
                  fill="${C.car.glass}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail * 6}"/>
            <!-- Фонари и бампер. -->
            <rect x="${-w + 50}" y="${-sill - 40}" width="${w * 0.42}" height="90" rx="30"
                  fill="${C.kiss[500]}"/>
            <rect x="${w - 50 - w * 0.42}" y="${-sill - 40}" width="${w * 0.42}" height="90" rx="30"
                  fill="${C.kiss[500]}"/>
            <rect x="${-w}" y="-150" width="${w * 2}" height="70" rx="24"
                  fill="${C.car.chrome}" opacity="${lvl >= 2 ? 0.95 : 0.55}"/>
            ${lvl >= 1 ? `<rect x="${-w * 0.3}" y="${-sill - 10}" width="${w * 0.6}" height="60" rx="14"
                                fill="${C.car.chrome}" opacity="0.8"/>` : ''}
            <!-- ОТКРЫТАЯ ДВЕРЬ. Она и объясняет, откуда червь взялся: створка
                 отведена вбок и видна плашмя, потому что смотрим мы сзади. -->
            <path d="M ${-w} ${-sill - 60} L ${-w - 420} ${-sill - 190}
                     L ${-w - 420} ${-40} L ${-w} 0 Z"
                  fill="${body[300]}" stroke="${PALETTE.ink}" stroke-width="${SW6}"/>
            <path d="M ${-w - 60} ${-sill - 120} L ${-w - 380} ${-sill - 215}
                     L ${-w - 380} ${-sill + 40} L ${-w - 60} ${-sill - 20} Z"
                  fill="${C.car.glass}" opacity="0.75"/>
        </g>`;
    },

    // ---------- ЛУЖА СВЕТА У СТАРТА ----------
    // Единственное, чем игре сказано «жми сюда, когда готов»: пятно света на
    // ковре впереди и стрелка в нём. Слов нет и быть не может (инвариант 9),
    // а кнопка «старт» словом и была бы.
    startMark() {
        const C = PALETTE.redCarpet;
        return `
        <g id="pr-start-mark" class="pr-start-mark">
            <ellipse cx="0" cy="0" rx="112" ry="34" fill="url(#pr-spot)"/>
            <!-- Уголок смотрит ВНИЗ, на зрителя: идти червю туда, к камере.
                 Пока он смотрел вверх, он обещал дорогу вглубь кадра — ровно
                 туда, куда червь как раз не идёт. -->
            <path d="M -30 -12 L 0 18 L 30 -12" fill="none" stroke="${C.flash[300]}"
                  stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
        </g>`;
    },

    // ================= КОСТЮМЕРНАЯ =================
    // Стартовый экран тщеславия: червь у гримёрного зеркала, вокруг слоты
    // наряда. Здесь одеваются и покупают, отсюда же уходят на дорожку.
    //
    // Комната собрана из ЧЕТЫРЁХ кусков, и это не декоративное деление:
    // занавес уезжает вверх, зеркало влево, вешалка вправо, помост вниз —
    // так смена декораций читается работой сцены, а не переходом слайдов.
    // Каждому куску нужна своя группа, иначе двигать их порознь нечем.
    room() {
        const C = PALETTE.redCarpet;
        const P = PALETTE;
        const W = this.W, H = this.H;
        // Гримёрное зеркало: рама с лампами. Лампы — единственный источник
        // света в комнате, поэтому они же и объясняют, почему червь освещён.
        let bulbs = '';
        const bx = 54, by = 122, bw = 152, bh = 214;
        for (let i = 0; i < 8; i++) {
            const t = i / 7;
            bulbs += `<circle cx="${(bx - 16).toFixed(0)}" cy="${(by + bh * t).toFixed(0)}" r="9" fill="${C.flash[500]}"/>`;
            bulbs += `<circle cx="${(bx + bw + 16).toFixed(0)}" cy="${(by + bh * t).toFixed(0)}" r="9" fill="${C.flash[500]}"/>`;
        }
        for (let i = 1; i < 7; i++) {
            const t = i / 7;
            bulbs += `<circle cx="${(bx + bw * t).toFixed(0)}" cy="${(by - 16).toFixed(0)}" r="9" fill="${C.flash[500]}"/>`;
        }
        return `
        <defs>
            <linearGradient id="pr-curtain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${C.carpet[700]}"/>
                <stop offset="1" stop-color="${C.carpet[500]}"/>
            </linearGradient>
            <radialGradient id="pr-mirror" cx="0.5" cy="0.35" r="0.75">
                <stop offset="0" stop-color="${C.glow[300]}" stop-opacity="0.5"/>
                <stop offset="1" stop-color="${C.night[700]}" stop-opacity="0.9"/>
            </radialGradient>
            <linearGradient id="pr-podium" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${C.night[500]}"/>
                <stop offset="1" stop-color="${C.night[900]}"/>
            </linearGradient>
        </defs>

        <!-- ЗАНАВЕС. Уезжает вверх. -->
        <g id="pr-room-back">
            <rect x="0" y="0" width="${W}" height="${H}" fill="${C.night[900]}"/>
            <rect x="0" y="0" width="${W}" height="${H * 0.62}" fill="url(#pr-curtain)"/>
            ${Array.from({ length: 9 }, (_, i) => {
                const x = (i + 0.5) * (W / 9);
                return `<path d="M ${x.toFixed(1)} 0 L ${x.toFixed(1)} ${(H * 0.62).toFixed(0)}"
                              stroke="${C.carpet[700]}" stroke-width="${(7 + (i % 3) * 6)}"/>`;
            }).join('')}
            <rect x="0" y="${(H * 0.6).toFixed(0)}" width="${W}" height="26" fill="${C.rail[700]}"/>
            <rect x="0" y="${(H * 0.6).toFixed(0)}" width="${W}" height="6" fill="${C.rail[500]}"/>
        </g>

        <!-- ЗЕРКАЛО. Уезжает влево. -->
        <g id="pr-room-l">
            <rect x="${bx - 30}" y="${by - 30}" width="${bw + 60}" height="${bh + 52}" rx="18"
                  fill="${C.rail[700]}" stroke="${C.rail[500]}" stroke-width="${STROKE.structure}"/>
            <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" fill="url(#pr-mirror)"/>
            ${bulbs}
        </g>

        <!-- ВЕШАЛКА С ЗАПАСНЫМ ТРЯПЬЁМ. Уезжает вправо. Она тут не для
             красоты: без неё комната не читается костюмерной — зеркало есть
             и в ванной. -->
        <g id="pr-room-r">
            <rect x="${W - 66}" y="112" width="10" height="286" rx="5" fill="${C.rail[700]}"/>
            <rect x="${W - 172}" y="110" width="128" height="10" rx="5" fill="${C.rail[500]}"/>
            ${[0, 1, 2].map(i => {
                const x = W - 162 + i * 40;
                const col = [C.cloth[700], C.silk[700], C.cloth[500]][i];
                return `<path d="M ${x} 120 L ${x + 24} 120 L ${x + 32} ${208 + i * 22}
                                L ${x - 8} ${208 + i * 22} Z"
                              fill="${col}" stroke="${P.ink}" stroke-width="${STROKE.detail}"/>
                        <path d="M ${x + 12} 120 L ${x + 12} 112" stroke="${C.rail[500]}"
                              stroke-width="${STROKE.detail}"/>`;
            }).join('')}
        </g>

        <!-- ПОМОСТ, на котором стоит червь. Уезжает вниз. -->
        <g id="pr-room-floor">
            <rect x="0" y="${(H * 0.62).toFixed(0)}" width="${W}" height="${(H * 0.38).toFixed(0)}"
                  fill="url(#pr-podium)"/>
            <ellipse cx="${this.CX}" cy="${this.Y_FEET}" rx="150" ry="34"
                     fill="${C.night[500]}" opacity="0.8"/>
            <ellipse cx="${this.CX}" cy="${this.Y_FEET}" rx="150" ry="34"
                     fill="none" stroke="${C.rail[700]}" stroke-width="${STROKE.structure}"/>
            <ellipse id="pr-room-shadow" cx="${this.CX}" cy="${(this.Y_FEET + 4).toFixed(0)}"
                     rx="0" ry="0" fill="${P.ink}" opacity="0.38"/>
        </g>`;
    },

    // Карточка слота: рамка, а в ней либо силуэт того, что сюда ставится,
    // либо надетый предмет. Без единой буквы — по силуэту видно, что это за
    // место (тот же приём, что в лобби гнева).
    slotCard(slot, worn, size) {
        const C = PALETTE.redCarpet;
        const s = size || 62;
        const inner = worn
            ? `<g transform="translate(0,${(s * 0.16).toFixed(1)})">${worn}</g>`
            : `<g transform="translate(${(-s * 0.29).toFixed(1)},${(-s * 0.29).toFixed(1)}) scale(${(s * 0.024).toFixed(3)})">
                   <path d="${slot.shape}" fill="none" stroke="${C.night[500]}"
                         stroke-width="1.6" stroke-linejoin="round"/></g>`;
        return `<g class="pr-slot${worn ? ' filled' : ''}" data-slot="${slot.key}">
            <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="14"
                  fill="${C.night[900]}" fill-opacity="0.82"
                  stroke="${worn ? C.gold[500] : C.rail[700]}" stroke-width="2"/>
            ${inner}
        </g>`;
    },

    // Кнопка старта: круг с треугольником. Треугольник — знак, а не слово
    // (инвариант 9), и он же показывает направление: вперёд, на публику.
    startButton(r) {
        const C = PALETTE.redCarpet;
        return `<g id="pr-start-btn" class="pr-start-btn">
            <circle cx="0" cy="0" r="${r}" fill="${C.carpet[500]}"
                    stroke="${C.gold[300]}" stroke-width="3"/>
            <circle cx="0" cy="0" r="${r - 8}" fill="none" stroke="${C.gold[500]}"
                    stroke-width="1.5" opacity="0.6"/>
            <path d="M ${-r * 0.24} ${-r * 0.4} L ${r * 0.42} 0 L ${-r * 0.24} ${r * 0.4} Z"
                  fill="${C.flash[300]}"/>
        </g>`;
    },

    // Кнопка магазина: сумка. Тоже без букв.
    shopButton(r) {
        const C = PALETTE.redCarpet;
        return `<g id="pr-shop-btn" class="pr-round-btn">
            <circle cx="0" cy="0" r="${r}" fill="${C.night[900]}" fill-opacity="0.9"
                    stroke="${C.gold[500]}" stroke-width="2"/>
            <path d="M ${-r * 0.42} ${-r * 0.18} L ${r * 0.42} ${-r * 0.18}
                     L ${r * 0.32} ${r * 0.46} L ${-r * 0.32} ${r * 0.46} Z"
                  fill="none" stroke="${C.gold[300]}" stroke-width="2.4" stroke-linejoin="round"/>
            <path d="M ${-r * 0.2} ${-r * 0.18} Q ${-r * 0.2} ${-r * 0.56} 0 ${-r * 0.56}
                     Q ${r * 0.2} ${-r * 0.56} ${r * 0.2} ${-r * 0.18}"
                  fill="none" stroke="${C.gold[300]}" stroke-width="2.4"/>
        </g>`;
    },

    // Детерминированный генератор: одна и та же гроздь толпы должна получаться
    // одинаковой при каждой сборке сцены, иначе толпа «перетасовывается» на
    // каждом открытии игры и кадр мерцает разными людьми.
    rng(seed) {
        let s = (seed | 0) || 1;
        return function () {
            s = (s * 1664525 + 1013904223) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }
};

// Глубина, на которой стоит червь, — не отдельное число, а следствие опорной
// строки кадра. Подвинули червя по кадру — вся сцена (машина, зоны, финиш)
// переехала вместе с ним сама.
PRIDE_ART.Z_WORM = PRIDE_ART.zAtY(PRIDE_ART.Y_FEET);

if (typeof window !== 'undefined') window.PRIDE_ART = PRIDE_ART;
