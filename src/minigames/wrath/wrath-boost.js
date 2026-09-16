// ================= БОЕВАЯ ПРОКАЧКА ГНЕВА =================
// Две полки в общем ряду лавки гнева: 📈 числа самого бойца (урон, здоровье,
// скорость регенерации) и ✨ способности, меняющие правила боя.
//
// ---------- СВОЕГО ЭКРАНА У ПРОКАЧКИ БОЛЬШЕ НЕТ ----------
// Был: отдельный экран, куда попадали удержанием пальца на черве и только из
// лобби. Покупки из-за этого жили в двух разных местах, и в одно из них вёл
// скрытый жест — игрок не находил половину того, что можно купить.
//
// Теперь всё покупаемое лежит за одной кнопкой 🏪, одним рядом полок:
// пять слотов снаряжения, 📈 числа, ✨ способности. Этот модуль поставляет
// две последние полки, а рисует их WrathShop.
//
// ---------- ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ СНАРЯЖЕНИЯ ----------
// Снаряжение — ПРЕДМЕТЫ: их надевают и снимают, они занимают слоты.
// Прокачка — сам червь: купленное остаётся навсегда и снять его нельзя.
// Разница осталась, а разные экраны под неё — нет: полка в одном ряду
// показывает её дешевле, чем отдельный экран за скрытым жестом.
//
// ---------- ОБМЕН ШРАМОВ ЗДЕСЬ БОЛЬШЕ НЕ ЖИВЁТ ----------
// Он уехал на удержание пальца по самому червю (WrathLobby.startHold):
// шрамы на теле, свечение по телу, шрамы сходят под свечением. Прилавку
// такое показать нечем — там это была строка «🩹 6/15» среди покупок.

const WrathBoost = {

    // Чего не хватило на покупку: подсвечивается в кошельке и гаснет само.
    // Слов «не хватает жетонов» больше нет (docs/plan/11-no-words.md).
    lack: null,
    lackTimer: null,

    // Таймер отказа гасится лавкой на выходе: иначе он сработает уже на
    // другом экране и перерисует тот, которого на экране нет.
    leave() {
        this.lack = null;
        if (this.lackTimer) { clearTimeout(this.lackTimer); this.lackTimer = null; }
    },

    conf() {
        return (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.upgrades) || { order: [] };
    },

    // ---------- ПОЛКИ ПРОКАЧКИ ----------
    // Модуль больше не рисует себе экран и вкладки: он поставляет ДВЕ ПОЛКИ
    // в общий ряд лавки (WrathShop). Раньше прокачка была отдельным экраном,
    // куда попадали только удержанием пальца на черве и только из лобби, —
    // то есть покупки жили в двух разных местах, в одно из которых вёл
    // скрытый жест. Теперь всё покупаемое лежит за одной кнопкой 🏪.
    //
    // Полок две, и делятся они по ВИДУ товара, а не по режиму:
    //   📈 числа бойца   — урон, здоровье, регенерация
    //   ✨ способности   — то, что меняет правила боя
    //
    // Деление по режимам пробовали и отказались: шестое чувство работает и в
    // бою, и в забеге, поэтому стояло сразу на двух вкладках, а после покупки
    // исчезало с обеих. «Купил в одном месте — пропало в двух» — это не
    // структура, а ребус. Где вещь работает, теперь сказано ЗНАЧКОМ РЕЖИМА:
    // у полки, если вся полка про один режим, и у строки, если у строк
    // по-разному.
    SHELVES: [
        { key: 'stat',    emoji: '📈', tab: 'stat' },
        { key: 'passive', emoji: '✨', tab: 'passive' }
    ],

    shelves() {
        return this.SHELVES.map(sh => ({
            key: sh.key,
            emoji: sh.emoji,
            kind: 'boost',
            rest: this.branches(sh.tab),
            // Значок режима у полки — только если ВСЯ полка про одно место.
            // У способностей режимы разные, и значок уезжает на строки.
            modes: this.shelfModes(sh.tab)
        })).filter(sh => sh.rest.length);
    },

    // Общие режимы всей полки: если у всех веток они одинаковые — вернуть их,
    // иначе null (значит, показывать надо построчно).
    shelfModes(tab) {
        const conf = this.conf();
        const list = this.branches(tab).map(key => (conf[key].modes || ['duel']).join());
        if (!list.length) return null;
        return list.every(m => m === list[0]) ? list[0].split(',') : null;
    },

    // Ветки полки: открытые и ещё не выкачанные до потолка.
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

    // ---------- СТРОКИ ПОЛКИ ----------
    // Экран рисует лавка, отсюда приходит только содержимое полки. Строка
    // такая же, как у предмета: значок, что даёт сейчас, точки уровня, цена.
    rowsHtml(shelfKey) {
        const conf = this.conf();
        const shelf = this.SHELVES.find(sh => sh.key === shelfKey);
        if (!shelf) return '';
        // Значок режима на строке нужен только там, где у строк он РАЗНЫЙ:
        // если вся полка про одно место, значок стоит на самой полке и
        // повторять его в каждой строке значит писать одно и то же трижды.
        const perRow = this.shelfModes(shelf.tab) === null;

        return this.branches(shelf.tab).map(key => {
            const branch = conf[key];
            const level = GameState.upgradeLevel(key);
            const next = branch.levels[level];
            const now = GameState.upgradeBonus(key);
            const affordable = this.affordable(next.price);
            const passive = branch.tab === 'passive';

            // Уровень — точками, а не словом «уровень 2 из 3»: сколько
            // залито, столько куплено, и сразу видно, где потолок.
            //
            // Нажимается вся строка. Не по карману — приглушена и не
            // выглядит кнопкой, но тап всё равно отвечает: вздрагивает
            // валюта, которой не хватило.
            return `
                <button type="button" class="boost-item${affordable ? '' : ' poor'}" data-key="${key}">
                    <span class="boost-emoji">${branch.emoji}</span>
                    <span class="boost-text">
                        <span class="boost-now">${passive
                            ? (perRow ? WrathFighter.modeMarks(branch.modes) : branch.emoji)
                            : this.bonusText(key, now)}</span>
                        <span class="boost-pips">${this.pips(level, branch.levels.length)}</span>
                    </span>
                    <span class="boost-price">
                        <b>${this.priceText(next.price)}</b>
                        ${passive ? '' : `<i>${this.bonusText(key, next.bonus)}</i>`}
                    </span>
                </button>`;
        }).join('');
    },

    // Клики по строкам полки. Вешает лавка, сразу после вставки разметки.
    bindRows(listEl) {
        if (!listEl) return;
        listEl.querySelectorAll('.boost-item[data-key]').forEach(btn => {
            btn.onclick = (e) => { e.stopPropagation(); this.buy(btn.dataset.key); };
        });
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
            WrathShop.render();
            return;
        }

        const answer = Backend.buyUpgrade(key);
        if (!answer.ok) this.showLack(answer.currency || 'wrath_token');
        else this.lack = null;
        // Кошелёк в шапке подновляется СРАЗУ: он общий на все экраны греха,
        // и покупка обязана быть видна в тот же миг, а не через секунду.
        WrathLobby.refreshWallet();
        WrathShop.render();
    },

    affordable(price) {
        return !Object.keys(price || {}).some(key => GameState.currency(key) < price[key]);
    },

    missing(price) {
        return Object.keys(price || {}).find(key => GameState.currency(key) < price[key])
            || 'wrath_token';
    },

    // Отказ показывает шапка — там же, где кошелёк (WrathLobby.flashLack).
    showLack(key) {
        this.lack = key;
        WrathLobby.flashLack(key);
        if (this.lackTimer) clearTimeout(this.lackTimer);
        this.lackTimer = setTimeout(() => {
            this.lackTimer = null;
            this.lack = null;
            WrathShop.render();
        }, 900);
    },

    // Уровни точками: залитая — купленная ступень.
    pips(level, total) {
        let out = '';
        for (let i = 0; i < total; i++) out += `<span class="pip${i < level ? ' on' : ''}"></span>`;
        return out;
    },

    // Каждая ветка меряется своим значком: 🗡 урон, ❤️ здоровье,
    // 🌱 сколько хп возвращается за минуту.
    //
    // Не минуты до полной полосы, хотя так нагляднее: там меньше значит
    // лучше, а в списке, где у двух соседних веток больше значит лучше, это
    // читается как ухудшение. Скорость растёт вместе с пользой, как и соседи.
    bonusText(key, bonus) {
        if (key === 'regen') {
            const base = (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.regenPerMinute) || 1;
            return `🌱 ${(base + (bonus || 0)).toFixed(1)}`;
        }
        const emoji = key === 'hp' ? '❤️' : '🗡';
        return `${emoji} +${bonus || 0}`;
    },

    priceText(price) {
        const parts = Object.keys(price || {}).map(key => {
            return `${currencyMark(key)} ${price[key]}`;
        });
        return parts.join(' ') || '🎟 0';
    }
};

if (typeof window !== 'undefined') {
    window.WrathBoost = WrathBoost;
}
