// ================= ГЛОБАЛЬНЫЙ МЕНЕДЖЕР ИГРЫ (GAMEMANAGER) =================
// Теперь это только интерфейс: показать значения и открыть нужную мини-игру.
// Состояния он не хранит и ничего не начисляет.
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
//
//   • Шкал в комнате больше нет. Верхний HUD из семи кружков и список
//     полосок под ним сняты целиком: грехи живут в отдельном экране —
//     колесе лучей (src/core/sins-menu.js), которое открывается удержанием
//     пальца на самом червя. Здесь остались только кошелёк и маршрутизация.
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
        this.listenMinigames();
        this.watchMinigameScreens();
        this.startUiClock();

        if (typeof initWorm === 'function') {
            initWorm();
        }

        // Удержание пальца на червя вешается ПОСЛЕ монтажа: до него сцены
        // персонажа в документе ещё нет, и вешать было бы не на что.
        if (window.SinsMenu) SinsMenu.attachWorm();

        // Экран загрузки открывается только теперь: интерфейс собран, персонаж
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
    // Собирать больше нечего: меню грехов строит себя само, а в комнате из
    // интерфейса остался один кошелёк.
    initUI() {
        if (window.SinsMenu) SinsMenu.init();
    },

    _gold: null,
    _shownGold: null,
    _cached: false,

    cacheElements() {
        this._cached = true;
        this._gold = document.getElementById('wallet-gold');
        this._shownGold = null;
    },

    // Показывает то, что в состоянии. Источник данных — GameState, а не поле
    // в этом объекте: значение считается на момент обращения.
    //
    // Проверки на «изменилось ли» здесь не про экономию на спичках: шкала
    // теряет около трёх ТЫСЯЧНЫХ процента в секунду, и каждая запись в стиль
    // — это пересчёт раскладки всего документа ради пикселя, который не
    // сдвинулся.
    updateUI(force) {
        if (!GameState.data) return;
        if (!this._cached) this.cacheElements();

        if (this._gold) {
            const gold = GameState.currency('gold');
            if (force || this._shownGold !== gold) {
                this._gold.textContent = gold;
                this._shownGold = gold;
            }
        }

        // Меню само решит, есть ли смысл рисовать: закрытое оно не трогает
        // ни одного узла.
        if (window.SinsMenu) SinsMenu.update(force);
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
                        // Обратная связь мини-игре: что именно ей начислили.
                        // Она об этом не решает и не спрашивает — только
                        // показывает ответ, пришедший с той стороны.
                        GameEvents.emit('minigame:awarded', answer.awarded);
                    }
                    this.updateUI();
                })
                .catch((err) => {
                    console.error('[Игра] результат мини-игры не доехал', err);
                    this.updateUI();
                });
        });
    },

    // ---------- КОМНАТА ПОД ОТКРЫТОЙ МИНИ-ИГРОЙ ----------
    // Персонаж главного экрана — самая дорогая вещь на экране: семьсот узлов,
    // и каждый кадр по ним проходит вся анимация. Под открытой мини-игрой он
    // не виден, но продолжает считать кадры: рендерер этого не ловит, потому
    // что по всем признакам сцена видима — её просто накрыли непрозрачным
    // окном.
    //
    // Умели гасить его ровно две игры из семи — те, что вызывали
    // MinigameWindow.pauseRoom() руками. Остальные пять грузили процессор
    // вторым червём даром: в зависти на нём одном уходило 127 мс из трёх
    // секунд, и это при том, что там своя трёхмерная сцена.
    //
    // Наблюдатель, а не вызовы в каждой игре: закрываются они все по-разному
    // (у шести свои окна), а признак один — класс active на экране. Так
    // ничего нельзя забыть добавить в новой мини-игре.
    watchMinigameScreens() {
        const screens = document.querySelectorAll('.minigame-screen');
        if (!screens.length) return;
        const room = document.getElementById('game-container');
        const sync = () => {
            const busy = document.querySelector('.minigame-screen.active');
            const h = window.MainWormHandle;
            if (h && typeof h.setPaused === 'function') h.setPaused(!!busy);
            // Мало остановить анимацию: комнату под мини-игрой браузер всё
            // равно КРАСИТ каждый кадр — семьсот узлов персонажа, локация,
            // кошелёк. Класс снимает с неё отрисовку целиком (правило в
            // style.css), сохраняя раскладку: возврат мгновенный и без
            // пересборки сцены.
            if (room) room.classList.toggle('mg-open', !!busy);
        };
        const obs = new MutationObserver(sync);
        screens.forEach(n => obs.observe(n, { attributes: true,
                                              attributeFilter: ['class'] }));
        sync();
    },

    // ---------- ЭКРАНЫ ----------
    // Меню закрывается без затухания: под ним всё равно тут же встанет
    // мини-игра, а лишний переход — это ещё четверть секунды, в течение
    // которой игрок видит непонятно что.
    closeMenuBeforeMinigame() {
        if (window.SinsMenu) SinsMenu.closeInstant();
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
    }
};

// Железобетонный старт при загрузке документа
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GameManager.init());
} else {
    GameManager.init();
}
