// ================= АППАРАТ АЛЧНОСТИ (ГАРАЖНЫЙ): СТАВКА — СТИКЕРОМ =================
// Игрок, 20.11: ставки — и у гаражного аппарата. На монетоприёмнике уже
// висит стикер с ценой крутки; тап по нему — стикер отрывается за
// загнувшийся уголок, как настоящий: угол тянется, лист отклеивается,
// показывая изнанку, срывается с клеевой полосы и улетает за край, тая.
// Под ним — следующий, другого цвета, будто они наклеены пачкой ровно друг
// на друга: жёлтый ×1, зелёный ×3, синий ×10, фиолетовый ×100; под
// фиолетовым — снова жёлтый.
//
// Вшитый в корпус стикер (greed-junk-wc.js, wcSticker) остаётся под слоем:
// слой рисует стикер текущей ставки ровно поверх, той же формы, на том же
// месте, — вшитого не видно. Рисунок листка — тот же почерк маркером
// (handPath), цифры — JAR_DIGIT (как на скотче банки); надпись в две
// строки: число крупно, ниже «× монета» (в одну строку «100×монета» на
// листке 30 ед. выходила мелкой).
//
// Слой — один холст во всё поле (улетающий листок выходит за свой
// участок), рисуется только во время отрыва и когда сменилась ставка.
Object.assign(GreedJunk, {
    // Стикер ставки bet: как wcSticker, но свой цвет и своё число.
    wcStickerBet(cx, cy, bet) {
        const J = PALETTE.greedJunk, W = J.reel.wc, S = J.reel.betStickers[bet] || J.reel.betStickers[1], f = this.f, ink = J.reel.rag.marker;
        const [col, lo, hi] = S;
        const rnd = this.rng(4242 + bet * 7), sw = 30, sh = 30, x = cx - sw / 2, y = cy - sh / 2;
        const X1 = x + sw, Y1 = y + sh, c = 8, gl = 5;
        const out = this.wcStickerPath(cx, cy);
        const id = 'gj-wc-st' + bet;
        let g = `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1"/></filter>` +
            `<path d="M${f(x + 2)} ${f(Y1 - 3)} Q${f(x + sw * 0.5)} ${f(Y1 + 1.6)} ${f(X1 - 3)} ${f(Y1)} L${f(X1 + 1)} ${f(Y1 - c * 0.7)} L${f(X1 + 2)} ${f(Y1 + 1.6)} L${f(x + 2)} ${f(Y1 + 2)} Z" ` +
            `fill="${J.hole}" opacity="0.6" filter="url(#${id})" transform="translate(0.7 1.2)"/>` +
            `<path d="${out}" fill="${col}" stroke="${lo}" stroke-width="0.4" stroke-linejoin="round"/>` +
            `<path d="M${f(x + 0.3)} ${f(y + gl)} H${f(X1 - 0.3)}" stroke="${lo}" stroke-width="0.3" opacity="0.5"/>` +
            `<rect x="${f(x)}" y="${f(y)}" width="${sw}" height="${gl}" fill="${lo}" opacity="0.14"/>` +
            `<path d="M${f(x + 2)} ${f(Y1 - 1.6)} Q${f(x + sw * 0.5)} ${f(Y1 - 0.7)} ${f(X1 - c * 0.8)} ${f(Y1 - 1.4)}" fill="none" stroke="${hi}" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>` +
            `<path d="M${f(X1 - c * 1.15)} ${f(Y1 - 1.8)} C${f(X1 - c * 0.55)} ${f(Y1 - 2.4)} ${f(X1 - 1.4)} ${f(Y1 - c * 0.6)} ${f(X1 - 1)} ${f(Y1 - c * 1.1)}" fill="none" stroke="${hi}" stroke-width="3" stroke-linecap="round"/>` +
            `<path d="M${f(X1 - c * 1.5)} ${f(Y1 - 0.6)} Q${f(X1 - c * 0.9)} ${f(Y1 - c * 0.8)} ${f(X1 - 0.1)} ${f(Y1 - c * 1.45)}" fill="none" stroke="${lo}" stroke-width="0.4" opacity="0.8"/>`;
        // Число — цифрами маркера (рамка цифры 4×7.4), крупно и по центру
        // листка под клеевой полосой; чем длиннее число, тем уже цифры.
        const digs = String(bet).split(''), n = digs.length, ds = n === 1 ? 1.55 : n === 2 ? 1.35 : 1.0;
        const dw = 4 * ds, gap = 1.2 * ds, rowW = n * dw + (n - 1) * gap, dh = 7.4 * ds;
        const nx = cx - rowW / 2, ny = y + gl + 1.6;
        let num = '';
        digs.forEach((ch, i) => {
            const L = GreedJunkLit.JAR_DIGIT[+ch];
            if (!L) return;
            const r2 = this.rng(1000 + i * 31 + +ch * 7 + bet);
            num += `<g transform="translate(${f(nx + i * (dw + gap))} ${f(ny + (r2() - 0.5) * 0.6)}) rotate(${f((r2() - 0.5) * 5)}) scale(${f(ds)})">` +
                `<path d="${L.map(s => this.handPath(s, r2, false, 0.1)).join(' ')}" fill="none" stroke="${ink}" stroke-width="${f(1.1 / ds)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/></g>`;
        });
        // ниже — «×» и монетка (тот же почерк, что у вшитого «1×монета»);
        // с зазором от числа: впритык они сливались в одно (игрок, 20.11)
        const by = ny + dh + 6.2, bx = cx - 5.2;
        const times = this.handPath([[bx, by - 1.4], [bx + 2.6, by + 1.4]], rnd, false, 0.06) + ' ' + this.handPath([[bx + 2.6, by - 1.4], [bx, by + 1.4]], rnd, false, 0.06);
        const mx = cx + 2.6, my = by - 0.3;
        const coin = this.handOval(mx, my, 3.4, 2.2, rnd, 8) + ' ' +
            this.handPath([[mx - 3.4, my], [mx - 3.2, my + 1.4], [mx - 1.7, my + 3], [mx, my + 3.5], [mx + 1.7, my + 3], [mx + 3.2, my + 1.4], [mx + 3.4, my]], rnd, false, 0.06) + ' ' +
            this.handOval(mx, my, 1.6, 1.0, rnd, 6);
        g += num + `<path d="${times} ${coin}" fill="none" stroke="${ink}" stroke-width="0.95" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
        g += `<ellipse cx="${f(X1 - 4.6)}" cy="${f(y + 8)}" rx="3.4" ry="4.4" fill="${J.tin[700]}" opacity="0.13" filter="url(#${id})"/>` +
            `<path d="M${f(x + 0.5)} ${f(y + gl + 1)} V${f(Y1 - 1.5)}" stroke="${hi}" stroke-width="0.8" opacity="0.7"/>`;
        return `<g transform="rotate(-5 ${f(cx)} ${f(cy)})">${g}</g>`;
    },
    // контур листка (тот же, что у вшитого стикера): верх прямой, бока
    // выгнуты, низ провис, правый нижний угол загнут вверх
    wcStickerPath(cx, cy) {
        const f = this.f, sw = 30, sh = 30, x = cx - sw / 2, y = cy - sh / 2, X1 = x + sw, Y1 = y + sh, c = 8;
        return `M${f(x)} ${f(y)} H${f(X1)} Q${f(X1 + 0.4)} ${f(y + sh * 0.5)} ${f(X1)} ${f(Y1 - c)} ` +
            `C${f(X1 - 0.5)} ${f(Y1 - c * 0.38)} ${f(X1 - c * 0.42)} ${f(Y1 - 1)} ${f(X1 - c)} ${f(Y1 - 0.5)} ` +
            `Q${f(x + sw * 0.45)} ${f(Y1 + 0.9)} ${f(x + 0.4)} ${f(Y1 + 0.2)} Q${f(x - 0.4)} ${f(y + sh * 0.5)} ${f(x)} ${f(y)} Z`;
    }
});

Object.assign(GreedJunkLit, {
    // box — участок поля вокруг стикера (ед.), res — точек холста на единицу;
    // peel — мс отгиба до отрыва, fly — мс полёта прочь
    BET_STICK: { box: 50, res: 4, peel: 560, fly: 480, detach: 0.72 },

    // середина стикера на поле и его масштаб (как в wcOnBox)
    betStickerAt() {
        const G = GreedJunk, [sx, sy] = G.wcStickerAt(), [px, py] = G.wcPt(sx, sy);
        return { sx, sy, px, py, s: G.WC_AT.s };
    },
    // листок ставки — картинкой (плотность res), середина листка — в середине картинки
    betStickerImg(bet) {
        const C = this._betImgs || (this._betImgs = {});
        if (C[bet]) return C[bet];
        const G = GreedJunk, P = this.betStickerAt(), B = this.BET_STICK.box, f = G.f;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(P.px - B / 2)} ${f(P.py - B / 2)} ${B} ${B}" width="${B * this.BET_STICK.res}" height="${B * this.BET_STICK.res}">` +
            `<g transform="translate(${f(P.px)} ${f(P.py)}) scale(${P.s}) translate(${-P.sx} ${-P.sy})">${G.wcStickerBet(P.sx, P.sy, bet)}</g></svg>`;
        C[bet] = this.image(svg).then(img => {
            // в холст: растр SVG — при первой отрисовке, а не при загрузке (грабли 172)
            const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
            cv.getContext('2d').drawImage(img, 0, 0);
            C[bet] = cv; return cv;
        });
        return C[bet];
    },
    betList() { return typeof Backend !== 'undefined' && Backend.greedBets ? Backend.greedBets('slots') : [1]; },
    betNowV1() { const L = this.betList(), b = typeof GreedMinigame !== 'undefined' ? GreedMinigame.bet : null; return L.indexOf(b) >= 0 ? b : L[0]; },

    betMount(wrap) {
        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;background:none';
        wrap.appendChild(cv);
        this.betCv = cv; this._betShown = null; this._betAnim = null;
        // палец — только по листку: невидимый участок над ним
        const P = this.betStickerAt(), hit = document.createElement('div'), R = 21;
        hit.style.cssText = `position:absolute;${GreedJunk.css({ x: P.px - R, y: P.py - R, w: 2 * R, h: 2 * R })}z-index:3;touch-action:none`;
        hit.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.betTap(); });
        wrap.appendChild(hit);
        this.betHit = hit;
        Promise.all(this.betList().map(b => this.betStickerImg(b))).then(() => this.betRefresh());
    },
    // показать стикер текущей ставки (без анимации) — вход, смена извне
    betRefresh() {
        if (!this.betCv || this._betAnim) return;
        const b = this.betNowV1();
        if (b === this._betShown) return;
        const img = this._betImgs && this._betImgs[b];
        if (!(img instanceof HTMLCanvasElement)) return;
        this.betCanvasFit();
        const c = this.betCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.betCv.width, this.betCv.height);
        this.betPlace(c, img);
        this._betShown = b;
    },
    betCanvasFit() {
        const cv = this.betCv, r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        this._betK = cv.width / GreedJunk.W;            // точек на единицу поля
    },
    // листок-картинку — на его место поля
    betPlace(c, img, extra) {
        const P = this.betStickerAt(), B = this.BET_STICK.box, k = this._betK, G = GreedJunk;
        c.setTransform(k, 0, 0, k, (P.px - B / 2) * k, (P.py - B / 2 - G.Y0) * k);
        if (extra) extra(c, B);
        else c.drawImage(img, 0, 0, B, B);
    },

    betTap() {
        const L = this.betList();
        if (L.length < 2 || !this.betCv) return;
        // отрыв ещё идёт — сразу к следующему: досрочно закончить текущий
        if (this._betAnim) { this._betAnim = null; this._betShown = null; }
        const from = this.betNowV1(), to = L[(L.indexOf(from) + 1) % L.length];
        const A = this._betImgs || {};
        if (!(A[from] instanceof HTMLCanvasElement) || !(A[to] instanceof HTMLCanvasElement)) return;
        if (typeof GreedMinigame !== 'undefined') GreedMinigame.bet = to;
        this._betAnim = { from, to, t0: performance.now(), hap: 0 };
        if (typeof Haptics !== 'undefined') Haptics.tick();
        const loop = (now) => { if (!this._betAnim || !this.betCv || !this.betCv.isConnected) return; this.betFrame(now); if (this._betAnim) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
    },

    // ---------- отрыв за уголок ----------
    // Линия сгиба идёт от загнутого правого нижнего угла к левому верхнему
    // (по диагонали листка, с его наклоном −5°). Часть за линией отражена
    // через неё — это отогнутый лоскут, изнанкой к нам: бумага светлая, к
    // сгибу темнее (лист круглится), по сгибу — светлая кромка; под лоскутом
    // тень на листок. Дойдя до клеевой полосы, лист срывается и улетает
    // вверх-влево за край, кувыркаясь и тая.
    betFrame(now) {
        const Q = this.BET_STICK, A = this._betAnim, imgs = this._betImgs, t = now - A.t0;
        this.betCanvasFit();
        const c = this.betCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.betCv.width, this.betCv.height);
        const top = imgs[A.from], under = imgs[A.to];
        this.betPlace(c, under);                                    // следующий — уже под ним
        const B = Q.box, n = B * Q.res, P = this.betStickerAt(), s = P.s;
        // углы листка в его картинке (точки картинки), наклон −5°
        const h = 15 * s * Q.res, a = -5 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cx = n / 2, cy = n / 2;
        const rot = (x, y) => [cx + x * ca - y * sa, cy + x * sa + y * ca];
        const C0 = rot(h, h), TL = rot(-h, -h), D = Math.hypot(TL[0] - C0[0], TL[1] - C0[1]), d = [(TL[0] - C0[0]) / D, (TL[1] - C0[1]) / D];
        const easeIn = (u) => u * u * (3 - 2 * u);
        const up = Math.min(1, t / Q.peel), sFold = D * Q.detach * easeIn(up);
        const peeled = this.betPeel(top, n, C0, d, sFold, A.from);
        if (t < Q.peel) {
            this.betPlace(c, null, (g, Bb) => g.drawImage(peeled, 0, 0, Bb, Bb));
            if (up > 0.15 && !A.hap) { A.hap = 1; if (typeof Haptics !== 'undefined' && Haptics.impact) Haptics.impact('light'); }
            return;
        }
        // полёт: от места — вверх-влево, с поворотом, быстро тает
        const u = Math.min(1, (t - Q.peel) / Q.fly);
        if (A.hap < 2) { A.hap = 2; if (typeof Haptics !== 'undefined') Haptics.tick(); }
        if (u >= 1) { this._betAnim = null; this._betShown = null; this.betRefresh(); return; }
        const e = 1 - Math.pow(1 - u, 2);
        this.betPlace(c, null, (g, Bb) => {
            g.save();
            g.translate(Bb / 2, Bb / 2);
            g.translate(-38 * e - 10 * u, -70 * e - 30 * u * u);
            g.rotate(-0.9 * e);
            g.scale(1 + 0.25 * e, 1 + 0.25 * e);
            g.globalAlpha = Math.max(0, 1 - Math.pow(u, 1.3) * 1.15);
            g.drawImage(peeled, -Bb / 2, -Bb / 2, Bb, Bb);
            g.restore();
        });
    },
    // листок с отогнутым лоскутом (картинка n×n): s — сгиб от угла по d
    betPeel(img, n, C0, d, s, bet) {
        const cv = this._betPeelCv || (this._betPeelCv = document.createElement('canvas')), fl = this._betFlapCv || (this._betFlapCv = document.createElement('canvas'));
        [cv, fl].forEach(x => { if (x.width !== n) { x.width = n; x.height = n; } });
        const g = cv.getContext('2d'), f = fl.getContext('2d'), J = PALETTE.greedJunk.reel.betStickers;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, n, n);
        const F = [C0[0] + d[0] * s, C0[1] + d[1] * s], nrm = [-d[1], d[0]], big = n * 3;
        // полуплоскость «дальше сгиба» (лист лежит) — многоугольник
        const half = (ctx, sign) => {
            ctx.beginPath();
            ctx.moveTo(F[0] + nrm[0] * big, F[1] + nrm[1] * big);
            ctx.lineTo(F[0] - nrm[0] * big, F[1] - nrm[1] * big);
            ctx.lineTo(F[0] - nrm[0] * big + d[0] * big * sign, F[1] - nrm[1] * big + d[1] * big * sign);
            ctx.lineTo(F[0] + nrm[0] * big + d[0] * big * sign, F[1] + nrm[1] * big + d[1] * big * sign);
            ctx.closePath();
        };
        // 1. лежащая часть
        g.save(); half(g, 1); g.clip(); g.drawImage(img, 0, 0); g.restore();
        if (s <= 0.5) return cv;
        // 2. лоскут: отражение листка через сгиб, только по эту сторону
        f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, n, n);
        f.save(); half(f, 1); f.clip();
        const m00 = 1 - 2 * d[0] * d[0], m01 = -2 * d[0] * d[1], m11 = 1 - 2 * d[1] * d[1], k = 2 * (F[0] * d[0] + F[1] * d[1]);
        f.setTransform(m00, m01, m01, m11, k * d[0], k * d[1]);
        f.drawImage(img, 0, 0);
        f.restore();
        // изнанка — того же цвета, бледнее (цветной листок прокрашен насквозь;
        // белая изнанка улетала белым треугольником, а не жёлтым стикером —
        // кадр 20.11): к сгибу темнее (лист круглится), дальше — светлее
        const S = J[bet] || J[1];
        f.globalCompositeOperation = 'source-in';
        const gr = f.createLinearGradient(F[0], F[1], F[0] + d[0] * s, F[1] + d[1] * s);
        gr.addColorStop(0, S[1]); gr.addColorStop(0.15, S[0]); gr.addColorStop(0.6, S[2]); gr.addColorStop(1, S[0]);
        f.fillStyle = gr; f.fillRect(0, 0, n, n);
        f.globalCompositeOperation = 'source-atop';
        f.fillStyle = J.back; f.globalAlpha = 0.28; f.fillRect(0, 0, n, n); f.globalAlpha = 1;
        f.globalCompositeOperation = 'source-over';
        // 3. тень лоскута на листок и сам лоскут
        g.save();
        g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 5 * this.BET_STICK.res; g.shadowOffsetX = 1.2 * this.BET_STICK.res; g.shadowOffsetY = 2 * this.BET_STICK.res;
        g.drawImage(fl, 0, 0);
        g.restore();
        // кромка сгиба
        g.save(); half(g, 1); g.clip();
        g.strokeStyle = S[2]; g.lineWidth = 0.9 * this.BET_STICK.res; g.globalAlpha = 0.8;
        g.beginPath(); g.moveTo(F[0] + nrm[0] * n, F[1] + nrm[1] * n); g.lineTo(F[0] - nrm[0] * n, F[1] - nrm[1] * n);
        g.globalCompositeOperation = 'source-atop'; g.stroke();
        g.restore();
        return cv;
    }
});

// стикер — на аппарат вместе со всем остальным; при возвращении на экран —
// показать текущую ставку (на входе она снова первая)
(function () {
    const L = GreedJunkLit, mount = L.mount;
    L.mount = function (container, opts) {
        const had = !!this.wrapEl, r = mount.call(this, container, opts);
        if (!had && this.wrapEl && !this.betCv) this.betMount(this.wrapEl);
        else if (this.betCv) { this._betShown = null; Promise.resolve(r).then(() => this.betRefresh()); }
        return r;
    };
})();
