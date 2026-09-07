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
// Движение — это уменьшение z у ВСЕГО, что стоит на дорожке. Червь при этом
// не двигается вовсе: он всегда в одной точке кадра, а мимо него едет мир.
// Кода вдвое меньше, а глазу разницы нет (план, раздел 4).
//
// Из формулы бесплатно берётся правильное ускорение: далёкий предмет ползёт,
// ближний проносится. Линейная анимация «сверху вниз» этого не даёт, и
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

    Z_FAR: 120,      // глубина, с которой всё выезжает и на которой стоит финиш
    Y_FEET: 590,     // экранная строка, на которой стоят ноги червя. Глубина
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
    CAR_Z: 18,       // глубина, на которой стоит машина. Не рядом с червём:
                     // машина ВДВОЕ шире дорожки, и вплотную к камере она
                     // закрывает собой всю сцену

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

        <rect x="0" y="0" width="${this.W}" height="${this.HORIZON + 2}" fill="url(#pr-sky)"/>
        <!-- Лучи прожекторов. Не украшение: над ночным горизонтом иначе
             остаётся пустое место в треть кадра, а лучи разом объясняют, что
             это за место и почему тут светло. Статичные — качающийся луч
             внутри общего холста заставляет перекрашивать всю сцену каждый
             кадр (docs/traps.md, п. 36). -->
        ${this.beams()}
        <ellipse cx="${this.CX}" cy="${this.HORIZON}" rx="300" ry="150" fill="url(#pr-glow)"/>
        <rect x="0" y="${this.HORIZON}" width="${this.W}" height="${this.H - this.HORIZON}" fill="url(#pr-floor)"/>

        <polygon points="${this.carpetPoints()}" fill="url(#pr-carpet)"/>
        <!-- Кант ковра: тонкая светлая линия по обеим кромкам. Без неё край
             ковра сливается с тёмным полом, и дорожка теряет форму. -->
        <polyline points="${this.edgePoints(-1)}" fill="none"
                  stroke="${C.carpet[300]}" stroke-width="${STROKE.detail}" opacity="0.8"/>
        <polyline points="${this.edgePoints(1)}" fill="none"
                  stroke="${C.carpet[300]}" stroke-width="${STROKE.detail}" opacity="0.8"/>

        <!-- Тень червя. Лежит в СЦЕНЕ, а не в холсте персонажа: персонаж
             живёт в отдельном html-слое поверх, и его собственная тень
             оказалась бы НАД ковром вместо того, чтобы лежать на нём.
             Размер выставляет pride.js по измеренному силуэту. -->
        <ellipse id="pr-shadow" cx="${this.CX}" cy="${this.Y_FEET}" rx="0" ry="0"
                 fill="${PALETTE.ink}" opacity="0.34"/>

        <!-- Порядок слоёв — это порядок в глубину: толпа стоит ЗА
             ограждением, поэтому и рисуется до него. Пока было наоборот,
             люди перелезали через перила и накрывали их собой. -->
        <g id="pr-crowd"></g>
        ${this.rail(-1)}
        ${this.rail(1)}
        <g id="pr-stripes"></g>
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

    carpetPoints() {
        const zN = 0, zF = this.Z_FAR;
        const p = [
            [this.CX - this.half(zN), this.y(zN)],
            [this.CX - this.half(zF), this.y(zF)],
            [this.CX + this.half(zF), this.y(zF)],
            [this.CX + this.half(zN), this.y(zN)]
        ];
        return p.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
    },

    edgePoints(side) {
        const zN = 0, zF = this.Z_FAR;
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
    // Четыре ступени покупки — четыре кузова. Нарисована в тех же местных
    // единицах, что и человек (1000 = рост человека): рядом с толпой она
    // обязана быть соразмерной, а не «примерно такой».
    //
    // Дверь ОТКРЫТА всегда: машина в кадре ровно затем, чтобы объяснить, как
    // червь тут оказался. Закрытая дверь превращает её в декорацию у обочины.
    car(level) {
        const C = PALETTE.redCarpet;
        const body = C.car.body[Math.max(0, Math.min(3, level))];
        // Лимузин длиннее корыта — единственное, чем ступени различаются
        // формой, а не только цветом.
        const len = [1500, 1700, 1800, 2400][Math.max(0, Math.min(3, level))];
        const x0 = -len / 2, x1 = len / 2;
        const roof = level >= 2 ? -760 : -700;
        return `
        <g>
            <path d="M ${x0} 0 L ${x0} -300 Q ${x0} -400 ${x0 + 180} -410
                     L ${x1 - 180} -410 Q ${x1} -400 ${x1} -300 L ${x1} 0 Z"
                  fill="${body[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure * 6}"/>
            <path d="M ${x0 + 260} -400 L ${x0 + 420} ${roof} L ${x1 - 420} ${roof} L ${x1 - 260} -400 Z"
                  fill="${body[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure * 6}"/>
            <path d="M ${x0 + 320} -420 L ${x0 + 450} ${roof + 30} L ${x1 - 450} ${roof + 30} L ${x1 - 320} -420 Z"
                  fill="${C.car.glass}"/>
            <rect x="${x0 + 120}" y="-330" width="${len * 0.22}" height="60" rx="20" fill="${body[300]}"/>
            <!-- ОТКРЫТАЯ ДВЕРЬ: створка отведена к зрителю. -->
            <path d="M ${x0 + 300} -390 L ${x0 + 180} -520 L ${x0 + 600} -560 L ${x0 + 700} -380 Z"
                  fill="${body[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure * 6}"/>
            <circle cx="${x0 + 380}" cy="0" r="180" fill="${C.car.tyre}"/>
            <circle cx="${x1 - 380}" cy="0" r="180" fill="${C.car.tyre}"/>
            <circle cx="${x0 + 380}" cy="0" r="52" fill="${C.car.chrome}"/>
            <circle cx="${x1 - 380}" cy="0" r="52" fill="${C.car.chrome}"/>
        </g>`;
    },

    // ---------- ФИНИШ ----------
    // Конец дорожки — арка с лентой. Она и есть шкала выхода: докуда дошёл,
    // столько и осталось. Отдельного счётчика 0..100 в игре больше нет
    // (docs/plan/17-pride.md, раздел 4).
    arch() {
        const C = PALETTE.redCarpet;
        const w = 900, h = 1400;
        return `
        <g>
            <rect x="${-w}" y="${-h}" width="120" height="${h}" fill="${C.rail[500]}"/>
            <rect x="${w - 120}" y="${-h}" width="120" height="${h}" fill="${C.rail[500]}"/>
            <path d="M ${-w} ${-h} L ${w} ${-h} L ${w} ${-h + 260} L ${-w} ${-h + 260} Z"
                  fill="${C.kiss[700]}" stroke="${C.rail[300]}" stroke-width="14"/>
            <path d="M ${-w + 60} ${-h + 300} Q 0 ${-h + 480} ${w - 60} ${-h + 300}"
                  fill="none" stroke="${C.kiss[300]}" stroke-width="34"/>
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
            <path d="M -30 12 L 0 -18 L 30 12" fill="none" stroke="${C.flash[300]}"
                  stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
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
