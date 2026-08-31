// ================= МИНИ-ИГРА ГРЕХ ЧРЕВОУГОДИЯ: КУХНЯ =================
// Кухня из одной картинки: холодильник, плита с духовкой, кастрюля на
// конфорке, бутыли на столешнице, раковина с выдвижной лейкой и стол с
// доской на переднем плане. Вся графика своя — src/minigames/gluttony/
// kitchen-art.js, ни одного эмодзи.
//
// ---------- ГЛАВНОЕ ПРАВИЛО ЭКРАНА: ИНТЕРФЕЙС ДИЕГЕТИЧЕСКИЙ ----------
// Нет ни одного меню, списка или кнопки поверх сцены. Игрок видит предметы и
// пользуется предметами: тапает по холодильнику — тот открывается; берёт
// продукт с полки — он перелетает на стол; тащит его пальцем на доску;
// водит ножом; готовая кучка едет к плите; тащит лейку из раковины к
// кастрюле; кидает кучки в кастрюлю; мешает ложкой.
//
// Отсюда следствие для кода: ВСЁ живёт в одной системе координат сцены
// (780×1688), включая перетаскиваемое. Экранные пиксели переводятся в
// координаты сцены через матрицу SVG — тогда предмет под пальцем лежит ровно
// под пальцем при любом наезде камеры, и не нужно чинить это отдельно для
// каждого масштаба.
//
// ---------- КАМЕРА ----------
// Не переключает экраны, а наезжает на участок одной картинки. Прямоугольники
// наезда — KITCHEN_ART.FOCUS, вписываются целиком (contain), поэтому вокруг
// предмета всегда виден кусок кухни и игрок не теряет, где он.
//
// ---------- ЧТО РЕШАЕТ НАГРАДУ ----------
// Мини-игра ничего себе не начисляет (инвариант 2): сообщает в meta, сколько
// РАЗНЫХ типов нарезаемого попало в кастрюлю и была ли жидкость крепче воды,
// а таблицу качества держит KITCHEN.quality. Оттуда же берётся размер кучки,
// которая появится через час пищеварения.
//
// Считаем типы, а не рецепты: рецепты пришлось бы где-то показывать, а
// показывать их нечем — слов в игре нет (инвариант 9).
//
// ---------- ЭТАП КОРМЁЖКИ ----------
// Не переписан: наклон кастрюли, капли, раздувание живота и раскладка по
// РЕАЛЬНЫМ габаритам персонажа (правка 17) работают, менять их незачем.

const GluttonyMinigame = {
    screenElement: null,
    win: null,
    svgEl: null,
    camEl: null,

    // ---------- НАСТРОЙКИ КОРМЛЕНИЯ (не менялись) ----------
    MAX_DY: 90,
    MAX_ANGLE: 55,
    POUR_THRESHOLD_ANGLE: 28,
    FEED_RATE_PER_SEC: 14,
    DROP_INTERVAL: 140,

    // Насколько далеко нужно провести пальцем, чтобы засчиталась одна качель
    // ножа. В координатах СЦЕНЫ, а не экрана: иначе на разном наезде нож
    // требовал бы разного размаха.
    SWING_TRAVEL: 60,

    // ---------- СОСТОЯНИЕ СЕССИИ ----------
    phase: 'overview',   // overview | fridge | board | stove | feed
    picked: [],
    inBasket: [],        // { key, el } — взятое из холодильника, лежит в корзине
    onTable: [],         // { key, el } — продукты, выложенные на стол
    hintAt: 0,           // когда игрок последний раз что-то трогал
    onBoard: null,       // что сейчас режут
    chopSwings: 0,
    piles: [],           // { key, el } — нарезанные кучки у плиты
    liquid: null,
    inPot: [],
    stirSwings: 0,
    drag: null,
    swing: null,

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
        this.stageFeed = document.getElementById('glut-stage-feed');
        this.feedSceneEl = this.stageFeed ? this.stageFeed.querySelector('.glut-feed-scene') : null;
        this.pourLayer = document.getElementById('glut-pour-layer');
        this.gaugeBar = document.getElementById('glut-gauge-bar');
        this.winOverlay = document.getElementById('glut-win-overlay');
        this.resultEl = document.getElementById('kt-result');

        this.buildScene();

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
        this.screenElement.classList.remove('active');
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');
    },

    resetAll() {
        this.phase = 'overview';
        this.picked = [];
        this.inBasket = [];
        this.onTable = [];
        this.onBoard = null;
        this.chopSwings = 0;
        this.piles = [];
        this.liquid = null;
        this.inPot = [];
        this.stirSwings = 0;
        this.drag = null;
        this.swing = null;
        this.feedFinished = false;
        this.feedProgress = 0;

        if (this.stageFeed) this.stageFeed.classList.remove('active');
        if (this.svgEl) this.svgEl.style.display = '';
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');

        this.el('kt-loose').innerHTML = '';
        this.el('kt-fridge').classList.remove('open');
        this.setAttr('kt-pot-fill', { height: 0, y: 670 });
        this.setOpacity('kt-flame', 0);
        this.setOpacity('kt-steam', 0);
        this.setOpacity('kt-spoon', 0);
        this.moveTo(this.el('kt-knife'), KITCHEN_ART.SLOTS.knifeRest, -18);
        this.el('kt-knife').classList.remove('ready');
        this.moveTo(this.el('kt-basket'), KITCHEN_ART.SLOTS.basket);
        this.buildBottles();
        this.setCamera('overview', true);
        this.touched();
    },

    // ================= СЦЕНА =================
    buildScene() {
        if (!this.camEl) return;
        this.camEl.innerHTML = KITCHEN_ART.scene();
    },

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

    // Переставить группу. Всё перетаскиваемое двигается ТОЛЬКО так — одним
    // transform, а не правкой координат внутри: тогда любую вещь можно
    // анимировать переходом и не пересобирать её разметку.
    moveTo(node, pt, rot, scale) {
        if (!node) return;
        node.setAttribute('transform',
            `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})` +
            (rot ? ` rotate(${rot})` : '') +
            (scale && scale !== 1 ? ` scale(${scale})` : ''));
    },

    // ---------- КАМЕРА ----------
    // Прямоугольник наезда вписывается в стейдж целиком: масштаб по меньшей
    // стороне, центр в центр. Показывать «на всю ширину» нельзя — тогда
    // высокий предмет вроде холодильника обрезался бы по пояс.
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

    // Экранные координаты → координаты сцены. Одна матрица на всё: предмет
    // под пальцем остаётся под пальцем при любом наезде.
    toScene(e) {
        const pt = this.svgEl.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = this.camEl.getScreenCTM();
        if (!m) return { x: 0, y: 0 };
        const p = pt.matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    },

    // ================= ОТКЛИК НА КАСАНИЕ =================
    // Правило простое и обязательное: ЛЮБОЙ предмет, которого коснулись,
    // отвечает движением в тот же кадр. Без этого игрок не понимает, попал он
    // или нет, и начинает долбить по экрану.
    pop(node) {
        if (!node) return;
        node.classList.remove('kt-pop');
        void node.getBoundingClientRect();
        node.classList.add('kt-pop');
        setTimeout(() => node.classList.remove('kt-pop'), 300);
    },

    // Отказ — то же движение, но другое: вещь дёргается, а не подпрыгивает.
    shake(node) {
        if (!node) return;
        node.classList.remove('kt-lack');
        void node.getBoundingClientRect();
        node.classList.add('kt-lack');
        setTimeout(() => node.classList.remove('kt-lack'), 340);
    },

    // ================= УКАЗАТЕЛЬ =================
    // В игре без слов сказать «тапни сюда» нечем, кроме движения. Кольцо
    // пульсирует там, где надо коснуться; пунктирная стрелка означает
    // «перетащи отсюда туда». Появляется после паузы бездействия — это
    // подсказка растерявшемуся, а не поводырь.
    HINT_DELAY: 1400,

    touched() {
        this.hintAt = Date.now();
        this.setOpacity('kt-hint', 0);
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => this.showHint(), this.HINT_DELAY);
    },

    // Что именно сейчас надо сделать. Одна таблица на всю игру: если шаг
    // некуда показать, значит шага и нет — и это сразу видно здесь, а не
    // выясняется на живом игроке.
    nextStep() {
        const S = KITCHEN_ART.SLOTS;
        if (this.phase === 'overview') return { at: { x: 141, y: 700 } };

        if (this.phase === 'fridge') {
            if (this.inBasket.length) return { at: KITCHEN_ART.SLOTS.basket };
            const first = Array.from(this.el('kt-loose').children)
                .find(n => n.dataset.where === 'fridge');
            if (first) return { at: JSON.parse(first.dataset.home) };
            return null;
        }

        if (this.phase === 'board') {
            if (this.onBoard) return { at: S.board, swipe: true };
            const first = this.onTable[0];
            if (first) return { at: this.nodePos(first.el), to: S.board };
            return null;
        }

        if (this.phase === 'stove') {
            if (!this.liquid) {
                const bottle = this.el('kt-bottles').querySelector('.kt-bottle:not([data-empty])');
                const from = bottle ? this.nodePos(bottle) : { x: 706, y: 568 };
                return { at: from, to: S.pot };
            }
            if (this.piles.length) return { at: this.nodePos(this.piles[0].el), to: S.pot };
            return { at: S.spoon, swipe: true };
        }
        return null;
    },

    nodePos(node) {
        const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(node.getAttribute('transform') || '');
        return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
    },

    showHint() {
        if (this.drag || this.swing || this.phase === 'feed') return;
        const step = this.nextStep();
        const hint = this.el('kt-hint');
        if (!step || !hint) return;

        this.moveTo(this.el('kt-hint-ring'), step.at);
        const line = this.el('kt-hint-line');
        const dot = this.el('kt-hint-dot');

        if (step.to) {
            // Дуга от предмета к цели: прямая читается перечёркиванием, дуга —
            // движением руки.
            const mx = (step.at.x + step.to.x) / 2;
            const my = Math.min(step.at.y, step.to.y) - 120;
            line.setAttribute('d', `M${step.at.x} ${step.at.y} Q${mx} ${my} ${step.to.x} ${step.to.y}`);
            dot.setAttribute('opacity', '0');
        } else if (step.swipe) {
            // Вверх-вниз на месте: то же движение, которое ждут от пальца.
            line.setAttribute('d', `M${step.at.x} ${step.at.y - 110} V${step.at.y + 110}`);
            dot.setAttribute('opacity', '0');
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
        this.touched();
        // Продукты выкладываются на полки ПОСЛЕ того, как дверцы поехали:
        // иначе они появляются сквозь закрытую дверь.
        setTimeout(() => this.fillShelves(), 220);
    },

    fillShelves() {
        const loose = this.el('kt-loose');
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const S = KITCHEN_ART.SLOTS;
        let i = 0;

        Object.keys(KITCHEN.ingredients).forEach(key => {
            const item = KITCHEN.ingredients[key];
            const count = item.infinite ? Infinity : (pantry[key] || 0);
            if (!item.infinite && count <= 0) return;   // чего нет, того не видно

            const spot = item.frozen
                ? S.freezer
                : { x: S.shelfX[i % 3], y: S.shelfY[Math.floor(i / 3) % S.shelfY.length] };
            if (!item.frozen) i++;

            const g = this.spawnItem(key, 0, spot, 0.5);
            g.dataset.home = JSON.stringify(spot);
            g.dataset.where = 'fridge';
            // Число рядом с продуктом — цифра, а не слово (инвариант 9).
            if (!item.infinite) {
                const n = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                n.setAttribute('class', 'kt-count');
                // Число ставится ПОД продуктом, а не на нём: поверх рисунка
                // оно спорит с ним за внимание и делает полку нечитаемой.
                n.setAttribute('x', '0'); n.setAttribute('y', '76');
                n.textContent = count;
                g.appendChild(n);
            }
            loose.appendChild(g);
        });
    },

    // Один продукт как группа сцены. Всё перетаскиваемое создаётся здесь,
    // поэтому и стадия нарезки, и позиция живут в одном месте.
    spawnItem(key, stage, spot, scale) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'kt-item');
        g.dataset.key = key;
        g.dataset.stage = String(stage);
        g.dataset.seed = String(Math.floor(Math.random() * 1e6));
        g.innerHTML = KITCHEN_ART.ingredient(key, stage, +g.dataset.seed);
        this.moveTo(g, spot, 0, scale || 1);
        g.dataset.scale = String(scale || 1);
        this.el('kt-loose').appendChild(g);
        return g;
    },

    redrawItem(g) {
        const seed = +g.dataset.seed;
        const stage = +g.dataset.stage;
        g.innerHTML = KITCHEN_ART.ingredient(g.dataset.key, stage, seed);
    },

    // Взять с полки: продукт летит на стол. Закрывать холодильник и
    // подтверждать выбор кнопкой не нужно — взял и взял.
    takeFromFridge(g) {
        const key = g.dataset.key;
        const item = KITCHEN.ingredients[key];
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const left = item.infinite ? Infinity : (pantry[key] || 0) - this.countPicked(key);

        // Отказ тоже обязан быть виден: молчаливое «ничего не произошло» —
        // это то, из-за чего игрок на первом живом прогоне долбил по полке и
        // не понимал, работает игра или нет.
        if (left <= 0 || this.inBasket.length >= KITCHEN.MAX_PICK) {
            this.shake(g);
            return;
        }

        this.pop(g);
        const S = KITCHEN_ART.SLOTS;
        // Копия летит с полки в корзину — на глазах, в кадре, по дуге. Раньше
        // она летела сразу к столу, то есть за край экрана, и тап выглядел
        // несработавшим.
        const flying = this.spawnItem(key, 0, JSON.parse(g.dataset.home), 0.5);
        flying.dataset.where = 'basket';
        const slot = this.basketSlot(this.inBasket.length);
        requestAnimationFrame(() => this.moveTo(flying, slot, (this.inBasket.length - 1) * 9, 0.46));
        this.inBasket.push({ key, el: flying });
        this.picked.push(key);

        setTimeout(() => {
            const basket = this.el('kt-basket');
            basket.classList.remove('kt-bump');
            void basket.getBoundingClientRect();
            basket.classList.add('kt-bump');
        }, 380);
        this.touched();
    },

    // Продукты лежат в корзине внахлёст: горка, а не шеренга — так видно, что
    // их несколько, и они помещаются в узкую корзину.
    basketSlot(i) {
        const b = KITCHEN_ART.SLOTS.basket;
        return { x: b.x - 30 + i * 20, y: b.y - 6 - i * 7 };
    },

    countPicked(key) {
        return this.picked.filter(k => k === key).length;
    },

    closeFridge() {
        this.el('kt-fridge').classList.remove('open');
        // Всё, что осталось лежать на полках, убирается вместе с дверцей.
        Array.from(this.el('kt-loose').children).forEach(node => {
            if (node.dataset.where === 'fridge') node.remove();
        });
    },

    // Тап по корзине = «понёс к столу». Продукты переезжают из корзины на
    // стол тем же переходом, что и летели в неё: взгляд ведёт их всю дорогу.
    carryBasket() {
        if (!this.inBasket.length) return;
        this.pop(this.el('kt-basket'));
        this.closeFridge();
        this.phase = 'board';
        this.setCamera('board');

        const S = KITCHEN_ART.SLOTS;
        this.inBasket.forEach((entry, i) => {
            entry.el.dataset.where = 'table';
            this.onTable.push(entry);
            // Вразнобой по времени: пачка, приехавшая разом, читается
            // подменой картинки, а не переносом.
            setTimeout(() => {
                this.moveTo(entry.el, { x: S.tableX[i], y: S.tableY }, 0, 0.8);
            }, 120 + i * 90);
        });
        this.inBasket = [];
        this.touched();
    },

    // ================= СТОЛ И ДОСКА =================
    goToBoard() {
        this.closeFridge();
        this.phase = 'board';
        this.setCamera('board');
        this.touched();
    },

    // Продукт положили на доску — можно резать.
    putOnBoard(entry) {
        const S = KITCHEN_ART.SLOTS;
        this.onBoard = entry;
        this.chopSwings = 0;
        entry.el.dataset.where = 'board';
        this.moveTo(entry.el, S.board, 0, 1.3);
        entry.el.dataset.scale = '1.3';
        // Нож встаёт над доской и покачивается: это и есть подсказка, что
        // делать дальше. Словами сказать нельзя, движением — можно.
        this.el('kt-knife').classList.add('ready');
        this.moveTo(this.el('kt-knife'), { x: S.board.x, y: S.board.y - 150 });
        this.touched();
    },

    chopSwing() {
        if (!this.onBoard) return;
        const need = KITCHEN.ingredients[this.onBoard.key].chops;
        this.chopSwings++;

        const stage = Math.min(KITCHEN.CHOP_LOOK - 1,
            Math.floor(this.chopSwings / (need / KITCHEN.CHOP_LOOK)));
        if (String(stage) !== this.onBoard.el.dataset.stage) {
            this.onBoard.el.dataset.stage = String(stage);
            this.redrawItem(this.onBoard.el);
        }
        if (this.chopSwings < need) return;

        // Нарезано: кучка едет к плите, нож возвращается на место.
        const entry = this.onBoard;
        this.onBoard = null;
        this.el('kt-knife').classList.remove('ready');
        this.moveTo(this.el('kt-knife'), KITCHEN_ART.SLOTS.knifeRest, -18);

        const idx = this.onTable.indexOf(entry);
        if (idx !== -1) this.onTable.splice(idx, 1);

        const S = KITCHEN_ART.SLOTS;
        const slot = { x: S.pileX[this.piles.length % S.pileX.length], y: S.pileY };
        entry.el.dataset.where = 'pile';
        this.moveTo(entry.el, slot, 0, 0.7);
        entry.el.dataset.scale = '0.7';
        this.piles.push(entry);
        this.touched();

        if (!this.onTable.length) setTimeout(() => this.goToStove(), 600);
    },

    // ================= ПЛИТА =================
    goToStove() {
        this.phase = 'stove';
        this.setCamera('stove');
        this.setOpacity('kt-flame', 1);
        this.touched();
    },

    buildBottles() {
        const host = this.el('kt-bottles');
        if (!host) return;
        host.innerHTML = '';
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const S = KITCHEN_ART.SLOTS;
        let i = 0;
        Object.keys(KITCHEN.liquids).forEach(key => {
            if (KITCHEN.liquids[key].tap) return;      // вода — это кран, не бутыль
            const empty = !(pantry[key] > 0);
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'kt-bottle');
            g.dataset.key = key;
            g.innerHTML = KITCHEN_ART.bottle(key, empty);
            if (empty) g.dataset.empty = '1';
            const spot = { x: S.bottleX[i], y: S.bottleY };
            g.dataset.home = JSON.stringify(spot);
            this.moveTo(g, spot);
            host.appendChild(g);
            i++;
        });
    },

    // Налить основу. Что именно наливают — решает предмет, который поднесли:
    // лейка даёт воду, бутыль — свою жидкость.
    pour(key) {
        if (this.liquid) return;
        this.liquid = key;
        this.setOpacity('kt-steam', 1);
        const fill = this.el('kt-pot-fill');
        const liq = KITCHEN.liquids[key];
        const ramp = PALETTE.kitchen[key] || PALETTE.kitchen.water;
        fill.setAttribute('fill', ramp[500]);
        this.updatePotLevel();
        this.touched();
    },

    updatePotLevel() {
        const fill = this.el('kt-pot-fill');
        if (!fill) return;
        // Уровень в кастрюле и есть шкала: отдельной рисовать не надо.
        const level = (this.liquid ? 46 : 0) + this.inPot.length * 22;
        const h = Math.min(126, level);
        fill.setAttribute('height', h);
        fill.setAttribute('y', 670 - h);
    },

    dropInPot(entry) {
        const idx = this.piles.indexOf(entry);
        if (idx !== -1) this.piles.splice(idx, 1);
        this.inPot.push(entry.key);
        // Пометку снимаем СРАЗУ, а не когда узел уйдёт из DOM. Пока кучка
        // доезжает до кастрюли и гаснет, она полсекунды остаётся на экране —
        // и всё это время её можно было взять второй раз.
        entry.el.dataset.where = 'pot';
        // Кучка «уходит» в кастрюлю: съезжает внутрь и гаснет.
        this.moveTo(entry.el, KITCHEN_ART.SLOTS.pot, 0, 0.4);
        entry.el.style.opacity = '0';
        setTimeout(() => entry.el.remove(), 420);
        this.updatePotLevel();
        this.touched();

        if (!this.piles.length && this.liquid) {
            this.setOpacity('kt-spoon', 1);
            this.moveTo(this.el('kt-spoon'), KITCHEN_ART.SLOTS.spoon);
        }
    },

    stirSwing() {
        this.stirSwings++;
        const spoon = this.el('kt-spoon-body');
        if (spoon) spoon.setAttribute('transform', `rotate(${this.stirSwings % 2 ? 16 : -16})`);
        if (this.stirSwings < KITCHEN.STIR_SWINGS) return;
        this.setOpacity('kt-spoon', 0);
        setTimeout(() => this.goToFeed(), 400);
    },

    // ================= ВВОД =================
    // Один обработчик на всю сцену: что именно взяли, решает предмет под
    // пальцем. Ни одного невидимого слоя поверх картинки.
    onDown(e) {
        if (this.phase === 'feed') return;
        // Любое касание прячет подсказку и заводит паузу заново.
        this.touched();

        const target = e.target.closest ? e.target.closest('g[id], g.kt-item, g.kt-bottle') : null;
        const item = e.target.closest ? e.target.closest('g.kt-item') : null;
        const bottle = e.target.closest ? e.target.closest('g.kt-bottle') : null;
        const hit = (id) => target && (target.id === id || !!target.closest('#' + id));

        if (this.phase === 'overview') {
            // На общем виде работает вся кухня: куда ни ткни из четырёх мест,
            // игра ведёт к холодильнику — начинать всё равно с него.
            if (item || hit('kt-fridge') || hit('kt-stove') || hit('kt-pot') ||
                hit('kt-sink') || hit('kt-table') || hit('kt-board')) {
                this.pop(this.el('kt-fridge'));
                this.openFridge();
            }
            return;
        }

        if (this.phase === 'fridge') {
            if (item && item.dataset.where === 'fridge') { this.takeFromFridge(item); return; }
            // Корзина — «понёс к столу». Отдельный предмет вместо тапа в
            // пустоту: раньше выйти со сцены можно было, только случайно
            // ткнув мимо, и игрок этого не находил.
            if (hit('kt-basket') || (item && item.dataset.where === 'basket')) { this.carryBasket(); return; }
            return;
        }

        if (this.phase === 'board') {
            if (this.onBoard && (hit('kt-knife') || hit('kt-board'))) {
                this.startSwing(e, 'chop');
                return;
            }
            if (item && item.dataset.where === 'table') { this.pop(item); this.startDrag(e, item, 'table'); return; }
            return;
        }

        if (this.phase === 'stove') {
            if (this.el('kt-spoon').getAttribute('opacity') !== '0' && hit('kt-spoon')) {
                this.startSwing(e, 'stir');
                return;
            }
            if (!this.liquid && hit('kt-hose')) { this.startDrag(e, this.el('kt-hose'), 'hose'); return; }
            if (!this.liquid && bottle && !bottle.dataset.empty) { this.pop(bottle); this.startDrag(e, bottle, 'bottle'); return; }
            if (!this.liquid && bottle) { this.shake(bottle); return; }
            if (item && item.dataset.where === 'pile') {
                if (!this.liquid) { this.shake(item); return; }   // сначала основа
                this.pop(item);
                this.startDrag(e, item, 'pile');
            }
        }
    },

    startSwing(e, kind) {
        e.preventDefault();
        this.swing = { kind, last: this.toScene(e).y, dir: 0, first: true };
        if (kind === 'chop') this.el('kt-knife').classList.add('cutting');
    },

    startDrag(e, node, kind) {
        e.preventDefault();
        const p = this.toScene(e);
        node.classList.add('kt-dragging');
        this.drag = { node, kind, p, home: node.dataset.home ? JSON.parse(node.dataset.home) : null };
        this.el('kt-pot').classList.add('kt-target');
    },

    onMove(e) {
        if (this.drag) {
            const p = this.toScene(e);
            const scale = +(this.drag.node.dataset.scale || 1);
            if (this.drag.kind === 'hose') {
                // Лейка тянется на шланге: сам шланг дорисовывается линией от
                // крана до лейки, поэтому видно, что это шланг, а не предмет.
                this.el('kt-nozzle').setAttribute('transform',
                    `translate(${(p.x - 706).toFixed(1)} ${(p.y - 568).toFixed(1)})`);
                this.el('kt-hose-line').setAttribute('d',
                    `M706 530 Q${(706 + (p.x - 706) * 0.4).toFixed(1)} ${(p.y - 40).toFixed(1)} ${p.x.toFixed(1)} ${(p.y - 28).toFixed(1)}`);
            } else {
                this.moveTo(this.drag.node, p, 0, scale);
            }
            return;
        }
        if (!this.swing) return;

        const y = this.toScene(e).y;
        // Нож ЕДЕТ ЗА ПАЛЬЦЕМ. Так игрок видит, чем режет и где режет: на
        // первом живом прогоне нож качался сам по себе в стороне от того
        // места, где надо было водить, и это читалось поломкой.
        if (this.swing.kind === 'chop') {
            const S = KITCHEN_ART.SLOTS;
            const dy = Math.max(-150, Math.min(60, y - S.board.y));
            this.moveTo(this.el('kt-knife'), { x: S.board.x, y: S.board.y + dy });
        }

        const d = y - this.swing.last;
        if (Math.abs(d) < this.SWING_TRAVEL) return;
        const dir = d > 0 ? 1 : -1;
        this.swing.last = y;
        if (this.swing.dir === dir) return;
        this.swing.dir = dir;
        if (this.swing.first) { this.swing.first = false; return; }

        if (this.swing.kind === 'chop') {
            this.chopSwing();
        } else {
            this.stirSwing();
        }
    },

    onUp(e) {
        if (this.swing) {
            if (this.swing.kind === 'chop') {
                const S = KITCHEN_ART.SLOTS;
                this.el('kt-knife').classList.remove('cutting');
                if (this.onBoard) this.moveTo(this.el('kt-knife'), { x: S.board.x, y: S.board.y - 150 });
            }
            this.swing = null;
            this.touched();
            return;
        }
        if (!this.drag) return;
        const drag = this.drag;
        this.drag = null;
        drag.node.classList.remove('kt-dragging');
        this.el('kt-pot').classList.remove('kt-target');
        this.touched();

        const p = e ? this.toScene(e) : { x: -999, y: -999 };
        const overBoard = p.x > 330 && p.x < 760 && p.y > 1200 && p.y < 1560;
        const overPot = p.x > 286 && p.x < 446 && p.y > 480 && p.y < 690;

        if (drag.kind === 'table') {
            const entry = this.onTable.find(t => t.el === drag.node);
            if (overBoard && entry && !this.onBoard) { this.putOnBoard(entry); return; }
            // Мимо доски — вещь возвращается на своё место, ничего не теряется.
            const i = this.onTable.indexOf(entry);
            const S = KITCHEN_ART.SLOTS;
            this.moveTo(drag.node, { x: S.tableX[Math.max(0, i)], y: S.tableY }, 0, 0.8);
            return;
        }

        if (drag.kind === 'pile') {
            const entry = this.piles.find(t => t.el === drag.node);
            if (overPot && entry) { this.dropInPot(entry); return; }
            const i = this.piles.indexOf(entry);
            const S = KITCHEN_ART.SLOTS;
            this.moveTo(drag.node, { x: S.pileX[Math.max(0, i)], y: S.pileY }, 0, 0.7);
            return;
        }

        if (drag.kind === 'bottle') {
            if (overPot) {
                this.pour(drag.node.dataset.key);
                drag.node.dataset.empty = '1';
            }
            this.moveTo(drag.node, drag.home);
            return;
        }

        if (drag.kind === 'hose') {
            if (overPot) this.pour('water');
            // Лейка всегда возвращается в кран: это пружина, а не предмет.
            this.el('kt-nozzle').setAttribute('transform', '');
            this.el('kt-hose-line').setAttribute('d', 'M706 530 V548');
        }
    },

    // ================= ПЕРЕХОД К КОРМЁЖКЕ =================
    goToFeed() {
        this.phase = 'feed';
        if (this.svgEl) this.svgEl.style.display = 'none';
        if (this.stageFeed) this.stageFeed.classList.add('active');
        this.setupFeedStage();
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

        // Ведро на этапе кормления должно выглядеть ТОЧНО так же, как
        // ведро на этапе замешивания (.glut-bucket / #glut-bucket-body) —
        // тот самый серый металлический градиент с окантовкой, а не
        // эмодзи и не отдельно нарисованная форма. Копируем стиль прямо
        // из рабочего варианта (см. .glut-bucket в gluttony.css) сюда,
        // инлайново, чтобы это больше не зависело от разметки index.html.
        this.tiltBucket = document.getElementById('glut-tilt-bucket');
        if (this.tiltBucket) {
            this.tiltBucket.textContent = '';
            Object.assign(this.tiltBucket.style, {
                position: 'absolute',
                top: '4%',
                left: '10%',
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
                boxSizing: 'border-box',
                background: 'linear-gradient(180deg, #d9d9d9 0%, #9a9a9a 60%, #7a7a7a 100%)',
                border: '3px solid #5a5a5a',
                borderRadius: '14px 14px 26px 26px / 14px 14px 40px 40px',
                boxShadow: 'inset 0 -10px 20px rgba(0,0,0,0.3)'
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
            requestAnimationFrame(() => requestAnimationFrame(() => this.layoutFeedStage()));
        } catch (err) {
            alert('Чревоугодие: ошибка при отрисовке персонажа — ' + (err && err.message ? err.message : err));
            console.error(err);
        }

        this.updateFeedUI();
        if (!this.feedRafId) this.feedRafId = requestAnimationFrame((t) => this.feedTick(t));
    },

    // Правка 17: раньше здесь была alignPotToMouth() — подгоняла только
    // ГОРИЗОНТАЛЬ кастрюли под рот, а сама позиция персонажа была
    // захардкожена (anchorX/anchorY), из-за чего он частично не влезал в
    // сцену. Теперь одна функция решает обе задачи сразу и делает это не
    // "на глаз" числами, а по РЕАЛЬНЫМ измеренным габаритам уже
    // отрисованного персонажа (getBoundingClientRect его SVG) — это
    // единственный способ, который сам собой продолжит работать и после
    // появления взросления (новые сегменты, другой размер тела): силуэт
    // персонажа просто станет больше/другим, а раскладка пересчитается от
    // него заново, без правки констант.
    //
    // Логика:
    // 1) меряем фактический bbox всего персонажа (bodyRect) и его головы
    //    (headRect) — они дают "сколько места нужно" в каждую сторону от
    //    ЦЕНТРА головы (up/down/left/right extent);
    // 2) выбираем новую точку стояния головы (wormX/wormY) так, чтобы весь
    //    силуэт был центрирован по горизонтали и стоял чуть ниже центра
    //    сцены по вертикали, но целиком помещался в видимую область и
    //    оставлял сверху место под кастрюлю;
    // 3) переставляем персонажа туда через WormRenderer.setPosition();
    // 4) ставим кастрюлю строго над новым положением головы (центр по X
    //    совпадает с центром головы, дно — на небольшом зазоре над
    //    макушкой) — поэтому кастрюля "над головой" гарантированно, где бы
    //    голова ни оказалась.
    layoutFeedStage() {
        if (!this.wormHandle || !this.wormStageEl || !this.feedSceneEl || !this.tiltBucket) return;

        const stageRect = this.wormStageEl.getBoundingClientRect();
        if (stageRect.width < 1 || stageRect.height < 1) return;

        const headEl = this.wormHandle.svgRoot.querySelector('[data-part="head"]');
        // ВАЖНО: bbox мерим по группе .worm-root (тот <g>, что реально
        // содержит и двигает персонажа), а НЕ по this.wormHandle.svgRoot —
        // svgRoot это сам внешний <svg>, его getBoundingClientRect() равен
        // размеру КОНТЕЙНЕРА (он растянут на всю сцену через viewBox), а
        // не силуэту персонажа внутри него.
        const bodyGroup = this.wormHandle.svgRoot.querySelector('.worm-root');
        if (!headEl || !bodyGroup) return;
        const bodyRect = bodyGroup.getBoundingClientRect();
        const headRect = headEl.getBoundingClientRect();
        if (bodyRect.width < 1 || bodyRect.height < 1 || headRect.width < 1) return;

        const headCenterX = headRect.left + headRect.width / 2;
        const headCenterY = headRect.top + headRect.height / 2;

        // Сколько персонаж реально занимает в каждую сторону от центра
        // головы — хвостовая часть тянется в одну сторону намного дальше,
        // чем что-либо в другую, поэтому все четыре отступа разные.
        const upExtent = headCenterY - bodyRect.top;
        const downExtent = bodyRect.bottom - headCenterY;
        const leftExtent = headCenterX - bodyRect.left;
        const rightExtent = bodyRect.right - headCenterX;

        const potRect = this.tiltBucket.getBoundingClientRect();
        const potWidth = potRect.width || stageRect.width * 0.3;
        const potHeight = potRect.height || potWidth / 0.9;

        const MARGIN = 10;   // отступ от краёв сцены
        const POT_GAP = 6;   // зазор между дном кастрюли и макушкой головы

        // По горизонтали центрируем весь силуэт (не саму голову — у неё
        // разные "плечи" из-за хвоста), с зажимом в границы сцены.
        let targetHeadX = stageRect.width / 2 + (leftExtent - rightExtent) / 2;
        targetHeadX = Math.min(Math.max(targetHeadX, MARGIN + leftExtent), stageRect.width - MARGIN - rightExtent);

        // По вертикали — чуть ниже центра сцены (экран портретный, а поза
        // персонажа высокая), но обязательно так, чтобы снизу тело влезало
        // целиком, а сверху оставалось место под кастрюлю.
        const minHeadY = MARGIN + potHeight + POT_GAP + upExtent;
        const maxHeadY = stageRect.height - MARGIN - downExtent;
        let targetHeadY = stageRect.height * 0.58;
        if (minHeadY <= maxHeadY) {
            targetHeadY = Math.min(Math.max(targetHeadY, minHeadY), maxHeadY);
        } else {
            // Сцена слишком тесная для идеальной раскладки — приоритет
            // месту под кастрюлю и полной видимости головы/верха тела.
            targetHeadY = minHeadY;
        }

        // headRect/bodyRect — во ВЬЮПОРТЕ; переводим их через уже
        // известную ТЕКУЩУЮ позицию головы (getPosition) в систему
        // координат сцены (= системе координат SVG персонажа, см.
        // syncViewportSize — viewBox 1:1 с CSS-пикселями контейнера).
        const currentPos = this.wormHandle.getPosition();
        const currentHeadX = headCenterX - stageRect.left;
        const currentHeadY = headCenterY - stageRect.top;
        const dx = targetHeadX - currentHeadX;
        const dy = targetHeadY - currentHeadY;
        this.wormHandle.setPosition(currentPos.x + dx, currentPos.y + dy);

        // Кастрюля целится в РОТ, а не в центр головы. Пока голова была
        // строго анфас, это было одно и то же; с появлением поворота
        // (head.yaw) рот уезжает вбок на полтора десятка пикселей, и еда
        // лилась бы мимо. Смещение считаем относительно центра головы,
        // потому что вся раскладка ниже уже построена от него.
        const mouthEl = this.wormHandle.svgRoot.querySelector('[data-anchor="mouth"]');
        let mouthOffsetX = 0;
        if (mouthEl) {
            const mouthRect = mouthEl.getBoundingClientRect();
            if (mouthRect.width > 0) {
                mouthOffsetX = (mouthRect.left + mouthRect.width / 2) - headCenterX;
            }
        }
        this.tiltBucket.style.left = `${targetHeadX + mouthOffsetX - potWidth / 2}px`;
        this.tiltBucket.style.top = `${targetHeadY - upExtent - POT_GAP - potHeight}px`;
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
            this.tiltBucket.style.transform = `rotate(${this.feedAngle.toFixed(1)}deg)`;
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
        // не центр, а передний/нижний край её текущего (уже повёрнутого)
        // прямоугольника — getBoundingClientRect() после rotate() возвращает
        // именно повёрнутый bbox, так что right/bottom — это и есть "носик"
        // наклонённой кастрюли, а не геометрический центр.
        const potRect = this.potEl.getBoundingClientRect();
        const layerRect = this.pourLayer.getBoundingClientRect();
        drop.style.left = `${potRect.right - layerRect.left - 6}px`;
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
