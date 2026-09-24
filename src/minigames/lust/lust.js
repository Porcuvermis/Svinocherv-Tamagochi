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
    wormHost: null,
    wormHandle: null,

    // Ступени забега. Держатся строкой, а не числом: в отладке видно, где ты.
    phase: 'idle',      // idle → rinse → soap → cloth → tail → pop → rub → aim → done
    drag: null,
    fillRaf: 0,

    // Покрытие тела считается по КЛЕТКАМ, а не по пикселям: требование
    // «закрась всё» упирается в пару незакрашенных точек, и игрок не
    // понимает, почему этап не кончается (план, §1).
    // Сетка приходит из конфига: это число баланса, а не картинки.
    cells: null,
    covered: 0,
    _cover: null,      // габарит червя в сцене, посчитанный по нарисованному
    _bbox: null,       // габарит нарисованного червя в единицах его холста
    cellOn: null,      // какие клетки вообще лежат НА черве
    cellTotal: 0,
    dirty: false,      // клетка изменилась — след надо перерисовать

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
    filmCells: null,   // что было намылено к концу первого этапа

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

    // Сколько проходов нужно клетке на текущем этапе.
    stageNeed() {
        return this.phase === 'cloth' ? (this.cfg().clothRubs || 3) : 1;
    },

    // Радиус мазка в точках сцены. В конфиге он задан В КЛЕТКАХ: червь на
    // экране меняет размер, а «мыло берёт клетку с окрестностью» — нет.
    stageRadius() {
        const C = this.cfg(), b = this.coverBox(), G = this.grid();
        // Радиус — КУПЛЕННЫЙ: мыло и мочалка качаются каждая своей полкой.
        const t = this.up(this.phase === 'cloth' ? 'cloth' : 'soap', null) || {};
        const cells = this.phase === 'cloth' ? (t.radius || C.clothCells || 1.0)
                                             : (t.radius || C.soapCells || 1.15);
        return cells * Math.max(b.w / G.nx, b.h / G.ny);
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
        this.wormHost = document.getElementById('bt-worm');
        if (!this.svgEl || !this.backEl) return;

        // Холсты следа живут в тех же единицах, что и холст червя, и потому
        // ездят с ним одним преобразованием (см. layoutWorm).
        const B = this.WORM_BASE, S = this.MASK_SCALE;
        const c = this.el('bt-wash');
        c.width = B.w * S; c.height = B.h * S;
        c.style.width = B.w + 'px'; c.style.height = B.h + 'px';
        this.washCtx = c.getContext('2d');

        this.camBackEl.innerHTML = BATH_ART.sceneBack();
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
        if (typeof LustShop !== 'undefined') LustShop.close();
        if (typeof LustDebug !== 'undefined') LustDebug.render();
        this.syncShopButton();
        this.resetCover();
        this.wipeLather();
        this.el('bt-bubbles').innerHTML = '';
        this.el('bt-cam-rain-far').innerHTML = BATH_ART.rain(false);
        this.el('bt-cam-rain-near').innerHTML = BATH_ART.rain(true);
        // bt-splats здесь НЕТ: там разметка слоя потёков, её чистит
        // LustGoo.reset(), а не выбрасывает.
        for (const id of ['bt-tail', 'bt-foam', 'bt-bubbles', 'bt-shots',
                          'bt-gauge', 'bt-spot'])
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
        // Ушёл из ванной — следы смыты (docs/plan/21-lust-bath.md, разд. 3в).
        if (typeof LustGoo !== 'undefined') LustGoo.reset();
        this.drag = null;
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
    // дышит, остальные стоят смирно (инвариант 9).
    ready(what) {
        for (const [key, id] of [['shower', 'bt-shower'],
                                 ['soap', 'bt-soap-home'],
                                 ['cloth', 'bt-cloth-home']]) {
            const n = this.el(id);
            if (n) n.classList.toggle('bt-ready', key === what);
        }
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
            this.buildCells();
        };
        img.onerror = () => {
            this.mask = null; this.maskAlpha = null; this.buildCells();
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    },

    // Какие клетки покрытия вообще лежат на теле. Без этого порог 92%
    // недостижим: угол коробки червём не занят, и мылить там нечего.
    buildCells() {
        const G = this.grid(), b = this.coverBox();
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        this.cellOn = new Array(G.nx * G.ny).fill(true);
        this.cellTotal = G.nx * G.ny;
        if (!this.mask) return;
        const g = this.mask.getContext('2d');
        const k = B.w / box.w * S;
        let on = 0;
        for (let j = 0; j < G.ny; j++) {
            for (let i = 0; i < G.nx; i++) {
                const sx = b.x + (i + 0.5) * b.w / G.nx;
                const sy = b.y + (j + 0.5) * b.h / G.ny;
                const px = Math.round((sx - box.x) * k);
                const py = Math.round((sy - box.y) * k);
                let a = 0;
                try { a = g.getImageData(px, py, 1, 1).data[3]; } catch (e) { a = 255; }
                const hit = a > 0;
                this.cellOn[j * G.nx + i] = hit;
                if (hit) on++;
            }
        }
        // Совсем пустая маска означает, что силуэт не сняли: лучше считать
        // по всей коробке, чем сделать этап непроходимым.
        if (on >= 8) this.cellTotal = on;
        else this.cellOn.fill(true);
        this.resetCover();
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
        const G = this.grid();
        this.cells = new Array(G.nx * G.ny).fill(0);
        this.covered = 0;
        this.dirty = false;
    },

    // Пометить клетки под мазком. Возвращает долю покрытого — от клеток НА
    // ТЕЛЕ, а не от всей коробки: мазки мимо червя больше не засчитываются,
    // и требовать их незачем.
    paint(x, y, radius, need) {
        const b = this.coverBox(), G = this.grid();
        const cw = b.w / G.nx, ch = b.h / G.ny;
        const i0 = Math.max(0, Math.floor((x - radius - b.x) / cw));
        const i1 = Math.min(G.nx - 1, Math.floor((x + radius - b.x) / cw));
        const j0 = Math.max(0, Math.floor((y - radius - b.y) / ch));
        const j1 = Math.min(G.ny - 1, Math.floor((y + radius - b.y) / ch));
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const k = j * G.nx + i;
                if (this.cellOn && !this.cellOn[k]) continue;
                const cx = b.x + (i + 0.5) * cw, cy = b.y + (j + 0.5) * ch;
                if (Math.hypot(cx - x, cy - y) > radius) continue;
                if (this.cells[k] >= need) continue;
                this.cells[k]++;
                this.dirty = true;
                if (this.cells[k] >= need) this.covered++;
            }
        }
        return this.covered / (this.cellTotal || (G.nx * G.ny));
    },

    // ---------- СЛЕД НА ХОЛСТЕ ----------
    // Рисуется РОВНО ТА ЖЕ СЕТКА, по которой считается прогресс: клетка со
    // ступенью яркости по числу проходов. Пока след был мягкими пятнами
    // «примерно там, где вёл палец», картинка и учёт жили отдельно, и игрок
    // не понимал ни где сделано, ни сколько осталось — особенно на мочалке,
    // где клетке нужно три прохода.
    //
    // Перерисовывается ЦЕЛИКОМ, но только когда клетка изменилась: сотня
    // кругов раз в несколько событий указателя дешевле, чем накопление
    // мазков, и картинка не может разойтись с состоянием.
    // Состояние КЛЕТКИ и есть картинка. Рисуется ровно та сетка, по которой
    // считается прогресс, поэтому «где сделано» видно буквально, а не
    // угадывается по мягкому пятну примерно там, где вёл палец.
    //
    // Три вида, и они различаются НАЗНАЧЕНИЕМ, а не оттенком одного и того
    // же: голая кожа — не трогали; мутная плёнка — намылено; яркая пена —
    // оттёрто, со ступенью на каждую тёрку. Пока муть и пена жили разными
    // слоями и складывались, «намылено» и «оттёрто» давали одно бледное
    // пятно, и этап мочалки читался пустым.
    renderLather() {
        const ctx = this.washCtx;
        if (!ctx || !this.cells) return;
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        const k = B.w / box.w * S;
        const b = this.coverBox(), G = this.grid(), need = this.stageNeed();
        const cw = b.w / G.nx, ch = b.h / G.ny;
        const r = Math.max(cw, ch) * 0.78 * k;
        const cloth = this.phase === 'cloth';

        // ДВА ПРОХОДА, и разница между ними — обрезка силуэтом.
        //
        // Подложка — это плёнка НА КОЖЕ: она обязана кончаться там же, где
        // кончается червь. Пузырь — предмет, лежащий на коже: он выпуклый,
        // и у края тела половина его честно торчит наружу. Пока обрезалось
        // всё разом, пена кончалась идеально ровной дугой по контуру червя,
        // а крайние пузыри стояли аккуратными полукружиями — так пена не
        // выглядит нигде.
        //
        // Наружу пузырь может уехать только НЕМНОГО: сажают его по клетке, а
        // клетки живут строго на теле (cellOn). Дальше своего радиуса край
        // не уйдёт, и получается ровно то, что нужно, — мохнатая кромка.
        // Стоит ли точка холста на теле. Нужна пузырям: сажают их по клетке,
        // а клетка крупная, и центр большого пузыря может уехать за силуэт —
        // тогда он повиснет в воздухе отдельным колечком.
        const W = this.mask ? this.mask.width : 0;
        const H = this.mask ? this.mask.height : 0;
        const A = this.maskAlpha;
        const inside = A ? (px, py) => {
            const i = Math.round(px), j = Math.round(py);
            if (i < 0 || j < 0 || i >= W || j >= H) return false;
            return A[j * W + i] > 0;
        } : null;

        const paint = (part) => {
            for (let j = 0; j < G.ny; j++) {
                for (let i = 0; i < G.nx; i++) {
                    const idx = j * G.nx + i;
                    if (this.cellOn && !this.cellOn[idx]) continue;
                    const rubs = this.cells[idx] || 0;
                    const filmed = cloth ? (this.filmCells && this.filmCells[idx])
                                         : rubs > 0;
                    if (!rubs && !filmed) continue;
                    const x = (b.x + (i + 0.5) * cw - box.x) * k;
                    const y = (b.y + (j + 0.5) * ch - box.y) * k;
                    // На этапе мочалки клетка сначала показывает муть, а тёрки
                    // проступают поверх неё яркой пеной — тем и видно разницу.
                    if (filmed)
                        BATH_ART.washCell(ctx, 'soap', x, y, r, 1,
                                          idx * 7 + 3, part, inside);
                    if (cloth && rubs)
                        BATH_ART.washCell(ctx, 'cloth', x, y, r, rubs / need,
                                          idx * 13 + 91, part, inside);
                }
            }
        };

        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, B.w * S, B.h * S);
        paint('base');
        if (this.mask) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(this.mask, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }
        paint('foam');
    },

    wipeLather() {
        const n = this.el('bt-wash');
        // Переход снимается: его ставит конец забега «только помыть», и без
        // сброса следующий забег начинался бы с того, что пена медленно
        // проявляется из ниоткуда.
        if (n) { n.style.transition = ''; n.style.opacity = '1'; }
        if (this.washCtx) this.washCtx.clearRect(0, 0, n.width, n.height);
        this.filmCells = null;
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
            if (Math.hypot(p.x - A[kind].x, p.y - A[kind].y) < 70) this.takeTool(kind, e);
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

        const p = this.toScene(e);
        this.armHint();
        const C = this.cfg(), kind = this.drag.kind;
        const radius = this.stageRadius();

        // Мазок засчитывается не на каждое событие указателя, а раз в треть
        // радиуса пути: событий за забег приходят сотни, а клетка от них
        // всё равно меняется один раз.
        const last = this.drag.mark;
        if (last && Math.hypot(p.x - last.x, p.y - last.y) <= radius * 0.34) return;
        this.drag.mark = p;

        const share = this.paint(p.x, p.y, radius, this.stageNeed());
        if (this.dirty) { this.renderLather(); this.dirty = false; }
        // Пена копится НЕ ТОЛЬКО на черве: над будущим хвостом растёт горка.
        // Растёт она ровно по той же доле вытертого — игрок видит, что она
        // связана с его работой, а не появилась сама.
        if (kind === 'cloth')
            this.pileShow(share / Math.max(0.01, C.coverGoal || 0.92));
        if (share >= (C.coverGoal || 0.92)) this.finishStage(kind);
    },

    onUp() {
        if (!this.drag) return;
        this.bendHand = null;
        if (this.drag.kind !== 'tail' && this.drag.kind !== 'rub') {
            this.fgEl.innerHTML = '';
            this.showTools(true);
        }
        this.drag = null;
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
            this.ready('soap');
            this.armHint();
        };
        this.fillRaf = requestAnimationFrame(step);
    },

    takeTool(kind, e) {
        this.drag = { kind };
        this.showTools(false, kind);
        this.ready(null);
        this.fgEl.innerHTML =
            `<g id="bt-held">${BATH_ART.held(kind, this.cam ? this.cam.s : 1)}</g>`;
        this.moveTool(this.toStage(e));
    },

    // Предмет в руке живёт в координатах ХОЛСТА: его держат перед собой, и
    // камере он не подчиняется.
    moveTool(p) {
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
        this.onUp();
        this.clearHint();
        if (kind === 'soap') {
            // Горка пены над будущим хвостом собирается ЗАРАНЕЕ, пока червя
            // трут мочалкой. К моменту, когда хвост всплывает, она уже
            // непроницаема, и его появления не видно.
            if (this.paidRun) this.buildPile();
            // Мочалка снимает мыло и оставляет пену: муть гасится, чтобы
            // второй этап был виден.
            // Что намылено — запоминается: на этапе мочалки это фон, по
            // которому видно, где пена уже проступила, а где ещё нет.
            this.filmCells = this.cells.slice();
            this.phase = 'cloth';
            this.resetCover();
            this.renderLather();
            this.ready('cloth');
            this.armHint();
            return;
        }
        if (this.paidRun) this.raiseTail();
        else this.finishWash();
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
            wash.style.transition = 'opacity 1.2s ease';
            wash.style.opacity = '0';
        }
        this.setCamera('overview', 900);
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'wash', outcome: 'win', meta: { wash: true }
        });
        this.syncShopButton();
    },

    // ---------- ПОДСКАЗКА: ГДЕ НЕ ДОМЫЛИ ----------
    // Порог 92% без подсказки превращается в поиск пикселя: игрок водит
    // пальцем и не понимает, почему этап не кончается (план, §1). Кольцо
    // показывается на самой недомытой клетке — без слов и без стрелок.
    armHint() {
        this.clearHint();
        if (this.phase !== 'soap' && this.phase !== 'cloth') return;
        this.hintTimer = setTimeout(() => this.showHint(), this.cfg().hintMs || 2200);
    },

    clearHint() {
        clearTimeout(this.hintTimer);
        this.hintTimer = 0;
        const n = this.el('bt-spot');
        if (n) n.innerHTML = '';
    },

    showHint() {
        const b = this.coverBox(), G = this.grid(), need = this.stageNeed();
        let worst = -1, worstVal = need;
        for (let k = 0; k < this.cells.length; k++) {
            if (this.cellOn && !this.cellOn[k]) continue;   // мимо тела мылить нечего
            if (this.cells[k] < worstVal) { worstVal = this.cells[k]; worst = k; }
        }
        if (worst < 0) return;
        const i = worst % G.nx, j = (worst / G.nx) | 0;
        const x = b.x + (i + 0.5) * b.w / G.nx;
        const y = b.y + (j + 0.5) * b.h / G.ny;
        this.el('bt-spot').innerHTML = BATH_ART.spot(x, y, 26);
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
        this.el('bt-wash').style.opacity = '0';
        const model = window.WormModelAPI ? this.bathModel() : null;
        this.tailModel = model;
        this.bend = 0;
        this.bendHand = null;

        this.el('bt-tail').innerHTML =
            `<g id="bt-tail-pivot">${BATH_ART.tail(model)}</g>`;
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
    drawRubGauge() {
        const A = BATH_ART.slots(), T = BATH_ART.TAIL;
        const h = T.len * 1.05;
        // Столбик стоит с ВНЕШНЕЙ стороны хвоста — той, куда хвост НЕ гнётся:
        // иначе он оказывается между хвостом и мордой, ровно в том коридоре,
        // где идёт вся работа.
        this.el('bt-gauge').innerHTML = BATH_ART.rubGauge(
            A.tail.x + (T.side || 1) * T.base * 0.95 * -1,
            A.tail.y - h - 6, h, this.charge);
    },

    rubMove(p) {
        const C = this.cfg(), a = this.rubAt(p);
        const reach = BATH_ART.TAIL.base * this.tailGrow() * 1.3;
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


    drawTail(force) {
        const A = BATH_ART.slots(), g = this.el('bt-tail-pivot');
        if (!g) return;
        // Пересобирать путь хвоста имеет смысл, только если он изменился.
        // Кадров, где палец стоит, а хвост уже выпрямился, за забег набегает
        // половина, и каждый из них стоил двух сотен toFixed и двух записей
        // в дерево.
        const key = `${this.bend.toFixed(4)}|${this.charge.toFixed(4)}`;
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
        const edge = this.el('bt-tail-edge');
        if (edge) edge.setAttribute('d', d.body);
        this.el('bt-tail-shine').setAttribute('d', d.shine);
        // Звенья, головка, тень под венчиком и блик — из того же контура.
        const P = BATH_ART.tailPieces(d.curve, this.tailGrow()), f1 = (v) => v.toFixed(1);
        P.segs.forEach((sd, i) => { const e = this.el(`bt-tail-seg-${i}`); if (e) e.setAttribute('d', sd); });
        const gl = this.el('bt-tail-glans');
        if (gl) gl.setAttribute('d', P.glans);
        for (const [id, q] of [['bt-tail-neck', P.neck], ['bt-tail-wet', P.wet]]) {
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
        this.bendAim = this.solveBend(this.mouthPoint());
        this.drawGauge();

        this.aimLast = performance.now();
        const tick = (now) => {
            // Шаг по времени, а не по кадру: на медленном телефоне упругость
            // иначе становится другой физикой.
            const dt = Math.min(0.05, (now - this.aimLast) / 1000);
            this.aimLast = now;
            if (!this.mouthAt && now >= this.mouthDue) {
                this.mouthAt = this.mouthPoint();
                this.bendAim = this.solveBend(this.mouthAt);
            }
            // На доигрывании хвостом распоряжается relaxTail: он опадает, а
            // не слушается упругости. Двое пишущих в bend дёргали бы его.
            if (this.phase === 'aim') {
                this.stepBend(dt);
                // Хвост стоит — дорисовать начисто, дальше ключ всё равно
                // совпадёт и записи не будет.
                this.drawTail((this.bendStep || 0) < 0.0005);
            }
            this.stepDrops(dt);
            this.aimRaf = requestAnimationFrame(tick);
        };
        this.aimRaf = requestAnimationFrame(tick);
        this.shotTimer = setTimeout(() => this.shoot(), this.shotMs());
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

        if (--this.shotsLeft > 0) {
            this.shotTimer = setTimeout(() => this.shoot(), this.shotMs());
        } else {
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
