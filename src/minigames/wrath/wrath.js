// ================= ГНЕВ: ВХОД И МАРШРУТ ПО ЭКРАНАМ =================
// Раньше этот файл БЫЛ мини-игрой «бой»: 600 строк, из них 145 — собственная
// отрисовка червя на canvas. Теперь гнев — это грех с несколькими экранами
// внутри одного окна, а бой лишь один из режимов.
//
//   лобби (wrath-lobby.js)  → бой с ботом (wrath-duel.js)
//                           → бой с игроком, рогалик, магазин — позже
//
// Здесь остаётся ровно маршрутизация: какой экран показан, кто монтируется и
// кто гасится при переходе. Разбор решения — docs/plan/09-wrath-rework.md.
//
// ---------- ПОЧЕМУ ГАСИТЬ ОБЯЗАТЕЛЬНО ----------
// На каждом экране живёт своя копия персонажа (в лобби одна, в бою две), а
// это SVG со своим кадровым циклом. Оставить смонтированным экран, который
// не видно, — это ровно та утечка кадров, что разбиралась в правке 29
// (docs/progress-log.md). Поэтому переход между экранами всегда парный:
// уходящий экран сносит своих персонажей, приходящий монтирует своих.

const WrathMinigame = {
    screenElement: null,
    win: null,          // хэндл общего окна мини-игры
    screens: null,
    current: null,      // 'lobby' | 'duel'

    init() {
        this.screenElement = document.getElementById('wrath-game');
        if (!this.screenElement) return;

        // Окно надевается ДО поиска остальных элементов: сборка переносит
        // содержимое экрана внутрь рамки.
        this.win = MinigameWindow.attach(this.screenElement, {
            sin: 'wrath',
            onLeave: () => this.close(),
            // Спрашиваем только там, где есть что терять. В лобби ничего не
            // происходит, и «прогресс не сохранится» было бы просто неправдой;
            // в бою вопрос уместен, после его конца — снова нет.
            canLeave: () => this.current !== 'duel' || WrathDuel.fightOver
        });

        this.screens = {
            lobby: document.getElementById('wrath-lobby'),
            duel: document.getElementById('wrath-duel'),
            shop: document.getElementById('wrath-shop'),
            boost: document.getElementById('wrath-boost'),
            rogue: document.getElementById('wrath-rogue')
        };

        WrathLobby.init(this);
        WrathDuel.init(this);
        WrathShop.init(this);
        WrathRogue.init(this);

        // ---------- УЗЕЛ ГНЕВА В КОЛЕСЕ ГРЕХОВ ----------
        // Читалка живёт рядом со своей мини-игрой (docs/sins-menu.md): что
        // считать готовностью, знает грех, а не колесо. У гнева порога голода
        // нет — за бой платят всегда, — поэтому мерой служит здоровье бойца.
        // Максимум считает WrathFighter: он единственный знает про снаряжение.
        if (typeof SinsMenu !== 'undefined' && typeof Backend !== 'undefined') {
            SinsMenu.readers.wrath = () => Backend.wrathReady(WrathFighter.playerHp().max);
        }
    },

    open() {
        if (!this.screenElement) this.init();
        if (!this.screenElement) return;
        if (this.win) this.win.hideConfirm();
        this.screenElement.classList.add('active');
        MinigameWindow.pauseRoom();
        this.showLobby();
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        // Часы здоровья в шапке — единственное, что тикает вне экранов, и
        // гасить их обязан тот, кто закрывает грех (CLAUDE.md: мини-игра
        // убирает за собой).
        WrathLobby.stopHeadClock();
        const head = document.getElementById('wrath-head');
        if (head) head.classList.remove('shown');
        const foot = document.getElementById('wrath-foot');
        if (foot) foot.classList.remove('shown');
        const back = document.getElementById('wrath-backdrop');
        if (back) { back.innerHTML = ''; delete back.dataset.screen; }
        WrathDuel.leave();
        WrathLobby.leave();
        WrathShop.leave();
        WrathRogue.leave();
        this.current = null;
        if (this.win) this.win.hideConfirm();
        MinigameWindow.resumeRoom();
        MinigameWindow.restoreHud();
    },

    // ---------- ЭКРАНЫ ----------
    showLobby() {
        WrathDuel.leave();
        WrathShop.leave();
        WrathRogue.leave();
        this.setScreen('lobby');
        WrathLobby.enter();
    },

    // Возврат на карту забега. Отдельно от startMode: бой забега уходит и
    // приходит сюда, а не в лобби, и экран карты при этом не сбрасывает
    // накопленное (итог забега, показанную награду).
    showRogue() {
        WrathDuel.leave();
        WrathLobby.leave();
        WrathShop.leave();
        this.setScreen('rogue');
        WrathRogue.enter();
    },

    // Бой узла забега. Экран боя один на все режимы: разница только в
    // заказе (docs/plan/10-wrath-rogue.md).
    startRogueFight(order) {
        this.setScreen('duel');
        WrathDuel.enter('rogue', order);
    },

    startMode(mode) {
        // БОЙ — это тоже МЕНЮ, а не действие. Кнопка режима открывает лобби
        // (свой боец, его снаряжение), а драться игрок идёт оттуда, отдельной
        // кнопкой. Раньше тап по ⚔️ бросал в бой сразу, и промах по соседней
        // кнопке стоил здоровья — а оно в гневе набирается минутами. Заодно
        // отпала кнопка «назад»: ряд режимов внизу и есть навигация, и лобби
        // в нём такой же пункт, как лавка.
        if (mode === 'duel') { this.showLobby(); return; }

        // Сносятся ВСЕ экраны, а не одно лобби. Пока режимы жили внутри
        // лобби, попасть сюда можно было только из него; теперь ряд режимов
        // стоит в общем подвале, и переход идёт напрямую — из лавки в забег,
        // из забега в лавку. Уходящий экран обязан убрать за собой в любом
        // случае, иначе на нём остаётся показанный отказ или итог прошлого
        // захода.
        WrathLobby.leave();
        WrathShop.leave();
        // Забег сносится ТОЖЕ, включая сам забег: кнопка режима — это
        // осознанный переход на экран, а не «оставь как было». Иначе тап по
        // 🗺 с показанного итога оставлял итог на месте, и кнопка под пальцем
        // оказывалась не той, на которую игрок смотрел (docs/traps.md, п. 94).
        // Возврат из боя идёт не сюда, а через showRogue() — там итог живёт.
        WrathRogue.leave();
        // Магазин и прокачка — такие же экраны греха, как бой, и живут в том
        // же окне.
        if (mode === 'shop') {
            this.setScreen('shop');
            WrathShop.enter();
            return;
        }
        if (mode === 'rogue') {
            this.setScreen('rogue');
            WrathRogue.enter();
            return;
        }
        // Всё остальное — режимы боя (бой с игроком, когда он появится).
        this.startFight(mode);
    },

    // Начать бой. Отдельный вход, а не ветка startMode: в бой попадают ровно
    // одним способом — кнопкой в лобби, и это единственное место в грехе,
    // откуда можно потерять здоровье.
    startFight(mode) {
        WrathLobby.leave();
        WrathShop.leave();
        WrathRogue.leave();
        this.setScreen('duel');
        WrathDuel.enter(mode || 'duel');
    },

    // ---------- ОБЩАЯ ШАПКА И ОБЩИЙ ПОДВАЛ ----------
    // Сверху — кто ты (здоровье, числа, кошелёк), снизу — куда пойти (режимы
    // и лавка). И то и другое одинаково в лобби, лавке, прокачке и на карте
    // забега, поэтому живёт одно на четыре экрана; между ними меняется только
    // содержимое.
    //
    // В БОЮ скрыто и то и другое: там своё здоровье и своя полоса, а чужая
    // рядом читалась бы как ещё один боец; уходить же посреди размена нельзя
    // вовсе, и ряд режимов внизу был бы приглашением это сделать.
    HEAD_SCREENS: ['lobby', 'shop', 'rogue'],

    setBackdrop(name) {
        const el = document.getElementById('wrath-backdrop');
        if (!el || typeof WrathBackdrop === 'undefined') return;
        if (el.dataset.screen === name) return;      // тот же экран — не пересобирать
        el.dataset.screen = name || '';
        el.innerHTML = WrathBackdrop.svg(name);
    },

    setScreen(name) {
        if (!this.screens) return;
        Object.keys(this.screens).forEach(key => {
            const el = this.screens[key];
            if (el) el.classList.toggle('active', key === name);
        });
        this.current = name;

        // Фон экрана. Собирается ЗАНОВО при каждом переходе и дальше не
        // трогается: пять статических слоёв, висящих одновременно, стоили бы
        // памяти и первой отрисовки на ровном месте, а закрытые мини-игры
        // уже однажды платили за свои украшения (docs/traps.md, пп. 36–38).
        this.setBackdrop(name);

        const shown = this.HEAD_SCREENS.indexOf(name) !== -1;
        const head = document.getElementById('wrath-head');
        const foot = document.getElementById('wrath-foot');
        if (head) head.classList.toggle('shown', shown);
        if (foot) {
            foot.classList.toggle('shown', shown);
            // Лобби — это меню БОЯ, поэтому горит ⚔️: отдельного пункта
            // «лобби» в ряду нет и заводить его незачем.
            const lit = name === 'lobby' ? 'duel' : name;
            foot.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.toggle('on', btn.dataset.mode === lit);
            });
        }
        // Содержимое шапки пересобирает лобби — оно знает про снаряжение и
        // кошелёк. Экранам под шапкой об этом знать незачем.
        if (shown) WrathLobby.refreshHead();
        else WrathLobby.stopHeadClock();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WrathMinigame.init());
} else {
    WrathMinigame.init();
}
