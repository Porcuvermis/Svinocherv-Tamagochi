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

        if (options.skin) this.wearSkin(handle, options.skin);

        closeBtn.onclick = (e) => { e.stopPropagation(); handle.requestClose(); };
        confirm.querySelector('.stay').onclick = (e) => { e.stopPropagation(); handle.hideConfirm(); };
        confirm.querySelector('.leave').onclick = (e) => { e.stopPropagation(); handle.leave(); };

        screenEl._mgWindow = handle;
        return handle;
    },

    // ---------- ШКУРКА: РАМКА ИЗ МАТЕРИАЛА ГРЕХА ----------
    // Цель для всех семи игр (CLAUDE.md, инвариант 8; docs/plan/
    // 25-lust-foam-transition.md): рамка не плоская полоска цветом греха, а
    // его материал — у похоти пена, — и крестик выложен этим же материалом.
    // Окно даёт механизм, шкурка — только вид:
    //   skin.rim   { side, top } — толщина боков и верха, единицы холста;
    //   skin.cross { x, y, size } — где нарисован крестик (сюда ляжет зона
    //              нажатия, сама кнопка становится невидимой);
    //   skin.draw(ctx, scale) — нарисовать рамку на холсте 390×844;
    //   skin.bg    — цвет фона окна под рамкой (необязательно).
    //
    // Под рамку ничего не уходит: тело окна УМЕНЬШАЕТСЯ css-масштабом и
    // встаёт во внутренний прямоугольник. Раскладка игры внутри остаётся
    // прежней (390×800), касания переводятся через CTM (SvgSpace) и масштаб
    // переживают — координат в мини-игре переписывать не надо. Низ рамки
    // не задаётся, а выходит сам: что осталось под уменьшенной сценой.
    TITLE_H: 44,

    skinGeometry(skin) {
        const R = skin.rim, bodyH = STAGE_H - this.TITLE_H;
        const k = (STAGE_W - 2 * R.side) / STAGE_W;
        const inner = { x0: R.side, y0: R.top, x1: STAGE_W - R.side, y1: R.top + bodyH * k };
        return { k, inner, bottom: STAGE_H - inner.y1 };
    },

    wearSkin(handle, skin) {
        const G = this.skinGeometry(skin);
        handle.screen.classList.add('mg-skin');
        handle.skin = skin;
        // Фон окна под рамкой — цвет материала: точка у края, где пузыря не
        // хватило, не должна светиться тёмным.
        if (skin.bg) handle.frame.style.background = skin.bg;
        const b = handle.body.style;
        b.transformOrigin = '0 0';
        b.transform = `translate(${G.inner.x0}px, ${(G.inner.y0 - this.TITLE_H).toFixed(2)}px) scale(${G.k.toFixed(4)})`;

        const cv = document.createElement('canvas');
        cv.className = 'mg-rim';
        handle.frame.insertBefore(cv, handle.confirmEl);
        handle.rimEl = cv;

        // Зона нажатия — квадрат нарисованного крестика с запасом: в пузыри
        // пальцем не целятся.
        const C = skin.cross, hit = Math.max(48, C.size + 12);
        const btn = handle.frame.querySelector('.mg-close');
        Object.assign(btn.style, { left: (C.x - hit / 2) + 'px', top: (C.y - hit / 2) + 'px',
                                   width: hit + 'px', height: hit + 'px' });

        // Рамка рисуется при первом показе, а не при сборке окна: окна
        // собираются на старте игры, и тысяча пузырей там ни к чему.
        // Перерисовка — только если разрешение холста поменялось (повернули
        // телефон, другой масштаб сцены).
        handle.ensureSkin = () => {
            const st = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-scale')) || 1;
            const scale = Math.min(2, (window.devicePixelRatio || 1) * st);
            if (handle._rimScale === scale) return;
            handle._rimScale = scale;
            cv.width = Math.round(STAGE_W * scale);
            cv.height = Math.round(STAGE_H * scale);
            const ctx = cv.getContext('2d');
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            skin.draw(ctx, scale);
        };
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

    // Раньше здесь возвращался верхний HUD со шкалами. HUD снят целиком:
    // грехи живут в своём меню, которое открывается удержанием пальца на
    // червя (src/core/sins-menu.js), и возвращать после мини-игры нечего.
    // Метод оставлен пустым: его зовут шесть игр из семи, и молчаливое
    // «ничего не делать» здесь лучше, чем шесть одинаковых правок.
    restoreHud() {}
};
