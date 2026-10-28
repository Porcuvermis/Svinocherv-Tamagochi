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
    // Идущие игры: у каждой своя — бандит, колесо и пачинко играются
    // параллельно, у каждой свой «кулдаун» (решение игрока). Было: один флаг
    // на всё — пока досыпалась выплата бандита, сильный бросок колеса
    // молча превращался в холостой проворот.
    play: { slots: null, wheel: null, pachinko: null },
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
        this.play = { slots: null, wheel: null, pachinko: null };
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
                canReady: () => this.isOpen() && !this.play.slots
            });
            if (L.meterSet) L.meterSet(L.meterValue());
            const A = typeof GreedCoins !== 'undefined' && GreedCoins.loadAtlas ? GreedCoins.loadAtlas() : null;
            Promise.resolve(drawn).then(() => L.settled ? L.settled() : null).then(() => {
                const shown = () => requestAnimationFrame(() => ready());
                if (A && !A.ready) A.wait.push(shown); else shown();
            });
        }));
    },

    // Идёт крутка или выплата: game — одной игры, без него — любой.
    busy(game) {
        const P = this.play;
        return game ? !!P[game] : !!(P.slots || P.wheel || P.pachinko);
    },

    // ---------- КОШЕЛЁК В БАНКЕ ----------
    // Бэкенд списывает ставку и начисляет выигрыш одним вызовом, в начале
    // игры. Банка показывает их по отдельности, как видит игрок: ставка
    // уходит сразу (монета летит из банки в щель), выигрыш приходит, когда
    // выпал. Пока игра идёт, её выигрыш «придержан» (jarHold) — банка
    // показывает кошелёк без него. Было: число менялось только на крутке —
    // выиграл три, а на банке ничего, и следующая крутка давала «+2».
    goldWon(res) { return (res && res.currencies && res.currencies.gold) || 0; },
    started(game, res) {
        this.play[game] = { res, gen: this.spinGeneration };
        if (typeof GreedJunkLit !== 'undefined' && GreedJunkLit.jarHold) GreedJunkLit.jarHold(this.goldWon(res));
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
    },
    // результат показан: выигрыш — в банку; null — игра устарела (окно закрыто)
    settled(game) {
        const p = this.play[game];
        if (!p || p.gen !== this.spinGeneration) return null;
        if (typeof GreedJunkLit !== 'undefined' && GreedJunkLit.jarHold) GreedJunkLit.jarHold(-this.goldWon(p.res));
        return p;
    },
    // выплата досыпалась — игра свободна
    finished(game, gen) {
        if (gen !== this.spinGeneration) return;
        this.play[game] = null;
        if (game === 'slots') GreedJunkLit.tryReady();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI(true);
    },

    // Готовность для покрова перехода: см. open().
    veilReady() { return this._readyP || Promise.resolve(); },

    close() {
        this.spinGeneration++;
        this.timers.forEach(clearTimeout);
        this.timers = [];
        this.play = { slots: null, wheel: null, pachinko: null };
        // выигрыши уже начислены — придержанное в банке больше не нужно
        if (typeof GreedJunkLit !== 'undefined' && GreedJunkLit.jarHold) GreedJunkLit.jarHold(null);
        if (this.screenElement) this.screenElement.classList.remove('active');
        if (typeof MinigameWindow !== 'undefined') MinigameWindow.resumeRoom();
    },

    // ---------- РЫВОК → КРУТКА ----------
    // Аппарат спрашивает на срыве рычага; false — крутки нет (денег нет):
    // монета вываливается в ковш возврата, барабаны стоят. Отказ отдаёт и
    // в палец — иначе дотянутый рычаг, за которым ничего не случилось,
    // читается как несработавшее касание.
    onPull() {
        if (this.play.slots) return false;
        const res = Backend.greedSpin();
        if (!res.ok) {
            if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
            return false;
        }
        this.started('slots', res);
        // Барабаны встают на символы исхода: под ниткой — res.reels.
        // Ячейку каждого берём на ленте с случайного места — один и тот же
        // символ встречается на ленте несколько раз.
        const G = GreedJunk, n = G.REEL_STRIP.length;
        GreedJunkLit.spin(res.reels.map(k => G.reelIndexOf(k, Math.floor(Math.random() * n))));
        return true;
    },

    // ---------- БАРАБАНЫ ВСТАЛИ → ВЫПЛАТА ----------
    // Монет в лоток — сколько заплатили, но не больше горсти: сорок монет за
    // джекпот в лотке не читаются, а стоят сорока падений. Жетон и осколок
    // в лоток не сыплются (там монеты): за них — мигание ламп, а начисление
    // покажет общий кошелёк (wallet-fx). Джекпот мигает дважды.
    POUR_MAX: 40,
    onSpinDone() {
        const p = this.settled('slots'), L = GreedJunkLit;
        if (!p) { this.play.slots = null; return; }
        const res = p.res;
        const got = Object.keys(res.currencies || {}).some(k => k !== 'gold' && res.currencies[k] > 0);
        if (res.pay > 0 && L.trayPour) L.trayPour(Math.min(this.POUR_MAX, res.pay));
        if (res.pay > (res.cost || 1) || got) L.blink();
        if (res.jackpot) this.timers.push(setTimeout(() => L.blink(), 1600));
        if (L.meterSet) L.meterSet(L.meterValue());
        // выплата досыпалась — готов к следующей крутке
        const pourMs = res.pay > 0 ? 700 + Math.min(this.POUR_MAX, res.pay) / L.TRAY.rate * 1000 : 0;
        this.timers.push(setTimeout(() => this.finished('slots', p.gen), pourMs + (res.jackpot ? 1600 : 0)));
    }
};

// ================= ПАЧИНКО И КОЛЕСО =================
// Кнопка короба → onPach: шарик за монету (Backend.greedPlay('pachinko')
// решает лунку по весам конфига, инвариант 2). Аппарат подбирает запуск,
// который по честной физике приводит в эту лунку
// (greed-junk-lit-pachinko.js). Сильный бросок колеса → onWheel: крутка за
// монету, колесо встаёт на нарисованный сектор с решённым ключом
// (greed-junk-lit-wheel.js). Каждая игра ждёт только себя: барабаны, колесо
// и шарик идут одновременно.
Object.assign(GreedMinigame, {
    // начать игру game; false — не состоялась (занята, нет денег, не куплена)
    startPlay(game) {
        if (this.play[game]) return false;
        const res = Backend.greedPlay(game);
        if (!res.ok) return false;
        this.started(game, res);
        if (GreedJunkLit.coinIn) GreedJunkLit.coinIn();
        return res.key;
    },
    onPach() { return this.startPlay('pachinko'); },
    onWheel() { return this.startPlay('wheel'); },
    onPachDone() { this.playDone('pachinko'); },
    onWheelDone() { this.playDone('wheel'); },

    // Шарик пойман / колесо встало. Монеты — в лоток (и мясо, выплаченное
    // деньгами при полной кладовой); осколок, жетон, мясо, семечка — мигание
    // ламп, их начисление покажет общий кошелёк (wallet-fx). Градусник — к
    // новой шкале.
    playDone(game) {
        const p = this.settled(game), L = GreedJunkLit;
        if (!p) { this.play[game] = null; return; }
        const res = p.res, cur = res.currencies || {}, gold = cur.gold || 0;
        const got = Object.keys(cur).some(k => k !== 'gold' && cur[k] > 0) ||
            !!(res.items && res.items.got > 0);       // мясо в кладовую, семечка в мешок (колесо)
        if (gold > 0 && L.trayPour) L.trayPour(Math.min(this.POUR_MAX, gold));
        if (gold > 0 || got) L.blink();
        if (L.meterSet) L.meterSet(L.meterValue());
        const pourMs = gold > 0 ? 700 + Math.min(this.POUR_MAX, gold) / L.TRAY.rate * 1000 : 0;
        this.timers.push(setTimeout(() => this.finished(game, p.gen), pourMs));
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GreedMinigame.init());
} else {
    GreedMinigame.init();
}
