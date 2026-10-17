// ================= ЧЕРВЬ: РОТ =================
// Процедурная форма рта и её покадровое обновление (изгиб, раскрытие, начинка).
// Вынесено из worm-head.js; подключается сразу после него.

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
