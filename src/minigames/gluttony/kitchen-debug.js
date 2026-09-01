// ================= DEBUG-ПАНЕЛЬ КУХНИ =================
// Панель видна только при включённом DebugMode и только пока открыта кухня.
// Это НЕ игра, поэтому правило «ни одного слова» (инвариант 9) сюда не
// распространяется — но слов тут всё равно почти нет: значки самих
// ингредиентов понятнее подписей.
//
// ---------- ЗАЧЕМ ----------
// Кладовая наполняется стартовым запасом один раз за сейв, а расходуется
// каждой готовкой. Через десяток проверок в холодильнике пусто, и дальше
// либо стирать весь прогресс ради одной кормёжки, либо править состояние
// руками в консоли. Оба пути хуже кнопки.
//
// Второе, что съедает время на проверках, — это сама готовка. Проверяешь
// плиту — а до неё двенадцать взмахов ножом; проверяешь кормёжку — а до неё
// вся готовка целиком. Поэтому здесь же есть перескоки по этапам.
//
// ---------- ЧЕГО ЗДЕСЬ НЕТ ----------
// Ничего, что начисляет награды в обход конфига (инвариант 2). Кладовая —
// это запас, а не награда: её правка не выдаёт ни жетонов, ни какашек. Всё,
// что про награду, по-прежнему считает Backend по результату мини-игры.
const KitchenDebug = {
    panel: null,
    host: null,

    // Сколько класть по кнопке «полный холодильник». Не бесконечность:
    // проверять надо в том числе и то, что кончается.
    FULL: 6,

    init(hostEl) {
        if (this.panel || !hostEl) return;
        if (typeof DebugMode === 'undefined' || typeof KITCHEN === 'undefined') return;
        // Панель кладётся ВНУТРЬ рамки окна, а не на весь экран мини-игры.
        // Экран — во весь вьюпорт, и его верх на телефоне уходит под чёлку и
        // системную строку: кнопки видно, а нажать нельзя. У тела рамки верх
        // уже отсчитан от безопасной зоны и от шапки с крестиком, поэтому
        // здесь ничего вычислять не нужно — и не сломается на другом
        // телефоне с другой чёлкой.
        this.host = hostEl.querySelector('.mg-body') || hostEl;

        this.panel = document.createElement('div');
        this.panel.id = 'kt-debug';
        this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.panel.addEventListener('click', (e) => {
            const act = e.target && e.target.getAttribute('data-act');
            const key = e.target && e.target.getAttribute('data-key');
            if (!act) return;
            e.stopPropagation();
            this.run(act, key);
        });
        this.host.appendChild(this.panel);

        DebugMode.onChange(() => this.render());
        this.render();
    },

    // Кладовая одна на ингредиенты и жидкости: и то и другое расходуется
    // одинаково, и в debug-панели разделять их незачем.
    stock() {
        return (typeof GameState !== 'undefined' && GameState.data && GameState.data.pantry) || {};
    },

    add(key, n) {
        if (!GameState.data) return;
        if (!GameState.data.pantry) GameState.data.pantry = {};
        const p = GameState.data.pantry;
        p[key] = Math.max(0, (p[key] || 0) + n);
        GameState.save();
        this.refreshKitchen();
        this.render();
    },

    // Полки перестраиваются только там, где это безопасно: на общем виде и в
    // холодильнике. Посреди нарезки перестройка снесла бы то, что уже лежит
    // на доске, — и debug-кнопка сломала бы ровно ту проверку, ради которой
    // её и нажали.
    refreshKitchen() {
        if (typeof GluttonyMinigame === 'undefined') return;
        const g = GluttonyMinigame;
        if (!g.screenElement || !g.screenElement.classList.contains('active')) return;
        g.buildBottles();
        if (g.phase === 'overview' || g.phase === 'fridge') {
            const keep = g.onBoard.map(o => o.key);
            g.el('kt-loose').innerHTML = '';
            g.fillShelves();
            // Что уже лежит на доске, остаётся взятым: силуэт на полке
            // возвращается на место, иначе продукт задвоится.
            keep.forEach(key => {
                const node = Array.from(g.el('kt-loose').children)
                    .find(n => n.dataset.key === key && n.dataset.where === 'fridge');
                if (!node) return;
                node.dataset.where = 'ghost';
                node.innerHTML = KITCHEN_ART.ghost(key, +node.dataset.seed);
                const entry = g.onBoard.find(o => o.key === key);
                if (entry) entry.ghost = node;
                if (!KITCHEN.ingredients[key].infinite) {
                    g.setCount(node, Math.max(0, (this.stock()[key] || 0) - 1));
                }
            });
        }
    },

    run(act, key) {
        const g = (typeof GluttonyMinigame !== 'undefined') ? GluttonyMinigame : null;

        if (act === 'plus') { this.add(key, 1); return; }
        if (act === 'minus') { this.add(key, -1); return; }

        if (act === 'full' || act === 'empty') {
            if (!GameState.data) return;
            const p = GameState.data.pantry = GameState.data.pantry || {};
            this.keys().forEach(k => { p[k] = (act === 'full') ? this.FULL : 0; });
            GameState.save();
            this.refreshKitchen();
            this.render();
            return;
        }

        // Шкала в ноль: без этого кормёжка ничего не меняет и по итогу не
        // видно, сработала награда или нет.
        if (act === 'hungry') {
            GameState.setSinValue('gluttony', 0);
            GameState.save();
            if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
            this.render();
            return;
        }

        if (!g || !g.screenElement || !g.screenElement.classList.contains('active')) return;

        // Нарезка разом: двенадцать взмахов ножом ради проверки плиты — это
        // не проверка, это разминка кисти.
        if (act === 'chopped') {
            if (g.phase !== 'chop') return;
            g.chops = g.CHOPS_TOTAL;
            g.renderChopped(2);
            g.parkKnife();
            return;
        }

        // Перескоки идут ЧЕРЕЗ ТЕ ЖЕ функции, что и обычная игра: иначе
        // debug проверял бы не игру, а сам себя.
        if (act === 'stove') {
            if (g.phase === 'overview') g.openFridge();
            if (!g.onBoard.length) {
                const have = this.keys().find(k => KITCHEN.ingredients[k] &&
                    KITCHEN.ingredients[k].type !== 'block' && (this.stock()[k] || 0) > 0);
                if (have) g.putOnBoard(have, null);
            }
            g.phase = 'chop';
            g.chops = g.CHOPS_TOTAL;
            g.goToStove();
            return;
        }

        if (act === 'feed') {
            if (!g.inPot.length) g.inPot = ['pork'];
            if (!g.liquid) g.liquid = 'broth';
            g.goToFeed();
            return;
        }
    },

    keys() {
        return Object.keys(KITCHEN.ingredients)
            .filter(k => !KITCHEN.ingredients[k].infinite)
            .concat(Object.keys(KITCHEN.liquids).filter(k => !KITCHEN.liquids[k].infinite));
    },

    render() {
        if (!this.panel) return;
        const on = DebugMode.enabled;
        this.panel.classList.toggle('visible', on);
        if (!on) return;

        const stock = this.stock();
        const row = (k) => {
            const item = KITCHEN.ingredients[k] || KITCHEN.liquids[k];
            return `<span class="kt-debug-item">
                <b>${item.emoji}</b>
                <button data-act="minus" data-key="${k}">−</button>
                <i>${stock[k] || 0}</i>
                <button data-act="plus" data-key="${k}">+</button>
            </span>`;
        };

        const sin = (typeof GameState !== 'undefined' && GameState.data)
            ? Math.round(GameState.sinValue('gluttony')) : 0;

        this.panel.innerHTML =
            `<div class="kt-debug-row">${this.keys().map(row).join('')}</div>
             <div class="kt-debug-row">
                <button data-act="full">полный</button>
                <button data-act="empty">пусто</button>
                <button data-act="hungry">шкала 0 (${sin})</button>
                <button data-act="chopped">нарезано</button>
                <button data-act="stove">к плите</button>
                <button data-act="feed">к кормёжке</button>
             </div>`;
    }
};

if (typeof window !== 'undefined') window.KitchenDebug = KitchenDebug;
