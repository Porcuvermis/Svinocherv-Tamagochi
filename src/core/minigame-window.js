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
//
// ---------- НИ ОДНОГО СЛОВА ----------
// В окне нет букв (CLAUDE.md, инвариант 9). Где игрок — говорит эмодзи греха
// и цвет рамки; вопрос при выходе — два знака-ответа и шкала, которая на
// глазах опустошается: это и есть «прогресс не сохранится».
const MinigameWindow = {

    // Знаки ответов. Уход помечен тем же крестиком, который игрок только что
    // нажал: вопрос читается как «точно этот крестик?», а не как загадка.
    STAY_SIGN: '↩',
    LEAVE_SIGN: '✕',

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

        // Только эмодзи греха: название писать нечем и незачем — тот же
        // значок стоит в HUD, откуда игрок сюда и пришёл.
        const title = document.createElement('div');
        title.className = 'mg-title';
        title.textContent = options.title || (sin ? sin.emoji : '');

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mg-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'x');
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

        // Вопрос без слов: значок греха, под ним шкала, которая утекает в
        // ноль, и два ответа. Утекающая шкала — это «прогресс не
        // сохранится», сказанное движением, а не строкой.
        const confirm = document.createElement('div');
        confirm.className = 'mg-confirm';
        confirm.innerHTML = `
            <div class="mg-confirm-sign">
                <span class="mg-confirm-sin">${sin ? sin.emoji : '❓'}</span>
                <span class="mg-confirm-bar"><i></i></span>
            </div>
            <div class="mg-confirm-buttons">
                <button type="button" class="mg-confirm-btn stay">${this.STAY_SIGN}</button>
                <button type="button" class="mg-confirm-btn leave">${this.LEAVE_SIGN}</button>
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

    // ---------- КОМНАТА ПОД ОКНОМ ----------
    // Окно мини-игры непрозрачно и закрывает весь холст, но персонаж главного
    // экрана об этом не знает и продолжает анимироваться под ним. Рендерер сам
    // такое не ловит: по всем признакам сцена видима, её просто накрыли.
    //
    // На быстром телефоне это незаметно, на медленном — нет: в бою гнева под
    // окном крутится третий червь поверх двух бойцов. Поэтому мини-игра на
    // общем окне гасит комнату на входе и возвращает на выходе.
    pauseRoom() {
        const handle = window.MainWormHandle;
        if (handle && typeof handle.setPaused === 'function') handle.setPaused(true);
    },

    resumeRoom() {
        const handle = window.MainWormHandle;
        if (handle && typeof handle.setPaused === 'function') handle.setPaused(false);
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
