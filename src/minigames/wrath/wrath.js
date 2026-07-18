// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ГНЕВА (БОЙ) =================

function drawWormFigure(canvas, opts) {
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

    const baseOriginY = h * 0.25;
    const scale = (h / 300) * 1.65;

    const bellyIndex = Math.floor(segCount / 2);
    const tailIndex = segCount;

    // 1. ОТРИСОВКА СЕГМЕНТОВ ТЕЛА И ХВОСТА
    for (let i = segCount; i > 0; i--) {
        const segY = baseOriginY + (i * 19 * scale);
        
        // Сложная S-образная траектория: основная дуга + обратный изгиб на хвосте
        // Множитель (i * 0.5) заставляет хвост в самом низу уходить обратно к краю
        const wave = Math.sin(i * 0.65) - Math.sin(i * 0.15) * 0.4;
        const segX = (w / 2) - (wave * 8 * dir * thick * scale);
        
        const r = (20 - i * 1.1) * thick * scale;
        const finalR = Math.max(7 * scale, r);

        // Сохраняем маркеры целей
        if (i === bellyIndex) {
            markers.belly.x = segX;
            markers.belly.y = segY;
        }
        if (i === tailIndex) {
            markers.tail.x = segX;
            markers.tail.y = segY;
        }

        ctx.fillStyle = `hsl(${hue}, ${60 - i * 3}%, ${50 - i}%)`;
        ctx.strokeStyle = '#2a0a10';
        ctx.lineWidth = 2;

        // Если это САМЫЙ последний сегмент (кончик хвоста) — делаем его вытянутым конусом
        if (i === segCount) {
            ctx.save();
            ctx.translate(segX, segY);
            // Слегка поворачиваем кончик в сторону от центра (в зависимости от dir)
            ctx.rotate(-0.25 * dir);

            ctx.beginPath();
            // Начинаем с левого бока сегмента
            ctx.moveTo(-finalR, 0);
            
            // Левая сторона конуса идет вниз к вытянутой точке
            // Точка смещена вниз на finalR * 1.6, создавая удлинение
            ctx.bezierCurveTo(-finalR, finalR * 0.8, -finalR * 0.4, finalR * 1.6, 0, finalR * 1.6);
            
            // Правая сторона конуса возвращается наверх к правому боку
            ctx.bezierCurveTo(finalR * 0.4, finalR * 1.6, finalR, finalR * 0.8, finalR, 0);
            
            // Закругляем верхушку, чтобы она плавно входила в предыдущий сегмент
            ctx.arc(0, 0, finalR, 0, Math.PI, true);
            
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else {
            // Обычные круглые сегменты тела
            ctx.beginPath();
            ctx.arc(segX, segY, finalR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    // 2. ОТРИСОВКА ГОЛОВЫ
    ctx.save();
    ctx.translate(w / 2, baseOriginY);
    ctx.rotate(0.12 * dir);

    markers.head.x = w / 2;
    markers.head.y = baseOriginY;

    ctx.beginPath();
    ctx.arc(0, 0, 32 * thick * scale, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 70%, 82%)`;
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 50%, 60%)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Левое ухо
    ctx.beginPath();
    ctx.moveTo(-18 * scale, -18 * scale); ctx.lineTo(-28 * scale, -42 * scale); ctx.lineTo(-4 * scale, -26 * scale);
    ctx.closePath(); ctx.fillStyle = `hsl(${hue}, 70%, 82%)`; ctx.fill(); ctx.stroke();

    // Правое ухо
    ctx.beginPath();
    ctx.moveTo(10 * scale, -24 * scale); ctx.lineTo(18 * scale, -45 * scale); ctx.lineTo(24 * scale, -14 * scale);
    ctx.closePath(); ctx.fillStyle = `hsl(${hue}, 65%, 78%)`; ctx.fill(); ctx.stroke();

    // Глаза
    const eyeR = 7 * eyeMult * scale;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-12 * scale, -6 * scale, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14 * scale, -6 * scale, eyeR, 0, Math.PI * 2); ctx.fill();

    // Зрачки
    ctx.fillStyle = '#000';
    const pupilLookOffset = 2.5 * scale * dir;
    ctx.beginPath(); ctx.arc((-12 * scale) + pupilLookOffset, -5 * scale, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc((14 * scale) + pupilLookOffset, -5 * scale, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();

    // Брови
    ctx.strokeStyle = '#2a0a10';
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.moveTo(-21 * scale, -13 * scale); ctx.lineTo(-4 * scale, -8 * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6 * scale, -8 * scale); ctx.lineTo(23 * scale, -13 * scale); ctx.stroke();

    // Пятачок
    ctx.beginPath(); ctx.ellipse(0, 11 * scale, 13 * scale, 9 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 60%, 70%)`; ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 40%, 50%)`; ctx.lineWidth = 2; ctx.stroke();

    // Ноздри
    ctx.fillStyle = `hsl(${hue}, 40%, 30%)`;
    ctx.beginPath(); ctx.arc(-4 * scale, 11 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.arc(4 * scale, 11 * scale, 2 * scale, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    return markers;
}

const WrathMinigame = {
    screenElement: null,
    closeBtn: null,
    daggerBtn: null,
    daggerDefense: null,
    daggerAttack: null,
    playerCanvas: null,
    enemyCanvas: null,
    playerZones: [],
    enemyZones: [],
    enemyParams: null,
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

    init() {
        this.screenElement = document.getElementById('wrath-game');
        this.closeBtn = document.getElementById('wrath-close-btn');
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

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }
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
        this.screenElement.classList.add('active');
        this.restartFight();
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        if (typeof GameManager !== 'undefined' && typeof GameManager.updateUI === 'function') {
            const fullMenu = document.getElementById('full-menu');
            const miniHud = document.getElementById('mini-hud');
            if (fullMenu && !fullMenu.classList.contains('active') && miniHud) {
                miniHud.style.opacity = '1';
                miniHud.style.pointerEvents = 'auto';
            }
        }
    },

    restartFight() {
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
        const playerMarkers = drawWormFigure(this.playerCanvas, { hue: 340, segCount: 6, thick: 1, eyeMult: 1, dir: 1 });
        const enemyMarkers = drawWormFigure(this.enemyCanvas, this.enemyParams);

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
        }

        if (enemyAttack !== playerDefense) {
            const dmg = 1 + Math.floor(Math.random() * 3);
            this.playerHP = Math.max(0, this.playerHP - dmg);
            this.showDamage('player', dmg);
        }

        this.updateHPBars();

        if (this.enemyHP <= 0 || this.playerHP <= 0) {
            setTimeout(() => this.endFight(), 700);
        } else {
            this.isFighting = false;
            this.resetSelections();
        }
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
            if (typeof GameManager !== 'undefined') {
                GameManager.sins.wrath.value = Math.min(100, GameManager.sins.wrath.value + 10);
                GameManager.updateUI();
            }
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
            if (typeof GameManager !== 'undefined') {
                GameManager.sins.wrath.value = 100;
                GameManager.updateUI();
            }
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
            if (typeof GameManager !== 'undefined') {
                GameManager.sins.wrath.value = Math.min(100, GameManager.sins.wrath.value + 20);
                GameManager.updateUI();
            }
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