// ================= АППАРАТ АЛЧНОСТИ: МОНЕТЫ В ЛОТКЕ =================
// Продолжение GreedJunkLit. Выигрыш высыпается из щели над лотком (CHUTE)
// в форму для хлеба: монеты по одной выскакивают, падают с ускорением,
// стукаются о дно или кучу, подпрыгивают и ложатся под случайным
// наклоном. Куча копится между крутками; лишние — снизу уходят.
//
// Монеты — тем же движком, что куча в рамке окна алчности (GreedCoins:
// спрайты поз из атласа, свет и блик видеокартой от наклона телефона):
// вид и свет одни. Рисуются своим холстом над лотком, обрезанным по проёму
// формы и полосе падения под щелью — внутри формы, за передним бортом.
Object.assign(GreedJunkLit, {
    // участок холста монет в единицах поля
    TRAY_BOX: { x: 108, y: 536, w: 144, h: 42 },
    TRAY: { rad: 5.6, g: 0.0011, max: 70, rate: 55, bounce: 0.28 },
    // сколько монет за тройку (превью; в игре — по выплате)
    TRAY_PAY: { skull: 30, coin: 15, meat: 10, bone: 6, token: 8, shard: 5 },

    // холст монет; wrap — обёртка превью
    trayMount(wrap) {
        const B = this.TRAY_BOX, G = GreedJunk, S = this.SCALE;
        const cv = document.createElement('canvas');
        cv.width = B.w * S; cv.height = B.h * S;
        // обрезка: полоса падения под щелью и проём формы (координаты
        // проёма — из рисунка лотка, coinTray)
        const CH = G.CHUTE, px = (x) => ((x - B.x) / B.w * 100).toFixed(2) + '%', py = (y) => ((y - B.y) / B.h * 100).toFixed(2) + '%';
        const poly = [[CH.x - 4, B.y], [CH.x + CH.w + 4, B.y], [CH.x + CH.w + 4, 548.4], [239, 548.4], [244.5, 572], [115.5, 572], [121, 548.4], [CH.x - 4, 548.4]];
        cv.style.cssText = `position:absolute;${G.css(B)}` +
            `z-index:1;pointer-events:none;background:none;clip-path:polygon(${poly.map(q => px(q[0]) + ' ' + py(q[1])).join(',')})`;
        wrap.appendChild(cv);
        this.trayCv = cv;
        this.tray = { coins: [], falling: [], queue: 0, nextAt: 0, h: new Array(14).fill(0), dirty: true };
    },
    // позы монеты, лежащей в лотке: плашмя или наклонена «верхом» к стене —
    // лоток ниже глаз, монеты видны сверху-спереди
    trayPose(rnd) {
        const P = GreedCoins.poses(), D = Math.PI / 180;
        const ok = [];
        P.forEach((p, i) => { const up = -Math.sin(p.az * D); if (p.m === 0 || (p.m >= 22 && up > 0.5)) ok.push(i); });
        return ok[Math.floor(rnd() * ok.length)];
    },
    coinOf(x, y, pose, ao) {
        const P = GreedCoins.poses(), D = Math.PI / 180, kind = 'gold';
        return { x, y, rad: this.TRAY.rad, ao, pose: P[pose].n, roll: P[pose].roll * D, ci: GreedCoins.KINDS.indexOf(kind) * P.length + pose, kind };
    },
    // выигрыш: n монет высыпать
    trayPour(n) { if (this.tray) this.tray.queue += n; },

    // кадр; true — нарисовать
    trayStep(now) {
        const T = this.tray, K = this.TRAY, G = GreedJunk, TR = G.SLOTS.tray, CH = G.CHUTE;
        if (!T) return false;
        const A = GreedCoins.loadAtlas();
        if (!A.ready) return false;
        if (!this.trayDraw) {
            const B = this.TRAY_BOX;
            this.trayDraw = GreedCoins.batchRenderer(this.trayCv, A.fa, A.fn, A.alb, A.nor, [B.w, B.h]);
            if (!this.trayDraw) { this.tray = null; return false; }
        }
        const dt = Math.min(40, now - (T.last || now));
        T.last = now;
        const rnd = Math.random;
        // выпуск из щели: по одной, rate в секунду
        if (T.queue > 0 && now >= T.nextAt) {
            T.queue--; T.nextAt = now + 1000 / K.rate * (0.6 + rnd() * 0.8);
            const x = CH.x + 3 + rnd() * (CH.w - 6);
            // куда ляжет: случайно по дну, выше там, где уже куча
            const lx = TR.x + 6 + rnd() * (TR.w - 12), col = Math.min(13, Math.floor((lx - TR.x) / TR.w * 14));
            const ly = TR.y + 4 + rnd() * (TR.h - 6) - T.h[col] * 1.1;
            T.falling.push({ x, y: CH.y + 1, vx: (lx - x) / 380, vy: 0.02, lx, ly, col, hit: 0, pose: this.trayPose(rnd), spin: 0 });
        }
        // падение
        T.falling.forEach(c => {
            c.vy += K.g * dt; c.x += c.vx * dt; c.y += c.vy * dt;
            // кувыркается в полёте — меняет позу
            c.spin += dt; if (c.spin > 45) { c.spin = 0; c.pose = this.trayPose(rnd); }
            if (c.y >= c.ly && c.vy > 0) {
                c.y = c.ly; c.hit++;
                if (c.hit === 1 && typeof Haptics !== 'undefined') Haptics.tick();
                if (c.hit >= 2 || c.vy < 0.04) c.done = true;
                else { c.vy = -c.vy * K.bounce; c.vx *= 0.4; }
            }
        });
        const landed = T.falling.filter(c => c.done);
        if (landed.length) {
            T.falling = T.falling.filter(c => !c.done);
            landed.forEach(c => {
                // куча растёт: столбец и соседи
                T.h[c.col] += 0.45;
                if (c.col > 0) T.h[c.col - 1] += 0.2;
                if (c.col < 13) T.h[c.col + 1] += 0.2;
                T.coins.push({ x: c.lx, y: c.ly, pose: this.trayPose(rnd), lift: T.h[c.col] });
            });
            // переполнение: старые (нижние) уходят, куча чуть оседает
            while (T.coins.length > K.max) { T.coins.shift(); T.h = T.h.map(v => Math.max(0, v - 0.04)); }
        }
        const moving = T.falling.length > 0 || T.queue > 0;
        const tilt = this._tilt || { x: 0, y: 0 };
        // блеск куч от наклона — не чаще, чем свет корпуса (LIGHT_MS):
        // каждый раз это все монеты лотка видеокартой
        const tiltMoved = (!T.lt || Math.abs(T.lt.x - tilt.x) > 0.003 || Math.abs(T.lt.y - tilt.y) > 0.003) &&
            now - (T.paintAt || 0) >= this.LIGHT_MS;
        if (!moving && !landed.length && !tiltMoved && !T.dirty) return false;
        T.lt = { x: tilt.x, y: tilt.y }; T.dirty = false; T.paintAt = now;
        this.trayPaint(tilt);
        return true;
    },
    // все монеты: лежащие — сзади вперёд (по y), сверху кучи светлее;
    // падающие — поверх
    trayPaint(tilt) {
        const T = this.tray, B = this.TRAY_BOX, D = this.trayDraw;
        D.begin(tilt);
        const st = (c) => ({ n: c.pose, m: 1, flash: 0, settled: true });
        T.coins.slice().sort((a, b) => a.y - b.y).forEach(c => {
            const k = this.coinOf(c.x - B.x, c.y - B.y, 0, Math.min(1, 0.72 + c.lift * 0.08));
            const P = GreedCoins.poses();
            k.pose = P[c.pose].n; k.roll = P[c.pose].roll * Math.PI / 180; k.ci = c.pose;
            D.add(k, st(k));
        });
        T.falling.forEach(c => {
            const P = GreedCoins.poses(), k = this.coinOf(c.x - B.x, c.y - B.y, 0, 1);
            k.pose = P[c.pose].n; k.roll = P[c.pose].roll * Math.PI / 180; k.ci = c.pose;
            D.add(k, st(k));
        });
        D.flush();
    }
});
