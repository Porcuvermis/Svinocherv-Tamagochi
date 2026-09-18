// ============ МАГАЗИН КУХНИ: ТЕЛЕФОН С ПРИЛОЖЕНИЕМ ДОСТАВКИ ============
// Вход — телефон, который выглядывает из нижнего правого угла общего вида
// (рисунок в KITCHEN_ART.foreground, разметка в FG.phone). Тап поднимает его
// к лицу, и в нём открыто приложение заказов (docs/plan/20-gluttony-kitchen.md,
// раздел 7).
//
// ---------- ПОЧЕМУ ТЕЛЕФОН, А НЕ ЭКРАН МАГАЗИНА ----------
// Интерфейс кухни диегетический: игрок пользуется предметами, а не меню.
// Список товаров — единственное место, где предмет придумать не из чего:
// «полка с товаром» в жилой кухне не стоит. Телефон эту дыру закрывает
// целиком — приложение доставки и ЕСТЬ список товаров, который игрок умеет
// читать до всякого обучения (ловушка №83: предмет, который игрок уже
// знает, объясняет экран лучше любой раскладки).
//
// ---------- ЕДИНСТВЕННЫЕ БУКВЫ В ИГРЕ ----------
// Инвариант 9 запрещает слова на игровых экранах. Логотип приложения —
// объявленное исключение, и оно ровно одно: логотип это КАРТИНКА, вся шутка
// в том, что его узнают с полувзгляда, а перевода он не требует ни на один
// язык. Исключение прописано в tools/test-no-words.js поимённо, чтобы
// проверка осталась настоящей: любые другие буквы здесь по-прежнему валят
// прогон.
//
// ---------- ДВЕ ВКЛАДКИ, ДВЕ ВАЛЮТЫ ----------
//   🍳 утварь   — жетон кухни. Покупается раз и навсегда, двигает числа
//                 готовки (ECONOMY.minigames.gluttony.upgrades).
//   🥕 продукты — золото. Кончается каждой готовкой (KITCHEN.shop.food).
//
// Валюта у вкладки одна, и в шапке висит ровно она: два ценника разных
// валют в одном столбце читаются как одно число, написанное дважды
// (ловушка №82). Заодно шапка объясняет вкладку без подписи.
//
// ---------- ПОКУПАЕТ НЕ ЭКРАН ----------
// Проверка цены и списание — Backend.buyKitchenFood() и Backend.buyUpgrade().
// Здесь только показ (инвариант 2).

const KitchenShop = {

    host: null,
    root: null,
    phoneEl: null,
    tabsEl: null,
    listEl: null,
    walletEl: null,
    // Таймер, который гасит вспышку отказа. Отдельного поля «чего не хватило»
    // здесь НЕТ намеренно: отказ живёт классом на самом узле, и переменная
    // под него была бы той самой, в которую пишут и которую никто не читает
    // (docs/traps.md, п. 91 — по ней эту болезнь и находят в коде).
    lackTimer: null,

    // Какая вкладка открыта. Утварь первой: игрок заходит в магазин с
    // вопросом «во что вложиться», продукты докупает попутно.
    tab: 'gear',
    open: false,

    // Семечко картинки товара постоянное: продукты рисуются с шумом, и без
    // фиксированного семечка карточка перерисовывалась бы другой морковкой
    // при каждой покупке.
    SEED: 7,

    init(host) {
        this.host = host;
        this.root = document.getElementById('kt-shop');
        if (!this.root) return;
        this.phoneEl = document.getElementById('kt-shop-phone');
        this.tabsEl = document.getElementById('bf-tabs');
        this.listEl = document.getElementById('bf-list');
        this.walletEl = document.getElementById('bf-wallet');

        // Закрывается тапом МИМО телефона. Своего крестика у приложения нет
        // намеренно: крестик в окне уже есть, он закрывает всю мини-игру, и
        // второй рядом читался бы тем же самым. Тап мимо — то же движение,
        // которым в игре закрывают всё остальное, и промахнуться им нельзя.
        this.root.addEventListener('pointerdown', (e) => {
            if (this.phoneEl && this.phoneEl.contains(e.target)) return;
            e.stopPropagation();
            this.close();
        });
    },

    cats() { return (KITCHEN.shop && KITCHEN.shop.categories) || []; },

    cat(key) { return this.cats().find(c => c.key === (key || this.tab)) || this.cats()[0]; },

    gearConf() {
        return (ECONOMY.minigames.gluttony && ECONOMY.minigames.gluttony.upgrades) || { order: [] };
    },

    // ================= ОТКРЫТИЕ И ЗАКРЫТИЕ =================
    show() {
        if (!this.root) return;
        this.open = true;
        // Открывается вкладка, где ещё есть что купить: выкупленная утварь
        // не должна встречать игрока пустой полкой.
        if (!this.rows(this.tab).length) {
            const other = this.cats().find(c => this.rows(c.key).length);
            if (other) this.tab = other.key;
        }
        this.render();
        this.root.classList.add('on');
        // Телефон в углу гаснет: он и есть тот, который сейчас в руках, и
        // два телефона в кадре читаются как два разных предмета.
        if (this.host) this.host.showPhone(false);
        if (typeof Haptics !== 'undefined') Haptics.impact('light');
    },

    close() {
        if (!this.root || !this.open) return;
        this.open = false;
        this.root.classList.remove('on');
        if (this.host && this.host.phase === 'overview') this.host.showPhone(true);
        clearTimeout(this.lackTimer);
        this.lackTimer = null;
        // Купленная утварь меняет числа ЭТОЙ готовки: нож, оплаченный
        // секунду назад, обязан резать быстрее уже сейчас.
        if (this.host) this.host.applyGear();
    },

    // ================= СОДЕРЖИМОЕ =================
    // Что лежит на вкладке. Утварь, выкачанная до потолка, с полки уходит —
    // как и купленный предмет в лавке гнева: смотреть на то, что уже своё,
    // незачем.
    rows(key) {
        if ((key || this.tab) === 'gear') {
            const conf = this.gearConf();
            return (conf.order || []).filter(k => {
                const branch = conf[k];
                if (!branch || !branch.levels) return false;
                if (!Backend.isUnlocked(branch.unlock)) return false;
                return GameState.upgradeLevel(Backend.upgradeKey('gluttony', k)) < branch.levels.length;
            });
        }
        return ((KITCHEN.shop && KITCHEN.shop.food) || []).map(g => g.key);
    },

    render() {
        if (!this.root) return;
        this.renderTabs();
        this.renderWallet();
        this.listEl.innerHTML = (this.tab === 'gear' ? this.gearHtml() : this.foodHtml())
            || '<div class="bf-empty">✓</div>';
        this.listEl.querySelectorAll('.bf-card[data-key]').forEach(card => {
            card.onclick = (e) => { e.stopPropagation(); this.buy(card.dataset.key); };
        });
    },

    renderTabs() {
        if (!this.tabsEl) return;
        this.tabsEl.innerHTML = this.cats().map(c => `
            <button type="button" class="bf-tab${c.key === this.tab ? ' on' : ''}"
                    data-tab="${c.key}"><span>${c.emoji}</span></button>`).join('');
        this.tabsEl.querySelectorAll('.bf-tab').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.tab = btn.dataset.tab;
                this.render();
            };
        });
    },

    // Кошелёк показывает валюту ОТКРЫТОЙ вкладки, и только её. data-cur на
    // всём чипе: по этой метке WalletFx находит счётчик сам, поэтому трата
    // улетает из него без единой строки здесь (src/core/wallet-fx.js).
    renderWallet() {
        if (!this.walletEl) return;
        const cur = this.cat().currency;
        this.walletEl.dataset.cur = cur;
        this.walletEl.innerHTML =
            `${currencyMark(cur)}<b>${GameState.currency(cur)}</b>`;
    },

    // ---------- КАРТОЧКИ УТВАРИ ----------
    // Картинка — САМ предмет кухни, тем же рисунком, каким он живёт в кадре
    // (ловушка №83). Ступени — точками, как в прокачке гнева: сколько
    // залито, столько куплено, и видно, где потолок.
    gearHtml() {
        const conf = this.gearConf();
        return this.rows('gear').map(key => {
            const branch = conf[key];
            const level = GameState.upgradeLevel(Backend.upgradeKey('gluttony', key));
            const next = branch.levels[level];
            const price = next.price[this.cat('gear').currency] || 0;
            const poor = GameState.currency(this.cat('gear').currency) < price;
            return `
            <button type="button" class="bf-card${poor ? ' poor' : ''}" data-key="${key}">
                <span class="bf-pic">${KITCHEN_ART.shopGearArt(key)}</span>
                <span class="bf-body">
                    <span class="bf-step">
                        <b>${Backend.upgradeValue('gluttony', key)}</b>
                        <i>→</i>
                        <b class="next">${next.bonus}</b>
                    </span>
                    <span class="bf-pips">${this.pips(level, branch.levels.length)}</span>
                </span>
                <span class="bf-buy"><b>${price}</b></span>
            </button>`;
        }).join('');
    },

    // ---------- КАРТОЧКИ ПРОДУКТОВ ----------
    // Рядом с ценой — сколько этого уже лежит в кладовой и каков её потолок.
    // Без потолка покупка в полный холодильник была бы отданным золотом за
    // ничто, и узнать об этом было бы неоткуда.
    foodHtml() {
        const cur = this.cat('food').currency;
        const cap = Backend.pantryCap();
        return ((KITCHEN.shop && KITCHEN.shop.food) || []).map(good => {
            const have = Backend.pantryCount(good.key);
            const full = have >= cap;
            const poor = GameState.currency(cur) < good.price;
            return `
            <button type="button" class="bf-card${(poor || full) ? ' poor' : ''}" data-key="${good.key}">
                <span class="bf-pic">${KITCHEN_ART.shopFoodArt(good.key, this.SEED)}</span>
                <span class="bf-body">
                    <span class="bf-have${full ? ' full' : ''}"><b>${have}</b><i>${cap}</i></span>
                </span>
                <span class="bf-buy"><b>${good.price}</b></span>
            </button>`;
        }).join('');
    },

    // Точки ступеней. Общий вид с прокачкой гнева намеренно: одна и та же
    // вещь в игре обязана выглядеть одинаково.
    pips(level, total) {
        let out = '';
        for (let i = 0; i < total; i++) out += `<i class="${i < level ? 'on' : ''}"></i>`;
        return out;
    },

    // ================= ПОКУПКА =================
    buy(key) {
        const answer = (this.tab === 'gear')
            ? Backend.buyUpgrade(key, 'gluttony')
            : Backend.buyKitchenFood(key);

        if (answer.ok) {
            if (typeof Haptics !== 'undefined') Haptics.notify('success');
            this.render();
            return;
        }
        // ---------- ОТКАЗ БЕЗ СЛОВ ----------
        // Не хватило денег — вздрагивает кошелёк: ответ рисуется ТАМ, ГДЕ
        // ЛЕЖИТ НЕДОСТАЮЩЕЕ (ловушка №91). Кладовая полна — вздрагивает
        // счётчик остатка на самой карточке: недостающее там не деньги, а
        // место. Молчания нет ни в одном из двух случаев.
        if (answer.error === 'full') this.flashCard(key);
        else this.flashWallet();
        if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
    },

    flashWallet() {
        if (!this.walletEl) return;
        this.walletEl.classList.remove('lack');
        void this.walletEl.offsetWidth;   // перезапуск анимации
        this.walletEl.classList.add('lack');
        clearTimeout(this.lackTimer);
        this.lackTimer = setTimeout(() => {
            this.walletEl.classList.remove('lack');
            this.lackTimer = null;
        }, 900);
    },

    flashCard(key) {
        const card = this.listEl && this.listEl.querySelector(`.bf-card[data-key="${key}"] .bf-have`);
        if (!card) { this.flashWallet(); return; }   // запасной адресат, ловушка №99
        card.classList.remove('lack');
        void card.offsetWidth;
        card.classList.add('lack');
        setTimeout(() => card.classList.remove('lack'), 900);
    }
};

if (typeof window !== 'undefined') window.KitchenShop = KitchenShop;
