// ================= МИНИ-ИГРА ГРЕХ ПОХОТИ: ВАННАЯ =================
// Замысел — docs/plan/21-lust-bath.md. Червь лежит в ванне, игрок его моет.
//
// ---------- ХОД ЗАБЕГА ----------
//   кран → вода → мыло (широкие мазки) → мочалка (короткие тёрки)
//        → хвост → пузыри → финал на меткость
//
// Сделаны первые три ступени; остальные идут следом и уже описаны в плане.
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
    phase: 'idle',      // idle → filling → soap → cloth → done
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
        this.el('bt-bubbles').innerHTML = '';
        this.el('bt-jet').innerHTML = BATH_ART.jet();
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
        if (this.fillRaf) { cancelAnimationFrame(this.fillRaf); this.fillRaf = 0; }
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

    // Точка сцены → пиксели слоя червя. Тот же приём, что на кухне.
    sceneToHost(pt) {
        const m = this.camEl.getScreenCTM();
        const host = this.wormHost;
        if (!m || !host || !host.offsetParent) return { x: 0, y: 0, k: 1 };
        const r = host.offsetParent.getBoundingClientRect();
        const k = (r.width / (host.offsetParent.clientWidth || r.width)) || 1;
        const p = this.svgEl.createSVGPoint();
        p.x = pt.x; p.y = pt.y;
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
        }
    },

    onMove(e) {
        if (!this.drag) return;
        e.preventDefault();
        this.moveTool(this.toStage(e));

        const p = this.toScene(e);
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
        this.fgEl.innerHTML = '';
        this.showTools(true);
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
        if (kind === 'soap') {
            // Мочалка снимает мыло и оставляет пену: муть гасится, чтобы
            // второй этап был виден.
            this.phase = 'cloth';
            this.resetCover();
            this.el('bt-film').style.opacity = '0.35';
            this.ready('cloth');
            return;
        }
        this.phase = 'done';
        this.ready(null);
        // Мини-игра НИЧЕГО не начисляет сама (инвариант 2): она сообщает
        // результат, а что за это дать — решает конфиг наград.
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'bath', outcome: 'win',
            meta: { stages: ['soap', 'cloth'] }
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LustMinigame.init());
} else {
    LustMinigame.init();
}
