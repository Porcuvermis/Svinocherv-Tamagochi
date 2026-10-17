// ================= ПЕРЕХОДНИК: САД И КУХНЯ =================
// Грядки, семена, магазин лени, продукты кухни.
// Продолжение LocalBackend (backend.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после backend.js.
Object.assign(LocalBackend, {

    // ---------- САД ЛЕНИ ----------
    // Сад и кухня — это один круг, а не две мини-игры: сад кладёт в кладовую
    // ровно те продукты, которые кухня оттуда берёт, а кухня возвращает
    // какашки, которыми сад удобряют. Поэтому и живут они в одном месте — тут.
    //
    // Всё состояние грядки выводится из меток времени (инвариант 1): ни один
    // этап не «тикает», у грядки просто спрашивают, что с ней СЕЙЧАС.
    gardenBed(i) {
        const beds = (GameState.data.garden && GameState.data.garden.beds) || [];
        return beds[i] || null;
    },

    gardenTools() {
        const t = (GameState.data.garden && GameState.data.garden.tools) || {};
        // seed — ступень возврата семечки при сборе. Забыть её здесь легко,
        // а поймать трудно: лестница в конфиге есть, работает вроде бы всё, и
        // только тест показывает, что все ступени дают одно и то же.
        return { can: t.can || 0, rake: t.rake || 0, spade: t.spade || 0, seed: t.seed || 0 };
    },

    // ---------- СЕМЕНА ----------
    // Сколько семечек этого вида в мешке. Бесконечность живёт в ТАБЛИЦЕ
    // ВИДОВ, а не в сейве: трава бесконечна по своей природе, а не потому,
    // что кто-то однажды записал в сохранение большое число. Так же устроен
    // пищеблок на кухне.
    gardenSeedCount(key) {
        const spec = GARDEN.species[key];
        if (!spec) return 0;
        if (spec.infinite) return Infinity;
        return (GameState.data.garden.seeds || {})[key] || 0;
    },

    // Какие виды вообще открыты игроку: бесконечные плюс те, что лежат в
    // мешке (даже с нулём — пустая ячейка показывает, что вид знаком и его
    // стоит поискать снова).
    gardenSeedKeys() {
        const known = Object.keys(GARDEN.species).filter(k => GARDEN.species[k].infinite);
        Object.keys(GameState.data.garden.seeds || {}).forEach(k => {
            if (GARDEN.species[k] && known.indexOf(k) === -1) known.push(k);
        });
        return known;
    },

    gardenSeedAdd(key, n) {
        if (!GARDEN.species[key] || GARDEN.species[key].infinite) return 0;
        const seeds = GameState.data.garden.seeds;
        seeds[key] = Math.max(0, (seeds[key] || 0) + n);
        return seeds[key];
    },

    // Шанс вернуть семечку при сборе — ступенями, как и всё остальное в саду.
    gardenSeedReturn() {
        const lvl = this.gardenTools().seed || 0;
        return GARDEN.SEED_TIERS[Math.min(lvl, GARDEN.SEED_TIERS.length - 1)].chance;
    },

    // Ступень лейки целиком: сколько держать полив и сколько идут часы роста.
    // Ранние ступени сокращают ПОЛИВ (его игрок видит), поздние — ЧАСЫ
    // (их он не ждёт, а уходит) — см. GARDEN.CAN_TIERS.
    canTier() {
        const lvl = this.gardenTools().can;
        return GARDEN.CAN_TIERS[Math.min(lvl, GARDEN.CAN_TIERS.length - 1)];
    },

    // Сколько движений нужно на действие. Число берётся из ступени того
    // инструмента, которым его делают: прокачка сокращает РАБОТУ, а не
    // ожидание, — то же правило, что у лейки (ранние ступени сокращают
    // секунды, которые игрок стоит с инструментом в руках).
    //
    // Возвращается количество ПОЛОВИН цикла: цикл — это «туда и обратно»,
    // а считает экран каждый разворот.
    gardenWorkNeed(action) {
        const cfg = GARDEN.work[action];
        if (!cfg) return 0;
        if (cfg.pulls) return cfg.pulls;
        const lvl = cfg.tool ? this.gardenTools()[cfg.tool] || 0 : 0;
        const cycles = cfg.cycles[Math.min(lvl, cfg.cycles.length - 1)];
        return cycles * 2;
    },

    // Сколько миллисекунд надо держать лейку над грядкой. Спрашивает экран,
    // решает конфиг: длительность действия — такое же число баланса, как
    // цена или скорость роста (инвариант 3).
    gardenPourMs() { return this.canTier().pour; },

    // Сколько миллисекунд ещё зреть. Отрицательное — уже дозрело.
    // Этап 1 меряется часами и идёт оффлайн, этап 2 — минутами и внутри
    // сессии; какой именно этап идёт, видно по stage грядки.
    gardenLeft(bed) {
        if (!bed || !bed.at) return 0;
        const tools = this.gardenTools();
        if (bed.stage === 'growing') {
            const hours = this.canTier().hours;
            const paid = (bed.skipped || 0) * GARDEN.FERT_HOURS_PER_DUNG;
            return bed.at + Math.max(0, hours - paid) * 3600000 - GameTime.now();
        }
        if (bed.stage === 'ripening') {
            const mins = GARDEN.RAKE_TIERS[Math.min(tools.rake, GARDEN.RAKE_TIERS.length - 1)].minutes;
            const sp = (GARDEN.species[bed.species] || {}).stage2 || 1;
            return bed.at + mins * sp * 60000 - GameTime.now();
        }
        return 0;
    },

    // Дозревшее переводится на следующий этап ЛЕНИВО — в момент, когда о
    // грядке спросили. Никакого обхода грядок по таймеру: их может быть
    // сколько угодно, а игра может быть закрыта неделю.
    gardenSettle() {
        const beds = (GameState.data.garden && GameState.data.garden.beds) || [];
        let changed = false;
        beds.forEach(bed => {
            if (bed.stage === 'growing' && this.gardenLeft(bed) <= 0) {
                bed.stage = 'weedy';        // выросло, но заросло сорняками
                bed.at = null;
                changed = true;
            } else if (bed.stage === 'ripening' && this.gardenLeft(bed) <= 0) {
                bed.stage = 'ripe';
                bed.at = null;
                changed = true;
            }
        });
        if (changed) GameState.save();
        return beds;
    },

    // Шкала лени растёт от ДВУХ вещей сразу, и начисляет её Backend, а не
    // мини-игра (инвариант 2):
    //   * за действие — сразу кусок (GARDEN.actionFill);
    //   * за ПРЕБЫВАНИЕ на экране сада — минута безделья закрывает шкалу
    //     целиком (slothWatch ниже).
    //
    // Пребывание засчитывается именно лени и никому больше: это её суть —
    // потребность, которая закрывается ничегонеделанием. Для любого другого
    // греха такая награда означала бы «положи телефон и выиграешь».
    gardenFill(action) {
        const add = GARDEN.actionFill[action] || 0;
        if (!add) return 0;
        const max = GameState.maxValue('sloth');
        GameState.setSinValue('sloth', Math.min(max, GameState.sinValue('sloth') + add));
        return add;
    },

    // Пребывание в саду. Считается ФОРМУЛОЙ от метки (инвариант 1): экран
    // отдаёт время своего открытия, получает добавку и новую метку. Ничего
    // не «накручивается» в таймере — если между двумя вызовами прошло десять
    // секунд или десять минут, результат одинаково выводится из разницы.
    //
    // Метка хранится в ПАМЯТИ экрана, а не в сейве: иначе игрок, закрывший
    // игру с открытым садом, вернулся бы через сутки к полной шкале, ничего
    // не сделав. Пребывание нельзя накопить оффлайн — на то оно и пребывание.
    slothWatch(mark) {
        const now = GameTime.now();
        const dt = now - (mark || now);
        if (!(dt > 0)) return { fill: 0, mark: now };
        const max = GameState.maxValue('sloth');
        const add = max * Math.min(dt, GARDEN.WATCH_FULL_MS * 4) / GARDEN.WATCH_FULL_MS;
        const was = GameState.sinValue('sloth');
        if (was >= max) return { fill: 0, mark: now };
        GameState.setSinValue('sloth', Math.min(max, was + add));
        return { fill: add, mark: now };
    },

    // На какой стадии грядки какое действие имеет смысл. ОДНА таблица на всю
    // игру: экран спрашивает её, чтобы подсветить грядку и не начинать
    // работу впустую, и она же решает в gardenAct. Две такие таблицы
    // разъезжаются молча — подсветка обещает то, чего не будет.
    GARDEN_NEEDS: {
        clear: 'locked', dig: 'empty', sow: 'dug', water: 'sown',
        fertilize: 'growing', weed: 'weedy', harvest: 'ripe'
    },

    // ---------- МАГАЗИН ЛЕНИ ----------
    // Своего экрана у магазина нет: покупки висят на тех же предметах, что и
    // работа (docs/plan/19-sloth-garden.md, раздел 6). Семена и виды — в
    // мешке, ступени инструментов — ценниками на полке. Списание при этом
    // всё равно здесь: экран никогда не говорит «выдай мне», он говорит
    // «купи вот это» (инвариант 2).

    // Цена СЛЕДУЮЩЕЙ грядки. Растёт с каждой открытой: к шестой у игрока
    // вчетверо больше дохода, чем к третьей, и плоская цена означала бы, что
    // расширение участка дешевеет по ходу игры.
    gardenBedCost() {
        const beds = (GameState.data.garden && GameState.data.garden.beds) || [];
        const open = beds.filter(b => b && b.stage !== 'locked').length;
        const bought = Math.max(0, open - GARDEN.BEDS_OPEN);
        const list = GARDEN.BED_COST.amounts;
        return { currency: GARDEN.BED_COST.currency,
                 amount: list[Math.min(bought, list.length - 1)] };
    },

    // Лестница инструмента: её ступени и текущий уровень одним ответом.
    // Экран спрашивает «что дальше и почём», а не собирает это из трёх
    // разных таблиц.
    gardenToolLadder(tool) {
        const tiers = {
            can:   GARDEN.CAN_TIERS,
            rake:  GARDEN.RAKE_TIERS,
            seed:  GARDEN.SEED_TIERS,
            // У лопаты лестница живёт не отдельным списком, а в самой работе:
            // она сокращает ЦИКЛЫ копания. Цена лежит там же, строкой ниже.
            spade: (GARDEN.work.dig.cycles || []).map((c, i) => ({
                cycles: c, price: (GARDEN.work.dig.price || [])[i] || null
            }))
        }[tool];
        if (!tiers) return null;
        const level = this.gardenTools()[tool] || 0;
        return { tool, level, tiers, next: tiers[level + 1] || null,
                 maxed: level >= tiers.length - 1 };
    },

    // Купить следующую ступень инструмента.
    buyGardenTool(tool) {
        const ladder = this.gardenToolLadder(tool);
        if (!ladder) return { ok: false, error: 'unknown_tool' };
        if (!ladder.next) return { ok: false, error: 'maxed' };

        const price = ladder.next.price || {};
        const short = Object.keys(price).find(cur => GameState.currency(cur) < price[cur]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(cur => {
            GameState.addCurrency(cur, -price[cur]);
            GameState.pushLedger({ currency: cur, delta: -price[cur],
                                   reason: 'shop.garden.' + tool, client_request_id: requestId });
        });
        GameState.data.garden.tools = GameState.data.garden.tools || {};
        GameState.data.garden.tools[tool] = ladder.level + 1;
        GameState.save();
        return { ok: true, tool, level: ladder.level + 1 };
    },

    // Купить одну семечку уже открытого вида. Платится СЕНОМ: сено на
    // расход, жетон на доступ (план, раздел 4а).
    buyGardenSeed(key) {
        const sp = GARDEN.species[key];
        if (!sp || sp.infinite) return { ok: false, error: 'unknown_species' };
        if (this.gardenSeedKeys().indexOf(key) === -1) return { ok: false, error: 'locked' };

        const price = sp.seedPrice || {};
        const short = Object.keys(price).find(cur => GameState.currency(cur) < price[cur]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(cur => {
            GameState.addCurrency(cur, -price[cur]);
            GameState.pushLedger({ currency: cur, delta: -price[cur],
                                   reason: 'shop.garden.seed.' + key, client_request_id: requestId });
        });
        this.gardenSeedAdd(key, 1);
        GameState.save();
        return { ok: true, key, count: this.gardenSeedCount(key) };
    },

    // Открыть новый вид. Платится ЖЕТОНОМ и выдаёт сразу одну семечку:
    // открытый вид с пустой ячейкой — это покупка, после которой ничего не
    // произошло, и выглядит она как сбой.
    unlockGardenSpecies(key) {
        const sp = GARDEN.species[key];
        if (!sp || sp.infinite) return { ok: false, error: 'unknown_species' };
        if (this.gardenSeedKeys().indexOf(key) !== -1) return { ok: false, error: 'already_open' };

        const price = sp.unlock || {};
        const short = Object.keys(price).find(cur => GameState.currency(cur) < price[cur]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(cur => {
            GameState.addCurrency(cur, -price[cur]);
            GameState.pushLedger({ currency: cur, delta: -price[cur],
                                   reason: 'shop.garden.unlock.' + key, client_request_id: requestId });
        });
        this.gardenSeedAdd(key, 1);
        GameState.save();
        return { ok: true, key, count: this.gardenSeedCount(key) };
    },

    // Можно ли это действие прямо сейчас — вместе с ценой. Спрашивается ДО
    // того, как инструмент встанет в рабочее положение: заставить игрока
    // разгребать завал, за который нечем заплатить, значит соврать ему.
    gardenCan(i, action, opts) {
        const bed = this.gardenBed(i);
        if (!bed || bed.stage !== this.GARDEN_NEEDS[action]) return false;
        if (action === 'clear') {
            const cost = this.gardenBedCost();
            return GameState.currency(cost.currency) >= cost.amount;
        }
        if (action === 'fertilize') return GameState.currency('dung') >= 1;
        if (action === 'sow') {
            const key = (opts || {}).species;
            // Без вида — вопрос «есть ли вообще чем сеять»: так спрашивает
            // подсветка, когда игрок ещё только тянет мешок.
            if (!key) return this.gardenSeedKeys().some(k => this.gardenSeedCount(k) > 0);
            return this.gardenSeedCount(key) > 0;
        }
        return true;
    },

    // Одно действие над грядкой. Возвращает { ok, what } — что именно
    // произошло, чтобы экран показал это движением, а не выяснял сам.
    gardenAct(i, action, opts) {
        const bed = this.gardenBed(i);
        if (!bed) return { ok: false };
        this.gardenSettle();
        const o = opts || {};
        const res = { ok: false, action };

        if (action === 'clear' && bed.stage === 'locked') {
            // Завал разбирают РУКАМИ, а не лопатой: лопата занята лункой, и
            // один инструмент на два разных дела путает — игрок тащил лопату
            // на расчищенную грядку и не понимал, почему ничего не выходит.
            //
            // Но сначала за грядку надо ЗАПЛАТИТЬ. Жетон лени копится из
            // осколков за собранный урожай, то есть новая грядка стоит труда
            // на старых. Пока она была бесплатной, все шесть открывались за
            // первые две минуты и обесценивали весь остальной прогресс сада.
            const cost = this.gardenBedCost();
            if (GameState.currency(cost.currency) < cost.amount) {
                return { ok: false, reason: 'no-token' };
            }
            GameState.addCurrency(cost.currency, -cost.amount);
            GameState.pushLedger({ currency: cost.currency, delta: -cost.amount, reason: 'garden.bed' });
            bed.stage = 'empty';
            res.find = this.gardenDigFind();
            res.ok = true;
        } else if (action === 'dig' && bed.stage === 'empty') {
            // Лунка под семя. Копают её ПЕРЕД КАЖДОЙ посадкой: после сбора
            // грядка снова становится просто расчищенной землёй.
            bed.stage = 'dug';
            // В земле иногда что-то попадается. Это самое частое действие в
            // саду, и на нём держится единственный ручеёк валюты, не
            // завязанный на чревоугодие: без него игрок, не готовящий еду,
            // остался бы вообще без денег и без магазина (план, раздел 7).
            // Градация редкости — в GARDEN.digFinds.
            res.find = this.gardenDigFind();
            res.ok = true;
        } else if (action === 'sow' && bed.stage === 'dug') {
            const key = o.species;
            if (!key || this.gardenSeedCount(key) <= 0) return { ok: false, reason: 'no-seed' };
            // Семечка ТРАТИТСЯ. Пока семена были бесконечными, вид растения не
            // значил ничего: посадить помидор стоило столько же, сколько
            // траву, и выбор был не выбором.
            this.gardenSeedAdd(key, -1);
            bed.species = key;
            // Сид решается ОДИН раз и хранится: с Math.random() растение
            // выглядело бы по-новому после каждой перезагрузки страницы.
            bed.seed = Math.floor(Math.random() * 1e9);
            bed.stage = 'sown';
            bed.skipped = 0;
            bed.at = null;
            res.ok = true;
        } else if (action === 'water' && bed.stage === 'sown') {
            bed.stage = 'growing';
            bed.at = GameTime.now();
            res.ok = true;
        } else if (action === 'fertilize' && bed.stage === 'growing') {
            // Какашка снимает час. Удобрение не сокращает ожидание, оно
            // ПОКУПАЕТ его целиком: снятый час снят, вернётся игрок через
            // десять минут или через восемь часов — неважно.
            if (GameState.currency('dung') < 1) return { ok: false, reason: 'no-dung' };
            GameState.addCurrency('dung', -1);
            GameState.pushLedger({ currency: 'dung', delta: -1, reason: 'garden.fertilize' });
            bed.skipped = (bed.skipped || 0) + 1;
            if (this.gardenLeft(bed) <= 0) { bed.stage = 'weedy'; bed.at = null; }
            res.ok = true;
        } else if (action === 'weed' && bed.stage === 'weedy') {
            bed.stage = 'ripening';
            bed.at = GameTime.now();
            res.ok = true;
        } else if (action === 'harvest' && bed.stage === 'ripe') {
            // Собранная грядка возвращается в 'empty', а не в 'dug': лунка
            // осыпается вместе с выдернутым растением, и следующий круг
            // начинается снова с лопаты.
            const spec = GARDEN.species[bed.species] || {};
            res.grown = bed.species;

            // ПЛОД. Его может не быть вовсе: трава — это сплошной стебель, и
            // в кладовую кухни от неё не ложится ничего.
            if (spec.fruit) res.taken = this.pantryStore(spec.fruit, 1);

            // СЕНО. Второй продукт КАЖДОГО растения: стебель после сбора не
            // исчезает в никуда. У травы его вдвое больше — она из него
            // целиком и состоит.
            if (spec.hay) {
                this.award({ currencies: {} }, 'hay', spec.hay, 'garden.harvest');
                res.hay = spec.hay;
            }

            // ОСКОЛОК ЛЕНИ — только за плодовое. Иначе бесконечная трава
            // печатала бы жетоны, а с ними и новые грядки: потребность она
            // закрывает, экономику двигать не должна.
            if (GARDEN.HARVEST_SHARDS && spec.fruit) {
                this.award({ currencies: {} }, 'sloth_shard', GARDEN.HARVEST_SHARDS, 'garden.harvest');
                // Размен «три осколка = жетон» складывается сам, как у гнева
                // и кухни: курс фиксированный, выбора у игрока нет, а лишняя
                // кнопка «обменять» была бы работой без решения.
                this.settleExchange(null, null);
                res.shards = GARDEN.HARVEST_SHARDS;
            }

            // ВОЗВРАТ СЕМЕЧКИ. Бесконечным видам возвращать нечего.
            if (!spec.infinite && Math.random() < this.gardenSeedReturn()) {
                this.gardenSeedAdd(bed.species, 1);
                res.seedBack = bed.species;
            }

            bed.stage = 'empty';
            bed.species = null;
            bed.at = null;
            bed.skipped = 0;
            res.ok = true;
        }

        if (res.ok) {
            res.fill = this.gardenFill(action);
            GameState.save();
        }
        return res;
    },

    // Положить в кладовую — ту самую, из которой берёт кухня. Потолок на
    // каждый вид: сад производит быстрее, чем червь ест, и без потолка овощи
    // копятся бесконечно и обесцениваются (план, раздел 7).
    //
    // Имя общее, а не «садовое»: с тех пор как боссы забега роняют мясо, в
    // кладовую кладёт не один сад. Возвращает, сколько влезло НА САМОМ ДЕЛЕ —
    // по этому числу зовущий и решает, показывать ли прибавку.
    pantryStore(key, n) {
        if (!key) return 0;
        const cap = this.pantryCap();
        const pantry = GameState.data.pantry;
        const was = pantry[key] || 0;
        const now = Math.min(cap, was + n);
        pantry[key] = now;
        return now - was;                  // сколько влезло на самом деле
    },

    pantryCap() {
        // Ступени лежат на общем станке прокачки, вместе со своей ценой
        // (ECONOMY.minigames.gluttony.upgrades.fridge). Своего списка у
        // кладовой нет: пока он был в GARDEN.PANTRY_CAP, а цена появилась
        // в конфиге магазина, у одной величины оказалось бы два описания.
        return this.upgradeValue('gluttony', 'fridge');
    },

    // ---------- МАГАЗИН КУХНИ: ПРОДУКТЫ ----------
    // Расходуемое из приложения на телефоне. Утварь покупает общий
    // buyUpgrade(key, 'gluttony') — отдельной функции ей не нужно.
    //
    // Возвращает, сколько ВЛЕЗЛО: кладовая с потолком, и покупка в полный
    // холодильник — это отданное золото за ничто. Поэтому кончается она
    // отказом ДО списания, а не молчаливой пропажей товара.
    buyKitchenFood(key) {
        const good = ((KITCHEN.shop || {}).food || []).find(g => g.key === key);
        if (!good) return { ok: false, error: 'unknown_good' };

        const cur = (KITCHEN.shop.categories.find(c => c.key === 'food') || {}).currency || 'gold';
        if (GameState.currency(cur) < good.price) {
            return { ok: false, error: 'not_enough', currency: cur };
        }
        // Место проверяется ЗАРАНЕЕ и по той же формуле, по которой кладут:
        // иначе «купил и не влезло» превращается в пропажу денег.
        if (this.pantryCount(key) >= this.pantryCap()) {
            return { ok: false, error: 'full', cap: this.pantryCap() };
        }

        const requestId = newRequestId();
        GameState.addCurrency(cur, -good.price);
        GameState.pushLedger({
            currency: cur,
            delta: -good.price,
            reason: 'shop.kitchen.' + key,
            client_request_id: requestId
        });
        const got = this.pantryStore(key, 1);
        GameState.save();
        return { ok: true, key, got, count: this.pantryCount(key), currency: cur };
    },

    // Что попалось в земле. Бросок идёт ПО ОЧЕРЕДИ, от редкого к частому, и
    // останавливается на первой удаче: иначе частая монетка (каждый второй
    // копок) срабатывала бы первой и затеняла собой всё, что за ней, —
    // осколок жетона не выпал бы никогда.
    //
    // Находка ОДНА за копок, даже если повезло дважды: две вещи из одной ямки
    // читаются как сбой, а не как удача.
    gardenDigFind() {
        for (const f of GARDEN.digFinds) {
            if (Math.random() >= f.chance) continue;
            if (f.what === 'seed') {
                // Семечко УЖЕ ОТКРЫТОГО вида, а не нового: новые виды
                // открываются за жетоны в магазине, и находка не должна
                // обходить эту дверь. Зато она держит огород живым, пока
                // магазина нет: без притока вид вымирает за пару посадок.
                const keys = this.gardenSeedKeys().filter(k => !GARDEN.species[k].infinite);
                if (!keys.length) continue;
                const key = keys[Math.floor(Math.random() * keys.length)];
                this.gardenSeedAdd(key, f.amount);
                return { what: 'seed', key, amount: f.amount };
            }
            this.award({ currencies: {} }, f.what, f.amount, 'garden.dig');
            return { what: f.what, amount: f.amount };
        }
        return null;
    },

    // Списать продукты, ушедшие в кастрюлю. Вызывается ОДИН раз, в момент
    // кормёжки, а не когда игрок ткнул в холодильник: закрыл игру на
    // середине — продукты остались на месте.
    spendIngredients(keys) {
        const pantry = GameState.data.pantry;
        (keys || []).forEach(key => {
            const item = KITCHEN.ingredients[key] || KITCHEN.liquids[key];
            if (item && item.infinite) return;
            pantry[key] = Math.max(0, (pantry[key] || 0) - 1);
            if (!pantry[key]) delete pantry[key];
        });
        GameState.save();
        return pantry;
    },

    // Качество блюда — по числу РАЗНЫХ типов нарезаемого, а не по рецепту.
    // Рецепты пришлось бы где-то показывать, а показывать их нечем: слов в
    // игре нет (docs/plan/20-gluttony-kitchen.md, раздел 4).
    dishQuality(meta) {
        const q = KITCHEN.quality;
        const info = meta || {};
        const types = Array.isArray(info.types) ? info.types : [];
        const chopped = types.filter(t => KITCHEN.CHOP_TYPES.indexOf(t) !== -1);

        // Пищеблок не считается типом: он закрывает потребность и только.
        if (!chopped.length) return Object.assign({ tier: 'block' }, q.block);

        const rich = !!info.richLiquid;
        const n = Math.min(3, chopped.length);
        if (n === 3 && !rich) return Object.assign({ tier: '3water' }, q['3water']);
        return Object.assign({ tier: String(n) }, q[n]);
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
            seed: Math.floor(Math.random() * 1e9),
            // Сколько мелких какашек в этой кучке. Решено было в момент
            // кормёжки — здесь только переносится на предмет, чтобы кучка
            // рисовалась соответствующего размера и отдала своё при уборке.
            size: Math.max(0, GameState.data.digestion.poop_size || 0)
        };
        GameState.data.room.poops.push(poop);
        GameState.data.digestion.fed_at = null;
        GameState.data.digestion.poop_size = 0;
        GameState.save();
        return poop;
    },

    // Убрать с пола — и получить за неё какашки. Начисление живёт здесь, а
    // не в обработчике тапа: кошелёк пополняется в одном месте на всю игру.
    //
    // Кучка от пищеблока пустая (size 0): червь сыт, а экономика не
    // двинулась — в этом и цена страховки от тупика.
    removePoop(id) {
        const list = GameState.data.room.poops;
        const i = list.findIndex(p => p.id === id);
        if (i === -1) return false;
        const poop = list[i];
        list.splice(i, 1);

        const gained = { dung: 0 };
        const size = Math.max(0, poop.size || 0);
        if (size > 0) {
            const awarded = { currencies: {} };
            this.award(awarded, 'dung', size, 'poop.collect', 'poop-' + id);
            gained.dung = size;
        }
        GameState.save();
        return gained;
    },
});
