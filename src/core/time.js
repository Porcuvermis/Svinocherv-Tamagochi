// ================= ВРЕМЯ =================
// Одно место, где игра узнаёт «который час», и одна формула, по которой
// шкалы падают.
//
// ---------- ПОЧЕМУ НЕ ТАЙМЕР ----------
// Раньше было `setInterval(() => this.decaySins(), 500)`: шкала падала,
// только пока приложение открыто. Закрыл — заморозил, что прямо противоречит
// идее тамагочи.
//
// Теперь состояние НЕ обновляется по таймеру. Хранится последнее известное
// значение и метка времени, а актуальное вычисляется в момент обращения:
//
//     value_now = clamp(0, max, value_at - decay_rate * (now - updated_at))
//
// Отсюда всё нужное получается само: шкалы падают одинаково, открыта игра или
// нет; не нужен фоновый процесс, крутящий записи раз в секунду; одна и та же
// формула считает и на клиенте (для плавности), и на сервере (для правды).
//
// ---------- ПОЧЕМУ ВРЕМЯ СЕРВЕРНОЕ ----------
// Часы на телефоне подделываются переводом системного времени — это
// бесплатный способ намотать себе оффлайн-доход. Поэтому источник времени —
// сервер: клиент получает его метку и хранит поправку к своим часам.
// Сервера пока нет, поправка равна нулю, но весь код уже спрашивает время
// здесь, а не у Date.now() напрямую.
const GameTime = {
    _offsetMs: 0,

    // Вызывается при каждом ответе сервера (у нас — при старте).
    syncWithServer(serverTimeMs) {
        if (typeof serverTimeMs !== 'number' || !isFinite(serverTimeMs)) return;
        this._offsetMs = serverTimeMs - Date.now();
    },

    offsetMs() {
        return this._offsetMs;
    },

    now() {
        return Date.now() + this._offsetMs;
    },

    secondsSince(timestampMs) {
        if (typeof timestampMs !== 'number' || !isFinite(timestampMs)) return 0;
        return Math.max(0, (this.now() - timestampMs) / 1000);
    },

    // Ленивый расчёт: сколько стало сейчас из того, что было в updatedAt.
    decayed(valueAt, updatedAtMs, ratePerSec, min, max) {
        const lo = (typeof min === 'number') ? min : 0;
        const hi = (typeof max === 'number') ? max : Infinity;
        const value = valueAt - ratePerSec * this.secondsSince(updatedAtMs);
        return Math.max(lo, Math.min(hi, value));
    },

    // Ключ суток для стриков, ежедневок и суточных лимитов.
    // Считается с поправкой на часовой пояс игрока: иначе «сутки» будут
    // неверными для половины мира (docs/plan/01-architecture.md, раздел 4).
    dayKey(timezoneOffsetMinutes) {
        const offset = (typeof timezoneOffsetMinutes === 'number')
            ? timezoneOffsetMinutes
            : -new Date().getTimezoneOffset();
        const local = new Date(this.now() + offset * 60000);
        const pad = (n) => String(n).padStart(2, '0');
        return local.getUTCFullYear() + '-' + pad(local.getUTCMonth() + 1) + '-' + pad(local.getUTCDate());
    },

    // Часовой пояс игрока в минутах от UTC (Москва = +180).
    localTimezoneOffset() {
        return -new Date().getTimezoneOffset();
    }
};

if (typeof window !== 'undefined') window.GameTime = GameTime;
