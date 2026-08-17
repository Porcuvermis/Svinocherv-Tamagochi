// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ТЩЕСЛАВИЯ (ТАП ПО ЦЕЛИ) =================
// Персонаж (общая моделька, WormRenderer) стоит на постаменте в центре
// игрового поля, которое занимает почти весь экран (тот же формат/пропорции,
// что и весь игровой экран, только уменьшенный примерно на 10% — не
// маленькая квадратная карточка, как было в первой версии). В случайных
// точках поля появляется цель — кружок со сжимающимся светящимся кольцом
// (кольцо = таймер на тап). Стартует с 1.5 сек, каждый УДАЧНЫЙ тап ускоряет
// таймер на 0.1 сек (промах темп не меняет), пол — 0.5 сек, дальше не
// ускоряется. Успел тапнуть по цели — окантовка поля
// вспыхивает зелёным (удачно) или красным (промах/пропуск тайминга) — два
// цвета, не три: розовый визуально читался как "ошибка", поэтому убран.
//
// На МЕСТЕ тапа при этом показывается один из двух локальных эффектов —
// они как раз и различают "поцелуй" (цель хоть немного касалась силуэта
// персонажа) от "вспышки фотоаппарата" (цель была совсем мимо):
// - 💋 — если ЦЕЛЬ (сам кружок, а не только точка тапа) хоть немного
//   соприкасалась с реально отрисованным силуэтом персонажа;
// - нарисованный блик вспышки (SVG, не эмодзи) — если нет.
// Проверка "касается ли силуэта" — через document.elementFromPoint() в
// нескольких точках по окружности цели (центр + 8 точек по периметру), то
// есть буквально по тому, что реально нарисовано на экране (учитывает
// форму тела, ушей, хвоста и т.п.), а не по прямоугольному bbox персонажа —
// прямоугольник почти всегда перекрывал бы всё поле целиком и засчитывал
// ЛЮБОЕ попадание как "поцелуй" (это и был баг в первой версии).
//
// Шкала прогресса — свой отдельный счётчик 0..100, независимый от
// GameManager.sins.pride.value: удачный этап +10%, промах/пропуск -10%,
// плюс постоянный пассивный распад -2%/сек. GameManager.sins.pride.value
// выставляется в 100 только при заполнении этой шкалы до конца (тот же
// паттерн, что и в envy.js/gluttony.js — обновляем реальную шкалу греха
// только по факту прохождения мини-игры, а не постоянно).
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
    TARGET_RADIUS: 17,          // px, радиус самой цели (кружка для тапа)
    RING_RADIUS_MULT: 2.6,      // кольцо стартует в 2.6 раза больше радиуса цели (в диапазоне 2-3 из ТЗ)
    RING_SHRINK_START_MS: 1500, // длительность кольца-таймера на самом первом этапе (относительно медленно)
    RING_SHRINK_STEP_MS: 100,   // на сколько ускоряется (уменьшается) таймер за КАЖДЫЙ удачный тап (0.1 сек)
    RING_SHRINK_MIN_MS: 500,    // потолок скорости — быстрее этого таймер уже не становится
    HIT_DELTA: 10,               // % к шкале за удачный тап (любой из двух видов)
    MISS_DELTA: -10,             // % к шкале за промах/пропуск тайминга
    PASSIVE_DECAY_PER_SEC: 2,    // постоянный пассивный распад шкалы, %/сек
    KISS_FX_MS: 520,             // длительность локального эффекта "поцелуй" (💋)
    FLASH_FX_MS: 220,            // длительность локального эффекта "вспышка фотоаппарата"
    FEET_OVERLAP: 8,             // px, насколько силуэт персонажа "утоплен" в постамент при раскладке
    ON_WORM_SAMPLE_RAYS: 8,      // сколько точек по периметру цели проверяем на касание силуэта (+ центр)
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

    target: null,       // { x, y, token, resolved }
    targetEl: null,
    ringEl: null,
    targetTimer: null,
    tokenCounter: 0,
    // Текущая длительность кольца-таймера (мс) — стартует с
    // RING_SHRINK_START_MS, ускоряется (уменьшается) на RING_SHRINK_STEP_MS
    // за каждый УДАЧНЫЙ тап (любой из двух видов), промах её не меняет, и
    // никогда не опускается ниже RING_SHRINK_MIN_MS. Сбрасывается на
    // RING_SHRINK_START_MS в resetAll() при каждом новом заходе в мини-игру.
    currentRingMs: PRIDE_CONFIG.RING_SHRINK_START_MS,

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
                if (!this.finished) this.spawnTarget();
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
        this.clearActiveTarget();
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
        this.lastTs = null;
        this.currentRingMs = PRIDE_CONFIG.RING_SHRINK_START_MS;
        this.clearActiveTarget();
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

    // ---------- ЦЕЛЬ + КОЛЬЦО-ТАЙМЕР ----------
    spawnTarget() {
        if (this.finished) return;
        this.clearActiveTarget();
        if (!this.fieldEl || !this.targetsLayer) return;

        const fieldRect = this.fieldEl.getBoundingClientRect();
        if (fieldRect.width < 4 || fieldRect.height < 4) {
            // Поле ещё не отрисовано (нулевые размеры сразу после открытия) —
            // пробуем на следующем кадре, а не молча падаем.
            requestAnimationFrame(() => this.spawnTarget());
            return;
        }

        // Отступ от края поля = максимальный (стартовый) радиус кольца —
        // так кольцо в своём самом большом размере никогда не вылезает за
        // рамку игрового поля.
        const ringMaxR = PRIDE_CONFIG.TARGET_RADIUS * PRIDE_CONFIG.RING_RADIUS_MULT;
        let x, y;
        if (fieldRect.width - ringMaxR * 2 > 4 && fieldRect.height - ringMaxR * 2 > 4) {
            x = ringMaxR + Math.random() * (fieldRect.width - ringMaxR * 2);
            y = ringMaxR + Math.random() * (fieldRect.height - ringMaxR * 2);
        } else {
            // Поле слишком тесное для идеального отступа — не зависаем без цели.
            x = fieldRect.width / 2;
            y = fieldRect.height / 2;
        }

        this.tokenCounter++;
        const token = this.tokenCounter;
        this.target = { x, y, token, resolved: false };

        const targetEl = document.createElement('div');
        targetEl.className = 'pride-target';
        const targetD = PRIDE_CONFIG.TARGET_RADIUS * 2;
        targetEl.style.width = `${targetD}px`;
        targetEl.style.height = `${targetD}px`;
        targetEl.style.left = `${x}px`;
        targetEl.style.top = `${y}px`;
        this.targetsLayer.appendChild(targetEl);
        this.targetEl = targetEl;

        const ringEl = document.createElement('div');
        ringEl.className = 'pride-ring';
        ringEl.style.left = `${x}px`;
        ringEl.style.top = `${y}px`;
        const maxD = ringMaxR * 2;
        const minD = targetD;
        ringEl.style.width = `${maxD}px`;
        ringEl.style.height = `${maxD}px`;
        this.targetsLayer.appendChild(ringEl);
        this.ringEl = ringEl;

        // Форсируем рефлоу между стартовым и конечным размером — иначе браузер
        // схлопнет transition в один кадр (оба значения применились бы в
        // одном и том же тике вёрстки) и сжатия визуально не будет видно.
        // Длительность берём из this.currentRingMs (не из константы) — она
        // ускоряется с каждым удачным тапом, см. resolveTarget().
        void ringEl.offsetWidth;
        ringEl.style.transitionDuration = `${this.currentRingMs}ms`;
        ringEl.style.width = `${minD}px`;
        ringEl.style.height = `${minD}px`;

        this.targetTimer = setTimeout(() => this.onTargetTimeout(token), this.currentRingMs);
    },

    clearActiveTarget() {
        if (this.targetTimer) {
            clearTimeout(this.targetTimer);
            this.targetTimer = null;
        }
        if (this.targetEl) { this.targetEl.remove(); this.targetEl = null; }
        if (this.ringEl) { this.ringEl.remove(); this.ringEl = null; }
        this.target = null;
    },

    // ---------- ВВОД ----------
    onFieldPointerDown(e) {
        if (this.finished || !this.target || this.target.resolved) return;
        e.preventDefault();
        const rect = this.fieldEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dist = Math.hypot(x - this.target.x, y - this.target.y);
        const hit = dist <= PRIDE_CONFIG.TARGET_RADIUS;
        this.resolveTarget(hit, x, y);
    },

    onTargetTimeout(token) {
        if (!this.target || this.target.token !== token || this.target.resolved) return;
        // Кольцо схлопнулось раньше тапа — засчитываем как промах на месте цели.
        this.resolveTarget(false, this.target.x, this.target.y);
    },

    resolveTarget(hit, tapX, tapY) {
        if (!this.target || this.target.resolved) return;
        this.target.resolved = true;
        // "На модельке" определяем по позиции самой ЦЕЛИ (а не только точки
        // тапа) — засчитываем, даже если цель лишь слегка касалась силуэта.
        const wasOnWorm = hit ? this.isOnWorm(this.target.x, this.target.y) : false;
        this.clearActiveTarget();

        if (hit) {
            this.addProgress(PRIDE_CONFIG.HIT_DELTA);
            this.flashField('green');
            if (wasOnWorm) {
                this.spawnKissFx(tapX, tapY);
            } else {
                this.spawnFlashFx(tapX, tapY);
            }
            // Удачный этап ускоряет СЛЕДУЮЩЕЕ окно тайминга на 0.1 сек —
            // промах темп не меняет. Пол — RING_SHRINK_MIN_MS, дальше не
            // ускоряется, чтобы игра не стала физически невозможной.
            this.currentRingMs = Math.max(
                PRIDE_CONFIG.RING_SHRINK_MIN_MS,
                this.currentRingMs - PRIDE_CONFIG.RING_SHRINK_STEP_MS
            );
        } else {
            this.addProgress(PRIDE_CONFIG.MISS_DELTA);
            this.flashField('red');
        }

        if (!this.finished) {
            this.spawnTarget();
        }
    },

    // Проверяет, касается ли КРУГ цели (центр + несколько точек по
    // периметру) реально отрисованного силуэта персонажа — через
    // document.elementFromPoint(), то есть по факту того, что нарисовано на
    // экране (учитывает форму тела/ушей/хвоста), а не по прямоугольному
    // bbox. Прямоугольный bbox персонажа почти всегда покрывает большую
    // часть поля (включая пустые промежутки внутри силуэта) — именно из-за
    // этого в первой версии ЛЮБОЕ попадание засчитывалось как "поцелуй".
    // Чтобы elementFromPoint видел форму персонажа (а не проваливался
    // сквозь неё к полю под ней), у SVG-персонажа в pride.css явно включён
    // pointer-events — см. .pride-worm-stage .worm-stage-svg.
    isOnWorm(fieldX, fieldY) {
        if (!this.wormHandle || !this.fieldEl) return false;
        const fieldRect = this.fieldEl.getBoundingClientRect();
        const r = PRIDE_CONFIG.TARGET_RADIUS;
        const rays = PRIDE_CONFIG.ON_WORM_SAMPLE_RAYS;
        const points = [[0, 0]];
        for (let i = 0; i < rays; i++) {
            const angle = (i / rays) * Math.PI * 2;
            points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
        }
        for (const [ox, oy] of points) {
            const clientX = fieldRect.left + fieldX + ox;
            const clientY = fieldRect.top + fieldY + oy;
            const el = document.elementFromPoint(clientX, clientY);
            if (el && el.closest('.worm-root')) return true;
        }
        return false;
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
        this.clearActiveTarget();
        if (this.winOverlay) this.winOverlay.classList.add('show');

        if (typeof GameManager !== 'undefined') {
            GameManager.sins.pride.value = 100;
            GameManager.updateUI();
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PrideMinigame.init());
} else {
    PrideMinigame.init();
}
