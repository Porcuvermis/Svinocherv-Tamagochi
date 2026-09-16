// ================= ПРИЛЁТ И УЛЁТ В КОШЕЛЬКЕ =================
// Ресурс изменился — это показывается ТАМ, ГДЕ ОН ЛЕЖИТ: над счётчиком
// всплывает «+12» или «−1» со значком валюты, уезжает вниз и растворяется.
//
// ---------- ЧТО БЫЛО ДО ----------
// Каждый экран сообщал о трате по-своему и в своём месте. У забега, например,
// под картой висела строка «🔴 −1» — она появлялась при входе, ничего не
// объясняла (игрок только что сам нажал кнопку с ценой) и жила до следующей
// перерисовки: переключил режим и вернулся — строки нет. Сообщение о деньгах
// в случайном месте экрана не связывается с кошельком вообще никак.
//
// ---------- ПРАВИЛО ----------
// Начислили или списали — цифра вылетает ИЗ СЧЁТЧИКА этой валюты. Связь
// «потратил → в кошельке стало меньше» показывается движением, а не текстом
// рядом с кнопкой. Никаких отдельных строк-сообщений про валюту на экранах
// заводить больше не надо.
//
// ---------- КАК НАХОДИТСЯ СЧЁТЧИК ----------
// По разметке: элемент с `data-cur="<валюта>"`. Их в игре несколько (кошелёк
// комнаты, шапка гнева), и на экране в каждый момент виден один — берётся
// первый ВИДИМЫЙ. Не нашёлся ни один — показывать нечего и не надо:
// начисление за закрытой игрой не должно рисовать цифры в пустоте.
const WalletFx = {
    LAYER_ID: 'wallet-fx',
    // Столько живёт одна цифра. Совпадает с длительностью анимации в css:
    // узел снимается ровно тогда, когда растворился.
    LIFE_MS: 1000,
    // Начисления, пришедшие в один приём, сливаются: узел карты роняет и
    // золото, и осколок, и каждое проходит через addCurrency отдельно.
    // Без склейки цифры вылетали бы по одной на каждый вызов.
    BATCH_MS: 60,
    // Разбежка между валютами: две цифры, вылетевшие одновременно из соседних
    // чипов, читаются как одна строка.
    STEP_MS: 130,

    pending: null,
    timer: null,

    init() {
        if (typeof GameEvents === 'undefined') return;
        GameEvents.on('currency', (e) => {
            if (!e || !e.key || !e.delta) return;
            this.queue(e.key, e.delta);
        });
    },

    queue(key, delta) {
        if (!this.pending) this.pending = {};
        this.pending[key] = (this.pending[key] || 0) + delta;
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            const batch = this.pending;
            this.pending = null;
            Object.keys(batch || {}).forEach((key, i) => {
                if (!batch[key]) return;
                setTimeout(() => this.show(key, batch[key]), i * this.STEP_MS);
            });
        }, this.BATCH_MS);
    },

    // Видимый счётчик валюты. Не `offsetParent`: чипы лежат в шапке, которую
    // прячут через visibility, а у скрытого так элемента offsetParent никуда
    // не девается. Меряется КОРОБКОЙ (docs/traps.md, п. 95).
    at(key) {
        const list = document.querySelectorAll(`[data-cur="${key}"]`);
        for (let i = 0; i < list.length; i++) {
            const box = list[i].getBoundingClientRect();
            if (box.width > 0 && box.height > 0
                && getComputedStyle(list[i]).visibility !== 'hidden') return list[i];
        }
        return null;
    },

    layer() {
        let el = document.getElementById(this.LAYER_ID);
        if (el) return el;
        const host = document.getElementById('game-container');
        if (!host) return null;
        el = document.createElement('div');
        el.id = this.LAYER_ID;
        host.appendChild(el);
        return el;
    },

    // mark — необязательная замена значка. Нужна счётчикам, которых нет в
    // GameState.currencies: зубы и здоровье забега живут внутри самого забега,
    // но показываются точно так же — цифра вылетает из своего счётчика.
    show(key, delta, mark) {
        const chip = this.at(key);
        const layer = this.layer();
        if (!chip || !layer) return;

        // Перевод экранных пикселей в единицы холста. Холст масштабируется
        // целиком (инвариант 11), и класть сюда `box.left` как есть нельзя:
        // на телефоне масштаб не единица, и цифра улетела бы в сторону.
        const box = chip.getBoundingClientRect();
        const host = layer.getBoundingClientRect();
        const scale = (host.width / (layer.offsetWidth || 1)) || 1;
        const stageW = layer.offsetWidth || 390;
        const y = (box.top + box.height / 2 - host.top) / scale;

        // ---------- СБОКУ, А НЕ ПОВЕРХ ----------
        // Цифра встаёт РЯДОМ со счётчиком и уезжает вниз. Первая версия
        // вылетала из центра чипа — и первые полсекунды закрывала собой
        // ровно то число, которое изменилось: «+3» легло на «20/20».
        // Показывать изменение, пряча результат, — худшее из обоих.
        const right = (box.right - host.left) / scale + 6;
        const left = (box.left - host.left) / scale - 6;
        // У правого края экрана места справа нет — цифра уходит влево.
        const toLeft = right > stageW - 58;

        const node = document.createElement('div');
        node.className = 'wallet-fx-item' + (delta < 0 ? ' minus' : ' plus')
                       + (toLeft ? ' to-left' : '');
        node.style.left = (toLeft ? left : right) + 'px';
        node.style.top = y + 'px';
        // Значок берётся общий (currencyMark): золото — нарисованный кружок,
        // жетон и осколок — эмблема из долек, остальное — эмодзи из конфига.
        node.innerHTML = `${mark || currencyMark(key)}<b>${delta < 0 ? '−' : '+'}${Math.abs(delta)}</b>`;
        layer.appendChild(node);
        setTimeout(() => node.remove(), this.LIFE_MS);
    }
};

if (typeof window !== 'undefined') window.WalletFx = WalletFx;

// Подписка сразу при загрузке, а не из main.js: начислить могут раньше, чем
// соберётся интерфейс (оффлайн-доход считается на старте), и пропущенное
// событие показать уже нечем.
WalletFx.init();
