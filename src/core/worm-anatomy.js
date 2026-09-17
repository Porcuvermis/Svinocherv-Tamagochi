// ================= АНАТОМИЧЕСКИЕ СЛОИ ТЕЛА =================
// Четвёртый файл стопки рендерера (карта — в worm-basis.js).
// Разбор слоёв и зачем каждый — docs/worm-anatomy-layers.md.

// ============================================================================
//                        АНАТОМИЧЕСКИЕ СЛОИ ТЕЛА
// ============================================================================
// Тело — не один эллипс с градиентом, а слоистый материал. На КАЖДУЮ часть
// (сегмент/живот/хвост/голова) строится одна и та же стопка слоёв, в строго
// фиксированном порядке снизу вверх:
//
//   [0] skin base   — сама заливка части (уже существовавший эллипс/путь);
//   [1] skin tone   — неоднородность тона: крупные мягкие пятна светлее/темнее;
//   [2] dorsoventral— спина темнее, брюхо светлее (как у дождевого червя);
//   [3] muscle      — продольные тяжи под кожей, дают рельеф, а не гладкий шар;
//   [4] organs      — РАЗНЫЕ по форме структуры (кишка/мешочек/узелки/сосуд),
//                     у каждой свой цвет, свой ритм пульсации, своя видимость;
//   [5] coat        — покрытие кожи: кольцевые бороздки, складки, поясок,
//                     щетина, матовые участки и ЧЁТКИЙ блик слизи.
//
// Порядок задан ЯВНО (см. ANAT_LAYER_ORDER и buildAnatomyStack) — слои не
// собираются "как получится" и не могут случайно перекрыть друг друга.
//
// Ключевые технические решения (см. ТЗ по производительности):
//   • НИ ОДНОГО feGaussianBlur и ни одной SMIL-анимации. Мягкость краёв
//     достигается радиальными градиентами с падающей до нуля прозрачностью,
//     а не фильтрами — это стоит примерно как обычная заливка.
//   • "Просвечивание" — не blend-mode, а честный полупрозрачный слой органов
//     МЕЖДУ кожей и её покрытием, с локальной непрозрачностью по зоне тела
//     (skin.thinness): на животе кожа тоньше — видно лучше, на голове почти
//     не видно.
//   • Формы органов имеют ЧЁТКИЙ контур (stroke) — именно он даёт
//     читаемость силуэта органа; мягко растворяется только заливка внутри.
//   • Вся анатомия части лежит в ОДНОЙ группе, обрезанной по силуэту этой
//     части (clipPath) — ни один слой физически не может вылезти за пределы
//     своего сегмента на соседний.
//   • Пульсация органов считается в tick() от dt (framerate-independent),
//     через отдельный аккумулятор фазы — тот же принцип, что и у остальных
//     анимаций рендерера.

const ANAT_LAYER_ORDER = ['tone', 'dorsoventral', 'muscle', 'organs', 'coat'];

// Резервная анатомия для старых сохранённых моделей, в которых блока
// anatomy ещё нет: рендерер тогда просто рисует как раньше.
const ANAT_DISABLED = { enabled: false };

function getAnatomy(model) {
    const a = model && model.anatomy;
    if (!a || !a.enabled) return ANAT_DISABLED;
    return a;
}

// Локальная прозрачность кожи по зоне тела. Ключ 'growing' покрывает все
// растущие сегменты сразу (их количество меняется со взрослением, поэтому
// перечислять их поимённо в модели нельзя).
function anatThinness(anatomy, partName, growingCount) {
    const t = (anatomy.skin && anatomy.skin.thinness) || {};
    const raw = t[partName];
    if (raw != null && !Array.isArray(raw)) return raw;

    if (partName && partName.indexOf('growing-') === 0) {
        const ramp = t.growing;
        if (ramp == null) return 1;
        if (!Array.isArray(ramp)) return ramp;
        // Растущие сегменты идут от живота к хвосту: первый просвечивает
        // почти как живот, последний почти как хвост.
        const idx = parseInt(partName.slice('growing-'.length), 10) || 1;
        const count = Math.max(1, growingCount || idx);
        const k = count > 1 ? (idx - 1) / (count - 1) : 0;
        return ramp[0] + (ramp[1] - ramp[0]) * k;
    }
    return raw != null ? raw : 1;
}

// Сид анатомии берётся из МОДЕЛИ (anatomy.seed), а не из instanceId — иначе
// один и тот же персонаж выглядел бы по-разному на главном экране и в
// мини-игре (у них разные instanceId). Узор особи должен быть её
// собственностью, а не свойством конкретного монтирования.
function anatRng(anatomy, partName, salt) {
    return mulberry32(hashStringSeed(`${anatomy.seed || 0}|${partName}|${salt || ''}`));
}

// Мягкое пятно: радиальный градиент, у которого прозрачность падает до нуля
// к краю. Это и есть замена размытию — края растворяются, но стоимость
// отрисовки как у обычной заливки.
function ensureSoftGradient(ctx, id, colorCss, peakAlpha) {
    if (ctx.gradCache[id]) return `url(#${id})`;
    const grad = svgEl('radialGradient', { id, cx: '50%', cy: '50%', r: '50%' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': colorCss, 'stop-opacity': peakAlpha.toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': colorCss, 'stop-opacity': (peakAlpha * 0.5).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': colorCss, 'stop-opacity': '0' }));
    ctx.defs.appendChild(grad);
    ctx.gradCache[id] = true;
    return `url(#${id})`;
}

// Градиент "спина темнее — брюхо светлее". Один на весь инстанс: сила
// эффекта одинаковая для всех частей тела, поэтому дублировать его на
// каждый сегмент незачем.
function ensureDorsoVentralGradient(ctx) {
    const id = `worm-dv-${ctx.instanceId}`;
    if (ctx.gradCache[id]) return `url(#${id})`;
    const skin = ctx.anatomy.skin || {};
    const dark = skin.dorsalDarkening != null ? skin.dorsalDarkening : 0.3;
    const light = skin.ventralLightening != null ? skin.ventralLightening : 0.14;
    const grad = svgEl('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': GRIME_SHADOW, 'stop-opacity': (dark * 0.75).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '30%', 'stop-color': GRIME_SHADOW, 'stop-opacity': (dark * 0.22).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '52%', 'stop-color': GRIME_SHADOW, 'stop-opacity': '0' }));
    grad.appendChild(svgEl('stop', { offset: '78%', 'stop-color': GRIME_HIGHLIGHT, 'stop-opacity': (light * 0.45).toFixed(3) }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': GRIME_HIGHLIGHT, 'stop-opacity': light.toFixed(3) }));
    ctx.defs.appendChild(grad);
    ctx.gradCache[id] = true;
    return `url(#${id})`;
}

// ---------- ПЛАН ОРГАНОВ ----------
// Органы — не "цветные пятна", а несколько РАЗНЫХ по форме и поведению
// структур. План (что где лежит) считается детерминированно от сида особи,
// поэтому у разных червей внутренности разложены по-разному, но у одного и
// того же червя всегда одинаково.
//
// zone:
//   'core'  — живот: самое насыщенное место (кишка + мешочек + узелки);
//   'neck'  — сегменты между головой и животом: кишка проходит транзитом;
//   'floor' — растущие сегменты: кишка + иногда узелки;
//   'tail'  — хвост: только тонкий отросток кишки;
//   'head'  — голова: органов нет (кожа/череп плотные), только сосудики в ушах.
function organPlanForZone(zone, rng) {
    const plan = [];

    // ВАЖНО: отдельных "кишок" по сегментам здесь больше нет. Кишечник —
    // ОДИН непрерывный тракт на всё тело (см. buildGutTractGeometry): куски
    // кишки, живущие каждый в своём сегменте, не могут быть связаны между
    // собой в принципе — на каждом стыке был разрыв.
    //
    // И органы теперь ТОЛЬКО в животе. Раньше «грудная клетка» стояла ещё в
    // двух шейных сегментах, а в напольных лежали «грозди узелков». Ни то ни
    // другое ничего не означало: рёбра поперёк шеи читались полосками, а
    // узелки — просто точками. Внутренности должны опознаваться, иначе это
    // не анатомия, а шум под кожей.
    if (zone === 'core') {
        // ---------- ЖИВОТ: УЗНАВАЕМЫЕ ОРГАНЫ ----------
        // Раньше здесь лежали абстрактные "мешочек" и "гроздь узелков". Через
        // тонкую кожу живота это читалось как набор пятен: понятно, что
        // внутри что-то есть, непонятно что. Свиночервь — существо с
        // характером, и внутренности у него должны опознаваться: сердце как
        // сердце, желудок как желудок.
        //
        // Позиции слегка гуляют от сида, но НЕ произвольно: сердце всегда
        // выше и ближе к голове, желудок ниже и к хвосту от него. Анатомия у
        // особей одна, разными их делает мелочь, а не перестановка органов.
        // Сердце и желудок сидят в ВЕРХНЕЙ половине живота: петли кишечника
        // занимают низ, и органы, положенные по центру, тонули в них.
        // ---------- ГРУДНАЯ КЛЕТКА ДВУМЯ СЛОЯМИ ----------
        // Клетка — объёмная бочка, а не решётка на плоскости, и объём даёт
        // ровно одно: ДАЛЬНЯЯ половина рёбер лежит ЗА органами, ближняя —
        // перед ними. Раньше все дуги стояли одинаково поверх, и клетка
        // читалась полосками поперёк тела.
        //
        // Порядок в плане и есть порядок отрисовки, поэтому дальние рёбра
        // идут первыми, до сердца и желудка, а ближние — последними. Дыхание
        // у обоих слоёв одно (общая фаза и множители), иначе половинки
        // клетки разъехались бы.
        const ribPhase = rng() * 6.28;
        // cx/cy — середина оси клетки: вокруг неё группа и доворачивается
        // при развороте тела (поворот пишется в тот же transform, что и
        // пульсация, — лишней работы ноль).
        const ribMid = ribAxisAt(0.5);
        const ribs = (side) => ({
            kind: 'ribs', side, cx: ribMid.x, cy: ribMid.y, count: 4,
            rot: 0, speedMul: 0.5, ampMul: 0.3, phase: ribPhase
        });
        // Две ПОЛОВИНЫ клетки — левая и правая, а не «ближняя» и «дальняя».
        // Какая из них ближе к зрителю, решает разворот тела, и роли
        // меняются местами прямо на ходу (см. tick, разворот клетки).
        plan.push(ribs('a'));
        plan.push({
            kind: 'heart', cx: 0.32 + rng() * 0.08, cy: -0.44 - rng() * 0.06, len: 0.34, thick: 0.38,
            rot: rng() * 16 - 8, speedMul: 2.1, ampMul: 1.8, phase: rng() * 6.28
        });
        plan.push({
            kind: 'stomach', cx: -0.22 + rng() * 0.08, cy: -0.3 + rng() * 0.06, len: 0.46, thick: 0.42,
            rot: rng() * 14 - 7, speedMul: 0.75, ampMul: 0.9, phase: rng() * 6.28
        });
        plan.push(ribs('b'));
    }
    return plan;
}

// Сосудистая сеть, расходящаяся от органа. На хороших артах именно она
// связывает внутренности с телом: орган без сосудов выглядит проглоченным
// предметом, а не частью существа. Рекурсивное ветвление, каждый уровень
// тоньше и бледнее предыдущего.
function buildVesselTree(group, rng, x, y, angle, len, depth, color, width) {
    if (depth <= 0 || len < 1.5) return;
    const spread = (rng() - 0.5) * 0.9;
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    const cx = x + Math.cos(angle + spread * 0.6) * len * 0.55;
    const cy = y + Math.sin(angle + spread * 0.6) * len * 0.55;
    group.appendChild(svgEl('path', {
        d: `M ${x.toFixed(1)},${y.toFixed(1)} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
        fill: 'none', stroke: color, 'stroke-width': width.toFixed(2),
        'stroke-linecap': 'round', opacity: (0.28 + 0.12 * depth).toFixed(2)
    }));
    const branches = depth > 1 ? 2 : 1;
    for (let i = 0; i < branches; i++) {
        buildVesselTree(group, rng, ex, ey,
            angle + (rng() - 0.5) * 1.5, len * (0.5 + rng() * 0.25),
            depth - 1, color, Math.max(0.35, width * 0.6));
    }
}

// ---------- ГРУДНАЯ КЛЕТКА ----------
// Червю рёбра не полагаются, но это и не червь: свиночервю они нужны для
// образа — клетка сразу превращает «мешок с органами» в существо.
//
// Как это устроено и почему именно так (прошлая версия была набором дуг
// поперёк тела и читалась полосками неизвестной природы):
//
// * Рёбра растут ОТ ПОЗВОНОЧНИКА. Позвоночник здесь воображаемый — линия
//   вдоль спины (локальный −Y): его роль уже играет спинной сосуд, который
//   идёт там же (buildCoatLayer), поэтому отдельной линии не рисуем, а
//   верхние концы всех рёбер выстраиваем ровно по ней. Ребро, у которого
//   виден один конец на общей линии, читается прикреплённым.
// * Идут они ПОПЕРЁК тела, а не вдоль: система координат здесь всегда
//   локальная — +X вдоль тела к голове, +Y к брюху, — поэтому «поперёк»
//   получается само, как бы ни был повёрнут сегмент на экране.
// * С НАКЛОНОМ к хвосту, и чем ниже ребро, тем сильнее: у настоящей клетки
//   рёбра идут вниз-вперёд, а не радиально из точки. Ребро уходит от
//   позвоночника почти перпендикулярно и подворачивает к хвосту только
//   ближе к брюху — отсюда квадратичная кривая с одной опорной точкой.
// * Длина: средние рёбра самые длинные, крайние короче — клетка сужается к
//   концам, иначе это бочка с одинаковыми обручами.
// * ДВА РЯДА. Дальний (side:'back') рисуется ДО органов, ближний — ПОСЛЕ
//   (порядок задаётся планом в organPlanForZone). Дальний смещён на полшага,
//   короче, тоньше и бледнее: так клетка читается объёмной, а не решёткой в
//   одной плоскости. Совпадающие пары дуг выглядели бы одним толстым ребром.
// * Рёберная дуга по концам ближних рёбер — одна линия, а стоит она больше
//   всех: именно по ней глаз опознаёт грудную клетку.
//
// Всё статично: узлы собираются один раз, в кадре у них не меняется ничего,
// кроме общего дыхания всей группы органов.
// Ось тела внутри живота — воображаемая линия, вокруг которой построена
// клетка. Не рисуется. Числа получены подгонкой под утверждённый профиль:
// середины восьми нарисованных автором рёбер легли на эту кривую с ошибкой
// меньше трёх сотых полуоси (tools — см. правку 159 в журнале).
const RIB_AXIS = [{ x: 0.49, y: -0.67 }, { x: -0.01, y: -0.15 }, { x: -0.32, y: 0.18 }];
// Половина ширины клетки и снос ребра вдоль хребта на станции t (0 — у шеи,
// 1 — у хвоста). Тоже из подгонки: R растёт к тазу, снос меняет знак —
// верхние рёбра забирают к голове, нижние к хвосту.
const RIB_R_FROM = 0.43, RIB_R_TO = 0.66;
const RIB_SLANT_FROM = -0.3, RIB_SLANT_TO = 0.32;
// Насколько камера смотрит сверху. Единственное, из-за чего в профиль видно
// РАЗНИЦУ между ближней и дальней стенкой: их дуги расходятся по вертикали.
const RIB_TILT = 0.2;
// На сколько градусов клетка доворачивается, когда тело встаёт к
// камере: ось живота нарисована наискосок (так тело лежит в профиль),
// а в анфас туловище на экране почти отвесно.
const RIB_TURN_DEG = -42;
// Насколько ребро опускается, пока обходит тушу (в долях своего
// радиуса). Работает только в анфас — см. drift в ribPath.
const RIB_FRONT_DROP = 0.9;

function ribAxisAt(t) {
    const u = 1 - t, A = RIB_AXIS[0], C = RIB_AXIS[1], B = RIB_AXIS[2];
    return { x: u * u * A.x + 2 * u * t * C.x + t * t * B.x,
             y: u * u * A.y + 2 * u * t * C.y + t * t * B.y };
}
function ribAxisDir(t) {
    const A = RIB_AXIS[0], C = RIB_AXIS[1], B = RIB_AXIS[2];
    const dx = 2 * ((1 - t) * (C.x - A.x) + t * (B.x - C.x));
    const dy = 2 * ((1 - t) * (C.y - A.y) + t * (B.y - C.y));
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
}

// ---------- ОДНО РЕБРО В ЗАДАННОМ РАКУРСЕ ----------
// Ребро — половина обруча вокруг оси тела: от хребта (спина) через бок к
// брюху. Считается в 3д и проецируется на экран, поэтому один и тот же
// набор чисел даёт и профиль, и вид спереди, и всё между ними — как у
// головы, только у головы поворот приблизительный, а здесь честный.
//
//   psi = 0      — тело смотрит в камеру: хребет позади, рёбра опоясывают
//                  тушу с ДВУХ сторон симметрично;
//   psi = ±90°   — профиль: обруч виден с ребра, дуга ложится поперёк тела,
//                  а ближняя и дальняя половины расходятся по вертикали
//                  (наклон камеры) и идут накрест.
//
// Возвращает готовую строку пути и глубину середины ребра — по ней решается,
// насколько оно яркое и что рисуется поверх чего.
function ribPath(ref, psi) {
    const sp = Math.sin(psi), cp = Math.cos(psi);
    // Станция переползает между анфасной и профильной — см. buildRibs.
    const w = Math.abs(sp), v = 1 - w;
    const A = ref.a, B = ref.b;
    const rib = {
        side: ref.side,
        cx: A.cx * v + B.cx * w, cy: A.cy * v + B.cy * w,
        nx: A.nx * v + B.nx * w, ny: A.ny * v + B.ny * w,
        tx: A.tx * v + B.tx * w, ty: A.ty * v + B.ty * w,
        R: A.R * v + B.R * w, slant: A.slant * v + B.slant * w
    };
    const pt = (phi) => {
        const c = Math.cos(phi), s = Math.sin(phi);
        const across = rib.R * (-c * sp + s * rib.side * cp);   // поперёк тела, в плоскости экрана
        const depth = rib.R * (-c * cp - s * rib.side * sp);    // от зрителя (минус) к зрителю (плюс)
        // Снос вдоль хребта. Два слагаемых, и оба обязательны:
        //   в профиль работает ПОСТОЯННЫЙ наклон ребра (slant) — он и снят с
        //   утверждённого эскиза: верхние рёбра забирают к голове, нижние к
        //   хвосту;
        //   в анфас работает СПУСК: ребро опускается, пока уходит на бок, и
        //   поднимается обратно к средней линии. Без него обход виден в
        //   упор — ребро вырождается в отрезок туда-обратно, и восемь таких
        //   отрезков читаются пружиной, а не клеткой. Спуск считается от
        //   |sin| (то есть от того, насколько ребро ушло вбок), поэтому
        //   левая и правая половины опускаются одинаково и клетка спереди
        //   выходит симметричной ёлочкой.
        const drift = rib.R * (rib.slant * Math.abs(sp) * (1 - c)
                               + RIB_FRONT_DROP * cp * cp * Math.pow(Math.abs(s), 1.7));
        return { x: rib.cx + rib.nx * across + rib.tx * drift,
                 y: rib.cy + rib.ny * across + rib.ty * drift + RIB_TILT * depth,
                 z: depth };
    };

    // ---------- КАКОЙ КУСОК ОБРУЧА ВООБЩЕ РИСУЕТСЯ ----------
    // Поперечная координата ребра — синусоида по φ: across = R·sin(φ + δ).
    // Если рисовать весь полуобруч, на любом ракурсе кроме профиля она
    // разворачивается назад, и ребро складывается пополам — на экране это
    // петля. Поэтому берётся ровно тот участок, где проекция МОНОТОННА:
    // ребро уходит вбок и не возвращается. В профиль это весь полуобруч (там
    // разворота нет), в анфас — половина, и её как раз и видно.
    const delta = Math.atan2(-sp, rib.side * cp);
    const window = (lo) => {
        let a = lo - delta, b = a + Math.PI;
        while (b < 0) { a += Math.PI * 2; b += Math.PI * 2; }
        while (a > Math.PI) { a -= Math.PI * 2; b -= Math.PI * 2; }
        return [Math.max(0, a), Math.min(Math.PI, b)];
    };
    // Кусков-кандидатов два (обруч монотонен по обе стороны от бока), и
    // выбирается не просто длинный, а БЛИЖНИЙ к зрителю: при равной длине
    // левая и правая половины обязаны выбрать зеркальные куски, иначе анфас
    // выходит кривым — одна стенка рисует переднюю половину рёбер, другая
    // заднюю.
    const w1 = window(-Math.PI / 2), w2 = window(Math.PI / 2);
    const score = (w) => {
        const mid = (w[0] + w[1]) / 2;
        const depth = -Math.cos(mid) * cp - Math.sin(mid) * rib.side * sp;
        return (w[1] - w[0]) / Math.PI + 0.35 * depth;
    };
    const win = score(w1) >= score(w2) ? w1 : w2;
    const phiFrom = win[0];
    const phiTo = Math.min(Math.PI, Math.max(win[1], phiFrom + 0.6));

    // Кубическая кривая по четырём точкам дуги. Квадратичной здесь мало:
    // проекция обруча — не парабола, и «через середину» давало перелёт с
    // характерным крючком на конце.
    const d3 = phiTo - phiFrom;
    const P0 = pt(phiFrom), P1 = pt(phiFrom + d3 / 3),
          P2 = pt(phiFrom + 2 * d3 / 3), P3 = pt(phiTo);
    const c1x = (-5 * P0.x + 18 * P1.x - 9 * P2.x + 2 * P3.x) / 6;
    const c1y = (-5 * P0.y + 18 * P1.y - 9 * P2.y + 2 * P3.y) / 6;
    const c2x = (2 * P0.x - 9 * P1.x + 18 * P2.x - 5 * P3.x) / 6;
    const c2y = (2 * P0.y - 9 * P1.y + 18 * P2.y - 5 * P3.y) / 6;
    return {
        d: `M ${P0.x.toFixed(1)},${P0.y.toFixed(1)} C ${c1x.toFixed(1)},${c1y.toFixed(1)} ` +
           `${c2x.toFixed(1)},${c2y.toFixed(1)} ${P3.x.toFixed(1)},${P3.y.toFixed(1)}`,
        near: ((P1.z + P2.z) / 2 / rib.R + 1) / 2
    };
}

// Одна СТЕНКА клетки — левая или правая половина обруча. Строит узлы (по два
// на ребро: тень под костью и сама кость) и отдаёт описания, по которым
// tick() пересчитывает их при развороте тела.
function buildRibs(ctx, group, plan, halfLen, halfThick) {
    const palette = (ctx.anatomy.organs && ctx.anatomy.organs.palette) || {};
    const bone = palette.bone || BILE[200];
    const side = plan.side === 'b' ? -1 : 1;
    // Половину подписываем: по ней прогон отличает левую стенку от правой,
    // а по порядку в дереве видно, какая сейчас ближе к зрителю.
    setAttr(group, 'data-side', plan.side);
    const count = Math.max(2, plan.count || 4);
    const MID = ribAxisAt(0.5);
    const ribs = [];

    // Станция ребра на хребте — их ДВЕ. В анфас левое и правое ребро сидят
    // на одной высоте, как у всякого позвоночного. А в профиль пара на одной
    // станции сходится концами и замыкается в линзу — восемь линз читаются
    // цепью, а не клеткой; на утверждённом эскизе половины стоят вразбежку.
    // Поэтому в профиль правая половина съезжает на полшага, и между двумя
    // ракурсами станция плавно переползает (blend в ribPath).
    const halfStep = 0.5 / (count - 1);
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        // Правая половина в профиль стоит вразбежку с левой: не сдвигом
        // (последнее ребро упёрлось бы в конец хребта и совпало с чужим), а
        // сжатием в ту же полосу со смещением на полшага.
        const tProf = side < 0 ? halfStep + t * (1 - 2 * halfStep) : t;
        const C = ribAxisAt(t), T = ribAxisDir(t);
        const Cp = ribAxisAt(tProf), Tp = ribAxisDir(tProf);
        const shadow = svgEl('path', {
            d: '', fill: 'none', stroke: mixColor(bone, GRIME_SHADOW, 0.62),
            'stroke-width': (SW.structure * 1.7).toFixed(2),
            'stroke-linecap': 'round', opacity: 0.2
        });
        const line = svgEl('path', {
            d: '', fill: 'none', stroke: bone,
            'stroke-width': (SW.structure * 1.1).toFixed(2),
            'stroke-linecap': 'round', opacity: 0.4
        });
        group.appendChild(shadow);
        group.appendChild(line);
        const R = (t) => (RIB_R_FROM + (RIB_R_TO - RIB_R_FROM) * t) * halfLen;
        const SL = (t) => RIB_SLANT_FROM + (RIB_SLANT_TO - RIB_SLANT_FROM) * t;
        ribs.push({
            // Две станции: анфасная и профильная. Координаты — от середины
            // оси: сама группа стоит в этой точке.
            // Поперечное направление — перпендикуляр к хребту, в сторону
            // брюха. Считается один раз: ось тела не меняется.
            a: { cx: (C.x - MID.x) * halfLen, cy: (C.y - MID.y) * halfThick,
                 nx: T.y, ny: -T.x, tx: T.x, ty: T.y, R: R(t), slant: SL(t) },
            b: { cx: (Cp.x - MID.x) * halfLen, cy: (Cp.y - MID.y) * halfThick,
                 nx: Tp.y, ny: -Tp.x, tx: Tp.x, ty: Tp.y, R: R(tProf), slant: SL(tProf) },
            side, shadow, line, shown: -1
        });
    }
    return ribs;
}

// Один орган: заливка мягко растворяется к краям (без фильтров), а КОНТУР
// остаётся чётким — именно контур делает орган "формой", а не пятном света.
function buildOrganNode(ctx, plan, halfLen, halfThick, idKey) {
    const palette = (ctx.anatomy.organs && ctx.anatomy.organs.palette) || {};
    const group = svgEl('g', { class: `worm-organ worm-organ-${plan.kind}` });
    let ribs = null;
    const x = plan.cx * halfLen;
    const y = plan.cy * halfThick;

    if (plan.kind === 'gut') {
        const color = palette.gut || VISCERA[700];
        const L = plan.len * halfLen;
        const w = Math.max(2.2, plan.thick * halfThick);
        const bend = (plan.bend || 0.3) * halfThick * 0.9;
        const d = `M ${(-L).toFixed(1)},0 C ${(-L * 0.45).toFixed(1)},${(-bend).toFixed(1)} ` +
                  `${(L * 0.45).toFixed(1)},${bend.toFixed(1)} ${L.toFixed(1)},0`;
        // Мягкая тень вокруг трубки — орган лежит ПОД кожей, а не наклеен
        // сверху. Без неё даже правильный по цвету орган читается как
        // нарисованная поверх линия.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: GRIME_SHADOW,
            'stroke-width': (w + 5).toFixed(1), 'stroke-linecap': 'round', opacity: 0.16
        }));
        // Контур (чуть шире и темнее) — читаемая граница трубки.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: mixColor(color, GRIME_SHADOW, 0.5),
            'stroke-width': (w + 1.8).toFixed(1), 'stroke-linecap': 'round', opacity: 0.7
        }));
        // Тело трубки.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: color,
            'stroke-width': w.toFixed(1), 'stroke-linecap': 'round', opacity: 1
        }));
        // Продольный светлый рефлекс вдоль трубки — она читается объёмной,
        // а не плоской лентой.
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: mixColor(color, GRIME_HIGHLIGHT, 0.5),
            'stroke-width': Math.max(0.8, w * 0.28).toFixed(1), 'stroke-linecap': 'round',
            opacity: 0.35, transform: `translate(0,${(-w * 0.22).toFixed(1)})`
        }));
    } else if (plan.kind === 'sac') {
        // Капсула из пяти слоёв, как на референсных артах: тень под органом →
        // ореол свечения → тело → чёткий ободок → яркое ядро с бликом.
        // Свечение сделано вложенными градиентами с падающей прозрачностью —
        // визуально это то же, что размытие, но без единого фильтра.
        const color = palette.sac || BILE[600];
        const glow = (ctx.anatomy.organs && ctx.anatomy.organs.glow != null) ? ctx.anatomy.organs.glow : 0.6;
        const rx = plan.len * halfLen;
        const ry = plan.thick * halfThick;
        const gid = `worm-organ-sac-${ctx.instanceId}-${idKey}`;
        const fill = ensureSoftGradient(ctx, gid, color, 1);
        const shadowGid = `worm-organ-shadow-${ctx.instanceId}`;
        const coreColor = mixColor(color, BILE[200], 0.62);

        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: 0, rx: (rx * 1.35).toFixed(1), ry: (ry * 1.35).toFixed(1),
            fill: ensureSoftGradient(ctx, shadowGid, GRIME_SHADOW, 1), opacity: 0.28
        }));
        if (glow > 0.02) {
            const glowFill = ensureSoftGradient(ctx, `worm-organ-glow-${ctx.instanceId}-${idKey}`, coreColor, 1);
            group.appendChild(svgEl('ellipse', {
                cx: 0, cy: 0, rx: (rx * 2.1).toFixed(1), ry: (ry * 2.1).toFixed(1),
                fill: glowFill, opacity: (0.32 * glow).toFixed(3)
            }));
            group.appendChild(svgEl('ellipse', {
                cx: 0, cy: 0, rx: (rx * 1.45).toFixed(1), ry: (ry * 1.45).toFixed(1),
                fill: glowFill, opacity: (0.3 * glow).toFixed(3)
            }));
        }
        group.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(1), ry: ry.toFixed(1), fill }));
        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: 0, rx: rx.toFixed(1), ry: ry.toFixed(1),
            fill: 'none', stroke: mixColor(color, GRIME_SHADOW, 0.45),
            'stroke-width': SW.detail, opacity: 0.75
        }));
        group.appendChild(svgEl('ellipse', {
            cx: (-rx * 0.12).toFixed(1), cy: (-ry * 0.12).toFixed(1),
            rx: (rx * 0.45).toFixed(1), ry: (ry * 0.45).toFixed(1),
            fill: coreColor, opacity: (0.5 + 0.3 * glow).toFixed(2)
        }));
        group.appendChild(svgEl('ellipse', {
            cx: (-rx * 0.3).toFixed(1), cy: (-ry * 0.34).toFixed(1),
            rx: (rx * 0.16).toFixed(1), ry: (ry * 0.13).toFixed(1),
            fill: SPEC, opacity: 0.4
        }));

        // Сосуды от капсулы — 3-5 стволов в разные стороны.
        const vrng = anatRng(ctx.anatomy, idKey, 'vessels');
        const vGroup = svgEl('g', { class: 'worm-organ-vessels' });
        const vColor = mixColor(color, palette.vessel || VISCERA[700], 0.45);
        const trunks = 3 + Math.floor(vrng() * 3);
        for (let i = 0; i < trunks; i++) {
            const a = (i / trunks) * Math.PI * 2 + vrng() * 0.6;
            buildVesselTree(vGroup, vrng,
                Math.cos(a) * rx * 0.85, Math.sin(a) * ry * 0.85, a,
                Math.max(rx, ry) * (0.7 + vrng() * 0.6), 3, vColor, 1.1);
        }
        group.insertBefore(vGroup, group.firstChild ? group.firstChild.nextSibling : null);
    } else if (plan.kind === 'heart') {
        // ---------- СЕРДЦЕ ----------
        // Силуэт узнаваемый, детализация минимальная: сквозь кожу видно
        // пятно, и всё, что от него требуется — читаться как сердце с
        // первого взгляда. Анатомически достоверное сердце в этом размере
        // превратится в кляксу.
        const color = palette.heart || VISCERA[700];
        const rx = plan.len * halfLen;
        const ry = plan.thick * halfThick;
        // Классический силуэт: две доли сверху, острие вниз.
        const d = `M 0,${(-ry * 0.32).toFixed(1)} ` +
                  `C ${(-rx * 0.52).toFixed(1)},${(-ry * 1.15).toFixed(1)} ` +
                  `${(-rx * 1.18).toFixed(1)},${(-ry * 0.1).toFixed(1)} ` +
                  `0,${(ry * 0.98).toFixed(1)} ` +
                  `C ${(rx * 1.18).toFixed(1)},${(-ry * 0.1).toFixed(1)} ` +
                  `${(rx * 0.52).toFixed(1)},${(-ry * 1.15).toFixed(1)} ` +
                  `0,${(-ry * 0.32).toFixed(1)} Z`;

        group.appendChild(svgEl('path', {
            d, fill: ensureSoftGradient(ctx, `worm-organ-shadow-${ctx.instanceId}`, GRIME_SHADOW, 1),
            opacity: 0.3, transform: 'scale(1.25)'
        }));
        group.appendChild(svgEl('path', { d, fill: color, opacity: 0.95 }));
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: mixColor(color, GRIME_SHADOW, 0.5),
            'stroke-width': SW.detail, opacity: 0.8
        }));
        // Блик на левой доле — объём.
        group.appendChild(svgEl('ellipse', {
            cx: (-rx * 0.34).toFixed(1), cy: (-ry * 0.34).toFixed(1),
            rx: (rx * 0.22).toFixed(1), ry: (ry * 0.18).toFixed(1),
            fill: mixColor(color, GRIME_HIGHLIGHT, 0.5), opacity: 0.45
        }));
        // Пара крупных сосудов сверху: без них сердце висит само по себе.
        const hrng = anatRng(ctx.anatomy, idKey, 'heart-vessels');
        const vColor = mixColor(color, palette.vessel || VISCERA[700], 0.5);
        buildVesselTree(group, hrng, -rx * 0.3, -ry * 0.75, -1.9, Math.max(rx, ry) * 0.9, 2, vColor, 1.3);
        buildVesselTree(group, hrng, rx * 0.25, -ry * 0.8, -1.2, Math.max(rx, ry) * 0.8, 2, vColor, 1.1);
    } else if (plan.kind === 'stomach') {
        // ---------- ЖЕЛУДОК ----------
        // Мешок-фасолина: широкий свод слева-сверху, сужается к выходу
        // справа-снизу. Именно этот изгиб и делает силуэт узнаваемым.
        const color = palette.stomach || VISCERA[700];
        const rx = plan.len * halfLen;
        const ry = plan.thick * halfThick;
        const d = `M ${(-rx * 0.75).toFixed(1)},${(-ry * 0.2).toFixed(1)} ` +
                  `C ${(-rx * 0.7).toFixed(1)},${(-ry * 1.05).toFixed(1)} ` +
                  `${(rx * 0.45).toFixed(1)},${(-ry * 1.1).toFixed(1)} ` +
                  `${(rx * 0.62).toFixed(1)},${(-ry * 0.3).toFixed(1)} ` +
                  `C ${(rx * 0.78).toFixed(1)},${(ry * 0.45).toFixed(1)} ` +
                  `${(rx * 0.2).toFixed(1)},${(ry * 1.02).toFixed(1)} ` +
                  `${(-rx * 0.28).toFixed(1)},${(ry * 0.82).toFixed(1)} ` +
                  `C ${(-rx * 0.72).toFixed(1)},${(ry * 0.66).toFixed(1)} ` +
                  `${(-rx * 0.92).toFixed(1)},${(ry * 0.2).toFixed(1)} ` +
                  `${(-rx * 0.75).toFixed(1)},${(-ry * 0.2).toFixed(1)} Z`;

        group.appendChild(svgEl('path', {
            d, fill: ensureSoftGradient(ctx, `worm-organ-shadow-${ctx.instanceId}`, GRIME_SHADOW, 1),
            opacity: 0.26, transform: 'scale(1.2)'
        }));
        group.appendChild(svgEl('path', { d, fill: color, opacity: 0.92 }));
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: mixColor(color, GRIME_SHADOW, 0.5),
            'stroke-width': SW.detail, opacity: 0.75
        }));
        // Содержимое: пока пусто, наполняется при кормёжке. Отдельным
        // элементом, а не перекраской желудка: желудок должен оставаться
        // собой, просто с комком внутри.
        const content = svgEl('ellipse', {
            class: 'worm-stomach-content',
            cx: (-rx * 0.08).toFixed(1), cy: (ry * 0.12).toFixed(1),
            rx: 0, ry: 0, fill: mixColor(color, BILE[400], 0.5), opacity: 0.85
        });
        setAttr(content, 'data-full-rx', (rx * 0.52).toFixed(1));
        setAttr(content, 'data-full-ry', (ry * 0.46).toFixed(1));
        group.appendChild(content);

        // Складки на своде — стенка желудка не гладкий шар.
        const srng = anatRng(ctx.anatomy, idKey, 'stomach-folds');
        for (let i = 0; i < 3; i++) {
            const fy = -ry * (0.45 - i * 0.3) + (srng() - 0.5) * ry * 0.12;
            group.appendChild(svgEl('path', {
                d: `M ${(-rx * 0.5).toFixed(1)},${fy.toFixed(1)} Q 0,${(fy + ry * 0.22).toFixed(1)} ${(rx * 0.42).toFixed(1)},${(fy + ry * 0.05).toFixed(1)}`,
                fill: 'none', stroke: mixColor(color, GRIME_SHADOW, 0.35),
                'stroke-width': SW.hairline, opacity: 0.5
            }));
        }
    } else if (plan.kind === 'ribs') {
        ribs = buildRibs(ctx, group, plan, halfLen, halfThick);
    }

    setAttr(group, 'transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(plan.rot || 0).toFixed(1)})`);
    return {
        group, x, y, rot: plan.rot || 0, kind: plan.kind, ribs,
        speedMul: plan.speedMul || 1, ampMul: plan.ampMul || 1, phase: plan.phase || 0
    };
}

// ---------- СЛОЙ МЫШЦ ----------
// Продольные тяжи: слегка светлее по верхней грани и темнее по нижней —
// читается как объёмный жгут под кожей, а не как нарисованная полоска.
function buildMuscleLayer(ctx, partName, halfLen, halfThick, enabled) {
    if (enabled === false) return null;
    const muscle = ctx.anatomy.muscle || {};
    const tone = muscle.tone != null ? muscle.tone : 0.55;
    if (tone <= 0.01) return null;
    const bundles = Math.max(1, Math.round(muscle.bundles != null ? muscle.bundles : 3));
    const rng = anatRng(ctx.anatomy, partName, 'muscle');
    const group = svgEl('g', { class: 'worm-muscle-layer' });

    for (let i = 0; i < bundles; i++) {
        const t = bundles === 1 ? 0 : (i / (bundles - 1)) * 2 - 1; // -1..1 поперёк тела
        const cy = t * halfThick * 0.5 + (rng() - 0.5) * halfThick * 0.12;
        const L = halfLen * (0.62 + rng() * 0.24);
        const w = halfThick * (0.16 + rng() * 0.1);
        const bend = (rng() - 0.5) * halfThick * 0.3;
        const d = `M ${(-L).toFixed(1)},${cy.toFixed(1)} Q 0,${(cy + bend).toFixed(1)} ${L.toFixed(1)},${cy.toFixed(1)}`;
        // Тяж читается ОЩУЩЕНИЕМ рельефа, а не нарисованной полоской:
        // непрозрачность намеренно низкая (единицы процентов), светлая грань
        // сверху и тёмная снизу дают лёгкую выпуклость под кожей. Всё, что
        // выше этих значений, немедленно превращается в "полосатую банку".
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: GRIME_HIGHLIGHT,
            'stroke-width': w.toFixed(1), 'stroke-linecap': 'round',
            opacity: (0.055 * tone).toFixed(3),
            transform: `translate(0,${(-w * 0.55).toFixed(1)})`
        }));
        group.appendChild(svgEl('path', {
            d, fill: 'none', stroke: GRIME_SHADOW,
            'stroke-width': (w * 0.8).toFixed(1), 'stroke-linecap': 'round',
            opacity: (0.075 * tone).toFixed(3),
            transform: `translate(0,${(w * 0.6).toFixed(1)})`
        }));
    }
    return group;
}

// ---------- СЛОЙ НЕОДНОРОДНОСТИ ТОНА КОЖИ ----------
// "У каждой особи/сегмента — вариация тона, а не одна плоская заливка":
// 2-4 крупных мягких пятна (светлее/темнее) поверх базовой заливки.
function buildSkinToneLayer(ctx, partName, halfLen, halfThick) {
    const skin = ctx.anatomy.skin || {};
    const amount = skin.toneVariation != null ? skin.toneVariation : 0.55;
    if (amount <= 0.01) return null;
    const rng = anatRng(ctx.anatomy, partName, 'tone');
    const group = svgEl('g', { class: 'worm-skin-tone' });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
        const dark = rng() < 0.55;
        const color = dark ? GRIME_SHADOW : GRIME_HIGHLIGHT;
        const gid = `worm-tone-${ctx.instanceId}-${dark ? 'd' : 'l'}`;
        const fill = ensureSoftGradient(ctx, gid, color, 1);
        const rx = halfLen * (0.28 + rng() * 0.3);
        const ry = halfThick * (0.3 + rng() * 0.32);
        const cx = (rng() * 2 - 1) * halfLen * 0.5;
        const cy = (rng() * 2 - 1) * halfThick * 0.45;
        // Тёмные пятна работают лучше светлых: светлое пятно на розовой коже
        // быстро начинает читаться как запотевшее стекло, тёмное — как
        // неровный пигмент. Поэтому у светлых заметно меньший вес.
        group.appendChild(svgEl('ellipse', {
            cx: cx.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1),
            fill, opacity: ((dark ? 0.34 : 0.14) * amount).toFixed(3)
        }));
    }
    return group;
}

// ---------- СЛОЙ ПОКРЫТИЯ КОЖИ ----------
// Кольцевые бороздки (червь), складки (свинья), поясок-клителлум, щетина,
// матовые участки и ЧЁТКИЙ блик слизи. Разные части тела получают разный
// набор — не одинаковый шаблон на всё тело.
//
// features:
//   rings — кольцевая сегментация; folds — свиные складки;
//   bristle — щетина; clitellum — поясок; vessel — спинной сосуд.
function buildCoatLayer(ctx, partName, halfLen, halfThick, features) {
    const coat = ctx.anatomy.coat || {};
    const rng = anatRng(ctx.anatomy, partName, 'coat');
    const group = svgEl('g', { class: 'worm-coat-layer' });
    let empty = true;

    // --- кольцевые бороздки: у дождевого червя тело разбито на кольца,
    // и это самая узнаваемая его черта. Рисуются дугами ПОПЕРЁК тела.
    // Важно: бороздка — это ВМЯТИНА, а не нарисованная линия. Поэтому она
    // (а) не пересекает сегмент насквозь — обрывается, не доходя до контура,
    // (б) заметно изогнута по кривизне тела, (в) сопровождается светлым
    // ребром с одной стороны. Прямая линия через весь сегмент читается как
    // полоска краски на банке — ровно это и было первой ошибкой.
    //
    // И ещё одно, из-за чего пришлось переделывать второй раз: бороздка,
    // проведённая через ВСЮ ширину части, читается не как вмятина на коже, а
    // как ребро под кожей. На стоящих сегментах эти линии ложились поперёк
    // тела ровными полосами — ровно так же, как рёбра в животе, только без
    // всякого смысла. Настоящая вмятина на округлом теле видна там, где
    // поверхность УХОДИТ от зрителя, то есть у краёв, а в середине, где она
    // повёрнута к нам плашмя, её почти нет. Поэтому от каждой бороздки
    // остались только два коротких конца у силуэта, а середина выброшена.
    const rings = features.rings === false ? 0 : (coat.rings != null ? coat.rings : 0.5);
    if (rings > 0.01) {
        const count = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < count; i++) {
            const t = (i + 1) / (count + 1);
            const x = (t * 2 - 1) * halfLen * 0.66 + (rng() - 0.5) * halfLen * 0.1;
            const h = halfThick * (0.62 + rng() * 0.14);
            const curve = halfLen * 0.22 * (x > 0 ? 1 : -1);
            // Та же дуга, что и раньше, но берутся только её концы: точка на
            // квадратичной кривой считается напрямую, без промера пути.
            const P0 = { x, y: -h }, C = { x: x + curve, y: 0 }, P1 = { x, y: h };
            const pt = (u) => {
                const v = 1 - u;
                return { x: v * v * P0.x + 2 * v * u * C.x + u * u * P1.x,
                         y: v * v * P0.y + 2 * v * u * C.y + u * u * P1.y };
            };
            [[0, 0.3], [0.7, 1]].forEach(([a, b]) => {
                const s0 = pt(a), s1 = pt(b), sm = pt((a + b) / 2);
                // Опорная точка квадратичной дуги через три точки: середина
                // кривой лежит ровно посередине между концами и опорой.
                const cq = { x: 2 * sm.x - (s0.x + s1.x) / 2, y: 2 * sm.y - (s0.y + s1.y) / 2 };
                const d = `M ${s0.x.toFixed(1)},${s0.y.toFixed(1)} ` +
                          `Q ${cq.x.toFixed(1)},${cq.y.toFixed(1)} ${s1.x.toFixed(1)},${s1.y.toFixed(1)}`;
                group.appendChild(svgEl('path', {
                    d, fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': SW.detail,
                    opacity: (0.2 * rings).toFixed(3), 'stroke-linecap': 'round'
                }));
            });
            empty = false;
        }
    }

    // --- поясок (клителлум): у зрелого червя 14-16 сегменты охвачены
    // гладким утолщённым "ошейником". Здесь он живёт на сегменте-2 и
    // заодно визуально сшивает свиную голову с червячным телом.
    if (features.clitellum && (coat.clitellum || 0) > 0.01) {
        const strength = coat.clitellum;
        const w = halfLen * 0.5;
        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: 0, rx: w.toFixed(1), ry: (halfThick * 0.99).toFixed(1),
            fill: GRIME_HIGHLIGHT, opacity: (0.14 * strength).toFixed(3)
        }));
        // Края пояска — по тому же правилу, что и бороздки выше: только
        // концы у силуэта. Целиком проведённые, они давали на стоящем
        // сегменте две ровные полосы поперёк тела — вторую пару «рёбер»
        // там, где рёбер быть не должно.
        [-w, w].forEach(edge => {
            const H = halfThick * 0.92;
            [[-1, -0.42], [0.42, 1]].forEach(([a, b]) => {
                const ya = H * a, yb = H * b;
                // Опора берётся из той же дуги: край пояска слегка выпуклый.
                const bulge = edge * 0.06;
                group.appendChild(svgEl('path', {
                    d: `M ${edge.toFixed(1)},${ya.toFixed(1)} ` +
                       `Q ${(edge + bulge).toFixed(1)},${((ya + yb) / 2).toFixed(1)} ` +
                       `${edge.toFixed(1)},${yb.toFixed(1)}`,
                    fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': SW.detail,
                    opacity: (0.32 * strength).toFixed(3), 'stroke-linecap': 'round'
                }));
            });
        });
        empty = false;
    }

    // --- свиные складки: короткие мягкие дуги у "плеча" (там, где кожа
    // собирается при движении). Длинные штрихи через всю часть читались на
    // морде как царапины или усы — поэтому длина ограничена третью
    // поперечника, а сами складки прижаты к краю силуэта.
    if (features.folds && (coat.folds || 0) > 0.01) {
        const strength = coat.folds;
        const count = 2;
        for (let i = 0; i < count; i++) {
            const x = -halfLen * (0.42 + i * 0.18) - rng() * halfLen * 0.05;
            const y0 = -halfThick * (0.05 + rng() * 0.16);
            const len = halfThick * (0.24 + rng() * 0.12);
            const d = `M ${x.toFixed(1)},${y0.toFixed(1)} q ${(halfLen * 0.08).toFixed(1)},${(len * 0.5).toFixed(1)} ${(-halfLen * 0.02).toFixed(1)},${len.toFixed(1)}`;
            group.appendChild(svgEl('path', {
                d, fill: 'none', stroke: GRIME_SHADOW, 'stroke-width': SW.detail,
                opacity: (0.16 * strength).toFixed(3), 'stroke-linecap': 'round'
            }));
            group.appendChild(svgEl('path', {
                d, fill: 'none', stroke: GRIME_HIGHLIGHT, 'stroke-width': SW.hairline,
                opacity: (0.1 * strength).toFixed(3), 'stroke-linecap': 'round',
                transform: 'translate(-1.2,0)'
            }));
            empty = false;
        }
    }

    // --- щетина: короткие редкие волоски ВДОЛЬ ВЕРХНЕГО КРАЯ силуэта.
    // Раньше они сеялись по всей площади части и на морде читались как
    // царапины/усы. Настоящая свиная щетина заметна именно на просвет по
    // контуру — поэтому каждый волосок ставится на дугу у края (радиус
    // 0.72..0.94 от габарита) и растёт наружу, коротким штрихом.
    if (features.bristle && (coat.bristle || 0) > 0.01) {
        const strength = coat.bristle;
        const count = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < count; i++) {
            // Угол только по верхней половине: 200°..340°.
            const ang = (200 + (i / count) * 140 + rng() * 12) * Math.PI / 180;
            const rr = 0.72 + rng() * 0.2;
            const bx = Math.cos(ang) * halfLen * rr;
            const by = Math.sin(ang) * halfThick * rr;
            const len = 1.6 + rng() * 1.8;
            group.appendChild(svgEl('path', {
                d: `M ${bx.toFixed(1)},${by.toFixed(1)} l ${(Math.cos(ang) * len).toFixed(1)},${(Math.sin(ang) * len * 1.2).toFixed(1)}`,
                stroke: GRIME_SHADOW, 'stroke-width': SW.hairline, fill: 'none',
                opacity: (0.32 * strength).toFixed(3), 'stroke-linecap': 'round'
            }));
            empty = false;
        }
    }

    // --- спинной сосуд: тёмная линия, идущая под кожей вдоль всей спины.
    // У настоящего дождевого червя это самая заметная просвечивающая
    // структура — и заодно бесплатный способ связать сегменты в одно тело.
    if (features.vessel && (coat.dorsalVessel || 0) > 0.01) {
        const palette = (ctx.anatomy.organs && ctx.anatomy.organs.palette) || {};
        const strength = coat.dorsalVessel;
        const y = -halfThick * 0.55;
        group.appendChild(svgEl('path', {
            d: `M ${(-halfLen * 0.9).toFixed(1)},${y.toFixed(1)} Q 0,${(y - halfThick * 0.12).toFixed(1)} ${(halfLen * 0.9).toFixed(1)},${y.toFixed(1)}`,
            fill: 'none', stroke: palette.vessel || VISCERA[700], 'stroke-width': SW.detail,
            opacity: (0.5 * strength).toFixed(3), 'stroke-linecap': 'round'
        }));
        empty = false;
    }

    return empty ? null : group;
}

// ---------- ПОВЕРХНОСТЬ: БЛЕСК СЛИЗИ И МАТОВЫЕ УЧАСТКИ ----------
// Отдельный слой от buildCoatLayer, и вот почему: складки, кольца и щетина —
// свойства САМОЙ ТКАНИ, они живут в системе координат тела (вдоль/поперёк
// сегмента). А блеск — это отражение внешнего света, он должен быть с одной
// и той же стороны у ВСЕХ частей тела, как бы они ни были повёрнуты. Пока
// блеск считался вместе с остальным покрытием, у вертикально стоящих
// сегментов он уезжал вбок и читался как полоска краски на банке.
//
// Форма блика — узкий серп с ЧЁТКИМИ краями, изогнутый по кривизне части
// (референс: в 2D слизь и мокрая кожа рисуются жёсткой кистью поверх
// матовой основы; размытое пятно вместо блика — самая частая ошибка,
// именно она и провалила первую попытку с blur).
function buildSurfaceLayer(ctx, partName, rx, ry, features) {
    const coat = ctx.anatomy.coat || {};
    const group = svgEl('g', { class: 'worm-surface-layer' });
    let empty = true;

    // Контактная тень: часть, стоящая непосредственно под другой (шея под
    // головой), должна получать от неё тень — иначе на светлой коже шеи
    // граница головы растворяется и голова кажется парящей.
    if (features && features.contactTop) {
        const gid = `worm-contact-${ctx.instanceId}`;
        group.appendChild(svgEl('ellipse', {
            cx: 0, cy: (-ry * 0.72).toFixed(1),
            rx: (rx * 0.92).toFixed(1), ry: (ry * 0.5).toFixed(1),
            fill: ensureSoftGradient(ctx, gid, GRIME_SHADOW, 1),
            opacity: (0.3 * (features.contactStrength || 1)).toFixed(3)
        }));
        empty = false;
    }

    const matte = coat.matte != null ? coat.matte : 0.35;
    if (matte > 0.01) {
        const gid = `worm-matte-${ctx.instanceId}`;
        const fill = ensureSoftGradient(ctx, gid, GRIME_SHADOW, 1);
        group.appendChild(svgEl('ellipse', {
            cx: (rx * 0.3).toFixed(1), cy: (ry * 0.42).toFixed(1),
            rx: (rx * 0.46).toFixed(1), ry: (ry * 0.42).toFixed(1),
            fill, opacity: (0.26 * matte).toFixed(3)
        }));
        empty = false;
    }

    const gloss = coat.slimeGloss != null ? coat.slimeGloss : 0.55;
    if (gloss > 0.01) {
        // Серп: внешняя дуга по верхне-левой части силуэта, внутренняя —
        // чуть ниже, из-за чего фигура сходится в тонкие острые концы.
        const R = 0.62;                 // на каком удалении от центра лежит блик
        const a0 = Math.PI * 1.12, a1 = Math.PI * 1.62; // сектор верх-лево
        const p = (ang, k) => `${(Math.cos(ang) * rx * R * k).toFixed(1)},${(Math.sin(ang) * ry * R * k).toFixed(1)}`;
        const mid = (a0 + a1) / 2;
        const d = `M ${p(a0, 1)} Q ${p(mid, 1.13)} ${p(a1, 1)} Q ${p(mid, 0.9)} ${p(a0, 1)} Z`;
        // Широкий серп — это ОТРАЖЁННЫЙ СВЕТ на влажной коже, а не сама
        // слизь, поэтому он тёплый, а не кислотный: блик перенимает цвет
        // источника света, а не вещества. Кислоту сюда класть нельзя ещё и
        // физически — полупрозрачная заливка не может быть насыщеннее смеси
        // с подложкой, кислотная зелень на розовом даёт хаки, и акцент
        // умирает, размазанный по большой площади.
        group.appendChild(svgEl('path', { d, fill: SPEC, opacity: (0.3 * gloss).toFixed(3) }));
        // Кислотной капли здесь БОЛЬШЕ НЕТ. Она стояла на каждой части тела
        // (и на голове тоже) и в игре читалась не как капля слизи, а как
        // жёлто-зелёная точка непонятного происхождения — одинаковая на всех
        // сегментах, будто метки на выкройке. Акцент малой площадью работает
        // там, где он ОДИН и объясним; размноженный по всем частям он
        // становится сыпью. Влажность кожи держит широкий серп выше.
        empty = false;
    }

    return empty ? null : group;
}

// ---------- СБОРКА ВСЕЙ СТОПКИ СЛОЁВ ДЛЯ ОДНОЙ ЧАСТИ ТЕЛА ----------
// Возвращает { group, organs, muscleGroup } либо null, если анатомия
// выключена. group — ОДИН узел, который вызывающий код кладёт в нужное
// место своей части; всё, что внутри, обрезано по силуэту этой части.
//
// axis:  'x' — тело части вытянуто вдоль экранного X (напольная цепь,
//              живот, хвост);
//        'y' — часть стоит "столбиком" (сегменты между головой и животом):
//              слои строятся в той же локальной системе (вдоль → +X) и
//              разворачиваются поворотом на 90°, чтобы продольные структуры
//              шли вдоль тела, а не поперёк него.
function buildAnatomyStack(ctx, partName, opts) {
    const anatomy = ctx.anatomy;
    if (!anatomy.enabled) return null;

    const rx = opts.rx, ry = opts.ry;
    const axis = opts.axis || 'x';
    const halfLen = axis === 'x' ? rx : ry;
    const halfThick = axis === 'x' ? ry : rx;

    // Клип по силуэту части — гарантия, что ни один слой не вылезет на
    // соседний сегмент, какие бы параметры ни выставили.
    const clipId = `worm-anat-clip-${ctx.instanceId}-${partName}`;
    const clip = svgEl('clipPath', { id: clipId });
    if (opts.clipPathData) {
        clip.appendChild(svgEl('path', { d: opts.clipPathData }));
    } else {
        clip.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
    }
    ctx.defs.appendChild(clip);

    // Внешняя группа — её масштабирует tick() (дыхание/раздутие живота).
    // Внутренняя — держит клип, ещё внутри — разворот вдоль оси тела.
    const outer = svgEl('g', { class: 'worm-anatomy', 'data-anat': partName });
    const clipped = svgEl('g', { 'clip-path': `url(#${clipId})` });
    const axisGroup = svgEl('g', axis === 'y' ? { transform: 'rotate(90)' } : null);
    clipped.appendChild(axisGroup);
    outer.appendChild(clipped);

    const layers = {};
    layers.tone = buildSkinToneLayer(ctx, partName, halfLen, halfThick);

    if ((anatomy.skin && (anatomy.skin.dorsalDarkening || anatomy.skin.ventralLightening))) {
        const dv = svgEl('ellipse', {
            cx: 0, cy: 0, rx: halfLen.toFixed(2), ry: halfThick.toFixed(2),
            fill: ensureDorsoVentralGradient(ctx)
        });
        layers.dorsoventral = dv;
    }

    layers.muscle = buildMuscleLayer(ctx, partName, halfLen, halfThick, opts.muscle);

    // Органы: собственная группа с непрозрачностью = общая видимость ×
    // локальная тонкость кожи в этой зоне. Именно здесь "разная степень
    // просвечивания в разных местах" — не в blur и не в blend-mode.
    const organs = [];
    const zone = opts.organZone;
    if (zone && anatomy.organs && (anatomy.organs.visibility || 0) > 0.01) {
        const thin = anatThinness(anatomy, partName, ctx.growingCount);
        const alpha = clamp01(anatomy.organs.visibility * thin);
        if (alpha > 0.02) {
            const rng = anatRng(anatomy, partName, 'organs');
            const plan = organPlanForZone(zone, rng);
            // Пустого узла не заводим: после чистки органы остались только в
            // животе, а у остальных зон план пустой.
            if (plan.length) {
                const organGroup = svgEl('g', { class: 'worm-organ-layer', opacity: alpha.toFixed(3) });
                plan.forEach((p, i) => {
                    const built = buildOrganNode(ctx, p, halfLen, halfThick, `${partName}-${i}`);
                    organGroup.appendChild(built.group);
                    organs.push(built);
                });
                layers.organs = organGroup;
            }
        }
    }

    layers.coat = buildCoatLayer(ctx, partName, halfLen, halfThick, opts.coat || {});

    // Порядок слоёв — ЯВНЫЙ (ANAT_LAYER_ORDER), а не "как получилось".
    ANAT_LAYER_ORDER.forEach(name => {
        if (layers[name]) axisGroup.appendChild(layers[name]);
    });

    // Блеск/матовость — последними и УЖЕ ВНЕ поворота оси тела: свет падает
    // на персонажа снаружи, он не поворачивается вместе с сегментом.
    const surface = buildSurfaceLayer(ctx, partName, rx, ry, opts.surface || {});
    if (surface) clipped.appendChild(surface);

    return { group: outer, organs, muscleGroup: layers.muscle || null };
}

