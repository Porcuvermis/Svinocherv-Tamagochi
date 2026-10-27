// ================= АППАРАТ АЛЧНОСТИ: БАНКА-КОШЕЛЁК =================
// Продолжение GreedJunkLit. Кошелёк игрока — банка из-под солений с
// монетами на полу под монетоприёмником (решение игрока): монеты берутся
// отсюда, в щель, выигрыш сыплется в лоток. Без крышки. Монет всегда на
// три четверти банки — уровень ничего не значит, сколько монет, написано
// маркером на малярном скотче на боку (цифры — не слова, инвариант 9).
//
// Дёшево: банка — один холст. Стекло спереди (тон, рёбра, блики) рисуется
// один раз в картинку; монеты внутри — тем же движком, что лоток (GreedCoins,
// свет и блеск видеокартой), но собираются в картинку и перерисовываются
// только от наклона (не чаще LIGHT_MS) и когда меняется число на скотче.
Object.assign(GreedJunkLit, {
    // cx — середина, y0 — верх горла, y1 — дно; w — ширина тела, nw — горла
    JAR: { cx: 273, y0: 577, y1: 625, w: 36, nw: 27, sh: 586 },
    JAR_BOX: { x: 250, y: 570, w: 46, h: 60 },
    JAR_COIN: 4.8,

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
        const B = this.JAR_BOX, G = GreedJunk, S = this.SCALE, cv = document.createElement('canvas');
        cv.width = B.w * S; cv.height = B.h * S;
        cv.style.cssText = `position:absolute;left:${B.x / G.W * 100}%;top:${B.y / G.H * 100}%;` +
            `width:${B.w / G.W * 100}%;height:${B.h / G.H * 100}%;z-index:1;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        this.jarCv = cv;
        this._jar = { shown: null, val: null, from: 0, to: 0, at: 0, paintAt: 0, lt: null };
    },

    // кошелёк из состояния игры; в превью без игры — горсть
    jarValue() {
        if (typeof GameState === 'undefined' || !GameState.currency) return 37;
        return Math.max(0, Math.floor(GameState.currency('gold')));
    },

    // ---------- МОНЕТЫ ВНУТРИ ----------
    // Раскладка — один раз: ряды снизу вверх до трёх четвертей, в каждом
    // монеты вплотную со случайным сдвигом; дальние темнее (ao), верхний
    // слой лежит плашмя, нижние видны сквозь стекло боком и наискось.
    jarCoins() {
        if (this._jarCoins) return this._jarCoins;
        const J = this.JAR, B = this.JAR_BOX, r = this.JAR_COIN, rnd = GreedJunk.rng(5150);
        const top = J.y1 - (J.y1 - J.sh) * 0.75, out = [];
        const P = GreedCoins.poses(), any = () => Math.floor(rnd() * P.length);
        for (let y = J.y1 - r * 0.6, row = 0; y > top + r * 0.4; y -= r * 0.8, row++) {
            for (let x = J.cx - J.w / 2 + r * 0.4 + (row % 2) * r * 0.8; x < J.cx + J.w / 2 - r * 0.2; x += r * 1.55) {
                // у стекла монеты прижаты как попало — любые наклоны
                out.push({ x: x + (rnd() - 0.5) * 2.4 - B.x, y: y + (rnd() - 0.5) * 2 - B.y, ao: 0.55 + rnd() * 0.3, pose: any() });
            }
        }
        // верх кучи — горкой к середине: монеты сверху плашмя или чуть
        // наклонены, ярче (на них свет)
        for (let k = 0; k < 7; k++) {
            const x = J.cx - 13.5 + k * 4.5 + (rnd() - 0.5) * 1.6;
            out.push({ x: x - B.x, y: top + 0.6 + Math.pow(Math.abs(x - J.cx) / 14, 2) * 2.6 + (rnd() - 0.5) - B.y, ao: 0.95, pose: this.trayPose(rnd) });
        }
        return (this._jarCoins = out.sort((a, b) => a.y - b.y));
    },

    // ---------- СТЕКЛО: ОДИН РАЗ ----------
    jarGlass() {
        if (this._jarGlass) return this._jarGlass;
        const B = this.JAR_BOX, J = this.JAR, S = this.SCALE, C = PALETTE.greedJunk.reel.jar, ink = PALETTE.ink;
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
        const tilt = this._tilt || { x: 0, y: 0 };
        const tiltMoved = !M.lt || Math.abs(M.lt.x - tilt.x) > 0.003 || Math.abs(M.lt.y - tilt.y) > 0.003;
        if (M.shown === M.val && !(tiltMoved && now - M.paintAt >= this.LIGHT_MS * 2)) return;
        if (!this.jarPaint(tilt)) return;
        M.shown = M.val; M.lt = { x: tilt.x, y: tilt.y }; M.paintAt = now;
    },

    jarPaint(tilt) {
        const A = GreedCoins.loadAtlas();
        if (!A.ready) return false;
        const B = this.JAR_BOX, S = this.SCALE, J = this.JAR, M = this._jar;
        if (!this.jarDraw) {
            const gl = document.createElement('canvas');
            gl.width = B.w * S; gl.height = B.h * S;
            this.jarDraw = GreedCoins.batchRenderer(gl, A.fa, A.fn, A.alb, A.nor, [B.w, B.h]);
            this.jarGl = gl;
            if (!this.jarDraw) return false;
        }
        const D = this.jarDraw, P = GreedCoins.poses();
        D.begin(tilt);
        this.jarCoins().forEach(c => {
            const k = this.coinOf(c.x, c.y, 0, c.ao);
            k.rad = this.JAR_COIN; k.pose = P[c.pose].n; k.roll = P[c.pose].roll * Math.PI / 180; k.ci = c.pose;
            D.add(k, { n: k.pose, m: 1, flash: 0, settled: true });
        });
        D.flush();
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
        c.drawImage(this.jarGl, 0, 0);
        c.restore();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(this.jarGlass(), 0, 0);
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        this.jarTape(c, M.val);
        return true;
    }
});
