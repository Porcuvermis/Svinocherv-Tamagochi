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

// Случайность ОТ СИДА, а не Math.random. Соперник собирается из двух десятков
// бросков — внешность, шрамы, наряд, ступени снаряжения, — и все они обязаны
// выводиться из одного числа. Тогда слепок соперника это ровно `seed`: его
// можно сохранить в журнал боя, переслать, воспроизвести и разобрать баг.
// С Math.random любой такой слепок пришлось бы хранить целиком.
//
// Тот же mulberry32, что и в модели червя (worm-model.js): одна и та же
// дешёвая формула на весь проект, чтобы не гадать, какая где.
function wrathRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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

        // ---------- ПОРОГ ГОЛОДА: ПЛАТЯТ ЛИ ЗА ЭТОТ ЗАХОД ----------
        // Замер ОБЯЗАН стоять здесь, до sinFill: выход закрывает шкалу, и
        // любая проверка после него увидит полную сотню и решит, что червь сыт.
        // Единственная причина, по которой эти две строки нельзя переставить
        // местами с блоком ниже.
        //
        // alwaysPays в конфиге награды снимает порог у этого исхода. Стоит он
        // сегодня у одного греха — у боя в гневе, и не как поблажка: там
        // тормозом работает здоровье бойца, а два тормоза на одной механике
        // складывались в «дерись сколько хочешь, но платят раз в пять часов»
        // (разбор — ECONOMY.rewards.wrath).
        const pays = reward.alwaysPays ? true : this.sinPays(sin);
        awarded.pays = pays;

        if (reward.sinFill === 'full') {
            GameState.setSinValue(sin, GameState.maxValue(sin));
        } else if (typeof reward.sinFill === 'number') {
            GameState.setSinValue(sin, GameState.sinValue(sin) + reward.sinFill);
        }
        awarded.sinValue = GameState.sinValue(sin);

        const reason = sin + '.' + mode + '.' + outcome;

        if (reward.currencies && pays) {
            Object.keys(reward.currencies).forEach(key => {
                this.award(awarded, key, reward.currencies[key], reason, requestId);
            });
        }

        // ---------- ЗОЛОТО С УБЫВАЮЩЕЙ ДОХОДНОСТЬЮ ----------
        // Считается по суточному счётчику ТАКИХ ЖЕ исходов. Счётчик
        // увеличивается ниже, поэтому текущая победа — следующая по номеру.
        if (reward.goldBase && pays) {
            const already = GameState.counter(reason);
            const share = this.goldShare(already + 1);
            const gold = Math.round(reward.goldBase * share);
            awarded.goldShare = share;
            if (gold > 0) this.award(awarded, 'gold', gold, reason + '.gold', requestId);
        }

        // ---------- НАГРАДА ПО КАЧЕСТВУ БЛЮДА ----------
        // Кухня сообщает в meta, что сварила; сколько за это дать — решает
        // таблица KITCHEN.quality (инвариант 2: мини-игра не начисляет).
        // Здесь же запоминается размер кучки: решить его надо в момент
        // кормёжки, потому что через час, когда червь покакает, о блюде уже
        // никто не помнит.
        if (reward.byQuality) {
            const dish = this.dishQuality(request.meta);
            awarded.dish = dish;
            // Кучка появится в любом случае — червя ведь покормили; а вот
            // осколки идут по общему правилу порога (сытому не платят).
            if (dish.shards && pays) this.award(awarded, 'glut_shard', dish.shards, reason + '.dish', requestId);
            GameState.data.digestion.poop_size = dish.poop;
        }

        // ---------- НАГРАДА ПО ЧИСЛУ ИЗ meta ----------
        // Мини-игра сообщает, НАСКОЛЬКО хорошо сыграно (ванная — сколько
        // секций шкалы заполнено), а сколько за это дать, решает эта запись.
        // Число из meta берётся как множитель, а не как готовая награда:
        // иначе мини-игра снова начисляла бы себе сама (инвариант 2).
        if (reward.perMeta && reward.perMeta.currency && pays) {
            const raw = (request.meta || {})[reward.perMeta.field];
            const n = Math.max(0, Math.floor(Number(raw) || 0));
            const capped = reward.perMeta.max ? Math.min(n, reward.perMeta.max) : n;
            // Убывающая доходность, если конфиг награды её просит: тот же
            // механизм, что режет золото за десятый бой за сутки, только по
            // своей таблице. Счётчик тот же, что и у золота, — исходов за
            // сутки, и текущий исход считается следующим по номеру.
            let amount = capped * (reward.perMeta.per || 1);
            if (reward.perMeta.returns) {
                const share = this.returnsShare(reward.perMeta.returns, GameState.counter(reason) + 1);
                awarded.metaShare = share;
                // Округление ВВЕРХ: сыгранный выход, за который дали ноль,
                // читается как поломка. Десятая часть от единицы — всё равно
                // единица.
                amount = amount > 0 ? Math.max(1, Math.round(amount * share)) : 0;
            }
            if (amount > 0) {
                this.award(awarded, reward.perMeta.currency, amount,
                    reason + '.' + reward.perMeta.field, requestId);
            }
        }

        // ---------- НАГРАДА ЗА КАЖДЫЙ N-Й ИСХОД ----------
        // «Осколок за каждые три поражения». Счётчик накопительный: три
        // поражения за неделю тоже должны сложиться в осколок.
        if (reward.everyN && reward.everyN.n > 0) {
            const total = GameState.bumpTotal(reward.everyN.counter);
            if (pays && total % reward.everyN.n === 0) {
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

        // Счётчик исходов за сутки: на нём стоит убывающая доходность золота
        // (1–5 побед за сутки дают 100%, 6–15 — половину, дальше — 10%).
        // Двигают его ТОЛЬКО оплаченные заходы: бесплатный повтор при сытом
        // черве ничего не приносит, и было бы странно, если бы он при этом
        // съедал доход у будущего оплаченного.
        if (pays) GameState.bumpCounter(sin + '.' + mode + '.' + outcome, 1);

        // Таймер награды тратит только тот исход, который ЗА НЕЁ играли
        // (claimsReward). Забег «только помыть» у похоти его не тратит: иначе
        // таймер, открывшийся, пока червя мыли, съедался бы заходом, за
        // который ничего не дали.
        if (pays && reward.claimsReward && ECONOMY.sins[sin].rewardEvery) {
            GameState.claimReward(sin);
            awarded.claimed = true;
        }

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

        // ---------- ЗАБИТА ЗОНА — ИЩЕМ В ДРУГИХ ----------
        // Раньше шрам просто не появлялся, если в НУЖНОЙ зоне не нашлось
        // места, — даже когда на остальном теле его было сколько угодно.
        // Игрок при этом не получал ничего и не узнавал почему: удар в морду
        // при забитой морде молча не оставлял следа.
        //
        // Теперь зона удара — предпочтение, а не условие. Пусто везде —
        // тело действительно заполнено, и вот это уже нормальный отказ:
        // место освобождает переработка шрамов (WrathLobby.startHold).
        // Место ищется на ПОВЕРХНОСТИ: пара «вдоль оси + вокруг тела». Одной
        // координаты мало — тело труба, и место на ней двумерное
        // (src/core/worm-marks.js).
        const model = (typeof WormModelAPI !== 'undefined') ? WormModelAPI.loadWormModel() : {};
        let spotZone = useZone;
        let spot = WormMarks.pickSpot(marks, spotZone, useSeed, model);
        if (spot === null) {
            for (let i = 0; i < WormMarks.ZONES.length && spot === null; i++) {
                const other = WormMarks.ZONES[i];
                if (other === useZone) continue;
                // Сид тот же самый, и это важно: по нему считаются и размер
                // шрама, и его поворот. Здесь стояло `useSeed + i + 1` — и
                // место подбиралось под шрам ОДНОГО размера, а рисовался
                // шрам другого. На голове это давало наложения: проверка
                // разводила соседей по габаритам, которых на экране не было.
                spot = WormMarks.pickSpot(marks, other, useSeed, model);
                if (spot !== null) spotZone = other;
            }
        }
        if (spot === null) return null;   // тело забито целиком — нормальный ответ

        const mark = {
            id: 'mark-' + useSeed.toString(36) + '-' + marks.length,
            // Вид не назвали — выводим из сида. Так в конфиге наград не
            // приходится перечислять виды отметин: это дело картинки, а не
            // баланса.
            kind: kind || WormMarks.kindOf(useSeed),
            zone: spotZone,
            t: spot.t,
            // Угол вокруг тела хранится явно: по нему отметина прячется при
            // повороте и сплющивается у края силуэта.
            phi: spot.phi,
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

    // ---------- КУХНЯ ----------
    // Что лежит в холодильнике. Пищеблок из морозилки бесконечен и в кладовой
    // не хранится: он страховка от тупика «нечем кормить», а не запас.
    pantryCount(key) {
        const item = KITCHEN.ingredients[key] || KITCHEN.liquids[key];
        if (item && item.infinite) return Infinity;
        return (GameState.data.pantry && GameState.data.pantry[key]) || 0;
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

    // Доля выплаты по номеру исхода за сутки. Осталась только у золота
    // (ECONOMY.goldReturns): у тщеславия такая же лестница была и была
    // убрана — она резала заработанное, а её место занял порог голода
    // (sinPays ниже). Имя таблицы по-прежнему приходит из конфига награды,
    // а не зашито здесь: механизм общий, просто пользователь у него один.
    returnsShare(tableKey, n) {
        const table = ECONOMY[tableKey];
        const tiers = (table && table.tiers) || [];
        for (let i = 0; i < tiers.length; i++) {
            if (tiers[i].upTo === null || n <= tiers[i].upTo) return tiers[i].share;
        }
        return 1;
    },

    // Доля золота по числу побед за сутки (ECONOMY.goldReturns).
    goldShare(winNumber) {
        return this.returnsShare('goldReturns', winNumber);
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

    // ---------- ЧТО УЖЕ ОТКРЫТО ----------
    // Заготовка под постепенное открытие содержимого. У предмета в магазине
    // или у ветки прокачки может стоять условие:
    //
    //     unlock: { counter: 'wrath.duel.fights', at: 10 }
    //
    // Пока оно не выполнено, вещь не показывается ВООБЩЕ — не серым, не
    // силуэтом, никак. Смысл ровно в этом: игрок проводит десятый бой и
    // обнаруживает в магазине то, чего там вчера не было. Показанная заранее
    // запертая вещь такого не даёт, она просто дразнит.
    //
    // Условие читается из накопительных счётчиков состояния, то есть из
    // того, что игрок УЖЕ делал. Ни одной вещи с условием пока нет: это
    // каркас, а не механика.
    isUnlocked(rule) {
        if (!rule) return true;
        if (rule.counter) return GameState.totalCounter(rule.counter) >= (rule.at || 0);
        return true;
    },
};

// Здесь же появится HttpBackend, когда будет сервер:
//   const Backend = USE_SERVER ? HttpBackend : LocalBackend;
const Backend = LocalBackend;

if (typeof window !== 'undefined') {
    window.Backend = Backend;
    window.newRequestId = newRequestId;
}
