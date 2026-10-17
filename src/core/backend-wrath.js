// ================= ПЕРЕХОДНИК: ГНЕВ =================
// Здоровье и зарастание бойца, обмен шрамов, снаряжение, характеристики,
// броня, соперник и подбор по силе, магазин гнева.
// Продолжение LocalBackend (backend.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после backend.js.
Object.assign(LocalBackend, {

    // ---------- ЗДОРОВЬЕ БОЙЦА ----------
    // Записать, сколько здоровья осталось. Вызывается после каждого раунда, а
    // не только в конце боя: если игрок закроет игру посреди драки, здоровье
    // должно остаться таким, каким он её оставил, а не откатиться к целому.
    //
    // Хранится значение плюс метка времени; сколько заросло с тех пор,
    // считает стор по формуле (GameState.fighterHp).
    setFighterHp(hp) {
        const f = GameState.data.fighter || {};
        GameState.data.fighter = {
            hp: Math.max(0, Math.round(hp)),
            updated_at: GameTime.now(),
            // Заморозку не трогаем: запись идёт в том числе посреди боя, где
            // регенерация как раз остановлено.
            frozen: !!f.frozen
        };
        GameState.save();
        return GameState.data.fighter;
    },

    // ---------- ПАУЗА ЗАРАСТАНИЯ ----------
    // Само по себе здоровье восстанавливается везде: в комнате, в лобби, при закрытой
    // игре. Но не там, где здоровье — ресурс текущего испытания: в бою и в
    // забеге рогалика (там своё лечение). Поэтому бой на входе замораживает
    // регенерация, а лобби на входе размораживает.
    //
    // Флаг живёт в состоянии, а не в памяти экрана: игру закрывают прямо
    // посреди боя, и «пока меня не было, всё заросло» было бы читом.
    // Разморозка при этом всегда происходит при возврате в лобби — даже
    // после того, как игру закрыли и открыли заново.
    freezeHeal() {
        const f = GameState.data.fighter;
        if (!f || f.frozen) return;
        // Фиксируем то, что накапало до этого момента. Потолок здесь не
        // нужен: он зависит от снаряжения и применяется при чтении.
        const raw = GameState.fighterHpRaw();
        if (raw !== null) f.hp = Math.floor(raw);
        f.updated_at = GameTime.now();
        f.frozen = true;
        GameState.save();
    },

    resumeHeal() {
        const f = GameState.data.fighter;
        if (!f || !f.frozen) return;
        f.frozen = false;
        // Отсчёт начинается заново: время, проведённое в бою, не восстанавливается
        // задним числом.
        f.updated_at = GameTime.now();
        GameState.save();
    },

    // ---------- ОБМЕН ШРАМОВ ----------
    // Пачка шрамов сходит с тела и превращается в валюту. Решение о том,
    // сколько шрамов и что за них дают, живёт в конфиге, а не в экране —
    // как и любое другое начисление.
    //
    // Уходят САМЫЕ СТАРЫЕ: тело восстанавливается в том же порядке, в каком его било,
    // и свежие следы последнего боя остаются на месте. Случайный выбор
    // выглядел бы как «шрамы исчезли непонятно какие».
    // Сколько полных пятнашек шрамов лежит на теле. Ноль означает «менять
    // нечего» — по нему жест отказывает СРАЗУ, не заставляя держать палец.
    scarBatches() {
        const rule = ECONOMY.marks && ECONOMY.marks.exchange;
        if (!rule || !rule.scars) return 0;
        return Math.floor(((GameState.data.scars || []).length) / rule.scars);
    },

    exchangeScars() {
        const rule = ECONOMY.marks && ECONOMY.marks.exchange;
        const scars = GameState.data.scars || [];
        if (!rule) return { ok: false, error: 'no_rule' };
        if (scars.length < rule.scars) {
            return { ok: false, error: 'not_enough', have: scars.length, need: rule.scars };
        }

        // ---------- МЕНЯЕТСЯ ВСЁ, ЧТО НАБРАЛОСЬ ----------
        // Сколько полных пятнашек накопилось, столько наград и даётся, за
        // ОДНО удержание. Остаток остаётся на теле. Раньше уходила ровно одна
        // пятнашка, и при тридцати шрамах игроку пришлось бы держать палец
        // дважды — это уже не жест, а работа.
        const batches = Math.floor(scars.length / rule.scars);
        const take = batches * rule.scars;

        const oldestFirst = scars.slice().sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        const removed = oldestFirst.slice(0, take);
        const removedIds = {};
        removed.forEach(m => { removedIds[m.id] = true; });
        GameState.data.scars = scars.filter(m => !removedIds[m.id]);

        const gained = rule.amount * batches;
        const requestId = newRequestId();
        GameState.addCurrency(rule.currency, gained);
        GameState.pushLedger({
            currency: rule.currency,
            delta: gained,
            reason: 'exchange.scars',
            client_request_id: requestId
        });
        // Осколки могли сложиться в жетон.
        this.settleExchange(null, requestId);
        GameState.save();

        return {
            ok: true,
            removed: removed.length,
            batches,
            left: GameState.data.scars.length,
            currency: rule.currency,
            amount: gained
        };
    },

    // ---------- СНАРЯЖЕНИЕ ГНЕВА ----------
    // Надеть предмет в слот. Начислением это не является, но живёт здесь по
    // той же причине, что смена локации: проверки «есть ли предмет у игрока»
    // и «подходит ли он этому слоту» — решение сервера, а не интерфейса.
    // Сейчас проверки те же самые, просто исполняются на месте.
    equip(slot, itemId) {
        const item = itemId ? WRATH_GEAR.items[itemId] : null;
        if (itemId && !item) return false;
        if (item && item.slot !== slot) return false;
        if (itemId && !GameState.data.inventory[itemId]) return false;

        if (itemId) GameState.data.equipment[slot] = itemId;
        else delete GameState.data.equipment[slot];
        GameState.save();
        return true;
    },

    // Положить предмет в инвентарь. Единственный источник предметов до
    // появления магазина и рогалика — debug-режим; когда источники появятся,
    // они будут звать этот же метод, а не писать в состояние сами.
    grantItem(itemId) {
        if (!WRATH_GEAR.items[itemId]) return false;
        const inv = GameState.data.inventory;
        inv[itemId] = inv[itemId] || { count: 0 };
        inv[itemId].count += 1;
        GameState.save();
        return true;
    },

    // ---------- ХАРАКТЕРИСТИКИ БОЙЦА ----------
    // Сборка «снаряжение + прокачка → три числа» живёт ЗДЕСЬ, а не в
    // мини-игре, и это не переезд ради красоты. Раньше её делал
    // WrathFighter.stats, и прокачку он читал прямо из состояния игрока —
    // чьи бы числа ни считал. То есть слепок соперника молча получал ВСЮ
    // прокачку игрока, и бой был зеркалом, сколько бы соперника ни меняли.
    //
    // Функция чистая: ничего не читает из состояния, всё приходит доводами.
    // Поэтому ею одинаково считается и игрок, и соперник, и кандидат при
    // подборе. На сервере она станет серверной без единой правки.
    //
    //   equipment — { slot: itemId }
    //   upgrades  — { damage: n, hp: n, ... }, уровни веток
    //   bonus     — прибавки забега (усиления рогалика), если они есть
    wrathStats(equipment, upgrades, bonus) {
        const conf = (ECONOMY.minigames && ECONOMY.minigames.wrath) || {};
        // ---------- ТРИ ХАРАКТЕРИСТИКИ, И ВСЁ ----------
        // ❤️ здоровье, 🗡 урон, 🛡 броня. Броня — ОДНО число на всего червя:
        // складывается со всех источников и снимает урон с любого дошедшего
        // удара. Разбор, почему уехала с зон, — в src/config/wrath-gear.js.
        const out = {
            hp: conf.baseHp || 0,
            damage: this.upgradeBonusOf(upgrades, 'damage'),
            armor: 0,
            damageMin: conf.damageMin || 0,
            damageMax: conf.damageMax || 0
        };
        out.hp += this.upgradeBonusOf(upgrades, 'hp');

        Object.keys(equipment || {}).forEach(slot => {
            const item = WRATH_GEAR.items[equipment[slot]];
            if (!item) return;
            if (item.hp) out.hp += item.hp;
            if (item.damage) out.damage += item.damage;
            if (item.armor) out.armor += item.armor;
        });

        if (bonus) {
            if (bonus.hp) out.hp += bonus.hp;
            if (bonus.damage) out.damage += bonus.damage;
            if (bonus.armor) out.armor += bonus.armor;
        }

        out.damageMin += out.damage;
        out.damageMax += out.damage;
        return out;
    },

    // Суммарная прибавка ветки на купленном уровне — по переданной карте
    // уровней, а не по состоянию игрока. Та же логика, что в
    // GameState.upgradeBonus, но без привязки к тому, ЧЬЯ это прокачка.
    upgradeBonusOf(upgrades, key) {
        const conf = (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.upgrades) || {};
        const branch = conf[key];
        const level = ((upgrades || {})[key]) || 0;
        if (!branch || !branch.levels || level <= 0) return 0;
        const step = branch.levels[Math.min(level, branch.levels.length) - 1];
        return step ? (step.bonus || 0) : 0;
    },

    // ---------- СИЛА БОЙЦА ----------
    // «Сколько урона боец успевает нанести, прежде чем умрёт»: ЭХП × ДПС.
    // Мера ПРОВЕРЕНА, а не придумана — бойцы с одинаковой силой, набранной
    // по-разному (через здоровье или через урон), бьются между собой 50/50
    // (tools/measure-power.js, docs/plan/15-progression.md, раздел 2).
    //
    // Броня меряется против КОНКРЕТНОГО противника: против слабых ударов она
    // стоит дороже, чем против сильных, и честно учесть это иначе нельзя.
    // Поэтому вторым доводом идёт средний урон того, с кем сравниваем.
    // ---------- СКОЛЬКО БРОНИ СРАБОТАЛО ПО ЭТОМУ УДАРУ ----------
    // Одно место на бой и на все расчёты силы: правило потолка обязано быть
    // одним и тем же везде, иначе подбор соперника считает одну игру, а
    // играется другая.
    armorCut(armor, raw) {
        const conf = (ECONOMY.minigames && ECONOMY.minigames.wrath) || {};
        const share = conf.armorMaxShare;
        const have = armor || 0;
        if (!share) return have;
        return Math.min(have, Math.floor((raw || 0) * share));
    },

    wrathPower(stats, vsAvgDamage) {
        const conf = (ECONOMY.minigames && ECONOMY.minigames.wrath) || {};
        const zones = conf.zones || ['head', 'body', 'tail'];
        const floor = conf.minHitDamage || 1;
        const hit = (zones.length - 1) / zones.length;      // доля ударов мимо блока
        const avg = (stats.damageMin + stats.damageMax) / 2;
        const incoming = vsAvgDamage || avg;
        // Усреднения по зонам здесь больше нет: броня одна и работает на
        // каждом дошедшем ударе. Но входит она с тем же потолком, что и в
        // бою, — иначе подбор соперника считал бы броню сильнее, чем она есть.
        const cut = this.armorCut(stats.armor, incoming);
        const ehp = stats.hp * (incoming / Math.max(floor, incoming - cut));
        return ehp * avg * hit;
    },

    // ---------- ПРОТИВНИК ----------
    // Аналог GET /wrath/opponent. Сервер вернёт слепок ДРУГОГО игрока: его
    // модель со шрамами, его снаряжение, его прокачку. Лобби у настоящего
    // сервера всегда полное, поэтому ждать матчмейкинга не нужно — противник
    // это данные, а не сессия (docs/plan/03-wrath.md).
    //
    // Пока сервера нет, слепок СОЧИНЯЕТСЯ здесь — и это ровно то место, где
    // на сервере встанет подбор по рейтингу. Форма ответа уже правильная:
    // мини-игра получает чужие данные и не знает, откуда они взялись.
    //
    // Раньше отдавалась копия игрока, и из-за этого прокачка не двигала шанс
    // победы вовсе (разбор — ECONOMY.minigames.wrath.opponent).
    getOpponent(mode) {
        const conf = (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.opponent) || {};
        const seed = Math.floor(Math.random() * 1e9);
        const rnd = wrathRandom(seed);

        // Забегу от соперника нужно только тело: числа его врагам задаёт
        // карта забега, а не подбор (docs/plan/10-wrath-rogue.md, раздел 8).
        const build = (mode === 'rogue')
            ? { equipment: {}, upgrades: {} }
            : this.matchOpponent(rnd, conf);

        return Promise.resolve({
            opponent: {
                mode: mode || 'duel',
                seed,
                model: this.opponentModel(seed, rnd, conf),
                equipment: build.equipment,
                upgrades: build.upgrades,
                // Отношение сил: во сколько раз соперник сильнее игрока.
                // На бой не влияет и наградой пока не пользуется — едет ради
                // прогонов и журнала: по нему видно, что подбор не съехал.
                // Здесь же оно будет лежать, если однажды за более сильного
                // соперника решат платить больше.
                powerRatio: build.ratio || 1,
                is_self_copy: false
            }
        });
    },

    // ---------- ПОДБОР ПО СИЛЕ ----------
    // Соперник обязан быть примерно ровней: кривая победы крутая, и разница
    // в полтора раза — это уже не «сложнее», а «безнадёжно». Поэтому цель
    // берётся из узкого коридора вокруг силы игрока (conf.spread).
    //
    // Собирается он ПЕРЕБОРОМ правдоподобных сборок, а не подгонкой чисел:
    // случайные ступени в каждом слоте, случайные уровни прокачки — и из
    // нескольких десятков кандидатов берётся тот, чья сила ближе к цели. Так
    // соперник всегда одет в те же предметы, что продаются игроку, и по нему
    // видно, во что он вложился: кто-то в оружие, кто-то в броню.
    matchOpponent(rnd, conf) {
        const mine = this.wrathStats(GameState.data.equipment, GameState.data.upgrades);
        const myAvg = (mine.damageMin + mine.damageMax) / 2;
        const myPower = this.wrathPower(mine, myAvg);

        const spread = conf.spread || [0.9, 1.1];
        const wanted = myPower * (spread[0] + rnd() * (spread[1] - spread[0]));

        const tiers = this.gearTiers();
        const myTiers = this.myTierLevel(tiers);
        const spreadT = conf.tierSpread == null ? 2 : conf.tierSpread;
        const upgrades = (ECONOMY.minigames.wrath.upgrades.order || [])
            .filter(key => (ECONOMY.minigames.wrath.upgrades[key].tab || 'stat') === 'stat');

        let best = null;
        const total = conf.candidates || 40;
        for (let i = 0; i < total; i++) {
            const equipment = {};
            Object.keys(tiers).forEach(slot => {
                // Ступень около той, на которой стоит игрок. Ноль — пустой
                // слот: у соперника тоже не всё куплено.
                const around = myTiers[slot] + Math.round((rnd() * 2 - 1) * spreadT);
                const tier = Math.max(0, Math.min(tiers[slot].length, around));
                if (tier > 0) equipment[slot] = tiers[slot][tier - 1];
            });
            const ups = {};
            upgrades.forEach(key => {
                const levels = ECONOMY.minigames.wrath.upgrades[key].levels.length;
                const mineLevel = ((GameState.data.upgrades || {})[key]) || 0;
                const around = mineLevel + Math.round((rnd() * 2 - 1) * spreadT);
                ups[key] = Math.max(0, Math.min(levels, around));
            });

            const stats = this.wrathStats(equipment, ups);
            // Сила соперника меряется против УДАРОВ ИГРОКА, а сила игрока —
            // против ударов соперника: броня стоит по-разному против разного
            // урона, и сравнивать иначе нечестно.
            const hisPower = this.wrathPower(stats, myAvg);
            const hisAvg = (stats.damageMin + stats.damageMax) / 2;
            const minePower = this.wrathPower(mine, hisAvg) || 1;
            const miss = Math.abs(hisPower - wanted);
            if (!best || miss < best.miss) {
                best = { equipment, upgrades: ups, miss, ratio: hisPower / minePower };
            }
        }
        return best || { equipment: {}, upgrades: {}, ratio: 1 };
    },

    // Идентификаторы предметов слота по ступеням, снизу вверх. Собирается из
    // каталога, а не переписывается рядом: новый предмет в конфиге сразу
    // попадает и в подбор соперника.
    gearTiers() {
        const out = {};
        WRATH_GEAR.slots.forEach(slot => {
            out[slot.key] = Object.keys(WRATH_GEAR.items)
                .filter(id => WRATH_GEAR.items[id].slot === slot.key)
                .sort((a, b) => (WRATH_GEAR.items[a].tier || 0) - (WRATH_GEAR.items[b].tier || 0));
        });
        return out;
    },

    // На какой ступени игрок стоит в каждом слоте. Пустой слот — ноль.
    myTierLevel(tiers) {
        const worn = GameState.data.equipment || {};
        const out = {};
        Object.keys(tiers).forEach(slot => {
            const item = WRATH_GEAR.items[worn[slot]];
            out[slot] = item ? (item.tier || 1) : 0;
        });
        return out;
    },

    // ---------- КАК СОПЕРНИК ВЫГЛЯДИТ ----------
    // Тело, окрас, органы и шрамы — всё от одного сида. Разными их делает не
    // случайность в рендерере, а РАЗНАЯ МОДЕЛЬ: createVariedWormModel уже
    // умеет разводить особей по оттенку кожи, плотности кишки, тону мышц и
    // десятку других чисел. До этой правки её никто не звал, и все соперники
    // были одним и тем же червём.
    //
    // Наряд к бою отношения не имеет и надевается по той же причине, по
    // которой у соперника есть шрамы: чтобы двух подряд нельзя было спутать.
    opponentModel(seed, rnd, conf) {
        if (typeof WormModelAPI === 'undefined') return null;
        const model = WormModelAPI.createVariedWormModel(seed);

        // Шрамы соперника — его собственные, а не игрока. Ставятся тем же
        // способом, что и в бою (WormMarks не даёт им слипаться в пятно).
        const range = conf.scars || [0, 0];
        const count = range[0] + Math.floor(rnd() * (range[1] - range[0] + 1));
        const marks = [];
        for (let i = 0; i < count; i++) {
            const markSeed = Math.floor(rnd() * 1e9);
            const zone = WormMarks.ZONES[markSeed % WormMarks.ZONES.length];
            const spot = WormMarks.pickSpot(marks, zone, markSeed, model);
            if (spot === null) continue;   // зона забита — это нормальный ответ
            marks.push({ id: 'foe-' + i, kind: 'scar', zone,
                         t: spot.t, phi: spot.phi, seed: markSeed, created_at: 0 });
        }
        model.scars = marks;

        // Гардероб общий с тщеславием: соперник носит то же, что продаётся
        // игроку. Своего каталога заводить не надо.
        const wear = {};
        if (typeof PRIDE_WARDROBE !== 'undefined') {
            const chance = conf.wearChance || 0;
            PRIDE_WARDROBE.slots.forEach(slot => {
                if (rnd() >= chance) return;
                const fit = PRIDE_WARDROBE.items.filter(it => it.slot === slot.key);
                if (!fit.length) return;
                wear[slot.key] = fit[Math.floor(rnd() * fit.length)].id;
            });
        }
        model.cosmetics = wear;
        return model;
    },

    // ---------- МАГАЗИН ГНЕВА ----------
    // Покупка: проверка цены и списание живут здесь, а не в экране магазина.
    // Клиент никогда не говорит «выдай мне предмет» — он говорит «купи вот
    // этот», а хватает ли валюты, решает эта сторона (позже — сервер).
    buyItem(itemId) {
        const item = WRATH_GEAR.items[itemId];
        if (!item) return { ok: false, error: 'unknown_item' };
        if (GameState.data.inventory[itemId]) return { ok: false, error: 'already_owned' };

        const price = item.price || {};
        const short = Object.keys(price).find(key => GameState.currency(key) < price[key]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(key => {
            GameState.addCurrency(key, -price[key]);
            GameState.pushLedger({
                currency: key,
                delta: -price[key],
                reason: 'shop.wrath.' + itemId,
                client_request_id: requestId
            });
        });

        this.grantItem(itemId);
        // Купил в пустой слот — сразу надето. Покупка и есть намерение
        // пользоваться; заставлять после неё идти в лобби и надевать — лишний
        // шаг ради ничего.
        if (!GameState.data.equipment[item.slot]) this.equip(item.slot, itemId);

        GameState.save();
        return { ok: true, item: itemId, equipped: GameState.data.equipment[item.slot] === itemId };
    },
});
