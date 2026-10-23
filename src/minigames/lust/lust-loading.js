// ================= ГОТОВНОСТЬ ВАННОЙ К ПОКАЗУ =================
// Ванная — самая тяжёлая сцена игры: небо флакона печёт фоновый поток, журнал
// тянет картинки, червь мерится только после первых кадров. Всё это
// дозревает с РАЗНОЙ скоростью, и при входе игрок видел, как куски сцены
// выпрыгивают по одному. Поэтому вход закрыт, пока не дозрело всё нужное.
//
// Закрывает его теперь пена — покров перехода (src/core/mg-veil.js,
// lust-foam-veil.js); здесь только вопрос «дозрело ли». Прежний занавес с
// кольцом готовности снят: пена делает то же самое и она же становится
// рамкой окна (docs/plan/25-lust-foam-transition.md).
//
// Состояния не хранит и ничего не начисляет.
const LustLoading = {
    MAX: 6000,              // дольше не держим: лучше сцена с недогруженным, чем вечная пена
    _run: 0,

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

    // Обещание «всё нужное дозрело» (или вышло MAX). false — заход
    // отменили (cancel), ждать больше нечего.
    wait() {
        const run = ++this._run, t0 = performance.now();
        const N = this.needs();
        return new Promise((done) => {
            const step = () => {
                if (run !== this._run) return done(false);
                if (N.every(f => f()) || performance.now() - t0 >= this.MAX) return done(true);
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    },

    // Закрыли ванную — ожидание прошлого захода больше ничего не решает.
    cancel() { this._run++; }
};
