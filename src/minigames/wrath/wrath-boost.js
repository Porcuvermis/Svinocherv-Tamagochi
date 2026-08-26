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

    render() {
        if (!this.root) return;
        if (this.walletEl) this.walletEl.innerHTML = WrathShop.walletHtml(this.lack);
        if (!this.listEl) return;

        const conf = this.conf();
        let html = '';

        (conf.order || []).forEach(key => {
            const branch = conf[key];
            if (!branch || !branch.levels) return;

            const level = GameState.upgradeLevel(key);
            const maxed = level >= branch.levels.length;
            const next = maxed ? null : branch.levels[level];
            const now = GameState.upgradeBonus(key);

            // Уровень — точками, а не словом «уровень 2 из 3»: сколько
            // залито, столько куплено, и сразу видно, где потолок.
            html += `
                <div class="boost-item${maxed ? ' maxed' : ''}">
                    <span class="boost-emoji">${branch.emoji}</span>
                    <span class="boost-text">
                        <span class="boost-now">${this.bonusText(key, now)}</span>
                        <span class="boost-pips">${this.pips(level, branch.levels.length)}</span>
                    </span>
                    ${maxed
                        ? '<span class="boost-state">✓</span>'
                        : `<button type="button" class="boost-buy" data-key="${key}">
                               <b>${this.priceText(next.price)}</b>
                               <i>${this.bonusText(key, next.bonus)}</i>
                           </button>`}
                </div>`;
        });

        // ---------- ОБМЕН ШРАМОВ ----------
        // Обмен шрамов — такая же строка, как ветка прокачки: сколько
        // накопилось из нужного, и кнопка с ценой и тем, что за неё дадут.
        const rule = ECONOMY.marks.exchange;
        const scars = (GameState.data.scars || []).length;
        const ready = scars >= rule.scars;
        const currency = ECONOMY.currencies[rule.currency];
        html += `
            <div class="boost-item${ready ? '' : ' poor'}${this.lack === 'scars' ? ' lack' : ''}">
                <span class="boost-emoji">🩹</span>
                <span class="boost-text">
                    <span class="boost-now">🩹 ${scars}/${rule.scars}</span>
                </span>
                <button type="button" class="boost-buy" id="boost-scars" ${ready ? '' : 'disabled'}>
                    <b>🩹 ${rule.scars}</b>
                    <i>${currency ? currency.emoji : ''} +${rule.amount}</i>
                </button>
            </div>`;

        this.listEl.innerHTML = html;

        this.listEl.querySelectorAll('.boost-buy[data-key]').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); this.buy(btn.dataset.key); };
        });
        const scarBtn = this.listEl.querySelector('#boost-scars');
        if (scarBtn) scarBtn.onclick = (e) => { e.stopPropagation(); this.exchangeScars(); };
    },

    // Купленный уровень виден точками, отказ — красной вспышкой там, где
    // не хватило. Ни то, ни другое не требует слов.
    buy(key) {
        const answer = Backend.buyUpgrade(key);
        if (!answer.ok) this.showLack(answer.currency || 'wrath_token');
        else this.lack = null;
        this.render();
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
