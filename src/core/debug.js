// ================= ГЛОБАЛЬНЫЙ DEBUG-РЕЖИМ =================
// Кнопка всегда поверх игры (в #game-container, вне любого .minigame-screen).
// Включает/выключает показ невидимых игровых зон (хитбоксов, драг-областей
// и т.п.) внутри мини-игр. Каждая мини-игра сама решает, что именно рисовать,
// проверяя DebugMode.enabled — этот модуль только хранит состояние и кнопку.
const DebugMode = {
    enabled: false,
    btn: null,
    listeners: [],

    init() {
        this.btn = document.getElementById('debug-toggle-btn');
        if (this.btn) {
            this.btn.onclick = (e) => {
                e.stopPropagation();
                this.toggle();
            };
        }
    },

    toggle() {
        this.enabled = !this.enabled;
        if (this.btn) this.btn.classList.toggle('active', this.enabled);
        document.body.classList.toggle('debug-mode', this.enabled);
        this.listeners.forEach(fn => {
            try { fn(this.enabled); } catch (err) { /* не роняем остальных подписчиков */ }
        });
    },

    // Мини-игры могут подписаться, чтобы сразу отреагировать на переключение
    // (например, спрятать debug-слой мгновенно, а не ждать следующего тика).
    onChange(fn) {
        this.listeners.push(fn);
    }
};

// ================= ПАНЕЛЬ СОСТОЯНИЯ (машина времени) =================
// Шкалы теперь падают за 8–48 часов реального времени. Это правильно для
// игры и невыносимо для проверки: чтобы своими глазами увидеть голодного
// червя, пришлось бы ждать до вечера.
//
// Поэтому в debug-режиме есть кнопки, отматывающие время назад. Отматывается
// не системное время, а метка последнего обновления шкал — тот самый
// updated_at, от которого считается всё остальное. То есть проверяется ровно
// тот механизм, который работает в реальной игре, а не его имитация.
const DebugState = {
    panel: null,

    init() {
        if (typeof GameState === 'undefined' || typeof DebugMode === 'undefined') return;

        this.panel = document.createElement('div');
        this.panel.id = 'debug-state-panel';
        this.panel.innerHTML = `
            <button data-act="hour">−1 ч</button>
            <button data-act="shift">−8 ч</button>
            <button data-act="fill">Полные</button>
            <button data-act="scar">Шрам</button>
            <button data-act="feed">Покормить</button>
            <button data-act="room">Комната</button>
            <button data-act="gear">Жетоны</button>
            <button data-act="kill">Уморить</button>
            <button data-act="revive">Оживить</button>
            <button data-act="reset">Сброс</button>
            <button data-act="fresh">Обновить</button>
            <button data-act="layers">Слои: всё</button>
            <button data-act="strip-filter">−фильтр</button>
            <button data-act="strip-clip">−обрезка</button>
            <button data-act="strip-grad">−градиенты</button>
            <button data-act="rec" class="dbg-rec">Самописец ●</button>
            <span id="debug-fps">— fps</span>
        `;
        this.panel.addEventListener('click', (e) => {
            const act = e.target && e.target.getAttribute('data-act');
            if (!act) return;
            e.stopPropagation();
            this.run(act);
        });

        const container = document.getElementById('game-container') || document.body;
        container.appendChild(this.panel);

        this.fpsEl = this.panel.querySelector('#debug-fps');

        DebugMode.onChange(() => this.render());
        this.render();
    },

    // ---------- СЧЁТЧИК КАДРОВ ----------
    // Чтобы разговор о плавности шёл числами, а не ощущениями: «стало хуже»
    // невозможно ни подтвердить, ни опровергнуть, а «было 58, стало 41» —
    // можно. Считает только когда debug включён: сам счётчик тоже стоит
    // кадров, пусть и немного.
    startFps() {
        if (this.fpsRaf) return;
        let frames = 0;
        let last = performance.now();
        const tick = (now) => {
            this.fpsRaf = requestAnimationFrame(tick);
            frames += 1;
            if (now - last < 1000) return;
            const fps = Math.round(frames * 1000 / (now - last));
            // Рядом с кадрами — сколько кучек на полу. Мелочь, но когда
            // «кучка не убирается», первым делом надо знать, сколько их на
            // самом деле: две в одной точке выглядят как одна.
            const poops = (typeof GameState !== 'undefined' && GameState.data && GameState.data.room)
                ? GameState.data.room.poops.length : 0;
            // Довольность и часы до смерти. По морде «доволен на 62%» не
            // прочитать, а баланс истощения крутится именно по этому числу.
            let mood = '';
            if (typeof WormCondition !== 'undefined' && GameState.data) {
                if (WormCondition.dead()) {
                    mood = ' · 💀';
                } else {
                    const left = WormCondition.hoursLeft();
                    mood = ' · 🙂' + Math.round(WormCondition.mood() * 100) + '%'
                         + (left === null ? '' : ' · ✝' + left.toFixed(1) + 'ч');
                }
            }
            // ---------- ГДЕ МЫ ЗАПУЩЕНЫ ----------
            // Внутри Telegram или как обычная страница, и работает ли отдача
            // в палец. Проверить это иначе нельзя вообще: тактильная отдача
            // не видна на экране, а «не вибрирует» может значить и «нет
            // моста», и «платформа не умеет», и «выключено в системе».
            // Debug-панель — единственное место игры, где слова разрешены
            // (инвариант 9).
            let host = '';
            if (typeof Haptics !== 'undefined') {
                const tg = !!Haptics.tg();
                const vib = (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');
                host = ' · ' + (tg ? 'TG' : 'web')
                     + '/' + (tg ? 'haptic' : vib ? 'vibro' : 'нем');
            }
            // Наклон телефона: на компьютере его нет вовсе, и проверить, ЖИВ
            // ли датчик на конкретном аппарате, иначе нечем — угол сам по
            // себе может быть нулём и при живом датчике. Поэтому здесь
            // источник, определённая единица и текущее значение.
            let tilt = '';
            if (typeof Tilt !== 'undefined') {
                const t = Tilt.info();
                tilt = ' · ' + (t.live ? (t.source + '/' + t.unit + ' ' + t.x) : 'наклона нет');
            }
            if (this.fpsEl) this.fpsEl.textContent = fps + ' fps · 💩' + poops + mood + host + tilt;
            frames = 0;
            last = now;
        };
        this.fpsRaf = requestAnimationFrame(tick);
    },

    stopFps() {
        if (!this.fpsRaf) return;
        cancelAnimationFrame(this.fpsRaf);
        this.fpsRaf = null;
        if (this.fpsEl) this.fpsEl.textContent = '— fps';
    },

    // ---------- ЧТО ИМЕННО ДОРОГО В САМОМ ПЕРСОНАЖЕ ----------
    // Три вещи заставляют браузер рисовать слой в ОТДЕЛЬНЫЙ буфер и потому
    // стоят кратно больше обычной заливки: фильтр (у нас это обесцвечивание
    // истощённого червя — надет на весь слой), обрезка с маской и градиенты
    // (тридцать пять радиальных).
    //
    // Каждая — СВОЯ кнопка, а не шаг общего переключателя: сравнивать надо
    // «как есть» против одного подозреваемого, а не листать до нужного через
    // остальные.
    //
    // Снятое ВОЗВРАЩАЕТСЯ: исходное значение атрибута кладётся на сам узел, и
    // повторное нажатие ставит его обратно. Иначе замер — дорога в один
    // конец, и на каждую проверку надо переоткрывать мини-игру.
    stripWorm(kind, on) {
        const attr = { filter: ['filter'], clip: ['clip-path', 'mask'], grad: ['fill', 'stroke'] }[kind];
        if (!attr) return;
        const roots = document.querySelectorAll(
            '#worm-stage svg, .worm-char-layer svg, .bt-worm-host svg, .worm-stage svg');
        roots.forEach(svg => {
            const nodes = [svg].concat(Array.from(svg.querySelectorAll('*')));
            nodes.forEach(n => {
                attr.forEach(a => {
                    const key = '__dbg_' + a;
                    if (on) {
                        const v = n.getAttribute(a);
                        if (!v) return;
                        // Градиенты снимаются только там, где они есть:
                        // ссылкой url(...). Плоские цвета трогать незачем.
                        if (kind === 'grad' && v.indexOf('url(') !== 0) return;
                        if (n[key] === undefined) n[key] = v;
                        if (kind === 'grad') n.setAttribute(a, a === 'fill' ? '#b08878' : '#3a2a24');
                        else n.removeAttribute(a);
                    } else if (n[key] !== undefined) {
                        n.setAttribute(a, n[key]);
                        delete n[key];
                    }
                });
            });
        });
    },

    // Остановить всех живых червей на экране. Список знает про мини-игры
    // поимённо, и для debug-инструмента это нормально: он и существует, чтобы
    // лезть туда, куда игре лезть незачем. Незнакомая игра просто не найдётся.
    freezeWorms(stop) {
        const handles = [
            window.MainWormHandle,
            (typeof LustMinigame !== 'undefined') ? LustMinigame.wormHandle : null,
            (typeof PrideMinigame !== 'undefined') ? PrideMinigame.wormHandle : null,
            (typeof GluttonyMinigame !== 'undefined') ? GluttonyMinigame.wormHandle : null
        ];
        handles.forEach(h => {
            if (h && typeof h.setPaused === 'function') h.setPaused(!!stop);
        });
    },

    run(act) {
        // ---------- ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ СБОРКИ ----------
        // Нужно ровно там, где нет ни адресной строки, ни devtools: внутри
        // Telegram. Клиент кеширует страницу мини-приложения сам, поверх
        // этого лежит наш service worker, и «закрыть и открыть заново» может
        // не помочь ни разу — игрок видит вчерашний код и чинит уже
        // починенное.
        //
        // Поэтому сносится ВСЁ: регистрации service worker, все кеши, а
        // сама страница перезагружается с новым параметром в адресе —
        // иначе её отдаст http-кеш клиента. Прогресс не трогается: он в
        // localStorage, а не в кешах.
        //
        // Идёт до проверки состояния: обновляться нужно и тогда, когда игра
        // не поднялась.
        // ---------- ГАШЕНИЕ СЛОЁВ: ПРОФИЛЬ БЕЗ ПРОФАЙЛЕРА ----------
        // Единственный способ понять, ЧТО именно жрёт кадры на телефоне.
        // Devtools к нему не подключить, а замер на компьютере врёт: там
        // другой движок и другая отрисовка (в ванной размытие стоило семи
        // кадров из восьми, а дождь — трёх десятых; на айфоне расклад
        // оказался иным).
        //
        // Кнопка гасит слои по одному, рядом живой счётчик кадров: снял
        // число — нажал ещё раз. Классы вешаются на <html>, правила лежат
        // рядом с самой сценой (пример — lust.css).
        // Самописец: старт через три секунды, стоп — той же кнопкой
        // (src/core/flight-recorder.js, интерфейс — DebugRecorder ниже).
        if (act === 'rec') {
            if (typeof FlightRecorder !== 'undefined') FlightRecorder.toggle();
            return;
        }

        if (act === 'layers') {
            // «Червь замер» — не гашение, а ОСТАНОВКА: персонаж на месте и
            // виден, но кадры по нему не идут. Этим режимом разделяются две
            // совершенно разные беды, которые снаружи выглядят одинаково:
            // дорого ПЕРЕСЧИТЫВАТЬ его каждый кадр или дорого РИСОВАТЬ его
            // вообще. Замер на телефоне: погас — 60, замер — 24 → чинить
            // надо картинку; замер — 60 → чинить частоту.
            // «Мыло замерло» — то же разделение для живого волшебного флакона:
            // дорого его перерисовывать каждый кадр или дорого рисовать вообще.
            const modes = ['всё', 'без дождя', 'без червя', 'без следа', 'без сцены',
                           'без неба во флаконе', 'без убранства флакона', 'мыло замерло',
                           'червь замер', 'только фон'];
            const classes = ['', 'dbg-no-rain', 'dbg-no-worm', 'dbg-no-trail', 'dbg-no-scene',
                             'dbg-no-sky', 'dbg-no-decor', '',
                             '', 'dbg-no-rain dbg-no-worm dbg-no-trail'];
            this.layerMode = ((this.layerMode || 0) + 1) % modes.length;
            const root = document.documentElement;
            classes.join(' ').split(' ').filter(Boolean)
                .forEach(c => root.classList.remove(c));
            classes[this.layerMode].split(' ').filter(Boolean)
                .forEach(c => root.classList.add(c));
            this.freezeWorms(modes[this.layerMode] === 'червь замер');
            if (typeof BATH_SOAP !== 'undefined') BATH_SOAP.frozen = modes[this.layerMode] === 'мыло замерло';
            const btn = this.panel && this.panel.querySelector('[data-act="layers"]');
            if (btn) btn.textContent = 'Слои: ' + modes[this.layerMode];
            return;
        }

        if (act.indexOf('strip-') === 0) {
            const kind = act.slice(6);
            if (!this.strip) this.strip = {};
            this.strip[kind] = !this.strip[kind];
            this.stripWorm(kind, this.strip[kind]);
            const btn = this.panel && this.panel.querySelector('[data-act="' + act + '"]');
            const label = { filter: 'фильтр', clip: 'обрезка', grad: 'градиенты' }[kind];
            if (btn) btn.textContent = (this.strip[kind] ? '+' : '−') + label;
            return;
        }

        if (act === 'fresh') {
            const reload = () => {
                const url = location.pathname + '?fresh=' + Date.now() + location.hash;
                location.replace(url);
            };
            const kill = navigator.serviceWorker
                ? navigator.serviceWorker.getRegistrations()
                    .then(regs => Promise.all(regs.map(r => r.unregister())))
                    .catch(() => {})
                : Promise.resolve();
            kill.then(() => (window.caches ? caches.keys() : []))
                .then(keys => Promise.all(Array.from(keys || []).map(k => caches.delete(k))))
                .catch(() => {})
                .then(reload, reload);
            return;
        }

        if (!GameState.data) return;

        // Жетоны гнева. Честный источник — победы в бою (осколок за победу,
        // три осколка = жетон), но копить их ради проверки магазина долго.
        // Выдаётся через Backend, а не записью в состояние: когда появится
        // рогалик, он пойдёт тем же путём.
        if (act === 'gear') {
            Backend.grantCurrency('wrath_token', 5);
            Backend.grantCurrency('gold', 100);
            if (typeof WrathLobby !== 'undefined' && WrathLobby.root) WrathLobby.refresh();
            if (typeof WrathShop !== 'undefined' && WrathShop.root) WrathShop.render();
            this.render();
            return;
        }

        if (act === 'hour' || act === 'shift') {
            const hours = act === 'hour' ? 1 : 8;
            Object.keys(GameState.data.sins).forEach(key => {
                const sin = GameState.data.sins[key];
                sin.updated_at -= hours * 3600 * 1000;
                // Таймер награды (у похоти) отматывается вместе со шкалой:
                // иначе «−8 ч» опустошало бы шкалу, а награда так и стояла бы
                // закрытой.
                if (sin.paid_at != null) sin.paid_at -= hours * 3600 * 1000;
            });
            // Пищеварение отматывается вместе со шкалами: цикл длиной в час,
            // и ждать его вживую ради проверки — то же самое, что ждать
            // падения шкал.
            if (GameState.data.digestion && GameState.data.digestion.fed_at) {
                GameState.data.digestion.fed_at -= hours * 3600 * 1000;
            }
        } else if (act === 'feed') {
            Backend.feed();
        } else if (act === 'fill') {
            Object.keys(GameState.data.sins).forEach(key => {
                GameState.setSinValue(key, GameState.maxValue(key));
            });
        } else if (act === 'scar') {
            // Шрамы выпадают за поражения в гневе с шансом 30% — ждать их
            // ради проверки внешнего вида бессмысленно. Выдаём через ту же
            // дверь, что и игра: правила отметин живут в Backend.
            const mark = Backend.grantMark();
            if (!mark) {
                alert('Свободного места под шрам не осталось.');
                return;
            }
            if (typeof refreshWormMarks === 'function') refreshWormMarks();
        } else if (act === 'room') {
            // Перебор локаций по кругу. Пока она одна и кнопка ничего не
            // меняет — это нормально: она проверяет саму механику смены, и
            // станет рабочей ровно в тот момент, когда в rooms.js добавят
            // вторую запись, без единой правки здесь.
            if (typeof RoomLocations === 'undefined') return;
            const keys = RoomLocations.keys();
            const cur = GameState.data.room.location;
            const next = keys[(Math.max(0, keys.indexOf(cur)) + 1) % keys.length];
            Backend.setLocation(next);
            if (MainWormHandle && MainWormHandle.setLocation) MainWormHandle.setLocation(next);
        } else if (act === 'kill') {
            // Смерть наступает через сутки ПОСЛЕ обнуления последней шкалы,
            // то есть вживую её ждать трое суток. Обнуляем всё и отматываем
            // метки на срок смерти с запасом — проверяется ровно тот же
            // механизм, что работает в игре, просто из другой точки времени.
            const back = (ECONOMY.condition.deathAfterHours + 1) * 3600 * 1000;
            Object.keys(GameState.data.sins).forEach(key => {
                GameState.setSinValue(key, 0);
                GameState.data.sins[key].updated_at -= back;
            });
            // Прошлое воскрешение держало бы отсчёт голодания: без этого
            // кнопка не сработала бы вторым нажатием подряд.
            GameState.data.worm.revived_at = null;
        } else if (act === 'revive') {
            Backend.revive();
        } else if (act === 'reset') {
            if (!confirm('Стереть весь прогресс: шкалы, кошелёк, счётчики?')) return;
            GameState.reset();
            if (typeof refreshWormMarks === 'function') refreshWormMarks();
        }

        GameState.save();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
    },

    render() {
        if (this.panel) this.panel.classList.toggle('visible', DebugMode.enabled);
        if (DebugMode.enabled) this.startFps(); else this.stopFps();
    }
};

// ================= ЗАМЕР ЗАПУСКА =================
// Белая вспышка на старте видна глазами, но по ней невозможно понять, чья
// она — страницы или системы. Отличить можно только числами, и числами
// именно С ТЕЛЕФОНА: на десктопе в браузере этой вспышки нет вовсе.
//
// Здесь собирается вся дорога от запуска до картинки:
//   sw     — сколько ушло на старт service worker'а до того, как он взялся
//            за запрос страницы (на телефоне он спит и его надо разбудить);
//   html   — когда страница пришла целиком;
//   кадр   — первая отрисовка (то есть когда экран стал чёрным);
//   пелена — когда она снялась и игра открылась.
//
// Читается так: если «кадр» — это единицы-десятки миллисекунд, страница
// невиновна, и белое показывает система ДО неё. Если сотни — виновата
// страница, и надо смотреть, что именно её держит.
const DebugTiming = {
    el: null,
    revealedAt: null,

    init(panel) {
        if (!panel) return;
        this.el = document.createElement('div');
        this.el.id = 'debug-timing';
        panel.appendChild(this.el);

        document.addEventListener('boot:revealed', () => {
            this.revealedAt = this.now();
            this.render();
        });

        this.render();
    },

    now() {
        return (window.performance && performance.now) ? Math.round(performance.now()) : null;
    },

    render() {
        if (!this.el) return;

        const ms = (v) => (v == null || v < 0) ? '—' : Math.round(v) + '';
        const nav = (window.performance && performance.getEntriesByType)
            ? performance.getEntriesByType('navigation')[0]
            : null;

        const paint = (window.performance && performance.getEntriesByType)
            ? performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')
            : null;

        // workerStart — момент, когда за запрос взялся service worker. Ноль
        // означает, что запрос через него не шёл вовсе.
        const sw = (nav && nav.workerStart) ? (nav.responseStart - nav.workerStart) : null;
        const wake = (nav && nav.workerStart) ? nav.workerStart : null;

        // transferSize = 0 — ответ пришёл не из сети (кеш service worker'а
        // или HTTP-кеш браузера).
        const source = nav ? (nav.transferSize === 0 ? 'из кеша' : 'из сети') : '';

        // Первый показанный кадр — из отметки, поставленной инлайном в
        // <head>: браузерная метрика тут не годится (см. комментарий там).
        const firstFrame = (window.__bootMarks || {}).firstFrame;

        // Тип навигации: 'reload' означает, что этот запуск уже был
        // перезагружен под новую сборку, и числа относятся ко второму
        // заходу, а не к тому, что игрок увидел при открытии иконки.
        const kind = nav ? nav.type : '';

        this.el.textContent =
            kind + ' · sw: старт ' + ms(wake) + ', ответ ' + ms(sw) +
            ' · html ' + ms(nav && nav.responseEnd) +
            ' · чёрный кадр ' + ms(firstFrame) +
            ' · fcp ' + ms(paint && paint.startTime) +
            ' · пелена ' + ms(this.revealedAt) +
            ' мс · ' + source;
    }
};

// ================= САМОПИСЕЦ: КНОПКА И ОКОШКО ОТЧЁТА =================
// Запись делает src/core/flight-recorder.js, здесь только то, чем игрок её
// включает и как забирает отчёт.
//
// ---------- КАК ПОЛЬЗОВАТЬСЯ (айфон, Telegram) ----------
// 🐞 → «Самописец ●» → три секунды на то, чтобы закрыть debug (🐞) и
// встать к месту беды → 12 секунд записи → окошко с отчётом сам собой →
// «Копировать» → вставить в чат. Остановить раньше — 🐞 и та же кнопка.
// Пока идёт запись, кнопка 🐞 обведена красным: видно и при выключенном
// debug, а сама обводка неподвижна и кадров не стоит.
//
// ---------- ПОЧЕМУ ОКОШКО В ХОЛСТЕ ----------
// Оно лежит ВНУТРИ #game-container, в единицах холста (инвариант 11; образец
// — студия): в <body> оно верстается в пикселях экрана, а их в Telegram на
// айфоне меньше, чем единиц холста, — кнопки вышли бы мельче пальца. Холст
// уже стоит в безопасной области, поэтому под шапку Telegram окошко не
// заезжает и своих отступов от чёлки ему не нужно.
//
// ---------- ПОЧЕМУ КОПИРОВАНИЕ ДВУМЯ ПУТЯМИ ----------
// navigator.clipboard во вебвью Telegram на iOS бывает недоступен или
// отказывает. Тогда — старый путь: выделить текст и execCommand('copy'). Не
// вышло и так — текст остаётся ВЫДЕЛЕННЫМ, и его можно скопировать из
// системного меню долгим нажатием.
const DebugRecorder = {
    btn: null,
    root: null,
    prev: 'off',
    labelTimer: 0,

    init(panel) {
        if (typeof FlightRecorder === 'undefined' || !panel) return;
        this.btn = panel.querySelector('[data-act="rec"]');
        FlightRecorder.onChange((state) => this.onState(state));
    },

    onState(state) {
        const was = this.prev;
        this.prev = state;
        const bug = document.getElementById('debug-toggle-btn');
        if (bug) bug.classList.toggle('rec', state !== 'off');
        if (this.btn) this.btn.classList.toggle('on', state !== 'off');
        // Обратный отсчёт на кнопке — таймер ТОЛЬКО для надписи и только
        // пока запись взведена или идёт.
        clearInterval(this.labelTimer);
        this.labelTimer = 0;
        this.label();
        if (state !== 'off') this.labelTimer = setInterval(() => this.label(), 500);
        if (was === 'rec' && state === 'off') this.show(FlightRecorder.last);
    },

    label() {
        if (!this.btn) return;
        const st = FlightRecorder.state, sec = Math.ceil(FlightRecorder.remaining() / 1000);
        this.btn.textContent = st === 'armed' ? 'Самописец: старт через ' + sec
                             : st === 'rec' ? 'Самописец ■ ' + sec + ' с'
                             : 'Самописец ●';
    },

    build() {
        const host = document.getElementById('game-container') || document.body;
        const root = document.createElement('div');
        root.id = 'fr-root';
        root.innerHTML = `
            <div class="fr-card">
                <div class="fr-top">
                    <span class="fr-title"></span>
                    <button class="fr-x" data-fr="close" aria-label="Закрыть">✕</button>
                </div>
                <textarea class="fr-text" readonly spellcheck="false"></textarea>
                <div class="fr-status"></div>
                <div class="fr-row">
                    <button data-fr="copy">Копировать</button>
                    <button data-fr="close">Закрыть</button>
                </div>
            </div>`;
        // Пальцы окошка не доходят до сцены под ним: тап по «Копировать»
        // иначе заодно брал бы мыло с полки.
        ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown'].forEach(ev =>
            root.addEventListener(ev, (e) => e.stopPropagation()));
        root.addEventListener('click', (e) => {
            e.stopPropagation();
            const act = e.target && e.target.getAttribute('data-fr');
            if (act === 'copy') this.copy();
            else if (act === 'close') this.close();
        });
        host.appendChild(root);
        this.root = root;
        this.ta = root.querySelector('.fr-text');
        this.status = root.querySelector('.fr-status');
        return root;
    },

    show(text) {
        const root = this.root || this.build();
        const lines = (text || '').split('\n');
        const frames = (/кадров (\d+)/.exec(text || '') || [])[1] || '0';
        root.querySelector('.fr-title').textContent =
            'Самописец · ' + frames + ' кадров · ' + Math.round((text || '').length / 100) / 10 + ' тыс. знаков';
        this.ta.value = text || '';
        this.ta.scrollTop = 0;
        this.status.textContent = lines.length + ' строк. «Копировать» — и вставить в чат.';
        root.classList.add('open');
        // Панель инспектора живёт в <body> поверх всего и накрывала шапку
        // окошка вместе с крестиком (тап уходил инспектору).
        document.body.classList.add('fr-on');
    },

    close() {
        if (this.root) this.root.classList.remove('open');
        document.body.classList.remove('fr-on');
    },

    copy() {
        const text = this.ta ? this.ta.value : '';
        const done = (how) => { this.status.textContent = 'Скопировано (' + how + '). Вставьте в чат.'; };
        const fallback = () => {
            let ok = false;
            try {
                // Выделение у textarea только для чтения на iOS работает
                // через setSelectionRange, а не select().
                this.ta.focus();
                this.ta.select();
                this.ta.setSelectionRange(0, text.length);
                ok = document.execCommand && document.execCommand('copy');
            } catch (err) { ok = false; }
            if (ok) done('выделением');
            else this.status.textContent = 'Не вышло скопировать само: текст выделен — долгое нажатие → «Скопировать».';
        };
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(text).then(() => done('буфер'), fallback);
                return;
            }
        } catch (err) { /* нет доступа к буферу — старым путём */ }
        fallback();
    }
};

function initDebugModules() {
    DebugMode.init();
    DebugState.init();
    DebugTiming.init(DebugState.panel);
    DebugRecorder.init(DebugState.panel);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDebugModules());
} else {
    initDebugModules();
}
