// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: ЗАГОТОВКА ПОКУПКИ =================
// План 31, разд. 5г, п. 1. Было: узел версии 2 в банке заполнился — банка
// закрывается, гаражный снимается, и версия 2 собирается с нуля: карты,
// контексты, заливка в видеокарту. Замер (×4): ~1,3 с до готовности, кадр
// стоял до 3,9 с — ровно в момент, которого игрок ждёт (грабли 172).
//
// Теперь, когда жетонов на версию 2 хватает (заход в алчность, открытие
// банки), она собирается заранее — скрытой под гаражным, в той же сцене:
// карты загружены, контексты созданы, первый кадр нарисован (заливка в
// видеокарту прошла). Цикл кадров у заготовки стоит, пальцы она не ловит,
// места в раскладке не занимает. Покупка только снимает гаражный и
// показывает готовое; ушёл, не купив, — заготовка снимается вся, со всеми
// контекстами (закрытие игры, greed.js).
Object.assign(GreedLux, {
    // собрать скрытой в container (сцена гаражного); обещание готовности
    prepare(container) {
        if (this.wrapEl) return this._mountP;          // уже стоит или уже заготовлена
        this._prep = true;
        const p = this.mount(container, {});
        const st = this.wrapEl.style;
        st.position = 'absolute'; st.left = st.top = '0'; st.opacity = '0'; st.pointerEvents = 'none';
        // и всё для литья (greed-lux-cast.js): жар литого и холст литья —
        // заранее, чтобы в миг покупки не стоял кадр
        Promise.resolve(p).then(() => this._kantP).then(() => {
            if (!this._prep) return;
            if (this.castHeatInit) this.castHeatInit();
            if (this.castCanvas && !this._castC) this.castCanvas(null);
        }).catch(() => {});
        return p;
    },
    // заготовка — в игру: показать на месте гаражного (тот уже снят)
    prepTake(container, opts) {
        if (!this._prep || !this.wrapEl) return this.mount(container, opts);
        this._prep = false;
        // заготовленный холст литья нужен, только если сейчас литьё
        if (!this._castPending && this.castCanvasDrop) this.castCanvasDrop();
        const st = this.wrapEl.style;
        st.position = 'relative'; st.left = st.top = ''; st.opacity = ''; st.pointerEvents = '';
        // mount с готовой обёрткой: крючки игры, панель, гвозди, цикл кадров
        return this.mount(container, opts);
    },
    // не пригодилась — назад вся, с контекстами
    prepDrop() {
        if (!this._prep) return;
        this._prep = false;
        this.unmount();
    }
});
