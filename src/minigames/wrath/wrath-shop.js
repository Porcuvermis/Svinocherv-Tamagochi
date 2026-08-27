// ================= МАГАЗИН ГНЕВА =================
// Вкладка внутри окна гнева, за жетоны (docs/plan/03-wrath.md). Продаёт
// снаряжение по слотам — отдельные предметы со своими цифрами, а не
// абстрактные апгрейды.
//
// ---------- ПОТОЛОК ОБЪЯВЛЕН ЗАРАНЕЕ ----------
// У каждого слота видно «куплено 1 из 3». Так игрок с самого начала знает,
// где конец, и не строит планов на бесконечную лестницу уровней — план
// требует ровно этого. Число ступеней берётся из каталога (поле tier), а не
// пишется здесь: добавили предмет — счётчик вырос сам.
//
// ---------- ПОКУПАЕТ НЕ ЭКРАН ----------
// Списание валюты и проверка цены — в Backend.buyItem(). Здесь только показ
// и один вызов: когда магазин переедет на сервер, этот файл не изменится.

const WrathShop = {

    host: null,
    root: null,
    walletEl: null,
    listEl: null,
    // Какой валюты не хватило: она подсвечивается в кошельке и гаснет сама.
    lack: null,
    lackTimer: null,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-shop');
        if (!this.root) return;

        this.walletEl = document.getElementById('shop-wallet');
        this.listEl = document.getElementById('shop-list');

        const back = document.getElementById('wrath-shop-back');
        if (back) back.onclick = (e) => { e.stopPropagation(); this.host.showLobby(); };
    },

    enter() {
        this.lack = null;
        this.render();
    },

    leave() {
        this.lack = null;
    },

    // ---------- КОШЕЛЁК ----------
    // Осколки показаны дробью к жетону: по ней видно, сколько побед осталось
    // до следующей покупки. Без этого осколок выглядит валютой, которую
    // некуда потратить.
    walletHtml(lack) {
        const per = (ECONOMY.exchange.wrath_shard && ECONOMY.exchange.wrath_shard.per) || 3;
        const item = (key, text) =>
            `<span class="wallet-item${lack === key ? ' lack' : ''}" data-cur="${key}"><b>${text}</b></span>`;
        return item('wrath_token', `🎟 ${GameState.currency('wrath_token')}`)
             + item('wrath_shard', `🩸 ${GameState.currency('wrath_shard')}/${per}`)
             + item('gold', `🪙 ${GameState.currency('gold')}`);
    },

    render() {
        if (!this.root) return;
        if (this.walletEl) this.walletEl.innerHTML = this.walletHtml(this.lack);
        if (!this.listEl) return;

        const inventory = GameState.data.inventory || {};
        let html = '';

        WRATH_GEAR.slots.forEach(slot => {
            // Открытое — то, до чего игрок дорос. Условия пока ни у одного
            // предмета нет, но фильтр стоит: появится — и предмет просто
            // возникнет на прилавке (Backend.isUnlocked).
            const items = Object.keys(WRATH_GEAR.items)
                .filter(id => WRATH_GEAR.items[id].slot === slot.key)
                .filter(id => Backend.isUnlocked(WRATH_GEAR.items[id].unlock))
                .sort((a, b) => (WRATH_GEAR.items[a].tier || 0) - (WRATH_GEAR.items[b].tier || 0));
            if (!items.length) return;

            // Купленное с прилавка УХОДИТ. Смотреть на то, что уже своё,
            // незачем: где оно и что даёт, видно в лобби, в своём слоте.
            // Прилавок показывает только то, что ещё можно взять.
            const rest = items.filter(id => !inventory[id]);
            if (!rest.length) return;

            // Заголовок группы — значок слота и дробь «куплено из всего».
            // Потолок объявлен заранее числом, а не словами.
            const owned = items.length - rest.length;
            html += `<div class="shop-group">
                <span class="shop-group-name">${slot.emoji}</span>
                <span class="shop-group-count">${owned}/${items.length}</span>
            </div>`;

            rest.forEach(id => {
                const item = WRATH_GEAR.items[id];
                const affordable = this.affordable(item);
                // Названия предмета нет: значок и есть имя, а что предмет
                // даёт — сказано числами со значками (инвариант 9).
                //
                // Нажимается вся строка целиком, а не кнопка внутри неё. Не
                // по карману — строка приглушена и не выглядит кнопкой, но
                // тап по ней всё равно ответит: вздрогнет та валюта, которой
                // не хватило. Так игрок узнаёт причину, не нажимая на то,
                // что притворялось доступным.
                html += `
                    <button type="button" class="shop-item${affordable ? '' : ' poor'}" data-item="${id}">
                        <span class="shop-item-emoji">${item.emoji}</span>
                        <span class="shop-item-stat">${WrathFighter.itemStats(item)}</span>
                        <span class="shop-price">${this.priceText(item)}</span>
                    </button>`;
            });
        });

        // Всё раскуплено — прилавок пуст, и это тоже надо показать.
        this.listEl.innerHTML = html || '<div class="shop-empty">✓</div>';

        this.listEl.querySelectorAll('.shop-item').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); this.buy(btn.dataset.item); };
        });
    },

    // ---------- ОТКАЗ БЕЗ СЛОВ ----------
    // Раньше здесь была строка «не хватает жетонов». Теперь дёргается и
    // краснеет сама валюта в кошельке: игрок видит, ЧЕГО не хватило, а не
    // читает об этом (docs/plan/11-no-words.md).
    //
    // Удачную покупку объяснять не надо: строка предмета сама превращается в
    // галочку, а из кошелька уходят жетоны.
    buy(itemId) {
        const item = WRATH_GEAR.items[itemId];
        // По строке не по карману покупка даже не пробуется: сразу ответ,
        // чего не хватает.
        if (item && !this.affordable(item)) {
            this.showLack(this.missing(item));
            this.render();
            return;
        }

        const answer = Backend.buyItem(itemId);
        if (!answer.ok) this.showLack(answer.currency || 'wrath_token');
        else this.lack = null;
        this.render();
    },

    // Первая валюта, которой не хватает на этот предмет.
    missing(item) {
        const price = item.price || {};
        return Object.keys(price).find(key => GameState.currency(key) < price[key])
            || 'wrath_token';
    },

    showLack(key) {
        this.lack = key;
        if (this.lackTimer) clearTimeout(this.lackTimer);
        this.lackTimer = setTimeout(() => {
            this.lackTimer = null;
            this.lack = null;
            this.render();
        }, 900);
    },

    affordable(item) {
        const price = item.price || {};
        return !Object.keys(price).some(key => GameState.currency(key) < price[key]);
    },

    priceText(item) {
        const price = item.price || {};
        const parts = Object.keys(price).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} ${price[key]}`;
        });
        // Бесплатное — это ноль, а не слово «даром».
        return parts.join(' ') || '🎟 0';
    }
};

if (typeof window !== 'undefined') {
    window.WrathShop = WrathShop;
}
