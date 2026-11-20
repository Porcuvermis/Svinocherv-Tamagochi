// ================= DEBUG-ПАНЕЛЬ АЛЧНОСТИ =================
// Видна при включённом DebugMode, пока на экране аппарат: в мини-игре и в
// превью 🐞 → «Аппарат». Не игра, слова здесь можно (инвариант 9 — о холсте).
//
// Здесь всё отладочное, что касается аппарата: колесо и пачинко «есть/нет»
// (вместе с покупкой первой ступени), вид аппарата 1/2 (GreedSkin: версия 2
// — весь аппарат, greed-lux.js), последний бросок колеса.
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
        // вид аппарата целиком: версия 2 — весь аппарат разом (план 31, разд. 00)
        if (act === 'skin') {
            if (typeof GreedSkin !== 'undefined') GreedSkin.toggle('slots');
            return this.rebuild();
        }
        // литьё версии 2 (greed-lux-cast.js) — повтор без покупки: гаражный
        // (если стоит версия 2 — сначала он), заготовка, банка «в упор», литьё
        if (act === 'cast') return this.castReplay();
    },

    // Пересборка аппарата на месте: снять со страницы (цикл кадров сам
    // встанет — холст отсоединён), вернуть объекту вид «как после
    // загрузки» и смонтировать заново с теми же крючками. Снимок полей
    // делается после загрузки всех файлов аппарата (низ этого файла):
    // GreedJunkLit копит холсты, программы видеокарты и кэши, которые
    // нельзя переносить на новый контекст.
    // Аппаратов два — гаражный (GreedJunkLit) и версия 2 (GreedLux):
    // снимается тот, что стоит, ставится тот, что выбран видом (GreedSkin).
    async rebuild() {
        const L = GreedJunkLit, X = typeof GreedLux !== 'undefined' ? GreedLux : null;
        // заготовка версии 2 (скрытая, greed-lux-prep.js) — не «стоящий» аппарат
        const cur = X && X.wrapEl && !X._prep ? X : L, host = cur.wrapEl && cur.wrapEl.parentElement, opts = cur._opts;
        this.render();
        if (!host) return;
        if (L.wrapEl) {
            this.junkDrop();
            // банка-магазин — рядом с аппаратом; ставим версию 2 — убрать
            const next = typeof GreedMinigame !== 'undefined' && GreedMinigame.machine ? GreedMinigame.machine() : L;
            if (next !== L && typeof GreedJarShop !== 'undefined' && GreedJarShop.detach) GreedJarShop.detach();
        }
        // заготовка остаётся, только если ставится она же (покупка версии 2)
        const want = typeof GreedMinigame !== 'undefined' && GreedMinigame.machine ? GreedMinigame.machine() : L;
        if (X && X.wrapEl && !(X._prep && want === X)) { X._prep = false; X.unmount(); }
        const G = typeof GreedMinigame !== 'undefined' ? GreedMinigame : null;
        const M = G && G.machine ? G.machine() : L;
        if (G) { G.M = M; G.play = { slots: null, wheel: null, pachinko: null }; }
        await (M === X && X.prepTake ? X.prepTake(host, opts) : M.mount(host, opts));
        if (M.meterSet && M.meterValue) M.meterSet(M.meterValue());
        this.render();
    },

    async castReplay() {
        if (typeof GreedLux === 'undefined' || GreedLux._cast) return;
        const set = (v) => { try { localStorage.setItem(GreedSkin.key('slots'), v); } catch (e) { /* нет хранилища */ } };
        if (GreedMinigame.M === GreedLux) { set('1'); await this.rebuild(); }
        const L = GreedJunkLit;
        if (!L.wrapEl) return;
        await GreedLux.prepare(L.wrapEl.parentElement);
        set('2');
        const J = GreedJarShop;
        if (J.cv) { J.state = 'open'; J.dirty = true; }
        return GreedLux.castRun();
    },

    // Снять гаражный со страницы и вернуть объекту вид «как после загрузки»
    // (банку-магазин не трогает: литьё версии 2 ещё льёт из неё).
    junkDrop() {
        const L = GreedJunkLit;
        if (!L.wrapEl) return;
        // Все контексты аппарата — потерять сразу, с текстурами: корпус,
        // колесо, короб. Было — только корпус; приборы колеса и короба
        // жили до сборки мусора, и каждая пересборка добавляла их память
        // (tools/greed-lux-sketch/jar/deposit-prof.js: 3–4 новых
        // контекста, 1 потерян).
        [L.gl, L._wgl && L._wgl.gl, L._pgl && L._pgl.gl].forEach(gl => {
            if (!gl) return;
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
        });
        if (L.growDrop) L.growDrop();
        L.wrapEl.remove();
        const P = this.pristine;
        Object.keys(L).forEach(k => { if (!(k in P)) delete L[k]; });
        Object.keys(P).forEach(k => { L[k] = P[k]; });
        GreedJunk.pass = 'baked';
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
            btn('skin', 'Аппарат: вид ' + skin('slots')) +
            btn('cast', 'Литьё') +
            (typeof GreedJarShop !== 'undefined' && GreedJarShop.lastTap ? `<span style="color:#eee;padding:6px">банка: ${GreedJarShop.lastTap}</span>` : '');
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
