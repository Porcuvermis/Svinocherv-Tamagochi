// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ГНЕВА (БОЙ) =================

function drawWormFigure(canvas, opts, shake) {
    const w = canvas.clientWidth || 150;
    const h = canvas.clientHeight || 320;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    const { hue, segCount, thick, eyeMult, dir } = opts;

    ctx.clearRect(0, 0, w, h);

    const markers = {
        head: { x: 0, y: 0 },
        belly: { x: 0, y: 0 },
        tail: { x: 0, y: 0 }
    };

    // ---------- РАЗМЕР ФИГУРЫ: ВПИСЫВАЕМ, А НЕ ТЯНЕМ ОТ ВЫСОТЫ ----------
    // Раньше масштаб считался только от высоты холста (`h / 300 * 1.65`), а
    // фигура ставилась от `h * 0.25`. Это работало ровно для одной формы
    // окна — карточки 400×700, под которую подбиралось. Как только окно
    // мини-игры стало общим и во весь экран, холст стал выше и уже, и
    // головы полезли за края.
    //
    // Поэтому габарит фигуры описан в условных единицах, а масштаб — это
    // меньшее из «влезть по высоте» и «влезть по ширине». Числа
    // соответствуют отрисовке ниже: рог поднимается на 45 над центром
    // головы, цепь сегментов — 19 на сегмент, раструб хвоста — ещё ~22;
    // половина ширины — это голова (радиус 32) плюс запас на обводку.
    const FIG_TOP = 45;
    const FIG_BOTTOM = segCount * 19 + 22;
    const FIG_H = FIG_TOP + FIG_BOTTOM;
    const FIG_HALF_W = 36 * thick;

    const scale = Math.min(h / FIG_H, (w / 2) / FIG_HALF_W);

    // Вписанная фигура ниже холста — центрируем её по вертикали, иначе она
    // прижимается к верхнему краю и под ней остаётся пустота.
    const baseOriginY = (h - FIG_H * scale) / 2 + FIG_TOP * scale;

    const bellyIndex = Math.floor(segCount / 2);
    const tailIndex = segCount;

    const shk = shake || null;

    // 1. ОТРИСОВКА СЕГМЕНТОВ ТЕЛА И ХВОСТА
    for (let i = segCount; i > 0; i--) {
        const segY = baseOriginY + (i * 19 * scale);

        const wave = Math.sin(i * 0.65) - Math.sin(i * 0.15) * 0.4;
        const segX = (w / 2) + (wave * 8 * dir * thick * scale);

        const r = (20 - i * 1.1) * thick * scale;
        const finalR = Math.max(7 * scale, r);

        // Маркеры целей всегда берём БАЗОВЫЕ координаты (без тряски),
        // чтобы зоны-мишени не прыгали вместе с анимацией удара.
        if (i === bellyIndex) {
            markers.belly.x = segX;
            markers.belly.y = segY;
        }
        if (i === tailIndex) {
            markers.tail.x = segX;
            markers.tail.y = segY;
        }

        // Точечное смещение ТОЛЬКО для той зоны, что затронута ударом:
        // хвост — последний сегмент + сосед; живот — средний сегмент + 2 соседа.
        let drawX = segX, drawY = segY, segRot = 0;
        if (shk) {
            if (shk.zone === 'tail' && (i === tailIndex || i === tailIndex - 1)) {
                drawX += shk.dx;
                drawY += shk.dy;
                segRot = shk.rot;
            } else if (shk.zone === 'belly' && (i === bellyIndex || i === bellyIndex - 1 || i === bellyIndex + 1)) {
                drawX += shk.dx;
                drawY += shk.dy;
                segRot = shk.rot * 0.6;
            }
        }

        ctx.fillStyle = `hsl(${hue}, ${60 - i * 3}%, ${50 - i}%)`;
        ctx.strokeStyle = '#2a0a10';
        ctx.lineWidth = 2;

        if (i === segCount) {
            ctx.save();
            ctx.translate(drawX, drawY);
            ctx.rotate(0.25 * dir + segRot);

            ctx.beginPath();
            ctx.moveTo(-finalR, 0);
            ctx.bezierCurveTo(-finalR, finalR * 0.8, -finalR * 0.4, finalR * 1.6, 0, finalR * 1.6);
            ctx.bezierCurveTo(finalR * 0.4, finalR * 1.6, finalR, finalR * 0.8, finalR, 0);
            ctx.arc(0, 0, finalR, 0, Math.PI, true);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(drawX, drawY, finalR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    // 2. ОТРИСОВКА ГОЛОВЫ
    let headDx = 0, headDy = 0, headRot = 0;
    if (shk && shk.zone === 'head') {
        headDx = shk.dx;
        headDy = shk.dy;
        headRot = shk.rot;
    }

    ctx.save();
    ctx.translate(w / 2 + headDx, baseOriginY + headDy);
    ctx.rotate(0.12 * dir + headRot);

    markers.head.x = w / 2;
    markers.head.y = baseOriginY;

    ctx.beginPath();
    ctx.arc(0, 0, 32 * thick * scale, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 70%, 82%)`;
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 50%, 60%)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-18 * scale, -18 * scale); ctx.lineTo(-28 * scale, -42 * scale); ctx.lineTo(-4 * scale, -26 * scale);
    ctx.closePath(); ctx.fillStyle = `hsl(${hue}, 70%, 82%)`; ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(10 * scale, -24 * scale); ctx.lineTo(18 * scale, -45 * scale); ctx.lineTo(24 * scale, -14 * scale);
    ctx.closePath(); ctx.fillStyle = `hsl(${hue}, 65%, 78%)`; ctx.fill(); ctx.stroke();

    const eyeR = 7 * eyeMult * scale;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-12 * scale, -6 * scale, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14 * scale, -6 * scale, eyeR, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#000';
    const pupilLookOffset = 2.5 * scale * dir;
    ctx.beginPath(); ctx.arc((-12 * scale) + pupilLookOffset, -5 * scale, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc((14 * scale) + pupilLookOffset, -5 * scale, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#2a0a10';
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.moveTo(-21 * scale, -13 * scale); ctx.lineTo(-4 * scale, -8 * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6 * scale, -8 * scale); ctx.lineTo(23 * scale, -13 * scale); ctx.stroke();

    ctx.beginPath(); ctx.ellipse(0, 11 * scale, 13 * scale, 9 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 60%, 70%)`; ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 40%, 50%)`; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = `hsl(${hue}, 40%, 30%)`;
    ctx.beginPath(); ctx.arc(-4 * scale, 11 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.arc(4 * scale, 11 * scale, 2 * scale, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    return markers;
}

const WrathMinigame = {
    screenElement: null,
    win: null,        // хэндл общего окна: рамка, крестик, вопрос при выходе
    daggerBtn: null,
    daggerDefense: null,
    daggerAttack: null,
    playerCanvas: null,
    enemyCanvas: null,
    playerZones: [],
    enemyZones: [],
    playerOpts: null,
    enemyParams: null,
    playerShakeRaf: null,
    enemyShakeRaf: null,
    resultOverlay: null,
    overlayText: null,
    restartBtn: null,

    playerHP: 10,
    enemyHP: 10,
    maxHP: 10,
    chosenDefense: null,
    chosenAttack: null,
    isFighting: false,
    fightOver: false,
    endFightTimeoutId: null,

    init() {
        this.screenElement = document.getElementById('wrath-game');

        // Окно надевается ДО поиска остальных элементов: сборка переносит
        // содержимое экрана внутрь рамки, и делать это надо один раз, пока
        // на узлы ещё никто не смотрит.
        this.win = MinigameWindow.attach(this.screenElement, {
            sin: 'wrath',
            onLeave: () => this.close(),
            // Посреди боя выход спрашивается, после его конца — нет:
            // спрашивать «прогресс не сохранится» там, где прогресса уже
            // не осталось, значит приучать жать «выйти» не глядя.
            canLeave: () => this.fightOver
        });

        this.daggerBtn = document.getElementById('dagger-btn');
        this.daggerDefense = document.getElementById('dagger-defense');
        this.daggerAttack = document.getElementById('dagger-attack');
        this.playerCanvas = document.getElementById('player-canvas');
        this.enemyCanvas = document.getElementById('enemy-canvas');
        this.playerZones = Array.from(document.querySelectorAll('.worm-player .zone-hit'));
        this.enemyZones = Array.from(document.querySelectorAll('.worm-enemy .zone-hit'));
        this.resultOverlay = document.getElementById('wrath-result-overlay');
        this.overlayText = document.getElementById('wrath-overlay-text');
        this.restartBtn = document.getElementById('wrath-restart-btn');

        this.playerOpts = { hue: 340, segCount: 6, thick: 1, eyeMult: 1, dir: 1 };

        if (this.daggerBtn) {
            this.daggerBtn.onclick = (e) => { e.stopPropagation(); this.handleDaggerClick(); };
        }
        if (this.restartBtn) {
            this.restartBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.fightOver && this.playerHP > 0 && this.enemyHP <= 0) {
                    this.close();
                } else {
                    this.restartFight();
                }
            };
        }
        this.playerZones.forEach(z => {
            z.onclick = (e) => { e.stopPropagation(); this.selectDefense(z.dataset.zone, z); };
        });
        this.enemyZones.forEach(z => {
            z.onclick = (e) => { e.stopPropagation(); this.selectAttack(z.dataset.zone, z); };
        });

        window.addEventListener('resize', () => {
            if (this.screenElement && this.screenElement.classList.contains('active')) {
                this.drawFighters();
            }
        });
    },

    open() {
        if (!this.screenElement) this.init();
        if (this.win) this.win.hideConfirm();
        this.screenElement.classList.add('active');
        this.restartFight();
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        this.stopShake('player');
        this.stopShake('enemy');
        // Отменяем отложенный показ результата боя, если он ещё не
        // сработал, и на всякий случай принудительно прячем сам оверлей —
        // это гарантирует, что невидимый кликабельный слой не переживёт
        // закрытие мини-игры (см. комментарий у setTimeout в doRound).
        if (this.endFightTimeoutId) {
            clearTimeout(this.endFightTimeoutId);
            this.endFightTimeoutId = null;
        }
        if (this.resultOverlay) {
            this.resultOverlay.classList.remove('active', 'fade-out');
        }
        if (this.win) this.win.hideConfirm();
        MinigameWindow.restoreHud();
    },

    restartFight() {
        this.stopShake('player');
        this.stopShake('enemy');
        if (this.endFightTimeoutId) {
            clearTimeout(this.endFightTimeoutId);
            this.endFightTimeoutId = null;
        }
        this.generateEnemy();
        this.playerHP = this.maxHP;
        this.enemyHP = this.maxHP;
        this.isFighting = false;
        this.fightOver = false;
        this.resetSelections();

        if (this.restartBtn) this.restartBtn.textContent = 'Начать заново';
        this.updateHPBars();
        this.setResult('');

        if (this.resultOverlay) {
            this.resultOverlay.classList.remove('active', 'fade-out');
        }
        if (this.daggerBtn) {
            this.daggerBtn.classList.remove('disabled');
        }
        this.drawFighters();
    },

    generateEnemy() {
        this.enemyParams = {
            hue: Math.floor(Math.random() * 360),
            segCount: 6,
            thick: 1.0,
            eyeMult: 1.0,
            dir: -1
        };
    },

    drawFighters() {
        const playerMarkers = drawWormFigure(this.playerCanvas, this.playerOpts, null);
        const enemyMarkers = drawWormFigure(this.enemyCanvas, this.enemyParams, null);

        this.repositionZones(this.playerZones, playerMarkers);
        this.repositionZones(this.enemyZones, enemyMarkers);
    },

    repositionZones(zonesArray, markers) {
        zonesArray.forEach(zoneEl => {
            const zoneName = zoneEl.dataset.zone;
            if (markers && markers[zoneName]) {
                zoneEl.style.left = `${markers[zoneName].x}px`;
                zoneEl.style.top = `${markers[zoneName].y}px`;
            }
        });
    },

    selectDefense(zone, el) {
        if (this.fightOver || this.isFighting) return;
        this.chosenDefense = zone;
        this.playerZones.forEach(z => z.classList.remove('selected'));
        el.classList.add('selected');
        this.daggerDefense.classList.add('filled');
    },

    selectAttack(zone, el) {
        if (this.fightOver || this.isFighting) return;
        this.chosenAttack = zone;
        this.enemyZones.forEach(z => z.classList.remove('selected'));
        el.classList.add('selected');
        this.daggerAttack.classList.add('filled');
    },

    randomZone() {
        const zones = ['head', 'belly', 'tail'];
        return zones[Math.floor(Math.random() * 3)];
    },

    handleDaggerClick() {
        if (this.fightOver || this.isFighting) return;

        if (this.chosenDefense === null) {
            const zone = this.randomZone();
            const el = this.playerZones.find(z => z.dataset.zone === zone);
            this.selectDefense(zone, el);
            return;
        }
        if (this.chosenAttack === null) {
            const zone = this.randomZone();
            const el = this.enemyZones.find(z => z.dataset.zone === zone);
            this.selectAttack(zone, el);
            return;
        }
        this.doRound();
    },

    doRound() {
        if (this.isFighting) return;
        this.isFighting = true;

        const playerAttack = this.chosenAttack;
        const playerDefense = this.chosenDefense;
        const enemyAttack = this.randomZone();
        const enemyDefense = this.randomZone();

        if (playerAttack !== enemyDefense) {
            const dmg = 1 + Math.floor(Math.random() * 3);
            this.enemyHP = Math.max(0, this.enemyHP - dmg);
            this.showDamage('enemy', dmg);
            this.triggerImpact('enemy', playerAttack, 'hit');
        } else {
            this.triggerImpact('enemy', playerAttack, 'block');
        }

        if (enemyAttack !== playerDefense) {
            const dmg = 1 + Math.floor(Math.random() * 3);
            this.playerHP = Math.max(0, this.playerHP - dmg);
            this.showDamage('player', dmg);
            this.triggerImpact('player', enemyAttack, 'hit');
        } else {
            this.triggerImpact('player', enemyAttack, 'block');
        }

        this.updateHPBars();

        if (this.enemyHP <= 0 || this.playerHP <= 0) {
            // ВАЖНО: id таймера сохраняем, чтобы close() мог его отменить.
            // Раньше, если игрок закрывал мини-игру в эти 700мс (после
            // добивающего удара, но до показа результата), этот таймер
            // всё равно срабатывал позже и вешал .active на
            // .wrath-result-overlay — НЕВИДИМЫЙ (родитель #wrath-game
            // скрыт) слой на весь модал (94vw×86vh), который из-за
            // pointer-events:auto перехватывал клики по другим кнопкам
            // экрана (в т.ч. по кнопкам других мини-игр в меню грехов).
            this.endFightTimeoutId = setTimeout(() => {
                this.endFightTimeoutId = null;
                this.endFight();
            }, 700);
        } else {
            this.isFighting = false;
            this.resetSelections();
        }
    },

    // ---------- ЭФФЕКТЫ ПОПАДАНИЯ / БЛОКА ----------
    getZoneElement(side, zone) {
        const arr = side === 'player' ? this.playerZones : this.enemyZones;
        return arr.find(z => z.dataset.zone === zone);
    },

    triggerImpact(side, zone, type) {
        const zoneEl = this.getZoneElement(side, zone);
        if (!zoneEl) return;
        const canvasBox = zoneEl.closest('.canvas-box');
        if (!canvasBox) return;

        const x = zoneEl.style.left;
        const y = zoneEl.style.top;

        if (type === 'hit') {
            // Трясётся ТОЛЬКО задетая часть тела, никакого блока при этом нет.
            this.runShake(side, zone);
            this.spawnFlash(canvasBox, x, y);
        } else {
            // Блок — тряски нет вообще, только щит и отскок искры.
            this.spawnShield(canvasBox, x, y, side);
        }
    },

    // Покадровая тряска конкретного сегмента тела через переотрисовку canvas
    runShake(side, zone) {
        const canvas = side === 'player' ? this.playerCanvas : this.enemyCanvas;
        const opts = side === 'player' ? this.playerOpts : this.enemyParams;
        const rafKey = side === 'player' ? 'playerShakeRaf' : 'enemyShakeRaf';

        if (this[rafKey]) cancelAnimationFrame(this[rafKey]);

        const duration = zone === 'tail' ? 620 : zone === 'head' ? 440 : 500;
        const ampPx = zone === 'tail' ? 24 : zone === 'head' ? 14 : 19;
        const freq = zone === 'tail' ? 15 : zone === 'head' ? 28 : 21;
        const start = performance.now();

        const step = (now) => {
            const elapsed = now - start;
            const t = Math.min(1, elapsed / duration);
            const decay = 1 - t;
            const dx = Math.sin(elapsed * 0.001 * freq) * ampPx * decay;
            const dy = Math.cos(elapsed * 0.001 * freq * 0.7) * ampPx * 0.35 * decay;
            const rot = Math.sin(elapsed * 0.001 * freq) * 0.2 * decay * (zone === 'tail' ? 1.7 : 1);

            drawWormFigure(canvas, opts, { zone, dx, dy, rot });

            if (t < 1) {
                this[rafKey] = requestAnimationFrame(step);
            } else {
                drawWormFigure(canvas, opts, null);
                this[rafKey] = null;
            }
        };
        this[rafKey] = requestAnimationFrame(step);
    },

    stopShake(side) {
        const rafKey = side === 'player' ? 'playerShakeRaf' : 'enemyShakeRaf';
        if (this[rafKey]) {
            cancelAnimationFrame(this[rafKey]);
            this[rafKey] = null;
        }
    },

    spawnFlash(canvasBox, x, y) {
        const flash = document.createElement('div');
        flash.className = 'zone-flash';
        flash.style.left = x;
        flash.style.top = y;
        canvasBox.appendChild(flash);
        setTimeout(() => flash.remove(), 780);

        // Лучи-разлёт вокруг точки удара — «комиксовый» POW-эффект
        const rayCount = 8;
        for (let i = 0; i < rayCount; i++) {
            const ray = document.createElement('div');
            ray.className = 'impact-ray';
            ray.style.left = x;
            ray.style.top = y;
            ray.style.setProperty('--ray-rot', `${(360 / rayCount) * i + (Math.random() * 12 - 6)}deg`);
            canvasBox.appendChild(ray);
            setTimeout(() => ray.remove(), 560);
        }
    },

    spawnShield(canvasBox, x, y, side) {
        const shield = document.createElement('div');
        shield.className = 'zone-shield';
        shield.style.left = x;
        shield.style.top = y;
        shield.innerHTML = `<svg viewBox="0 0 64 64" width="100%" height="100%">
            <path d="M32 2 L58 12 L58 30 C58 46 46 58 32 62 C18 58 6 46 6 30 L6 12 Z"
                  fill="rgba(90,210,255,0.4)" stroke="#8fe9ff" stroke-width="4"/>
        </svg>`;
        canvasBox.appendChild(shield);
        setTimeout(() => shield.remove(), 760);

        const ring = document.createElement('div');
        ring.className = 'shield-ring';
        ring.style.left = x;
        ring.style.top = y;
        canvasBox.appendChild(ring);
        setTimeout(() => ring.remove(), 600);

        const dirSign = side === 'player' ? -1 : 1;
        const sparkAngles = [-16, 0, 16];
        sparkAngles.forEach(angleDeg => {
            const spark = document.createElement('div');
            spark.className = 'deflect-spark';
            spark.style.left = x;
            spark.style.top = y;
            const dist = 95 + Math.random() * 45;
            const angleRad = (angleDeg * Math.PI) / 180;
            const tx = dirSign * dist * Math.cos(angleRad);
            const ty = dist * Math.sin(angleRad) * 0.6;
            spark.style.setProperty('--tx', `${tx}px`);
            spark.style.setProperty('--ty', `${ty}px`);
            spark.style.setProperty('--rot', `${dirSign * (angleDeg + 90)}deg`);
            canvasBox.appendChild(spark);
            setTimeout(() => spark.remove(), 620);
        });
    },

    resetSelections() {
        this.chosenDefense = null;
        this.chosenAttack = null;
        this.playerZones.forEach(z => z.classList.remove('selected'));
        this.enemyZones.forEach(z => z.classList.remove('selected'));
        if (this.daggerDefense) this.daggerDefense.classList.remove('filled');
        if (this.daggerAttack) this.daggerAttack.classList.remove('filled');
    },

    endFight() {
        this.fightOver = true;
        if (this.daggerBtn) this.daggerBtn.classList.add('disabled');

        if (this.playerHP <= 0 && this.enemyHP <= 0) {
            this.setResult('НИЧЬЯ');
            if (this.overlayText) {
                this.overlayText.textContent = 'НИЧЬЯ';
                this.overlayText.style.color = '#ffd700';
                this.overlayText.style.textShadow = '0 0 15px rgba(255, 215, 0, 0.6)';
            }
            if (this.restartBtn) this.restartBtn.style.display = 'block';
            if (this.resultOverlay) {
                this.resultOverlay.classList.remove('fade-out');
                this.resultOverlay.classList.add('active');
            }
            // Ничья. Сколько это стоит — написано в конфиге наград, а не
            // здесь: в плане у гнева три исхода с разной ценой, и крутить их
            // придётся ещё не раз.
            GameEvents.emit('minigame:result', { sin: 'wrath', mode: 'duel', outcome: 'draw' });
        } else if (this.enemyHP <= 0 && this.playerHP > 0) {
            this.setResult('ПОБЕДА! 🤬');
            if (this.overlayText) {
                this.overlayText.textContent = 'ПОБЕДА!';
                this.overlayText.style.color = '#4CAF50';
                this.overlayText.style.textShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
            }
            if (this.restartBtn) {
                this.restartBtn.textContent = 'заебись';
                this.restartBtn.style.display = 'block';
            }
            if (this.resultOverlay) {
                this.resultOverlay.classList.remove('fade-out');
                this.resultOverlay.classList.add('active');
            }
            GameEvents.emit('minigame:result', { sin: 'wrath', mode: 'duel', outcome: 'win' });
        } else {
            this.setResult('ПОРАЖЕНИЕ...');
            if (this.overlayText) {
                this.overlayText.textContent = 'ПОРАЖЕНИЕ...';
                this.overlayText.style.color = '#ff3b30';
                this.overlayText.style.textShadow = '0 0 15px rgba(255, 59, 48, 0.6)';
            }
            if (this.restartBtn) this.restartBtn.style.display = 'block';
            if (this.resultOverlay) {
                this.resultOverlay.classList.remove('fade-out');
                this.resultOverlay.classList.add('active');
            }
            GameEvents.emit('minigame:result', { sin: 'wrath', mode: 'duel', outcome: 'lose' });
        }
        this.isFighting = false;
    },

    updateHPBars() {
        const pBar = document.getElementById('player-hp-bar');
        const eBar = document.getElementById('enemy-hp-bar');
        if (pBar) pBar.style.width = `${(this.playerHP / this.maxHP) * 100}%`;
        if (eBar) eBar.style.width = `${(this.enemyHP / this.maxHP) * 100}%`;
    },

    showDamage(who, amount) {
        const popupId = who === 'player' ? 'player-dmg-popup' : 'enemy-dmg-popup';
        const popup = document.getElementById(popupId);
        if (!popup) return;
        popup.textContent = `-${amount}`;
        popup.classList.remove('show');
        void popup.offsetWidth;
        popup.classList.add('show');
    },

    setResult(text) {
        const el = document.getElementById('wrath-result');
        if (el) el.textContent = text;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WrathMinigame.init());
} else {
    WrathMinigame.init();
}
