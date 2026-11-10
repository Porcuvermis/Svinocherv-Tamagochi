// ================= DEBUG-ПАНЕЛЬ АЛЧНОСТИ =================
// Видна при включённом DebugMode, пока на экране аппарат: в мини-игре и в
// превью 🐞 → «Аппарат». Не игра, слова здесь можно (инвариант 9 — о холсте).
//
// Здесь всё отладочное, что касается аппарата: колесо и пачинко «есть/нет»
// (вместе с покупкой первой ступени), вид каждой игры 1/2 (GreedSkin),
// эскиз версии 2 (GreedLuxPreview), последний бросок колеса.
// Было: шесть кнопок в общей панели, и каждая ПЕРЕЗАГРУЖАЛА игру
// (location.replace) — аппарат собирается один раз, и смена вида иначе не
// доходила. Игрок: «странно; пусть подгружается на глазах, это отладка».
// Теперь аппарат пересобирается на месте (rebuild ниже).
const GreedDebug = {
    panel: null,

    attach(container) {
        if (typeof DebugMode === 'undefined') return;
        const host = (container.closest && container.closest('.mg-body')) || container;
        if (!this.panel) {
            const p = document.createElement('div');
            p.id = 'gj-debug';
            p.style.cssText = 'position:absolute;left:6px;right:6px;top:6px;z-index:100002;display:flex;flex-wrap:wrap;gap:4px;' +
                'font:12px/1.2 sans-serif;pointer-events:auto';
            // пальцы панели не доходят до аппарата (рычаг, колесо, превью)
            p.addEventListener('pointerdown', (e) => e.stopPropagation());
            p.addEventListener('click', (e) => {
                e.stopPropagation();
                const act = e.target && e.target.getAttribute('data-act');
                if (act) this.run(act);
            });
            this.panel = p;
            DebugMode.onChange(() => this.render());
        }
        if (this.panel.parentElement !== host) host.appendChild(this.panel);
        this.render();
    },

    // колесо или пачинко: на аппарате ли (флажок 🐞) — и выдана ли ступень
    shown(key) { try { return localStorage.getItem(key) === '1'; } catch (e) { return false; } },

    run(act) {
        if (act === 'wheel' || act === 'pachinko') {
            const key = 'gj-' + act, ukey = 'greed_' + act, gkey = key + '-granted', on = !this.shown(key);
            try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* нет хранилища */ }
            // Включение выдаёт первую ступень (без неё бэкенд отказал бы
            // любой игре), выключение забирает — только выданную здесь.
            if (typeof GameState !== 'undefined' && GameState.data) {
                const up = GameState.data.upgrades || (GameState.data.upgrades = {});
                let granted = false;
                try { granted = localStorage.getItem(gkey) === '1'; } catch (e) { /* нет */ }
                if (on && !up[ukey]) { up[ukey] = 1; try { localStorage.setItem(gkey, '1'); } catch (e) { /* нет */ } }
                if (!on && granted) { up[ukey] = 0; try { localStorage.removeItem(gkey); } catch (e) { /* нет */ } }
                GameState.save();
            }
            return this.rebuild();
        }
        if (act.indexOf('skin-') === 0) {
            if (typeof GreedSkin !== 'undefined') GreedSkin.toggle(act.slice(5));
            return this.rebuild();
        }
        if (act === 'lux' && typeof GreedLuxPreview !== 'undefined') GreedLuxPreview.open();
    },

    // Пересборка аппарата на месте: снять со страницы (цикл кадров сам
    // встанет — холст отсоединён), вернуть объекту вид «как после
    // загрузки» и смонтировать заново с теми же крючками. Снимок полей
    // делается после загрузки всех файлов аппарата (низ этого файла):
    // GreedJunkLit копит холсты, программы видеокарты и кэши, которые
    // нельзя переносить на новый контекст.
    async rebuild() {
        const L = GreedJunkLit, host = L.wrapEl && L.wrapEl.parentElement;
        this.render();
        if (!host) return;
        if (L.gl) { const ext = L.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
        L.wrapEl.remove();
        const P = this.pristine, opts = L._opts;
        Object.keys(L).forEach(k => { if (!(k in P)) delete L[k]; });
        Object.keys(P).forEach(k => { L[k] = P[k]; });
        GreedJunk.pass = 'baked';
        if (typeof GreedMinigame !== 'undefined') GreedMinigame.play = { slots: null, wheel: null, pachinko: null };
        await L.mount(host, opts);
        if (L.meterSet && L.meterValue) L.meterSet(L.meterValue());
        this.render();
    },

    render() {
        if (!this.panel) return;
        this.panel.style.display = DebugMode.enabled ? 'flex' : 'none';
        if (!DebugMode.enabled) return;
        const skin = (g) => typeof GreedSkin !== 'undefined' ? GreedSkin.of(g) : 1;
        let wl = '';
        const L = typeof GreedJunkLit !== 'undefined' ? GreedJunkLit : null;
        if (L && L.wheelLast && L.WHEEL_SPIN) {
            const W = L.wheelLast, why = { play: 'играет', weak: 'слабо', held: 'палец замер', refused: 'отказ' }[W.why] || W.why;
            wl = ` · ${Math.abs(W.w * 1000).toFixed(1)}/${(L.WHEEL_SPIN.minW * 1000).toFixed(1)} ${why}`;
        }
        const err = (k) => L && L[k] ? ' ✗ ' + L[k] : '';
        const btn = (act, text) => `<button data-act="${act}" style="padding:6px 8px;border-radius:6px;border:1px solid #888;background:#222;color:#eee">${text}</button>`;
        this.panel.innerHTML =
            btn('wheel', 'Колесо: ' + (this.shown('gj-wheel') ? 'есть' : 'нет') + err('wheelError') + wl) +
            btn('pachinko', 'Пачинко: ' + (this.shown('gj-pachinko') ? 'есть' : 'нет') + err('pachError')) +
            btn('skin-slots', 'Бандит: вид ' + skin('slots')) +
            btn('skin-wheel', 'Колесо: вид ' + skin('wheel')) +
            btn('skin-pachinko', 'Пачинко: вид ' + skin('pachinko')) +
            btn('lux', 'Эскиз v2');
        this.placeBelowInspector();
    },

    // Инспектор персонажа (#wi-panel) в debug-режиме висит поверх всего у
    // верхнего края и забирал тапы у первой строки — как у панели похоти
    // (lust-debug.js): панель встаёт ПОД ним, отступ меряется (инспектор —
    // в точках экрана, панель — в единицах холста, перевод — масштаб).
    placeBelowInspector() {
        const wi = document.getElementById('wi-panel'), base = this.panel.offsetParent;
        let top = 6;
        if (wi && getComputedStyle(wi).display !== 'none' && base) {
            const w = wi.getBoundingClientRect(), h = base.getBoundingClientRect();
            const k = h.width / (base.offsetWidth || h.width) || 1;
            top = Math.max(6, (w.bottom - h.top) / k + 4);
        }
        this.panel.style.top = top.toFixed(0) + 'px';
    }
};

// Крючок в mount: запомнить крючки игры (для пересборки) и повесить
// панель туда, где аппарат (окно мини-игры или превью).
(function () {
    const mount = GreedJunkLit.mount;
    GreedJunkLit.mount = function (container, opts) {
        this._opts = opts;
        GreedDebug.attach(container);
        return mount.call(this, container, opts);
    };
    // снимок полей «как после загрузки» — для пересборки на месте
    GreedDebug.pristine = Object.assign({}, GreedJunkLit);
})();
