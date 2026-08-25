// ================= ОКНО МИНИ-ИГРЫ: ОДНА СБОРКА НА ВСЕ ГРЕХИ =================
// Рамка, заголовок, крестик и вопрос «выйти?» собираются здесь, а не в
// разметке каждой игры. В index.html у мини-игры лежит только её
// содержимое — окно вокруг него надевается этим модулем.
//
// ---------- ПОЧЕМУ СБОРКОЙ, А НЕ РАЗМЕТКОЙ ----------
// Раньше окно у каждой игры было своё: свои классы, свой крестик, свои
// размеры карточки, у кого-то вопрос при выходе, у кого-то нет. Семь копий
// одного и того же расходятся всегда — и разошлись. Скопировать разметку
// «как у соседа» в новую игру дешевле, чем сделать правильно, поэтому
// правильное должно быть тем, что происходит само.
//
// Отсюда правило: мини-игра НЕ рисует крестик и НЕ пишет текст вопроса.
// Она говорит, какой это грех, что делать при выходе и можно ли выйти без
// вопроса — остальное одинаково у всех.
//
// Пример:
//
//   this.win = MinigameWindow.attach(this.screenElement, {
//       sin: 'wrath',
//       onLeave: () => this.close(),
//       canLeave: () => this.fightOver   // бой кончился — спрашивать не о чем
//   });
//
// Цвет рамки берётся из ECONOMY.sins[грех].color — того же места, откуда
// красится кружок в HUD. Отдельного списка цветов окон нет и не будет.
const MinigameWindow = {

    CONFIRM_TEXT: 'Выйти из мини-игры? Прогресс не сохранится.',
    STAY_TEXT: 'Остаться',
    LEAVE_TEXT: 'Выйти',

    // Возвращает хэндл окна. Повторный вызов на том же экране ничего не
    // пересобирает: init() у мини-игр вызывается не всегда один раз.
    attach(screenEl, opts) {
        if (!screenEl) return null;
        if (screenEl._mgWindow) return screenEl._mgWindow;

        const options = opts || {};
        const sinKey = options.sin || screenEl.dataset.sin || null;
        const sin = (sinKey && typeof ECONOMY !== 'undefined') ? ECONOMY.sins[sinKey] : null;

        screenEl.classList.add('minigame-screen', 'mg-window');
        if (sin) {
            screenEl.style.setProperty('--mg-accent', sin.color);
        }

        const frame = document.createElement('div');
        frame.className = 'mg-frame';

        const titlebar = document.createElement('div');
        titlebar.className = 'mg-titlebar';

        const title = document.createElement('div');
        title.className = 'mg-title';
        title.textContent = options.title || (sin ? `${sin.emoji} ${sin.name}` : '');

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mg-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Закрыть');
        closeBtn.innerHTML = '&times;';

        titlebar.appendChild(title);
        titlebar.appendChild(closeBtn);

        // Содержимое игры переезжает в тело рамки целиком, вместе с уже
        // навешанными обработчиками: узлы переносятся, а не пересоздаются.
        const body = document.createElement('div');
        body.className = 'mg-body';
        while (screenEl.firstChild) {
            body.appendChild(screenEl.firstChild);
        }

        const confirm = document.createElement('div');
        confirm.className = 'mg-confirm';
        confirm.innerHTML = `
            <div class="mg-confirm-text">${options.confirmText || this.CONFIRM_TEXT}</div>
            <div class="mg-confirm-buttons">
                <button type="button" class="mg-confirm-btn stay">${this.STAY_TEXT}</button>
                <button type="button" class="mg-confirm-btn leave">${this.LEAVE_TEXT}</button>
            </div>
        `;

        frame.appendChild(titlebar);
        frame.appendChild(body);
        frame.appendChild(confirm);
        screenEl.appendChild(frame);

        const handle = {
            screen: screenEl,
            frame,
            body,
            titleEl: title,
            confirmEl: confirm,

            // Нажали крестик. Спрашивать или нет — решает сама игра через
            // canLeave: посреди боя вопрос уместен, после его конца — нет.
            requestClose() {
                if (typeof options.canLeave === 'function' && options.canLeave()) {
                    this.leave();
                    return;
                }
                this.showConfirm();
            },

            leave() {
                this.hideConfirm();
                if (typeof options.onLeave === 'function') options.onLeave();
            },

            showConfirm() {
                if (typeof options.onConfirmShown === 'function') options.onConfirmShown();
                confirm.classList.add('show');
            },

            hideConfirm() {
                confirm.classList.remove('show');
            },

            isConfirmOpen() {
                return confirm.classList.contains('show');
            },

            setTitle(text) {
                title.textContent = text;
            }
        };

        closeBtn.onclick = (e) => { e.stopPropagation(); handle.requestClose(); };
        confirm.querySelector('.stay').onclick = (e) => { e.stopPropagation(); handle.hideConfirm(); };
        confirm.querySelector('.leave').onclick = (e) => { e.stopPropagation(); handle.leave(); };

        screenEl._mgWindow = handle;
        return handle;
    },

    // Вернуть верхний HUD после закрытия мини-игры. Раньше эти же семь
    // строк были скопированы в close() каждой игры.
    restoreHud() {
        const fullMenu = document.getElementById('full-menu');
        const miniHud = document.getElementById('mini-hud');
        if (fullMenu && !fullMenu.classList.contains('active') && miniHud) {
            miniHud.style.opacity = '1';
            miniHud.style.pointerEvents = 'auto';
        }
    }
};
