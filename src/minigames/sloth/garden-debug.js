// ================= DEBUG-ПАНЕЛЬ САДА =================
// Видна при включённом DebugMode и только пока открыт сад. Не игра, поэтому
// правило «ни одного слова» (инвариант 9) сюда не распространяется.
//
// ---------- ЗАЧЕМ ----------
// Сад меряется ЧАСАМИ. Первый этап — три часа оффлайн, второй — двадцать пять
// минут. Проверить хоть что-нибудь, не отматывая время, физически нельзя:
// посадил, полил — и до следующего шага три часа реального ожидания.
//
// Отматываются не системные часы, а метки в состоянии — ровно тот механизм,
// который работает в игре. Проверяется, значит, настоящий расчёт, а не его
// имитация: если формула этапа врёт, отмотка это покажет.
//
// ---------- ЧЕГО ЗДЕСЬ НЕТ ----------
// Ничего, что начисляет награду в обход конфига (инвариант 2). Какашки
// выдаются той же дверью, что и находка в саду, а плоды в кладовую кладёт
// Backend по своим правилам, включая потолок склада.
const GardenDebug = {
    panel: null,
    host: null,

    init(hostEl) {
        if (this.panel || !hostEl) return;
        if (typeof DebugMode === 'undefined' || typeof GARDEN === 'undefined') return;
        // Панель кладётся ВНУТРЬ рамки окна: экран мини-игры растянут на весь
        // вьюпорт, и его верх на телефоне уходит под чёлку — кнопки видно, а
        // нажать нельзя. У тела рамки верх уже отсчитан и от безопасной зоны,
        // и от шапки с крестиком.
        this.host = hostEl.querySelector('.mg-body') || hostEl;

        this.panel = document.createElement('div');
        this.panel.id = 'gd-debug';
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

    beds() {
        return (GameState.data.garden && GameState.data.garden.beds) || [];
    },

    // Отмотка метки — то же, что «−1 ч» в общей debug-панели, только для
    // грядок. Двигаются метки, а не часы.
    rewind(hours) {
        this.beds().forEach(b => { if (b.at) b.at -= hours * 3600000; });
        GameState.save();
        Backend.gardenSettle();
    },

    run(act) {
        if (!GameState.data) return;

        if (act === 'h1') this.rewind(1);
        else if (act === 'h4') this.rewind(4);
        else if (act === 'min') {
            // Отдельно короткая отмотка: второй этап меряется минутами, и на
            // часах его не поймать.
            this.beds().forEach(b => { if (b.at) b.at -= 30 * 60000; });
            GameState.save();
            Backend.gardenSettle();
        } else if (act === 'dung') {
            Backend.award({ currencies: {} }, 'dung', 5, 'debug.garden');
        } else if (act === 'seeds') {
            // Все семена сразу: иначе виды растений проверяются только по
            // мере того, как они выпадут при копании.
            GameState.data.garden.seeds = Object.keys(GARDEN.species);
        } else if (act === 'open') {
            this.beds().forEach(b => { if (b.stage === 'locked') b.stage = 'empty'; });
        } else if (act === 'reset') {
            this.beds().forEach((b, i) => {
                b.stage = i < GARDEN.BEDS_OPEN ? 'empty' : 'locked';
                b.species = null; b.seed = 0; b.at = null; b.skipped = 0;
            });
        } else if (act === 'sloth0') {
            GameState.setSinValue('sloth', 0);
        }

        GameState.save();
        if (typeof SlothMinigame !== 'undefined' && SlothMinigame.render) SlothMinigame.render();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        this.render();
    },

    render() {
        if (!this.panel) return;
        const on = DebugMode.enabled;
        this.panel.classList.toggle('visible', on);
        if (!on) return;

        // Сводка по грядкам: что на каждой и сколько ей ещё ждать. Читать
        // состояние сада по картинке во время отладки долго, а тут оно
        // строкой.
        const rows = this.beds().map((b, i) => {
            const left = Backend.gardenLeft(b);
            const t = left > 0
                ? (left > 3600000 ? (left / 3600000).toFixed(1) + 'ч' : Math.ceil(left / 60000) + 'м')
                : '—';
            return `${i}:${b.stage.slice(0, 4)}${b.species ? '/' + b.species.slice(0, 4) : ''} ${t}`;
        }).join('   ');

        this.panel.innerHTML =
            `<div class="gd-debug-row">
                <button data-act="min">−30 мин</button>
                <button data-act="h1">−1 ч</button>
                <button data-act="h4">−4 ч</button>
                <button data-act="dung">+5 💩 (${GameState.currency('dung')})</button>
             </div>
             <div class="gd-debug-row">
                <button data-act="open">открыть грядки</button>
                <button data-act="seeds">все семена</button>
                <button data-act="sloth0">шкала 0 (${Math.round(GameState.sinValue('sloth'))})</button>
                <button data-act="reset">сброс сада</button>
             </div>
             <div class="gd-debug-beds">${rows}</div>`;
    }
};

if (typeof window !== 'undefined') window.GardenDebug = GardenDebug;
