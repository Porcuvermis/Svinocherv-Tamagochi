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
    // `clipId` — ГОТОВЫЙ живой клип хозяина части. Голова передаёт сюда свой:
    // её силуэт при повороте переписывается каждый кадр, а собственная копия
    // контура застыла бы на моменте сборки, и слои кожи обрезались бы по
    // форме, которой на экране уже нет.
    let clipId = opts.clipId;
    if (!clipId) {
        clipId = `worm-anat-clip-${ctx.instanceId}-${partName}`;
        const clip = svgEl('clipPath', { id: clipId });
        if (opts.clipPathData) {
            clip.appendChild(svgEl('path', { d: opts.clipPathData }));
        } else {
            clip.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
        }
        ctx.defs.appendChild(clip);
    }

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

