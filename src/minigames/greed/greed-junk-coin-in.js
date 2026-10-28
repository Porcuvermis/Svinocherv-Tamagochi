// ================= АППАРАТ АЛЧНОСТИ: МОНЕТА В ЩЕЛЬ =================
// Продолжение GreedJunkLit. На рывке рычага монета сама влетает в
// монетоприёмник (решение игрока: один жест): выпрыгивает из горла
// банки-кошелька (greed-junk-jar.js) под монетоприёмником, дугой влево и
// вверх к куполу, кувыркаясь, на подлёте встаёт ребром по щели и уходит
// внутрь — звяк в палец, глухой стук ниже. Денег нет — банка пуста, и
// монете взяться неоткуда: не летит ничего (был полёт в ковш возврата —
// пока монеты летели из-за края экрана).
//
// Дёшево: монета освещается ОДИН раз тем же движком, что лоток
// (GreedCoins, плашмя), и запоминается картинкой; кувырок — сжатие
// картинки по ширине, ребро — полоска цвета ребра. Атлас поз до ребра не
// доходит (наклоны до 32°), а ради полёта на полсекунды заводить новый —
// дорого.
Object.assign(GreedJunkLit, {
    COIN_BOX: { x: 196, y: 486, w: 120, h: 144 },   // от купола до низа поля
    COIN_FLY: { ms: 460, inMs: 130, turns: 2, rad: 5.2 },

    coinMount(wrap) {
        const B = this.COIN_BOX, G = GreedJunk, cv = document.createElement('canvas');
        cv.width = B.w * this.SCALE; cv.height = B.h * this.SCALE;
        cv.style.cssText = `position:absolute;${G.css(B)}z-index:2;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        this.coinCv = cv;
        this._coins = [];
    },

    // картинка монеты плашмя, освещённая; null — атлас ещё не пришёл
    coinSprite() {
        if (this._coinSpr) return this._coinSpr;
        const A = GreedCoins.loadAtlas();
        if (!A.ready) return null;
        const S = this.SCALE * 2, box = 14, cv = document.createElement('canvas');
        cv.width = cv.height = box * S;
        const D = GreedCoins.batchRenderer(cv, A.fa, A.fn, A.alb, A.nor, [box, box]);
        if (!D) return null;
        const P = GreedCoins.poses(), c = this.coinOf(box / 2, box / 2, 0, 1);
        c.rad = this.COIN_FLY.rad; c.pose = P[0].n; c.roll = 0; c.ci = 0;
        D.begin({ x: 0, y: 0 });
        D.add(c, { n: c.pose, m: 1, flash: 0, settled: true });
        D.flush();
        // копия — сразу, в той же задаче: буфер GL без preserveDrawingBuffer
        const out = document.createElement('canvas');
        out.width = out.height = cv.width;
        out.getContext('2d').drawImage(cv, 0, 0);
        return (this._coinSpr = out);
    },

    // монета из банки в щель
    coinIn() {
        if (!this.coinCv) return;
        const W = GreedJunk.SLOTS.wc, cx = W.x + W.w / 2, J = this.JAR || { cx, y0: GreedJunk.H };
        this._coins.push({ at: performance.now(), x0: J.cx, y0: J.y0 + 5, x1: cx, y1: W.y + 25, rim: J.y0 + 1 });
    },

    coinStep(now) {
        if (!this._coins || (!this._coins.length && !this._coinDirty)) return;
        const F = this.COIN_FLY, B = this.COIN_BOX, S = this.SCALE, spr = this.coinSprite();
        const ctx = this.coinCv.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.coinCv.width, this.coinCv.height);
        this._coinDirty = this._coins.length > 0;
        if (!spr) return;
        const C = PALETTE.greedCoin.gold, r = F.rad;
        // монета: центр (x, y), ширина картинки k (1 — плашмя к нам, 0 — ребро),
        // масштаб s (ближе к игроку — крупнее), поворот rot, прозрачность a
        const coin = (x, y, k, s, rot, a, clipY) => {
            ctx.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
            ctx.save();
            // пока монета в горле банки, ниже края горла её не видно
            if (clipY) { ctx.beginPath(); ctx.rect(B.x, B.y, B.w, clipY - B.y); ctx.clip(); }
            ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
            ctx.globalAlpha = a;
            const kw = Math.max(0.06, Math.abs(k));
            ctx.drawImage(spr, -7 * kw, -7, 14 * kw, 14);
            // ребро: когда монета почти боком — видна полоса гурта
            if (kw < 0.5) {
                const ew = 1.3 * (1 - kw * 2) + 0.4;
                ctx.fillStyle = C.lo; ctx.fillRect(-ew / 2 + (k < 0 ? -r * kw : r * kw) * 0.6, -r, ew, r * 2);
                ctx.fillStyle = C.hi; ctx.fillRect(-ew / 2 + (k < 0 ? -r * kw : r * kw) * 0.6, -r, ew * 0.35, r * 2);
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        };
        this._coins = this._coins.filter(c => {
            const t = now - c.at;
            if (t < F.ms) {
                // полёт: из горла вверх-влево и дугой к куполу, кувырок
                // затухает к ребру
                const u = t / F.ms, e = 1 - Math.pow(1 - u, 2.2);
                const mx = c.x0 - 34, my = c.y0 - 40;
                const x = (1 - e) * (1 - e) * c.x0 + 2 * (1 - e) * e * mx + e * e * c.x1;
                const y = (1 - e) * (1 - e) * c.y0 + 2 * (1 - e) * e * my + e * e * c.y1;
                // к прилёту — ровно ребром (cos = 0): целые обороты плюс четверть
                const k = Math.cos(e * Math.PI * (F.turns * 2 + 0.5));
                // в середине пути ближе к игроку (подброшена) — крупнее
                coin(x, y, k, 1 + Math.sin(e * Math.PI) * 0.35, (1 - e) * 1.2, 1, u < 0.25 ? c.rim : 0);
                return true;
            }
            if (t < F.ms + F.inMs) {
                // ребром в щель: уходит от игрока — меньше и тусклее
                const u = (t - F.ms) / F.inMs;
                if (!c.clink) {
                    c.clink = true;
                    // звяк — короткий жёсткий удар; tick тише и читается щелчком выбора
                    if (typeof Haptics !== 'undefined') Haptics.impact('rigid');
                }
                coin(c.x1, c.y1 + u * 1.5, 0.06, 1 - u * 0.45, 0, 1 - u);
                return true;
            }
            // принята: глухой стук, когда упала в механизм
            if (!c.thud && t > F.ms + F.inMs + 160) {
                c.thud = true;
                if (typeof Haptics !== 'undefined') Haptics.impact('soft');
            }
            return t < F.ms + F.inMs + 200;
        });
    }
});
