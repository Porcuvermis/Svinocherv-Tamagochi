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

        const go = () => { if (typeof options.onLeave === 'function') options.onLeave(); };
        const handle = {
            screen: screenEl,
            frame,
            body,
            titleEl: title,
            confirmEl: confirm,

            // Нажали крестик. Спрашивать или нет — решает сама игра через
            // canLeave: посреди боя вопрос уместен, после его конца — нет.
            // Посреди забега у окна со шкуркой вопроса нет: нажатия
            // считает покров (MgVeil.knock), каждое бросает на экран
            // материал греха, последнее — выход. Без покрова (окна без
            // шкурки, автотесты) — прежний вопрос.
            requestClose() {
                if (typeof options.canLeave === 'function' && options.canLeave()) {
                    this.leave();
                    return;
                }
                if (typeof MgVeil !== 'undefined' && MgVeil.skinOf(this) && MgVeil.enabled()) {
                    MgVeil.knock(this, go);
                    return;
                }
                this.showConfirm();
            },

            // Выход — через покров (src/core/mg-veil.js): у окна со шкуркой
            // рамка нарастает внутрь, игра закрывается под ней, покров уходит.
            // Без шкурки покров сразу зовёт onLeave, как раньше.
            leave() {
                this.hideConfirm();
                if (typeof MgVeil !== 'undefined') MgVeil.leave(this, go);
                else go();
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
    SKIN_DELAY: 2500,   // после сборки окна: стартовый экран успевает уйти
    SKIN_SLICE: 6,      // мс работы за раз — кадр комнаты не теряется

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

        // ---------- ЧЕТЫРЕ ПОЛОСЫ, А НЕ ХОЛСТ ВО ВЕСЬ ЭКРАН ----------
        // Рамка рисуется на холсте во весь экран (так шкурке проще), но на
        // экран выходит четырьмя полосами по краям: прозрачный слой во весь
        // экран смешивается со сценой КАЖДЫЙ КАДР, хотя пена занимает только
        // края. Замер на финале ванной (4× замедление): холст во весь экран —
        // 23 кадра, без него — 30. Ширину полос шкурка знает сама
        // (skin.reach() — как далеко рисунок заходит внутрь сцены).
        const rim = document.createElement('div');
        rim.className = 'mg-rim';
        handle.frame.insertBefore(rim, handle.confirmEl);
        handle.rimEl = rim;

        // Зона нажатия — квадрат нарисованного крестика с запасом: в пузыри
        // пальцем не целятся.
        const C = skin.cross, hit = Math.max(48, C.size + 12);
        const btn = handle.frame.querySelector('.mg-close');
        Object.assign(btn.style, { left: (C.x - hit / 2) + 'px', top: (C.y - hit / 2) + 'px',
                                   width: hit + 'px', height: hit + 'px' });

        // Тени css-фильтром (drop-shadow) у холста шкурки НЕТ и быть не
        // должно: браузер пересчитывает фильтр каждый кадр, пока под рамкой
        // что-то движется, — ванная теряла кадры (docs/traps.md, п. 164).
        // Тень шкурка печёт в свой холст сама.

        // ---------- КОГДА РИСУЕТСЯ ----------
        // Рамка из тысяч пузырей — это ~1 с работы под 4× замедлением
        // (замер на пене ванной). При входе в игру такая пауза стояла бы
        // перед первым кадром, на старте игры — дёрнула бы комнату. Поэтому
        // шкурка рисуется ГЕНЕРАТОРОМ (skin.drawGen) кусками по SKIN_SLICE мс
        // в простое, начиная через SKIN_DELAY после сборки окна. Открыли
        // игру раньше — ensureSkin() дорисовывает остаток сразу.
        // Перерисовка с нуля — только если разрешение холста поменялось
        // (повернули телефон, другой масштаб сцены).
        const blit = (full, scale) => {
            const I = G.inner, reach = skin.reach ? skin.reach() : STAGE_W;
            const y0 = I.y0 + reach, y1 = I.y1 - reach;
            const rects = [
                [0, 0, STAGE_W, y0], [0, y1, STAGE_W, STAGE_H],
                [0, y0, I.x0 + reach, y1], [I.x1 - reach, y0, STAGE_W, y1]
            ];
            rim.textContent = '';
            for (const [ux0, uy0, ux1, uy1] of rects) {
                // Края полос — по целым пикселям холста: иначе на стыке
                // полос пиксель делился бы надвое и шов был бы виден.
                const px0 = Math.max(0, Math.round(ux0 * scale)), py0 = Math.max(0, Math.round(uy0 * scale));
                const px1 = Math.min(full.width, Math.round(ux1 * scale)), py1 = Math.min(full.height, Math.round(uy1 * scale));
                if (px1 <= px0 || py1 <= py0) continue;
                const c = document.createElement('canvas');
                c.width = px1 - px0; c.height = py1 - py0;
                c.getContext('2d').drawImage(full, px0, py0, c.width, c.height, 0, 0, c.width, c.height);
                Object.assign(c.style, { left: px0 / scale + 'px', top: py0 / scale + 'px',
                                         width: c.width / scale + 'px', height: c.height / scale + 'px' });
                rim.appendChild(c);
            }
            full.width = full.height = 0;   // полноэкранный буфер больше не нужен
        };
        const begin = () => {
            const st = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-scale')) || 1;
            const scale = Math.min(2, (window.devicePixelRatio || 1) * st);
            if (handle._rimScale === scale) return;
            handle._rimScale = scale;
            const full = document.createElement('canvas');
            full.width = Math.round(STAGE_W * scale);
            full.height = Math.round(STAGE_H * scale);
            const ctx = full.getContext('2d');
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            const draw = skin.drawGen ? skin.drawGen(ctx, scale) : (function* () { skin.draw(ctx, scale); })();
            // Следом за рамкой — то, что шкурке нужно для перехода (у пены —
            // полная пена во весь экран), в том же простое.
            handle._skinJob = (function* () {
                yield* draw;
                blit(full, scale);
                if (skin.prepareGen) yield* skin.prepareGen(scale);
                if (typeof MgVeil !== 'undefined') MgVeil.prewarm(skin);
            })();
        };
        handle.ensureSkin = () => {
            begin();
            const job = handle._skinJob;
            handle._skinJob = null;
            if (job) for (const _ of job) { /* до конца */ }
        };
        const slice = () => {
            const job = handle._skinJob;
            if (!job) return;
            const t0 = performance.now();
            while (performance.now() - t0 < this.SKIN_SLICE) {
                if (job.next().done) { if (handle._skinJob === job) handle._skinJob = null; return; }
            }
            setTimeout(slice, 16);
        };
        setTimeout(() => { begin(); slice(); }, this.SKIN_DELAY);
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
