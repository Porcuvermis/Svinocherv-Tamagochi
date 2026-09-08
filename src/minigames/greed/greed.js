// ================= АЛЧНОСТЬ: АВТОМАТ ЗА МОНЕТЫ =================
// Единственный грех, который не платит игроку, а берёт с него. Крутка стоит
// монету и наливает шкалу алчности — КАЖДАЯ, чем бы она ни кончилась. Что
// выпало и сколько за это вернули, решает переходник по PAR-листу из конфига
// (docs/plan/16-greed-slots.md, tools/sim-slots.js).
//
// ---------- ЧТО ЗДЕСЬ БЫЛО РАНЬШЕ ----------
// Автомат был декорацией: победа назначалась на третью-пятую крутку
// (`targetWinSpin`), символы выбирались из пяти равновероятных, ставки не
// было вовсе, а закрытие шкалы приходило одним разом за «победу». То есть
// грех про жадность НИЧЕГО не стоил, а барабаны показывали заранее решённый
// исход — самая дорогая часть картинки не значила ничего.
//
// Теперь наоборот: экран не решает ни-че-го. Он просит крутку у Backend и
// показывает то, что оттуда пришло, — три символа и выплату. Ни весов, ни
// таблицы выплат, ни гарантии против тильта на этой стороне нет (инвариант
// 2): на сервере их у экрана не будет тем более.
const GreedMinigame = {
    screenElement: null,
    win: null,               // хэндл общего окна мини-игры
    stageElement: null,
    machineContainer: null,
    leverTrigger: null,
    leverArm: null,
    reelWindows: [],
    reelStrips: [],
    winOverlay: null,
    fireworksEl: null,
    coinRainEl: null,
    payEl: null,
    tableEl: null,
    chargeEl: null,
    goldEl: null,
    costEl: null,
    feedEl: null,

    // ---------- КАРТИНКИ СИМВОЛОВ ----------
    // Ключи приходят из конфига, а глифы живут здесь: конфиг — это ЧИСЛА
    // (инвариант 3), а чем нарисован символ — дело картинки. Незнакомый ключ
    // рисуется точкой, а не ломает экран: барабан обязан крутиться и после
    // того, как в PAR-лист добавят шестой символ.
    GLYPH: { skull: '💀', coin: '🪙', meat: '🍖', bone: '🦴', blank: '▫️' },

    table: null,             // ставка, кошелёк и выплаты — с той стороны
    isSpinning: false,
    spinTimers: [],          // id всех текущих setTimeout
    spinGeneration: 0,       // токен-поколение: растёт при close(), чтобы
                             // просроченные колбэки прошлой сессии не трогали
                             // уже новое состояние

    FILLER_COUNT: 30,
    REEL_BASE_MS: 700,
    REEL_STEP_MS: 300,

    init() {
        this.screenElement = document.getElementById('slots-game');
        if (!this.screenElement) return;

        // Окно (рамка, значок греха, крестик, вопрос при выходе) — общее на
        // все грехи. Вопроса при выходе тут не бывает: крутка рассчитывается
        // сразу, незавершённого прогресса на экране нет, терять нечего.
        if (!this.win && typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'greed',
                onLeave: () => this.close(),
                canLeave: () => true
            });
        }

        this.stageElement = document.getElementById('machine-stage');
        this.machineContainer = document.getElementById('machine-container');
        this.leverTrigger = document.getElementById('lever-trigger');
        this.leverArm = document.getElementById('lever-arm');
        this.winOverlay = document.getElementById('win-overlay');
        this.fireworksEl = document.getElementById('fireworks');
        this.coinRainEl = document.getElementById('coin-rain');
        this.payEl = document.getElementById('win-pay');
        this.tableEl = document.getElementById('pay-table');
        this.chargeEl = document.getElementById('greed-charge');
        this.goldEl = document.getElementById('slot-gold');
        this.costEl = document.getElementById('slot-cost');
        this.feedEl = document.getElementById('coin-feed');

        this.reelWindows = [0, 1, 2].map(i => document.getElementById('reel-' + i));
        this.reelStrips = [0, 1, 2].map(i => document.getElementById('strip-' + i));

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
        if (typeof MinigameWindow !== 'undefined') MinigameWindow.pauseRoom();

        this.clearSpinTimers();
        this.isSpinning = false;
        this.clearWinFx();
        if (this.machineContainer) {
            this.machineContainer.classList.remove('spin-lights', 'win-lights', 'broke');
        }
        if (this.leverArm) this.leverArm.classList.remove('pulled');

        this.table = Backend.greedTable();
        this.buildPayTable();
        this.refreshMeters(this.table.balance);

        // Размер автомата считает JS, а не проценты в css: .reels-overlay
        // позиционируется в % от контейнера и обязана совпасть с окном,
        // нарисованным ВНУТРИ svg (viewBox 350×480). Меряем на следующем
        // кадре — сразу после .active сцена может иметь нулевой размер.
        requestAnimationFrame(() => {
            this.fitMachineStage();
            this.resetReelsVisual();
        });
    },

    close() {
        this.spinGeneration++;   // гасим все ещё не сработавшие колбэки
        this.clearSpinTimers();
        this.isSpinning = false;

        if (this.screenElement) this.screenElement.classList.remove('active');
        if (this.leverArm) this.leverArm.classList.remove('pulled');
        if (this.machineContainer) {
            this.machineContainer.classList.remove('spin-lights', 'win-lights', 'broke');
        }
        this.clearWinFx();
        if (typeof MinigameWindow !== 'undefined') MinigameWindow.resumeRoom();
    },

    clearSpinTimers() {
        this.spinTimers.forEach(id => clearTimeout(id));
        this.spinTimers = [];
    },

    clearWinFx() {
        if (this.winOverlay) this.winOverlay.classList.remove('show', 'fade-out', 'back', 'win', 'jackpot');
        if (this.fireworksEl) this.fireworksEl.innerHTML = '';
        if (this.coinRainEl) this.coinRainEl.innerHTML = '';
        if (this.payEl) this.payEl.textContent = '';
    },

    glyph(key) {
        return this.GLYPH[key] || '·';
    },

    // ---------- ТАБЛИЦА ВЫПЛАТ ----------
    // Строится из конфига, а не пишется в разметке: правка выплат обязана
    // быть видна игроку в тот же момент, что и калькулятору. Слов в ней нет —
    // три значка и число (инвариант 9).
    buildPayTable() {
        if (!this.tableEl || !this.table) return;
        this.tableEl.innerHTML = '';
        const rows = this.table.symbols
            .filter(s => s.pay > 0)
            .sort((a, b) => b.pay - a.pay);
        rows.forEach(s => this.tableEl.appendChild(this.payRow(this.glyph(s.key).repeat(3), s.pay)));
        if (this.table.pair && this.table.pair.key) {
            this.tableEl.appendChild(this.payRow(this.glyph(this.table.pair.key).repeat(2),
                                                 this.table.pair.pay));
        }
        // Цифра у монеты — только если ставка не одна монета. Одна монета
        // и так одна: «1» рядом с ней объясняет ровно ничего.
        if (this.costEl) this.costEl.textContent = this.table.cost > 1 ? this.table.cost : '';
    },

    payRow(signs, pay) {
        const row = document.createElement('div');
        row.className = 'pay-row';
        const left = document.createElement('span');
        left.className = 'pay-signs';
        left.textContent = signs;
        const right = document.createElement('b');
        right.className = 'pay-value';
        right.textContent = pay;
        row.appendChild(left);
        row.appendChild(right);
        return row;
    },

    // Кошелёк и заряд (шкала алчности). Кошелёк показывается ТЕМ числом,
    // которое передали: во время крутки это баланс уже без ставки, но ещё без
    // выплаты — иначе выигрыш виден раньше, чем встали барабаны.
    refreshMeters(gold) {
        if (this.goldEl) {
            const value = (typeof gold === 'number') ? gold : GameState.currency('gold');
            this.goldEl.textContent = value;
        }
        if (this.chargeEl) {
            const bar = this.chargeEl.querySelector('i');
            const max = GameState.maxValue('greed') || 100;
            const share = Math.max(0, Math.min(1, GameState.sinValue('greed') / max));
            if (bar) bar.style.height = (share * 100).toFixed(1) + '%';
        }
    },

    fitMachineStage() {
        if (!this.stageElement || !this.machineContainer) return;
        const stageW = this.stageElement.clientWidth;
        const stageH = this.stageElement.clientHeight;
        if (stageW < 4 || stageH < 4) return;

        const RATIO = 350 / 620;   // совпадает с viewBox корпуса (с тумбой)
        let w = stageW;
        let h = w / RATIO;
        if (h > stageH) {
            h = stageH;
            w = h * RATIO;
        }
        this.machineContainer.style.width = w + 'px';
        this.machineContainer.style.height = h + 'px';
    },

    // ---------- БАРАБАНЫ ----------
    // Символы для ленты берутся из таблицы выплат, то есть из конфига: своего
    // списка у экрана нет. Вес при этом НЕ учитывается — лента мелькает и
    // размыта, её дело быть похожей на барабан, а не быть честной выборкой.
    // Честна только остановка, и она приходит с той стороны.
    randomSymbol() {
        const keys = (this.table && this.table.symbols.map(s => s.key)) || Object.keys(this.GLYPH);
        return keys[Math.floor(Math.random() * keys.length)];
    },

    resetReelsVisual() {
        const [topRow, midRow, bottomRow] = [this.decorRow(), this.decorRow(), this.decorRow()];
        this.reelStrips.forEach((strip, i) => {
            if (!strip) return;
            this.collapseStripToTriple(i, { top: topRow[i], mid: midRow[i], bottom: bottomRow[i] });
        });
    },

    // Декоративный ряд: три символа, которые ГАРАНТИРОВАННО не сложатся в
    // тройку. Верхний и нижний ряды не играют, и тройка в них читалась бы как
    // выигрыш, за который не заплатили.
    decorRow() {
        const row = [this.randomSymbol(), this.randomSymbol(), this.randomSymbol()];
        if (row[0] === row[1] && row[1] === row[2]) {
            const keys = this.table ? this.table.symbols.map(s => s.key) : Object.keys(this.GLYPH);
            row[2] = keys.find(k => k !== row[2]) || row[2];
        }
        return row;
    },

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
        void strip.offsetHeight;   // рефлоу: иначе сброс склеится со следующим transition
        return { topEl, midEl, bottomEl };
    },

    readCurrentTriple(index) {
        const strip = this.reelStrips[index];
        const cells = strip ? strip.querySelectorAll('.reel-cell') : [];
        if (cells.length >= 3) {
            return [cells[0].dataset.key, cells[1].dataset.key, cells[2].dataset.key];
        }
        return [this.randomSymbol(), this.randomSymbol(), this.randomSymbol()];
    },

    // Размер символа считается от высоты ячейки, а не задан в css долями
    // ЭКРАНА: игра живёт в холсте постоянного размера, который масштабируется
    // целиком (инвариант 11), и vw внутри него означает не то, что кажется.
    makeCell(key, cellH, role) {
        const cell = document.createElement('div');
        cell.className = 'reel-cell' + (role ? ' reel-cell-' + role : '');
        cell.style.height = cellH + 'px';
        cell.style.fontSize = (cellH * (role === 'mid' ? 0.62 : 0.5)).toFixed(1) + 'px';
        cell.dataset.key = key;
        cell.textContent = this.glyph(key);
        return cell;
    },

    // ---------- РЫЧАГ ----------
    // Одна крутка = один поход в переходник. Ответ приходит СРАЗУ, а барабаны
    // едут уже к известному результату: так работает и настоящий автомат
    // (исход решается в момент нажатия), и так это переживёт сервер — ответ
    // придёт по сети раньше, чем доедет анимация.
    pullLever() {
        if (this.isSpinning) return;
        if (!this.reelWindows[0] || this.reelWindows[0].clientHeight < 4) {
            // Сцена ещё не измерена — пробуем на следующем кадре.
            requestAnimationFrame(() => this.pullLever());
            return;
        }

        const res = Backend.greedSpin();
        if (!res.ok) {
            // Денег нет. Крутка не уходит в минус, а отказ показывается тем
            // же, чем он вызван: пустеющим лотком (docs/plan/16, раздел 6).
            this.showBroke();
            return;
        }

        this.isSpinning = true;
        const gen = this.spinGeneration;
        this.clearWinFx();

        // Кошелёк проседает СРАЗУ: монету автомат забрал в момент рывка, а не
        // после остановки барабанов. Выплата прибавится, когда будет видно, за что.
        this.refreshMeters(res.balance - res.pay);

        this.animateLever();
        this.feedCoin();
        if (this.machineContainer) this.machineContainer.classList.add('spin-lights');

        const mid = res.reels;
        const top = this.decorRow();
        const bottom = this.decorRow();

        let stopped = 0;
        this.reelWindows.forEach((windowEl, index) => {
            const duration = this.REEL_BASE_MS + index * this.REEL_STEP_MS;
            const final = { top: top[index], mid: mid[index], bottom: bottom[index] };
            this.spinReel(index, final, duration, gen, () => {
                stopped++;
                if (stopped < this.reelWindows.length) return;
                if (gen !== this.spinGeneration) return;
                this.isSpinning = false;
                if (this.machineContainer) this.machineContainer.classList.remove('spin-lights');
                this.settle(res, gen);
            });
        });
    },

    // Барабаны встали — показываем итог. Шкала алчности налилась в любом
    // случае, поэтому заряд обновляется всегда, а шум — только за выплату.
    settle(res, gen) {
        if (res.pay > 0) {
            this.showWin(res, gen);
            // Кошелёк пополняется не в момент остановки, а когда монеты
            // ДОЛЕТЕЛИ до лотка: иначе число прибавляется раньше, чем
            // становится понятно за что, и выплата читается как случайность.
            const t = setTimeout(() => {
                if (gen !== this.spinGeneration) return;
                this.refreshMeters(res.balance);
            }, 380);
            this.spinTimers.push(t);
        } else {
            this.refreshMeters(res.balance);
        }
        // Кошелёк в комнате считает то же состояние: пусть перерисуется сразу,
        // а не через секунду на общем таймере.
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
    },

    // Ставка уходит в монетоприёмник: монета поднимается от кучки к щели и
    // исчезает в ней. Единственное место, где видно, что крутка чего-то
    // стоит: число в кошельке меняется молча, и на него не смотрят.
    feedCoin() {
        if (!this.feedEl) return;
        this.feedEl.classList.remove('go');
        void this.feedEl.getBoundingClientRect().width;
        this.feedEl.classList.add('go');
        const t = setTimeout(() => this.feedEl.classList.remove('go'), 700);
        this.spinTimers.push(t);
    },

    animateLever() {
        if (!this.leverArm) return;
        this.leverArm.classList.remove('pulled');
        void this.leverArm.getBoundingClientRect().width;
        this.leverArm.classList.add('pulled');
        const onEnd = () => {
            this.leverArm.classList.remove('pulled');
            this.leverArm.removeEventListener('animationend', onEnd);
        };
        this.leverArm.addEventListener('animationend', onEnd);
    },

    // Пустой кошелёк. Без слов и без окошка «недостаточно средств»: автомат
    // дёргается, лоток вспыхивает красным — и всё понятно.
    showBroke() {
        if (!this.machineContainer) return;
        this.machineContainer.classList.remove('broke');
        void this.machineContainer.getBoundingClientRect().width;
        this.machineContainer.classList.add('broke');
        const t = setTimeout(() => {
            if (this.machineContainer) this.machineContainer.classList.remove('broke');
        }, 600);
        this.spinTimers.push(t);
    },

    // ---------- ВЫПЛАТА ----------
    // Шума ровно столько, сколько заплатили. Ступени три, и они не выдуманы,
    // а взяты из самой таблицы выплат:
    //
    //   • ВОЗВРАТ СТАВКИ (pay ≤ цена крутки) — не выигрыш, а «не проиграл»:
    //     одна монета падает в лоток, и всё;
    //   • ВЫИГРЫШ — дождь монет по размеру выплаты и бегущие огни;
    //   • ДЖЕКПОТ (самая дорогая тройка) — вспышка, искры и тряска корпуса.
    //
    // Иначе выплата в одну монету празднуется так же, как тройка черепов, и
    // цена джекпота обесценивается: игрок перестаёт различать исходы, а
    // различать их ему больше нечем — слов в игре нет.
    showWin(res, gen) {
        if (!this.winOverlay) return;
        const tier = res.jackpot ? 'jackpot' : (res.pay > (this.table ? this.table.cost : 1) ? 'win' : 'back');

        if (this.payEl) this.payEl.textContent = '+' + res.pay;
        this.winOverlay.classList.remove('back', 'win', 'jackpot');
        this.winOverlay.classList.add(tier);

        if (this.machineContainer) {
            this.machineContainer.classList.remove('spin-lights');
            if (tier !== 'back') this.machineContainer.classList.add('win-lights');
            if (tier === 'jackpot') {
                this.machineContainer.classList.remove('jackpot-hit');
                void this.machineContainer.getBoundingClientRect().width;
                this.machineContainer.classList.add('jackpot-hit');
            }
        }

        // Монет столько, сколько заплатили, но не больше горсти: сорок монет
        // за джекпот в кадре не читаются, а стоят сорока анимаций.
        this.spawnCoinRain(tier === 'back' ? 1 : Math.max(5, Math.min(res.pay, 22)));
        if (tier === 'jackpot') this.spawnFireworks();

        this.winOverlay.classList.remove('fade-out');
        this.winOverlay.classList.add('show');

        const hold = tier === 'jackpot' ? 2000 : tier === 'win' ? 1200 : 650;
        const t1 = setTimeout(() => {
            if (gen !== this.spinGeneration) return;
            this.winOverlay.classList.add('fade-out');
        }, hold);
        const t2 = setTimeout(() => {
            if (gen !== this.spinGeneration) return;
            this.clearWinFx();
            if (this.machineContainer) {
                this.machineContainer.classList.remove('win-lights', 'jackpot-hit');
            }
        }, hold + 700);
        this.spinTimers.push(t1, t2);
    },

    spawnFireworks() {
        if (!this.fireworksEl) return;
        this.fireworksEl.innerHTML = '';
        const colors = ['#ffd700', '#ff6b3d', '#f5b041', '#4CAF50', '#00e5ff', '#ff4d9d'];
        for (let i = 0; i < 24; i++) {
            const spark = document.createElement('div');
            spark.className = 'spark';
            const angle = (Math.PI * 2 * i) / 24;
            const dist = 70 + Math.random() * 70;
            spark.style.setProperty('--tx', (Math.cos(angle) * dist).toFixed(0) + 'px');
            spark.style.setProperty('--ty', (Math.sin(angle) * dist).toFixed(0) + 'px');
            spark.style.background = colors[Math.floor(Math.random() * colors.length)];
            spark.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
            this.fireworksEl.appendChild(spark);
        }
    },

    spawnCoinRain(count) {
        if (!this.coinRainEl) return;
        this.coinRainEl.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const coin = document.createElement('div');
            coin.className = 'coin';
            coin.style.left = (4 + Math.random() * 92).toFixed(0) + '%';
            coin.style.setProperty('--drift', (Math.random() * 60 - 30).toFixed(0) + 'px');
            coin.style.animationDuration = (0.9 + Math.random() * 0.7).toFixed(2) + 's';
            coin.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
            this.coinRainEl.appendChild(coin);
        }
    },

    // Крутит один барабан лентой символов. Лента: [текущая тройка] +
    // [заполнители] + [финальная тройка], и прокрутка останавливается ровно
    // на последних трёх — тогда в окне финал, а на золотой линии final.mid.
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
        void strip.offsetHeight;   // рефлоу: иначе старт и финиш склеятся в один кадр

        const distance = (3 + this.FILLER_COUNT) * cellH;
        strip.classList.add('blur');
        strip.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.12, 0.75, 0.18, 1)';
        strip.style.transform = 'translateY(-' + distance + 'px)';

        let resolved = false;
        const finish = () => {
            if (resolved) return;
            resolved = true;
            if (gen !== this.spinGeneration) return;
            strip.classList.remove('blur');
            const cells = this.collapseStripToTriple(index, final);
            // Отскок вешается на сам СИМВОЛ, а не на рамку окна: рамка,
            // сжимающаяся вместе с содержимым, читается как глюк.
            if (cells) {
                [cells.topEl, cells.midEl, cells.bottomEl].forEach(cell => {
                    if (!cell) return;
                    cell.classList.add('stop-bounce');
                });
                const bounce = setTimeout(() => {
                    [cells.topEl, cells.midEl, cells.bottomEl]
                        .forEach(cell => cell && cell.classList.remove('stop-bounce'));
                }, 400);
                this.spinTimers.push(bounce);
            }
            onStopped();
        };

        const onTransitionEnd = (e) => {
            if (e.propertyName !== 'transform') return;
            strip.removeEventListener('transitionend', onTransitionEnd);
            finish();
        };
        strip.addEventListener('transitionend', onTransitionEnd);

        const unblur = setTimeout(() => strip.classList.remove('blur'), Math.max(0, duration * 0.72));
        // Подстраховка: во вкладке в фоне transitionend не приходит вовсе, и
        // барабан остался бы крутиться навсегда — вместе с ним замерла бы и
        // возможность дёрнуть рычаг ещё раз.
        const fallback = setTimeout(() => {
            strip.removeEventListener('transitionend', onTransitionEnd);
            finish();
        }, duration + 250);
        this.spinTimers.push(unblur, fallback);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GreedMinigame.init());
} else {
    GreedMinigame.init();
}
