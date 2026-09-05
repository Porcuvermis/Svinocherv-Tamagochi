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

    // Между толчками. Десять толчков — это четверть минуты: реже станет
    // ожиданием, чаще — не успеть довести хвост против его сопротивления.
    SHOT_MS: 1500,

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
    BEND_GAIN: 0.55,   // сколько наклона даёт радиан хода пальца по дуге
    // Выпрямление подобрано под ход пальца: чтобы держать прицел, хватает
    // подталкивания примерно дважды в секунду. Быстрее — рука не успевает,
    // медленнее — можно поставить и забыть, а это уже было и не игралось.
    BEND_RELAX: 0.20,  // как быстро выпрямляется у корня
    BEND_HARD: 1.3,    // насколько быстрее — на пределе
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
        const cells = this.phase === 'cloth' ? (C.clothCells || 0.75)
                                             : (C.soapCells || 1.15);
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
        this.camEl = document.getElementById('bt-cam');
        this.camBackEl = document.getElementById('bt-cam-back');
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
        this.camEl.innerHTML = BATH_ART.sceneFront();

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
        this.resetCover();
        this.wipeLather();
        this.el('bt-bubbles').innerHTML = '';
        this.el('bt-rain-back').innerHTML = BATH_ART.rain(false);
        this.el('bt-rain-front').innerHTML = BATH_ART.rain(true);
        for (const id of ['bt-tail', 'bt-bubbles', 'bt-shots', 'bt-gauge', 'bt-spot'])
            this.el(id).innerHTML = '';
        this.setOpacity('bt-tail', 0);
        this.bubbles = null;
        this.charge = 0;
        this.hits = 0;
        this.shotsLeft = 0;
        this.setOpacity('bt-rain-back', 0);
        this.setOpacity('bt-rain-front', 0);
        this.fgEl.innerHTML = '';
        this.showTools(true);
        this.ready('shower');

        // Камера ПЕРЕД монтажом: она выставляет холст червя, а рендерер
        // меряет его размер один раз, при монтаже.
        this.setCamera('overview');
        this.mountWorm();
    },

    close() {
        this.screenElement.classList.remove('active');
        this.stopClocks();
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
    // Наезд МГНОВЕННЫЙ. Плавный переезд ехал по-разному у трёх слоёв: группы
    // сцены анимировал css, а слой червя и холст мытья ставились по числам
    // камеры сразу — и всё время переезда комната, персонаж и пена шли
    // вразнобой. Смена ракурса это смена кадра: все объекты обязаны
    // оказаться на новом месте одновременно.
    setCamera(name) {
        const f = BATH_ART.FOCUS[name] || BATH_ART.FOCUS.overview;
        const s = Math.min(390 / f.w, 844 / f.h);
        const tx = 195 - s * (f.x + f.w / 2);
        const ty = 422 - s * (f.y + f.h / 2);
        // Числа камеры запоминаются: по ним, а не по матрице из DOM,
        // считается место слоя червя и холста мытья.
        this.cam = { s, tx, ty };
        const t = `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`;
        this.camEl.setAttribute('transform', t);
        this.camBackEl.setAttribute('transform', t);
        this.layoutWorm();
    },

    // ---------- ПЕРЕВОД КООРДИНАТ ----------
    // Через getScreenCTM, а не делением на ширину: ванная вписана в рамку
    // окна с ОБРЕЗКОЙ (slice), поэтому единицы svg и пиксели зависят от
    // формы окна, а весь холст ещё и отмасштабирован (docs/traps.md).
    fromScreen(x, y, node) {
        const m = node.getScreenCTM();
        if (!m) return { x: 0, y: 0 };
        const pt = this.svgEl.createSVGPoint();
        pt.x = x; pt.y = y;
        const p = pt.matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    },

    // Экран → координаты СЦЕНЫ (всё, что внутри камеры).
    toScene(e) { return this.fromScreen(e.clientX, e.clientY, this.camEl); },
    // Экран → координаты ХОЛСТА (передний план: предмет в руке).
    toStage(e) { return this.fromScreen(e.clientX, e.clientY, this.svgEl); },

    // Точка сцены → пиксели слоя червя. Камера подставляется ЧИСЛАМИ (см.
    // setCamera), а холст → экран берётся у самого svg: он не анимируется, и
    // его матрица всегда честная.
    sceneToHost(pt) {
        const m = this.svgEl && this.svgEl.getScreenCTM();
        const host = this.wormHost, c = this.cam;
        if (!m || !c || !host || !host.offsetParent) return { x: 0, y: 0 };
        const r = host.offsetParent.getBoundingClientRect();
        const k = (r.width / (host.offsetParent.clientWidth || r.width)) || 1;
        const p = this.svgEl.createSVGPoint();
        p.x = c.tx + c.s * pt.x;
        p.y = c.ty + c.s * pt.y;
        const s = p.matrixTransform(m);
        return { x: (s.x - r.left) / k, y: (s.y - r.top) / k };
    },

    // ---------- ЧЕРВЬ ----------
    mountWorm() {
        if (!window.WormModelAPI || !window.WormRenderer || !this.wormHost) return;
        if (!this.wormHandle) {
            const model = window.WormModelAPI.loadWormModel();
            this.wormHandle = window.WormRenderer.mount(this.wormHost, model, {
                context: 'lust',
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
            this.wormHandle.update(window.WormModelAPI.loadWormModel());
        }
        this.layoutWorm();
        // Габарит червя мерится ПОСЛЕ первого кадра рендерера. На монтаже
        // цепочка ещё не расставлена — все сегменты стоят в нуле, и getBBox
        // отдаёт одну голову. Раскладка по такому габариту выходила вчетверо
        // крупнее нужной, а мылить давали только морду.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.hideSunk();
            this._bbox = null;
            this._cover = null;
            this.layoutWorm();
            this.buildMask();
        }));
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
    // Прятать надо в САМОМ РЕНДЕРЕРЕ, а не обрезкой слоя: обрезка снова
    // даёт прямую линию поперёк тела, а скрытая часть выпадает и из
    // габарита, и из маски — то есть и из раскладки, и из учёта мытья.
    // Мини-игра монтирует собственного червя в свой холст, поэтому на
    // комнату это не влияет.
    hideSunk() {
        const root = this.wormHandle && this.wormHandle.svgRoot;
        if (!root) return;
        for (const n of root.querySelectorAll('[data-part]')) {
            const p = n.getAttribute('data-part') || '';
            if (p === 'tail' || p.indexOf('growing-') === 0)
                n.style.display = 'none';
        }
    },

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
        this.wormHost.style.transform = t;
        // Обрезки НЕТ. Прямая линия среза по уровню воды читалась ровно тем,
        // чем была, — обрезанным персонажем. Нижнюю половину прячет сама
        // чаша: она рисуется в переднем холсте, поверх слоя червя.
        // Холст мытья — в тех же единицах, значит и преобразование то же.
        const w = this.el('bt-wash');
        if (w) w.style.transform = t;
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
        // (hideSunk), и в маске их быть не должно тем более.
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
            // Коробка покрытия выводится ИЗ МАСКИ, значит её кэш обязан
            // сброситься здесь: до этой строки маски не было и коробка
            // считалась по запасному варианту.
            this._cover = null;
            this.buildCells();
        };
        img.onerror = () => { this.mask = null; this.buildCells(); };
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

        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, B.w * S, B.h * S);
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
                if (filmed) BATH_ART.washCell(ctx, 'soap', x, y, r, 1, idx * 7 + 3);
                if (cloth && rubs)
                    BATH_ART.washCell(ctx, 'cloth', x, y, r, rubs / need,
                                      idx * 13 + 91);
            }
        }
        if (this.mask) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(this.mask, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }
    },

    wipeLather() {
        const n = this.el('bt-wash');
        if (n) n.style.opacity = '1';
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
        this.ready(null);
        this.setOpacity('bt-rain-back', 1);
        this.setOpacity('bt-rain-front', 1);
        // Наезд ОДНОВРЕМЕННО с водой: смотреть на лейку больше незачем, вся
        // работа теперь между червём и полкой.
        this.setCamera('body');
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
        this.raiseTail();
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
        this.setCamera('tail');
        // Червя ополаскивают: муть и пена сходят. Оставить их — значит
        // держать белую вуаль поверх морды весь финал, а именно морда в нём
        // и работает (блаженство, открытый рот).
        this.el('bt-wash').style.opacity = '0';
        const model = window.WormModelAPI ? window.WormModelAPI.loadWormModel() : null;
        this.tailModel = model;
        this.bend = 0;
        this.bendHand = null;

        this.el('bt-tail').innerHTML =
            `<g id="bt-tail-pivot">${BATH_ART.tail(model)}</g>`;
        this.drawTail();
        this.setOpacity('bt-tail', 1);

        // Всплытие: хвост выезжает снизу, из-под воды. Обрезка не нужна —
        // группа лежит ПОД слоем воды, и та сама прячет всё, что не поднялось.
        const g = this.el('bt-tail');
        const t0 = performance.now(), DUR = 1100;
        const step = (t) => {
            const k = Math.min(1, (t - t0) / DUR);
            const e = 1 - Math.pow(1 - k, 3);
            g.setAttribute('transform',
                `translate(0 ${((1 - e) * BATH_ART.TAIL.len * 0.95).toFixed(1)})`);
            if (k < 1) { this.fillRaf = requestAnimationFrame(step); return; }
            this.fillRaf = 0;
            this.spawnBubbles();
        };
        this.fillRaf = requestAnimationFrame(step);
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
        this.el('bt-bubbles').innerHTML = '';
        this.rubLast = performance.now();
        const tick = (now) => {
            const dt = Math.min(0.05, (now - this.rubLast) / 1000);
            this.rubLast = now;
            if (this.phase !== 'rub') { this.rubRaf = 0; return; }
            const C = this.cfg();
            if (!this.drag || this.drag.kind !== 'rub')
                this.charge = Math.max(0, this.charge - (C.rubRelax || 0.3) * dt);
            this.drawTail();
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

    rubMove(p) {
        const C = this.cfg(), a = this.rubAt(p);
        const reach = BATH_ART.TAIL.base * this.tailGrow() * 1.3;
        if (a.dist > reach) { this.drag.t = null; return; }
        if (this.drag.t != null)
            this.charge = Math.min(1, this.charge
                + Math.abs(a.t - this.drag.t) * (C.rubGain || 1.3));
        this.drag.t = a.t;
    },

    // Изгиб, при котором капля НОМИНАЛЬНОЙ силы проходит через рот. Ищется
    // перебором и ТОЙ ЖЕ физикой, которой капля потом летит: прицел обязан
    // считаться по тому же, по чему считается попадание.
    solveBend(target) {
        const C = this.cfg();
        const v = C.speedMin + 0.75 * (C.speedMax - C.speedMin);
        let best = 0, near = Infinity;
        for (let i = 0; i <= 48; i++) {
            const b = -0.25 + (this.BEND_MAX + 0.25) * i / 48;
            const s = this.tipState(b);
            const r = LustShot.fly(C, s,
                { vx: Math.cos(s.dir) * v, vy: Math.sin(s.dir) * v },
                target, C.mouthR);
            // Строго лучше, и с запасом. У баллистики на одну дальность
            // ДВА решения — навесное и настильное, — и оба точные. Простое
            // «меньше» выбирало то одно, то другое от шага перебора: прицел
            // прыгал с 0.4 на 1.2 при сдвиге рта на десяток пикселей.
            // Перебор идёт от малого изгиба, поэтому запас оставляет
            // НАВЕСНОЕ: дуга видна целиком, и по ней читается перелёт.
            if (r.near < near - 0.5) { near = r.near; best = b; }
        }
        return best;
    },

    drawTail() {
        const A = BATH_ART.slots(), g = this.el('bt-tail-pivot');
        if (!g) return;
        // Ни одного поворота: группа только переносится, а гнётся сама фигура.
        g.setAttribute('transform', `translate(${A.tail.x} ${A.tail.y})`);
        const d = BATH_ART.tailD(this.bend, this.tailGrow());
        this.el('bt-tail-body').setAttribute('d', d.body);
        this.el('bt-tail-shine').setAttribute('d', d.shine);
    },

    // ---------- ПУЗЫРИ ----------
    // Пена налипла на хвост ГУСТО и разным калибром: одинаковые кружки в ряд
    // складываются в бусы, а не в пену. Доля возводится в степень, поэтому
    // мелких много, крупных единицы.
    //
    // Лопаются ПО ОДНОМУ за касание. Пачкой было быстрее, но щелчок по
    // пузырю — сам по себе удовольствие, ради которого этап и существует;
    // пачка съедала его ради экономии десятка тапов.
    spawnBubbles() {
        this.phase = 'pop';
        const C = this.cfg();
        const lo = C.bubblesMin || 8, hi = C.bubblesMax || 12;
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        this.bubbles = [];
        // Сидят на ОСИ хвоста, а не вокруг его основания: пена налипла на
        // прут, и при изгибе она должна лежать вдоль него.
        const A = BATH_ART.slots();
        const spine = BATH_ART.tailSpine(this.bend, this.tailGrow());
        for (let i = 0; i < n; i++) {
            // Вдоль оси идут не по одному, а парами со сдвигом: иначе густая
            // пена вытягивается в одну цепочку.
            const t = 0.1 + ((i >> 1) + 0.5 + (i & 1) * 0.5) / Math.ceil(n / 2) * 0.86;
            const p = spine[Math.min(spine.length - 1,
                Math.round(t * (spine.length - 1)))];
            const side = (Math.random() - 0.5) * 1.7
                       * BATH_ART.tailHalf(t, this.tailGrow());
            this.bubbles.push({
                x: A.tail.x + p.x + Math.cos(p.a) * side,
                y: A.tail.y + p.y + Math.sin(p.a) * side,
                r: 5 + Math.pow(Math.random(), 1.9) * 15,
                alive: true, seed: i * 37 + 5
            });
        }
        // Крупные рисуются ПЕРВЫМИ, мелкие поверх: иначе мелкий тонет под
        // соседним крупным и по нему нечем попасть.
        this.bubbles.sort((a, b) => b.r - a.r);
        this.drawBubbles();
    },

    drawBubbles() {
        this.el('bt-bubbles').innerHTML = this.bubbles
            .filter(b => b.alive)
            .map(b => BATH_ART.bubble(b.x, b.y, b.r, b.seed)).join('');
    },

    pop(p) {
        // ОДИН за касание, и ближайший: под пальцем часто оказываются два, и
        // лопаться должен тот, по которому целились.
        let hit = null, best = Infinity;
        for (const b of this.bubbles) {
            if (!b.alive) continue;
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d > b.r + 14 || d >= best) continue;
            best = d; hit = b;
        }
        if (!hit) return;
        hit.alive = false;
        this.drawBubbles();
        if (!this.bubbles.some(b => b.alive)) this.startRub();
    },

    // ---------- ФИНАЛ: ТОЛЧКИ И ЛОВЛЯ ----------
    startFinale() {
        this.phase = 'aim';
        this.setCamera('finish');
        this.hits = 0;
        this.drops = [];
        this.splats = [];
        this.dropAcc = 0;
        this.shotsLeft = this.cfg().shots || 10;

        // Блаженство: рот открыт, глаза зажмурены. Сказано позой, а не
        // подписью (инвариант 9).
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ mouthOpenness: 0.75, eyelidLevel: 0.9 });

        // Прицел пересчитывается: камера переехала, а рот берётся у
        // нарисованного червя.
        this.bendAim = this.solveBend(this.mouthPoint());
        this.drawGauge();

        this.aimLast = performance.now();
        const tick = (now) => {
            // Шаг по времени, а не по кадру: на медленном телефоне упругость
            // иначе становится другой физикой.
            const dt = Math.min(0.05, (now - this.aimLast) / 1000);
            this.aimLast = now;
            this.stepBend(dt);
            this.drawTail();
            this.stepDrops(dt);
            this.aimRaf = requestAnimationFrame(tick);
        };
        this.aimRaf = requestAnimationFrame(tick);
        this.shotTimer = setTimeout(() => this.shoot(), this.SHOT_MS);
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
        const u = Math.max(0, this.bend) / this.BEND_MAX;
        this.bend -= this.bend * this.BEND_RELAX * (1 + this.BEND_HARD * u * u) * dt;
        if (this.bend < 0) this.bend = 0;
        if (this.bend > this.BEND_MAX) this.bend = this.BEND_MAX;
    },

    // Угол пальца вокруг корня хвоста. Ноль — прямо над корнем, вправо
    // положительный.
    handAngle(p) {
        const A = BATH_ART.slots();
        const dx = (BATH_ART.TAIL.side || 1) * (p.x - A.tail.x), dy = A.tail.y - p.y;
        if (Math.hypot(dx, dy) < this.BEND_MIN_R) return null;
        return Math.atan2(dx, dy);
    },

    // Палец ТОЛКАЕТ хвост: наклон прибавляется от пройденного по дуге пути, а
    // не от того, где палец остановился. Ход назад ничего не убавляет — он
    // просто заново заводит руку, и получается поглаживание: провёл, отпустил,
    // провёл снова. Ровно этим движением хвост и удерживают на нужном угле.
    aimAt(p) {
        const a = this.handAngle(p);
        if (a == null) return;
        if (this.bendHand == null) { this.bendHand = a; return; }
        const d = a - this.bendHand;
        this.bendHand = a;
        if (d > 0) this.bend = Math.min(this.BEND_MAX,
                                        this.bend + d * this.BEND_GAIN);
    },

    // Один толчок. Из кончика вылетает КАПЛЯ-СНАРЯД: дальше она живёт по
    // баллистике, и попадание — это её столкновение с открытым ртом. Раньше
    // исход решала формула, а полёт был отдельной картинкой про то же самое:
    // игрок видел струю в рот и не попадал.
    shoot() {
        if (this.phase !== 'aim') return;
        const C = this.cfg();
        const t = (C.tiers || [{}])[this.tier()] || {};
        const s = this.tipState();
        const v = LustShot.launch(C, t, s.dir);
        this.drops.push({ x: s.x, y: s.y, vx: v.vx, vy: v.vy, t: 0,
                          r: 11, main: true });
        // Мелкие брызги рядом — только вид. На счёт они не влияют: иначе
        // десять толчков превращаются в полсотни попыток.
        for (let i = 0; i < (C.spray || 0); i++) {
            const a = v.angle + (Math.random() - 0.5) * 0.22;
            const k = 0.82 + Math.random() * 0.3;
            const sp = Math.hypot(v.vx, v.vy) * k;
            this.drops.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp,
                              vy: Math.sin(a) * sp, t: 0,
                              r: 4 + Math.random() * 3, main: false });
        }

        if (--this.shotsLeft > 0) {
            this.shotTimer = setTimeout(() => this.shoot(), this.SHOT_MS);
        } else {
            // Последней капле дают долететь, и только потом считают итог.
            this.shotTimer = setTimeout(() => this.done(), this.SHOT_MS + 900);
        }
    },

    // Шаг всех капель. Идёт ФИКСИРОВАННЫМ шагом из конфига, а не длиной
    // кадра: тем же шагом считает баланс tools/sim-lust.js, и расходиться им
    // нельзя. Лишнее время копится и доедается на следующем кадре.
    stepDrops(dt) {
        const C = this.cfg(), m = this.mouthPoint();
        this.dropAcc = (this.dropAcc || 0) + dt;
        let guard = 12;
        while (this.dropAcc >= C.dt && guard-- > 0) {
            this.dropAcc -= C.dt;
            for (let i = this.drops.length - 1; i >= 0; i--) {
                const d = this.drops[i];
                LustShot.step(d, C);
                if (d.main && LustShot.inMouth(d, m, C.mouthR)) {
                    this.drops.splice(i, 1);
                    this.hits++;
                    this.drawGauge();
                    this.splats.push({ x: m.x, y: m.y, r: 16, t: 0, gulp: true });
                    continue;
                }
                if (LustShot.spent(d, C)) {
                    this.drops.splice(i, 1);
                    // Не долетела — прилипает там, где кончилась, и стекает.
                    this.splats.push({ x: d.x, y: Math.min(d.y, C.floorY),
                                       r: d.r * 1.3, t: 0 });
                }
            }
        }
        // Потёки живут своим временем и тают.
        for (let i = this.splats.length - 1; i >= 0; i--) {
            const sp = this.splats[i];
            sp.t += dt;
            if (!sp.gulp) sp.y += 26 * dt;
            if (sp.t > (sp.gulp ? 0.45 : 2.6)) this.splats.splice(i, 1);
        }
        if (this.splats.length > 14) this.splats.splice(0, this.splats.length - 14);
        this.el('bt-shots').innerHTML = BATH_ART.drops(this.drops, this.splats);
    },

    // Купленная ступень прокачки. Магазина ещё нет — до него ступень всегда
    // стартовая, и это ровно то, подо что считался баланс.
    tier() {
        const lvl = (typeof GameState !== 'undefined' && GameState.upgradeLevel)
            ? GameState.upgradeLevel('lust_aim') : 0;
        const n = ((this.cfg().tiers || []).length || 1) - 1;
        return Math.max(0, Math.min(n, lvl));
    },

    drawGauge() {
        const C = this.cfg(), m = this.mouthPoint();
        const box = this.wormBoxScene();
        const filled = Math.min(C.sections || 3,
            Math.floor(this.hits / (C.perSection || 2)));
        // Над головой, считая от ВЕРХА нарисованного червя: доля от холста
        // персонажа уводила шкалу за кадр, стоило поменять его посадку.
        const top = this.coverBox().y;
        this.el('bt-gauge').innerHTML =
            BATH_ART.gauge(m.x, top - 26, C.sections || 3, filled);
    },

    stopClocks() {
        if (this.fillRaf) { cancelAnimationFrame(this.fillRaf); this.fillRaf = 0; }
        if (this.aimRaf) { cancelAnimationFrame(this.aimRaf); this.aimRaf = 0; }
        clearTimeout(this.shotTimer); this.shotTimer = 0;
        this.clearHint();
    },

    done() {
        this.phase = 'done';
        this.stopClocks();
        const C = this.cfg();
        const sections = Math.min(C.sections || 3,
            Math.floor(this.hits / (C.perSection || 2)));
        // Мини-игра НИЧЕГО не начисляет сама (инвариант 2): она сообщает,
        // сколько поймано, а что за это дать — решает конфиг наград.
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'bath', outcome: 'win',
            meta: { hits: this.hits, sections, shots: C.shots || 10 }
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LustMinigame.init());
} else {
    LustMinigame.init();
}
