// ================= МОНТАЖ ЧЕРВЯ НА ЭКРАН И ПОКАДРОВЫЙ ЦИКЛ =================
// Последний файл стопки рендерера (карта — в worm-basis.js).
// Всё, что живёт ВО ВРЕМЕНИ: состояние экземпляра, ходьба, камера, след
// слизи, tick() и публичный handle, которым пользуются мини-игры.
//
// Собирает червя не он — worm-build.js. Здесь только жизнь собранного.
// Самые длинные куски кадра вынесены из tick в свои файлы: раскладка цепочки
// (worm-chain.js), наряд (worm-wear-live.js), мимика (worm-face-live.js).

// ---------- ПУБЛИЧНЫЙ API РЕНДЕРЕРА ----------
// Сколько кадров деформации персонажа отрисовано с загрузки страницы —
// по ВСЕМ экземплярам сразу. Нужно техосмотру (tools/audit-frames.js): по
// нему видно, на какой ступени лестницы идёт игра на этом устройстве.
let geomFrameTotal = 0;

// Звенья за животом и хвост — со сборки, до первого кадра: спрятать их
// после монтажа значило бы показать на кадр-другой (opts.endAtBelly).
function hideAfterBelly(built) {
    const belly = built.segments.find(sg => sg.name === 'belly');
    if (!belly) return;
    for (const sg of built.segments) if (sg.idx > belly.idx && sg.group) sg.group.style.display = 'none';
    if (built.tail && built.tail.group) built.tail.group.style.display = 'none';
    // Невидимая рамка по всей цепочке — держит габарит (см. tick). Ничего
    // не рисует и пальцев не ловит.
    const ext = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    ext.setAttribute('class', 'worm-extent');
    ext.setAttribute('fill', 'none');
    ext.setAttribute('pointer-events', 'none');
    built.root.insertBefore(ext, built.root.firstChild);
    built.extent = ext;
}

const WormRenderer = {
    // Общий счётчик кадров деформации (см. geomFrameTotal).
    geomFrames() { return geomFrameTotal; },
    mount(container, model, opts) {
        opts = Object.assign({
            context: 'main',
            // Рисовать комнату с полом в перспективе и масштабировать
            // персонажа по глубине. Только для главного экрана: мини-игры
            // ставят свои сцены сами.
            room: false,
            wander: false,
            blink: true,
            anchorX: 0.5,
            anchorY: 0.55,
            // Зеркалит всю модельку по горизонтали — цепочка тела тогда
            // растёт вправо от головы, а не влево.
            flip: false,
            // Развернуть ТОЛЬКО голову (морда смотрит в другую сторону), не
            // трогая тело. Не то же, что flip: тот зеркалит фигуру целиком
            // вместе с посадкой тела и хвостом.
            headFlip: false,
            // Частота пересчёта персонажа (Гц). По умолчанию ТРИДЦАТЬ, а не
            // «сколько получится»: персонаж — самая дорогая вещь на экране
            // (семьсот узлов, и каждый кадр по ним проходит вся анимация), а
            // разницы между шестьюдесятью пересчётами в секунду и тридцатью
            // на нём не видно. Сцена при этом рисуется, сколько может.
            //
            // 0 снимает ограничение. Мини-игра может попросить и меньше: в
            // ванне персонаж вообще стоит смирно, там двадцать.
            frameHz: 30,
            // false — тело неподвижно застыло в базовой позе (нужно для
            // сцен, где персонаж лежит смирно, например кормление).
            idleWave: true,
            // 0 — хвост лежит вбок (обычный, «вид сбоку»). 0..1 — хвост
            // уходит ОТ КАМЕРЫ за спину персонажа, а число задаёт, какая
            // доля длины звена остаётся на экране (перспективное
            // укорочение). Нужно сценам, где на персонажа смотрят в лоб.
            tailDepth: 0,
            // 'center' (по умолчанию) — живот раздувается симметрично.
            // 'bottom' — нижний край живота остаётся на месте, раздувается
            // только вверх. 'top' — наоборот.
            bellyGrowthAnchor: 'center',
            // 'standing' (по умолчанию) / 'lying' (Чревоугодие).
            pose: 'standing',
            // Тело КОНЧАЕТСЯ ЖИВОТОМ: всего, что за ним (растущие звенья и
            // хвост), нет вовсе — ни звеньев, ни общих для тела слоёв
            // (силуэт, перетяжки, кишка, тень). Ванна: червь сидит в ней по
            // живот, а хвост у неё свой, отдельный. Прятать одни группы
            // звеньев мало — силуэт и кольца строятся по всей цепочке и
            // лежали над бортом «колбасой» без звеньев.
            endAtBelly: false
        }, opts || {});
        const instanceId = ++wormInstanceCounter;

        container.innerHTML = '';
        const svg = svgEl('svg', { class: `worm-stage-svg worm-context-${opts.context}` });
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.display = 'block';
        svg.style.overflow = 'visible';
        container.appendChild(svg);

        // Постоянные слои внутри svg, которые НЕ трогает rebuild():
        //   roomLayer   — интерьер (пол, стены), самый низ;
        //   slimeLayer  — след слизи;
        //   objectLayer — то, что лежит на полу (кучки);
        //   charLayer   — сам персонаж, поверх всего.
        //
        // Предметы лежат ВЫШЕ слизи: след — это то, что червь размазал по
        // полу, он физически не может оказаться поверх кучки.
        //
        // И это отдельный слой, а не часть roomLayer: комната перестраивается
        // при смене размера окна, а buildRoom вычищает свой слой целиком —
        // предметы уезжали вместе с ней и пропадали с экрана, оставаясь в
        // состоянии. Именно так кучка и превращалась в невидимую.
        const roomLayer = svgEl('g', { class: 'worm-room-layer' });
        // След слизи тянется через полкомнаты и тапы ловить не должен:
        // он не тело, а то, что тело за собой оставило.
        const slimeLayer = svgEl('g', { class: 'worm-slime-layer', 'pointer-events': 'none' });
        // ---------- ВСЯ СЛИЗЬ — ОДНА ПЛЁНКА, А НЕ СТОПКА ----------
        // Раньше наложение и изоляция висели на КАЖДОМ отрезке следа. Из
        // этого следовали обе беды сразу.
        //
        // Видимая: два отрезка, легшие крест-накрест, накладывались друг на
        // друга как два полупрозрачных слоя — перекрестье выходило темнее и
        // грязнее, хотя слизь, налитая в слизь, — это по-прежнему одна лужа,
        // просто побольше.
        //
        // Невидимая, но куда более дорогая: наложение (multiply/screen) —
        // это чтение того, что уже нарисовано под слоем, и рисуется такая
        // группа в отдельный буфер. Пока групп было по две на отрезок, за
        // каждый кусок следа платили отдельно, и на телефоне погоня по
        // комнате роняла кадры (та же болезнь, что у фильтра истощения,
        // правки 153 и 154).
        //
        // Теперь групп с наложением ДВЕ НА ВЕСЬ ЭКРАН, сколько бы следов ни
        // лежало. Куски внутри непрозрачны, поэтому перекрытия сливаются в
        // одну плёнку, а не копятся слоями, и на пол она ложится ровно один
        // раз — как и положено луже.
        const slimeWetAll = svgEl('g', {
            class: 'worm-slime-wet-all', opacity: WORM_SLIME_WET_ALPHA,
            style: 'mix-blend-mode:multiply;isolation:isolate'
        });
        const slimeGlowAll = svgEl('g', {
            class: 'worm-slime-glow-all',
            style: 'mix-blend-mode:screen;isolation:isolate'
        });
        slimeLayer.appendChild(slimeWetAll);
        slimeLayer.appendChild(slimeGlowAll);
        const objectLayer = svgEl('g', { class: 'worm-room-objects' });
        const charLayer = svgEl('g', { class: 'worm-char-layer' });
        // Все слои мира лежат в общей обёртке, и двигает её КАМЕРА. Комната
        // шире экрана (см. ROOM.widthRatio), экран — окно в неё.
        //
        // Одна обёртка, а не сдвиг координат в каждом слое: комната, слизь,
        // предметы и персонаж обязаны ехать СТРОГО вместе, иначе кучка
        // «отстанет» от пола на полкадра при быстром свайпе. Заодно это
        // единственное место, где вообще существует камера: вся остальная
        // математика живёт в координатах комнаты и про неё не знает.
        // ---------- ИСТОЩЕНИЕ ----------
        // Фильтра здесь больше нет: обесцвечивание запекается в цвета узлов
        // (witherColor + bakeWither ниже). Почему так — в комментарии у
        // witherColor: фильтр на слое персонажа стоил двух третей кадров.

        const worldLayer = svgEl('g', { class: 'worm-world-layer' });
        if (opts.room) worldLayer.appendChild(roomLayer);
        worldLayer.appendChild(slimeLayer);
        worldLayer.appendChild(objectLayer);
        worldLayer.appendChild(charLayer);
        svg.appendChild(worldLayer);

        // Поля экземпляра и их смысл — worm-state.js.
        const state = createWormState(model, opts);

        function mergedModel() {
            return window.WormModelAPI.mergeWormOverride(state.baseModel, state.override);
        }

        function syncViewportSize() {
            // Размер БЕЗ учёта трансформаций (clientWidth, а не
            // getBoundingClientRect): вся игра живёт в холсте постоянного
            // размера, который масштабируется одной CSS-трансформацией
            // (src/core/stage.js). Меряя экранные пиксели, рендерер получал
            // бы разные числа на каждом экране и пересобирал бы комнату при
            // любом изменении масштаба — ради картинки, которая всё равно
            // отличается только увеличением.
            const w = Math.max(1, container.clientWidth || container.getBoundingClientRect().width);
            const h = Math.max(1, container.clientHeight || container.getBoundingClientRect().height);
            setAttr(svg, 'viewBox', `0 0 ${w} ${h}`);
            if (opts.room) {
                state.room = roomGeometry(w, h);
                buildRoom(roomLayer, state.room, state.location);
                state.wanderD = null;   // комната изменилась — границы пересчитать
                // Стартовая точка — на полу, а не в произвольной доле высоты:
                // иначе персонаж при запуске стоит в воздухе или в стене.
                if (!state.wormX) state.wormX = state.room.cx;
                if (!state.wormY) state.wormY = roomYAt(state.room, 1.1) - state.floorLocalY;
            }
            state.wormX = state.wormX || w * opts.anchorX;
            state.wormY = state.wormY || h * opts.anchorY;
            state.targetX = state.wormX;
            state.targetY = state.wormY;

            // Камера: держим червя в окне и не даём ей уехать за края комнаты
            // (размер окна изменился — прежний сдвиг мог стать недопустимым).
            if (opts.room && state.room) {
                setCam(state.camX || (state.wormX - state.room.w / 2));
                setAttr(worldLayer, 'transform', `translate(${(-state.camX).toFixed(1)},0)`);
            }
        }

        function rootTransform() {
            const flipPart = opts.flip ? ' scale(-1,1)' : '';
            const sc = state.depthScale;
            if (!opts.room || Math.abs(sc - 1) < 0.001) {
                return `translate(${state.wormX.toFixed(1)},${state.wormY.toFixed(1)})${flipPart}`;
            }
            // Масштабировать надо ВОКРУГ ТОЧКИ КАСАНИЯ ПОЛА, а не вокруг
            // начала координат (оно в голове). При масштабировании от головы
            // тело подтягивается к ней, и уменьшенный персонаж повисает над
            // полом вместо того, чтобы уйти вглубь комнаты.
            const F = state.floorLocalY;
            const shift = F * (1 - sc);
            return `translate(${state.wormX.toFixed(1)},${(state.wormY + shift).toFixed(1)}) ` +
                   `scale(${sc.toFixed(4)})${flipPart}`;
        }

        // worm-walk.js: червь: где стоять, камера, ходьба.
        const { measureBody, bodyFootprint, refreshWanderRange, clampFloorPoint, setCam, followCam, toRoom, onStageDown, onStageMove, onStageUp, walkTo } =
            attachWormWalk({ opts, state, svg, worldLayer });
        // worm-body-live.js: червь: истощение, еда в кишке, рёбра.
        const { WITHER_STEP, collectWitherNodes, witherPaint, bakeWither, paintBolus, FOOD_PULSE_HZ, FOOD_NUDGE, FOOD_SEE_BOOST, FOOD_SEE_FLOOR, updateFood, updateRibCage } =
            attachWormBodyLive({ state });

        function rebuild() {
            const m = mergedModel();
            while (charLayer.firstChild) charLayer.removeChild(charLayer.firstChild);
            state.built = buildWormSVGGroup(m, instanceId, opts.headFlip);
            if (opts.endAtBelly) hideAfterBelly(state.built);
            charLayer.appendChild(state.built.root);
            setAttr(state.built.root, 'transform', rootTransform());
            // Тело пересобрано — прежние габариты недействительны, границы
            // выгула пересчитаются по новым.
            state.bodyBox = null;
            state.wanderD = null;
            state.geomDirty = true;
            // Тело собрано заново — оно РОЗОВОЕ. Список цветных узлов
            // недействителен, истощение запекается сразу: иначе больной червь
            // на кадр-другой становился бы здоровым при любой смене
            // косметики, отметин или модели.
            state.witherNodes = null;
            state.stomachContent = undefined;
            bakeWither(true);
            // Клетка собрана без путей — ракурс рисуется сразу, иначе на
            // первом кадре рёбер просто нет.
            updateRibCage();

            // ---------- РАЗЛОЖИТЬ ТЕЛО СРАЗУ ----------
            // Из сборщика персонаж выходит СЛОЖЕННЫМ: где стоят звенья
            // цепочки, какой у тела силуэт и какого он цвета — всё это
            // доводит tick(). Значит каждая пересборка показывала кадр с
            // телом, схлопнутым к началу координат. Замер: высота сразу
            // после пересборки 112 точек против 213 через три кадра.
            //
            // Поодиночке (сменил косметику, открыл мини-игру) это вспышка на
            // кадр, и её годами не замечали. Но при правке ползунком
            // пересборок два десятка в секунду — и персонаж буквально
            // стробоскопит. Разбор — docs/traps.md, п. 140.
            //
            // Кадровый цикл при этом НЕ раздваивается: текущий запрос
            // снимается, а вынужденный кадр сам ставит следующий.
            if (state.rafId) {
                cancelAnimationFrame(state.rafId);
                state.rafId = 0;
                state.lastFrameTs = 0;      // dt = 0: время не проматывается
                tick(performance.now(), true);
            }
        }

        syncViewportSize();
        rebuild();

        // ---------- СЛИЗИСТЫЙ СЛЕД ----------
        // Механика живёт в src/core/worm-slime.js: она знает только, где
        // червь и идёт ли он. Здесь — подключение.
        const slime = WormSlime.attach({
            svg, wet: slimeWetAll, glow: slimeGlowAll, state, instanceId, opts
        });
        const fadeSlimeTrails = slime.fade;
        const updateSlimeTrail = slime.update;
        // worm-frames.js: червь: видимость и частота кадров.
        const { isStageVisible, frameEvery, FRAME_FLOOR_MS, FRAME_FLOOR_SLOW_MS, GEOM_LADDER, GEOM_SLOW_MS, GEOM_FAST_MS, GEOM_HOLD_UP, GEOM_HOLD_DOWN, GEOM_AWFUL_MS, GEOM_HOLD_AWFUL, trackFrame, wantGeometry } =
            attachWormFrames({ container, opts, state });

        // force — разложить тело ПРЯМО СЕЙЧАС, вне очереди кадров. Нужно
        // после пересборки: из сборщика персонаж выходит сложенным, и
        // ждать следующего кадра значит показать его таким.
        function tick(now, force) {
            trackFrame(now);
            const every = frameEvery();
            if (every > 1 && !force) {
                state.rafCount = (state.rafCount || 0) + 1;
                const floor = state.frameMs > GEOM_SLOW_MS ? FRAME_FLOOR_SLOW_MS : FRAME_FLOOR_MS;
                if (state.rafCount % every
                    && state.lastFrameTs && now - state.lastFrameTs < floor) {
                    state.rafId = requestAnimationFrame(tick);
                    return;
                }
            }
            if (!isStageVisible(now)) {
                // Метку времени двигаем и на пропущенном кадре: иначе после
                // возврата dt окажется равным всей паузе, и персонаж прыгнет.
                state.lastFrameTs = now;
                // Первый кадр после возвращения на экран — обязательно с
                // деформацией: мини-игра сразу после open() меряет тело.
                state.geomDirty = true;
                state.rafId = requestAnimationFrame(tick);
                return;
            }
            if (!state.lastFrameTs) state.lastFrameTs = now;
            const dt = now - state.lastFrameTs;
            state.lastFrameTs = now;
            const dtSec = Math.min(0.25, Math.max(0, dt / 1000)); // клэмп на случай подвисания вкладки
            state.animTime += dtSec * WORM_ANIM_TIME_PER_SEC;

            // Габарит тела уточняется на ходу (см. measureBody). Раз в секунду
            // — этого хватает, чтобы огибающая сошлась за несколько секунд, и
            // getBBox не дёргает раскладку каждый кадр. Если размах вырос,
            // границы пересчитываются, а текущая цель вписывается заново:
            // иначе червь продолжил бы идти в точку, ставшую запретной.
            if (opts.wander && state.room && now - (state.bodyMeasuredAt || 0) > 1000) {
                state.bodyMeasuredAt = now;
                if (measureBody()) {
                    state.wanderD = null;
                    const spot = clampFloorPoint(state.targetX, state.targetY + state.floorLocalY);
                    state.targetX = spot.x;
                    state.targetY = spot.y - state.floorLocalY;
                }
            }

            // ---------- ДВИЖЕНИЕ К ЦЕЛИ + РАСПИСАНИЕ "ПРОГУЛОК" ----------
            let instSpeed = 0; // px/сек, фактическая мгновенная скорость этого кадра
            if (opts.wander) {
                const dx = state.targetX - state.wormX;
                const dy = state.targetY - state.wormY;
                const gap = Math.hypot(dx, dy);

                if (gap > WORM_MOVE_EPS) {
                    const want = Math.atan2(dy, dx);
                    if (state.heading == null) {
                        // Тронулся с места — сразу лицом куда надо. Дуга нужна
                        // при смене цели НА ХОДУ, а разворот стоящего червя
                        // вокруг себя выглядел бы вознёй на месте.
                        state.heading = want;
                    } else {
                        // Кратчайшая дуга: без приведения к ±π доворот с 179°
                        // на -179° поехал бы через весь круг.
                        const delta = ((want - state.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                        const maxTurn = WORM_TURN_RATE * dtSec;
                        state.heading += Math.max(-maxTurn, Math.min(maxTurn, delta));
                    }

                    // Скорость — прежняя экспонента (плавный подъезд к цели),
                    // но приваленная на крутом довороте.
                    const err = ((want - state.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                    const turnDamp = 1 - WORM_TURN_SLOWDOWN * (1 - Math.cos(err)) / 2;
                    const step = gap * (1 - Math.pow(WORM_WANDER_MOVE_BASE, dtSec)) * turnDamp;

                    // Едет туда, куда СМОТРИТ, а не туда, где цель: в этом
                    // расхождении и рождается дуга.
                    const stepX = Math.cos(state.heading) * step;
                    const stepY = Math.sin(state.heading) * step;
                    state.wormX += stepX;
                    state.wormY += stepY;
                    instSpeed = dtSec > 0 ? Math.hypot(stepX, stepY) / dtSec : 0;
                } else {
                    // Дошёл. Курс сбрасывается, чтобы следующая прогулка
                    // началась без разворота на месте.
                    state.heading = null;
                }

                // Вписываем САМУ ПОЗИЦИЮ, а не только цель. Одной цели мало:
                // червь едет туда, куда смотрит, и на довороте его выносит
                // ШИРЕ цели — дуга выпирает наружу. В замерах это выглядело
                // как выезд начала координат за левый край экрана при
                // развороте у стены. Здесь он упирается и скользит вдоль
                // границы, вместо того чтобы её проскочить.
                //
                // Дорого это не стоит: габарит взят из кеша, вся проверка —
                // десяток арифметических действий на кадр.
                if (state.room) {
                    const fix = clampFloorPoint(state.wormX, state.wormY + state.floorLocalY);
                    state.wormX = fix.x;
                    state.wormY = fix.y - state.floorLocalY;
                }
            }
            const dist = opts.wander ? Math.hypot(state.targetX - state.wormX, state.targetY - state.wormY) : 0;
            // Шаг на месте считается движением наравне с настоящим: виляние,
            // растяжка цепи и мах хвостом смотрят именно сюда.
            const isMoving = (opts.wander && dist > WORM_MOVE_EPS) || state.treadmill > 0;
            if (opts.wander) {
                if (isMoving) {
                    state.nextMoveAt = null;
                } else if (state.nextMoveAt == null) {
                    state.nextMoveAt = now + WORM_IDLE_PAUSE_MIN + Math.random() * (WORM_IDLE_PAUSE_MAX - WORM_IDLE_PAUSE_MIN);
                } else if (now >= state.nextMoveAt) {
                    if (state.room) {
                        // Цель выбирается в координатах ПОЛА (глубина + сдвиг
                        // поперёк), а не в долях экрана: только так персонаж
                        // гарантированно остаётся на полу и не заходит в
                        // стену, какой бы ни была форма трапеции.
                        const g = state.room;
                        if (!state.wanderD) refreshWanderRange();
                        const r = state.wanderD || { min: ROOM.wanderNear, max: ROOM.wanderFar };
                        const d = r.min + Math.random() * (r.max - r.min);
                        // Точка выбирается вольно, а вписывает её в пол общий
                        // ограничитель — тот же, через который проходит тап
                        // игрока. Так правило «не залезать на стены» живёт в
                        // одном месте, а не дублируется в каждом источнике
                        // цели.
                        const spot = clampFloorPoint(
                            g.cx + (Math.random() * 2 - 1) * roomHalfAt(g, d),
                            roomYAt(g, d));
                        state.targetX = spot.x;
                        // Минус floorLocalY: на полу должна оказаться точка
                        // касания, а не голова. Без этой поправки червь
                        // «стоял» головой на полу, а всё тело свисало ниже —
                        // и на переднем крае комнаты уезжало за нижнюю кромку
                        // экрана. Именно это и выглядело как «уходит вниз».
                        state.targetY = spot.y - state.floorLocalY;
                    } else {
                        const rw = container.clientWidth || container.getBoundingClientRect().width;
                        const rh = container.clientHeight || container.getBoundingClientRect().height;
                        state.targetX = rw * 0.2 + Math.random() * (rw * 0.6);
                        state.targetY = rh * 0.4 + Math.random() * (rh * 0.3);
                    }
                    state.nextMoveAt = null;
                }
            }
            // Камера подтягивается к червю — после движения, чтобы за кадр не
            // отставать от него на шаг.
            if (opts.room) followCam(dtSec, now);

            // Истощение доводится покадрово: атрибуты браузер не
            // анимирует, а плавность перехода нужна — цвет червя не должен
            // прыгать. Работы это почти не стоит: пока показанное совпало с
            // целью, не делается ничего, а внутри bakeWither перекраска идёт
            // только на смену ступени (1/16), а не на каждый кадр.
            if (Math.abs(state.witherShown - state.witherTarget) > 0.002) {
                state.witherShown += (state.witherTarget - state.witherShown) *
                                     (1 - Math.pow(WORM_WITHER_BASE, dtSec));
                bakeWither();
            }

            // ---------- ДОВОРОТ ХВОСТА ЗА ДВИЖЕНИЕМ ----------
            // Целевой угол — строго противоположный движению: хвост тянется
            // СЗАДИ. Вертикаль сжата перспективой пола.
            if (opts.wander && isMoving) {
                const mdx = state.targetX - state.wormX;
                const mdy = (state.targetY - state.wormY) * WORM_FLOOR_PERSPECTIVE;
                if (Math.hypot(mdx, mdy) > 0.001) {
                    const want = Math.atan2(-mdy, -mdx) * 180 / Math.PI;
                    // Кратчайшая дуга: без неё доворот с 179° на -179° поехал
                    // бы через весь круг, и хвост картинно обнёс бы червя.
                    let delta = ((want - state.tailAngle + 540) % 360) - 180;
                    const maxStep = WORM_TAIL_TURN_MAX_DPS * dtSec;
                    const step = delta * (1 - Math.pow(WORM_TAIL_TURN_BASE, dtSec));
                    state.tailAngle += Math.max(-maxStep, Math.min(maxStep, step));
                    state.tailAngle = ((state.tailAngle % 360) + 360) % 360;
                }
            }

            // ---------- ГЛУБИНА → РАЗМЕР ----------
            // Персонаж на полу: его экранная высота однозначно задаёт, как
            // далеко он от камеры. Ближе — крупнее, вглубь — мельче.
            if (opts.room && state.room) {
                // Глубина берётся по ТОЧКЕ КАСАНИЯ ПОЛА, а не по началу
                // координат персонажа: начало координат — это голова, а стоит
                // он ногами. Разница между ними — почти двести условных
                // единиц, то есть треть комнаты.
                state.depthScale = roomCharScaleAt(
                    roomDepthAt(state.room, state.wormY + state.floorLocalY));
            }

            const intensityFactor = 1 - Math.pow(WORM_MOVE_INTENSITY_SMOOTH_BASE, dtSec);
            state.moveIntensity += ((isMoving ? 1 : 0) - state.moveIntensity) * intensityFactor;

            // Скорость походки — большее из настоящей и заказанной «на
            // месте»: канал ДОБАВЛЯЕТ ход, а не отменяет реальный.
            const speedIntensityTarget = Math.max(state.treadmill,
                Math.min(1, instSpeed / WORM_SPEED_REF_PX_PER_SEC));
            const speedIntensityFactor = 1 - Math.pow(WORM_SPEED_INTENSITY_SMOOTH_BASE, dtSec);
            state.speedIntensity += (speedIntensityTarget - state.speedIntensity) * speedIntensityFactor;

            if (state.built) {
                // Смещение — каждый кадр: оно дёшево (см. wantGeometry).
                setAttr(state.built.root, 'transform', rootTransform());

                // Еда в кишке — тоже каждый кадр, ДО ворот деформации. Она
                // живёт отдельным слоем без маски и стоит двух атрибутов на
                // комок, зато обязана ехать плавно и там, где тело
                // пересчитывается впятеро реже (слабый телефон).
                if (state.digest.boluses.length) updateFood(dtSec);

                // А вся деформация — только на своём кадре.
                if (!wantGeometry(now)) {
                    state.rafId = requestAnimationFrame(tick);
                    return;
                }

                // Собственное время деформации: между её кадрами прошло
                // больше, чем между кадрами движения. Если кормить дыхание,
                // моргание и виляние обычным dt, они замедлятся ровно во
                // столько раз, во сколько разрежена деформация, — червь
                // задышал бы втрое медленнее просто оттого, что телефон
                // слабее. Здесь это время считается честно, от прошлого
                // кадра деформации.
                const geomDt = state.lastGeomTs ? Math.min(500, now - state.lastGeomTs) : dt;
                const geomDtSec = Math.min(0.25, Math.max(0, geomDt / 1000));
                state.lastGeomTs = now;

                // След подсыхает всегда — он живёт отдельно от червя.
                if (state.slimeTrails.length) fadeSlimeTrails(now);

                // Модель читаем один раз за кадр и переиспользуем ниже.
                const mm = mergedModel();

                // Раскладка цепочки, наряд и мимика — в worm-chain.js, worm-wear-live.js
                // и worm-face-live.js. Слизь отдаётся обратным вызовом: точка выхода
                // следа считается посреди раскладки, а now и isMoving знает только tick.
                const { hullCircles, bellySeg } = layoutWormChain(state, opts, mm, geomDtSec,
                    anchor => updateSlimeTrail(now, isMoving, anchor));

                updateWornClothes(state, hullCircles, bellySeg, geomDtSec);

                // Тело кончается животом: круги за ним гасятся ДО всех, кто
                // строит общие для тела слои, — силуэт, перетяжки, маска и
                // ось кишки пустые круги уже умеют пропускать.
                //
                // А ГАБАРИТ персонажа остаётся от полной цепочки: по нему
                // мини-игра раскладывает червя в сцене, и стоило бы ему
                // сжаться до живота — червь вырос бы и съехал, а с ним рот и
                // вся геометрия финала. Держат габарит тень на полу (её
                // спрятанную ванну не видно) и невидимая рамка по кругам.
                let fullCircles = null;
                if (opts.endAtBelly && bellySeg) {
                    fullCircles = hullCircles.slice();
                    for (let i = bellySeg.idx + 1; i < hullCircles.length; i++) hullCircles[i] = null;
                    const ext = state.built.extent;
                    if (ext) {
                        const W = state.built.hull ? state.built.hull.outlineWidth : 0;
                        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                        for (const c of fullCircles) {
                            if (!c || !(c.r > 0)) continue;
                            x0 = Math.min(x0, c.x - c.r - W); x1 = Math.max(x1, c.x + c.r + W);
                            y0 = Math.min(y0, c.y - c.r - W); y1 = Math.max(y1, c.y + c.r + W);
                        }
                        if (x0 < x1) {
                            setAttr(ext, 'x', x0.toFixed(1)); setAttr(ext, 'y', y0.toFixed(1));
                            setAttr(ext, 'width', (x1 - x0).toFixed(1)); setAttr(ext, 'height', (y1 - y0).toFixed(1));
                        }
                    }
                }

                // Единый силуэт, перетяжки, отражённый свет и тень на полу.
                updateBodyHull(state.built, hullCircles, fullCircles);

                // ---------- ЕДИНЫЙ КИШЕЧНЫЙ ТРАКТ ----------
                // Пересчитывается из тех же кругов, что и силуэт, поэтому
                // повторяет любой изгиб тела и раздутие живота без единой
                // отдельной координаты. Фаза перистальтики — отдельный
                // аккумулятор от dt (тот же принцип, что у прочих анимаций).
                state.gutSkipFrame = !state.gutSkipFrame;
                if (state.built.gutTract && !state.gutSkipFrame) {
                    const anat = mm.anatomy && mm.anatomy.enabled ? mm.anatomy : null;
                    const organs = anat && anat.organs ? anat.organs : null;
                    const cfg = organs && organs.tract ? organs.tract : null;
                    if (cfg) {
                        state.gutPhase += geomDtSec * (cfg.speed != null ? cfg.speed : 0.32);
                        const axis = sampleBodyAxis(hullCircles, 3.4);
                        const geom = buildGutTractGeometry(axis, bellySeg ? hullCircles[bellySeg.idx] : null, {
                            phase: state.gutPhase,
                            width: cfg.width, bellyWidth: cfg.bellyWidth,
                            wave: cfg.wave, bellyWave: cfg.bellyWave,
                            waveLength: cfg.waveLength, loopDensity: cfg.loopDensity
                        });
                        setAttr(state.built.gutTract.tube, 'd', geom.ribbon);
                        state.built.gutTract.corePts = geom.corePts;
                        state.built.gutTract.coreR = geom.coreR;
                        const liveVis = state.livePose.organVisibility;
                        const baseVis = liveVis != null ? liveVis : (organs.visibility != null ? organs.visibility : 0.6);
                        const tractVis = clamp01(baseVis * (cfg.visibility != null ? cfg.visibility : 0.85));
                        setAttr(state.built.gutTract.group, 'opacity', tractVis.toFixed(3));
                        // Еда лежит СНАРУЖИ группы тракта и её прозрачность не
                        // наследует — считает сама, от этого же числа.
                        state.foodVis = tractVis;
                    }
                }

                // ---------- ПУЛЬСАЦИЯ ВНУТРЕННИХ ОРГАНОВ ----------
                // Framerate-independent: фаза — отдельный аккумулятор,
                // прирастающий dtSec * текущая скорость (см. "эффект волчка").
                // Скорость может меняться на лету (livePose/оверрайд), поэтому
                // умножать общее накопленное время на неё нельзя.
                if (state.built.organs && state.built.organs.length) {
                    const anatomy = mm.anatomy && mm.anatomy.enabled ? mm.anatomy : null;
                    const pulse = anatomy && anatomy.organs ? (anatomy.organs.pulse || {}) : null;
                    if (pulse) {
                        const speed = pulse.speed != null ? pulse.speed : 0.85;
                        state.organPhase += geomDtSec * speed * Math.PI;
                        const ampScale = state.livePose.organPulseScale != null ? state.livePose.organPulseScale : 1;
                        const amp = (pulse.amp != null ? pulse.amp : 0.07) * ampScale;
                        if (amp > 0.0005) {
                            state.built.organs.forEach(o => {
                                const s = Math.sin(state.organPhase * o.speedMul + o.phase);
                                const a = amp * o.ampMul * s;
                                // Кишка "перистальтирует" (толще поперёк —
                                // короче вдоль), мешочек и узелки дышат
                                // равномерно: у каждого органа свой ритм и
                                // своя манера, а не общий мигающий scale.
                                const sx = o.kind === 'gut' ? (1 - a * 0.35) : (1 + a);
                                const sy = 1 + a;
                                setAttr(o.group, 'transform',
                                    `translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) rotate(${o.rot.toFixed(1)}) scale(${sx.toFixed(4)},${sy.toFixed(4)})`);
                            });
                        }
                    }
                }

                // Грудная клетка доворачивается за телом.
                updateRibCage();

                updateWormFace(state, opts, mm, geomDt, geomDtSec, witherPaint);
            }

            state.rafId = requestAnimationFrame(tick);
        }
        state.rafId = requestAnimationFrame(tick);

        function onResize() { syncViewportSize(); }
        window.addEventListener('resize', onResize);

        // Публичный handle — worm-handle.js.
        return createWormHandle({
            GEOM_LADDER, container, mergedModel, objectLayer, onResize, onStageDown, onStageMove, onStageUp, opts, paintBolus,
            rebuild, roomLayer, rootTransform, state, svg, tick, updateFood, walkTo, witherPaint, worldLayer
        });
    }
};

window.WormRenderer = WormRenderer;
