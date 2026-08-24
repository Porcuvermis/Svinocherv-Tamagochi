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
            <button data-act="reset">Сброс</button>
        `;
        this.panel.addEventListener('click', (e) => {
            const act = e.target && e.target.getAttribute('data-act');
            if (!act) return;
            e.stopPropagation();
            this.run(act);
        });

        const container = document.getElementById('game-container') || document.body;
        container.appendChild(this.panel);

        DebugMode.onChange(() => this.render());
        this.render();
    },

    run(act) {
        if (!GameState.data) return;

        if (act === 'hour' || act === 'shift') {
            const hours = act === 'hour' ? 1 : 8;
            Object.keys(GameState.data.sins).forEach(key => {
                GameState.data.sins[key].updated_at -= hours * 3600 * 1000;
            });
        } else if (act === 'fill') {
            Object.keys(GameState.data.sins).forEach(key => {
                GameState.setSinValue(key, GameState.maxValue(key));
            });
        } else if (act === 'reset') {
            if (!confirm('Стереть весь прогресс: шкалы, кошелёк, счётчики?')) return;
            GameState.reset();
        }

        GameState.save();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
    },

    render() {
        if (this.panel) this.panel.classList.toggle('visible', DebugMode.enabled);
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

function initDebugModules() {
    DebugMode.init();
    DebugState.init();
    DebugTiming.init(DebugState.panel);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDebugModules());
} else {
    initDebugModules();
}
