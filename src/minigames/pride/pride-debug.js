// ================= DEBUG-ПАНЕЛЬ ТЩЕСЛАВИЯ =================
// Видна при включённом DebugMode и только пока открыта костюмерная. Не игра,
// поэтому правило «ни одного слова» (инвариант 9) сюда не распространяется.
//
// ---------- ЗАЧЕМ ----------
// Прокачка тщеславия меряется МЕСЯЦАМИ: полная линия стоит тысячи поцелуев,
// а выход приносит девять. Проверить, как играется с широкой зоной или с
// множителем ×7, честным путём нельзя — до этих чисел два месяца реального
// времени. Тут они выдаются кнопкой.
//
// Заодно панель показывает то, что иначе видно только в консоли: с какими
// числами идёт СЛЕДУЮЩИЙ выход. Радиус, время зоны, интервал и потолок
// множителя — четыре числа, по которым сразу понятно, что именно изменила
// покупка (в том числе скрытая ручка частоты, которую в игре не показывают
// вовсе).
//
// ---------- ЧЕГО ЗДЕСЬ НЕТ ----------
// Ничего, что начисляет награду в обход конфига (инвариант 2). Поцелуи
// выдаются той же дверью, что и в других грехах (Backend.grantCurrency,
// помеченная как debug), а уровни прокачки ставятся прямо в состояние —
// это не начисление, а перемотка к нужной ступени.
const PrideDebug = {
    panel: null,
    host: null,

    init(hostEl) {
        if (this.panel || !hostEl) return;
        if (typeof DebugMode === 'undefined' || typeof ECONOMY === 'undefined') return;
        // Панель кладётся ВНУТРЬ рамки окна: экран мини-игры растянут на весь
        // вьюпорт, и его верх на телефоне уходит под чёлку — кнопки видно, а
        // нажать нельзя.
        this.host = hostEl.querySelector('.mg-body') || hostEl;

        this.panel = document.createElement('div');
        this.panel.id = 'pr-debug';
        this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.panel.addEventListener('click', (e) => {
            const act = e.target && e.target.getAttribute('data-act');
            if (!act) return;
            e.stopPropagation();
            this.run(act);
        });
        this.host.appendChild(this.panel);

        DebugMode.onChange(() => this.render());
        this.render();
    },

    lines() { return ECONOMY.minigames.pride.upgrades.order; },

    // Ступень линии. Ставится прямо в состояние: это не покупка, а перемотка,
    // и списывать за неё поцелуи незачем.
    step(key, delta) {
        const branch = ECONOMY.minigames.pride.upgrades[key];
        const now = GameState.upgradeLevel('pride_' + key);
        const next = Math.max(0, Math.min(branch.levels.length, now + delta));
        GameState.data.upgrades['pride_' + key] = next;
        GameState.save();
    },

    run(act) {
        if (!GameState.data) return;

        if (act === 'kiss') Backend.grantCurrency('pride_kiss', 500);
        else if (act === 'kiss5k') Backend.grantCurrency('pride_kiss', 5000);
        else if (act.startsWith('up:')) this.step(act.slice(3), 1);
        else if (act.startsWith('dn:')) this.step(act.slice(3), -1);
        else if (act === 'max') {
            this.lines().forEach(key => {
                GameState.data.upgrades['pride_' + key] =
                    ECONOMY.minigames.pride.upgrades[key].levels.length;
            });
            GameState.save();
        } else if (act === 'zero') {
            this.lines().forEach(key => { GameState.data.upgrades['pride_' + key] = 0; });
            GameState.save();
        } else if (act === 'wear') {
            // Весь гардероб разом: иначе проверка вида в других грехах
            // начинается с восьми покупок по четыреста поцелуев.
            PRIDE_WARDROBE.items.forEach(i => { GameState.data.wardrobe[i.id] = true; });
            GameState.save();
        } else if (act === 'nude') {
            GameState.data.wardrobe = {};
            GameState.data.cosmetics = {};
            GameState.save();
        } else if (act === 'fresh') {
            // ---------- ПРОГОЛОДАТЬСЯ ПРЯМО СЕЙЧАС ----------
            // Кнопка была «обнулить сутки» и сбрасывала счётчик выходов, на
            // котором стояла усталость публики. Усталости больше нет, есть
            // порог голода — и проверять его иначе пришлось бы ждать
            // двенадцать часов. Роняем шкалу ровно на порог.
            const at = (ECONOMY.sins.pride || {}).payAt;
            GameState.setSinValue('pride', at != null ? at : 0);
            delete GameState.data.daily_counters['pride.parade.win'];
            GameState.save();
        }

        // Числа выхода меняются от любой из кнопок — пересобираем костюмерную.
        if (typeof PrideMinigame !== 'undefined' && PrideMinigame.screenElement
            && PrideMinigame.screenElement.classList.contains('active')) {
            PrideMinigame.refreshWorm();
            PrideMinigame.enterWardrobe();
        }
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        this.render();
    },

    render() {
        if (!this.panel) return;
        this.panel.classList.toggle('visible', !!DebugMode.enabled);
        if (!DebugMode.enabled || !GameState.data) return;

        const p = Backend.prideRun();
        const conf = ECONOMY.minigames.pride.upgrades;
        const line = (key) => {
            const lvl = GameState.upgradeLevel('pride_' + key);
            const max = conf[key].levels.length;
            return `<span class="pr-debug-tag">${conf[key].emoji}${lvl}/${max}</span>` +
                   `<button data-act="dn:${key}">−</button>` +
                   `<button data-act="up:${key}">+</button>`;
        };
        const day = GameState.counter('pride.parade.win');

        this.panel.innerHTML = `
            <div class="pr-debug-row">
                <span class="pr-debug-tag">💋${GameState.currency('pride_kiss')}</span>
                <button data-act="kiss">+500</button>
                <button data-act="kiss5k">+5000</button>
                <span class="pr-debug-tag">выходов сегодня ${day}</span>
                <button data-act="fresh">проголодаться</button>
            </div>
            <div class="pr-debug-row">
                ${this.lines().map(line).join('')}
                <button data-act="max">всё макс</button>
                <button data-act="zero">сброс</button>
            </div>
            <div class="pr-debug-row">
                <span class="pr-debug-tag">зона ${p.radius}px</span>
                <span class="pr-debug-tag">висит ${(p.lifeMs / 1000).toFixed(2)}с</span>
                <span class="pr-debug-tag">раз в ${p.spawnMs}мс (${(20000 / p.spawnMs).toFixed(0)} зон)</span>
                <span class="pr-debug-tag">потолок ×${p.multCap}</span>
            </div>
            <div class="pr-debug-row">
                <button data-act="wear">выдать гардероб</button>
                <button data-act="nude">раздеть</button>
            </div>`;
    }
};

if (typeof window !== 'undefined') window.PrideDebug = PrideDebug;
