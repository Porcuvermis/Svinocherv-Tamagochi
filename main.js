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
        this.updateUI();
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

    // Показывает то, что в состоянии. Источник данных — GameState, а не поле
    // в этом объекте: значение считается на момент обращения.
    updateUI() {
        if (!GameState.data) return;

        ECONOMY.sinOrder.forEach(key => {
            const value = GameState.sinValue(key);
            const max = GameState.maxValue(key) || 1;
            const percent = Math.max(0, Math.min(100, (value / max) * 100));

            const bar = document.getElementById(`bar-${key}`);
            const valText = document.getElementById(`val-${key}`);
            if (bar) bar.style.width = `${percent}%`;
            if (valText) valText.textContent = `${Math.round(percent)}%`;

            const miniCircle = document.querySelector(`#mini-${key} .progress`);
            if (miniCircle) miniCircle.style.strokeDashoffset = 100 - percent;
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
