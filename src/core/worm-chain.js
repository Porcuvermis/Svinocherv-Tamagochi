// ================= ЧЕРВЬ: РАСКЛАДКА ЦЕПОЧКИ НА КАДРЕ =================
// Часть покадрового цикла (tick в worm-renderer.js), вынесенная целиком: где
// стоят голова, сегменты и хвост, как дышит тело и раздувается живот. Отдаёт
// круги единого силуэта — по ним дальше строятся силуэт, кишка и посадка
// наряда, поэтому считать их где-то ещё нельзя: разойдутся с телом.
//
// Состояние экземпляра (state) приходит снаружи и правится здесь же — это не
// отдельная механика, а кусок tick, живущий в своём файле, чтобы его можно
// было найти и прочитать, не открывая весь рендерер.
//
// trail(anchorWorld) — точка выхода слизистого следа; зовётся ровно там, где
// она посчитана (при прогулке на полу), а что с ней делать, решает tick.
function layoutWormChain(state, opts, mm, geomDtSec, trail) {
    const bellySeg = state.built.segments.find(s => s.name === 'belly');
    const bellyFactor = state.livePose.bellyScale != null ? state.livePose.bellyScale : 1;
    // Раздувшийся живот растёт "вперёд" (в сторону хвоста) от
    // неподвижной точки стыка с головным соседом, а сегменты
    // дальше по цепочке отодвигаются на ту же величину.
    const bellyGrowX = bellySeg ? Math.max(0, bellySeg.baseRx * (bellyFactor - 1)) : 0;
    const bellyPushGap = bellyGrowX * 2;
    const bellyIdx = bellySeg ? bellySeg.idx : -1;

    let lastGrowLocal = null;
    const lastGrowingName = mm.growingSegments.length ? `growing-${mm.growingSegments.length}` : null;
    let breathWave = 0;
    // Размах вдоха. Собственное дыхание персонажа еле заметно
    // (3.5% радиуса) — это фон жизни, а не действие. Мини-игра
    // может попросить размах побольше через livePose.breathAmp.
    const breathAmp = state.livePose.breathAmp != null
        ? state.livePose.breathAmp : WORM_BREATH_AMP;

    // Круги единого силуэта, по порядку цепочки: [0] — якорь
    // внутри головы (чтобы шея входила в череп без стыка),
    // дальше сегменты по своим idx, последним — основание
    // хвоста. Заполняется теми же вычислениями, что уже двигают
    // сами части: силуэт не может разойтись с телом, потому что
    // считается из одних и тех же чисел.
    const hullCircles = new Array(state.built.tail.idx + 1).fill(null);
    hullCircles[0] = {
        x: 0, y: 0,
        r: state.built.head.ry * 0.42,
        color: state.built.head.fillColor
    };

    if (opts.pose === 'lying') {
        // ---------- СТАРАЯ РАСКЛАДКА: ОДНА ПРЯМАЯ ЛИНИЯ ----------
        // Логика не тронута — нужна Чревоугодию.
        const wave = opts.idleWave ? Math.sin(state.animTime) * 8 : 0;
        setAttr(state.built.head.group, 'transform', `translate(0,${wave.toFixed(2)})`);

        state.built.segments.forEach(seg => {
            const extraGap = seg.idx > bellyIdx ? bellyPushGap : 0;
            const sx = -(seg.idx * WORM_SEGMENT_SPACING + WORM_CHAIN_HEAD_GAP + extraGap);
            const sy = opts.idleWave ? (Math.sin(state.animTime + seg.idx * 0.6) * 12 + seg.idx * 4) : 0;
            setAttr(seg.group, 'transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
            hullCircles[seg.idx] = { x: sx, y: sy, r: seg.baseRx, color: seg.fillColor,
                                     br: seg.baseRx, gs: 1, wk: 1 };
        });

        const tsx = -(state.built.tail.idx * WORM_SEGMENT_SPACING + WORM_CHAIN_HEAD_GAP + bellyPushGap);
        const tsy = opts.idleWave ? (Math.sin(state.animTime + state.built.tail.idx * 0.6) * 12 + state.built.tail.idx * 4) : 0;
        setAttr(state.built.tail.group, 'transform', `translate(${tsx.toFixed(1)},${tsy.toFixed(1)})`);
        hullCircles[state.built.tail.idx] = {
            x: tsx, y: tsy, r: state.built.tail.baseRadius, color: mm.tail.fill,
            br: state.built.tail.baseRadius, gs: 1, wk: 1
        };
        if (state.built.tail.bendGroup) {
            state.tailWearRot = state.livePose.tailBendAngle;
            setAttr(state.built.tail.bendGroup, 'transform', `rotate(${state.livePose.tailBendAngle.toFixed(1)})`);
        }
    } else {
        // ---------- "СТОЯЩАЯ" ПОЗА ----------
        setAttr(state.built.head.group, 'transform', 'translate(0,0)');

        const floorY = bellyIdx * WORM_VERTICAL_SPACING + WORM_CHAIN_HEAD_GAP;
        // Запоминаем для rootTransform: масштаб по глубине берёт
        // эту точку за неподвижную, иначе персонаж всплывает.
        state.floorLocalY = floorY;
        // Сторона завала колонны = сторона, куда лежит хвост.
        // cos угла хвоста даёт и знак, и естественное затухание
        // завала, когда червь ползёт строго вглубь комнаты: там
        // тело уходит от камеры, а не вбок, и заваливаться некуда.
        const leanDir = Math.cos(state.tailAngle * Math.PI / 180);

        // Однополярная волна дыхания: стартует с 0 (стандартный
        // радиус), поднимается до 1 и возвращается к 0.
        //
        // Живой канал (breathAmp/breathSpeed) ПЕРЕБИВАЕТ собственное
        // дыхание персонажа: мини-игре бывает нужно не ровное
        // сопение, а тяжёлые вдохи после работы. Часы у него свои
        // и стартуют с нуля, поэтому дыхание всегда начинается с
        // выдоха, а не с середины чужой волны.
        if (state.livePose.breathAmp != null) {
            state.breathClock = (state.breathClock || 0)
                + geomDtSec * (state.livePose.breathSpeed || 1);
            breathWave = (1 - Math.cos(state.breathClock * Math.PI * 2)) / 2;
        } else {
            state.breathClock = 0;
            breathWave = opts.idleWave
                ? (1 - Math.cos(state.animTime * WORM_BREATH_SPEED)) / 2 : 0;
        }

        state.built.segments.forEach(seg => {
            if (seg.idx > bellyIdx) return;
            const vy = seg.idx * WORM_VERTICAL_SPACING + WORM_CHAIN_HEAD_GAP;
            const vx = spineLeanMag(bellyIdx > 0 ? seg.idx / bellyIdx : 0) * leanDir;
            setAttr(seg.group, 'transform', `translate(${vx.toFixed(1)},${vy.toFixed(1)})`);
            hullCircles[seg.idx] = { x: vx, y: vy, r: seg.baseRx, color: seg.fillColor,
                                     br: seg.baseRx, gs: 1, wk: 1 };
            const breathRatio = WORM_BREATH_RATIO[seg.name];
            if (breathRatio != null) {
                const breathFactor = 1 + breathWave * breathAmp * breathRatio;
                hullCircles[seg.idx].r = seg.baseRx * breathFactor;
                // Дыхание меняет РАЗМЕР части, а группа сегмента
                // при этом не трогается: раздувается эллипс. Надетое
                // живёт вне группы части и само бы не узнало об этом
                // — поэтому живой масштаб записывается сюда, откуда
                // его берёт слой одежды.
                hullCircles[seg.idx].wk = breathFactor;
                setAttr(seg.ellipse, 'rx', (seg.baseRx * breathFactor).toFixed(2));
                setAttr(seg.ellipse, 'ry', (seg.baseRy * breathFactor).toFixed(2));
                // Анатомические слои дышат ВМЕСТЕ с сегментом:
                // одна группа = один setAttribute, вся стопка
                // слоёв внутри масштабируется автоматически по
                // SVG-иерархии (тот же принцип, что и у шрамов).
                if (seg.anat) {
                    setAttr(seg.anat.group, 'transform', `scale(${breathFactor.toFixed(4)})`);
                }
            }
        });

        // Напольная часть (growing-сегменты + хвост) — простая
        // кинематическая цепь: каждое звено строится СТРОГО от
        // позиции предыдущего, поэтому разъединиться геометрически
        // невозможно ни при какой амплитуде покачивания.
        const moveStretch = WORM_MOVE_SPACING_EXTRA * state.speedIntensity;
        const wiggleSpeed = lerp(WORM_CHAIN_WIGGLE_IDLE_SPEED, WORM_CHAIN_WIGGLE_MOVE_SPEED, state.moveIntensity);
        const wiggleAmpDeg = lerp(WORM_CHAIN_WIGGLE_IDLE_DEG, WORM_CHAIN_WIGGLE_MOVE_DEG, state.moveIntensity);
        const tailExtraWagDeg = lerp(WORM_TAIL_EXTRA_WAG_IDLE_DEG, WORM_TAIL_EXTRA_WAG_MOVE_DEG, state.moveIntensity);
        const DEG2RAD = Math.PI / 180;

        state.chainWigglePhase += geomDtSec * WORM_ANIM_TIME_PER_SEC * wiggleSpeed;
        state.tailWagPhase += geomDtSec * WORM_ANIM_TIME_PER_SEC * wiggleSpeed * 1.3;

        const floorSegments = state.built.segments
            .filter(seg => seg.idx > bellyIdx)
            .sort((a, b) => a.idx - b.idx);

        // ---------- ХВОСТ В ГЛУБИНУ ----------
        // Три вещи разом: звенья укорочены (перспектива),
        // сегменты мельчают к кончику (он дальше от камеры), а
        // виляние — широкое, потому что только оно и выносит
        // хвост из-за силуэта. Всё вместе включается ОДНИМ
        // числом opts.tailDepth и по умолчанию выключено: у
        // остальных шести грехов персонаж стоит боком.
        const depth = opts.tailDepth || 0;
        const depthSteps = floorSegments.length + 1;
        const depthScaleAt = (step) => depth
            ? 1 - WORM_TAIL_DEPTH_SHRINK * (step / depthSteps) : 1;
        const chainWagDeg = depth ? WORM_TAIL_DEPTH_WAG_DEG : wiggleAmpDeg;

        // Стартуем от РЕАЛЬНОГО положения живота: он уехал вбок
        // вместе с колонной, и цепь обязана продолжаться от него.
        // Сдвиг живота на раздутие тоже идёт в сторону хвоста.
        let chainX = spineLeanMag(1) * leanDir + bellyPushGap * leanDir;
        let chainY = floorY;
        let prevRadius = bellySeg ? bellySeg.baseRx : 15;
        floorSegments.forEach(seg => {
            const stepsFromBelly = seg.idx - bellyIdx;
            const wiggleDeg = opts.idleWave ? Math.sin(state.chainWigglePhase + stepsFromBelly * WORM_CHAIN_PHASE_STEP) * chainWagDeg : 0;
            const angleRad = (state.tailAngle + wiggleDeg) * DEG2RAD;
            const k = depthScaleAt(stepsFromBelly);
            const radius = seg.baseRx * k;
            const linkLength = (floorLinkBaseLength(prevRadius, radius) + moveStretch)
                             * (depth || 1);
            chainX += linkLength * Math.cos(angleRad);
            chainY += linkLength * Math.sin(angleRad);
            setAttr(seg.group, 'transform', depth
                ? `translate(${chainX.toFixed(1)},${chainY.toFixed(1)}) scale(${k.toFixed(3)})`
                : `translate(${chainX.toFixed(1)},${chainY.toFixed(1)})`);
            // gs — масштаб, который уже несёт САМА группа звена
            // (глубина). Слой одежды списывает трансформ группы
            // целиком, поэтому добавлять его второй раз не надо;
            // знать о нём нужно только для перевода корневых
            // расстояний в местные.
            hullCircles[seg.idx] = { x: chainX, y: chainY, r: radius, color: seg.fillColor,
                                     br: seg.baseRx, gs: depth ? k : 1, wk: 1 };
            prevRadius = radius;
            if (seg.name === lastGrowingName) {
                lastGrowLocal = { x: chainX, y: chainY };
            }
        });

        // Хвост — последнее звено той же цепи.
        const tailStepsFromBelly = state.built.tail.idx - bellyIdx;
        const tailWiggleDeg = opts.idleWave ? Math.sin(state.chainWigglePhase + tailStepsFromBelly * WORM_CHAIN_PHASE_STEP) * chainWagDeg : 0;
        const tailAngleDeg = state.tailAngle + tailWiggleDeg;
        const tailAngleRad = tailAngleDeg * DEG2RAD;
        const tailK = depthScaleAt(depthSteps);
        const tailRadius = state.built.tail.baseRadius * tailK;
        const tailLinkLength = (floorLinkBaseLength(prevRadius, tailRadius) + moveStretch)
                             * (depth || 1);
        chainX += tailLinkLength * Math.cos(tailAngleRad);
        chainY += tailLinkLength * Math.sin(tailAngleRad);
        setAttr(state.built.tail.group, 'transform', depth
            ? `translate(${chainX.toFixed(1)},${chainY.toFixed(1)}) scale(${tailK.toFixed(3)})`
            : `translate(${chainX.toFixed(1)},${chainY.toFixed(1)})`);
        hullCircles[state.built.tail.idx] = {
            x: chainX, y: chainY, r: tailRadius, color: mm.tail.fill,
            br: state.built.tail.baseRadius, gs: depth ? tailK : 1, wk: 1
        };
        if (state.built.tail.bendGroup) {
            const extraWag = opts.idleWave ? Math.sin(state.tailWagPhase + 1.7) * tailExtraWagDeg : 0;
            const totalRotate = (tailAngleDeg - 180) + extraWag + state.livePose.tailBendAngle;
            state.tailWearRot = totalRotate;
            setAttr(state.built.tail.bendGroup, 'transform', `rotate(${totalRotate.toFixed(1)})`);
        }

        if (opts.wander) {
            const flip = opts.flip;
            // Точка выхода следа задана в ЛОКАЛЬНЫХ координатах
            // персонажа, а он теперь масштабируется по глубине —
            // значит и смещение надо считать по тем же правилам,
            // что и корневой трансформ, иначе след будет
            // отставать от хвоста тем сильнее, чем дальше червь.
            const sc = state.depthScale;
            const shiftY = state.floorLocalY * (1 - sc);
            const anchorWorld = lastGrowLocal ? {
                x: state.wormX + (flip ? -lastGrowLocal.x : lastGrowLocal.x) * sc,
                y: state.wormY + shiftY + lastGrowLocal.y * sc
            } : null;
            trail(anchorWorld);
        }
    }

    if (bellySeg) {
        // Дыхание живота умножается на bellyFactor (раздутие из
        // мини-игр через livePose.bellyScale), а не заменяет его.
        const bellyBreathFactor = 1 + breathWave * breathAmp * (WORM_BREATH_RATIO.belly || 0);
        const effectiveBellyFactor = bellyFactor * bellyBreathFactor;
        const newRx = bellySeg.baseRx * effectiveBellyFactor;
        const newRy = bellySeg.baseRy * effectiveBellyFactor;
        let cy = 0;
        if (opts.bellyGrowthAnchor === 'bottom') cy = -(newRy - bellySeg.baseRy);
        else if (opts.bellyGrowthAnchor === 'top') cy = (newRy - bellySeg.baseRy);
        // По X живот всегда "растёт вперёд": локальный +X — это
        // сторона стыка с головным соседом, она остаётся на месте.
        const cx = -bellyGrowX;
        setAttr(bellySeg.ellipse, 'rx', newRx.toFixed(2));
        setAttr(bellySeg.ellipse, 'ry', newRy.toFixed(2));
        setAttr(bellySeg.ellipse, 'cx', cx.toFixed(2));
        setAttr(bellySeg.ellipse, 'cy', cy.toFixed(2));
        if (bellySeg.shine) {
            setAttr(bellySeg.shine, 'cx', (cx - newRx * 0.25).toFixed(2));
            setAttr(bellySeg.shine, 'cy', (cy - newRy * 0.4).toFixed(2));
            setAttr(bellySeg.shine, 'rx', (newRx * 0.38).toFixed(2));
            setAttr(bellySeg.shine, 'ry', (newRy * 0.22).toFixed(2));
        }
        // Анатомия живота повторяет ровно ту же трансформацию,
        // что и его заливка: смещение центра + масштаб. Один
        // setAttribute на весь слоёный "пирог" — внутренности,
        // мышцы, кольца и блики растягиваются вместе с животом
        // (и, соответственно, честно раздуваются в Чревоугодии).
        if (bellySeg.anat) {
            setAttr(bellySeg.anat.group, 'transform',
                `translate(${cx.toFixed(2)},${cy.toFixed(2)}) scale(${effectiveBellyFactor.toFixed(4)})`);
        }
        // Живот в силуэте — с уже раздутыми размерами и смещённым
        // центром: единый контур обязан повторять раздутие, иначе
        // при кормлении тело вылезет за собственную обводку.
        const bellyCircle = hullCircles[bellySeg.idx];
        if (bellyCircle) {
            bellyCircle.x += cx;
            bellyCircle.y += cy;
            bellyCircle.r = Math.max(newRx, newRy);
            // ---------- ОДЕЖДА РАСТЁТ ВМЕСТЕ С ЖИВОТОМ ----------
            // Раздутие живота — это новые rx/ry/cx/cy у ЭЛЛИПСА;
            // группа сегмента не меняется вовсе. Наряд лежит вне
            // группы части (он выше колец и кишки), поэтому сам
            // об этом не узнаёт: накормленный червь вылезал из
            // фрака голым животом. Живой масштаб и смещение
            // центра пишутся сюда — слой одежды надевает их
            // поверх трансформа части.
            bellyCircle.wk = effectiveBellyFactor;
            bellyCircle.ox = cx;
            bellyCircle.oy = cy;
            // Полуоси — для выреза в одежде соседей: круг из
            // max(rx,ry) срезал бы больше, чем закрывает живот.
            bellyCircle.erx = newRx;
            bellyCircle.ery = newRy;
            bellyCircle.front = true;
        }
    }
    return { hullCircles, bellySeg };
}
