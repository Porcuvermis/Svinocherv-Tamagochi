// ================= МИНИ-ИГРА ГРЕХ ЛЕНИ: САД =================
// Участок с грядками вместо одного горшка (docs/plan/19-sloth-garden.md).
// Интерфейс диегетический, как на кухне: инструмент ТАЩАТ на грядку, а не
// выбирают в меню. Слов нет ни одного (инвариант 9), окно общее (инвариант 8).
//
// ---------- КРУГ ГРЯДКИ ----------
//   разобрал завал (рукой) → вскопал лунку → посеял → полил
//        └─ ЭТАП 1: часы, идёт ОФФЛАЙН, ускоряется удобрением
//   прополол
//        └─ ЭТАП 2: минуты, идёт в сессии, сокращается граблями
//   собрал → плод лёг в кладовую кухни
//
// Ни один этап не тикает: состояние грядки — формула от метки времени
// (инвариант 1), и спрашивают его у Backend в момент отрисовки. Поэтому сад
// можно закрыть на неделю, и он не «догоняет» время при следующем открытии.
//
// ---------- ПОЧЕМУ ШКАЛА РАСТЁТ И ОТ ПРЕБЫВАНИЯ ----------
// Лень — единственный грех, которому «положил телефон и ничего не делаешь»
// не противоречит, а ровно соответствует. Поэтому шкала растёт от двух вещей
// сразу: минута в саду закрывает её целиком сама, каждое действие даёт пятую
// часть. Возиться быстрее, чем сидеть, — иначе сад незачем открывать.
//
// Тикающего счётчика при этом нет (инвариант 1): экран держит МЕТКУ времени
// открытия, а добавку считает Backend формулой от разницы меток. Метка живёт
// в памяти экрана, а не в сейве — пребывание нельзя накопить, закрыв игру с
// открытым садом.
//
// ---------- ЧТО ПОКАЗЫВАЕТ ВРЕМЯ ----------
// Двумя вещами сразу: растение тем выше, чем ближе срок, а в кольце над
// грядкой стоят цифры — сколько осталось. Кольцо без цифр отвечало только
// «скоро/не скоро», а решение «ждать или скинуть какашкой» принимается по
// разнице между двумя часами и двадцатью минутами. Цифра не слово
// (инвариант 9).
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

        // Своя debug-панель: сад меряется часами, и без отмотки времени
        // проверить его нельзя вообще никак.
        if (typeof GardenDebug !== 'undefined') GardenDebug.init(this.screenElement);

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
        // Метка пребывания ставится ЗАНОВО при каждом открытии: время, пока
        // сад был закрыт, лени не засчитывается.
        this.watchMark = GameTime.now();
        this.render();
        if (typeof GardenDebug !== 'undefined') GardenDebug.render();
        // Один кадровый цикл на весь сад: он двигает только КАРТИНКУ —
        // подросшее растение и струю из лейки. Состояние он не трогает.
        if (!this.tickId) this.tickId = setInterval(() => this.render(), 1000);
    },

    close() {
        // Досчитать пребывание за последний неполный кусок и записать: иначе
        // секунды между последней отрисовкой и выходом пропадают.
        this.settleWatch();
        GameState.save();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        this.screenElement.classList.remove('active');
        if (this.tickId) { clearInterval(this.tickId); this.tickId = null; }
        this.drag = null;
        this.watchMark = 0;
    },

    // Пребывание: считает Backend, экран только отдаёт метку и забирает новую.
    settleWatch() {
        if (!this.watchMark) return 0;
        const r = Backend.slothWatch(this.watchMark);
        this.watchMark = r.mark;
        return r.fill;
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
        // Пребывание досчитывается на каждой отрисовке: раз в секунду шкала и
        // так перерисовывается, второго механизма для этого не нужно.
        this.settleWatch();
        const beds = Backend.gardenSettle();
        beds.forEach((bed, i) => {
            const g = document.getElementById('gd-bed-' + i);
            if (!g) return;
            g.setAttribute('transform', `translate(${GARDEN_ART.bedX(i)} 0)`);
            const growth = this.growthOf(bed);
            const plant = bed.species ? PlantModel.generate(bed.species, bed.seed || 1) : null;
            // Содержимое грядки лежит во ВЛОЖЕННОЙ группе. Анимации приседания
            // и сбора правят transform, а на внешней группе им записана
            // позиция грядки в сцене — совпав, они выкидывали грядку к нулю,
            // и она прыгала через весь экран (docs/traps.md, п. 2).
            g.innerHTML = `<g class="gd-bed-in">` + GARDEN_ART.bed(bed.stage, {
                seed: bed.seed || (i + 1) * 17,
                uid: i, plant, growth, fruitKey: bed.species
            }) + this.badgeFor(bed, plant, growth) + `</g>`;
        });
        this.renderTools();
        this.renderGauge();
    },

    // Что грядка просит прямо сейчас. Одна таблица на всё: если состоянию
    // нечего сюда положить, значит от игрока в нём ничего не ждут.
    // Порядок тот же, что у полки с инструментами: рука → лопата → семечко →
    // лейка → грабли → рука.
    NEED: { locked: 'hand', empty: 'spade', dug: 'seed', sown: 'can', weedy: 'rake', ripe: 'hand' },

    // Значок висит НАД растением, а не на фиксированной высоте: иначе выросший
    // куст закрывает собой ровно ту подсказку, которая к нему относится.
    badgeFor(bed, plant, growth) {
        const need = this.NEED[bed.stage];
        const waiting = bed.stage === 'growing' || bed.stage === 'ripening';
        if (!need && !waiting) return '';
        // Высоту куста спрашиваем у того же кода, который его рисует: свой
        // расчёт разъезжается с настоящим, и значок садится кусту на голову.
        const top = plant ? GARDEN_ART.plantHeight(plant, growth) + 18 : 30;
        const y = Math.max(120, GARDEN_ART.SOIL_Y - top - 56);
        const art = waiting
            ? GARDEN_ART.badge('wait', growth, Backend.gardenLeft(bed))
            : GARDEN_ART.badge(need);
        return `<g transform="translate(0 ${y.toFixed(0)})">${art}</g>`;
    },

    // ---------- ШКАЛА ЛЕНИ ----------
    // Её не было видно вообще: игрок делал действия и не понимал, зачем.
    // Лежит поверх сцены сверху — снизу грядки и инструменты, и закрывать их
    // нечем.
    renderGauge() {
        const el = document.getElementById('gd-gauge-bar');
        if (!el) return;
        const v = GameState.sinValue('sloth') / GameState.maxValue('sloth');
        el.style.width = (Math.max(0, Math.min(1, v)) * 100).toFixed(1) + '%';
    },

    // Доля роста: от неё зависит высота растения, и она же — единственная
    // видимая шкала времени в саду.
    //
    // Рост идёт СКВОЗЬ ОБА ЭТАПА одной непрерывной линией: этап 1 поднимает
    // куст с нуля до трёх четвертей, этап 2 доводит до полного. Считать
    // каждый этап от нуля было ошибкой — прополотая грядка внезапно
    // становилась ростком, и выходило, что прополка растение уменьшила.
    GROW_STAGE1: 0.74,

    growthOf(bed) {
        const left = Backend.gardenLeft(bed);
        const tools = Backend.gardenTools();
        if (bed.stage === 'growing') {
            if (!bed.at) return 0.1;
            const hours = GARDEN.CAN_HOURS[Math.min(tools.can, GARDEN.CAN_HOURS.length - 1)];
            const total = Math.max(1, hours - (bed.skipped || 0) * GARDEN.FERT_HOURS_PER_DUNG) * 3600000;
            const done = Math.max(0, Math.min(1, 1 - left / total));
            return 0.1 + done * (this.GROW_STAGE1 - 0.1);
        }
        if (bed.stage === 'weedy') return this.GROW_STAGE1;
        if (bed.stage === 'ripening') {
            if (!bed.at) return this.GROW_STAGE1;
            const mins = GARDEN.RAKE_MINUTES[Math.min(tools.rake, GARDEN.RAKE_MINUTES.length - 1)];
            const total = mins * ((GARDEN.species[bed.species] || {}).stage2 || 1) * 60000;
            const done = Math.max(0, Math.min(1, 1 - left / total));
            return this.GROW_STAGE1 + done * (1 - this.GROW_STAGE1);
        }
        return bed.stage === 'ripe' ? 1 : 0.1;
    },

    // ---------- ИНСТРУМЕНТЫ ----------
    // Полка с инструментами лежит в переднем плане: она не уезжает вместе с
    // участком, потому что инструменты игрок держит при себе.
    // Полка выложена ПО ПОРЯДКУ ПРИМЕНЕНИЯ, слева направо, как круг грядки и
    // идёт: лопата (лунка) → семена (посев) → лейка (полив) → какашка
    // (удобрение) → грабли (прополка). Порядок сам по себе объясняет цикл, и
    // искать нужную вещь не приходится — она следующая справа.
    tools() {
        const list = [{ kind: 'spade' }];
        (GameState.data.garden.seeds || []).forEach(key => list.push({ kind: 'seed', key }));
        list.push({ kind: 'can' });
        if (GameState.currency('dung') > 0) list.push({ kind: 'dung' });
        list.push({ kind: 'rake' });
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
        // Что делают РУКАМИ: разбирают завал на новой грядке и срывают спелый
        // плод. Инструмента для этого нет и не будет — рука уже есть у
        // каждого, а лишний предмет на полке пришлось бы объяснять.
        if (bed) {
            const i = +bed.dataset.bed;
            const state = Backend.gardenBed(i);
            if (state && state.stage === 'locked') { this.act(i, 'clear'); return; }
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
        const need = { dig: 'empty', sow: 'dug', water: 'sown', weed: 'weedy', fertilize: 'growing' };
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
        this.bump(i, 'gd-act');

        setTimeout(() => {
            this.locked = false;
            GameState.save();
            this.render();
            if (res.grown) this.flyToPantry(i);
            // Шкала дёргается на каждом действии: без этого игрок не связывает
            // «повозился в саду» с «лень закрылась», а связь тут и есть весь
            // смысл мини-игры.
            if (res.fill) {
                const w = document.getElementById('gd-gauge-wrap');
                if (w) { w.classList.remove('gd-bump'); void w.getBoundingClientRect(); w.classList.add('gd-bump'); }
            }
            if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        }, this.ACT_MS);
    },

    // Отказ, сказанный движением: написать «сюда нельзя» нечем.
    refuse(i) { this.bump(i, 'gd-no'); },

    // Любая анимация грядки вешается на ВЛОЖЕННУЮ группу. На внешней записана
    // позиция грядки в сцене (`transform="translate(x 0)"`), и CSS-анимация,
    // правящая transform, стирала её на время проигрывания: грядка прыгала к
    // левому краю экрана и возвращалась. Ровно тот же случай, что с пульсом
    // значка (docs/traps.md, п. 2).
    bump(i, cls) {
        const g = document.getElementById('gd-bed-' + i);
        const inner = g && g.querySelector('.gd-bed-in');
        if (!inner) return;
        inner.classList.remove(cls);
        void inner.getBoundingClientRect();
        inner.classList.add(cls);
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
    flyToPantry(i) { this.bump(i, 'gd-harvest'); }
};

if (typeof window !== 'undefined') window.SlothMinigame = SlothMinigame;
