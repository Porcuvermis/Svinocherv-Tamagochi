// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ ТЩЕСЛАВИЯ (ШАХМАТЫ + КАРТЫ + КОСТИ) =================
const PrideMinigame = {
    screenElement: null,
    closeBtn: null,
    boardBg: null,
    piecesLayer: null,
    cardsFan: null,
    diceZone: null,
    winOverlay: null,

    SIZE: 5,
    finished: false,
    preset: null,
    activePieceEl: null,
    winLoopInterval: null,

    PIECE_SYMBOLS: {
        king: '♚', rook: '♖', queen: '♕', knight: '♘', bishop: '♗', pawn: '♟'
    },

    // 10 валидных шахматных сетапов (Мат в 1 ход на 5x5)
    PRESETS: [
        {
            king: { r: 0, c: 2 },
            blockers: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }],
            mate: { from: { r: 4, c: 0 }, to: { r: 0, c: 0 }, type: 'rook' },
            decor: []
        },
        {
            king: { r: 0, c: 0 },
            blockers: [{ r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }],
            mate: { from: { r: 3, c: 3 }, to: { r: 1, c: 2 }, type: 'knight' },
            decor: []
        },
        {
            king: { r: 0, c: 4 },
            blockers: [{ r: 1, c: 3 }, { r: 1, c: 4 }],
            mate: { from: { r: 4, c: 0 }, to: { r: 0, c: 0 }, type: 'queen' },
            decor: []
        },
        {
            king: { r: 0, c: 4 },
            blockers: [{ r: 0, c: 3 }, { r: 1, c: 4 }],
            mate: { from: { r: 4, c: 0 }, to: { r: 2, c: 2 }, type: 'bishop' },
            decor: []
        },
        {
            king: { r: 0, c: 2 },
            blockers: [{ r: 0, c: 1 }, { r: 0, c: 3 }],
            mate: { from: { r: 4, c: 4 }, to: { r: 1, c: 2 }, type: 'queen' },
            decor: [{ r: 4, c: 2, type: 'rook' }] 
        },
        {
            king: { r: 0, c: 1 },
            blockers: [{ r: 0, c: 0 }, { r: 0, c: 2 }, { r: 1, c: 0 }],
            mate: { from: { r: 4, c: 3 }, to: { r: 0, c: 3 }, type: 'rook' },
            decor: [{ r: 2, c: 2, type: 'knight' }]
        },
        {
            king: { r: 0, c: 2 },
            blockers: [{ r: 0, c: 1 }, { r: 0, c: 3 }, { r: 1, c: 2 }],
            mate: { from: { r: 3, c: 1 }, to: { r: 1, c: 0 }, type: 'knight' },
            decor: []
        },
        {
            king: { r: 0, c: 0 },
            blockers: [{ r: 0, c: 1 }, { r: 1, c: 0 }],
            mate: { from: { r: 4, c: 4 }, to: { r: 2, c: 2 }, type: 'bishop' },
            decor: [{ r: 2, c: 1, type: 'knight' }]
        },
        {
            king: { r: 0, c: 0 },
            blockers: [{ r: 1, c: 0 }, { r: 1, c: 1 }],
            mate: { from: { r: 4, c: 4 }, to: { r: 0, c: 4 }, type: 'queen' },
            decor: []
        },
        {
            king: { r: 0, c: 4 },
            blockers: [{ r: 0, c: 3 }, { r: 1, c: 3 }, { r: 1, c: 4 }],
            mate: { from: { r: 3, c: 2 }, to: { r: 2, c: 3 }, type: 'knight' },
            decor: []
        }
    ],

    CARD_RANKS: [
        { rank: 'K', full: 'K' },
        { rank: 'A', full: 'A' },
        { rank: 'Q', full: 'Q' }
    ],
    SUITS: [
        { s: '♥', cls: 'red' },
        { s: '♦', cls: 'red' },
        { s: '♣', cls: 'black' },
        { s: '♠', cls: 'black' }
    ],

    init() {
        this.screenElement = document.getElementById('pride-game');
        this.closeBtn = document.getElementById('pride-close-btn');
        this.boardBg = document.getElementById('pride-board-bg');
        this.piecesLayer = document.getElementById('pride-pieces-layer');
        this.cardsFan = document.getElementById('pride-cards-fan');
        this.diceZone = document.getElementById('pride-dice-zone');
        this.winOverlay = document.getElementById('pride-win-overlay');

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }
        if (this.diceZone) {
            this.diceZone.onclick = (e) => { e.stopPropagation(); this.rollDice(); };
        }

        this.buildBoardBg();
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        this.resetAll();
    },

    close() {
        this.stopWinLoop();
        if (this.screenElement) this.screenElement.classList.remove('active');
    },

    stopWinLoop() {
        if (this.winLoopInterval) {
            clearInterval(this.winLoopInterval);
            this.winLoopInterval = null;
        }
        if (this.winOverlay) {
            this.winOverlay.classList.remove('show');
            // Удаляем разлетевшиеся частицы
            const particles = this.winOverlay.querySelectorAll('.pride-firework-particle, .pride-floating-crown');
            particles.forEach(p => p.remove());
        }
    },

    resetAll() {
        this.finished = false;
        this.activePieceEl = null;
        this.stopWinLoop();
        if (this.diceZone) this.diceZone.classList.remove('rolling');

        this.preset = this.PRESETS[Math.floor(Math.random() * this.PRESETS.length)];
        this.renderPieces();
        this.renderCards();
        this.renderDiceIdle();
    },

    // ---------- ДОСКА ----------
    buildBoardBg() {
        if (!this.boardBg || this.boardBg.children.length) return;
        const n = this.SIZE;
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const cell = document.createElement('div');
                cell.className = 'pride-cell' + (((r + c) % 2 === 0) ? ' light' : ' dark');
                cell.style.left = `${(c / n) * 100}%`;
                cell.style.top = `${(r / n) * 100}%`;
                cell.style.width = `${100 / n}%`;
                cell.style.height = `${100 / n}%`;
                this.boardBg.appendChild(cell);
            }
        }
    },

    posStyle(r, c) {
        const n = this.SIZE;
        return `left:${(c / n) * 100}%; top:${(r / n) * 100}%; width:${100 / n}%; height:${100 / n}%;`;
    },

    renderPieces() {
        if (!this.piecesLayer) return;
        this.piecesLayer.innerHTML = '';
        const p = this.preset;

        // Король (чёрный)
        const kingEl = document.createElement('div');
        kingEl.className = 'pride-piece black-piece';
        kingEl.id = 'pride-king';
        kingEl.style.cssText = this.posStyle(p.king.r, p.king.c);
        kingEl.textContent = this.PIECE_SYMBOLS.king;
        this.piecesLayer.appendChild(kingEl);

        // Пешки-блокеры
        p.blockers.forEach(b => {
            const el = document.createElement('div');
            el.className = 'pride-piece black-piece';
            el.style.cssText = this.posStyle(b.r, b.c);
            el.textContent = this.PIECE_SYMBOLS.pawn;
            this.piecesLayer.appendChild(el);
        });

        // Декоративные/вспомогательные белые фигуры
        (p.decor || []).forEach(d => {
            const el = document.createElement('div');
            el.className = 'pride-piece white-piece';
            el.style.cssText = this.posStyle(d.r, d.c);
            el.textContent = this.PIECE_SYMBOLS[d.type];
            this.piecesLayer.appendChild(el);
        });

        // Активная (матующая) фигура
        const mate = p.mate;
        const activeEl = document.createElement('div');
        activeEl.className = 'pride-piece white-piece active';
        activeEl.style.cssText = this.posStyle(mate.from.r, mate.from.c);
        activeEl.textContent = this.PIECE_SYMBOLS[mate.type];

        const dr = mate.to.r - mate.from.r;
        const dc = mate.to.c - mate.from.c;
        activeEl.style.setProperty('--dr', dr);
        activeEl.style.setProperty('--dc', dc);

        activeEl.onclick = (e) => {
            e.stopPropagation();
            this.playMateMove(activeEl, kingEl);
        };

        this.piecesLayer.appendChild(activeEl);
        this.activePieceEl = activeEl;
    },

    playMateMove(pieceEl, kingEl) {
        if (this.finished) return;
        pieceEl.classList.remove('active');
        pieceEl.classList.add('moving');
        pieceEl.onclick = null;

        setTimeout(() => {
            if (kingEl) kingEl.classList.add('checkmated');
            this.finishWin();
        }, 460);
    },

    // ---------- КАРТЫ ----------
    renderCards() {
        if (!this.cardsFan) return;
        this.cardsFan.innerHTML = '';

        const rankInfo = this.CARD_RANKS[Math.floor(Math.random() * this.CARD_RANKS.length)];
        const count = 3;
        const suits = [...this.SUITS].sort(() => Math.random() - 0.5).slice(0, count);

        const mid = (count - 1) / 2;
        suits.forEach((suit, i) => {
            const offset = i - mid;
            const rot = offset * 12;
            const shiftX = offset * 28;

            const card = document.createElement('div');
            card.className = `pride-card ${suit.cls}`;
            card.style.setProperty('--rot', `${rot}deg`);
            card.style.setProperty('--shift-x', `${shiftX}px`);
            card.style.zIndex = i;
            card.innerHTML = `
                <div class="pride-card-corner top">${rankInfo.full}${suit.s}</div>
                <div class="pride-card-center">${suit.s}</div>
                <div class="pride-card-corner bottom">${rankInfo.full}${suit.s}</div>
            `;
            card.onclick = (e) => { e.stopPropagation(); this.playHand(); };
            this.cardsFan.appendChild(card);
        });
    },

    playHand() {
        if (this.finished) return;
        const allCards = Array.from(this.cardsFan.children);
        
        allCards.forEach((cardEl, idx) => {
            const throwX = -60 + idx * 60;
            const throwRot = -25 + idx * 25;
            cardEl.style.setProperty('--throw-x', `${throwX}%`);
            cardEl.style.setProperty('--throw-rot', `${throwRot}deg`);
            cardEl.style.setProperty('--throw-delay', `${idx * 70}ms`);
            cardEl.classList.add('thrown');
        });

        setTimeout(() => this.finishWin(), 550);
    },

    // ---------- КОСТИ ----------
    renderDiceIdle() {
        if (!this.diceZone) return;
        this.diceZone.innerHTML = '';
        this.diceZone.classList.remove('rolling');
    },

    rollDice() {
        if (this.finished || this.diceZone.classList.contains('rolling')) return;

        this.diceZone.classList.add('rolling');
        this.diceZone.innerHTML = '';

        const count = 2 + Math.floor(Math.random() * 3);
        const val = 4 + Math.floor(Math.random() * 3);

        for (let i = 0; i < count; i++) {
            const die = document.createElement('div');
            die.className = 'pride-die';
            die.style.animationDelay = `${i * 50}ms`;
            die.textContent = '🎲';
            this.diceZone.appendChild(die);

            setTimeout(() => {
                die.textContent = this.numToPips(val);
                die.classList.add('settled');
            }, 450 + i * 50);
        }

        setTimeout(() => this.finishWin(), 450 + count * 50 + 250);
    },

    numToPips(n) {
        const faces = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
        return faces[n] || '⚅';
    },

    // ---------- ЗАЦИКЛЕННЫЙ ПОМПЕЗНЫЙ ФИНАЛ ----------
    finishWin() {
        if (this.finished) return;
        this.finished = true;

        if (this.winOverlay) {
            this.winOverlay.classList.add('show');
            this.startContinuousWinSequence();
        }

        if (typeof GameManager !== 'undefined') {
            GameManager.sins.pride.value = 100;
            GameManager.updateUI();
        }
    },

    startContinuousWinSequence() {
        // Первая волна эффектов
        this.playWinBurst();

        // Зацикливаем бесконечный проигрыш эффектов волнами каждые 800 мс
        this.winLoopInterval = setInterval(() => {
            this.playWinBurst();
        }, 800);
    },

    playWinBurst() {
        const rx = 0.2 + Math.random() * 0.6;
        const ry = 0.2 + Math.random() * 0.5;
        this.triggerFirework(rx, ry, 24);

        if (Math.random() > 0.3) {
            this.triggerCrowns();
        }
    },

    triggerFirework(originXRatio, originYRatio, count = 24) {
        if (!this.winOverlay) return;
        const rect = this.winOverlay.getBoundingClientRect();
        const ox = rect.width * originXRatio;
        const oy = rect.height * originYRatio;

        const colors = ['#FFD700', '#FFFFFF', '#FF8C00', '#FF1493', '#00E5FF', '#7C4DFF'];

        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'pride-firework-particle';
            p.style.left = `${ox}px`;
            p.style.top = `${oy}px`;
            p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

            const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
            const dist = 70 + Math.random() * 110;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;

            p.style.setProperty('--dx', `${dx}px`);
            p.style.setProperty('--dy', `${dy}px`);

            this.winOverlay.appendChild(p);
            setTimeout(() => p.remove(), 1200);
        }
    },

    triggerCrowns() {
        if (!this.winOverlay) return;
        const symbols = ['👑', '⭐', '✨', '🏆', '💎'];

        symbols.forEach((sym) => {
            const crown = document.createElement('div');
            crown.className = 'pride-floating-crown';
            crown.textContent = sym;
            crown.style.left = '50%';
            crown.style.top = '50%';

            const cx = (Math.random() - 0.5) * 260;
            const cy = (Math.random() - 0.5) * 260 - 30;
            const crot = (Math.random() - 0.5) * 90;

            crown.style.setProperty('--cx', `${cx}px`);
            crown.style.setProperty('--cy', `${cy}px`);
            crown.style.setProperty('--crot', `${crot}deg`);

            this.winOverlay.appendChild(crown);
            setTimeout(() => crown.remove(), 1800);
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PrideMinigame.init());
} else {
    PrideMinigame.init();
}

