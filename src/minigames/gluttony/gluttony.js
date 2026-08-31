// ================= МИНИ-ИГРА ГРЕХ ЧРЕВОУГОДИЯ: КУХНЯ =================
// Кухня одной картинкой, интерфейс диегетический: игрок пользуется
// предметами, а не меню (docs/plan/20-gluttony-kitchen.md).
//
// ---------- ДВА СЛОЯ ----------
// Кухня живёт в координатах СЦЕНЫ 900×1948, по ней ездит камера. Доска и нож
// живут в координатах ЭКРАНА 390×844 и камере не подчиняются: доска — предмет,
// который игрок держит перед собой, она ближе камеры. Отсюда весь ход игры
// читается как одно непрерывное движение по кухне, а не как смена картинок:
// доска въезжает из-за края, набирается продуктами, уезжает, снова въезжает
// уже на столе для нарезки, потом поднимается к плите.
//
// ---------- ПОРЯДОК ----------
//   общий вид
//     → тап по холодильнику: открылся, снизу-справа въехала доска
//     → продукты ПЕРЕТАСКИВАЮТ с полок на доску (по одному каждого типа)
//     → удержание на доске: кольцо заполняется, доска уезжает
//     → стол: та же доска въезжает с продуктами, режут ВСЕ СРАЗУ ножом
//     → доску тянут вверх: она уходит к плите
//     → плита: жидкость держат над кастрюлей и льют, кучки кидают внутрь
//     → зум на кастрюлю, мешают слева направо
//     → кастрюлю тянут вниз: приходит червь, дальше кормёжка
//
// ---------- ЧТО РЕШАЕТ НАГРАДУ ----------
// Мини-игра ничего не начисляет (инвариант 2): сообщает в meta, сколько
// РАЗНЫХ типов попало в кастрюлю и была ли жидкость крепче воды, а таблицу
// качества держит KITCHEN.quality.

const GluttonyMinigame = {
    screenElement: null,
    win: null,
    svgEl: null,
    camEl: null,
    fgEl: null,

    // ---------- НАСТРОЙКИ КОРМЛЕНИЯ (не менялись) ----------
    MAX_DY: 90,
    MAX_ANGLE: 55,
    POUR_THRESHOLD_ANGLE: 28,
    FEED_RATE_PER_SEC: 14,
    DROP_INTERVAL: 140,

    HOLD_MS: 900,          // сколько держать доску, чтобы уйти на нарезку
    CHOPS_TOTAL: 12,       // взмахов на полную нарезку: 6 до крупных, 6 до мелких
    // Лезвие смотрит ВЛЕВО, а положительный поворот в SVG — по часовой, то
    // есть левый конец идёт ВВЕРХ. Поэтому поднятый нож — это ПЛЮС, а не
    // минус. В первой версии знаки были перепутаны, и свайп вверх опускал
    // нож — управление читалось сломанным.
    KNIFE_UP: 44,          // лезвие поднято
    // Не «лежит плашмя», а слегка носом вниз: в нижней точке лезвие обязано
    // ВОЙТИ в продукты. Плоский нож на этой же высоте выглядел парящим над
    // доской, и удар не читался ударом.
    KNIFE_DOWN: -6,
    KNIFE_SENS: 0.38,      // градусов на пиксель пальца: весь размах ≈ 130 px
    STIR_SWINGS: 6,
    HINT_DELAY: 1500,

    // Куда приползает червь — центр коврика В КООРДИНАТАХ СЦЕНЫ. Одно число
    // на всю раскладку кормёжки: подвинули коврик в картинке — кормёжка
    // переехала следом, код не трогаем.
    FEED_SPOT: { x: 450, y: 2246 },

    // ---------- НАЛИВ ----------
    // Считается от ВРЕМЕНИ, а не от числа событий указателя: раньше уровень
    // рос на каждый pointermove, поэтому на быстром экране кастрюля
    // наполнялась вдвое быстрее, чем на медленном, а если держать сосуд
    // неподвижно — не наполнялась вовсе.
    POUR_FULL: 60,           // уровень, при котором жидкость засчитана
    POUR_RATE_PER_SEC: 32,   // ≈1.9 с на полную кастрюлю

    // ---------- СОСТОЯНИЕ СЕССИИ ----------
    phase: 'overview',     // overview | fridge | chop | stove | potzoom | feed
    onBoard: [],           // [{ key, type, el, ghost }] — что лежит на доске
    chops: 0,
    knifeAngle: 0,
    knifeArmed: false,     // нож поднимали — значит следующий спуск режет
    liquid: null,
    inPot: [],
    stirSwings: 0,
    drag: null,
    piles: [],

    feedDragging: false,
    feedStartY: 0,
    feedDy: 0,
    feedAngle: 0,
    feedTargetAngle: 0,
    feedProgress: 0,
    feedFinished: false,
    feedLastDropTime: 0,
    feedRafId: null,
    feedLastTick: null,
    feedMarkupReady: false,

    // ================= ЖИЗНЕННЫЙ ЦИКЛ =================
    init() {
        this.screenElement = document.getElementById('gluttony-game');
        if (!this.screenElement) return;

        if (typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'gluttony',
                onLeave: () => this.close(),
                canLeave: () => this.phase === 'overview' || this.feedFinished
            });
        }

        this.svgEl = document.getElementById('kt-svg');
        this.camEl = document.getElementById('kt-cam');
        this.fgEl = document.getElementById('kt-fg');
        this.stageFeed = document.getElementById('glut-stage-feed');
        this.feedSceneEl = this.stageFeed ? this.stageFeed.querySelector('.glut-feed-scene') : null;
        this.pourLayer = document.getElementById('glut-pour-layer');
        this.gaugeBar = document.getElementById('glut-gauge-bar');
        this.winOverlay = document.getElementById('glut-win-overlay');
        this.resultEl = document.getElementById('kt-result');

        this.camEl.innerHTML = KITCHEN_ART.scene();
        this.fgEl.innerHTML = KITCHEN_ART.foreground();

        this.svgEl.addEventListener('pointerdown', (e) => this.onDown(e));
        window.addEventListener('pointermove', (e) => this.onMove(e));
        window.addEventListener('pointerup', (e) => this.onUp(e));
        window.addEventListener('pointercancel', (e) => this.onUp(e));
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.resetAll();
    },

    close() {
        this.stopFeedTick();
        this.stopPour();
        this.stopWormWalk();
        clearTimeout(this._hintTimer);
        this.screenElement.classList.remove('active');
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');
    },

    resetAll() {
        this.phase = 'overview';
        this.locked = false;
        this.onBoard = [];
        this.chops = 0;
        this.knifeAngle = 0;
        this.knifeArmed = false;
        this.liquid = null;
        this.pourLevel = 0;
        this.stopPour();
        this.inPot = [];
        this.piles = [];
        this.stirSwings = 0;
        this.drag = null;
        this.feedFinished = false;
        this.feedProgress = 0;

        if (this.stageFeed) this.stageFeed.classList.remove('active');
        if (this.svgEl) this.svgEl.style.display = '';
        this.stopWormWalk();
        this.setOpacity('kt-pot', 1);
        if (this.tiltBucket) this.tiltBucket.style.opacity = '';
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');

        this.el('kt-loose').innerHTML = '';
        this.el('kt-board-items').innerHTML = '';
        this.el('kt-fridge').classList.remove('open');
        this.setAttr('kt-pot-fill', { height: 0, y: 772 });
        this.setOpacity('kt-flame', 0);
        this.setOpacity('kt-steam', 0);
        this.setOpacity('kt-spoon', 0);
        this.setOpacity('kt-knife', 0);
        this.el('kt-knife').classList.remove('kt-done');
        this.el('kt-knife').removeAttribute('pointer-events');
        this.setOpacity('kt-board-rest', 0);
        this.setAttr('kt-pour', { opacity: 0, d: '' });
        this.el('kt-board-rest').innerHTML = KITCHEN_ART.boardRest();
        this.moveTo(this.el('kt-board-rest'), KITCHEN_ART.SLOTS.boardRest);
        this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.hidden);
        this.buildBottles();
        this.setCamera('overview', true);
        this.touched();
    },

    // ================= МЕЛОЧИ =================
    el(id) { return document.getElementById(id); },

    setAttr(id, attrs) {
        const node = this.el(id);
        if (!node) return;
        Object.keys(attrs).forEach(k => node.setAttribute(k, attrs[k]));
    },

    setOpacity(id, v) {
        const node = this.el(id);
        if (!node) return;
        node.setAttribute('opacity', v);
        // Мерцание огня и подъём пара — кейфреймы, и они сами правят
        // прозрачность. Поэтому включаются классом, а не только атрибутом.
        node.classList.toggle('on', !!v);
    },

    moveTo(node, pt, rot, scale) {
        if (!node) return;
        node.setAttribute('transform',
            `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})` +
            (rot ? ` rotate(${rot})` : '') +
            (scale && scale !== 1 ? ` scale(${scale})` : ''));
    },

    pop(node) {
        if (!node) return;
        node.classList.remove('kt-pop');
        void node.getBoundingClientRect();
        node.classList.add('kt-pop');
        setTimeout(() => node.classList.remove('kt-pop'), 300);
    },

    shake(node) {
        if (!node) return;
        node.classList.remove('kt-lack');
        void node.getBoundingClientRect();
        node.classList.add('kt-lack');
        setTimeout(() => node.classList.remove('kt-lack'), 340);
    },

    // ================= КАМЕРА =================
    setCamera(name, instant) {
        const f = KITCHEN_ART.FOCUS[name] || KITCHEN_ART.FOCUS.overview;
        const s = Math.min(390 / f.w, 844 / f.h);
        const tx = 195 - s * (f.x + f.w / 2);
        const ty = 422 - s * (f.y + f.h / 2);
        if (instant) this.camEl.style.transition = 'none';
        this.camEl.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`);
        if (instant) {
            void this.camEl.getBoundingClientRect();
            this.camEl.style.transition = '';
        }
    },

    // Экранные координаты → координаты СЦЕНЫ (для того, что внутри камеры).
    toScene(e) {
        const pt = this.svgEl.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = this.camEl.getScreenCTM();
        if (!m) return { x: 0, y: 0 };
        const p = pt.matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    },

    // Экранные координаты → координаты СТЕЙДЖА (для переднего плана).
    toStage(e) {
        const pt = this.svgEl.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = this.svgEl.getScreenCTM();
        if (!m) return { x: 0, y: 0 };
        const p = pt.matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    },

    // ================= УКАЗАТЕЛЬ =================
    touched() {
        this.setOpacity('kt-hint', 0);
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => this.showHint(), this.HINT_DELAY);
    },

    // Одна таблица на всю игру. Если шаг некуда показать — значит шага нет, и
    // это видно здесь, а не выясняется на живом игроке.
    nextStep() {
        const S = KITCHEN_ART.SLOTS, F = KITCHEN_ART.FG;
        if (this.phase === 'overview') return { at: { x: 155, y: 800 } };

        if (this.phase === 'fridge') {
            if (this.onBoard.length) {
                return { stage: true, at: F.board.fridge, dragTo: { x: 372, y: F.board.fridge.y } };
            }
            const first = Array.from(this.el('kt-loose').children).find(n => n.dataset.where === 'fridge');
            if (first) {
                return { at: this.nodePos(first), toStage: F.board.fridge };
            }
            return null;
        }

        if (this.phase === 'chop') {
            if (this.chops < this.CHOPS_TOTAL) {
                return { stage: true, at: { x: F.knife.x - 60, y: F.knife.y }, swipe: 'v' };
            }
            return { stage: true, at: F.board.chop, dragTo: { x: 195, y: 120 } };
        }

        if (this.phase === 'stove') {
            if (!this.liquid) {
                const bottle = this.el('kt-bottles').querySelector('.kt-bottle:not([data-empty])');
                return { at: bottle ? this.nodePos(bottle) : S.hose, to: S.pot };
            }
            if (this.piles.length) return { at: this.nodePos(this.piles[0].el), to: S.pot };
            return null;
        }

        if (this.phase === 'potzoom') {
            if (this.stirSwings < this.STIR_SWINGS) return { at: S.spoon, swipe: 'h' };
            return { at: S.pot, to: { x: S.pot.x, y: S.pot.y + 300 } };
        }
        return null;
    },

    nodePos(node) {
        const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(node.getAttribute('transform') || '');
        return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
    },

    // Указатель переехал в передний план, поэтому переводить надо в другую
    // сторону: точки сцены (полки, кастрюля, кран) — в координаты стейджа.
    sceneToStage(pt) {
        const m = this.camEl.getScreenCTM();
        const sm = this.svgEl.getScreenCTM();
        if (!m || !sm) return pt;
        const p = this.svgEl.createSVGPoint();
        p.x = pt.x; p.y = pt.y;
        const screen = p.matrixTransform(m);
        const back = this.svgEl.createSVGPoint();
        back.x = screen.x; back.y = screen.y;
        return back.matrixTransform(sm.inverse());
    },

    // Точка стейджа → CSS-пиксели слоя персонажа. Мерить через getScreenCTM
    // обязательно: кухня вписана в рамку окна с обрезкой (slice), поэтому
    // единицы svg и пиксели слоя не совпадают и зависят от формы окна. Плюс
    // весь холст ещё и отмасштабирован (--stage-scale) — на это делится k.
    stageToWorm(pt) {
        const host = this.wormStageEl;
        const sm = this.svgEl && this.svgEl.getScreenCTM();
        if (!host || !sm) return pt;
        const r = host.getBoundingClientRect();
        const k = (r.width / (host.clientWidth || r.width)) || 1;
        const p = this.svgEl.createSVGPoint();
        p.x = pt.x; p.y = pt.y;
        const screen = p.matrixTransform(sm);
        return { x: (screen.x - r.left) / k, y: (screen.y - r.top) / k };
    },

    sceneToWorm(pt) { return this.stageToWorm(this.sceneToStage(pt)); },

    showHint() {
        if (this.drag || this.locked || this.phase === 'feed') return;
        const step = this.nextStep();
        const hint = this.el('kt-hint');
        if (!step || !hint) return;

        const at = step.stage ? step.at : this.sceneToStage(step.at);
        this.moveTo(this.el('kt-hint-ring'), at);
        const line = this.el('kt-hint-line');

        let to = null;
        if (step.to) to = this.sceneToStage(step.to);
        else if (step.toStage) to = step.toStage;
        else if (step.dragTo) to = step.dragTo;

        if (to) {
            // Дуга выгибается ПЕРПЕНДИКУЛЯРНО переносу и тем сильнее, чем он
            // длиннее. Раньше горб всегда задирался вверх на 140: короткий
            // перенос вправо (доска на нарезку) выгибался чуть не через весь
            // экран и читался как «тащи вверх».
            const dx = to.x - at.x, dy = to.y - at.y;
            const len = Math.hypot(dx, dy) || 1;
            const bow = Math.min(70, len * 0.3);
            const mx = (at.x + to.x) / 2 - (dy / len) * bow;
            const my = (at.y + to.y) / 2 - (dx / len) * bow;
            line.setAttribute('d', `M${at.x} ${at.y} Q${mx} ${my} ${to.x} ${to.y}`);
        } else if (step.swipe === 'v') {
            line.setAttribute('d', `M${at.x} ${at.y - 100} V${at.y + 100}`);
        } else if (step.swipe === 'h') {
            line.setAttribute('d', `M${at.x - 100} ${at.y} H${at.x + 100}`);
        } else {
            line.setAttribute('d', '');
        }
        this.setOpacity('kt-hint', 1);
    },

    // ================= ХОЛОДИЛЬНИК =================
    openFridge() {
        this.phase = 'fridge';
        this.setCamera('fridge');
        this.el('kt-fridge').classList.add('open');
        // Доска въезжает снизу-справа ПОСЛЕ открытия: сначала игрок видит,
        // что холодильник открылся, и только потом — куда класть.
        setTimeout(() => {
            this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.fridge);
        }, 260);
        setTimeout(() => this.fillShelves(), 220);
        this.touched();
    },

    // Закрыть можно тапом по открытой дверце — так же, как открывали.
    closeFridge() {
        this.el('kt-fridge').classList.remove('open');
        this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.hidden);
        Array.from(this.el('kt-loose').children).forEach(n => {
            if (n.dataset.where === 'fridge') n.remove();
        });
        // Всё, что успели положить, возвращается: игрок закрыл холодильник,
        // значит передумал готовить, а не потерял продукты.
        this.el('kt-board-items').innerHTML = '';
        this.onBoard = [];
        this.phase = 'overview';
        this.setCamera('overview');
        this.touched();
    },

    fillShelves() {
        const loose = this.el('kt-loose');
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const S = KITCHEN_ART.SLOTS;
        const rows = { meat: 0, veg: 0, spice: 0 };

        Object.keys(KITCHEN.ingredients).forEach(key => {
            const item = KITCHEN.ingredients[key];
            const count = item.infinite ? Infinity : (pantry[key] || 0);
            if (!item.infinite && count <= 0) return;

            // Полка своя у каждого типа: мясо сверху, овощи в середине,
            // зелень внизу. Устройство холодильника читается с одного взгляда.
            const spot = item.frozen
                ? S.freezer
                : { x: S.shelfX[rows[item.type] % 3], y: S.shelfY[item.type] };
            if (!item.frozen) rows[item.type]++;

            const g = this.spawnItem(key, spot, 0.52, loose);
            g.dataset.home = JSON.stringify(spot);
            g.dataset.where = 'fridge';
            g.dataset.type = item.type;
            if (!item.infinite) this.setCount(g, count);
        });
    },

    setCount(g, n) {
        let label = g.querySelector('.kt-count');
        if (!label) {
            label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('class', 'kt-count');
            label.setAttribute('x', '0');
            label.setAttribute('y', '82');
            g.appendChild(label);
        }
        label.textContent = n;
    },

    spawnItem(key, spot, scale, host) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'kt-item');
        g.dataset.key = key;
        g.dataset.seed = String(Math.floor(Math.random() * 1e6));
        g.innerHTML = KITCHEN_ART.ingredient(key, +g.dataset.seed);
        this.moveTo(g, spot, 0, scale || 1);
        g.dataset.scale = String(scale || 1);
        (host || this.el('kt-loose')).appendChild(g);
        return g;
    },

    // ================= ДОСКА =================
    // Что уже лежит: по одному продукту каждого типа. Пищеблок — сам по себе
    // и ни с чем не сочетается: он и есть «еды нет», а не ингредиент.
    canPutOnBoard(key) {
        const type = KITCHEN.ingredients[key].type;
        if (this.onBoard.some(o => o.type === 'block')) return false;
        if (type === 'block') return this.onBoard.length === 0;
        return !this.onBoard.some(o => o.type === type);
    },

    putOnBoard(key, ghostNode) {
        const F = KITCHEN_ART.FG;
        const slot = F.slots[this.onBoard.length] || F.slots[0];
        const g = this.spawnItem(key, slot, 0.62, this.el('kt-board-items'));
        g.dataset.where = 'board';
        g.dataset.type = KITCHEN.ingredients[key].type;
        this.onBoard.push({ key, type: g.dataset.type, el: g, ghost: ghostNode });
        // На полке остаётся силуэт: видно, ЧТО взяли и что это можно вернуть.
        if (ghostNode) {
            ghostNode.dataset.where = 'ghost';
            ghostNode.innerHTML = KITCHEN_ART.ghost(key, +ghostNode.dataset.seed);
            const pantry = (GameState.data && GameState.data.pantry) || {};
            this.setCount(ghostNode, Math.max(0, (pantry[key] || 0) - 1));
        }
        this.touched();
        return g;
    },

    // Передумал — тащим обратно, силуэт снова становится продуктом.
    takeOffBoard(entry) {
        const i = this.onBoard.indexOf(entry);
        if (i !== -1) this.onBoard.splice(i, 1);
        entry.el.remove();
        if (entry.ghost) {
            entry.ghost.dataset.where = 'fridge';
            entry.ghost.innerHTML = KITCHEN_ART.ingredient(entry.key, +entry.ghost.dataset.seed);
            const pantry = (GameState.data && GameState.data.pantry) || {};
            this.setCount(entry.ghost, pantry[entry.key] || 0);
        }
        // Остальные подвигаются в свои гнёзда: дырки в ряду читаются потерей.
        this.onBoard.forEach((o, n) => this.moveTo(o.el, KITCHEN_ART.FG.slots[n], 0, 0.62));
        this.touched();
    },

    // ================= НАРЕЗКА =================
    goToChop() {
        this.phase = 'chop';
        this.el('kt-fridge').classList.remove('open');
        Array.from(this.el('kt-loose').children).forEach(n => n.remove());
        // Доска уезжает вниз, камера переезжает к столу, и та же доска
        // въезжает уже там: движение непрерывно, сцена не «прыгает».
        this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.hidden);
        this.setCamera('chop');
        setTimeout(() => {
            this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.chop);
            this.el('kt-knife').classList.remove('kt-done');
            this.el('kt-knife').removeAttribute('pointer-events');
            this.setOpacity('kt-knife', 1);
            this.moveTo(this.el('kt-knife'), KITCHEN_ART.FG.knife);
            this.setKnifeAngle(this.KNIFE_UP);
            this.touched();
        }, 520);
    },

    // Спрятать нож совсем. Класс .kt-done снимается обязательно: у него в
    // стилях своя прозрачность, и она перебивает атрибут opacity — из-за
    // этого отработавший нож оставался висеть призраком поверх плиты.
    hideKnife() {
        const knife = this.el('kt-knife');
        knife.classList.remove('kt-done');
        knife.removeAttribute('pointer-events');
        this.setOpacity('kt-knife', 0);
    },

    setKnifeAngle(a) {
        this.knifeAngle = Math.max(this.KNIFE_DOWN, Math.min(this.KNIFE_UP, a));
        const arm = this.el('kt-knife-arm');
        if (arm) arm.setAttribute('transform', `rotate(${this.knifeAngle.toFixed(1)})`);
    },

    // Один надрез = полный размах: поднять нож доверху и опустить донизу.
    // Одного движения вниз мало — иначе можно было бы «дрожать» у доски и
    // нарезать всё за секунду.
    knifeStep(angle) {
        this.setKnifeAngle(angle);
        if (this.knifeAngle >= this.KNIFE_UP - 6) { this.knifeArmed = true; return; }
        if (this.knifeAngle <= this.KNIFE_DOWN + 4 && this.knifeArmed) {
            this.knifeArmed = false;
            this.chopOnce();
        }
    },

    chopOnce() {
        if (this.chops >= this.CHOPS_TOTAL) return;
        this.chops++;
        this.el('kt-board').classList.remove('kt-cut');
        void this.el('kt-board').getBoundingClientRect();
        this.el('kt-board').classList.add('kt-cut');

        // Половина взмахов — крупные куски, вторая половина — мелкие.
        const stage = this.chops >= this.CHOPS_TOTAL ? 2
            : (this.chops >= this.CHOPS_TOTAL / 2 ? 1 : 0);
        if (stage > 0) this.renderChopped(stage);
        if (this.chops >= this.CHOPS_TOTAL) this.parkKnife();
    },

    // Нож отработал: сам ложится на стол рядом с доской. Пока он едет, ввод
    // отобран — иначе игрок продолжает возить пальцем по уже нарезанному и не
    // понимает, кончился этап или нет.
    parkKnife() {
        const knife = this.el('kt-knife');
        this.locked = true;
        this.drag = null;
        knife.classList.add('kt-done');
        knife.setAttribute('pointer-events', 'none');
        this.setKnifeAngle(this.KNIFE_UP);
        this.moveTo(knife, KITCHEN_ART.FG.knifeRest, 0);
        setTimeout(() => {
            // Нож ложится плашмя: он больше не инструмент, а предмет на столе.
            this.el('kt-knife-arm').setAttribute('transform', 'rotate(8)');
            this.locked = false;
            this.touched();
        }, 520);
    },

    // Все ингредиенты режутся ВМЕСТЕ и в одну кучу: цвет кусков берётся из
    // типов, которые лежат на доске, поэтому по куче видно состав блюда.
    renderChopped(stage) {
        const items = this.el('kt-board-items');
        const keys = this.onBoard.map(o => o.key);
        items.innerHTML = '';
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'kt-item');
        g.dataset.where = 'chopped';
        g.innerHTML = KITCHEN_ART.chopped(keys, stage, 17);
        this.moveTo(g, { x: 0, y: -4 }, 0, 0.7);
        g.dataset.scale = '0.7';
        items.appendChild(g);
    },

    // ================= ПЛИТА =================
    goToStove() {
        this.phase = 'stove';
        // Доска уходит вверх и встаёт на столешницу слева от плиты — там же,
        // где игрок её и оставил бы.
        this.moveTo(this.el('kt-board'), { x: 195, y: -220 });
        // Нож остаётся в переднем плане и камере не подчиняется, поэтому его
        // надо убрать руками: иначе он висит поперёк плиты весь остаток игры.
        this.hideKnife();
        this.setCamera('stove');
        this.setOpacity('kt-flame', 1);
        setTimeout(() => {
            this.setOpacity('kt-board-rest', 1);
            this.spawnPiles();
            this.touched();
        }, 420);
    },

    // Нарезанное перекладывается с доски на столешницу отдельными кучками:
    // их и будут кидать в кастрюлю по одной.
    spawnPiles() {
        const S = KITCHEN_ART.SLOTS;
        this.el('kt-board-items').innerHTML = '';
        this.piles = this.onBoard.map((o, i) => {
            const spot = { x: S.boardRest.x - 40 + i * 40, y: S.boardRest.y - 20 };
            const g = this.spawnItem(o.key, spot, 0.5, this.el('kt-loose'));
            g.innerHTML = KITCHEN_ART.chopped([o.key], 2, 31 + i);
            g.dataset.where = 'pile';
            return { key: o.key, el: g };
        });
    },

    buildBottles() {
        const host = this.el('kt-bottles');
        if (!host) return;
        host.innerHTML = '';
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const spots = KITCHEN_ART.SLOTS.bottles;
        let i = 0;
        Object.keys(KITCHEN.liquids).forEach(key => {
            if (KITCHEN.liquids[key].tap) return;   // вода — это кран, не бутыль
            const spot = spots[i] || spots[0];
            const empty = !(pantry[key] > 0);
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'kt-bottle');
            g.dataset.key = key;
            g.innerHTML = KITCHEN_ART.bottle(key, empty);
            if (empty) g.dataset.empty = '1';
            g.dataset.home = JSON.stringify(spot);
            g.dataset.scale = String(spot.s);
            this.moveTo(g, spot, 0, spot.s);
            host.appendChild(g);
            i++;
        });
    },

    // Зона кастрюли нарочно ВЫШЕ неё: жидкость держат НАД кастрюлей и льют,
    // а не вставляют внутрь. Так это и делают руками.
    overPot(p) {
        const z = KITCHEN_ART.SLOTS.potZone;
        return p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h;
    },

    // Пока сосуд держат над кастрюлей — течёт струя и уровень растёт. Не
    // «отпустил и появилось»: наливание должно занимать время и быть видно.
    startPour(key, from) {
        if (this.liquid) return;
        this.pouring = { key, from };
        const ramp = PALETTE.kitchen[key] || PALETTE.kitchen.water;
        this.setAttr('kt-pot-fill', { fill: ramp[500] });
        this.setAttr('kt-pour', { opacity: 1, stroke: ramp[300] });
        // Уровень набирает отдельный кадровый цикл, а не события указателя:
        // держать сосуд над кастрюлей неподвижно — тоже наливать.
        this.pourLastTick = null;
        if (!this.pourRafId) this.pourRafId = requestAnimationFrame(t => this.pourTick(t));
    },

    pourTick(now) {
        if (!this.pouring) { this.pourRafId = null; this.pourLastTick = null; return; }
        if (!this.pourLastTick) this.pourLastTick = now;
        const dt = Math.min(0.1, (now - this.pourLastTick) / 1000);
        this.pourLastTick = now;

        this.pourLevel = Math.min(this.POUR_FULL,
            (this.pourLevel || 0) + this.POUR_RATE_PER_SEC * dt);
        this.updatePotLevel();
        if (this.pourLevel >= this.POUR_FULL && !this.liquid) {
            this.liquid = this.pouring.key;
            this.setOpacity('kt-steam', 1);
            this.touched();
        }
        this.pourRafId = requestAnimationFrame(t => this.pourTick(t));
    },

    // Событие указателя двигает только струю: где носик — там и её начало.
    updatePour(from) {
        if (!this.pouring) return;
        const S = KITCHEN_ART.SLOTS;
        this.setAttr('kt-pour', { d: `M${from.x} ${from.y} Q${from.x} ${(from.y + 620) / 2} ${S.pot.x} 640` });
    },

    stopPour() {
        this.pouring = null;
        if (this.pourRafId) { cancelAnimationFrame(this.pourRafId); this.pourRafId = null; }
        this.pourLastTick = null;
        this.setAttr('kt-pour', { opacity: 0, d: '' });
    },

    updatePotLevel() {
        const fill = this.el('kt-pot-fill');
        if (!fill) return;
        const h = Math.min(140, (this.pourLevel || 0) + this.inPot.length * 22);
        fill.setAttribute('height', h.toFixed(1));
        fill.setAttribute('y', (772 - h).toFixed(1));
    },

    dropInPot(entry) {
        const i = this.piles.indexOf(entry);
        if (i !== -1) this.piles.splice(i, 1);
        this.inPot.push(entry.key);
        entry.el.dataset.where = 'pot';
        this.moveTo(entry.el, KITCHEN_ART.SLOTS.pot, 0, 0.3);
        entry.el.style.opacity = '0';
        setTimeout(() => entry.el.remove(), 420);
        this.updatePotLevel();
        this.touched();

        if (!this.piles.length && this.liquid) setTimeout(() => this.goToPotZoom(), 500);
    },

    // ================= ПОМЕШИВАНИЕ =================
    // Отдельный наезд на кастрюлю: мешать вслепую сбоку экрана неудобно, и
    // движение ложки должно быть видно целиком.
    goToPotZoom() {
        this.phase = 'potzoom';
        this.setCamera('pot');
        setTimeout(() => {
            this.setOpacity('kt-spoon', 1);
            this.moveTo(this.el('kt-spoon'), KITCHEN_ART.SLOTS.spoon);
            this.touched();
        }, 420);
    },

    // Мешают СЛЕВА НАПРАВО: это движение по кругу в кастрюле, а не рубка.
    stirStep(dx) {
        const spoon = this.el('kt-spoon-body');
        if (spoon) spoon.setAttribute('transform', `rotate(${(dx > 0 ? 20 : -20)})`);
        this.stirSwings++;
        if (this.stirSwings < this.STIR_SWINGS) return;
        this.setOpacity('kt-spoon', 0);
        this.touched();
    },

    // ================= ВВОД =================
    // Один обработчик на всю сцену: что взяли, решает предмет под пальцем.
    onDown(e) {
        if (this.phase === 'feed' || this.locked) return;
        this.touched();

        const t = e.target;
        const item = t.closest ? t.closest('g.kt-item') : null;
        const bottle = t.closest ? t.closest('g.kt-bottle') : null;
        const inId = (id) => !!(t.closest && t.closest('#' + id));

        if (this.phase === 'overview') {
            this.pop(this.el('kt-fridge'));
            this.openFridge();
            return;
        }

        if (this.phase === 'fridge') {
            // Продукт БЕРУТ И ТАЩАТ, а не тапают: тап ничего не сообщает о
            // том, куда предмет денется, а перетаскивание показывает это
            // само.
            if (item && item.dataset.where === 'fridge') { this.grabFromShelf(e, item); return; }
            if (item && item.dataset.where === 'board') {
                const entry = this.onBoard.find(o => o.el === item);
                if (entry) { this.grabFromBoard(e, entry); return; }
            }
            // Доску не держат, а ОТОДВИГАЮТ: во всей остальной игре переход
            // между этапами — это перенос доски или кастрюли, и удержание тут
            // выбивалось из ряда. Один жест на все переходы.
            if (inId('kt-board')) { this.startDrag(e, this.el('kt-board'), 'boardaway'); return; }
            // Тап по открытой дверце закрывает холодильник — тем же жестом,
            // которым открывали.
            if (inId('kt-door-main') || inId('kt-door-freezer')) { this.closeFridge(); return; }
            return;
        }

        if (this.phase === 'chop') {
            if (this.chops < this.CHOPS_TOTAL) {
                if (inId('kt-knife') || inId('kt-board')) {
                    e.preventDefault();
                    this.drag = { kind: 'knife', from: this.toStage(e), base: this.knifeAngle };
                }
                return;
            }
            if (inId('kt-board')) { this.startDrag(e, this.el('kt-board'), 'boardup'); return; }
            return;
        }

        if (this.phase === 'stove') {
            if (!this.liquid && inId('kt-hose')) { this.startDrag(e, this.el('kt-hose'), 'hose'); return; }
            if (!this.liquid && bottle && !bottle.dataset.empty) { this.pop(bottle); this.startDrag(e, bottle, 'bottle'); return; }
            if (!this.liquid && bottle) { this.shake(bottle); return; }
            if (item && item.dataset.where === 'pile') {
                if (!this.liquid) { this.shake(item); return; }
                this.pop(item);
                this.startDrag(e, item, 'pile');
            }
            return;
        }

        if (this.phase === 'potzoom') {
            if (this.stirSwings < this.STIR_SWINGS) {
                if (inId('kt-spoon') || inId('kt-pot')) {
                    e.preventDefault();
                    this.drag = { kind: 'stir', last: this.toScene(e).x };
                }
                return;
            }
            if (inId('kt-pot')) { this.startDrag(e, this.el('kt-pot'), 'potdown'); return; }
        }
    },

    // Продукт с полки: под пальцем он ПОДРАСТАЕТ, иначе прячется под ним же.
    grabFromShelf(e, node) {
        const key = node.dataset.key;
        if (!this.canPutOnBoard(key)) { this.shake(node); return; }
        const pantry = (GameState.data && GameState.data.pantry) || {};
        if (!KITCHEN.ingredients[key].infinite && !(pantry[key] > 0)) { this.shake(node); return; }
        e.preventDefault();

        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        ghost.setAttribute('class', 'kt-item kt-dragging');
        ghost.dataset.key = key;
        ghost.dataset.seed = node.dataset.seed;
        ghost.innerHTML = KITCHEN_ART.ingredient(key, +node.dataset.seed);
        this.fgEl.appendChild(ghost);
        this.moveTo(ghost, this.toStage(e), 0, 0.9);
        this.drag = { kind: 'shelf', node: ghost, key, source: node };
    },

    grabFromBoard(e, entry) {
        e.preventDefault();
        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        ghost.setAttribute('class', 'kt-item kt-dragging');
        ghost.dataset.key = entry.key;
        ghost.dataset.seed = entry.el.dataset.seed;
        ghost.innerHTML = KITCHEN_ART.ingredient(entry.key, +entry.el.dataset.seed);
        this.fgEl.appendChild(ghost);
        this.moveTo(ghost, this.toStage(e), 0, 0.9);
        entry.el.style.opacity = '0';
        this.drag = { kind: 'unboard', node: ghost, entry };
    },

    startDrag(e, node, kind) {
        e.preventDefault();
        node.classList.add('kt-dragging');
        this.drag = {
            node, kind,
            home: node.dataset.home ? JSON.parse(node.dataset.home) : null,
            scale: +(node.dataset.scale || 1),
            base: kind === 'boardup' || kind === 'potdown' ? this.nodePos(node) : null
        };
        if (kind === 'pile' || kind === 'bottle' || kind === 'hose') this.el('kt-pot').classList.add('kt-target');
    },

    onMove(e) {
        if (!this.drag) return;
        const d = this.drag;

        if (d.kind === 'knife') {
            // Свайп вверх-вниз наклоняет нож: игрок как будто тянет за лезвие,
            // а ось у торца ручки — как в жизни.
            const p = this.toStage(e);
            // Палец вверх — лезвие вверх. Знак минус именно за это.
            this.knifeStep(d.base - (p.y - d.from.y) * this.KNIFE_SENS);
            return;
        }

        if (d.kind === 'stir') {
            const x = this.toScene(e).x;
            const dx = x - d.last;
            if (Math.abs(dx) < 46) return;
            d.last = x;
            this.stirStep(dx);
            return;
        }

        if (d.kind === 'shelf' || d.kind === 'unboard') {
            this.moveTo(d.node, this.toStage(e), 0, 0.9);
            return;
        }

        if (d.kind === 'boardup' || d.kind === 'potdown' || d.kind === 'boardaway') {
            const p = this.toStage(e);
            if (d.kind === 'boardup') this.moveTo(d.node, { x: 195, y: Math.min(KITCHEN_ART.FG.board.chop.y, p.y) });
            if (d.kind === 'boardaway') {
                this.moveTo(d.node, { x: Math.max(KITCHEN_ART.FG.board.fridge.x, p.x), y: KITCHEN_ART.FG.board.fridge.y });
            }
            return;
        }

        const p = this.toScene(e);
        if (d.kind === 'hose') {
            this.el('kt-nozzle').setAttribute('transform',
                `translate(${(p.x - 828).toFixed(1)} ${(p.y - 664).toFixed(1)})`);
            this.el('kt-hose-line').setAttribute('d',
                `M828 624 Q${(828 + (p.x - 828) * 0.4).toFixed(1)} ${(p.y - 50).toFixed(1)} ${p.x.toFixed(1)} ${(p.y - 34).toFixed(1)}`);
        } else {
            this.moveTo(d.node, p, 0, d.scale);
        }

        // Держат над кастрюлей — льётся. Отвели — перестало.
        if (d.kind === 'hose' || d.kind === 'bottle') {
            const key = d.kind === 'hose' ? 'water' : d.node.dataset.key;
            if (this.overPot(p)) {
                if (!this.pouring) this.startPour(key, p);
                this.updatePour(p);
            } else if (this.pouring) {
                this.stopPour();
            }
        }
    },

    onUp(e) {
        if (!this.drag) return;
        const d = this.drag;
        this.drag = null;
        this.touched();
        this.el('kt-pot').classList.remove('kt-target');
        if (d.node) d.node.classList.remove('kt-dragging');

        if (d.kind === 'knife') { this.knifeArmed = false; return; }
        if (d.kind === 'stir') return;

        if (d.kind === 'shelf') {
            const p = this.toStage(e);
            if (this.overBoard(p)) this.putOnBoard(d.key, d.source);
            d.node.remove();
            return;
        }

        if (d.kind === 'unboard') {
            const p = this.toStage(e);
            if (!this.overBoard(p)) this.takeOffBoard(d.entry);
            else d.entry.el.style.opacity = '';
            d.node.remove();
            return;
        }

        if (d.kind === 'boardaway') {
            const p = this.toStage(e);
            // Уехала вправо заметно — значит понесли резать.
            if (p.x > KITCHEN_ART.FG.board.fridge.x + 110) { this.goToChop(); return; }
            this.moveTo(d.node, KITCHEN_ART.FG.board.fridge);
            return;
        }

        if (d.kind === 'boardup') {
            const p = this.toStage(e);
            // Утащили доску заметно вверх — значит понесли к плите.
            if (p.y < KITCHEN_ART.FG.board.chop.y - 120) { this.goToStove(); return; }
            this.moveTo(d.node, KITCHEN_ART.FG.board.chop);
            return;
        }

        if (d.kind === 'potdown') {
            const p = this.toStage(e);
            if (p.y > 560) { this.goToFeed(); return; }
            return;
        }

        if (this.pouring) this.stopPour();

        if (d.kind === 'hose') {
            this.el('kt-nozzle').setAttribute('transform', '');
            this.el('kt-hose-line').setAttribute('d', 'M828 624 V644');
            return;
        }

        if (d.kind === 'bottle') {
            if (this.liquid === d.node.dataset.key) d.node.dataset.empty = '1';
            this.moveTo(d.node, d.home, 0, d.scale);
            return;
        }

        if (d.kind === 'pile') {
            const p = this.toScene(e);
            const entry = this.piles.find(x => x.el === d.node);
            if (entry && this.overPot(p)) { this.dropInPot(entry); return; }
            const i = this.piles.indexOf(entry);
            const S = KITCHEN_ART.SLOTS;
            this.moveTo(d.node, { x: S.boardRest.x - 40 + Math.max(0, i) * 40, y: S.boardRest.y - 20 }, 0, 0.5);
        }
    },

    overBoard(p) {
        const b = this.nodePos(this.el('kt-board'));
        return Math.abs(p.x - b.x) < 190 && Math.abs(p.y - b.y) < 96;
    },

    // ================= КОРМЁЖКА =================
    // Кухня НЕ прячется. Раньше на кормёжку подменялась вся картинка —
    // отдельная сцена с градиентным фоном, — и это читалось как переход в
    // другую игру: варил суп, а очнулся неизвестно где. Теперь камера просто
    // переезжает на пол перед столом, а кастрюля со стола исчезает: её как
    // раз и понесли вниз, к червю.
    goToFeed() {
        this.phase = 'feed';
        this.setOpacity('kt-pot', 0);
        this.setOpacity('kt-flame', 0);
        this.setOpacity('kt-spoon', 0);
        this.setOpacity('kt-hint', 0);
        this.setCamera('feed');
        if (this.stageFeed) this.stageFeed.classList.add('active');
        this.ensureFeedMarkup();
        if (this.tiltBucket) this.tiltBucket.style.opacity = '0';
        // Раскладка считается от точки НА КУХНЕ (центр коврика), поэтому её
        // нельзя считать посреди переезда камеры: коврик ещё не там, где
        // будет, и червь приходил в угол экрана, а кастрюля висела за краем.
        // 680 мс — чуть больше перехода #kt-cam (0.62 с).
        setTimeout(() => this.setupFeedStage(), 680);
    },

    dishMeta() {
        const types = [];
        this.inPot.forEach(key => {
            const t = KITCHEN.ingredients[key].type;
            if (types.indexOf(t) === -1) types.push(t);
        });
        const liq = this.liquid ? KITCHEN.liquids[this.liquid] : null;
        return {
            types,
            richLiquid: !!(liq && !liq.plain),
            items: this.inPot.slice(),
            liquid: this.liquid
        };
    },

    ensureFeedMarkup() {
        if (this.feedMarkupReady) return;
        if (!this.feedSceneEl) return;

        // Старая захардкоженная иллюстрация червя (ещё до перехода на
        // общую модельку) — прячем, если она осталась в разметке.
        const legacySvg = document.getElementById('glut-worm-lying');
        if (legacySvg) legacySvg.style.display = 'none';

        // Контейнер для WormRenderer (общая модель персонажа).
        this.wormStageEl = document.getElementById('glut-worm-stage');
        if (!this.wormStageEl) {
            this.wormStageEl = document.createElement('div');
            this.wormStageEl.id = 'glut-worm-stage';
            this.feedSceneEl.insertBefore(this.wormStageEl, this.feedSceneEl.firstChild);
        }
        Object.assign(this.wormStageEl.style, {
            position: 'absolute',
            left: '0', top: '0', width: '100%', height: '100%',
            zIndex: '2',
            pointerEvents: 'none'
        });

        // Кастрюлю рисует kitchen-art (KITCHEN_ART.potHeld), а не css-градиент:
        // кормёжка идёт на самой кухне, и серый прямоугольник посреди
        // нарисованной от руки сцены выглядел деталью из другой игры.
        // Здесь только раскладка: где висит, за что берут, вокруг чего
        // наклоняется (ось — верхний край, как у настоящей кастрюли в руках).
        this.tiltBucket = document.getElementById('glut-tilt-bucket');
        if (this.tiltBucket) {
            this.tiltBucket.textContent = '';
            Object.assign(this.tiltBucket.style, {
                position: 'absolute',
                width: '30%',
                maxWidth: '120px',
                fontSize: '0',
                transformOrigin: 'top center',
                touchAction: 'none',
                cursor: 'grab',
                zIndex: '5'
            });

            this.potEl = document.getElementById('glut-pot-body');
            if (!this.potEl) {
                this.potEl = document.createElement('div');
                this.potEl.id = 'glut-pot-body';
                this.tiltBucket.appendChild(this.potEl);
            }
            Object.assign(this.potEl.style, {
                position: 'relative',
                width: '100%',
                aspectRatio: '0.9',
                boxSizing: 'border-box'
            });
        }

        // Обработчик наклона вешается здесь же: в прежнем init() он висел на
        // разметке, которой больше нет, а кастрюля всё равно собирается тут.
        if (this.tiltBucket && !this.tiltBucket._feedBound) {
            this.tiltBucket._feedBound = true;
            this.tiltBucket.addEventListener('pointerdown', (e) => this.startFeedDrag(e));
        }

        this.feedMarkupReady = true;

        // Правка 17: раскладка (положение персонажа + кастрюли) зависит от
        // РЕАЛЬНОГО размера сцены — на смену ориентации/поворот экрана
        // пересчитываем её так же, как при входе на этап.
        if (!this._feedResizeHandlerBound) {
            this._feedResizeHandlerBound = true;
            window.addEventListener('resize', () => {
                if (this.stageFeed && this.stageFeed.classList.contains('active')) this.layoutFeedStage();
            });
        }
    },

    setupFeedStage() {
        this.feedProgress = 0;
        this.feedFinished = false;
        this.feedDragging = false;
        this.feedDy = 0;
        this.feedAngle = 0;
        this.feedTargetAngle = 0;
        this.feedLastDropTime = 0;
        this.ensureFeedMarkup();
        if (this.tiltBucket) {
            this.tiltBucket.style.transform = 'rotate(0deg)';
        }
        // Цвет варева — тот же, что налили в кастрюлю на плите: блюдо
        // доехало до червя тем же, каким его готовили.
        if (this.potEl) this.potEl.innerHTML = KITCHEN_ART.potHeld(this.liquid);

        // Персонаж — общая моделька игрока, не своя отрисовка. Монтируем
        // (один раз за сессию) именно здесь, когда .glut-stage-feed уже
        // получил класс .active и контейнер видим — иначе рендерер
        // измерит нулевые размеры контейнера.
        //
        // Раскладка этапа: персонаж лежит вдоль низа сцены, головой к
        // левому краю (flip — тело растёт вправо от головы), тело
        // неподвижно (idleWave:false — никакого шевеления/покачивания,
        // просто лежит), живот раздувается только вверх, от нижней
        // границы (bellyGrowthAnchor:'bottom') — как и просили: живот не
        // растёт "в сторону спины".
        if (!window.WormModelAPI || !window.WormRenderer) {
            alert('Чревоугодие: не найден WormModelAPI/WormRenderer — проверь, что src/core/worm-model.js и src/core/worm-renderer.js подключены в index.html до gluttony.js.');
        } else if (this.wormStageEl) try {
            const model = window.WormModelAPI.loadWormModel();
            if (!this.wormHandle) {
                this.wormHandle = window.WormRenderer.mount(this.wormStageEl, model, {
                    context: 'gluttony',
                    // pose явно не задаём — берётся дефолтная 'standing'
                    // (та же поза, что и на главном экране): персонаж
                    // кормится стоя, а не лёжа плашмя, как было раньше.
                    wander: false,
                    blink: true,
                    idleWave: false,
                    flip: true,
                    bellyGrowthAnchor: 'bottom',
                    // Стартовый анкор — просто разумная точка по
                    // умолчанию (совпадает с дефолтом самого рендерера).
                    // Точную позицию, при которой персонаж целиком
                    // помещается в сцену, а кастрюля стоит над головой,
                    // выставляет layoutFeedStage() сразу после монтажа —
                    // см. вызов ниже.
                    anchorX: 0.5,
                    anchorY: 0.55
                });
            } else {
                // На случай, если базовая модель поменялась где-то ещё
                // (например, отредактирована на главном экране) — всегда
                // подтягиваем актуальную версию при входе на этот этап.
                this.wormHandle.update(model);
            }
            // Живот сбрасывается к стандартному размеру на входе в этап —
            // раздувать его будет сама механика кормления ниже. Рот: только
            // ОТКРЫТОСТЬ (mouthOpenness) — "живой" параметр, который тут
            // анимируется вслед за наклоном ведра (см. feedTick()). Кривизну
            // (mouthCurve) НЕ трогаем и не переопределяем — она приходит из
            // той же базовой модели, что и на главном экране, без изменений:
            // если персонаж улыбается/грустит там, ровно то же самое видно и
            // здесь, в мини-игре. Раньше здесь стоял принудительный сброс к
            // нейтральной кривизне (mouthCurve:0) — убран по фидбеку: не
            // должно быть отдельного "состояния рта" для мини-игры, только
            // общая модель + живое открытие.
            this.wormHandle.setLivePose({ bellyScale: 1, mouthOpenness: 0 });
            // Раскладка (позиция персонажа + кастрюли над его головой)
            // требует реальных, уже отрисованных габаритов SVG — сегменты
            // напольной цепи получают свои transform только в первом тике
            // рендерера (requestAnimationFrame), не в момент mount()/update().
            // Двойной rAF — гарантированно ПОСЛЕ этого первого тика.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                this.layoutFeedStage();
                this.startWormWalk();
            }));
        } catch (err) {
            alert('Чревоугодие: ошибка при отрисовке персонажа — ' + (err && err.message ? err.message : err));
            console.error(err);
        }

        this.updateFeedUI();
        if (!this.feedRafId) this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    // Раскладка кормёжки. Считается не числами «на глаз», а по РЕАЛЬНО
    // измеренному силуэту уже отрисованного персонажа — единственный способ,
    // который переживёт взросление: тело станет другим, раскладка
    // пересчитается сама.
    //
    // Точка стояния берётся из СЦЕНЫ (центр коврика), а не из долей экрана:
    // червя кормят в конкретном месте кухни, и если коврик в картинке
    // подвинут, кормёжка переезжает следом без правки кода.
    //
    // ВАЖНО про единицы. getBoundingClientRect отдаёт ВЬЮПОРТНЫЕ пиксели, а
    // весь холст ещё и отмасштабирован (--stage-scale). Раскладка же живёт в
    // css-пикселях слоя персонажа — на это и делится k. Без деления на
    // телефоне персонаж уезжал тем сильнее, чем мельче окно.
    layoutFeedStage() {
        if (!this.wormHandle || !this.wormStageEl || !this.tiltBucket) return;

        const host = this.wormStageEl;
        const hostRect = host.getBoundingClientRect();
        if (hostRect.width < 1 || hostRect.height < 1) return;
        const k = (hostRect.width / (host.clientWidth || hostRect.width)) || 1;
        const W = host.clientWidth || hostRect.width;
        const H = host.clientHeight || hostRect.height;

        const headEl = this.wormHandle.svgRoot.querySelector('[data-part="head"]');
        // Габарит мерим по группе .worm-root (тот <g>, что реально содержит
        // персонажа), а не по svgRoot: внешний <svg> растянут на весь слой, и
        // его прямоугольник — это размер контейнера, а не силуэта.
        const bodyGroup = this.wormHandle.svgRoot.querySelector('.worm-root');
        if (!headEl || !bodyGroup) return;
        const bodyRect = bodyGroup.getBoundingClientRect();
        const headRect = headEl.getBoundingClientRect();
        if (bodyRect.width < 1 || bodyRect.height < 1 || headRect.width < 1) return;

        const headCenterX = headRect.left + headRect.width / 2;
        const headCenterY = headRect.top + headRect.height / 2;

        // Сколько персонаж занимает в каждую сторону от центра головы: хвост
        // тянется в одну сторону намного дальше, поэтому отступы разные.
        const upExtent    = (headCenterY - bodyRect.top) / k;
        const downExtent  = (bodyRect.bottom - headCenterY) / k;
        const leftExtent  = (headCenterX - bodyRect.left) / k;
        const rightExtent = (bodyRect.right - headCenterX) / k;

        const potRect = this.tiltBucket.getBoundingClientRect();
        const potWidth  = potRect.width  ? potRect.width  / k : W * 0.3;
        const potHeight = potRect.height ? potRect.height / k : potWidth / 0.9;

        const MARGIN = 10;   // отступ от краёв
        const POT_GAP = 6;   // зазор между дном кастрюли и макушкой

        const spot = this.sceneToWorm(this.FEED_SPOT);

        // По горизонтали центрируем над ковриком ВЕСЬ силуэт, а не голову: у
        // неё разные «плечи» из-за хвоста.
        let x = spot.x + (leftExtent - rightExtent) / 2;
        x = Math.min(Math.max(x, MARGIN + leftExtent), W - MARGIN - rightExtent);

        // По вертикали тело низом встаёт на коврик, но обязательно так, чтобы
        // сверху осталось место под кастрюлю.
        let y = spot.y - downExtent;
        const minY = MARGIN + potHeight + POT_GAP + upExtent;
        const maxY = H - MARGIN - downExtent;
        y = (minY <= maxY) ? Math.min(Math.max(y, minY), maxY) : minY;

        // Смещение «начало координат персонажа → центр головы». Меряется
        // здесь один раз, дальше позиция ставится арифметикой: во время
        // прихода червя это происходит каждый кадр, и замер в кадре был бы
        // лишней раскладкой браузера.
        const pos = this.wormHandle.getPosition();
        this.wormHeadOffset = {
            x: (headCenterX - hostRect.left) / k - pos.x,
            y: (headCenterY - hostRect.top) / k - pos.y
        };

        // Кастрюля целится в РОТ, а не в центр головы: с поворотом головы рот
        // уезжает вбок на полтора десятка пикселей, и еда лилась бы мимо.
        const mouthEl = this.wormHandle.svgRoot.querySelector('[data-anchor="mouth"]');
        let mouthOffsetX = 0;
        if (mouthEl) {
            const mouthRect = mouthEl.getBoundingClientRect();
            if (mouthRect.width > 0) {
                mouthOffsetX = ((mouthRect.left + mouthRect.width / 2) - headCenterX) / k;
            }
        }
        this.feedPot = {
            dx: mouthOffsetX - potWidth / 2,
            dy: -upExtent - POT_GAP - potHeight
        };

        this.feedHead = { x, y };
        // Пока червь ползёт — не дёргаем его на место, только обновляем цель.
        if (this.wormWalk) this.wormWalk.to = this.feedHead;
        else this.setWormHead(x, y);
        this.placePot();
    },

    setWormHead(x, y) {
        const o = this.wormHeadOffset;
        if (!this.wormHandle || !o) return;
        this.wormHandle.setPosition(x - o.x, y - o.y);
    },

    placePot() {
        if (!this.tiltBucket || !this.feedHead || !this.feedPot) return;
        this.tiltBucket.style.left = `${(this.feedHead.x + this.feedPot.dx).toFixed(1)}px`;
        this.tiltBucket.style.top  = `${(this.feedHead.y + this.feedPot.dy).toFixed(1)}px`;
    },

    // ---------- ЧЕРВЬ ПРИХОДИТ САМ ----------
    // Без прихода еда просто появляется рядом с персонажем, и непонятно, как
    // он тут оказался. Ползёт справа за кадром: голова ведёт, тело тянется
    // следом. Своя анимация, а не шагающий цикл рендерера, потому что тот
    // включается только вместе с «прогулками» — а прогулки увели бы червя с
    // коврика прямо во время кормления.
    WALK_MS: 1500,

    startWormWalk() {
        if (!this.feedHead || !this.wormStageEl) return;
        this.stopWormWalk();
        const W = this.wormStageEl.clientWidth || 390;
        this.wormWalk = {
            from: { x: this.feedHead.x + W * 0.95, y: this.feedHead.y + 24 },
            to: this.feedHead,
            at: null
        };
        if (this.tiltBucket) this.tiltBucket.style.opacity = '0';
        this.setWormHead(this.wormWalk.from.x, this.wormWalk.from.y);
        this.wormWalkRaf = requestAnimationFrame(t => this.wormWalkTick(t));
    },

    wormWalkTick(now) {
        const w = this.wormWalk;
        if (!w) { this.wormWalkRaf = null; return; }
        if (w.at === null) w.at = now;
        const t = Math.min(1, (now - w.at) / this.WALK_MS);
        const e = 1 - Math.pow(1 - t, 2);        // трогается охотно, подъезжает мягко
        // Ползёт, а не едет: к прямой добавлена затухающая волна — тело идёт
        // рывками, как у гусеницы.
        const wob = Math.sin(t * Math.PI * 6) * 6 * (1 - t);
        this.setWormHead(w.from.x + (w.to.x - w.from.x) * e,
                         w.from.y + (w.to.y - w.from.y) * e + wob);
        if (t >= 1) {
            this.wormWalk = null;
            this.wormWalkRaf = null;
            this.setWormHead(w.to.x, w.to.y);
            this.placePot();
            if (this.tiltBucket) this.tiltBucket.style.opacity = '1';
            return;
        }
        this.wormWalkRaf = requestAnimationFrame(x => this.wormWalkTick(x));
    },

    stopWormWalk() {
        if (this.wormWalkRaf) cancelAnimationFrame(this.wormWalkRaf);
        this.wormWalkRaf = null;
        this.wormWalk = null;
    },

    stopFeedTick() {
        if (this.feedRafId) {
            cancelAnimationFrame(this.feedRafId);
            this.feedRafId = null;
        }
        this.feedLastTick = null;
    },

    startFeedDrag(e) {
        if (this.feedFinished) return;
        this.feedDragging = true;
        this.feedStartY = e.clientY;
        try { this.tiltBucket.setPointerCapture(e.pointerId); } catch (err) {}

        const onMove = (ev) => {
            if (!this.feedDragging) return;
            const dy = Math.min(this.MAX_DY, Math.max(0, ev.clientY - this.feedStartY));
            this.feedDy = dy;
            // Только ЦЕЛЬ — сам наклон кастрюли и открытие рта плавно едут
            // к ней каждый кадр в feedTick() одним и тем же значением угла,
            // чтобы кастрюля и рот не могли разъехаться между собой.
            this.feedTargetAngle = (dy / this.MAX_DY) * this.MAX_ANGLE;
        };
        const onUp = () => {
            this.feedDragging = false;
            this.feedDy = 0;
            this.feedTargetAngle = 0;
            this.tiltBucket.removeEventListener('pointermove', onMove);
            this.tiltBucket.removeEventListener('pointerup', onUp);
            this.tiltBucket.removeEventListener('pointercancel', onUp);
        };

        this.tiltBucket.addEventListener('pointermove', onMove);
        this.tiltBucket.addEventListener('pointerup', onUp);
        this.tiltBucket.addEventListener('pointercancel', onUp);
    },

    feedTick(now) {
        if (!this.feedLastTick) this.feedLastTick = now;
        const dt = (now - this.feedLastTick) / 1000;
        this.feedLastTick = now;

        // Плавно подводим текущий угол наклона кастрюли к целевому —
        // экспоненциальное сглаживание, не зависящее от частоты кадров
        // (dt-корректное). Быстро (доходит за ~150-200мс), но без единого
        // резкого скачка — и это же значение сразу двигает рот персонажа.
        const smoothing = Math.min(1, 1 - Math.pow(0.0005, dt));
        this.feedAngle += (this.feedTargetAngle - this.feedAngle) * smoothing;
        if (Math.abs(this.feedTargetAngle - this.feedAngle) < 0.05) this.feedAngle = this.feedTargetAngle;

        if (this.tiltBucket) {
            // Наклон ВЛЕВО: рыло у червя смотрит влево, и кастрюля обязана
            // опрокидываться в ту же сторону — иначе она льёт мимо морды.
            this.tiltBucket.style.transform = `rotate(${(-this.feedAngle).toFixed(1)}deg)`;
        }
        if (this.wormHandle) {
            // Наклон ведра 0° → рот закрыт (0), наклон MAX_ANGLE → рот
            // открыт полностью (1) — прямое пропорциональное соответствие,
            // как и просили: "ведро наклонено полностью = рот открыт
            // полностью", в любой промежуточный момент тоже верно.
            const openness = Math.max(0, Math.min(1, this.feedAngle / this.MAX_ANGLE));
            this.wormHandle.setLivePose({ mouthOpenness: openness });
        }

        if (!this.feedFinished && this.feedDragging) {
            if (this.feedAngle >= this.POUR_THRESHOLD_ANGLE) {
                this.feedProgress = Math.min(100, this.feedProgress + this.FEED_RATE_PER_SEC * dt);
                this.updateFeedUI();
                if (now - this.feedLastDropTime > this.DROP_INTERVAL) {
                    this.feedLastDropTime = now;
                    this.spawnDrop();
                }
                if (this.feedProgress >= 100) {
                    this.finishFeeding();
                }
            }
        }

        this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    spawnDrop() {
        if (!this.pourLayer || !this.potEl) return;
        const drop = document.createElement('div');
        drop.className = 'glut-drop';
        // Берём границы самой кастрюли (не всей поворотной обёртки), причём
        // не центр, а нижний ЛЕВЫЙ угол её текущего (уже повёрнутого)
        // прямоугольника: getBoundingClientRect() после rotate() возвращает
        // повёрнутый bbox, и левый нижний угол — это и есть «носик»
        // опрокинутой к морде кастрюли.
        const potRect = this.potEl.getBoundingClientRect();
        const layerRect = this.pourLayer.getBoundingClientRect();
        drop.style.left = `${potRect.left - layerRect.left + 6}px`;
        drop.style.top = `${potRect.bottom - layerRect.top - 4}px`;
        this.pourLayer.appendChild(drop);
        setTimeout(() => drop.remove(), 550);
    },

    updateFeedUI() {
        const t = this.feedProgress / 100;
        if (this.gaugeBar) this.gaugeBar.style.width = `${this.feedProgress}%`;
        // Живот раздувается прямо на общей модельке персонажа через
        // "горячий" канал рендерера — без пересборки SVG на каждый кадр.
        if (this.wormHandle) this.wormHandle.setLivePose({ bellyScale: 1 + t * 0.9 });
    },

    finishFeeding() {
        this.feedFinished = true;
        const meta = this.dishMeta();

        // Продукты списываются ЗДЕСЬ, а не когда игрок ткнул в холодильник:
        // закрыл игру на середине готовки — всё осталось на месте.
        const spent = meta.items.slice();
        if (meta.liquid) spent.push(meta.liquid);
        if (typeof Backend !== 'undefined') Backend.spendIngredients(spent);

        // Мини-игра не начисляет сама: сообщает результат, а что за него
        // дать, решает конфиг наград (src/config/economy.js). Качество блюда
        // считает Backend.dishQuality по meta.
        GameEvents.emit('minigame:result', {
            sin: 'gluttony', mode: 'feast', outcome: 'win', meta
        });

        this.showResult(typeof Backend !== 'undefined' ? Backend.dishQuality(meta) : null);
    },

    // Итог без единого слова: кучка, которая получится, и осколки жетона.
    // Цифра — не слово, а пиктограмма количества (инвариант 9).
    showResult(dish) {
        if (!this.winOverlay) return;
        if (this.resultEl && dish) {
            const poop = dish.poop > 0 ? `💩<i>×${dish.poop}</i>` : '';
            const shards = dish.shards > 0 ? `🥄<i>×${dish.shards}</i>` : '';
            this.resultEl.innerHTML = [poop, shards].filter(Boolean).join(' ');
        }
        this.winOverlay.classList.remove('fade-out');
        this.winOverlay.classList.add('show');
        setTimeout(() => this.winOverlay.classList.add('fade-out'), 1800);
        setTimeout(() => this.winOverlay.classList.remove('show', 'fade-out'), 2800);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GluttonyMinigame.init());
} else {
    GluttonyMinigame.init();
}
