// ================= ОТДАЧА В ПАЛЕЦ =================
// Один слой на всю игру: механика говорит, ЧТО произошло, а чем это ощутить —
// решает этот файл. Мини-игра не должна знать ни про Telegram, ни про
// navigator.vibrate, ни про то, что на одной платформе есть щелчки, а на
// другой только тупое жужжание.
//
// ---------- ГДЕ ЭТО ВООБЩЕ РАБОТАЕТ ----------
// Три разных мира, и это надо знать заранее, а не выяснять на телефоне:
//
//   • Telegram (наш главный дом) — родная тактильная отдача iOS через
//     WebApp.HapticFeedback: настоящие щелчки, разные по силе;
//   • Android в браузере — navigator.vibrate: одно жужжание, силы нет,
//     длительность есть;
//   • Safari на iPhone ВНЕ Telegram — не умеет ничего. Ни vibrate, ни
//     чего-либо ещё: API просто нет, и обойти это нельзя.
//
// Последнее — не поломка и не повод отказываться от отдачи: игра живёт в
// Telegram, а открывается везде (инвариант 7). Там, где платформа не умеет,
// всё молча работает как раньше.
//
// ---------- ПОЧЕМУ С ПОРОГОМ ПО ВРЕМЕНИ ----------
// Отдача, которую дёргают на каждое движение пальца, превращается в
// непрерывное жужжание — и на Android это ещё и заметно жрёт батарею.
// Поэтому здесь стоит минимальный промежуток: чаще, чем раз в 35 мс, палец
// всё равно не различает отдельные щелчки.
const Haptics = {

    MIN_GAP_MS: 35,
    _last: 0,
    enabled: true,

    // Тактильный мост Telegram, если игра открыта внутри него.
    tg() {
        const w = (typeof window !== 'undefined') ? window : null;
        const app = w && w.Telegram && w.Telegram.WebApp;
        const h = app && app.HapticFeedback;
        return (h && typeof h.impactOccurred === 'function') ? h : null;
    },

    // Умеет ли платформа хоть что-нибудь. Нужно не для отдачи, а для
    // интерфейса: настройку «отдача» показывать там, где её нет, незачем.
    supported() {
        return !!this.tg() || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');
    },

    // force — «это событие важнее порога». Нужно ровно там, где отдача
    // ОТВЕЧАЕТ на действие: рычаг сорвался, крутка отказала. Такой ответ
    // приходит сразу за щелчками и был бы съеден порогом — а именно его
    // палец и ждёт.
    _gate(force) {
        if (!this.enabled) return false;
        const now = Date.now();
        if (!force && now - this._last < this.MIN_GAP_MS) return false;
        this._last = now;
        return true;
    },

    _buzz(ms) {
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(ms);
            }
        } catch (err) {
            /* платформа отказала — молча живём дальше */
        }
    },

    // ЩЕЛЧОК. Самая мелкая отдача: зубец храповика, шаг ползунка, переход
    // выбора с одного на другое. В Telegram для этого есть отдельный вид —
    // selectionChanged: он тише любого impact и не отвлекает.
    tick() {
        if (!this._gate()) return;
        const h = this.tg();
        if (h && typeof h.selectionChanged === 'function') {
            try { h.selectionChanged(); return; } catch (err) { /* см. ниже */ }
        }
        this._buzz(8);
    },

    // УДАР. kind: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' — имена
    // взяты у Telegram, чтобы не переводить туда-обратно.
    impact(kind, force) {
        if (!this._gate(force)) return;
        const h = this.tg();
        if (h) {
            try { h.impactOccurred(kind || 'medium'); return; } catch (err) { /* ниже */ }
        }
        const ms = kind === 'heavy' ? 26 : kind === 'light' ? 10 : 16;
        this._buzz(ms);
    },

    // ИЗВЕСТИЕ: получилось или нет. kind: 'success' | 'warning' | 'error'.
    notify(kind, force) {
        if (!this._gate(force)) return;
        const h = this.tg();
        if (h && typeof h.notificationOccurred === 'function') {
            try { h.notificationOccurred(kind || 'success'); return; } catch (err) { /* ниже */ }
        }
        this._buzz(kind === 'error' ? [18, 60, 18] : [12, 40, 22]);
    }
};

if (typeof window !== 'undefined') window.Haptics = Haptics;
