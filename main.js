// ================= ГЛОБАЛЬНЫЙ МЕНЕДЖЕР ИГРЫ (GAMEMANAGER) =================
// Теперь это только интерфейс: собрать HUD, показать значения, открыть нужную
// мини-игру. Состояния он не хранит и ничего не начисляет.
//
// Что изменилось и почему (docs/plan/05-next-steps.md):
//
//   • Шкалы больше не живут в этом файле. Они в GameState, а их актуальное
//     значение вычисляется формулой от метки времени — поэтому падают и при
//     закрытом приложении, как и положено тамагочи.
//
//   • Убран setInterval(decaySins). Раньше он был источником данных: шкала
//     существовала только пока крутится таймер. Теперь таймер здесь остался
//     ровно один и только для показа — раз в секунду перерисовать полоски.
//
//   • Мини-игры больше не пишут в шкалы. Они бросают событие с результатом,
//     а что за это дать, решает конфиг наград через Backend.
const GameManager = {

    // Какая мини-игра открывается по кнопке «Утолить». Раньше это была
    // лестница из семи if-else, отличавшихся только именем объекта.
    //
    // Функции, а не строки с именами: мини-игры объявлены через `const`, а
    // такие объявления НЕ попадают в window — искать их там (window['GreedMinigame'])
    // означает всегда получать undefined и молча не открывать игру. Обращение
    // по имени внутри функции резолвится по области видимости и работает.
    minigames: {
        pride:    () => (typeof PrideMinigame    !== 'undefined') ? PrideMinigame    : null,
        greed:    () => (typeof GreedMinigame    !== 'undefined') ? GreedMinigame    : null,
        envy:     () => (typeof EnvyMinigame     !== 'undefined') ? EnvyMinigame     : null,
        wrath:    () => (typeof WrathMinigame    !== 'undefined') ? WrathMinigame    : null,
        lust:     () => (typeof LustMinigame     !== 'undefined') ? LustMinigame     : null,
        gluttony: () => (typeof GluttonyMinigame !== 'undefined') ? GluttonyMinigame : null,
        sloth:    () => (typeof SlothMinigame    !== 'undefined') ? SlothMinigame    : null
    },

    _uiTimer: null,

    async init() {
        try {
            // Форма вызовов — будущий API. Сейчас за ним локальная
            // реализация, потом встанет сервер, здесь ничего не изменится.
            await Backend.auth();
            await Backend.getState();
        } catch (err) {
            // Интерфейс должен подняться в любом случае: без состояния игрок
            // хотя бы увидит игру, а не чёрный экран.
            console.error('[Игра] не удалось получить состояние', err);
            if (!GameState.data) GameState.load();
        }

        this.initUI();
        this.cacheElements();
        this.updateUI(true);
        this.setupEvents();
        this.listenMinigames();
        this.startUiClock();

        if (typeof initWorm === 'function') {
            initWorm();
        }

        // Экран загрузки открывается только теперь: HUD собран, персонаж
        // смонтирован. Два кадра ожидания — чтобы под пеленой успел
        // отрисоваться ПЕРВЫЙ кадр свиночервя, иначе круг раскроется на
        // пустую комнату и червь появится в ней уже на глазах.
        if (window.BootScreen) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                window.BootScreen.release('game');
            }));
        }
    },

    // ---------- ИНТЕРФЕЙС ----------
    initUI() {
        const miniHud = document.getElementById('mini-hud');
        const sinsContainer = document.getElementById('sins-container');
        if (!miniHud || !sinsContainer) return;

        miniHud.innerHTML = '';
        sinsContainer.innerHTML = '';

        ECONOMY.sinOrder.forEach(key => {
            const sin = ECONOMY.sins[key];
            if (!sin) return;

            // Кружок в верхнем HUD
            miniHud.insertAdjacentHTML('beforeend', `
                <div class="stat-circle" id="mini-${key}">
                    <svg viewBox="0 0 36 36">
                        <circle class="bg" cx="18" cy="18" r="16"></circle>
                        <circle class="progress" cx="18" cy="18" r="16" stroke="${sin.color}"></circle>
                    </svg>
                    <div class="emoji">${sin.emoji}</div>
                </div>
            `);

            // Строка в полноэкранном меню
            sinsContainer.insertAdjacentHTML('beforeend', `
                <div class="sin-row">
                    <div class="sin-info">
                        <div class="sin-name"><span>${sin.emoji} ${sin.name}</span></div>
                        <div class="sin-bar-container">
                            <div class="sin-bar" id="bar-${key}" style="background-color: ${sin.color}"></div>
                            <div class="sin-value" id="val-${key}">0%</div>
                        </div>
                    </div>
                    <button class="sin-btn" style="background-color: ${sin.color}" onclick="GameManager.handleSinAction('${key}')">Утолить</button>
                </div>
            `);
        });
    },

    // Ссылки на элементы шкал. Ищутся один раз при сборке HUD: искать их
    // заново на каждой перерисовке — это семь querySelector в секунду по
    // документу, в котором лежит здоровенный SVG персонажа.
    _els: null,

    cacheElements() {
        this._els = {};
        this._gold = document.getElementById('wallet-gold');
        this._shownGold = null;
        ECONOMY.sinOrder.forEach(key => {
            this._els[key] = {
                bar: document.getElementById(`bar-${key}`),
                val: document.getElementById(`val-${key}`),
                circle: document.querySelector(`#mini-${key} .progress`),
                // Что уже нарисовано. Отдельно для кружка и для полоски: они
                // видны в разное время, и расходятся тоже.
                shownCircle: null,
                shownBar: null
            };
        });
    },

    // Показывает то, что в состоянии. Источник данных — GameState, а не поле
    // в этом объекте: значение считается на момент обращения.
    //
    // ---------- ПОЧЕМУ ЗДЕСЬ ПРОВЕРКИ, А НЕ ПРОСТО ЗАПИСЬ ----------
    // Шкала теперь теряет около трёх ТЫСЯЧНЫХ процента в секунду. Записывать
    // такое изменение в стиль бессмысленно и недёшево: каждая запись — это
    // пересчёт стилей и раскладки всего документа, а вместе с CSS-переходом
    // ещё и работа в каждом кадре, пока переход идёт. Пиксель при этом не
    // сдвигается: 0.003% не видно.
    //
    // Поэтому пишем, только когда изменилась хотя бы десятая доля процента, и
    // не трогаем полоски меню, пока меню закрыто.
    updateUI(force) {
        if (!GameState.data) return;
        if (!this._els) this.cacheElements();

        const fullMenu = document.getElementById('full-menu');
        const menuOpen = !!fullMenu && fullMenu.classList.contains('active');

        // Кошелёк. Значение целое и меняется редко, поэтому проверка на
        // изменение здесь не про экономию кадров, а про то же правило, что и
        // ниже: не писать в DOM, когда писать нечего.
        if (this._gold) {
            const gold = GameState.currency('gold');
            if (force || this._shownGold !== gold) {
                this._gold.textContent = gold;
                this._shownGold = gold;
            }
        }

        ECONOMY.sinOrder.forEach(key => {
            const els = this._els[key];
            if (!els) return;

            const max = GameState.maxValue(key) || 1;
            const percent = Math.max(0, Math.min(100, (GameState.sinValue(key) / max) * 100));
            const shown = Math.round(percent * 10) / 10;

            if (els.circle && (force || els.shownCircle !== shown)) {
                els.circle.style.strokeDashoffset = 100 - shown;
                els.shownCircle = shown;
            }

            // Меню закрыто — его полоски не видит никто, а раскладку они
            // пересчитывают наравне с видимыми. Отметка о нарисованном при
            // этом НЕ ставится, поэтому при следующем открытии меню полоски
            // подтянутся сами, даже если никто не позвал перерисовку.
            if ((menuOpen || force) && (force || els.shownBar !== shown)) {
                if (els.bar) els.bar.style.width = `${shown}%`;
                if (els.val) els.val.textContent = `${Math.round(shown)}%`;
                els.shownBar = shown;
            }
        });
    },

    // Единственный таймер в игре — и он ничего не считает, только
    // перерисовывает. Раз в секунду хватает: самая быстрая шкала теряет
    // процент за пять минут.
    startUiClock() {
        if (this._uiTimer) return;
        let last = 0;
        const tick = (now) => {
            this._uiTimer = requestAnimationFrame(tick);
            // Вкладка в фоне — рисовать некому и незачем: значения всё равно
            // вычисляются от времени, а не накапливаются.
            if (document.hidden) return;
            if (now - last < 1000) return;
            last = now;
            this.updateUI();
        };
        this._uiTimer = requestAnimationFrame(tick);

        // Возврат из фона — момент, когда на сервере надо будет спросить
        // правду. Пока просто пересчитываем и обновляем last_seen_at.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            Backend.getState().then(() => this.updateUI()).catch(() => this.updateUI());
        });
    },

    // ---------- РЕЗУЛЬТАТЫ МИНИ-ИГР ----------
    // Мини-игра сообщает, что произошло. Сколько это стоит — не её дело.
    listenMinigames() {
        GameEvents.on('minigame:result', (result) => {
            const payload = Object.assign({ client_request_id: newRequestId() }, result);
            Backend.minigameResult(payload)
                .then((answer) => {
                    if (answer && answer.awarded) {
                        console.log('[Игра] начислено', answer.awarded);
                        // Новая отметина на теле — червя надо перерисовать.
                        if (answer.awarded.mark && typeof refreshWormMarks === 'function') {
                            refreshWormMarks();
                        }
                    }
                    this.updateUI();
                })
                .catch((err) => {
                    console.error('[Игра] результат мини-игры не доехал', err);
                    this.updateUI();
                });
        });
    },

    // ---------- ЭКРАНЫ ----------
    closeMenuBeforeMinigame() {
        const fullMenu = document.getElementById('full-menu');
        const miniHud = document.getElementById('mini-hud');
        if (fullMenu) fullMenu.classList.remove('active');
        if (miniHud) {
            miniHud.style.opacity = '1';
            miniHud.style.pointerEvents = 'auto';
        }
    },

    handleSinAction(sinKey) {
        const resolve = this.minigames[sinKey];
        const minigame = resolve ? resolve() : null;

        if (!minigame || typeof minigame.open !== 'function') {
            // Раньше здесь была заглушка, добавлявшая +30 к шкале. Теперь
            // начисляет только Backend, а «утолить без мини-игры» — это не
            // фича, а отсутствующая мини-игра.
            console.warn('[Игра] нет мини-игры для греха:', sinKey);
            return;
        }

        this.closeMenuBeforeMinigame();
        minigame.open();
    },

    setupEvents() {
        const closeMenuArea = document.getElementById('close-menu-area');
        const fullMenu = document.getElementById('full-menu');
        const miniHud = document.getElementById('mini-hud');

        // Открываем меню при клике на верхний HUD со шкалами-кружками
        if (miniHud && fullMenu) {
            miniHud.onclick = (e) => {
                e.stopPropagation(); // Не даем клику уйти на игровой Canvas
                fullMenu.classList.add('active');
                miniHud.style.opacity = '0';
                miniHud.style.pointerEvents = 'none';
                // Пока меню было закрыто, его полоски не обновлялись.
                this.updateUI(true);
            };
        }

        // Закрываем меню при клике на верхнюю зону стрелок
        if (closeMenuArea && fullMenu && miniHud) {
            closeMenuArea.onclick = (e) => {
                e.stopPropagation();
                fullMenu.classList.remove('active');
                miniHud.style.opacity = '1';
                miniHud.style.pointerEvents = 'auto';
            };
        }
    }
};

// Железобетонный старт при загрузке документа
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GameManager.init());
} else {
    GameManager.init();
}
