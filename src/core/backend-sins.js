// ================= ПЕРЕХОДНИК: ТЩЕСЛАВИЕ, АЛЧНОСТЬ, ГОТОВНОСТЬ ГРЕХОВ =================
// Гардероб и числа выхода, автомат, готовность грехов для колеса, порог голода.
// Продолжение LocalBackend (backend.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после backend.js.
Object.assign(LocalBackend, {

    // ---------- ТЩЕСЛАВИЕ: ГАРДЕРОБ ----------
    // Покупка предмета наряда. Ровно та же форма, что у снаряжения гнева:
    // клиент говорит «купи вот это», а хватает ли валюты — решает эта
    // сторона, позже сервер.
    //
    // Наряд НИЧЕГО не меняет в числах — ни здесь, ни в других грехах. Это
    // граница, а не недоделка: поцелуи не покупают силу, иначе появляется
    // вторая линия прогресса (docs/plan/15-progression.md, правило первое).
    buyWardrobe(itemId) {
        const item = (typeof PRIDE_WARDROBE !== 'undefined')
            ? PRIDE_WARDROBE.items.find(i => i.id === itemId) : null;
        if (!item) return { ok: false, error: 'unknown_item' };
        if (GameState.data.wardrobe[itemId]) return { ok: false, error: 'already_owned' };

        const price = item.price || {};
        const short = Object.keys(price).find(cur => GameState.currency(cur) < price[cur]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(cur => {
            GameState.addCurrency(cur, -price[cur]);
            GameState.pushLedger({
                currency: cur, delta: -price[cur],
                reason: 'wardrobe.pride.' + itemId, client_request_id: requestId
            });
        });
        GameState.data.wardrobe[itemId] = true;
        // Купил — сразу надето: покупка и есть намерение носить, а гонять
        // игрока после неё в слот значит требовать лишний тап ради ничего.
        // Тот же довод, что у снаряжения гнева.
        GameState.data.cosmetics[item.slot] = itemId;
        GameState.save();
        return { ok: true, item: itemId, slot: item.slot };
    },

    // Надеть или снять (itemId = null). Проверка одна: носить можно только
    // купленное — иначе примерочная превращается в бесплатный магазин.
    wearCosmetic(slot, itemId) {
        if (!GameState.data.cosmetics) GameState.data.cosmetics = {};
        if (itemId && !GameState.data.wardrobe[itemId]) return { ok: false, error: 'not_owned' };
        if (itemId) GameState.data.cosmetics[slot] = itemId;
        else delete GameState.data.cosmetics[slot];
        GameState.save();
        return { ok: true, slot, item: itemId || null };
    },

    // ---------- ТЩЕСЛАВИЕ: ЧИСЛА ВЫХОДА ----------
    // Мини-игра спрашивает, с чем она сегодня выходит на дорожку, и не
    // считает этого сама: и база, и купленные ступени — конфиг (инвариант 3).
    prideRun() {
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.pride) || {};
        const levels = {
            crowd: GameState.upgradeLevel('pride_crowd'),
            car: GameState.upgradeLevel('pride_car'),
            carpet: GameState.upgradeLevel('pride_carpet')
        };
        // ---------- СКРЫТАЯ РУЧКА ----------
        // Частоту зон двигает ЛЮБАЯ купленная ступень любой линии, а не
        // отдельная покупка. Поэтому она и считается здесь, из суммы всех
        // уровней: прокачка ощущается сильнее, чем обещает ценник.
        const steps = levels.crowd + levels.car + levels.carpet;
        const spawn = Math.max(cfg.spawnFloor || 430,
                               (cfg.spawnBase || 620) - (cfg.spawnStep || 8) * steps);
        return {
            runMs: cfg.runMs || 20000,
            kissBag: Object.assign({ of: 4, kisses: 1 }, cfg.kissBag || {}),
            maxTargets: cfg.maxTargets || 5,
            // Платят ли за этот выход. Решает не мини-игра — она только
            // спрашивает: при сытом черве поцелуйных зон не бывает вовсе,
            // и правило видно глазом, а не выводится из пустого кошелька.
            pays: this.sinPays('pride'),
            streak: Object.assign({ perHit: 1, needForKiss: 1,
                                    breakOnMiss: true, breakOnMissclick: true },
                                  cfg.streak || {}),
            spawnMs: spawn,
            steps,
            radius: this.upgradeValue('pride', 'crowd'),
            multCap: this.upgradeValue('pride', 'car'),
            lifeMs: this.upgradeValue('pride', 'carpet'),
            levels
        };
    },

    // ---------- АЛЧНОСТЬ: ОДНА КРУТКА АВТОМАТА ----------
    // Автомат — единственный грех, который не платит игроку, а берёт с него,
    // и единственная мини-игра, которая ходит сюда не один раз в конце, а на
    // каждое действие: крутка — это транзакция (списали ставку, разыграли
    // барабаны, выплатили), а не «исход захода».
    //
    // Мини-игра НЕ решает ничего (инвариант 2): она просит крутку и получает
    // готовые три символа с выплатой. Ни весов, ни таблицы выплат, ни
    // гарантии на её стороне нет — иначе автомат можно было бы уговорить из
    // консоли, а на сервере это место станет ровно тем же вызовом.
    //
    // ---------- ПОЧЕМУ ВЫПЛАТА НЕ ИДЁТ ЧЕРЕЗ ПОРОГ ГОЛОДА ----------
    // Порог (sinPays) не даёт СЫТОМУ грехy платить валютой, и для шести
    // грехов это правильно: там валюта — награда за заход. Здесь выплата —
    // возврат части СВОИХ ЖЕ денег, отданных за крутку. Прогони её через
    // порог — и у сытого червя возврат 75% превращается в 0%, то есть в
    // прямой отъём монет за нажатие рычага. Поэтому порог тут не при чём, а
    // сток обеспечен другим: возврат заведомо меньше сотни, и в минус
    // уходит кошелёк всегда, играй хоть сытым, хоть голодным.
    //
    // bet — ставка из ECONOMY.minigames.greed.bets; без неё первая. Множит
    // цену и каждую награду, шансов не трогает (docs/plan/28-greed-machine.md).
    greedSpin(bet) {
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.greed) || null;
        if (!cfg) return { ok: false, error: 'no_config' };
        bet = bet || this.greedBets('slots')[0] || 1;
        if (this.greedBets('slots').indexOf(bet) === -1) return { ok: false, error: 'bet_locked', bet };

        const cost = (cfg.spinCost || 0) * bet;
        const balance = GameState.currency('gold');
        // Крутка не уходит в минус. Особого режима для пустого кошелька нет
        // сознательно: золото дают почти все грехи, монета находится за
        // минуту (docs/plan/16-greed-slots.md, раздел 6).
        if (balance < cost) {
            return { ok: false, error: 'not_enough', currency: 'gold', balance };
        }

        const requestId = newRequestId();
        if (cost > 0) {
            GameState.addCurrency('gold', -cost);
            GameState.pushLedger({
                currency: 'gold', delta: -cost,
                reason: 'greed.slots.spin', client_request_id: requestId
            });
        }

        // ---------- ГАРАНТИЯ ПРОТИВ ТИЛЬТА ----------
        // Она не доплачивает поверх пустых барабанов, а ПОДМЕНЯЕТ бросок:
        // барабаны встают на тройку из конфига, и выплату она получает по
        // общей таблице. В игре без слов иначе нельзя — монеты, упавшие при
        // пустых барабанах, читаются как поломка, а не как подарок.
        const dry = Math.max(0, Math.floor(GameState.data.greed.dry || 0));
        const pity = dry >= ((cfg.pity && cfg.pity.spins) || Infinity) - 1;
        let reels = pity
            ? [cfg.pity.key, cfg.pity.key, cfg.pity.key]
            : [this.greedRoll(cfg), this.greedRoll(cfg), this.greedRoll(cfg)];

        let pay = this.greedPay(cfg, reels);
        const won = pay > 0;

        // ---------- ВТОРОЙ ПУЛ ТРОЙКИ ----------
        // Тройка уже выбрана, теперь решается, чем она платит. Гарантия
        // всегда платит монетами: это утешение, а не лотерея.
        const awarded = { currencies: {} };
        const sym = (cfg.reel || []).find(x => x.key === reels[0]);
        const alt = !pity && won && reels[0] === reels[1] && reels[1] === reels[2] && sym && sym.alt;
        if (alt && Math.random() < alt.chance) {
            reels = [alt.altKey, alt.altKey, alt.altKey];
            pay = 0;
            Object.keys(alt.give).forEach(k => {
                this.award(awarded, k, alt.give[k] * bet, 'greed.slots.win', requestId);
            });
            this.settleExchange(awarded, requestId);
        }

        pay *= bet;
        if (pay > 0) this.award(awarded, 'gold', pay, 'greed.slots.win', requestId);
        GameState.data.greed.dry = won ? 0 : dry + 1;

        // ---------- ШКАЛУ НАЛИВАЕТ КАЖДАЯ КРУТКА ----------
        // Независимо от исхода — в этом вся механика: любое действие
        // небесполезно, а золото идёт драмой сверху, а не условием закрытия
        // потребности (docs/plan/16-greed-slots.md, раздел 1).
        GameState.setSinValue('greed', GameState.sinValue('greed') + (cfg.fillPerSpin || 0));

        GameState.touch();
        GameState.save();

        return {
            ok: true,
            reels,
            pay,
            cost,
            bet,
            // Всё, что пришло, кроме золота тоже: жетонная тройка платит
            // осколком или жетоном, и экрану надо знать, чем шуметь.
            currencies: awarded.currencies,
            pity,
            // Джекпот — не отдельная запись в конфиге, а просто самая дорогая
            // тройка: экрану надо знать, когда шуметь громче обычного.
            jackpot: pay > 0 && reels[0] === reels[1] && reels[1] === reels[2]
                     && reels[0] === this.greedTopKey(cfg),
            dry: GameState.data.greed.dry,
            sinValue: GameState.sinValue('greed'),
            balance: GameState.currency('gold')
        };
    },

    // Один барабан. Веса — ВИРТУАЛЬНЫЕ позиции: шанс задаёт вес, а не число
    // картинок на ленте (патент Телнеса, см. docs/plan/16-greed-slots.md).
    greedRoll(cfg) {
        const reel = cfg.reel || [];
        const total = reel.reduce((s, sym) => s + sym.weight, 0);
        let r = Math.random() * total;
        for (let i = 0; i < reel.length; i++) {
            r -= reel[i].weight;
            if (r <= 0) return reel[i].key;
        }
        return reel[reel.length - 1].key;
    },

    // Сколько платит выпавшая тройка. Правил ровно два: три одинаковых по
    // таблице и ровно две монеты — возврат ставки.
    greedPay(cfg, reels) {
        const find = key => (cfg.reel || []).find(s => s.key === key) || { pay: 0 };
        if (reels[0] === reels[1] && reels[1] === reels[2]) return find(reels[0]).pay || 0;
        const pairKey = cfg.pair && cfg.pair.key;
        if (pairKey && reels.filter(k => k === pairKey).length === 2) return cfg.pair.pay || 0;
        return 0;
    },

    // Самый дорогой символ таблицы. Считается, а не записан вторым числом в
    // конфиг: иначе правка выплат разъедет с «что считать джекпотом».
    greedTopKey(cfg) {
        return (cfg.reel || []).reduce((best, s) => (!best || s.pay > best.pay ? s : best), null).key;
    },

    // ---------- ГОТОВНОСТЬ АЛЧНОСТИ ДЛЯ КОЛЕСА ГРЕХОВ ----------
    // У шести грехов узел в колесе горит по одному правилу — шкала просела
    // до порога голода. У автомата к этому добавляется ВТОРОЕ условие:
    // монета в кошельке. Пустой кошелёк здесь не «сыграй бесплатно», а
    // «сюда сейчас незачем»: крутка не состоится, шкала не нальётся, и
    // горящий узел обещал бы то, чего не будет.
    //
    // Живёт здесь, а не в колесе: что считать готовностью, знает тот, кто
    // платит (инвариант 2). Колесо только спрашивает.
    greedReady() {
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.greed) || {};
        const max = GameState.maxValue('greed') || 1;
        const value = GameState.sinValue('greed');
        return {
            fill: 100 - (value / max) * 100,
            ready: this.sinPays('greed') && GameState.currency('gold') >= (cfg.spinCost || 0)
        };
    },

    // Что нужно экрану, чтобы нарисовать автомат: ставка, кошелёк и таблица
    // выплат. Мини-игра не берёт их из ECONOMY напрямую по той же причине,
    // по которой не считает исход: на сервере этих чисел у неё не будет.
    greedTable() {
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.greed) || {};
        return {
            cost: cfg.spinCost || 0,
            fillPerSpin: cfg.fillPerSpin || 0,
            balance: GameState.currency('gold'),
            symbols: (cfg.reel || []).map(s => ({ key: s.key, pay: s.pay || 0 })),
            pair: Object.assign({}, cfg.pair || {}),
            top: this.greedTopKey(cfg)
        };
    },

    // ---------- ГОТОВНОСТЬ ГНЕВА ДЛЯ КОЛЕСА ГРЕХОВ ----------
    // У пяти грехов узел в колесе горит по умолчанию — шкала просела до
    // порога голода. У гнева порога нет вовсе (rewards.wrath.duel,
    // alwaysPays): за бой платят всегда, и общее правило показывало бы
    // погасший узел там, где награда на самом деле будет. Колесо, которое
    // врёт в эту сторону, ничем не лучше колеса, обещающего лишнее.
    //
    // Поэтому у гнева своя мера, и это ЗДОРОВЬЕ бойца. Оно и есть тормоз
    // греха, и оно же — то единственное, из-за чего в гнев сейчас может быть
    // рано идти. По лучу течёт заросшее здоровье, узел загорается на полном:
    // бой съедает почти весь запас, и заход побитым — это почти наверняка
    // поражение (симулятор: 44% побед с полной полосой против 26% с 80%).
    //
    // Живёт здесь, а не в колесе: что считать готовностью, знает тот, кто
    // платит (инвариант 2). Максимум приходит снаружи: он зависит от
    // снаряжения и прокачки, а это знает сборщик бойца (WrathFighter), не
    // переходник.
    wrathReady(maxHp) {
        const max = maxHp || (ECONOMY.minigames.wrath || {}).baseHp || 1;
        const hp = GameState.fighterHpExact(max);
        return { fill: (hp / max) * 100, ready: hp >= max };
    },

    // ---------- ПОРОГ ГОЛОДА ----------
    // Платит ли грех за заход прямо сейчас. Правило одно на всю игру:
    // валюту и золото выдают, только пока шкала опустилась до payAt или ниже
    // (ECONOMY.sins.<грех>.payAt). У греха без этого поля правило не заведено —
    // он платит всегда, как раньше.
    //
    // Смысл — в замене убывающей доходности, которая резала ЗАРАБОТАННОЕ.
    // Здесь ничего не режется: перешёл порог — получи всё до последней монеты,
    // не перешёл — сыграй сколько хочешь, но кошелёк не тронется.
    sinPays(sinKey) {
        const cfg = (ECONOMY.sins && ECONOMY.sins[sinKey]) || {};
        // Грех со своим таймером награды (у похоти): платят, когда таймер
        // истёк, и шкала тут ни при чём — потребность и награда разведены
        // (docs/plan/21-lust-bath.md, разд. 7а).
        if (cfg.rewardEvery) return GameTime.now() >= GameState.rewardReadyAt(sinKey);
        if (cfg.payAt == null) return true;
        return GameState.sinValue(sinKey) <= cfg.payAt;
    },

    // ---------- ГОТОВНОСТЬ ПОХОТИ ДЛЯ КОЛЕСА ГРЕХОВ ----------
    // Узел горит по ТАЙМЕРУ НАГРАДЫ, а не по шкале: шкала у похоти — это
    // потребность, и её просадка больше ничего не открывает. По лучу течёт
    // то, сколько таймера уже прошло: пустой луч — только что сыграли на
    // жетон, полный — награда готова.
    rewardReady(sinKey) {
        const hours = GameState.rewardCooldownHours(sinKey) || 1;
        const at = GameState.rewardReadyAt(sinKey);
        const left = Math.max(0, (at - GameTime.now()) / 3600000);
        return { fill: 100 * (1 - Math.min(1, left / hours)), ready: left <= 0, hoursLeft: left };
    },

    // Всё, что нужно экрану, чтобы показать это правило: где сейчас шкала,
    // где порог и сколько ЧАСОВ до него осталось. Часы считаются из
    // drainHours — той же скорости падения, что и шкала, так что второе
    // место, где эта скорость записана, не появляется.
    //
    // Внутри мини-игры это не показывается и показываться не должно: там
    // правило и так видно — у сытого червя просто нет поцелуйных зон, а
    // цифры «сколько ждать» посреди выхода лишние. Индикация будет ОДНА на
    // все семь грехов и снаружи мини-игр; этот метод — то, из чего она
    // соберётся.
    sinPayInfo(sinKey) {
        const cfg = (ECONOMY.sins && ECONOMY.sins[sinKey]) || {};
        const max = GameState.maxValue(sinKey);
        const value = GameState.sinValue(sinKey);
        if (cfg.rewardEvery) {
            const r = this.rewardReady(sinKey);
            return { pays: r.ready, value, max, threshold: null, hoursLeft: r.hoursLeft };
        }
        if (cfg.payAt == null) return { pays: true, value, max, threshold: null, hoursLeft: 0 };
        const hours = GameState.drainHours(sinKey);
        const perHour = hours ? max / hours : 0;
        const left = perHour > 0 ? Math.max(0, (value - cfg.payAt) / perHour) : 0;
        return { pays: value <= cfg.payAt, value, max, threshold: cfg.payAt, hoursLeft: left };
    },

    // Выдать валюту напрямую. Пока это только debug-режим: настоящие
    // источники (бой, рогалик) идут через minigameResult и свой конфиг наград.
    grantCurrency(key, amount) {
        if (!ECONOMY.currencies[key] || !amount) return false;
        GameState.addCurrency(key, amount);
        GameState.pushLedger({ currency: key, delta: amount, reason: 'debug.grant' });
        this.settleExchange(null, null);
        GameState.save();
        return true;
    },

    // rewards[грех][режим][исход], иначе общее правило.
    resolveReward(sin, mode, outcome) {
        const bySin = ECONOMY.rewards[sin];
        const byMode = bySin && bySin[mode];
        const exact = byMode && byMode[outcome];
        if (exact) return exact;
        if (byMode && byMode.default) return byMode.default;
        return ECONOMY.rewards.default;
    },
});
