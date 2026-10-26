// ================= АППАРАТ АЛЧНОСТИ: МОНЕТА В ЩЕЛЬ =================
// Продолжение GreedJunkLit. На рывке рычага монета сама влетает в
// монетоприёмник (решение игрока: один жест): из-за нижнего края экрана,
// где у игрока кошелёк, по дуге к куполу, кувыркаясь, на подлёте встаёт
// ребром по щели и уходит внутрь — звяк в палец, глухой стук ниже.
// Монета не прошла (coinIn(false)) — выпадает в ковш возврата.
//
// Дёшево: монета освещается ОДИН раз тем же движком, что лоток
// (GreedCoins, плашмя), и запоминается картинкой; кувырок — сжатие
// картинки по ширине, ребро — полоска цвета ребра. Атлас поз до ребра не
// доходит (наклоны до 32°), а ради полёта на полсекунды заводить новый —
// дорого.
Object.assign(GreedJunkLit, {
    COIN_BOX: { x: 196, y: 486, w: 120, h: 144 },   // от купола до низа поля
    COIN_FLY: { ms: 460, inMs: 130, turns: 2, rad: 5.2, dropMs: 520 },

    coinMount(wrap) {
        const B = this.COIN_BOX, G = GreedJunk, cv = document.createElement('canvas');
        cv.width = B.w * this.SCALE; cv.height = B.h * this.SCALE;
        cv.style.cssText = `position:absolute;left:${B.x / G.W * 100}%;top:${B.y / G.H * 100}%;` +
            `width:${B.w / G.W * 100}%;height:${B.h / G.H * 100}%;z-index:2;pointer-events:none;background:none`;
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

    // ok — монета принята; false — выпадет в ковш возврата
    coinIn(ok) {
        if (!this.coinCv) return;
        const W = GreedJunk.SLOTS.wc, cx = W.x + W.w / 2;
        this._coins.push({ at: performance.now(), ok: ok !== false, x0: cx - 34, y0: GreedJunk.H + 8, x1: cx, y1: W.y + 25, sx: cx - 3.2, sy: W.y + 69 });   // sy — зев ковша (wcSlot: ty = y + 67)
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
            // в ковше монету спереди закрывает его бортик
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
                // полёт: дуга снизу-слева к куполу, кувырок затухает к ребру
                const u = t / F.ms, e = 1 - Math.pow(1 - u, 2.2);
                const mx = c.x0 - 18, my = c.y1 + 30;
                const x = (1 - e) * (1 - e) * c.x0 + 2 * (1 - e) * e * mx + e * e * c.x1;
                const y = (1 - e) * (1 - e) * c.y0 + 2 * (1 - e) * e * my + e * e * c.y1;
                // к прилёту — ровно ребром (cos = 0): целые обороты плюс четверть
                const k = Math.cos(e * Math.PI * (F.turns * 2 + 0.5));
                coin(x, y, k, 1.6 - 0.6 * e, (1 - e) * 1.2, 1);
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
            if (c.ok) {
                // принята: глухой стук, когда упала в механизм
                if (!c.thud && t > F.ms + F.inMs + 160) {
                    c.thud = true;
                    if (typeof Haptics !== 'undefined') Haptics.impact('soft');
                }
                return t < F.ms + F.inMs + 200;
            }
            // не прошла: вываливается из щели возврата в ковш и там лежит
            const u = Math.min(1, (t - F.ms - F.inMs - 180) / F.dropMs);
            if (u < 0) return true;
            if (!c.rattle) { c.rattle = true; if (typeof Haptics !== 'undefined') Haptics.burst('rigid', 3, 50); }
            // из щели вниз, в зев ковша, подскок и лежит; ниже губы ковша не видна
            const by = c.sy - 12 + (u < 0.6 ? u / 0.6 * 12 : 12 - Math.sin((u - 0.6) / 0.4 * Math.PI) * 1.6);
            coin(c.sx, by, 0.35 + u * 0.3, 0.75, 0.3, Math.min(1, u * 4) * (t > F.ms + F.inMs + 2400 ? 0 : 1), c.sy + 1.2);
            return t < F.ms + F.inMs + 2400;
        });
    }
});
