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
    messageEl: null,
    message: null,      // «не хватает жетонов» — гаснет само

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-shop');
        if (!this.root) return;

        this.walletEl = document.getElementById('shop-wallet');
        this.listEl = document.getElementById('shop-list');
        this.messageEl = document.getElementById('shop-message');

        const back = document.getElementById('wrath-shop-back');
        if (back) back.onclick = (e) => { e.stopPropagation(); this.host.showLobby(); };
    },

    enter() {
        this.message = null;
        this.render();
    },

    leave() {
        this.message = null;
    },

    // ---------- КОШЕЛЁК ----------
    // Осколки показаны дробью к жетону: по ней видно, сколько побед осталось
    // до следующей покупки. Без этого осколок выглядит валютой, которую
    // некуда потратить.
    walletHtml() {
        const per = (ECONOMY.exchange.wrath_shard && ECONOMY.exchange.wrath_shard.per) || 3;
        const tokens = GameState.currency('wrath_token');
        const shards = GameState.currency('wrath_shard');
        const gold = GameState.currency('gold');
        return `
            <span class="wallet-item"><b>🎟 ${tokens}</b><i>жетоны</i></span>
            <span class="wallet-item"><b>🩸 ${shards}/${per}</b><i>до жетона</i></span>
            <span class="wallet-item"><b>🪙 ${gold}</b><i>золото</i></span>
        `;
    },

    render() {
        if (!this.root) return;
        if (this.walletEl) this.walletEl.innerHTML = this.walletHtml();
        if (!this.listEl) return;

        const inventory = GameState.data.inventory || {};
        const equipment = GameState.data.equipment || {};
        let html = '';

        WRATH_GEAR.slots.forEach(slot => {
            const items = Object.keys(WRATH_GEAR.items)
                .filter(id => WRATH_GEAR.items[id].slot === slot.key)
                .sort((a, b) => (WRATH_GEAR.items[a].tier || 0) - (WRATH_GEAR.items[b].tier || 0));
            if (!items.length) return;

            const owned = items.filter(id => inventory[id]).length;
            html += `<div class="shop-group">
                <span class="shop-group-name">${slot.emoji} ${slot.name}</span>
                <span class="shop-group-count">куплено ${owned} из ${items.length}</span>
            </div>`;

            items.forEach(id => {
                const item = WRATH_GEAR.items[id];
                const isOwned = !!inventory[id];
                const isOn = equipment[item.slot] === id;
                const affordable = this.affordable(item);
                html += `
                    <div class="shop-item${isOwned ? ' owned' : ''}${!isOwned && !affordable ? ' poor' : ''}">
                        <span class="shop-item-emoji">${item.emoji}</span>
                        <span class="shop-item-text">
                            <span class="shop-item-name">${item.name}</span>
                            <span class="shop-item-stat">${this.statText(item)}</span>
                        </span>
                        ${isOwned
                            ? `<span class="shop-state">${isOn ? 'надето' : 'куплено'}</span>`
                            : `<button type="button" class="shop-buy" data-item="${id}">${this.priceText(item)}</button>`}
                    </div>`;
            });
        });

        this.listEl.innerHTML = html;

        if (this.messageEl) {
            this.messageEl.textContent = this.message || '';
            this.messageEl.classList.toggle('show', !!this.message);
        }

        this.listEl.querySelectorAll('.shop-buy').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); this.buy(btn.dataset.item); };
        });
    },

    buy(itemId) {
        const answer = Backend.buyItem(itemId);
        if (!answer.ok) {
            const names = { not_enough: 'Не хватает жетонов — победа даёт осколок, три осколка складываются в жетон.' };
            this.message = names[answer.error] || 'Купить не вышло.';
        } else {
            const item = WRATH_GEAR.items[itemId];
            this.message = answer.equipped
                ? `${item.emoji} ${item.name} — куплено и сразу надето.`
                : `${item.emoji} ${item.name} — куплено, надеть можно в лобби.`;
        }
        this.render();
    },

    affordable(item) {
        const price = item.price || {};
        return !Object.keys(price).some(key => GameState.currency(key) < price[key]);
    },

    priceText(item) {
        const price = item.price || {};
        return Object.keys(price).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} ${price[key]}`;
        }).join(' · ') || 'даром';
    },

    statText(item) {
        const parts = [];
        if (item.damage) parts.push(`+${item.damage} урон`);
        if (item.hp) parts.push(`+${item.hp} ХП`);
        if (item.armor) {
            const names = { head: 'голова', body: 'тело', tail: 'хвост' };
            Object.keys(item.armor).forEach(zone => {
                if (item.armor[zone]) parts.push(`−${item.armor[zone]} в ${names[zone] || zone}`);
            });
        }
        return parts.join(' · ');
    }
};

if (typeof window !== 'undefined') {
    window.WrathShop = WrathShop;
}
