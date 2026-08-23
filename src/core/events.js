// ================= ШИНА СОБЫТИЙ =================
// Через неё мини-игры сообщают ядру о результате, ничего не зная ни про
// экономику, ни про сервер. Мини-игра кричит «я закончилась вот так», а
// решение, что за это дать, принимается в одном месте (Backend + конфиг).
//
// Обработчики изолированы: упавший подписчик не мешает остальным. Иначе
// ошибка в одном экране роняла бы начисление за пройденную мини-игру.
const GameEvents = {
    _handlers: {},

    on(name, fn) {
        if (!this._handlers[name]) this._handlers[name] = [];
        this._handlers[name].push(fn);
        return () => this.off(name, fn);
    },

    off(name, fn) {
        const list = this._handlers[name];
        if (!list) return;
        const i = list.indexOf(fn);
        if (i !== -1) list.splice(i, 1);
    },

    emit(name, payload) {
        const list = this._handlers[name];
        if (!list || !list.length) {
            console.warn('[События] некому обработать:', name, payload);
            return;
        }
        list.slice().forEach(fn => {
            try {
                fn(payload);
            } catch (err) {
                console.error('[События] обработчик упал на', name, err);
            }
        });
    }
};

if (typeof window !== 'undefined') window.GameEvents = GameEvents;
