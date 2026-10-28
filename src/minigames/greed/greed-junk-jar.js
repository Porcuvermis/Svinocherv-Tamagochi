// ================= АППАРАТ АЛЧНОСТИ: БАНКА-КОШЕЛЁК =================
// Продолжение GreedJunkLit. Кошелёк игрока — банка из-под солений с
// монетами на полу нижнего ящика, справа от монетоприёмника (решение
// игрока): монеты берутся отсюда, в щель, выигрыш сыплется в лоток. Без крышки. Монет всегда на
// три четверти банки — уровень ничего не значит, сколько монет, написано
// маркером на малярном скотче на боку (цифры — не слова, инвариант 9).
//
// Дёшево: банка — один холст, перерисовывается, только когда меняется
// число на скотче. Стекло (тон, рёбра, блики) и куча монет собираются в
// картинки один раз; монета — та же освещённая, что летит в щель.
Object.assign(GreedJunkLit, {
    // cx — середина, y0 — верх горла, y1 — дно; w — ширина тела, nw — горла
    JAR: { cx: 273, y0: 577, y1: 625, w: 36, nw: 27, sh: 586 },
    JAR_BOX: { x: 250, y: 570, w: 46, h: 60 },
    // Банка на аппарате вдвое крупнее своего рисунка: справа на полу ящика,
    // рядом с щелью монетоприёмника (решение игрока: число на скотче мелко
    // читалось). Рисунок — в прежних координатах (JAR), холсты растрируются
    // сразу в настоящий размер (jarS), на место их ставит JAR_AT.
    JAR_AT: { ax: 273, ay: 625, x: 301, y: 615, s: 2 },
    jarS() { return this.SCALE * this.JAR_AT.s; },
    jarPt(x, y) { const A = this.JAR_AT; return [A.x + (x - A.ax) * A.s, A.y + (y - A.ay) * A.s]; },
    jarRect(B) { const [x, y] = this.jarPt(B.x, B.y); return { x, y, w: B.w * this.JAR_AT.s, h: B.h * this.JAR_AT.s }; },
    // Монета в банке — вдвое мельче, чем была (4.8): банка увеличена вдвое,
    // а монета в ней должна быть той же, что летит в щель и лежит в лотке.
    JAR_COIN: 2.8,

    // контур банки: горло с венчиком, плечи, тело, скруглённое дно; inset —
    // внутрь на толщину стекла
    jarPath(c, inset) {
        const J = this.JAR, i = inset || 0, x0 = J.cx - J.w / 2 + i, x1 = J.cx + J.w / 2 - i, n0 = J.cx - J.nw / 2 + i, n1 = J.cx + J.nw / 2 - i;
        const top = J.y0 + i * 0.5, sh = J.sh, bot = J.y1 - i, r = 5 - i * 0.5;
        c.beginPath();
        c.moveTo(n0, top);
        c.lineTo(n0, sh - 3);
        c.quadraticCurveTo(n0, sh, x0 + 1.5, sh + 1.5);
        c.quadraticCurveTo(x0, sh + 2.5, x0, sh + 5);
        c.lineTo(x0, bot - r);
        c.quadraticCurveTo(x0, bot, x0 + r, bot);
        c.lineTo(x1 - r, bot);
        c.quadraticCurveTo(x1, bot, x1, bot - r);
        c.lineTo(x1, sh + 5);
        c.quadraticCurveTo(x1, sh + 2.5, x1 - 1.5, sh + 1.5);
        c.quadraticCurveTo(n1, sh, n1, sh - 3);
        c.lineTo(n1, top);
        c.closePath();
    },

    jarMount(wrap) {
        const B = this.JAR_BOX, G = GreedJunk, S = this.jarS(), cv = document.createElement('canvas');
        cv.width = B.w * S; cv.height = B.h * S;
        cv.style.cssText = `position:absolute;${G.css(this.jarRect(B))}z-index:1;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        if (this.keyOverlay) this.keyOverlay(cv, 'jar');
        this.jarCv = cv;
        this._jar = { shown: null, val: null, from: 0, to: 0, at: 0 };
    },

    // Кошелёк из состояния игры минус выигрыши идущих игр — они уже
    // начислены, но банка покажет их, когда игра закончится (GreedMinigame,
    // «Кошелёк в банке»). В превью без игры — горсть.
    _jarHeld: 0,
    jarHold(d) { this._jarHeld = d === null ? 0 : Math.max(0, this._jarHeld + d); },
    jarValue() {
        if (typeof GameState === 'undefined' || !GameState.currency) return 37;
        return Math.max(0, Math.floor(GameState.currency('gold') - this._jarHeld));
    },

    // ---------- МОНЕТЫ ВНУТРИ ----------
    // Банка стоит на полу ниже глаз — смотрим сверху-спереди, градусов под
    // 20. Монеты в куче лежат почти плашмя друг на друге, поэтому видны
    // сплюснутыми овалами (k — во сколько раз ниже, чем шире) с ребром
    // снизу. Было: позы из атласа лотка — у них наклон не круче 32° от
    // взгляда, и нижние монеты стояли торчком под невозможными углами.
    // Куча — слои снизу вверх; в слое монеты по кругу дна банки, глубина z
    // (−1 у задней стенки, +1 у стекла перед нами) поднимает дальние выше.
    // Рисуются слой за слоем, в слое — от задних к передним: верхняя монета
    // ложится на нижнюю, передняя закрывает заднюю.
    JAR_PILE: { k: 0.34, layer: 1.05, depth: 5.6, per: 30 },
    jarCoins() {
        if (this._jarCoins) return this._jarCoins;
        const J = this.JAR, P = this.JAR_PILE, r = this.JAR_COIN, rnd = GreedJunk.rng(5150);
        const R = J.w / 2 - 1.2, top = J.y1 - (J.y1 - J.sh) * 0.75, out = [];
        const nL = Math.ceil((J.y1 - 2 - top) / P.layer);
        for (let L = 0; L < nL; L++) {
            const layer = [];
            for (let n = 0; n < P.per; n++) {
                // точка на дне банки (круг): x — поперёк, z — вглубь
                const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
                const x = Math.cos(a) * d * (R - r * 0.6), z = Math.sin(a) * d;
                // верхний слой — горкой к середине
                const hump = L === nL - 1 ? (1 - Math.abs(x) / R) * 1.6 : 0;
                layer.push({
                    x: J.cx + x, y: J.y1 - 2.2 - L * P.layer - hump + z * P.depth * 0.5 - P.depth * 0.5, z,
                    k: P.k * (0.75 + rnd() * 0.5), rot: (rnd() - 0.5) * 0.35,
                    // глубже в куче и дальше от нас — темнее
                    ao: Math.min(1, 0.5 + 0.5 * L / nL + z * 0.15)
                });
            }
            out.push(...layer.sort((a, b) => a.z - b.z));
        }
        return (this._jarCoins = out);
    },
    // монета плашмя в ракурсе: ребро — тот же овал чуть ниже, тёмное золото;
    // лицо — освещённая картинка монеты (coinSprite), сплюснутая по высоте
    jarCoin(c, spr, m) {
        const r = this.JAR_COIN, G = PALETTE.greedCoin.gold, th = r * 0.23;
        c.save();
        c.translate(m.x, m.y); c.rotate(m.rot);
        c.fillStyle = G.deep;
        c.beginPath(); c.ellipse(0, th, r, r * m.k, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = G.lo;
        c.beginPath(); c.ellipse(0, th * 0.5, r, r * m.k, 0, 0, Math.PI); c.fill();
        // спрайт: монета радиусом COIN_FLY.rad в квадрате 14
        const s = 14 * r / this.COIN_FLY.rad;
        c.drawImage(spr, -s / 2, -s / 2 * m.k, s, s * m.k);
        if (m.ao < 1) {
            c.globalAlpha = 1 - m.ao; c.fillStyle = PALETTE.greedCoin.gap;
            c.beginPath(); c.ellipse(0, th * 0.4, r + 0.1, r * m.k + th * 0.5, 0, 0, Math.PI * 2); c.fill();
            c.globalAlpha = 1;
        }
        c.restore();
    },
    // куча целиком — в картинку один раз: монеты не меняются
    jarPile() {
        if (this._jarPile) return this._jarPile;
        const spr = this.coinSprite && this.coinSprite();
        if (!spr) return null;
        const B = this.JAR_BOX, S = this.jarS(), cv = document.createElement('canvas');
        cv.width = B.w * S; cv.height = B.h * S;
        const c = cv.getContext('2d');
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        this.jarCoins().forEach(m => this.jarCoin(c, spr, m));
        return (this._jarPile = cv);
    },

    // ---------- СТЕКЛО: ОДИН РАЗ ----------
    jarGlass() {
        if (this._jarGlass) return this._jarGlass;
        const B = this.JAR_BOX, J = this.JAR, S = this.jarS(), C = PALETTE.greedJunk.reel.jar, ink = PALETTE.ink;
        const cv = document.createElement('canvas');
        cv.width = B.w * S; cv.height = B.h * S;
        const c = cv.getContext('2d');
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        // мутноватое стекло: поверх монет лёгкий тон, к краям гуще (толща)
        this.jarPath(c, 0);
        const g = c.createLinearGradient(J.cx - J.w / 2, 0, J.cx + J.w / 2, 0);
        g.addColorStop(0, C.glassLo); g.addColorStop(0.18, C.glass); g.addColorStop(0.75, C.glass); g.addColorStop(1, C.glassLo);
        c.globalAlpha = 0.14; c.fillStyle = g; c.fill();
        // рёбра у дна — литьё банки: короткие вертикальные валики
        c.globalAlpha = 0.22; c.strokeStyle = C.glassHi; c.lineWidth = 0.6; c.lineCap = 'round';
        for (let x = J.cx - J.w / 2 + 3.5; x < J.cx + J.w / 2 - 2; x += 3.2) { c.beginPath(); c.moveTo(x, J.y1 - 1.6); c.lineTo(x, J.y1 - 5.2); c.stroke(); }
        // венчик горла: резьба без крышки — три кольца
        c.globalAlpha = 0.85; c.strokeStyle = C.glassLo; c.lineWidth = 0.5;
        [1.6, 3.4, 5.2].forEach(dy => { c.beginPath(); c.moveTo(J.cx - J.nw / 2 + 0.6, J.y0 + dy); c.quadraticCurveTo(J.cx, J.y0 + dy + 1.2, J.cx + J.nw / 2 - 0.6, J.y0 + dy - 0.4); c.stroke(); });
        // край горла — светлый овал (стекло видно торцом)
        c.globalAlpha = 0.9; c.strokeStyle = C.glassHi; c.lineWidth = 0.7;
        c.beginPath(); c.ellipse(J.cx, J.y0, J.nw / 2 - 0.4, 1.3, 0, 0, Math.PI * 2); c.stroke();
        // контур
        c.globalAlpha = 1; c.strokeStyle = ink; c.lineWidth = STROKE.structure; c.lineJoin = 'round';
        this.jarPath(c, 0); c.stroke();
        c.beginPath(); c.ellipse(J.cx, J.y0, J.nw / 2, 1.6, 0, Math.PI, Math.PI * 2); c.stroke();
        // блики: длинный слева по телу, короткий на плече, отсвет справа
        c.strokeStyle = C.glassHi; c.lineCap = 'round';
        c.globalAlpha = 0.85; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(J.cx - J.w / 2 + 3.2, J.sh + 7); c.lineTo(J.cx - J.w / 2 + 3.2, J.y1 - 9); c.stroke();
        c.globalAlpha = 0.6; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(J.cx - J.w / 2 + 5.4, J.sh + 9); c.lineTo(J.cx - J.w / 2 + 5.4, J.sh + 16); c.stroke();
        c.beginPath(); c.moveTo(J.cx - J.nw / 2 + 2.6, J.sh - 1); c.quadraticCurveTo(J.cx - J.w / 2 + 3, J.sh + 1.4, J.cx - J.w / 2 + 2.4, J.sh + 4.6); c.stroke();
        c.globalAlpha = 0.4; c.lineWidth = 1;
        c.beginPath(); c.moveTo(J.cx + J.w / 2 - 2.4, J.sh + 8); c.lineTo(J.cx + J.w / 2 - 2.4, J.y1 - 6); c.stroke();
        c.globalAlpha = 1;
        return (this._jarGlass = cv);
    },

    // ---------- СКОТЧ С ЧИСЛОМ ----------
    // Цифры маркером от руки — тем же почерком (handPath), что тряпка и
    // стикер; дрожь своя у каждой позиции и цифры, но одна и та же при
    // каждой перерисовке: число не «шевелится» от наклона.
    JAR_DIGIT: [
        [[[2, 0], [0.4, 1.4], [0, 4], [0.5, 6.6], [2, 7.2], [3.5, 6.6], [4, 4], [3.6, 1.4], [2, 0]]],
        [[[0.8, 1.6], [2.4, 0]], [[2.4, 0], [2.3, 7.2]]],
        [[[0.2, 1.6], [1.6, 0.1], [3.4, 0.6], [3.6, 2.4], [0, 7.2], [4, 7]]],
        [[[0.3, 0.6], [3.2, 0.3], [1.6, 3], [3.6, 4.4], [3, 6.8], [0.2, 6.6]]],
        [[[2.8, 7.2], [2.9, 0], [0, 5], [4, 4.8]]],
        [[[3.6, 0.2], [0.6, 0.3], [0.4, 3], [2.8, 2.8], [3.8, 4.8], [2.8, 6.9], [0.2, 6.6]]],
        [[[3.2, 0.3], [1, 1.8], [0.2, 5], [1.4, 7.1], [3.4, 6.6], [3.6, 4.2], [1.8, 3.6], [0.4, 4.6]]],
        [[[0, 0.4], [4, 0.2], [1.4, 7.2]]],
        [[[2, 3.4], [0.6, 2.2], [1, 0.4], [3, 0.3], [3.4, 2], [2, 3.4], [0.2, 5], [1, 7], [3.2, 6.9], [3.8, 5], [2, 3.4]]],
        [[[3.6, 2.6], [2, 3.6], [0.4, 2.4], [1.2, 0.2], [3.2, 0.4], [3.7, 3], [2.8, 7.2]]]
    ],
    jarTape(c, val) {
        const J = this.JAR, C = PALETTE.greedJunk.reel.jar, f = (n) => n;
        const s = String(val), dw = 5.2, k = Math.min(1, 26 / (s.length * dw + 4));   // длинное число — мельче
        const w = Math.max(16, s.length * dw * k + 6), h = 11, x = J.cx - w / 2 + 1, y = J.y1 - 21;
        c.save();
        c.translate(J.cx, y + h / 2); c.rotate(-0.06); c.translate(-J.cx, -(y + h / 2));
        // скотч: рваные концы, полупрозрачный, по краям темнее
        const rnd = GreedJunk.rng(91);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + w, y);
        for (let i = 1; i <= 5; i++) c.lineTo(x + w + (rnd() - 0.5) * 1.4, y + h * i / 5);
        c.lineTo(x, y + h);
        for (let i = 4; i >= 1; i--) c.lineTo(x + (rnd() - 0.5) * 1.4, y + h * i / 5);
        c.closePath();
        c.globalAlpha = 0.95; c.fillStyle = C.tape; c.fill();
        c.globalAlpha = 0.6; c.strokeStyle = C.tapeEdge; c.lineWidth = 0.4; c.stroke();
        c.globalAlpha = 0.35; c.fillStyle = C.tapeLo; c.fillRect(x, y, w, 1.2); c.fillRect(x, y + h - 1.2, w, 1.2);
        // число
        c.globalAlpha = 0.92; c.strokeStyle = PALETTE.greedJunk.reel.rag.marker; c.lineWidth = 0.95 * k + 0.15; c.lineCap = 'round'; c.lineJoin = 'round';
        const x0 = J.cx - s.length * dw * k / 2 + 1;
        s.split('').forEach((ch, i) => {
            const rnd2 = GreedJunk.rng(1000 + i * 31 + +ch * 7);
            const tx = x0 + i * dw * k, ty = y + 1.9 + (rnd2() - 0.5) * 0.6, a = (rnd2() - 0.5) * 0.12;
            c.save(); c.translate(tx + 2 * k, ty + 3.6 * k); c.rotate(a); c.scale(k, k); c.translate(-2, -3.6);
            const p = new Path2D(this.JAR_DIGIT[+ch].map(L => GreedJunk.handPath(L, rnd2, false, 0.18)).join(' '));
            c.stroke(p);
            c.restore();
        });
        c.restore();
        c.globalAlpha = 1;
    },

    jarStep(now) {
        const M = this._jar;
        if (!M) return;
        const v = this.jarValue();
        if (M.val === null) { M.val = v; M.from = v; M.to = v; }
        // число досчитывает до нового значения — монеты «пересчитали»
        if (v !== M.to) { M.from = M.val; M.to = v; M.at = now; }
        if (M.val !== M.to) {
            const u = Math.min(1, (now - M.at) / 600);
            M.val = Math.round(M.from + (M.to - M.from) * (1 - Math.pow(1 - u, 3)));
        }
        // перерисовка — только когда меняется число: куча монет неподвижна
        if (M.shown === M.val) return;
        if (!this.jarPaint()) return;
        M.shown = M.val;
    },

    jarPaint() {
        const pile = this.jarPile();
        if (!pile) return false;
        const B = this.JAR_BOX, S = this.jarS(), J = this.JAR, M = this._jar;
        const c = this.jarCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.jarCv.width, this.jarCv.height);
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        // тень банки на пол
        c.globalAlpha = 0.35; c.fillStyle = PALETTE.greedJunk.hole;
        c.beginPath(); c.ellipse(J.cx + 2.5, J.y1 + 0.6, J.w / 2 + 2, 2.6, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        // задняя стенка — темнее, сквозь неё видно ящик
        this.jarPath(c, 0.8);
        c.save(); c.clip();
        c.globalAlpha = 0.18; c.fillStyle = PALETTE.greedJunk.hole; c.fillRect(B.x, B.y, B.w, B.h);
        c.globalAlpha = 1;
        // глубина кучи: щели между монетами тёмные — без неё монеты сливались
        // в ровную жёлтую чешую, а не в кучу
        const top = J.y1 - (J.y1 - J.sh) * 0.75;
        c.fillStyle = PALETTE.greedCoin.gap;
        c.beginPath(); c.moveTo(B.x, J.y1 + 2); c.lineTo(B.x, top + 3);
        for (let x = B.x; x <= B.x + B.w; x += 3) c.lineTo(x, top + 3 + Math.sin(x * 0.9) * 1.2 + (Math.abs(x - J.cx) / J.w) * 3);
        c.lineTo(B.x + B.w, J.y1 + 2); c.closePath(); c.fill();
        // монеты внутри, по стеклу
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(pile, 0, 0);
        c.restore();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(this.jarGlass(), 0, 0);
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        this.jarTape(c, M.val);
        return true;
    }
});
