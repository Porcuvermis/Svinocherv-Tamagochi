// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ТЩЕСЛАВИЯ (ТАП ПО ЦЕЛИ) =================
// Персонаж (общая моделька, WormRenderer) стоит на постаменте в центре
// игрового поля, которое занимает почти весь экран. По полю вспыхивают ЗОНЫ
// внимания — пятно света со сжимающимся кольцом (кольцо = таймер на тап).
//
// ВАЖНОЕ ПРО РАЗМЕР ЗОНЫ (см. docs/plan/17-pride.md). Зона попадания равна
// СТАРТОВОМУ размеру кольца и не меняется, пока зона жива: кольцо сжимается
// только чтобы показать остаток времени. В первой версии было наоборот —
// кольцо радиусом 44 px вело глаз, а засчитывался тап только в кружок 17 px
// внутри него. По площади это в 6.7 раза меньше того, что игрок видит; игра
// была буквально непроходима. Зелёный кружок в центре убран по той же
// причине: он врал про размер зоны, а маркер и так есть — кольцо.
//
// ТАЙМИНГ ОДИН НА ВСЕ ЗОНЫ — TARGET_LIFE_MS. Ускорения за удачный тап (было:
// −0.1 сек за каждый) больше нет: оно наказывало ровно за успех и упиралось в
// физический предел. Сложность даёт не сжатие окна, а ПОТОК: новая зона
// появляется каждые SPAWN_INTERVAL_MS, поэтому на экране их обычно две-три
// одновременно, и тыкать их можно в любом порядке.
//
// На МЕСТЕ тапа показывается один из двух локальных эффектов — они различают
// «поцелуй» (тап пришёлся по силуэту персонажа) от «вспышки фотоаппарата»
// (тап мимо силуэта):
// - 💋 — если ТОЧКА ТАПА попала по реально отрисованному силуэту;
// - нарисованный блик вспышки (SVG, не эмодзи) — если нет.
// Проверка — через document.elementFromPoint(), то есть буквально по тому,
// что нарисовано на экране (учитывает форму тела, ушей, хвоста), а не по
// прямоугольному bbox персонажа: прямоугольник перекрывал бы почти всё поле и
// засчитывал ЛЮБОЕ попадание как «поцелуй» (это был баг первой версии).
// Смотрим именно точку тапа, а не всю зону: зона теперь большая и почти всегда
// хоть краем цепляет силуэт — различие потеряло бы смысл.
//
// Шкала прогресса — свой отдельный счётчик 0..100, независимый от шкалы
// греха: попадание +HIT_DELTA, промах/пропуск MISS_DELTA, плюс постоянный
// пассивный распад. Это внутрисессионный счётчик, он живёт по своим правилам
// и умирает вместе с мини-игрой — таким таймерам это можно.
//
// О прохождении мини-игра сообщает событием minigame:result (тот же паттерн,
// что и в envy.js/gluttony.js): шкала греха трогается только по факту
// прохождения, а на сколько она поднимется, решает конфиг наград. В meta
// уходят попадания/промахи — под будущий множитель за точность
// (docs/plan/17-pride.md, раздел 4).
//
// Персонаж — общая моделька игрока (см. src/core/worm-model.js,
// src/core/worm-renderer.js), а не свой хардкод-SVG. Раскладка (позиция
// персонажа И постамента) считается от РЕАЛЬНО отрисованных габаритов, а
// не захардкоженными числами — тот же подход, что и в gluttony.js
// layoutFeedStage() (см. claude/progress-log.md, правка 17): персонаж с
// постаментом центрируются как единая композиция по вертикали и горизонтали
// поля, поэтому при любом размере поля/экрана и при будущем взрослении
// персонажа (другой размер тела) раскладка пересчитается сама.

const PRIDE_CONFIG = {
    TAP_RADIUS: 44,             // px, радиус ЗОНЫ ПОПАДАНИЯ = стартовый радиус кольца
    RING_CORE_RADIUS: 8,        // px, до чего сжимается кольцо к концу окна
    TARGET_LIFE_MS: 1500,       // сколько живёт зона — одинаково для всех, не ускоряется
    SPAWN_INTERVAL_MS: 800,     // как часто появляется новая зона (короче жизни — отсюда наложение)
    MAX_TARGETS: 4,             // предохранитель: больше стольких зон на экране не держим
    SPAWN_TRIES: 12,            // сколько бросков делаем, подбирая место подальше от живых зон
    HIT_DELTA: 8,               // % к шкале за попадание
    MISS_DELTA: -5,             // % к шкале за промах/пропуск (мягче попадания — см. план, раздел 5)
    PASSIVE_DECAY_PER_SEC: 1.5,  // постоянный пассивный распад шкалы, %/сек
    KISS_FX_MS: 520,             // длительность локального эффекта "поцелуй" (💋)
    FLASH_FX_MS: 220,            // длительность локального эффекта "вспышка фотоаппарата"
    FEET_OVERLAP: 8,             // px, насколько силуэт персонажа "утоплен" в постамент при раскладке
};


const PrideMinigame = {
    screenElement: null,
    closeBtn: null,
    fieldEl: null,
    fieldGlowEl: null,
    pedestalEl: null,
    wormStageEl: null,
    targetsLayer: null,
    fxLayer: null,
    gaugeBar: null,
    winOverlay: null,

    wormHandle: null,

    progress: 0,
    finished: false,
    hits: 0,
    misses: 0,

    // Живые зоны: { x, y, token, el, ringEl, timer, bornAt, resolved }.
    // Их несколько одновременно — в этом и есть челлендж вместо ускорения.
    targets: [],
    tokenCounter: 0,
    // Накопитель времени до следующей зоны. Считается в rAF-цикле, а не
    // отдельным setInterval: тогда поток целей сам собой замирает вместе с
    // кадрами (вкладка ушла в фон) и не выбрасывает пачку зон при возврате.
    spawnAcc: 0,

    rafId: null,
    lastTs: null,

    _resizeBound: false,

    init() {
        this.screenElement = document.getElementById('pride-game');
        this.closeBtn = document.getElementById('pride-close-btn');
        this.fieldEl = document.getElementById('pride-field');
        this.fieldGlowEl = document.getElementById('pride-field-glow');
        this.pedestalEl = document.getElementById('pride-pedestal');
        this.wormStageEl = document.getElementById('pride-worm-stage');
        this.targetsLayer = document.getElementById('pride-targets-layer');
        this.fxLayer = document.getElementById('pride-fx-layer');
        this.gaugeBar = document.getElementById('pride-gauge-bar');
        this.winOverlay = document.getElementById('pride-win-overlay');

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }
        if (this.fieldEl) {
            this.fieldEl.addEventListener('pointerdown', (e) => this.onFieldPointerDown(e));
        }
        if (!this._resizeBound) {
            this._resizeBound = true;
            window.addEventListener('resize', () => {
                if (!this.screenElement || !this.screenElement.classList.contains('active')) return;
                this.layoutStage();
                // Координаты зон — в пикселях внутри поля, после смены его
                // размера они уже врут. Гасим живые, поток тут же насыплет
                // новые: спавнить вручную не нужно.
                this.clearTargets();
            });
        }
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.resetAll();
    },

    close() {
        this.stopLoop();
        this.clearTargets();
        if (this.screenElement) this.screenElement.classList.remove('active');
        // ВАЖНО: winOverlay получает класс 'show' в finishGame() (победа), а
        // раньше снимался только в resetAll() — то есть только при следующем
        // open(). Если игрок побеждал и сразу закрывал игру (не открывая
        // Тщеславие заново), 'show' оставался навсегда. У #pride-win-overlay.show
        // в CSS явный pointer-events:auto — родитель #pride-game в это время
        // невидим (opacity:0), но opacity НЕ блокирует клики у потомка с
        // собственным pointer-events:auto. В итоге поверх всего экрана
        // оставался невидимый, но кликабельный слой почти на весь модал,
        // перехватывающий тапы в других мини-играх. Снимаем 'show' здесь же,
        // сразу при закрытии, а не только при повторном открытии.
        if (this.winOverlay) this.winOverlay.classList.remove('show');
        if (this.fieldGlowEl) this.fieldGlowEl.className = 'pride-field-glow';
    },

    resetAll() {
        this.progress = 0;
        this.finished = false;
        this.hits = 0;
        this.misses = 0;
        this.lastTs = null;
        this.spawnAcc = 0;
        this.clearTargets();
        this.updateGaugeUI();
        if (this.winOverlay) this.winOverlay.classList.remove('show');
        if (this.fieldGlowEl) this.fieldGlowEl.className = 'pride-field-glow';

        this.mountWorm();
        // Два вложенных rAF — сегменты напольной цепи персонажа получают
        // свой transform только в первом тике WormRenderer (requestAnimationFrame),
        // не в момент mount()/update(). Меряем реальный bbox только ПОСЛЕ
        // этого первого тика (см. комментарий у layoutStage()).
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.layoutStage();
            this.spawnTarget();
        }));

        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    stopLoop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.lastTs = null;
    },

    // ---------- ПЕРСОНАЖ ----------
    mountWorm() {
        if (!window.WormModelAPI || !window.WormRenderer) {
            alert('Тщеславие: не найден WormModelAPI/WormRenderer — проверь, что src/core/worm-model.js и src/core/worm-renderer.js подключены в index.html до pride.js.');
            return;
        }
        if (!this.wormStageEl) return;
        try {
            const model = window.WormModelAPI.loadWormModel();
            if (!this.wormHandle) {
                this.wormHandle = window.WormRenderer.mount(this.wormStageEl, model, {
                    context: 'pride',
                    // Персонаж позирует на постаменте — не бродит по сцене,
                    // иначе раскладка (нога строго на постаменте) поедет.
                    wander: false,
                    blink: true,
                    idleWave: true,
                    flip: false,
                    pose: 'standing',
                    // Стартовый анкор — просто разумная точка по умолчанию,
                    // точную позицию сразу же выставляет layoutStage() ниже
                    // по РЕАЛЬНО отрисованным габаритам.
                    anchorX: 0.5,
                    anchorY: 0.55
                });
            } else {
                this.wormHandle.update(model);
            }
        } catch (err) {
            alert('Тщеславие: ошибка при отрисовке персонажа — ' + (err && err.message ? err.message : err));
            console.error(err);
        }
    },

    // Центрирует ВСЮ композицию "персонаж + постамент" внутри поля — и по
    // горизонтали, и по вертикали, — от РЕАЛЬНО измеренных габаритов
    // (getBoundingClientRect и силуэта персонажа, и уже отрисованного
    // постамента), а не от захардкоженных чисел/процентов. Тот же принцип,
    // что и в gluttony.js layoutFeedStage(): при другом размере поля
    // (другой экран) или другом размере персонажа (будущее взросление)
    // раскладка пересчитается сама, без правок кода.
    layoutStage() {
        if (!this.wormHandle || !this.wormStageEl || !this.fieldEl || !this.pedestalEl) return;

        const fieldRect = this.fieldEl.getBoundingClientRect();
        if (fieldRect.width < 4 || fieldRect.height < 4) return;

        const bodyGroup = this.wormHandle.svgRoot.querySelector('.worm-root');
        if (!bodyGroup) return;
        const bodyRect = bodyGroup.getBoundingClientRect();
        if (bodyRect.width < 1 || bodyRect.height < 1) return;

        // Высота постамента — из его ТЕКУЩЕЙ отрисовки (фиксированный px в
        // CSS, от вертикальной позиции не зависит), поэтому измерить её
        // можно в любой момент, даже до того, как мы сами переставим
        // постамент по вертикали ниже.
        const pedestalRect = this.pedestalEl.getBoundingClientRect();
        const pedestalH = pedestalRect.height;

        const charH = bodyRect.height;
        const compH = charH + pedestalH - PRIDE_CONFIG.FEET_OVERLAP;
        const marginTop = Math.max(0, (fieldRect.height - compH) / 2);

        const charTargetBottom = fieldRect.top + marginTop + charH;
        const pedestalTargetTop = charTargetBottom - PRIDE_CONFIG.FEET_OVERLAP;

        const bodyCenterX = bodyRect.left + bodyRect.width / 2;
        const targetCenterX = fieldRect.left + fieldRect.width / 2;

        const currentPos = this.wormHandle.getPosition();
        const dx = targetCenterX - bodyCenterX;
        const dy = charTargetBottom - bodyRect.bottom;
        this.wormHandle.setPosition(currentPos.x + dx, currentPos.y + dy);

        // Постамент двигаем только по вертикали (top, в системе координат
        // поля) — по горизонтали он и так центрирован через CSS
        // (left:50%; transform:translateX(-50%)).
        this.pedestalEl.style.top = `${pedestalTargetTop - fieldRect.top}px`;
    },

    // ---------- ШКАЛА ----------
    loop(now) {
        if (!this.finished) {
            if (this.lastTs == null) this.lastTs = now;
            const dtSec = Math.min(0.25, Math.max(0, (now - this.lastTs) / 1000));
            this.lastTs = now;
            if (this.progress > 0) {
                this.progress = Math.max(0, this.progress - PRIDE_CONFIG.PASSIVE_DECAY_PER_SEC * dtSec);
                this.updateGaugeUI();
            }
            // Поток зон. Спавним не больше одной за кадр, даже если
            // накопилось на несколько: пачка из трёх зон, вылетевшая
            // одновременно, читается как баг, а не как сложность.
            this.spawnAcc += dtSec * 1000;
            if (this.spawnAcc >= PRIDE_CONFIG.SPAWN_INTERVAL_MS) {
                this.spawnAcc = Math.min(this.spawnAcc - PRIDE_CONFIG.SPAWN_INTERVAL_MS,
                                         PRIDE_CONFIG.SPAWN_INTERVAL_MS);
                this.spawnTarget();
            }
        } else {
            this.lastTs = now;
        }
        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    updateGaugeUI() {
        if (this.gaugeBar) this.gaugeBar.style.width = `${this.progress}%`;
    },

    addProgress(delta) {
        this.progress = Math.min(100, Math.max(0, this.progress + delta));
        this.updateGaugeUI();
        if (this.progress >= 100 && !this.finished) {
            this.finishGame();
        }
    },

    // ---------- ЗОНЫ ВНИМАНИЯ + КОЛЬЦО-ТАЙМЕР ----------
    // Зон на экране несколько сразу. Каждая живёт TARGET_LIFE_MS, зона
    // попадания у всех одна и та же (TAP_RADIUS) и за время жизни не
    // меняется — кольцо сжимается только как индикатор остатка времени.
    spawnTarget() {
        if (this.finished) return;
        if (!this.fieldEl || !this.targetsLayer) return;
        if (this.targets.length >= PRIDE_CONFIG.MAX_TARGETS) return;

        const fieldRect = this.fieldEl.getBoundingClientRect();
        if (fieldRect.width < 4 || fieldRect.height < 4) {
            // Поле ещё не отрисовано (нулевые размеры сразу после открытия) —
            // пробуем на следующем кадре, а не молча падаем.
            requestAnimationFrame(() => this.spawnTarget());
            return;
        }

        const spot = this.pickSpot(fieldRect);
        this.tokenCounter++;
        const token = this.tokenCounter;

        const r = PRIDE_CONFIG.TAP_RADIUS;
        const spotEl = document.createElement('div');
        spotEl.className = 'pride-target';
        spotEl.style.width = `${r * 2}px`;
        spotEl.style.height = `${r * 2}px`;
        spotEl.style.left = `${spot.x}px`;
        spotEl.style.top = `${spot.y}px`;
        this.targetsLayer.appendChild(spotEl);

        const ringEl = document.createElement('div');
        ringEl.className = 'pride-ring';
        ringEl.style.left = `${spot.x}px`;
        ringEl.style.top = `${spot.y}px`;
        ringEl.style.width = `${r * 2}px`;
        ringEl.style.height = `${r * 2}px`;
        this.targetsLayer.appendChild(ringEl);

        // Форсируем рефлоу между стартовым и конечным размером — иначе браузер
        // схлопнет transition в один кадр (оба значения применились бы в
        // одном и том же тике вёрстки) и сжатия визуально не будет видно.
        void ringEl.offsetWidth;
        const coreD = PRIDE_CONFIG.RING_CORE_RADIUS * 2;
        ringEl.style.transitionDuration = `${PRIDE_CONFIG.TARGET_LIFE_MS}ms`;
        ringEl.style.width = `${coreD}px`;
        ringEl.style.height = `${coreD}px`;

        const target = {
            x: spot.x, y: spot.y, token,
            el: spotEl, ringEl,
            diesAt: performance.now() + PRIDE_CONFIG.TARGET_LIFE_MS,
            resolved: false,
            timer: null
        };
        target.timer = setTimeout(() => this.onTargetTimeout(token), PRIDE_CONFIG.TARGET_LIFE_MS);
        this.targets.push(target);
    },

    // Ищет место для новой зоны: несколько случайных бросков, побеждает тот,
    // что дальше всех от уже живых зон. Без этого две зоны налезают друг на
    // друга, и игрок не понимает, по какой из них он попал.
    pickSpot(fieldRect) {
        const r = PRIDE_CONFIG.TAP_RADIUS;
        const freeW = fieldRect.width - r * 2;
        const freeH = fieldRect.height - r * 2;
        if (freeW < 4 || freeH < 4) {
            // Поле слишком тесное для полного отступа — не зависаем без зоны.
            return { x: fieldRect.width / 2, y: fieldRect.height / 2 };
        }
        let best = null;
        let bestDist = -1;
        for (let i = 0; i < PRIDE_CONFIG.SPAWN_TRIES; i++) {
            const x = r + Math.random() * freeW;
            const y = r + Math.random() * freeH;
            let nearest = Infinity;
            for (const t of this.targets) {
                nearest = Math.min(nearest, Math.hypot(x - t.x, y - t.y));
            }
            if (nearest > bestDist) {
                bestDist = nearest;
                best = { x, y };
            }
            // Разошлись достаточно, чтобы пятна не слипались в одно, —
            // дальше искать незачем. Радиуса мало: две зоны на таком
            // расстоянии наезжают почти наполовину и читаются как одна.
            if (bestDist >= r * 1.6) break;
        }
        return best;
    },

    removeTarget(target) {
        if (target.timer) clearTimeout(target.timer);
        if (target.el) target.el.remove();
        if (target.ringEl) target.ringEl.remove();
        const i = this.targets.indexOf(target);
        if (i >= 0) this.targets.splice(i, 1);
    },

    clearTargets() {
        while (this.targets.length) this.removeTarget(this.targets[0]);
    },

    // ---------- ВВОД ----------
    onFieldPointerDown(e) {
        if (this.finished) return;
        e.preventDefault();
        const rect = this.fieldEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Тап засчитывается той зоне, которой осталось жить меньше всех: если
        // две зоны наложились краями, справедливее закрыть ту, что вот-вот
        // погаснет, — вторую игрок ещё успеет добрать.
        let pick = null;
        for (const t of this.targets) {
            if (t.resolved) continue;
            if (Math.hypot(x - t.x, y - t.y) > PRIDE_CONFIG.TAP_RADIUS) continue;
            if (!pick || t.diesAt < pick.diesAt) pick = t;
        }

        if (pick) {
            this.resolveTarget(pick, true, x, y);
        } else if (this.targets.length) {
            // Тап мимо всех зон — промах. Иначе выгодно барабанить пальцем по
            // всему полю: зоны большие, и слепая дробь закрывала бы их сама.
            this.registerMiss();
        }
    },

    onTargetTimeout(token) {
        const target = this.targets.find(t => t.token === token);
        if (!target || target.resolved) return;
        this.resolveTarget(target, false, target.x, target.y);
    },

    resolveTarget(target, hit, tapX, tapY) {
        if (target.resolved) return;
        target.resolved = true;
        // «Поцелуй или вспышка» — по ТОЧКЕ ТАПА, а не по всей зоне: зона
        // большая и почти всегда хоть краем задевает силуэт, так что различие
        // по зоне выродилось бы в «всегда поцелуй».
        const onWorm = hit ? this.isOnWorm(tapX, tapY) : false;
        this.removeTarget(target);

        if (!hit) {
            this.registerMiss();
            return;
        }

        this.hits++;
        this.addProgress(PRIDE_CONFIG.HIT_DELTA);
        this.flashField('green');
        if (onWorm) {
            this.spawnKissFx(tapX, tapY);
        } else {
            this.spawnFlashFx(tapX, tapY);
        }
    },

    registerMiss() {
        this.misses++;
        this.addProgress(PRIDE_CONFIG.MISS_DELTA);
        this.flashField('red');
    },

    // Проверяет, пришёлся ли тап по реально отрисованному силуэту персонажа —
    // через document.elementFromPoint(), то есть по факту того, что
    // нарисовано на экране (учитывает форму тела/ушей/хвоста), а не по
    // прямоугольному bbox. Прямоугольный bbox персонажа покрывает большую
    // часть поля (включая пустоты внутри силуэта) — именно из-за этого в
    // первой версии ЛЮБОЕ попадание засчитывалось как «поцелуй».
    // Чтобы elementFromPoint видел форму персонажа (а не проваливался
    // сквозь неё к полю под ней), у SVG-персонажа в pride.css явно включён
    // pointer-events — см. .pride-worm-stage .worm-stage-svg.
    isOnWorm(fieldX, fieldY) {
        if (!this.wormHandle || !this.fieldEl) return false;
        const fieldRect = this.fieldEl.getBoundingClientRect();
        const el = document.elementFromPoint(fieldRect.left + fieldX, fieldRect.top + fieldY);
        return !!(el && el.closest('.worm-root'));
    },

    // ---------- ИНДИКАЦИЯ: СВЕЧЕНИЕ ОКАНТОВКИ ПОЛЯ ----------
    // Только два цвета — зелёный (удачно) / красный (неудачно). Розовый
    // был третьим вариантом в первой версии, но по фидбеку убран: розовая
    // вспышка визуально считывалась как "что-то пошло не так", а не как
    // похвала — путала игрока.
    flashField(color) {
        if (!this.fieldGlowEl) return;
        this.fieldGlowEl.classList.remove('flash-green', 'flash-red');
        // Рефлоу нужен, чтобы повторный (например, очень частый) тап мог
        // перезапустить CSS-анимацию вспышки с самого начала, а не молча
        // проигнорировать повторное добавление того же класса.
        void this.fieldGlowEl.offsetWidth;
        this.fieldGlowEl.classList.add(`flash-${color}`);
    },

    // ---------- ЛОКАЛЬНЫЕ ЭФФЕКТЫ НА МЕСТЕ ТАПА ----------
    spawnKissFx(x, y) {
        if (!this.fxLayer) return;
        const el = document.createElement('div');
        el.className = 'pride-fx pride-fx-kiss';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.textContent = '💋';
        const shiftX = (6 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1);
        const rot = (8 + Math.random() * 6) * (Math.random() < 0.5 ? -1 : 1);
        el.style.setProperty('--fx-shift', `${shiftX.toFixed(1)}px`);
        el.style.setProperty('--fx-rot', `${rot.toFixed(1)}deg`);
        this.fxLayer.appendChild(el);
        setTimeout(() => el.remove(), PRIDE_CONFIG.KISS_FX_MS);
    },

    spawnFlashFx(x, y) {
        if (!this.fxLayer) return;
        const el = document.createElement('div');
        el.className = 'pride-fx pride-fx-flash';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        // Простой "блик вспышки фотоаппарата" — кружок с расходящимися
        // лучами, нарисован тем же приёмом, что и остальная графика игры
        // (инлайновый SVG), а не эмодзи — по аналогии с губами, но своя форма.
        el.innerHTML = `
            <svg viewBox="0 0 40 40" width="26" height="26">
                <circle cx="20" cy="20" r="7" fill="#ffffff"/>
                <g stroke="#ffffff" stroke-width="3" stroke-linecap="round">
                    <line x1="20" y1="2" x2="20" y2="12"/>
                    <line x1="20" y1="28" x2="20" y2="38"/>
                    <line x1="2" y1="20" x2="12" y2="20"/>
                    <line x1="28" y1="20" x2="38" y2="20"/>
                    <line x1="7" y1="7" x2="14" y2="14"/>
                    <line x1="26" y1="26" x2="33" y2="33"/>
                    <line x1="33" y1="7" x2="26" y2="14"/>
                    <line x1="14" y1="26" x2="7" y2="33"/>
                </g>
            </svg>`;
        this.fxLayer.appendChild(el);
        setTimeout(() => el.remove(), PRIDE_CONFIG.FLASH_FX_MS);
    },

    // ---------- ПОБЕДА ----------
    finishGame() {
        if (this.finished) return;
        this.finished = true;
        this.clearTargets();
        if (this.winOverlay) this.winOverlay.classList.add('show');

        // Мини-игра не начисляет сама: сообщает результат, а что за него
        // дать, решает конфиг наград (src/config/economy.js).
        // meta — под будущий множитель за точность (docs/plan/17-pride.md,
        // раздел 4): решать, сколько за это дать, всё равно будет конфиг
        // наград, но считать точность может только сама мини-игра.
        GameEvents.emit('minigame:result', {
            sin: 'pride', mode: 'parade', outcome: 'win',
            meta: { hits: this.hits, misses: this.misses }
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PrideMinigame.init());
} else {
    PrideMinigame.init();
}
