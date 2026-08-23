// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ПОХОТИ =================
const LustMinigame = {
    screenElement: null,
    closeBtn: null,
    tailZone: null,
    tailEl: null,
    tailPath: null,
    tailTipMarker: null,
    gaugeBar: null,
    winOverlay: null,
    splashLayer: null,
    wormSvg: null,
    lidLeft: null,
    lidRight: null,
    pupilLeft: null,
    pupilRight: null,
    debugLayer: null,

    // Настройки геймплея
    SWING_GAIN: 5,      // % за одну засчитанную "качель" (20 качелей = 100%)
    IDLE_DELAY: 1200,   // мс бездействия до начала падения шкалы
    DECAY_PER_SEC: 4,   // %/сек падения при простое
    WAVE_COUNT: 4,      // число залпов брызг
    WAVE_GAP: 1500,     // мс между залпами (итог ~6 сек)

    // Состояние
    progress: 0,
    pos: 0.5,           // текущее (зажатое 0..1) положение фейдера
    atTop: false,       // фейдер сейчас физически упёрся в верхнюю точку
    atBottom: false,    // фейдер сейчас физически упёрся в нижнюю точку
    lastExtreme: null,  // 'top' | 'bottom' | null — какая точка сработала последней
    dragging: false,
    dragRect: null,     // геометрия РЕАЛЬНОГО хвоста, зафиксированная на старте драга
    finished: false,
    lastMoveTime: 0,
    lastTick: null,
    rafId: null,
    waveTimeouts: [],

    TAIL_SVG: `
        <svg viewBox="0 0 120 260" preserveAspectRatio="xMidYMax meet">
            <defs>
                <linearGradient id="lust-tail-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ffd6ec"/>
                    <stop offset="45%" stop-color="#ff9fd0"/>
                    <stop offset="100%" stop-color="#ef6bae"/>
                </linearGradient>
                <radialGradient id="lust-shine-grad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
                    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
                </radialGradient>
                <clipPath id="lust-tail-clip">
                    <use href="#lust-tail-path"/>
                </clipPath>
            </defs>
            <path id="lust-tail-path"
                  d="M60,10
                     C42,10 34,34 36,64
                     C38,100 30,140 28,178
                     C26,210 32,238 44,250
                     C50,256 70,256 76,250
                     C88,238 94,210 92,178
                     C90,140 82,100 84,64
                     C86,34 78,10 60,10 Z"
                  fill="url(#lust-tail-grad)"
                  stroke="#e0559e"
                  stroke-width="4"
                  stroke-linejoin="round"/>
            <ellipse cx="46" cy="52" rx="9" ry="24" fill="#ffffff" opacity="0.28" transform="rotate(-12 46 52)"/>
            <g clip-path="url(#lust-tail-clip)">
                <ellipse cx="60" cy="20" rx="60" ry="26" fill="url(#lust-shine-grad)">
                    <animate attributeName="cy" values="20;238;20" dur="2.6s" repeatCount="indefinite"/>
                </ellipse>
            </g>
            <circle id="lust-tail-tip-dot" cx="60" cy="12" r="1" fill="none" opacity="0"/>
        </svg>
    `,

    init() {
        this.screenElement = document.getElementById('lust-game');
        this.closeBtn = document.getElementById('lust-close-btn');
        this.tailZone = document.getElementById('lust-tail-zone');
        this.tailEl = document.getElementById('lust-tail');
        this.gaugeBar = document.getElementById('lust-gauge-bar');
        this.winOverlay = document.getElementById('lust-win-overlay');
        this.splashLayer = document.getElementById('lust-splash-layer');
        this.wormSvg = document.getElementById('lust-worm-svg');
        this.lidLeft = document.getElementById('lust-lid-left');
        this.lidRight = document.getElementById('lust-lid-right');
        this.pupilLeft = document.getElementById('lust-pupil-left');
        this.pupilRight = document.getElementById('lust-pupil-right');
        this.debugLayer = document.getElementById('lust-debug-layer');

        if (this.tailEl) {
            this.tailEl.innerHTML = this.TAIL_SVG;
            this.tailTipMarker = this.tailEl.querySelector('#lust-tail-tip-dot');
            this.tailPath = this.tailEl.querySelector('#lust-tail-path');

            // Слушатели теперь висят строго на самом <path> хвоста.
            // Благодаря pointer-events:auto именно на path (а не на div/svg),
            // хит-тест идёт по реальной закрашенной форме, а не по
            // прямоугольному bbox, который был заметно больше видимого хвоста.
            if (this.tailPath) {
                this.tailPath.addEventListener('pointerdown', (e) => this.startDrag(e));
                this.tailPath.addEventListener('pointermove', (e) => this.onMove(e));
                this.tailPath.addEventListener('pointerup', (e) => this.onUp(e));
                this.tailPath.addEventListener('pointercancel', (e) => this.onUp(e));
            }
        }

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.resetState();
        if (!this.rafId) this.rafId = requestAnimationFrame((t) => this.tick(t));
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        this.lastTick = null;
        this.clearWaves();
    },

    clearWaves() {
        this.waveTimeouts.forEach(id => clearTimeout(id));
        this.waveTimeouts = [];
    },

    resetState() {
        this.progress = 0;
        this.pos = 0.5;
        this.atTop = false;
        this.atBottom = false;
        this.lastExtreme = null;
        this.dragging = false;
        this.dragRect = null;
        this.finished = false;
        this.lastMoveTime = performance.now();
        this.lastTick = null;
        this.clearWaves();

        if (this.splashLayer) this.splashLayer.innerHTML = '';
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out');

        this.updateGauge();
        this.applyPos(0.5);
    },

    // ---------- ЦИКЛ ПРОСТОЯ / ПАДЕНИЯ ШКАЛЫ ----------
    tick(now) {
        if (!this.lastTick) this.lastTick = now;
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        if (!this.finished && !this.dragging) {
            const idleFor = now - this.lastMoveTime;
            if (idleFor > this.IDLE_DELAY && this.progress > 0) {
                this.progress = Math.max(0, this.progress - this.DECAY_PER_SEC * dt);
                this.updateGauge();
            }
        }
        this.renderDebug();
        this.rafId = requestAnimationFrame((t) => this.tick(t));
    },

    // ---------- DEBUG-ВИЗУАЛИЗАЦИЯ ХИТБОКСА ХВОСТА ----------
    renderDebug() {
        if (!this.debugLayer) return;
        const on = typeof DebugMode !== 'undefined' && DebugMode.enabled;
        if (!on) {
            if (this.debugLayer.classList.contains('show')) {
                this.debugLayer.classList.remove('show');
                this.debugLayer.innerHTML = '';
            }
            return;
        }
        if (!this.tailPath) return;
        const layerRect = this.debugLayer.getBoundingClientRect();
        const rect = this.tailPath.getBoundingClientRect();
        if (rect.height <= 0) return;
        const relTop = rect.top - layerRect.top;
        const relLeft = rect.left - layerRect.left;
        const markerY = relTop + (1 - this.pos) * rect.height;
        this.debugLayer.classList.add('show');
        this.debugLayer.innerHTML = `
            <div class="lust-debug-rect" style="left:${relLeft}px; top:${relTop}px; width:${rect.width}px; height:${rect.height}px;"></div>
            <div class="lust-debug-line ${this.atTop ? 'triggered' : ''}" style="left:${relLeft}px; top:${relTop}px; width:${rect.width}px;">
                <span>pos=1 (верх)</span>
            </div>
            <div class="lust-debug-line ${this.atBottom ? 'triggered' : ''}" style="left:${relLeft}px; top:${relTop + rect.height}px; width:${rect.width}px;">
                <span>pos=0 (низ)</span>
            </div>
            <div class="lust-debug-marker" style="left:${relLeft}px; top:${markerY}px; width:${rect.width}px;"></div>
            <div class="lust-debug-readout" style="left:${relLeft + rect.width + 8}px; top:${markerY - 8}px;">pos=${this.pos.toFixed(2)}</div>
        `;
    },

    // ---------- ДРАГ ХВОСТА ----------
    startDrag(e) {
        if (this.finished || !this.tailPath) return;
        this.dragging = true;
        try { this.tailPath.setPointerCapture(e.pointerId); } catch (err) {}

        // Диапазон свайпа фиксируется на старте драга по реальному bbox
        // самого <path>, а не по увеличенной невидимой зоне-обёртке.
        // Это гарантирует, что верхняя/нижняя точки срабатывания совпадают
        // с физическими верхом/низом видимого хвоста.
        this.dragRect = this.tailPath.getBoundingClientRect();

        this.onMove(e);
    },

    onMove(e) {
        if (!this.dragging || this.finished) return;
        if (!this.dragRect || this.dragRect.height <= 0) return;

        const rawFraction = 1 - (e.clientY - this.dragRect.top) / this.dragRect.height;

        this.lastMoveTime = performance.now();
        this.applyPos(rawFraction);
    },

    onUp() {
        this.dragging = false;
        this.dragRect = null;
        // Прогресс/lastExtreme НЕ трогаем — просто отпускание пальца.
    },

    // Жёстко зажимает позицию фейдера в границах [0,1] — физически нельзя
    // потащить выше верхней или ниже нижней точки срабатывания.
    applyPos(rawFraction) {
        this.pos = Math.min(1, Math.max(0, rawFraction));

        if (this.tailEl) {
            const pull = Math.abs(this.pos - 0.5) * 2;
            this.tailEl.style.setProperty('--pull', pull.toFixed(2));
        }

        this.checkExtreme();
    },

    // ---------- ОПРЕДЕЛЕНИЕ СРАБАТЫВАНИЯ ТОЧЕК ----------
    checkExtreme() {
        if (this.finished) return;

        if (this.pos >= 1) {
            if (!this.atTop) {
                this.atTop = true;
                this.atBottom = false;
                // Первое срабатывание в игре — любое. Дальше — строго чередование.
                if (this.lastExtreme === null || this.lastExtreme === 'bottom') {
                    this.lastExtreme = 'top';
                    this.addSwing();
                }
            }
        } else if (this.pos <= 0) {
            if (!this.atBottom) {
                this.atBottom = true;
                this.atTop = false;
                if (this.lastExtreme === null || this.lastExtreme === 'top') {
                    this.lastExtreme = 'bottom';
                    this.addSwing();
                }
            }
        } else {
            // Ушли из крайнего положения — снимаем флаги, чтобы точку можно
            // было засчитать заново при следующем визите (после чередования).
            this.atTop = false;
            this.atBottom = false;
        }
    },

    addSwing() {
        this.progress = Math.min(100, this.progress + this.SWING_GAIN);
        this.updateGauge();
        if (this.progress >= 100 && !this.finished) {
            this.finished = true;
            this.onFull();
        }
    },

    // ---------- ОТРИСОВКА СОСТОЯНИЯ ----------
    updateGauge() {
        const t = this.progress / 100;

        if (this.gaugeBar) {
            this.gaugeBar.style.width = `${this.progress}%`;

            const hue = 120 - 120 * t;
            const sat = 45 + 45 * t;
            const light = 62 - 12 * t;
            const color = `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
            this.gaugeBar.style.background = color;
            this.gaugeBar.style.boxShadow = `0 0 ${6 + t * 14}px hsla(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, 0.85)`;
        }

        if (this.tailEl) this.tailEl.style.setProperty('--growth', t.toFixed(3));
        this.updateWormFace(t);
    },

    updateWormFace(growth) {
        const lidH = growth * 20;
        if (this.lidLeft) this.lidLeft.setAttribute('height', lidH);
        if (this.lidRight) this.lidRight.setAttribute('height', lidH);

        const pupilCy = 140 - growth * 7;
        if (this.pupilLeft) this.pupilLeft.setAttribute('cy', pupilCy);
        if (this.pupilRight) this.pupilRight.setAttribute('cy', pupilCy);
    },

    // ---------- ФИНАЛ ----------
    onFull() {
        this.showWinText();
        this.runSplashSequence();

        // Мини-игра не начисляет сама: сообщает результат, а что за него
        // дать, решает конфиг наград (src/config/economy.js).
        GameEvents.emit('minigame:result', { sin: 'lust', mode: 'kiss', outcome: 'win' });
    },

    showWinText() {
        if (!this.winOverlay) return;
        this.winOverlay.classList.remove('fade-out');
        this.winOverlay.classList.add('show');
        setTimeout(() => this.winOverlay.classList.add('fade-out'), 1500);
        setTimeout(() => this.winOverlay.classList.remove('show', 'fade-out'), 2500);
    },

    // ---------- БРЫЗГИ: 4 ЗАЛПА, ИТОГ ~6 СЕК ----------
    runSplashSequence() {
        for (let w = 0; w < this.WAVE_COUNT; w++) {
            const id = setTimeout(() => this.spawnWave(w), w * this.WAVE_GAP);
            this.waveTimeouts.push(id);
        }
    },

    getTipOrigin(layerRect) {
        if (this.tailTipMarker) {
            const r = this.tailTipMarker.getBoundingClientRect();
            return {
                x: r.left + r.width / 2 - layerRect.left,
                y: r.top - layerRect.top
            };
        }
        const tailRect = this.tailEl.getBoundingClientRect();
        return { x: tailRect.left + tailRect.width / 2 - layerRect.left, y: tailRect.top - layerRect.top };
    },

    spawnWave(waveIndex) {
        if (!this.splashLayer || !this.tailEl) return;

        const layerRect = this.splashLayer.getBoundingClientRect();
        const origin = this.getTipOrigin(layerRect);
        const originX = origin.x;
        const originY = origin.y;

        const tailTargets = [
            { x: originX - 14 - waveIndex * 3, y: originY + 30 },
            { x: originX + 18 + waveIndex * 2, y: originY + 80 },
            { x: originX - 10,                 y: originY + 140 },
            { x: originX + 12,                 y: originY + 195 }
        ];
        tailTargets.forEach(t => this.flyDrop(originX, originY, t.x, t.y, 'tail', 14));

        if (this.wormSvg) {
            const wormRect = this.wormSvg.getBoundingClientRect();
            const wormTargets = [
                { x: wormRect.left + wormRect.width * (0.34 + waveIndex * 0.03) - layerRect.left, y: wormRect.top + wormRect.height * 0.48 - layerRect.top },
                { x: wormRect.left + wormRect.width * 0.56 - layerRect.left,                       y: wormRect.top + wormRect.height * 0.3 - layerRect.top },
                { x: wormRect.left + wormRect.width * 0.26 - layerRect.left,                       y: wormRect.top + wormRect.height * 0.66 - layerRect.top },
                { x: wormRect.left + wormRect.width * 0.64 - layerRect.left,                       y: wormRect.top + wormRect.height * 0.56 - layerRect.top },
                { x: wormRect.left + wormRect.width * 0.46 - layerRect.left,                       y: wormRect.top + wormRect.height * 0.82 - layerRect.top }
            ];
            wormTargets.forEach(t => this.flyDrop(originX, originY, t.x, t.y, 'worm', 16));
        }

        const randomCount = 30;
        for (let i = 0; i < randomCount; i++) {
            const angle = (-175 + Math.random() * 170) * Math.PI / 180;
            const dist = 60 + Math.random() * 230;
            const tx = originX + Math.cos(angle) * dist;
            const ty = originY + Math.sin(angle) * dist;
            const type = Math.random() < 0.45 ? 'worm' : (Math.random() < 0.55 ? 'tail' : 'none');
            const isStream = Math.random() < 0.4;
            const size = isStream ? (5 + Math.random() * 5) : (7 + Math.random() * 12);
            this.flyDrop(originX, originY, tx, ty, type, size, isStream);
        }
    },

    flyDrop(fromX, fromY, toX, toY, target, size, isStream) {
        const drop = document.createElement('div');
        drop.className = isStream ? 'lust-drop lust-stream' : 'lust-drop';
        drop.style.left = `${fromX}px`;
        drop.style.top = `${fromY}px`;
        drop.style.setProperty('--tx', `${toX - fromX}px`);
        drop.style.setProperty('--ty', `${toY - fromY}px`);
        drop.style.setProperty('--rot', `${Math.random() * 120 - 60}deg`);

        const w = size || (8 + Math.random() * 10);
        const h = isStream ? w * 2.4 : w * 1.3;
        drop.style.width = `${w}px`;
        drop.style.height = `${h}px`;

        const duration = 0.4 + Math.random() * 0.35;
        drop.style.animationDuration = `${duration}s`;

        this.splashLayer.appendChild(drop);

        setTimeout(() => {
            drop.remove();
            if (target === 'tail') this.addStain(toX, toY);
            else if (target === 'worm') this.addDrip(toX, toY);
        }, duration * 1000);
    },

    addStain(x, y) {
        const stain = document.createElement('div');
        stain.className = 'lust-stain';
        const size = 9 + Math.random() * 16;
        stain.style.width = `${size}px`;
        stain.style.height = `${size * (0.7 + Math.random() * 0.5)}px`;
        stain.style.left = `${x - size / 2}px`;
        stain.style.top = `${y - size / 2}px`;
        stain.style.borderRadius =
            `${40 + Math.random() * 30}% ${40 + Math.random() * 30}% ${40 + Math.random() * 30}% ${40 + Math.random() * 30}%`;
        this.splashLayer.appendChild(stain);
    },

    addDrip(x, y) {
        const drip = document.createElement('div');
        drip.className = 'lust-drip';
        const width = 6 + Math.random() * 5;
        const length = 22 + Math.random() * 30;
        drip.style.width = `${width}px`;
        drip.style.height = `${length}px`;
        drip.style.left = `${x - width / 2}px`;
        drip.style.top = `${y}px`;
        this.splashLayer.appendChild(drip);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LustMinigame.init());
} else {
    LustMinigame.init();
}
