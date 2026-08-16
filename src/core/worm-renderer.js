// ================= ЕДИНЫЙ РЕНДЕРЕР СВИНОЧЕРВЯ (WORM RENDERER) =================
// Строит SVG персонажа из WormModel (см. src/core/worm-model.js) и умеет
// монтироваться в ЛЮБОЙ контейнер — главный экран, любая мини-игра.
//
// Главная идея модульности: части тела — это <g data-part="...">, а шрамы,
// эффекты и будущие аксессуары монтируются КАК ДОЧЕРНИЕ ЭЛЕМЕНТЫ этих групп,
// поэтому при масштабировании сегмента (например, живот раздувается в
// Чревоугодии) все шрамы/украшения на нём растягиваются вместе с ним
// автоматически — через SVG-иерархию, без ручного пересчёта координат.
//
// Контекстные оверрайды: любой экран может временно "подменить" часть модели
// на время своего рендера через handle.setOverride(patch) — базовая
// сохранённая модель игрока при этом не трогается (см. mergeWormOverride).

const SVG_NS = 'http://www.w3.org/2000/svg';
// Доп. отступ всей телесной цепочки от центра головы, чтобы сегмент-1
// не прятался почти целиком под головой, а минимум наполовину торчал из-под неё.
const WORM_CHAIN_HEAD_GAP = 24;
let wormInstanceCounter = 0;

function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
        Object.keys(attrs).forEach(key => el.setAttribute(key, attrs[key]));
    }
    return el;
}

// ---------- ЛОКАЛЬНЫЕ ФОРМЫ (до позиционирования) ----------
function earPathData(mirror) {
    // mirror: 1 = правое ухо, -1 = левое. Точка (0,0) — место крепления к голове.
    const s = mirror;
    return `M 0,0 L ${s * 15},-25 L ${s * -15},-15 Z`;
}

// ---------- ПОСТРОЕНИЕ ОДНОГО СЕГМЕНТА ТЕЛА (не хвост, не голова) ----------
function buildSegmentNode(partName, seg) {
    const group = svgEl('g', { 'data-part': partName });
    const baseRx = seg.radius * seg.stretchX * seg.scale;
    const baseRy = seg.radius * seg.stretchY * seg.scale;
    const ellipse = svgEl('ellipse', {
        cx: 0, cy: 0,
        rx: baseRx.toFixed(2),
        ry: baseRy.toFixed(2),
        fill: seg.fill,
        stroke: seg.stroke,
        'stroke-width': 2
    });
    group.appendChild(ellipse);
    // Якорь под шрамы/эффекты этого сегмента — шрамы монтируются сюда же,
    // как дочерние элементы group, и наследуют её transform.
    const scarLayer = svgEl('g', { 'data-anchor': `${partName}-scars`, class: 'worm-scar-layer' });
    group.appendChild(scarLayer);
    // baseRx/baseRy сохраняются отдельно, чтобы мини-игры могли "живо"
    // (без пересборки SVG) масштабировать конкретный сегмент — например,
    // раздувание живота в Чревоугодии через handle.setLivePose({ bellyScale }).
    return { group, ellipse, scarLayer, baseRx, baseRy };
}

// ---------- ПОСТРОЕНИЕ ХВОСТА (отдельная сущность, каплевидная форма) ----------
function buildTailNode(tail) {
    const group = svgEl('g', { 'data-part': 'tail' });
    const L = 34 * tail.length;      // длина, точка (0,0) — основание у тела, кончик на -L
    const R = 7.5 * tail.thickness;  // радиус округлого основания
    // Круглое основание в точке (0,0) (слегка заходит на +x — под предыдущий
    // сегмент, для бесшовного стыка), сужается к острому кончику на x = -L.
    const d = `M 0,${(-R).toFixed(1)} ` +
              `A ${R.toFixed(1)},${R.toFixed(1)} 0 0 1 0,${R.toFixed(1)} ` +
              `Q ${(-L * 0.55).toFixed(1)},${(R * 0.85).toFixed(1)} ${(-L).toFixed(1)},0 ` +
              `Q ${(-L * 0.55).toFixed(1)},${(-R * 0.85).toFixed(1)} 0,${(-R).toFixed(1)} Z`;
    const path = svgEl('path', { d, fill: tail.fill, stroke: tail.stroke, 'stroke-width': 2 });
    // Внутренняя группа для "живого" изгиба хвоста (тянут в мини-игре Похоти
    // и т.п.) — вращается вокруг точки крепления (0,0), не требует пересборки
    // SVG, обновляется напрямую через handle.setLivePose({ tailBendAngle }).
    const bendGroup = svgEl('g', { 'data-part': 'tail-bend' });
    bendGroup.appendChild(path);
    group.appendChild(bendGroup);
    const scarLayer = svgEl('g', { 'data-anchor': 'tail-scars', class: 'worm-scar-layer' });
    group.appendChild(scarLayer);
    return { group, path, bendGroup, scarLayer };
}

// ---------- ПОСТРОЕНИЕ ОДНОГО ГЛАЗА (со зрачком, бровью, веком) ----------
function buildEyeNode(eye, mirror, instanceId, eyeKey) {
    const x = eye.offsetX * mirror;
    const y = eye.offsetY;
    const group = svgEl('g', {
        'data-part': `eye-${eyeKey}`,
        transform: `translate(${x},${y})`,
        visibility: eye.visible ? 'visible' : 'hidden'
    });

    const rx = 8 * eye.stretchX * eye.scale;
    const ry = 8 * eye.stretchY * eye.scale;

    const sclera = svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2), fill: '#ffffff' });
    const pupil = svgEl('circle', { cx: 0, cy: 0, r: (rx * 0.5).toFixed(2), fill: eye.color });

    const browGroup = svgEl('g', {
        'data-part': `brow-${eyeKey}`,
        transform: `translate(0,${(-ry - 6).toFixed(2)}) rotate(${eye.brow.angle * mirror})`,
        visibility: eye.brow.visible ? 'visible' : 'hidden'
    });
    const browShape = svgEl('line', { x1: -10, y1: 0, x2: 10, y2: 0, stroke: '#000000', 'stroke-width': 3, 'stroke-linecap': 'round' });
    browGroup.appendChild(browShape);

    // Веко — прямоугольник, "накрывающий" глаз сверху на eyelid.level (0..1).
    const clipId = `worm-eye-clip-${instanceId}-${eyeKey}`;
    const clipPath = svgEl('clipPath', { id: clipId });
    clipPath.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2) }));
    group.appendChild(clipPath);

    const lid = svgEl('rect', {
        x: (-rx - 2).toFixed(2), y: (-ry - 2).toFixed(2),
        width: (rx * 2 + 4).toFixed(2), height: 0,
        fill: '#e2a0b2', 'clip-path': `url(#${clipId})`
    });

    group.appendChild(sclera);
    group.appendChild(pupil);
    group.appendChild(lid);
    group.appendChild(browGroup);

    return { group, sclera, pupil, lid, browGroup, rx, ry };
}

// ---------- ПОСТРОЕНИЕ ГОЛОВЫ (уши, пятачок, глаза) ----------
function buildHeadNode(model, instanceId) {
    const head = model.head;
    const group = svgEl('g', { 'data-part': 'head' });

    const R = 40 * head.scale;
    const rx = R * head.stretchX;
    const ry = R * head.stretchY;

    const skull = svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2), fill: head.fill, stroke: head.stroke, 'stroke-width': 3 });

    // Уши — крепятся по краю головы, каждое со своим поворотом/видимостью.
    const earsGroup = svgEl('g', { 'data-part': 'ears' });
    const earRefs = {};
    ['left', 'right'].forEach(side => {
        const mirror = side === 'left' ? -1 : 1;
        const ear = head.ears[side];
        const anchorX = mirror * rx * 0.55;
        const anchorY = -ry * 0.75;
        const earGroup = svgEl('g', {
            'data-part': `ear-${side}`,
            'data-anchor': `ear-${side}`,
            transform: `translate(${anchorX.toFixed(2)},${anchorY.toFixed(2)}) rotate(${ear.rotation}) scale(${ear.scale * ear.stretchX},${ear.scale * ear.stretchY})`,
            visibility: ear.visible ? 'visible' : 'hidden'
        });
        const earShape = svgEl('path', { d: earPathData(mirror), fill: ear.fill, stroke: ear.stroke, 'stroke-width': 2 });
        earGroup.appendChild(earShape);
        earsGroup.appendChild(earGroup);
        earRefs[side] = { group: earGroup, shape: earShape };
    });

    // Пятачок
    const snout = head.snout;
    const snoutGroup = svgEl('g', {
        'data-part': 'snout',
        'data-anchor': 'snout',
        transform: `translate(0,${(ry * 0.35).toFixed(2)}) scale(${snout.scale * snout.stretchX},${snout.scale * snout.stretchY})`
    });
    const snoutShape = svgEl('ellipse', { cx: 0, cy: 0, rx: 16, ry: 12, fill: snout.fill, stroke: snout.stroke, 'stroke-width': 2 });
    const nostrilL = svgEl('circle', { cx: -5, cy: 0, r: 3, fill: '#631d27' });
    const nostrilR = svgEl('circle', { cx: 5, cy: 0, r: 3, fill: '#631d27' });
    snoutGroup.appendChild(snoutShape);
    snoutGroup.appendChild(nostrilL);
    snoutGroup.appendChild(nostrilR);

    // Рот — простая кривая линия под пятачком. Тот же <g> служит и якорем
    // под аксессуар "в рот" (листик, сигаретка) — он крепится сюда же.
    const mouth = head.mouth;
    const mouthAnchor = svgEl('g', {
        'data-part': 'mouth',
        'data-anchor': 'mouth',
        transform: `translate(0,${(ry * 0.75).toFixed(2)}) scale(${mouth.scale * mouth.stretchX},${mouth.scale * mouth.stretchY})`
    });
    const mouthW = 12;
    const openness = mouth.openness || 0;
    let mouthShape;
    if (openness > 0.05) {
        // Открытый рот (кормление и т.п.) — тёмный овал, широкий по
        // горизонтали (а не вытянутый вертикально, как раньше).
        mouthShape = svgEl('ellipse', {
            cx: 0, cy: (-1 * openness).toFixed(1),
            rx: (mouthW * 0.95).toFixed(1),
            ry: (3 + openness * 5).toFixed(1),
            fill: '#5c1420',
            stroke: mouth.color,
            'stroke-width': 2
        });
    } else {
        const mouthH = -7 * mouth.curve;
        mouthShape = svgEl('path', {
            d: `M ${-mouthW},0 Q 0,${mouthH.toFixed(2)} ${mouthW},0`,
            fill: 'none',
            stroke: mouth.color,
            'stroke-width': 3,
            'stroke-linecap': 'round'
        });
    }
    mouthAnchor.appendChild(mouthShape);

    // Глаза
    const eyesGroup = svgEl('g', { 'data-part': 'eyes' });
    const eyeLeft = buildEyeNode(model.eyes.left, -1, instanceId, 'left');
    const eyeRight = buildEyeNode(model.eyes.right, 1, instanceId, 'right');
    eyesGroup.appendChild(eyeLeft.group);
    eyesGroup.appendChild(eyeRight.group);

    // Якорь под головной убор — над верхней точкой головы.
    const hatAnchor = svgEl('g', { 'data-anchor': 'head-top', transform: `translate(0,${(-ry * 1.1).toFixed(2)})` });

    group.appendChild(earsGroup);
    group.appendChild(skull);
    group.appendChild(snoutGroup);
    group.appendChild(mouthAnchor);
    group.appendChild(eyesGroup);
    group.appendChild(hatAnchor);

    const scarLayer = svgEl('g', { 'data-anchor': 'head-scars', class: 'worm-scar-layer' });
    group.appendChild(scarLayer);

    return { group, skull, ears: earRefs, snoutGroup, eyes: { left: eyeLeft, right: eyeRight }, scarLayer, rx, ry };
}

// ---------- ШРАМЫ ----------
// Процедурно генерируемая метка на конкретном сегменте. Размер намеренно
// ограничен долей от радиуса сегмента-хозяина, чтобы не вылезать за его
// пределы (точная формула ещё будет уточняться по ходу разработки).
function buildScarNode(scar, hostRadius) {
    const maxSize = hostRadius * 0.35;
    const size = Math.max(3, Math.min(maxSize, (scar.seed % 100) / 100 * maxSize));
    const group = svgEl('g', {
        transform: `translate(${(scar.x * hostRadius).toFixed(2)},${(scar.y * hostRadius).toFixed(2)}) rotate(${scar.rotation})`,
        class: `worm-scar worm-scar-${scar.type || 'organic'}`
    });
    if (scar.type === 'stitched') {
        const line = svgEl('line', { x1: -size, y1: 0, x2: size, y2: 0, stroke: scar.color, 'stroke-width': Math.max(1, size * 0.2) });
        group.appendChild(line);
        const stitchCount = 3;
        for (let i = 0; i < stitchCount; i++) {
            const sx = -size + (i + 0.5) * (size * 2 / stitchCount);
            group.appendChild(svgEl('line', { x1: sx, y1: -size * 0.4, x2: sx, y2: size * 0.4, stroke: scar.color, 'stroke-width': 1 }));
        }
    } else {
        const rx = size, ry = size * 0.5;
        group.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2), fill: scar.color, opacity: 0.85 }));
    }
    return group;
}

// ---------- СБОРКА ВСЕЙ ЦЕПОЧКИ ТЕЛА ----------
function buildWormSVGGroup(model, instanceId) {
    const root = svgEl('g', { class: 'worm-root' });

    // Порядок цепочки от головы к хвосту: 2 фикс. сегмента, живот, N
    // растущих сегментов, хвост.
    const chainParts = [];
    model.fixedSegments.forEach((seg, i) => chainParts.push({ name: `segment-${i + 1}`, data: seg }));
    const bellyIdx = model.fixedSegments.length + 1;
    chainParts.push({ name: 'belly', data: model.belly });
    model.growingSegments.forEach((seg, i) => chainParts.push({ name: `growing-${i + 1}`, data: seg }));

    const totalWithTail = chainParts.length + 1; // +1 за хвост
    const tailIdx = totalWithTail;

    // Z-порядок ("слои", как в фотошопе): живот — самый верхний слой среди
    // тела. Чем дальше часть тела от живота вдоль цепочки — в ЛЮБУЮ сторону
    // (что к голове, что к хвосту) — тем она глубже/ниже слоем. Хвост как
    // самая дальняя от живота точка всегда оказывается в самом низу. Голова
    // стоит особняком и рисуется поверх абсолютно всего, независимо от
    // формальной "удалённости" — иначе лицо перекрывалось бы телом.
    const allParts = chainParts.map((part, i) => ({ ...part, idx: i + 1, isTail: false }));
    allParts.push({ name: 'tail', data: model.tail, idx: tailIdx, isTail: true });
    allParts.sort((a, b) => {
        const distA = Math.abs(a.idx - bellyIdx);
        const distB = Math.abs(b.idx - bellyIdx);
        if (distA !== distB) return distB - distA; // дальше от живота — рисуется раньше (глубже)
        return a.idx - b.idx; // стабильный порядок при равном расстоянии
    });

    const segmentRefs = [];
    let tailBuilt = null;
    allParts.forEach(part => {
        if (part.isTail) {
            tailBuilt = buildTailNode(part.data);
            root.appendChild(tailBuilt.group);
        } else {
            const built = buildSegmentNode(part.name, part.data);
            root.appendChild(built.group);
            segmentRefs.push({ idx: part.idx, name: part.name, radius: part.data.radius * part.data.scale, ...built });
        }
    });

    // Голова — последняя, поверх всего.
    const headBuilt = buildHeadNode(model, instanceId);
    root.appendChild(headBuilt.group);

    // Шрамы — монтируются как дети scarLayer конкретного сегмента-хозяина,
    // поэтому автоматически наследуют его текущий transform/scale.
    const scarHostByPart = { head: headBuilt.scarLayer, tail: tailBuilt.scarLayer };
    segmentRefs.forEach(seg => { scarHostByPart[seg.name] = seg.scarLayer; });
    (model.scars || []).forEach(scar => {
        const host = scarHostByPart[scar.part];
        if (!host) return;
        const hostRadius = scar.part === 'tail' ? (15 * model.tail.thickness) :
            scar.part === 'head' ? headBuilt.rx :
            (segmentRefs.find(s => s.name === scar.part) || {}).radius || 15;
        host.appendChild(buildScarNode(scar, hostRadius));
    });

    return {
        root,
        totalWithTail,
        tail: { ...tailBuilt, idx: tailIdx },
        segments: segmentRefs,
        head: headBuilt
    };
}

// ---------- ПУБЛИЧНЫЙ API РЕНДЕРЕРА ----------
const WormRenderer = {
    mount(container, model, opts) {
        opts = Object.assign({
            context: 'main',
            wander: false,
            blink: true,
            anchorX: 0.5,
            anchorY: 0.55,
            // Зеркалит всю модельку по горизонтали — цепочка тела тогда
            // растёт вправо от головы, а не влево (нужно для поз, где
            // персонаж лежит головой к одному краю экрана).
            flip: false,
            // false — тело неподвижно застыло в базовой позе (нужно для
            // сцен, где персонаж лежит смирно, например кормление).
            idleWave: true,
            // 'center' (по умолчанию) — живот раздувается симметрично.
            // 'bottom' — нижний край живота остаётся на месте, раздувается
            // только вверх. 'top' — наоборот.
            bellyGrowthAnchor: 'center'
        }, opts || {});
        const instanceId = ++wormInstanceCounter;

        container.innerHTML = '';
        const svg = svgEl('svg', { class: `worm-stage-svg worm-context-${opts.context}` });
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.display = 'block';
        svg.style.overflow = 'visible';
        container.appendChild(svg);

        const state = {
            baseModel: model,
            override: null,
            built: null,
            animTime: 0,
            wormX: 0,
            wormY: 0,
            targetX: 0,
            targetY: 0,
            blinkClock: 0,
            rafId: null,
            wanderIntervalId: null,
            lastFrameTs: null,
            // "Горячий" канал для непрерывных обновлений от мини-игр — не
            // трогает baseModel/override, не вызывает пересборку SVG,
            // применяется каждый кадр напрямую поверх обычной анимации.
            livePose: {
                tailBendAngle: 0,   // градусы поворота хвоста вокруг точки крепления
                eyelidLevel: null,  // 0..1 — подменяет базовый уровень век обоих глаз; null = не подменять
                bellyScale: null    // множитель радиуса живота (1 = обычный); null = как 1
            }
        };

        function mergedModel() {
            return window.WormModelAPI.mergeWormOverride(state.baseModel, state.override);
        }

        function syncViewportSize() {
            const rect = container.getBoundingClientRect();
            const w = Math.max(1, rect.width);
            const h = Math.max(1, rect.height);
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            state.wormX = state.wormX || w * opts.anchorX;
            state.wormY = state.wormY || h * opts.anchorY;
            state.targetX = state.wormX;
            state.targetY = state.wormY;
        }

        function rootTransform() {
            const flipPart = opts.flip ? ' scale(-1,1)' : '';
            return `translate(${state.wormX.toFixed(1)},${state.wormY.toFixed(1)})${flipPart}`;
        }

        function rebuild() {
            const m = mergedModel();
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            state.built = buildWormSVGGroup(m, instanceId);
            svg.appendChild(state.built.root);
            state.built.root.setAttribute('transform', rootTransform());
        }

        syncViewportSize();
        rebuild();

        if (opts.wander) {
            state.wanderIntervalId = setInterval(() => {
                const rect = container.getBoundingClientRect();
                state.targetX = rect.width * 0.2 + Math.random() * (rect.width * 0.6);
                state.targetY = rect.height * 0.4 + Math.random() * (rect.height * 0.3);
            }, 3000);
        }

        function tick(now) {
            if (!state.lastFrameTs) state.lastFrameTs = now;
            const dt = now - state.lastFrameTs;
            state.lastFrameTs = now;
            state.animTime += 0.05;

            if (opts.wander) {
                state.wormX += (state.targetX - state.wormX) * 0.02;
                state.wormY += (state.targetY - state.wormY) * 0.02;
            }

            if (state.built) {
                state.built.root.setAttribute('transform', rootTransform());

                const wave = opts.idleWave ? Math.sin(state.animTime) * 8 : 0;
                state.built.head.group.setAttribute('transform', `translate(0,${wave.toFixed(2)})`);

                const bellySeg = state.built.segments.find(s => s.name === 'belly');
                const bellyFactor = state.livePose.bellyScale != null ? state.livePose.bellyScale : 1;
                // Раздувшийся живот растёт "вперёд" (в сторону хвоста) от
                // неподвижной точки стыка с головным соседом (см. cx ниже),
                // а сегменты дальше по цепочке отодвигаются РОВНО на ту же
                // величину, на какую вырос сам живот — так нахлёст живота на
                // соседей остаётся примерно таким же, как и в состоянии покоя.
                const bellyGrowX = bellySeg ? Math.max(0, bellySeg.baseRx * (bellyFactor - 1)) : 0;
                // Край живота, обращённый к хвосту, смещается СРАЗУ по двум
                // причинам: (1) сам rx растёт на bellyGrowX, (2) центр (cx)
                // сдвигается ещё на -bellyGrowX, чтобы не наезжать на
                // головного соседа. Оба сдвига складываются — поэтому
                // соседей нужно отодвигать на удвоенную величину, иначе
                // живот их постепенно перекрывает.
                const bellyPushGap = bellyGrowX * 2;
                const bellyIdx = bellySeg ? bellySeg.idx : -1;

                state.built.segments.forEach(seg => {
                    const extraGap = seg.idx > bellyIdx ? bellyPushGap : 0;
                    const sx = -(seg.idx * 18 + WORM_CHAIN_HEAD_GAP + extraGap);
                    const sy = opts.idleWave ? (Math.sin(state.animTime + seg.idx * 0.6) * 12 + seg.idx * 4) : 0;
                    seg.group.setAttribute('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
                });

                const tsx = -(state.built.tail.idx * 18 + WORM_CHAIN_HEAD_GAP + bellyPushGap);
                const tsy = opts.idleWave ? (Math.sin(state.animTime + state.built.tail.idx * 0.6) * 12 + state.built.tail.idx * 4) : 0;
                state.built.tail.group.setAttribute('transform', `translate(${tsx.toFixed(1)},${tsy.toFixed(1)})`);
                if (state.built.tail.bendGroup) {
                    state.built.tail.bendGroup.setAttribute('transform', `rotate(${state.livePose.tailBendAngle.toFixed(1)})`);
                }

                if (bellySeg) {
                    const newRx = bellySeg.baseRx * bellyFactor;
                    const newRy = bellySeg.baseRy * bellyFactor;
                    let cy = 0;
                    if (opts.bellyGrowthAnchor === 'bottom') cy = -(newRy - bellySeg.baseRy);
                    else if (opts.bellyGrowthAnchor === 'top') cy = (newRy - bellySeg.baseRy);
                    // По X живот всегда "растёт вперёд": локальный +X — это
                    // сторона стыка с головным соседом (сегмент-2), она
                    // остаётся на месте (не наезжает на соседа), а вся
                    // прибавка объёма уходит в сторону хвоста (-X).
                    const cx = -bellyGrowX;
                    bellySeg.ellipse.setAttribute('rx', newRx.toFixed(2));
                    bellySeg.ellipse.setAttribute('ry', newRy.toFixed(2));
                    bellySeg.ellipse.setAttribute('cx', cx.toFixed(2));
                    bellySeg.ellipse.setAttribute('cy', cy.toFixed(2));
                }

                if (opts.blink) {
                    state.blinkClock += dt;
                    const cyclePos = state.blinkClock % 2200;
                    const inBlink = cyclePos > 2000 && cyclePos < 2160;
                    ['left', 'right'].forEach(side => {
                        const eyeModel = mergedModel().eyes[side];
                        const eyeRef = state.built.head.eyes[side];
                        const restLevel = state.livePose.eyelidLevel != null ? state.livePose.eyelidLevel : eyeModel.eyelid.level;
                        const level = inBlink ? 1 : restLevel;
                        const h = level * (eyeRef.ry * 2 + 4);
                        eyeRef.lid.setAttribute('height', h.toFixed(2));
                        eyeRef.lid.setAttribute('y', (-eyeRef.ry - 2).toFixed(2));
                    });
                }
            }

            state.rafId = requestAnimationFrame(tick);
        }
        state.rafId = requestAnimationFrame(tick);

        function onResize() { syncViewportSize(); }
        window.addEventListener('resize', onResize);

        return {
            update(newModel) {
                state.baseModel = newModel;
                rebuild();
            },
            setOverride(patch) {
                state.override = patch;
                rebuild();
            },
            setPose(name) {
                svg.setAttribute('data-pose', name || '');
            },
            setLivePose(patch) {
                Object.assign(state.livePose, patch);
            },
            // Прямой доступ к SVG для точечных вещей, которые не стоит тащить
            // в общий API рендерера (хит-тест по конкретной части, разовая
            // подстройка стиля конкретной мини-игрой). Ищи части по
            // '[data-part="tail"]', '[data-part="belly"]' и т.п.
            svgRoot: svg,
            getMergedModel: mergedModel,
            destroy() {
                if (state.rafId) cancelAnimationFrame(state.rafId);
                if (state.wanderIntervalId) clearInterval(state.wanderIntervalId);
                window.removeEventListener('resize', onResize);
                container.innerHTML = '';
            }
        };
    }
};

window.WormRenderer = WormRenderer;
