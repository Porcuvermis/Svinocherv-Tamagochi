// ============================================================
//  СИЛУЭТ ЧАСТЕЙ ТЕЛА — ОДНА ПРАВДА НА РИСОВАНИЕ И НА РАЗМЕЩЕНИЕ
// ============================================================
//
// Зачем отдельный файл. Голова рисовалась кривыми по пропорциям черепа
// (узкий лоб, тяжёлые брыли, морда вниз), а шрамы раскладывались по
// ВПИСАННОМУ КРУГУ радиуса rx — и подгонялись к нему руками, прямоугольными
// «разрешёнными площадками». Это два разных тела: круг шире черепа у лба и
// у подбородка, и шрам, честно влезший в круг, висел в воздухе рядом с
// головой. Ещё хуже при повороте: череп при повороте асимметричен, а круг
// нет.
//
// Лечится это не подгонкой чисел, а тем, что силуэт СТАНОВИТСЯ ОДИН.
// Здесь лежат контрольные точки черепа; рендерер строит из них путь, а
// размещение отметин — многоугольник и спрашивает «точка внутри?».
// Поменяли пропорции черепа — поехало и то, и другое, само.
//
// Модуль без DOM: им пользуется и рендерер, и безбраузерная часть прогонов.

// Насколько череп асимметричен при повороте. Ровно те же множители, что
// раньше жили внутри построения пути: сторона, КУДА смотрит лицо, сверху
// оптически уже, а снизу шире (на неё выходит морда); затылочная — наоборот.
const WORM_SKULL_YAW_TOP_FACE = -0.13;
const WORM_SKULL_YAW_LOW_FACE = 0.17;
const WORM_SKULL_YAW_TOP_BACK = 0.11;
const WORM_SKULL_YAW_LOW_BACK = -0.12;

// Пропорции по умолчанию — те же, что в модели. Продублированы, чтобы
// модуль отвечал и на неполный конфиг, а не падал.
function wormSkullCfg(p) {
    p = p || {};
    return {
        brow:   (p.browWidth   != null ? p.browWidth   : 0.62),
        temple: (p.templeWidth != null ? p.templeWidth : 0.97),
        cheek:  (p.cheekWidth  != null ? p.cheekWidth  : 1),
        jaw:    (p.jawWidth    != null ? p.jawWidth    : 0.78),
        muzzle: (p.muzzleWidth != null ? p.muzzleWidth : 0.46),
        chin:   (p.chinDrop    != null ? p.chinDrop    : 1.04),
        // ---------- ПЕРЕКОС ПО СТОРОНАМ ----------
        // Прибавка к ширине ОТДЕЛЬНО для левой и правой половины. По
        // умолчанию нули, и тогда череп ровно тот же, что был: поле
        // добавочное, старые сохранения его просто не имеют.
        //
        // Заведено ради прямого редактирования: «потянуть левую скулу» без
        // него двигало бы и правую, потому что обе половины читают ОДИН
        // `cheekWidth`. Асимметрия здесь же и ограничена — она прибавка, а
        // не отдельное описание половины: два описания одного контура
        // разъехались бы, и это ровно та беда, от которой лечили голову.
        skew:   p.skew || null
    };
}

// Прибавка к ширине конкретной черты на конкретной стороне.
// side: −1 левая, +1 правая (та же сторона, что у `eye-left`/`ear-left`).
function wormSkullSkew(cfg, name, side) {
    const sk = cfg.skew;
    if (!sk) return 0;
    const v = sk[name + (side < 0 ? 'L' : 'R')];
    return typeof v === 'number' ? v : 0;
}

// ---------- ПОЛОВИНА КОНТУРА ----------
// Три кубические кривые сверху вниз, в НОРМАЛИЗОВАННЫХ долях: x — в долях
// rx, y — в долях ry. Умножение на реальные радиусы делает вызывающий.
// side: +1 правая половина, −1 левая.
function wormSkullHalf(cfg, yaw, side) {
    const c = wormSkullCfg(cfg);
    const yw = yaw || 0;
    const faceSide = yw >= 0 ? 1 : -1;
    const t = Math.abs(yw);
    const isFace = side === faceSide;
    const up = 1 + (isFace ? WORM_SKULL_YAW_TOP_FACE : WORM_SKULL_YAW_TOP_BACK) * t;
    const lo = 1 + (isFace ? WORM_SKULL_YAW_LOW_FACE : WORM_SKULL_YAW_LOW_BACK) * t;
    const k = side;
    // Ширины ЭТОЙ половины: номинал плюс перекос стороны. Прибавка входит
    // ровно там же, где стоит номинал, поэтому кривые остаются теми же
    // кривыми, а не превращаются во второе описание контура.
    const w = (name, base) => base + wormSkullSkew(c, name, side);
    const brow = w('brow', c.brow), temple = w('temple', c.temple);
    const cheek = w('cheek', c.cheek), jaw = w('jaw', c.jaw);
    const muzzle = w('muzzle', c.muzzle);
    return [
        // свод → виски → скулы
        { c1: [k * brow * up, -0.99], c2: [k * temple * up, -0.72], p: [k * cheek * up, -0.08] },
        // скулы → брыли → морда
        { c1: [k * cheek * 0.99 * lo, 0.3], c2: [k * jaw * lo, 0.56], p: [k * muzzle * lo, 0.84] },
        // морда → подбородок
        { c1: [k * muzzle * 0.92 * lo, c.chin * 0.97], c2: [k * muzzle * 0.45 * lo, c.chin], p: [0, c.chin] }
    ];
}

// ---------- РАЗМЕРЫ ГОЛОВЫ ----------
// Радиусы головы выводятся из модели ЗДЕСЬ, а не в рендерере, по той же
// причине, по которой здесь живут высоты черт лица: их спрашивает не только
// рисование. Инспектору (src/core/worm-parts.js) надо знать, где на экране
// скула, и считать её он обязан теми же радиусами, какими её нарисовали, —
// иначе ручка встанет рядом с контуром, а не на нём.
function wormHeadRadii(head) {
    const h = head || {};
    const R = WORM_HEAD_R * (h.scale != null ? h.scale : 1);
    return { R, rx: R * (h.stretchX != null ? h.stretchX : 1),
                ry: R * (h.stretchY != null ? h.stretchY : 1) };
}

// ---------- ПУТЬ ДЛЯ ОТРИСОВКИ ----------
// Вниз по правой половине, обратно вверх по левой. Левая проходится в
// обратном направлении теми же кривыми — иначе контур пришлось бы
// дублировать вручную и он рисковал бы разъехаться при правке пропорций.
function wormSkullPath(rx, ry, cfg, yaw) {
    const n = (v, r) => (v * r).toFixed(1);
    const right = wormSkullHalf(cfg, yaw, 1);
    const left = wormSkullHalf(cfg, yaw, -1);
    let d = `M 0,${n(-1, ry)}`;
    right.forEach(s => {
        d += ` C ${n(s.c1[0], rx)},${n(s.c1[1], ry)} ${n(s.c2[0], rx)},${n(s.c2[1], ry)} ${n(s.p[0], rx)},${n(s.p[1], ry)}`;
    });
    // назад вверх: сегменты в обратном порядке, контрольные точки местами
    for (let i = left.length - 1; i >= 0; i--) {
        const s = left[i];
        const end = i === 0 ? [0, -1] : left[i - 1].p;
        d += ` C ${n(s.c2[0], rx)},${n(s.c2[1], ry)} ${n(s.c1[0], rx)},${n(s.c1[1], ry)} ${n(end[0], rx)},${n(end[1], ry)}`;
    }
    return d + ' Z';
}

// ---------- ТОТ ЖЕ КОНТУР МНОГОУГОЛЬНИКОМ ----------
// Для вопроса «точка внутри силуэта?». Считается из ТЕХ ЖЕ кривых, поэтому
// расходиться с нарисованным ему нечем. Шаг выбран так, чтобы ошибка была
// меньше толщины линии: 16 точек на кривую при радиусе головы ~40 — это
// доли пикселя.
const WORM_SKULL_STEPS = 16;

function wormSkullPolygon(cfg, yaw) {
    const pts = [];
    const walk = (half, from) => {
        let prev = from;
        half.forEach(s => {
            for (let i = 1; i <= WORM_SKULL_STEPS; i++) {
                const t = i / WORM_SKULL_STEPS, u = 1 - t;
                const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
                pts.push([
                    b0 * prev[0] + b1 * s.c1[0] + b2 * s.c2[0] + b3 * s.p[0],
                    b0 * prev[1] + b1 * s.c1[1] + b2 * s.c2[1] + b3 * s.p[1]
                ]);
            }
            prev = s.p;
        });
        return prev;
    };
    const top = [0, -1];
    const end = walk(wormSkullHalf(cfg, yaw, 1), top);
    // левая половина — снизу вверх: те же сегменты в обратном порядке
    const left = wormSkullHalf(cfg, yaw, -1);
    let prev = end;
    for (let i = left.length - 1; i >= 0; i--) {
        const s = left[i];
        const to = i === 0 ? top : left[i - 1].p;
        for (let j = 1; j <= WORM_SKULL_STEPS; j++) {
            const t = j / WORM_SKULL_STEPS, u = 1 - t;
            const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
            pts.push([
                b0 * prev[0] + b1 * s.c2[0] + b2 * s.c1[0] + b3 * to[0],
                b0 * prev[1] + b1 * s.c2[1] + b2 * s.c1[1] + b3 * to[1]
            ]);
        }
        prev = to;
    }
    return pts;
}

// Многоугольник зависит только от пропорций и угла, а углов за размещение
// перебирается пять на каждую попытку — без памятки это тысячи пересчётов.
const WormSkullPolyCache = {};

function wormSkullPolyCached(cfg, yaw) {
    const c = wormSkullCfg(cfg);
    // Перекос ВХОДИТ В КЛЮЧ. Без него кэш отдавал бы многоугольник ровного
    // черепа на перекошенный, и «точка внутри?» отвечала бы по старому
    // контуру — то есть шрамы ложились бы мимо, причём молча и только на
    // асимметричной голове.
    const sk = c.skew ? ['brow', 'temple', 'cheek', 'jaw', 'muzzle']
        .map(n => (c.skew[n + 'L'] || 0) + '/' + (c.skew[n + 'R'] || 0)).join(',') : '';
    const key = [c.brow, c.temple, c.cheek, c.jaw, c.muzzle, c.chin,
                 Math.round(yaw * 100), sk].join(':');
    if (!WormSkullPolyCache[key]) WormSkullPolyCache[key] = wormSkullPolygon(cfg, yaw);
    return WormSkullPolyCache[key];
}

// Точка внутри силуэта черепа? x — в долях rx, y — в долях ry.
function wormSkullContains(x, y, cfg, yaw) {
    const pts = wormSkullPolyCached(cfg, yaw);
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}


// ============================================================
//  РАЗМЕТКА ЛИЦА: ГДЕ НА ГОЛОВЕ УЖЕ ЗАНЯТО
// ============================================================
//
// Раньше «куда шраму можно» задавалось четырьмя прямоугольниками, набитыми
// на глаз. Они были в долях rx по ОБЕИМ осям, хотя высота головы — ry, и
// разъезжались при любой правке пропорций. Теперь наоборот: перечислено, где
// НЕЛЬЗЯ, и перечислено не руками, а по тем же числам, которыми черты
// рисуются. Двинули глаз в модели — двинулась и запретная зона.

// Радиус поверхности черепа НА ВЫСОТЕ ГЛАЗ: там голова уже, чем в самом
// широком месте, и азимут глаза размечен именно по ней.
const WORM_HEAD_EYE_SURFACE_K = 0.86;
const WORM_HEAD_SNOUT_Y = 0.36;    // доля ry
const WORM_HEAD_MOUTH_Y = 0.68;    // доля ry
const WORM_HEAD_R = 40;            // базовый радиус головы до масштабов модели
const WORM_HEAD_SNOUT_PROTRUDE = 0.34;   // насколько пятачок вынесен вперёд
const WORM_HEAD_MOUTH_PROTRUDE = 0.08;
// ---------- ЗАПАСЫ ВОКРУГ ЧЕРТ ЛИЦА ----------
// Это НЕ подгонка, а решение: у черты лица есть не только её собственная
// фигура, но и то, что вокруг неё нарисовано — веки, ресницы, бровь, складки
// у глаза; борозда, губы и подбородок у морды. Шрам, разошедшийся с БЕЛКОМ,
// спокойно ложится на ресницы и читается как шрам на глазу.
//
// Запасы взяты от реальных габаритов соседних слоёв: глазница шире яблока в
// 1.38 раза, складки уходят на 1.31, бровь поднята на 1.7 радиуса вверх.
// Берём с запасом сверху, потому что цена ошибки несимметрична: лишний
// свободный пятачок кожи не видно, а шрам на глазу видно сразу.
// По горизонтали запас меньше, чем по вертикали, и это не непоследовательность,
// а место: от края глаза до контура лица всего пятая часть радиуса, и запас
// в два радиуса глаза закрывает висок целиком — шрамам на голове не остаётся
// ничего выше челюсти. 1.75 — это 14 пикселей от центра глаза при складках,
// уходящих на 10.5: ресницы и веко закрыты, висок жив.
const WORM_EYE_KEEP_X = 1.75;
// По вертикали запас закрывает бровь: она поднята на 1.7 радиуса глаза над
// его центром. Больше двух брать нельзя по той же причине, что и по
// горизонтали, — запас в 2.3 съедал весь лоб.
const WORM_EYE_KEEP_Y = 1.9;
const WORM_HEAD_SNOUT_RX = 14.5;   // пятачок до масштабов модели
const WORM_HEAD_SNOUT_RY = 10.5;
const WORM_HEAD_EYE_R = 8;         // глаз до масштабов модели
// ---------- КУДА ВЕШАЕТСЯ СЕРЬГА ----------
// В МЕСТНЫХ координатах уха (см. earPathData в worm-head.js): основание уха
// идёт от x = −19 до x = +27 на высоте y ≈ 11, наружный нижний угол — около
// (24, 6). Серьга висит оттуда. Числа лежат здесь, а не в предмете: это
// опорная точка тела, такая же как положение глаза, и предмету её знать
// неоткуда.
// Полуширина рта в его МЕСТНЫХ координатах: уголки губ на x = ±mouthHalf.
// По ней садится всё, что держат во рту. Раньше число жило только в
// рисовании рта, и вещь на нём не имела способа узнать, где уголок.
const WORM_MOUTH_HALF = 15.5;
const WORM_EAR_JEWEL_X = 21;
const WORM_EAR_JEWEL_Y = 7;
const WORM_EAR_UNIT = 27;          // масштаб уха: по нему меряются украшения
const WORM_YAW_MAX_DEG = 42;       // сколько градусов даёт yaw = 1
// Тот же порог видимости, что у отметин тела (`worm-marks.js`): голова и
// тело прячут свои отметины по одному правилу, а не каждый по своему.
const WORM_MARK_FRONT_MIN_SHARED = 0.35;
// Полоса, на которой отметина не исчезает, а ГАСНЕТ. Жёсткий порог давал
// мигание: голова у стоящего червя всё время чуть поводит, и отметина,
// оказавшаяся ровно на пороге, включалась и выключалась по нескольку раз в
// секунду. Гашение по краю — это ещё и правильно: на реальной коже отметина
// у лимба не пропадает, а сходит на нет вместе с поверхностью.
const WORM_MARK_FADE_BAND = 0.2;

// Проекция точки, сидящей на сфере под азимутом phi, при повороте головы.
// Единичный радиус: умножение на rx делает вызывающий. Сжатие НОРМИРОВАНО
// на своё же значение при анфасе — иначе черта оказывалась сплющенной уже
// при yaw = 0 (разбор — в рендерере, у yawProject).
function wormYawProject(phiDeg, yaw) {
    const a = (phiDeg + yaw * WORM_YAW_MAX_DEG) * Math.PI / 180;
    const base = Math.cos(phiDeg * Math.PI / 180);
    const rel = Math.abs(base) > 1e-3 ? Math.cos(a) / base : Math.cos(a);
    return { x: Math.sin(a), squash: Math.min(1.08, rel), front: rel > 0.08 };
}

// ---------- ГДЕ СТОИТ ГЛАЗ ----------
// Проекция глаза — не просто угол: глаз ещё и ПРИЖИМАЕТСЯ к лицу, чтобы
// дальний не вылез за контур. Пока этот прижим был записан только в
// рендерере, запрет «шрам не на глаз» считал глаз стоящим дальше, чем он
// нарисован, — и шрам ложился ровно на белок дальнего глаза при полном
// повороте. Одна функция на отрисовку и на запрет.
//
// Всё в долях rx головы. halfW — полуширина самого глаза в тех же долях.
const WORM_EYE_SQUASH_MIN = 0.58;   // схлопнутый глаз читается браком, а не ракурсом
const WORM_EYE_PULL = 0.13;         // насколько подбирается допустимый вынос при повороте
const WORM_EYE_PAD = 1.12;          // запас между краем глаза и контуром лица

function wormEyePlace(phiDeg, yaw, halfW) {
    const p = wormYawProject(phiDeg, yaw);
    const squash = Math.max(WORM_EYE_SQUASH_MIN, Math.abs(p.squash));
    const surf = WORM_HEAD_EYE_SURFACE_K;
    const maxAbs = Math.max(0, surf * (1 - WORM_EYE_PULL * Math.abs(yaw)) - (halfW || 0) * squash * WORM_EYE_PAD);
    const raw = p.x * surf;
    return { x: (raw < 0 ? -1 : 1) * Math.min(Math.abs(raw), maxAbs), squash };
}

// ---------- ГДЕ СИДИТ НАДЕТОЕ НА ГОЛОВУ ----------
// Одежда головы висела статическим узлом: лицо поворачивалось, а цилиндр и
// очки оставались на месте — очки съезжали мимо глаз, шляпа уезжала с черепа
// вбок. Теперь у каждого предмета есть ПОСАДКА, и она пересчитывается тем же
// поворотом, что двигает глаза и шрамы:
//
//   face  — предмет лежит на ЛИЦЕ (очки): едет вместе с чертами, по той же
//           поверхности, что глаза, и так же сплющивается;
//   crown — предмет надет НА ЧЕРЕП сверху (цилиндр): череп под ним крутится,
//           а сам он осесимметричен и потому лишь слегка ведёт за лицом.
//           Возить его наравне с глазами нельзя — шляпа съедет с головы.
const WORM_WEAR_CROWN_FOLLOW = 0.22;   // доля хода лица, которую берёт макушка
const WORM_WEAR_CROWN_SQUASH = 0.86;   // насколько макушка вообще сплющивается

function wormWearPlace(fit, yaw, opts) {
    if (fit === 'crown') {
        const theta = (yaw || 0) * WORM_YAW_MAX_DEG * Math.PI / 180;
        return {
            x: Math.sin(theta) * WORM_WEAR_CROWN_FOLLOW,
            squash: 1 - (1 - WORM_WEAR_CROWN_SQUASH) * Math.abs(Math.sin(theta))
        };
    }
    // ---------- ОЧКИ ЕДУТ НА ГЛАЗАХ ----------
    // Не по своей формуле, а ПО САМИМ ГЛАЗАМ: считаем, где при этом повороте
    // оказались оба глаза, и садим очки ровно между ними, растянув так, чтобы
    // линзы легли на яблоки. Собственная формула, даже правильная, у края
    // расходится с глазом — глаз там ещё и прижимается к контуру, и линза
    // уезжала с яблока.
    const o = opts || {};
    const az = o.eyeAzDeg || 0;
    const half = o.eyeHalfW || 0;
    const l = wormEyePlace(-az, yaw || 0, half);
    const r = wormEyePlace(az, yaw || 0, half);
    const spread = o.eyeSpread || 0;      // авторский разлёт линз, в долях rx
    return {
        x: (l.x + r.x) / 2,
        squash: spread > 0.001 ? Math.max(0.2, (r.x - l.x) / (2 * spread)) : l.squash
    };
}

// ---------- НАДЕТОЕ НА ТЕЛО ПРИ РАКУРСЕ ----------
// Тело — не шарик, который крутится под одеждой. Для игрока червь стоит
// вертикально и ПОВОРАЧИВАЕТСЯ как единый организм: фрак не должен вращаться
// вокруг своей оси, он должен уезжать вбок и сужаться, показываясь то одним
// боком, то другим. Ровно то же, что делают очки на лице.
//
// k — ракурс тела: 0 анфас, ±1 профиль. Тот же признак, по которому
// доворачивается грудная клетка (livePose.bodyYaw или направление хвоста).
// halfW — полуширина предмета в долях радиуса части: по ней его прижимает к
// краю, чтобы не выехал за тело.
// ---------- НАСКОЛЬКО ВООБЩЕ СУЖАТЬ ----------
// Тело у червя нарисовано цепочкой кругов и ВСЕГДА повёрнуто к камере: как бы
// он ни шёл, живот виден анфас. Поэтому честное cos(psi) здесь врёт — по нему
// в комнате выходит профиль, и фрак превращался в чёрную полоску шириной в
// палец. Сужение оставлено как НАМЁК на разворот: от целой ширины до двух
// третей, не больше.
const WORM_WEAR_BODY_SQUASH_MIN = 0.62;
// ---------- ПОЧЕМУ СДВИГ МАЛЕНЬКИЙ ----------
// Точка на поверхности при повороте уезжает на R·sin(psi) — но одежда не
// точка: она шириной почти во всю часть. Уехав на столько же, она вылезает за
// край (замер: с полного сдвига «на теле» падало с 0.99 до 0.87), а обрезать
// её по краю значит показать половину фрака. Поэтому сдвиг — только намёк на
// бок, а поворот читается СУЖЕНИЕМ. У очков наоборот: они узкие и обязаны
// ехать по глазам целиком.
const WORM_WEAR_BODY_SLIDE = 0.18;

// ---------- ЛИЦО ПОВОРАЧИВАЕТСЯ СИЛЬНЕЕ, ЧЕМ ВЕЩЬ ЦЕЛИКОМ ----------
// Пока ракурс двигал ВСЮ вещь, сужать её сильно было нельзя: она отрывалась
// от краёв тела и читалась скукоженной. Отсюда мягкие 0.62 и почти
// незаметный сдвиг.
//
// Теперь сужается только лицевая сторона — то, что нарисовано на груди, — а
// обшивка продолжает обнимать часть. Лицо можно и нужно уводить честно: оно
// и правда уезжает на дальний бок и почти пропадает. Ровно так же ведут себя
// очки на повёрнутом лице, и по ним видно, что это работает.
const WORM_WEAR_FACE_SQUASH_MIN = 0.3;
const WORM_WEAR_FACE_SLIDE = 0.52;

function wormWearBodyPlace(k, halfW, isFace) {
    const psi = Math.max(-1, Math.min(1, k || 0)) * Math.PI / 2;
    const squashMin = isFace ? WORM_WEAR_FACE_SQUASH_MIN : WORM_WEAR_BODY_SQUASH_MIN;
    const slide = isFace ? WORM_WEAR_FACE_SLIDE : WORM_WEAR_BODY_SLIDE;
    const squash = 1 - (1 - squashMin) * Math.abs(Math.sin(psi));
    const raw = Math.sin(psi) * slide;
    // И даже намёк не должен выехать за край части.
    const room = Math.max(0, 1 - (halfW || 0) * squash);
    return { x: (raw < 0 ? -1 : 1) * Math.min(Math.abs(raw), room), squash };
}

// Запретные пятна на голове, В ДОЛЯХ rx по обеим осям (так их ждёт
// размещение отметин). У каждого — азимут на сфере, высота и полуразмеры.
// Азимут, а не x: угол не зависит от поворота, и разойтись с глазом надо
// один раз, а не отдельно для каждого ракурса.
function wormHeadKeepOut(model) {
    const head = (model && model.head) || {};
    const scale = head.scale || 1;
    const rx = WORM_HEAD_R * scale * (head.stretchX || 1);
    const ry = WORM_HEAD_R * scale * (head.stretchY || 1);
    const ratio = ry / rx;
    const spots = [];

    const eyes = (model && model.eyes) || {};
    [['left', -1], ['right', 1]].forEach(([key, mirror]) => {
        const e = eyes[key];
        if (!e || e.visible === false) return;
        const surf = rx * WORM_HEAD_EYE_SURFACE_K;
        const off = Math.max(-1, Math.min(1, (e.offsetX || 0) * mirror / surf));
        spots.push({
            phiDeg: Math.asin(off) * 180 / Math.PI,
            // ---------- НА КАКОМ РАДИУСЕ ЧЕРТА СИДИТ ----------
            // Без этого множителя запретное пятно оказывается НЕ ТАМ, где
            // нарисована черта: глаз живёт на поверхности 0.86 от радиуса
            // головы, а пятачок, наоборот, вынесен ВПЕРЁД. Проекция одного и
            // того же угла даёт на них разный вынос, и шрам, «разошедшийся»
            // с глазом по расчёту, ложился ему на белок.
            // Глаз не просто проецируется: он ещё прижимается к лицу.
            // Поэтому у него не множитель радиуса, а своя посадка.
            place: 'eye',
            halfW: WORM_HEAD_EYE_R * (e.stretchX || 1) * (e.scale || 1) / rx,
            y: (e.offsetY || 0) / rx,
            // Веки, ресницы и бровь занимают заметно больше самого яблока —
            // иначе шрам «не на глазу» ложится ровно на бровь.
            hx: WORM_HEAD_EYE_R * (e.stretchX || 1) * (e.scale || 1) * WORM_EYE_KEEP_X / rx,
            hy: WORM_HEAD_EYE_R * (e.stretchY || 1) * (e.scale || 1) * WORM_EYE_KEEP_Y / rx
        });
    });

    // ---------- МОРДА ЦЕЛИКОМ, А НЕ ПЯТАЧОК И РОТ ПО ОТДЕЛЬНОСТИ ----------
    // Раньше здесь стояли два пятна: пятачок и рот. Между ними и вокруг них
    // оставались щели — на переносице, на губе, под пятачком, — и шрам туда
    // садился. А рот ещё и ОТКРЫВАЕТСЯ: пятно по закрытому рту не покрывает
    // открытый. Поэтому морда считается одной запретной областью: сверху от
    // переносицы (где начинается переход к пятачку), снизу до подбородка.
    const snout = (model && model.head && model.head.snout) || {};
    const sc = snout.scale || 1;
    const cfg = wormSkullCfg(head.skull);
    const top = WORM_HEAD_SNOUT_Y - 0.32;          // переносица
    const bottom = cfg.chin;                        // подбородок — ниже открытого рта
    spots.push({
        phiDeg: 0,
        reach: 1 + WORM_HEAD_SNOUT_PROTRUDE,
        y: (top + bottom) / 2 * ratio,
        // Ширина — по самому широкому из двух: пятачок бывает шире морды.
        hx: Math.max(WORM_HEAD_SNOUT_RX * sc * (snout.stretchX || 1) * 1.2 / rx, cfg.muzzle),
        hy: (bottom - top) / 2 * ratio
    });
    return spots;
}

// ---------- ПОЛУШИРИНА ЧЕРЕПА НА ВЫСОТЕ ----------
// Нужна затем, что шрам сидит НА КОЖЕ, а кожа на высоте лба вдвое ближе к
// оси, чем на скулах. Проекция по шару радиуса rx ставила шрам туда, где
// головы уже нет, — ровно то, что было видно на экране.
//
// Таблица вместо поиска по многоугольнику на каждый вопрос: профиль зависит
// только от пропорций и угла, а спрашивают его тысячи раз за раскладку.
const WORM_SKULL_PROFILE_STEPS = 64;
const WormSkullProfileCache = {};

function wormSkullProfile(cfg, yaw) {
    const c = wormSkullCfg(cfg);
    const key = [c.brow, c.temple, c.cheek, c.jaw, c.muzzle, c.chin, Math.round(yaw * 100)].join(':');
    if (WormSkullProfileCache[key]) return WormSkullProfileCache[key];
    const pts = wormSkullPolyCached(cfg, yaw);
    const top = -1, bottom = c.chin;
    const right = new Array(WORM_SKULL_PROFILE_STEPS + 1).fill(0);
    const left = new Array(WORM_SKULL_PROFILE_STEPS + 1).fill(0);
    // Полуширина = самая дальняя точка контура на этой высоте. Контур
    // проходится отрезками: для каждой высоты берём пересечения.
    for (let i = 0; i <= WORM_SKULL_PROFILE_STEPS; i++) {
        const y = top + (bottom - top) * i / WORM_SKULL_PROFILE_STEPS;
        let r = 0, l = 0;
        for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
            const yi = pts[k][1], yj = pts[j][1];
            if ((yi > y) === (yj > y)) continue;
            const x = pts[k][0] + (pts[j][0] - pts[k][0]) * (y - yi) / (yj - yi);
            if (x > r) r = x;
            if (x < l) l = x;
        }
        right[i] = r; left[i] = -l;
    }
    const prof = { top, bottom, right, left };
    WormSkullProfileCache[key] = prof;
    return prof;
}

// Полуширина черепа на высоте y (в долях ry) со стороны side (+1 / −1),
// в долях rx. Между узлами таблицы — линейно: шаг мельче толщины линии.
function wormSkullHalfWidth(y, cfg, yaw, side) {
    const prof = wormSkullProfile(cfg, yaw);
    const arr = side < 0 ? prof.left : prof.right;
    const f = (y - prof.top) / (prof.bottom - prof.top) * WORM_SKULL_PROFILE_STEPS;
    if (f <= 0 || f >= WORM_SKULL_PROFILE_STEPS) return 0;
    const i = Math.floor(f), t = f - i;
    return arr[i] * (1 - t) + arr[i + 1] * t;
}

// ---------- ТОЧКА НА КОЖЕ ГОЛОВЫ ----------
// Азимут вокруг вертикальной оси + высота → место на экране, ракурс и
// видимость. ОДНА функция на размещение отметин и на их отрисовку: пока их
// было две, шрам проверялся в одном месте, а рисовался в другом.
//
// Отличие от yawProject (черты лица): сжатие здесь НЕ нормировано. Глаз
// нарисован своей ширины и обязан её держать при анфасе; шрам — точка на
// коже, и у края он обязан сойти на нет, иначе торчит за контур. Тело
// считает свои отметины ровно так же — |cos phi|.
//
// v — высота в долях rx (как её ждёт рендерер), ratio = ry / rx.
function wormHeadSkinPoint(phiDeg, v, cfg, yaw, ratio, halfX, halfY) {
    const a = (phiDeg + yaw * WORM_YAW_MAX_DEG) * Math.PI / 180;
    const depth = Math.cos(a);
    const side = Math.sin(a) >= 0 ? 1 : -1;
    const k = ratio || 1;
    // ---------- ПОВЕРХНОСТЬ КРИВАЯ И ПО ВЫСОТЕ ----------
    // Отметина — плоский прямоугольник, а голова сужается кверху и книзу.
    // Если садить её по полуширине НА ЕЁ ВЫСОТЕ, верхний и нижний углы
    // окажутся там, где череп уже, и вылезут наружу на пару пикселей. Поэтому
    // отметина садится по САМОМУ УЗКОМУ месту из тех, которые она занимает:
    // так она лежит на коже целиком, а не серединой.
    let half = wormSkullHalfWidth(v / k, cfg, yaw, side);
    if (halfY) {
        half = Math.min(half,
            wormSkullHalfWidth((v - halfY) / k, cfg, yaw, side),
            wormSkullHalfWidth((v + halfY) / k, cfg, yaw, side));
    }
    const front = depth > WORM_MARK_FRONT_MIN_SHARED;
    // Без размера отметины — просто точка.
    if (!halfX || half <= 0.0001) {
        return { x: half * Math.sin(a), squash: Math.abs(depth), front, alpha: 1, depth };
    }
    // ---------- ПРОЕКЦИЯ ПО КРАЯМ, А НЕ ПО ЦЕНТРУ ----------
    // Центр отметины лежит НА поверхности, то есть у края силуэта — прямо на
    // контуре. Если ширину брать как «полуширина, умноженная на cos», то у
    // края она убывает медленнее, чем контур уходит от центра, и половина
    // отметины оказывается снаружи. Это не запас и не погрешность таблицы:
    // sin у края вогнут, и линейная поправка по производной там врёт.
    //
    // Считаем честно: отметина занимает на окружности сектор ±δ, и её край
    // на экране — это проекция края сектора. У самого лимба оба края
    // сходятся, и ширина сама уходит в ноль.
    const d = Math.min(Math.PI / 2, halfX / half);
    const lo = Math.max(-Math.PI / 2, a - d), hi = Math.min(Math.PI / 2, a + d);
    const xlo = half * Math.sin(lo), xhi = half * Math.sin(hi);
    const squash = Math.max(0, (xhi - xlo) / (2 * halfX));
    const x = (xlo + xhi) / 2;
    // ---------- НЕ ВЛЕЗЛА — НЕ РИСУЕМ ----------
    // Страховка на случай, когда модель на экране разошлась с той, по которой
    // место подбирали (червь растёт, худеет, тянется). Первая версия ПРИЖИМАЛА
    // такую отметину к контуру, как прижимается дальний глаз, — и это оказалось
    // хуже болезни: прижатые отметины сползаются в одну точку у края и
    // подрагивают взад-вперёд вместе с контуром. У глаза прижим уместен (глаз
    // один и он обязан быть виден), у отметины — нет: она у самого края всё
    // равно сжата в полоску, и спрятать её честнее, чем подвинуть.
    const fits = Math.abs(x) + halfX * squash <= half;
    // Прозрачность у края: 0 на пороге, 1 за полосой гашения.
    const alpha = Math.max(0, Math.min(1, (depth - WORM_MARK_FRONT_MIN_SHARED) / WORM_MARK_FADE_BAND));
    return { x, squash, front: front && fits, alpha, depth };
}


const WormSilhouette = {
    skullPath: wormSkullPath,
    // Половина контура черепа КРИВЫМИ — то, из чего складывается skullPath.
    // Наружу отдано затем, что «скула» и «висок» не узлы дерева, а точки на
    // этих кривых: показать их на экране можно только отсюда. Считать их
    // второй раз в другом файле нельзя — это ровно тот случай, когда два
    // описания одного расходятся молча.
    skullHalf: wormSkullHalf,
    headRadii: wormHeadRadii,
    yawProject: wormYawProject,
    skinPoint: wormHeadSkinPoint,
    skullHalfWidth: wormSkullHalfWidth,
    headKeepOut: wormHeadKeepOut,
    eyePlace: wormEyePlace,
    wearPlace: wormWearPlace,
    wearBodyPlace: wormWearBodyPlace,
    YAW_MAX_DEG: WORM_YAW_MAX_DEG,
    FRONT_MIN: WORM_MARK_FRONT_MIN_SHARED,
    FADE_BAND: WORM_MARK_FADE_BAND,
    // Разметка лица — числами, а не копиями в двух файлах: рендерер берёт их
    // отсюда же.
    face: {
        mouthHalf: WORM_MOUTH_HALF, earJewelX: WORM_EAR_JEWEL_X, earJewelY: WORM_EAR_JEWEL_Y, earUnit: WORM_EAR_UNIT, snoutY: WORM_HEAD_SNOUT_Y, mouthY: WORM_HEAD_MOUTH_Y,
            eyeSurfaceK: WORM_HEAD_EYE_SURFACE_K, headR: WORM_HEAD_R },
    skullContains: wormSkullContains,
    skullPolygon: wormSkullPolyCached,
    // Тело и хвост — эллипсы. Отдельной функции почти нет смысла, но она
    // есть, чтобы у размещения был ОДИН вопрос ко всем частям, а не «если
    // голова, то одно, иначе другое».
    ellipseContains: (x, y, ratio) => {
        const ky = ratio || 1;
        return (x * x) + (y / ky) * (y / ky) <= 1;
    }
};

if (typeof window !== 'undefined') window.WormSilhouette = WormSilhouette;
if (typeof module !== 'undefined' && module.exports) module.exports = WormSilhouette;
