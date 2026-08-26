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
    messageEl: null,
    message: null,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-boost');
        if (!this.root) return;

        this.walletEl = document.getElementById('boost-wallet');
        this.listEl = document.getElementById('boost-list');
        this.messageEl = document.getElementById('boost-message');

        const back = document.getElementById('wrath-boost-back');
        if (back) back.onclick = (e) => { e.stopPropagation(); this.host.showLobby(); };
    },

    enter() {
        this.message = null;
        this.render();
    },

    leave() {
        this.message = null;
    },

    conf() {
        return (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.upgrades) || { order: [] };
    },

    render() {
        if (!this.root) return;
        if (this.walletEl) this.walletEl.innerHTML = WrathShop.walletHtml();
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

            html += `
                <div class="boost-item${maxed ? ' maxed' : ''}">
                    <span class="boost-emoji">${branch.emoji}</span>
                    <span class="boost-text">
                        <span class="boost-name">${branch.name}</span>
                        <span class="boost-hint">${branch.hint}</span>
                        <span class="boost-now">${this.bonusText(key, now)} · уровень ${level} из ${branch.levels.length}</span>
                    </span>
                    ${maxed
                        ? '<span class="boost-state">потолок</span>'
                        : `<button type="button" class="boost-buy" data-key="${key}">
                               <b>${this.priceText(next.price)}</b>
                               <i>${this.bonusText(key, next.bonus)}</i>
                           </button>`}
                </div>`;
        });

        // ---------- ОБМЕН ШРАМОВ ----------
        const rule = ECONOMY.marks.exchange;
        const scars = (GameState.data.scars || []).length;
        const ready = scars >= rule.scars;
        const currency = ECONOMY.currencies[rule.currency];
        html += `
            <div class="boost-group">Шрамы</div>
            <div class="boost-item${ready ? '' : ' poor'}">
                <span class="boost-emoji">🩹</span>
                <span class="boost-text">
                    <span class="boost-name">Обменять шрамы</span>
                    <span class="boost-hint">сойдут самые старые, тело зарастёт</span>
                    <span class="boost-now">${scars} из ${rule.scars} нужных</span>
                </span>
                <button type="button" class="boost-buy" id="boost-scars" ${ready ? '' : 'disabled'}>
                    <b>${rule.scars} 🩹</b>
                    <i>${currency ? currency.emoji : ''} ${rule.amount}</i>
                </button>
            </div>`;

        this.listEl.innerHTML = html;

        this.listEl.querySelectorAll('.boost-buy[data-key]').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); this.buy(btn.dataset.key); };
        });
        const scarBtn = this.listEl.querySelector('#boost-scars');
        if (scarBtn) scarBtn.onclick = (e) => { e.stopPropagation(); this.exchangeScars(); };

        if (this.messageEl) {
            this.messageEl.textContent = this.message || '';
            this.messageEl.classList.toggle('show', !!this.message);
        }
    },

    buy(key) {
        const answer = Backend.buyUpgrade(key);
        if (!answer.ok) {
            this.message = answer.error === 'not_enough'
                ? 'Не хватает жетонов — победа даёт осколок, три осколка складываются в жетон.'
                : 'Прокачать не вышло.';
        } else {
            const branch = this.conf()[key];
            this.message = `${branch.emoji} ${branch.name} — уровень ${answer.level}.`;
        }
        this.render();
    },

    exchangeScars() {
        const answer = Backend.exchangeScars();
        if (!answer.ok) {
            const rule = ECONOMY.marks.exchange;
            this.message = `Шрамов мало: ${answer.have} из ${rule.scars}`;
            this.render();
            return;
        }

        const currency = ECONOMY.currencies[answer.currency];
        this.message = `${answer.removed} шрамов сошло · ${currency ? currency.emoji : ''} +${answer.amount}`;
        // Тело перерисовывается сразу — и на главном экране тоже: обмен в
        // первую очередь про то, как червь выглядит.
        if (typeof refreshWormMarks === 'function') refreshWormMarks();
        this.render();
    },

    // «+2 урон», «+4 ХП», «×2 к зарастанию» — каждая ветка меряется своим.
    bonusText(key, bonus) {
        if (!bonus) return 'пока ничего';
        if (key === 'damage') return `+${bonus} к урону`;
        if (key === 'hp') return `+${bonus} к здоровью`;
        if (key === 'regen') {
            const base = (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.regenPerSecond) || 1;
            return `${(base + bonus).toFixed(1)} ХП/сек`;
        }
        return `+${bonus}`;
    },

    priceText(price) {
        return Object.keys(price || {}).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} ${price[key]}`;
        }).join(' · ') || 'даром';
    }
};

if (typeof window !== 'undefined') {
    window.WrathBoost = WrathBoost;
}
