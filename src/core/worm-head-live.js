// ================= ЧЕРВЬ: ГОЛОВА НА КАДРЕ =================
// Применение позы к собранной голове: брови, обводка и глубина ушей, наряд и
// шрамы при повороте, ракурс (applyHeadYaw), морда.
// Вынесено из worm-head.js; подключается сразу после него.

// ---------- БРОВЬ ПОДБИРАЕТСЯ, А НЕ ОБРУБАЕТСЯ ----------
// К контуру прижимается только ГЛАЗ — по своей полуширине (eyePlace). Бровь
// шире: её концы уходят к носу и к виску, и на повороте наружный конец
// выезжал за голову и висел в воздухе рядом с ухом.
//
// Обрезка силуэтом это прячет, но оставляет вертикальный срез поперёк
// брови — видно, что её отрубили. Поэтому бровь ещё и ПОДБИРАЕТСЯ: сжимается
// по горизонтали ровно настолько, чтобы её кончик остался внутри. Ширину
// спрашиваем у САМОГО контура (skullHalfWidth) — не у второй формулы,
// которая с ним разойдётся.
const BROW_TIP_PAD = 0.96;
    // запас между кончиком брови и кромкой
const BROW_SQUEEZE_MIN = 0.4;
 // сильнее сжатая бровь читается обрубком

// ЕДИНСТВЕННОЕ место, где собирается трансформ брови. Слагаемых три:
// посадка из модели, живое «поднять бровь» и подбор по контуру. Пока их
// складывали в двух местах, кадровый цикл писал свою версию поверх — и
// высота брови из модели не доезжала до экрана вовсе, а подбор снимался
// через кадр после поворота.
function applyBrowTransform(e) {
    if (!e || !e.browGroup) return;
    const raise = e.browRaise || 0;
    const y = e.browBaseY - raise * 4;
    const a = e.browAngle - raise * 6 * (e.browMirror || 1);
    const k = e.browSqueeze != null ? e.browSqueeze : 1;
    const dx = e.browShift || 0;
    setAttr(e.browGroup, 'transform',
        `translate(${dx.toFixed(2)},${y.toFixed(2)}) rotate(${a.toFixed(2)})` +
        (Math.abs(k - 1) > 0.002 ? ` scale(${k.toFixed(3)},1)` : ''));
}

function applyBrowFit(headRef, e, place, yaw) {
    if (!e || !e.browGroup || !e.browOut) return;
    const rx = headRef.rx, ry = headRef.ry;
    const yNorm = (e.offsetY + e.browTipY) / ry;
    // Полоса, в которой на ЭТОЙ высоте вообще есть голова. При повороте она
    // несимметрична: одна половина черепа уже другой. Спрашиваем сам контур.
    const R = WormSilhouette.skullHalfWidth(yNorm, headRef.skullCfg, yaw, 1) * rx * BROW_TIP_PAD;
    const L = WormSilhouette.skullHalfWidth(yNorm, headRef.skullCfg, yaw, -1) * rx * BROW_TIP_PAD;
    let k = 1, dx = 0;
    if (R > 0 && L > 0) {
        const sq = place.squash;
        const width = Math.abs(sq * (e.browOut - e.browIn));
        const band = R + L;
        // Шире полосы — сжимаем. Не влезает даже сжатая — значит на этой
        // высоте головы почти нет, и бровь честно становится коротким мазком.
        if (width > band) k = Math.max(BROW_SQUEEZE_MIN, band / width);
        const eyeX = place.x * rx;
        const a1 = eyeX + sq * k * e.browIn, a2 = eyeX + sq * k * e.browOut;
        const hi = Math.max(a1, a2), lo = Math.min(a1, a2);
        // Сдвиг ВНУТРЬ: одного сжатия мало, потому что сжимается бровь вокруг
        // центра глаза — а центр глаза на высоте брови сам может оказаться за
        // кромкой (глаз прижат к контуру по СВОЕЙ высоте, где череп шире).
        if (hi > R) dx = R - hi;
        if (lo + dx < -L) dx = -L - lo;
        // В местные координаты брови: группа глаза сжата по x на squash.
        dx = sq > 0.05 ? dx / sq : 0;
    }
    e.browSqueeze = k;
    e.browShift = dx;
    applyBrowTransform(e);
}

// ---------- КОМПЕНСАЦИЯ МАСШТАБА У ОБВОДКИ ----------
// Ухо рисуется в своих координатах и ставится на место масштабом. Обводка
// масштабируется вместе с ним, поэтому номинал делится на средний масштаб —
// тогда на экране линия остаётся той толщины, какую назначила иерархия
// линий (docs/art-direction.md).
//
// Делим на БОЛЬШИЙ из двух масштабов, а не на среднее. Масштаб
// неравномерный: при развороте ухо сжимается по x и не сжимается по y, и
// «одной толщины» на всех кромках тут не существует в принципе.
//
// Среднее давало худший из возможных ответов: у отвёрнутого уха боковые
// кромки утончались до 1.5, а ВЕРХНЯЯ И НИЖНЯЯ раздувались до 3.7 при
// номинале 2.5 — и ухо читалось обведённым жирнее соседнего. Ровно на это
// и жаловались.
//
// По большему масштабу толще номинала не выходит НИКОГДА: где ухо сжато,
// линия честно утончается вместе с ним (так и ведёт себя повёрнутая
// плоскость), а где не сжато — стоит ровно тот вес, который назначила
// иерархия линий (docs/art-direction.md).
function earStrokeComp(sx, sy) {
    return 1 / (Math.max(Math.abs(sx), Math.abs(sy)) || 1);
}

function applyEarStroke(ear) {
    if (!ear || !ear.strokes) return;
    const k = earStrokeComp(ear.scaleX, ear.scaleY);
    for (let i = 0; i < ear.strokes.length; i++) {
        const s = ear.strokes[i];
        if (s.el) setAttr(s.el, 'stroke-width', (s.base * k).toFixed(2));
    }
}

// ---------- ГЛУБИНА УХА ПРИ ПОВОРОТЕ ----------
// Ближнее ухо при полном развороте выходит ПЕРЕД массой головы, дальнее
// остаётся за ней. Пока обе группы лежали под черепом, повёрнутая голова
// читалась вывернутой: ухо со стороны зрителя торчало откуда-то из-за
// затылка.
//
// ---------- КОТОРОЕ ИЗ ДВУХ БЛИЖНЕЕ ----------
// Первая версия решала это ЗНАКОМ ракурса — и ошиблась стороной, потому что
// «голова повернулась вправо» и «правое ухо ближе» — разные утверждения.
// Нос уезжает вправо, а к зрителю разворачивается ЛЕВАЯ щека: именно с её
// стороны видно больше всего головы, и именно её ухо ближе. Замер при
// yaw = +0.5: от пятачка до кромки влево 61 точка, вправо 17; левое ухо
// шириной 62 точки, правое 30.
//
// Поэтому сторона не выводится из знака, а СПРАШИВАЕТСЯ у той же функции,
// которая уши и ставит. `squash` в earPlacement — это |cos| азимута уха от
// камеры: ухо анфас широкое (squash к единице), ухо ребром узкое. Ближнее —
// то, которое шире. Знака в этом рассуждении нет вовсе, а значит нечему и
// перепутаться.
//
// Порог высокий: ухо сидит на азимуте около 63° от плоскости лица, и его
// корень прячется за скулой почти до самого предела поворота. Переезд —
// событие крайнего ракурса, а не постоянное переключение.
//
// Гистерезис обязателен: без него на самом пороге ухо мигало бы туда-сюда
// каждый кадр — голова всё время чуть поводит.
const EAR_FRONT_ON = 0.78;
    // доля предела поворота, после которой ухо впереди
const EAR_FRONT_OFF = 0.62;
   // и до которой возвращается назад

function applyHeadEarDepth(headRef, yaw) {
    const front = headRef.earsFront, back = headRef.earsGroup;
    if (!front || !back) return;
    const limit = (typeof WORM_HEAD_YAW_LIMIT === 'number') ? WORM_HEAD_YAW_LIMIT : 1;
    const t = Math.abs(yaw || 0) / (limit || 1);
    const было = headRef.earFrontSide || 0;
    let надо = было;
    if (t >= EAR_FRONT_ON) {
        const L = headRef.ears.left, R = headRef.ears.right;
        if (!L || !R) return;
        // Кто шире — тот и ближе. Спрашиваем ту же earPlacement, которой уши
        // и расставлены: второй формулы «где ухо» в проекте быть не должно.
        надо = earPlacement(L, yaw).squash >= earPlacement(R, yaw).squash ? -1 : 1;
    } else if (t <= EAR_FRONT_OFF) {
        надо = 0;
    }
    if (надо === было) return;
    headRef.earFrontSide = надо;
    ['left', 'right'].forEach(side => {
        const ear = headRef.ears[side];
        if (!ear || !ear.group) return;
        const mirror = side === 'left' ? -1 : 1;
        const host = (надо !== 0 && mirror === надо) ? front : back;
        if (ear.group.parentNode !== host) host.appendChild(ear.group);
    });
}

// ---------- ЖИВОЙ ПЕРЕСЧЁТ ПОВОРОТА ГОЛОВЫ ----------
// Тот же расчёт, что и при сборке, но переставляет атрибуты УЖЕ созданных
// узлов — ни одного нового элемента. Это обязательное условие, чтобы поворот
// можно было анимировать: setOverride пересобирает всю голову заново и для
// покадровой анимации не годится.
//
// Пересчитывать нужно ровно шесть вещей: путь черепа (он асимметричен),
// трансформы двух глаз, двух ушей, пятачка с мордой и рта.
// ---------- ШРАМЫ ГОЛОВЫ ПРИ ЖИВОМ ПОВОРОТЕ ----------
// Шрам — точка НА КОЖЕ: у него есть азимут вокруг вертикальной оси и высота.
// Куда он попадёт на экране, считает `WormSilhouette.skinPoint` — та самая
// функция, которой размещение проверяло место. Пока функций было две (здесь
// проекция по шару радиуса rx, там разрешённые прямоугольники), шрам был
// проверен в одном месте, а нарисован в другом — и висел рядом с головой
// в воздухе (docs/traps.md, п. 103).
//
// Разводка с глазами, пятачком и ртом здесь НЕ делается: место, которое
// задевает черту лица, просто не выдаётся при размещении — и не выдаётся ни
// при каком ракурсе. Отодвигать шрам на лету значило бы ломать ровно ту
// проверку, которой он прошёл.
// Надетое на голову при живом повороте. Отдельно от шрамов: у шрама есть
// азимут и он прячется на изнанке, а шляпа и очки сидят по центру морды и
// не прячутся никогда — им нужна только посадка (WormSilhouette.wearPlace).
function applyHeadWear(headRef, yaw) {
    const list = headRef.wear;
    if (!list || !list.length) return;
    const rx = headRef.rx || 1;
    for (let i = 0; i < list.length; i++) {
        const w = list[i];
        // ---------- ЧТО УЖЕ ЕДЕТ ПРАВИЛЬНО, У ТОГО И СПИСЫВАЕМ ----------
        // У рта и у ушей своей формулы посадки нет и не нужно: морда и уши
        // уже пересчитаны на этот ракурс, и вещь просто повторяет их
        // transform. Вторая формула про то же самое разошлась бы с первой
        // на первой же правке (docs/traps.md, п. 103).
        // ---------- ПАРНАЯ ЧЕРТА ----------
        // Каждый кусок садится на свой глаз, перемычка растягивается между
        // ними. Своих формул тут нет: берём то, что уже посчитано глазам.
        if (w.eyePair) {
            const at = (node) => {
                const m = /translate\(([-0-9.]+)[ ,]([-0-9.]+)\)/.exec(
                    (node && node.getAttribute('transform')) || '');
                return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
            };
            const l = at(w.eyePair.left), r = at(w.eyePair.right);
            ['left', 'right'].forEach(side => {
                const part = w.node.querySelector('[data-eye="' + side + '"]');
                const host = w.eyePair[side];
                if (!part || !host) return;
                const t = host.getAttribute('transform') || '';
                if (t !== part.__was) { part.__was = t; setAttr(part, 'transform', t); }
            });
            const span = w.node.querySelector('[data-span]');
            if (span && l && r) {
                const t = `translate(${((l.x + r.x) / 2).toFixed(2)},${((l.y + r.y) / 2).toFixed(2)})`
                        + ` scale(${Math.abs(r.x - l.x).toFixed(2)},1)`;
                if (t !== span.__was) { span.__was = t; setAttr(span, 'transform', t); }
            }
            continue;
        }
        if (w.mirror) {
            const t = w.mirror.getAttribute('transform') || '';
            if (t !== w.mirrored) { w.mirrored = t; setAttr(w.node, 'transform', t); }
            continue;
        }
        const p = WormSilhouette.wearPlace(w.fit, yaw, w);
        setAttr(w.node, 'transform',
            `translate(${(w.x + p.x * rx).toFixed(2)},0) scale(${p.squash.toFixed(3)},1)`);
    }
}

function applyHeadScars(headRef, yaw) {

    const list = headRef.scars;
    if (!list || !list.length) return;
    const rx = headRef.rx || 1;
    const ratio = (headRef.ry || rx) / rx;
    for (let i = 0; i < list.length; i++) {
        const sc = list[i];
        // v — высота в долях rx, как её вернуло размещение.
        const skin = WormSilhouette.skinPoint(sc.phiDeg, sc.y / rx, headRef.skullCfg, yaw, ratio, sc.halfX, sc.halfY);
        if (!skin.front) { setAttr(sc.node, 'display', 'none'); continue; }
        setAttr(sc.node, 'display', null);
        // Гашение у края: отметина не пропадает рывком, а сходит на нет.
        // Жёсткий порог давал мигание — голова у стоящего червя всё время
        // чуть поводит, и отметина ровно на пороге вспыхивала по нескольку
        // раз в секунду (docs/traps.md, п. 104).
        if (sc.alpha !== skin.alpha) {
            sc.alpha = skin.alpha;
            for (let c = sc.node.firstChild; c; c = c.nextSibling) {
                if (c.__baseOpacity == null) continue;
                setAttr(c, 'opacity', (c.__baseOpacity * skin.alpha).toFixed(3));
            }
        }
        setAttr(sc.node, 'transform',
            `translate(${(skin.x * rx).toFixed(2)},${sc.y.toFixed(2)}) `
            + `scale(${Math.max(0.05, skin.squash).toFixed(3)},1) rotate(${sc.rotation.toFixed(1)})`);
    }
}

function applyHeadYaw(headRef, yaw) {
    if (!headRef || headRef.yaw === yaw) return;
    headRef.yaw = yaw;
    applyHeadScars(headRef, yaw);
    const rx = headRef.rx, ry = headRef.ry;

    // Череп — единственная строка пути, которую приходится пересобирать.
    // Она короткая (шесть кривых), в отличие от пути кишечного тракта.
    if (headRef.skull) {
        const d = skullPathData(rx, ry, headRef.skullCfg, yaw);
        setAttr(headRef.skull, 'd', d);
        if (headRef.skullClipShape) setAttr(headRef.skullClipShape, 'd', d);
    }

    // Глаза: посадка по поверхности + ракурсное сжатие через scale группы.
    // Та же посадка, что и при сборке, и та же, которую спрашивает
    // размещение шрамов. Формула ОДНА: пока она была записана трижды, две
    // копии из трёх успевали разойтись.
    ['left', 'right'].forEach(side => {
        const e = headRef.eyes[side];
        if (!e) return;
        const place = WormSilhouette.eyePlace(e.yawPhi, yaw, e.baseRx / rx);
        setAttr(e.group, 'transform',
            `translate(${(place.x * rx).toFixed(2)},${e.offsetY}) scale(${place.squash.toFixed(3)},1)`);
        applyBrowFit(headRef, e, place, yaw);
    });

    // Уши: пересчитываем якорь и сжатие, но САМ трансформ не пишем — его
    // каждый кадр собирает tick() вместе с наклоном уха. Пишем в refs,
    // откуда tick его и берёт.
    ['left', 'right'].forEach(side => {
        const ear = headRef.ears[side];
        if (!ear) return;
        const place = earPlacement(ear, yaw);
        ear.anchorX = place.x;
        ear.scaleX = ear.baseScaleX * place.squash;
        // Разворот наружу тоже зависит от ракурса — ухо, вставшее ребром,
        // подбирается за голову вместо того, чтобы торчать вбок.
        ear.baseAngle = ear.baseTilt * (1 - EAR_EDGE_STRAIGHTEN * place.edge) + ear.ownRotation;
        setAttr(ear.group, 'transform',
            `translate(${ear.anchorX.toFixed(2)},${ear.anchorY.toFixed(2)}) ` +
            `rotate(${ear.baseAngle.toFixed(1)}) ` +
            `scale(${ear.scaleX.toFixed(3)},${ear.scaleY.toFixed(3)})`);
        // Толщина обводки — там же, где масштаб: иначе она застывает на том
        // ракурсе, в котором ухо собрали.
        applyEarStroke(ear);
    });
    applyHeadEarDepth(headRef, yaw);

    // Пятачок и морда: выступающие черты, уезжают сильнее прочих. Сам
    // трансформ пятачка тоже собирает tick() (принюхивание), поэтому здесь
    // только обновляем базовые значения в refs.
    const snoutProj = yawProject(rx, 0, yaw, headRef.snoutProtrude);
    headRef.snoutX = snoutProj.x;
    headRef.snoutSquash = Math.max(0.55, Math.abs(snoutProj.squash));
    if (headRef.muzzleGroup) {
        const mzp = yawProject(rx, 0, yaw, headRef.snoutProtrude * 0.7);
        headRef.muzzleX = mzp.x;
        applyMuzzleTransform(headRef);
    }

    // Рот: тот же выступ, но с ограничителем по ширине морды.
    if (headRef.mouthAnchor) {
        const mp = yawProject(rx, 0, yaw, headRef.mouthProtrude);
        const maxX = rx * (headRef.skullCfg.muzzleWidth != null ? headRef.skullCfg.muzzleWidth : 0.46) * 0.45;
        headRef.mouthX = Math.sign(mp.x) * Math.min(Math.abs(mp.x), maxX);
        headRef.mouthSquash = Math.max(0.62, Math.abs(mp.squash));
        const mo = headRef.mouthBaseScale || { x: 1, y: 1 };
        setAttr(headRef.mouthAnchor, 'transform',
            `translate(${headRef.mouthX.toFixed(2)},${(ry * MOUTH_Y).toFixed(2)}) ` +
            `scale(${(mo.x * headRef.mouthSquash).toFixed(3)},${mo.y.toFixed(3)})`);
    }

    // ---------- НАДЕТОЕ НА ГОЛОВУ — ПОСЛЕДНИМ ----------
    // Сигара во рту и серьги в ушах не считают свою посадку, а СПИСЫВАЮТ
    // transform у морды и у ушей. Значит те должны быть уже пересчитаны:
    // вызов стоял первым, и вещи отставали на кадр.
    applyHeadWear(headRef, yaw);
}

// Трансформ «морды» пишут ДВА источника: поворот головы (сдвиг вбок, потому
// что морда выступает вперёд) и надувание щёк из мимики. Раньше каждый писал
// атрибут целиком и затирал чужую работу — надутые щёки сбрасывали сдвиг от
// поворота, и морда отклеивалась от пятачка, повисая светлым пятном рядом с
// ним. Поэтому оба слагаемых хранятся в refs, а собирает их одно место.
function applyMuzzleTransform(headRef) {
    if (!headRef.muzzleShift) return;
    const x = headRef.muzzleX || 0;
    const puff = headRef.muzzlePuff || 0;
    const parts = [];
    if (Math.abs(x) > 0.01) parts.push(`translate(${x.toFixed(2)},0)`);
    if (puff > 0.001) parts.push(`scale(${(1 + 0.12 * puff).toFixed(3)},${(1 + 0.05 * puff).toFixed(3)})`);
    setAttr(headRef.muzzleShift, 'transform', parts.join(' '));
}
