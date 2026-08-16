// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ЗАВИСТИ (ЛУЧ В ТЕМНОТЕ) =================
// Кор-механика (без озвучки, без финального арта — плейсхолдеры ⭐ / 💀).
//
// Идея: экран полностью чёрный. Пока палец удерживается на экране — виден
// небольшой луч (маска, расчищающая тьму). Если техническая точка луча
// соприкасается с технической точкой образа — начинается 3-секундный цикл
// подсветки. На 1-й секунде — цветовая пульсация-подсказка (зелёная для ⭐,
// красная для 💀). Довёл до 3 сек — результат: ⭐ = +1/3 шкалы, 💀 = -1/3.
// Отпустил/увёл луч раньше — прогресс сбрасывается.

const ENVY_CONFIG = {
    MIN_LIGHT_R: 55,          // радиус ядра луча в покое (px)
    MAX_LIGHT_R: 125,         // радиус ядра на пике удержания (перед взрывом)
    HALO_MULT: 1.85,          // ореол = ядро * HALO_MULT
    HOLD_MS: 3000,            // сколько держать коллизию до результата
    PULSE_AT_MS: 1000,        // момент цветовой пульсации-подсказки
    LIGHT_HIT_R: 26,          // невидимый радиус-допуск луча (техническая точка)
    OBJECT_HIT_R: 46,         // невидимый радиус-допуск образа (чуть больше спрайта)
    SPRITE_BASE_SIZE: 44,     // базовый размер спрайта, px
    SPRITE_GROW_MULT: 1.35,   // во сколько раз спрайт растёт к 3 сек
    RESET_TWEEN_MS: 180,      // скорость плавного сброса луча при уводе с образа
    WIN_EXPLODE_MS: 700,      // длительность вспышки на финальную победу
    MIN_DIST_BETWEEN: 100,    // мин. расстояние между образами при генерации
    EDGE_MARGIN: 70,          // отступ образов от краёв игрового поля
    PULSE_DURATION_MS: 550,   // длительность кольца-индикатора
    FLASH_DURATION_MS: 320,   // длительность красной вспышки-штрафа
};

const EnvyMinigame = {
    screenElement: null,
    closeBtn: null,
    canvas: null,
    ctx: null,
    gaugeBar: null,
    winOverlay: null,
    confirmOverlay: null,
    confirmStayBtn: null,
    confirmLeaveBtn: null,

    rafId: null,
    lastTs: null,

    pointerDown: false,
    pointerX: 0,
    pointerY: 0,

    objects: [],        // текущие образы на поле
    pulses: [],          // активные кольца-индикаторы
    particles: [],        // частицы энергии/штрафа
    flashAlpha: 0,        // альфа красной вспышки-штрафа

    fillThirds: 0,        // сколько третей шкалы заполнено (0..3, 3 = победа)
    hasWon: false,
    winProgress: 0,        // 0..1, прогресс финальной вспышки-победы
    isWinning: false,

    init() {
        this.screenElement = document.getElementById('envy-game');
        this.closeBtn = document.getElementById('envy-close-btn');
        this.canvas = document.getElementById('envy-canvas');
        this.gaugeBar = document.getElementById('envy-gauge-bar');
        this.winOverlay = document.getElementById('envy-win-overlay');
        this.confirmOverlay = document.getElementById('envy-confirm-overlay');
        this.confirmStayBtn = document.getElementById('envy-confirm-stay');
        this.confirmLeaveBtn = document.getElementById('envy-confirm-leave');

        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.hasWon) {
                    this.close();
                } else {
                    this.showConfirm();
                }
            };
        }

        if (this.confirmStayBtn) {
            this.confirmStayBtn.onclick = (e) => {
                e.stopPropagation();
                this.hideConfirm();
            };
        }

        if (this.confirmLeaveBtn) {
            this.confirmLeaveBtn.onclick = (e) => {
                e.stopPropagation();
                this.close();
            };
        }

        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        window.addEventListener('pointerup', (e) => this.onPointerUp(e));
        window.addEventListener('pointercancel', (e) => this.onPointerUp(e));

        window.addEventListener('resize', () => {
            if (this.screenElement && this.screenElement.classList.contains('active')) {
                this.resizeCanvas();
                this.regenerateField();
            }
        });
    },

    open() {
        if (!this.canvas) this.init();
        if (!this.canvas) return;

        this.screenElement.classList.add('active');
        this.resizeCanvas();

        this.fillThirds = 0;
        this.hasWon = false;
        this.isWinning = false;
        this.winProgress = 0;
        this.pointerDown = false;
        this.pulses = [];
        this.particles = [];
        this.flashAlpha = 0;

        this.updateGauge();
        this.hideConfirm();
        if (this.winOverlay) {
            this.winOverlay.classList.remove('show', 'fade-out');
        }

        this.regenerateField();

        this.lastTs = null;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame((ts) => this.loop(ts));
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.pointerDown = false;
        this.hideConfirm();

        if (typeof GameManager !== 'undefined' && typeof GameManager.updateUI === 'function') {
            const fullMenu = document.getElementById('full-menu');
            const miniHud = document.getElementById('mini-hud');
            if (fullMenu && !fullMenu.classList.contains('active') && miniHud) {
                miniHud.style.opacity = '1';
                miniHud.style.pointerEvents = 'auto';
            }
        }
    },

    showConfirm() {
        this.pointerDown = false;
        if (this.confirmOverlay) this.confirmOverlay.classList.add('show');
    },

    hideConfirm() {
        if (this.confirmOverlay) this.confirmOverlay.classList.remove('show');
    },

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    },

    // ---------- ГЕНЕРАЦИЯ ПОЛЯ ----------
    // Кол-во "неправильных" образов растёт вместе с заполненной шкалой:
    // 0 третей -> 3 черепа, 1 треть -> 4 черепа, 2 трети -> 5 черепов.
    // Правильный образ (звезда) всегда один.
    regenerateField() {
        const skullCount = 3 + Math.min(2, this.fillThirds);
        const total = skullCount + 1;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const margin = ENVY_CONFIG.EDGE_MARGIN;

        const points = [];
        let minDist = ENVY_CONFIG.MIN_DIST_BETWEEN;

        for (let i = 0; i < total; i++) {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 250) {
                attempts++;
                const x = margin + Math.random() * Math.max(1, w - margin * 2);
                const y = margin + Math.random() * Math.max(1, h - margin * 2);
                const ok = points.every(p => Math.hypot(p.x - x, p.y - y) >= minDist);
                if (ok) {
                    points.push({ x, y });
                    placed = true;
                }
            }
            if (!placed) {
                // Не удалось разместить с текущим отступом — ослабляем требование
                // и пробуем ещё раз, чтобы не зависнуть на маленьких экранах.
                minDist *= 0.85;
                i--;
            }
        }

        this.objects = points.map((p, idx) => ({
            id: `obj_${Date.now()}_${idx}`,
            type: idx === 0 ? 'star' : 'skull',
            baseX: p.x,
            baseY: p.y,
            x: p.x,
            y: p.y,
            driftPhase: Math.random() * Math.PI * 2,
            heldMs: 0,
            visualProgress: 0,
            pulseTriggered: false,
            resolved: false,
        }));

        // Перемешиваем порядок отрисовки/массива, чтобы звезда не была
        // всегда первым элементом визуально (на детект это не влияет).
        for (let i = this.objects.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.objects[i], this.objects[j]] = [this.objects[j], this.objects[i]];
        }
    },

    updateGauge() {
        const pct = Math.min(100, (this.fillThirds / 3) * 100);
        if (this.gaugeBar) this.gaugeBar.style.width = `${pct}%`;
    },

    // ---------- УКАЗАТЕЛЬ (ПАЛЕЦ) ----------
    getLocalPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },

    onPointerDown(e) {
        if (this.isWinning || (this.confirmOverlay && this.confirmOverlay.classList.contains('show'))) return;
        e.preventDefault();
        const pos = this.getLocalPos(e);
        this.pointerDown = true;
        this.pointerX = pos.x;
        this.pointerY = pos.y;
    },

    onPointerMove(e) {
        if (!this.pointerDown) return;
        e.preventDefault();
        const pos = this.getLocalPos(e);
        this.pointerX = pos.x;
        this.pointerY = pos.y;
    },

    onPointerUp() {
        if (!this.pointerDown) return;
        this.pointerDown = false;
        // Палец убран — луч гаснет мгновенно, доигрывать прогресс некому.
        this.objects.forEach(o => {
            o.heldMs = 0;
            o.visualProgress = 0;
            o.pulseTriggered = false;
        });
    },

    // ---------- ИГРОВОЙ ЦИКЛ ----------
    loop(ts) {
        if (!this.lastTs) this.lastTs = ts;
        const dt = Math.min(48, ts - this.lastTs); // защита от скачков таба
        this.lastTs = ts;

        if (this.isWinning) {
            this.updateWinSequence(dt);
        } else {
            this.updateObjects(dt, ts);
        }

        this.updatePulses(dt);
        this.updateParticles(dt);
        if (this.flashAlpha > 0) {
            this.flashAlpha = Math.max(0, this.flashAlpha - dt / ENVY_CONFIG.FLASH_DURATION_MS);
        }

        this.render(ts);

        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    updateObjects(dt, ts) {
        if (!this.pointerDown) {
            // Луч не активен — держим всё в нулевом состоянии.
            this.objects.forEach(o => {
                o.heldMs = 0;
                o.visualProgress = 0;
                o.pulseTriggered = false;
            });
            return;
        }

        const hitSum = ENVY_CONFIG.LIGHT_HIT_R + ENVY_CONFIG.OBJECT_HIT_R;

        for (const obj of this.objects) {
            if (obj.resolved) continue;

            // Дрейф — только для визуала, детект всегда идёт от baseX/baseY.
            obj.x = obj.baseX + Math.sin(ts / 700 + obj.driftPhase) * 4;
            obj.y = obj.baseY + Math.cos(ts / 900 + obj.driftPhase * 1.3) * 4;

            const dist = Math.hypot(this.pointerX - obj.baseX, this.pointerY - obj.baseY);
            const colliding = dist <= hitSum;

            if (colliding) {
                obj.heldMs += dt;
                obj.visualProgress = Math.min(1, obj.heldMs / ENVY_CONFIG.HOLD_MS);

                if (!obj.pulseTriggered && obj.heldMs >= ENVY_CONFIG.PULSE_AT_MS) {
                    obj.pulseTriggered = true;
                    this.pulses.push({
                        x: obj.x, y: obj.y, age: 0,
                        color: obj.type === 'star' ? '#3ddc73' : '#ff3b30',
                    });
                }

                if (obj.heldMs >= ENVY_CONFIG.HOLD_MS) {
                    obj.resolved = true;
                    this.resolveObject(obj);
                    break; // поле сейчас перегенерируется — дальше по старому массиву не идём
                }
            } else {
                obj.heldMs = 0;
                obj.pulseTriggered = false;
                const decay = dt / ENVY_CONFIG.RESET_TWEEN_MS;
                obj.visualProgress = Math.max(0, obj.visualProgress - decay);
            }
        }
    },

    resolveObject(winnerObj) {
        if (winnerObj.type === 'star') {
            this.fillThirds = Math.min(3, this.fillThirds + 1);
            this.updateGauge();
            this.spawnEnergyBurst(winnerObj.x, winnerObj.y);

            if (this.fillThirds >= 3) {
                this.startWinSequence();
                return;
            }
        } else {
            if (this.fillThirds > 0) {
                this.fillThirds -= 1;
                this.updateGauge();
            }
            this.flashAlpha = 1;
        }

        this.pointerDown = false;
        this.pulses = [];
        this.regenerateField();
    },

    // ---------- ПОБЕДА ----------
    startWinSequence() {
        this.isWinning = true;
        this.winProgress = 0;
        this.pointerDown = false;

        if (typeof GameManager !== 'undefined') {
            GameManager.sins.envy.value = 100;
            GameManager.updateUI();
        }
    },

    updateWinSequence(dt) {
        this.winProgress = Math.min(1, this.winProgress + dt / ENVY_CONFIG.WIN_EXPLODE_MS);
        if (this.winProgress >= 1 && !this.hasWon) {
            this.hasWon = true;
            if (this.winOverlay) this.winOverlay.classList.add('show');
        }
    },

    // ---------- ЧАСТИЦЫ / ЭФФЕКТЫ ----------
    spawnEnergyBurst(x, y) {
        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 120;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                age: 0,
                life: 500 + Math.random() * 250,
                color: '#3ddc73',
            });
        }
    },

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += dt;
            const t = p.age / p.life;
            if (t >= 1) {
                this.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * (dt / 1000);
            p.y += p.vy * (dt / 1000);
            p.vy += 90 * (dt / 1000); // лёгкая гравитация
        }
    },

    updatePulses(dt) {
        for (let i = this.pulses.length - 1; i >= 0; i--) {
            this.pulses[i].age += dt;
            if (this.pulses[i].age >= ENVY_CONFIG.PULSE_DURATION_MS) {
                this.pulses.splice(i, 1);
            }
        }
    },

    // ---------- ОТРИСОВКА ----------
    render(ts) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        if (this.isWinning) {
            this.renderWin(ctx, w, h);
            return;
        }

        // 1. Чёрный фон
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        if (this.pointerDown) {
            // 2. Спрайты образов (пока не замаскированы тьмой)
            this.objects.forEach(obj => {
                if (obj.resolved) return;
                this.drawSprite(ctx, obj);
            });

            // 3. Перекрытие тьмой всего, кроме круга вокруг луча (мягкий край)
            const activeProgress = Math.max(0, ...this.objects.map(o => o.visualProgress), 0);
            const coreR = ENVY_CONFIG.MIN_LIGHT_R + (ENVY_CONFIG.MAX_LIGHT_R - ENVY_CONFIG.MIN_LIGHT_R) * activeProgress;
            const haloR = coreR * ENVY_CONFIG.HALO_MULT;

            const darkness = ctx.createRadialGradient(
                this.pointerX, this.pointerY, 0,
                this.pointerX, this.pointerY, haloR
            );
            darkness.addColorStop(0, 'rgba(0,0,0,0)');
            darkness.addColorStop(Math.min(0.55, coreR / haloR), 'rgba(0,0,0,0.05)');
            darkness.addColorStop(1, 'rgba(0,0,0,1)');
            ctx.fillStyle = darkness;
            ctx.fillRect(0, 0, w, h);

            // 4. Сам видимый луч (белое ядро + мягкий ореол), аддитивный блик
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const glow = ctx.createRadialGradient(
                this.pointerX, this.pointerY, 0,
                this.pointerX, this.pointerY, haloR
            );
            glow.addColorStop(0, 'rgba(255,255,255,0.95)');
            glow.addColorStop(coreR / haloR, 'rgba(255,255,255,0.55)');
            glow.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(this.pointerX, this.pointerY, haloR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 5. Кольца-индикаторы (пульсация)
        this.pulses.forEach(p => this.drawPulse(ctx, p));

        // 6. Частицы энергии/штрафа
        this.particles.forEach(p => this.drawParticle(ctx, p));

        // 7. Красная вспышка-штраф поверх всего
        if (this.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255,30,30,${0.35 * this.flashAlpha})`;
            ctx.fillRect(0, 0, w, h);
        }
    },

    drawSprite(ctx, obj) {
        const scale = 1 + obj.visualProgress * (ENVY_CONFIG.SPRITE_GROW_MULT - 1);
        const size = ENVY_CONFIG.SPRITE_BASE_SIZE * scale;
        const alpha = 0.82 + obj.visualProgress * 0.18;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Лёгкое цветное свечение под образом, усиливается по мере удержания
        if (obj.visualProgress > 0.02) {
            const glowColor = obj.type === 'star' ? '61,220,115' : '255,59,48';
            const glow = ctx.createRadialGradient(obj.x, obj.y, 0, obj.x, obj.y, size * 1.4);
            glow.addColorStop(0, `rgba(${glowColor},${0.5 * obj.visualProgress})`);
            glow.addColorStop(1, `rgba(${glowColor},0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(obj.x, obj.y, size * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.font = `${size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.type === 'star' ? '⭐' : '💀', obj.x, obj.y);
        ctx.restore();
    },

    drawPulse(ctx, p) {
        const t = p.age / ENVY_CONFIG.PULSE_DURATION_MS;
        const outerR = 78;
        const innerR = 8;
        const r = outerR - (outerR - innerR) * t;
        const alpha = 1 - t;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    },

    drawParticle(ctx, p) {
        const t = p.age / p.life;
        const alpha = 1 - t;
        const r = 4 * (1 - t * 0.5);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    renderWin(ctx, w, h) {
        // Луч, взрывающийся на весь экран, заливая его белым.
        const maxR = Math.hypot(w, h);
        const r = ENVY_CONFIG.MAX_LIGHT_R + (maxR - ENVY_CONFIG.MAX_LIGHT_R) * this.winProgress;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        const glow = ctx.createRadialGradient(
            this.pointerX, this.pointerY, 0,
            this.pointerX, this.pointerY, r
        );
        glow.addColorStop(0, `rgba(255,255,255,${0.98})`);
        glow.addColorStop(1, `rgba(255,255,255,${this.winProgress})`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(this.pointerX, this.pointerY, r, 0, Math.PI * 2);
        ctx.fill();

        if (this.winProgress >= 1) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
        }
    },
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EnvyMinigame.init());
} else {
    EnvyMinigame.init();
}
