// ================= МОДУЛЬ МИНИ-ИГРЫ ГРЕХ АЛЧНОСТИ (SVG/HTML slot-machine) =================
// Полностью переработанная версия: полноэкранное окно (тот же формат, что и
// у "Тщеславия"), тёмная казино-атмосфера позади автомата, детализированный
// корпус (мраморные пилястры, лампочки-маркиза, хромированный рычаг), барабаны
// крутятся полноценной вертикальной лентой символов (а не просто подменой
// текста), анимация рычага — многоступенчатая пружинная (с перехлёстом),
// победа — дождь монет + вспышки света + фейерверк искр.
const GreedMinigame = {
    screenElement: null,
    modalElement: null,
    closeBtn: null,
    stageElement: null,
    machineContainer: null,
    leverTrigger: null,
    leverArm: null,
    reelWindows: [],
    reelStrips: [],
    winOverlay: null,
    fireworksEl: null,
    coinRainEl: null,

    // Состояние
    symbols: ['💰', '❌', '💀', '🎲', '💎'],
    isSpinning: false,
    spinCount: 0,
    targetWinSpin: 3,
    hasWon: false,
    spinTimers: [],   // id всех текущих setInterval/setTimeout
    spinGeneration: 0, // токен-поколение — растёт при каждом close(), чтобы
                        // просроченные async-колбэки (transitionend/rAF от
                        // прошлой сессии игры) не трогали уже новое состояние

    FILLER_COUNT: 30,
    REEL_BASE_MS: 900,
    REEL_STEP_MS: 380,

    init() {
        this.screenElement = document.getElementById('slots-game');
        this.modalElement = this.screenElement ? this.screenElement.querySelector('.slots-modal') : null;
        this.closeBtn = document.getElementById('slots-close-btn');
        this.stageElement = document.getElementById('machine-stage');
        this.machineContainer = document.getElementById('machine-container');
        this.leverTrigger = document.getElementById('lever-trigger');
        this.leverArm = document.getElementById('lever-arm');
        this.winOverlay = document.getElementById('win-overlay');
        this.fireworksEl = document.getElementById('fireworks');
        this.coinRainEl = document.getElementById('coin-rain');

        this.reelWindows = [
            document.getElementById('reel-0'),
            document.getElementById('reel-1'),
            document.getElementById('reel-2')
        ];
        this.reelStrips = [
            document.getElementById('strip-0'),
            document.getElementById('strip-1'),
            document.getElementById('strip-2')
        ];

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

        window.addEventListener('resize', () => {
            if (!this.screenElement || !this.screenElement.classList.contains('active')) return;
            this.fitMachineStage();
        });
    },

    open() {
        if (!this.screenElement) this.init();
        if (!this.screenElement) return;

        this.screenElement.classList.add('active');

        this.clearSpinTimers();
        this.isSpinning = false;
        this.spinCount = 0;
        this.hasWon = false;
        this.targetWinSpin = Math.floor(Math.random() * 3) + 3; // победа на 3-5 ход

        this.clearWinFx();
        if (this.machineContainer) {
            this.machineContainer.classList.remove('spin-lights', 'win-lights');
        }
        if (this.leverArm) this.leverArm.classList.remove('pulled');

        // Размер автомата под реальные габариты экрана считает JS (а не
        // проценты/aspect-ratio в CSS) — гарантирует, что .reels-overlay
        // (позиционируется в % от контейнера) идеально совпадает с окном
        // экрана автомата, нарисованным внутри SVG (viewBox 350x480), на
        // любом устройстве. Меряем на следующем кадре — сразу после
        // добавления .active модалка ещё может иметь нулевые размеры сцены
        // в некоторых вебвью до первого layout-прохода.
        requestAnimationFrame(() => {
            this.fitMachineStage();
            this.resetReelsVisual();
        });
    },

    close() {
        this.spinGeneration++; // "гасим" все ещё не сработавшие колбэки прошлой сессии
        this.clearSpinTimers();
        this.isSpinning = false;

        if (this.screenElement) this.screenElement.classList.remove('active');
        if (this.modalElement) this.modalElement.classList.remove('shake');
        if (this.leverArm) this.leverArm.classList.remove('pulled');
        if (this.machineContainer) {
            this.machineContainer.classList.remove('spin-lights', 'win-lights');
        }
        this.clearWinFx();
    },

    clearSpinTimers() {
        this.spinTimers.forEach(id => { clearInterval(id); clearTimeout(id); });
        this.spinTimers = [];
    },

    clearWinFx() {
        if (this.winOverlay) {
            this.winOverlay.classList.remove('show', 'fade-out');
        }
        if (this.fireworksEl) this.fireworksEl.innerHTML = '';
        if (this.coinRainEl) this.coinRainEl.innerHTML = '';
    },

    // Подгоняет пиксельный размер .machine-container под пропорции
    // SVG-корпуса (320:480), "вписывая" его в доступную область сцены —
    // тот же принцип точного measurement-based layout, что и в
    // pride.js/gluttony.js, только через явный px-размер контейнера, а не
    // позиционирование персонажа.
    fitMachineStage() {
        if (!this.stageElement || !this.machineContainer) return;
        const stageW = this.stageElement.clientWidth;
        const stageH = this.stageElement.clientHeight;
        if (stageW < 4 || stageH < 4) return;

        const RATIO = 350 / 480; // width / height — совпадает с viewBox SVG-корпуса
        let w = stageW;
        let h = w / RATIO;
        if (h > stageH) {
            h = stageH;
            w = h * RATIO;
        }
        this.machineContainer.style.width = `${w}px`;
        this.machineContainer.style.height = `${h}px`;
    },

    // Возвращает барабаны к статичной тройке символов (верх/центр/низ) —
    // без ленты и без transition. Используется и при открытии игры, и
    // сразу после остановки каждого барабана (чтобы следующий рывок
    // рычага снова стартовал с чистой трёхъячеечной ленты, а не
    // бесконечно копил старые ячейки).
    resetReelsVisual() {
        // Строки генерируются ОДИН раз для всех трёх барабанов разом (не
        // по одной на каждый барабан внутри цикла!) — иначе гарантия
        // "верхняя/нижняя строка не совпадёт по всем трём барабанам"
        // ломается: три независимых мини-тройки, из которых берётся только
        // по одному значению, сами по себе ничего не гарантируют про то,
        // совпадут ли ИМЕННО ВЗЯТЫЕ значения между собой.
        const [topRow, midRow, bottomRow] = this.randomRowTriples();
        this.reelStrips.forEach((strip, i) => {
            if (!strip) return;
            this.collapseStripToTriple(i, { top: topRow[i], mid: midRow[i], bottom: bottomRow[i] });
        });
    },

    // Генерирует три независимые "строки" символов (верхнюю, среднюю,
    // нижнюю) по одному значению на каждый из трёх барабанов — и для
    // верхней, и для нижней строки гарантирует, что все три барабана НЕ
    // совпадут (декоративные строки никогда не должны складываться в
    // "три одинаковых подряд", чтобы не выглядеть как ложная победа).
    // Средняя строка возвращается тем же способом просто для дефолтного
    // состояния экрана (реальный игровой результат средней строки во
    // время спина считает pullLever() отдельно, по своей игровой логике).
    randomRowTriples() {
        const top = this.avoidTripleMatch([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
        const mid = this.avoidTripleMatch([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
        const bottom = this.avoidTripleMatch([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
        return [top, mid, bottom];
    },

    // Если все три значения совпали — подменяет последнее на любой другой
    // символ (этого достаточно, чтобы тройка перестала быть "три
    // одинаковых подряд"; на пары одинаковых значений ограничения нет).
    avoidTripleMatch(row) {
        if (row[0] === row[1] && row[1] === row[2]) {
            row[2] = this.symbols.find(s => s !== row[2]) || row[2];
        }
        return row;
    },

    // Ставит в барабан ровно 3 ячейки (верх/центр/низ), без ленты и
    // transition — окно барабана (height = 3×cellH) заполняется ими
    // ровно целиком. Возвращает { topEl, midEl, bottomEl } для тех, кому
    // нужно, например, навесить анимацию отскока на конкретную ячейку.
    collapseStripToTriple(index, { top, mid, bottom }) {
        const windowEl = this.reelWindows[index];
        const strip = this.reelStrips[index];
        if (!strip || !windowEl) return null;
        const cellH = (windowEl.clientHeight || 180) / 3;
        strip.style.transition = 'none';
        strip.classList.remove('blur');
        strip.innerHTML = '';
        const topEl = this.makeCell(top, cellH, 'side');
        const midEl = this.makeCell(mid, cellH, 'mid');
        const bottomEl = this.makeCell(bottom, cellH, 'side');
        strip.appendChild(topEl);
        strip.appendChild(midEl);
        strip.appendChild(bottomEl);
        strip.style.transform = 'translateY(0px)';
        // eslint-disable-next-line no-unused-expressions
        void strip.offsetHeight; // форсируем рефлоу, чтобы следующий transition не склеился с этим сбросом
        return { topEl, midEl, bottomEl };
    },

    // Читает текущую видимую тройку барабана (для бесшовного старта
    // следующего спина — новая лента начинается с тех же трёх символов,
    // что уже показаны, без визуального скачка в момент пересборки).
    readCurrentTriple(index) {
        const strip = this.reelStrips[index];
        const cells = strip ? strip.querySelectorAll('.reel-cell') : [];
        if (cells.length >= 3) {
            return [cells[0].textContent, cells[1].textContent, cells[2].textContent];
        }
        return [this.randomSymbol(), this.randomSymbol(), this.randomSymbol()];
    },

    makeCell(symbol, cellH, role) {
        const cell = document.createElement('div');
        cell.className = 'reel-cell' + (role ? ` reel-cell-${role}` : '');
        cell.style.height = `${cellH}px`;
        cell.textContent = symbol;
        return cell;
    },

    randomSymbol() {
        return this.symbols[Math.floor(Math.random() * this.symbols.length)];
    },

    // ---------- АНИМАЦИЯ ПОБЕДЫ ----------
    showWinAnimation() {
        if (!this.winOverlay) return;
        const gen = this.spinGeneration;

        if (this.machineContainer) {
            this.machineContainer.classList.remove('spin-lights');
            this.machineContainer.classList.add('win-lights');
        }

        this.spawnFireworks();
        this.spawnCoinRain();

        this.winOverlay.classList.remove('fade-out');
        this.winOverlay.classList.add('show');

        const t1 = setTimeout(() => {
            if (gen !== this.spinGeneration) return;
            this.winOverlay.classList.add('fade-out');
        }, 1700);
        const t2 = setTimeout(() => {
            if (gen !== this.spinGeneration) return;
            this.winOverlay.classList.remove('show', 'fade-out');
            this.clearWinFx();
            if (this.machineContainer) this.machineContainer.classList.remove('win-lights');
        }, 2700);
        this.spinTimers.push(t1, t2);
    },

    spawnFireworks() {
        if (!this.fireworksEl) return;
        this.fireworksEl.innerHTML = '';
        const colors = ['#ffd700', '#ff6b3d', '#f5b041', '#4CAF50', '#00e5ff', '#ff4d9d'];

        for (let i = 0; i < 30; i++) {
            const spark = document.createElement('div');
            spark.className = 'spark';
            const angle = (Math.PI * 2 * i) / 30;
            const dist = 70 + Math.random() * 70;
            spark.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
            spark.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
            spark.style.background = colors[Math.floor(Math.random() * colors.length)];
            spark.style.animationDelay = `${Math.random() * 0.15}s`;
            this.fireworksEl.appendChild(spark);
        }
    },

    spawnCoinRain() {
        if (!this.coinRainEl) return;
        this.coinRainEl.innerHTML = '';
        const count = 22;
        for (let i = 0; i < count; i++) {
            const coin = document.createElement('div');
            coin.className = 'coin';
            const left = 4 + Math.random() * 92;
            const drift = (Math.random() * 60 - 30).toFixed(0);
            const dur = (0.9 + Math.random() * 0.7).toFixed(2);
            const delay = (Math.random() * 0.4).toFixed(2);
            coin.style.left = `${left}%`;
            coin.style.setProperty('--drift', `${drift}px`);
            coin.style.animationDuration = `${dur}s`;
            coin.style.animationDelay = `${delay}s`;
            this.coinRainEl.appendChild(coin);
        }
    },

    // ---------- РЫЧАГ И ЗАПУСК ПРОКРУТКИ ----------
    pullLever() {
        if (this.isSpinning || this.hasWon) return;
        if (!this.reelWindows[0] || this.reelWindows[0].clientHeight < 4) {
            // Сцена ещё не измерена/не готова — пробуем на следующем кадре.
            requestAnimationFrame(() => this.pullLever());
            return;
        }

        this.isSpinning = true;
        this.spinCount++;
        const gen = this.spinGeneration;

        // 1. Анимация рычага (пружинный перехлёст) + тряска корпуса + бегущие огни
        if (this.leverArm) {
            this.leverArm.classList.remove('pulled');
            void this.leverArm.offsetWidth;
            this.leverArm.classList.add('pulled');
            const onLeverEnd = () => {
                this.leverArm.classList.remove('pulled');
                this.leverArm.removeEventListener('animationend', onLeverEnd);
            };
            this.leverArm.addEventListener('animationend', onLeverEnd);
        }
        if (this.modalElement) {
            this.modalElement.classList.remove('shake');
            void this.modalElement.offsetWidth;
            this.modalElement.classList.add('shake');
            const shakeTimer = setTimeout(() => {
                if (this.modalElement) this.modalElement.classList.remove('shake');
            }, 400);
            this.spinTimers.push(shakeTimer);
        }
        if (this.machineContainer) this.machineContainer.classList.add('spin-lights');

        const shouldWin = (this.spinCount >= this.targetWinSpin);
        let winSymbols = ['💰', '💰', '💰'];
        let loseSymbols = [this.randomSymbol(), this.randomSymbol(), this.randomSymbol()];

        // Гарантируем проигрыш, если не пришло время выигрывать
        if (!shouldWin && loseSymbols[0] === loseSymbols[1] && loseSymbols[1] === loseSymbols[2]) {
            loseSymbols[2] = loseSymbols[2] === '❌' ? '💀' : '❌';
        }

        // Средняя строка (payline) — это ЕДИНСТВЕННАЯ строка, которая
        // реально определяет выигрыш/проигрыш. Верхняя и нижняя строки —
        // чисто декоративные, показываются просто чтобы барабан не
        // выглядел пустым (он достаточно большой для трёх рядов), но
        // никогда не должны сами по себе складываться в "три одинаковых
        // подряд" — иначе выглядело бы как ложная вторая/третья победа.
        const midSymbols = shouldWin ? winSymbols : loseSymbols;
        const topSymbols = this.avoidTripleMatch([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
        const bottomSymbols = this.avoidTripleMatch([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);

        let stoppedCount = 0;
        this.reelWindows.forEach((windowEl, index) => {
            const duration = this.REEL_BASE_MS + index * this.REEL_STEP_MS;
            const final = { top: topSymbols[index], mid: midSymbols[index], bottom: bottomSymbols[index] };
            this.spinReel(index, final, duration, gen, () => {
                stoppedCount++;
                if (stoppedCount === this.reelWindows.length) {
                    if (gen !== this.spinGeneration) return;
                    this.isSpinning = false;
                    if (this.machineContainer) this.machineContainer.classList.remove('spin-lights');
                    if (shouldWin) {
                        this.hasWon = true;
                        this.showWinAnimation();
                        // Результат уходит в ядро, начислением занимается оно.
                        GameEvents.emit('minigame:result', { sin: 'greed', mode: 'slots', outcome: 'win' });
                    }
                }
            });
        });
    },

    // Крутит один барабан как полноценную вертикальную ленту символов.
    // Барабан показывает СРАЗУ ТРИ ряда (верх/центр/низ) — окно барабана
    // высокое, ровно втрое выше одной ячейки, так что при остановке ленты
    // в кадре всегда ровно 3 соседние ячейки. Игровой результат — только
    // средний ряд (совпадает с золотой линией payline); верхний и нижний —
    // decor, их значения передаются в `final.top`/`final.bottom` уже
    // проверенными на "не три одинаковых" в pullLever().
    //
    // Лента строится как: [текущие top/mid/bottom] + [N одиночных
    // случайных заполнителей] + [финальные top/mid/bottom]. Останавливаем
    // прокрутку ровно на последних трёх ячейках — тогда в окне окажется
    // финальная тройка, а средняя (payline) — именно `final.mid`.
    spinReel(index, final, duration, gen, onStopped) {
        const windowEl = this.reelWindows[index];
        const strip = this.reelStrips[index];
        if (!windowEl || !strip) { onStopped(); return; }

        const cellH = (windowEl.clientHeight || 180) / 3;
        const [curTop, curMid, curBottom] = this.readCurrentTriple(index);

        strip.style.transition = 'none';
        strip.innerHTML = '';
        strip.appendChild(this.makeCell(curTop, cellH, 'side'));
        strip.appendChild(this.makeCell(curMid, cellH, 'mid'));
        strip.appendChild(this.makeCell(curBottom, cellH, 'side'));
        for (let i = 0; i < this.FILLER_COUNT; i++) {
            strip.appendChild(this.makeCell(this.randomSymbol(), cellH));
        }
        strip.appendChild(this.makeCell(final.top, cellH, 'side'));
        strip.appendChild(this.makeCell(final.mid, cellH, 'mid'));
        strip.appendChild(this.makeCell(final.bottom, cellH, 'side'));
        strip.style.transform = 'translateY(0px)';
        void strip.offsetHeight; // рефлоу — иначе браузер схлопнет старт/финиш в один кадр

        // Всего ячеек: 3 (текущие) + FILLER_COUNT + 3 (финальные). Окно
        // должно "прилипнуть" так, чтобы в кадре были ровно последние 3 —
        // то есть проскроллить мимо первых (3 + FILLER_COUNT) ячеек.
        const distance = (3 + this.FILLER_COUNT) * cellH;

        strip.classList.add('blur');
        strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.75, 0.18, 1)`;
        strip.style.transform = `translateY(-${distance}px)`;

        let resolved = false;
        const finish = () => {
            if (resolved) return;
            resolved = true;
            if (gen !== this.spinGeneration) return;
            strip.classList.remove('blur');
            const cells = this.collapseStripToTriple(index, final);
            // Отскок вешаем на сами символы (.reel-cell), а НЕ на рамку
            // окна (.reel-window) — иначе видимая белая рамка барабана на
            // мгновение "сжимается" вместе с содержимым, что выглядит как
            // глюк, а не как приятный эффект приземления.
            if (cells) {
                [cells.topEl, cells.midEl, cells.bottomEl].forEach(cell => {
                    if (!cell) return;
                    cell.classList.remove('stop-bounce');
                    void cell.offsetWidth;
                    cell.classList.add('stop-bounce');
                });
                const bounceTimer = setTimeout(() => {
                    [cells.topEl, cells.midEl, cells.bottomEl].forEach(cell => cell && cell.classList.remove('stop-bounce'));
                }, 400);
                this.spinTimers.push(bounceTimer);
            }
            onStopped();
        };

        const onTransitionEnd = (e) => {
            if (e.propertyName !== 'transform') return;
            strip.removeEventListener('transitionend', onTransitionEnd);
            finish();
        };
        strip.addEventListener('transitionend', onTransitionEnd);

        // Снимаем размытие чуть раньше остановки, чтобы финальная тройка
        // была хорошо видна уже в момент "прилипания".
        const unblurTimer = setTimeout(() => strip.classList.remove('blur'), Math.max(0, duration * 0.72));
        // Подстраховка на случай, если transitionend не пришёл (например,
        // вкладка была в фоне) — не оставляем барабан висеть в спине навечно.
        const fallbackTimer = setTimeout(() => {
            strip.removeEventListener('transitionend', onTransitionEnd);
            finish();
        }, duration + 250);
        this.spinTimers.push(unblurTimer, fallbackTimer);
    }
};

// Принудительный старт
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GreedMinigame.init());
} else {
    GreedMinigame.init();
}
