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
            unlocks: {},
            daily_counters: {},
            runs: {},
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

        ['currencies', 'inventory', 'unlocks', 'daily_counters', 'runs'].forEach(key => {
            if (!d[key] || typeof d[key] !== 'object' || Array.isArray(d[key])) d[key] = {};
        });
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
