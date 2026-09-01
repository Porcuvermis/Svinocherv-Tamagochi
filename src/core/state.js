// ================= СОСТОЯНИЕ ИГРОКА =================
// Единственное место, где живёт прогресс: шкалы, кошелёк, шрамы, суточные
// счётчики, незавершённые забеги.
//
// ---------- ФОРМА ----------
// Повторяет будущую схему БД (docs/plan/01-architecture.md, раздел 4):
// players / currencies / sins / scars / daily_counters / runs. Это сделано
// нарочно: когда появится сервер, перенос будет копированием, а не
// переводом с одного языка на другой.
//
// ---------- ХРАНИЛИЩЕ ----------
// Пока сервера нет, localStorage — единственное место, где лежит прогресс,
// и относиться к нему надо соответственно. Отсюда два правила:
//
//   1. НИКОГДА не стирать сохранение. В worm-model.js при несовпадении
//      версии сейв просто выбрасывается — для внешности червя это терпимо,
//      для шрамов, которые копятся неделями, недопустимо. Здесь вместо
//      сброса работают миграции, а недостающие поля достраиваются дефолтами.
//   2. Сохранение из БУДУЩЕЙ версии тоже не трогать. Сборки веток лежат на
//      одном домене (см. /preview/), значит одно и то же хранилище видят и
//      свежая сборка, и вчерашняя. Старый код обязан пережить новый формат,
//      а не затереть его.
const GameState = {
    STORAGE_KEY: 'svinocherv_state_v1',
    SCHEMA_VERSION: 1,

    data: null,
    _listeners: [],

    // ---------- СОЗДАНИЕ ----------
    createInitial() {
        const now = GameTime.now();
        const state = {
            schema_version: this.SCHEMA_VERSION,
            player: {
                created_at: now,
                last_seen_at: now,
                timezone_offset: GameTime.localTimezoneOffset()
            },
            sins: {},
            currencies: {},
            scars: [],
            inventory: {},
            // Кладовая кухни: сколько чего лежит в холодильнике. Отдельно от
            // inventory — там снаряжение гнева, а тут расходники, которые
            // тратятся каждой готовкой. Ключ — ингредиент или жидкость из
            // src/config/kitchen.js, значение — штук.
            pantry: {},
            // Боевая прокачка гнева: ветка → купленный уровень (0 = не
            // куплено). В отличие от снаряжения, не снимается.
            upgrades: {},
            // Надетое снаряжение гнева: слот → id предмета из
            // src/config/wrath-gear.js. Пусто = дерётся как есть.
            equipment: {},
            unlocks: {},
            daily_counters: {},
            // Накопительные счётчики за всё время (в отличие от суточных):
            // на них стоят награды вида «осколок за каждые три поражения».
            counters: {},
            runs: {},
            // Пищеварение: одна метка времени, всё остальное считается от неё.
            digestion: { fed_at: null, poop_size: 0 },
            // Сад лени. Грядка — это НЕ снимок растения, а несколько чисел, из
            // которых он выводится: вид, сид формы и метки времени. Иначе
            // пришлось бы хранить список точек, а после каждой правки
            // рендерера старые сейвы рисовались бы мусором.
            //
            // seeds — сколько семечек каждого вида лежит в мешке (трава сюда
            // не пишется: она бесконечная, см. GARDEN.species.grass);
            // tools — ступени лейки, граблей, лопаты и возврата семян.
            garden: { beds: [], seeds: {}, tools: { can: 0, rake: 0, spade: 0, seed: 0 } },
            // Боец гнева: сколько здоровья осталось после последнего боя.
            // hp === null означает «полное»: до первого боя и после того, как
            // всё заросло, хранить нечего. Форма та же, что у шкал грехов —
            // значение плюс метка времени, от которой считается остальное.
            //
            // frozen — «зарастание сейчас не идёт». Ставится на время боя и
            // забега в рогалике: там здоровье лечится своими способами, а не
            // само по себе. Флаг живёт в состоянии, а не в памяти экрана,
            // потому что игру закрывают прямо посреди боя.
            fighter: { hp: null, updated_at: null, frozen: false },
            // Жизнь и смерть червя. Сама смерть НЕ хранится — она выводится
            // из меток шкал (см. worm-condition.js). Хранится только
            // воскрешение: оно обрывает прошлое голодание, иначе поднятый
            // червь умирал бы снова в ту же секунду.
            worm: { revived_at: null },
            // Комната: где червь живёт и что лежит на полу. Локация — такая
            // же косметика, как будущие шапки: список в src/core/rooms.js.
            room: { location: 'home', poops: [] },
            ledger: [],
            requests: []
        };
        Object.keys(ECONOMY.sins).forEach(key => {
            state.sins[key] = {
                value: ECONOMY.sins[key].max,
                updated_at: now,
                // Множитель, а не готовая скорость. Скорость берётся из
                // конфига и домножается на это число, поэтому правка баланса
                // видна сразу на всех сохранениях, а мета-апгрейду
                // «замедлить падение» всё равно есть куда записаться.
                decay_mult: 1,
                max_bonus: 0
            };
        });
        return state;
    },

    // ---------- ЗАГРУЗКА И МИГРАЦИИ ----------
    // Сюда добавляются функции по мере изменения формата:
    //   MIGRATIONS[1] = (data) => { ...превратить схему 1 в схему 2... };
    // и SCHEMA_VERSION поднимается на единицу.
    MIGRATIONS: {},

    load() {
        let raw = null;
        try {
            raw = localStorage.getItem(this.STORAGE_KEY);
        } catch (err) {
            // Приватный режим Safari — играем без сохранения, но играем.
            console.warn('[Состояние] хранилище недоступно, работаем в памяти');
        }

        if (!raw) {
            this.data = this.createInitial();
            this.fillDefaults();
            this.save();
            return this.data;
        }

        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            console.error('[Состояние] сохранение битое, начинаем заново', err);
            parsed = null;
        }

        this.data = parsed && typeof parsed === 'object' ? parsed : this.createInitial();
        this.migrate();
        this.fillDefaults();
        this.pruneDailyCounters();
        this.save();
        return this.data;
    },

    migrate() {
        let version = Number(this.data.schema_version) || 0;

        if (version > this.SCHEMA_VERSION) {
            // Сохранение из более новой сборки. Ничего не переписываем: у
            // старого кода нет способа понять новый формат, а испортить
            // прогресс он может запросто. Работаем с тем, что понимаем.
            console.warn('[Состояние] сохранение новее сборки (' + version +
                         ' > ' + this.SCHEMA_VERSION + '), оставляем как есть');
            return;
        }

        while (version < this.SCHEMA_VERSION) {
            const step = this.MIGRATIONS[version];
            if (typeof step !== 'function') {
                console.warn('[Состояние] нет миграции с версии ' + version +
                             ', достраиваем дефолтами');
                break;
            }
            step(this.data);
            version += 1;
            this.data.schema_version = version;
        }
        this.data.schema_version = Math.max(version, this.SCHEMA_VERSION);
    },

    // Достраивает недостающее, не трогая то, что уже есть.
    fillDefaults() {
        const now = GameTime.now();
        const d = this.data;

        if (!d.player || typeof d.player !== 'object') d.player = {};
        if (typeof d.player.created_at !== 'number') d.player.created_at = now;
        if (typeof d.player.last_seen_at !== 'number') d.player.last_seen_at = now;
        if (typeof d.player.timezone_offset !== 'number') {
            d.player.timezone_offset = GameTime.localTimezoneOffset();
        }

        // poop_size — сколько мелких какашек даст кучка, которая появится
        // через час. Решается в момент кормёжки (качество блюда), а не когда
        // червь какает: к тому времени о блюде уже никто не помнит.
        if (!d.digestion || typeof d.digestion !== 'object') d.digestion = { fed_at: null, poop_size: 0 };
        if (typeof d.digestion.poop_size !== 'number') d.digestion.poop_size = 0;
        if (!d.fighter || typeof d.fighter !== 'object') d.fighter = { hp: null, updated_at: null, frozen: false };
        if (typeof d.fighter.frozen !== 'boolean') d.fighter.frozen = false;
        if (!d.worm || typeof d.worm !== 'object') d.worm = { revived_at: null };
        if (!d.room || typeof d.room !== 'object') d.room = {};
        if (!Array.isArray(d.room.poops)) d.room.poops = [];
        // Ключ локации проверяется по реестру, а не просто на «непусто»:
        // сборка могла откатиться, а в сейве остался ключ локации, которой в
        // ней уже нет. Тогда комната не нарисовалась бы вовсе.
        if (typeof RoomLocations !== 'undefined') {
            if (!RoomLocations.has(d.room.location)) d.room.location = RoomLocations.DEFAULT;
        } else if (!d.room.location) {
            d.room.location = 'home';
        }

        // ---------- САД ----------
        // Грядки заводятся по числу из конфига, а не по тому, сколько их было
        // в сейве: добавили место на участке — оно появляется у всех, включая
        // тех, кто играет неделю. Открытость грядки при этом сохраняется.
        if (!d.garden || typeof d.garden !== 'object') d.garden = {};
        if (!Array.isArray(d.garden.beds)) d.garden.beds = [];
        // Семена — СЧЁТЧИКИ по видам, а не список открытых. Старые сейвы
        // хранили список: посадить можно было бесконечно, и вид ничего не
        // стоил. Список превращается в счётчики, чтобы недельный прогресс не
        // обнулился (инвариант 5).
        if (Array.isArray(d.garden.seeds)) {
            const was = d.garden.seeds;
            d.garden.seeds = {};
            was.forEach(key => { d.garden.seeds[key] = 2; });
        }
        if (!d.garden.seeds || typeof d.garden.seeds !== 'object') d.garden.seeds = {};
        if (!d.garden.tools || typeof d.garden.tools !== 'object') {
            d.garden.tools = { can: 0, rake: 0, spade: 0, seed: 0 };
        }
        if (typeof GARDEN !== 'undefined') {
            for (let i = 0; i < GARDEN.BEDS_TOTAL; i++) {
                const bed = d.garden.beds[i];
                if (!bed || typeof bed !== 'object') {
                    d.garden.beds[i] = {
                        // 'locked' — под мусором (разбирают руками),
                        // 'empty' — расчищена, но не вскопана,
                        // 'dug' — вскопана лунка, ждёт семя,
                        // 'sown' — посеяно, ждёт полива,
                        // 'growing' — этап 1, 'weedy' — просит прополки,
                        // 'ripening' — этап 2, 'ripe' — можно собирать.
                        stage: i < GARDEN.BEDS_OPEN ? 'empty' : 'locked',
                        species: null,
                        seed: 0,
                        at: null,        // когда начался текущий этап
                        skipped: 0       // сколько часов снято удобрением
                    };
                }
            }
            d.garden.beds.length = GARDEN.BEDS_TOTAL;
            // Стартовые семена выдаются ОДИН раз и помечаются флагом, а не
            // «досыпаются, если пусто»: иначе игрок, честно израсходовавший
            // все семена, получал бы их обратно при каждой перезагрузке. Та
            // же история, что со стартовой кладовой кухни.
            if (!d.player.seeds_seeded) {
                Object.keys(GARDEN.startingSeeds).forEach(key => {
                    d.garden.seeds[key] = (d.garden.seeds[key] || 0) + GARDEN.startingSeeds[key];
                });
                d.player.seeds_seeded = true;
            }
        }

        ['currencies', 'inventory', 'pantry', 'equipment', 'upgrades', 'unlocks', 'daily_counters', 'counters', 'runs'].forEach(key => {
            if (!d[key] || typeof d[key] !== 'object' || Array.isArray(d[key])) d[key] = {};
        });

        // Стартовый запас кухни выдаётся ОДИН раз и помечается флагом, а не
        // «досыпается, если пусто»: иначе игрок, честно израсходовавший все
        // продукты, получал бы их обратно при каждой перезагрузке.
        if (typeof KITCHEN !== 'undefined' && !d.player.pantry_seeded) {
            Object.keys(KITCHEN.startingPantry).forEach(key => {
                d.pantry[key] = (d.pantry[key] || 0) + KITCHEN.startingPantry[key];
            });
            Object.keys(KITCHEN.startingLiquids).forEach(key => {
                d.pantry[key] = (d.pantry[key] || 0) + KITCHEN.startingLiquids[key];
            });
            d.player.pantry_seeded = true;
        }
        ['scars', 'ledger', 'requests'].forEach(key => {
            if (!Array.isArray(d[key])) d[key] = [];
        });

        if (!d.sins || typeof d.sins !== 'object') d.sins = {};
        Object.keys(ECONOMY.sins).forEach(key => {
            const sin = d.sins[key];
            if (!sin || typeof sin !== 'object') {
                // Новый грех в конфиге — начинаем его с полной шкалы, а не с
                // нуля: иначе добавление греха выглядит как наказание.
                d.sins[key] = {
                    value: this.maxValue(key),
                    updated_at: now,
                    decay_mult: 1,
                    max_bonus: 0
                };
                return;
            }
            if (typeof sin.value !== 'number' || !isFinite(sin.value)) sin.value = this.maxValue(key);
            if (typeof sin.updated_at !== 'number' || !isFinite(sin.updated_at)) sin.updated_at = now;
            if (typeof sin.decay_mult !== 'number' || !isFinite(sin.decay_mult)) sin.decay_mult = 1;
            if (typeof sin.max_bonus !== 'number' || !isFinite(sin.max_bonus)) sin.max_bonus = 0;
        });
    },

    // Суточные счётчики нужны за последние дни (стрики, лимиты), остальное —
    // мусор, который иначе растёт вечно.
    pruneDailyCounters(keepDays) {
        const keep = keepDays || 7;
        const keys = Object.keys(this.data.daily_counters).sort();
        while (keys.length > keep) {
            delete this.data.daily_counters[keys.shift()];
        }
    },

    // ---------- ЧТЕНИЕ ----------
    maxValue(sinKey) {
        const conf = ECONOMY.sins[sinKey];
        if (!conf) return 0;
        const bonus = this.data && this.data.sins[sinKey] ? (this.data.sins[sinKey].max_bonus || 0) : 0;
        return conf.max + bonus;
    },

    decayRate(sinKey) {
        const sin = this.data ? this.data.sins[sinKey] : null;
        const mult = sin && typeof sin.decay_mult === 'number' ? sin.decay_mult : 1;
        return sinDecayRate(sinKey) * mult;
    },

    // Актуальное значение шкалы. Не хранится — вычисляется от метки времени.
    sinValue(sinKey) {
        const sin = this.data ? this.data.sins[sinKey] : null;
        if (!sin) return 0;
        return GameTime.decayed(sin.value, sin.updated_at, this.decayRate(sinKey), 0, this.maxValue(sinKey));
    },

    // ---------- ЗДОРОВЬЕ БОЙЦА ----------
    // Не хранится «сколько сейчас», хранится «сколько было и когда». Между
    // боями оно зарастает само, и считается это формулой — как значение шкалы
    // греха. Поэтому восстановление идёт и при закрытой игре, а перевод часов
    // на телефоне ничего не меняет: время берётся из GameTime.
    //
    // Максимум приходит снаружи: он зависит от надетого снаряжения, а это не
    // дело стора.
    fighterHp(maxHp) {
        const raw = this.fighterHpRaw();
        if (raw === null) return maxHp;
        // Вниз округляем: показывать «7 из 13», пока набежало 7.4, честнее,
        // чем округлять к восьми, которых ещё нет.
        return Math.max(0, Math.min(maxHp, Math.floor(raw)));
    },

    // ---------- ПРОКАЧКА ----------
    // Суммарная прибавка ветки на купленном уровне. Ноль, если не куплено.
    // Уровни — данные в конфиге, здесь только чтение.
    upgradeBonus(key) {
        const conf = ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.upgrades;
        const branch = conf && conf[key];
        if (!branch || !branch.levels) return 0;
        const level = (this.data && this.data.upgrades && this.data.upgrades[key]) || 0;
        if (level <= 0) return 0;
        const step = branch.levels[Math.min(level, branch.levels.length) - 1];
        return step ? (step.bonus || 0) : 0;
    },

    upgradeLevel(key) {
        return (this.data && this.data.upgrades && this.data.upgrades[key]) || 0;
    },

    // Скорость зарастания: база из конфига плюс прокачка.
    regenRate() {
        const base = (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.regenPerSecond) || 0;
        return base + this.upgradeBonus('regen');
    },

    // Сырое здоровье, без потолка: потолок зависит от снаряжения, а это не
    // дело стора. Нужно самой заморозке — зафиксировать накопленное.
    // null означает «хранить нечего, здоровье полное».
    fighterHpRaw() {
        const f = this.data ? this.data.fighter : null;
        if (!f || f.hp === null || f.hp === undefined || !f.updated_at) return null;
        // Зарастание остановлено (идёт бой или забег) — сколько было, столько
        // и есть, сколько бы времени ни прошло.
        if (f.frozen) return f.hp;
        return f.hp + GameTime.secondsSince(f.updated_at) * this.regenRate();
    },

    // Сколько секунд до полного здоровья. Нужно интерфейсу, чтобы написать
    // «зарастает», а не молчать.
    fighterHealSeconds(maxHp) {
        const rate = this.regenRate();
        if (rate <= 0) return null;
        const missing = maxHp - this.fighterHp(maxHp);
        return missing > 0 ? Math.ceil(missing / rate) : 0;
    },

    currency(key) {
        return this.data.currencies[key] || 0;
    },

    dayKey() {
        return GameTime.dayKey(this.data.player.timezone_offset);
    },

    counter(counterKey) {
        const day = this.data.daily_counters[this.dayKey()];
        return (day && day[counterKey]) || 0;
    },

    // Накопительный счётчик — за всё время, а не за сутки. Суточные чистятся
    // через неделю, а «каждое третье поражение» обязано помнить дольше.
    totalCounter(counterKey) {
        return (this.data.counters && this.data.counters[counterKey]) || 0;
    },

    // Фаза пищеварения на текущий момент. Ничего не хранится, кроме метки
    // времени: где именно едет комок — вычисляется, как и всё остальное.
    //
    // Фазы: 'idle' — не кормлен; 'swallow' — куски идут к желудку;
    // 'stomach' — переваривается; 'bowel' — комок идёт к хвосту;
    // 'done' — пора какать (это состояние разруливает Backend).
    digestion() {
        const cfg = ECONOMY.digestion;
        const fedAt = this.data && this.data.digestion ? this.data.digestion.fed_at : null;
        if (!fedAt) return { phase: 'idle', progress: 0, elapsed: 0 };

        const elapsed = GameTime.secondsSince(fedAt);
        const swallow = cfg.swallowSeconds + cfg.biteGapSeconds * Math.max(0, cfg.bites - 1);
        const stomachEnd = swallow + cfg.stomachMinutes * 60;
        const bowelEnd = stomachEnd + cfg.bowelMinutes * 60;

        if (elapsed < swallow) return { phase: 'swallow', progress: elapsed / swallow, elapsed };
        if (elapsed < stomachEnd) {
            return { phase: 'stomach', progress: (elapsed - swallow) / (stomachEnd - swallow), elapsed };
        }
        if (elapsed < bowelEnd) {
            return { phase: 'bowel', progress: (elapsed - stomachEnd) / (bowelEnd - stomachEnd), elapsed };
        }
        return { phase: 'done', progress: 1, elapsed };
    },

    // ---------- ЗАПИСЬ ----------
    // Дёргается только из Backend: правила начисления живут там, а не здесь
    // и тем более не в мини-играх.
    setSinValue(sinKey, value) {
        const sin = this.data.sins[sinKey];
        if (!sin) return;
        sin.value = Math.max(0, Math.min(this.maxValue(sinKey), value));
        sin.updated_at = GameTime.now();
    },

    addCurrency(key, delta) {
        const next = (this.data.currencies[key] || 0) + delta;
        this.data.currencies[key] = Math.max(0, next);
        return this.data.currencies[key];
    },

    bumpTotal(counterKey, delta) {
        if (!this.data.counters) this.data.counters = {};
        const value = (this.data.counters[counterKey] || 0) + (delta || 1);
        this.data.counters[counterKey] = value;
        return value;
    },

    bumpCounter(counterKey, delta) {
        const day = this.dayKey();
        if (!this.data.daily_counters[day]) this.data.daily_counters[day] = {};
        const value = (this.data.daily_counters[day][counterKey] || 0) + (delta || 1);
        this.data.daily_counters[day][counterKey] = value;
        return value;
    },

    // Журнал начислений. На сервере это таблица ledger, по которой можно
    // разобрать баг и откатить накрутку; здесь — те же записи, по которым
    // видно, за что игра что выдала.
    pushLedger(entry) {
        this.data.ledger.push(Object.assign({ at: GameTime.now() }, entry));
        const MAX = 200;
        if (this.data.ledger.length > MAX) {
            this.data.ledger.splice(0, this.data.ledger.length - MAX);
        }
    },

    // Идемпотентность: повторный запрос с тем же id не начисляет второй раз.
    // На сервере эту роль играет ledger.client_request_id UNIQUE.
    wasProcessed(requestId) {
        return !!requestId && this.data.requests.indexOf(requestId) !== -1;
    },

    markProcessed(requestId) {
        if (!requestId) return;
        this.data.requests.push(requestId);
        const MAX = 100;
        if (this.data.requests.length > MAX) {
            this.data.requests.splice(0, this.data.requests.length - MAX);
        }
    },

    touch() {
        this.data.player.last_seen_at = GameTime.now();
    },

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (err) {
            // Переполнение или приватный режим: молча продолжаем в памяти.
        }
        this._listeners.forEach(fn => {
            try { fn(this.data); } catch (e) { console.error('[Состояние] подписчик упал', e); }
        });
    },

    subscribe(fn) {
        this._listeners.push(fn);
        return () => {
            const i = this._listeners.indexOf(fn);
            if (i !== -1) this._listeners.splice(i, 1);
        };
    },

    // Полный сброс — только по явной команде (кнопка в debug, консоль).
    reset() {
        this.data = this.createInitial();
        this.fillDefaults();
        this.save();
        return this.data;
    }
};

if (typeof window !== 'undefined') window.GameState = GameState;
