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
    phase: 'idle',      // idle → filling → soap → cloth → tail → pop → aim → done
    drag: null,
    fillRaf: 0,
    level: 0,           // 0..1, насколько налито

    // Покрытие тела считается по КЛЕТКАМ, а не по пикселям: требование
    // «закрась всё» упирается в пару незакрашенных точек, и игрок не
    // понимает, почему этап не кончается (план, §1).
    GRID: { nx: 14, ny: 9 },
    cells: null,
    covered: 0,
    _cover: null,      // габарит червя в сцене, посчитанный по нарисованному

    // ---------- ФИНАЛ ----------
    // Угол хвоста держится ЗДЕСЬ, а не в разметке: по нему считается и
    // картинка, и попадание, и это обязано быть одно и то же число.
    tailAngle: 0,      // куда смотрит хвост сейчас, радианы
    tailRest: 0,       // куда его тянет обратно
    tailAim: 0,        // куда надо: от основания хвоста ко рту
    bubbles: null,
    shotsLeft: 0,
    hits: 0,
    aimRaf: 0,
    shotTimer: 0,
    hintTimer: 0,

    // Между толчками. Десять толчков — это четверть минуты: реже станет
    // ожиданием, чаще — не успеть довести хвост против его сопротивления.
    SHOT_MS: 1500,
    // На сколько хвост отпускает обратно за кадр. Не жёсткая пружина:
    // мгновенный возврат читается рывком, а не сопротивлением.
    TAIL_PULL: 0.055,
    // Насколько далеко хвост можно увести от покоя.
    TAIL_RANGE: 1.5,   // радианы
    // На сколько покой отстоит от прицела. Знак МИНУС: хвост отдыхает
    // задранным вверх, а тянуть его надо ВНИЗ ко рту. С плюсом он ложился
    // плашмя на воду и читался плавником, а не хвостом.
    REST_OFF: 0.62,

    cfg() {
        return (typeof ECONOMY !== 'undefined' && ECONOMY.minigames
                && ECONOMY.minigames.lust) || {};
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
        this.level = 0;
        this.drag = null;
        this.resetCover();
        this.el('bt-film').innerHTML = '';
        this.el('bt-film').style.opacity = '1';
        this.el('bt-foam').innerHTML = '';
        this.el('bt-foam').style.opacity = '1';
        this.el('bt-bubbles').innerHTML = '';
        this.el('bt-jet').innerHTML = BATH_ART.jet();
        for (const id of ['bt-tail', 'bt-bubbles', 'bt-shots', 'bt-gauge', 'bt-spot'])
            this.el(id).innerHTML = '';
        this.setOpacity('bt-tail', 0);
        this.bubbles = null;
        this.hits = 0;
        this.shotsLeft = 0;
        this.setOpacity('bt-jet', 0);
        this.setOpacity('bt-water', 0);
        this.fgEl.innerHTML = '';
        this.showTools(true);
        this.ready('faucet');

        // Камера ПЕРЕД монтажом: она выставляет холст червя, а рендерер
        // меряет его размер один раз, при монтаже.
        this.setCamera('overview', true);
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
        for (const [key, id] of [['faucet', 'bt-faucet'],
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
    setCamera(name, instant) {
        const f = BATH_ART.FOCUS[name] || BATH_ART.FOCUS.overview;
        const s = Math.min(390 / f.w, 844 / f.h);
        const tx = 195 - s * (f.x + f.w / 2);
        const ty = 422 - s * (f.y + f.h / 2);
        // Числа камеры запоминаются. По ним, а не по матрице из DOM, считается
        // место слоя червя: transform на группе едет CSS-переходом, и матрица
        // в момент вызова показывает ЕЩЁ СТАРУЮ камеру. Считанный по ней слой
        // уезжал на разницу между кадрами — червь оказывался ниже воды, в
        // которой должен лежать.
        this.cam = { s, tx, ty };
        const t = `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`;
        for (const g of [this.camEl, this.camBackEl]) {
            if (instant) g.style.transition = 'none';
            g.setAttribute('transform', t);
            if (instant) { void g.getBoundingClientRect(); g.style.transition = ''; }
        }
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
                pose: 'lying',
                wander: false,
                blink: true,
                idleWave: true
            });
        } else {
            this.wormHandle.update(window.WormModelAPI.loadWormModel());
        }
        this._cover = null;
        this.layoutWorm();
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
    WORM_BASE: { w: 300, h: 150 },

    // Куда этот холст ложится в сцене. Ширина выведена из габарита ВОДЫ:
    // червь лежит в чаше и шире её быть не может.
    wormBoxScene() {
        const A = BATH_ART.slots(), b = BATH_ART.box('water') || { w: 571 };
        const w = b.w * 0.82, h = w * this.WORM_BASE.h / this.WORM_BASE.w;
        return { x: A.worm.x - w / 2, y: A.worm.y - h * 0.55, w, h };
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
        this.wormHost.style.transform =
            `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) scale(${k.toFixed(4)})`;
    },

    // ---------- ПОКРЫТИЕ ----------
    // Клетки лежат на самом ЧЕРВЕ, а не на воде под ним. Первый вариант
    // считал покрытие по габариту воды: мазки по пустой воде рядом с телом
    // засчитывались, и пена оставалась там же — мыли ванну, а не червя.
    //
    // Габарит берётся у НАРИСОВАННОГО персонажа, а не подбирается числом:
    // единицы его холста переводятся в сцену тем же множителем, что и в
    // layoutWorm.
    coverBox() {
        if (this._cover) return this._cover;
        const box = this.wormBoxScene(), B = this.WORM_BASE;
        let b = null;
        try {
            const root = this.wormHandle && this.wormHandle.svgRoot;
            const r = root && root.getBBox();
            const k = box.w / B.w;
            // Габарит поджимается: у нарисованного персонажа сверху остаётся
            // пустое поле (уши задают верх коробки, а тело лежит ниже), и без
            // поджатия пена ложится над червём, на воду.
            const IN = 0.07;
            if (r && r.width > 1) b = { x: box.x + (r.x + r.width * IN) * k,
                                        y: box.y + (r.y + r.height * IN * 2) * k,
                                        w: r.width * (1 - IN * 2) * k,
                                        h: r.height * (1 - IN * 3) * k };
        } catch (e) { /* червя ещё нет — сойдёт габарит воды */ }
        this._cover = b || BATH_ART.box('water') || { x: 100, y: 600, w: 500, h: 150 };
        return this._cover;
    },

    resetCover() {
        this.cells = new Array(this.GRID.nx * this.GRID.ny).fill(0);
        this.covered = 0;
    },

    // Пометить клетки под мазком. Возвращает долю покрытого.
    paint(x, y, radius, need) {
        const b = this.coverBox(), G = this.GRID;
        const cw = b.w / G.nx, ch = b.h / G.ny;
        const i0 = Math.max(0, Math.floor((x - radius - b.x) / cw));
        const i1 = Math.min(G.nx - 1, Math.floor((x + radius - b.x) / cw));
        const j0 = Math.max(0, Math.floor((y - radius - b.y) / ch));
        const j1 = Math.min(G.ny - 1, Math.floor((y + radius - b.y) / ch));
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const cx = b.x + (i + 0.5) * cw, cy = b.y + (j + 0.5) * ch;
                if (Math.hypot(cx - x, cy - y) > radius) continue;
                const k = j * G.nx + i;
                if (this.cells[k] >= need) continue;
                this.cells[k]++;
                if (this.cells[k] >= need) this.covered++;
            }
        }
        return this.covered / (G.nx * G.ny);
    },

    // ---------- ВВОД ----------
    onDown(e) {
        if (this.win && this.win.isConfirmOpen && this.win.isConfirmOpen()) return;
        const p = this.toScene(e);
        const A = BATH_ART.slots();

        if (this.phase === 'idle') {
            // Кран включает воду — это и есть старт забега.
            if (Math.hypot(p.x - A.faucet.x, p.y - A.faucet.y) < 70) this.startWater();
            return;
        }
        if (this.phase === 'soap' || this.phase === 'cloth') {
            const kind = this.phase;
            if (Math.hypot(p.x - A[kind].x, p.y - A[kind].y) < 70) this.takeTool(kind, e);
            return;
        }
        if (this.phase === 'pop') { this.pop(p); return; }
        // В финале палец не берёт предмет, а ДЕРЖИТ хвост: пока он на экране,
        // хвост стоит там, куда его увели, и тянется обратно, как только
        // палец убрали.
        if (this.phase === 'aim') { this.drag = { kind: 'tail' }; this.aimAt(p); }
    },

    onMove(e) {
        if (!this.drag) return;
        e.preventDefault();
        if (this.drag.kind === 'tail') { this.aimAt(this.toScene(e)); return; }
        this.moveTool(this.toStage(e));

        const p = this.toScene(e);
        this.armHint();
        const C = this.cfg(), kind = this.drag.kind;
        const radius = kind === 'cloth' ? (C.clothRadius || 26) : (C.soapRadius || 46);
        const need = kind === 'cloth' ? (C.clothRubs || 3) : 1;
        const share = this.paint(p.x, p.y, radius, need);

        // Пятно ставится не на каждое событие указателя, а раз в треть
        // радиуса пути. Событий за забег приходят сотни, и без этого след —
        // это сотни узлов, наложенных друг на друга вплотную: узлы плодятся,
        // а картинка от них не меняется.
        const last = this.drag.mark;
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > radius * 0.34) {
            this.drag.mark = p;
            this.el(kind === 'cloth' ? 'bt-foam' : 'bt-film')
                .insertAdjacentHTML('beforeend',
                    BATH_ART.smudge(p.x, p.y, radius, kind));
        }

        if (share >= (C.coverGoal || 0.92)) this.finishStage(kind);
    },

    onUp() {
        if (!this.drag) return;
        if (this.drag.kind !== 'tail') {
            this.fgEl.innerHTML = '';
            this.showTools(true);
        }
        this.drag = null;
    },

    // ---------- ЭТАПЫ ----------
    startWater() {
        this.phase = 'filling';
        this.ready(null);
        this.setOpacity('bt-jet', 1);
        this.setOpacity('bt-water', 1);
        this.setCamera('body');
        const b = BATH_ART.box('water');
        const rect = this.el('bt-water-rect');
        const t0 = performance.now();
        const DUR = 2200;
        const step = (t) => {
            const k = Math.min(1, (t - t0) / DUR);
            this.level = k;
            // Обрезка растёт СНИЗУ ВВЕРХ: вода прибывает, а не выезжает
            // пластиной сверху.
            rect.setAttribute('x', String(b.x - 20));
            rect.setAttribute('y', String(b.y + b.h * (1 - k)));
            rect.setAttribute('width', String(b.w + 40));
            rect.setAttribute('height', String(b.h * k + 4));
            if (k < 1) { this.fillRaf = requestAnimationFrame(step); return; }
            this.fillRaf = 0;
            this.setOpacity('bt-jet', 0);
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
        this.fgEl.innerHTML = `<g id="bt-held">${BATH_ART.held(kind)}</g>`;
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
            this.phase = 'cloth';
            this.resetCover();
            this.el('bt-film').style.opacity = '0.35';
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
        const b = this.coverBox(), G = this.GRID;
        const need = this.phase === 'cloth' ? (this.cfg().clothRubs || 3) : 1;
        let worst = -1, worstVal = need;
        for (let k = 0; k < this.cells.length; k++)
            if (this.cells[k] < worstVal) { worstVal = this.cells[k]; worst = k; }
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
        this.el('bt-film').style.opacity = '0';
        this.el('bt-foam').style.opacity = '0';
        const A = BATH_ART.slots();
        const model = window.WormModelAPI ? window.WormModelAPI.loadWormModel() : null;

        // Покой — НЕ прицел: хвост тянет в сторону от рта, и держать его на
        // цели приходится пальцем. Иначе финал играется бездействием.
        this.tailAim = this.aimAngle();
        this.tailRest = this.tailAim - this.REST_OFF;
        this.tailAngle = this.tailRest;

        this.el('bt-tail').innerHTML =
            `<g id="bt-tail-pivot">${BATH_ART.tail(model)}</g>`;
        this.drawTail();
        this.setOpacity('bt-tail', 1);

        // Всплытие: обрезки нет, хвост поднимается снизу вверх собственным
        // сдвигом — так же, как прибывала вода.
        const g = this.el('bt-tail');
        const t0 = performance.now(), DUR = 1100;
        const step = (t) => {
            const k = Math.min(1, (t - t0) / DUR);
            const e = 1 - Math.pow(1 - k, 3);
            g.setAttribute('transform',
                `translate(0 ${((1 - e) * BATH_ART.TAIL.len * 0.9).toFixed(1)})`);
            if (k < 1) { this.fillRaf = requestAnimationFrame(step); return; }
            this.fillRaf = 0;
            this.spawnBubbles();
        };
        this.fillRaf = requestAnimationFrame(step);
    },

    // Угол от основания хвоста ко рту червя. Считается по НАРИСОВАННОМУ рту,
    // а не по числу: рот ездит вместе с моделью, и подобранный угол разошёлся
    // бы с ней при первой же правке персонажа.
    mouthPoint() {
        const box = this.wormBoxScene(), B = this.WORM_BASE, k = box.w / B.w;
        let p = null;
        if (this.wormHandle && this.wormHandle.getPartPoint) {
            const q = this.wormHandle.getPartPoint('mouth');
            if (q) p = { x: box.x + q.x * k, y: box.y + q.y * k };
        }
        return p || { x: box.x + box.w * 0.72, y: box.y + box.h * 0.62 };
    },

    aimAngle() {
        const A = BATH_ART.slots(), m = this.mouthPoint();
        return Math.atan2(m.y - A.tail.y, m.x - A.tail.x);
    },

    // Хвост нарисован остриём ВВЕРХ, то есть в -90°. Поворот доводит его до
    // нужного направления.
    drawTail() {
        const A = BATH_ART.slots(), g = this.el('bt-tail-pivot');
        if (!g) return;
        const deg = this.tailAngle * 180 / Math.PI + 90;
        g.setAttribute('transform',
            `translate(${A.tail.x} ${A.tail.y}) rotate(${deg.toFixed(1)})`);
    },

    // Кончик хвоста: отсюда бьёт струя и здесь сидят пузыри.
    tipAt(t) {
        const A = BATH_ART.slots(), L = BATH_ART.TAIL.len * (t == null ? 1 : t);
        return { x: A.tail.x + Math.cos(this.tailAngle) * L,
                 y: A.tail.y + Math.sin(this.tailAngle) * L };
    },

    // ---------- ПУЗЫРИ ----------
    // Восемь-двенадцать, и соседние лопаются пачкой: тридцать тапов
    // превращают приятный щелчок в работу (план, §1).
    spawnBubbles() {
        this.phase = 'pop';
        const C = this.cfg();
        const lo = C.bubblesMin || 8, hi = C.bubblesMax || 12;
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        this.bubbles = [];
        const W = BATH_ART.TAIL.base;
        for (let i = 0; i < n; i++) {
            // Вдоль хвоста, а не по кругу: пена сидит НА нём.
            const t = 0.12 + (i + 0.5) / n * 0.82;
            const side = (Math.random() - 0.5) * W * 0.9;
            const p = this.tipAt(t);
            this.bubbles.push({
                x: p.x - Math.sin(this.tailAngle) * side,
                y: p.y + Math.cos(this.tailAngle) * side,
                r: 15 + Math.random() * 11, alive: true, seed: i * 37 + 5
            });
        }
        this.drawBubbles();
    },

    drawBubbles() {
        this.el('bt-bubbles').innerHTML = this.bubbles
            .filter(b => b.alive)
            .map(b => BATH_ART.bubble(b.x, b.y, b.r, b.seed)).join('');
    },

    pop(p) {
        const hit = this.bubbles.find(b =>
            b.alive && Math.hypot(b.x - p.x, b.y - p.y) < b.r + 14);
        if (!hit) return;
        // Пачкой: лопается тот, по которому попали, и все соседи в радиусе.
        const R = this.cfg().burstRadius || 64;
        for (const b of this.bubbles)
            if (b.alive && Math.hypot(b.x - hit.x, b.y - hit.y) <= R) b.alive = false;
        this.drawBubbles();
        if (!this.bubbles.some(b => b.alive)) this.startFinale();
    },

    // ---------- ФИНАЛ: ТОЛЧКИ И ЛОВЛЯ ----------
    startFinale() {
        this.phase = 'aim';
        this.setCamera('finish');
        this.hits = 0;
        this.shotsLeft = this.cfg().shots || 10;

        // Блаженство: рот открыт, глаза зажмурены. Сказано позой, а не
        // подписью (инвариант 9).
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ mouthOpenness: 0.75, eyelidLevel: 0.9 });

        // Прицел и покой пересчитываются: камера переехала, а рот считается
        // по нарисованному червю.
        this.tailAim = this.aimAngle();
        this.tailRest = this.tailAim - this.REST_OFF;
        this.drawGauge();

        const tick = () => {
            // Хвост ТЯНЕТ ОБРАТНО, пока его не держат. Сопротивление — весь
            // смысл управления: без него прицел ставится один раз и забег
            // играется сам.
            if (!this.drag || this.drag.kind !== 'tail') {
                this.tailAngle += (this.tailRest - this.tailAngle) * this.TAIL_PULL;
            }
            this.drawTail();
            this.aimRaf = requestAnimationFrame(tick);
        };
        this.aimRaf = requestAnimationFrame(tick);
        this.shotTimer = setTimeout(() => this.shoot(), this.SHOT_MS);
    },

    // Палец ставит хвост туда, куда показывает, но не дальше упора.
    aimAt(p) {
        const A = BATH_ART.slots();
        const want = Math.atan2(p.y - A.tail.y, p.x - A.tail.x);
        let d = want - this.tailRest;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const R = this.TAIL_RANGE;
        this.tailAngle = this.tailRest + Math.max(-R, Math.min(R, d));
        this.drawTail();
    },

    // Один толчок. Модель ровно та, что считает tools/sim-lust.js: сила
    // U(minPower,1) — долетает от reach; угол — разброс струи плюс то, на
    // сколько повело хвост. Никакого замаха и никакого указателя: случайность
    // здесь — товар, который покупается прокачкой (план, §3).
    shoot() {
        if (this.phase !== 'aim') return;
        const C = this.cfg();
        const t = (C.tiers || [{}])[this.tier()] || {};
        const u = (a, b) => a + Math.random() * (b - a);
        const power = u(t.minPower || 0.2, 1);
        const err = (u(-(t.spread || 25), t.spread || 25)
                   + u(-(t.slop || 12), t.slop || 12)) * Math.PI / 180;
        const angle = this.tailAngle + err;

        const m = this.mouthPoint(), tip = this.tipAt(1);
        const dist = Math.hypot(m.x - tip.x, m.y - tip.y);
        const reach = C.reach || 0.5;
        const far = power >= reach ? dist * 1.06 : dist * (power / reach);

        let off = angle - this.tailAim;
        while (off > Math.PI) off -= 2 * Math.PI;
        while (off < -Math.PI) off += 2 * Math.PI;
        const hit = power >= reach
                 && Math.abs(off) <= (C.mouth || 10) * Math.PI / 180;
        if (hit) { this.hits++; this.drawGauge(); }

        const layer = this.el('bt-shots');
        layer.innerHTML = BATH_ART.shot(tip.x, tip.y, angle, far, this.shotsLeft * 13);
        setTimeout(() => { if (this.phase === 'aim') layer.innerHTML = ''; }, 420);

        if (--this.shotsLeft > 0) {
            this.shotTimer = setTimeout(() => this.shoot(), this.SHOT_MS);
        } else {
            this.shotTimer = setTimeout(() => this.done(), 900);
        }
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
        this.el('bt-gauge').innerHTML =
            BATH_ART.gauge(m.x, m.y - box.h * 0.62, C.sections || 3, filled);
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
