// ================= ЧЕРВЬ: МЫШЦЫ, ТОН, ПОКРОВ, ПОВЕРХНОСТЬ =================
// Слои кожи под и над покровом. Часть стопки рендерера (карта — worm-basis.js).
// Вынесено из worm-anatomy.js; подключается сразу после него.

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
// Поясок-клителлум и спинной сосуд — всё, что от слоя осталось.
//
// Здесь же было ещё три «эффекта поверхности»: кольцевые бороздки, свиные
// складки и щетина. Их убрали целиком, и внутри написано почему: каждый из
// трёх на экране оказывался не тем, чем назывался, а горстью коротких
// штрихов под случайными углами. Правило, по которому их не вернуть,
// сформулировано в docs/traps.md, п. 148.
//
// features:
//   clitellum — поясок; vessel — спинной сосуд.
function buildCoatLayer(ctx, partName, halfLen, halfThick, features) {
    const coat = ctx.anatomy.coat || {};
    const group = svgEl('g', { class: 'worm-coat-layer' });
    let empty = true;

    // ---------- КОЛЬЦЕВЫХ БОРОЗДОК ЗДЕСЬ БОЛЬШЕ НЕТ ----------
    // Их переделывали дважды — сперва прямой линией через сегмент, потом
    // только концами дуги у силуэта, — и оба раза мимо: в размер экрана это
    // читалось не вмятиной на коже, а тремя-четырьмя чёрточками, насыпанными
    // внутрь тела под случайными углами. Третьей попытки нет по тому же
    // правилу, что убрало вибриссы со щёк (`buildHeadDetailLayer`): если
    // деталь неотличима от царапины, рисовать нечего.
    //
    // Настоящие кольца у червя на экране ЕСТЬ и никуда не делись — это
    // перетяжки между частями (`createRingLayers`, worm-hull.js): мягкий
    // валик с тенью и подсветкой поперёк всего тела. От `coat.rings` они
    // не зависели никогда.

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
        // Края пояска — только концы у силуэта. Целиком проведённые, они
        // давали на стоящем сегменте две ровные полосы поперёк тела — вторую
        // пару «рёбер» там, где рёбер быть не должно.
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

    // ---------- СКЛАДОК И ЩЕТИНЫ ЗДЕСЬ БОЛЬШЕ НЕТ ----------
    // Та же история и та же причина. Складки были парой коротких дуг у
    // «плеча», щетина — горстью волосков по дуге 200°..340° В КООРДИНАТАХ
    // ЧАСТИ. К силуэту части эта дуга отношения не имеет (силуэт строит
    // worm-silhouette, а не эллипс), поэтому волоски садились куда попало —
    // на голове ровным рядком ВНУТРЬ ушных раковин. Ни складкой, ни щетиной
    // это не прочиталось ни разу.

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
