// ================= МАГАЗИН ПОХОТИ: ОТДЕЛЬНЫЙ ЭКРАН =================
// Открывается ФЛАКОНОМ на верхней полке и только в двух местах забега: пока
// вода не включена и после того, как она выключилась. Посреди мытья магазина
// нет — подготовился, отыграл, потратил (docs/plan/21-lust-bath.md, разд. 6).
//
// Четыре полки, и делятся они по ответу на вопрос «что это двигает»:
//
//   🎯 прицел  — ЕДИНСТВЕННАЯ полка, которая двигает доход. Сила толчка,
//                разброс струи и податливость хвоста одной ступенью: почему
//                не тремя — в комментарии у лестницы (economy.js).
//   🧼 мыло    — шире мазок, меньше движений до порога покрытия;
//   🧽 мочалка — то же для тёрок;
//   💧 масло   — быстрее наливается хвост.
//
// Три последние доход не двигают вовсе и двигать не должны: мытьё — дорога к
// финалу, а не источник осколков. Покупается там ровно то, чем кухня торгует
// ножом, — меньше одинаковых движений до того же результата.
//
// ---------- ПОКУПАЕТ НЕ ЭКРАН ----------
// Проверка цены, списание и потолок — Backend.buyUpgrade('<ветка>', 'lust').
// Здесь только показ (инвариант 2).
//
// ---------- НИ ОДНОГО СЛОВА ----------
// Полка называется картинкой, ступень — числом «было → станет», цена —
// монетой (инвариант 9). Единицу числа называет картинка полки: у мыла это
// клетки под мазком, у масла — ходы до полного налива, у прицела — градусы
// разлёта струи.

const LustShop = {

    host: null,
    root: null,
    panelEl: null,
    listEl: null,
    walletEl: null,
    lackTimer: null,
    open: false,

    // Порядок полок берётся из конфига, а не повторяется здесь: два списка
    // одного и того же однажды разойдутся (docs/traps.md, п. 142).
    branches() {
        const u = this.conf();
        return (u.order || []).filter(key => {
            const b = u[key];
            if (!b || !b.levels) return false;
            // Выкупленная до потолка полка УХОДИТ: смотреть на то, что уже
            // своё, незачем — то же правило, что в лавке гнева, на кухне и
            // в саду.
            return this.level(key) < b.levels.length;
        });
    },

    conf() {
        return (typeof ECONOMY !== 'undefined' && ECONOMY.minigames
                && ECONOMY.minigames.lust && ECONOMY.minigames.lust.upgrades) || {};
    },

    level(key) {
        return (typeof GameState !== 'undefined' && GameState.upgradeLevel)
            ? GameState.upgradeLevel('lust_' + key) : 0;
    },

    init(host) {
        this.host = host;
        this.root = document.getElementById('bt-shop');
        if (!this.root) return;
        this.panelEl = document.getElementById('bt-shop-panel');
        this.listEl = document.getElementById('ls-list');
        this.walletEl = document.getElementById('ls-wallet');

        // Закрывается тапом МИМО прилавка. Своего крестика нет: крестик в
        // окне уже есть и закрывает всю мини-игру, второй рядом читался бы
        // тем же самым.
        this.root.addEventListener('pointerdown', (e) => {
            if (this.panelEl && this.panelEl.contains(e.target)) return;
            e.stopPropagation();
            this.close();
        });
    },

    // ================= ОТКРЫТИЕ И ЗАКРЫТИЕ =================
    show() {
        if (!this.root) this.init(this.host);
        if (!this.root) return;
        this.open = true;
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
    },

    // ================= ПОКАЗ =================
    render() {
        if (!this.root || !this.listEl) return;
        this.renderWallet();
        const rows = this.branches();
        this.listEl.innerHTML = rows.length ? rows.map(k => this.rowHtml(k)).join('')
                                            : '<div class="ls-empty">✓</div>';
        this.listEl.querySelectorAll('.ls-row[data-key]').forEach(row => {
            row.onclick = (e) => {
                e.stopPropagation();
                this.buy(row.dataset.key);
            };
        });
    },

    // Кошелёк: жетон похоти и осколок. Обе показываются всегда — осколки
    // копятся сами и складываются в жетон разменом, и прятать их значило бы
    // прятать половину ответа на вопрос «сколько мне ещё копить».
    //
    // data-cur на всём чипе: по этой метке WalletFx находит счётчик и сам
    // выбрасывает из него потраченное (src/core/wallet-fx.js).
    // Осколок и жетон рисуются ОДНОЙ И ТОЙ ЖЕ эмблемой: целой у жетона,
    // с одной закрашенной третью у осколка (docs/token-art.md). Второй
    // картинки для осколка не заводим — он и есть треть жетона, и видно это
    // должно быть без подписи.
    renderWallet() {
        if (!this.walletEl) return;
        const chip = (cur, art, n) =>
            `<span class="ls-coin" data-cur="${cur}">${art}<b>${n}</b></span>`;
        this.walletEl.innerHTML =
            chip('lust_shard', TokenArt.svg('lust_token', TokenArt.PER_THIRD),
                 GameState.currency('lust_shard')) +
            chip('lust_token', TokenArt.svg('lust_token', 0, { whole: true }),
                 GameState.currency('lust_token'));
    },

    // ---------- СТРОКА ПОЛКИ ----------
    // «Было → станет» показывает, что именно покупается. Числа у веток
    // разные единицы, и это не небрежность: картинка полки называет единицу
    // сама — то же решение, что в магазине сада.
    rowHtml(key) {
        const b = this.conf()[key];
        const lvl = this.level(key);
        const price = (b.levels[lvl] || {}).price || {};
        const cur = Object.keys(price)[0];
        const poor = !this.affordable(price);
        return `
        <button type="button" class="ls-row${poor ? ' ls-poor' : ''}" data-key="${key}">
            <span class="ls-pic"><svg viewBox="-34 -34 68 68">${this.art(key)}</svg></span>
            <span class="ls-body">
                <span class="ls-step">
                    <b>${this.value(key, lvl)}</b>
                    <i>→</i>
                    <b class="ls-next">${this.value(key, lvl + 1)}</b>
                </span>
                <span class="ls-pips">${this.pips(lvl, b.levels.length)}</span>
            </span>
            <span class="ls-buy">
                ${TokenArt.svg('lust_token', 0, { whole: true })}
                <b>${price[cur]}</b>
            </span>
        </button>`;
    },

    // Число ступени в понятиях игрока, а не в единицах конфига.
    //
    //   прицел  — ГРАДУСЫ разлёта струи: разброс и податливость хвоста
    //             складываются в одну угловую ошибку, и показывать их по
    //             отдельности значило бы показывать половину правды. Падает;
    //   мыло,
    //   мочалка — сколько КЛЕТОК берёт одно касание (πr²). Радиус в долях
    //             клетки ни о чём не говорит, а клетки игрок считает глазами;
    //   масло   — сколько ХОДОВ вдоль хвоста до полного налива. Падает.
    value(key, level) {
        const b = this.conf()[key];
        if (!b) return 0;
        const v = level <= 0 ? b.base
                             : ((b.levels[Math.min(level, b.levels.length) - 1] || {}).bonus);
        if (v == null) return 0;
        if (key === 'aim') return Math.round(v.spread + v.slop);
        if (key === 'oil') return Math.round(1 / v);
        return Math.round(Math.PI * v * v);
    },

    // Картинка полки. Мыло и мочалка — ТЕ ЖЕ предметы, что лежат на полке в
    // игре (docs/traps.md, п. 83): вещь в магазине обязана выглядеть так же,
    // как вещь в руке. Флакон и прицел своих запечённых двойников не имеют и
    // рисуются здесь.
    art(key) {
        if (key === 'soap' || key === 'cloth') return this.bakedIcon(key);
        if (key === 'oil') return this.flaskIcon();
        return this.aimIcon();
    },

    // Запечённый предмет нарисован на своём месте на полке — в иконке он
    // должен сидеть в НУЛЕ группы, поэтому сдвигается на своё же гнездо и
    // ужимается под клетку 68×68.
    bakedIcon(kind) {
        const a = BATH_ART.slots()[kind];
        const box = BATH_ART.box(kind);
        const k = 56 / Math.max(box.w, box.h);
        return `<g transform="scale(${k.toFixed(3)}) translate(${-a.x} ${-a.y})">`
             + BATH_BAKED.draw(kind) + `</g>`;
    },

    // Флакон — та же фигура, что стоит на полке, тем же приёмом.
    flaskIcon() {
        const c = BATH_ART.flaskAt(), F = BATH_ART.FLASK;
        const k = 56 / F.h;
        return `<g transform="scale(${k.toFixed(3)}) translate(${-c.x} ${(-c.y + F.h * 0.22).toFixed(1)})">`
             + BATH_ART.flask() + `</g>`;
    },

    // Прицел: капля и корзина рта. Рисуется здесь, а не в bath-art, потому
    // что в самой ванной такой картинки нет — это знак полки, а не предмет
    // комнаты.
    aimIcon() {
        const P = PALETTE.bathScene, INK = BATH_BAKED.ink;
        return `
        <!-- Пасть — СЛЕВА и раскрытая: это цель, и она обязана читаться
             целью, а не скобкой. Раскрытый рот с зубом наверху и языком
             внизу — то же, что игрок видит на морде в финале. -->
        <path d="M -30,-8 Q -30,16 -12,16 Q -2,16 2,4 L -30,-8 Z"
              fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M -24,10 Q -18,15 -10,13 Q -16,7 -24,10 Z" fill="${P.milk.edge}" opacity="0.7"/>
        <!-- Дуга полёта: пунктиром, потому что это траектория, а не струя. -->
        <path d="M 26,10 Q 8,-22 -8,4" fill="none" stroke="${P.floor.lo}"
              stroke-width="2.6" stroke-dasharray="4 4" stroke-linecap="round" opacity="0.85"/>
        <!-- Капля на дуге: белая и с контуром, как и всё, что летит в финале. -->
        <path d="M 6,-13 q 7,7 7,11 a 7 7 0 0 1 -14,0 q 0,-4 7,-11 Z"
              fill="${P.milk.hi}" stroke="${INK}" stroke-width="3" paint-order="stroke"/>
        <!-- Кончик хвоста, откуда бьёт: справа внизу, обрезан краем клетки. -->
        <path d="M 30,26 Q 28,14 24,9" fill="none" stroke="${P.flask[3]}"
              stroke-width="9" stroke-linecap="round"/>
        <path d="M 30,26 Q 28,14 24,9" fill="none" stroke="${INK}"
              stroke-width="12" stroke-linecap="round" opacity="0.001"/>`;
    },

    // Точки ступеней — тот же вид, что в прокачке гнева, на кухне и в саду:
    // одна и та же вещь в игре обязана выглядеть одинаково.
    pips(level, total) {
        let out = '';
        for (let i = 0; i < total; i++) out += `<i class="${i < level ? 'on' : ''}"></i>`;
        return out;
    },

    affordable(price) {
        return !Object.keys(price || {}).some(cur => GameState.currency(cur) < price[cur]);
    },

    // ================= ПОКУПКА =================
    buy(key) {
        const res = Backend.buyUpgrade(key, 'lust');
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
        const el = this.walletEl.querySelector(`.ls-coin[data-cur="${cur}"]`) || this.walletEl;
        el.classList.remove('ls-no');
        void el.offsetWidth;
        el.classList.add('ls-no');
        clearTimeout(this.lackTimer);
        this.lackTimer = setTimeout(() => el.classList.remove('ls-no'), 900);
    }
};

if (typeof window !== 'undefined') window.LustShop = LustShop;
