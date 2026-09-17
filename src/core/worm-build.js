// ================= СБОРКА ЧЕРВЯ В ОДИН УЗЕЛ =================
// Восьмой файл стопки рендерера (карта — в worm-basis.js). Складывает всё
// предыдущее в дерево: части, силуэт, кишку, кольца, голову, отметины, наряд.
// Покадровой жизни здесь нет — она в worm-renderer.js.

function buildWormSVGGroup(model, instanceId, headFlip) {
    const root = svgEl('g', { class: 'worm-root' });

    // Общий <defs> на весь инстанс персонажа — сюда складываются все
    // градиенты и клипы (голова, сегменты, хвост, уши, глаза, анатомия).
    const defs = svgEl('defs');
    root.appendChild(defs);

    const anatomy = getAnatomy(model);
    // Контекст инстанса: всё, что нужно любому строителю слоя. Передаётся
    // одним объектом, чтобы не тащить 5 аргументов через каждую функцию.
    const ctx = { defs, instanceId, anatomy, gradCache: Object.create(null), neckColor: null,
                  // Сколько растущих сегментов у этой особи: от этого зависит
                  // рампа прозрачности кожи вдоль тела.
                  growingCount: (model.growingSegments || []).length,
                  // база для отражённого света: тёплый оттенок самой кожи,
                  // а не производная от тёмного контура (иначе кайма выходит
                  // грязно-бежевой и читается как ореол, а не как свет)
                  rimBaseColor: model.belly.fill,
                  // Голова смотрит в другую сторону. Зеркалится ТОЛЬКО она:
                  // тело остаётся как есть, потому что от того, куда червь
                  // повернул морду, туша под водой не переезжает.
                  headFlip: !!headFlip };

    // Порядок цепочки от головы к хвосту: 2 фикс. сегмента, живот, N
    // растущих сегментов, хвост.
    const chainParts = [];
    model.fixedSegments.forEach((seg, i) => chainParts.push({ name: `segment-${i + 1}`, data: seg }));
    const bellyIdx = model.fixedSegments.length + 1;
    chainParts.push({ name: 'belly', data: model.belly });
    model.growingSegments.forEach((seg, i) => chainParts.push({ name: `growing-${i + 1}`, data: seg }));

    const totalWithTail = chainParts.length + 1; // +1 за хвост
    const tailIdx = totalWithTail;

    // Реальный отрисованный радиус последнего (предхвостового) growing-
    // сегмента — от него считается основание хвоста.
    const lastGrowingSeg = model.growingSegments.length
        ? model.growingSegments[model.growingSegments.length - 1]
        : null;
    const tailAttachRadius = lastGrowingSeg
        ? lastGrowingSeg.radius * lastGrowingSeg.stretchX * lastGrowingSeg.scale
        : 15;

    // ---------- ПЕРЕХОД ЧЕРВЬ → ГОЛОВА: ПОДМЕШИВАНИЕ ЦВЕТА ШЕИ ----------
    // Цвет сегментов-шеи подмешивается к цвету головы, а сама голова снизу
    // получает "юбку" цветом сегмента-1 — стык перестаёт быть границей двух
    // разных существ. Модель при этом не меняется: подмешивает рендерер.
    const neckBlend = (anatomy.enabled && anatomy.skin && anatomy.skin.neckBlend) || null;
    const blendByPart = Object.create(null);
    if (neckBlend) {
        model.fixedSegments.forEach((seg, i) => {
            const amt = neckBlend[i];
            if (amt == null || amt <= 0) return;
            blendByPart[`segment-${i + 1}`] = {
                fill: mixColor(seg.fill, model.head.fill, amt),
                stroke: mixColor(seg.stroke, model.head.stroke, amt * 0.7)
            };
        });
        const seg1 = blendByPart['segment-1'];
        ctx.neckColor = seg1 ? seg1.fill : model.fixedSegments[0].fill;
    }

    // Zона анатомии по имени части — задаётся ОДИН раз здесь, чтобы правила
    // "что где просвечивает" не были размазаны по коду.
    function partAnatOpts(name, idx) {
        const isVertical = idx <= bellyIdx - 1; // сегменты между головой и животом
        const opts = {
            axis: isVertical ? 'y' : 'x',
            organZone: null,
            coat: { rings: true, vessel: !isVertical },
            surface: {}
        };
        if (name === 'belly') {
            opts.organZone = 'core';
            opts.axis = 'x';       // живот лежит на полу, растёт "вперёд" по X
            opts.coat.vessel = true;
        } else if (name === 'segment-1') {
            opts.organZone = 'neck';
            opts.coat.folds = true;    // свиные складки у "плеча"
            opts.coat.bristle = true;  // и щетина — ближе к голове кожа свиная
            opts.coat.rings = true;
            opts.surface.contactTop = true; // тень от головы, лежащей сверху
        } else if (name === 'segment-2') {
            opts.organZone = 'neck';
            opts.coat.folds = true;
            opts.coat.clitellum = true; // поясок-воротник: граница двух типов кожи
            opts.surface.contactTop = true;
            opts.surface.contactStrength = 0.5;
        } else if (name.indexOf('growing-') === 0) {
            opts.organZone = 'floor';
        }
        return opts;
    }

    // Z-порядок ("слои", как в фотошопе), СНИЗУ ВВЕРХ:
    // 1) напольная часть (growing-сегменты + хвост) — самый нижний слой;
    // 2) вертикальная часть тела (fixedSegments, между головой и животом);
    // 3) живот — поверх ВСЕХ остальных сегментов тела;
    // 4) голова — поверх абсолютно всего, рисуется отдельным шагом ниже.
    // Сторона (напольная / вертикальная / живот) — ПЕРВЫЙ, приоритетный
    // критерий сортировки, "расстояние от живота" — только второй.
    const allParts = chainParts.map((part, i) => ({ ...part, idx: i + 1, isTail: false }));
    allParts.push({ name: 'tail', data: model.tail, idx: tailIdx, isTail: true });
    function bodyLayerGroup(idx) {
        if (idx === bellyIdx) return 2;       // живот
        return idx > bellyIdx ? 0 : 1;        // 0 = напольная часть, 1 = вертикальная часть тела
    }
    allParts.sort((a, b) => {
        const groupA = bodyLayerGroup(a.idx);
        const groupB = bodyLayerGroup(b.idx);
        if (groupA !== groupB) return groupA - groupB;
        const distA = Math.abs(a.idx - bellyIdx);
        const distB = Math.abs(b.idx - bellyIdx);
        if (distA !== distB) return distB - distA;
        return a.idx - b.idx;
    });

    // ---------- ЕДИНЫЙ СИЛУЭТ: СЛОИ ПОД ТЕЛОМ ----------
    // Цепочка кругов силуэта: якорь внутри головы (чтобы шея входила в неё
    // без стыка) → сегменты → живот → растущие → основание хвоста.
    const hullCount = 1 + model.fixedSegments.length + 1 + model.growingSegments.length + 1;
    const outlineColor = mixColor(model.belly.stroke, GRIME_SHADOW, 0.25);
    const hull = createHullLayers(ctx, hullCount, outlineColor, SW.contour);
    const rings = createRingLayers(ctx, Math.max(0, hullCount - 2));

    // Падающая тень на "полу" — тело перестаёт висеть в пустоте.
    const floorShadow = svgEl('ellipse', {
        class: 'worm-floor-shadow', cx: 0, cy: 0, rx: 0, ry: 0,
        fill: ensureSoftGradient(ctx, `worm-floor-shadow-${instanceId}`, INK, 1),
        opacity: 0.34,
        // Тень загораживать пол не должна: тело — да, его тень — нет.
        // Иначе радиус «мёртвой зоны» вокруг червя вдвое больше него самого.
        'pointer-events': 'none'
    });
    root.appendChild(floorShadow);
    root.appendChild(hull.outline);
    root.appendChild(hull.rimGroup);
    root.appendChild(hull.bridges);

    const segmentRefs = [];
    const organRefs = [];   // плоский список всех органов — для дешёвого tick()
    const muscleRefs = [];
    let tailBuilt = null;
    allParts.forEach(part => {
        if (part.isTail) {
            tailBuilt = buildTailNode(part.data, ctx, tailAttachRadius);
            root.appendChild(tailBuilt.group);
            if (tailBuilt.anat) {
                tailBuilt.anat.organs.forEach(o => organRefs.push(o));
                if (tailBuilt.anat.muscleGroup) muscleRefs.push(tailBuilt.anat.muscleGroup);
            }
        } else {
            const anatOpts = partAnatOpts(part.name, part.idx);
            const blend = blendByPart[part.name];
            const built = buildSegmentNode(part.name, part.data, ctx, {
                axis: anatOpts.axis,
                organZone: anatOpts.organZone,
                coat: anatOpts.coat,
                surface: anatOpts.surface,
                blendFill: blend ? blend.fill : null,
                blendStroke: blend ? blend.stroke : null
            });
            root.appendChild(built.group);
            segmentRefs.push({ idx: part.idx, name: part.name, radius: part.data.radius * part.data.scale, ...built });
            if (built.anat) {
                built.anat.organs.forEach(o => organRefs.push(o));
                if (built.anat.muscleGroup) muscleRefs.push(built.anat.muscleGroup);
            }
        }
    });

    // Кишечный тракт — поверх заливки тела (он просвечивает сквозь кожу),
    // но ПОД перетяжками и головой. Живёт на уровне всего тела, а не внутри
    // сегментов: иначе его невозможно сделать неразрывным.
    let gutTract = null;
    if (anatomy.enabled && anatomy.organs && (anatomy.organs.visibility || 0) > 0.01) {
        // Плотность кожи по звеньям цепи: 0 — голова, дальше сегменты по
        // своим индексам, последним хвост. Маска тракта строится по ней.
        const thinByIdx = new Array(tailIdx + 1).fill(0);
        thinByIdx[0] = anatThinness(anatomy, 'head', ctx.growingCount);
        allParts.forEach(part => {
            thinByIdx[part.idx] = anatThinness(anatomy, part.name, ctx.growingCount);
        });
        gutTract = createGutTract(ctx, thinByIdx);
        root.appendChild(gutTract.group);
        // Слой еды — СРАЗУ ЗА трактом и на том же уровне, а не внутри него
        // (почему — в комментарии у createGutTract). Порядок сохраняется:
        // комки рисуются поверх кишки, но под перетяжками и головой.
        root.appendChild(gutTract.foodLayer);
    }

    // Перетяжки — поверх тела, но ПОД головой: они принадлежат туше, а не
    // морде. (Отражённый свет живёт ниже, в hull.rimGroup — ему нужно быть
    // ПОД телом, чтобы наружу выходила только кайма.)
    root.appendChild(rings.group);

    // ---------- НАДЕТОЕ ЛЕЖИТ ПОВЕРХ КОЖИ ----------
    // Одежда жила внутри слоя своей части — и тем самым ПОД кольцами, кишкой
    // и едой в ней: все три слоя общие для всего тела и рисуются после
    // сегментов. Сквозь фрак просвечивали борозды между звеньями и блик
    // живота, и ткань читалась плёнкой, а не тканью. Ткань непрозрачна —
    // значит она выше кожи, и слой у неё отдельный.
    //
    // Платой за переезд был бы пересчёт положения части: узел больше не
    // ребёнок своей группы и её transform не наследует. Считать его заново
    // нельзя — раскладок у цепочки три, и четвёртая копия разошлась бы с
    // ними в первую же правку. Поэтому узел не считает, а СПИСЫВАЕТ: берёт
    // строку transform у самой части (см. tick, «надетое повторяет часть»).
    const wearLayer = svgEl('g', { class: 'worm-wear-layer' });
    root.appendChild(wearLayer);

    // Голова — последняя, поверх всего.
    const headBuilt = buildHeadNode(model, ctx);
    root.appendChild(headBuilt.group);

    // Отметины — монтируются как дети scarLayer конкретной части, поэтому
    // автоматически наследуют её текущий transform/scale: тело шевелится,
    // шрамы шевелятся вместе с ним, без единой строчки в анимации.
    //
    // Где именно сидит отметина, решает WormMarks по зоне и позиции вдоль
    // неё — не по имени сегмента. Имена растущих сегментов меняются при
    // взрослении, а «середина хвостовой части» остаётся собой.
    const scarHostByPart = { head: headBuilt.scarLayer, tail: tailBuilt.scarLayer };
    const radiusByPart = { head: headBuilt.rx, tail: tailBuilt.baseRadius };
    // ---------- РАЗМЕРЫ ДЛЯ ОДЕЖДЫ ----------
    // Отметине хватает одного радиуса, а одежде нужен НАСТОЯЩИЙ габарит
    // нарисованной части: сегмент — эллипс, и лента, скроенная по кругу,
    // концами повисает в воздухе. Плюс опорные точки лица: очки обязаны
    // сидеть там, где глаза, а не там, где их нарисовали на глаз.
    const wearFitByPart = {
        head: { rx: headBuilt.rx, ry: headBuilt.ry,
                eyeY: (model.eyes && model.eyes.left && model.eyes.left.offsetY) || 0,
                eyeX: (model.eyes && model.eyes.left && model.eyes.left.offsetX) || 0,
                eyeR: 8 * ((model.eyes && model.eyes.left && model.eyes.left.stretchX) || 1)
                        * ((model.eyes && model.eyes.left && model.eyes.left.scale) || 1) },
        // ---------- ХВОСТ ОДЕВАЕТСЯ ЗА КОНЧИК ----------
        // Гнездо на хвосте — это именно КОНЧИК: туда надевается носок,
        // чулок, бантик — то, во что кончик суют целиком. Раньше вещь сидела
        // у середины хвоста и читалась повязкой посреди него.
        //
        // У капли габарит по длине и по толщине РАЗНЫЕ, и толщина берётся в
        // том месте, где вещь лежит, а не у основания: по основанию ткань
        // вылезала за силуэт. long — половина длины одеваемого куска,
        // cx — его середина.
        tail: (() => {
            const L = tailBuilt.length, R = tailBuilt.baseRadius;
            const tipR = R * 0.72;         // полутолщина хвоста у гнезда
            return { rx: tipR, ry: tipR,   // для твёрдых вещей — бант, подвеска
                     long: L * 0.36, longRy: tipR * 0.95, cx: -L * 0.60 };
        })()
    };
    const skinByPart = { head: model.head.fill, tail: model.tail.fill };
    segmentRefs.forEach(seg => {
        scarHostByPart[seg.name] = seg.scarLayer;
        radiusByPart[seg.name] = seg.radius;
        wearFitByPart[seg.name] = { rx: seg.baseRx, ry: seg.baseRy };
        skinByPart[seg.name] = seg.fillColor;
    });

    // Размещение отметин считает габариты в пикселях и обязано знать
    // настоящие радиусы частей — иначе на мелких частях срабатывают
    // ограничители размера, о которых оно не подозревает.
    WormMarks.setPartRadii(wearFitByPart);

    WormMarks.ZONES.forEach(zone => {
        WormMarks.visible(model.scars, zone).forEach(mark => {
            const place = WormMarks.resolve(model, mark);
            const host = scarHostByPart[place.part];
            if (!host) return;
            const node = buildMarkNode(mark, place, radiusByPart[place.part] || 15, skinByPart[place.part]);
            host.appendChild(node);
            // ---------- ШРАМЫ ГОЛОВЫ ЕДУТ ВМЕСТЕ С ЛИЦОМ ----------
            // Голова поворачивается живьём: глаза, уши и пятак пересчитывает
            // applyHeadYaw. Шрамы в этом списке не стояли — и лицо уезжало
            // ПОД ними: шрам со щеки оказывался на глазу, потом на другой
            // стороне морды. Теперь у каждого есть азимут, и он считается тем
            // же yawProject, что у глаза (docs/traps.md, п. 102).
            if (place.part === 'head') {
                headBuilt.scars = headBuilt.scars || [];
                const headScarBox = WormMarks.halfBox(
                    WormMarks.geometry(mark.seed || 0, mark.kind || 'scar'),
                    place.rotation, radiusByPart.head || 15);
                // Азимут и высоту считать заново не надо: они ЛЕЖАТ В
                // ОТМЕТИНЕ. Здесь когда-то стояла обратная проекция — экранный
                // x переводился в угол с вычитанием текущего поворота, — и
                // держалась она ровно до первой правки: то забывали вычесть
                // поворот по умолчанию, то сравнивали углы с разных сфер.
                headBuilt.scars.push({
                    node,
                    phiDeg: (place.phi || 0) * 180 / Math.PI,
                    y: place.y * (radiusByPart.head || 15),
                    // Полугабарит вдоль поверхности — он же угловой размер
                    // отметины. Без него ракурс у края считается по
                    // производной и отметина вылезает за контур.
                    halfX: headScarBox.hx,
                    halfY: headScarBox.hy,
                    rotation: place.rotation
                });
            }
        });
    });
    if (headBuilt.scars) applyHeadScars(headBuilt, headBuilt.yaw || 0);

    // ---------- НАДЕТОЕ ----------
    // Ровно тем же путём, что и шрамы, и по той же причине: слот — это зона
    // и доля вдоль неё, а не имя сегмента. Цилиндр остаётся на голове при
    // взрослении, потому что «голова» переживает и смену числа сегментов, и
    // эволюцию, а `growing-3` — нет.
    //
    // Узел статический: он висит внутри слоя части и ездит вместе с ней сам.
    // В покадровой анимации про одежду нет ни строчки, и стоит она поэтому
    // ноль кадров.
    // Надетое, которому нужен ЖИВОЙ угол части: сегменты тела ставятся одним
    // сдвигом, без поворота, и одежда на них стояла горизонтально к экрану.
    // Угол берётся из положения соседей и пересчитывается в tick().
    const wearOnBody = [];
    // ---------- ПОДВИЖНЫЕ ДЕТАЛИ — ОДНИМ СПИСКОМ ----------
    // Качание собиралось только у надетого на ТЕЛО, и серьга в ухе не
    // качалась вовсе: у головы своя ветка монтажа, и про data-swing она не
    // знала. Список общий: висящее есть висящее, где бы оно ни висело.
    const wearSwings = [];
    // ---------- ОПРАВА: ЗЕРКАЛО И ЖИВОЙ УГОЛ НОСИТЕЛЯ ----------
    // Висящее обязано смотреть вниз ПО ЭКРАНУ, а не по своему носителю.
    // Значит из своего угла оно вычитает угол носителя и поправляется на
    // зеркало, если сидит в отражённой копии. Оба числа знает ТОЛЬКО место
    // монтажа: серьга сидит в ухе, повёрнутом на свой наклон, а левая копия
    // вдобавок отражена через scale(-1,1) — внутри неё положительный поворот
    // выглядит на экране отрицательным. Пока этого не было, обе серьги
    // сходились к голове на одном завале телефона и расходились на другом.
    // frame: { flip: ±1, ear: ссылка на ухо (у него живой baseAngle) }
    const collectSwings = (node, part, frame) => {
        const f = frame || {};
        // `order` — место детали ВНУТРИ своей вещи. По нему пружина
        // мягчеет вдоль подвески: так цепочка из нескольких звеньев
        // изгибается, а не едет одним куском. Общий номер в списке для этого
        // не годится — тогда вещь, добавленная позже, качалась бы вяло.
        [...node.querySelectorAll('[data-swing]')].forEach((el, order) => {
            // Точка крепления подвески в её собственных координатах. Вокруг
            // неё и идёт поворот: без этого подвеска вертелась вокруг начала
            // координат части и отрывалась от своего же гвоздика.
            // Строки собираются здесь, а не каждый кадр: в tick остаётся одна
            // склейка вместо четырёх.
            const pv = (el.getAttribute('data-pivot') || '').split(',');
            const px = parseFloat(pv[0]) || 0, py = parseFloat(pv[1]) || 0;
            wearSwings.push({ el, part, order,
                              k: parseFloat(el.getAttribute('data-swing')) || 1,
                              flip: f.flip || 1, ear: f.ear || null,
                              pre: (px || py) ? `translate(${px},${py}) rotate(` : 'rotate(',
                              post: (px || py) ? `) translate(${-px},${-py})` : ')',
                              ang: 0, vel: 0, now: 0 });
        });
    };
    if (typeof WormCosmetics !== 'undefined' && model.cosmetics) {
        Object.keys(model.cosmetics).forEach(slotKey => {
            const itemId = model.cosmetics[slotKey];
            if (!itemId) return;
            // ---------- У ГНЕЗДА МЕСТ МОЖЕТ БЫТЬ НЕСКОЛЬКО ----------
            // Верхняя одежда занимает два соседних сегмента: верх и низ одной
            // вещи. Ответ у resolveSlot всегда список — одна ветка на все
            // гнёзда, иначе вторая отстаёт от первой.
            const places = WormMarks.resolveSlot(model, slotKey) || [];
            if (!places.length) return;
            // Общая мера для всех частей вещи — радиус ПОСЛЕДНЕЙ (нижней).
            // По ней половины сходятся по шву: сегменты разной толщины, и
            // одна доля даёт в них разную ширину.
            const refFit = wearFitByPart[places[places.length - 1].part];
            const refRx = refFit ? refFit.rx : null;
            // Опорная часть вещи: по её оси выстраивается ЛИЦО всех половин.
            // Сегменты не стоят на одной вертикали (при рождении они сдвинуты
            // друг относительно друга, а при изгибе тем более), и манишка,
            // отцентрованная по каждому сегменту своему, разрывалась по шву
            // зигзагом. Обшивка при этом обнимает СВОЙ сегмент — ей смещение
            // не нужно и вредно.
            const refPart = places[places.length - 1].part;

            places.forEach(place => {
                const host = scarHostByPart[place.part];
                if (!host) return;
                const fit = wearFitByPart[place.part] || { rx: radiusByPart[place.part] || 15,
                                                          ry: radiusByPart[place.part] || 15 };
                const art = WormCosmetics.art(itemId, fit.rx, skinByPart[place.part],
                                              fit, place.sub, refRx);
                // Часть вещи может не существовать: лента занимает только низ
                // гнезда верхней одежды. Это не ошибка.
                if (!art) return;
                const hostR = radiusByPart[place.part] || 15;
                // Сдвиг к МЕСТУ на части — дело монтажа, а не кроя: у гнезда
                // на хвосте место у кончика, у остальных по центру.
                const along = (place.tip && fit.cx) || 0;
                const g = svgEl('g', { 'data-cosmetic': slotKey,
                                       'data-sub': place.sub || '',
                                       transform: `translate(${(place.x * hostR + along).toFixed(2)},0)` });
                g.innerHTML = art;

                // ---------- НА ТЕЛЕ ----------
                if (place.part !== 'head') {
                    const seg = segmentRefs.filter(sg => sg.name === place.part)[0];
                    // Зеркало части: чьи transform списывать каждый кадр. У
                    // хвоста их два — положение звена и его изгиб.
                    const mirror = place.part === 'tail'
                        ? [tailBuilt.group, tailBuilt.bendGroup]
                        : (seg ? [seg.group] : []);
                    const hostNode = svgEl('g', { class: 'worm-wear-host' });
                    hostNode.appendChild(g);
                    wearLayer.appendChild(hostNode);
                    collectSwings(g, place.part);
                    wearOnBody.push({
                        node: g, hostNode, mirror, mirrored: null, part: place.part,
                        idx: place.part === 'tail' ? tailIdx : (seg ? seg.idx : null),
                        baseX: place.x * hostR + along,
                        // ---------- РАКУРС ДВИГАЕТ ЛИЦО, А НЕ ВСЮ ВЕЩЬ ----------
                        // У ткани обшивка обнимает часть кругом и при любом
                        // ракурсе достаёт до обоих краёв силуэта. Сужается и
                        // съезжает только лицевая сторона — узел [data-face].
                        // Пока сужалась вся вещь, она скукоживалась к центру, и
                        // по бокам вылезала голая кожа.
                        faceNode: g.querySelector('[data-face]'),
                        // ---------- ПОЛОВИНЫ ЕДУТ ОДИНАКОВО ----------
                        // Сдвиг лица считался в радиусах СВОЕЙ части, а у
                        // половин они разные: манишка сверху уезжала не
                        // настолько, насколько снизу, и разрывалась по шву.
                        // Опорный радиус общий — тот же, которым меряются
                        // ширины (см. refRx).
                        faceR: refRx || null,
                        refIdx: (() => {
                            if (places.length < 2 || place.part === refPart) return null;
                            if (refPart === 'tail') return tailIdx;
                            const rs = segmentRefs.filter(sg => sg.name === refPart)[0];
                            return rs ? rs.idx : null;
                        })(),
                        faceHalf: (() => {
                            const f = g.querySelector('[data-face]');
                            return f ? (parseFloat(f.getAttribute('data-face')) || 0.62) : 0;
                        })(),
                        // Подвижные детали: банты, фалды, подвески. Их качает
                        // ходьба — тем и отличается наряд от наклейки.
                        halfW: WormCosmetics.halfWidth(itemId, place.sub),
                        shownX: null, shownSq: null
                    });
                    return;
                }

                // ---------- НА ГОЛОВЕ ----------
                // Голова рисуется последней и поверх колец сама, поэтому её
                // наряд остаётся жить внутри неё. Посадку даёт ГНЕЗДО, а не
                // предмет: любые очки садятся на глаза, любая сигара — на
                // морду.
                headBuilt.wear = headBuilt.wear || [];
                const seat = place.seat || 'axis';

                // ---------- ПАРНАЯ ЧЕРТА: КАЖДЫЙ КУСОК НА СВОЮ ----------
                // Очки садились ОДНИМ узлом на оба глаза: середина между
                // ними плюс общее сужение. Середина совпадала точно, а
                // ширина — нет: глаза при повороте сужаются по-разному
                // (ближний почти не сужается, дальний вдвое), и одна общая
                // шкала не может сесть на оба. Замер: глаз 23.0, линза 8.4 —
                // из-под дальней линзы выглядывала склера.
                //
                // Теперь куски с data-eye садятся каждый на СВОЙ глаз, а
                // перемычка (data-span) растягивается между ними. Заодно это
                // и есть способ сделать вещь на ОДИН глаз — повязку пирата.
                if (seat === 'eyes' && /data-eye=/.test(art)) {
                    host.appendChild(g);
                    collectSwings(g, 'head');
                    headBuilt.wear.push({
                        node: g,
                        eyePair: {
                            left: headBuilt.eyes && headBuilt.eyes.left && headBuilt.eyes.left.group,
                            right: headBuilt.eyes && headBuilt.eyes.right && headBuilt.eyes.right.group
                        }
                    });
                    return;
                }

                // Рот и уши своей формулы не имеют: они СПИСЫВАЮТ transform у
                // того узла, который уже едет правильно. У ушей таких узлов
                // два, поэтому вещь вешается на каждое ухо своей копией.
                if (seat === 'mouth' || seat === 'ears') {
                    // ---------- ЦЕПЛЯЕМСЯ К САМОЙ ЧЕРТЕ ----------
                    // Ко РТУ, а не к морде: у морды своя проекция (она
                    // выступает вперёд), и вещь, посаженная на неё, при
                    // повороте расходилась со ртом. mouthAnchor несёт ровно
                    // ту посадку, что у рта, и предмет рисуется в МЕСТНЫХ
                    // координатах рта — уголки губ на ±face.mouthHalf.
                    const hosts = seat === 'mouth'
                        ? [{ node: headBuilt.mouthAnchor, side: 1 }]
                        : ['left', 'right'].map(sd => {
                            const e = headBuilt.ears && headBuilt.ears[sd];
                            return e ? { node: e.group, side: e.mirror || 1, ref: e } : null;
                        });
                    hosts.filter(Boolean).forEach((h, k) => {
                        const art = k === 0 ? g : g.cloneNode(true);
                        // Сторона зеркалится ЗДЕСЬ, а не в предмете: вещь
                        // рисуется один раз, для правой стороны, и левая
                        // получает её отражением. Иначе каждая вещь на уши
                        // заводила бы по две картинки.
                        const node = svgEl('g', { 'data-cosmetic': slotKey,
                                                  'data-side': h.side < 0 ? 'left' : 'right',
                                                  transform: h.side < 0 ? 'scale(-1,1)' : '' });
                        node.appendChild(art);
                        art.removeAttribute('data-cosmetic');
                        // Сторона зеркалится через scale(-1,1) — значит и
                        // поворот подвески внутри неё виден на экране с
                        // обратным знаком. А сам носитель (ухо) повёрнут на
                        // свой наклон, и его надо вычесть: серьга висит вниз
                        // по экрану, а не вниз по уху.
                        collectSwings(node, 'head',
                                      { flip: h.side < 0 ? -1 : 1, ear: h.ref || null });
                        const wrap = svgEl('g');
                        wrap.appendChild(node);
                        host.appendChild(wrap);
                        headBuilt.wear.push({ node: wrap, mirror: h.node, mirrored: null });
                    });
                    return;
                }

                host.appendChild(g);
                collectSwings(g, 'head');
                headBuilt.wear.push({
                    node: g, fit: seat === 'eyes' ? 'face' : seat, x: place.x * hostR,
                    // Опоры для посадки на лице: где стоят глаза и какой у
                    // предмета авторский разлёт. По ним очки садятся ровно на
                    // яблоки при любом повороте.
                    eyeAzDeg: (() => {
                        const surf = headBuilt.rx * WormSilhouette.face.eyeSurfaceK;
                        const off = Math.max(-1, Math.min(1, (fit.eyeX || 0) / (surf || 1)));
                        return Math.asin(off) * 180 / Math.PI;
                    })(),
                    eyeHalfW: (fit.eyeR || 0) / headBuilt.rx,
                    eyeSpread: (fit.eyeX || 0) / headBuilt.rx
                });
            });
        });
    }

    // Посадку надетого надо применить СРАЗУ, а не ждать первого поворота:
    // голова по умолчанию стоит в три четверти, и очки, собранные в позе
    // анфас, до первого движения висят мимо глаз.
    if (headBuilt.wear) applyHeadWear(headBuilt, headBuilt.yaw || 0);

    // Грудная клетка: плоский список рёбер обеих половин и сами группы —
    // tick() пересчитывает по ним ракурс и меняет половины местами по
    // глубине. Держим отдельно, чтобы не искать их каждый кадр в дереве.
    const ribWalls = organRefs.filter(o => o.kind === 'ribs' && o.ribs);
    const ribCage = ribWalls.length ? {
        walls: ribWalls,
        list: ribWalls.reduce((acc, o) => acc.concat(o.ribs), []),
        groups: ribWalls.map(o => o.group),
        psi: null,        // какой ракурс сейчас нарисован
        frontIsB: null    // какая половина сейчас поверх органов
    } : null;

    return {
        wearOnBody, wearSwings,
        root,
        totalWithTail,
        tail: { ...tailBuilt, idx: tailIdx },
        segments: segmentRefs,
        head: headBuilt,
        organs: organRefs,
        muscles: muscleRefs,
        hull, rings, floorShadow, gutTract, ribCage,
        anatomy
    };
}

