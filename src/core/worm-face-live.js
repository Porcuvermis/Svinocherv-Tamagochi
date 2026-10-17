// ================= ЧЕРВЬ: МИМИКА НА КАДРЕ =================
// Часть покадрового цикла (tick в worm-renderer.js): рот, поворот и наклон
// головы, уши, пятачок, челюсть, щёки, взгляд, брови, моргание. Узлы головы
// строит worm-head.js; здесь они только переставляются по livePose и модели.
//
// witherPaint приходит из экземпляра: начинка рта красится с учётом
// истощения, а запечённая ступень истощения живёт в монтаже.
function updateWormFace(state, opts, mm, geomDt, geomDtSec, witherPaint) {
    // Рот — пересчитываем форму каждый кадр из bend/gap.
    const mouthBuiltRef = state.built.head.mouth;
    if (mouthBuiltRef) {
        const liveOpenness = state.livePose.mouthOpenness;
        const openness = liveOpenness != null ? liveOpenness : Math.max(0, mm.head.mouth.openness || 0);
        const liveCurve = state.livePose.mouthCurve;
        const curve = liveCurve != null ? liveCurve : mm.head.mouth.curve;
        const bend = mouthBendFromCurve(curve);
        const gap = mouthBuiltRef.MAX_GAP * clamp01(openness);
        updateMouthGeometry(mouthBuiltRef, bend, gap,
            state.livePose.mouthFill,
            witherPaint(state.livePose.mouthFillColor));
    }

    // ---------- МИМИКА ГОЛОВЫ ----------
    // Персонаж не должен быть застывшей маской: даже когда его
    // никто не трогает, у него подрагивают уши и он принюхивается.
    // Всё это — обычные "живые" параметры: мини-игра может задать
    // их напрямую через setLivePose, и тогда собственная жизнь
    // персонажа по этому каналу уступает управлению.
    const headRef = state.built.head;
    if (headRef && headRef.tiltGroup) {
        const face = (mm.anatomy && mm.anatomy.face) || {};
        const idle = face.idle || {};
        state.faceClock += geomDt;

        // Подёргивание уха: короткий импульс раз в несколько секунд,
        // поочерёдно у разных ушей.
        const earIdleAmt = idle.earTwitch != null ? idle.earTwitch : 1;
        const earCycle = 5200;
        const earPos = state.faceClock % earCycle;
        const earImpulse = earPos < 260 ? Math.sin((earPos / 260) * Math.PI) : 0;
        const twitchSide = Math.floor(state.faceClock / earCycle) % 2 === 0 ? 'left' : 'right';

        // Принюхивание: серия из трёх быстрых движений пятачка.
        const sniffIdleAmt = idle.sniff != null ? idle.sniff : 1;
        const sniffCycle = 7400;
        const sniffPos = state.faceClock % sniffCycle;
        const sniffImpulse = sniffPos < 560 ? Math.abs(Math.sin((sniffPos / 560) * Math.PI * 3)) : 0;

        // ---------- ПОВОРОТ ГОЛОВЫ ----------
        // Цель берётся из живого канала, иначе из модели.
        // Подъезд к ней — framerate-независимый, по той же
        // формуле 1 - base^dt, что и остальное сглаживание в
        // файле. База МАЛЕНЬКАЯ (быстрая сходимость): поворот
        // должен читаться щелчком, а не медленным морфом, но
        // при этом не щёлкать буквально — иначе головой нельзя
        // будет плавно вести за целью.
        // ---------- КУДА СМОТРИТ ГОЛОВА ----------
        // Приоритет: явный живой канал → явная поза → автоматика
        // по направлению ползания → значение из модели.
        //
        // Автоматика: голова смотрит ТУДА, КУДА ползёт, то есть в
        // сторону, противоположную хвосту. Отсюда -cos(угла
        // хвоста): при хвосте слева (180°) выходит +1, то есть
        // взгляд вправо; при хвосте справа (0°) — -1, взгляд
        // влево.
        //
        // Разворот через анфас получается САМ и не требует
        // отдельного кода: пока червь поворачивает, угол хвоста
        // проходит через «строго вглубь комнаты» (90°/270°), а
        // там косинус равен нулю — голова в этот момент смотрит
        // ровно в камеру. Ровно то поведение, которое нужно:
        // сначала повернулась вперёд, потом в новую сторону.
        let yawTarget;
        if (state.livePose.headYaw != null) {
            yawTarget = wormClampYaw(state.livePose.headYaw);
        } else if (!state.headYawAuto && state.headYawTarget != null) {
            yawTarget = state.headYawTarget;
        } else if (state.headYawAuto && opts.wander) {
            yawTarget = WORM_HEAD_YAW_FOLLOW * -Math.cos(state.tailAngle * Math.PI / 180);
        } else {
            yawTarget = wormClampYaw(mm.head.yaw != null ? mm.head.yaw : 0);
        }
        if (state.headYawCurrent == null) state.headYawCurrent = yawTarget;
        const yawK = 1 - Math.pow(WORM_HEAD_YAW_BASE, geomDtSec);
        state.headYawCurrent += (yawTarget - state.headYawCurrent) * yawK;
        // Ниже порога дотягиваем до цели: экспонента математически
        // никогда не долетает, а «почти повёрнутая» голова —
        // это просто чуть кривое лицо.
        if (Math.abs(yawTarget - state.headYawCurrent) < WORM_HEAD_YAW_EPS) {
            state.headYawCurrent = yawTarget;
        }
        applyHeadYaw(headRef, +state.headYawCurrent.toFixed(4));

        // Наклон головы — вокруг основания шеи, а не центра черепа:
        // иначе голова "съезжает" с тела.
        const tilt = state.livePose.headTilt != null ? state.livePose.headTilt : 0;
        setAttr(headRef.tiltGroup, 'transform',
            tilt ? `rotate(${tilt.toFixed(2)} 0 ${(headRef.ry * 1.15).toFixed(1)})` : '');

        // Уши.
        ['left', 'right'].forEach(side => {
            const ref = headRef.ears[side];
            if (!ref) return;
            const live = side === 'left' ? state.livePose.earTiltLeft : state.livePose.earTiltRight;
            const common = state.livePose.earTilt;
            let extra = 0;
            if (live != null) extra = live;
            else if (common != null) extra = common;
            else if (side === twitchSide) extra = -14 * earImpulse * earIdleAmt;
            const mirror = side === 'left' ? -1 : 1;
            setAttr(ref.group, 'transform',
                `translate(${ref.anchorX.toFixed(2)},${ref.anchorY.toFixed(2)}) ` +
                `rotate(${(ref.baseAngle + extra * mirror).toFixed(2)}) ` +
                `scale(${ref.scaleX.toFixed(3)},${ref.scaleY.toFixed(3)})`);
        });

        // Пятачок: при принюхивании чуть поднимается и сплющивается.
        const twitch = state.livePose.snoutTwitch != null
            ? clamp01(state.livePose.snoutTwitch)
            : sniffImpulse * sniffIdleAmt;
        if (headRef.snoutGroup) {
            const sn = mm.head.snout;
            const sx = sn.scale * sn.stretchX * (1 + 0.05 * twitch);
            const sy = sn.scale * sn.stretchY * (1 - 0.07 * twitch);
            // Ракурс входит сюда множителем: tick переписывает
            // трансформ целиком, и без него поворот пятачка
            // терялся бы через кадр после сборки.
            setAttr(headRef.snoutGroup, 'transform',
                `translate(${(headRef.snoutX || 0).toFixed(2)},${(headRef.snoutY - 1.6 * twitch).toFixed(2)}) ` +
                `scale(${(sx * (headRef.snoutSquash != null ? headRef.snoutSquash : 1)).toFixed(3)},${sy.toFixed(3)})`);
        }

        // Челюсть следует за ртом: рот открывается — низ морды
        // уходит вниз, а не остаётся неподвижной кожей с дыркой.
        if (headRef.jawGroup) {
            const openness = state.livePose.mouthOpenness != null
                ? clamp01(state.livePose.mouthOpenness)
                : clamp01(mm.head.mouth.openness || 0);
            const drop = state.livePose.jawDrop != null ? clamp01(state.livePose.jawDrop) : openness;
            setAttr(headRef.jawShift, 'transform', `translate(0,${(drop * 5).toFixed(2)})`);
        }

        // Щёки: надуваются (полный рот) — брыли расходятся в стороны.
        if (headRef.muzzleGroup) {
            headRef.muzzlePuff = state.livePose.cheekPuff != null
                ? clamp01(state.livePose.cheekPuff) : 0;
            applyMuzzleTransform(headRef);
        }

        // Взгляд и брови.
        const gx = state.livePose.gazeX, gy = state.livePose.gazeY;
        const browRaise = state.livePose.browRaise;
        ['left', 'right'].forEach(side => {
            const eyeRef = headRef.eyes[side];
            if (!eyeRef) return;
            if (eyeRef.gazeGroup) {
                const dx = (gx != null ? gx : 0) * eyeRef.rx * 0.34;
                const dy = (gy != null ? gy : 0) * eyeRef.ry * 0.34;
                setAttr(eyeRef.gazeGroup, 'transform',
                    (dx || dy) ? `translate(${dx.toFixed(2)},${dy.toFixed(2)})` : '');
            }
            // Трансформ брови собирает ОДНА функция в worm-head.js
            // (applyBrowTransform): здесь только живой канал.
            // Пока он собирался и тут тоже, эта версия каждый кадр
            // затирала и высоту брови из модели, и подбор по
            // контуру — бровь возвращалась за край головы.
            if (browRaise != null && eyeRef.browGroup) {
                eyeRef.browRaise = browRaise;
                applyBrowTransform(eyeRef);
            }
        });
    }

    // Веки обновляются ВСЕГДА, а opts.blink лишь добавляет импульс
    // моргания: иначе на экранах с выключенным морганием
    // livePose.eyelidLevel (прищур, дрёма, зажмуривание) просто
    // не доезжал до персонажа.
    {
        let blinkLevel = 0;
        if (opts.blink) {
            state.blinkClock += geomDt;
            const cyclePos = state.blinkClock % WORM_BLINK_CYCLE;
            if (cyclePos >= WORM_BLINK_START && cyclePos < WORM_BLINK_START + WORM_BLINK_DURATION) {
                const p = (cyclePos - WORM_BLINK_START) / WORM_BLINK_DURATION;
                blinkLevel = Math.sin(p * Math.PI);
            }
        }
        ['left', 'right'].forEach(side => {
            const eyeModel = mm.eyes[side];
            const eyeRef = state.built.head.eyes[side];
            const restLevel = state.livePose.eyelidLevel != null ? state.livePose.eyelidLevel : eyeModel.eyelid.level;
            const level = Math.max(restLevel, blinkLevel);
            const travel = 2 * eyeRef.ry + 5;
            const ty = -travel * (1 - level);
            setAttr(eyeRef.lidTrack, 'transform', `translate(0,${ty.toFixed(2)})`);

            // Нижнее веко. При моргании убирается: щека не может
            // держать глаз поджатым, пока он закрывается сверху,
            // и наложение двух шторок дало бы схлопывание в щель.
            if (eyeRef.smileTrack) {
                const smile = clamp01(state.livePose.eyeSmile || 0) * (1 - blinkLevel);
                setAttr(eyeRef.smileTrack, 'transform',
                    `translate(0,${(eyeRef.smileTravel * (1 - smile)).toFixed(2)})`);
            }
        });
    }
}
