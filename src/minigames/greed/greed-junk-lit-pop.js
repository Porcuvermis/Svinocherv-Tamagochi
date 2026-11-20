// ================= АППАРАТ АЛЧНОСТИ (ГАРАЖНЫЙ): ВСПЛЫВАШКА НАЧИСЛЕНИЯ =================
// Игрок, 20.11: у гаражного аппарата не было всплывашек «что пришло», как у
// версии 2. Тот же приём (WalletFx.popAt — общий показ трат и начислений,
// своих сообщений не заводим): экран алчности зовёт winPop после выплаты
// любой игры, всплывашка — из её места на аппарате: барабанов, колеса у
// указателя (выпавший сектор стоит под ним), поля пачинко.
Object.assign(GreedJunkLit, {
    winPop(game, res) {
        if (!res || typeof WalletFx === 'undefined' || !WalletFx.popAt || !this.wrapEl) return;
        const list = [], cur = res.currencies || {};
        Object.keys(cur).forEach(k => { if (cur[k] > 0) list.push({ key: k, delta: cur[k] }); });
        const it = res.items, ing = it && typeof KITCHEN !== 'undefined' && KITCHEN.ingredients[it.pantry || it.seed];
        if (it && it.got > 0 && ing) list.push({ mark: ing.emoji, delta: it.got });
        if (!list.length) return;
        const G = GreedJunk, S = G.SLOTS;
        let x, y;
        if (game === 'wheel') { x = S.wheel.cx + S.wheel.r * 0.62; y = S.wheel.cy; }
        else if (game === 'pachinko') { const P = G.PACH; [x, y] = G.pachPt(P.arc.cx, (P.y0 + P.top + P.drain) / 2); }
        else { const R = S.reels; x = (R[0].x + R[2].x + R[2].w) / 2; y = R[0].y + R[0].h / 2; }
        const w = this.wrapEl.getBoundingClientRect();
        WalletFx.popAt(w.left + x / G.W * w.width, w.top + (y - G.Y0) / G.H * w.height, list);
    }
});
