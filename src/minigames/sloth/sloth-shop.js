// ================= МАГАЗИН ЛЕНИ: ОТДЕЛЬНЫЙ ЭКРАН =================
// Всё покупаемое в саду — за одной корзиной на полке, одним экраном. Две
// вкладки:
//
//   🛠 инструменты — ступени лейки, граблей, лопаты и возврата семян.
//                    Платятся ЖЕТОНОМ ЛЕНИ.
//   🌱 семена      — семечка открытого вида за СЕНО, новый вид за ЖЕТОН.
//
// ---------- ЧТО БЫЛО ДО И ПОЧЕМУ ПОМЕНЯЛОСЬ ----------
// Сначала покупки висели прямо на предметах: ценник над инструментом на
// полке, цена в пустой ячейке мешка. Диегетично и без единого меню — но
// РАЗБРОСАНО: чтобы узнать, что вообще можно купить, игроку приходилось
// обойти полку, открыть мешок и посмотреть на завалы. Магазина как места не
// существовало, и сравнить покупки между собой было негде.
//
// Теперь место есть. Полка вернулась к своему делу — инструменты берут в
// руку, мешок выдаёт семена, — а цены живут в одном экране.
//
// Вид у него намеренно простой: механика важнее оформления, а нарративный
// вид магазина — отдельная работа.
//
// ---------- ВАЛЮТА У ВКЛАДКИ ОДНА ----------
// Кроме вкладки семян, где их честно две: сено на расход, жетон на доступ
// (docs/plan/19-sloth-garden.md, раздел 4а). Поэтому значок валюты стоит НА
// КАЖДОЙ строке, а не один на всю вкладку, — иначе два разных ценника в
// одном столбце читались бы как одно число (docs/traps.md, п. 82).
//
// ---------- ПОКУПАЕТ НЕ ЭКРАН ----------
// Проверка цены и списание — Backend.buyGardenTool(), buyGardenSeed() и
// unlockGardenSpecies(). Здесь только показ (инвариант 2).

const SlothShop = {

    host: null,
    root: null,
    panelEl: null,
    tabsEl: null,
    listEl: null,
    walletEl: null,
    lackTimer: null,

    // Инструменты первыми: игрок заходит в магазин с вопросом «во что
    // вложиться», семена докупает попутно.
    tab: 'tools',
    open: false,

    // Какая лестница у какого предмета. Возврат семян — единственная, у
    // которой нет своего предмета на полке; по смыслу она про семена, и
    // значком ей служит мешок.
    TOOLS: [
        { key: 'can',   art: 'can' },
        { key: 'rake',  art: 'rake' },
        { key: 'spade', art: 'spade' },
        { key: 'seed',  art: 'sack' }
    ],

    init(host) {
        this.host = host;
        this.root = document.getElementById('gd-shop');
        if (!this.root) return;
        this.panelEl = document.getElementById('gd-shop-panel');
        this.tabsEl = document.getElementById('gs-tabs');
        this.listEl = document.getElementById('gs-list');
        this.walletEl = document.getElementById('gs-wallet');

        // Закрывается тапом МИМО прилавка — тем же движением, каким в саду
        // закрывается мешок. Своего крестика нет: крестик в окне уже есть и
        // закрывает всю мини-игру, второй рядом читался бы тем же самым.
        this.root.addEventListener('pointerdown', (e) => {
            if (this.panelEl && this.panelEl.contains(e.target)) return;
            e.stopPropagation();
            this.close();
        });
    },

    // ================= ОТКРЫТИЕ И ЗАКРЫТИЕ =================
    show() {
        if (!this.root) return;
        this.open = true;
        // Открывается вкладка, где ещё есть что купить: выкупленные
        // инструменты не должны встречать игрока пустой полкой.
        if (!this.rows(this.tab).length) {
            const other = ['tools', 'seeds'].find(t => this.rows(t).length);
            if (other) this.tab = other;
        }
        this.render();
        this.root.classList.add('on');
        if (typeof Haptics !== 'undefined') Haptics.impact('light');
    },

    close() {
        if (!this.root || !this.open) return;
        this.open = false;
        this.root.classList.remove('on');
        clearTimeout(this.lackTimer);
        this.lackTimer = null;
        // Купленное меняет числа ЭТОГО захода: лейка, оплаченная секунду
        // назад, обязана поливать быстрее уже сейчас. Сад читает ступени из
        // состояния на каждой отрисовке, поэтому достаточно перерисовать.
        if (this.host) this.host.render();
    },

    // ================= СОДЕРЖИМОЕ =================
    // Выкупленная до потолка лестница с полки УХОДИТ: смотреть на то, что
    // уже своё, незачем — то же правило, что в лавке гнева и на кухне.
    rows(tab) {
        if ((tab || this.tab) === 'tools') {
            return this.TOOLS.filter(t => {
                const ladder = Backend.gardenToolLadder(t.key);
                return ladder && ladder.next;
            });
        }
        // Семена: все виды, кроме бесконечной травы — её покупать не в чем.
        return Object.keys(GARDEN.species)
            .filter(key => !GARDEN.species[key].infinite)
            .map(key => ({ key }));
    },

    render() {
        if (!this.root || !this.listEl) return;
        this.renderTabs();
        this.renderWallet();
        this.listEl.innerHTML = (this.tab === 'tools' ? this.toolsHtml() : this.seedsHtml())
            || '<div class="gs-empty">✓</div>';
        this.listEl.querySelectorAll('.gs-row[data-key]').forEach(row => {
            row.onclick = (e) => {
                e.stopPropagation();
                if (this.tab === 'tools') this.buyTool(row.dataset.key);
                else this.buySeed(row.dataset.key);
            };
        });
    },

    TABS: [{ key: 'tools', emoji: '🛠' }, { key: 'seeds', emoji: '🌱' }],

    renderTabs() {
        if (!this.tabsEl) return;
        this.tabsEl.innerHTML = this.TABS.map(t => `
            <button type="button" class="gs-tab${t.key === this.tab ? ' on' : ''}"
                    data-tab="${t.key}"><span>${t.emoji}</span></button>`).join('');
        this.tabsEl.querySelectorAll('.gs-tab').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.tab = btn.dataset.tab;
                this.render();
            };
        });
    },

    // Кошелёк показывает ОБЕ валюты сада всегда: на вкладке семян в ходу обе
    // сразу, и прятать одну из них значило бы прятать половину ответа на
    // вопрос «на что мне хватает».
    //
    // data-cur на всём чипе: по этой метке WalletFx находит счётчик и сам
    // выбрасывает из него потраченное (src/core/wallet-fx.js).
    renderWallet() {
        if (!this.walletEl) return;
        const chip = (cur, art, n) =>
            `<span class="gs-coin" data-cur="${cur}">
                <svg viewBox="-20 -20 40 40" class="gs-coin-art">${art}</svg><b>${n}</b>
             </span>`;
        this.walletEl.innerHTML =
            chip('hay', GARDEN_ART.hay(), GameState.currency('hay')) +
            chip('sloth_token', GARDEN_ART.token(true), GameState.currency('sloth_token'));
    },

    // ---------- СТРОКИ ИНСТРУМЕНТОВ ----------
    // Картинка — САМ инструмент, тем же рисунком, каким он лежит на полке
    // (docs/traps.md, п. 83). «Было → станет» показывает, что именно
    // покупается: у лейки это секунды полива, у граблей минуты дозревания,
    // у лопаты движения, у мешка — процент возврата семечки.
    toolsHtml() {
        return this.rows('tools').map(t => {
            const ladder = Backend.gardenToolLadder(t.key);
            const price = ladder.next.price || {};
            const cur = Object.keys(price)[0];
            const poor = !this.affordable(price);
            return `
            <button type="button" class="gs-row${poor ? ' gs-poor' : ''}" data-key="${t.key}">
                <span class="gs-pic">
                    <svg viewBox="-34 -34 68 68">${this.toolArt(t.art)}</svg>
                </span>
                <span class="gs-body">
                    <span class="gs-step">
                        <b>${this.toolValue(t.key, ladder.level)}</b>
                        <i>→</i>
                        <b class="gs-next">${this.toolValue(t.key, ladder.level + 1)}</b>
                    </span>
                    <span class="gs-pips">${this.pips(ladder.level, ladder.tiers.length - 1)}</span>
                </span>
                <span class="gs-buy">
                    <svg viewBox="-20 -20 40 40" class="gs-coin-art">${GARDEN_ART.token(!poor)}</svg>
                    <b>${price[cur]}</b>
                </span>
            </button>`;
        }).join('');
    },

    // Картинка предмета. Мешок рисуется не через tool(): у него своя
    // функция, потому что на полке он закрытый куль, а не инструмент.
    toolArt(kind) {
        return kind === 'sack' ? GARDEN_ART.sackClosed() : GARDEN_ART.tool(kind);
    },

    // Число ступени в понятиях игрока. Единицы у веток разные, и это не
    // небрежность: у каждой строки своя картинка, и она же называет единицу —
    // лейка про секунды, грабли про минуты, лопата про движения.
    toolValue(tool, level) {
        const tiers = Backend.gardenToolLadder(tool).tiers;
        const t = tiers[Math.min(level, tiers.length - 1)];
        if (tool === 'can')   return (t.pour / 1000).toFixed(1);
        if (tool === 'rake')  return t.minutes;
        if (tool === 'spade') return t.cycles;
        return Math.round(t.chance * 100);
    },

    // ---------- СТРОКИ СЕМЯН ----------
    // Открытый вид докупается СЕНОМ, закрытый открывается ЖЕТОНОМ и сразу
    // даёт первую семечку: покупка, после которой ничего не произошло,
    // выглядит как сбой.
    seedsHtml() {
        const known = Backend.gardenSeedKeys();
        return this.rows('seeds').map(r => {
            const sp = GARDEN.species[r.key];
            const open = known.indexOf(r.key) !== -1;
            const price = (open ? sp.seedPrice : sp.unlock) || {};
            const cur = Object.keys(price)[0];
            const poor = !this.affordable(price);
            const mark = cur === 'hay' ? GARDEN_ART.hay() : GARDEN_ART.token(!poor);
            return `
            <button type="button" class="gs-row${poor ? ' gs-poor' : ''}${open ? '' : ' gs-locked'}"
                    data-key="${r.key}">
                <span class="gs-pic">
                    <svg viewBox="-30 -30 60 60">${GARDEN_ART.seedItem(r.key)}</svg>
                </span>
                <span class="gs-body">
                    <span class="gs-have"><b>${open ? Backend.gardenSeedCount(r.key) : 0}</b></span>
                </span>
                <span class="gs-buy">
                    <svg viewBox="-20 -20 40 40" class="gs-coin-art">${mark}</svg>
                    <b>${price[cur]}</b>
                </span>
            </button>`;
        }).join('');
    },

    // Точки ступеней — тот же вид, что в прокачке гнева и на кухне: одна и та
    // же вещь в игре обязана выглядеть одинаково.
    pips(level, total) {
        let out = '';
        for (let i = 0; i < total; i++) out += `<i class="${i < level ? 'on' : ''}"></i>`;
        return out;
    },

    affordable(price) {
        return !Object.keys(price || {}).some(cur => GameState.currency(cur) < price[cur]);
    },

    // ================= ПОКУПКА =================
    buyTool(tool) {
        this.answer(Backend.buyGardenTool(tool));
    },

    buySeed(key) {
        const known = Backend.gardenSeedKeys().indexOf(key) !== -1;
        this.answer(known ? Backend.buyGardenSeed(key) : Backend.unlockGardenSpecies(key));
    },

    // Один ответ на обе покупки: удача перерисовывает прилавок, отказ
    // вздрагивает ТОЙ валютой, которой не хватило (docs/traps.md, п. 91).
    answer(res) {
        if (res && res.ok) {
            if (typeof Haptics !== 'undefined') Haptics.notify('success');
            this.render();
            return;
        }
        if (res && res.currency) this.flashLack(res.currency);
        if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
    },

    flashLack(cur) {
        // Запасной адресат — весь кошелёк: ответ рисуется на том, что есть
        // ВСЕГДА (docs/traps.md, п. 99).
        const el = this.walletEl.querySelector(`.gs-coin[data-cur="${cur}"]`) || this.walletEl;
        el.classList.remove('gs-no');
        void el.offsetWidth;
        el.classList.add('gs-no');
        clearTimeout(this.lackTimer);
        this.lackTimer = setTimeout(() => el.classList.remove('gs-no'), 900);
    }
};

if (typeof window !== 'undefined') window.SlothShop = SlothShop;
