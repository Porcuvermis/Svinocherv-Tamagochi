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
        const awarded = { sin, mode, outcome, sinValue: null, currencies: {} };

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
