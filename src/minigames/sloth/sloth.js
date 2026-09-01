// ================= МИНИ-ИГРА ГРЕХ ЛЕНИ: САД =================
// Участок с грядками вместо одного горшка (docs/plan/19-sloth-garden.md).
// Интерфейс диегетический, как на кухне: инструмент ТАЩАТ на грядку, а не
// выбирают в меню. Слов нет ни одного (инвариант 9), окно общее (инвариант 8).
//
// ---------- ДВА МАСШТАБА ВРЕМЕНИ ----------
//   вскопал → посеял → полил
//        └─ ЭТАП 1: часы, идёт ОФФЛАЙН, ускоряется удобрением
//   прополол
//        └─ ЭТАП 2: минуты, идёт в сессии, сокращается граблями
//   собрал → плод лёг в кладовую кухни
//
// Ни один этап не тикает: состояние грядки — формула от метки времени
// (инвариант 1), и спрашивают его у Backend в момент отрисовки. Поэтому сад
// можно закрыть на неделю, и он не «догоняет» время при следующем открытии.
//
// ---------- ПОЧЕМУ ШКАЛА РАСТЁТ ЗА ДЕЙСТВИЯ ----------
// Задумка «шкала растёт от времени в мини-игре» отвергнута: тогда лучшая
// стратегия во всей игре — открыть сад и положить телефон, то есть механика
// награждает ровно за отсутствие игрока. Растёт она за вскопал/посеял/полил/
// прополол/собрал, и начисляет её Backend, а не этот файл (инвариант 2).
//
// ---------- ЧТО ПОКАЗЫВАЕТ ВРЕМЯ ----------
// Часы и минуты показать нечем: цифра «осталось 2 ч» — это подпись, а подписей
// в игре нет. Вместо неё растёт само растение: чем ближе срок, тем оно выше.
// Шкала и картинка — один и тот же объект.
const SlothMinigame = {
    screenElement: null,
    win: null,
    svgEl: null,
    camEl: null,
    fgEl: null,

    // Сколько инструмент «работает», прежде чем действие засчитается. Действия
    // нарочно не мгновенные: из них и складывается размеренность сада, ради
    // которой он затевался.
    ACT_MS: 520,

    camX: 0,
    drag: null,
    locked: false,
    tickId: null,

    init() {
        this.screenElement = document.getElementById('sloth-game');
        if (!this.screenElement) return;

        if (typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'sloth',
                onLeave: () => this.close(),
                // В саду нечего терять при выходе: всё, что сделано, уже лежит
                // в состоянии, а грядки зреют без игрока. Спрашивать «точно
                // выйти?» тут не о чем.
                canLeave: () => true
            });
        }

        this.svgEl = document.getElementById('gd-svg');
        this.camEl = document.getElementById('gd-cam');
        this.fgEl = document.getElementById('gd-fg');
        if (!this.svgEl) return;

        this.beds = (typeof GARDEN !== 'undefined') ? GARDEN.BEDS_TOTAL : 6;
        this.camEl.innerHTML = GARDEN_ART.scene(this.beds);

        this.svgEl.addEventListener('pointerdown', (e) => this.onDown(e));
        window.addEventListener('pointermove', (e) => this.onMove(e));
        window.addEventListener('pointerup', (e) => this.onUp(e));
        window.addEventListener('pointercancel', (e) => this.onUp(e));
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.camX = 0;
        this.drag = null;
        this.locked = false;
        this.render();
        // Один кадровый цикл на весь сад: он двигает только КАРТИНКУ —
        // подросшее растение и струю из лейки. Состояние он не трогает.
        if (!this.tickId) this.tickId = setInterval(() => this.render(), 1000);
    },

    close() {
        this.screenElement.classList.remove('active');
        if (this.tickId) { clearInterval(this.tickId); this.tickId = null; }
        this.drag = null;
    },

    // ---------- КООРДИНАТЫ ----------
    toScene(e) {
        const p = this.svgEl.createSVGPoint();
        p.x = e.clientX; p.y = e.clientY;
        return p.matrixTransform(this.camEl.getScreenCTM().inverse());
    },

    toStage(e) {
        const p = this.svgEl.createSVGPoint();
        p.x = e.clientX; p.y = e.clientY;
        return p.matrixTransform(this.svgEl.getScreenCTM().inverse());
    },

    setCam(x) {
        const maxX = Math.max(0, GARDEN_ART.sceneW(this.beds) - 390);
        this.camX = Math.max(0, Math.min(maxX, x));
        this.camEl.setAttribute('transform', `translate(${(-this.camX).toFixed(1)} 0)`);
    },

    // ---------- ОТРИСОВКА ----------
    // Грядки перерисовываются целиком: их шесть, каждая — десяток фигур, и
    // разбирать, что именно изменилось, дороже, чем собрать строку заново.
    render() {
        if (!this.camEl) return;
        const beds = Backend.gardenSettle();
        beds.forEach((bed, i) => {
            const g = document.getElementById('gd-bed-' + i);
            if (!g) return;
            g.setAttribute('transform', `translate(${GARDEN_ART.bedX(i)} 0)`);
            g.innerHTML = GARDEN_ART.bed(bed.stage, {
                seed: bed.seed || (i + 1) * 17,
                plant: bed.species ? PlantModel.generate(bed.species, bed.seed) : null,
                growth: this.growthOf(bed),
                fruitKey: bed.species
            });
        });
        this.renderTools();
    },

    // Доля роста: от неё зависит высота растения, и она же — единственная
    // видимая шкала времени в саду.
    growthOf(bed) {
        if (!bed.at) return bed.stage === 'ripe' || bed.stage === 'weedy' ? 1 : 0.1;
        const left = Backend.gardenLeft(bed);
        const tools = Backend.gardenTools();
        let total;
        if (bed.stage === 'growing') {
            const hours = GARDEN.CAN_HOURS[Math.min(tools.can, GARDEN.CAN_HOURS.length - 1)];
            total = Math.max(1, hours - (bed.skipped || 0) * GARDEN.FERT_HOURS_PER_DUNG) * 3600000;
        } else {
            const mins = GARDEN.RAKE_MINUTES[Math.min(tools.rake, GARDEN.RAKE_MINUTES.length - 1)];
            total = mins * ((GARDEN.species[bed.species] || {}).stage2 || 1) * 60000;
        }
        return Math.max(0.1, Math.min(1, 1 - left / total));
    },

    // ---------- ИНСТРУМЕНТЫ ----------
    // Полка с инструментами лежит в переднем плане: она не уезжает вместе с
    // участком, потому что инструменты игрок держит при себе.
    tools() {
        const list = [{ kind: 'spade' }, { kind: 'can' }, { kind: 'rake' }];
        (GameState.data.garden.seeds || []).forEach(key => list.push({ kind: 'seed', key }));
        if (GameState.currency('dung') > 0) list.push({ kind: 'dung' });
        return list;
    },

    renderTools() {
        const list = this.tools();
        const step = Math.min(64, 340 / Math.max(1, list.length));
        const x0 = 195 - step * (list.length - 1) / 2;
        this.fgEl.innerHTML = list.map((t, i) => {
            const art = t.kind === 'seed' ? GARDEN_ART.seedPacket(t.key, 3) : GARDEN_ART.tool(t.kind);
            const badge = t.kind === 'dung'
                ? `<text class="gd-count" x="0" y="34">${GameState.currency('dung')}</text>` : '';
            return `<g class="gd-tool" data-kind="${t.kind}" data-key="${t.key || ''}"
                        transform="translate(${(x0 + i * step).toFixed(1)} 782)">${art}${badge}</g>`;
        }).join('');
    },

    // ---------- ВВОД ----------
    onDown(e) {
        if (this.locked) return;
        const t = e.target;
        const tool = t.closest ? t.closest('.gd-tool') : null;
        if (tool) {
            e.preventDefault();
            // Инструмент в руке крупнее: предмет под пальцем обязан быть
            // крупнее самого пальца, иначе не видно, что именно держишь.
            const ghost = tool.cloneNode(true);
            ghost.classList.add('gd-dragging');
            this.fgEl.appendChild(ghost);
            const p = this.toStage(e);
            ghost.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(1.6)`);
            this.drag = { kind: 'tool', node: ghost, tool: tool.dataset.kind, key: tool.dataset.key };
            return;
        }

        const bed = t.closest ? t.closest('.gd-bed') : null;
        // Тап по спелой грядке — сбор. Плод срывают рукой, инструмент для
        // этого не нужен, и заводить его было бы лишним предметом на полке.
        if (bed) {
            const i = +bed.dataset.bed;
            const state = Backend.gardenBed(i);
            if (state && state.stage === 'ripe') { this.act(i, 'harvest'); return; }
        }

        // Всё остальное — панорама: сад разглядывают, ведя пальцем вбок.
        this.drag = { kind: 'pan', from: this.toStage(e).x, base: this.camX };
    },

    onMove(e) {
        if (!this.drag) return;
        if (this.drag.kind === 'pan') {
            this.setCam(this.drag.base - (this.toStage(e).x - this.drag.from));
            return;
        }
        const p = this.toStage(e);
        this.drag.node.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(1.6)`);
        // Грядка под пальцем подсвечивается: до того, как игрок отпустил,
        // должно быть видно, куда попадёт инструмент.
        const i = this.bedUnder(e);
        Array.from(document.querySelectorAll('.gd-bed')).forEach((g, n) => {
            g.classList.toggle('gd-target', n === i && this.allowed(this.drag, n));
        });
    },

    onUp(e) {
        const d = this.drag;
        this.drag = null;
        if (!d) return;
        Array.from(document.querySelectorAll('.gd-bed')).forEach(g => g.classList.remove('gd-target'));
        if (d.kind === 'pan') return;
        d.node.remove();

        const i = this.bedUnder(e);
        if (i < 0 || !this.allowed(d, i)) return;
        this.act(i, this.actionOf(d), d.key ? { species: d.key } : null);
    },

    // Какое действие соответствует инструменту. Таблица одна и здесь: если
    // действие некуда положить в неё, значит инструмента для него нет.
    actionOf(d) {
        return { spade: 'dig', seed: 'sow', can: 'water', rake: 'weed', dung: 'fertilize' }[d.tool];
    },

    // Можно ли этим по этой грядке. Проверяется ДО отпускания, чтобы подсветка
    // не обещала того, чего не будет.
    allowed(d, i) {
        const bed = Backend.gardenBed(i);
        if (!bed) return false;
        const need = { dig: 'locked', sow: 'empty', water: 'sown', weed: 'weedy', fertilize: 'growing' };
        return bed.stage === need[this.actionOf(d)];
    },

    bedUnder(e) {
        const p = this.toScene(e);
        for (let i = 0; i < this.beds; i++) {
            const x = GARDEN_ART.bedX(i);
            if (Math.abs(p.x - x) < GARDEN_ART.BED_W / 2 + 10 &&
                p.y > GARDEN_ART.SOIL_Y - 90 && p.y < GARDEN_ART.SOIL_Y + 40) return i;
        }
        return -1;
    },

    // ---------- ДЕЙСТВИЕ ----------
    // Действие занимает время и на это время отбирает управление: из
    // неспешности и складывается сад. Мгновенные действия превратили бы его в
    // список кнопок.
    act(i, action, opts) {
        if (this.locked) return;
        const res = Backend.gardenAct(i, action, opts);
        if (!res.ok) { this.refuse(i); return; }

        this.locked = true;
        if (action === 'water') this.pour(i);
        const g = document.getElementById('gd-bed-' + i);
        if (g) { g.classList.remove('gd-act'); void g.getBoundingClientRect(); g.classList.add('gd-act'); }

        setTimeout(() => {
            this.locked = false;
            this.render();
            if (res.grown) this.flyToPantry(i);
            if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        }, this.ACT_MS);
    },

    // Отказ, сказанный движением: написать «сюда нельзя» нечем.
    refuse(i) {
        const g = document.getElementById('gd-bed-' + i);
        if (!g) return;
        g.classList.remove('gd-no');
        void g.getBoundingClientRect();
        g.classList.add('gd-no');
    },

    // ---------- ПОЛИВ ----------
    // Та же связная струя, что на кухне: шарики под фильтром сливаются в воду.
    // Отдельные капли не читаются жидкостью — это уже проверено на кухне
    // (docs/traps.md, п. 4).
    pour(i) {
        const layer = document.getElementById('gd-stream');
        if (!layer) return;
        const x = GARDEN_ART.bedX(i);
        const y0 = GARDEN_ART.SOIL_Y - 150, y1 = GARDEN_ART.SOIL_Y - 20;
        const N = 9;
        layer.innerHTML = Array.from({ length: N }, (_, n) => {
            const t = n / (N - 1);
            return `<circle cx="${(x + (t - 0.5) * 6).toFixed(1)}" cy="${(y0 + (y1 - y0) * t).toFixed(1)}"
                            r="${(7 - 3 * t).toFixed(1)}"/>`;
        }).join('');
        setTimeout(() => { layer.innerHTML = ''; }, this.ACT_MS);
    },

    // Собранный плод улетает вниз — туда, где кладовая. Связь «сад кормит
    // кухню» показывается движением, а не объяснением.
    flyToPantry(i) {
        const g = document.getElementById('gd-bed-' + i);
        if (!g) return;
        g.classList.remove('gd-harvest');
        void g.getBoundingClientRect();
        g.classList.add('gd-harvest');
    }
};

if (typeof window !== 'undefined') window.SlothMinigame = SlothMinigame;
