// ================= АЛЧНОСТЬ: АВТОМАТ ЗА МОНЕТЫ =================
// Единственный грех, который не платит игроку, а берёт с него. Крутка стоит
// монету и наливает шкалу алчности — КАЖДАЯ, чем бы она ни кончилась. Что
// выпало и сколько за это вернули, решает переходник по PAR-листу из конфига
// (docs/plan/16-greed-slots.md, tools/sim-slots.js).
//
// Экран не решает ни-че-го (инвариант 2): он просит крутку у Backend и
// показывает то, что пришло, — на гаражном аппарате (GreedJunk на свету
// GreedJunkLit, docs/plan/28-greed-machine.md). Аппарат сам по себе умеет
// рычаг, барабаны, монету в щель, лоток, градусник; этот файл только
// связывает его с игрой: рывок → крутка → барабаны встают на исход →
// выплата в лоток → готовность.
//
// Было: свой SVG-автомат с DOM-барабанами, css-рычагом, табличкой и
// колбой — заменён аппаратом целиком (решение игрока).
const GreedMinigame = {
    screenElement: null,
    stageEl: null,
    win: null,               // хэндл общего окна мини-игры
    busy_: false,            // идёт крутка или выплата
    spinGeneration: 0,       // растёт при close(): просроченные колбэки молчат
    timers: [],

    init() {
        this.screenElement = document.getElementById('slots-game');
        if (!this.screenElement) return;
        this.stageEl = document.getElementById('gj-stage');

        // Окно (рамка из монет, крестик) — общее на все грехи. Выход посреди
        // крутки — нажатиями (canLeave).
        if (!this.win && typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'greed',
                // рамка из монет (greed-coins-rim.js), docs/plan/27-greed-skin.md
                skin: typeof GreedCoins !== 'undefined' && GreedCoins.rim ? GreedCoins : null,
                onLeave: () => this.close(),
                canLeave: () => !this.busy()
            });
        }

        // ---------- УЗЕЛ АЛЧНОСТИ В КОЛЕСЕ ГРЕХОВ ----------
        // Что считать готовностью, знает грех, а не колесо (docs/sins-menu.md):
        // к общему правилу добавлена монета в кошельке.
        if (typeof SinsMenu !== 'undefined' && typeof Backend !== 'undefined') {
            SinsMenu.readers.greed = () => Backend.greedReady();
        }

        window.addEventListener('resize', () => {
            if (this.isOpen() && typeof GreedJunkLit !== 'undefined') GreedJunkLit.fit(this.stageEl);
        });
    },

    isOpen() { return !!(this.screenElement && this.screenElement.classList.contains('active')); },

    open() {
        if (!this.screenElement) this.init();
        if (!this.screenElement) return;
        this.screenElement.classList.add('active');
        if (typeof MinigameWindow !== 'undefined') MinigameWindow.pauseRoom();
        this.busy_ = false;
        // Аппарат ставится на следующем кадре: сразу после .active сцена
        // может иметь нулевой размер. Готовность для покрова (veilReady) —
        // аппарат собран целиком (GreedJunkLit.settled: корпус, рычаг,
        // колесо, пачинко) и атлас монет пришёл.
        this._readyP = new Promise((ready) => requestAnimationFrame(() => {
            const L = GreedJunkLit;
            const drawn = L.mount(this.stageEl, {
                onPull: () => this.onPull(),
                onSpinDone: (keys) => this.onSpinDone(keys),
                onPach: () => this.onPach(),
                onPachDone: (where) => this.onPachDone(where),
                onWheel: () => this.onWheel(),
                onWheelDone: () => this.onWheelDone(),
                canReady: () => this.isOpen() && !this.busy_
            });
            if (L.meterSet) L.meterSet(L.meterValue());
            const A = typeof GreedCoins !== 'undefined' && GreedCoins.loadAtlas ? GreedCoins.loadAtlas() : null;
            Promise.resolve(drawn).then(() => L.settled ? L.settled() : null).then(() => {
                const shown = () => requestAnimationFrame(() => ready());
                if (A && !A.ready) A.wait.push(shown); else shown();
            });
        }));
    },

    // Идёт крутка или выплата.
    busy() { return this.busy_; },

    // Готовность для покрова перехода: см. open().
    veilReady() { return this._readyP || Promise.resolve(); },

    close() {
        this.spinGeneration++;
        this.timers.forEach(clearTimeout);
        this.timers = [];
        this.busy_ = false;
        if (this.screenElement) this.screenElement.classList.remove('active');
        if (typeof MinigameWindow !== 'undefined') MinigameWindow.resumeRoom();
    },

    // ---------- РЫВОК → КРУТКА ----------
    // Аппарат спрашивает на срыве рычага; false — крутки нет (денег нет):
    // монета вываливается в ковш возврата, барабаны стоят. Отказ отдаёт и
    // в палец — иначе дотянутый рычаг, за которым ничего не случилось,
    // читается как несработавшее касание.
    onPull() {
        const res = Backend.greedSpin();
        if (!res.ok) {
            if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
            return false;
        }
        this.busy_ = true;
        this.res = res;
        this.gen = this.spinGeneration;
        // Барабаны встают на символы исхода: под ниткой — res.reels.
        // Ячейку каждого берём на ленте с случайного места — один и тот же
        // символ встречается на ленте несколько раз.
        const G = GreedJunk, n = G.REEL_STRIP.length;
        GreedJunkLit.spin(res.reels.map(k => G.reelIndexOf(k, Math.floor(Math.random() * n))));
        // кошелёк в комнате считает то же состояние
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
        return true;
    },

    // ---------- БАРАБАНЫ ВСТАЛИ → ВЫПЛАТА ----------
    // Монет в лоток — сколько заплатили, но не больше горсти: сорок монет за
    // джекпот в лотке не читаются, а стоят сорока падений. Жетон и осколок
    // в лоток не сыплются (там монеты): за них — мигание ламп, а начисление
    // покажет общий кошелёк (wallet-fx). Джекпот мигает дважды.
    POUR_MAX: 40,
    onSpinDone() {
        const res = this.res, L = GreedJunkLit;
        if (!res || this.gen !== this.spinGeneration) { this.busy_ = false; return; }
        this.res = null;
        const got = Object.keys(res.currencies || {}).some(k => k !== 'gold' && res.currencies[k] > 0);
        if (res.pay > 0 && L.trayPour) L.trayPour(Math.min(this.POUR_MAX, res.pay));
        if (res.pay > (res.cost || 1) || got) L.blink();
        if (res.jackpot) this.timers.push(setTimeout(() => L.blink(), 1600));
        if (L.meterSet) L.meterSet(L.meterValue());
        // выплата досыпалась — готов к следующей крутке
        const pourMs = res.pay > 0 ? 700 + Math.min(this.POUR_MAX, res.pay) / L.TRAY.rate * 1000 : 0;
        const gen = this.gen;
        this.timers.push(setTimeout(() => {
            if (gen !== this.spinGeneration) return;
            this.busy_ = false;
            L.tryReady();
            if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
        }, pourMs + (res.jackpot ? 1600 : 0)));
    }
};

// ================= ПАЧИНКО =================
// Кнопка короба → onPach: шарик за монету (Backend.greedPlay('pachinko')
// решает лунку по весам конфига, инвариант 2). Аппарат подбирает запуск,
// который по честной физике приводит в эту лунку
// (greed-junk-lit-pachinko.js). Одна игра за раз: пока крутятся барабаны
// или летит шарик, вторая не начинается.
Object.assign(GreedMinigame, {
    onPach() {
        if (this.busy_) return false;
        const res = Backend.greedPlay('pachinko');
        if (!res.ok) return false;          // нет денег или пачинко не куплено
        this.busy_ = true;
        this.pres = res;
        this.pgen = this.spinGeneration;
        const L = GreedJunkLit;
        if (L.setReady) L.setReady(false);
        if (L.coinIn) L.coinIn();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
        return res.key;
    },

    // Шарик пойман. Монеты — в лоток; осколок и жетон — мигание ламп, их
    // начисление покажет общий кошелёк (wallet-fx). Градусник — к новой шкале.
    onPachDone() {
        const res = this.pres, L = GreedJunkLit;
        if (!res || this.pgen !== this.spinGeneration) { this.busy_ = false; return; }
        this.pres = null;
        const cur = res.currencies || {}, gold = cur.gold || 0;
        const got = Object.keys(cur).some(k => k !== 'gold' && cur[k] > 0) ||
            !!(res.items && res.items.got > 0);       // мясо в кладовую, семечка в мешок (колесо)
        if (gold > 0 && L.trayPour) L.trayPour(Math.min(this.POUR_MAX, gold));
        if (gold > 0 || got) L.blink();
        if (L.meterSet) L.meterSet(L.meterValue());
        const pourMs = gold > 0 ? 700 + Math.min(this.POUR_MAX, gold) / L.TRAY.rate * 1000 : 0;
        const gen = this.pgen;
        this.timers.push(setTimeout(() => {
            if (gen !== this.spinGeneration) return;
            this.busy_ = false;
            L.tryReady();
            if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
        }, pourMs));
    }
});

// ================= КОЛЕСО =================
// Сильный бросок → onWheel: крутка за монету (Backend.greedPlay('wheel')
// решает сектор по весам конфига). Колесо встаёт на нарисованный сектор с
// этим ключом (greed-junk-lit-wheel.js). Монеты — в лоток (и мясо,
// выплаченное деньгами при полной кладовой); мясо, семечка, осколок —
// мигание ламп, начисление покажет кошелёк. Одна игра за раз.
Object.assign(GreedMinigame, {
    onWheel() {
        if (this.busy_) return false;
        const res = Backend.greedPlay('wheel');
        if (!res.ok) return false;          // нет денег или колесо не куплено
        this.busy_ = true;
        this.pres = res;
        this.pgen = this.spinGeneration;
        const L = GreedJunkLit;
        if (L.setReady) L.setReady(false);
        if (L.coinIn) L.coinIn();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
        return res.key;
    },
    // выплата — та же, что у пачинко: монеты в лоток, остальное мигает
    onWheelDone() { this.onPachDone(); }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GreedMinigame.init());
} else {
    GreedMinigame.init();
}
