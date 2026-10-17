// ================= ЧЕРВЬ: ГЛАЗ =================
// Склера, радужка, зрачок, веко-шторка, сосуды. Часть стопки рендерера (карта — worm-basis.js).
// Вынесено из worm-head.js; подключается сразу после него.

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
