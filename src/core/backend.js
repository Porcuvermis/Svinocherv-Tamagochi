// ================= ПЕРЕХОДНИК К «ПРАВДЕ О СОСТОЯНИИ» =================
// Через него игра узнаёт состояние и сообщает результаты. Форма методов —
// это будущий API (docs/plan/01-architecture.md, раздел 5):
//
//     POST /auth/telegram    -> auth()
//     GET  /state            -> getState()
//     POST /minigame/result  -> minigameResult()
//
// ---------- ЗАЧЕМ ПЕРЕХОДНИК, ЕСЛИ СЕРВЕРА НЕТ ----------
// План предлагал начинать с бэкенда. Смысл «этапа 0» на деле не в том, что
// сервер существует, а в том, какую форму принимает клиент: время считается
// лениво, состояние в одном месте, мини-игры не начисляют сами, числа в
// конфиге. Всё это работает и без сервера — а начав с сервера, мы бы на
// недели потеряли возможность просто открыть игру и посмотреть.
//
// Поэтому контракт с сервером есть уже сейчас, а исполняется он пока на
// месте. Когда появится настоящий API, рядом встанет HttpBackend, и выбор
// реализации будет одной строкой. Ни мини-игры, ни интерфейс не изменятся.
//
// ---------- ПРАВИЛО ----------
// Это ЕДИНСТВЕННОЕ место, где что-то начисляется. Клиент никогда не говорит
// «дай мне N золота» — он сообщает, что произошло, а сколько это стоит,
// решает конфиг. Когда логика переедет на сервер, правило станет физическим
// ограничением, но соблюдать его надо уже сейчас — иначе переезд превратится
// в переписывание.

function newRequestId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const LocalBackend = {
    name: 'local',

    // Аналог POST /auth/telegram. Настоящий сервер здесь проверит подпись
    // initData от Telegram и вернёт токен; локально — просто время и конфиг.
    //
    // Игра обязана открываться и без Telegram: на этом режиме идёт вся
    // разработка, и ссылка на GitHub Pages должна оставаться рабочей.
    auth() {
        const serverTime = Date.now();
        GameTime.syncWithServer(serverTime);
        return Promise.resolve({
            player: { kind: 'local' },
            serverTime,
            config: ECONOMY
        });
    },

    // Аналог GET /state.
    getState() {
        if (!GameState.data) GameState.load();
        // Пищеварение могло дойти до конца, пока игра была закрыта.
        this.settleDigestion();
        GameState.touch();
        GameState.save();
        return Promise.resolve({
            state: GameState.data,
            serverTime: GameTime.now()
        });
    },

    // Аналог POST /minigame/result.
    // Мини-игра сообщает, ЧТО произошло; что за это дать — решается здесь.
    minigameResult(payload) {
        const request = payload || {};
        const sin = request.sin;
        const mode = request.mode || 'default';
        const outcome = request.outcome || 'win';
        const requestId = request.client_request_id || newRequestId();

        if (!ECONOMY.sins[sin]) {
            console.error('[Backend] неизвестный грех в результате мини-игры:', sin);
            return Promise.resolve({ state: GameState.data, awarded: null, error: 'unknown_sin' });
        }

        // Двойной тап, повторная отправка, ретрай после потерянного ответа —
        // всё это не должно начислять дважды.
        if (GameState.wasProcessed(requestId)) {
            return Promise.resolve({ state: GameState.data, awarded: null, repeated: true });
        }

        const reward = this.resolveReward(sin, mode, outcome);
        const awarded = { sin, mode, outcome, sinValue: null, currencies: {}, mark: null };

        if (reward.sinFill === 'full') {
            GameState.setSinValue(sin, GameState.maxValue(sin));
        } else if (typeof reward.sinFill === 'number') {
            GameState.setSinValue(sin, GameState.sinValue(sin) + reward.sinFill);
        }
        awarded.sinValue = GameState.sinValue(sin);

        const reason = sin + '.' + mode + '.' + outcome;

        if (reward.currencies) {
            Object.keys(reward.currencies).forEach(key => {
                this.award(awarded, key, reward.currencies[key], reason, requestId);
            });
        }

        // ---------- ЗОЛОТО С УБЫВАЮЩЕЙ ДОХОДНОСТЬЮ ----------
        // Считается по суточному счётчику ТАКИХ ЖЕ исходов. Счётчик
        // увеличивается ниже, поэтому текущая победа — следующая по номеру.
        if (reward.goldBase) {
            const already = GameState.counter(reason);
            const share = this.goldShare(already + 1);
            const gold = Math.round(reward.goldBase * share);
            awarded.goldShare = share;
            if (gold > 0) this.award(awarded, 'gold', gold, reason + '.gold', requestId);
        }

        // ---------- НАГРАДА ЗА КАЖДЫЙ N-Й ИСХОД ----------
        // «Осколок за каждые три поражения». Счётчик накопительный: три
        // поражения за неделю тоже должны сложиться в осколок.
        if (reward.everyN && reward.everyN.n > 0) {
            const total = GameState.bumpTotal(reward.everyN.counter);
            if (total % reward.everyN.n === 0) {
                Object.keys(reward.everyN.currencies || {}).forEach(key => {
                    this.award(awarded, key, reward.everyN.currencies[key], reason + '.every' + reward.everyN.n, requestId);
                });
            }
            awarded.everyN = { counter: reward.everyN.counter, total, n: reward.everyN.n };
        }

        // Осколки могли сложиться в жетон.
        this.settleExchange(awarded, requestId);

        // Червя покормили — запускается пищеварение.
        if (reward.feeds) {
            this.feed();
            awarded.fed = true;
        }

        // Отметина на теле, если конфиг её обещал за такой исход.
        if (reward.mark && Math.random() < (reward.mark.chance || 0)) {
            const zone = (request.meta && request.meta.lastHitZone) || null;
            const mark = this.grantMark(reward.mark.kind, zone);
            if (mark) awarded.mark = mark;
        }

        // Счётчик исходов за сутки. Пока никем не используется, но именно на
        // нём стоит убывающая доходность золота из плана (1–5 побед за сутки
        // дают 100%, 6–15 — половину, дальше — 10%). Считать его надо с
        // самого начала: задним числом эти данные не восстановишь.
        GameState.bumpCounter(sin + '.' + mode + '.' + outcome, 1);

        GameState.markProcessed(requestId);
        GameState.touch();
        GameState.save();

        return Promise.resolve({ state: GameState.data, awarded });
    },

    // Выдать отметину на тело. Решение принимает эта сторона, а не
    // мини-игра: на сервере оно тем более будет серверным, иначе «шанс 30%»
    // превращается в «сколько захочу» (docs/plan/01-architecture.md, 3.3).
    //
    // Зона — из данных боя (куда прилетело), иначе от сида. Место внутри
    // зоны ищет WormMarks: рядом с существующим шрамом новый не встанет,
    // иначе они слипаются в пятно.
    grantMark(kind, zone, seed) {
        const marks = GameState.data.scars;
        const useSeed = (typeof seed === 'number') ? seed : Math.floor(Math.random() * 1e9);
        const useZone = WormMarks.ZONES.indexOf(zone) !== -1
            ? zone
            : WormMarks.ZONES[useSeed % WormMarks.ZONES.length];

        const t = WormMarks.pickSpot(marks, useZone, useSeed);
        if (t === null) return null;   // зона забита — это нормальный ответ

        const mark = {
            id: 'mark-' + useSeed.toString(36) + '-' + marks.length,
            kind: kind || 'scar',
            zone: useZone,
            t,
            seed: useSeed,
            created_at: GameTime.now()
        };
        marks.push(mark);
        return mark;
    },

    // ---------- ЖИЗНЬ И СМЕРТЬ ----------
    // Поднять мёртвого червя. Начисление, поэтому живёт здесь, а не в кнопке
    // и не в рендерере: когда воскрешение станет платным (премиальная
    // валюта), списание встанет ровно сюда, а вызывающий код не изменится.
    //
    // Шкалы поднимаются не до полных: воскрешение — это второй шанс, а не
    // бесплатный сброс всех потребностей. Метка revived_at обрывает прошлое
    // голодание, иначе поднятый червь умер бы снова в ту же секунду (см.
    // worm-condition.js).
    revive() {
        const share = ECONOMY.condition.reviveFill;
        Object.keys(GameState.data.sins).forEach(key => {
            GameState.setSinValue(key, GameState.maxValue(key) * share);
        });
        GameState.data.worm.revived_at = GameTime.now();
        // Поднятый червь дерётся с полным здоровьем: воскрешение — это
        // второй шанс целиком, а не «встал, но избитый».
        GameState.data.fighter = { hp: null, updated_at: null };
        GameState.save();
        return GameState.data.worm;
    },

    // ---------- ЛОКАЦИЯ ----------
    // Сменить комнату. Начислением это не является, но живёт здесь по той же
    // причине, что и воскрешение: локации будут ПОКУПАТЬСЯ, и проверка «а
    // куплена ли она вообще» — решение сервера, а не интерфейса. Сейчас
    // куплены все, проверять нечего; когда появится магазин, условие встанет
    // сюда, и вызывающий код не изменится.
    setLocation(key) {
        if (typeof RoomLocations === 'undefined' || !RoomLocations.has(key)) return false;
        GameState.data.room.location = key;
        GameState.save();
        return true;
    },

    // ---------- ПИЩЕВАРЕНИЕ ----------
    // Покормить: ставится одна метка времени. Всё остальное — куда доехал
    // комок, пора ли какать — считается от неё.
    feed() {
        GameState.data.digestion.fed_at = GameTime.now();
        GameState.save();
        return GameState.data.digestion;
    },

    // Довести пищеварение до текущего момента. Дёргается при каждом чтении
    // состояния и раз в секунду из интерфейса: цикл длиннее часа, и червь
    // обязан покакать даже если в этот момент приложение было закрыто —
    // тогда игрок увидит результат при следующем заходе.
    settleDigestion() {
        const d = GameState.digestion();
        if (d.phase !== 'done') return null;

        const at = GameTime.now();
        const poop = {
            id: 'poop-' + at.toString(36),
            created_at: at,
            // Где именно лежит — решает интерфейс в момент появления (червь
            // ходит по комнате). Пока не знаем — кладём по центру.
            x: null,
            y: null,
            seed: Math.floor(Math.random() * 1e9)
        };
        GameState.data.room.poops.push(poop);
        GameState.data.digestion.fed_at = null;
        GameState.save();
        return poop;
    },

    // Убрать с пола. Пока просто исчезает; станет ресурсом — начисление
    // добавится здесь же, а не в обработчике тапа.
    removePoop(id) {
        const list = GameState.data.room.poops;
        const i = list.findIndex(p => p.id === id);
        if (i === -1) return false;
        list.splice(i, 1);
        GameState.save();
        return true;
    },

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
            // зарастание как раз остановлено.
            frozen: !!f.frozen
        };
        GameState.save();
        return GameState.data.fighter;
    },

    // ---------- ПАУЗА ЗАРАСТАНИЯ ----------
    // Само по себе здоровье зарастает везде: в комнате, в лобби, при закрытой
    // игре. Но не там, где здоровье — ресурс текущего испытания: в бою и в
    // забеге рогалика (там своё лечение). Поэтому бой на входе замораживает
    // зарастание, а лобби на входе размораживает.
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
        // Во время забега здоровье лобби заморожено ЦЕЛИКОМ, от входа до
        // конца: в забеге своё здоровье, и лобби не должно зарастать, пока
        // игрок там. Правило стоит здесь, а не у зовущих: через лобби и
        // через уход с боя игрок проходит по несколько раз за забег, и
        // каждое такое место пришлось бы помнить об этом само.
        //
        // Состояние читается напрямую, а не через run(): тот сам зовёт
        // resumeHeal(), когда выбрасывает забег старого формата.
        if (GameState.data.runs && GameState.data.runs.wrath) return;
        f.frozen = false;
        // Отсчёт начинается заново: время, проведённое в бою, не зарастает
        // задним числом.
        f.updated_at = GameTime.now();
        GameState.save();
    },

    // ---------- ОБМЕН ШРАМОВ ----------
    // Пачка шрамов сходит с тела и превращается в валюту. Решение о том,
    // сколько шрамов и что за них дают, живёт в конфиге, а не в экране —
    // как и любое другое начисление.
    //
    // Уходят САМЫЕ СТАРЫЕ: тело зарастает в том же порядке, в каком его било,
    // и свежие следы последнего боя остаются на месте. Случайный выбор
    // выглядел бы как «шрамы исчезли непонятно какие».
    exchangeScars() {
        const rule = ECONOMY.marks && ECONOMY.marks.exchange;
        const scars = GameState.data.scars || [];
        if (!rule) return { ok: false, error: 'no_rule' };
        if (scars.length < rule.scars) {
            return { ok: false, error: 'not_enough', have: scars.length, need: rule.scars };
        }

        const oldestFirst = scars.slice().sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        const removed = oldestFirst.slice(0, rule.scars);
        const removedIds = {};
        removed.forEach(m => { removedIds[m.id] = true; });
        GameState.data.scars = scars.filter(m => !removedIds[m.id]);

        const requestId = newRequestId();
        GameState.addCurrency(rule.currency, rule.amount);
        GameState.pushLedger({
            currency: rule.currency,
            delta: rule.amount,
            reason: 'exchange.scars',
            client_request_id: requestId
        });
        // Осколки могли сложиться в жетон.
        this.settleExchange(null, requestId);
        GameState.save();

        return {
            ok: true,
            removed: removed.length,
            left: GameState.data.scars.length,
            currency: rule.currency,
            amount: rule.amount
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

    // ---------- ПРОТИВНИК ----------
    // Аналог GET /wrath/opponent. Сервер вернёт слепок ДРУГОГО игрока:
    // его модель со шрамами, его снаряжение, его ник. Лобби у настоящего
    // сервера всегда полное, поэтому ждать матчмейкинга не нужно —
    // противник это данные, а не сессия (docs/plan/03-wrath.md).
    //
    // Пока сервера нет, отдаётся копия самого игрока. Флаг is_self_copy —
    // не украшение: по нему интерфейс честно пишет «спарринг», а не выдумывает
    // чужой ник. Появится сервер — флаг просто перестанет приходить.
    getOpponent(mode) {
        const model = (typeof WormModelAPI !== 'undefined')
            ? WormModelAPI.loadWormModel() : null;
        return Promise.resolve({
            opponent: {
                name: 'Спарринг',
                mode: mode || 'duel',
                model,
                equipment: Object.assign({}, GameState.data.equipment),
                is_self_copy: true
            }
        });
    },

    // ---------- НАЧИСЛЕНИЕ ----------
    // Одно место, где валюта попадает в кошелёк, и каждый раз со строкой в
    // журнале: на сервере это таблица ledger, по которой разбирают баг и
    // откатывают накрутку.
    award(awarded, key, delta, reason, requestId) {
        if (!delta) return 0;
        GameState.addCurrency(key, delta);
        GameState.pushLedger({ currency: key, delta, reason, client_request_id: requestId });
        awarded.currencies[key] = (awarded.currencies[key] || 0) + delta;
        return delta;
    },

    // Доля золота по числу побед за сутки (ECONOMY.goldReturns).
    goldShare(winNumber) {
        const tiers = (ECONOMY.goldReturns && ECONOMY.goldReturns.tiers) || [];
        for (let i = 0; i < tiers.length; i++) {
            if (tiers[i].upTo === null || winNumber <= tiers[i].upTo) return tiers[i].share;
        }
        return 1;
    },

    // ---------- РАЗМЕН МЕЛКОЙ ВАЛЮТЫ В КРУПНУЮ ----------
    // Три осколка складываются в жетон сами. Кнопки «обменять» нет намеренно:
    // курс фиксированный, выбора у игрока никакого, а лишний экран есть.
    //
    // Идёт циклом, а не один раз: наградить могут сразу несколькими
    // осколками, и остаток обязан переехать целиком.
    settleExchange(awarded, requestId) {
        const rules = ECONOMY.exchange || {};
        Object.keys(rules).forEach(from => {
            const rule = rules[from];
            if (!rule || !rule.per) return;
            let converted = 0;
            while (GameState.currency(from) >= rule.per) {
                GameState.addCurrency(from, -rule.per);
                GameState.addCurrency(rule.into, 1);
                converted += 1;
            }
            if (!converted) return;
            GameState.pushLedger({
                currency: rule.into,
                delta: converted,
                reason: 'exchange.' + from,
                client_request_id: requestId
            });
            // В список заработанного размен НЕ пишется: игрок заработал
            // осколки, а жетон — это то, во что они сложились. Показывать
            // «−2 осколка» после победы было бы прямой ложью.
            if (awarded) awarded.exchanged = { from, into: rule.into, count: converted };
        });
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

    // ---------- РОГАЛИК ГНЕВА ----------
    // Забег — это состояние, а не сессия экрана: он переживает закрытие игры,
    // не имеет таймера жизни и продолжается там, где остановился. Поэтому всё
    // про него живёт здесь и в state.runs, а экран только показывает.
    //
    // Что предложат за победу, задано узлом карты, а не броском: забег
    // должен восстанавливаться из состояния один в один. Seed у забега уже
    // есть — он понадобится магазину и событиям, где случайность нужна, и
    // тогда она будет выводиться из него, а не храниться списком.
    rogueConfig() {
        return (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.rogue) || null;
    },

    // Текущий забег или null.
    //
    // Здесь же отбраковка забегов старого формата. Забег живёт неделями и
    // переживает обновления игры, а карта и награды в конфиге меняются —
    // забег, собранный по другой карте, дальше пойдёт вкривь. Дешевле
    // выбросить его на входе, чем чинить каждое место, где он используется.
    run() {
        const run = GameState.data.runs && GameState.data.runs.wrath;
        if (!run || !run.map) return null;
        const cfg = this.rogueConfig();
        if (!cfg || !run.bonus || run.map.length !== cfg.map.length) {
            delete GameState.data.runs.wrath;
            this.resumeHeal();
            GameState.save();
            return null;
        }
        return run;
    },

    // Противник узла. Числа — из конфига, модель придёт отдельно
    // (getOpponent): своих обликов у врагов забега пока нет.
    rogueEnemy(node) {
        const cfg = this.rogueConfig();
        if (!cfg || !node || !node.enemy) return null;
        const enemy = cfg.enemies[node.enemy];
        return enemy ? Object.assign({ id: node.enemy }, enemy) : null;
    },

    // Следующий узел, который вообще работает. Закрытые (магазин, событие)
    // остаются на карте, но перешагиваются: они нарисованы заранее, чтобы
    // карта не поехала, когда их сделают.
    nextOpenNode(run, from) {
        let i = from;
        while (i < run.map.length && run.map[i].locked) i += 1;
        return i;
    },

    // Начать забег. Вход платный и невозвратный: жетон списывается здесь.
    startRun() {
        const cfg = this.rogueConfig();
        if (!cfg) return { ok: false, error: 'no_config' };
        if (this.run()) return { ok: false, error: 'run_in_progress' };

        const price = cfg.entry || {};
        const short = Object.keys(price).find(key => GameState.currency(key) < price[key]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(key => {
            GameState.addCurrency(key, -price[key]);
            GameState.pushLedger({
                currency: key, delta: -price[key],
                reason: 'rogue.wrath.entry', client_request_id: requestId
            });
        });

        // Забег начинается с ПОЛНОГО здоровья: вход стоит жетон, то есть три
        // победы, и пускать за эту цену на верную смерть — наказание за то,
        // что игрок только что играл. Здоровье лобби при этом не трогается,
        // оно заморожено на всё время забега.
        const maxHp = this.fighterMaxHp();
        const run = {
            started_at: GameTime.now(),
            seed: Math.floor(Math.random() * 1e9),
            map: cfg.map.map((node, i) => ({
                id: i,
                kind: node.kind,
                enemy: node.enemy || null,
                locked: !!node.locked,
                done: false
            })),
            node: 0,
            hp: maxHp,
            maxHp,
            teeth: 0,
            // Усиления забега — суммой для боя и списком для показа. В
            // состоянии игрока их нет: забег кончится вместе с ними.
            bonus: { damage: 0, armor: 0, hp: 0 },
            boosts: [],
            pending: null
        };
        run.node = this.nextOpenNode(run, 0);
        GameState.data.runs.wrath = run;
        this.freezeHeal();
        GameState.save();
        return { ok: true, run };
    },

    // Бросить забег. Жетон не возвращается — это цена входа, а не залог.
    abandonRun() {
        if (!this.run()) return { ok: false, error: 'no_run' };
        delete GameState.data.runs.wrath;
        this.resumeHeal();
        GameState.save();
        return { ok: true };
    },

    // Подлечить забег, но не выше максимума. Возвращает, сколько реально
    // прибавилось: экран показывает именно это, а не то, что обещал конфиг.
    rogueHeal(run, amount) {
        const healed = Math.max(0, Math.min(Math.round(amount), run.maxHp - run.hp));
        run.hp += healed;
        return healed;
    },

    // Узел пройден. Что за это дать, решает конфиг, а не экран забега.
    // outcome: 'win' | 'lose'.
    resolveNode(outcome) {
        const run = this.run();
        const cfg = this.rogueConfig();
        if (!run || !cfg) return { ok: false, error: 'no_run' };
        // Пока не выбрана награда за прошлый узел, дальше не пускает: выбор
        // лежит в состоянии и переживает перезаход, иначе он терялся бы
        // вместе со свёрнутой игрой.
        if (run.pending) return { ok: false, error: 'pending_choice' };

        const node = run.map[run.node];
        if (!node) return { ok: false, error: 'no_node' };

        // Два разных счёта, и путать их нельзя. Конец карты считается по
        // ДЛИНЕ карты: run.node — индекс в ней. А показывается игроку счёт
        // проходимых узлов: закрытые (магазин, событие) нарисованы, но он их
        // не проходит, и «4 из 11» врало бы.
        const openTotal = run.map.filter(n => !n.locked).length;
        const passed = () => run.map.filter(n => n.done).length;

        // Поражение обрывает забег целиком: жетон сгорел, зубы сгорели.
        // Выданное по дороге (осколок за мини-босса) остаётся — оно уже в
        // кошельке, а не в забеге.
        if (outcome === 'lose') {
            const teethLost = run.teeth;
            delete GameState.data.runs.wrath;
            this.resumeHeal();
            GameState.save();
            return {
                ok: true, finished: true, outcome: 'lose',
                nodesDone: passed(), nodesTotal: openTotal, teethLost
            };
        }

        const gained = { teeth: 0, healed: 0, currencies: {} };

        if (node.kind === 'heal') {
            gained.healed = this.rogueHeal(run, run.maxHp * (cfg.healShare || 0.5));
        } else {
            const enemy = this.rogueEnemy(node);
            const reward = (enemy && enemy.reward) || null;
            if (reward) {
                gained.teeth = reward.teeth || 0;
                run.teeth += gained.teeth;

                if (reward.healFull) gained.healed = this.rogueHeal(run, run.maxHp);
                else if (reward.heal) gained.healed = this.rogueHeal(run, reward.heal);

                Object.keys(reward.currencies || {}).forEach(key => {
                    const requestId = newRequestId();
                    GameState.addCurrency(key, reward.currencies[key]);
                    GameState.pushLedger({
                        currency: key, delta: reward.currencies[key],
                        reason: 'rogue.wrath.' + (node.enemy || node.kind),
                        client_request_id: requestId
                    });
                    gained.currencies[key] = reward.currencies[key];
                });

                if (reward.choices && reward.choices.length) {
                    run.pending = { choices: reward.choices.slice() };
                }
            }
        }

        node.done = true;
        run.node = this.nextOpenNode(run, run.node + 1);

        // Карта кончилась — забег пройден. Невыбранное усиление на последнем
        // узле пропадает вместе с забегом: применять его уже некуда.
        const finished = run.node >= run.map.length;
        if (finished) {
            delete GameState.data.runs.wrath;
            this.resumeHeal();
        }

        GameState.save();
        return {
            ok: true, finished, outcome: 'win', gained,
            pending: finished ? null : run.pending,
            nodesDone: passed(),
            nodesTotal: openTotal,
            run: this.run()
        };
    },

    // Выбрана карточка усиления. Как и везде: экран говорит «беру вот это»,
    // а что это значит в числах, решает конфиг.
    chooseBoost(id) {
        const run = this.run();
        const cfg = this.rogueConfig();
        if (!run || !cfg) return { ok: false, error: 'no_run' };
        if (!run.pending) return { ok: false, error: 'no_choice' };
        if (run.pending.choices.indexOf(id) < 0) return { ok: false, error: 'not_offered' };

        const boost = cfg.boosts[id];
        if (!boost) return { ok: false, error: 'unknown_boost' };

        if (boost.damage) run.bonus.damage += boost.damage;
        if (boost.armor) run.bonus.armor += boost.armor;
        if (boost.hp) {
            // Здоровьем усиление лечит ровно на столько, на сколько подняло
            // максимум: иначе на полном здоровье его брали бы вслепую «на
            // потом», а побитый не брал бы никогда.
            run.bonus.hp += boost.hp;
            run.maxHp += boost.hp;
            run.hp += boost.hp;
        }

        run.boosts.push(id);
        run.pending = null;
        GameState.save();
        return { ok: true, boost: id, run };
    },

    // Здоровье забега меняется не только боем (усиления, узлы отхила),
    // поэтому запись отдельная — и снова с сохранением после каждого шага.
    setRunHp(hp) {
        const run = this.run();
        if (!run) return null;
        run.hp = Math.max(0, Math.min(run.maxHp, Math.round(hp)));
        GameState.save();
        return run.hp;
    },

    // Максимум здоровья бойца по снаряжению и прокачке. Живёт здесь, а не в
    // мини-игре: забег стартует до того, как экран боя вообще открыт.
    fighterMaxHp() {
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.wrath) || {};
        let max = (cfg.baseHp || 10) + GameState.upgradeBonus('hp');
        const equipment = GameState.data.equipment || {};
        Object.keys(equipment).forEach(slot => {
            const item = WRATH_GEAR.items[equipment[slot]];
            if (item && item.hp) max += item.hp;
        });
        return max;
    },

    // ---------- БОЕВАЯ ПРОКАЧКА ----------
    // Купить следующий уровень ветки. Как и с предметами: клиент говорит
    // «качни вот это», а хватает ли валюты и не упёрлись ли в потолок,
    // решает эта сторона.
    buyUpgrade(key) {
        const conf = ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.upgrades;
        const branch = conf && conf[key];
        if (!branch || !branch.levels) return { ok: false, error: 'unknown_upgrade' };

        const level = GameState.upgradeLevel(key);
        if (level >= branch.levels.length) return { ok: false, error: 'maxed' };

        const price = branch.levels[level].price || {};
        const short = Object.keys(price).find(cur => GameState.currency(cur) < price[cur]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(cur => {
            GameState.addCurrency(cur, -price[cur]);
            GameState.pushLedger({
                currency: cur,
                delta: -price[cur],
                reason: 'upgrade.wrath.' + key + '.' + (level + 1),
                client_request_id: requestId
            });
        });

        GameState.data.upgrades[key] = level + 1;
        GameState.save();
        return { ok: true, key, level: level + 1, bonus: GameState.upgradeBonus(key) };
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
    }
};

// Здесь же появится HttpBackend, когда будет сервер:
//   const Backend = USE_SERVER ? HttpBackend : LocalBackend;
const Backend = LocalBackend;

if (typeof window !== 'undefined') {
    window.Backend = Backend;
    window.newRequestId = newRequestId;
}
