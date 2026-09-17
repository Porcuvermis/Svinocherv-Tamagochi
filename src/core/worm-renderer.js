// ================= МОНТАЖ ЧЕРВЯ НА ЭКРАН И ПОКАДРОВЫЙ ЦИКЛ =================
// Девятый и последний файл стопки рендерера (карта — в worm-basis.js).
// Всё, что живёт ВО ВРЕМЕНИ: состояние экземпляра, ходьба, камера, след
// слизи, tick() и публичный handle, которым пользуются мини-игры.
//
// Собирает червя не он — worm-build.js. Здесь только жизнь собранного.

// ---------- ПУБЛИЧНЫЙ API РЕНДЕРЕРА ----------
// Сколько кадров деформации персонажа отрисовано с загрузки страницы —
// по ВСЕМ экземплярам сразу. Нужно техосмотру (tools/audit-frames.js): по
// нему видно, на какой ступени лестницы идёт игра на этом устройстве.
let geomFrameTotal = 0;

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
            pose: 'standing'
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

        const state = {
            // Какая локация нарисована. Живёт в state, а не в opts: её меняют
            // на ходу (setLocation), а opts — то, с чем смонтировали.
            location: opts.location || (typeof RoomLocations !== 'undefined'
                ? RoomLocations.DEFAULT : null),
            baseModel: model,
            override: null,
            built: null,
            animTime: 0,
            wormX: 0,
            wormY: 0,
            targetX: 0,
            targetY: 0,
            // Куда червь СМОТРИТ на ходу (радианы). null = стоит. Отдельно от
            // направления на цель: именно расхождение между ними и даёт дугу
            // при смене цели на ходу.
            heading: null,
            // Истощение: 1 = здоров, меньше — обесцвечен. Показанное
            // значение догоняет цель за кадры, поэтому смерть не
            // обесцвечивает червя рывком.
            witherTarget: 1,
            witherShown: 1,
            witherBaked: null,   // какая ступень запечена в цвета
            witherNodes: null,   // цветные узлы тела, собираются на сборке
            // Пищеварение: что нарисовать (кладёт setDigestion) и своя фаза
            // перистальтики. Комки едут покадрово, а список приходит редко.
            digest: { boluses: [], stomachFill: 0, scale: 7 },
            foodPhase: 0,
            foodVis: 0.6,        // сколько видно тракт — та же величина, что у группы
            stomachContent: undefined,   // узел содержимого желудка, ищется раз на сборку
            // Камера: на сколько единиц комнаты окно сдвинуто вправо.
            camX: 0,
            camManualUntil: 0,   // до этого момента слежение молчит
            drag: null,          // текущий свайп
            // Измеренный габарит тела и допустимый диапазон глубин. null =
            // «пересчитать»: сбрасывается при пересборке тела и смене размера.
            bodyBox: null,
            wanderD: null,
            blinkClock: 0,
            faceClock: 0,
            rafId: null,
            lastFrameTs: null,
            // Лестница деформации (см. wantGeometry): сглаженная длительность
            // кадра, текущая ступень и счётчик кадров до следующей деформации.
            rafPrevTs: null,
            lastGeomTs: null,
            frameMs: 0,
            geomLevel: 0,
            geomCount: 0,
            geomHold: 0,
            geomDirty: true,
            // 0 = стоит на месте, 1 = идёт — рычаг интенсивности ТОЛЬКО
            // виляния.
            moveIntensity: 0,
            // 0..1 — от ФАКТИЧЕСКОЙ мгновенной скорости перемещения.
            speedIntensity: 0,
            // ---------- ШАГ НА МЕСТЕ ----------
            // 0 = канал выключен, 0..1 = «считай, что он идёт с такой
            // скоростью, никуда не перемещаясь». Нужен сценам, где под
            // персонажем едет мир, а сам он стоит в центре кадра (дорожка
            // тщеславия). Без этого канала походка включалась ТОЛЬКО от
            // реального перемещения по комнате (opts.wander), и червь ехал
            // по дорожке статуей на тележке.
            treadmill: 0,
            nextMoveAt: null,
            // Аккумуляторы фазы: покачивание цепи, "флик" кончика хвоста и
            // пульсация внутренних органов. НЕ путать с animTime: эти поля
            // прирастают ТЕКУЩЕЙ скоростью каждый кадр, а не умножаются на
            // неё постфактум (см. блок про "эффект волчка" у констант).
            chainWigglePhase: 0,
            tailWagPhase: 0,
            organPhase: 0,
            gutPhase: 0,
            gutSkipFrame: false,
            // ---------- ПЛАВНЫЙ ПОВОРОТ ГОЛОВЫ ----------
            // headYawCurrent — то, что реально нарисовано сейчас;
            // headYawTarget — куда едем. Ось непрерывная (механизм), а
            // именованные позы (словарь) просто задают цель. Так остаются
            // открыты обе двери: и щелчок между тремя позами, и плавное
            // слежение головой за чем-нибудь.
            headYawCurrent: null,
            headYawTarget: null,
            // Экранный угол хвостовой части. 180° = хвост влево, как было
            // всегда до появления ориентации; это же значение и стартовое,
            // поэтому неподвижный червь выглядит ровно как раньше.
            // Куда лежит напольная часть. 180° — вбок по экрану (обычный
            // вид сбоку), 270° — от камеры за спину (opts.tailDepth).
            tailAngle: opts.tailDepth ? WORM_TAIL_DEPTH_ANGLE : 180,
            room: null,
            depthScale: 1,
            floorLocalY: 0,
            // Голова по умолчанию сама следит за направлением ползания.
            // setHeadPose() перехватывает управление, setHeadPose('auto')
            // возвращает автоматику.
            headYawAuto: true,
            activeSlimeTrail: null,
            slimeTrails: [],
            // Ширина следа держится здесь, а не берётся отрезком своя: иначе
            // на каждом стыке отрезков по следу шла бы ступенька.
            slimeScale: null,
            // Отрезок, на котором след оборвался остановкой: к нему
            // пристыкуется следующий, если успеет до высыхания.
            slimeResume: null,
            slimeFadedAt: 0,
            // "Горячий" канал для непрерывных обновлений от мини-игр — не
            // трогает baseModel/override, не вызывает пересборку SVG.
            livePose: {
                tailBendAngle: 0,   // градусы поворота хвоста вокруг точки крепления
                eyelidLevel: null,  // 0..1 — подменяет базовый уровень век обоих глаз
                // 0..1 — нижнее веко, «улыбающийся глаз»: щека поджимает глаз
                // СНИЗУ, край выгнут вверх. Отдельно от eyelidLevel, потому
                // что прищур сверху и снизу читаются совершенно по-разному.
                eyeSmile: null,
                bellyScale: null,   // множитель радиуса живота (1 = обычный)
                // Дыхание: размах вдоха (доля радиуса) и его частота (Гц).
                // null = собственное дыхание персонажа, еле заметное и
                // только при idleWave. Заданный размах включает дыхание
                // независимо от idleWave — телу надо дышать и когда оно
                // лежит смирно.
                breathAmp: null,
                breathSpeed: null,
                mouthOpenness: null, // 0..1 — подменяет head.mouth.openness
                mouthCurve: null,    // подменяет head.mouth.curve
                // Жидкость во рту: 0..1 — насколько полость налита, и каким
                // цветом. Часть рта, а не наклейка поверх морды: едет,
                // размывается и обрезается губами вместе с ним. Пустой рот
                // прозрачен, так что канал ничего не стоит, пока не нужен.
                mouthFill: null,
                mouthFillColor: null,
                // Анатомические "живые" каналы — устроены ровно так же, как
                // всё остальное тело: null = брать из модели/оверрайда.
                // organPulseScale — множитель амплитуды пульсации органов
                // (например, "сытое" бурление после кормления или замирание
                // при испуге); organVisibility — временная подмена степени
                // просвечивания органов (кожа натянулась — видно лучше).
                organPulseScale: null,
                organVisibility: null,

                // ---------- МИМИКА ----------
                // Всё опционально: null = "не вмешиваюсь, работает
                // собственная жизнь персонажа" (см. idle-мимику в tick).
                headTilt: null,      // градусы наклона головы вокруг основания шеи
                // Поворот головы. null = брать из модели. Живой канал, а не
                // setOverride: setOverride пересобирает всю голову заново и
                // для покадровой анимации не годится.
                headYaw: null,
                gazeX: null,         // -1..1 — куда смотрит (доля от размера глаза)
                gazeY: null,
                browRaise: null,     // -1..1 — брови вниз (хмурится) / вверх (удивлён)
                earTilt: null,       // градусы к базовому развороту обоих ушей
                earTiltLeft: null,   // то же по отдельности
                earTiltRight: null,
                snoutTwitch: null,   // 0..1 — принюхивается
                cheekPuff: null,     // 0..1 — щёки надуты (например, полный рот)
                jawDrop: null        // 0..1 — челюсть опущена; по умолчанию следует за ртом
            }
        };

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

        // ---------- ГДЕ ЧЕРВЮ МОЖНО СТОЯТЬ ----------
        // Габарит тела относительно ТОЧКИ КАСАНИЯ ПОЛА, в экранных единицах.
        // Именно он, а не подобранная константа, задаёт границы выгула: червь
        // растёт с возрастом, и любой зашитый отступ рано или поздно
        // перестал бы совпадать с телом.
        //
        // getBBox() заставляет браузер посчитать раскладку SVG, поэтому
        // измерение кешируется: тело меняет габарит только при пересборке.
        // Перемер габарита. Одного замера мало: тело дышит, заваливается и
        // водит хвостом, поэтому мгновенный getBBox() — это снимок одной позы,
        // и по нему червь вылезал за нижнюю кромку примерно на два десятка
        // единиц. Копим ОГИБАЮЩУЮ по максимуму: она сходится к настоящему
        // размаху за несколько секунд и дальше не растёт.
        function measureBody() {
            if (!state.built) return false;
            let B;
            try { B = state.built.root.getBBox(); } catch (err) { return false; }
            if (!B || !B.width) return false;

            const old = state.bodyBox;
            if (!old) { state.bodyBox = { x: B.x, y: B.y, width: B.width, height: B.height }; return true; }

            const x0 = Math.min(old.x, B.x);
            const y0 = Math.min(old.y, B.y);
            const x1 = Math.max(old.x + old.width, B.x + B.width);
            const y1 = Math.max(old.y + old.height, B.y + B.height);
            const grew = (x0 < old.x - 0.5) || (y0 < old.y - 0.5) ||
                         (x1 > old.x + old.width + 0.5) || (y1 > old.y + old.height + 0.5);
            state.bodyBox = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
            return grew;
        }

        function bodyFootprint(sc) {
            if (!state.bodyBox) measureBody();
            const B = state.bodyBox;
            const F = state.floorLocalY;
            if (!B || !B.width) return { left: 0, right: 0, up: 0, down: 0 };
            return {
                left: B.x * sc,                        // от точки касания влево (число ≤ 0)
                right: (B.x + B.width) * sc,           // вправо
                up: (F - B.y) * sc,                    // насколько тело выше касания
                down: (B.y + B.height - F) * sc        // и насколько ниже
            };
        }

        // Диапазон глубин, на которых тело помещается в кадр ЦЕЛИКОМ: у
        // ближнего края его нижняя кромка не должна вываливаться за низ
        // экрана, у дальнего — макушка за верх коробки.
        //
        // Считается перебором, а не формулой: масштаб персонажа приглушён
        // (charScaleStrength), поэтому зависимость габарита от глубины
        // нелинейная и в одну строку не выражается. Полсотни шагов раз в
        // пересборку — цена, которой не видно.
        function refreshWanderRange() {
            const g = state.room;
            if (!g || !state.built || !state.floorLocalY) return;
            const M = ROOM.wanderMargin;
            const topLimit = g.backY - g.wallH * g.farScale + M;   // верхняя кромка коробки
            const bottomLimit = g.frontY - M;                      // низ кадра

            let min = null, max = null;
            for (let d = ROOM.wanderNear; d <= ROOM.wanderFar + 1e-6; d += 0.05) {
                const sc = roomCharScaleAt(d);
                const y = roomYAt(g, d);
                const fp = bodyFootprint(sc);
                // Помещается по вертикали в кадр И имеет куда шагнуть вбок.
                const span = 2 * (roomHalfAt(g, d) - M) - (fp.right - fp.left);
                const fits = (y + fp.down <= bottomLimit) &&
                             (y - fp.up >= topLimit) &&
                             (span >= ROOM.wanderMinSpan);
                if (fits) {
                    if (min === null) min = d;
                    max = d;
                }
            }
            // Не поместился нигде (крошечная комната, огромный червь) — не
            // запираем его в точке, а оставляем прежние рамки: пусть лучше
            // немного вылезет, чем застынет на месте.
            state.wanderD = (min === null)
                ? { min: ROOM.wanderNear, max: ROOM.wanderFar }
                : { min, max };
        }

        // Ближайшая точка пола, где червь помещается целиком. Через неё
        // проходят И случайная прогулка, И тап игрока — поэтому уйти за край
        // нельзя ни одним из способов.
        function clampFloorPoint(fx, fy) {
            const g = state.room;
            if (!g) return { x: fx, y: fy };
            if (!state.wanderD) refreshWanderRange();
            const range = state.wanderD || { min: ROOM.wanderNear, max: ROOM.wanderFar };

            const d = Math.min(Math.max(roomDepthAt(g, fy), range.min), range.max);
            const sc = roomCharScaleAt(d);
            const fp = bodyFootprint(sc);

            // Вбок: габарит тела должен уместиться в ширину пола НА ЭТОЙ
            // глубине. Пол сужается вглубь, поэтому проверять надо там, где
            // червь стоит, а не у переднего края.
            const half = roomHalfAt(g, d) - ROOM.wanderMargin;
            const lo = g.cx - half - fp.left;
            const hi = g.cx + half - fp.right;
            const x = (hi < lo) ? g.cx : Math.min(Math.max(fx, lo), hi);

            return { x, y: roomYAt(g, d) };
        }

        // ---------- КАМЕРА ----------
        // Комната шире экрана, экран — окно в неё. Здесь единственное место,
        // где камера вообще существует: вся остальная математика живёт в
        // координатах комнаты и про окно не знает.
        function setCam(x) {
            const g = state.room;
            if (!g) return;
            const next = Math.min(Math.max(x, 0), g.panMax);
            if (Math.abs(next - state.camX) < 0.01) return;
            state.camX = next;
            setAttr(worldLayer, 'transform', `translate(${(-next).toFixed(1)},0)`);
        }

        // Слежение за червём с мёртвой зоной. Камера стоит, пока он гуляет по
        // середине окна, и подъезжает, только когда он подходит к краю.
        // Иначе комната мелко трясётся вслед за каждым его шагом.
        function followCam(dtSec, now) {
            const g = state.room;
            if (!g || !g.panMax || now < state.camManualUntil || state.drag) return;

            const dead = g.w * CAM_DEAD_ZONE;
            const rel = state.wormX - state.camX;          // положение червя в окне
            let want = state.camX;
            if (rel < dead) want = state.wormX - dead;
            else if (rel > g.w - dead) want = state.wormX - (g.w - dead);
            want = Math.min(Math.max(want, 0), g.panMax);

            if (Math.abs(want - state.camX) < 0.5) return;
            setCam(state.camX + (want - state.camX) * (1 - Math.pow(CAM_FOLLOW_BASE, dtSec)));
        }

        // Экранные координаты → единицы КОМНАТЫ. Через getBoundingClientRect,
        // а не через clientWidth: вся игра живёт в холсте постоянного размера,
        // который масштабируется CSS-трансформацией, и без этого деления тап
        // уезжал бы тем сильнее, чем крупнее экран. Плюс сдвиг камеры: экран
        // показывает не начало комнаты, а её кусок.
        function toRoom(e) {
            const r = svg.getBoundingClientRect();
            if (!r.width || !r.height || !state.room) return null;
            return {
                x: (e.clientX - r.left) / r.width * state.room.w + state.camX,
                y: (e.clientY - r.top) / r.height * state.room.h
            };
        }

        // ---------- СВАЙП ИЛИ ТАП ----------
        // Одно касание значит одно из двух, и различает их только пройденное
        // расстояние: увёл палец вбок — панорама, отпустил на месте — «иди
        // сюда». Порог обязателен: палец никогда не стоит идеально, и без него
        // каждый тап заодно сдвигал бы камеру и сам себя отменял.
        //
        // Что тапом НЕ является:
        //   • предметы на полу — у них свой обработчик со stopPropagation
        //     (кучку убирают, а не идут к ней);
        //   • сам червь — тап по нему остаётся свободным под будущее «повозиться».
        function onStageDown(e) {
            if (!opts.tapToWalk || !opts.wander || !state.room) return;
            // Панорама начинается ОТКУДА УГОДНО, включая самого червя: палец
            // ложится куда пришёлся, и запрещать свайп с его спины значило бы
            // ловить «камера не двигается» на ровном месте. А вот «иди сюда»
            // с червя или с кучки не считается — у них своя роль.
            const t = e.target;
            const onBusy = !!(t && t.closest &&
                (t.closest('.worm-char-layer') || t.closest('.worm-room-objects')));
            state.drag = {
                id: e.pointerId, startX: e.clientX, camAt: state.camX,
                moved: false, tappable: !onBusy
            };
            try { svg.setPointerCapture(e.pointerId); } catch (err) { /* мышь без захвата */ }
        }

        function onStageMove(e) {
            const d = state.drag;
            if (!d || e.pointerId !== d.id || !state.room) return;
            const r = svg.getBoundingClientRect();
            if (!r.width) return;
            // Экранный сдвиг пальца → сдвиг в единицах комнаты.
            const dx = (e.clientX - d.startX) / r.width * state.room.w;
            if (!d.moved && Math.abs(dx) < CAM_DRAG_THRESHOLD) return;
            d.moved = true;
            // Комната едет ЗА пальцем: тянешь влево — открывается правая часть.
            setCam(d.camAt - dx);
            state.camManualUntil = performance.now() + CAM_MANUAL_HOLD_MS;
        }

        function onStageUp(e) {
            const d = state.drag;
            if (!d || e.pointerId !== d.id) return;
            state.drag = null;
            try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* уже отпущен */ }
            // Панорама либо тап по червю/кучке. ЗДЕСЬ будущий крючок реакций:
            // к этому моменту уже известно, что это именно тап (не свайп) и
            // что он пришёлся по телу, а какую часть задели — скажет
            // e.target.closest('[data-part]'). См. docs/stage-and-room.md.
            if (d.moved || !d.tappable) return;

            const p = toRoom(e);
            if (!p) return;
            // Считается только попадание В ПОЛ. Тап по стене или по темноте
            // вокруг коробки не должен никуда его отправлять: иначе «идёт
            // куда сказали» превращается в «дёргается от любого касания
            // экрана», и промах мимо кнопки сдвигает червя.
            const g = state.room;
            if (p.y < g.backY || p.y > g.frontY) return;
            if (Math.abs(p.x - g.cx) > roomHalfAt(g, roomDepthAt(g, p.y))) return;

            walkTo(p.x, p.y);
        }

        // Идти в точку пола. Точка вписывается в допустимую область, поэтому
        // тапнуть можно куда угодно — хоть в стену, хоть мимо комнаты: червь
        // подойдёт к ближайшему месту, где помещается целиком.
        function walkTo(floorX, floorY) {
            if (!state.room) return;
            const spot = clampFloorPoint(floorX, floorY);
            state.targetX = spot.x;
            state.targetY = spot.y - state.floorLocalY;
            // Курс НЕ трогаем: он доворачивается сам, и именно поэтому смена
            // цели на ходу читается дугой, а не изломом.
            state.nextMoveAt = null;
        }

        svg.addEventListener('pointerdown', onStageDown);
        svg.addEventListener('pointermove', onStageMove);
        svg.addEventListener('pointerup', onStageUp);
        svg.addEventListener('pointercancel', onStageUp);

        // ---------- ЗАПЕКАНИЕ ИСТОЩЕНИЯ В ЦВЕТА ----------
        // Список цветных узлов собирается ОДИН РАЗ на сборку тела, а не
        // ищется заново на каждую ступень: пробежка по семи сотням узлов
        // ради двух десятков ступеней — ровно та мелочь, из которой потом
        // складывается «почему-то тормозит».
        //
        // Ступень грубая (1/16) намеренно. Показанное истощение подтягивается
        // к цели за кадры, и на каждый такой кадр перекрашивать полтысячи
        // атрибутов незачем: переход идёт секунду-две, шестнадцати ступеней
        // на нём глазом не различить, а работы в двадцать раз меньше.
        const WITHER_STEP = 16;

        function collectWitherNodes() {
            const out = [];
            const root = state.built && state.built.root;
            if (!root) { state.witherNodes = out; return; }
            const nodes = root.querySelectorAll('*');
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                for (let k = 0; k < WITHER_COLOR_ATTRS.length; k++) {
                    const a = WITHER_COLOR_ATTRS[k];
                    const v = n.getAttribute(a);
                    // url(...) и none пропускаем сразу: у первого цвет лежит в
                    // стопах градиента (они в этом же дереве и попадут сюда
                    // сами), у второго цвета нет вовсе.
                    if (!v || v === 'none' || v.indexOf('url(') === 0) continue;
                    out.push({ n, a, base: v });
                }
            }
            state.witherNodes = out;
        }

        // Цвет для узла, который рождается ПОСЛЕ сборки тела и потому в
        // списке запекания не лежит: комок еды в кишке, жидкость во рту.
        // Раньше их красил тот же фильтр, что и всё тело, — теперь надо
        // руками, иначе у обесцвеченного червя внутренности останутся
        // сочными.
        function witherPaint(css) {
            const s = state.witherBaked;
            if (css == null || s == null || s >= 0.999) return css;
            return witherColor(css, s) || css;
        }

        // Здоровому червю (s = 1) цвета возвращаются исходные: witherColor при
        // единице даёт тот же оттенок, только записанный как rgb(...).
        function bakeWither(force) {
            const s = Math.max(0, Math.min(1, state.witherShown));
            const step = Math.round(s * WITHER_STEP) / WITHER_STEP;
            if (!force && state.witherBaked === step) return;
            state.witherBaked = step;
            if (!state.witherNodes) collectWitherNodes();
            const list = state.witherNodes;
            for (let i = 0; i < list.length; i++) {
                const it = list[i];
                const out = witherColor(it.base, step);
                if (out) setAttr(it.n, it.a, out);
            }
            // Комки еды живут отдельным слоем и в списке не лежат: они
            // появляются и исчезают по ходу пищеварения.
            const tract = state.built && state.built.gutTract;
            if (tract) tract.foodNodes.forEach(paintBolus);
        }

        // Цвета одного комка под текущее истощение.
        function paintBolus(ref) {
            if (!ref || !ref.base) return;
            setAttr(ref.wall, 'fill', witherPaint(ref.base.wall));
            setAttr(ref.body, 'fill', witherPaint(ref.base.body));
            setAttr(ref.shine, 'fill', witherPaint(ref.base.shine));
        }

        // ---------- ЕДА В КИШКЕ, ПОКАДРОВО ----------
        // Что здесь считается и почему именно здесь:
        //
        // * Раньше положение комков ставил вызывающий, пятнадцать раз в
        //   секунду. Пятнадцать шагов в секунду — это видимые рывки, а платил
        //   за них весь тракт целиком (маска + обрезка, см. createGutTract).
        //   Теперь вызывающий говорит только «комок вот на такой доле пути»,
        //   а движение, перистальтика и видимость считаются в кадре и стоят
        //   двух атрибутов на комок.
        // * Перистальтика — не украшение: без неё комок ПОЛЗЁТ равномерно,
        //   и в фазе кишечника (десять минут на путь) это выглядит зависшей
        //   картинкой. Волна сжимает комок вдоль трубы и подталкивает
        //   вперёд — видно, что его именно проталкивают.
        // * Видимость считается по плотности кожи, но с ПОЛОМ: там, где кожа
        //   плотная, кишку не видно вовсе, а еду видно приглушённо. Иначе
        //   самое интересное — как червь глотает — происходило бы за
        //   непрозрачной шеей.
        const FOOD_PULSE_HZ = 0.85;   // волн перистальтики в секунду
        const FOOD_NUDGE = 0.014;     // на сколько доли пути толкает волна
        // Комок ВИДНО ЛУЧШЕ, чем саму кишку, и это осознанно: кишка — фон,
        // а комок — единственное, что здесь происходит. Под плотной кожей
        // он не пропадает совсем, иначе самое интересное (как червь глотает)
        // случалось бы за непрозрачной шеей.
        const FOOD_SEE_BOOST = 0.28;  // насколько комок виднее кишки
        const FOOD_SEE_FLOOR = 0.5;   // доля видимости там, где кожа плотная

        function updateFood(dtSec) {
            const tract = state.built && state.built.gutTract;
            if (!tract || !tract.foodNodes.length) return;
            const list = state.digest.boluses;
            const pts = tract.corePts || [];
            state.foodPhase += dtSec;

            for (let i = 0; i < tract.foodNodes.length; i++) {
                const ref = tract.foodNodes[i];
                const b = list[i];
                if (!b || pts.length < 2) {
                    if (ref.shown) { setAttr(ref.group, 'opacity', '0'); ref.shown = false; }
                    continue;
                }
                // Своя фаза у каждого комка: иначе три проглоченных куска
                // сжимались бы разом, как один организм.
                const wave = state.foodPhase * FOOD_PULSE_HZ + i * 0.41;
                const squeeze = Math.sin((wave - Math.floor(wave)) * Math.PI * 2);
                const sPos = Math.max(0, Math.min(1, b.s + FOOD_NUDGE * squeeze));

                // Точка на осевой линии — сложение и умножение вместо промера
                // SVG-пути: строка пути меняется вслед за телом, и кеш длины
                // всё равно был бы недействителен каждый кадр.
                const fs = sPos * (pts.length - 1);
                const i0 = Math.min(pts.length - 2, Math.floor(fs));
                const k = fs - i0;
                const a = pts[i0], c = pts[i0 + 1];
                const x = a[0] + (c[0] - a[0]) * k;
                const y = a[1] + (c[1] - a[1]) * k;
                // Комок вытянут ВДОЛЬ кишки: он её растягивает, а не лежит
                // поперёк.
                const ang = Math.atan2(c[1] - a[1], c[0] - a[0]) * 180 / Math.PI;
                // Толчок вытягивает комок вдоль трубы, откат — округляет.
                // Плюс комок ужимается там, где тело тоньше него самого: на
                // хвосте оно вдвое тоньше живота, а маски, которая раньше
                // прятала вылезшее, у слоя еды больше нет.
                const rr = tract.coreR || null;
                const rLocal = rr && rr.length > i0 + 1
                    ? rr[i0] + (rr[i0 + 1] - rr[i0]) * k : 0;
                const fit = rLocal > 0
                    ? Math.min(1, (rLocal * 0.82) / Math.max(1, ref.size * 1.4)) : 1;
                const sx = fit * (1 + 0.24 * squeeze);
                const sy = fit * (1 - 0.16 * squeeze);
                setAttr(ref.group, 'transform',
                    `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang.toFixed(1)}) ` +
                    `scale(${sx.toFixed(3)},${sy.toFixed(3)})`);

                const thin = skinThinAt(tract.thinByIdx, sPos);
                const vis = (state.foodVis + FOOD_SEE_BOOST)
                          * (FOOD_SEE_FLOOR + (1 - FOOD_SEE_FLOOR) * thin);
                setAttr(ref.group, 'opacity', clamp01(vis).toFixed(3));
                // Перетяжка видна только на толчке: мышца сжалась — комок
                // поехал. На откате её нет вовсе.
                setAttr(ref.pinch, 'opacity',
                    (squeeze > 0 ? squeeze * 0.75 : 0).toFixed(2));
                ref.shown = true;
            }
        }

        // ---------- РАЗВОРОТ ГРУДНОЙ КЛЕТКИ ----------
        // Клетка живёт в трёх измерениях (ribPath) и пересчитывается, когда
        // тело поворачивается. Цена вопроса — восемнадцать записей в дерево
        // на заметный поворот, и ноль, пока червь стоит: ракурс сравнивается
        // с уже нарисованным.
        function updateRibCage() {
            const cage = state.built && state.built.ribCage;
            if (!cage) return;
            // Ракурс тела — тот же признак, по которому доворачивается
            // голова: куда лежит хвост. 0 — тело смотрит в камеру,
            // ±90° — профиль. Мини-игра может задать его сама (bodyYaw),
            // если водит червя не хвостом.
            const live = state.livePose.bodyYaw;
            const k = live != null ? Math.max(-1, Math.min(1, live))
                                   : -Math.cos(state.tailAngle * Math.PI / 180);
            const psi = k * Math.PI / 2;
            if (cage.psi != null && Math.abs(psi - cage.psi) < 0.026) return;
            cage.psi = psi;

            // Вся клетка ещё и ДОВОРАЧИВАЕТСЯ. Ось тела в животе нарисована
            // наискосок — так тело и лежит, когда мы видим его сбоку. Но
            // когда червь поворачивается к камере, хвост уходит в глубину, и
            // туловище на экране становится почти отвесным: клетка обязана
            // встать вместе с ним, иначе анфас выходит перекошенным. Поворот
            // делается ОДНИМ transform на половину клетки — его всё равно
            // переписывает пульсация органов, так что это ноль лишней работы.
            const beta = RIB_TURN_DEG * Math.cos(psi);
            cage.walls.forEach(w => { w.rot = beta; });

            for (let i = 0; i < cage.list.length; i++) {
                const rib = cage.list[i];
                const r = ribPath(rib, psi);
                setAttr(rib.shadow, 'd', r.d);
                setAttr(rib.line, 'd', r.d);
                // Ближнее ребро ярче дальнего. Ступенями по шестым долям:
                // иначе на каждый кадр поворота приходится ещё по две записи
                // на ребро, а разницы в четверть процента прозрачности никто
                // не увидит.
                const near = Math.round(r.near * 6) / 6;
                if (rib.shown !== near) {
                    rib.shown = near;
                    setAttr(rib.line, 'opacity', (0.28 + 0.26 * near).toFixed(2));
                    setAttr(rib.shadow, 'opacity', (0.1 + 0.16 * near).toFixed(2));
                }
            }

            // Половина клетки, которая ближе к зрителю, рисуется ПОВЕРХ
            // органов, дальняя — под ними. При развороте они меняются
            // ролями: две перестановки узлов на весь разворот, а не на кадр.
            if (cage.groups.length === 2) {
                const frontIsB = Math.sin(psi) > 0;
                if (cage.frontIsB !== frontIsB) {
                    cage.frontIsB = frontIsB;
                    const layer = cage.groups[0].parentNode;
                    if (layer) {
                        layer.insertBefore(frontIsB ? cage.groups[0] : cage.groups[1], layer.firstChild);
                        layer.appendChild(frontIsB ? cage.groups[1] : cage.groups[0]);
                    }
                }
            }
        }

        function rebuild() {
            const m = mergedModel();
            while (charLayer.firstChild) charLayer.removeChild(charLayer.firstChild);
            state.built = buildWormSVGGroup(m, instanceId, opts.headFlip);
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
        // его цикл: невидимый червь продолжал анимироваться вечно, сотнями
        // setAttribute в кадр. Замер: один такой забытый экземпляр — минус
        // около трёх кадров навсегда, и по одному на каждую такую мини-игру.
        //
        // Чинится здесь, а не в мини-играх, нарочно: «не забыть остановить» —
        // ровно то требование, которое уже забыли дважды. Пусть за этим следит
        // тот, кто крутит цикл.
        let stageVisible = true;
        let stageCheckedAt = -1e9;
        function isStageVisible(now) {
            // Проверка стоит запроса раскладки, поэтому пока холст ВИДЕН, она
            // делается дважды в секунду. А пока скрыт — каждый кадр: кадр в
            // этот момент всё равно пустой, зато возврат к жизни происходит
            // мгновенно. Задержка тут недопустима: мини-игра сразу после
            // open() меряет реальный bbox персонажа, и застрявшая на полсекунды
            // пауза дала бы ей замер по непосчитанному кадру.
            if (stageVisible && now - stageCheckedAt < 500) return true;
            stageCheckedAt = now;
            stageVisible = container.isConnected
                && container.getClientRects().length > 0
                && getComputedStyle(container).visibility !== 'hidden';
            return stageVisible;
        }

        // ---------- ЧАСТОТА СОБСТВЕННЫХ КАДРОВ ----------
        // Персонаж — самая дорогая вещь на экране: семьсот узлов, и каждый
        // кадр по ним проходит вся анимация. На медленном телефоне это одно
        // съедало больше половины кадрового бюджета.
        //
        // Но шестьдесят обновлений в секунду ему нужны далеко не всегда: в
        // мини-играх он часто стоит смирно, и разницу между 60 и 24 там не
        // видно вовсе. opts.frameHz ограничивает ЕГО частоту, не трогая
        // общий кадровый цикл: сцена по-прежнему рисуется, сколько может,
        // просто персонаж пересчитывается реже.
        //
        // Считается это ДЕЛИТЕЛЕМ КАДРОВ, а не порогом по времени, и разница
        // принципиальная. Порог «прошло ли 1000/Hz миллисекунд» на медленном
        // устройстве не срабатывает НИКОГДА: кадр там и так длиннее порога —
        // потому и длиннее, что персонаж дорогой. Получалось, что помогает
        // он ровно там, где и без него всё хорошо.
        //
        // Делитель работает наоборот: чем тяжелее кадр, тем больше выгода.
        // Тяжёлый кадр чередуется с дешёвыми, и общая частота растёт, а
        // персонаж просто обновляется реже — там, где он всё равно стоит
        // смирно, этого не видно.
        //
        // Считается КАЖДЫЙ раз, а не один раз при монтировании: мини-игра
        // меняет частоту на ходу (handle.setFrameHz). В ванной, например,
        // персонаж на общем плане живой, а на наезде — фон за хвостом, и
        // платить за него полную цену там незачем.
        const frameEvery = () => (opts.frameHz > 0
            ? Math.max(1, Math.round(60 / opts.frameHz)) : 1);
        // Пол: реже десяти раз в секунду персонаж не обновляется никогда, как
        // бы плохо ни было. Ниже начинает дёргаться моргание.
        //
        // На ЗАДЫХАЮЩЕМСЯ устройстве пол поднимается: там кадр и так длиннее
        // сотни миллисекунд, и «не реже десяти раз в секунду» означает
        // «каждый кадр», то есть делитель не экономит вовсе. Замер на айфоне
        // в ванной: 24 кадра с живым персонажем и 60 с замершим — весь
        // бюджет уходил на его пересчёт.
        const FRAME_FLOOR_MS = 100;
        const FRAME_FLOOR_SLOW_MS = 260;

        // ---------- ДВИЖЕНИЕ ОТДЕЛЬНО ОТ ДЕФОРМАЦИИ ----------
        // Замер, ради которого всё это написано (throttle 6, комната):
        //
        //   все записи как сейчас .......... 1560 мс главного потока за 2 с
        //   только корневой transform ......  538
        //   ни одной записи ................  244
        //
        // И главное — промежуточных значений НЕТ. Запретить записи любой
        // ОДНОЙ подсистемы (силуэт, кишка, анатомия, голова) экономит 0–9%,
        // а запретить все, кроме корневого трансформа, — 66%. Значит цена
        // кадра не в количестве записей, а в самом ФАКТЕ: как только в теле
        // поменялась хоть одна геометрия (d, cx, rx, opacity), браузер
        // перезаписывает список отрисовки всех семисот узлов, заново
        // раскладывает слои и заново их растрирует. Сорок записей стоят
        // почти столько же, сколько одна.
        //
        // Зато СМЕЩЕНИЕ узла (атрибут transform) в эту цену не входит: там
        // меняется только матрица, список отрисовки берётся готовым. Поэтому
        // ходьба по комнате почти бесплатна, а дорого стоит дыхание.
        //
        // Отсюда деление кадра надвое:
        //   • каждый кадр — корневой transform (червь едет по комнате плавно,
        //     как и раньше);
        //   • по лестнице (GEOM_LADDER) — вся деформация: силуэт, кишка, лицо.
        //
        // Частоту деформации выбирает САМО УСТРОЙСТВО: пока кадры короткие,
        // деформация идёт кадр в кадр и картинка ровно та же, что была. Как
        // только кадр перестаёт укладываться в бюджет, она разрежается. Это
        // ровно та же лестница с гистерезисом, что у разрешения в зависти.
        // Ступени лестницы: [сколько тиков с деформацией, из скольких].
        // Дробная ступень тут не прихоть. Целая («каждый второй тик»)
        // делит частоту сразу вдвое, а собственный делитель кадров уже
        // поделил её на два — вместе получалось четыре, и на медленном
        // телефоне это стало видно сразу: поворот хвоста пошёл ступенями, а
        // след из-под него — прямыми отрезками со стыками под углом. «Два
        // тика из трёх» отнимают треть работы вместо половины, и ступеней
        // не видно. Моргание из лестницы исключено отдельно (wantGeometry).
        //
        // Ступеней пять, а не две. Две были рассчитаны на «слегка не
        // успевает»: нижняя отнимала треть работы, и на устройстве, которое
        // проседает вдвое, это не спасало вовсе. Верхние ступени — для
        // случая, когда выбор стоит не между красиво и очень красиво, а
        // между «дышит рывками» и «игра не отвечает».
        const GEOM_LADDER = [[1, 1], [2, 3], [1, 2], [1, 3], [1, 5]];
        // Пороги нарочно РАЗВЕДЕНЫ ШИРОКО, и нижний стоит там, где картинка
        // уже разваливается сама (30 кадров), а не там, где просто не идеал.
        // Сначала лестница включалась с 24 мс (сорок кадров), то есть почти
        // всегда, — и разрежённая деформация стала штатным режимом. Хвост
        // при повороте пошёл ступенями, и это было видно раньше, чем
        // выигранные кадры. Теперь лестница — спасение для совсем слабого
        // устройства, а не способ выгадать кадр на нормальном.
        const GEOM_SLOW_MS = 33;       // кадр длиннее (меньше 30 fps) — разрядить
        const GEOM_FAST_MS = 22;       // кадр короче (больше 45 fps) — вернуть
        const GEOM_HOLD_UP = 1500;     // и не по первому же тяжёлому кадру
        const GEOM_HOLD_DOWN = 4000;   // обратно — только после долгого затишья
        // Совсем плохой кадр (меньше 25 fps) разрежает деформацию БЫСТРО: там
        // уже не до аккуратности, и полторы секунды ожидания на каждую
        // ступень — это шесть секунд, которые игрок проводит в киселе.
        const GEOM_AWFUL_MS = 40;
        const GEOM_HOLD_AWFUL = 400;

        // Длительность НАСТОЯЩЕГО кадра страницы и ступень лестницы.
        // Считается в самом начале tick(), до делителя частоты: делитель
        // пропускает кадры, и мерить по нему значило бы мерить собственную
        // экономию, а не то, как тяжело устройству.
        function trackFrame(now) {
            const raf = state.rafPrevTs ? now - state.rafPrevTs : 16.7;
            state.rafPrevTs = now;
            // Сглаженная длительность: одиночный длинный кадр (сборка мусора,
            // открытие мини-игры) не должен переключать ступень.
            if (raf > 0 && raf < 500) {
                state.frameMs = state.frameMs ? state.frameMs + (raf - state.frameMs) * 0.1 : raf;
            }
            state.geomHold = (state.geomHold || 0) + raf;
            const holdUp = state.frameMs > GEOM_AWFUL_MS ? GEOM_HOLD_AWFUL : GEOM_HOLD_UP;
            if (state.frameMs > GEOM_SLOW_MS && state.geomLevel < GEOM_LADDER.length - 1
                && state.geomHold > holdUp) {
                state.geomLevel++; state.geomHold = 0;
            } else if (state.frameMs < GEOM_FAST_MS && state.geomLevel > 0
                       && state.geomHold > GEOM_HOLD_DOWN) {
                state.geomLevel--; state.geomHold = 0;
            }
        }

        // Нужна ли в этом кадре деформация.
        function wantGeometry(now) {
            // Моргание — единственное быстрое движение персонажа: глаз
            // закрывается и открывается за 220 мс. На разреженной лестнице
            // в это окно попадает один кадр, а то и ни одного, и червь
            // просто перестаёт моргать. Поэтому на время моргания лестница
            // отступает: три лишних кадра деформации раз в две с половиной
            // секунды ничего не стоят, а взгляд без моргания мёртвый.
            if (opts.blink && state.lastGeomTs) {
                const pos = (state.blinkClock + (now - state.lastGeomTs)) % WORM_BLINK_CYCLE;
                if (pos >= WORM_BLINK_START - 40 && pos < WORM_BLINK_START + WORM_BLINK_DURATION + 40) {
                    state.geomFrames = (state.geomFrames || 0) + 1;
                    geomFrameTotal++;
                    return true;
                }
            }
            // Живой канал (мини-игра ведёт хвост за пальцем, наливает рот)
            // перебивает лестницу: пропущенный кадр здесь читается как
            // задержка управления, а её никакая экономия не оправдывает.
            const [keep, of] = GEOM_LADDER[state.geomLevel];
            state.geomCount = ((state.geomCount || 0) + 1) % of;
            if (!state.geomDirty && state.geomCount >= keep) return false;
            state.geomDirty = false;
            state.geomFrames = (state.geomFrames || 0) + 1;
            geomFrameTotal++;
            return true;
        }

        function tick(now) {
            trackFrame(now);
            const every = frameEvery();
            if (every > 1) {
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
                        hullCircles[seg.idx] = { x: sx, y: sy, r: seg.baseRx, color: seg.fillColor };
                    });

                    const tsx = -(state.built.tail.idx * WORM_SEGMENT_SPACING + WORM_CHAIN_HEAD_GAP + bellyPushGap);
                    const tsy = opts.idleWave ? (Math.sin(state.animTime + state.built.tail.idx * 0.6) * 12 + state.built.tail.idx * 4) : 0;
                    setAttr(state.built.tail.group, 'transform', `translate(${tsx.toFixed(1)},${tsy.toFixed(1)})`);
                    hullCircles[state.built.tail.idx] = {
                        x: tsx, y: tsy, r: state.built.tail.baseRadius, color: mm.tail.fill
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
                        hullCircles[seg.idx] = { x: vx, y: vy, r: seg.baseRx, color: seg.fillColor };
                        const breathRatio = WORM_BREATH_RATIO[seg.name];
                        if (breathRatio != null) {
                            const breathFactor = 1 + breathWave * breathAmp * breathRatio;
                            hullCircles[seg.idx].r = seg.baseRx * breathFactor;
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
                        hullCircles[seg.idx] = { x: chainX, y: chainY, r: radius, color: seg.fillColor };
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
                        x: chainX, y: chainY, r: tailRadius, color: mm.tail.fill
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
                        updateSlimeTrail(now, isMoving, anchorWorld);
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
                    }
                }

                // ---------- НАРЯД ЖИВЁТ ВМЕСТЕ С ТЕЛОМ ----------
                // Сегменты ставятся одним сдвигом, БЕЗ поворота, поэтому
                // одежда на них стояла горизонтально к ЭКРАНУ, а не к телу:
                // тело изгибалось, а пиджак и бант оставались приколоченными.
                // Угол части берём из положения соседей — из тех же кругов,
                // что и силуэт, так что расходиться нечему.
                if ((state.built.wearOnBody && state.built.wearOnBody.length)
                    || (state.built.wearSwings && state.built.wearSwings.length)) {
                    // ---------- ТЕЛО ПОВОРАЧИВАЕТСЯ, А НЕ КРУТИТСЯ ----------
                    // Первая версия поворачивала одежду по оси части — и это
                    // читалось как шарик, крутящийся под фраком. Для игрока
                    // червь стоит вертикально и поворачивается ЦЕЛИКОМ, как
                    // очки на лице: предмет уезжает вбок и сужается, показывая
                    // то один бок, то другой. Ракурс тела — тот же признак, по
                    // которому доворачивается грудная клетка.
                    const live = state.livePose.bodyYaw;
                    const bodyK = live != null ? Math.max(-1, Math.min(1, live))
                                               : -Math.cos(state.tailAngle * Math.PI / 180);

                    // ---------- ВИСЯЩЕЕ СЛУШАЕТСЯ ТЯЖЕСТИ ----------
                    // Фалды, ленты и подвески висят ВНИЗ ПО ЭКРАНУ, а не по
                    // своей части: один конец пришит к телу, второй свободен.
                    // Угол считается пружиной с затуханием — отсюда и упругость,
                    // и раскачка после остановки. Ведёт её скорость персонажа
                    // по сцене и наклон телефона (если он есть).
                    const dt = Math.max(0.001, Math.min(0.05, geomDtSec || 0.016));
                    const vx = state.wearPrevX == null ? 0 : (state.wormX - state.wearPrevX) / dt;
                    state.wearPrevX = state.wormX;
                    // ---------- ЗНАК СЧИТАЕТСЯ В ОДНОМ МЕСТЕ ----------
                    // Угол здесь — это «куда уехал СВОБОДНЫЙ КОНЕЦ»: плюс —
                    // вправо по экрану. В этих понятиях оба источника
                    // очевидны и не путаются:
                    //   • завалили телефон вправо — тяжесть тянет вправо, плюс;
                    //   • пошли вправо — ткань ОТСТАЁТ и уходит влево, минус.
                    // В сам rotate() это уезжает со знаком минус, потому что у
                    // svg ось Y вниз и положительный поворот уводит висящий
                    // конец ВЛЕВО (docs/traps.md, п. 116).
                    const tiltDeg = (typeof Tilt !== 'undefined' && Tilt.x) ? Tilt.x() * 16 : 0;
                    const target = Math.max(-24, Math.min(24, -vx * 0.035)) + tiltDeg;

                    state.built.wearOnBody.forEach(w => {
                        if (w.idx == null) return;
                        const me = hullCircles[w.idx];
                        if (!me) return;
                        // ---------- НАДЕТОЕ ПОВТОРЯЕТ ЧАСТЬ ----------
                        // Слой одежды лежит выше кожи и потому вне группы
                        // части. Положение он не вычисляет, а списывает у
                        // самой части: раскладок у цепочки три (прямая линия,
                        // вертикаль, цепь с глубиной), и четвёртая копия
                        // расчёта разошлась бы с ними в первую же правку.
                        // Чтение атрибута не трогает раскладку и стоит ноль.
                        if (w.mirror && w.mirror.length) {
                            let t = '';
                            for (let m = 0; m < w.mirror.length; m++) {
                                t += (w.mirror[m].getAttribute('transform') || '') + ' ';
                            }
                            if (t !== w.mirrored) { w.mirrored = t; setAttr(w.hostNode, 'transform', t); }
                        }
                        // Хвост живёт в своей группе изгиба — она его и
                        // поворачивает; тело поворота не имеет вовсе.
                        // ---------- РАКУРС ДВИГАЕТ ЛИЦО, А НЕ ВСЮ ВЕЩЬ ----------
                        // У ткани есть узел [data-face] — то, что нарисовано
                        // на груди. Сужается и съезжает он, а обшивка стоит:
                        // она обнимает часть кругом и достаёт до обоих краёв
                        // силуэта при любом ракурсе. Пока сужалась вся вещь,
                        // она скукоживалась к центру и по бокам вылезала
                        // голая кожа — «повернулся» это не читалось.
                        const moved = w.faceNode || w.node;
                        const half = w.faceNode ? w.faceHalf : w.halfW;
                        if (w.part !== 'tail' || w.faceNode) {
                            const p = WormSilhouette.wearBodyPlace(bodyK, half, !!w.faceNode);
                            const refNow = (w.faceNode && w.refIdx != null) ? hullCircles[w.refIdx] : null;
                            const dxNow = refNow ? +(refNow.x - me.x).toFixed(2) : 0;
                            if (w.shownX !== p.x || w.shownSq !== p.squash || w.shownDx !== dxNow) {
                                w.shownX = p.x; w.shownSq = p.squash; w.shownDx = dxNow;
                                // Половины одной вещи двигаются в ОДНИХ
                                // единицах: иначе манишка сверху уезжает не
                                // настолько, насколько снизу, и рвётся по шву.
                                const unit = (w.faceNode && w.faceR) || me.r || 1;
                                // Лицо половины выстраивается по оси ОПОРНОЙ
                                // части вещи: сегменты не стоят на одной
                                // вертикали, и манишка, отцентрованная по
                                // каждому своему, шла по шву зигзагом.
                                const ref = (w.faceNode && w.refIdx != null) ? hullCircles[w.refIdx] : null;
                                const dx = ref ? (ref.x - me.x) : 0;
                                setAttr(moved, 'transform',
                                    `translate(${((w.faceNode ? dx : w.baseX) + p.x * unit).toFixed(2)},0)`
                                    + ` scale(${p.squash.toFixed(3)},1)`);
                            }
                        }
                    });

                    // ---------- ВИСЯЩЕЕ КАЧАЕТСЯ ВЕЗДЕ ОДИНАКОВО ----------
                    // Список общий для тела и головы: качание собиралось
                    // только у надетого на тело, и серьга в ухе не качалась
                    // вовсе — у головы своя ветка монтажа.
                    const sw = state.built.wearSwings || [];
                    for (let k = 0; k < sw.length; k++) {
                        const s2 = sw[k];
                        // Пружина: тянет к цели, гасится, потому качается.
                        // Чем дальше по подвеске, тем мягче — так цепочка из
                        // нескольких звеньев изгибается, а не едет одним куском.
                        const n = s2.order || 0;
                        const stiff = 46 / (1 + n * 0.9), damp = 7.5 + n * 1.2;
                        s2.vel = (s2.vel || 0) + ((target * s2.k - (s2.ang || 0)) * stiff
                                                 - (s2.vel || 0) * damp) * dt;
                        s2.ang = (s2.ang || 0) + s2.vel * dt;
                        // Куда повёрнут сам носитель: висящее обязано это
                        // вычесть, иначе оно висит «вниз по хвосту», а не вниз.
                        const host = s2.part === 'tail' ? (state.tailWearRot || 0) : 0;
                        // s2.ang — куда уехал свободный конец (плюс вправо), а
                        // поворот носителя вычитается, чтобы висящее держало
                        // свой угол по ЭКРАНУ.
                        const want = -s2.ang - host;
                        if (Math.abs(want - s2.now) < 0.2) continue;
                        s2.now = want;
                        setAttr(s2.el, 'transform', `rotate(${want.toFixed(1)})`);
                    }
                }

                // Единый силуэт, перетяжки, отражённый свет и тень на полу.
                updateBodyHull(state.built, hullCircles);

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
                        yawTarget = state.livePose.headYaw;
                    } else if (!state.headYawAuto && state.headYawTarget != null) {
                        yawTarget = state.headYawTarget;
                    } else if (state.headYawAuto && opts.wander) {
                        yawTarget = WORM_HEAD_YAW_FOLLOW * -Math.cos(state.tailAngle * Math.PI / 180);
                    } else {
                        yawTarget = mm.head.yaw != null ? mm.head.yaw : 0;
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
                        if (browRaise != null && eyeRef.browGroup) {
                            const eyeModel = mm.eyes[side];
                            const mirror = side === 'left' ? -1 : 1;
                            const lift = -browRaise * 4;
                            const angle = eyeModel.brow.angle * mirror - browRaise * 6 * mirror;
                            setAttr(eyeRef.browGroup, 'transform',
                                `translate(0,${(-eyeRef.ry - 7 + lift).toFixed(2)}) rotate(${angle.toFixed(2)})`);
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
                setAttr(svg, 'data-pose', name || '');
            },
            // Повернуть голову в именованную позу: 'left' | 'center' | 'right'.
            // Голова доедет туда сама, за кадры — без пересборки SVG.
            // Можно передать и число (-1..1), если нужна произвольная точка
            // оси, например слежение за курсором.
            setHeadPose(pose, opts) {
                // 'auto' — вернуть управление автоматике (голова снова
                // следит за направлением ползания).
                if (pose === 'auto' || pose == null) {
                    state.headYawAuto = true;
                    state.headYawTarget = null;
                    return;
                }
                const v = typeof pose === 'number'
                    ? Math.max(-1, Math.min(1, pose))
                    : (WORM_HEAD_POSES[pose] != null ? WORM_HEAD_POSES[pose] : 0);
                state.headYawAuto = false;
                state.headYawTarget = v;
                state.livePose.headYaw = null; // именованная поза перебивает ручной канал
                // instant: встать в позу без переходной анимации.
                if (opts && opts.instant) state.headYawCurrent = v;
            },
            getHeadPose() {
                return {
                    current: state.headYawCurrent,
                    target: state.headYawTarget,
                    poses: Object.assign({}, WORM_HEAD_POSES)
                };
            },
            setLivePose(patch) {
                // Изменение живого канала обязано попасть в ближайший же
                // кадр: мини-игра ведёт хвост за пальцем, и пропуск кадра
                // здесь читается как задержка управления. Но именно
                // ИЗМЕНЕНИЕ: если мини-игра каждый кадр присылает те же
                // значения, деформация остаётся на своей ступени.
                if (patch) {
                    for (const k in patch) {
                        if (state.livePose[k] !== patch[k]) { state.geomDirty = true; break; }
                    }
                }
                Object.assign(state.livePose, patch);
                // Степень просвечивания органов — единственный "живой"
                // параметр, который нельзя поменять одним transform: он
                // задан непрозрачностью слоя. Меняем её точечно, без
                // пересборки SVG (тот же принцип "не трогаем DOM зря").
                if (patch && patch.organVisibility !== undefined && state.built) {
                    const layers = state.built.root.querySelectorAll('.worm-organ-layer');
                    const m = mergedModel();
                    const base = (m.anatomy && m.anatomy.organs && m.anatomy.organs.visibility != null)
                        ? m.anatomy.organs.visibility : 0.55;
                    for (let i = 0; i < layers.length; i++) {
                        const host = layers[i].closest('[data-anat]');
                        const partName = host ? host.getAttribute('data-anat') : null;
                        const thin = partName && m.anatomy
                            ? anatThinness(m.anatomy, partName, (m.growingSegments || []).length) : 1;
                        const vis = patch.organVisibility != null ? patch.organVisibility : base;
                        setAttr(layers[i], 'opacity', clamp01(vis * thin).toFixed(3));
                    }
                }
            },
            // Переключение опций монтирования на ходу. Пока нужна ровно одна
            // пара — wander и blink: мёртвый червь не бродит по комнате и не
            // моргает, а перемонтировать его ради этого значило бы собрать
            // весь SVG заново. Опции читаются в tick() каждый кадр, поэтому
            // достаточно их подменить.
            setOptions(patch) {
                Object.assign(opts, patch);
            },
            // Сменить локацию. Перестраивается ТОЛЬКО слой комнаты: персонаж,
            // след слизи и предметы на полу к ней не привязаны, а геометрия
            // коробки у всех локаций общая — значит червь остаётся стоять
            // ровно там же, где стоял, и заново собирать его незачем.
            setLocation(key) {
                if (!opts.room || !state.room) return false;
                if (typeof RoomLocations === 'undefined' || !RoomLocations.has(key)) return false;
                state.location = key;
                buildRoom(roomLayer, state.room, key);
                return true;
            },
            getLocation() {
                return state.location;
            },
            // Отправить червя в точку пола (в единицах холста). Тот же путь,
            // которым идёт тап игрока: точка вписывается в допустимую область.
            walkTo,
            // Истощение: 1 = здоровый цвет, 0 = полностью обесцвечен.
            // Показанное значение догоняет это за кадры — вызывающему не надо
            // сглаживать самому.
            setWither(saturation) {
                state.witherTarget = Math.max(0, Math.min(1, saturation));
            },
            // ---------- ШАГ НА МЕСТЕ ----------
            // «Иди со скоростью v, оставаясь на месте»: 0 — стоит, 1 — идёт
            // в полную силу. Перемещения не даёт вовсе — двигать сцену под
            // персонажем должна сама мини-игра. Сделано отдельным каналом, а
            // не включением wander: wander тянет за собой выбор целей, дугу
            // разворота, слизистый след и привязку к полу комнаты — на
            // дорожке тщеславия не нужно ничего из этого.
            setTreadmill(v) {
                state.treadmill = Math.max(0, Math.min(1, Number(v) || 0));
            },
            // Точечная перестановка "точки стояния" персонажа уже ПОСЛЕ
            // монтирования — нужна мини-играм, где раскладку нельзя выразить
            // одним фиксированным anchorX/anchorY.
            setPosition(x, y) {
                state.wormX = x;
                state.wormY = y;
                state.targetX = x;
                state.targetY = y;
                if (state.built) setAttr(state.built.root, 'transform', rootTransform());
            },
            getPosition() {
                return { x: state.wormX, y: state.wormY };
            },
            // Что сейчас у персонажа с кадрами: сглаженная длительность кадра
            // страницы и ступень разрежения деформации (1 = деформация в
            // каждом собственном кадре). Нужно инструментам техосмотра —
            // иначе про лестницу можно узнать только по косвенным признакам.
            getFrameStats() {
                return {
                    frameMs: +(state.frameMs || 0).toFixed(1),
                    geomLevel: state.geomLevel,
                    geomPart: GEOM_LADDER[state.geomLevel].join('/'),
                    geomFrames: state.geomFrames || 0,
                    frameHz: opts.frameHz
                };
            },

            // Где сейчас конкретная часть тела — в координатах сцены.
            // Нужно тому, кто кладёт что-то рядом с червём: «под хвостом»
            // нельзя посчитать снаружи, потому что тело поворачивается по
            // ходу движения, а хвост уезжает за ним.
            // Точка части тела в координатах КОМНАТЫ — тех же, в которых
            // работают getPosition/setPosition и всё остальное снаружи.
            //
            // Пересчёт идёт в систему worldLayer, а НЕ svg. Разница появилась
            // вместе с камерой: worldLayer сдвинут на -camX, и пересчёт в
            // систему svg давал бы ЭКРАННЫЕ координаты. По этой точке
            // кладутся кучки на пол, а рисуются они внутри worldLayer — то
            // есть в комнате, — и кучка ложилась бы мимо червя ровно на сдвиг
            // камеры. Там, где комнаты нет (мини-игры), worldLayer без
            // трансформации и обе системы совпадают.
            getPartPoint(partName) {
                const el = svg.querySelector(`[data-part="${partName}"]`);
                if (!el || !el.getScreenCTM || !worldLayer.getScreenCTM) {
                    return { x: state.wormX, y: state.wormY };
                }
                try {
                    const box = el.getBBox();
                    const pt = svg.createSVGPoint();
                    pt.x = box.x + box.width / 2;
                    pt.y = box.y + box.height / 2;
                    // Порядок умножения важен: нужно СНАЧАЛА перевести точку
                    // из части в экран (el), и только потом из экрана в
                    // worldLayer (обратная матрица). Это W⁻¹ × E, а не
                    // E × W⁻¹.
                    //
                    // Ошибка не всплывала годами, потому что обе матрицы были
                    // переносами, а переносы переставимы. Сломалось на первом
                    // же зеркальном персонаже (opts.flip у противника в
                    // гневе): scale(-1,1) с переносом не переставляется, и
                    // точка части уезжала за пределы сцены.
                    const local = pt.matrixTransform(worldLayer.getScreenCTM().inverse().multiply(el.getScreenCTM()));
                    return { x: local.x, y: local.y };
                } catch (err) {
                    return { x: state.wormX, y: state.wormY };
                }
            },

            // ---------- ПИЩЕВАРЕНИЕ ----------
            // Рендерер не считает время и не знает про еду ничего, кроме
            // «нарисуй комки вот в этих точках тракта». Куда они доехали —
            // считает вызывающий по метке времени кормёжки (worm.js).
            //
            //   boluses    — [{ s: 0..1 вдоль тракта, size: доля толщины }]
            //   stomachFill — 0..1, насколько наполнен желудок
            setDigestion(data) {
                const d = data || {};
                const tract = state.built && state.built.gutTract;
                state.digest.stomachFill = Math.max(0, Math.min(1, d.stomachFill || 0));
                if (tract && tract.foodLayer) {
                    const list = d.boluses || [];
                    state.digest.boluses = list;
                    state.digest.scale = d.scale || 7;

                    // Узлы переиспользуются: комков три-четыре, создавать их
                    // заново каждый кадр незачем.
                    while (tract.foodNodes.length < list.length) {
                        const ref = createBolusNode(tract.color);
                        paintBolus(ref);
                        tract.foodLayer.appendChild(ref.group);
                        tract.foodNodes.push(ref);
                    }
                    // Размер и цвет переставляются ЗДЕСЬ, а не в кадре: список
                    // еды меняется раз в несколько секунд, а кадров за это
                    // время сотни.
                    for (let i = 0; i < tract.foodNodes.length; i++) {
                        const ref = tract.foodNodes[i], b = list[i];
                        if (!b) continue;
                        const size = (b.size || 1) * state.digest.scale;
                        if (ref.size === size && !b.color) continue;
                        ref.size = size;
                        setAttr(ref.wall, 'rx', (size * 1.85).toFixed(1));
                        setAttr(ref.wall, 'ry', (size * 1.4).toFixed(1));
                        setAttr(ref.body, 'rx', (size * 1.4).toFixed(1));
                        setAttr(ref.body, 'ry', size.toFixed(1));
                        setAttr(ref.shine, 'rx', (size * 0.52).toFixed(1));
                        setAttr(ref.shine, 'ry', (size * 0.3).toFixed(1));
                        setAttr(ref.shine, 'cx', (size * 0.36).toFixed(1));
                        setAttr(ref.shine, 'cy', (-size * 0.42).toFixed(1));
                        setAttr(ref.chunkA, 'rx', (size * 0.42).toFixed(1));
                        setAttr(ref.chunkA, 'ry', (size * 0.34).toFixed(1));
                        setAttr(ref.chunkA, 'cx', (-size * 0.5).toFixed(1));
                        setAttr(ref.chunkA, 'cy', (size * 0.24).toFixed(1));
                        setAttr(ref.chunkB, 'rx', (size * 0.3).toFixed(1));
                        setAttr(ref.chunkB, 'ry', (size * 0.26).toFixed(1));
                        setAttr(ref.chunkB, 'cx', (size * 0.44).toFixed(1));
                        setAttr(ref.chunkB, 'cy', (size * 0.3).toFixed(1));
                        // Перетяжка стоит позади комка: он движется вдоль
                        // +X собственной системы (её задаёт rotate по
                        // направлению кишки), значит «сзади» — это −X.
                        setAttr(ref.pinch, 'cx', (-size * 1.75).toFixed(1));
                        setAttr(ref.pinch, 'rx', (size * 0.42).toFixed(1));
                        setAttr(ref.pinch, 'ry', (size * 1.35).toFixed(1));
                        if (b.color) { ref.base.body = b.color; setAttr(ref.body, 'fill', witherPaint(b.color)); }
                    }
                    // Комки едут покадрово (updateFood), но первый кадр после
                    // смены списка рисуем сразу: иначе новый комок появится
                    // в точке предыдущего.
                    updateFood(0);
                }

                // Наполненный желудок слегка раздувается — но остаётся
                // желудком, а не превращается в шар. Узел ищется один раз на
                // сборку тела: querySelector по семи сотням узлов пятнадцать
                // раз в секунду — ровно та мелочь, из которой складываются
                // потерянные кадры.
                if (state.stomachContent === undefined && state.built && state.built.root) {
                    state.stomachContent = state.built.root.querySelector('.worm-stomach-content') || null;
                }
                const content = state.stomachContent;
                if (content) {
                    const fill = state.digest.stomachFill;
                    const fx = parseFloat(content.getAttribute('data-full-rx')) || 0;
                    const fy = parseFloat(content.getAttribute('data-full-ry')) || 0;
                    setAttr(content, 'rx', (fx * fill).toFixed(1));
                    setAttr(content, 'ry', (fy * fill).toFixed(1));
                }
            },

            // ---------- ЧТО ЛЕЖИТ НА ПОЛУ ----------
            // Комната принадлежит рендереру, поэтому и предметы в ней рисует
            // он: тогда они живут в тех же координатах и получают ту же
            // перспективу, что и персонаж.
            setRoomObjects(list) {
                const layer = objectLayer;
                if (!layer) return;
                while (layer.firstChild) layer.removeChild(layer.firstChild);

                state.roomObjects = (list || []).filter(o => o.x != null && o.y != null);
                state.roomObjects.forEach(obj => {
                    const depthScale = (opts.room && state.room)
                        ? roomCharScaleAt(roomDepthAt(state.room, obj.y)) : 1;
                    const g = buildPoopNode(obj, depthScale);
                    setAttr(g, 'data-poop-id', obj.id);
                    g.style.cursor = 'pointer';

                    // Обработчик висит на самом предмете, а не считает
                    // попадание по координатам. Разница видна, когда червь
                    // стоит над кучкой: событие достаётся ему, и убрать
                    // кучку нельзя, пока он не отойдёт. Так и задумано —
                    // тело физически загораживает пол, а тап по самому
                    // червю в будущем станет способом с ним повозиться.
                    g.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        if (typeof opts.onRoomObjectTap === 'function') opts.onRoomObjectTap(obj.id);
                    });
                    layer.appendChild(g);
                });
            },
            // Прямой доступ к SVG для точечных вещей (хит-тест по конкретной
            // части, разовая подстройка стиля мини-игрой). Ищи части по
            // '[data-part="tail"]', '[data-part="belly"]' и т.п.
            svgRoot: svg,
            getMergedModel: mergedModel,

            // ---------- ПАУЗА ----------
            // Остановить кадровый цикл, не разбирая персонажа.
            //
            // Зачем: у рендерера уже есть проверка «сцену не видно» (см.
            // isStageVisible), но она ловит только спрятанное стилями или
            // выкинутое из документа. Персонаж главного экрана под ОТКРЫТОЙ
            // мини-игрой по всем признакам виден — его просто закрыли сверху
            // непрозрачным окном. И он продолжает считать кадры: на медленном
            // телефоне в бою гнева это третий живой червь поверх двух бойцов.
            //
            // Метка времени сбрасывается, иначе после паузы dt окажется равным
            // всей паузе и персонаж прыгнет.
            // Частота пересчёта персонажа НА ХОДУ. Мини-игра знает то, чего
            // не знает рендерер: сейчас червь — герой кадра или фон за
            // хвостом. Замер на айфоне: в ванной на наезде живой персонаж
            // стоил 36 кадров из 60, а замерший — ноль.
            setFrameHz(hz) {
                opts.frameHz = (hz > 0) ? hz : 0;
            },

            setPaused(paused) {
                if (paused) {
                    if (state.rafId) {
                        cancelAnimationFrame(state.rafId);
                        state.rafId = null;
                    }
                } else if (!state.rafId) {
                    state.lastFrameTs = 0;
                    // Метки времени кадра и деформации тоже сбрасываются:
                    // иначе первый же кадр после паузы получит dt длиной во
                    // всю паузу, и дыхание с вилянием прыгнут вперёд.
                    state.rafPrevTs = null;
                    state.lastGeomTs = null;
                    state.geomDirty = true;
                    state.rafId = requestAnimationFrame(tick);
                }
            },

            destroy() {
                if (state.rafId) cancelAnimationFrame(state.rafId);
                window.removeEventListener('resize', onResize);
                svg.removeEventListener('pointerdown', onStageDown);
                svg.removeEventListener('pointermove', onStageMove);
                svg.removeEventListener('pointerup', onStageUp);
                svg.removeEventListener('pointercancel', onStageUp);
                container.innerHTML = '';
            }
        };
    }
};

window.WormRenderer = WormRenderer;
