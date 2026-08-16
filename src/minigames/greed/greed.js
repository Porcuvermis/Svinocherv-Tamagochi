// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ АЛЧНОСТИ (SVG/HTML) =================
const GreedMinigame = {
    screenElement: null,
    closeBtn: null,
    leverTrigger: null,
    leverArm: null,
    reels: [],

    // Состояние
    symbols: ['💰', '❌', '💀', '🎲', '💎'],
    isSpinning: false,
    spinCount: 0,
    targetWinSpin: 3,
    hasWon: false,
    spinTimers: [], // id всех текущих setInterval/setTimeout прокрутки барабанов

    init() {
        this.screenElement = document.getElementById('slots-game');
        this.closeBtn = document.getElementById('slots-close-btn');
        this.leverTrigger = document.getElementById('lever-trigger');
        this.leverArm = document.getElementById('lever-arm');

        this.reels = [
            document.getElementById('reel-0'),
            document.getElementById('reel-1'),
            document.getElementById('reel-2')
        ];

        // Вешаем события клика
        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.close();
            };
        }

        if (this.leverTrigger) {
            this.leverTrigger.onclick = (e) => {
                e.stopPropagation();
                this.pullLever();
            };
        }

        // Клик по корпусу автомата тоже запускает игру для удобства
        const modal = document.querySelector('.slots-modal');
        if (modal) {
            modal.onclick = (e) => {
                if (e.target !== this.closeBtn) {
                    this.pullLever();
                }
            };
        }
    },

    open() {
        if (!this.screenElement) this.init();

        if (this.screenElement) {
            this.screenElement.classList.add('active');
        }

        this.clearSpinTimers();
        this.isSpinning = false;
        this.spinCount = 0;
        this.hasWon = false;
        this.targetWinSpin = Math.floor(Math.random() * 3) + 3; // Победа на 3-5 ход

        // Возвращаем дефолтные символы
        if (this.reels[0]) this.reels[0].textContent = '💎';
        if (this.reels[1]) this.reels[1].textContent = '💀';
        if (this.reels[2]) this.reels[2].textContent = '❌';
        this.reels.forEach(r => r && r.classList.remove('spinning'));
    },

    close() {
        if (this.screenElement) {
            this.screenElement.classList.remove('active');
        }
        // Если закрыть автомат посреди прокрутки, незавершённые
        // setInterval/setTimeout раньше продолжали тикать в фоне и
        // сбрасывали isSpinning только через ~1 сек — до этого момента
        // рычаг в переоткрытой игре не реагировал на клики (казалось,
        // что мини-игра "не запускается"). Плюс просроченный колбэк мог
        // задним числом засчитать победу уже в новой сессии.
        this.clearSpinTimers();
        this.isSpinning = false;
    },

    clearSpinTimers() {
        this.spinTimers.forEach(id => { clearInterval(id); clearTimeout(id); });
        this.spinTimers = [];
    },

    // Анимация победы: фейерверк из частиц + надпись "Нагрешил!"
    showWinAnimation() {
        const overlay = document.getElementById('win-overlay');
        const fireworks = document.getElementById('fireworks');
        if (!overlay || !fireworks) return;

        fireworks.innerHTML = '';
        const colors = ['#ffd700', '#ff4444', '#f5b041', '#4CAF50', '#00e5ff'];

        for (let i = 0; i < 24; i++) {
            const spark = document.createElement('div');
            spark.className = 'spark';
            const angle = (Math.PI * 2 * i) / 24;
            const dist = 80 + Math.random() * 60;
            spark.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
            spark.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
            spark.style.background = colors[Math.floor(Math.random() * colors.length)];
            fireworks.appendChild(spark);
        }

        overlay.classList.remove('fade-out');
        overlay.classList.add('show');

        setTimeout(() => overlay.classList.add('fade-out'), 1500);
        setTimeout(() => {
            overlay.classList.remove('show', 'fade-out');
            fireworks.innerHTML = '';
        }, 2500);
    },

    pullLever() {
        if (this.isSpinning || this.hasWon) return;

        this.isSpinning = true;
        this.spinCount++;

        // 1. Анимация рычага
        if (this.leverArm) {
            this.leverArm.classList.add('pulled');
            setTimeout(() => {
                this.leverArm.classList.remove('pulled');
            }, 300);
        }

        const shouldWin = (this.spinCount >= this.targetWinSpin);
        let winSymbols = ['💰', '💰', '💰'];
        let loseSymbols = [
            this.symbols[Math.floor(Math.random() * this.symbols.length)],
            this.symbols[Math.floor(Math.random() * this.symbols.length)],
            this.symbols[Math.floor(Math.random() * this.symbols.length)]
        ];

        // Гарантируем проигрыш, если не пришло время выигрывать
        if (!shouldWin && loseSymbols[0] === loseSymbols[1] && loseSymbols[1] === loseSymbols[2]) {
            loseSymbols[2] = loseSymbols[2] === '❌' ? '💀' : '❌';
        }

        const finalSymbols = shouldWin ? winSymbols : loseSymbols;

        // 2. Запуск анимации барабанов с задержкой остановки (каскадом)
        this.reels.forEach((reel, index) => {
            if (!reel) return;

            reel.classList.add('spinning');

            // Интервал быстрой подмены иконок во время прокрутки
            let cycleInterval = setInterval(() => {
                reel.textContent = this.symbols[Math.floor(Math.random() * this.symbols.length)];
            }, 35);
            this.spinTimers.push(cycleInterval);

            // Остановка каждого барабана в разное время
            const stopTimeout = setTimeout(() => {
                clearInterval(cycleInterval);
                reel.classList.remove('spinning');
                reel.textContent = finalSymbols[index];

                // Когда остановился последний барабан
                if (index === 2) {
                    this.isSpinning = false;
                    if (shouldWin) {
                        this.hasWon = true;
                        this.showWinAnimation();
                        if (typeof GameManager !== 'undefined') {
                            GameManager.sins.greed.value = 100;
                            GameManager.updateUI();
                        }
                    }
                }
            }, 500 + index * 200);
            this.spinTimers.push(stopTimeout);
        });
    }
};

// Принудительный старт
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GreedMinigame.init());
} else {
    GreedMinigame.init();
}
