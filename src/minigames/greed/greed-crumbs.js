// ================= АППАРАТ АЛЧНОСТИ: ЖУРНАЛ ШАГОВ, ПЕРЕЖИВАЮЩИЙ ВЫЛЕТ =================
// Игрок ловит вылеты при покупке колеса, пачинко и версии 2 только на
// iPhone в Telegram (21.11): консоли там нет, а вылет стирает всё, что
// жило в памяти страницы (строка литья в 🐞, GreedLux._castInfo, — тоже).
// Поэтому шаги покупки пишутся в localStorage сразу, по строке: после
// вылета следующий запуск переносит журнал в «прошлый сеанс», и 🐞 →
// «Журнал» показывает, на каком шаге игру убили. Последняя строка без
// «страница закрыта» — сеанс оборвался, а не закрылся.
//
// Пишутся только редкие шаги (вход, заготовка, покупка, литьё), не кадры:
// каждая строка — синхронная запись в хранилище.
const GreedCrumbs = {
    KEY: 'gj-crumbs', PREV: 'gj-crumbs-prev', MAX: 60,
    list: [],

    init() {
        try {
            const cur = localStorage.getItem(this.KEY);
            if (cur) localStorage.setItem(this.PREV, cur);
            localStorage.removeItem(this.KEY);
        } catch (e) { /* нет хранилища — журнал только в памяти */ }
        this.add('запуск');
        window.addEventListener('pagehide', () => this.add('страница закрыта'));
        // ошибки — тоже в журнал: на телефоне их больше негде увидеть
        window.addEventListener('error', (e) => this.add('ошибка: ' + String(e && e.message || e).slice(0, 120)));
        window.addEventListener('unhandledrejection', (e) => this.add('отказ: ' + String(e && e.reason && (e.reason.message || e.reason)).slice(0, 120)));
    },

    add(s) {
        const d = new Date(), p = (n, k = 2) => String(n).padStart(k, '0');
        this.list.push(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)} ${s}`);
        if (this.list.length > this.MAX) this.list.splice(0, this.list.length - this.MAX);
        try { localStorage.setItem(this.KEY, JSON.stringify(this.list)); } catch (e) { /* полно или нет */ }
    },

    prev() {
        try { return JSON.parse(localStorage.getItem(this.PREV) || 'null'); } catch (e) { return null; }
    }
};
GreedCrumbs.init();
