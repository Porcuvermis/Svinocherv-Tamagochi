// ================= ПЕРЕХОДНИК: АППАРАТ АЛЧНОСТИ =================
// Уровни трёх игр аппарата, ставки, колесо фортуны и пачинко. Сама крутка
// бандита — greedSpin в backend-sins.js: она старше аппарата, и экран
// автомата зовёт её напрямую.
// Продолжение LocalBackend (backend.js), подключается после backend-sins.js.
// Замысел — docs/plan/28-greed-machine.md.
Object.assign(LocalBackend, {

    GREED_GAMES: ['slots', 'wheel', 'pachinko'],

    // ---------- УРОВЕНЬ ИГРЫ ----------
    // 0 — закрыта, 1 — открыта, 2 — апгрейд. Хранится на общем станке
    // прокачки (upgrades.greed_<игра>): открытие и апгрейд — это просто
    // ступени ветки, и покупает их общий buyUpgrade(игра, 'greed'). Своей
    // кассы аппарату не нужно.
    greedLevel(game) {
        return this.upgradeValue('greed', game) || 0;
    },

    // ---------- КОПИЛКИ БАНКИ-МАГАЗИНА ----------
    // Узел открыт (игра стоит в аппарате) — по уровню, а не по копилке:
    // ступень могла прийти и из отладки. Версия 2 копится, только когда
    // открыты обе ветки.
    greedJar() {
        const need = (ECONOMY.minigames.greed && ECONOMY.minigames.greed.jar) || {};
        const jar = (GameState.data.greed && GameState.data.greed.jar) || {};
        const done = { wheel: this.greedLevel('wheel') >= 1, pachinko: this.greedLevel('pachinko') >= 1, v2: this.greedLevel('slots') >= 2 };
        const at = (k) => done[k] ? need[k] : Math.min(need[k], jar[k] || 0);
        return { need, done, have: GameState.currency('greed_token'),
                 wheel: at('wheel'), pachinko: at('pachinko'), v2: at('v2'), v2open: done.wheel && done.pachinko };
    },

    // Один жетон алчности в копилку узла. Узел наполнился — ступень
    // открывается здесь же: колесо/пачинко — первый уровень; версия 2 —
    // второй всем трём играм (ставки 3/10/100 — по уровню, greedBets).
    greedDeposit(node) {
        const J = this.greedJar();
        if (!(node in J.need)) return { ok: false, error: 'unknown' };
        if (J.done[node]) return { ok: false, error: 'done' };
        if (node === 'v2' && !J.v2open) return { ok: false, error: 'closed' };
        if (J.have < 1) return { ok: false, error: 'not_enough' };
        GameState.addCurrency('greed_token', -1);
        GameState.pushLedger({ currency: 'greed_token', delta: -1, reason: 'greed.jar.' + node, client_request_id: newRequestId() });
        const jar = GameState.data.greed.jar;
        jar[node] = (jar[node] || 0) + 1;
        let opened = false;
        if (jar[node] >= J.need[node]) {
            opened = true;
            const up = GameState.data.upgrades || (GameState.data.upgrades = {});
            if (node === 'v2') { up.greed_slots = 1; up.greed_wheel = 2; up.greed_pachinko = 2; }
            else up['greed_' + node] = Math.max(1, up['greed_' + node] || 0);
        }
        GameState.save();
        return { ok: true, node, filled: jar[node], need: J.need[node], opened };
    },

    // Какие ставки доступны игре сейчас. До апгрейда — только первая.
    greedBets(game) {
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.greed) || {};
        const bets = cfg.bets || [1];
        const level = this.greedLevel(game);
        if (level <= 0) return [];
        return level >= (cfg.betsAtLevel || Infinity) ? bets.slice() : bets.slice(0, 1);
    },

    // ---------- ЧТО НУЖНО ЭКРАНУ АППАРАТА ----------
    // Уровни, ставки, следующая цена. Цену экран не считает сам по той же
    // причине, по которой не считает исход: на сервере конфига у него нет.
    greedMachine() {
        const ups = (ECONOMY.minigames.greed && ECONOMY.minigames.greed.upgrades) || {};
        const games = {};
        this.GREED_GAMES.forEach(game => {
            const branch = ups[game];
            const step = GameState.upgradeLevel(this.upgradeKey('greed', game));
            const next = branch && branch.levels[step];
            games[game] = {
                level: this.greedLevel(game),
                bets: this.greedBets(game),
                nextPrice: next ? Object.assign({}, next.price) : null
            };
        });
        return { games, balance: GameState.currency('gold') };
    },

    // ---------- КОЛЕСО И ПАЧИНКО ----------
    // Одна крутка — один взвешенный исход. Гарантии против тильта здесь нет:
    // она нужна бандиту, где пустая крутка — три пустых барабана, а у колеса
    // и пачинко награды мелкие и частые.
    //
    // Остальное как у бандита: ставка списывается сразу, шкалу наливает
    // каждая крутка, мини-игра получает готовый исход (инвариант 2).
    greedPlay(game, bet) {
        if (game === 'slots') return this.greedSpin(bet);
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.greed) || null;
        const list = cfg && (game === 'wheel' ? cfg.wheel && cfg.wheel.sectors
                          : game === 'pachinko' ? cfg.pachinko && cfg.pachinko.pockets : null);
        if (!list) return { ok: false, error: 'unknown_game', game };
        if (this.greedLevel(game) <= 0) return { ok: false, error: 'locked', game };

        bet = bet || this.greedBets(game)[0] || 1;
        if (this.greedBets(game).indexOf(bet) === -1) return { ok: false, error: 'bet_locked', game, bet };

        const cost = (cfg.spinCost || 0) * bet;
        const balance = GameState.currency('gold');
        if (balance < cost) return { ok: false, error: 'not_enough', currency: 'gold', balance };

        const requestId = newRequestId();
        if (cost > 0) {
            GameState.addCurrency('gold', -cost);
            GameState.pushLedger({
                currency: 'gold', delta: -cost,
                reason: 'greed.' + game + '.spin', client_request_id: requestId
            });
        }

        const hit = this.greedPick(list);
        const awarded = { currencies: {} };
        const reason = 'greed.' + game + '.win';
        const items = this.greedGiveItem(hit, bet, awarded, reason, requestId);
        if (hit.give) {
            Object.keys(hit.give).forEach(k => {
                this.award(awarded, k, hit.give[k] * bet, reason, requestId);
            });
        }
        this.settleExchange(awarded, requestId);

        GameState.setSinValue('greed', GameState.sinValue('greed') + (cfg.fillPerSpin || 0));
        GameState.touch();
        GameState.save();

        return {
            ok: true, game, bet, cost,
            key: hit.key,
            currencies: awarded.currencies,
            items,
            sinValue: GameState.sinValue('greed'),
            balance: GameState.currency('gold')
        };
    },

    greedPick(list) {
        const total = list.reduce((s, x) => s + x.weight, 0);
        let r = Math.random() * total;
        for (let i = 0; i < list.length; i++) {
            r -= list[i].weight;
            if (r <= 0) return list[i];
        }
        return list[list.length - 1];
    },

    // Вещь с колеса: продукт в кладовую, семечка в мешок. Что не влезло в
    // кладовую, платится монетной ценой вещи (план, разд. 6) — сразу, а не
    // отказом: крутка уже состоялась, и пропажа выигрыша читалась бы как
    // обман. Остаток округляется вверх: «недоплатить» полмонеты обиднее,
    // чем переплатить.
    greedGiveItem(hit, bet, awarded, reason, requestId) {
        const n = (hit.n || 1) * bet;
        if (hit.pantry) {
            const got = this.pantryStore(hit.pantry, n);
            const rest = n - got;
            if (rest > 0) this.award(awarded, 'gold', Math.ceil(rest * (hit.value || 0)), reason + '.full', requestId);
            return { pantry: hit.pantry, got, rest };
        }
        if (hit.seed) {
            this.gardenSeedAdd(hit.seed, n);
            return { seed: hit.seed, got: n, rest: 0 };
        }
        return null;
    },
});
