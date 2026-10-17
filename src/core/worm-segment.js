// ================= ЧЕРВЬ: ЗВЕНО И ХВОСТ =================
// Узел одного сегмента тела и каплевидный хвост.
// Вынесено из worm-head.js; подключается сразу после него.

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
