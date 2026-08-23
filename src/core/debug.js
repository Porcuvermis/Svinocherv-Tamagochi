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
            <button data-act="reset">Сброс</button>
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
            if (this.fpsEl) this.fpsEl.textContent = fps + ' fps · 💩' + poops;
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

    run(act) {
        if (!GameState.data) return;

        if (act === 'hour' || act === 'shift') {
            const hours = act === 'hour' ? 1 : 8;
            Object.keys(GameState.data.sins).forEach(key => {
                GameState.data.sins[key].updated_at -= hours * 3600 * 1000;
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
            const mark = Backend.grantMark('scar');
            if (!mark) {
                alert('Свободного места под шрам не осталось.');
                return;
            }
            if (typeof refreshWormMarks === 'function') refreshWormMarks();
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

function initDebugModules() {
    DebugMode.init();
    DebugState.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDebugModules());
} else {
    initDebugModules();
}
