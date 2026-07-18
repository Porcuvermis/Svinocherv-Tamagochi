// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ГНЕВА (БОЙ) =================

function drawWormFigure(canvas, opts) {
    const w = canvas.clientWidth || 150;
    const h = canvas.clientHeight || 320;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    const { hue, segCount, thick, eyeMult, dir } = opts;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h * 0.16);

    const scale = h / 300;

    // Тело — вертикальная цепочка сегментов вниз
    for (let i = segCount; i > 0; i--) {
        const segY = i * 22 * scale;
        const segX = Math.sin(i * 0.7) * 10 * dir * thick * scale;
        const r = (22 - i * 1.4) * thick * scale;
        ctx.beginPath();
        ctx.arc(segX, segY, Math.max(6 * scale, r), 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, ${60 - i * 3}%, ${50 - i}%)`;
        ctx.fill();
        ctx.strokeStyle = '#2a0a10';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Голова
    ctx.beginPath();
    ctx.arc(0, 0, 34 * thick * scale, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 70%, 82%)`;
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 50%, 60%)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-20 * scale, -20 * scale); ctx.lineTo(-32 * scale, -44 * scale); ctx.lineTo(-6 * scale, -28 * scale);
    ctx.closePath(); ctx.fillStyle = `hsl(${hue}, 70%, 82%)`; ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(12 * scale, -26 * scale); ctx.lineTo(20 * scale, -48 * scale); ctx.lineTo(26 * scale, -16 * scale);
    ctx.closePath(); ctx.fillStyle = `hsl(${hue}, 65%, 78%)`; ctx.fill(); ctx.stroke();

    const eyeR = 6.5 * eyeMult * scale;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-13 * scale, -7 * scale, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(13 * scale, -7 * scale, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-12 * scale, -7 * scale, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14 * scale, -7 * scale, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();

    ctx.beginPath(); ctx.ellipse(0, 11 * scale, 14 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 60%, 70%)`; ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 40%, 50%)`; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = `hsl(${hue}, 40%, 30%)`;
    ctx.beginPath(); ctx.arc(-4 * scale, 11 * scale, 2.2 * scale, 0, Math.PI * 2);
    ctx.arc(4 * scale, 11 * scale, 2.2 * scale, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
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

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }
        if (this.daggerBtn) {
            this.daggerBtn.onclick = (e) => { e.stopPropagation(); this.handleDaggerClick(); };
        }
        this.playerZones.forEach(z => {
            z.onclick = (e) => { e.stopPropagation(); this.selectDefense(z.dataset.zone, z); };
        });
        this.enemyZones.forEach(z => {
            z.onclick = (e) => { e.stopPropagation(); this.selectAttack(z.dataset.zone, z); };
        });
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');

        this.generateEnemy();
        this.playerHP = this.maxHP;
        this.enemyHP = this.maxHP;
        this.isFighting = false;
        this.fightOver = false;
        this.resetSelections();

        this.updateHPBars();
        this.setResult('');
        this.drawFighters();
        if (this.daggerBtn) this.daggerBtn.classList.remove('disabled');
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
    },

    generateEnemy() {
        this.enemyParams = {
            hue: Math.floor(Math.random() * 360),
            segCount: 4 + Math.floor(Math.random() * 5),
            thick: 0.8 + Math.random() * 0.5,
            eyeMult: 0.8 + Math.random() * 0.5,
            dir: -1
        };
    },

    drawFighters() {
        drawWormFigure(this.playerCanvas, { hue: 340, segCount: 6, thick: 1, eyeMult: 1, dir: 1 });
        drawWormFigure(this.enemyCanvas, this.enemyParams);
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

        if (this.enemyHP <= 0 && this.playerHP > 0) {
            this.setResult('ПОБЕДА! 🤬');
            if (typeof GameManager !== 'undefined') {
                GameManager.sins.wrath.value = 100;
                GameManager.updateUI();
            }
        } else {
            this.setResult('ПОРАЖЕНИЕ...');
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
        void popup.offsetWidth; // рестарт анимации
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