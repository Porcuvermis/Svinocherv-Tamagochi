// ================= ГОЛОВА: ЧЕРЕП, ГЛАЗА, ПАСТЬ, ПОВОРОТ =================
// Пятый файл стопки рендерера (карта — в worm-basis.js).
//
// Контур черепа и разметка лица живут НЕ здесь, а в worm-silhouette.js: одно
// описание и на рисование, и на размещение отметин. Пока описаний было два,
// шрамы висели в воздухе рядом с головой (docs/traps.md, п. 103).

// ============================================================================
//                     ПОВОРОТ ГОЛОВЫ (YAW, «ТРИ ЧЕТВЕРТИ»)
// ============================================================================
// Голова была строго анфас, а тело — в профиль. Смешанная проекция — самый
// заметный признак детского рисунка: ровно так дети рисуют человека, лицо
// анфас и ноги вбок (art-direction.md §4.3).
//
// Ключевое решение: это НЕ «перерисованная в три четверти голова», а ОСЬ
// ПОВОРОТА. При yaw = 0 всё встаёт ровно туда, где стояло раньше, а
// значение по умолчанию просто сдвинуто в три четверти. Побочная выгода
// параметрического подхода: голову теперь можно ПОВОРАЧИВАТЬ на ходу —
// проводить взглядом, отворачиваться, коситься.
//
// Модель: череп приближается сферой радиуса rx, и каждая черта лица сидит на
// её поверхности под азимутом phi (0 = точно спереди, плюс — к правому уху
// зрителя). Поворот головы просто прибавляется к азимуту, а экранное
// положение черты — rx*sin(phi + theta). Одна формула даёт сразу всё:
//   • дальний глаз уезжает к краю лица и сплющивается;
//   • ближний глаз выходит к середине;
//   • дальнее ухо прячется за череп (проекция уходит в минус);
//   • ближнее ухо разворачивается к зрителю.
// Горизонтальное сжатие черты — cos(phi + theta): то самое ракурсное
// сокращение, из-за которого дальняя половина лица «уже» ближней.
//
// Азимуты НЕ выдуманы, а посчитаны из нынешних анфасных отступов
// (phi = asin(offset / rx)), поэтому yaw = 0 воспроизводит сегодняшнюю
// голову с точностью до пикселя, и правка безопасна.
const YAW_MAX_DEG = WormSilhouette.YAW_MAX_DEG;   // сколько градусов даёт yaw = 1

// ---------- ИМЕНОВАННЫЕ ПОЗЫ ГОЛОВЫ ----------
// Ось непрерывная — это механизм. Позы — словарь: код игры говорит
// «смотрит влево», а не «yaw = -0.5». Три значения настраиваются один раз и
// дальше гарантированно хороши, а у любой анимации поворота появляются
// определённые ключи. Левая и правая — честное зеркало друг друга: проверено
// замером, все черты сходятся с точностью 0.00 px (расходятся только
// веснушки и складки, они раскладываются сеянным генератором и на сторонах
// разные — такая асимметрия как раз нужна).
//
// Важно: это НЕ зеркальная копия картинки. У отражённого спрайта вместе с ним
// отразился бы и свет — блик перепрыгнул бы на другую скулу, и персонаж
// выглядел бы освещённым разными лампами в разных позах. Здесь источник
// света остаётся на месте (art-direction.md §3), а шрам не перескакивает с
// щеки на щеку.
const WORM_HEAD_POSES = { left: -0.5, center: 0, right: 0.5 };

// Черты, которые ВЫСТУПАЮТ вперёд (пятачок, морда), при повороте уезжают в
// сторону сильнее, чем лежащие на поверхности: они дальше от оси вращения.
// Это и есть главный признак ракурса — нос уходит с центра лица.
function yawProject(rx, phiDeg, yaw, protrude) {
    // Сам расчёт — в `worm-silhouette.js`: им пользуется и размещение
    // отметин, и оно обязано считать ракурс ТЕМ ЖЕ способом, иначе шрам
    // проверен в одном месте, а нарисован в другом.
    //
    // Сжатие НОРМИРОВАНО на своё же значение при нулевом повороте. Без
    // нормировки squash = cos(phi) уже при анфасе: у глаза на азимуте 40° это
    // 0.77, у уха на 73° — 0.29, то есть черты оказывались сплющены В САМОМ
    // АНФАСЕ, и обещание «yaw = 0 воспроизводит прежнюю голову» держалось
    // только для позиций, но не для ширин.
    const p = WormSilhouette.yawProject(phiDeg, yaw);
    return { x: rx * (1 + (protrude || 0)) * p.x, squash: p.squash, front: p.front };
}

// Азимут черты, стоящей при анфасе на расстоянии offset от центра лица.
function yawAzimuth(offset, rx) {
    return Math.asin(Math.max(-1, Math.min(1, offset / rx))) * 180 / Math.PI;
}

// ---------- ПОСАДКА УШЕЙ ----------
// Высота корня уха (доля ry, вверх — отрицательно).
const EAR_Y_RATIO = 0.66;
// Насколько сильно ухо может сократиться в ширину, встав к зрителю ребром.
const EAR_SQUASH_MIN = 0.42;
// Насколько распрямляется разворот уха наружу, когда оно встаёт ребром.
// Узкое ухо под тем же углом 30° читается лезвием, воткнутым сбоку в голову:
// оно топорщится в сторону ровно тогда, когда меньше всего похоже на ухо.
// Повёрнутое ухо должно уходить ЗА голову, а не отставать от неё, — уши и
// рисуются первыми, до черепа, так что подобранное ухо честно им закрывается.
const EAR_EDGE_STRAIGHTEN = 0.55;

// Полуширина черепа на заданной высоте (yNorm — доля ry).
//
// Понадобилась ушам, и вот почему. Корень уха считался проекцией точки на
// ЭКВАТОРИАЛЬНОМ круге радиуса rx, хотя ухо сидит на макушке, где череп вдвое
// уже своей самой широкой части (browWidth 0.42 против cheekWidth 0.97).
// Круга такого радиуса на этой высоте головы просто нет. Пока ухо было
// широким, разрыв закрывало его мясистое основание; при повороте якорь ехал
// НАРУЖУ (35.7 → 40), контур черепа на той же высоте — ВНУТРЬ (26.9 → 23.4),
// а ухо в этот момент сжималось до 40% ширины и перекрывать разрыв ему было
// уже нечем. Отсюда и «ухо отрывается от головы, когда становится узким».
function skullHalfAtY(rx, p, yNorm) {
    // Верхняя дуга контура из skullPathData: (0,-1) → свод → виски → скулы.
    const xs = [0, (p.browWidth != null ? p.browWidth : 0.62),
        (p.templeWidth != null ? p.templeWidth : 0.97),
        (p.cheekWidth != null ? p.cheekWidth : 1)];
    const ys = [-1, -0.99, -0.72, -0.08];
    const bez = (a, t) => {
        const u = 1 - t;
        return u * u * u * a[0] + 3 * u * u * t * a[1] + 3 * u * t * t * a[2] + t * t * t * a[3];
    };
    // По y дуга монотонна, поэтому параметр ищется делением пополам: два
    // десятка итераций дешевле и надёжнее, чем решать кубическое уравнение.
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2;
        if (bez(ys, m) < yNorm) lo = m; else hi = m;
    }
    return rx * bez(xs, (lo + hi) / 2);
}

// Где корень уха при данном повороте головы и насколько ухо сплющено.
//
// Одна функция и на сборку, и на живой пересчёт. Это не вкусовщина: тут уже
// один раз разъехались два места, считавшие одно и то же, и калибровка
// размера уха месяц не доезжала до экрана (см. EAR_FORM_SCALE).
function earPlacement(ref, yaw) {
    const proj = yawProject(ref.latR, ref.yawPhi, yaw, 0);
    const squash = Math.max(EAR_SQUASH_MIN, Math.abs(proj.squash));
    // Череп при повороте несимметричен (см. skullPathData): свод со стороны
    // лица оптически уже, затылочный — полнее. Корень обязан ехать по ТОМУ
    // контуру, который реально нарисован, иначе ухо повисает рядом с головой.
    const t = Math.abs(yaw || 0);
    const faceSide = (yaw || 0) >= 0 ? 1 : -1;
    const widen = ref.mirror === faceSide ? (1 - 0.13 * t) : (1 + 0.11 * t);
    // Вылет корня наружу от контура — это собственная плоть уха, и при
    // развороте она сокращается вместе с ухом. Постоянный вылет как раз и
    // отрывал ухо: ракурс сжимал полотно, а точку крепления — нет.
    return {
        x: proj.x * widen + ref.rootOut * squash,
        squash,
        // 0 — ухо анфас, 1 — стоит ребром.
        edge: clamp01((1 - squash) / (1 - EAR_SQUASH_MIN))
    };
}

// ---------- ЛОКАЛЬНЫЕ ФОРМЫ (до позиционирования) ----------
// ---------- КОНТУР УХА: ПЯТЬ ТОЧЕК, КОТОРЫЕ МОЖНО ТЯНУТЬ ----------
// Раньше путь уха был строкой с полусотней чисел прямо в коде. Форму такой
// вещи может менять только тот, кто эти числа читает, — то есть просьба
// «сделай ухо поострее, а мочку ниже» всегда возвращалась ко мне.
//
// Теперь у контура есть ИМЕНА. Пять опорных точек с человеческими
// названиями, и к каждой можно добавить сдвиг из модели
// (`head.ears.<сторона>.form`). Сдвиг ОТНОСИТЕЛЬНЫЙ и по умолчанию его нет
// вовсе: `form: null` — это ровно та форма, что была, до последней цифры.
//
// Числа — из старого пути слово в слово. Разбор, почему клин именно такой,
// остался там же, где был, и повторять его здесь незачем:
//   • кошка: основание узкое, ухо выше своей ширины, тонкий шип;
//   • свинья: основание широченное, ухо квадратное в габаритах, тяжёлый
//     мясистый клин, вершина перекатывается НАРУЖУ, задняя кромка провисает.
// Ключ к прочтению — ПРЯМЫЕ РЁБРА И УГОЛ: выпуклая дуга по задней кромке
// читается шариком независимо от габаритов.
const WORM_EAR_ANCHORS = [
    { key: 'ear-base',  title: 'основание', x: -19, y:  11 },
    { key: 'ear-front', title: 'передний край', x: -3, y: -27 },
    { key: 'ear-tip',   title: 'кончик',    x:  19, y: -32 },
    { key: 'ear-break', title: 'излом',     x:  27, y:  -3 },
    { key: 'ear-lobe',  title: 'мочка',     x:  12, y:  12 }
];
// Управляющие точки кривых, по две на сегмент. Сами по себе имени не имеют:
// их двигает не палец, а соседние якоря (см. earShift).
const WORM_EAR_CTRL = [
    [{ x: -18, y:  -3 }, { x: -12, y: -18 }],
    [{ x:   4, y: -34 }, { x:  14, y: -36 }],
    [{ x:  23, y: -24 }, { x:  26, y: -13 }],
    [{ x:  27, y:   5 }, { x:  20, y:  11 }],
    [{ x:   2, y:  13 }, { x: -10, y:  13 }]
];
// Раковина — углублённая часть уха: повторяет внешний контур с отступом
// внутрь, за счёт чего у уха появляется толщина, а не плоская заливка.
const WORM_EAR_INNER = [
    { x: -11, y:   7 },
    [{ x: -10, y:  -3 }, { x:  -6, y: -15 }, { x:   1, y: -22 }],
    [{ x:   6, y: -27 }, { x:  13, y: -28 }, { x:  16, y: -25 }],
    [{ x:  19, y: -19 }, { x:  21, y: -10 }, { x:  21, y:  -3 }],
    [{ x:  21, y:   3 }, { x:  16, y:   7 }, { x:   9, y:   8 }],
    [{ x:   1, y:   9 }, { x:  -5, y:   9 }, { x: -11, y:   7 }]
];
// Дальше сдвинутого якоря форму не растягиваем: ухо — часть силуэта, и за
// этой границей оно перестаёт читаться ухом вовсе.
const WORM_EAR_FORM_MAX = 18;

// Сдвиг произвольной точки контура от сдвинутых якорей. Вес — обратный
// квадрат расстояния, поэтому САМ якорь уезжает ровно на свой сдвиг, а
// управляющие точки и раковина едут за ним тем меньше, чем дальше стоят.
//
// Считать «какая кривая чья» отдельно не надо: одна формула на внешний
// контур, его управляющие точки и раковину. Пока их правили по отдельности,
// раковина вылезала за контур при первом же движении кончика.
function earShift(px, py, form) {
    if (!form) return { x: px, y: py };
    let sx = 0, sy = 0, wsum = 0;
    for (let i = 0; i < WORM_EAR_ANCHORS.length; i++) {
        const a = WORM_EAR_ANCHORS[i];
        const d = form[a.key];
        const dx = px - a.x, dy = py - a.y;
        const w = 1 / (dx * dx + dy * dy + 4);
        wsum += w;
        if (!d) continue;
        sx += w * Math.max(-WORM_EAR_FORM_MAX, Math.min(WORM_EAR_FORM_MAX, d.x || 0));
        sy += w * Math.max(-WORM_EAR_FORM_MAX, Math.min(WORM_EAR_FORM_MAX, d.y || 0));
    }
    if (!wsum) return { x: px, y: py };
    return { x: px + sx / wsum, y: py + sy / wsum };
}

// Где точка контура лежит на самом деле — с учётом сдвигов и зеркала.
// Спрашивает студия, чтобы поставить ручку РОВНО на неё: ручка, стоящая не
// там, где точка, двигает не то, на что показывает.
function wormEarPoint(mirror, form, key) {
    const a = WORM_EAR_ANCHORS.find(p => p.key === key);
    if (!a) return null;
    const p = earShift(a.x, a.y, form);
    return { x: mirror * p.x, y: p.y };
}

function earPathData(mirror, form) {
    const s = mirror;
    const P = (pt) => { const q = earShift(pt.x, pt.y, form); return `${(s * q.x).toFixed(1)},${q.y.toFixed(1)}`; };
    let d = `M ${P(WORM_EAR_ANCHORS[0])} `;
    for (let i = 0; i < 5; i++) {
        const c = WORM_EAR_CTRL[i];
        const to = WORM_EAR_ANCHORS[(i + 1) % 5];
        d += `C ${P(c[0])} ${P(c[1])} ${P(to)} `;
    }
    return d + 'Z';
}

function earInnerPathData(mirror, form) {
    const s = mirror;
    const P = (pt) => { const q = earShift(pt.x, pt.y, form); return `${(s * q.x).toFixed(1)},${q.y.toFixed(1)}`; };
    let d = `M ${P(WORM_EAR_INNER[0])} `;
    for (let i = 1; i < WORM_EAR_INNER.length; i++) {
        const seg = WORM_EAR_INNER[i];
        d += `C ${P(seg[0])} ${P(seg[1])} ${P(seg[2])} `;
    }
    return d + 'Z';
}

// Сосудики внутри уха: у свиньи ухо — самая тонкая кожа на всём теле, оно
// реально просвечивает на свет. Дешёвая деталь (3-4 тонких пути), которая
// сразу сообщает "это живая ткань, а не розовый треугольник".
function buildEarVessels(ctx, mirror, side) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;
    const palette = (anatomy.organs && anatomy.organs.palette) || {};
    const vis = clamp01((anatomy.organs && anatomy.organs.visibility != null ? anatomy.organs.visibility : 0.55));
    if (vis <= 0.02) return null;
    const rng = anatRng(anatomy, `ear-${side}`, 'vessel');
    const group = svgEl('g', { class: 'worm-ear-vessels', opacity: (0.5 * vis + 0.15).toFixed(3) });
    const s = mirror;
    const branches = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < branches; i++) {
        const t = (i + 1) / (branches + 1);
        const ex = s * (5 + t * 8 + rng() * 2);
        const ey = -6 - t * 14 - rng() * 3;
        group.appendChild(svgEl('path', {
            d: `M ${(s * 2).toFixed(1)},-2 Q ${(ex * 0.55).toFixed(1)},${(ey * 0.5).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
            fill: 'none', stroke: palette.vessel || VISCERA[700],
            'stroke-width': (0.9 - i * 0.15).toFixed(2), opacity: 0.55, 'stroke-linecap': 'round'
        }));
    }
    return group;
}

// Пара тонких "лопнувших сосудиков" на белке глаза — усталый/нездоровый вид
// без ресничек и без румян.
function buildEyeVeins(seedKey, rx, ry) {
    const rng = mulberry32(hashStringSeed(seedKey));
    const group = svgEl('g', { class: 'worm-eye-veins' });
    const veinCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < veinCount; i++) {
        const angle = rng() * Math.PI * 2;
        const startR = rx * (0.55 + rng() * 0.2);
        const ratio = ry / rx;
        const sx = Math.cos(angle) * startR;
        const sy = Math.sin(angle) * startR * ratio;
        const midAngle = angle + (rng() * 0.6 - 0.3);
        const midR = startR * 0.55;
        const mx = Math.cos(midAngle) * midR;
        const my = Math.sin(midAngle) * midR * ratio;
        const vein = svgEl('path', {
            d: `M ${sx.toFixed(1)},${sy.toFixed(1)} Q ${mx.toFixed(1)},${my.toFixed(1)} 0,0`,
            fill: 'none', stroke: VISCERA[300], 'stroke-width': SW.hairline, opacity: 0.4, 'stroke-linecap': 'round'
        });
        group.appendChild(vein);
    }
    return group;
}

// ---------- ПОСТРОЕНИЕ ОДНОГО СЕГМЕНТА ТЕЛА (не хвост, не голова) ----------
// ctx несёт общий контекст инстанса (defs, кэш градиентов, анатомию) — см.
// buildWormSVGGroup.
function buildSegmentNode(partName, seg, ctx, opts) {
    opts = opts || {};
    const group = svgEl('g', { 'data-part': partName });

    // ---------- СЛОЙ 0: СКЕЛЕТ ----------
    // Скелет буквально не рисуется, но задаёт форму: индивидуальная
    // вариация пропорций конкретного сегмента ("где тело толще, где
    // тоньше"). Держится маленькой — цепочка рассчитана на перекрытие
    // соседей, сильный разброс открыл бы зазоры между звеньями.
    let skelX = 1, skelY = 1;
    const skeleton = ctx.anatomy.enabled ? (ctx.anatomy.skeleton || {}) : null;
    if (skeleton && (skeleton.variation || 0) > 0.001) {
        const rng = anatRng(ctx.anatomy, partName, 'skeleton');
        skelX = 1 + (rng() * 2 - 1) * skeleton.variation;
        skelY = 1 + (rng() * 2 - 1) * skeleton.variation;
    }

    const baseRx = seg.radius * seg.stretchX * seg.scale * skelX;
    const baseRy = seg.radius * seg.stretchY * seg.scale * skelY;

    // Цвет сегмента может быть подмешан к цвету головы (переход червь →
    // свиная голова, см. skin.neckBlend) — сам цвет в модели при этом не
    // меняется, подмешивание делает только рендерер.
    const fillColor = opts.blendFill || seg.fill;

    const gradId = `worm-seg-grad-${ctx.instanceId}-${partName}`;
    const fillUrl = ensureVolumeGradient(ctx.defs, gradId, fillColor, {
        cx: '38%', cy: '30%', r: '80%',
        highlight: 0.22, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });

    // ВАЖНО: у сегмента больше нет собственной обводки. Контур тела теперь
    // единый (см. createHullLayers) — иначе на каждом стыке виден шов, и тело
    // читается стопкой отдельных шаров, а не одним существом.
    const ellipse = svgEl('ellipse', {
        class: 'worm-part-shape',
        cx: 0, cy: 0,
        rx: baseRx.toFixed(2),
        ry: baseRy.toFixed(2),
        fill: fillUrl,
        stroke: 'none'
    });
    group.appendChild(ellipse);

    // Глянцевый блик — небольшой полупрозрачный эллипс в верхне-левой части
    // сегмента, поверх градиента усиливает объём.
    const shine = svgEl('ellipse', {
        cx: (-baseRx * 0.25).toFixed(2), cy: (-baseRy * 0.4).toFixed(2),
        rx: (baseRx * 0.38).toFixed(2), ry: (baseRy * 0.22).toFixed(2),
        fill: SPEC, opacity: 0.16
    });
    group.appendChild(shine);

    // ---------- СЛОИ 1..5: АНАТОМИЯ ----------
    const anat = buildAnatomyStack(ctx, partName, {
        rx: baseRx, ry: baseRy,
        axis: opts.axis || 'x',
        organZone: opts.organZone,
        muscle: opts.muscle,
        coat: opts.coat || {},
        surface: opts.surface || {}
    });
    if (anat) group.appendChild(anat.group);

    // Якорь под шрамы/эффекты этого сегмента — шрамы монтируются сюда же,
    // как дочерние элементы group, и наследуют её transform.
    const scarLayer = svgEl('g', { 'data-anchor': `${partName}-scars`, class: 'worm-scar-layer' });
    group.appendChild(scarLayer);
    // baseRx/baseRy сохраняются отдельно, чтобы мини-игры могли "живо"
    // (без пересборки SVG) масштабировать конкретный сегмент — например,
    // раздувание живота в Чревоугодии через handle.setLivePose({ bellyScale }).
    return { group, ellipse, shine, scarLayer, baseRx, baseRy, anat, fillColor };
}

// ---------- ПОСТРОЕНИЕ ХВОСТА (отдельная сущность, каплевидная форма) ----------
// attachRadius — реальный отрисованный радиус ПОСЛЕДНЕГО growing-сегмента
// (предхвостового): основание хвоста считается ДОЛЕЙ от него, а не
// собственным независимым числом — тогда сужение цепочки продолжается
// естественно и на хвост тоже.
function buildTailNode(tail, ctx, attachRadius) {
    const group = svgEl('g', { 'data-part': 'tail' });
    const L = 34 * tail.length; // общая длина хвоста, от основания до кончика
    const Rbase = (attachRadius || 15) * WORM_TAIL_BASE_RATIO * tail.thickness;
    // Кончик — маленький ЗАКРУГЛЁННЫЙ овал, а не точка: у него есть
    // собственный небольшой радиус, форма читается как капля/яйцо, не шип.
    const Rtip = Rbase * WORM_TAIL_TIP_RATIO;
    const tipCx = -(L - Rtip);
    const d = `M 0,${(-Rbase).toFixed(1)} ` +
              `A ${Rbase.toFixed(1)},${Rbase.toFixed(1)} 0 0 1 0,${Rbase.toFixed(1)} ` +
              `Q ${(tipCx * 0.55).toFixed(1)},${(Rbase * 0.9).toFixed(1)} ${tipCx.toFixed(1)},${Rtip.toFixed(1)} ` +
              `A ${Rtip.toFixed(1)},${Rtip.toFixed(1)} 0 0 1 ${tipCx.toFixed(1)},${(-Rtip).toFixed(1)} ` +
              `Q ${(tipCx * 0.55).toFixed(1)},${(-Rbase * 0.9).toFixed(1)} 0,${(-Rbase).toFixed(1)} Z`;

    const gradId = `worm-tail-grad-${ctx.instanceId}`;
    const fillUrl = ensureVolumeGradient(ctx.defs, gradId, tail.fill, {
        cx: '62%', cy: '35%', r: '85%',
        highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.32, shadowTint: GRIME_SHADOW
    });
    const path = svgEl('path', { class: 'worm-part-shape', d, fill: fillUrl, stroke: tail.stroke, 'stroke-width': SW.contour });

    // Внутренняя группа для "живого" изгиба хвоста — вращается вокруг точки
    // крепления (0,0), не требует пересборки SVG, обновляется напрямую через
    // handle.setLivePose({ tailBendAngle }).
    const bendGroup = svgEl('g', { 'data-part': 'tail-bend' });
    bendGroup.appendChild(path);

    // Анатомия хвоста обрезается по ЕГО СОБСТВЕННОЙ форме (тот же путь), а
    // не по эллипсу — иначе слои торчали бы за пределы каплевидного силуэта.
    // Центр анатомии смещён к середине хвоста, длина — половина хвоста.
    const anat = buildAnatomyStack(ctx, 'tail', {
        rx: L * 0.5, ry: Rbase * 0.92,
        axis: 'x',
        organZone: 'tail',
        clipPathData: d,
        coat: { rings: true }
    });
    if (anat) {
        setAttr(anat.group, 'transform', `translate(${(-L * 0.5).toFixed(1)},0)`);
        bendGroup.appendChild(anat.group);
    }

    group.appendChild(bendGroup);
    // Слой кожи ВНУТРИ группы изгиба, а не рядом с ней. Снаружи он не гнулся
    // вместе с хвостом: хвост загибался, а бант и шрамы на нём оставались
    // висеть горизонтально — приколоченными к экрану, а не к телу.
    const scarLayer = svgEl('g', { 'data-anchor': 'tail-scars', class: 'worm-scar-layer' });
    bendGroup.appendChild(scarLayer);
    return { group, path, bendGroup, scarLayer, baseRadius: Rbase, length: L, anat };
}

// ---------- ПОСТРОЕНИЕ ОДНОГО ГЛАЗА (склера, радужка, зрачок, веко-шторка) ----------
function buildEyeNode(eye, mirror, instanceId, eyeKey, defs, yawCtx) {
    // Возвращает, помимо узлов, всё нужное для ЖИВОГО пересчёта поворота.
    // yawCtx: { yaw, headRx } — при yaw = 0 всё сходится к прежнему x.
    const yaw = yawCtx ? yawCtx.yaw : 0;
    // ВАЖНО: радиус берётся не полный, а поверхности черепа НА ВЫСОТЕ ГЛАЗ —
    // там голова уже, чем в самом широком месте. С полным радиусом дальний
    // глаз при повороте вылезал за контур лица.
    const headRx = yawCtx ? yawCtx.headRx : (eye.offsetX / 0.55);
    const phi = yawAzimuth(eye.offsetX * mirror, headRx);
    const y = eye.offsetY;
    // Ракурсное сокращение: дальний глаз сплющивается по горизонтали.
    // Ограничено снизу — полностью схлопнутый глаз читается дефектом,
    // а не поворотом.
    // Нижний предел сжатия. 0.42 давал дальний глаз-щёлочку, которая
    // читалась дефектом отрисовки, а не ракурсом: у стилизованного персонажа
    // глаз обязан остаться глазом. Ракурс здесь уступает читаемости.
    // Сжатие НЕ запекается в rx: иначе при живом повороте пришлось бы
    // пересобирать всю внутреннюю геометрию глаза (склера, радужка, веко,
    // clipPath) каждый кадр. Оно живёт в scale() группы — там его можно
    // переставить одним атрибутом.
    const rx = 8 * eye.stretchX * eye.scale;
    const ry = 8 * eye.stretchY * eye.scale;
    // Посадка глаза — в `worm-silhouette.js`: и проекция, и прижим к лицу
    // (дальний глаз подбирается внутрь, чтобы не вылезти за контур). Там же
    // её спрашивает размещение шрамов, когда решает, свободно ли место. Пока
    // формула жила только здесь, шрам считал глаз стоящим дальше, чем он
    // нарисован, и при полном повороте ложился ему на белок.
    const rxHead = (yawCtx && yawCtx.rxHead) || headRx;
    const place = WormSilhouette.eyePlace(phi, yaw, rx / rxHead);
    const yawSquash = place.squash;
    const x = place.x * rxHead;

    const group = svgEl('g', {
        'data-part': `eye-${eyeKey}`,
        transform: `translate(${x.toFixed(2)},${y}) scale(${yawSquash.toFixed(3)},1)`,
        visibility: eye.visible ? 'visible' : 'hidden'
    });

    // Глазница — тень вокруг глаза, "усаживает" его в морду и вместе с
    // веком-шторкой ниже создаёт усталый, нездоровый взгляд.
    const socket = svgEl('ellipse', {
        cx: 0, cy: (-ry * 0.1).toFixed(2),
        rx: (rx * 1.45).toFixed(2), ry: (ry * 1.4).toFixed(2),
        fill: withAlpha(INK, 0.13)
    });
    // Тень от нависающего верхнего века: без неё глаз выглядит наклеенным
    // кружком, а не сидящим в глазнице.
    const browShadow = svgEl('ellipse', {
        cx: 0, cy: (-ry * 0.72).toFixed(2),
        rx: (rx * 1.2).toFixed(2), ry: (ry * 0.6).toFixed(2),
        fill: withAlpha(FLESH[900], 0.22)
    });

    const scleraGradId = `worm-eye-sclera-${instanceId}-${eyeKey}`;
    const scleraFill = ensureVolumeGradient(defs, scleraGradId, SCLERA, { cx: '40%', cy: '35%', r: '75%', highlight: 0.05, shadow: -0.1 });
    const sclera = svgEl('ellipse', {
        cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2),
        fill: scleraFill, stroke: withAlpha(INK, 0.2), 'stroke-width': SW.hairline
    });

    // Лопнувшие сосудики вместо ресничек/румян — не милота, а нездоровый вид.
    const veins = buildEyeVeins(`${instanceId}-${eyeKey}`, rx, ry);

    const irisR = rx * 0.6;
    const irisGradId = `worm-eye-iris-${instanceId}-${eyeKey}`;
    const irisFill = ensureVolumeGradient(defs, irisGradId, eye.color, { cx: '40%', cy: '35%', r: '80%', highlight: 0.4, shadow: -0.35 });
    const iris = svgEl('circle', { cx: 0, cy: 0, r: irisR.toFixed(2), fill: irisFill });
    // Лимб — тёмное кольцо по краю радужки. Дешёвая деталь, но именно она
    // отличает живой глаз от плоского кружка: без неё радужка сливается со
    // склерой и взгляд выглядит нарисованным.
    const limbus = svgEl('circle', {
        cx: 0, cy: 0, r: (irisR * 0.94).toFixed(2), fill: 'none',
        stroke: mixColor(eye.color, INK, 0.55), 'stroke-width': (irisR * 0.22).toFixed(2), opacity: 0.55
    });
    const pupil = svgEl('circle', { cx: 0, cy: 0, r: (irisR * 0.62).toFixed(2), fill: INK });

    // Один скромный блик (не два "искрящихся", как у милого зверька).
    const highlight = svgEl('ellipse', {
        cx: (-irisR * 0.3).toFixed(2), cy: (-irisR * 0.32).toFixed(2),
        rx: (irisR * 0.22).toFixed(2), ry: (irisR * 0.16).toFixed(2),
        fill: SPEC, opacity: 0.5
    });

    // ---------- БРОВЬ ----------
    // Была дугой равномерной толщины (stroke-width 3.2, круглые колпачки,
    // чистый INK) — то есть жирным чёрным мазком одинаковой ширины по всей
    // длине. Такая линия не бывает у нарисованного от руки персонажа: у
    // живого штриха толщина МЕНЯЕТСЯ по длине, и именно это отличает
    // рисунок от клипарта. Плюс чистый INK делал бровь такой же тёмной, как
    // внешний контур, и она спорила с силуэтом за внимание.
    //
    // Теперь бровь — не обводка, а ЗАЛИТАЯ ФОРМА с сужением: толстая у носа,
    // сходящая в остриё к виску (так растёт настоящая бровь). Цвет —
    // осветлённый контурный тон, на ступень светлее силуэта.
    // ---------- ЧЕМ БРОВЬ ПРАВИТСЯ ----------
    // Долго в модели у брови был ОДИН угол, и в редакторе ползунок «брови»
    // не делал ничего: он был привязан к настроению, то есть к изгибу рта.
    // Бровь — половина мимики, и настраиваться она обязана тем же набором,
    // каким её описал бы человек: где сидит, насколько задрана, как изогнута
    // и насколько густая.
    const brow = eye.brow || {};
    const bLift = brow.lift != null ? brow.lift : 0;          // выше/ниже над глазом
    const bArcK = brow.arc != null ? brow.arc : 0.5;          // изгиб дуги
    const bThick = brow.thickness != null ? brow.thickness : 3.6;
    const browGroup = svgEl('g', {
        'data-part': `brow-${eyeKey}`,
        transform: `translate(0,${(-ry - 7 - bLift).toFixed(2)}) rotate(${(brow.angle || 0) * mirror})`,
        visibility: brow.visible === false ? 'hidden' : 'visible'
    });
    // s = 1 указывает НАРУЖУ (к виску), -s — к носу.
    const s = mirror;
    const bIn = -s * rx * 1.12;   // конец у носа — толстый
    const bOut = s * rx * 1.02;   // конец у виска — остриё
    const bArc = -rx * bArcK;     // высота подъёма дуги
    const bT = bThick;            // толщина у носового конца
    // Верхняя кромка брови как квадратичная кривая — её же потом
    // используем, чтобы САЖАТЬ щетинки точно на край, а не рядом.
    const bp0 = { x: bIn, y: 2.0 - bT * 0.5 };
    const bc  = { x: 0,   y: bArc - bT * 0.35 };
    const bp1 = { x: bOut, y: 1.0 };
    const browTop = (t) => {
        const u = 1 - t;
        return { x: u * u * bp0.x + 2 * u * t * bc.x + t * t * bp1.x,
                 y: u * u * bp0.y + 2 * u * t * bc.y + t * t * bp1.y };
    };
    // Касательная к той же кривой — нужна, чтобы волосок торчал ПОПЕРЁК
    // кромки, а не в случайную сторону.
    const browTangent = (t) => {
        const u = 1 - t;
        return { x: 2 * u * (bc.x - bp0.x) + 2 * t * (bp1.x - bc.x),
                 y: 2 * u * (bc.y - bp0.y) + 2 * t * (bp1.y - bc.y) };
    };
    // Носовой конец не обрублен вертикально: срез скруглён небольшой дугой,
    // выпуклой наружу. Прямой срез читается обрезком ленты, а не волосом.
    const capBulge = -s * bT * 0.55;
    const browShape = svgEl('path', {
        d: `M ${bp0.x.toFixed(2)},${bp0.y.toFixed(2)} ` +
           `Q ${bc.x.toFixed(2)},${bc.y.toFixed(2)} ${bp1.x.toFixed(2)},${bp1.y.toFixed(2)} ` +
           `Q 0,${(bArc + bT * 0.6).toFixed(2)} ${bIn.toFixed(2)},${(2.0 + bT * 0.5).toFixed(2)} ` +
           `Q ${(bIn + capBulge).toFixed(2)},${(2.0).toFixed(2)} ${bp0.x.toFixed(2)},${bp0.y.toFixed(2)} Z`,
        fill: inkSoftColor()
    });
    browGroup.appendChild(browShape);
    // Отдельные жёсткие волоски. Они РАСТУТ ИЗ кромки брови: точка посадки
    // берётся с самой кривой, направление — по нормали к ней, поэтому
    // волосок читается продолжением брови, а не царапиной рядом с ней.
    // Работают на образ: редкая грубая щетина неприятна сама по себе —
    // мерзость в детали при сохранённом милом силуэте (art-direction.md §1.3).
    const browRng = mulberry32(hashStringSeed(`brow-${instanceId}-${eyeKey}`));
    for (let i = 0; i < 3; i++) {
        const t = 0.2 + i * 0.28 + (browRng() - 0.5) * 0.12;
        const pt = browTop(t);
        const tg = browTangent(t);
        const len = Math.hypot(tg.x, tg.y) || 1;
        // Нормаль, развёрнутая вверх (от тела брови наружу).
        let nx = tg.y / len, ny = -tg.x / len;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const hair = 2.4 + browRng() * 2.6;
        // Лёгкий завал вдоль кромки, чтобы волоски не стояли частоколом.
        const skew = (browRng() - 0.5) * 0.5;
        browGroup.appendChild(svgEl('path', {
            d: `M ${pt.x.toFixed(2)},${(pt.y + 0.3).toFixed(2)} ` +
               `l ${((nx + tg.x / len * skew) * hair).toFixed(2)},${((ny + tg.y / len * skew) * hair).toFixed(2)}`,
            stroke: inkSoftColor(), 'stroke-width': SW.hairline,
            'stroke-linecap': 'round', fill: 'none'
        }));
    }

    // ---------- ВЕКО КАК ШТОРКА, ЖИВУЩАЯ ВНУТРИ ГЛАЗА ----------
    // Веко — не отдельный "нарост" сверху, а пластина, которая ЕДЕТ
    // (translate по Y) поперёк глаза. Видна только та её часть, что попадает
    // в clipPath по форме глаза.
    const clipId = `worm-eye-clip-${instanceId}-${eyeKey}`;

    const lidHeight = ry * 2 + 6;
    const lidGradId = `worm-eyelid-grad-${instanceId}-${eyeKey}`;
    const lidFill = ensureVolumeGradient(defs, lidGradId, FLESH[300], {
        cx: '50%', cy: '0%', r: '100%',
        highlight: 0.08, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.2, shadowTint: GRIME_SHADOW
    });
    const lidClipGroup = svgEl('g', { 'clip-path': `url(#${clipId})` });
    // lidTrack — единственный узел, который двигаем каждый кадр (translate);
    // сама пластина (lid) и складка (lidCrease) — его неподвижные дети.
    // Стартовое положение шторки задаётся СРАЗУ из модели: раньше оно
    // выставлялось только в tick() и только при opts.blink — на экранах с
    // выключенным морганием персонаж оставался с закрытыми глазами.
    const lidRest = clamp01(eye.eyelid ? eye.eyelid.level : 0);
    const lidTravel = 2 * ry + 5;
    const lidTrack = svgEl('g', {
        'data-part': `eyelid-${eyeKey}`,
        transform: `translate(0,${(-lidTravel * (1 - lidRest)).toFixed(2)})`
    });
    const lid = svgEl('rect', {
        x: (-rx - 3).toFixed(2), y: (-lidHeight / 2).toFixed(2),
        width: (rx * 2 + 6).toFixed(2), height: lidHeight.toFixed(2),
        fill: lidFill
    });
    const lidCrease = svgEl('line', {
        x1: (-rx).toFixed(2), y1: (lidHeight / 2).toFixed(2), x2: rx.toFixed(2), y2: (lidHeight / 2).toFixed(2),
        stroke: withAlpha(FLESH[900], 0.5), 'stroke-width': SW.detail
    });
    lidTrack.appendChild(lid);
    lidTrack.appendChild(lidCrease);
    lidClipGroup.appendChild(lidTrack);

    // ---------- НИЖНЕЕ ВЕКО: УЛЫБАЮЩИЙСЯ ГЛАЗ ----------
    // Вторая шторка, едущая СНИЗУ ВВЕРХ, с выгнутым вверх краем.
    //
    // Зачем отдельная деталь, если верхнее веко уже умеет прищуриваться:
    // прищур сверху и прищур снизу читаются по-разному. Опущенное верхнее
    // веко — это дрёма, усталость, самодовольство. Живую же улыбку поджимает
    // ПОДНЯВШАЯСЯ ЩЕКА, то есть нижний край, и глаз становится дугой,
    // выпуклой вверх. Без этой детали радостный прищур неизбежно выглядел
    // сонным, сколько его ни настраивай, — упирались в это дважды.
    //
    // Живёт в том же клипе по форме глаза, что и верхнее веко, поэтому
    // ничего не торчит за пределы глазного яблока.
    const smileArc = ry * 0.85;          // насколько край выгнут вверх
    const smileTravel = 2 * ry + 6;
    const smileTrack = svgEl('g', {
        'data-part': `eyesmile-${eyeKey}`,
        transform: `translate(0,${smileTravel.toFixed(2)})`   // 0 = убрано вниз
    });
    smileTrack.appendChild(svgEl('path', {
        d: `M ${(-rx - 3).toFixed(2)},0 ` +
           `Q 0,${(-smileArc).toFixed(2)} ${(rx + 3).toFixed(2)},0 ` +
           `L ${(rx + 3).toFixed(2)},${lidHeight.toFixed(2)} ` +
           `L ${(-rx - 3).toFixed(2)},${lidHeight.toFixed(2)} Z`,
        fill: lidFill
    }));
    // Складка по краю: без неё поднятая щека сливается со склерой и глаз
    // выглядит просто наполовину стёртым.
    smileTrack.appendChild(svgEl('path', {
        d: `M ${(-rx - 3).toFixed(2)},0 Q 0,${(-smileArc).toFixed(2)} ${(rx + 3).toFixed(2)},0`,
        fill: 'none', stroke: withAlpha(FLESH[900], 0.45), 'stroke-width': SW.detail
    }));
    lidClipGroup.appendChild(smileTrack);

    // Короткие редкие ресницы по верхнему веку — свиные, не кукольные.
    //
    // Длина считается ОТ РАЗМЕРА ГЛАЗА, а не абсолютным числом, и это не
    // придирка. Стояло 1.8–2.8 единицы, подобранных при глазе scale 0.95;
    // потом глаз уменьшили до 0.68 («мелкие глаза — признак свиньи, а не
    // собаки»), а ресницы остались прежними и стали занимать почти половину
    // его высоты. На морде это читалось не ресницами, а тёмными штрихами
    // поперёк глаза — то самое «полоски какие-то непонятные».
    //
    // Мораль общая: у детали, посаженной на часть тела, размер обязан быть
    // долей от этой части. Иначе первая же правка пропорций её ломает, причём
    // молча.
    const lashes = svgEl('g', { class: 'worm-eye-lashes' });
    for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const lx = (-0.85 + t * 1.7) * rx;
        const ly = -Math.sqrt(Math.max(0, 1 - (lx / rx) * (lx / rx))) * ry;
        const len = ry * (0.3 + 0.1 * (i % 2));
        lashes.appendChild(svgEl('path', {
            d: `M ${lx.toFixed(1)},${ly.toFixed(1)} l ${(lx * 0.12).toFixed(1)},${(-len).toFixed(2)}`,
            stroke: FLESH[900], 'stroke-width': SW.hairline, fill: 'none', opacity: 0.45, 'stroke-linecap': 'round'
        }));
    }

    // Складка верхнего века и морщинки у внешнего уголка — то, что делает
    // глаз посаженным в живую морду, а не приклеенным поверх неё.
    const eyeFolds = svgEl('g', { class: 'worm-eye-folds' });
    eyeFolds.appendChild(svgEl('path', {
        d: `M ${(-rx * 1.15).toFixed(1)},${(-ry * 0.85).toFixed(1)} ` +
           `Q 0,${(-ry * 1.7).toFixed(1)} ${(rx * 1.15).toFixed(1)},${(-ry * 0.85).toFixed(1)}`,
        fill: 'none', stroke: withAlpha(FLESH[700], 0.4), 'stroke-width': SW.detail, 'stroke-linecap': 'round'
    }));
    for (let i = 0; i < 2; i++) {
        const sx = mirror * rx * (1.15 + i * 0.16);
        eyeFolds.appendChild(svgEl('path', {
            d: `M ${sx.toFixed(1)},${(ry * (0.1 + i * 0.28)).toFixed(1)} l ${(mirror * 3.2).toFixed(1)},${(1.6 + i * 1.4).toFixed(1)}`,
            fill: 'none', stroke: withAlpha(FLESH[700], 0.3), 'stroke-width': SW.hairline, 'stroke-linecap': 'round'
        }));
    }

    // Радужка, лимб, зрачок и блик — в одной группе: взгляд двигается
    // переносом ЭТОЙ группы, а не четырёх элементов по отдельности (и не
    // ценой пересборки SVG).
    // Клип по форме глаза заводим ДО первого использования: по нему
    // обрезаются и веко-шторка, и тень от верхнего века.
    const clipPath = svgEl('clipPath', { id: clipId });
    clipPath.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
    group.appendChild(clipPath);

    const gazeGroup = svgEl('g', { 'data-part': `gaze-${eyeKey}` });
    gazeGroup.appendChild(iris);
    gazeGroup.appendChild(limbus);
    gazeGroup.appendChild(pupil);
    gazeGroup.appendChild(highlight);

    group.appendChild(socket);
    group.appendChild(browShadow);
    group.appendChild(sclera);
    group.appendChild(veins);
    group.appendChild(gazeGroup);
    group.appendChild(svgEl('ellipse', {
        cx: 0, cy: (-ry * 1.05).toFixed(2), rx: (rx * 1.05).toFixed(2), ry: (ry * 0.75).toFixed(2),
        fill: withAlpha(INK, 0.3), 'clip-path': `url(#worm-eye-clip-${instanceId}-${eyeKey})`
    }));
    group.appendChild(lidClipGroup);
    group.appendChild(lashes);
    group.appendChild(eyeFolds);
    group.appendChild(browGroup);

    // phi/offsetY/xLimitBase нужны, чтобы пересчитать посадку глаза при
    // ЖИВОМ повороте головы, не пересобирая его внутренности.
    return { group, sclera, iris, pupil, gazeGroup, lidTrack, smileTrack, smileTravel,
             browGroup, rx, ry, lidHeight,
             // Для подбора брови при повороте: её наружный конец и высота, на
             // которой он стоит, в координатах головы.
             browOut: bOut, browIn: bIn, browTipY: -ry - 7 - bLift + bp1.y,
             browAngle: (brow.angle || 0) * mirror,
             browBaseY: -ry - 7 - bLift, browMirror: mirror,
             // Живые каналы брови и подбор по контуру живут в РЕФЕ, а
             // трансформ собирает одна функция (applyBrowTransform): пока
             // его писали в двух местах, кадровый цикл каждый кадр затирал
             // и подбор, и высоту брови из модели.
             browSqueeze: 1, browShift: 0, browRaise: 0,
             yawPhi: phi, offsetY: y, baseRx: rx };
}

// ---------- ПОСТРОЕНИЕ РТА: ЕДИНАЯ ПРОЦЕДУРНАЯ ФОРМА, ЖИВАЯ КАЖДЫЙ КАДР ----------
// Идея формы: круг, где кайма — губы, заливка — тёмная ротовая полость.
// Геометрия пересчитывается КАЖДЫЙ КАДР в tick() из bend/gap — как и
// раздутие живота, это "живой" параметр, управляемый через
// handle.setLivePose({ mouthOpenness }) БЕЗ пересборки всего SVG.
function buildMouthShapes(mouthAnchor, mouth, instanceId) {
    // Половина ширины рта в уголках. Была 8.6 — рот выходил мелким, и на
    // телефоне его кривизна не читалась вовсе: мимика держалась на одних
    // ушах и бровях, а улыбки видно не было. Чем шире рот, тем на большем
    // расстоянии расходятся его уголки при том же изгибе, — то есть ширина
    // и есть главный рычаг «видно эмоцию или нет».
    const W = WormSilhouette.face.mouthHalf;
    const MAX_GAP = 10;  // при полном открытии (gap==W) рот примерно круглый

    // Линия губ чуть толще обычной внутренней границы (structure = 1.7).
    // Это осознанное отступление в пределах иерархии линий: губа — главная
    // внутренняя линия лица, на ней держится всё выражение. Контур силуэта
    // (2.6) она при этом не догоняет — иначе деталь начнёт спорить с
    // силуэтом, а это прямо запрещено (art-direction.md §4).
    const mouthShape = svgEl('path', {
        d: '', fill: VISCERA[700], stroke: mouth.color,
        'stroke-width': (SW.structure * 1.25).toFixed(2),
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    });
    mouthAnchor.appendChild(mouthShape);

    const mouthClipId = `worm-mouth-clip-${instanceId}`;
    const mouthClipPath = svgEl('clipPath', { id: mouthClipId });
    const mouthClipShape = svgEl('path', { d: '' });
    mouthClipPath.appendChild(mouthClipShape);
    mouthAnchor.appendChild(mouthClipPath);

    // Кривые, неровные зубы — видны только когда рот заметно приоткрыт.
    const teethGroup = svgEl('g', { class: 'worm-teeth', 'clip-path': `url(#${mouthClipId})`, visibility: 'hidden' });
    const toothRng = mulberry32(hashStringSeed(`${instanceId}-teeth`));
    const teeth = [];
    const toothCount = 3;
    for (let i = 0; i < toothCount; i++) {
        const t = (i + 0.5) / toothCount; // 0..1 слева направо
        const tx = (-W * 0.9) + t * (W * 1.8);
        const jitter = (toothRng() - 0.5) * 2.4;
        const hBase = 4 + toothRng() * 2;
        const tw = 2.2 + toothRng() * 1.2;
        const toothEl = svgEl('path', { d: '', fill: BILE[200] });
        teethGroup.appendChild(toothEl);
        teeth.push({ el: toothEl, tx, jitter, hBase, tw });
    }
    mouthAnchor.appendChild(teethGroup);

    // ---------- ЖИДКОСТЬ ВО РТУ ----------
    // Часть САМОГО РТА, а не наклейка поверх морды. Пока лужица рисовалась
    // мини-игрой в своём слое, её приходилось заново наводить на рот после
    // каждого переезда камеры, она не размывалась вместе с персонажем и при
    // любом промахе висела на щеке.
    //
    // Обрезка — тем же контуром рта, что и зубы: лужица физически не может
    // вылезти за губы, как бы её ни налили. Пустая — прозрачная и не мешает
    // никому; цвет и уровень задаются живым каналом (mouthFill,
    // mouthFillColor), поэтому годится на любую жидкость в любой мини-игре.
    const liquid = svgEl('path', {
        class: 'worm-mouth-liquid', d: '', fill: 'none',
        'clip-path': `url(#${mouthClipId})`, opacity: 0
    });
    mouthAnchor.appendChild(liquid);

    return { mouthShape, mouthClipShape, teethGroup, teeth, liquid, W, MAX_GAP };
}

// Пересчитывает форму рта (и зубов) из bend/gap.
//
// ---------- ПОЧЕМУ НЕ ОВАЛ ----------
// Раньше рот был овалом с разными радиусами сверху и снизу: при улыбке
// верхний радиус обнулялся, и ВЕРХНЯЯ ГУБА ПРЕВРАЩАЛАСЬ В ПРЯМУЮ ЛИНИЮ.
// Гнулась только нижняя кромка, а сверху рот оставался обрубленным по
// горизонтали. Именно поэтому улыбка читалась «чем-то средним»: половина
// рта в ней не участвовала.
//
// Теперь рот строится вокруг ИЗОГНУТОЙ СРЕДНЕЙ ЛИНИИ. Обе губы — это одна и
// та же дуга, разведённая вверх и вниз на величину открытия, поэтому гнутся
// они одинаково и всегда согласованно. Уголки при этом общие для обеих губ:
// рот раскрывается в середине, а его углы остаются сколотыми — как у
// настоящего рта.
//
// Закрытый рот (gap = 0) даёт нулевую площадь, и от него остаётся ровно
// обводка — изогнутая линия губ. Отдельной ветки «нарисовать линию вместо
// фигуры» не нужно.
function mouthBendFromCurve(curve) {
    return 7 * curve;
}

// Сагитта квадратичной кривой равна половине смещения контрольной точки,
// поэтому всюду ниже смещения удваиваются.
// Уровень жидкости во рту. Считается ПО ТОЙ ЖЕ полости, что нарисована:
// заливка идёт снизу вверх от нижней губы, а лишнее срезает обрезка ртом.
function updateMouthLiquid(mouthBuilt, fill, color, top, bottom) {
    const el = mouthBuilt.liquid;
    if (!el) return;
    const k = Math.max(0, Math.min(1, fill || 0));
    if (k <= 0.001 || bottom - top <= 0.5) {
        setAttr(el, 'opacity', '0');
        setAttr(el, 'd', '');
        return;
    }
    const W = mouthBuilt.W + 4;
    const y = bottom - k * (bottom - top);
    setAttr(el, 'fill', color || '#ffffff');
    setAttr(el, 'opacity', '1');
    setAttr(el, 'd', `M ${-W},${y.toFixed(2)} L ${W},${y.toFixed(2)} ` +
                         `L ${W},${(bottom + 4).toFixed(2)} ` +
                         `L ${-W},${(bottom + 4).toFixed(2)} Z`);
}

function updateMouthGeometry(mouthBuilt, bend, gap, fill, color) {
    const W = mouthBuilt.W;

    // Дуга симметрична относительно точки крепления: уголки уходят вверх,
    // середина вниз. Так улыбка не «съезжает» с лица вниз по мере усиления,
    // а раскрывается вокруг своего места.
    const cornerY = -bend * 0.45;
    const midY = bend * 0.55;
    const ctrlY = 2 * midY - cornerY;      // контрольная точка средней линии

    const gapTop = gap * MOUTH_EGG_TOP;
    const gapBottom = gap * MOUTH_EGG_BOTTOM;

    const d = `M ${(-W).toFixed(2)},${cornerY.toFixed(2)} ` +
        `Q 0,${(ctrlY - 2 * gapTop).toFixed(2)} ${W.toFixed(2)},${cornerY.toFixed(2)} ` +
        `Q 0,${(ctrlY + 2 * gapBottom).toFixed(2)} ${(-W).toFixed(2)},${cornerY.toFixed(2)} Z`;
    setAttr(mouthBuilt.mouthShape, 'd', d);
    setAttr(mouthBuilt.mouthClipShape, 'd', d);

    // Крайние точки полости: у квадратичной кривой это её середина, то есть
    // ровно midY ∓ зазор. Отсюда и берётся, докуда наливать.
    updateMouthLiquid(mouthBuilt, fill, color, midY - gapTop, midY + gapBottom);

    if (gap > 2) {
        setAttr(mouthBuilt.teethGroup, 'visibility', 'visible');
        // Зубы растут от ВЕРХНЕЙ ГУБЫ, а она теперь изогнута — значит и
        // посадка каждого зуба считается по кривой, а не по одной высоте на
        // всех. Иначе крайние зубы висят в воздухе, а средние тонут в губе.
        mouthBuilt.teeth.forEach(t => {
            const u = Math.max(-1, Math.min(1, t.tx / W));
            const s = (u + 1) / 2;                       // 0..1 вдоль рта
            const lipY = (1 - s) * (1 - s) * cornerY +
                         2 * (1 - s) * s * (ctrlY - 2 * gapTop) +
                         s * s * cornerY;
            const toothH = Math.min(gap * 0.85, t.hBase);
            const topY = lipY + 1;
            setAttr(t.el, 'd',
                `M ${(t.tx - t.tw / 2).toFixed(1)},${topY.toFixed(1)} ` +
                `L ${(t.tx + t.tw / 2 + t.jitter).toFixed(1)},${topY.toFixed(1)} ` +
                `L ${(t.tx + t.jitter * 0.4).toFixed(1)},${(topY + toothH).toFixed(1)} Z`);
        });
    } else {
        setAttr(mouthBuilt.teethGroup, 'visibility', 'hidden');
    }
}

// ---------- ПЕРЕХОД ЧЕРВЬ → СВИНАЯ ГОЛОВА ----------
// Задача: чтобы не читалось как "два разных персонажа, состыкованных
// встык". Переход собран из четырёх согласованных вещей:
//   1) цвет: сегмент-1 и сегмент-2 подмешаны к цвету головы (skin.neckBlend)
//      — кожа плавно "розовеет" к голове, а не меняется скачком;
//   2) низ головы: градиентная юбка цветом шеи — граница черепа и тела
//      растворяется, голова выглядит выросшей из тела;
//   3) свиные признаки убывают вниз по телу: складки и щетина есть на
//      голове и сегменте-1, слабее на сегменте-2, дальше их нет;
//   4) червячные признаки убывают вверх: кольцевые бороздки идут по всему
//      телу, у шеи слабеют, а поясок-клителлум на сегменте-2 работает
//      "воротником" — естественной границей между двумя типами кожи.
// Пятачок при этом читается как передний конец ЧЕРВЯ (радиальные морщинки
// вокруг него — как у ротового конца), а не как приклеенная деталь свиньи.
function buildHeadNeckTransition(ctx, headRx, headRy, neckColor, skullClipId) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;
    // Клип по силуэту черепа. Без него "юбка" перехода выступает ниже
    // головы и увеличивает её bbox — а на bbox головы завязана раскладка
    // Чревоугодия (кастрюля ставится строго над макушкой). Косметика не
    // имеет права менять измеримые габариты частей: это ровно тот класс
    // поломок, которые проявляются не тут, а в чужой мини-игре.
    //
    // Обрезка идёт по ЖИВОМУ силуэту черепа, а не по вписанному эллипсу.
    // Эллипс был симметричным и неподвижным, а повёрнутый череп — ни то,
    // ни другое: юбка вылезала за контур светлым туманом с той стороны, где
    // череп уже. Ровно та же беда, из-за которой существует этот файл:
    // двух описаний одной формы не бывает, одно обязательно врёт.
    const clipId = skullClipId || `worm-neck-clip-${ctx.instanceId}`;
    if (!skullClipId && !ctx.gradCache[clipId]) {
        const clip = svgEl('clipPath', { id: clipId });
        clip.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: headRx.toFixed(2), ry: headRy.toFixed(2) }));
        ctx.defs.appendChild(clip);
        ctx.gradCache[clipId] = true;
    }
    const group = svgEl('g', { class: 'worm-neck-blend', 'clip-path': `url(#${clipId})` });
    const gid = `worm-neck-grad-${ctx.instanceId}`;
    if (!ctx.gradCache[gid]) {
        const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': neckColor, 'stop-opacity': '0' }));
        grad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': neckColor, 'stop-opacity': '0.35' }));
        grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': neckColor, 'stop-opacity': '0.8' }));
        ctx.defs.appendChild(grad);
        ctx.gradCache[gid] = true;
    }
    // Габариты юбки заведомо внутри черепа (низ на 0.93*ry): clip-path
    // Chromium'ом в getBoundingClientRect() НЕ учитывается, поэтому одного
    // клипа мало — геометрия тоже должна помещаться внутрь головы, иначе
    // измеренный bbox головы вырастет, даже если визуально всё обрезано.
    group.appendChild(svgEl('ellipse', {
        cx: 0, cy: (headRy * 0.48).toFixed(1),
        rx: (headRx * 0.86).toFixed(1), ry: (headRy * 0.45).toFixed(1),
        fill: `url(#${gid})`
    }));
    return group;
}

// ---------- ДЕТАЛИЗАЦИЯ МОРДЫ ----------
// Складки лба, вибриссы, тень у основания ушей. Всё внутри клипа по черепу:
// ни одна деталь не имеет права выйти за габарит головы, потому что по её
// bbox Чревоугодие ставит кастрюлю над макушкой.
function buildHeadDetailLayer(ctx, rx, ry, skullPathD, skullClipId) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;
    const coat = anatomy.coat || {};
    const folds = coat.folds != null ? coat.folds : 0.5;
    const bristle = coat.bristle != null ? coat.bristle : 0.45;
    const rng = anatRng(anatomy, 'head', 'detail');

    // Своя копия контура здесь была бы ВТОРЫМ его описанием, причём
    // застывшим на момент сборки: живой поворот переписывает череп, а копия
    // остаётся прежней, и складки со щетиной обрезаются по форме, которой на
    // экране уже нет. Берём ЖИВОЙ клип, если он есть.
    const clipId = skullClipId || `worm-head-detail-clip-${ctx.instanceId}`;
    if (!skullClipId && !ctx.gradCache[clipId]) {
        const clip = svgEl('clipPath', { id: clipId });
        // Клип по РЕАЛЬНОМУ силуэту черепа, а не по вписанному эллипсу:
        // иначе складки и щетина обрезались бы по чужой форме.
        clip.appendChild(skullPathD ? svgEl('path', { d: skullPathD })
                                    : svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
        ctx.defs.appendChild(clip);
        ctx.gradCache[clipId] = true;
    }
    const group = svgEl('g', { class: 'worm-head-detail', 'clip-path': `url(#${clipId})` });

    // Тень у основания ушей — уши растут ИЗ головы, а не приставлены к ней.
    const shadeFill = ensureSoftGradient(ctx, `worm-head-earshade-${ctx.instanceId}`, GRIME_SHADOW, 1);
    [-1, 1].forEach(side => {
        group.appendChild(svgEl('ellipse', {
            cx: (side * rx * 0.58).toFixed(1), cy: (-ry * 0.56).toFixed(1),
            rx: (rx * 0.28).toFixed(1), ry: (ry * 0.18).toFixed(1),
            fill: shadeFill, opacity: 0.35
        }));
    });

    // Складки лба — две несимметричные дуги над бровями.
    // Одна пара дуг вместо двух: лоб небольшой, две пары на нём читаются
    // штриховкой, а не складками.
    if (folds > 0.01) {
        for (let i = 0; i < 1; i++) {
            const y = -ry * (0.52 + i * 0.12);
            const w = rx * (0.4 - i * 0.07);
            const shift = (rng() - 0.5) * rx * 0.12;
            group.appendChild(svgEl('path', {
                d: `M ${(-w + shift).toFixed(1)},${y.toFixed(1)} Q ${shift.toFixed(1)},${(y - ry * 0.09).toFixed(1)} ${(w + shift).toFixed(1)},${y.toFixed(1)}`,
                fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': SW.detail,
                opacity: (0.14 * folds).toFixed(3), 'stroke-linecap': 'round'
            }));
            group.appendChild(svgEl('path', {
                d: `M ${(-w + shift).toFixed(1)},${(y + 1.6).toFixed(1)} Q ${shift.toFixed(1)},${(y - ry * 0.09 + 1.6).toFixed(1)} ${(w + shift).toFixed(1)},${(y + 1.6).toFixed(1)}`,
                fill: 'none', stroke: GRIME_HIGHLIGHT, 'stroke-width': SW.hairline,
                opacity: (0.1 * folds).toFixed(3), 'stroke-linecap': 'round'
            }));
        }
    }

    // ---------- ВИБРИССЫ УБРАНЫ НАМЕРЕННО ----------
    // Были четыре длинных волоска по щекам. Убраны по тому же правилу, что и
    // складки: на лице в размер экрана это не волоски, а четыре диагональные
    // царапины. Отличить одно от другого невозможно — значит рисовать нечего.
    // Переменная bristle осталась: щетина по-прежнему идёт по телу.

    return group;
}

// ---------- ПОСТРОЕНИЕ ГОЛОВЫ (уши, пятачок, рот, глаза) ----------
// ---------- ФОРМА ЧЕРЕПА ----------
// Голова перестала быть кругом. У свиньи череп спереди читается так: широкий
// лоб между ушами → самые широкие точки на скулах → сужение к челюсти →
// выступающая вперёд-вниз морда с плоским пятачком на конце. Форма собрана
// кубическими кривыми и симметрична; все пропорции — параметры модели
// (`head.skull`), а не числа в коде, поэтому череп можно менять под возраст,
// породу или настроение, не трогая рендерер.
// Контур черепа. Сами кривые живут в `worm-silhouette.js` — ОДНИМ описанием
// на рисование и на размещение отметин. Пока описаний было два (кривые здесь,
// вписанный круг там), шрамы честно влезали в круг и висели в воздухе рядом с
// головой: круг шире черепа у лба и у подбородка (docs/traps.md, п. 103).
function skullPathData(rx, ry, p, yaw) {
    return WormSilhouette.skullPath(rx, ry, p, yaw);
}

// ---------- ПОСТРОЕНИЕ ГОЛОВЫ (череп, морда, уши, пятачок, рот, глаза) ----------
function buildHeadNode(model, ctx) {
    const head = model.head;
    const anatomy = ctx.anatomy;
    const skullCfg = head.skull || {};
    // Поворот головы. 0 = анфас (прежнее поведение до пикселя),
    // 1 = YAW_MAX_DEG градусов вправо. См. блок «ПОВОРОТ ГОЛОВЫ» выше.
    const headYaw = Math.max(-1, Math.min(1, head.yaw != null ? head.yaw : 0));
    // Насколько пятачок и морда выступают вперёд относительно черепа —
    // объявлено здесь, потому что морда строится раньше пятачка, а обе
    // черты обязаны ехать по одному и тому же выступу.
    const SNOUT_PROTRUDE = 0.34;
    // Группа наклона: весь набор частей головы висит в ней, чтобы мимический
    // наклон (livePose.headTilt) поворачивал голову целиком вокруг основания
    // шеи, а не каждую деталь по отдельности.
    const group = svgEl('g', { 'data-part': 'head' });
    // Зеркало головы — ОТДЕЛЬНОЙ обёрткой между group и tiltGroup, и это не
    // придирка: transform у group переписывает покачивание (idleWave), у
    // tiltGroup — наклон головы. Обе крутятся каждый кадр, и зеркало на
    // любой из них жило бы ровно до первого кадра.
    //
    // Отражение вокруг СОБСТВЕННОГО нуля головы: там же сидит и шея, и
    // ось рта, поэтому голова разворачивается на месте, а не съезжает с
    // тела. Меняются местами ровно те черты, которые и должны, — выступ
    // пятачка, переднее ухо, блики в глазах.
    const flipGroup = ctx.headFlip
        ? svgEl('g', { 'data-part': 'head-face', transform: 'scale(-1,1)' })
        : null;
    const tiltGroup = svgEl('g', { 'data-part': 'head-tilt' });
    if (flipGroup) { group.appendChild(flipGroup); flipGroup.appendChild(tiltGroup); }
    else group.appendChild(tiltGroup);

    // Радиусы — из worm-silhouette.js, а не тремя строчками здесь: их же
    // спрашивает инспектор, когда считает, где на экране скула.
    const { rx, ry } = WormSilhouette.headRadii(head);
    const skullD = skullPathData(rx, ry, skullCfg, headYaw);

    const headGradId = `worm-head-grad-${ctx.instanceId}`;
    const headFill = ensureVolumeGradient(ctx.defs, headGradId, head.fill, {
        cx: '38%', cy: '26%', r: '88%',
        highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.34, shadowTint: GRIME_SHADOW
    });
    // Класс на силуэте — чтобы прогон мог спросить «внутри ли шрам»
    // у САМОГО контура, а не угадывать его первым path в группе.
    const skull = svgEl('path', { class: 'worm-part-shape', d: skullD, fill: headFill, stroke: head.stroke, 'stroke-width': SW.contour, 'stroke-linejoin': 'round' });

    // Клип по РЕАЛЬНОЙ форме черепа: все слои кожи, складки и щетина
    // обрезаются силуэтом головы, а не вписанным эллипсом.
    const skullClipId = `worm-skull-clip-${ctx.instanceId}`;
    // Ссылку на путь клипа держим: при живом повороте череп становится
    // асимметричным, и обрезка обязана ехать вместе с ним — иначе слои кожи
    // и рот будут обрезаться по форме, которой на экране уже нет.
    let skullClipShape = null;
    if (!ctx.gradCache[skullClipId]) {
        const clip = svgEl('clipPath', { id: skullClipId });
        skullClipShape = svgEl('path', { d: skullD });
        clip.appendChild(skullClipShape);
        ctx.defs.appendChild(clip);
        ctx.gradCache[skullClipId] = skullClipShape;
    } else if (ctx.gradCache[skullClipId] instanceof Object) {
        skullClipShape = ctx.gradCache[skullClipId];
    }

    // ---------- БЛИК НА ЧЕРЕПЕ ----------
    // Стоял НЕПОДВИЖНО и БЕЗ ОБРЕЗКИ. Две беды сразу:
    //   • голова поворачивается, а блик остаётся на месте — то есть свет
    //     будто прилеплен к экрану, а не лежит на поверхности. Всё
    //     остальное на коже (шрамы, глаза, морщины) при повороте едет;
    //   • череп при повороте асимметричен и с одной стороны уже, а блик
    //     этого не знал и вылезал за контур светлым туманом.
    // Теперь он едет по той же поверхности, что и черты лица, и обрезан
    // ЖИВЫМ силуэтом черепа.
    const HEAD_SHINE_PHI = -20;            // азимут блика от плоскости лица
    const headShine = svgEl('ellipse', {
        cx: (-rx * 0.28).toFixed(2), cy: (-ry * 0.52).toFixed(2),
        rx: (rx * 0.3).toFixed(2), ry: (ry * 0.16).toFixed(2),
        fill: SPEC, opacity: 0.16,
        'clip-path': `url(#${skullClipId})`
    });

    // ---------- УШИ ----------
    // Крепятся к верхним углам черепа и по умолчанию развёрнуты наружу:
    // у свиньи уши стоят домиком, а не торчат строго вверх. Базовый разворот
    // живёт в рендерере, а `ear.rotation` из модели прибавляется к нему —
    // так прижатые уши (отрицательный угол) остаются рабочим состоянием.
    // Наклон посадки. Было 27° — уши вставали торчком в стороны и вместе с
    // узкой треугольной формой давали кошачий силуэт.
    const EAR_BASE_TILT = 30;
    // Отдельная ручка габарита уха: форму задаёт earPathData, размер — здесь.
    //
    // История значения важна, чтобы его случайно не «починили» обратно.
    // Стояло 0.82 — я уменьшил ухо, посчитав, что клин перелетел в летучую
    // мышь. Но это значение НИКОГДА не доезжало до экрана: tick() каждый
    // кадр пересобирал трансформ уха из earRefs, где лежал только
    // ear.scale*stretchX, и калибровка терялась через кадр после сборки.
    // То есть согласованный размер уха — это размер БЕЗ калибровки.
    // Баг с потерей трансформа исправлен, а множитель приведён к тому, что
    // реально было на экране и было одобрено.
    const EAR_FORM_SCALE = 1;
    const earsGroup = svgEl('g', { 'data-part': 'ears' });
    // ---------- КУДА КЛАСТЬ БЛИЖНЕЕ УХО ----------
    // Уши лежали ОДНОЙ группой в самом низу стопки, то есть всегда ЗА
    // головой. При анфасе это верно: уши растут из боков черепа и их корни
    // прячутся за ним. Но при полном развороте ближнее ухо выходит вперёд —
    // оно физически ближе к зрителю, чем скула, — а оно продолжало торчать
    // из-за затылка, и голова читалась вывернутой наизнанку.
    //
    // Поэтому групп ДВЕ: одна под головой, другая поверх её массы. Сам узел
    // уха переезжает между ними при живом повороте (applyHeadEarDepth) —
    // переезд стоит одной операции и только в момент смены стороны.
    const earsFront = svgEl('g', { 'data-part': 'ears-front' });
    const earRefs = {};
    ['left', 'right'].forEach(side => {
        const mirror = side === 'left' ? -1 : 1;
        const ear = head.ears[side];
        // Ухо сидит НА ЗАТЫЛОЧНОЙ стороне сферы: азимут считается от его
        // анфасного отступа, но с добавкой, отодвигающей ухо назад. Поэтому
        // при повороте дальнее ухо честно уезжает за череп, а ближнее
        // разворачивается к зрителю.
        // Насколько ухо отнесено назад от плоскости лица. Было 22°, что
        // вместе с собственным отступом ставило ухо на азимут ~73° — почти
        // у края сферы, где производная проекции максимальна: ближнее ухо
        // раздувалось, дальнее превращалось в лезвие. 12° делает реакцию
        // на поворот заметной, но не взрывной.
        const EAR_PHI_BACK = 12;
        const earPhi = yawAzimuth(mirror * rx * 0.78, rx) + mirror * EAR_PHI_BACK;
        const anchorY = -ry * EAR_Y_RATIO;
        // Радиус ГОРИЗОНТАЛЬНОГО СЕЧЕНИЯ черепа на высоте уха — по нему и
        // ездит корень при повороте (почему не по rx — см. skullHalfAtY).
        const earLatR = skullHalfAtY(rx, skullCfg, -EAR_Y_RATIO);
        // Вылет корня наружу от этого сечения подобран так, чтобы АНФАС не
        // сдвинулся ни на единицу: раньше якорь считался по rx, и (rx - latR)
        // — ровно та разница. Меняется только поведение при повороте.
        const earRootOut = (rx - earLatR) * Math.sin(earPhi * Math.PI / 180);
        // Ракурс уха: дальнее сплющивается, ближнее — почти нет.
        // Уху, наоборот, сокращаться можно сильно: у него нет внутренней
        // структуры, которую сплющивание сделало бы нечитаемой, а сильный
        // ракурс дальнего уха — самый дешёвый признак повёрнутой головы.
        const earPlace = earPlacement({ latR: earLatR, yawPhi: earPhi, rootOut: earRootOut, mirror }, headYaw);
        const anchorX = earPlace.x;
        const earYawSquash = earPlace.squash;
        const earBaseTilt = mirror * EAR_BASE_TILT;
        const baseAngle = earBaseTilt * (1 - EAR_EDGE_STRAIGHTEN * earPlace.edge) + ear.rotation;
        // Группа уха масштабируется, а значит масштабируется и её обводка.
        // Без компенсации контур уха уехал бы с лестницы толщин (2.6 * 0.82
        // = 2.13) и силуэт получил бы разную толщину линии на разных
        // участках — ровно тот дефект, который чинили в прошлый заход.
        const earSx = ear.scale * ear.stretchX * EAR_FORM_SCALE * earYawSquash;
        const earSy = ear.scale * ear.stretchY * EAR_FORM_SCALE;
        const earStrokeK = 2 / (Math.abs(earSx) + Math.abs(earSy) || 1);
        const earGroup = svgEl('g', {
            'data-part': `ear-${side}`,
            'data-anchor': `ear-${side}`,
            transform: `translate(${anchorX.toFixed(2)},${anchorY.toFixed(2)}) rotate(${baseAngle.toFixed(1)}) scale(${earSx.toFixed(3)},${earSy.toFixed(3)})`,
            visibility: ear.visible ? 'visible' : 'hidden'
        });
        const earGradId = `worm-ear-grad-${ctx.instanceId}-${side}`;
        const earFill = ensureVolumeGradient(ctx.defs, earGradId, ear.fill, {
            cx: mirror > 0 ? '35%' : '65%', cy: '30%', r: '85%',
            highlight: 0.2, highlightTint: GRIME_HIGHLIGHT,
            shadow: -0.32, shadowTint: GRIME_SHADOW
        });
        const earShape = svgEl('path', { d: earPathData(mirror, ear.form), fill: earFill, stroke: ear.stroke, 'stroke-width': (SW.contour * earStrokeK).toFixed(2), 'stroke-linejoin': 'round' });
        const earInner = svgEl('path', { d: earInnerPathData(mirror, ear.form), fill: mixColor(ear.fill, GRIME_SHADOW, 0.32), opacity: 0.6 });
        const earRidge = svgEl('path', {
            d: earInnerPathData(mirror, ear.form), fill: 'none',
            stroke: mixColor(ear.fill, GRIME_HIGHLIGHT, 0.55), 'stroke-width': (SW.detail * earStrokeK).toFixed(2), opacity: 0.45
        });
        earGroup.appendChild(earShape);
        earGroup.appendChild(earInner);
        earGroup.appendChild(earRidge);
        const vessels = buildEarVessels(ctx, mirror, side);
        if (vessels) earGroup.appendChild(vessels);
        // Щетина по краю раковины — у свиньи ухо опушено по контуру.
        if (anatomy.enabled && (anatomy.coat && (anatomy.coat.bristle || 0) > 0.01) && ear.visible) {
            const brng = anatRng(anatomy, `ear-${side}`, 'fringe');
            const fringe = svgEl('g', { class: 'worm-ear-fringe' });
            // Бахрома растёт ВНУТРЬ контура уха: любая деталь, торчащая
            // наружу, увеличивает измеримый габарит персонажа, а на него
            // завязаны раскладки мини-игр.
            for (let i = 0; i < 5; i++) {
                const t = i / 4;
                // Разброс по длине и завалу: ровный частокол одинаковых
                // штрихов читается хирургическим швом, а не щетиной.
                const bx = mirror * (-7 + t * 18), by = 1 - t * 19;
                const len = 1.6 + brng() * 2;
                fringe.appendChild(svgEl('path', {
                    d: `M ${bx.toFixed(1)},${by.toFixed(1)} l ${(-mirror * len * 0.6).toFixed(1)},${(-len).toFixed(1)}`,
                    stroke: GRIME_SHADOW, 'stroke-width': SW.hairline, fill: 'none',
                    opacity: (0.3 * anatomy.coat.bristle).toFixed(3), 'stroke-linecap': 'round'
                }));
            }
            earGroup.appendChild(fringe);
        }
        earsGroup.appendChild(earGroup);
        // ВАЖНО: в refs кладётся ПОЛНЫЙ масштаб — с калибровкой формы и с
        // ракурсным сжатием. Раньше тут лежал только ear.scale*stretchX, а
        // tick() каждый кадр переписывает этот трансформ целиком, поэтому
        // и калибровка, и сжатие терялись через кадр после сборки: на
        // замерах дальнее и ближнее ухо выходили одинаковой ширины при
        // явно повёрнутой голове.
        earRefs[side] = {
            group: earGroup, shape: earShape, inner: earInner,
            anchorX, anchorY, baseAngle,
            // Всё, что нужно earPlacement, чтобы пересчитать посадку на
            // повороте, лежит здесь: живой пересчёт обязан получить ровно те
            // же числа, из которых собрана исходная поза.
            yawPhi: earPhi, latR: earLatR, rootOut: earRootOut, mirror,
            baseTilt: earBaseTilt, ownRotation: ear.rotation,
            baseScaleX: ear.scale * ear.stretchX * EAR_FORM_SCALE,
            baseScaleY: ear.scale * ear.stretchY * EAR_FORM_SCALE,
            scaleX: earSx,
            scaleY: earSy
        };
    });

    // ---------- СЛОИ КОЖИ ГОЛОВЫ ----------
    const headAnat = buildAnatomyStack(ctx, 'head', {
        rx, ry, axis: 'x',
        organZone: null,
        muscle: false,
        clipPathData: skullD,
        clipId: skullClipId,
        // ---------- НА МОРДЕ НЕ РИСУЮТ ЛИНИЙ ----------
        // Складки и щетина здесь ВЫКЛЮЧЕНЫ, и это не экономия. Правило
        // сформулировано двумя абзацами ниже — «любая нарисованная линия на
        // морде читается царапиной», — но голова при этом заказывала себе
        // именно линии: одиннадцать штрихованных дуг поперёк щёк. Вместе с
        // вибриссами и сосудами они превращали лицо в кашу из царапин.
        //
        // Причина в разнице масштабов. Тело крупное и текстуру держит; лицо
        // на телефоне высотой в шесть десятков пикселей, и любая отдельная
        // отметина на нём становится СЧИТАЕМОЙ — то есть перестаёт быть
        // текстурой и начинает спорить с глазами и ртом за внимание.
        // Рельеф морде даёт затенение мягкими пятнами, а не штрихи.
        coat: { rings: false, folds: false, bristle: false }
    });

    // ---------- РЕЛЬЕФ ЧЕРЕПА ----------
    // Надбровные дуги, височные впадины, скулы и жевательная мышца. Всё
    // мягкими пятнами: любая нарисованная линия на морде читается царапиной.
    let skullShading = null;
    if (anatomy.enabled) {
        const taper = skullCfg.relief != null ? skullCfg.relief : ((anatomy.skeleton && anatomy.skeleton.headTaper != null) ? anatomy.skeleton.headTaper : 0.14);
        if (taper > 0.01) {
            const k = taper / 0.14;
            skullShading = svgEl('g', { class: 'worm-skull-shading', 'clip-path': `url(#${skullClipId})` });
            const shadowFill = ensureSoftGradient(ctx, `worm-head-cheek-${ctx.instanceId}`, GRIME_SHADOW, 1);
            const lightFill = ensureSoftGradient(ctx, `worm-head-light-${ctx.instanceId}`, GRIME_HIGHLIGHT, 1);
            [-1, 1].forEach(side => {
                // височная впадина
                // Височная впадина и скула слиты в ОДНО вытянутое пятно на
                // сторону, а не в два отдельных. Раньше рельеф собирали из
                // девяти самостоятельных эллипсов по 0.14–0.23 прозрачности,
                // и на морде в размер экрана они читались не объёмом, а
                // россыпью пятен — «синяками». Объём даёт ОДИН крупный
                // мягкий переход, а не набор мелких.
                skullShading.appendChild(svgEl('ellipse', {
                    cx: (side * rx * 0.64).toFixed(1), cy: (-ry * 0.2).toFixed(1),
                    rx: (rx * 0.34).toFixed(1), ry: (ry * 0.44).toFixed(1),
                    fill: shadowFill, opacity: (0.11 * k).toFixed(3)
                }));
                // Светлая грань скулы — там, куда падает верхний свет.
                skullShading.appendChild(svgEl('ellipse', {
                    cx: (side * rx * 0.5).toFixed(1), cy: (ry * 0.14).toFixed(1),
                    rx: (rx * 0.34).toFixed(1), ry: (ry * 0.3).toFixed(1),
                    fill: lightFill, opacity: (0.1 * k).toFixed(3)
                }));
            });
        }
    }

    // ---------- МОРДА (ROSTRUM) ----------
    // Отдельный объём, выступающий вперёд и вниз, а не пятачок, наклеенный на
    // плоское лицо. Собственная светлая грань сверху, тени по бокам и
    // контактная тень в месте, где морда выходит из черепа.
    const muzzleW = (skullCfg.muzzleWidth != null ? skullCfg.muzzleWidth : 0.46) * rx;
    const muzzleTop = ry * MUZZLE_TOP;
    const muzzleBottom = ry * MUZZLE_BOTTOM;
    // Доля вдоль морды → координата. Все её детали посажены через неё, а не
    // отдельными числами: иначе при следующем сдвиге черт лица они снова
    // разъедутся поодиночке, как уже было.
    const mz = (t) => muzzleTop + (muzzleBottom - muzzleTop) * t;
    // Морда — тот же выступающий объём, что и пятачок, и уезжает вместе с ним,
    // иначе пятак «отклеится» от своей опоры.
    const muzzleProj = yawProject(rx, 0, headYaw, SNOUT_PROTRUDE * 0.7);
    // ---------- КЛИП И ТРАНСФОРМ — НА РАЗНЫХ ГРУППАХ ----------
    // Это не стилистика, а обязательное разделение. В SVG clip-path
    // разрешается в системе координат элемента ПОСЛЕ его собственного
    // трансформа: повесить и то и другое на один узел — значит двигать клип
    // вместе с содержимым.
    //
    // Здесь это и происходило. Морда выступает вперёд, поэтому при повороте
    // головы уезжает вбок — при штатном ракурсе в три четверти на 17.75
    // единицы, — и клип по черепу уезжал вместе с ней. Морда обрезалась
    // силуэтом, сдвинутым относительно настоящего: справа вылезала за контур
    // головы, слева срезала лицо. На светлой комнате это стало видно как
    // прямоугольная кромка поперёк щеки.
    //
    // Внешняя группа несёт КЛИП и не двигается. Внутренняя несёт трансформ.
    const muzzleGroup = svgEl('g', {
        'data-part': 'muzzle', 'clip-path': `url(#${skullClipId})`
    });
    const muzzleShift = svgEl('g', {
        transform: `translate(${muzzleProj.x.toFixed(2)},0)`
    });
    muzzleGroup.appendChild(muzzleShift);
    const muzzleGradId = `worm-muzzle-grad-${ctx.instanceId}`;
    const muzzleFill = ensureVolumeGradient(ctx.defs, muzzleGradId, mixColor(head.fill, GRIME_HIGHLIGHT, 0.12), {
        cx: '42%', cy: '22%', r: '80%',
        highlight: 0.16, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.24, shadowTint: GRIME_SHADOW
    });
    const muzzleD = `M ${(-muzzleW * 1.22).toFixed(1)},${muzzleTop.toFixed(1)} ` +
        `C ${(-muzzleW * 1.3).toFixed(1)},${mz(0.44).toFixed(1)} ${(-muzzleW * 1.08).toFixed(1)},${mz(0.81).toFixed(1)} ${(-muzzleW * 0.86).toFixed(1)},${muzzleBottom.toFixed(1)} ` +
        `C ${(-muzzleW * 0.5).toFixed(1)},${mz(1.14).toFixed(1)} ${(muzzleW * 0.5).toFixed(1)},${mz(1.14).toFixed(1)} ${(muzzleW * 0.86).toFixed(1)},${muzzleBottom.toFixed(1)} ` +
        `C ${(muzzleW * 1.08).toFixed(1)},${mz(0.81).toFixed(1)} ${(muzzleW * 1.3).toFixed(1)},${mz(0.44).toFixed(1)} ${(muzzleW * 1.22).toFixed(1)},${muzzleTop.toFixed(1)} ` +
        `C ${(muzzleW * 0.7).toFixed(1)},${mz(-0.19).toFixed(1)} ${(-muzzleW * 0.7).toFixed(1)},${mz(-0.19).toFixed(1)} ${(-muzzleW * 1.22).toFixed(1)},${muzzleTop.toFixed(1)} Z`;
    // Морда не должна иметь резкой верхней границы — она не накладка, а
    // продолжение черепа: заливка приглушена, а стык с лицом растворяется
    // мягким пятном (см. следующий слой).
    muzzleShift.appendChild(svgEl('path', { d: muzzleD, fill: muzzleFill, opacity: 0.5 }));
    muzzleShift.appendChild(svgEl('ellipse', {
        cx: 0, cy: mz(0.01).toFixed(1),
        rx: (muzzleW * 1.5).toFixed(1), ry: (ry * 0.26).toFixed(1),
        fill: ensureSoftGradient(ctx, `worm-muzzle-blend-${ctx.instanceId}`, mixColor(head.fill, GRIME_HIGHLIGHT, 0.12), 1),
        opacity: 0.5
    }));
    // Тени по бокам морды — она отделяется от щёк.
    [-1, 1].forEach(side => {
        muzzleShift.appendChild(svgEl('ellipse', {
            cx: (side * muzzleW * 1.24).toFixed(1), cy: mz(0.5).toFixed(1),
            rx: (rx * 0.12).toFixed(1), ry: (ry * 0.34).toFixed(1),
            fill: ensureSoftGradient(ctx, `worm-muzzle-side-${ctx.instanceId}`, GRIME_SHADOW, 1),
            opacity: 0.35
        }));
    });
    // Светлая грань спинки морды.
    muzzleShift.appendChild(svgEl('ellipse', {
        cx: (-muzzleW * 0.18).toFixed(1), cy: mz(0.32).toFixed(1),
        rx: (muzzleW * 0.44).toFixed(1), ry: (ry * 0.3).toFixed(1),
        fill: ensureSoftGradient(ctx, `worm-muzzle-top-${ctx.instanceId}`, GRIME_HIGHLIGHT, 1),
        opacity: 0.22
    }));

    // ---------- ЧЕЛЮСТЬ ----------
    // Нижняя губа и подбородок вынесены в свою группу: при открывании рта она
    // опускается (см. tick), и морда открывается как челюсть, а не как дырка
    // в неподвижной коже.
    // Та же пара, что у морды: клип снаружи, трансформ внутри. Челюсть
    // опускается при открывании рта, и без разделения клип по черепу ехал бы
    // вниз вместе с ней.
    const jawGroup = svgEl('g', { 'data-part': 'jaw', 'clip-path': `url(#${skullClipId})` });
    const jawShift = svgEl('g');
    jawGroup.appendChild(jawShift);
    const jawFill = ensureSoftGradient(ctx, `worm-jaw-shade-${ctx.instanceId}`, GRIME_SHADOW, 1);
    jawShift.appendChild(svgEl('ellipse', {
        cx: 0, cy: mz(1.06).toFixed(1),
        rx: (muzzleW * 0.95).toFixed(1), ry: (ry * 0.16).toFixed(1),
        fill: jawFill, opacity: 0.3
    }));
    const lipColor = mixColor(head.mouth.color, head.fill, 0.35);
    const lowerLip = svgEl('path', {
        d: `M ${(-muzzleW * 0.78).toFixed(1)},${mz(1.08).toFixed(1)} Q 0,${mz(1.17).toFixed(1)} ${(muzzleW * 0.78).toFixed(1)},${mz(1.08).toFixed(1)}`,
        fill: 'none', stroke: lipColor, 'stroke-width': SW.structure, opacity: 0.5, 'stroke-linecap': 'round'
    });
    jawShift.appendChild(lowerLip);

    // ---------- ПЯТАЧОК ----------
    const snout = head.snout;
    // Высота из общей связки черт лица (SNOUT_Y): пятачок поднят, чтобы под
    // ним расчистить место широкому рту. Иначе рот подлезает прямо под него и
    // уголки теряются на фоне ноздрей — ровно то, ради чего рот и расширяли.
    const snoutY = ry * SNOUT_Y;
    const snoutRx = 14.5, snoutRy = 10.5;
    // Пятачок сидит на оси лица (азимут 0), но заметно ВЫСТУПАЕТ вперёд,
    // поэтому при повороте уезжает в сторону сильнее любой другой черты.
    // Именно ушедший с центра нос и сообщает глазу «это ракурс».
    const snoutProj = yawProject(rx, 0, headYaw, SNOUT_PROTRUDE);
    const snoutYawSquash = Math.max(0.55, Math.abs(snoutProj.squash));
    const snoutGroup = svgEl('g', {
        'data-part': 'snout',
        'data-anchor': 'snout',
        transform: `translate(${snoutProj.x.toFixed(2)},${snoutY.toFixed(2)}) scale(${(snout.scale * snout.stretchX * snoutYawSquash).toFixed(3)},${(snout.scale * snout.stretchY).toFixed(3)})`
    });
    const snoutGradId = `worm-snout-grad-${ctx.instanceId}`;
    const snoutFill = ensureVolumeGradient(ctx.defs, snoutGradId, snout.fill, {
        cx: '38%', cy: '28%', r: '82%',
        highlight: 0.22, highlightTint: GRIME_HIGHLIGHT,
        shadow: -0.34, shadowTint: GRIME_SHADOW
    });
    // Диск пятачка + мягкая тень под ним: он выступает вперёд, а не лежит
    // в плоскости морды.
    snoutGroup.appendChild(svgEl('ellipse', {
        cx: 0, cy: (snoutRy * 0.42).toFixed(1), rx: (snoutRx * 1.05).toFixed(1), ry: (snoutRy * 0.8).toFixed(1),
        fill: ensureSoftGradient(ctx, `worm-snout-shadow-${ctx.instanceId}`, GRIME_SHADOW, 1), opacity: 0.4
    }));
    const snoutShape = svgEl('ellipse', { cx: 0, cy: 0, rx: snoutRx, ry: snoutRy, fill: snoutFill, stroke: snout.stroke, 'stroke-width': SW.structure });
    const nostrilL = svgEl('ellipse', { cx: -4.8, cy: 0, rx: 2.3, ry: 3.4, fill: VISCERA[700], transform: 'rotate(-14 -4.8 0)' });
    const nostrilR = svgEl('ellipse', { cx: 4.8, cy: 0, rx: 2.3, ry: 3.4, fill: VISCERA[700], transform: 'rotate(14 4.8 0)' });
    const snoutShine = svgEl('ellipse', { cx: -4, cy: -4.6, rx: 4.6, ry: 2, fill: SPEC, opacity: 0.32 });
    const poreGroup = svgEl('g', { class: 'worm-snout-pores' });
    const poreRng = mulberry32(hashStringSeed(`${ctx.instanceId}-snout-pores`));
    // Пор было четырнадцать на пятачок размером 30×20, и вместе с семью
    // радиальными морщинками это давало девятнадцать отметин на пятачке —
    // не текстура, а сыпь. Восемь штук читаются порами, а не пересчитываются
    // глазом по одной.
    for (let i = 0; i < 8; i++) {
        const a = poreRng() * Math.PI * 2;
        const rr = Math.sqrt(poreRng()) * 0.86;
        const px = Math.cos(a) * snoutRx * rr, py = Math.sin(a) * snoutRy * rr;
        if (Math.abs(px) < 8 && Math.abs(py) < 4.5) continue;
        poreGroup.appendChild(svgEl('circle', {
            cx: px.toFixed(1), cy: py.toFixed(1), r: (0.5 + poreRng() * 0.5).toFixed(2),
            fill: mixColor(snout.fill, GRIME_SHADOW, 0.55), opacity: 0.3
        }));
    }
    const nostrilShade = svgEl('g');
    [[-4.8, -14], [4.8, 14]].forEach(([nx, rot]) => {
        nostrilShade.appendChild(svgEl('ellipse', {
            cx: nx, cy: 1, rx: 1.6, ry: 2.2, fill: INK, opacity: 0.75,
            transform: `rotate(${rot} ${nx} 0)`
        }));
    });
    // Вертикальная бороздка (philtrum) — она есть у каждой свиньи и сразу
    // читается как порода, а не как абстрактный кружок.
    const philtrum = svgEl('path', {
        d: `M 0,${(-snoutRy * 0.25).toFixed(1)} L 0,${(snoutRy * 0.95).toFixed(1)}`,
        stroke: mixColor(snout.fill, GRIME_SHADOW, 0.5), 'stroke-width': SW.detail, opacity: 0.5, fill: 'none'
    });
    snoutGroup.appendChild(snoutShape);
    snoutGroup.appendChild(poreGroup);
    snoutGroup.appendChild(snoutShine);
    snoutGroup.appendChild(nostrilL);
    snoutGroup.appendChild(nostrilR);
    snoutGroup.appendChild(nostrilShade);
    snoutGroup.appendChild(philtrum);
    if (anatomy.enabled && (anatomy.coat && (anatomy.coat.folds || 0) > 0.01)) {
        const rng = anatRng(anatomy, 'snout', 'radial');
        const wrinkles = svgEl('g', { class: 'worm-snout-wrinkles' });
        // Морщинок было шесть-восемь; на пятачке в размер экрана они
        // сливались с порами в общую рябь. Четыре читаются как расходящиеся
        // складки кожи — то, чем они и являются.
        const count = 4 + Math.floor(rng() * 2);
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rng() * 0.2;
            const r0 = snoutRx * 1.05, r1 = r0 + 2 + rng() * 2.2;
            wrinkles.appendChild(svgEl('path', {
                d: `M ${(Math.cos(a) * r0).toFixed(1)},${(Math.sin(a) * r0 * 0.72).toFixed(1)} ` +
                   `L ${(Math.cos(a) * r1).toFixed(1)},${(Math.sin(a) * r1 * 0.72).toFixed(1)}`,
                stroke: GRIME_SHADOW, 'stroke-width': SW.hairline, fill: 'none',
                opacity: (0.16 * anatomy.coat.folds).toFixed(3), 'stroke-linecap': 'round'
            }));
        }
        snoutGroup.appendChild(wrinkles);
    }

    // ---------- РОТ ----------
    const mouth = head.mouth;
    // Рот едет по той же выступающей морде, но его выступ МЕНЬШЕ, чем у
    // пятачка: пятачок — самая передняя точка, рот сидит под ним и ближе к
    // черепу. Плюс жёсткий ограничитель: на полном выступе линия рта
    // вылезала вбок за контур челюсти и висела в воздухе.
    const MOUTH_PROTRUDE = 0.08;
    const mouthProj = yawProject(rx, 0, headYaw, MOUTH_PROTRUDE);
    const mouthMaxX = rx * (skullCfg.muzzleWidth != null ? skullCfg.muzzleWidth : 0.46) * 0.45;
    const mouthYawX = Math.sign(mouthProj.x) * Math.min(Math.abs(mouthProj.x), mouthMaxX);
    const mouthYawSquash = Math.max(0.62, Math.abs(mouthProj.squash));
    const mouthAnchor = svgEl('g', {
        'data-part': 'mouth',
        'data-anchor': 'mouth',
        // Обрезка по черепу вместо подбора «правильного» ограничителя:
        // при любом повороте дальний конец губы честно уходит за скулу,
        // как и положено в ракурсе, вместо того чтобы висеть в воздухе
        // за контуром челюсти.
        'clip-path': `url(#${skullClipId})`,
        // Рот сидит ПОД ПЯТАКОМ, а не на самой нижней кромке черепа: на ry*1.0 он
        // сливался с контуром подбородка и просто исчезал из морды.
        transform: `translate(${mouthYawX.toFixed(2)},${(ry * MOUTH_Y).toFixed(2)}) scale(${(mouth.scale * mouth.stretchX * mouthYawSquash).toFixed(3)},${(mouth.scale * mouth.stretchY).toFixed(3)})`
    });
    const mouthBuilt = buildMouthShapes(mouthAnchor, mouth, ctx.instanceId);
    updateMouthGeometry(mouthBuilt, mouthBendFromCurve(mouth.curve),
        mouthBuilt.MAX_GAP * clamp01(mouth.openness || 0));

    // ---------- ГЛАЗА ----------
    // Обрезка по силуэту черепа. Бровь ШИРЕ глаза (её концы уходят к носу и
    // к виску), а к контуру прижимается только глаз — по своей полуширине.
    // На повороте наружный конец брови поэтому выезжал за голову и висел в
    // воздухе рядом с ухом. Черта лица не имеет права оказаться вне лица.
    const eyesGroup = svgEl('g', { 'data-part': 'eyes', 'clip-path': `url(#${skullClipId})` });
    // Полуширина черепа на высоте глаз (между виском и скулой) и с поправкой
    // на сужение повёрнутой стороны — она же служит ограничителем.
    const EYE_SURFACE_K = WormSilhouette.face.eyeSurfaceK;
    const eyeSurfaceRx = rx * EYE_SURFACE_K;
    const yawCtx = {
        yaw: headYaw,
        headRx: eyeSurfaceRx,
        rxHead: rx
    };
    const eyeLeft = buildEyeNode(model.eyes.left, -1, ctx.instanceId, 'left', ctx.defs, yawCtx);
    const eyeRight = buildEyeNode(model.eyes.right, 1, ctx.instanceId, 'right', ctx.defs, yawCtx);
    eyesGroup.appendChild(eyeLeft.group);
    eyesGroup.appendChild(eyeRight.group);

    const hatAnchor = svgEl('g', { 'data-anchor': 'head-top', transform: `translate(0,${(-ry * 1.1).toFixed(2)})` });

    // Порядок ЯВНЫЙ, снизу вверх: уши → череп → слои кожи → рельеф черепа →
    // переход в шею → морда → челюсть → блик → рот → пятачок → глаза →
    // мелкая детализация кожи → якорь шляпы.
    tiltGroup.appendChild(earsGroup);
    tiltGroup.appendChild(skull);
    if (headAnat) tiltGroup.appendChild(headAnat.group);
    if (skullShading) tiltGroup.appendChild(skullShading);
    if (ctx.neckColor) {
        const neck = buildHeadNeckTransition(ctx, rx, ry, ctx.neckColor, skullClipId);
        if (neck) tiltGroup.appendChild(neck);
    }
    // Ближнее ухо ложится ПОВЕРХ МАССЫ головы, но ПОД чертами лица: кожа,
    // рельеф и переход в шею оказываются за ним, а глаза, брови, пятачок и
    // рот — перед. Иначе развёрнутая голова теряет глаз: ухо своим полотном
    // заезжает на морду и закрывает его.
    tiltGroup.appendChild(earsFront);
    tiltGroup.appendChild(muzzleGroup);
    tiltGroup.appendChild(jawGroup);
    tiltGroup.appendChild(headShine);
    tiltGroup.appendChild(mouthAnchor);
    tiltGroup.appendChild(snoutGroup);
    tiltGroup.appendChild(eyesGroup);
    const headDetail = buildHeadDetailLayer(ctx, rx, ry, skullD, skullClipId);
    if (headDetail) tiltGroup.appendChild(headDetail);
    // ---------- КУДА КЛАСТЬ БЛИЖНЕЕ УХО ----------
    // Уши лежали ОДНОЙ группой в самом низу стопки, то есть всегда ЗА
    // головой. При анфасе это верно: уши растут из боков черепа и их корни
    // прячутся за ним. Но при развороте ближнее ухо выходит вперёд — оно
    // физически ближе к зрителю, чем скула, — а оно продолжало торчать
    // из-за затылка, и голова читалась вывернутой наизнанку.
    //
    // Поэтому групп ДВЕ: одна под головой, другая поверх лица. Сам узел уха
    // переезжает между ними при живом повороте (см. applyHeadEarDepth) —
    // переезд стоит одной операции и только в момент смены стороны.
    tiltGroup.appendChild(hatAnchor);

    const scarLayer = svgEl('g', { 'data-anchor': 'head-scars', class: 'worm-scar-layer' });
    tiltGroup.appendChild(scarLayer);

    const headRef = {
        group, tiltGroup, skull, ears: earRefs, snoutGroup,
        headShine, shinePhi: HEAD_SHINE_PHI, earsGroup, earsFront,
        muzzleGroup, muzzleShift, jawGroup, jawShift,
        mouth: mouthBuilt, mouthAnchor, skullClipShape, eyes: { left: eyeLeft, right: eyeRight },
        scarLayer, rx, ry, snoutY, anat: headAnat,
        fillColor: ctx.neckColor || head.fill,
        // ---------- ДАННЫЕ ДЛЯ ЖИВОГО ПОВОРОТА ----------
        // Всё, что нужно, чтобы пересчитать ракурс без пересборки головы.
        skullCfg,
        yaw: headYaw,
        eyeSurfaceRx,
        snoutProtrude: SNOUT_PROTRUDE,
        mouthProtrude: MOUTH_PROTRUDE,
        // Базовые (без ракурса) значения, от которых считается пересчёт.
        snoutX: snoutProj.x,
        snoutSquash: snoutYawSquash,
        muzzleX: muzzleProj.x,
        mouthX: mouthYawX,
        mouthSquash: mouthYawSquash,
        mouthBaseScale: { x: mouth.scale * mouth.stretchX, y: mouth.scale * mouth.stretchY }
    };

    // ---------- ТО ЖЕ САМОЕ НА СБОРКЕ ----------
    // Живой пересчёт (applyHeadYaw) выходит рано, когда ракурс не менялся, —
    // а голова ПЕРЕСОБИРАЕТСЯ уже повёрнутой: смена косметики, правка в
    // студии, открытие мини-игры. Тогда живой путь не срабатывает ни разу, и
    // всё, что он делает, на экран не попадает вовсе.
    //
    // Ровно на этом уже обжигались с калибровкой уха (см. EAR_FORM_SCALE):
    // значение месяц не доезжало до экрана. Поэтому глубина уха и подбор
    // брови зовутся и здесь, теми же функциями.
    applyHeadEarDepth(headRef, headYaw);
    ['left', 'right'].forEach(side => {
        const e = headRef.eyes[side];
        if (!e) return;
        applyBrowFit(headRef, e, WormSilhouette.eyePlace(e.yawPhi, headYaw, e.baseRx / rx), headYaw);
    });
    return headRef;
}

// ---------- БРОВЬ ПОДБИРАЕТСЯ, А НЕ ОБРУБАЕТСЯ ----------
// К контуру прижимается только ГЛАЗ — по своей полуширине (eyePlace). Бровь
// шире: её концы уходят к носу и к виску, и на повороте наружный конец
// выезжал за голову и висел в воздухе рядом с ухом.
//
// Обрезка силуэтом это прячет, но оставляет вертикальный срез поперёк
// брови — видно, что её отрубили. Поэтому бровь ещё и ПОДБИРАЕТСЯ: сжимается
// по горизонтали ровно настолько, чтобы её кончик остался внутри. Ширину
// спрашиваем у САМОГО контура (skullHalfWidth) — не у второй формулы,
// которая с ним разойдётся.
const BROW_TIP_PAD = 0.96;    // запас между кончиком брови и кромкой
const BROW_SQUEEZE_MIN = 0.4; // сильнее сжатая бровь читается обрубком

// ЕДИНСТВЕННОЕ место, где собирается трансформ брови. Слагаемых три:
// посадка из модели, живое «поднять бровь» и подбор по контуру. Пока их
// складывали в двух местах, кадровый цикл писал свою версию поверх — и
// высота брови из модели не доезжала до экрана вовсе, а подбор снимался
// через кадр после поворота.
function applyBrowTransform(e) {
    if (!e || !e.browGroup) return;
    const raise = e.browRaise || 0;
    const y = e.browBaseY - raise * 4;
    const a = e.browAngle - raise * 6 * (e.browMirror || 1);
    const k = e.browSqueeze != null ? e.browSqueeze : 1;
    const dx = e.browShift || 0;
    setAttr(e.browGroup, 'transform',
        `translate(${dx.toFixed(2)},${y.toFixed(2)}) rotate(${a.toFixed(2)})` +
        (Math.abs(k - 1) > 0.002 ? ` scale(${k.toFixed(3)},1)` : ''));
}

function applyBrowFit(headRef, e, place, yaw) {
    if (!e || !e.browGroup || !e.browOut) return;
    const rx = headRef.rx, ry = headRef.ry;
    const yNorm = (e.offsetY + e.browTipY) / ry;
    // Полоса, в которой на ЭТОЙ высоте вообще есть голова. При повороте она
    // несимметрична: одна половина черепа уже другой. Спрашиваем сам контур.
    const R = WormSilhouette.skullHalfWidth(yNorm, headRef.skullCfg, yaw, 1) * rx * BROW_TIP_PAD;
    const L = WormSilhouette.skullHalfWidth(yNorm, headRef.skullCfg, yaw, -1) * rx * BROW_TIP_PAD;
    let k = 1, dx = 0;
    if (R > 0 && L > 0) {
        const sq = place.squash;
        const width = Math.abs(sq * (e.browOut - e.browIn));
        const band = R + L;
        // Шире полосы — сжимаем. Не влезает даже сжатая — значит на этой
        // высоте головы почти нет, и бровь честно становится коротким мазком.
        if (width > band) k = Math.max(BROW_SQUEEZE_MIN, band / width);
        const eyeX = place.x * rx;
        const a1 = eyeX + sq * k * e.browIn, a2 = eyeX + sq * k * e.browOut;
        const hi = Math.max(a1, a2), lo = Math.min(a1, a2);
        // Сдвиг ВНУТРЬ: одного сжатия мало, потому что сжимается бровь вокруг
        // центра глаза — а центр глаза на высоте брови сам может оказаться за
        // кромкой (глаз прижат к контуру по СВОЕЙ высоте, где череп шире).
        if (hi > R) dx = R - hi;
        if (lo + dx < -L) dx = -L - lo;
        // В местные координаты брови: группа глаза сжата по x на squash.
        dx = sq > 0.05 ? dx / sq : 0;
    }
    e.browSqueeze = k;
    e.browShift = dx;
    applyBrowTransform(e);
}

// ---------- ГЛУБИНА УХА ПРИ ПОВОРОТЕ ----------
// Ближнее ухо при развороте выходит ПЕРЕД массой головы, дальнее остаётся за
// ней. Пока обе группы лежали под черепом, повёрнутая голова читалась
// вывернутой: ухо со стороны зрителя торчало откуда-то из-за затылка.
//
// Порог высокий: ухо сидит на азимуте около 63° от плоскости лица, и его
// корень прячется за скулой почти до самого предела поворота. Переезд —
// событие крайнего ракурса, а не постоянное переключение.
//
// Гистерезис обязателен: без него на самом пороге ухо мигало бы туда-сюда
// каждый кадр — голова всё время чуть поводит.
const EAR_FRONT_ON = 0.78;    // доля предела поворота, после которой ухо впереди
const EAR_FRONT_OFF = 0.62;   // и до которой возвращается назад

function applyHeadEarDepth(headRef, yaw) {
    const front = headRef.earsFront, back = headRef.earsGroup;
    if (!front || !back) return;
    const limit = (typeof WORM_HEAD_YAW_LIMIT === 'number') ? WORM_HEAD_YAW_LIMIT : 1;
    const t = Math.abs(yaw || 0) / (limit || 1);
    const было = headRef.earFrontSide || 0;
    let надо = было;
    if (t >= EAR_FRONT_ON) надо = (yaw >= 0 ? 1 : -1);
    else if (t <= EAR_FRONT_OFF) надо = 0;
    else if (было !== 0 && Math.sign(yaw || 0) !== было) надо = 0;
    if (надо === было) return;
    headRef.earFrontSide = надо;
    ['left', 'right'].forEach(side => {
        const ear = headRef.ears[side];
        if (!ear || !ear.group) return;
        const mirror = side === 'left' ? -1 : 1;
        const host = (надо !== 0 && mirror === надо) ? front : back;
        if (ear.group.parentNode !== host) host.appendChild(ear.group);
    });
}

// ---------- ЖИВОЙ ПЕРЕСЧЁТ ПОВОРОТА ГОЛОВЫ ----------
// Тот же расчёт, что и при сборке, но переставляет атрибуты УЖЕ созданных
// узлов — ни одного нового элемента. Это обязательное условие, чтобы поворот
// можно было анимировать: setOverride пересобирает всю голову заново и для
// покадровой анимации не годится.
//
// Пересчитывать нужно ровно шесть вещей: путь черепа (он асимметричен),
// трансформы двух глаз, двух ушей, пятачка с мордой и рта.
// ---------- ШРАМЫ ГОЛОВЫ ПРИ ЖИВОМ ПОВОРОТЕ ----------
// Шрам — точка НА КОЖЕ: у него есть азимут вокруг вертикальной оси и высота.
// Куда он попадёт на экране, считает `WormSilhouette.skinPoint` — та самая
// функция, которой размещение проверяло место. Пока функций было две (здесь
// проекция по шару радиуса rx, там разрешённые прямоугольники), шрам был
// проверен в одном месте, а нарисован в другом — и висел рядом с головой
// в воздухе (docs/traps.md, п. 103).
//
// Разводка с глазами, пятачком и ртом здесь НЕ делается: место, которое
// задевает черту лица, просто не выдаётся при размещении — и не выдаётся ни
// при каком ракурсе. Отодвигать шрам на лету значило бы ломать ровно ту
// проверку, которой он прошёл.
// Надетое на голову при живом повороте. Отдельно от шрамов: у шрама есть
// азимут и он прячется на изнанке, а шляпа и очки сидят по центру морды и
// не прячутся никогда — им нужна только посадка (WormSilhouette.wearPlace).
function applyHeadWear(headRef, yaw) {
    const list = headRef.wear;
    if (!list || !list.length) return;
    const rx = headRef.rx || 1;
    for (let i = 0; i < list.length; i++) {
        const w = list[i];
        // ---------- ЧТО УЖЕ ЕДЕТ ПРАВИЛЬНО, У ТОГО И СПИСЫВАЕМ ----------
        // У рта и у ушей своей формулы посадки нет и не нужно: морда и уши
        // уже пересчитаны на этот ракурс, и вещь просто повторяет их
        // transform. Вторая формула про то же самое разошлась бы с первой
        // на первой же правке (docs/traps.md, п. 103).
        // ---------- ПАРНАЯ ЧЕРТА ----------
        // Каждый кусок садится на свой глаз, перемычка растягивается между
        // ними. Своих формул тут нет: берём то, что уже посчитано глазам.
        if (w.eyePair) {
            const at = (node) => {
                const m = /translate\(([-0-9.]+)[ ,]([-0-9.]+)\)/.exec(
                    (node && node.getAttribute('transform')) || '');
                return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
            };
            const l = at(w.eyePair.left), r = at(w.eyePair.right);
            ['left', 'right'].forEach(side => {
                const part = w.node.querySelector('[data-eye="' + side + '"]');
                const host = w.eyePair[side];
                if (!part || !host) return;
                const t = host.getAttribute('transform') || '';
                if (t !== part.__was) { part.__was = t; setAttr(part, 'transform', t); }
            });
            const span = w.node.querySelector('[data-span]');
            if (span && l && r) {
                const t = `translate(${((l.x + r.x) / 2).toFixed(2)},${((l.y + r.y) / 2).toFixed(2)})`
                        + ` scale(${Math.abs(r.x - l.x).toFixed(2)},1)`;
                if (t !== span.__was) { span.__was = t; setAttr(span, 'transform', t); }
            }
            continue;
        }
        if (w.mirror) {
            const t = w.mirror.getAttribute('transform') || '';
            if (t !== w.mirrored) { w.mirrored = t; setAttr(w.node, 'transform', t); }
            continue;
        }
        const p = WormSilhouette.wearPlace(w.fit, yaw, w);
        setAttr(w.node, 'transform',
            `translate(${(w.x + p.x * rx).toFixed(2)},0) scale(${p.squash.toFixed(3)},1)`);
    }
}

function applyHeadScars(headRef, yaw) {

    const list = headRef.scars;
    if (!list || !list.length) return;
    const rx = headRef.rx || 1;
    const ratio = (headRef.ry || rx) / rx;
    for (let i = 0; i < list.length; i++) {
        const sc = list[i];
        // v — высота в долях rx, как её вернуло размещение.
        const skin = WormSilhouette.skinPoint(sc.phiDeg, sc.y / rx, headRef.skullCfg, yaw, ratio, sc.halfX, sc.halfY);
        if (!skin.front) { setAttr(sc.node, 'display', 'none'); continue; }
        setAttr(sc.node, 'display', null);
        // Гашение у края: отметина не пропадает рывком, а сходит на нет.
        // Жёсткий порог давал мигание — голова у стоящего червя всё время
        // чуть поводит, и отметина ровно на пороге вспыхивала по нескольку
        // раз в секунду (docs/traps.md, п. 104).
        if (sc.alpha !== skin.alpha) {
            sc.alpha = skin.alpha;
            for (let c = sc.node.firstChild; c; c = c.nextSibling) {
                if (c.__baseOpacity == null) continue;
                setAttr(c, 'opacity', (c.__baseOpacity * skin.alpha).toFixed(3));
            }
        }
        setAttr(sc.node, 'transform',
            `translate(${(skin.x * rx).toFixed(2)},${sc.y.toFixed(2)}) `
            + `scale(${Math.max(0.05, skin.squash).toFixed(3)},1) rotate(${sc.rotation.toFixed(1)})`);
    }
}

function applyHeadYaw(headRef, yaw) {
    if (!headRef || headRef.yaw === yaw) return;
    headRef.yaw = yaw;
    applyHeadScars(headRef, yaw);
    const rx = headRef.rx, ry = headRef.ry;

    // Череп — единственная строка пути, которую приходится пересобирать.
    // Она короткая (шесть кривых), в отличие от пути кишечного тракта.
    if (headRef.skull) {
        const d = skullPathData(rx, ry, headRef.skullCfg, yaw);
        setAttr(headRef.skull, 'd', d);
        if (headRef.skullClipShape) setAttr(headRef.skullClipShape, 'd', d);
    }

    // Глаза: посадка по поверхности + ракурсное сжатие через scale группы.
    // Та же посадка, что и при сборке, и та же, которую спрашивает
    // размещение шрамов. Формула ОДНА: пока она была записана трижды, две
    // копии из трёх успевали разойтись.
    ['left', 'right'].forEach(side => {
        const e = headRef.eyes[side];
        if (!e) return;
        const place = WormSilhouette.eyePlace(e.yawPhi, yaw, e.baseRx / rx);
        setAttr(e.group, 'transform',
            `translate(${(place.x * rx).toFixed(2)},${e.offsetY}) scale(${place.squash.toFixed(3)},1)`);
        applyBrowFit(headRef, e, place, yaw);
    });

    // Уши: пересчитываем якорь и сжатие, но САМ трансформ не пишем — его
    // каждый кадр собирает tick() вместе с наклоном уха. Пишем в refs,
    // откуда tick его и берёт.
    ['left', 'right'].forEach(side => {
        const ear = headRef.ears[side];
        if (!ear) return;
        const place = earPlacement(ear, yaw);
        ear.anchorX = place.x;
        ear.scaleX = ear.baseScaleX * place.squash;
        // Разворот наружу тоже зависит от ракурса — ухо, вставшее ребром,
        // подбирается за голову вместо того, чтобы торчать вбок.
        ear.baseAngle = ear.baseTilt * (1 - EAR_EDGE_STRAIGHTEN * place.edge) + ear.ownRotation;
        setAttr(ear.group, 'transform',
            `translate(${ear.anchorX.toFixed(2)},${ear.anchorY.toFixed(2)}) ` +
            `rotate(${ear.baseAngle.toFixed(1)}) ` +
            `scale(${ear.scaleX.toFixed(3)},${ear.scaleY.toFixed(3)})`);
    });
    applyHeadEarDepth(headRef, yaw);

    // Блик едет по поверхности черепа — тем же поворотом, что двигает черты
    // лица. Неподвижный блик читается пятном на стекле перед персонажем, а
    // не светом на его голове.
    if (headRef.headShine) {
        // yawProject отдаёт x В ПИКСЕЛЯХ (он уже умножен на радиус) — как
        // им и пользуются пятачок с мордой. Лишнее умножение на rx угоняло
        // блик за тысячу пикселей: на экране этого не видно, клип его
        // прячет, зато ГАБАРИТ головы вырастал в шестнадцать раз — и ломал
        // всё, что по нему считается, от посадки шляпы до кастрюли кухни.
        const sp = yawProject(rx, headRef.shinePhi, yaw, 0);
        setAttr(headRef.headShine, 'cx', (sp.x * 0.62).toFixed(2));
        setAttr(headRef.headShine, 'rx', (rx * 0.3 * Math.max(0.35, Math.abs(sp.squash))).toFixed(2));
    }

    // Пятачок и морда: выступающие черты, уезжают сильнее прочих. Сам
    // трансформ пятачка тоже собирает tick() (принюхивание), поэтому здесь
    // только обновляем базовые значения в refs.
    const snoutProj = yawProject(rx, 0, yaw, headRef.snoutProtrude);
    headRef.snoutX = snoutProj.x;
    headRef.snoutSquash = Math.max(0.55, Math.abs(snoutProj.squash));
    if (headRef.muzzleGroup) {
        const mzp = yawProject(rx, 0, yaw, headRef.snoutProtrude * 0.7);
        headRef.muzzleX = mzp.x;
        applyMuzzleTransform(headRef);
    }

    // Рот: тот же выступ, но с ограничителем по ширине морды.
    if (headRef.mouthAnchor) {
        const mp = yawProject(rx, 0, yaw, headRef.mouthProtrude);
        const maxX = rx * (headRef.skullCfg.muzzleWidth != null ? headRef.skullCfg.muzzleWidth : 0.46) * 0.45;
        headRef.mouthX = Math.sign(mp.x) * Math.min(Math.abs(mp.x), maxX);
        headRef.mouthSquash = Math.max(0.62, Math.abs(mp.squash));
        const mo = headRef.mouthBaseScale || { x: 1, y: 1 };
        setAttr(headRef.mouthAnchor, 'transform',
            `translate(${headRef.mouthX.toFixed(2)},${(ry * MOUTH_Y).toFixed(2)}) ` +
            `scale(${(mo.x * headRef.mouthSquash).toFixed(3)},${mo.y.toFixed(3)})`);
    }

    // ---------- НАДЕТОЕ НА ГОЛОВУ — ПОСЛЕДНИМ ----------
    // Сигара во рту и серьги в ушах не считают свою посадку, а СПИСЫВАЮТ
    // transform у морды и у ушей. Значит те должны быть уже пересчитаны:
    // вызов стоял первым, и вещи отставали на кадр.
    applyHeadWear(headRef, yaw);
}

// Трансформ «морды» пишут ДВА источника: поворот головы (сдвиг вбок, потому
// что морда выступает вперёд) и надувание щёк из мимики. Раньше каждый писал
// атрибут целиком и затирал чужую работу — надутые щёки сбрасывали сдвиг от
// поворота, и морда отклеивалась от пятачка, повисая светлым пятном рядом с
// ним. Поэтому оба слагаемых хранятся в refs, а собирает их одно место.
function applyMuzzleTransform(headRef) {
    if (!headRef.muzzleShift) return;
    const x = headRef.muzzleX || 0;
    const puff = headRef.muzzlePuff || 0;
    const parts = [];
    if (Math.abs(x) > 0.01) parts.push(`translate(${x.toFixed(2)},0)`);
    if (puff > 0.001) parts.push(`scale(${(1 + 0.12 * puff).toFixed(3)},${(1 + 0.05 * puff).toFixed(3)})`);
    setAttr(headRef.muzzleShift, 'transform', parts.join(' '));
}

