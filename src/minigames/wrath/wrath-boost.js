// ================= БОЕВАЯ ПРОКАЧКА ГНЕВА =================
// Открывается УДЕРЖАНИЕМ пальца на черве в лобби. Здесь качаются за жетоны
// три величины самого бойца — урон, здоровье, скорость зарастания — и здесь
// же меняются шрамы.
//
// ---------- ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ МАГАЗИНА ----------
// Магазин продаёт ПРЕДМЕТЫ: их надевают и снимают, они занимают слоты.
// Прокачка — это сам червь: купленное остаётся навсегда и снять его нельзя.
// Поэтому и экран отдельный, и открывается он не кнопкой в списке режимов, а
// жестом по самому персонажу — качают ведь его.
//
// ---------- ПОЧЕМУ ОБМЕН ШРАМОВ ЗДЕСЬ ----------
// Раньше он висел на обычном тапе по червю. Тап — слишком дешёвый жест для
// необратимого действия (пятнадцать шрамов не вернуть), и он занимал собой
// единственное «нажатие на персонажа». Теперь это обычная кнопка рядом с
// прокачкой: обмен — такая же операция с валютой, как покупка уровня.

const WrathBoost = {

    host: null,
    root: null,
    walletEl: null,
    listEl: null,
    tabsEl: null,
    // Открытая вкладка: 'stat' — числа бойца, 'passive' — способности,
    // меняющие правила боя. Складывать их в один список нельзя: «+2 к урону»
    // и «видишь намерения врага» — вещи разного рода.
    tab: 'stat',
    // Чего не хватило на покупку: подсвечивается в кошельке и гаснет само.
    // Слов «не хватает жетонов» больше нет (docs/plan/11-no-words.md).
    lack: null,
    lackTimer: null,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-boost');
        if (!this.root) return;

        this.walletEl = document.getElementById('boost-wallet');
        this.listEl = document.getElementById('boost-list');
        this.tabsEl = document.getElementById('boost-tabs');

        const back = document.getElementById('wrath-boost-back');
        if (back) back.onclick = (e) => { e.stopPropagation(); this.host.showLobby(); };
    },

    enter() {
        this.lack = null;
        this.render();
    },

    leave() {
        this.lack = null;
    },

    conf() {
        return (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.upgrades) || { order: [] };
    },

    // Ветки вкладки: открытые и ещё не выкачанные до потолка.
    branches(tab) {
        const conf = this.conf();
        return (conf.order || []).filter(key => {
            const branch = conf[key];
            if (!branch || !branch.levels) return false;
            if ((branch.tab || 'stat') !== tab) return false;
            // Ветка с невыполненным условием не показывается вовсе — как и
            // предмет в магазине (Backend.isUnlocked).
            if (!Backend.isUnlocked(branch.unlock)) return false;
            // Выкачанная до потолка ветка уходит из списка: покупать в ней
            // больше нечего, а что она дала — видно в панели бойца в лобби.
            return GameState.upgradeLevel(key) < branch.levels.length;
        });
    },

    TABS: [
        { key: 'stat', emoji: '📈' },
        { key: 'passive', emoji: '✨' }
    ],

    render() {
        if (!this.root) return;
        if (this.walletEl) this.walletEl.innerHTML = WrathShop.walletHtml(this.lack);
        if (!this.listEl) return;

        if (this.tabsEl) {
            this.tabsEl.innerHTML = this.TABS.map(tab => {
                const left = this.branches(tab.key).length;
                return `
                    <button type="button" class="shop-tab${tab.key === this.tab ? ' on' : ''}${left ? '' : ' done'}"
                            data-tab="${tab.key}">
                        <span class="shop-tab-emoji">${tab.emoji}</span>
                    </button>`;
            }).join('');
            this.tabsEl.querySelectorAll('.shop-tab').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.tab = btn.dataset.tab;
                    this.render();
                };
            });
        }

        const conf = this.conf();
        let html = '';

        this.branches(this.tab).forEach(key => {
            const branch = conf[key];
            const level = GameState.upgradeLevel(key);
            const next = branch.levels[level];
            const now = GameState.upgradeBonus(key);
            const affordable = this.affordable(next.price);

            // Уровень — точками, а не словом «уровень 2 из 3»: сколько
            // залито, столько куплено, и сразу видно, где потолок.
            //
            // Нажимается вся строка. Не по карману — приглушена и не
            // выглядит кнопкой, но тап всё равно отвечает: вздрагивает
            // валюта, которой не хватило.
            html += `
                <button type="button" class="boost-item${affordable ? '' : ' poor'}" data-key="${key}">
                    <span class="boost-emoji">${branch.emoji}</span>
                    <span class="boost-text">
                        <span class="boost-now">${branch.tab === 'passive'
                            ? branch.emoji
                            : this.bonusText(key, now)}</span>
                        <span class="boost-pips">${this.pips(level, branch.levels.length)}</span>
                    </span>
                    <span class="boost-price">
                        <b>${this.priceText(next.price)}</b>
                        ${branch.tab === 'passive' ? '' : `<i>${this.bonusText(key, next.bonus)}</i>`}
                    </span>
                </button>`;
        });

        // ---------- ОБМЕН ШРАМОВ ----------
        // Обмен шрамов — такая же строка, как ветка прокачки: сколько
        // накопилось из нужного, и кнопка с ценой и тем, что за неё дадут.
        // Живёт на вкладке чисел: это обмен ресурса, а не способность.
        const rule = ECONOMY.marks.exchange;
        if (this.tab !== 'stat') {
            this.listEl.innerHTML = html || '<div class="shop-empty">✓</div>';
            this.listEl.querySelectorAll('.boost-item[data-key]').forEach(btn => {
                btn.onclick = (e) => { e.stopPropagation(); this.buy(btn.dataset.key); };
            });
            return;
        }
        const scars = (GameState.data.scars || []).length;
        const ready = scars >= rule.scars;
        const currency = ECONOMY.currencies[rule.currency];
        html += `
            <button type="button" class="boost-item${ready ? '' : ' poor'}${this.lack === 'scars' ? ' lack' : ''}" id="boost-scars">
                <span class="boost-emoji">🩹</span>
                <span class="boost-text">
                    <span class="boost-now">🩹 ${scars}/${rule.scars}</span>
                </span>
                <span class="boost-price">
                    <b>🩹 ${rule.scars}</b>
                    <i>${currency ? currency.emoji : ''} +${rule.amount}</i>
                </span>
            </button>`;

        this.listEl.innerHTML = html;

        this.listEl.querySelectorAll('.boost-item[data-key]').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); this.buy(btn.dataset.key); };
        });
        const scarBtn = this.listEl.querySelector('#boost-scars');
        if (scarBtn) scarBtn.onclick = (e) => { e.stopPropagation(); this.exchangeScars(); };
    },

    // Купленный уровень виден точками, отказ — красной вспышкой там, где
    // не хватило. Ни то, ни другое не требует слов.
    buy(key) {
        const branch = this.conf()[key];
        const level = GameState.upgradeLevel(key);
        const next = branch && branch.levels[level];
        // По строке не по карману покупка не пробуется: сразу ответ, чего
        // не хватает.
        if (next && !this.affordable(next.price)) {
            this.showLack(this.missing(next.price));
            this.render();
            return;
        }

        const answer = Backend.buyUpgrade(key);
        if (!answer.ok) this.showLack(answer.currency || 'wrath_token');
        else this.lack = null;
        this.render();
    },

    affordable(price) {
        return !Object.keys(price || {}).some(key => GameState.currency(key) < price[key]);
    },

    missing(price) {
        return Object.keys(price || {}).find(key => GameState.currency(key) < price[key])
            || 'wrath_token';
    },

    exchangeScars() {
        const answer = Backend.exchangeScars();
        if (!answer.ok) {
            this.showLack('scars');
            this.render();
            return;
        }
        this.lack = null;
        // Тело перерисовывается сразу — и на главном экране тоже: обмен в
        // первую очередь про то, как червь выглядит, и это же и есть ответ
        // игроку вместо строки «столько-то шрамов сошло».
        if (typeof refreshWormMarks === 'function') refreshWormMarks();
        this.render();
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

    // Уровни точками: залитая — купленная ступень.
    pips(level, total) {
        let out = '';
        for (let i = 0; i < total; i++) out += `<span class="pip${i < level ? ' on' : ''}"></span>`;
        return out;
    },

    // Каждая ветка меряется своим значком: 🗡 урон, ❤️ здоровье,
    // 🌱 сколько здоровья зарастает в секунду.
    bonusText(key, bonus) {
        if (key === 'regen') {
            const base = (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.regenPerSecond) || 1;
            return `🌱 ${(base + (bonus || 0)).toFixed(1)}`;
        }
        const emoji = key === 'hp' ? '❤️' : '🗡';
        return `${emoji} +${bonus || 0}`;
    },

    priceText(price) {
        const parts = Object.keys(price || {}).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} ${price[key]}`;
        });
        return parts.join(' ') || '🎟 0';
    }
};

if (typeof window !== 'undefined') {
    window.WrathBoost = WrathBoost;
}
