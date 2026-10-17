// ================= ЧЕРВЬ: СБОРКА ГОЛОВЫ =================
// Переход шея → голова, детали морды, форма черепа и buildHeadNode — сборка
// черепа, морды, ушей, пятачка, рта и глаз в один узел.
// Вынесено из worm-head.js; подключается сразу после него.

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

    // ---------- СКЛАДОК ЛБА И ВИБРИСС ЗДЕСЬ НЕТ ----------
    // Вибриссы (четыре длинных волоска по щекам) убрали раньше: на лице в
    // размер экрана это не волоски, а четыре диагональные царапины. Складки
    // лба ушли следом и по той же причине — пара дуг над бровями читалась
    // штриховкой. Отличить деталь от царапины нельзя — значит рисовать
    // нечего (docs/traps.md, п. 148).
    // Тень у основания ушей осталась: она мягкое пятно, а не штрих, и решает
    // настоящую задачу — уши растут ИЗ головы, а не приставлены к ней.

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

    // ---------- БЛИКА НА ЧЕРЕПЕ ЗДЕСЬ БОЛЬШЕ НЕТ ----------
    // Его чинили дважды: сперва он стоял неподвижно и вылезал за контур
    // головы светлым туманом (починили клипом и ездой по поверхности), потом
    // улетал на тысячу пикселей от лишнего умножения на rx (п. 144). Обе
    // починки были про то, ГДЕ он лежит, и ни одна — про то, ЧЕМ он выглядит.
    //
    // А выглядел он так: ровный эллипс в 16% белого поверх кожи, с чёткой
    // кромкой по всему периметру. Блик — это место, где поверхность
    // поворачивается к свету, у него нет замкнутого края; эллипс с краем
    // читается пятном на лбу, и ровно так его и описал человек, глядя на
    // экран: «область с рассеянным туманом». Убран по правилу п. 148 —
    // назвали бликом, нарисовали пятно.
    //
    // Объём голове даёт не он: его держат рельеф черепа (мягкие пятна скул,
    // висков и надбровий) и отражённый свет по кромке силуэта. Снимок без
    // блика от снимка с бликом отличается ровно на это пятно и выглядит
    // чище — проверено глазами, а не рассуждением.

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
        // ---------- ОБВОДКА УХА НЕ ЗАВИСИТ ОТ РАКУРСА ----------
        // Группа уха масштабируется, а вместе с ней масштабируется и
        // обводка. Компенсация есть, но считалась она РОВНО ОДИН РАЗ, на
        // сборке, — и замораживала тот ракурс, в котором голову собрали.
        //
        // Чем это кончилось: у правого уха в обводку было вписано 3.85, у
        // левого 2.63, и разница в 46% оставалась даже на анфасе, когда оба
        // уха одинаковы. Голову собирают чаще всего повёрнутой (она сама
        // доворачивается за ходьбой), и какое ухо окажется толще — лотерея.
        //
        // Теперь толщина пересчитывается там же, где трансформ, — живым
        // путём (см. applyEarStroke).
        const earStrokeK = earStrokeComp(earSx, earSy);
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
        // ---------- ОПУШКИ УХА ЗДЕСЬ БОЛЬШЕ НЕТ ----------
        // Пять штрихов «внутрь раковины» — и оговорка в старом комментарии
        // («ровный частокол читается хирургическим швом») оказалась точным
        // описанием результата, а не предупреждением, которого удалось
        // избежать: разброс по длине частокол не разбивал. В размер экрана
        // внутри уха это трещины, а не щетина. Убрано вместе с остальной
        // щетиной (docs/traps.md, п. 148).
        earsGroup.appendChild(earGroup);
        // ВАЖНО: в refs кладётся ПОЛНЫЙ масштаб — с калибровкой формы и с
        // ракурсным сжатием. Раньше тут лежал только ear.scale*stretchX, а
        // tick() каждый кадр переписывает этот трансформ целиком, поэтому
        // и калибровка, и сжатие терялись через кадр после сборки: на
        // замерах дальнее и ближнее ухо выходили одинаковой ширины при
        // явно повёрнутой голове.
        earRefs[side] = {
            group: earGroup, shape: earShape, inner: earInner,
            // Узлы с обводкой и их НОМИНАЛЬНАЯ толщина: по ним живой путь
            // пересчитывает компенсацию масштаба.
            strokes: [{ el: earShape, base: SW.contour }, { el: earRidge, base: SW.detail }],
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
        //
        // С тех пор по тому же правилу убрали кольца, складки и щетину и с
        // ТЕЛА тоже (docs/traps.md, п. 148), так что глушить здесь стало
        // нечего — но сам вывод про масштаб лица остаётся в силе и стоит
        // тут как предупреждение следующей попытке.
        coat: {}
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
    // ---------- РАДИАЛЬНЫХ МОРЩИНОК ВОКРУГ ПЯТАЧКА НЕТ ----------
    // Их уже резали с восьми до четырёх, чтобы они не сливались с порами в
    // рябь, — не помогло: четыре коротких луча по кругу читаются царапинами
    // вокруг пятачка, а не складками кожи. Пятачок держат пора, ноздря,
    // блик и philtrum; этого хватает (docs/traps.md, п. 148).

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
        earsGroup, earsFront,
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
    ['left', 'right'].forEach(side => applyEarStroke(headRef.ears[side]));
    ['left', 'right'].forEach(side => {
        const e = headRef.eyes[side];
        if (!e) return;
        applyBrowFit(headRef, e, WormSilhouette.eyePlace(e.yawPhi, headYaw, e.baseRx / rx), headYaw);
    });
    return headRef;
}
