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
        WrathBoost.init(this);
        WrathRogue.init(this);
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
        WrathDuel.leave();
        WrathLobby.leave();
        WrathShop.leave();
        WrathBoost.leave();
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
        WrathBoost.leave();
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
        WrathBoost.leave();
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
        WrathLobby.leave();
        // Магазин и прокачка — такие же экраны греха, как бой, и живут в том
        // же окне.
        if (mode === 'shop') {
            this.setScreen('shop');
            WrathShop.enter();
            return;
        }
        if (mode === 'boost') {
            this.setScreen('boost');
            WrathBoost.enter();
            return;
        }
        if (mode === 'rogue') {
            this.setScreen('rogue');
            WrathRogue.enter();
            return;
        }
        this.setScreen('duel');
        WrathDuel.enter(mode);
    },

    setScreen(name) {
        if (!this.screens) return;
        Object.keys(this.screens).forEach(key => {
            const el = this.screens[key];
            if (el) el.classList.toggle('active', key === name);
        });
        this.current = name;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WrathMinigame.init());
} else {
    WrathMinigame.init();
}
