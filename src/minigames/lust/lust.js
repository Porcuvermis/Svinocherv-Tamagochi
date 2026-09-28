// ================= МИНИ-ИГРА ГРЕХ ПОХОТИ: ВАННАЯ =================
// Замысел — docs/plan/21-lust-bath.md. Червь лежит в ванне, игрок его моет.
//
// ---------- ХОД ЗАБЕГА ----------
//   кран → вода → мыло (широкие мазки) → мочалка (короткие тёрки)
//        → хвост → пузыри → финал на меткость
//
// Забег собран целиком: от крана до финала на меткость.
//
// ---------- ЧТО ЗДЕСЬ НЕ ЖИВЁТ ----------
// Ни одного числа раскладки. Гнёзда приходят из ЯКОРЕЙ запекания
// (BATH_ART.slots()) — точек мира, спроецированных той же камерой, что и
// предметы. Разъехаться с картинкой они не могут по построению. Числа
// баланса — в ECONOMY.minigames.lust.
//
// ---------- ПОЧЕМУ ДВА РАЗНЫХ ДВИЖЕНИЯ ----------
// Мыло и мочалка механически похожи: и там, и там водишь пальцем по телу.
// Оставить их одинаковыми — значит заставить игрока сделать одно и то же
// дважды подряд. Поэтому мыло — ШИРОКИЕ МАЗКИ (красит проходом), мочалка —
// КОРОТКИЕ ТЁРКИ НА МЕСТЕ (клетка засчитывается с третьего раза).
const LustMinigame = {
    screenElement: null,
    win: null,
    svgEl: null,        // передний холст: вода, следы, предмет в руке
    backEl: null,       // задний холст: комната и чаша
    camEl: null,
    camBackEl: null,
    fgEl: null,
    // Мыло или мочалка, отпущенные посреди этапа: где лежат и за какую
    // точку рисунка их брали (onUp, looseHit).
    loose: null,
    wormHost: null,
    wormHandle: null,

    // Ступени забега. Держатся строкой, а не числом: в отладке видно, где ты.
    phase: 'idle',      // idle → rinse → soap → cloth → tail → pop → rub → aim → done
    drag: null,
    fillRaf: 0,

    // Мытьё — время трения (soapRub), пена растёт заготовкой (lather-grow.js).
    rub: 0,            // прогресс этапа мыла или мочалки, 0…1
    rubLast: null,     // прошлое касание: откуда считать путь
    _grows: null,      // выращенная муть и пена: { soap, cloth }
    _cover: null,      // габарит червя в сцене, посчитанный по нарисованному
    _bbox: null,       // габарит нарисованного червя в единицах его холста

    // ---------- СЛЕД НА ТЕЛЕ ----------
    // Маска силуэта: снимок нарисованного червя, по которому обрезается мыло.
    // Во сколько раз холст мельче единиц сцены — от этого зависит только
    // резкость следа при наезде.
    //
    // Двойка вместо тройки экономит вчетверо меньше, чем кажется: замер
    // показал 2.75 → 2.60 мс на перерисовку следа, потому что платится не за
    // площадь, а за две сотни кружков. Резкостью следа за 5% кадра платить
    // незачем — оставлена тройка.
    MASK_SCALE: 3,
    mask: null,        // canvas с силуэтом, альфа 0 или 255
    washCtx: null,

    // ---------- ФИНАЛ ----------
    // Изгиб хвоста держится ЗДЕСЬ, а не в разметке: по нему считается и
    // картинка, и попадание, и это обязано быть одно и то же число.
    bend: 0,           // на сколько радиан уведён кончик от вертикали
    bendHand: null,    // угол пальца вокруг корня на прошлом событии
    bendAim: 0,        // изгиб, при котором кончик смотрит в рот
    bubbles: null,
    charge: 0,          // 0..1, насколько хвост налит поглаживанием
    drops: null,       // капли в полёте
    splats: null,      // куда не попали: прилипло и стекает
    dropAcc: 0,
    shotsLeft: 0,
    hits: 0,
    aimRaf: 0,
    aimLast: 0,
    shotTimer: 0,
    hintTimer: 0,

    // Между толчками. Финал длится ВСЕГДА одинаково (finalMs в конфиге), а
    // толчков столько, сколько даёт ступень хвоста: лишние толчки сокращают
    // паузу, и растёт темп, а не длина этапа.
    shotMs() {
        const C = this.cfg();
        return (C.finalMs || 15000) / Math.max(1, this.tailTier().shots || 10);
    },

    // ---------- УПРУГОСТЬ ХВОСТА ----------
    // Хвост НЕ идёт туда, куда показывает палец, и НЕ стоит там, куда его
    // поставили. Обе версии уже были и обе не играются:
    //
    //   1. Ставился в точку пальца — навёл и попал, целиться не во что.
    //   2. Вставал в равновесие «палец против упругости» — держишь палец
    //      неподвижно, и хвост стоит сам. Опять не игра: нашёл положение и
    //      забыл про него.
    //
    // Теперь это ТОЛЧКИ. Палец наклоняет хвост ДВИЖЕНИЕМ: наклон прибавляется
    // от того, на сколько палец провёл по дуге вокруг корня, а не от того,
    // где он остановился. Хвост при этом всё время выпрямляется сам, и тем
    // быстрее, чем сильнее согнут. Держишь палец неподвижно — хвост уходит в
    // прямое положение; чтобы удержать угол, его надо подталкивать снова и
    // снова, и легко перегнуть.
    // 1.2, а не 1.8: камера смотрит в лоб, и вся дуга полёта теперь лежит
    // поперёк ванны. Прицел на такой дуге приходится примерно на 40° от
    // вертикали, и размах в 103° оставлял половину хода за пределами того,
    // чем вообще можно целиться.
    BEND_MAX: 1.0,     // предел изгиба, радианы
    // Ход пальца переводится в наклон с ЗАПАСОМ НА ТОЧНОСТЬ: окно попадания
    // по изгибу — четверть радиана, и толчок должен быть заметно мельче него,
    // иначе прицел проскакивается одним движением.
    // Отдача свайпа и скорость выпрямления — НЕ здесь, а в ступени хвоста
    // (ECONOMY.minigames.lust.upgrades.tail: gain, relax) и считаются
    // LustShot.pushBend / relaxBend. Нынешние 0.55 и 0.20 — это третья
    // ступень: по замыслу середина лестницы, а не её начало.
    // Выпрямление подобрано под ход пальца: чтобы держать прицел, хватает
    // подталкивания примерно дважды в секунду. Быстрее — рука не успевает,
    // медленнее — можно поставить и забыть, а это уже было и не игралось.
    BEND_HARD: 1.3,    // насколько быстрее выпрямляется на пределе
    // Ближе этого к корню угол пальца скачет от любого дрожания, и толчок
    // выходит случайным.
    BEND_MIN_R: 45,

    cfg() {
        return (typeof ECONOMY !== 'undefined' && ECONOMY.minigames
                && ECONOMY.minigames.lust) || {};
    },

    grid() { return this.cfg().grid || { nx: 9, ny: 13 }; },

    // Сколько секунд тереть — куплено ступенью своего инструмента.
    stageRub(kind) {
        const k = kind || (this.phase === 'cloth' ? 'cloth' : 'soap');
        const t = this.up(k, null) || {};
        return t.rub || (k === 'cloth' ? 10 : 9);
    },

    // ---------- ЖИЗНЕННЫЙ ЦИКЛ ----------
    init() {
        this.screenElement = document.getElementById('lust-game');
        if (!this.screenElement) return;

        if (typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'lust',
                onLeave: () => this.close(),
                // Спрашивать не о чем, пока вода не включена: забег ещё не
                // начинался и терять нечего.
                canLeave: () => this.phase === 'idle' || this.phase === 'done'
            });
        }

        this.svgEl = document.getElementById('bt-svg');
        this.backEl = document.getElementById('bt-back');
        this.stageEl = document.getElementById('bt-stage');
        this.camEl = document.getElementById('bt-cam');
        this.camBackEl = document.getElementById('bt-cam-back');
        // Холсты дождя ездят той же камерой, что и всё остальное. Отдельные
        // элементы они не ради порядка в разметке, а ради композитора:
        // бесконечная анимация внутри общего svg метит грязной всю комнату
        // (комментарий в index.html).
        // Все группы, которым нужен один и тот же переезд камеры. Холстов
        // несколько не для порядка в разметке, а по частоте изменений
        // (комментарий в index.html), но камера у них общая.
        this.camRainEls = [document.getElementById('bt-cam-rain-far'),
                           document.getElementById('bt-cam-rain-near'),
                           document.getElementById('bt-cam-under'),
                           document.getElementById('bt-cam-shelf'),
                           document.getElementById('bt-cam-over')];
        // Пары «неподвижная обёртка — едущий холст». Обёртке задаётся
        // обрезка верха, холсту — на сколько ехать и за сколько.
        this.rainLayers = [
            { clip: document.getElementById('bt-rain-far'),
              step: BATH_ART.RAIN.step.far, dur: BATH_ART.RAIN.dur.far },
            { clip: document.getElementById('bt-rain-near'),
              step: BATH_ART.RAIN.step.near, dur: BATH_ART.RAIN.dur.near }
        ];
        this.fgEl = document.getElementById('bt-fg');
        // Цвет свечения ждущей вещи — из палитры, а не числом в css.
        this.screenElement.style.setProperty('--bt-ready', PALETTE.bathScene.bathReady);
        this.wormHost = document.getElementById('bt-worm');
        if (!this.svgEl || !this.backEl) return;

        // Холсты следа живут в тех же единицах, что и холст червя, и потому
        // ездят с ним одним преобразованием (см. layoutWorm).
        const B = this.WORM_BASE, S = this.MASK_SCALE;
        const c = this.el('bt-wash');
        c.width = B.w * S; c.height = B.h * S;
        c.style.width = B.w + 'px'; c.style.height = B.h + 'px';
        this.washCtx = c.getContext('2d');
        // Слои бликов — вдвое мельче холста мытья: блик — мягкая точка, резкость
        // ему не нужна, а память трёх полноразмерных слоёв на айфоне дорога.
        const gw = this.el('bt-glint');
        if (gw) {
            gw.width = B.w * S; gw.height = B.h * S;
            gw.style.width = B.w + 'px'; gw.style.height = B.h + 'px';
            this.glintCtx = gw.getContext('2d');
        }

        this.camBackEl.innerHTML = BATH_ART.sceneBack();
        document.getElementById('bt-cam-shelf').innerHTML = BATH_ART.sceneShelf();
        this.el('bt-cam-under').innerHTML = BATH_ART.sceneUnder();
        this.camEl.innerHTML = BATH_ART.sceneFront();
        this.el('bt-cam-over').innerHTML = BATH_ART.sceneOver();

        if (typeof LustGoo !== 'undefined') LustGoo.init(this);
        if (typeof LustShop !== 'undefined') LustShop.init(this);
        if (typeof LustDebug !== 'undefined') LustDebug.init(this.screenElement);

        // ---------- УЗЕЛ ПОХОТИ В КОЛЕСЕ ГРЕХОВ ----------
        // Горит по ТАЙМЕРУ НАГРАДЫ, а не по шкале: у похоти потребность и
        // награда разведены. Что считать готовностью, знает переходник.
        if (typeof SinsMenu !== 'undefined' && typeof Backend !== 'undefined') {
            SinsMenu.readers.lust = () => Backend.rewardReady('lust');
        }
        // Вход в магазин — ПОКА кнопка. Потом он переедет в предмет сцены
        // (нарративный вход — отдельная работа); до тех пор главное, чтобы он
        // был доступен ровно тогда, когда положено: до забега и после него.
        this.shopBtn = document.getElementById('bt-shop-btn');
        if (this.shopBtn) this.shopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.shopAllowed() && typeof LustShop !== 'undefined') LustShop.show();
        });

        this.svgEl.addEventListener('pointerdown', (e) => this.onDown(e));
        window.addEventListener('pointermove', (e) => this.onMove(e));
        window.addEventListener('pointerup', () => this.onUp());
        window.addEventListener('pointercancel', () => this.onUp());
    },

    open() {
        if (!this.screenElement) this.init();
        if (!this.screenElement || !this.svgEl) return;
        this.screenElement.classList.add('active');
        if (typeof MinigameWindow !== 'undefined') MinigameWindow.pauseRoom();

        this.phase = 'idle';
        this.drag = null;
        this.loose = null;
        this.floatTool(false);
        if (typeof LustShop !== 'undefined') LustShop.close();
        if (typeof LustDebug !== 'undefined') LustDebug.render();
        // Сцена собрана один раз, а ступень мыла могла смениться, пока
        // ванная была закрыта (сейв подтянулся позже сборки, покупка в
        // другом месте) — предмет на полке берётся свежим на каждом входе.
        if (typeof BATH_SOAP !== 'undefined') BATH_SOAP.refresh();
        this.syncShopButton();
        this.resetCover();
        this.wipeLather();
        this.el('bt-bubbles').innerHTML = '';
        this.el('bt-cam-rain-far').innerHTML = BATH_ART.rain(false);
        this.el('bt-cam-rain-near').innerHTML = BATH_ART.rain(true);
        // bt-splats здесь НЕТ: там разметка слоя потёков, её чистит
        // LustGoo.reset(), а не выбрасывает.
        for (const id of ['bt-tail', 'bt-foam', 'bt-bubbles', 'bt-shots',
                          'bt-gauge', 'bt-ammo', 'bt-spot'])
            this.el(id).innerHTML = '';
        this.setOpacity('bt-tail', 0);
        this.el('bt-tail').removeAttribute('transform');
        this.bubbles = null;
        this.pile = null;
        this.mouthFill = null;
        this.mouthAt = null;
        // Слои очищены — значит и пул узлов живого слоя больше ни на что не
        // указывает: узлы из него только что выброшены вместе с разметкой.
        this._pool = null;
        this._tailKey = null;
        this._tailTs = 0;
        this.charge = 0;
        this.hits = 0;
        this.shotsLeft = 0;
        this.setOpacity('bt-rain-far', 0);
        this.setOpacity('bt-rain-near', 0);
        this.setOpacity('bt-rain-veil', 0);
        this.clearHoming();
        this.fgEl.innerHTML = '';
        this.wormHost.classList.remove('bt-soft');
        this.drops = [];
        this.splats = [];
        this.setFly('', '');
        // Следы прошлого захода смыты: они живут, пока игрок в ванной.
        if (typeof LustGoo !== 'undefined') LustGoo.reset();
        if (this.wormHandle && this.wormHandle.setFrameHz) this.wormHandle.setFrameHz(8);
        this.stopPanting();
        this.blurFar(0, 0);
        this.showTools(true);
        this.ready('shower');

        // Камера ПЕРЕД монтажом: она выставляет холст червя, а рендерер
        // меряет его размер один раз, при монтаже.
        this.setCamera('overview');
        this.mountWorm();
    },

    close() {
        this.screenElement.classList.remove('active');
        // Прилавок закрывается ВМЕСТЕ с игрой. Иначе он встретит игрока
        // открытым в следующий заход — поверх ещё не начавшегося забега.
        if (typeof LustShop !== 'undefined') LustShop.close();
        this.stopClocks();
        this.stopPanting();
        // Живой флакон мыла не крутится за закрытой дверью (docs/traps.md,
        // пп. 37–38: закрытые мини-игры продолжали крутить украшения).
        if (typeof BATH_SOAP !== 'undefined') BATH_SOAP.stop();
        this.glintStop();
        // Ушёл из ванной — следы смыты (docs/plan/21-lust-bath.md, разд. 3в).
        if (typeof LustGoo !== 'undefined') LustGoo.reset();
        this.drag = null;
        this.loose = null;
        this.floatTool(false);
        this.clearHoming();
        this.fgEl.innerHTML = '';
        if (typeof MinigameWindow !== 'undefined') {
            MinigameWindow.resumeRoom();
            MinigameWindow.restoreHud();
        }
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
    },

    // ---------- МЕЛОЧИ ----------
    el(id) { return document.getElementById(id); },
    setOpacity(id, v) { const n = this.el(id); if (n) n.style.opacity = String(v); },

    // Что сейчас трогать. Подсказка без слов и без указателя: нужная вещь
    // дышит, остальные стоят смирно (инвариант 9). Мыло и мочалка зовут
    // иначе — сами поднимаются с полки и парят (liftTool); здесь только душ.
    ready(what) {
        const n = this.el('bt-shower');
        if (n) n.classList.toggle('bt-ready', what === 'shower');
    },

    // ---------- КАМЕРА ----------
    // Ровно та же формула, что на кухне: наезд — это crop и zoom одной
    // картинки, а не движение камеры в пространстве. На этом же свойстве
    // держится запекание (docs/bake-3d.md).
    //
    // Едут ОБЕ группы, одним и тем же преобразованием: комната и вода лежат
    // на разных холстах, и разъехаться им нельзя.
    // Наезд ПЛАВНЫЙ, но не средствами css. Первый плавный переезд ехал
    // по-разному у трёх слоёв: группы сцены анимировал css, а слой червя и
    // холст мытья ставились по числам камеры сразу — и всё время переезда
    // комната, персонаж и пена шли вразнобой. Тогда переезд убрали вовсе.
    //
    // Теперь анимируются САМИ ЧИСЛА камеры, а кадр целиком выставляется из
    // них: и группы сцены, и слой червя, и холст мытья. Разъехаться нечему —
    // все трое каждый кадр берут одну и ту же тройку (s, tx, ty).
    camAt(s, tx, ty) {
        this.cam = { s, tx, ty };
        const t = `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`;
        this.camEl.setAttribute('transform', t);
        this.camBackEl.setAttribute('transform', t);
        for (const n of (this.camRainEls || [])) if (n) n.setAttribute('transform', t);
        this.layoutWorm();
    },

    camFor(name) {
        const f = BATH_ART.FOCUS[name] || BATH_ART.FOCUS.overview;
        const s = Math.min(390 / f.w, 844 / f.h);
        return { s, tx: 195 - s * (f.x + f.w / 2), ty: 422 - s * (f.y + f.h / 2) };
    },

    // Переезд НЕ раскладывается по кадрам. Раскладывался: каждый кадр
    // проставлялись новые числа камеры во все шесть групп сцены, и браузер
    // честно растрировал шесть полноэкранных слоёв заново — кадры на
    // переезде падали вдвое (53 против 24).
    //
    // Теперь переезд считается ОДИН РАЗ, как разница между кадром «откуда»
    // и кадром «куда», и отдаётся композитору обычным css-переходом на
    // обёртке сцены. Дальше слои просто едут готовыми текстурами: ни одной
    // перерисовки, ни одного стилевого хода до самого конца.
    //
    // Картинка при этом на время переезда чуть мягче — растр растягивается,
    // — но по прибытии обёртка сбрасывается и настоящие числа камеры
    // проставляются начисто. На секунду движения этого не видно.
    setCamera(name, ms) {
        const to = this.camFor(name);
        this.endCamMove();
        const from = this.cam, body = this.stageEl;
        if (!ms || !from || !body) { this.camAt(to.s, to.tx, to.ty); return; }

        // ---------- ПЕРЕЕЗД ЕДЕТ ПО КАДРУ С ЗАПАСОМ ----------
        // Слои едут ГОТОВЫМИ ТЕКСТУРАМИ, и в текстуре есть только то, что
        // было в кадре на момент старта. Всё, что въезжает в кадр по дороге,
        // нарисовать было не из чего: на переезде «мытьё → хвост» левый край
        // оставался чёрным (17% кадра посреди движения), а поверх черноты
        // торчал кусок тела — червь лежит своим слоем и шире ванны, которая
        // его обычно закрывает.
        //
        // Поэтому перед переездом сцена ОДИН РАЗ рисуется камерой, в которую
        // влезают оба кадра сразу, — «откуда» и «куда». Дальше та же
        // css-анимация, только от этой общей картинки: сперва она без
        // перехода подгоняется так, чтобы выглядеть ровно как «откуда», потом
        // едет к «куда». Всё, что появится в кадре по пути, в ней уже есть.
        // Цена — растр на время движения чуть мягче (он рисовался мельче), а
        // по прибытии числа камеры проставляются начисто, и картинка снова
        // резкая.
        const both = this.camUnion(from, to, body);
        this.camAt(both.s, both.tx, both.ty);
        body.style.willChange = 'transform';
        body.style.transition = 'none';
        body.style.transform = this.camDelta(both, from, body);
        // Стартовое положение обязано примениться ДО того, как включится
        // переход: иначе браузер склеит две записи и поедет от «общего»
        // кадра, а не от «откуда», — картинка дёрнется на старте.
        void body.offsetWidth;

        this.camTo = to;
        body.style.transition = `transform ${ms}ms cubic-bezier(0.65, 0, 0.35, 1)`;
        body.style.transform = this.camDelta(both, to, body);
        this.camTimer = setTimeout(() => this.endCamMove(), ms + 40);
    },

    // Преобразование обёртки, при котором картинка, нарисованная камерой A,
    // выглядит как картинка камеры B. Камера живёт в единицах холста
    // (q = s·p + t), значит переход — это D(q) = c·q + (t_B − c·t_A) при
    // c = s_B/s_A. Осталось перевести это в пиксели: холст вписан в окно с
    // обрезкой, отсюда масштаб m и отступ off.
    camDelta(A, B, body) {
        const W = body.clientWidth, H = body.clientHeight;
        const m = Math.max(W / 390, H / 844);
        const offX = (W - 390 * m) / 2, offY = (H - 844 * m) / 2;
        const c = B.s / A.s;
        const ax = m * (B.tx - c * A.tx) + offX * (1 - c);
        const ay = m * (B.ty - c * A.ty) + offY * (1 - c);
        return `translate(${ax.toFixed(2)}px, ${ay.toFixed(2)}px) scale(${c.toFixed(5)})`;
    },

    // Камера, в кадр которой влезает всё, что видят обе камеры. Видимая
    // часть холста — не весь холст 390×844: он вписан в окно с обрезкой, и
    // на вытянутом экране срезаются бока или верх с низом. Поэтому
    // сравниваются именно ВИДИМЫЕ прямоугольники сцены, а общая камера
    // вписывает их объединение в ту же видимую часть.
    camUnion(A, B, body) {
        const W = body.clientWidth, H = body.clientHeight;
        const m = Math.max(W / 390, H / 844);
        const offX = (W - 390 * m) / 2, offY = (H - 844 * m) / 2;
        const v = { x0: -offX / m, y0: -offY / m, x1: (W - offX) / m, y1: (H - offY) / m };
        const seen = (c) => ({ x0: (v.x0 - c.tx) / c.s, y0: (v.y0 - c.ty) / c.s,
                               x1: (v.x1 - c.tx) / c.s, y1: (v.y1 - c.ty) / c.s });
        const a = seen(A), b = seen(B);
        const r = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
                    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
        const s = Math.min((v.x1 - v.x0) / (r.x1 - r.x0), (v.y1 - v.y0) / (r.y1 - r.y0));
        return { s,
                 tx: (v.x0 + v.x1) / 2 - s * (r.x0 + r.x1) / 2,
                 ty: (v.y0 + v.y1) / 2 - s * (r.y0 + r.y1) / 2 };
    },

    // Приехали (или переезд прервали новым): обёртка сбрасывается, а числа
    // камеры проставляются начисто — с этого мгновения картинка снова
    // считается по-настоящему и резко.
    endCamMove() {
        clearTimeout(this.camTimer); this.camTimer = 0;
        const body = this.stageEl;
        if (body) {
            body.style.transition = '';
            body.style.transform = '';
            body.style.willChange = '';
        }
        if (this.camTo) {
            const to = this.camTo;
            this.camTo = null;
            this.camAt(to.s, to.tx, to.ty);
        }
    },

    // ---------- ПЕРЕВОД КООРДИНАТ ----------
    // Через SvgSpace (rect + viewBox), а не через getScreenCTM: вся игра
    // лежит в контейнере с css-трансформацией, а учитывает ли CTM
    // трансформацию ПРЕДКА — вопрос браузера. На айфоне вне Telegram масштаб
    // холста был ровно единицей, и разницы не было; внутри Telegram он стал
    // 0.85–0.9, и червь оказался больше ванны. Подробности — в
    // src/core/svg-space.js.
    //
    // Камера подставляется ЧИСЛАМИ (см. camAt): холст → сцена это q = s·p + t,
    // значит обратно p = (q − t)/s. Во время переезда камеры числа отстают от
    // картинки на длину анимации — там ввод и не ловится.
    toStage(e) { return SvgSpace.fromClient(this.svgEl, e.clientX, e.clientY); },

    toScene(e) {
        const q = this.toStage(e), c = this.cam;
        if (!c) return q;
        return { x: (q.x - c.tx) / c.s, y: (q.y - c.ty) / c.s };
    },

    // Точка сцены → пиксели слоя червя (нетрансформированные, в них и задаётся
    // его смещение). Масштаб холста в разности прямоугольников сокращается,
    // поэтому ответ не зависит ни от какого CTM.
    sceneToHost(pt) {
        const host = this.wormHost, c = this.cam;
        if (!this.svgEl || !c || !host || !host.offsetParent) return { x: 0, y: 0 };
        return SvgSpace.toLocal(this.svgEl,
                                c.tx + c.s * pt.x,
                                c.ty + c.s * pt.y,
                                host.offsetParent);
    },

    // ---------- ЧЕРВЬ ----------
    // ---------- В ВАННОЙ РАЗДЕВАЮТСЯ ----------
    // Червь в ванной ВСЕГДА голый, что бы на нём ни было надето снаружи. Наряд
    // подставляет общая загрузка модели (withCosmetics в worm-model.js) — ей и
    // положено: купленное носится во всех грехах. Здесь он снимается с
    // КОПИИ, которую монтирует ванная; в состоянии игрока наряд остаётся, и
    // из ванной червь выходит одетым.
    //
    // Шрамы — не одежда, они на коже и остаются.
    bathModel() {
        const model = window.WormModelAPI.loadWormModel();
        model.cosmetics = {};
        return model;
    },

    mountWorm() {
        if (!window.WormModelAPI || !window.WormRenderer || !this.wormHost) return;
        if (!this.wormHandle) {
            const model = this.bathModel();
            this.wormHandle = window.WormRenderer.mount(this.wormHost, model, {
                context: 'lust',
                // Смотрит ВЛЕВО — но развёрнута только ГОЛОВА. Полное
                // зеркало (opts.flip) переворачивает и посадку тела: живот
                // уходит на другую сторону, а вместе с ним обязан переехать
                // и хвост — он торчит из тела, а не из воздуха. Тело при
                // этом никуда поворачиваться не должно: червь просто
                // повернул морду.
                headFlip: true,
                // Червь сидит в ванне по живот: хвоста и звеньев за животом
                // у него нет ВОВСЕ — ни звеньев, ни силуэта, ни колец.
                // Хвост в финале свой, отдельный (BATH_ART.tail).
                endAtBelly: true,
                // Червь тут ПОЧТИ НЕ ДВИЖЕТСЯ: не бродит, не покачивается,
                // мимика меняется медленно. Шестьдесят пересчётов в секунду
                // ему не нужны, а стоит он дороже всей остальной сцены
                // вместе взятой (docs/traps.md, п. 36).
                frameHz: 8,
                // Лёжа: червь в ванне, а не стоит в ней.
                pose: 'standing',
                wander: false,
                blink: true,
                // Червя моют — он лежит смирно. Не украшение: маска силуэта,
                // по которой обрезается мыло, снимается один раз, и
                // покачивающееся тело из-под неё уезжало бы.
                idleWave: false
            });
        } else {
            this.wormHandle.update(this.bathModel());
        }
        this.applyCondition();
        this.layoutWorm();
        // Габарит червя мерится ПОСЛЕ первого кадра рендерера. На монтаже
        // цепочка ещё не расставлена — все сегменты стоят в нуле, и getBBox
        // отдаёт одну голову. Раскладка по такому габариту выходила вчетверо
        // крупнее нужной, а мылить давали только морду.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this._bbox = null;
            this._cover = null;
            this.layoutWorm();
            this.buildMask();
        }));
    },

    // ---------- ЧЕРВЬ ПРИХОДИТ КАКОЙ ЕСТЬ ----------
    // Мини-игра монтирует СВОЙ экземпляр персонажа, и всё, что главный экран
    // навешивает на своего, здесь не появляется само: обесцвечивание от
    // истощения и худоба — это не модель, а живые каналы поверх неё
    // (worm.js, WormMood). Без них червь в ванне выходил бодрым и розовым,
    // даже когда снаружи он серый и отощавший, — то есть игрок видел не
    // своего червя, а образцового.
    //
    // Модель при этом уже настоящая: отметины, живот, взросление приходят
    // из loadWormModel(). Здесь добавляется только самочувствие.
    //
    // МОРДУ САМОЧУВСТВИЕ НЕ ТРОГАЕТ. Мимика грусти опускает веки, а в этой
    // мини-игре веки — рабочий указатель: они опускаются по ходу
    // поглаживания. Начинать надо с ПОЛНОСТЬЮ открытых, иначе у грустного
    // червя указателю некуда двигаться. Заодно это сброс: свой экземпляр
    // переживает закрытие мини-игры, и после пройденного забега червь
    // открывал её с полуприкрытыми глазами и открытым ртом от прошлого раза.
    applyCondition() {
        const h = this.wormHandle;
        if (!h || !h.setLivePose) return;
        let sat = 1, belly = 1;
        if (typeof WormCondition !== 'undefined'
            && typeof GameState !== 'undefined' && GameState.data) {
            if (WormCondition.dead()) { sat = 0.06; belly = 1 - ECONOMY.condition.witherThin; }
            else {
                const w = WormCondition.wither(WormCondition.mood());
                sat = w.saturation; belly = w.belly;
            }
        }
        if (h.setWither) h.setWither(sat);
        // Хвост рисуется не рендерером и обесцвечивается сам, тем же числом
        // (BATH_ART.tailTone) — иначе у уставшего серого червя торчал бы
        // сочный розовый хвост.
        this.skinSat = sat;
        h.setLivePose({
            bellyScale: belly,
            // Всё остальное — начисто. null значит «решает модель».
            eyelidLevel: 0, eyeSmile: null, browRaise: null,
            mouthOpenness: null, mouthCurve: null, earTilt: null,
            breathAmp: null, breathSpeed: null,
            mouthFill: 0, headTilt: null, tailBendAngle: 0
        });
        this.mouthFill = 0;
    },

    // Слой червя ездит вместе с камерой ОДНОЙ ТРАНСФОРМАЦИЕЙ, а размер
    // контейнера при этом НЕ меняется никогда. Так нарочно: рендерер
    // персонажа ставит себе viewBox по clientWidth контейнера и пересчитывает
    // его только по window.resize, которого при наезде камеры нет. Меняли бы
    // размер — червь остался бы со старым viewBox, и его единицы разъехались
    // бы с пикселями (первый вариант так и промахнулся: пена ложилась выше
    // тела на треть его роста).
    //
    // Поэтому холст червя — постоянные 300×150, а нужный размер в сцене
    // делает scale в transform.
    WORM_BASE: { w: 240, h: 320 },

    // Куда этот холст ложится в сцене.
    //
    // ---------- ЧЕРВЬ ВЫНЫРИВАЕТ, А НЕ ЛЕЖИТ ----------
    // Так было в первой, двумерной версии ванной, и так правильно: видно
    // голову и верх туловища, остальное тело уходит вниз, в воду, и его нет.
    // Лежащий поперёк чаши червь занимал весь кадр и не оставлял места ни
    // хвосту на переднем плане, ни шкале над головой.
    //
    // Линия среза — уровень воды: ниже неё червя не видно вовсе (обрезка
    // слоя ниже и стёртая маска мыла). Доля 0.72 подобрана по картинке: над
    // водой остаются голова и пара сегментов.
    // Макушка стоит здесь, а всё, что ниже борта, не показывается вовсе.
    // Раскладка задаётся ДВУМЯ этими числами, а не долей холста персонажа:
    // доля не знает, где у него голова и где кончается тело, и подгонялась
    // вслепую — над бортом оставалась одна морда, а мылить давали только её.
    // Глубже этого веки не опускаются НИКОГДА. Полностью прикрытые глаза
    // выключают морду, а именно ей червь и играет в финале.
    LID_MAX: 0.5,

    WORM_HEAD_TOP: 400,   // куда встаёт макушка, координаты сцены
    WORM_SHOW: 0.78,      // какая доля червя обязана быть выше борта

    // Докуда червя ВИДНО. Ниже этой линии его закрывает борт, и мылить там
    // нечего: игрок не видит ни грязи, ни пены. Камера смотрит в лоб, поэтому
    // это ПРЯМАЯ поперёк кадра — верх чаши и есть линия среза.
    visibleLine() {
        const t = BATH_ART.box('tub');
        return t ? t.y + 8 : 750;
    },

    // ---------- ЧТО УТОПЛЕНО ----------
    // Части ПОСЛЕ ЖИВОТА в ванне не показываются вовсе. Причина не в
    // красоте: борт режет червя ПРЯМОЙ, а хвост с последними сегментами
    // уходит у него вбок, а не вниз, — и лежал поверх борта отдельной
    // колбасой. Опустить его под борт нельзя, не утопив заодно голову:
    // тело жёсткое, а линия среза одна.
    //
    // Прячет САМ РЕНДЕРЕР (opts.endAtBelly), со сборки. Раньше здесь
    // прятались одни группы звеньев после монтажа — а единый силуэт,
    // перетяжки и кишка строятся по всей цепочке и продолжали лежать над
    // бортом «колбасой» без звеньев (видно было на этапе хвоста). Габарит
    // рендерер при этом держит от полной цепочки: по нему раскладывается
    // червь, и рот финала не сдвинулся.

    // Габарит НАРИСОВАННОГО червя в единицах его холста. Кэшируется: он не
    // меняется, пока модель та же.
    wormBBox() {
        if (this._bbox) return this._bbox;
        try {
            const r = this.wormHandle && this.wormHandle.svgRoot.getBBox();
            if (r && r.width > 1) return (this._bbox = r);
        } catch (e) { /* червя ещё нет */ }
        return { x: -10, y: 111, width: 180, height: 212 };
    },

    // Куда холст персонажа ложится в сцене. Считается ОТ ЧЕРВЯ: макушка на
    // WORM_HEAD_TOP, доля WORM_SHOW его роста — выше борта. Масштаб отсюда и
    // выводится, поэтому мылить всегда дают всё видимое тело.
    wormBoxScene() {
        const A = BATH_ART.slots(), bb = this.wormBBox(), B = this.WORM_BASE;
        const k = (this.visibleLine() - this.WORM_HEAD_TOP)
                / Math.max(1, bb.height * this.WORM_SHOW);
        return { x: A.worm.x - (bb.x + bb.width / 2) * k,
                 y: this.WORM_HEAD_TOP - bb.y * k,
                 w: B.w * k, h: B.h * k };
    },

    layoutWorm() {
        if (!this.wormHost) return;
        const box = this.wormBoxScene(), B = this.WORM_BASE;
        this.wormHost.style.width = `${B.w}px`;
        this.wormHost.style.height = `${B.h}px`;
        const a = this.sceneToHost({ x: box.x, y: box.y });
        // Масштаб мерим по двум точкам, а не берём из камеры: между сценой и
        // пикселями есть ещё и вписывание холста в рамку окна с обрезкой.
        const c = this.sceneToHost({ x: box.x + 100, y: box.y });
        const k = ((c.x - a.x) / 100 || 1) * box.w / B.w;
        const t = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) scale(${k.toFixed(4)})`;
        // Строка запоминается: дыхание в финале подмешивает к ней свой сдвиг
        // КАЖДЫЙ КАДР, и пересчитывать ради этого всю раскладку нельзя —
        // она читает getScreenCTM и габарит контейнера, то есть дёргает
        // раскладку страницы.
        this._wormT = t;
        this.wormHost.style.transform = t;

        // Дождю нужны те же две величины, что уже посчитаны для червя:
        // сколько экранных точек в единице сцены и где на экране верх струи.
        // Считать их отдельно значило бы второй раз за кадр дёрнуть
        // раскладку страницы.
        this.layoutRain((c.x - a.x) / 100 || 1);
        // Обрезки НЕТ. Прямая линия среза по уровню воды читалась ровно тем,
        // чем была, — обрезанным персонажем. Нижнюю половину прячет сама
        // чаша: она рисуется в переднем холсте, поверх слоя червя.
        // Холст мытья — в тех же единицах, значит и преобразование то же.
        const w = this.el('bt-wash');
        if (w) w.style.transform = t;
        const gl = this.el('bt-glint');
        if (gl) gl.style.transform = t;
        // Потёки на стене — в единицах СЦЕНЫ: холст лежит от её начала.
        const wall = this.el('bt-goo-wall');
        if (wall) {
            const o = this.sceneToHost({ x: 0, y: 0 });
            wall.style.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) `
                                 + `scale(${((c.x - a.x) / 100 || 1).toFixed(4)})`;
        }
    },

    // Обрезка верха и длина хода — в экранных точках, поэтому пересчитываются
    // при каждом переезде камеры. Обрезка стоит на НЕПОДВИЖНОЙ обёртке: на
    // едущем холсте она поехала бы вместе с ним (css применяет обрезку до
    // трансформации).
    layoutRain(pxPerScene) {
        if (!this.rainLayers) return;
        const top = this.sceneToHost({ x: 0, y: BATH_ART.RAIN.top }).y;
        for (const L of this.rainLayers) {
            if (!L.clip) continue;
            L.clip.style.setProperty('--rt', `${Math.max(0, top).toFixed(1)}px`);
            const mv = L.clip.firstElementChild;
            if (!mv) continue;
            mv.style.setProperty('--rp', `${(L.step * pxPerScene).toFixed(2)}px`);
            mv.style.setProperty('--rd', `${L.dur}s`);
        }
    },

    // ---------- МАСКА СИЛУЭТА ----------
    // Мыло обязано ложиться НА ЧЕРВЯ, а не на воду вокруг него. Силуэт для
    // этого берётся у самого нарисованного персонажа: его svg переводится в
    // картинку и растрируется один раз. Подбирать силуэт числами нельзя —
    // червь меняется отметинами, животом и будущим взрослением.
    //
    // Альфа приводится к ДВУМ значениям, 0 или 255: маска накладывается на
    // каждый мазок, и полупрозрачная кромка от повторов таяла бы, обгрызая
    // пену по краю тела.
    buildMask() {
        const root = this.wormHandle && this.wormHandle.svgRoot;
        if (!root) return;
        const B = this.WORM_BASE, S = this.MASK_SCALE, box = this.wormBoxScene();
        const copy = root.cloneNode(true);
        copy.setAttribute('width', B.w);
        copy.setAttribute('height', B.h);
        copy.setAttribute('viewBox', `0 0 ${B.w} ${B.h}`);
        // Всё красится в ПЛОСКИЙ чёрный, снимаются фильтры и прозрачности —
        // маске нужен один силуэт.
        //
        // А вот ОБРЕЗКИ СНИМАТЬ НЕЛЬЗЯ. Раньше снимались вместе со всем
        // остальным, и маска выходила ЗАМЕТНО БОЛЬШЕ червя: анатомические
        // слои сегментов обрезаны по своей форме, и без обрезки они
        // расползались за тело — из-под живота вылезал прямой косой клин, по
        // которому мыло ложилось на пустую плитку. Ссылки url(#...)
        // разрешаются: клонируется весь корень вместе с defs.
        //
        // Убирается только display:none — им спрятаны утопленные части
        // (opts.endAtBelly), и в маске их быть не должно тем более.
        const all = copy.querySelectorAll('*');
        for (const n of all) {
            const tag = n.tagName.toLowerCase();
            if (tag === 'filter') { n.remove(); continue; }
            if (n.closest('defs') || n.closest('clipPath')) continue;
            n.removeAttribute('mask');
            n.removeAttribute('filter');
            n.removeAttribute('style');
            n.removeAttribute('opacity');
            n.removeAttribute('fill-opacity');
            n.removeAttribute('stroke-opacity');
            if (n.hasAttribute('fill') || tag !== 'g') n.setAttribute('fill', '#000');
            if (n.hasAttribute('stroke')) n.setAttribute('stroke', '#000');
        }
        // Рамка габарита (opts.endAtBelly) после перекраски стала бы чёрным
        // прямоугольником во всю маску.
        for (const n of copy.querySelectorAll('.worm-extent')) n.remove();
        // Спрятанное остаётся спрятанным: style снят выше со всех, поэтому
        // прячем заново уже в клоне.
        for (const n of copy.querySelectorAll('[data-part]')) {
            const q = n.getAttribute('data-part') || '';
            if (q === 'tail' || q.indexOf('growing-') === 0)
                n.setAttribute('display', 'none');
        }
        const svg = new XMLSerializer().serializeToString(copy);
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = B.w * S; c.height = B.h * S;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0, c.width, c.height);
            try {
                const d = g.getImageData(0, 0, c.width, c.height);
                for (let i = 3; i < d.data.length; i += 4)
                    d.data[i] = d.data[i] > 24 ? 255 : 0;
                g.putImageData(d, 0, 0);
            } catch (e) { /* холст запачкан — сойдёт и мягкая кромка */ }
            // Ниже борта червя НЕ ВИДНО — там и мылить нечего. Линия берётся
            // у дальней половины чаши: ровно она его и закрывает. Раньше
            // стояла доля от холста персонажа, и клетки под бортом считались
            // «на теле»: игрок тёр видимое, а этап требовал невидимого.
            const cut = (this.visibleLine() - box.y) * (B.h / box.h) * S;
            g.clearRect(0, Math.max(0, cut), c.width, c.height);
            this.mask = c;
            // Альфа маски снимается ОДИН РАЗ и живёт рядом: по ней потом
            // проверяется, стоит ли центр пузыря на теле. Маска за этап не
            // меняется, а getImageData на каждую перерисовку следа — это
            // мегабайт чтения по десятку раз в секунду.
            this.maskAlpha = null;
            try {
                const d = g.getImageData(0, 0, c.width, c.height).data;
                const a = new Uint8Array(c.width * c.height);
                for (let i = 0, j = 0; j < a.length; i += 4, j++) a[j] = d[i + 3];
                this.maskAlpha = a;
            } catch (e) { /* холст запачкан — обойдёмся без проверки */ }
            // Коробка покрытия выводится ИЗ МАСКИ, значит её кэш обязан
            // сброситься здесь: до этой строки маски не было и коробка
            // считалась по запасному варианту.
            this._cover = null;
            this.maskReady();
        };
        img.onerror = () => {
            this.mask = null; this.maskAlpha = null; this._cover = null;
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    },

    // Маска снята (асинхронно, картинкой) — выращенное строится заново по
    // новому телу, и то, что успели натереть до этого, дорастает сразу.
    maskReady() {
        this._grows = null;
        this._eyes = null;
        if (this.phase === 'soap') this.growTo('soap', this.rub);
        else if (this.phase === 'cloth') { this.growTo('soap', 1); this.growTo('cloth', this.rub); }
    },

    // ---------- ПОКРЫТИЕ ----------
    // Клетки лежат на самом ЧЕРВЕ, а не на воде под ним. Первый вариант
    // считал покрытие по габариту воды: мазки по пустой воде рядом с телом
    // засчитывались, и пена оставалась там же — мыли ванну, а не червя.
    //
    // Габарит берётся у НАРИСОВАННОГО персонажа, а не подбирается числом:
    // единицы его холста переводятся в сцену тем же множителем, что и в
    // layoutWorm.
    // Габарит СИЛУЭТА — прямо по маске, а не по коробке червя с поджатием.
    // Поджатие было подобранным числом (семь процентов по бокам, вдвое
    // сверху) и врало: уши и макушка оказывались ВНЕ коробки, и мыло на них
    // не ложилось вовсе, а снизу коробка уходила на семь десятков единиц
    // ниже силуэта — там мылить было нечего, но клетки считались. Из ста
    // клеток сетки на теле оказывалось сорок.
    maskBounds() {
        if (!this.mask) return null;
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        let d;
        try {
            d = this.mask.getContext('2d')
                .getImageData(0, 0, this.mask.width, this.mask.height).data;
        } catch (e) { return null; }
        const W = this.mask.width, H = this.mask.height;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
            const row = y * W * 4;
            for (let x = 0; x < W; x++) {
                if (!d[row + x * 4 + 3]) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return null;
        const k = box.w / (B.w * S);          // пиксель маски → единица сцены
        return { x: box.x + x0 * k, y: box.y + y0 * k,
                 w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
    },

    coverBox() {
        if (this._cover) return this._cover;
        this._cover = this.maskBounds()
            || BATH_ART.box('tub') || { x: 100, y: 600, w: 500, h: 150 };
        return this._cover;
    },

    resetCover() {
        this.rub = 0;
        this.rubLast = null;
        this._pileQ = -1;
    },

    // ---------- ТРЕНИЕ ----------
    // Мытьё — время трения по телу (решение игрока): где тереть, не важно,
    // важно СКОЛЬКО. Так и у мыла, и у мочалки. Засчитывается ТОЛЬКО живой
    // палец: сюда приходят лишь движения указателя с инструментом в руке, а
    // оставленная на черве вещь (парит, loose) пальцем не ведётся и ничего
    // не натирает сама.
    //
    // p — точка касания в сцене (там, где пузо инструмента, а не палец),
    // t — время события, мс. Засчитывается путь по телу, но не больше
    // speed·dt, а dt одного события — не больше step: быстрее ступени этап
    // не пройти, а рывок после паузы трением не считается.
    // (rubMove — другое: это трение хвоста в финале.)
    soapRub(p, t, kind) {
        const last = this.rubLast;
        const on = this.onBody(p);
        this.rubLast = { x: p.x, y: p.y, t, on };
        if (!last || !on || !last.on) return 0;
        const R = this.cfg().rub || { speed: 220, step: 0.1 };
        const dt = Math.min(R.step, Math.max(0, (t - last.t) / 1000));
        const d = Math.min(Math.hypot(p.x - last.x, p.y - last.y), R.speed * dt);
        if (d <= 0) return 0;
        this.rub = Math.min(1, this.rub + d / (R.speed * this.stageRub(kind)));
        return d;
    },

    // Лежит ли точка сцены на теле — по той же маске, что режет муть.
    onBody(p) {
        const A = this.maskAlpha;
        if (!A || !this.mask) return true;          // маски нет — не мешаем мыть
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        const k = B.w / box.w * S, W = this.mask.width, H = this.mask.height;
        const i = Math.round((p.x - box.x) * k), j = Math.round((p.y - box.y) * k);
        return i >= 0 && j >= 0 && i < W && j < H && A[j * W + i] > 0;
    },

    // ---------- СЛЕД НА ХОЛСТЕ ----------
    // Видимый холст мытья — сумма выращенного: сперва плёнки (муть мыла,
    // подложка пены мочалки; обе обрезаны силуэтом), поверх — пузыри (не
    // обрезаны: выпуклые, у края тела торчат наружу). Пена мочалки ложится
    // ПОВЕРХ мути — тем и видно, где уже оттёрто.
    composeWash() {
        const ctx = this.washCtx;
        if (!ctx) return;
        const W = ctx.canvas.width, H = ctx.canvas.height, g = this._grows || {};
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, W, H);
        // Плёнки растворяются у глаз ЗДЕСЬ, один раз на сборку, а не на
        // своих холстах: те дорисовываются шагами, и стирание на каждом шаге
        // копилось — мягкий край к концу этапа выжигался в резкий круг
        // («очки», замечание игрока с айфона).
        const fade = this.eyeFade(W, H);
        let view = null;
        if (fade) {
            view = this._filmView = this._filmView || document.createElement('canvas');
            if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
            const v = view.getContext('2d');
            v.globalCompositeOperation = 'source-over';
            v.clearRect(0, 0, W, H);
            for (const k of ['soap', 'cloth']) if (g[k] && g[k].p > 0) v.drawImage(g[k].film, 0, 0);
            v.globalCompositeOperation = 'destination-in';
            v.drawImage(fade, 0, 0);
            v.globalCompositeOperation = 'source-over';
            ctx.drawImage(view, 0, 0);
        } else for (const k of ['soap', 'cloth']) if (g[k] && g[k].p > 0) ctx.drawImage(g[k].film, 0, 0);
        for (const k of ['soap', 'cloth']) if (g[k] && g[k].p > 0) ctx.drawImage(g[k].foam, 0, 0);
    },

    // ---------- РОСТ ПЕНЫ ПО ЗАГОТОВКЕ (lather-grow.js) ----------
    // Карта времени строится один раз на маску тела и вид мути; дальше
    // показ этапа p — это дорисовка частиц, чьё время пришло. Плёнка и
    // пузыри копятся на СВОИХ холстах: плёнку режет силуэт (она на коже),
    // пузыри — нет (выпуклые, у края тела торчат наружу); видимый холст мытья
    // — их сумма.
    growth(kind) {
        if (!this.mask || !this.maskAlpha || !this.washCtx) return null;
        // Вид мути — по ступени мыла; у пены мочалки вид пока один.
        const look = kind === 'soap' ? BATH_ART.latherLook() : null;
        const key = kind + '|' + (look ? look.key : 'foam');
        this._grows = this._grows || {};
        const G0 = this._grows[kind];
        if (G0 && G0.mask === this.mask && G0.key === key) return G0;
        const conf = BATH_ART.LATHER_GROW[kind] || BATH_ART.LATHER_GROW.soap;
        const W = this.mask.width, H = this.mask.height;
        const F = LatherGrow.field(this.maskAlpha, W, H, conf.seeds,
                                   { seed: conf.seed, noise: conf.noise, speed: conf.speed });
        if (!F) return null;
        // Клетка пены — та же величина, что у прежней сетки: виды мути
        // подобраны под неё (BATH_ART.LATHER).
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        const b = this.coverBox(), Gd = this.grid();
        const cell = Math.max(b.w / Gd.nx, b.h / Gd.ny) * 0.78 * (B.w / box.w * S);
        const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
        const A = this.maskAlpha;
        const G = {
            mask: this.mask, key, kind, look, F, cell, film: mk(), foam: mk(), idx: 0, p: 0,
            sprites: LatherGrow.sprites(F, cell, { seed: conf.seed * 31 + 5, whip: kind === 'cloth' }),
            // Пузырь садится только на тело и НЕ на глаз: пузырь с центром
            // на глазу не рождается вовсе, как лопнутый пальцем. Соседние
            // целые — и краем заходят на глаз (ГЛАЗА ЧИСТЫЕ, ниже).
            inside: (px, py) => {
                const i = Math.round(px), j = Math.round(py);
                return i >= 0 && j >= 0 && i < W && j < H && A[j * W + i] > 0 && !this.onEye(px, py);
            }
        };
        this._grows[kind] = G;
        return G;
    },

    // ---------- ГЛАЗА ЧИСТЫЕ ----------
    // Пены на глазах нет (просьба игрока), и сделано это РАЗНО для плёнки и
    // для пузырей — по тому, как ведёт себя настоящая пена:
    //   * пузырь, чей центр на глазу, не рождается вовсе — будто его лопнули
    //     пальцем (growth, inside). Соседние целые и краем заходят на глаз;
    //   * плёнка тает С ЗАПАСОМ до глаза и к краю глаза уже прозрачна; место
    //     таяния прикрыто соседними пузырями, и перехода не видно.
    // Два провала до этого. Стирание всего подряд мягким кругом давало
    // полупрозрачные огрызки пузырей — «аномалию прозрачности». Вырез плёнки
    // ровно по глазу читался вырезом, а мыло так не выглядит.
    // Глаза снимаются с НАРИСОВАННОГО червя (части eye-left / eye-right),
    // по экранным рамкам: они верны и на айфоне, где getScreenCTM врёт, и
    // не зависят от масштаба слоя червя — берётся доля от рамки его холста.
    // Ответ — в пикселях холста мытья.
    // В радиусах глаза: до inner плёнки нет, к outer она полная; между —
    // плавная ступенька (smoothstep), без излома на обоих краях. inner
    // больше единицы: плёнка кончается, НЕ ДОХОДЯ до глаза.
    EYE_CLEAR: { inner: 1.12, outer: 1.8 },

    // Лежит ли точка холста мытья на глазном яблоке.
    onEye(x, y) {
        for (const e of this.eyeSpots()) {
            const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry;
            if (dx * dx + dy * dy <= 1) return true;
        }
        return false;
    },

    eyeSpots() {
        if (this._eyes) return this._eyes;
        const root = this.wormHandle && this.wormHandle.svgRoot;
        if (!root) return [];
        const rr = root.getBoundingClientRect();
        if (!rr.width) return [];
        const B = this.WORM_BASE, S = this.MASK_SCALE, k = B.w / rr.width * S;
        const out = [];
        for (const part of root.querySelectorAll('[data-part="eye-left"], [data-part="eye-right"]')) {
            // Мерится САМО ГЛАЗНОЕ ЯБЛОКО — крупнейший эллипс прямо в части
            // глаза. Рамка всей части втрое выше глаза: в неё входят веко,
            // складка улыбки под глазом и бровь, и по ней стиралась вся
            // середина морды до пятачка.
            let el = part, best = 0;
            for (const c of part.children) {
                if (c.tagName.toLowerCase() !== 'ellipse') continue;
                const b = c.getBoundingClientRect();
                if (b.width * b.height > best) { best = b.width * b.height; el = c; }
            }
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            out.push({ x: (r.left + r.width / 2 - rr.left) * k, y: (r.top + r.height / 2 - rr.top) * k,
                       rx: r.width / 2 * k, ry: r.height / 2 * k });
        }
        this._eyes = out;
        return out;
    },

    // Маска растворения плёнки у глаз: непрозрачна везде, кроме глаз.
    // Строится один раз на тело (глаза снимаются вместе с маской тела) и
    // накладывается при сборке ОДИН раз — повторное наложение копится.
    // Пузыри не трогает: их на глазу просто нет.
    eyeFade(W, H) {
        const eyes = this.eyeSpots();
        if (!eyes.length) return null;
        const c = this._eyeFade;
        if (c && c.width === W && c.height === H && c._eyes === eyes) return c;
        const cv = c || document.createElement('canvas');
        cv.width = W; cv.height = H; cv._eyes = eyes;
        const g = cv.getContext('2d'), E = this.EYE_CLEAR;
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'destination-out';
        for (const e of eyes) {
            g.save();
            g.translate(e.x, e.y);
            g.scale(e.rx, e.ry);
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, E.outer);
            gr.addColorStop(0, 'rgba(0,0,0,1)');
            // Ступенька smoothstep по точкам: стёрто 1 − s(u).
            for (let i = 0; i <= 8; i++) {
                const u = i / 8, sm = u * u * (3 - 2 * u), r = E.inner + (E.outer - E.inner) * u;
                gr.addColorStop(r / E.outer, `rgba(0,0,0,${(1 - sm).toFixed(3)})`);
            }
            g.fillStyle = gr;
            g.beginPath(); g.arc(0, 0, E.outer, 0, Math.PI * 2); g.fill();
            g.restore();
        }
        g.globalCompositeOperation = 'source-over';
        this._eyeFade = cv;
        return cv;
    },

    // Новый забег: выращенное стирается, карты остаются (тело то же).
    growReset() {
        this.glintClear();
        for (const G of Object.values(this._grows || {})) {
            G.film.getContext('2d').clearRect(0, 0, G.film.width, G.film.height);
            G.foam.getContext('2d').clearRect(0, 0, G.foam.width, G.foam.height);
            G.idx = 0;
            G.p = 0;
        }
    },

    // Показать этап p ∈ [0, 1]. Назад — только сбросом (рост монотонный).
    growTo(kind, p) {
        const G = this.growth(kind);
        if (!G) return;
        const fc = G.film.getContext('2d'), oc = G.foam.getContext('2d');
        if (p < G.p) {
            fc.clearRect(0, 0, G.film.width, G.film.height);
            oc.clearRect(0, 0, G.foam.width, G.foam.height);
            G.idx = 0;
        }
        const was = G.p;
        G.p = p;
        let film = false, foam = false;
        const tool = kind === 'cloth' ? 'cloth' : 'soap';
        const sink = (bx, by, r, pc) => this.glintBubble(G, bx, by, r, pc);
        while (G.idx < G.sprites.length && G.sprites[G.idx].t <= p) {
            const s = G.sprites[G.idx++];
            if (s.part === 'base') film = true; else foam = true;
            BATH_ART.washCell(s.part === 'base' ? fc : oc, tool, s.x, s.y, G.cell, s.k == null ? 1 : s.k,
                              s.seed, s.part, G.inside, G.look, s.part === 'foam' ? sink : null);
        }
        if (film) {
            fc.globalCompositeOperation = 'destination-in';
            fc.drawImage(this.mask, 0, 0);
            fc.globalCompositeOperation = 'source-over';
        }
        if (foam) this.glintStart();
        // Холст мытья собирается, только когда что-то дорисовалось — или
        // когда слой впервые появился (p был 0).
        if (film || foam || (was <= 0 && p > 0)) this.composeWash();
    },

    // ---------- БЛЕСК ПУЗЫРЕЙ ОТ НАКЛОНА ----------
    // У КАЖДОГО пузыря свой блик, «дочерний» ему (решение игрока, макет
    // принят): он ходит от наклона телефона внутри круга reach·r своего
    // пузыря и ведёт себя как отражение на шаре — к краю сплющивается
    // поперёк, мельчает и тускнеет; напротив — слабое второе отражение. В
    // покое свет сверху слева, как во всей игре: блик посередине читался
    // линзой, а не шаром.
    //
    // Первая версия — три слоя бликов с перетеканием прозрачности — была
    // отвергнута: блик жил не в пузыре, а в слое поверх всей пены.
    //
    // Как это дёшево: форма блика у всех пузырей ОДНА (свет один), разнится
    // только масштаб. Поэтому за кадр рисуется одна заготовка (на цвет) и
    // штампуется на каждый пузырь — drawImage, самое быстрое, что есть у
    // холста. Холст — в разрешении холста мытья: пузыри в игре мелкие (радиус
    // в несколько точек), и на половинном блик выходил в полпикселя.
    // Перерисовка — только когда свет сдвинулся или появились пузыри; мелким
    // пузырям блика нет.
    GLINT: {
        // Покой блика — у каждой группы свой (groups ниже), все сверху слева.
        tilt: 0.6,                          // сколько круга проходит блик от полного наклона
        gain: 2.4,                          // чувствительность к наклону, как у флакона
        reach: 0.6,                         // круг хода блика, в радиусах пузыря
        // Где второе отражение и его размер; сила, размер главного блика,
        // ореол и порог размера пузыря — у вида (LATHER.glint).
        second: { at: 0.72, size: 0.12 },
        // Бликов не больше cap — у самых КРУПНЫХ пузырей. Замер (4× замедление,
        // червь в пене целиком, 1819 пузырей): со всеми бликами 20 кадров
        // из 60, с 400 крупнейшими — 53. Платится не рисование заготовки,
        // а отрисовка видимым холстом каждого штампа; у мелких пузырей блик
        // всё равно в точку.
        cap: 420,
        // Блик пены мочалки (пока один вид — лестница мочалки впереди).
        foam: { k: 0.7, size: 0.24, second: 0.35, halo: 0, min: 0.18 },
        // ТАНЕЦ: пузыри с бликом делятся по размеру на три группы, и у
        // каждой свой покой блика, своя сила и своя вязкость. Одна и та же
        // рука качает их по-разному: крупные тяжёлые отстают, мелкие
        // вертлявые забегают вперёд, — и пена не вспыхивает вся разом.
        // Покой — доля круга хода, как rest; k — множитель силы вида.
        groups: [
            { rest: { x: -0.25, y: -0.62 }, k: 0.8, lag: 0.1, tilt: 0.8 },    // крупные: выше и правее, тяжёлые
            { rest: { x: -0.3,  y: -0.3  }, k: 1,   lag: 0.2, tilt: 1 },      // средние: ближе к зениту, ярче всех
            { rest: { x: -0.62, y: -0.14 }, k: 0.9, lag: 0.38, tilt: 1.25 }   // мелкие: ниже и левее, вертлявые
        ],
        // ВСПЫШКИ. У каждого пузыря своя «точка вспышки» на кольце в
        // пространстве КАЧАНИЯ: качнул руку туда — вспыхнули пузыри, чья
        // точка там. Меряется не угол, а ДВИЖЕНИЕ — наклон минус его
        // медленная средняя (slow — доля за кадр, ~полсекунды): держишь
        // ровно под любым углом — вспышек нет, а естественная дрожь руки
        // (градус-два) уже водит их по пене. gain — сколько кольца на единицу
        // поворота (единица = 35°): 18 — ближний край кольца от 0.7° дрожи,
        // дальний от 1.8°. Кольцо начинается не ближе двух sigma от нуля:
        // иначе пузыри с ближней точкой светились бы и на неподвижном
        // телефоне (так и было — проверка молчала, потому что в покое холст
        // не перерисовывается).
        // Большой поворот не уводит качание за кольцо, а мягко упирается в
        // его край (tanh): повёл телефон — горят пузыри этой стороны.
        // Поворот — от ПОЗЫ ХВАТА по всем осям (Tilt.turn): телефон держат
        // стоймя, и главный жест руки — поворот вокруг вертикали, которого в
        // завале вбок нет вовсе.
        // star — искра на вспыхнувшем пузыре: четыре луча из точки блика
        // (half — полудлина луча в радиусах пузыря, thin — толщина к длине).
        // Одной яркости было мало: вспышку не замечали, сколько ни вертели
        // телефон. Искра нарочно шире пузыря — это отблеск, а пузыри в игре
        // в несколько точек, и луч внутри пузыря терялся в пикселе. Искр за
        // кадр не больше cap: штамп искры вчетверо больше блика по площади, и
        // без потолка перерисовка дорожала вдвое (замер под 4× замедлением).
        flash: { gain: 18, slow: 0.06, ring: [0.35, 0.9], sigma: 0.17, base: 0.5, boost: 1,
                 star: { half: 1.5, thin: 0.11, from: 0.3, cap: 40 } }
    },

    glintBubble(G, bx, by, r, pc) {
        const gp = G.kind === 'cloth' ? this.GLINT.foam : ((G.look && G.look.glint) || this.GLINT.foam);
        if (!gp.k || r < G.cell * gp.min) return;
        const P = btPal(), c = G.kind === 'cloth' ? P.foam : P.soapLather[G.look.key];
        // Ядро блика — светлое; ореол — в цвет свечения вида или, у
        // волшебной мути, в радужный цвет кромки своего пузыря.
        const halo = gp.halo ? (pc || c.glow || c.hi) : null;
        (this.glintBubs = this.glintBubs || []).push({ x: bx, y: by, r, k: gp.k, gp, core: c.hi, halo,
                                                      key: (G.look ? G.look.key : 'foam') + '|' + (halo || '') });
        this.glintDirty = true;
    },

    glintClear() {
        this.glintBubs = [];
        this._glintTop = null;
        this.glintDirty = true;
        const c = this.glintCtx;
        if (c) c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    },

    // Заготовка блика для единичного пузыря радиуса R0 в центре холста 2C×2C.
    // (lx, ly) — где свет в круге хода: 0 — середина, 1 — край.
    GLINT_R0: 24, GLINT_C: 32,
    glintStamp(b, lx, ly, sk) {
        const Gc = this.GLINT, R0 = this.GLINT_R0, C = this.GLINT_C, gp = b.gp, col = b.core;
        sk = sk || b.key;
        const cv = (this._stamps = this._stamps || {})[sk] || document.createElement('canvas');
        this._stamps[sk] = cv;
        // Холст заготовки не перевыделяется каждый кадр: смена размера — это
        // новый буфер, а размер у заготовки постоянный.
        if (cv.width !== C * 2) cv.width = cv.height = C * 2;
        const g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, C * 2, C * 2);
        const d = Math.min(0.99, Math.hypot(lx, ly)), z = Math.sqrt(1 - d * d);
        const ang = Math.atan2(ly, lx);
        const spot = (x, y, a, squash, alpha, color, soft) => {
            g.save();
            g.translate(x, y); g.rotate(ang); g.scale(squash, 1);   // сжатие вдоль радиуса
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, a);
            gr.addColorStop(0, color); gr.addColorStop(soft ? 0.1 : 0.45, color); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.globalAlpha = alpha;
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, a, 0, Math.PI * 2); g.fill();
            g.restore();
        };
        // Главный: к краю сплющен поперёк в √(1−d²), мельче и тусклее.
        const a = gp.size * R0 * (0.8 + 0.2 * z);
        const mx = C + lx * Gc.reach * R0, my = C + ly * Gc.reach * R0, sq = Math.max(0.28, z);
        // Ореол светящихся видов — под ядром, шире и мягче: блик светится,
        // а не просто блестит.
        if (gp.halo && b.halo) spot(mx, my, Math.min(C * 0.95, a * gp.halo.w), Math.max(0.5, sq), gp.halo.a, b.halo, true);
        spot(mx, my, a, sq, 0.55 + 0.45 * z, col);
        // Второе отражение — слабый серпик у кромки напротив.
        if (gp.second) spot(C - lx * Gc.second.at * R0, C - ly * Gc.second.at * R0, Gc.second.size * R0, 0.35, gp.second, col);
        return cv;
    },

    // Кому достаётся блик, в какой он группе и где его точка вспышки —
    // пересчитывается, только когда появились пузыри, а не каждый кадр.
    glintPick() {
        const all = this.glintBubs || [], Gc = this.GLINT, F = Gc.flash;
        const top = all.slice().sort((a, b) => b.r - a.r).slice(0, Gc.cap);
        const n = top.length;
        top.forEach((b, i) => {
            b.g = Math.min(2, Math.floor(i * 3 / Math.max(1, n)));
            // Точка вспышки — от места пузыря, а не от случая: одна и та же
            // пена танцует одинаково, и прогон повторим.
            const h = Math.sin(b.x * 12.9898 + b.y * 78.233) * 43758.5453, h1 = h - Math.floor(h);
            const q = Math.sin(b.x * 39.3468 + b.y * 11.135) * 24634.6345, h2 = q - Math.floor(q);
            const a = h1 * Math.PI * 2, rho = F.ring[0] + h2 * (F.ring[1] - F.ring[0]);
            b.hx = Math.cos(a) * rho; b.hy = Math.sin(a) * rho;
        });
        this._glintTop = top;
        this._glintTopN = all.length;
    },

    // P — где свет у каждой группы ([{lx, ly}] ×3), (dx, dy) — качание.
    // Искра — четыре мягких луча и яркая точка в месте главного блика своей
    // группы. Заготовка своя и крупнее блика: лучи выходят за пузырь.
    GLINT_SC: 52,
    glintStar(col, lx, ly, sk) {
        const Gc = this.GLINT, R0 = this.GLINT_R0, C = this.GLINT_SC, St = Gc.flash.star;
        const cv = (this._stamps = this._stamps || {})[sk] || document.createElement('canvas');
        this._stamps[sk] = cv;
        // Холст заготовки не перевыделяется каждый кадр: смена размера — это
        // новый буфер, а размер у заготовки постоянный.
        if (cv.width !== C * 2) cv.width = cv.height = C * 2;
        const g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, C * 2, C * 2);
        const h = St.half * R0;
        g.translate(C + lx * Gc.reach * R0, C + ly * Gc.reach * R0);
        for (const rot of [Math.PI / 4, -Math.PI / 4]) {
            g.save(); g.rotate(rot); g.scale(1, St.thin);
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, h);
            gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h, 0, Math.PI * 2); g.fill();
            g.restore();
        }
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, h * 0.3);
        gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h * 0.3, 0, Math.PI * 2); g.fill();
        return cv;
    },

    glintRedraw(P, dx, dy) {
        const ctx = this.glintCtx;
        if (!ctx) return;
        const t0 = performance.now();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const K = this.GLINT_C / this.GLINT_R0, stamps = {}, Gc = this.GLINT, F = Gc.flash;
        const s2 = F.sigma * F.sigma;
        if (!this._glintTop || this._glintTopN !== (this.glintBubs || []).length) this.glintPick();
        let nStar = 0;
        // Заготовка на цвет И группу: у групп свет в разных местах. Это три
        // рисования заготовки за кадр вместо одного — копейки против сотен
        // штампов.
        for (const b of this._glintTop) {
            const sk = b.key + '#' + b.g, gl = P[b.g];
            const st = stamps[sk] || (stamps[sk] = this.glintStamp(b, gl.lx, gl.ly, sk));
            const w = b.r * K, ex = dx - b.hx, ey = dy - b.hy;
            const f = Math.exp(-(ex * ex + ey * ey) / s2);
            // globalAlpha вне 0..1 холст молча игнорирует — отсюда min.
            const kk = b.k * Gc.groups[b.g].k;
            ctx.globalAlpha = Math.min(1, kk * (F.base + F.boost * f));
            ctx.drawImage(st, b.x - w, b.y - w, w * 2, w * 2);
            // Искра — только у вспыхнувших: лишний штамп у малой доли пены.
            if (f > F.star.from && nStar < F.star.cap) {
                nStar++;
                const zk = 'star|' + b.core + '#' + b.g;
                const zs = stamps[zk] || (stamps[zk] = this.glintStar(b.core, gl.lx, gl.ly, zk));
                const ws = b.r * this.GLINT_SC / this.GLINT_R0;
                ctx.globalAlpha = Math.min(1, kk * f);
                ctx.drawImage(zs, b.x - ws, b.y - ws, ws * 2, ws * 2);
            }
        }
        ctx.globalAlpha = 1;
        this.glintDraws = (this.glintDraws || 0) + 1;
        this.glintMs = performance.now() - t0;
    },

    // Цикл наклона: живёт, пока на теле есть пена. Не чаще 30 раз в секунду
    // и только если свет сдвинулся или добавились пузыри.
    glintStart() {
        if (this.glintRaf || !this.glintCtx || typeof requestAnimationFrame === 'undefined') return;
        const Gc = this.GLINT, F = Gc.flash;
        const L = this.glintLean = this.glintLean ||
            { g: Gc.groups.map(() => ({ x: 0, y: 0 })), sx: null, sy: 0, dx: 0, dy: 0, last: 0, key: null };
        const cl = (v, m) => Math.max(-m, Math.min(m, v));
        const step = (now) => {
            this.glintRaf = requestAnimationFrame(step);
            if (now - L.last < 33) return;
            L.last = now;
            const T = typeof Tilt === 'undefined' ? null : Tilt.turn ? Tilt.turn() : Tilt.lean ? Tilt.lean() : null;
            // Датчика нет (компьютер, отказ в разрешении) — свет плывёт сам и
            // чуть дрожит, как в руке, чтобы пена не стояла мёртвой.
            const t = now / 1000;
            const rx = T && T.live ? T.x : 0.33 * Math.sin(t * 0.5) + 0.02 * Math.sin(t * 2.3 + 1) + 0.012 * Math.sin(t * 3.7);
            const ry = T && T.live ? T.y : 0.2 * Math.sin(t * 0.31) + 0.018 * Math.sin(t * 1.9 + 2) + 0.01 * Math.sin(t * 4.3);
            // Качание: наклон минус медленная средняя. Совсем мелкое — ноль,
            // иначе цикл перерисовывал бы вечно доползающий хвост средней.
            if (L.sx === null) { L.sx = rx; L.sy = ry; }
            L.sx += (rx - L.sx) * F.slow; L.sy += (ry - L.sy) * F.slow;
            let dx = (rx - L.sx) * F.gain, dy = (ry - L.sy) * F.gain;
            const dm = Math.hypot(dx, dy), R1 = F.ring[1];
            if (dm > 1e-9) { const k = R1 * Math.tanh(dm / R1) / dm; dx *= k; dy *= k; }
            if (Math.abs(dx) < 0.05) dx = 0;
            if (Math.abs(dy) < 0.05) dy = 0;
            const tx = cl(rx * Gc.gain, 1), ty = cl(ry * Gc.gain, 1);
            // Наклон вправо (правый край вниз) — к свету поворачивается ЛЕВЫЙ
            // бок пузыря, блик уходит влево; верх к себе — блик вниз.
            // Сторона проверяется прогоном (test-soap.js), а не выводится в
            // уме (docs/traps.md, п. 116). Каждая группа догоняет наклон со
            // своей вязкостью и ходит на свою долю.
            let moved = Math.abs(dx - L.dx) + Math.abs(dy - L.dy) > 0.004;
            const P = Gc.groups.map((G, i) => {
                const q = L.g[i];
                q.x += (tx - q.x) * G.lag; q.y += (ty - q.y) * G.lag;
                let lx = G.rest.x - Gc.tilt * G.tilt * q.x, ly = G.rest.y + Gc.tilt * G.tilt * q.y;
                const m = Math.hypot(lx, ly);
                if (m > 0.99) { lx *= 0.99 / m; ly *= 0.99 / m; }
                if (q.lx == null || Math.abs(lx - q.lx) + Math.abs(ly - q.ly) > 0.008) moved = true;
                return { lx, ly };
            });
            if (!this.glintDirty && !moved) return;
            P.forEach((p, i) => { L.g[i].lx = p.lx; L.g[i].ly = p.ly; });
            L.dx = dx; L.dy = dy;
            this.glintDirty = false;
            this.glintRedraw(P, dx, dy);
        };
        this.glintRaf = requestAnimationFrame(step);
    },

    glintStop() {
        if (this.glintRaf) cancelAnimationFrame(this.glintRaf);
        this.glintRaf = 0;
        if (this.glintLean) this.glintLean.g.forEach(q => { q.lx = null; });
    },

    // Муть, пена и их блики видны и гаснут ВМЕСТЕ: это один след на теле.
    washShown(on, fadeMs) {
        for (const id of ['bt-wash', 'bt-glint']) {
            const n = this.el(id);
            if (!n) continue;
            n.style.transition = fadeMs ? `opacity ${fadeMs / 1000}s ease` : '';
            n.style.opacity = on ? '1' : '0';
        }
        if (!on) this.glintStop();
    },

    wipeLather() {
        const n = this.el('bt-wash');
        // Переход снимается: его ставит конец забега «только помыть», и без
        // сброса следующий забег начинался бы с того, что пена медленно
        // проявляется из ниоткуда.
        this.glintStop();
        this.washShown(true);
        if (this.washCtx) this.washCtx.clearRect(0, 0, n.width, n.height);
        this.growReset();
    },

    // ---------- ВВОД ----------
    onDown(e) {
        if (this.win && this.win.isConfirmOpen && this.win.isConfirmOpen()) return;
        const p = this.toScene(e);
        const A = BATH_ART.slots();

        if (this.phase === 'idle') {
            // Душ включает воду — это и есть старт забега.
            if (Math.hypot(p.x - A.showerHead.x, p.y - A.showerHead.y) < 96)
                this.startWater();
            return;
        }
        if (this.phase === 'soap' || this.phase === 'cloth') {
            const kind = this.phase;
            // Предмет отпущен посреди этапа — он лежит там, где его оставили,
            // а на полке его нет: брать его можно только оттуда.
            if (this.loose) {
                const at = this.looseHit(this.toStage(e));
                if (at) this.takeTool(kind, e, at);
                return;
            }
            // Высокий флакон берут и за горлышко — оно далеко от гнезда,
            // поэтому попадание считается и по габариту предмета.
            const b = kind === 'soap' ? BATH_SOAP.box() : null;
            const inBox = b && p.x > b.x - 12 && p.x < b.x + b.w + 12 && p.y > b.y - 12 && p.y < b.y + b.h + 12;
            if (inBox || Math.hypot(p.x - A[kind].x, p.y - A[kind].y) < 70) this.takeTool(kind, e);
            return;
        }
        if (this.phase === 'pop') { this.pop(p); return; }
        if (this.phase === 'rub') {
            this.drag = { kind: 'rub', t: null };
            this.rubMove(p);
            return;
        }
        // В финале палец не берёт предмет, а ДЕРЖИТ хвост: пока он на экране,
        // хвост стоит там, куда его увели, и тянется обратно, как только
        // палец убрали.
        if (this.phase === 'aim') { this.drag = { kind: 'tail' }; this.aimAt(p); }
        // В 'settle' управление уже отобрано: доигрываются капли.
    },

    onMove(e) {
        if (!this.drag) return;
        e.preventDefault();
        if (this.drag.kind === 'rub') { this.rubMove(this.toScene(e)); return; }
        if (this.drag.kind === 'tail') { this.aimAt(this.toScene(e)); return; }
        this.moveTool(this.toStage(e));

        const f = this.toScene(e), o = this.drag.off || { x: 0, y: 0 };
        const p = { x: f.x + o.x, y: f.y + o.y };
        const kind = this.drag.kind;
        // Мыло и мочалка — трение: прогресс от пути по телу, пена растёт
        // заготовкой (lather-grow.js). Клеток и подсказки больше нет.
        if (!this.soapRub(p, e.timeStamp || performance.now(), kind)) return;
        this.growTo(kind, this.rub);
        // Пена копится НЕ ТОЛЬКО на черве: над будущим хвостом растёт горка —
        // по той же доле натёртого, чтобы было видно, что она от работы
        // игрока. Горка — svg и пересобирается целиком, поэтому не на
        // каждое движение пальца, а сорок раз за этап.
        if (kind === 'cloth') {
            const q = Math.floor(this.rub * 40);
            if (q !== this._pileQ) { this._pileQ = q; this.pileShow(this.rub); }
        }
        if (this.rub >= 1) this.finishStage(kind);
    },

    onUp() {
        if (!this.drag) return;
        this.bendHand = null;
        this.ringTouch(null);
        // Мыло и мочалка, отпущенные посреди своего этапа, ОСТАЮТСЯ там, где
        // их отпустили (просьба игрока): возврат на полку после каждого
        // отрыва пальца заставлял тянуться к полке снова и снова. Домой
        // предмет уходит только с концом этапа (returnTool).
        const d = this.drag;
        if ((d.kind === 'soap' || d.kind === 'cloth') && d.pos) {
            this.loose = { kind: d.kind, at: d.at, pos: d.pos, k: d.k };
            this.floatTool(true);
        }
        this.drag = null;
    },

    // Попал ли палец (точка ХОЛСТА) в лежащий предмет. Ответ — точка на
    // рисунке полки, за которую его возьмут, чтобы он не прыгнул (takeTool).
    // Предмет лежит в масштабе руки: точка холста переводится обратно тем же
    // масштабом, каким он нарисован.
    looseHit(q) {
        const L = this.loose;
        if (!L) return null;
        const a = BATH_ART.slots()[L.kind];
        // Предмет покачивается в воздухе: палец целится в то место, где он
        // СЕЙЧАС, а не в середину размаха — иначе при подхвате он дёрнется.
        const bob = this.bobY();
        const art = { x: L.at.x + (q.x - L.pos.x) / L.k, y: L.at.y + (q.y - bob - L.pos.y) / L.k };
        const b = L.kind === 'soap' ? BATH_SOAP.box() : BATH_ART.box(L.kind);
        const inBox = art.x > b.x - 12 && art.x < b.x + b.w + 12 && art.y > b.y - 12 && art.y < b.y + b.h + 12;
        return inBox || Math.hypot(art.x - a.x, art.y - a.y) < 70 ? art : null;
    },

    // ---------- ПРЕДМЕТ ЖДЁТ В ВОЗДУХЕ ----------
    // Этап начался — игра сама снимает нужную вещь с полки и держит её над
    // ней: вещь парит и светится по контуру (просьба игрока). Это подсказка
    // «бери меня», сказанная движением, без слов (инвариант 9). Взятая
    // пальцем вещь не парит и не светится; оставленная где угодно — снова
    // парит и светится там, где лежит (onUp).
    //
    // Поднятая вещь сразу ЛЕЖИТ на экране (loose) — ровно как оставленная
    // пальцем: подхват, попадание и возврат у них один и тот же путь.
    LIFT: 18,          // на сколько единиц холста вещь поднимается над полкой
    LIFT_MS: 520,

    liftTool(kind) {
        cancelAnimationFrame(this.liftRaf);
        // Во время переезда камеры кадр сцены ещё не встал: вещь поднялась
        // бы не с того места, где полка окажется. Подъём ждёт камеру — заодно
        // ничего не меняется посреди переезда (docs/traps.md, п. 150).
        if (this.camTimer || !this.cam) {
            this.liftRaf = requestAnimationFrame(() => this.liftTool(kind));
            return;
        }
        this.ready(null);
        const a = BATH_ART.slots()[kind], c = this.cam, K = BATH_ART.DRAG_SCALE;
        const from = { x: c.tx + c.s * a.x, y: c.ty + c.s * a.y };
        const to = { x: from.x, y: from.y - this.LIFT };
        // Полочная копия прячется СРАЗУ: летящая начинает ровно с её места и
        // размера, и плавное угасание дало бы на миг двойника.
        this.homeShown(kind, false, true);
        this.setHeld(BATH_ART.held(kind, c.s, a));
        this.loose = { kind, at: a, pos: to, k: c.s * K };
        const held = this.el('bt-held'), t0 = performance.now();
        // Вещь в воздухе крупнее полочной (она «в руке» у игры), поэтому
        // подъём начинается с полочного размера: на старте картинка ровно
        // та, что лежала, и скачка нет.
        const step = (t) => {
            const u = Math.min(1, (t - t0) / this.LIFT_MS), e = 1 - Math.pow(1 - u, 3);
            const m = 1 / K + (1 - 1 / K) * e, y = from.y + (to.y - from.y) * e;
            if (this.el('bt-held') !== held || !this.loose) { this.liftRaf = 0; return; }
            held.setAttribute('transform',
                `translate(${from.x.toFixed(1)} ${y.toFixed(1)}) scale(${m.toFixed(4)})`);
            if (u < 1) { this.liftRaf = requestAnimationFrame(step); return; }
            this.liftRaf = 0;
            this.floatTool(true);
        };
        this.liftRaf = requestAnimationFrame(step);
    },

    // Парение и свечение. Качается НЕ группа внутри svg, а сам холст руки
    // целиком: на нём ничего, кроме вещи, а css-анимация transform у
    // элемента страницы едет на видеокарте без единой перерисовки.
    // Анимация внутри svg перерисовывала бы весь холст на каждом кадре
    // (docs/traps.md, пп. 37 и 73), а атрибут transform группы ещё и
    // затёрла бы (пп. 2 и 50). Свечение — тень-ореол того же холста:
    // картинка вещи стоит, и тень рисуется один раз.
    // У волшебного флакона тени нет: его холст перерисовывается на каждом
    // его кадре, а светится он сам — сиянием и лучами вокруг, которые
    // возвращаются, как только флакон отпущен (bath-soap.js, applyFrame).
    floatTool(on) {
        if (!on) { cancelAnimationFrame(this.liftRaf); this.liftRaf = 0; }
        const n = this.el('bt-hand');
        if (!n) return;
        const magic = on && this.loose && this.loose.kind === 'soap' && typeof BATH_SOAP !== 'undefined'
                    && BATH_SOAP.TIERS[BATH_SOAP.tier()] === 'magic';
        n.classList.toggle('bt-float', !!on);
        n.classList.toggle('bt-float-magic', !!magic);
    },

    // Где сейчас качание по высоте. В единицах холста: холст руки ровно с
    // холст игры, и пиксель css внутри него — единица.
    bobY() {
        const n = this.el('bt-hand');
        if (!n || !n.classList.contains('bt-float')) return 0;
        const t = getComputedStyle(n).transform;
        return t && t !== 'none' ? new DOMMatrixReadOnly(t).f : 0;
    },

    // Всё сразу на полку, без полёта: сброс забега и проверки. Конец этапа
    // возвращает вещь по дуге — flyHome.
    returnTool() {
        this.drag = null;
        this.loose = null;
        this.floatTool(false);
        this.clearHoming();
        this.fgEl.innerHTML = '';
        this.showTools(true);
    },

    // ---------- ЭТАПЫ ----------
    // Душ включён — и больше не выключается. Раньше здесь наливалась ванна:
    // рос уровень воды, обрезка ползла снизу вверх. С фронтальной камерой
    // нутра чаши не видно вовсе, наливать некуда и нечего показывать — вода
    // теперь просто ИДЁТ ИЗ ЛЕЙКИ, а забег начинается сразу.
    startWater() {
        this.phase = 'rinse';
        this.syncShopButton();
        // Играется ли забег НА ЖЕТОН — решается в момент, когда полилась вода,
        // и дальше не меняется. У похоти награда на своём таймере, и если он
        // ещё не истёк, червя только моют: хвоста, пузырей и финала не будет
        // (docs/plan/21-lust-bath.md, разд. 7а). Решать в конце мытья
        // нельзя: горка пены над хвостом копится ВО ВРЕМЯ мочалки, и её
        // надо либо строить, либо нет с самого начала.
        this.paidRun = (typeof Backend === 'undefined') || Backend.sinPays('lust');
        // Душ смывает всё, что осталось от прошлого забега в этот же заход.
        if (typeof LustGoo !== 'undefined') LustGoo.reset();
        this.ready(null);
        this.setOpacity('bt-rain-far', 1);
        this.setOpacity('bt-rain-near', 1);
        this.setOpacity('bt-rain-veil', 1);
        // Наезд ОДНОВРЕМЕННО с водой и ПЛАВНЫЙ: игра начинается с общего
        // плана, где видно всю комнату, и камера сама подъезжает к участку,
        // на котором идёт работа. Скачок читался сменой сцены — как будто
        // открыли другую игру, а не подошли ближе.
        this.setCamera('body', 900);
        const t0 = performance.now();
        const DUR = 900;      // ровно чтобы заметить, что полилось
        const step = (t) => {
            if (t - t0 < DUR) { this.fillRaf = requestAnimationFrame(step); return; }
            this.fillRaf = 0;
            this.phase = 'soap';
            this.resetCover();
            this.growReset();
            this.liftTool('soap');
        };
        this.fillRaf = requestAnimationFrame(step);
    },

    takeTool(kind, e, at) {
        // Предмет держат ТОЙ точкой, за которую взяли: не прыгает центром
        // под палец. У флакона это главное — пузо окно в небо, и палец,
        // взявший горлышко, обязан остаться на горлышке (замечание игрока).
        // Точка берётся внутри габарита: тап рядом с предметом не вешает
        // его в стороне от пальца.
        // Хват и касание — разные точки: мылит сам предмет (гнездо — его
        // середина), где бы ни лежал палец. Смещение в единицах сцены:
        // предмет в руке крупнее полочного в DRAG_SCALE, и настолько же
        // дальше от пальца его середина.
        const a = BATH_ART.slots()[kind], k = BATH_ART.DRAG_SCALE;
        // at — точка, за которую берут лежащий на экране предмет (looseHit).
        const b = kind === 'soap' ? BATH_SOAP.box() : BATH_ART.box(kind), q = at || this.toScene(e);
        const g = { x: Math.max(b.x, Math.min(b.x + b.w, q.x)), y: Math.max(b.y, Math.min(b.y + b.h, q.y)) };
        const s = this.cam ? this.cam.s : 1;
        this.loose = null;
        this.floatTool(false);
        this.drag = { kind, at: g, k: s * k, off: { x: (a.x - g.x) * k, y: (a.y - g.y) * k } };
        this.homeShown(kind, false);
        this.ready(null);
        this.setHeld(BATH_ART.held(kind, s, g));
        this.moveTool(this.toStage(e));
    },

    // Вещь в руке — одна. Заменяется ТОЛЬКО она: рядом может ещё лететь на
    // полку прошлая вещь (flyHome), и стирать весь холст руки нельзя.
    setHeld(html) {
        const old = this.el('bt-held');
        if (old) old.remove();
        this.fgEl.insertAdjacentHTML('beforeend', `<g id="bt-held">${html}</g>`);
    },

    // Вещь на полке видна или нет. Только СВОЯ: мыло летит домой, пока
    // мочалка уже поднялась, — показать «все, кроме» значило бы вернуть на
    // полку мыло, которое ещё в воздухе (двойник).
    // instant — без плавного перехода: когда на том же месте в тот же миг
    // появляется или исчезает летящая копия, переход читается миганием.
    homeShown(kind, on, instant) {
        const n = this.el(`bt-${kind}-home`);
        if (!n) return;
        if (instant) n.style.transition = 'none';
        n.style.opacity = on ? '1' : '0';
        if (instant) { void n.getBoundingClientRect(); n.style.transition = ''; }
    },

    // ---------- ДОМОЙ ПО ДУГЕ ----------
    // Этап кончился — вещь не телепортируется на полку, а летит туда сама
    // (просьба игрока): по дуге, а не напрямую, и к концу пути ужимается из
    // «ручного» размера в полочный. Приземлилась — копия на полке
    // появляется мгновенно, а летевшая убирается: одна и та же картинка на
    // одном и том же месте, подмены не видно.
    //
    // Летит своим узлом (#bt-homing), а не #bt-held: следующая вещь в это
    // время уже поднимается с полки, и у каждой своя дорога.
    HOME_MS: [480, 820],       // короткий путь — быстрее, длинный — дольше

    flyHome(done) {
        const held = this.el('bt-held'), d = this.drag, o = this.loose;
        const kind = (d || o || {}).kind;
        const at = d ? d.at : o && o.at;
        // Откуда: из-под пальца или оттуда, где вещь парит (с качанием —
        // иначе она дёрнется на старте).
        const from = d && d.pos ? d.pos : o ? { x: o.pos.x, y: o.pos.y + this.bobY() } : null;
        this.drag = null;
        this.loose = null;
        this.floatTool(false);
        this.clearHoming();
        const c = this.cam;
        if (!held || !kind || !at || !from || !c) {
            if (held) held.remove();
            if (kind) this.homeShown(kind, true);
            if (done) done();
            return;
        }
        held.id = 'bt-homing';
        // Куда: та точка рисунка, за которую вещь держали, в том месте, где
        // она лежит на полке. Нарисована вещь «ручным» размером (камера ×
        // DRAG_SCALE) — на полке она в DRAG_SCALE раз меньше.
        const to = { x: c.tx + c.s * at.x, y: c.ty + c.s * at.y };
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        // Вершина дуги — над серединой пути и выше обоих концов: вещь
        // подбрасывают на полку, а не тащат по прямой.
        const top = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 40 - 0.25 * dist };
        const [m0, m1] = this.HOME_MS, dur = Math.min(m1, m0 + dist * 0.8);
        const K = BATH_ART.DRAG_SCALE, t0 = performance.now();
        const step = (t) => {
            if (!held.isConnected) { this.homeRaf = 0; return; }
            const u = Math.min(1, (t - t0) / dur);
            const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
            const q = 1 - e;
            const x = q * q * from.x + 2 * q * e * top.x + e * e * to.x;
            const y = q * q * from.y + 2 * q * e * top.y + e * e * to.y;
            const m = 1 + (1 / K - 1) * e;
            held.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${m.toFixed(4)})`);
            if (u < 1) { this.homeRaf = requestAnimationFrame(step); return; }
            this.homeRaf = 0;
            // Полка — сразу, без плавного проявления: летевшая копия стоит
            // ровно там же и в том же размере, и проявление читалось бы
            // миганием.
            this.homeShown(kind, true, true);
            held.remove();
            if (done) done();
        };
        this.homeRaf = requestAnimationFrame(step);
    },

    // Прервать полёт домой (уход из ванной, новый забег): вещь сразу на полке.
    clearHoming() {
        cancelAnimationFrame(this.homeRaf);
        this.homeRaf = 0;
        const n = this.el('bt-homing');
        if (n) n.remove();
    },

    // Предмет в руке живёт в координатах ХОЛСТА: его держат перед собой, и
    // камере он не подчиняется.
    moveTool(p) {
        if (this.drag) this.drag.pos = p;
        const held = this.el('bt-held');
        if (held) held.setAttribute('transform',
            `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    },

    showTools(show, except) {
        for (const k of ['soap', 'cloth']) {
            const n = this.el(`bt-${k}-home`);
            if (n) n.style.opacity = (show || k !== except) ? '1' : '0';
        }
    },

    finishStage(kind) {
        this.clearHint();
        if (kind === 'soap') {
            // Мыло летит домой (ниже, flyHome), и мочалка поднимается, когда
            // оно уже на полке, а не вместе с ним: у обеих один холст руки, и
            // парение со свечением мочалки досталось бы летящему мылу — оно
            // светилось бы как «бери меня» по дороге домой. Взять мочалку с
            // полки можно и раньше: тогда поднимать уже нечего.
            // Горка пены над будущим хвостом собирается ЗАРАНЕЕ, пока червя
            // трут мочалкой. К моменту, когда хвост всплывает, она уже
            // непроницаема, и его появления не видно.
            if (this.paidRun) this.buildPile();
            // Мочалка снимает мыло и оставляет пену: муть гасится, чтобы
            // второй этап был виден.
            // Что намылено — запоминается: на этапе мочалки это фон, по
            // которому видно, где пена уже проступила, а где ещё нет.
            // Муть доращивается до конца: этап мог кончиться и не трением
            // (debug-перескок), а мочалка трёт по ГОТОВОЙ мути.
            this.growTo('soap', 1);
            this.phase = 'cloth';
            this.resetCover();
            this.flyHome(() => {
                if (this.phase === 'cloth' && !this.drag && !this.loose) this.liftTool('cloth');
            });
            return;
        }
        // Дальше камера отъезжает (к хвосту или на общий план) — и едет
        // готовой текстурой: вещь, летящая в это время, перерисовывала бы
        // холст посреди переезда (docs/traps.md, п. 150). Поэтому сперва
        // мочалка долетает до полки, потом всё остальное. Пока летит, палец
        // ничего не берёт: фаза уже не «мочалка».
        this.phase = 'return';
        this.flyHome(() => {
            if (this.phase !== 'return') return;       // успели уйти из ванной
            if (this.paidRun) this.raiseTail();
            else this.finishWash();
        });
    },

    // ---------- ЗАБЕГ «ТОЛЬКО ПОМЫТЬ» ----------
    // Награда ещё не готова — червя вымыли, и на этом всё. Сказано без
    // единого слова (инвариант 9): вода выключается, пена сходит с тела,
    // камера отъезжает на общий план, кнопка магазина возвращается. Хвост не
    // всплывает — ширмы над ним и не копилось.
    //
    // Шкала потребности закрывается, как после любого захода: червь чистый.
    // Таймер награды НЕ тратится (rewards.lust.wash без claimsReward).
    finishWash() {
        this.phase = 'done';
        this.stopClocks();
        this.ready(null);
        this.setOpacity('bt-rain-far', 0);
        this.setOpacity('bt-rain-near', 0);
        this.setOpacity('bt-rain-veil', 0);
        const wash = this.el('bt-wash');
        if (wash) {
            this.washShown(false, 1200);
        }
        this.setCamera('overview', 900);
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'wash', outcome: 'win', meta: { wash: true }
        });
        this.syncShopButton();
    },

    // ---------- ПОДСКАЗКИ «ГДЕ НЕ ДОМЫЛИ» БОЛЬШЕ НЕТ ----------
    // Было кольцо на самой недомытой клетке: без него порог покрытия
    // превращался в поиск пикселя. Мытьё теперь — трение где угодно, искать
    // нечего, и кольцо ушло вместе с клетками. clearHint остался: им
    // чистится слой bt-spot при уходе и смене этапа.
    clearHint() {
        clearTimeout(this.hintTimer);
        this.hintTimer = 0;
        const n = this.el('bt-spot');
        if (n) n.innerHTML = '';
    },

    // ---------- ХВОСТ ВСПЛЫВАЕТ ----------
    raiseTail() {
        this.phase = 'tail';
        // Кадр СЖИМАЕТСЯ до двоих: мыло, мочалка и полка отработали, и
        // держать их на экране больше незачем. Переезд плавный, и червь
        // уходит в расфокус одновременно с ним: это не новая сцена, а
        // смена того, на что смотрят.
        this.setCamera('tail', 1000);
        // Червь стал ФОНОМ за хвостом, и платить за него полную цену больше
        // незачем: на наезде он занимает пол-экрана, а каждая правка его
        // геометрии — это перерисовка всей этой площади. Замер на айфоне:
        // живой персонаж 24 кадра, замерший 60.
        if (this.wormHandle && this.wormHandle.setFrameHz) this.wormHandle.setFrameHz(5);
        this.wormHost.classList.add('bt-soft');
        this.blurFar(BATH_ART.FAR_BLUR, 900);
        // Червя ополаскивают: муть и пена сходят. Оставить их — значит
        // держать белую вуаль поверх морды весь финал, а именно морда в нём
        // и работает (блаженство, открытый рот).
        this.washShown(false);
        const model = window.WormModelAPI ? this.bathModel() : null;
        this.tailModel = model;
        // Вид хвоста — по купленной ступени (BATH_ART.TAIL_LOOKS).
        BATH_ART.setTailLevel(this.tailLevel());
        this.bend = 0;
        this.bendHand = null;
        this.ringFinger = null; this.ringS = 0; this.ringSV = 0; this.ringT = null; this.ringVel = 0;
        BATH_ART.setRing(0.5, 0, 0);
        BATH_ART.setPulse(0, 0, 0);
        this.nextShotAt = null; this.shotAt = null;

        this.el('bt-tail').innerHTML =
            `<g id="bt-tail-pivot">${BATH_ART.tail(model, this.skinSat)}</g>`;
        this._toneKey = null;
        this.drawTail();
        this.setOpacity('bt-tail', 1);

        // НИКАКОГО ВСПЛЫТИЯ. Хвост просто оказывается на своём месте — под
        // горкой пены, которая его целиком закрывает. Раньше он выезжал
        // снизу, и это было видно: сначала кончик показывался из-за борта,
        // потом подъезжал к пене и прятался под ней. Появление, которое
        // прячут, не нужно анимировать — его нужно не показывать.
        const g = this.el('bt-tail');
        g.removeAttribute('transform');
        this.spawnBubbles();
    },

    // Размытие ДАЛЬНЕГО плана. Стена с плиткой стоит дальше всех, значит и
    // мылится сильнее всех — из этого и берётся глубина кадра. Пока размыт
    // был один червь, резкая плитка спорила с ним и тянула взгляд на себя.
    //
    // Ставится в svg-фильтр, а не в css: css filter не действует на
    // внутренние элементы svg в WebKit, и на айфоне размытия бы не было
    // вовсе (та же грабля, что у фильтра истощения в worm-renderer).
    blurFar(to, ms) {
        const n = this.el('bt-far-blur-amount'), g = this.el('bt-shower');
        const lines = this.el('bt-far-lines');
        if (!n || !g) return;
        cancelAnimationFrame(this.blurRaf || 0);
        // Дальний план мылится ДВУМЯ РАЗНЫМИ СРЕДСТВАМИ, и это не небрежность.
        // Стена и пол — плоские заливки, размывать в них нечего; расфокус на
        // них читается пропавшим контрастом ЛИНИЙ, а это одна прозрачность.
        // Честный гауссиан остаётся только на душе — единственном предмете
        // дальнего плана с формой, зато и площадью с ладонь. Фильтр во всю
        // стену стоил трети кадров: дождь перерисовывается каждый кадр и
        // тянет за собой пересчёт размытия по всему экрану.
        //
        // Фильтр СНИМАЕТСЯ вовсе, когда размывать нечего: нулевая
        // stdDeviation не бесплатна, группа всё равно гоняется через
        // конвейер фильтра каждый кадр.
        const set = (v) => {
            n.setAttribute('stdDeviation', v.toFixed(2));
            if (v < 0.05) g.removeAttribute('filter');
            else g.setAttribute('filter', 'url(#bt-far-blur)');
            // Швы гаснут вместе с наводкой: на полном размытии от них
            // остаётся четверть, то есть намёк на кафель, а не сетка.
            if (lines) lines.setAttribute('opacity',
                (1 - 0.75 * Math.min(1, v / BATH_ART.FAR_BLUR)).toFixed(3));
        };
        const from = parseFloat(n.getAttribute('stdDeviation')) || 0;
        if (!ms) { set(to); return; }
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / ms);
            set(from + (to - from) * k * k * (3 - 2 * k));
            this.blurRaf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        this.blurRaf = requestAnimationFrame(step);
    },

    // ---------- ГОРКА ПЕНЫ ----------
    // Список пузырей собирается ОДИН РАЗ, ещё на этапе мочалки, и потом
    // только показывается по частям. Так горка растёт на глазах, а не
    // возникает готовой в момент, когда её нужно лопать.
    buildPile() {
        const C = this.cfg(), T = BATH_ART.TAIL;
        const lo = C.bubblesMin || 16, hi = C.bubblesMax || 20;
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        const A = BATH_ART.slots();
        // Горка обязана закрывать НЕВЫРОСШИЙ хвост целиком, с запасом:
        // всплывает он маленьким.
        this.pileW = T.base * 2.4;
        this.pileH = T.len * 1.15;
        this.pileSeed = 1 + Math.floor(Math.random() * 999);
        this.pile = [];
        for (let i = 0; i < n; i++) {
            // Кладутся по той же горке, что и комки: доля вдоль высоты, и
            // чем выше, тем уже разброс. Иначе пузыри висят по краям над
            // пустотой, а сама горка остаётся голой.
            const t = Math.pow((i + 0.5) / n, 0.8);
            const half = (this.pileW / 2) * (1 - 0.55 * t);
            this.pile.push({
                x: A.tail.x + (Math.random() - 0.5) * 2 * half,
                y: A.tail.y - t * this.pileH - 4,
                // Порядок ПОЯВЛЕНИЯ — по высоте, снизу вверх: пена не
                // возникает в воздухе, она нарастает от борта ванны, комок
                // на комок. Порядок ОТРИСОВКИ другой (крупные первыми), и
                // путать их нельзя: иначе мелкий тонет под соседним крупным
                // и по нему нечем попасть.
                ord: i,
                // Мельче прежних (было 4…15): хвост стал вдвое короче, и
                // старый калибр закрывал его целиком. Попадать по ним от
                // размера не зависит — зона срабатывания общая (popReach).
                r: 5 + Math.pow(Math.random(), 1.6) * 9,
                alive: true, seed: i * 37 + 5
            });
        }
        this.pile.sort((a, b) => b.r - a.r);
        this.pileShow(0);
    },

    // Показать долю k горки: сама горка растёт, пузыри проступают по одному.
    pileShow(k) {
        if (!this.pile) return;
        const A = BATH_ART.slots(), g = Math.max(0, Math.min(1, k));
        this.el('bt-foam').innerHTML = BATH_ART.foamMound(
            A.tail.x, A.tail.y, this.pileW, this.pileH, g, this.pileSeed);
        const upto = Math.round(g * this.pile.length);
        this.el('bt-bubbles').innerHTML = this.pile
            .filter(b => b.ord < upto && b.alive)
            .map(b => BATH_ART.bubble(b.x, b.y, b.r, b.seed)).join('');
    },

    // Точка рта червя. Считается по НАРИСОВАННОМУ рту, а не по числу: рот
    // ездит вместе с моделью, и подобранное число разошлось бы с ней при
    // первой же правке персонажа.
    mouthPoint() {
        const box = this.wormBoxScene(), B = this.WORM_BASE, k = box.w / B.w;
        let p = null;
        if (this.wormHandle && this.wormHandle.getPartPoint) {
            const q = this.wormHandle.getPartPoint('mouth');
            if (q) p = { x: box.x + q.x * k, y: box.y + q.y * k };
        }
        return p || { x: box.x + box.w * 0.6, y: box.y + box.h * 0.42 };
    },

    // Куда сейчас смотрит кончик и где он стоит.
    // Во сколько раз хвост крупнее исходного. Считается ОТ ЗАРЯДА, а не
    // хранится: заряд меняется каждый кадр, и держать рядом второе число,
    // которое обязано с ним совпадать, — верный способ их развести.
    tailGrow() { return 1 + this.charge * (this.cfg().rubGrow || 0.3); },

    tipState(bend) {
        const A = BATH_ART.slots();
        const c = BATH_ART.tailCurve(bend == null ? this.bend : bend,
                                     this.tailGrow());
        return { x: A.tail.x + c.tip.x, y: A.tail.y + c.tip.y, dir: c.dir, curve: c };
    },

    // ---------- ПОГЛАЖИВАНИЕ ----------
    // Между лопаньем пузырей и финалом. Палец ВЕДЁТ вдоль хвоста, хвост
    // наливается и растёт; перестал вести — заряд спадает.
    //
    // Ровно та же механика, что у прицела в финале, и по той же причине:
    // засчитывается ПУТЬ пальца вдоль оси, а не то, где он лежит. Иначе
    // достаточно положить палец и ждать.
    startRub() {
        this.phase = 'rub';
        this.charge = 0;
        // Морда откликается заранее: рот приоткрыт, глаза приспущены. В
        // финале то же лицо доводится до блаженства — так по нему видно, что
        // этап идёт и к чему ведёт (инвариант 9: сказано позой, не подписью).
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ mouthOpenness: 0.3, eyelidLevel: 0.55 });
        // Червь уходит в расфокус: главный в кадре — хвост.
        this.wormHost.classList.add('bt-soft');
        this.el('bt-bubbles').innerHTML = '';
        this.rubLast = performance.now();
        this.rubMoved = this.rubLast;
        const tick = (now) => {
            const dt = Math.min(0.05, (now - this.rubLast) / 1000);
            this.rubLast = now;
            if (this.phase !== 'rub') { this.rubRaf = 0; return; }
            const C = this.cfg();
            // Спад НЕ СРАЗУ: рука не может водить без единой остановки, а
            // прирост за ход мелкий — мгновенный спад не давал набрать вовсе.
            if ((now - this.rubMoved) / 1000 > (C.rubIdle || 1.1))
                this.charge = Math.max(0, this.charge - (C.rubRelax || 0.06) * dt);
            this.stepRing(dt);
            this.drawTail();
            this.drawRubGauge();
            // Веки опускаются ВМЕСТЕ с наливом: тот же прогресс, сказанный
            // мордой. Каждый кадр и без ступеней: setLivePose только кладёт
            // числа в живой канал, а применяет их тот же кадровый цикл
            // рендерера — округлять было не за чем, а ступени на веках
            // видно.
            //
            // Глубже ПОЛОВИНЫ веки не опускаются. Зажмуренный червь теряет
            // морду: в финале он ловит струю ртом, и по прикрытым глазам
            // читается блаженство, а по закрытым — что он спит.
            if (this.wormHandle && this.wormHandle.setLivePose) {
                this.wormHandle.setLivePose({
                    mouthOpenness: 0.3 + this.charge * 0.3,
                    eyelidLevel: this.LID_MAX * (0.5 + this.charge * 0.5) });
            }
            if (this.charge >= 1) { this.rubRaf = 0; this.startFinale(); return; }
            this.rubRaf = requestAnimationFrame(tick);
        };
        this.rubRaf = requestAnimationFrame(tick);
    },

    // Доля вдоль хвоста (0 — корень, 1 — кончик) для точки сцены и
    // расстояние до оси. Нужны обе: заряд даёт только палец НА хвосте.
    rubAt(p) {
        const A = BATH_ART.slots();
        const spine = BATH_ART.tailSpine(this.bend, this.tailGrow());
        let best = 0, dist = Infinity;
        for (let i = 0; i < spine.length; i++) {
            const d = Math.hypot(A.tail.x + spine[i].x - p.x,
                                 A.tail.y + spine[i].y - p.y);
            if (d < dist) { dist = d; best = i / (spine.length - 1); }
        }
        return { t: best, dist };
    },

    // Столбик налива СЛЕВА ОТ ХВОСТА: работа идёт по хвосту, туда игрок и
    // смотрит. Высота столбика — по самому хвосту, чтобы он не жил в кадре
    // отдельной деталью.
    drawRubGauge(level) {
        const A = BATH_ART.slots(), T = BATH_ART.TAIL;
        const h = T.len * 1.05;
        // Столбик стоит с ВНЕШНЕЙ стороны хвоста — той, куда хвост НЕ гнётся:
        // иначе он оказывается между хвостом и мордой, ровно в том коридоре,
        // где идёт вся работа.
        this.el('bt-ammo').innerHTML = BATH_ART.rubGauge(
            A.tail.x + (T.side || 1) * T.base * 0.95 * -1,
            A.tail.y - h - 6, h, level == null ? this.charge : level);
    },

    // ---------- ЗАПАС ВЫСТРЕЛОВ ----------
    // Та же шкала в финале: сколько толчков осталось. Белое уходит ПОКА
    // порция идёт по стволу (pulseU — доля её пути), а не скачком на
    // выстреле: видно, что белое перетекает из шкалы в хвост. Перерисовка —
    // только при заметной смене уровня.
    drawAmmo() {
        const total = this.shotsTotal || 1;
        const level = Math.max(0, (this.shotsLeft - (this.pulseU || 0)) / total);
        const key = Math.round(level * 400);
        if (key === this._ammoKey) return;
        this._ammoKey = key;
        this.drawRubGauge(level);
    },

    rubMove(p) {
        const C = this.cfg(), a = this.rubAt(p);
        const reach = BATH_ART.TAIL.base * this.tailGrow() * 1.3;
        this.ringFinger = { t: a.t, on: a.dist <= reach };
        if (a.dist > reach) { this.drag.t = null; return; }
        if (this.drag.t != null && a.t !== this.drag.t) {
            this.charge = Math.min(1, this.charge
                + Math.abs(a.t - this.drag.t) * (C.rubGain || 0.09));
            this.rubMoved = performance.now();
        }
        this.drag.t = a.t;
    },

    // Изгиб, при котором капля НОМИНАЛЬНОЙ силы проходит через рот. Ищется
    // перебором и ТОЙ ЖЕ физикой, которой капля потом летит: прицел обязан
    // считаться по тому же, по чему считается попадание.
    solveBend(target) {
        const C = this.cfg();
        // Прицел считается ПОЧТИ ПОЛНОЙ силой, а не средней. Цель близко и
        // почти вровень с кончиком, и на такой дистанции в корзину рта
        // проходит широкая пачка траекторий: если прицел взять по середине
        // размаха силы, то и слабый, и сильный толчок всё равно попадают —
        // сила перестаёт значить что-либо, а прокачка, которая её и
        // поднимает, становится бесполезной (проверено симулятором: от
        // ±10° до ±30° разброса попаданий поровну).
        // Прицел «впритык» разворачивает это правильной стороной: полный
        // толчок едва достаёт, слабый НЕ ДОЛЕТАЕТ и падает в ванну. Промах
        // виден целиком, и прокачка силы — это ровно то, что покупается.
        const v = C.speedMin + 0.92 * (C.speedMax - C.speedMin);
        const LO = -0.25, HI = this.BEND_MAX, N = 240;
        // Собираем ВСЕ изгибы, при которых капля проходит через рот, и
        // возвращаем СЕРЕДИНУ первой непрерывной полосы попаданий.
        //
        // Раньше возвращался «лучший по промаху». Промах у любого попадания
        // равен нулю, попадают несколько изгибов подряд, и правило «строго
        // лучше» выбирало ПЕРВЫЙ из них — то есть самый край окна. Игрок
        // держал прицел идеально и мазал половину толчков: разброс уводил
        // каплю только в одну сторону, наружу.
        //
        // Первая полоса, а не лучшая: перебор идёт от малого изгиба, и
        // первая — навесная. Дуга видна целиком, и по ней читается перелёт.
        const hits = [], bends = [];
        let best = LO, near = Infinity;
        for (let i = 0; i <= N; i++) {
            const b = LO + (HI - LO) * i / N;
            const s = this.tipState(b);
            const r = LustShot.fly(C, s,
                { vx: Math.cos(s.dir) * v, vy: Math.sin(s.dir) * v },
                target, C.mouthR);
            bends.push(b); hits.push(r.hit);
            if (r.near < near) { near = r.near; best = b; }
        }
        const from = hits.indexOf(true);
        if (from < 0) return best;          // не долетает ни при каком изгибе
        let to = from;
        while (to + 1 <= N && hits[to + 1]) to++;
        return (bends[from] + bends[to]) / 2;
    },


    // ---------- ПОРЦИЯ ПЕРЕД ВЫСТРЕЛОМ (BATH_ART.PULSE) ----------
    // Положение порции считается ОТ ВРЕМЕНИ до ближайшего толчка, а не
    // накапливается: так она приходит к шейке ровно к выстрелу при любом
    // интервале между толчками (он зависит от ступени) и не уплывает от
    // рваных кадров. Путь занимает до 0.7 с, но не больше 85% интервала —
    // на верхних ступенях толчки чаще, и порции не должны наезжать.
    //
    // РЫВКАМИ, а не ровно: путь — плавная «лестница» u − sin(2πnu)/(2πn),
    // у которой скорость то растёт, то почти замирает, но никогда не идёт
    // назад. На каждом рывке порция распирает стенки (a растёт до 1), в
    // паузе упруго отпускает (до 0.55). Весь ствол вздрагивает в такт.
    //   t    — от корня к шейке; к шейке — за мгновение до выстрела;
    //   a    — сила распирания; нарастает с началом пути, мягко;
    //   after — опадание ствола 0.3 с после выстрела; сама порция при этом
    //          не пропадает разом, а за 0.12 с гаснет у шейки.
    PULSE_SURGES: 3,
    stepPulse(now) {
        const G = BATH_ART.look().glansAt, n = this.PULSE_SURGES, TAU = Math.PI * 2;
        let t = 0, a = 0, after = 0, throb = 0;
        this.pulseU = 0;
        const t0 = 0.06, t1 = G - 0.035;
        if (this.nextShotAt) {
            const travel = Math.min(700, this.shotMs() * 0.85);
            const u = 1 - (this.nextShotAt - now) / travel;
            if (u > 0 && u <= 1.02) {
                // Доходит к шейке на 92% пути и ждёт там выстрела — «за
                // мгновение до», а не впритык к нему.
                const uu = Math.min(1, u / 0.92);
                this.pulseU = uu;
                const stair = uu - Math.sin(TAU * n * uu) / (TAU * n);
                t = t0 + (t1 - t0) * stair;
                const surge = (1 - Math.cos(TAU * n * uu)) / 2;      // 0 в паузе, 1 на рывке
                const ramp = Math.min(1, uu / 0.2), rs = ramp * ramp * (3 - 2 * ramp);
                a = rs * (0.55 + 0.45 * surge);
                throb = rs * surge;
            }
        }
        if (this.shotAt) {
            const e = now - this.shotAt;
            if (e >= 0 && e < 120 && !a) { const k = 1 - e / 120; t = t1; a = 0.8 * k * k; }
            const k = e / 300;
            if (k >= 0 && k < 1) after = Math.sin(Math.PI * k);
        }
        BATH_ART.setPulse(t, a, after, throb);
    },

    // ---------- КОЛЬЦО ПОД ПАЛЬЦЕМ (BATH_ART.RING) ----------
    // Палец на хвосте задаёт, ГДЕ кольцо (ringFinger); здесь оно доезжает
    // до пальца, меряет скорость хода и набирает силу пружиной. Пружина с
    // недодемпфированием: плоть проминается мягко, а отпущенная
    // расправляется с лёгкой дрожью. Шаг по времени, как у всей упругости
    // в финале.
    // Мягче первой версии (320/13): плоть проминается не мгновенно, а
    // отпущенная возвращается одним-двумя плавными покачиваниями.
    RING_K: 110, RING_C: 8.5,
    stepRing(dt) {
        const f = this.ringFinger, on = !!(f && f.on);
        let s = this.ringS || 0, sv = this.ringSV || 0, t = this.ringT, v = this.ringVel || 0;
        // Упругость ступени (look().firm): у налитого хвоста пружина жёстче
        // и гасится быстрее, у слабого — мягче и дрожит дольше.
        const fm = BATH_ART.look().firm || 1;
        sv += ((on ? 1 : 0) - s) * this.RING_K * fm * fm * dt - sv * this.RING_C * fm * dt;
        s = Math.max(-0.2, Math.min(1.1, s + sv * dt));
        if (on) {
            if (t == null) t = f.t;
            // Плоть чуть отстаёт от пальца — это и читается упругостью.
            const k = 1 - Math.exp(-dt / 0.08), nt = t + (f.t - t) * k;
            // Скорость хода — сглаженная: у пальца на телефоне рваные события.
            v += ((nt - t) / Math.max(dt, 1e-3) - v) * (1 - Math.exp(-dt / 0.08));
            t = nt;
        } else v *= Math.exp(-dt / 0.12);
        if (Math.abs(s) < 0.002 && Math.abs(sv) < 0.01 && !on) { s = 0; sv = 0; }
        this.ringS = s; this.ringSV = sv; this.ringT = t; this.ringVel = v;
        BATH_ART.setRing(t == null ? 0.5 : t, s, v);
    },
    // Где палец на хвосте — или null, если он не на хвосте.
    ringTouch(p) {
        if (!p) { if (this.ringFinger) this.ringFinger.on = false; return; }
        const a = this.rubAt(p), reach = BATH_ART.TAIL.base * this.tailGrow() * 1.3;
        this.ringFinger = { t: a.t, on: a.dist <= reach };
    },

    drawTail(force) {
        const A = BATH_ART.slots(), g = this.el('bt-tail-pivot');
        if (!g) return;
        // Пересобирать путь хвоста имеет смысл, только если он изменился.
        // Кадров, где палец стоит, а хвост уже выпрямился, за забег набегает
        // половина, и каждый из них стоил двух сотен toFixed и двух записей
        // в дерево.
        const R = BATH_ART.ring;
        const Pu = BATH_ART.pulse;
        const key = `${this.bend.toFixed(4)}|${this.charge.toFixed(4)}|${R.t.toFixed(3)}|${R.s.toFixed(3)}|${R.v.toFixed(2)}`
                  + `|${Pu.t.toFixed(3)}|${Pu.a.toFixed(3)}|${Pu.after.toFixed(3)}|${Pu.throb.toFixed(3)}`
                  // Легенда живёт и в покое: блеск, искорки, ореол — от времени.
                  + (BATH_ART.look().legend ? `|${Math.floor(performance.now() / 33)}` : '');
        if (key === this._tailKey) return;

        // ---------- И НЕ ЧАЩЕ ТРИДЦАТИ РАЗ В СЕКУНДУ ----------
        // Хвост — крупная фигура, а правка его пути значит перерисовку всей
        // его площади процессором (svg рисует CPU, видеокарта только двигает
        // готовое). Шестьдесят перерисовок в секунду телефон не тянет, а
        // разницы между 30 и 60 на упругом движении не видно.
        //
        // Последний кадр движения рисуется ВСЕГДА (force): иначе хвост
        // застывал бы чуть-чуть не там, где его отпустили.
        const now = performance.now();
        if (!force && this._tailTs && now - this._tailTs < 33) return;
        this._tailTs = now;
        this._tailKey = key;
        // Ни одного поворота: группа только переносится, а гнётся сама фигура.
        g.setAttribute('transform', `translate(${A.tail.x} ${A.tail.y})`);
        const d = BATH_ART.tailD(this.bend, this.tailGrow());
        this.el('bt-tail-body').setAttribute('d', d.body);
        // Налив меняет тон (BATH_ART.CHARGE_TONE). Перекраска — ступенями по
        // двадцатой доле: глаз разницы не видит, а записей в дерево в
        // десятки раз меньше, чем если красить каждый кадр.
        const toneKey = Math.round(this.charge * 20);
        if (toneKey !== this._toneKey) {
            this._toneKey = toneKey;
            BATH_ART.paintTail(BATH_ART.tailTone(this.tailModel, this.skinSat, toneKey / 20));
        }
        const edge = this.el('bt-tail-edge');
        if (edge) edge.setAttribute('d', d.body);
        // Звенья, головка, тень под венчиком и блик — из того же контура.
        const P = BATH_ART.tailPieces(d.curve, this.tailGrow()), f1 = (v) => v.toFixed(1);
        P.segs.forEach((sd, i) => { const e = this.el(`bt-tail-seg-${i}`); if (e) e.setAttribute('d', sd); });
        const gl = this.el('bt-tail-glans');
        if (gl) gl.setAttribute('d', P.glans);
        const cl = this.el('bt-tail-clit');
        if (cl) cl.setAttribute('d', P.clit);
        const wr = this.el('bt-tail-wrinkle');
        if (wr) wr.setAttribute('d', P.wrinkles);
        for (const [id, k] of [['bt-tail-vein-sh', 'veinSh'], ['bt-tail-vein', 'vein'], ['bt-tail-vein-hi', 'veinHi']]) {
            const e = this.el(id);
            if (e) e.setAttribute('d', P[k]);
        }
        P.creases.forEach((c, i) => {
            const a = this.el(`bt-tail-cr-${i}`), b = this.el(`bt-tail-crl-${i}`);
            if (a) { a.setAttribute('d', c.d); a.setAttribute('stroke-opacity', (0.3 * c.k).toFixed(3)); }
            if (b) { b.setAttribute('d', c.d); b.setAttribute('stroke-opacity', (0.55 * c.k).toFixed(3)); }
        });
        for (const [id, k] of [['bt-tail-sheen', 'sheen'], ['bt-tail-shine', 'shine'], ['bt-tail-stretch', 'stretch'],
                               ['bt-tail-gwet', 'gwet'], ['bt-tail-grim', 'grim'], ['bt-tail-gspark', 'spark']]) {
            const e = this.el(id);
            if (e) e.setAttribute('d', P.lights[k]);
        }
        if (P.piercing) {
            const Pc = P.piercing;
            for (const [id, k] of [['bt-tail-ring-back', 'back'], ['bt-tail-ring-back-m', 'back'], ['bt-tail-ring', 'front'],
                                   ['bt-tail-ring-m', 'front'], ['bt-tail-ring-hi', 'front'], ['bt-tail-holes', 'holes']]) {
                const e = this.el(id);
                if (e) e.setAttribute('d', Pc[k]);
            }
            const b = this.el('bt-tail-bead');
            if (b) { b.setAttribute('cx', f1(Pc.bead.x)); b.setAttribute('cy', f1(Pc.bead.y)); b.setAttribute('r', f1(Pc.bead.r)); }
        }
        if (P.legend) {
            const Lg = P.legend;
            for (const [id, k] of [['bt-tail-sweep', 'sweep'], ['bt-tail-glow', 'glow'], ['bt-tail-stars', 'stars']]) {
                const e = this.el(id);
                if (e) e.setAttribute('d', Lg[k]);
            }
            const h = this.el('bt-tail-halo');
            if (h) {
                h.setAttribute('rx', f1(Lg.halo.rx)); h.setAttribute('ry', f1(Lg.halo.ry));
                h.setAttribute('transform', `translate(${f1(Lg.halo.x)} ${f1(Lg.halo.y)}) rotate(${f1(Lg.halo.deg)})`);
            }
        }
        for (const [id, q] of [['bt-tail-neck', P.neck]]) {
            const e = this.el(id);
            if (!e) continue;
            e.setAttribute('rx', f1(q.rx)); e.setAttribute('ry', f1(q.ry));
            e.setAttribute('transform', `translate(${f1(q.x)} ${f1(q.y)}) rotate(${f1(q.deg)})`);
        }
        // Прилипшее к хвосту едет вместе с ним.
        if (typeof LustGoo !== 'undefined') LustGoo.drawTail(force);
    },

    // ---------- ПУЗЫРИ ----------
    // Пена налипла на хвост ГУСТО и разным калибром: одинаковые кружки в ряд
    // складываются в бусы, а не в пену. Доля возводится в степень, поэтому
    // мелких много, крупных единицы.
    //
    // Лопаются ПО ОДНОМУ за касание. Пачкой было быстрее, но щелчок по
    // пузырю — сам по себе удовольствие, ради которого этап и существует;
    // пачка съедала его ради экономии десятка тапов.
    // Горка уже стоит и уже полная — здесь только отдаётся управление
    // игроку. Новых пузырей не появляется: те же, что копились под мочалкой,
    // теперь можно лопать.
    spawnBubbles() {
        this.phase = 'pop';
        if (!this.pile) this.buildPile();
        this.bubbles = this.pile;
        this.pileShow(1);
    },

    // Горка тает вместе с пузырями: её доля — это доля целых. Иначе игрок
    // разобрал бы всю пену, а ширма осталась бы стоять поверх хвоста.
    drawBubbles() {
        const A = BATH_ART.slots();
        const alive = this.bubbles.filter(b => b.alive);
        this.el('bt-bubbles').innerHTML = alive
            .map(b => BATH_ART.bubble(b.x, b.y, b.r, b.seed)).join('');
        this.el('bt-foam').innerHTML = BATH_ART.foamMound(
            A.tail.x, A.tail.y, this.pileW, this.pileH,
            alive.length / Math.max(1, this.bubbles.length), this.pileSeed);
    },

    pop(p) {
        // ОДИН за касание, и ближайший: под пальцем часто оказываются два, и
        // лопаться должен тот, по которому целились.
        //
        // Зона срабатывания ОДНА НА ВСЕХ и не зависит от радиуса пузыря.
        // Пока она была «радиус плюс немного», по мелким было физически не
        // попасть: палец закрывает их целиком, а засчитывалось попадание в
        // круг вдвое меньше подушечки. Ближайший всё равно один, так что
        // широкая зона ничего не путает — она снимает прицеливание.
        const reach = this.cfg().popReach || 34;
        let hit = null, best = Infinity;
        for (const b of this.bubbles) {
            if (!b.alive) continue;
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d > reach || d >= best) continue;
            best = d; hit = b;
        }
        if (!hit) return;
        hit.alive = false;
        this.drawBubbles();
        if (!this.bubbles.some(b => b.alive)) this.startRub();
    },

    // ---------- ФИНАЛ: ТОЛЧКИ И ЛОВЛЯ ----------
    // Через сколько после входа в финал снимается точка рта: две с лишним
    // перерисовки червя на его пяти кадрах в секунду. Меньше первой паузы
    // между толчками (0.75 с на верхней ступени).
    MOUTH_SETTLE: 450,

    startFinale() {
        this.phase = 'aim';
        // Кадр НЕ МЕНЯЕТСЯ и расфокус НЕ СНИМАЕТСЯ: пузыри, поглаживание и
        // стрельба — один эпизод, а переезд камеры и возврат резкости
        // посреди него читаются сменой сцены. Червь и здесь фон: игрок
        // работает хвостом.
        this.setCamera('tail');
        this.hits = 0;
        this.drops = [];
        this.splats = [];
        // Рот пуст: канал живой, значит его надо явно опустошить, иначе в
        // следующий забег червь входит с чужой лужицей.
        this.mouthFill = null;
        this.setMouthFill(0);
        this.dropAcc = 0;
        this.shotsLeft = this.tailTier().shots || 10;
        this.shotsTotal = this.shotsLeft;
        this._ammoKey = null;

        // Блаженство: рот открыт, глаза зажмурены. Сказано позой, а не
        // подписью (инвариант 9).
        // Веки остаются там же, где их оставило поглаживание: этап другой,
        // а состояние то же. Скачок до зажмуренных читался сменой сцены.
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ mouthOpenness: 0.75,
                                          eyelidLevel: this.LID_MAX });

        // Рот считается ОДИН РАЗ на весь финал: он стоит на месте, а его
        // запрос дёргает раскладку страницы. По нему же решается и прицел —
        // так цель у прицела и у попадания заведомо одна.
        //
        // Но НЕ СРАЗУ. Поза с открытым ртом только что заказана, а червь в
        // финале перерисовывается пять раз в секунду (setFrameHz в
        // raiseTail): замер в этот же миг ловил рот таким, каким его
        // нарисовали в последний раз, — то есть зависел от того, как шло
        // поглаживание. Цель прицела гуляла на пять единиц от захода к
        // заходу, а сверка с калькулятором краснела через раз. Замер ждёт,
        // пока поза точно нарисуется (MOUTH_SETTLE); первый толчок всё равно
        // позже. До замера прицел считается по текущему рту — прикидкой.
        this.mouthAt = null;
        this.mouthDue = performance.now() + this.MOUTH_SETTLE;
        this.mouthFrames = (window.WormRenderer && WormRenderer.geomFrames) ? WormRenderer.geomFrames() : null;
        this.bendAim = this.solveBend(this.mouthPoint());
        this.drawGauge();

        // Кольцо с поглаживания отпускается: в финале его нет.
        this.ringTouch(null);
        this.shotAt = null;
        this.aimLast = performance.now();
        const tick = (now) => {
            // Шаг по времени, а не по кадру: на медленном телефоне упругость
            // иначе становится другой физикой.
            const dt = Math.min(0.05, (now - this.aimLast) / 1000);
            this.aimLast = now;
            // Замер ждёт не только время, но и КАДРЫ: под нагрузкой червь на
            // пяти кадрах в секунду не всегда успевал дорисовать позу за
            // MOUTH_SETTLE, и рот замерялся прежним (сверка с калькулятором
            // краснела раз в десяток прогонов). Три кадра деформации после
            // смены позы — поза точно на экране. Страховка: не позже секунды
            // с половиной, если счётчика кадров нет или он стоит.
            const framesOk = this.mouthFrames == null
                || WormRenderer.geomFrames() - this.mouthFrames >= 3
                || now >= this.mouthDue + 1000;
            if (!this.mouthAt && now >= this.mouthDue && framesOk) {
                this.mouthAt = this.mouthPoint();
                this.bendAim = this.solveBend(this.mouthAt);
            }
            // На доигрывании хвостом распоряжается relaxTail: он опадает, а
            // не слушается упругости. Двое пишущих в bend дёргали бы его.
            // Порция считается и на доигрывании: последний выстрел оставил
            // бы её висеть у шейки, если бы счёт остановился вместе с ним.
            this.stepPulse(now);
            if (this.phase === 'aim' || this.phase === 'settle') this.drawAmmo();
            if (this.phase === 'aim') {
                this.stepBend(dt);
                this.stepRing(dt);
                // Хвост стоит — дорисовать начисто, дальше ключ всё равно
                // совпадёт и записи не будет.
                this.drawTail((this.bendStep || 0) < 0.0005);
            }
            this.stepDrops(dt);
            this.aimRaf = requestAnimationFrame(tick);
        };
        this.aimRaf = requestAnimationFrame(tick);
        this.shotTimer = setTimeout(() => this.shoot(), this.shotMs());
        this.nextShotAt = performance.now() + this.shotMs();
    },

    // Шаг упругости. Палец тянет с ПОСТОЯННОЙ силой, упругость тянет обратно
    // и растёт быстрее отклонения — поэтому кончик всегда встаёт НЕ ТАМ, где
    // палец, а там, где силы сошлись. Чем дальше отгибаешь, тем сильнее
    // недобор, и держать цель приходится всё время.
    //
    // Порядок первый (без инерции) выбран нарочно: пружина второго порядка
    // раскачивается, и хвост начинает болтаться сам по себе — целиться в
    // болтающийся хвост нечестно, разброс и так намеренно случайный.
    // Выпрямление. Идёт ВСЕГДА, в том числе пока палец на экране: в этом вся
    // разница с прежней версией, где неподвижный палец держал угол сам.
    stepBend(dt) {
        const was = this.bend;
        const t = this.tailTier();
        this.bend = LustShot.relaxBend(this.bend, dt,
            { relax: t.relax, hard: this.BEND_HARD }, this.BEND_MAX);
        // Насколько хвост сдвинулся за этот шаг: по этому числу кадровый цикл
        // решает, дорисовывать ли его начисто (см. drawTail).
        this.bendStep = Math.abs(this.bend - was);
    },

    // Угол пальца вокруг корня хвоста. Ноль — прямо над корнем, вправо
    // положительный.
    handAngle(p) {
        const A = BATH_ART.slots();
        const dx = (BATH_ART.TAIL.side || 1) * (p.x - A.tail.x), dy = A.tail.y - p.y;
        if (Math.hypot(dx, dy) < this.BEND_MIN_R) return null;
        return Math.atan2(dx, dy);
    },

    // Палец ВЕДЁТ хвост: наклон меняется от пройденного по дуге пути, а не
    // от того, где палец остановился, — и в ОБЕ стороны. Ход к морде гнёт,
    // ход обратно разгибает, и разгибание складывается с собственным
    // выпрямлением хвоста. Отдача в обе стороны одна — из ступени хвоста.
    // Завести руку заново — оторвать палец: пока он в воздухе, хода нет.
    aimAt(p) {
        // Кольца в финале НЕТ: палец здесь наклоняет хвост, а по стволу идут
        // порции (stepPulse) — мять его пальцем поверх них значило бы
        // спорить с ними за одну и ту же толщину.
        const a = this.handAngle(p);
        if (a == null) return;
        if (this.bendHand == null) { this.bendHand = a; return; }
        const d = a - this.bendHand;
        this.bendHand = a;
        if (d) this.bend = LustShot.pushBend(this.bend, d, this.tailTier(), this.BEND_MAX);
    },

    // Один толчок. Из кончика вылетает КАПЛЯ-СНАРЯД: дальше она живёт по
    // баллистике, и попадание — это её столкновение с открытым ртом. Раньше
    // исход решала формула, а полёт был отдельной картинкой про то же самое:
    // игрок видел струю в рот и не попадал.
    shoot() {
        if (this.phase !== 'aim') return;
        const C = this.cfg();
        const t = this.tailTier();
        const s = this.tipState();
        const v = LustShot.launch(C, t, s.dir);
        // Попадёт ли — решается ЗДЕСЬ, тем же полётом, что у калькулятора
        // (LustShot.fly): шаг фиксированный, случайности после вылета нет,
        // значит и путь тот же самый. Капле, которая долетит, ничто больше
        // не мешает: иначе морда вокруг рта ловила бы её раньше корзины, и
        // игра засчитывала бы меньше, чем посчитал баланс.
        const m = this.mouthAt || this.mouthPoint();
        const main = { x: s.x, y: s.y, vx: v.vx, vy: v.vy, t: 0, r: 11,
                       main: true, trail: [], shed: 0, shedT: 0, seed: Math.random(),
                       willHit: LustShot.fly(C, { x: s.x, y: s.y }, v, m, C.mouthR).hit,
                       // Струя за головой: откуда и с какой скоростью
                       // вылетела, и какая доля её ещё цела (1 — вся).
                       stream: { x0: s.x, y0: s.y, vx: v.vx, vy: v.vy, back: 1 } };
        if (typeof LustGoo !== 'undefined') LustGoo.arm(main);
        this.drops.push(main);
        // Мелкие брызги рядом — только вид. На счёт они не влияют: иначе
        // десять толчков превращаются в полсотни попыток.
        for (let i = 0; i < (C.spray || 0); i++) {
            const a = v.angle + (Math.random() - 0.5) * 0.22;
            const k = 0.82 + Math.random() * 0.3;
            const sp = Math.hypot(v.vx, v.vy) * k;
            this.spawnDrop(s.x, s.y, Math.cos(a) * sp, Math.sin(a) * sp,
                           4 + Math.random() * 3);
        }

        // Порция ушла с выстрелом: ствол на миг опадает (BATH_ART.PULSE.after).
        this.shotAt = performance.now();
        if (--this.shotsLeft > 0) {
            this.shotTimer = setTimeout(() => this.shoot(), this.shotMs());
            this.nextShotAt = performance.now() + this.shotMs();
        } else {
            this.nextShotAt = null;
            this.startSettle();
        }
    },

    // Мелкая капля: брызги у кончика и то, что отрывается от хвоста кометы.
    spawnDrop(x, y, vx, vy, r) {
        const d = { x, y, vx, vy, t: 0, r, main: false, trail: [], seed: Math.random() };
        if (typeof LustGoo !== 'undefined') LustGoo.arm(d);
        this.drops.push(d);
        return d;
    },

    // ---------- ДОИГРЫВАНИЕ ----------
    // Управление у игрока отобрано, но игра ещё не кончилась: последние капли
    // обязаны долететь и растечься там, где долетели.
    //
    // Раньше здесь стоял таймер на done(), а done() гасил кадровый цикл — и
    // капли, не успевшие приземлиться, ЗАМИРАЛИ В ВОЗДУХЕ. Ждать «примерно
    // достаточно» нельзя: сколько летит капля, зависит от силы толчка и
    // угла, и в редком случае она живёт вдвое дольше средней.
    //
    // Поэтому ждём не время, а ПУСТОЕ НЕБО: как только последняя капля
    // приземлилась, доигрывание кончилось. Потолок в maxT + запас всё равно
    // стоит — на случай капли, застрявшей в углу расчёта.
    startSettle() {
        this.phase = 'settle';
        this.bendHand = null;
        this.drag = null;
        // Три знака сразу говорят, что управление отобрано, и ни одного
        // слова (инвариант 9): вода перестаёт литься, хвост опадает, червь
        // тяжело дышит.
        this.setOpacity('bt-rain-far', 0);
        this.setOpacity('bt-rain-near', 0);
        this.setOpacity('bt-rain-veil', 0);
        this.relaxTail();
        this.startPanting();
        const t0 = performance.now();
        const wait = () => {
            const dry = !this.drops.length;
            if (dry || performance.now() - t0 > 4000) {
                this.settleRaf = 0;
                this.shotTimer = setTimeout(() => this.done(), 900);
                return;
            }
            this.settleRaf = requestAnimationFrame(wait);
        };
        this.settleRaf = requestAnimationFrame(wait);
    },

    // Тяжёлое дыхание. Дышит ТЕЛО, а не червь целиком: сегменты набухают и
    // опадают на месте.
    //
    // Первая версия качала всю фигуру по вертикали — и червь читался не
    // дышащим, а качающимся на волнах. Дыхание не двигает существо с места:
    // оно меняет ОБЪЁМ, и только его.
    //
    // Раздувание идёт собственным механизмом рендерера (WORM_BREATH_RATIO:
    // живот сильнее всех, за ним второй сегмент, потом первый), просто с
    // размахом втрое больше обычного. Заводить своё было бы вторым способом
    // делать то же самое.
    //
    // Морда идёт ТОЙ ЖЕ волной, и это половина эффекта: на вдохе шире открыт
    // рот и приподняты веки, на выдохе опадают уши. По одному телу дыхание
    // читается бурлением в кишках, а не усталостью.
    PANT_HZ: 0.8,        // вдохов в секунду: глубоко, а не часто
    PANT_AMP: 0.14,      // размах вдоха, доля радиуса (обычный — 0.035)

    startPanting() {
        const t0 = performance.now();
        const step = (now) => {
            // Та же однополярная волна и та же частота, что у рендерера, —
            // иначе морда дышала бы отдельно от тела.
            const t = (now - t0) / 1000;
            const w = (1 - Math.cos(t * this.PANT_HZ * Math.PI * 2)) / 2;
            if (this.wormHandle && this.wormHandle.setLivePose) {
                this.wormHandle.setLivePose({
                    breathAmp: this.PANT_AMP,
                    breathSpeed: this.PANT_HZ,
                    mouthOpenness: 0.45 + 0.4 * w,
                    eyelidLevel: this.LID_MAX * (1 - 0.4 * w),
                    earTilt: 12 - 12 * w
                });
            }
            this.pantRaf = requestAnimationFrame(step);
        };
        this.pantRaf = requestAnimationFrame(step);
    },

    // Шаг всех капель. Идёт ФИКСИРОВАННЫМ шагом из конфига, а не длиной
    // кадра: тем же шагом считает баланс tools/sim-lust.js, и расходиться им
    // нельзя. Лишнее время копится и доедается на следующем кадре.
    stepDrops(dt) {
        // Рот берётся ИЗ КЭША, а не спрашивается у персонажа каждый кадр:
        // getPartPoint читает getBBox и getScreenCTM, то есть заставляет
        // браузер пересчитать раскладку — по три раза за кадр только ради
        // точки, которая весь финал стоит на месте.
        const C = this.cfg(), m = this.mouthAt || this.mouthPoint();
        const goo = typeof LustGoo !== 'undefined' ? LustGoo : null;
        this.dropAcc = (this.dropAcc || 0) + dt;
        let guard = 12;
        while (this.dropAcc >= C.dt && guard-- > 0) {
            this.dropAcc -= C.dt;
            for (let i = this.drops.length - 1; i >= 0; i--) {
                const d = this.drops[i];
                if (!d.stream) d.trail.unshift({ x: d.x, y: d.y });
                LustShot.step(d, C);
                if (!d.stream) this.trimTrail(d);
                if (d.main && LustShot.inMouth(d, m, C.mouthR)) {
                    this.drops.splice(i, 1);
                    this.breakStream(d);
                    this.hits++;
                    this.drawGauge();
                    this.splats.push({ x: m.x, y: m.y, r: 16, t: 0, gulp: true });
                    continue;
                }
                // Брызги, залетевшие в рот, он тоже глотает — но НЕ
                // засчитывает: иначе десять толчков стали бы полусотней
                // попыток.
                if (!d.main && LustShot.inMouth(d, m, C.mouthR * 0.8)) {
                    this.drops.splice(i, 1);
                    continue;
                }
                if (d.stream) this.shedStream(d);
                // Долетающую каплю ничто не ловит по дороге (см. shoot).
                const over = d.willHit ? LustShot.spent(d, C)
                           : goo ? goo.hit(d) : LustShot.spent(d, C);
                if (over) {
                    this.drops.splice(i, 1);
                    if (d.stream) this.breakStream(d);
                }
            }
        }
        // Вспышка попадания гаснет сама. Промахи сюда больше не попадают:
        // они прилипают к тому, во что упёрлись, и дальше ими ведает
        // LustGoo — у каждой поверхности свой слой глубины.
        for (let i = this.splats.length - 1; i >= 0; i--) {
            const sp = this.splats[i];
            sp.t += dt;
            if (sp.t > 0.45) this.splats.splice(i, 1);
        }
        this.renderShots();

        // Лужица во рту рисуется САМИМ ЧЕРВЁМ — это часть его рта, а не
        // пятно поверх морды. Значит она едет с ним при любом переезде
        // камеры, обрезается его же губами и уходит в расфокус вместе с ним.
        // Пока её рисовала мини-игра в своём слое, она жила отдельной
        // жизнью и на камере, собранной под хвост, оказывалась на щеке.
        // Лужа растёт до полной на ПОЛНОМ жетоне, то есть по сумме цен всех
        // частей шкалы, а не по числу толчков.
        const full = this.gaugeSteps().reduce((a, b) => a + b, 0) || 1;
        this.setMouthFill(this.hits / full);
    },

    // ---------- КОМЕТА ----------
    // Хвост кометы — это просто прошлые положения капли, обрезанные по
    // длине, а не по числу: на быстрой капле он длиннее, чем на
    // зависшей в верхней точке дуги, — так и видно скорость.
    trimTrail(d) {
        // Хвост мелкой капли — в два её радиуса: длиннее он читался шипом.
        const max = d.r * (d.main ? 6.5 : 2.2);
        let len = 0, px = d.x, py = d.y;
        for (let k = 0; k < d.trail.length; k++) {
            const q = d.trail[k];
            len += Math.hypot(q.x - px, q.y - py);
            px = q.x; py = q.y;
            if (len > max) { d.trail.length = k + 1; return; }
        }
    },

    // ---------- СТРУЯ: ЛЕНТА, ОТ КОТОРОЙ ОТРЫВАЮТСЯ КАПЛИ ----------
    // Толчок — один выплеск: жижа выходит из кончика не мгновенно, а за
    // долю секунды (STREAM.emit), и чем позже вышла, тем медленнее летит
    // (STREAM.slow — во сколько раз хвост ленты медленнее головы). Отсюда
    // вся форма: сначала лента тянется от кончика, потом отрывается от него
    // и вытягивается по дуге, потому что голова уходит вперёд.
    //
    // Точка ленты u (0 — голова, 1 — самый хвост) — это частица, вылетевшая
    // позже на u·emit со скоростью (1 − (1 − slow)·u). Её место — формула
    // баллистики от момента вылета, без шагов и без хранения: лента из
    // десяти точек стоит десять формул за кадр.
    //
    // Голова — это та самая капля, по которой считается попадание, и её путь
    // обязан совпадать с калькулятором (LustShot.fly). Поэтому ленту строит
    // формула, а к голове она лишь подтягивается поправкой: шаги полёта
    // головы и точная формула за секунду расходятся на несколько единиц.
    // Первая подборка (0.12 с, хвост в 0.62 скорости) давала ленту в
    // полсотни единиц длиной и два десятка толщиной — короткий крючок, а не
    // струю. Струя читается струёй, когда она раз в пять-шесть длиннее
    // своей толщины.
    STREAM: { emit: 0.22, slow: 0.5, points: 12, pinch: 0.07, pieces: 6 },

    streamAt(d, u) {
        const S = d.stream, C = this.cfg(), T = this.STREAM;
        const k = 1 - (1 - T.slow) * u, tt = Math.max(0, d.t - u * T.emit);
        const g = C.gravity;
        // Поправка к голове: разница между шагами полёта и формулой.
        const hx = S.x0 + S.vx * d.t, hy = S.y0 + S.vy * d.t + 0.5 * g * d.t * d.t;
        const w = 1 - u;
        return { x: S.x0 + S.vx * k * tt + (d.x - hx) * w,
                 y: S.y0 + S.vy * k * tt + 0.5 * g * tt * tt + (d.y - hy) * w,
                 vx: S.vx * k, vy: S.vy * k + g * tt, out: d.t >= u * T.emit };
    },

    // Хвост ленты РВЁТСЯ: как только лента оторвалась от кончика, с её
    // заднего конца раз в pinch секунд отщипывается капля. Оторвавшаяся —
    // уже отдельная капля: своя скорость (та, с какой летел этот кусок
    // ленты), своя дуга, свой след. Лента после этого короче и тоньше: у
    // неё меньше массы и нет самого медленного хвоста.
    shedStream(d) {
        const S = d.stream, T = this.STREAM;
        if (d.shed >= T.pieces || d.t < T.emit + 0.04 || d.t - d.shedT < T.pinch) return;
        const q = this.streamAt(d, S.back);
        d.shed++;
        d.shedT = d.t;
        S.back = Math.max(0.2, S.back - 0.8 / T.pieces);
        this.spawnDrop(q.x, q.y, q.vx + (Math.random() - 0.5) * 30,
                       q.vy + (Math.random() - 0.5) * 30, 2.4 + Math.random() * 1.6);
    },

    // Голова приземлилась (в рот, на тело, на борт) — остаток ленты в
    // воздухе не исчезает, а распадается на капли, каждая со скоростью
    // своего куска. Иначе вся струя пропадала в одном кадре с головой.
    breakStream(d) {
        const S = d.stream;
        if (!S) return;
        for (const u of [S.back * 0.45, S.back]) {
            const q = this.streamAt(d, u);
            if (!q.out) continue;
            this.spawnDrop(q.x, q.y, q.vx, q.vy, 2.6 + 3 * S.back * (1 - u));
        }
        d.stream = null;
    },

    // Ось и полуширина ленты для рисунка. Голова тоньше, когда лента
    // растеряла массу; хвост скруглён и тонок — там она и рвётся.
    streamShape(d, scale) {
        const S = d.stream, T = this.STREAM, n = T.points;
        const pts = [], ws = [];
        const head = d.r * 0.72 * (0.85 + 0.15 * S.back);
        for (let i = 0; i < n; i++) {
            const u = S.back * i / (n - 1);
            const q = this.streamAt(d, u);
            pts.push(q);
            // Сужение — по ОСТАВШЕЙСЯ ленте: растеряв хвост, она всё равно
            // сужается к концу, а не становится палочкой ровной толщины.
            ws.push(head * (1 - 0.6 * Math.pow(u / S.back, 0.8)) * scale);
        }
        return BATH_ART.streamD(pts, ws, Math.atan2(S.vy, S.vx));
    },

    // ---------- ЖИВОЙ СЛОЙ ВЫСТРЕЛА: УЗЛЫ, А НЕ РАЗМЕТКА ----------
    // Капли в полёте и ползущие потёки меняются КАЖДЫЙ кадр. Пока слой
    // пересобирался строкой, браузер на каждом кадре заново разбирал
    // разметку, строил узлы и выбрасывал прежние — и всё это ради четырёх
    // сдвинувшихся эллипсов.
    //
    // Теперь узлы живут в пуле и переиспользуются: за кадр правится по
    // нескольку атрибутов, разбора разметки нет вовсе. Лишние узлы не
    // удаляются, а прячутся — удаление и создание стоят столько же, сколько
    // разбор, а капель за забег ровно столько же, сколько было.
    shotNode(kind, i, markup) {
        if (!this._pool) this._pool = {};
        const pool = this._pool[kind] || (this._pool[kind] = []);
        if (pool[i]) return pool[i];
        const layer = this.el('bt-shots');
        if (!layer) return null;
        layer.insertAdjacentHTML('beforeend', markup());
        pool[i] = layer.lastElementChild;
        return pool[i];
    },

    hideRest(kind, from) {
        const pool = (this._pool && this._pool[kind]) || [];
        for (let i = from; i < pool.length; i++) pool[i].setAttribute('display', 'none');
    },

    renderShots() {
        let flash = 0;
        for (const s of this.splats) {
            // Попадание: короткая вспышка в самой корзине рта.
            const n = this.shotNode('flash', flash++, () => BATH_ART.flashNode());
            if (!n) continue;
            const k = 1 - s.t / 0.45;
            n.setAttribute('cx', s.x.toFixed(1));
            n.setAttribute('cy', s.y.toFixed(1));
            n.setAttribute('r', (s.r * (1.6 - k)).toFixed(1));
            n.setAttribute('opacity', (k * 0.9).toFixed(2));
            n.removeAttribute('display');
        }
        this.hideRest('flash', flash);

        // Все капли в полёте — ОДНИМ путём: одна запись атрибута за кадр,
        // сколько бы их ни летело. С отрывающимися от кометы каплями их в
        // воздухе бывает под два десятка, и узел на каждую был бы два
        // десятка записей.
        // Тень — тот же путь со сдвигом узла. Ядро — та же комета, вдвое
        // тоньше: по оси струи жижа толще и мутнее, к краям просвечивает.
        // Блик — только у крупных.
        let d = '', core = '', hi = '';
        for (const q of this.drops) {
            if (q.stream) {
                d += this.streamShape(q, 1);
                core += this.streamShape(q, 0.5);
            } else {
                // Мелкая капля — капля, а не шип: хвост по её следу
                // сужается вдвое, а не в точку, и кончик скруглён.
                const pts = [q].concat(q.trail), n = pts.length - 1;
                const ws = pts.map((_, i) => q.r * (1 - 0.55 * (n ? i / n : 0)));
                const dir = Math.atan2(q.vy, q.vx);
                d += BATH_ART.streamD(pts, ws, dir);
                core += BATH_ART.streamD(pts, ws.map(w => w * 0.55), dir);
            }
            if (q.r > 5) hi += BATH_ART.cometHi(q.x, q.y, q.r);
        }
        this.setFly(d, hi, core);
    },

    setFly(d, hi, core) {
        for (const [id, v] of [['bt-fly', d], ['bt-fly-sh', d], ['bt-fly-hi', hi],
                               ['bt-fly-core', core || '']]) {
            const n = this.el(id);
            if (n && n.getAttribute('d') !== v) n.setAttribute('d', v);
        }
    },

    // Уровень жидкости во рту. Отдельным методом, потому что его дёргают из
    // двух мест: полёт капель и сброс на старте забега.
    setMouthFill(k) {
        if (!this.wormHandle || !this.wormHandle.setLivePose) return;
        const v = Math.max(0, Math.min(1, k || 0));
        if (v === this.mouthFill) return;
        this.mouthFill = v;
        this.wormHandle.setLivePose({
            mouthFill: v, mouthFillColor: PALETTE.bathScene.milk[500] });
    },

    // ---------- ВХОД В МАГАЗИН ----------
    // Только до забега и после него: «готовятся до, тратят после»
    // (docs/plan/21-lust-bath.md, разд. 6). Кнопка не просто глохнет, а
    // УХОДИТ с экрана — неживая кнопка посреди мытья читалась бы поломкой.
    shopAllowed() {
        return this.phase === 'idle' || this.phase === 'done';
    },

    syncShopButton() {
        if (!this.shopBtn) this.shopBtn = document.getElementById('bt-shop-btn');
        if (this.shopBtn) this.shopBtn.classList.toggle('on', this.shopAllowed());
    },

    // ---------- КУПЛЕННЫЕ СТУПЕНИ ----------
    // Один вход на все четыре полки магазина. Читается КАЖДЫЙ РАЗ, а не
    // запоминается на входе в забег: покупка случается между забегами, и
    // кешированное здесь значение отстало бы ровно на один заход.
    //
    // Backend.upgradeValue отдаёт ЗНАЧЕНИЕ ступени, а не прибавку, — у
    // хвоста это объект из шести чисел, у мыла и мочалки одно число.
    up(key, fallback) {
        if (typeof Backend === 'undefined' || !Backend.upgradeValue) return fallback;
        const v = Backend.upgradeValue('lust', key);
        return (v === 0 || v) ? v : fallback;
    },

    // Ступень хвоста: толчки, сила, разброс и послушность одной записью.
    // Почему одной, а не четырьмя полками — в комментарии у лестницы
    // (src/config/economy.js, ECONOMY.minigames.lust.upgrades.tail).
    // Номер ступени хвоста (0 — ничего не куплено) — для его вида.
    tailLevel() {
        if (typeof GameState === 'undefined' || !GameState.upgradeLevel || typeof Backend === 'undefined') return 5;
        return GameState.upgradeLevel(Backend.upgradeKey('lust', 'tail')) || 0;
    },

    tailTier() {
        return this.up('tail', { shots: 10, minPower: 0, maxPower: 0.9,
                                 spread: 45, gain: 0.35, relax: 0.30 }) || {};
    },

    // Цены делений шкалы: сколько попаданий стоит каждое. Набираются по
    // порядку и с нуля (LustShot.gaugeState).
    gaugeSteps() {
        return this.cfg().gauge || [2, 5, 8];
    },

    // Шкала над головой — жетон из трёх частей разной цены. Рисуется
    // заново на каждое попадание: попаданий за забег не больше двадцати, и
    // строка в шестьдесят узлов раз в полсекунды ничего не стоит.
    drawGauge() {
        const m = this.mouthPoint();
        // Над головой, считая от ВЕРХА нарисованного червя: доля от холста
        // персонажа уводила шкалу за кадр, стоило поменять его посадку.
        const top = this.coverBox().y;
        this.el('bt-gauge').innerHTML =
            BATH_ART.gauge(m.x, top - 40, this.gaugeSteps(), this.hits);
    },

    // Дыхание живёт ДОЛЬШЕ остальных часов: оно продолжается и на итоговом
    // экране — червь только что отработал, ему есть от чего отдышаться.
    // Поэтому гасится оно не в stopClocks, а на входе и выходе из игры.
    stopPanting() {
        if (this.pantRaf) { cancelAnimationFrame(this.pantRaf); this.pantRaf = 0; }
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ breathAmp: null, breathSpeed: null });
    },

    stopClocks() {
        if (this.fillRaf) { cancelAnimationFrame(this.fillRaf); this.fillRaf = 0; }
        if (this.aimRaf) { cancelAnimationFrame(this.aimRaf); this.aimRaf = 0; }
        if (this.camTimer) { this.endCamMove(); }
        if (this.rubRaf) { cancelAnimationFrame(this.rubRaf); this.rubRaf = 0; }
        if (this.blurRaf) { cancelAnimationFrame(this.blurRaf); this.blurRaf = 0; }
        if (this.settleRaf) { cancelAnimationFrame(this.settleRaf); this.settleRaf = 0; }
        if (this.relaxRaf) { cancelAnimationFrame(this.relaxRaf); this.relaxRaf = 0; }
        clearTimeout(this.shotTimer); this.shotTimer = 0;
        this.nextShotAt = null; this.shotAt = null;
        this.clearHint();
    },

    done() {
        this.phase = 'done';
        this.stopClocks();
        this.relaxTail();
        const sections = LustShot.gaugeState(this.hits, this.gaugeSteps()).done;
        // Мини-игра НИЧЕГО не начисляет сама (инвариант 2): она сообщает,
        // сколько частей жетона закрыто, а что за это дать — решает конфиг
        // наград (осколок за каждую).
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'bath', outcome: 'win',
            meta: { hits: this.hits, sections, shots: this.tailTier().shots || 10 }
        });
        this.syncShopButton();
    },

    // Забег кончился — хвост опадает: сдувается до исходного размера и
    // выпрямляется. Замерший в согнутом положении налитый хвост читался
    // зависшей игрой: всё остановилось, а он всё ещё стоит под нагрузкой.
    //
    // Заряд и изгиб — те же два числа, что рисуют хвост весь забег, так что
    // ничего особенного тут нет: их просто ведут к нулю.
    relaxTail() {
        const from = this.charge, bend0 = this.bend, DUR = 900;
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / DUR);
            const e = 1 - Math.pow(1 - k, 3);
            this.charge = from * (1 - e);
            this.bend = bend0 * (1 - e);
            // Последний кадр опадания — начисто (force): иначе частота
            // перерисовки хвоста могла бы его пропустить, и хвост вместе с
            // пятнами на нём застыл бы чуть согнутым.
            this.drawTail(k >= 1);
            this.relaxRaf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        this.relaxRaf = requestAnimationFrame(step);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LustMinigame.init());
} else {
    LustMinigame.init();
}
