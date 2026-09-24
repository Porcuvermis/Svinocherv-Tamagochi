// ================= ЕДИНЫЙ СИЛУЭТ, КОЛЬЦА, КИШЕЧНЫЙ ТРАКТ =================
// Седьмой файл стопки рендерера (карта — в worm-basis.js).
//
// Общее у всех троих: они принадлежат ВСЕМУ телу, а не отдельному звену.
// Поэтому и живут снаружи частей — иначе на каждом стыке виден шов, а кишка
// рвётся на повороте.

// ---------- СБОРКА ВСЕЙ ЦЕПОЧКИ ТЕЛА ----------
// ============================================================================
//                   ЕДИНЫЙ СИЛУЭТ ТЕЛА (BODY HULL)
// ============================================================================
// Раньше тело читалось как СТОПКА ОТДЕЛЬНЫХ ШАРОВ: у каждого сегмента была
// своя обводка, и на каждом стыке был виден шов. На качественных артах такого
// существа тело — ОДНО непрерывное, а сегментация сделана перетяжками ПОВЕРХ
// него, а не границами между шарами. Это самое крупное отличие, и оно чинится
// не косметикой, а сменой способа сборки силуэта.
//
// Как строится единый силуэт (без вычисления настоящей огибающей, которая на
// поворотах цепи даёт вырожденные дуги):
//   • тело = набор КРУГОВ (по одному на часть) + МОСТЫ между соседями
//     (трапеции по касательным) — вместе они дают ровно ту же фигуру, что и
//     огибающая, но каждая её деталь остаётся простым SVG-примитивом;
//   • контур — не обводка каждой части, а ОДНА тёмная копия всей фигуры,
//     раздутая на толщину контура и лежащая ПОД телом (приём "fake outline").
//     Никаких пересекающихся линий на стыках в принципе не возникает;
//   • та же фигура, собранная третий раз, служит clipPath — по нему
//     обрезаются перетяжки и отражённый свет, чтобы они не выходили за тело.
// Все три копии обновляются в tick() перестановкой атрибутов уже созданных
// узлов — новых элементов за кадр не создаётся.

// Мост между двумя кругами: трапеция по внешним касательным. Именно она
// заполняет промежуток между соседними частями, из-за которого тело раньше
// выглядело набором отдельных шаров.
function bridgeQuadPath(a, b, pad) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return '';
    const nx = -dy / d, ny = dx / d;      // единичная нормаль к оси моста
    const ra = a.r + (pad || 0), rb = b.r + (pad || 0);
    const p1x = a.x + nx * ra, p1y = a.y + ny * ra;
    const p2x = b.x + nx * rb, p2y = b.y + ny * rb;
    const p3x = b.x - nx * rb, p3y = b.y - ny * rb;
    const p4x = a.x - nx * ra, p4y = a.y - ny * ra;
    return `M ${p1x.toFixed(1)},${p1y.toFixed(1)} L ${p2x.toFixed(1)},${p2y.toFixed(1)} ` +
           `L ${p3x.toFixed(1)},${p3y.toFixed(1)} L ${p4x.toFixed(1)},${p4y.toFixed(1)} Z`;
}

// Три синхронных представления одной фигуры: контур (раздутая тёмная копия),
// заполнение мостов и clipPath. Узлы создаются один раз на пересборке,
// дальше только переставляются координаты.
function createHullLayers(ctx, count, outlineColor, outlineWidth) {
    const clipId = `worm-hull-clip-${ctx.instanceId}`;
    const clip = svgEl('clipPath', { id: clipId });
    const outline = svgEl('g', { class: 'worm-hull-outline' });
    // Отражённый свет — ЕЩЁ ОДНА копия силуэта, светлая, чуть меньше
    // раздутая и сдвинутая вниз-вправо. Лежит между тёмным контуром и телом:
    // сверху-слева её перекрывает само тело, а снизу-справа остаётся узкая
    // светлая кайма. Тот же приём, что и с контуром, — никаких масок и
    // фильтров, и, в отличие от дуг по каждому кругу, кайма нигде не
    // проходит по внутренним стыкам.
    const rimFill = mixColor(ctx.rimBaseColor || outlineColor, GRIME_HIGHLIGHT, 0.5);
    const rimGroup = svgEl('g', { class: 'worm-hull-rim', opacity: 0.55, transform: 'translate(1,1.8)' });
    const bridges = svgEl('g', { class: 'worm-hull-bridges' });

    const outlineCircles = [], outlineBridges = [], clipCircles = [], clipBridges = [],
          bridgeShapes = [], rimCircles = [], rimBridges = [];
    for (let i = 0; i < count; i++) {
        const oc = svgEl('circle', { cx: 0, cy: 0, r: 0, fill: outlineColor });
        outline.appendChild(oc); outlineCircles.push(oc);
        const rc = svgEl('circle', { cx: 0, cy: 0, r: 0, fill: rimFill });
        rimGroup.appendChild(rc); rimCircles.push(rc);
        const cc = svgEl('circle', { cx: 0, cy: 0, r: 0 });
        clip.appendChild(cc); clipCircles.push(cc);
        if (i < count - 1) {
            const ob = svgEl('path', { d: '', fill: outlineColor });
            outline.appendChild(ob); outlineBridges.push(ob);
            const rb = svgEl('path', { d: '', fill: rimFill });
            rimGroup.appendChild(rb); rimBridges.push(rb);
            const cb = svgEl('path', { d: '' });
            clip.appendChild(cb); clipBridges.push(cb);
            const bs = svgEl('path', { d: '', fill: 'none' });
            bridges.appendChild(bs); bridgeShapes.push(bs);
        }
    }
    ctx.defs.appendChild(clip);
    return { clipId, clip, outline, rimGroup, bridges, outlineCircles, outlineBridges,
             rimCircles, rimBridges, clipCircles, clipBridges, bridgeShapes, outlineWidth };
}

// Перетяжки между частями ("кольца"). На арте это не линия, а ВАЛИК: тень
// перед ним и подсветка после. Собирается из двух узких эллипсов, повёрнутых
// поперёк оси тела, и обрезается по силуэту.
function createRingLayers(ctx, count) {
    const group = svgEl('g', { class: 'worm-body-rings', 'clip-path': `url(#worm-hull-clip-${ctx.instanceId})` });
    // Валик собран из мягких градиентных пятен, а не из плоских эллипсов:
    // жёсткая тёмная полоса поперёк тела читается как шов/стяжка ремнём, а
    // нужна вмятина — тень, плавно сходящая на нет по обе стороны.
    const shadeFill = ensureSoftGradient(ctx, `worm-ring-shade-${ctx.instanceId}`, GRIME_SHADOW, 1);
    const lightFill = ensureSoftGradient(ctx, `worm-ring-light-${ctx.instanceId}`, GRIME_HIGHLIGHT, 1);
    const rings = [];
    for (let i = 0; i < count; i++) {
        const g = svgEl('g', { class: 'worm-body-ring' });
        const shade = svgEl('ellipse', { cx: 0, cy: 0, rx: 3, ry: 10, fill: shadeFill, opacity: 0.3 });
        const light = svgEl('ellipse', { cx: 3, cy: 0, rx: 2, ry: 10, fill: lightFill, opacity: 0.26 });
        const crease = svgEl('ellipse', { cx: 0, cy: 0, rx: 0.9, ry: 10, fill: shadeFill, opacity: 0.4 });
        g.appendChild(shade); g.appendChild(light); g.appendChild(crease);
        group.appendChild(g);
        rings.push({ g, shade, light, crease });
    }
    return { group, rings };
}

// ============================================================================
//                  ЕДИНЫЙ КИШЕЧНЫЙ ТРАКТ (GUT TRACT)
// ============================================================================
// Кишка не может жить кусками внутри отдельных сегментов: каждый кусок знает
// только свой сегмент, поэтому на каждом стыке неизбежен разрыв, и на
// повороте тела (тело идёт вертикально от головы и разворачивается в животе
// к хвосту) куски смотрят в разные стороны. Поэтому тракт вынесен на уровень
// ВСЕГО ТЕЛА — ровно тем же приёмом, что и единый силуэт:
//
//   • осевая линия тракта строится по центрам тех же самых кругов силуэта,
//     то есть автоматически повторяет текущий изгиб тела, дыхание и
//     раздутие живота — разойтись с телом она не может;
//   • вдоль осевой тракт колеблется по нормали: в шее и хвосте это спокойная
//     волна, а в животе частота и амплитуда резко растут — получается
//     змеевидная петля кишечника, из которой тракт выходит вверх к голове и
//     вниз к хвосту одной неразрывной трубой;
//   • труба рисуется ЛЕНТОЙ (замкнутый контур из двух смещённых кромок), а
//     не линией со stroke: только так толщина может меняться вдоль тракта —
//     толще в животе, сходя на нет к голове и к кончику хвоста;
//   • весь тракт обрезается тем же clipPath, что и силуэт, поэтому нигде не
//     выходит за тело.

// Плотное сэмплирование осевой линии тела: сглаженная кривая Catmull-Rom
// через центры кругов силуэта, с интерполяцией радиуса тела вдоль неё.
function sampleBodyAxis(circles, step) {
    const pts = circles.filter(c => c && c.r > 0.5);
    if (pts.length < 2) return [];
    const out = [];
    const at = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const n = Math.max(2, Math.ceil(segLen / step));
        for (let j = 0; j < n; j++) {
            const t = j / n, t2 = t * t, t3 = t2 * t;
            // Catmull-Rom: проходит через опорные точки, гладко стыкуется.
            out.push({
                x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
                r: p1.r + (p2.r - p1.r) * t
            });
        }
    }
    out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, r: pts[pts.length - 1].r });

    // Накопленная длина и касательная — от них считаются нормаль и фаза волны.
    let acc = 0;
    for (let i = 0; i < out.length; i++) {
        const prev = out[i - 1], next = out[i + 1];
        if (prev) acc += Math.hypot(out[i].x - prev.x, out[i].y - prev.y);
        out[i].s = acc;
        const a = prev || out[i], b = next || out[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        out[i].nx = -dy / len;
        out[i].ny = dx / len;
    }
    return out;
}

// Гладкая кривая через набор точек: каждая точка становится контрольной, а
// стыки ставятся в серединах отрезков — классический приём, дающий
// непрерывную касательную без вычисления сплайна.
function smoothPolyline(pts, continueFromCurrent) {
    if (!pts.length) return '';
    // Координаты округляются до целых: на экране разница незаметна, а строка
    // пути (её переставляют каждый второй кадр) становится заметно короче.
    const r = v => Math.round(v);
    let d = (continueFromCurrent ? ' L ' : 'M ') + `${r(pts[0][0])},${r(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
        d += ` Q ${r(pts[i][0])},${r(pts[i][1])} ${r((pts[i][0] + pts[i + 1][0]) / 2)},${r((pts[i][1] + pts[i + 1][1]) / 2)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${r(last[0])},${r(last[1])}`;
    return d;
}

// Геометрия тракта: возвращает d ленты и d центральной жилы.
// bellyPoint — центр живота: вокруг него тракт сворачивается в петли.
function buildGutTractGeometry(axis, bellyPoint, cfg) {
    if (!axis.length) return { ribbon: '', core: '' };
    const total = axis[axis.length - 1].s || 1;
    const maxR = axis.reduce((m, p) => Math.max(m, p.r), 1);

    // Где по длине тракта находится живот (в единицах накопленной длины).
    let bellyS = total * 0.5, bellyR = maxR;
    if (bellyPoint) {
        let best = Infinity;
        axis.forEach(p => {
            const d = Math.hypot(p.x - bellyPoint.x, p.y - bellyPoint.y);
            if (d < best) { best = d; bellyS = p.s; bellyR = p.r; }
        });
    }
    const bellyReach = Math.max(24, bellyR * 1.9); // насколько далеко тянется зона петель

    const left = [], right = [], core = [], coreR = [];
    let phase = cfg.phase || 0;
    let prevS = axis[0].s;

    for (let i = 0; i < axis.length; i++) {
        const p = axis[i];
        // 0 в шее/хвосте → 1 в самом центре живота. Плавно, без ступеньки.
        const near = clamp01(1 - Math.abs(p.s - bellyS) / bellyReach);
        const belly = near * near * (3 - 2 * near); // smoothstep

        // Частота: в животе витки заметно чаще — это и читается как
        // "кишечник сложен змейкой", а не как одна волнистая труба.
        const waveLen = lerp(cfg.waveLength, cfg.waveLength / cfg.loopDensity, belly);
        phase += ((p.s - prevS) / Math.max(4, waveLen)) * Math.PI * 2;
        prevS = p.s;

        // Амплитуда ограничена радиусом тела в этой точке — тракт физически
        // не может прижаться к стенке или вылезти наружу.
        let amp = p.r * lerp(cfg.wave, cfg.bellyWave, belly);
        const off0 = Math.sin(phase);
        // Смещение петель вниз внутри живота. Кишечник занимает низ брюшной
        // полости, а верх оставляет желудку и сердцу — иначе петли ложатся
        // прямо на них, и вместо органов видно штриховку.
        const bias = p.r * (cfg.bellyBias || 0) * belly;

        // Толщина: толще в животе, сходит на нет к голове и кончику хвоста,
        // иначе труба выглядит обрубленной.
        const endFade = clamp01(Math.min(p.s, total - p.s) / (total * 0.1));
        const w = Math.max(0.6, p.r * lerp(cfg.width, cfg.bellyWidth, belly) * (0.35 + 0.65 * endFade));
        // Труба вместе со своей толщиной обязана оставаться внутри тела:
        // прижатая к стенке кишка читается как трещина на коже, а не как
        // орган под ней.
        amp = Math.min(amp, Math.max(0, p.r * 0.72 - w));
        const off = off0 * amp;

        const cx = p.x + p.nx * (off + bias), cy = p.y + p.ny * (off + bias);
        left.push([cx + p.nx * w, cy + p.ny * w]);
        right.push([cx - p.nx * w, cy - p.ny * w]);
        core.push([cx, cy]);
    }

    // Кромки собираются КРИВЫМИ, а не отрезками: ломаная на витках кишечника
    // мгновенно читается как зигзаг из палок, а не как мягкая трубка.
    const ribbon = smoothPolyline(left, false) + ' ' + smoothPolyline(right.slice().reverse(), true) + ' Z';
    // corePts — сырые точки осевой линии. Нужны, чтобы ставить куски еды на
    // тракт арифметикой, а не промером SVG-пути: строка пути переписывается
    // каждый кадр, и getTotalLength каждый раз меряет её заново.
    // Строка осевой линии больше не нужна (жилу убрали), но сами точки —
    // нужны: по ним едет еда.
    return { ribbon, corePts: core, coreR };
}

// ---------- КОМОК ЕДЫ ----------
// Три узла на комок, и все три собираются один раз: за кадр у комка меняется
// РОВНО ДВА атрибута — transform группы и её прозрачность. Всё остальное
// (размер, цвет, блик) переставляется только когда меняется сам список еды,
// то есть раз в несколько секунд.
//
// Почему комок не просто эллипс: одна плоская клякса под кожей читается как
// пятно грязи. Из трёх пятен получается объём — светлое пятно шире комка
// (кишку распирает), сам комок с контуром и блик на нём.
function createBolusNode(gutColor) {
    const g = svgEl('g', { class: 'worm-bolus', opacity: 0 });
    // Перетяжка ПОЗАДИ комка — та самая мышца, которая его толкает. Стоит
    // одного узла, а даёт главное: видно не «шарик едет», а «его пропихивают».
    const pinch = svgEl('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0, fill: 'none',
        stroke: mixColor(gutColor, GRIME_SHADOW, 0.5), 'stroke-width': SW.detail,
        opacity: 0 });
    // Растянутая стенка кишки. Цвет — самой кишки, но светлее: натянутая
    // ткань бликует, и именно по этому светлому ободу видно, что комок
    // сидит ВНУТРИ трубы, а не лежит поверх неё.
    const wall = svgEl('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0,
        fill: mixColor(gutColor, GRIME_HIGHLIGHT, 0.5), opacity: 0.6 });
    // Сам комок — тёмная жёлчная масса с чернильным контуром. Контур здесь
    // не украшение: без него комок сливается с бордовой кишкой в мутное
    // пятно, а он и есть то единственное, за чем игрок следит.
    const body = svgEl('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0,
        fill: mixColor(BILE[600], GRIME_HIGHLIGHT, 0.35),
        stroke: INK, 'stroke-width': SW.structure, 'stroke-opacity': 0.7 });
    // Два тёмных куска внутри — еда не однородная масса. Без них комок
    // читается как гладкое яйцо, а не как проглоченный кусок.
    const chunkFill = mixColor(BILE[600], GRIME_SHADOW, 0.45);
    const chunkA = svgEl('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0, fill: chunkFill, opacity: 0.55 });
    const chunkB = svgEl('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0, fill: chunkFill, opacity: 0.4 });
    const shine = svgEl('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0,
        fill: mixColor(BILE[200], FLESH[100], 0.5), opacity: 0.7 });
    g.appendChild(pinch);
    g.appendChild(wall);
    g.appendChild(body);
    g.appendChild(chunkA);
    g.appendChild(chunkB);
    g.appendChild(shine);
    // Исходные цвета хранятся при узле: комок рождается ПОСЛЕ сборки тела и
    // в список запекания истощения не попадает — красить его приходится
    // отдельно (bakeWither внизу проходит и по комкам).
    return { group: g, pinch, wall, body, chunkA, chunkB, shine, size: -1, shown: false,
             base: { wall: wall.getAttribute('fill'), body: body.getAttribute('fill'),
                     shine: shine.getAttribute('fill') } };
}

// Плотность кожи в точке s (0..1 вдоль цепи звеньев). Та же величина, по
// которой построена маска тракта, только читается арифметикой: слой еды
// маске больше не подчиняется и считает свою видимость сам.
function skinThinAt(arr, s) {
    if (!arr || arr.length < 2) return 1;
    const f = Math.max(0, Math.min(1, s)) * (arr.length - 1);
    const i0 = Math.min(arr.length - 2, Math.floor(f));
    const k = f - i0;
    const a = arr[i0] || 0, b = arr[i0 + 1] || 0;
    return a + (b - a) * k;
}

// Узлы тракта: тень под трубой → сама труба с контуром → светлая жила.
// Создаются один раз, в tick() у них меняется только атрибут d.
// thinByIdx — плотность кожи по звеньям цепи (0 = кожа непрозрачная).
//
// Тракт — одна неразрывная труба на всё тело, поэтому «сколько его видно»
// нельзя задать послойно, как у остальных органов. Вместо этого на него
// вешается маска из мягких кругов по звеньям тела: где кожа плотная (голова,
// хвост), круг почти чёрный и кишка не видна вовсе; где тонкая (живот) —
// белый, и труба просвечивает целиком.
//
// Это ровно то же правило, что и у органов, просто выраженное маской:
// органы всегда нарисованы, вопрос только в том, сколько кожи над ними.
function createGutTract(ctx, thinByIdx) {
    const anatomy = ctx.anatomy;
    const palette = (anatomy.organs && anatomy.organs.palette) || {};
    const color = palette.gut || FLESH[700];
    const group = svgEl('g', {
        class: 'worm-gut-tract',
        'clip-path': `url(#worm-hull-clip-${ctx.instanceId})`
    });

    const maskId = `worm-gut-mask-${ctx.instanceId}`;
    const mask = svgEl('mask', { id: maskId, maskUnits: 'userSpaceOnUse' });
    const softWhite = ensureSoftGradient(ctx, `worm-gut-soft-${ctx.instanceId}`, '#ffffff', 1);
    const maskCircles = (thinByIdx || []).map(thin => {
        const c = svgEl('circle', {
            cx: 0, cy: 0, r: 0, fill: softWhite,
            opacity: Math.max(0, Math.min(1, thin)).toFixed(3)
        });
        mask.appendChild(c);
        return c;
    });
    if (maskCircles.length) {
        ctx.defs.appendChild(mask);
        setAttr(group, 'mask', `url(#${maskId})`);
    }
    // Отдельного узла-тени нет намеренно: строка пути тракта длинная (~3 КБ),
    // и переставлять её дважды за кадр — самая дорогая операция во всём
    // рендере. Роль тени и контура одновременно играет широкая тёмная
    // обводка самой трубы.
    const tube = svgEl('path', {
        d: '', fill: color, stroke: mixColor(color, GRIME_SHADOW, 0.55),
        'stroke-width': SW.structure, 'stroke-linejoin': 'round', opacity: 0.95
    });
    // Светлой «жилы» по оси кишки здесь БОЛЬШЕ НЕТ. Она шла одной линией
    // через всё тело и читалась не как блик на трубе, а как хребет — причём
    // с той стороны, где хребта нет: «что это за белая линия, от которой
    // растут рёбра?». Труба со своей тёмной обводкой обходится без неё.
    group.appendChild(tube);

    // ---------- ЕДА ЕДЕТ ОТДЕЛЬНЫМ СЛОЕМ ----------
    // Раньше комки лежали ВНУТРИ группы тракта и подчинялись её маске. Это
    // выглядело правильно (у головы кожа плотная — комка не видно), но
    // стоило кадров ровно так же, как фильтр истощения из правки 153: любое
    // изменение внутри группы с маской и обрезкой заставляет браузер
    // пересчитать всю группу целиком. Кишка пересчитывается по лестнице
    // разрежения (на слабом телефоне впятеро реже), а еда двигалась по
    // своим часам — и сводила лестницу на нет. Отсюда и жалоба: «покормил —
    // персонаж залагал, желудок наполнился — лаги прошли». Всё сходится: в
    // фазе желудка комков нет, и никто группу не трогает.
    //
    // Поэтому слой еды живёт СНАРУЖИ, без маски и обрезки, а «сколько её
    // видно сквозь кожу» считается арифметикой в самом комке — по той же
    // плотности кожи, из которой построена маска.
    const foodLayer = svgEl('g', { class: 'worm-food-layer' });

    return { group, tube, maskCircles, foodLayer, foodNodes: [],
             color, thinByIdx: thinByIdx || [] };
}

// Пересчёт всех трёх копий силуэта + перетяжек + отражённого света + тени.
// Вызывается раз за кадр из tick(): создаётся ноль новых узлов, меняются
// только атрибуты уже существующих.
// shadowCircles — по чему класть тень на полу, если не по тем же кругам:
// у тела, которое кончается животом (opts.endAtBelly), тень остаётся от
// ПОЛНОЙ цепочки, чтобы габарит и раскладка персонажа не поехали.
function updateBodyHull(built, circles, shadowCircles) {
    const hull = built.hull, rings = built.rings, rim = built.rim;
    if (!hull) return;
    const W = hull.outlineWidth;

    for (let i = 0; i < hull.outlineCircles.length; i++) {
        const c = circles[i];
        const oc = hull.outlineCircles[i], cc = hull.clipCircles[i], rc = hull.rimCircles[i];
        if (!c || !(c.r > 0)) { setAttr(oc, 'r', 0); setAttr(cc, 'r', 0); setAttr(rc, 'r', 0); continue; }
        setAttr(oc, 'cx', c.x.toFixed(1)); setAttr(oc, 'cy', c.y.toFixed(1)); setAttr(oc, 'r', (c.r + W).toFixed(1));
        setAttr(rc, 'cx', c.x.toFixed(1)); setAttr(rc, 'cy', c.y.toFixed(1)); setAttr(rc, 'r', (c.r + W * 0.45).toFixed(1));
        setAttr(cc, 'cx', c.x.toFixed(1)); setAttr(cc, 'cy', c.y.toFixed(1)); setAttr(cc, 'r', c.r.toFixed(1));
    }

    // Маска кишечного тракта ходит вместе с телом: круги стоят на тех же
    // местах, что и звенья силуэта, и обновляются в том же цикле, чтобы
    // «сколько видно кишку» не отставало от движения на кадр.
    const gutMask = built.gutTract && built.gutTract.maskCircles;
    if (gutMask) {
        for (let i = 0; i < gutMask.length; i++) {
            const c = circles[i];
            const mc = gutMask[i];
            if (!mc) continue;
            if (!c || !(c.r > 0)) { setAttr(mc, 'r', 0); continue; }
            setAttr(mc, 'cx', c.x.toFixed(1));
            setAttr(mc, 'cy', c.y.toFixed(1));
            // Чуть шире звена: соседние круги должны перекрываться, иначе на
            // стыках появятся тёмные перехваты — кишка будет «пунктиром».
            setAttr(mc, 'r', (c.r * 1.5).toFixed(1));
        }
    }

    for (let i = 0; i < hull.bridgeShapes.length; i++) {
        const a = circles[i], b = circles[i + 1];
        const ob = hull.outlineBridges[i], cb = hull.clipBridges[i], bs = hull.bridgeShapes[i], rb = hull.rimBridges[i];
        if (!a || !b || !(a.r > 0) || !(b.r > 0)) {
            setAttr(ob, 'd', ''); setAttr(cb, 'd', ''); setAttr(bs, 'd', ''); setAttr(rb, 'd', '');
            continue;
        }
        // ТАЛИЯ: мост уже соседних кругов. Без неё тело превращается в ровную
        // трубу постоянной ширины — сегменты перестают читаться как отдельные
        // вздутия, и силуэт выглядит надувным матрасом. Отрицательный отступ и
        // есть та самая перетяжка между секциями.
        const waist = -Math.min(a.r, b.r) * WORM_HULL_WAIST_RATIO;
        setAttr(ob, 'd', bridgeQuadPath(a, b, waist + W));
        setAttr(rb, 'd', bridgeQuadPath(a, b, waist + W * 0.45));
        const plain = bridgeQuadPath(a, b, waist);
        setAttr(cb, 'd', plain);
        setAttr(bs, 'd', plain);
        // Цвет моста — среднее между соседями, поэтому переход тона по телу
        // остаётся непрерывным и промежуток не выглядит "заплаткой".
        if (a.color && b.color) setAttr(bs, 'fill', mixColor(a.color, b.color, 0.5));
    }

    // Перетяжки: ставятся в точку касания соседних кругов и разворачиваются
    // поперёк оси тела. Толщина валика — от размера меньшего из соседей.
    for (let i = 0; i < rings.rings.length; i++) {
        const a = circles[i + 1], b = circles[i + 2];
        const r = rings.rings[i];
        if (!a || !b || !(a.r > 0) || !(b.r > 0)) { setAttr(r.g, 'opacity', 0); continue; }
        setAttr(r.g, 'opacity', 1);
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const t = (a.r + (dist - a.r - b.r) * 0.5) / dist; // середина перекрытия
        const px = a.x + dx * t, py = a.y + dy * t;
        const deg = Math.atan2(dy, dx) * 180 / Math.PI;
        const half = Math.min(a.r, b.r) * (1 - WORM_HULL_WAIST_RATIO) * 1.06;
        const w = Math.max(2.4, half * 0.26);
        setAttr(r.shade, 'ry', half.toFixed(1)); setAttr(r.shade, 'rx', w.toFixed(1));
        setAttr(r.light, 'ry', (half * 0.96).toFixed(1)); setAttr(r.light, 'rx', (w * 0.6).toFixed(1));
        setAttr(r.light, 'cx', (w * 1.15).toFixed(1));
        setAttr(r.crease, 'ry', (half * 0.99).toFixed(1)); setAttr(r.crease, 'rx', Math.max(1.2, w * 0.42).toFixed(1));
        setAttr(r.g, 'transform', `translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${deg.toFixed(1)})`);
    }

    // Тень на полу — по нижнему краю напольной части.
    if (built.floorShadow) {
        let minX = Infinity, maxX = -Infinity, bottom = -Infinity;
        (shadowCircles || circles).forEach(c => {
            if (!c || !(c.r > 0)) return;
            minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
            bottom = Math.max(bottom, c.y + c.r);
        });
        if (minX < maxX) {
            setAttr(built.floorShadow, 'cx', ((minX + maxX) / 2).toFixed(1));
            setAttr(built.floorShadow, 'cy', (bottom + 4).toFixed(1));
            setAttr(built.floorShadow, 'rx', ((maxX - minX) / 2 + 10).toFixed(1));
            setAttr(built.floorShadow, 'ry', '11');
        }
    }
}

