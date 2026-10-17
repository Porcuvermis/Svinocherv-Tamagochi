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
};

// Запуск — в конце lust-finale.js, последнего продолжения: init() зовёт методы
// из всех четырёх файлов, и до их подключения стартовать нельзя.
