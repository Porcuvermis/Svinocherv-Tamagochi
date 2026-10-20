// ================= ЗАНАВЕС ЗАГРУЗКИ ВАННОЙ =================
// Ванная — самая тяжёлая сцена игры: небо флакона печёт фоновый поток, журнал
// тянет картинки, червь мерится только после первых кадров. Всё это
// дозревает с РАЗНОЙ скоростью, и при входе игрок видел, как куски сцены
// выпрыгивают по одному. Теперь вход закрыт занавесом: он накрывает сцену, пока
// не дозрело всё нужное, и только потом плавно растворяется.
//
// Без слов (инвариант 9): знак греха и кольцо, которое наполняется по
// настоящей готовности (сколько из нужного уже дозрело), а не по таймеру.
// Состояния не хранит и ничего не начисляет — это только картинка входа.
//
// Крестик окна остаётся над занавесом: выйти можно в любой момент.
// В автотестах (navigator.webdriver) занавеса нет, если страница не просит
// его сама (window.SVINO_CURTAIN = 1): иначе каждый снимок ждал бы его уход.
const LustLoading = {
    MIN: [700, 380],        // не короче: первый вход / повторные (ассеты уже в кэше)
    MAX: 6000,              // дольше не держим: лучше сцена с недогруженным, чем вечный занавес
    FADE: 520,              // растворение, мс (css: lust.css, .bt-curtain)
    CIRC: 2 * Math.PI * 34, // длина кольца, единицы холста занавеса
    _seen: false,
    _run: 0,

    el() {
        let c = document.getElementById('bt-curtain');
        if (c) return c;
        const L = typeof LustMinigame !== 'undefined' ? LustMinigame : null;
        const host = L && L.screenElement && (L.screenElement.querySelector('.mg-body') || L.screenElement);
        if (!host) return null;
        const sin = typeof ECONOMY !== 'undefined' && ECONOMY.sins && ECONOMY.sins.lust;
        c = document.createElement('div');
        c.id = 'bt-curtain';
        c.className = 'bt-curtain';
        c.innerHTML = `<div class="bt-curtain-glow"></div>
            <div class="bt-curtain-core">
                <svg viewBox="0 0 80 80" class="bt-curtain-ring" aria-hidden="true">
                    <circle class="bt-curtain-track" cx="40" cy="40" r="34"/>
                    <circle class="bt-curtain-fill" cx="40" cy="40" r="34" stroke-dasharray="${this.CIRC.toFixed(2)}" stroke-dashoffset="${this.CIRC.toFixed(2)}"/>
                </svg>
                <span class="bt-curtain-sign">${sin ? sin.emoji : ''}</span>
            </div>`;
        host.appendChild(c);
        return c;
    },

    // Что должно дозреть до раскрытия. Каждое — { ok() } и общий отсчёт.
    needs() {
        const N = [];
        const tierIs = (M, name) => { try { return !!M && M.TIERS[M.tier()] === name; } catch (e) { return false; } };
        // Небо за стеклом флакона и в теле облака — печётся фоновым потоком.
        if (typeof BATH_SOAP !== 'undefined' && BATH_SOAP.skyReady
            && (tierIs(BATH_SOAP, 'magic') || tierIs(typeof BATH_CLOTH !== 'undefined' ? BATH_CLOTH : null, 'cloud'))) {
            BATH_SOAP.cosmosTex();
            N.push(() => BATH_SOAP.skyReady());
        }
        // Картинки журнала: декодированы заранее, а не при первом показе.
        for (const u of ['mag-cover.jpg', 'mag-flap.png', 'mag-top.png', 'mag-stack.png']) {
            let done = false;
            const im = new Image();
            im.src = `src/minigames/lust/${u}`;
            (im.decode ? im.decode() : Promise.resolve()).then(() => { done = true; }, () => { done = true; });
            N.push(() => done);
        }
        // Червь: габарит мерится после первых кадров рендерера (lust.js,
        // mountWorm), раньше него раскладка скачет.
        const t0 = performance.now();
        let frames = 0;
        const tick = () => { if (++frames < 4) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        N.push(() => frames >= 4 && performance.now() - t0 > 120);
        return N;
    },

    // Готовность без занавеса — для покрова перехода (src/core/mg-veil.js):
    // то же «всё нужное дозрело» и тот же MAX. MIN не нужен: он держал
    // кольцо занавеса, чтобы оно не мелькнуло, а покров ждёт только дела.
    wait() {
        const run = ++this._run, t0 = performance.now(), min = 0;
        this._seen = true;
        const N = this.needs();
        return new Promise((done) => {
            const step = () => {
                if (run !== this._run) return done(false);
                const age = performance.now() - t0;
                if ((N.every(f => f()) && age >= min) || age >= this.MAX) return done(true);
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    },

    begin() {
        if (typeof document === 'undefined') return;
        // Вход идёт под покровом — он и ждёт готовности (wait), занавес не нужен.
        if (typeof MgVeil !== 'undefined' && MgVeil.busy) return;
        if (typeof navigator !== 'undefined' && navigator.webdriver && !window.SVINO_CURTAIN) return;
        const c = this.el();
        if (!c) return;
        const run = ++this._run, t0 = performance.now();
        const min = this.MIN[this._seen ? 1 : 0];
        this._seen = true;
        const fill = c.querySelector('.bt-curtain-fill');
        c.classList.remove('bt-curtain-off', 'bt-curtain-gone');
        c.style.display = '';
        const N = this.needs();
        const step = () => {
            if (run !== this._run) return;                       // вышли и зашли снова — этот отсчёт чужой
            const now = performance.now(), age = now - t0;
            const ready = N.filter(f => f()).length / N.length;
            // Кольцо идёт по готовности, но не обгоняет время показа: иначе оно
            // долетало бы до конца за кадр и занавес ждал бы пустым.
            const shown = Math.min(ready, Math.min(1, age / min));
            fill.style.strokeDashoffset = (this.CIRC * (1 - shown)).toFixed(2);
            if ((ready >= 1 && age >= min) || age >= this.MAX) return this.end(c, run);
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    end(c, run) {
        c.querySelector('.bt-curtain-fill').style.strokeDashoffset = '0';
        c.classList.add('bt-curtain-off');
        setTimeout(() => { if (run === this._run) c.classList.add('bt-curtain-gone'); }, this.FADE + 40);
    },

    // Закрыли ванную — занавес поднимается заново при следующем входе.
    cancel() {
        this._run++;
        const c = document.getElementById('bt-curtain');
        if (c) c.classList.add('bt-curtain-off', 'bt-curtain-gone');
    }
};
