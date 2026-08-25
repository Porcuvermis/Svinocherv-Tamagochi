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

        if (reward.currencies) {
            Object.keys(reward.currencies).forEach(key => {
                const delta = reward.currencies[key];
                if (!delta) return;
                GameState.addCurrency(key, delta);
                GameState.pushLedger({
                    currency: key,
                    delta,
                    reason: sin + '.' + mode + '.' + outcome,
                    client_request_id: requestId
                });
                awarded.currencies[key] = delta;
            });
        }

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
