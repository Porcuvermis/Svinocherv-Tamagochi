// ================= МИНИ-ИГРА ГРЕХ ЧРЕВОУГОДИЯ: КУХНЯ =================
// Кухня из трёх мест: холодильник, стол с доской, плита с кастрюлей.
// Игрок сам готовит, и качество блюда решает, что он за это получит
// (docs/plan/20-gluttony-kitchen.md).
//
// ---------- ПОРЯДОК ----------
//   общий вид → холодильник (выбор) → доска (нарезка) → плита (жидкость,
//   закладка, помешивание) → кормёжка
//
// Камера ездит по ОДНОЙ ленте из трёх мест (.kt-world сдвигается), а не
// переключает экраны: так переезд читается как движение по одной кухне, а
// не как смена картинки. Общий вид — та же лента, уменьшенная.
//
// ---------- ЧТО РЕШАЕТ НАГРАДУ ----------
// Мини-игра ничего себе не начисляет (инвариант 2). Она сообщает в meta,
// сколько РАЗНЫХ типов нарезаемого попало в кастрюлю и была ли жидкость
// крепче воды, а таблицу качества держит KITCHEN.quality. Оттуда же берётся
// размер кучки, которая появится через час пищеварения.
//
// Считаем типы, а не рецепты: рецепты пришлось бы где-то показывать, а
// показывать их нечем — слов в игре нет (инвариант 9). Число разных типов
// игрок видит по самой кастрюле и запоминает с первого раза.
//
// ---------- ПИЩЕБЛОК ----------
// В морозилке всегда лежит пищеблок. Нет продуктов — сварил его на воде:
// червь сыт, шкала закрыта, но кучки после него не остаётся. Страховка от
// тупика «нечем кормить», у которой есть цена.
//
// ---------- ЭТАП КОРМЁЖКИ ----------
// Он не переписан: наклон кастрюли, капли, раздувание живота и раскладка по
// РЕАЛЬНЫМ габаритам персонажа (правка 17) работают и менять их незачем.
// Переделано только то, что было до него.

const GluttonyMinigame = {
    screenElement: null,
    win: null,
    fadeEl: null,

    // сцена
    sceneEl: null,
    worldEl: null,
    fridgeEl: null,
    openFridgeEl: null,
    shelvesEl: null,
    confirmBtn: null,

    // доска
    boardEl: null,
    chopEl: null,
    knifeEl: null,
    queueEl: null,

    // плита
    bottlesEl: null,
    potEl: null,
    potFillEl: null,
    pilesEl: null,
    stirEl: null,

    // кормёжка (старый этап, разметка та же)
    stageFeed: null,
    feedSceneEl: null,
    tiltBucket: null,
    pourLayer: null,
    gaugeBar: null,
    winOverlay: null,
    resultEl: null,
    wormStageEl: null,
    wormHandle: null,

    // ---------- НАСТРОЙКИ КОРМЛЕНИЯ (не менялись) ----------
    MAX_DY: 90,          // px наклона до максимума
    MAX_ANGLE: 55,       // градусы максимального наклона
    POUR_THRESHOLD_ANGLE: 28,
    FEED_RATE_PER_SEC: 14, // %/сек пока льётся
    DROP_INTERVAL: 140,   // мс между каплями

    // ---------- СОСТОЯНИЕ СЕССИИ ----------
    phase: 'overview',   // overview | fridge | board | stove | feed
    picked: [],          // ключи выбранных ингредиентов, в порядке выбора
    liquid: null,        // ключ выбранной жидкости, null = вода из-под крана
    chopQueue: [],       // что ещё не нарезано
    chopIndex: 0,
    chopSwings: 0,
    chopNeed: 0,
    piles: [],           // нарезанные кучки, ждущие закладки
    inPot: 0,
    stirSwings: 0,

    // Общий счётчик качелей: и нож, и ложка водят пальцем туда-сюда, разница
    // только в том, что засчитывать. Держим один набор полей, чтобы правка
    // «качели считаются неправильно» была одна на две механики.
    swingAxis: null,
    swingLast: null,
    swingRect: null,

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

        // Окно надевается общее: рамка, крестик и вопрос при выходе — не наше
        // дело (инвариант 8). Вопрос не задаётся, когда готовить уже нечего:
        // после кормёжки терять нечего.
        if (typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'gluttony',
                onLeave: () => this.close(),
                canLeave: () => this.phase === 'overview' || this.feedFinished
            });
        }

        this.sceneEl = document.getElementById('kt-scene');
        this.worldEl = document.getElementById('kt-world');
        this.fridgeEl = document.getElementById('kt-fridge');
        this.openFridgeEl = document.getElementById('kt-open-fridge');
        this.shelvesEl = document.getElementById('kt-shelves');
        this.confirmBtn = document.getElementById('kt-confirm');

        this.boardEl = document.getElementById('kt-board');
        this.chopEl = document.getElementById('kt-chop');
        this.knifeEl = document.getElementById('kt-knife');
        this.queueEl = document.getElementById('kt-queue');

        this.bottlesEl = document.getElementById('kt-bottles');
        this.potEl = document.getElementById('kt-pot');
        this.potFillEl = document.getElementById('kt-pot-fill');
        this.pilesEl = document.getElementById('kt-piles');
        this.stirEl = document.getElementById('kt-stir');

        this.stageFeed = document.getElementById('glut-stage-feed');
        this.feedSceneEl = this.stageFeed ? this.stageFeed.querySelector('.glut-feed-scene') : null;
        this.pourLayer = document.getElementById('glut-pour-layer');
        this.gaugeBar = document.getElementById('glut-gauge-bar');
        this.winOverlay = document.getElementById('glut-win-overlay');
        this.resultEl = document.getElementById('kt-result');
        this.fadeEl = document.getElementById('glut-fade');

        if (this.fridgeEl) this.fridgeEl.addEventListener('click', () => this.openFridge());
        if (this.confirmBtn) this.confirmBtn.addEventListener('click', () => this.confirmPick());

        if (this.boardEl) {
            this.boardEl.addEventListener('pointerdown', (e) => this.startSwing(e, 'chop'));
        }
        if (this.stirEl) {
            this.stirEl.addEventListener('pointerdown', (e) => this.startSwing(e, 'stir'));
        }
        window.addEventListener('pointermove', (e) => this.onSwingMove(e));
        window.addEventListener('pointerup', (e) => this.endSwing(e));
        window.addEventListener('pointercancel', (e) => this.endSwing(e));

        window.addEventListener('resize', () => {
            if (!this.screenElement.classList.contains('active')) return;
            this.applyCamera();
        });
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
        this.liquid = null;
        this.chopQueue = [];
        this.chopIndex = 0;
        this.chopSwings = 0;
        this.piles = [];
        this.inPot = 0;
        this.stirSwings = 0;
        this.feedFinished = false;
        this.feedProgress = 0;

        if (this.openFridgeEl) this.openFridgeEl.classList.remove('open');
        if (this.stageFeed) this.stageFeed.classList.remove('active');
        if (this.sceneEl) this.sceneEl.style.display = '';
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');
        if (this.potFillEl) this.potFillEl.style.height = '0%';
        if (this.stirEl) this.stirEl.classList.remove('on');
        if (this.pilesEl) this.pilesEl.innerHTML = '';
        if (this.chopEl) this.chopEl.innerHTML = '';
        if (this.queueEl) this.queueEl.innerHTML = '';

        this.applyCamera();
    },

    // ================= КАМЕРА =================
    // Одна лента, три места. Общий вид — та же лента, уменьшенная втрое:
    // игрок видит всю кухню сразу и понимает, куда он потом поедет.
    SPOTS: ['fridge', 'board', 'stove'],

    applyCamera() {
        if (!this.worldEl) return;
        const spot = this.SPOTS.indexOf(this.phase);
        if (this.phase === 'overview' || spot === -1) {
            // Лента втрое шире экрана, поэтому масштаб 1/3 показывает её
            // целиком. По высоте она при этом занимает тоже треть — и её надо
            // опустить на пол сцены, иначе кухня висит посреди пустоты.
            // 56% — в единицах самой ленты, то есть 18–19% экрана.
            this.worldEl.style.transform = 'scale(0.3333) translateY(56%)';
            return;
        }
        this.worldEl.style.transform = `scale(1) translateX(${-spot * 33.3333}%)`;
    },

    goTo(phase) {
        this.phase = phase;
        this.applyCamera();
    },

    // ================= ХОЛОДИЛЬНИК =================
    openFridge() {
        if (this.phase !== 'overview') return;
        this.goTo('fridge');
        this.buildShelves();
        // Дверцу открываем после того, как камера доехала: иначе выезжающая
        // полка перекрывает переезд и он пропадает зря.
        setTimeout(() => {
            if (this.openFridgeEl) this.openFridgeEl.classList.add('open');
        }, 420);
    },

    buildShelves() {
        if (!this.shelvesEl) return;
        this.shelvesEl.innerHTML = '';
        const pantry = (GameState.data && GameState.data.pantry) || {};

        Object.keys(KITCHEN.ingredients).forEach(key => {
            const item = KITCHEN.ingredients[key];
            const count = item.infinite ? Infinity : (pantry[key] || 0);
            // Чего нет — того и не показываем: пустые ячейки только мешают.
            // Пищеблок бесконечен и виден всегда.
            if (!item.infinite && count <= 0) return;

            const el = document.createElement('div');
            el.className = 'kt-item' + (item.frozen ? ' frozen' : '');
            el.dataset.key = key;
            el.innerHTML = item.emoji +
                (item.infinite ? '' : `<span class="kt-n">${count}</span>`);
            el.addEventListener('click', () => this.toggleItem(key, el));
            this.shelvesEl.appendChild(el);
        });
        this.updateConfirm();
    },

    toggleItem(key, el) {
        const i = this.picked.indexOf(key);
        if (i !== -1) {
            this.picked.splice(i, 1);
            el.classList.remove('picked');
        } else {
            // Больше, чем влезает в кастрюлю, не берём — и говорим об этом
            // движением, а не отказом молчком.
            if (this.picked.length >= KITCHEN.MAX_PICK) {
                el.classList.remove('lack');
                void el.offsetWidth;
                el.classList.add('lack');
                return;
            }
            this.picked.push(key);
            el.classList.add('picked');
        }
        this.updateConfirm();
    },

    updateConfirm() {
        if (!this.confirmBtn) return;
        this.confirmBtn.classList.toggle('on', this.picked.length > 0);
    },

    confirmPick() {
        if (!this.picked.length) return;
        if (this.openFridgeEl) this.openFridgeEl.classList.remove('open');
        this.chopQueue = this.picked.slice();
        this.chopIndex = 0;
        setTimeout(() => {
            this.goTo('board');
            this.startChop();
        }, 260);
    },

    // ================= ДОСКА =================
    startChop() {
        this.chopSwings = 0;
        const key = this.chopQueue[this.chopIndex];
        if (!key) { this.goToStove(); return; }
        this.chopNeed = KITCHEN.ingredients[key].chops;
        this.renderQueue();
        this.renderChop();
    },

    renderQueue() {
        if (!this.queueEl) return;
        this.queueEl.innerHTML = this.chopQueue.map((key, i) =>
            `<span class="${i < this.chopIndex ? 'done' : ''}">${KITCHEN.ingredients[key].emoji}</span>`
        ).join('');
    },

    // Три вида по ходу нарезки: целый кусок → крупные куски → мелкая масса.
    // Рисуем одним и тем же значком, меняя ЧИСЛО и РАЗМЕР: своей картинки на
    // каждое состояние пока нет, а разница «крупнее и меньше числом» против
    // «мельче и больше числом» читается сразу.
    renderChop() {
        if (!this.chopEl) return;
        const key = this.chopQueue[this.chopIndex];
        if (!key) { this.chopEl.innerHTML = ''; return; }
        const emoji = KITCHEN.ingredients[key].emoji;
        const look = Math.min(KITCHEN.CHOP_LOOK - 1,
            Math.floor(this.chopSwings / (this.chopNeed / KITCHEN.CHOP_LOOK)));
        const shape = [{ n: 1, size: 54 }, { n: 4, size: 28 }, { n: 9, size: 17 }][look];
        let html = '';
        for (let i = 0; i < shape.n; i++) {
            html += `<span style="font-size:${shape.size}px">${emoji}</span>`;
        }
        this.chopEl.innerHTML = html;
    },

    onChopSwing() {
        // Палец не отпускают ровно в тот момент, когда кончился последний
        // ингредиент: качели идут ещё секунду, пока камера едет к плите. Без
        // этой проверки они считались дальше и клали в кучки undefined —
        // ингредиент, которого нет, а потом всё падало на отрисовке.
        if (this.chopIndex >= this.chopQueue.length) return;
        this.chopSwings++;
        this.renderChop();
        if (this.chopSwings < this.chopNeed) return;

        // Кучка готова — улетает к плите, приезжает следующий ингредиент.
        const key = this.chopQueue[this.chopIndex];
        this.piles.push(key);
        this.chopIndex++;
        this.chopSwings = 0;
        if (this.chopIndex >= this.chopQueue.length) {
            this.renderQueue();
            setTimeout(() => this.goToStove(), 400);
        } else {
            this.startChop();
        }
    },

    // ================= ПЛИТА =================
    goToStove() {
        this.goTo('stove');
        this.buildBottles();
        this.renderPiles();
        this.updatePot();
    },

    buildBottles() {
        if (!this.bottlesEl) return;
        this.bottlesEl.innerHTML = '';
        const pantry = (GameState.data && GameState.data.pantry) || {};

        Object.keys(KITCHEN.liquids).forEach(key => {
            const liq = KITCHEN.liquids[key];
            const count = liq.infinite ? Infinity : (pantry[key] || 0);
            const el = document.createElement('div');
            el.className = 'kt-bottle' + (count > 0 ? '' : ' empty');
            el.dataset.key = key;
            el.innerHTML = liq.emoji +
                (liq.infinite ? '' : `<span class="kt-bottle-n">${count}</span>`);
            el.addEventListener('click', () => this.pickLiquid(key, el));
            this.bottlesEl.appendChild(el);
        });
    },

    // Жидкость наливается сразу по выбору: наклон бутыли — это тот же жест,
    // что и наклон кастрюли в кормёжке, и повторять его дважды за одну
    // готовку незачем. Кастрюля наполняется на треть — видно, что основа есть.
    pickLiquid(key, el) {
        if (this.liquid) return;
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const liq = KITCHEN.liquids[key];
        if (!liq.infinite && !(pantry[key] > 0)) return;

        this.liquid = key;
        el.classList.add('picked');
        el.style.transform = 'rotate(-70deg)';
        setTimeout(() => { el.style.transform = ''; }, 700);
        this.updatePot();
    },

    renderPiles() {
        if (!this.pilesEl) return;
        this.pilesEl.innerHTML = '';
        this.piles.forEach((key, i) => {
            const el = document.createElement('div');
            el.className = 'kt-pile';
            el.dataset.key = key;
            el.dataset.i = String(i);
            el.textContent = KITCHEN.ingredients[key].emoji;
            el.addEventListener('pointerdown', (e) => this.startPileDrag(e, el));
            this.pilesEl.appendChild(el);
        });
    },

    startPileDrag(e, el) {
        if (!this.liquid) return;      // сначала основа, потом закладка
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        el.classList.add('dragging');
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        this.dragPile = { el, key: el.dataset.key, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        if (this.potEl) this.potEl.classList.add('target');
    },

    movePileDrag(e) {
        if (!this.dragPile) return;
        this.dragPile.el.style.left = `${e.clientX - this.dragPile.dx}px`;
        this.dragPile.el.style.top = `${e.clientY - this.dragPile.dy}px`;
    },

    endPileDrag(e) {
        if (!this.dragPile) return;
        const drag = this.dragPile;
        this.dragPile = null;
        if (this.potEl) this.potEl.classList.remove('target');

        const pot = this.potEl ? this.potEl.getBoundingClientRect() : null;
        const hit = pot && e && e.clientX >= pot.left && e.clientX <= pot.right &&
                    e.clientY >= pot.top - pot.height * 0.4 && e.clientY <= pot.bottom;
        if (!hit) {
            // Мимо — кучка возвращается на место, ничего не теряется.
            drag.el.classList.remove('dragging');
            drag.el.style.left = drag.el.style.top = '';
            return;
        }

        drag.el.remove();
        const i = this.piles.indexOf(drag.key);
        if (i !== -1) this.piles.splice(i, 1);
        this.inPot++;
        this.updatePot();

        if (!this.piles.length) {
            // Всё заложено — можно мешать.
            if (this.stirEl) this.stirEl.classList.add('on');
        }
    },

    updatePot() {
        if (!this.potFillEl) return;
        const base = this.liquid ? 34 : 0;
        const per = 16;
        this.potFillEl.style.height = `${Math.min(92, base + this.inPot * per)}%`;
    },

    onStirSwing() {
        this.stirSwings++;
        if (this.stirSwings < KITCHEN.STIR_SWINGS) return;
        if (this.stirEl) this.stirEl.classList.remove('on');
        this.goToFeed();
    },

    // ================= КАЧЕЛИ (нож и ложка) =================
    // Одна механика на две задачи: палец водят вверх-вниз, засчитывается
    // смена направления. Общая, потому что править «качели считаются
    // неправильно» дважды в одном файле — верный способ развести их.
    startSwing(e, kind) {
        if (kind === 'chop' && this.phase !== 'board') return;
        if (kind === 'stir' && !(this.stirEl && this.stirEl.classList.contains('on'))) return;
        e.preventDefault();
        this.swingAxis = kind;
        this.swingLast = e.clientY;
        this.swingDir = 0;
        if (kind === 'chop' && this.boardEl) this.boardEl.classList.add('busy');
    },

    onSwingMove(e) {
        if (this.dragPile) { this.movePileDrag(e); return; }
        if (!this.swingAxis) return;
        if (this.swingAxis === 'chop' && this.phase !== 'board') return;
        const dy = e.clientY - this.swingLast;
        // Порог, чтобы дрожь пальца не считалась качелями.
        if (Math.abs(dy) < 18) return;
        const dir = dy > 0 ? 1 : -1;
        this.swingLast = e.clientY;

        if (this.swingDir && dir === this.swingDir) return;
        this.swingDir = dir;
        // Первое движение задаёт направление, засчитываем со второго: иначе
        // одно касание уже давало бы качель.
        if (this.swingCounted === undefined) this.swingCounted = 0;
        this.swingCounted++;
        if (this.swingCounted < 2) return;
        this.swingCounted = 1;

        if (this.swingAxis === 'chop') this.onChopSwing();
        else this.onStirSwing();

        if (this.knifeEl && this.swingAxis === 'chop') {
            this.knifeEl.style.transform = `translate(-50%, ${dir > 0 ? 30 : 0}%) rotate(${dir > 0 ? 10 : -10}deg)`;
        }
        if (this.stirEl && this.swingAxis === 'stir') {
            this.stirEl.style.transform = `translate(-50%, 0) rotate(${dir > 0 ? 18 : -18}deg)`;
        }
    },

    endSwing(e) {
        if (this.dragPile) { this.endPileDrag(e); return; }
        this.swingAxis = null;
        this.swingDir = 0;
        this.swingCounted = undefined;
        if (this.boardEl) this.boardEl.classList.remove('busy');
    },

    // ================= ПЕРЕХОД К КОРМЁЖКЕ =================
    goToFeed() {
        this.phase = 'feed';
        if (this.sceneEl) this.sceneEl.style.display = 'none';
        if (this.stageFeed) this.stageFeed.classList.add('active');
        this.setupFeedStage();
    },

    // Что именно сварили — считается здесь, а начисляется конфигом наград.
    dishMeta() {
        const types = [];
        this.chopQueue.forEach(key => {
            const t = KITCHEN.ingredients[key].type;
            if (types.indexOf(t) === -1) types.push(t);
        });
        const liq = this.liquid ? KITCHEN.liquids[this.liquid] : null;
        return {
            types,
            richLiquid: !!(liq && !liq.plain),
            items: this.chopQueue.slice(),
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
