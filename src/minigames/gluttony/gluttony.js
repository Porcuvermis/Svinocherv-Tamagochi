// ================= МИНИ-ИГРА ГРЕХ ЧРЕВОУГОДИЯ: КУХНЯ =================
// Кухня одной картинкой, интерфейс диегетический: игрок пользуется
// предметами, а не меню (docs/plan/20-gluttony-kitchen.md).
//
// ---------- ДВА СЛОЯ ----------
// Кухня живёт в координатах СЦЕНЫ 720×1500, по ней ездит камера. Доска и нож
// живут в координатах ЭКРАНА 390×844 и камере не подчиняются: доска — предмет,
// который игрок держит перед собой, она ближе камеры. Отсюда весь ход игры
// читается как одно непрерывное движение по кухне, а не как смена картинок:
// доска въезжает из-за края, набирается продуктами, уезжает, снова въезжает
// уже на столе для нарезки, потом поднимается к плите.
//
// ---------- ПОРЯДОК ----------
//   общий вид
//     → тап по холодильнику: открылся, снизу-справа въехала доска
//     → продукты ПЕРЕТАСКИВАЮТ с полок на доску (по одному каждого типа);
//       передумал — тащат обратно, силуэт на полке снова становится продуктом
//     → доску тянут ЗА РУЧКУ справа: уехала — значит понесли резать
//     → стол: та же доска въезжает с продуктами, режут ВСЕ СРАЗУ ножом
//     → доску тянут за ручку вверх: она уходит к плите
//     → плита: жидкость держат над кастрюлей и льют, кучки кидают внутрь
//     → зум на кастрюлю, мешают слева направо
//     → кастрюлю тянут вниз: камера отъезжает на общий вид, справа приходит
//       червь и встаёт у стола, дальше кормёжка
//
// ---------- ПЕРЕХОДЫ — ЭТО ПЕРЕНОС ПРЕДМЕТА ----------
// Между этапами не переключают, а ПЕРЕНОСЯТ: доску вправо, доску вверх,
// кастрюлю вниз. Один жест на все переходы, и он же — единственный жест
// игры. Удержание тут было и убрано: показать его пиктограммой нечем, а в
// игре без слов такого жеста существовать не может.
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
    // Вдвое быстрее прежнего: наклонять кастрюлю семь секунд было долго —
    // жест давно понят, а держать его приходилось «просто так».
    FEED_RATE_PER_SEC: 28,

    // ---------- СТРУЯ ИЗ КАСТРЮЛИ ----------
    // Отдельные капли-«точки» не читались едой вообще. Струя собрана из
    // шариков, которые сливаются в одну текучую массу фильтром-«гуашью»
    // (размытие + резкий порог по альфе) — сами шарики не видны, видна
    // густая жидкость.
    // Носик — ПРАВЫЙ край горловины, а кастрюлю держат СЛЕВА от рыла и
    // опрокидывают вправо, к морде. Пробовали наоборот (носик слева,
    // опрокидывание влево) — при наклоне носик уезжает к оси поворота, то
    // есть вправо, и струя шла ровно через морду: по глазам и лбу. Здесь
    // наклон уводит носик ОТ лица, и еда падает перед рылом.
    SPOUT: { x: 174 / 200, y: 48 / 224 },
    POUR_EMIT_MS: 18,      // шаг выпуска: реже — и струя рвётся на бусины
    BLOB_POOL: 48,
    BLOB_R: 9,
    STREAM_BASE: 1.6,      // доля пути в секунду у носика
    STREAM_ACC: 2.2,       // и насколько быстрее у рта: жидкость ПАДАЕТ
    STREAM_BOW: 0.45,      // насколько струя выгибается по ходу вытекания
    FEED_STREAM_REF: 190,  // «обычная» длина струи в рот, от неё считается скорость

    // ---------- ЧИСЛА, КОТОРЫЕ ДВИГАЕТ КУПЛЕННАЯ УТВАРЬ ----------
    // Взмахов на полную нарезку и качелей ложкой. Значения тут НЕ стоят:
    // база и ступени лежат в ECONOMY.minigames.gluttony.upgrades, а сюда
    // приезжают в resetAll() через Backend.upgradeValue. Иначе купленный нож
    // ничего бы не менял, а число оказалось бы описано дважды.
    CHOPS_TOTAL: 0,
    // Лезвие смотрит ВЛЕВО, а положительный поворот в SVG — по часовой, то
    // есть левый конец идёт ВВЕРХ. Поэтому поднятый нож — это ПЛЮС, а не
    // минус. В первой версии знаки были перепутаны, и свайп вверх опускал
    // нож — управление читалось сломанным.
    KNIFE_UP: 44,          // лезвие поднято
    // Не «лежит плашмя», а слегка носом вниз: в нижней точке лезвие обязано
    // ВОЙТИ в продукты. Плоский нож на этой же высоте выглядел парящим над
    // доской, и удар не читался ударом.
    KNIFE_DOWN: -6,
    KNIFE_SENS: 0.5,       // градусов на пиксель пальца: весь размах ≈ 100 px
    STIR_SWINGS: 0,
    HINT_DELAY: 1500,

    // ---------- ГЕОМЕТРИЯ КАРТИНКИ ЗДЕСЬ НЕ ЖИВЁТ ----------
    // Куда приходит червь, докуда доходит уровень в кастрюле, где выход у
    // лейки — всё это РАЗМЕТКА КАРТИНКИ, и лежит она в kitchen-art рядом с
    // самой картинкой. Пока эти числа стояли здесь, смена графики означала
    // правку игровой логики, а разъезжались они молча.
    feedSpot() { return KITCHEN_ART.FEED_SPOT; },
    hose() { return KITCHEN_ART.HOSE; },

    // ---------- НАЛИВ ----------
    // Считается от ВРЕМЕНИ, а не от числа событий указателя: раньше уровень
    // рос на каждый pointermove, поэтому на быстром экране кастрюля
    // наполнялась вдвое быстрее, чем на медленном, а если держать сосуд
    // неподвижно — не наполнялась вовсе.
    POUR_FULL: 60,           // уровень, при котором жидкость засчитана
    POUR_RATE_PER_SEC: 32,   // ≈1.9 с на полную кастрюлю
    POUR_TILT: -118,         // на сколько опрокидывается бутыль над кастрюлей
    // Струя в кастрюлю живёт в координатах СЦЕНЫ, поэтому и шарики крупнее, и
    // путь длиннее: единица сцены мельче экранной примерно вдвое.

    // Всё, что берут в руку, растёт вдвое: продукт с полки, продукт с доски,
    // кучка, бутыль, лейка. Предмет под пальцем обязан быть крупнее пальца,
    // иначе игрок не видит, что именно держит. Не растут только доска и
    // кастрюля — они и так во весь экран, и увеличивать там нечего.
    GRAB_ZOOM: 2,
    POT_BLOB_R: 15,
    // Пул с запасом: лить можно хоть от потолка, а чем длиннее путь, тем
    // больше шариков одновременно в воздухе.
    POT_BLOB_POOL: 64,
    POT_EMIT_MS: 18,
    POT_STREAM_REF: 240,
    // Разгон у длинной струи слабее, чем у короткой: у неё и без того есть
    // куда разогнаться, а на прежнем разгоне хвост растягивался быстрее, чем
    // выходили новые шарики, и струя рвалась у самой кастрюли.
    POT_STREAM_ACC: 1.4,

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

        // Пул шариков заводится ПОСЛЕ отрисовки сцены: до неё слоя ещё нет.
        this.potStream = this.makeStream(this.el('kt-pour-blobs'), {
            pool: this.POT_BLOB_POOL, r: this.POT_BLOB_R, emitMs: this.POT_EMIT_MS,
            base: this.STREAM_BASE, acc: this.POT_STREAM_ACC, bow: this.STREAM_BOW,
            ref: this.POT_STREAM_REF
        });

        if (typeof KitchenShop !== 'undefined') KitchenShop.init(this);
        // Своя debug-панель: кладовая расходуется каждой готовкой, и без
        // кнопок её приходилось бы наполнять сбросом всего прогресса.
        if (typeof KitchenDebug !== 'undefined') KitchenDebug.init(this.screenElement);

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
        // Закрытая мини-игра ничего не оставляет открытым внутри себя:
        // приложение, забытое поднятым, встретит игрока в следующий заход.
        if (typeof KitchenShop !== 'undefined') KitchenShop.close();
        this.stopFeedTick();
        this.stopPour();
        this.stopWormWalk();
        clearTimeout(this._hintTimer);
        this.screenElement.classList.remove('active');
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');
    },

    resetAll() {
        if (typeof KitchenShop !== 'undefined') KitchenShop.close();
        this.phase = 'overview';
        // Купленная утварь читается ПРИ КАЖДОМ заходе, а не один раз на
        // старте: магазин открывается прямо отсюда, и нож, купленный минуту
        // назад, обязан резать быстрее уже в этой готовке.
        this.applyGear();
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
        if (this.wormStageEl) this.wormStageEl.style.opacity = '0';
        this.streamClear(this.feedStream);
        this.streamClear(this.potStream);
        this.setOpacity('kt-pot', 1);
        if (this.tiltBucket) this.tiltBucket.style.opacity = '';
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');

        this.el('kt-loose').innerHTML = '';
        this.el('kt-board-items').innerHTML = '';
        this.el('kt-fridge').classList.remove('open');
        this.setAttr('kt-pot-fill', { height: 0, y: KITCHEN_ART.POT_FILL.bottom });
        this.el('kt-pot').removeAttribute('transform');
        this.el('kt-pot').classList.remove('kt-dragging', 'kt-target');
        this.setOpacity('kt-flame', 0);
        this.setOpacity('kt-steam', 0);
        this.setOpacity('kt-spoon', 0);
        this.setOpacity('kt-knife', 0);
        this.el('kt-knife').classList.remove('kt-done');
        this.el('kt-knife').removeAttribute('pointer-events');
        this.setOpacity('kt-board-rest', 0);
        this.el('kt-board-rest').innerHTML = KITCHEN_ART.boardRest();
        this.moveTo(this.el('kt-board-rest'), KITCHEN_ART.SLOTS.boardRest);
        this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.hidden);
        this.setOpacity('kt-table-set', 1);
        this.placePhone();
        this.buildBottles();
        this.setCamera('overview', true);
        if (typeof KitchenDebug !== 'undefined') KitchenDebug.render();
        this.touched();
    },

    // Значения купленной утвари → в числа этой сессии. Пол в двойке и
    // единице: ступень с нулём взмахов означала бы этап, который проходится
    // сам, а такой этап надо убирать, а не покупать.
    applyGear() {
        this.CHOPS_TOTAL = Math.max(2, Backend.upgradeValue('gluttony', 'knife'));
        this.STIR_SWINGS = Math.max(1, Backend.upgradeValue('gluttony', 'pot'));
    },

    // Магазин живёт в своём модуле (kitchen-shop.js): кухня только открывает
    // его и на этом про него забывает.
    openShop() {
        if (typeof KitchenShop !== 'undefined') KitchenShop.show();
    },

    // ---------- ТЕЛЕФОН В УГЛУ ----------
    // Разметка лежит в KITCHEN_ART.FG.phone вместе с самим рисунком: здесь
    // только «поставь туда, где сказано».
    placePhone() {
        const node = this.el('kt-phone');
        if (!node) return;
        this.moveTo(node, KITCHEN_ART.FG.phone, KITCHEN_ART.FG.phone.rot);
        this.showPhone(true);
    },

    // Телефон живёт только на общем виде. Дальше начинается готовка, и там
    // он мешает дважды: закрывает угол, откуда въезжает доска, и предлагает
    // уйти в магазин с полными руками.
    showPhone(on) {
        const node = this.el('kt-phone');
        if (!node) return;
        node.style.opacity = on ? '1' : '0';
        // ---------- ПОЧЕМУ display, А НЕ pointer-events И НЕ visibility ----------
        // Спрятанный телефон продолжал ЛОВИТЬ пальцы, и не по разу:
        //
        //   pointer-events: none на группе — в SVG значение ребёнка перебивает
        //     родительское, а у зоны захвата телефона стоит своё
        //     pointer-events="all";
        //   visibility: hidden — по спецификации значения painted/fill/stroke/all
        //     видимость ИГНОРИРУЮТ, и «all» продолжал отвечать сквозь невидимость.
        //
        // Зона телефона накрывает ручку доски в фазе холодильника, поэтому цена
        // ошибки была не косметическая: доску нельзя было отодвинуть вовсе, и
        // прогон кухни вставал ровно на этом шаге.
        //
        // Ловушка №94 («скрытая кнопка держит своё место») здесь не работает:
        // она про раскладку, где сосед забирает освободившееся место. Группа
        // svg стоит в абсолютных координатах, отдавать ей нечего и некому.
        node.style.display = on ? '' : 'none';
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
        // Числа камеры запоминаются: по ним считается перевод координат
        // (см. toScene), а не по матрице узла — матрица во время переезда
        // интерполируется, и вычитать из неё что-либо бессмысленно.
        this.cam = { s, tx, ty };
        if (instant) this.camEl.style.transition = 'none';
        this.camEl.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`);
        if (instant) {
            void this.camEl.getBoundingClientRect();
            this.camEl.style.transition = '';
        }
    },

    // ---------- ПЕРЕВОД КООРДИНАТ ----------
    // Через SvgSpace (rect + viewBox), а не через getScreenCTM: вся игра
    // лежит в контейнере с css-трансформацией, а учитывает ли CTM
    // трансформацию ПРЕДКА — вопрос браузера (src/core/svg-space.js).
    // Камера подставляется числами: q = s·p + t, обратно p = (q − t)/s.
    toStage(e) { return SvgSpace.fromClient(this.svgEl, e.clientX, e.clientY); },

    toScene(e) {
        const q = this.toStage(e), c = this.cam;
        if (!c) return q;
        return { x: (q.x - c.tx) / c.s, y: (q.y - c.ty) / c.s };
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
        if (this.phase === 'overview') return { at: KITCHEN_ART.SLOTS.fridgeDoor };

        if (this.phase === 'fridge') {
            if (this.onBoard.length) {
                // Указываем на РУЧКУ доски: середина занята продуктами, и
                // кольцо там читалось бы как «тащи вот этот продукт».
                return {
                    stage: true,
                    at: { x: F.board.fridge.x + 150, y: F.board.fridge.y },
                    dragTo: { x: 380, y: F.board.fridge.y }
                };
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
            return {
                stage: true,
                at: { x: F.board.chop.x + 150, y: F.board.chop.y },
                dragTo: { x: F.board.chop.x + 150, y: 140 }
            };
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

    // Сколько увели палец от точки захвата. Порог перехода считается по
    // ПУТИ, а не по конечной точке: жест один и тот же, где бы за предмет ни
    // взялись — за левый край доски или за самую ручку.
    // 50, а не больше: доску берут за ручку у самого правого края, и места
    // вправо остаётся меньше полусотни точек. Порог, до которого нельзя
    // дотянуться, — это тот же тупик, только молчаливый.
    CARRY_MIN: 50,

    carried(d, e) {
        if (!d.from) return { dx: 0, dy: 0 };
        const p = this.toStage(e);
        return { dx: p.x - d.from.x, dy: p.y - d.from.y };
    },

    // Во сколько раз кухня уменьшена текущим наездом камеры.
    camScale() {
        const m = /scale\(([-\d.]+)\)/.exec(this.camEl.getAttribute('transform') || '');
        return m ? +m[1] : 1;
    },

    nodePos(node) {
        const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(node.getAttribute('transform') || '');
        return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
    },

    // Указатель переехал в передний план, поэтому переводить надо в другую
    // сторону: точки сцены (полки, кастрюля, кран) — в координаты стейджа.
    // Это чистая арифметика камеры, без матриц: q = s·p + t.
    sceneToStage(pt) {
        const c = this.cam;
        if (!c) return pt;
        return { x: c.tx + c.s * pt.x, y: c.ty + c.s * pt.y };
    },

    // Точка стейджа → CSS-пиксели слоя персонажа. Кухня вписана в рамку окна
    // с ОБРЕЗКОЙ (slice), поэтому единицы svg и пиксели слоя не совпадают и
    // зависят от формы окна; плюс весь холст отмасштабирован. И то и другое
    // считает SvgSpace: масштаб холста в разности прямоугольников
    // сокращается, поэтому ответ не зависит ни от какого CTM.
    stageToWorm(pt) {
        const host = this.wormStageEl;
        if (!host || !this.svgEl) return pt;
        return SvgSpace.toLocal(this.svgEl, pt.x, pt.y, host);
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
};

// Запуск — в конце gluttony-feed.js: он подключается последним из продолжений,
// и к этому моменту все методы уже на объекте.
