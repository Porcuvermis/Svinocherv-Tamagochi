// ================= ЛАВКА ГНЕВА: ВСЁ ПОКУПАЕМОЕ В ОДНОМ РЯДУ =================
// Один экран за кнопкой 🏪 и ОДИН ряд полок без вложенности:
//
//     🪖 🦺 🧤 🗡 🛡  │  📈  │  ✨
//     слоты снаряжения   числа  способности
//
// ---------- ЧТО БЫЛО ДО ----------
// Покупки жили в двух местах. Снаряжение — здесь, кнопкой в подвале.
// Прокачка — на отдельном экране, куда попадали УДЕРЖАНИЕМ пальца на черве и
// только из лобби. Половину покупаемого игрок просто не находил, а найдя, не
// понимал, почему это не в лавке.
//
// Вкладки прокачки при этом делились по режимам (⚔️ бой / 🗺 забег), и это
// дало свою беду: шестое чувство работает в обоих, стояло на двух вкладках, а
// после покупки исчезло с обеих сразу. «Купил в одном месте — пропало в двух».
//
// ---------- ПОЧЕМУ ПОЛКИ ПО ТОВАРУ, А НЕ ПО РЕЖИМУ ----------
// Игрок приходит в лавку с мыслью «хочу шлем» или «хочу больше урона», а не
// «хочу что-нибудь для забега». Полка отвечает на первый вопрос, а на второй
// отвечает ЗНАЧОК РЕЖИМА: он стоит на полке, если вся полка про одно место
// (снаряжение и числа — ⚔️: в забег они не едут вовсе), и на строке, если у
// строк по-разному (у 👁 — ⚔️🗺). Вещь при этом лежит РОВНО В ОДНОМ месте.
//
// ---------- ПОКУПАЕТ НЕ ЭКРАН ----------
// Списание валюты и проверка цены — в Backend.buyItem() и Backend.buyUpgrade().
// Здесь только показ.

const WrathShop = {

    host: null,
    root: null,
    listEl: null,
    tabsEl: null,
    // Какой валюты не хватило: она подсвечивается в кошельке и гаснет сама.
    lack: null,
    lackTimer: null,
    // Открытая вкладка. Прилавок разбит по слотам: один длинный список из
    // всех предметов сразу читается как свалка, а по вкладкам видно, где
    // что, и сколько в каждой ещё не куплено.
    tab: null,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-shop');
        if (!this.root) return;

        this.listEl = document.getElementById('shop-list');
        this.tabsEl = document.getElementById('shop-tabs');

        // Своей кнопки возврата у экрана нет: она одна на все меню и стоит
        // в общем подвале (index.html, #wrath-foot).
    },

    enter() {
        this.lack = null;
        // Открывается вкладка, где ещё есть что купить: если игрок уже
        // выкупил оружие, показывать ему пустую полку незачем.
        const groups = this.groups();
        const has = groups.find(g => g.key === this.tab && g.rest.length);
        if (!has) {
            const first = groups.find(g => g.rest.length) || groups[0];
            this.tab = first ? first.key : null;
        }
        this.render();
    },

    // Весь ряд полок: слоты снаряжения плюс полки прокачки. Считается в
    // одном месте — по нему же рисуются и вкладки.
    groups() {
        const inventory = GameState.data.inventory || {};
        const gear = WRATH_GEAR.slots.map(slot => {
            // Открытое — то, до чего игрок дорос. Условий пока ни у одного
            // предмета нет, но фильтр стоит: появится — и предмет просто
            // возникнет на прилавке (Backend.isUnlocked).
            const items = Object.keys(WRATH_GEAR.items)
                .filter(id => WRATH_GEAR.items[id].slot === slot.key)
                .filter(id => Backend.isUnlocked(WRATH_GEAR.items[id].unlock))
                .sort((a, b) => (WRATH_GEAR.items[a].tier || 0) - (WRATH_GEAR.items[b].tier || 0));
            // Купленное с прилавка УХОДИТ. Смотреть на то, что уже своё,
            // незачем: где оно и что даёт, видно в лобби, в своём слоте.
            const rest = items.filter(id => !inventory[id]);
            // Снаряжение работает только в бою: в забег оно не едет
            // (WrathFighter.forRun). Значок режима стоит на полке целиком.
            return { key: slot.key, slot, kind: 'gear', items, rest, modes: ['duel'] };
        }).filter(g => g.items.length);

        // Полки прокачки приходят готовыми: что на них лежит и про какой они
        // режим, знает сам модуль прокачки (WrathBoost.shelves).
        return gear.concat(WrathBoost.shelves());
    },

    leave() {
        this.lack = null;
        // И таймер отказа: без этого он сработает уже на другом экране и
        // перерисует этот — тот, которого на экране нет. У полок прокачки
        // свой такой же таймер, и гасить его тоже некому, кроме лавки.
        if (this.lackTimer) { clearTimeout(this.lackTimer); this.lackTimer = null; }
        WrathBoost.leave();
    },

    render() {
        if (!this.root) return;
        if (!this.listEl) return;

        const groups = this.groups();
        if (this.tabsEl) {
            // Вкладка — силуэт слота (или значок полки) плюс значок режима,
            // если вся полка про одно место. Счётчика «1/5» здесь больше нет:
            // он отвечал на вопрос, которого игрок не задавал, а выкупленная
            // полка и так видна — вкладка гаснет классом .done.
            this.tabsEl.innerHTML = groups.map(g => `
                <button type="button" class="shop-tab${g.key === this.tab ? ' on' : ''}${g.rest.length ? '' : ' done'}"
                        data-tab="${g.key}">
                    ${g.slot ? WrathFighter.slotShape(g.slot)
                             : `<span class="shop-tab-emoji">${g.emoji}</span>`}
                    ${g.modes ? `<span class="shop-tab-where">${WrathFighter.modeMarks(g.modes)}</span>` : ''}
                </button>`).join('');
            this.tabsEl.querySelectorAll('.shop-tab').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.tab = btn.dataset.tab;
                    this.render();
                };
            });
        }

        const group = groups.find(g => g.key === this.tab);

        // Полка прокачки рисует себя сама: строка там своя (точки уровня,
        // «что даёт сейчас»), а экран и ряд вкладок — общие.
        if (group && group.kind === 'boost') {
            this.listEl.innerHTML = WrathBoost.rowsHtml(group.key) || '<div class="shop-empty">✓</div>';
            WrathBoost.bindRows(this.listEl);
            return;
        }

        const rest = group ? group.rest : [];

        // Названия предмета нет: значок и есть имя, а что предмет даёт —
        // сказано числами со значками (инвариант 9).
        //
        // Нажимается вся строка целиком, а не кнопка внутри неё. Не по
        // карману — строка приглушена и не выглядит кнопкой, но тап по ней
        // всё равно ответит: вздрогнет та валюта, которой не хватило. Так
        // игрок узнаёт причину, не нажимая на то, что притворялось доступным.
        const html = rest.map(id => {
            const item = WRATH_GEAR.items[id];
            const affordable = this.affordable(item);
            return `
                <button type="button" class="shop-item${affordable ? '' : ' poor'}" data-item="${id}">
                    <span class="shop-item-emoji">${item.emoji}</span>
                    <span class="shop-item-stat">${WrathFighter.itemStats(item)}</span>
                    <span class="shop-price">${this.priceText(item)}</span>
                </button>`;
        }).join('');

        // Во вкладке всё раскуплено — это тоже надо показать.
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
        // Кошелёк в шапке подновляется СРАЗУ: он общий на все экраны греха,
        // и покупка обязана быть видна в тот же миг, а не через секунду.
        WrathLobby.refreshWallet();
        this.render();
    },

    // Первая валюта, которой не хватает на этот предмет.
    missing(item) {
        const price = item.price || {};
        return Object.keys(price).find(key => GameState.currency(key) < price[key])
            || 'wrath_token';
    },

    // Отказ показывает ШАПКА: кошелёк один на все экраны греха и живёт там.
    // Здесь остаётся только приглушение строки предмета, до которого игрок
    // не дотянулся.
    showLack(key) {
        this.lack = key;
        WrathLobby.flashLack(key);
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
            return `${currencyMark(key)} ${price[key]}`;
        });
        // Бесплатное — это ноль, а не слово «даром».
        return parts.join(' ') || '🎟 0';
    }
};

if (typeof window !== 'undefined') {
    window.WrathShop = WrathShop;
}
