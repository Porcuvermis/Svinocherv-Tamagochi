// ================= ЧЕРВЬ: ГДЕ СТОЯТЬ, КАМЕРА, ХОДЬБА =================
// Кусок монтажа (WormRenderer.mount): границы прогулки по габариту тела,
// камера комнаты, свайп или тап по сцене, walkTo. Слушатели пальца вешаются
// здесь же, при вызове; снимает их destroy() в handle.
//
// Текст перенесён из mount как есть и обёрнут в функцию: зависимости от
// экземпляра приходят параметром, наружу отдаются объявленные здесь имена.
function attachWormWalk({ opts, state, svg, worldLayer }) {
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

    return { measureBody, bodyFootprint, refreshWanderRange, clampFloorPoint, setCam, followCam, toRoom, onStageDown, onStageMove, onStageUp, walkTo };
}
