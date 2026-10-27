// ================= АППАРАТ АЛЧНОСТИ: КОЛЕСО КРУТИТСЯ =================
// Продолжение GreedJunkLit. Колесо (рисунок — greed-junk-wheel.js) на свету
// живёт своим холстом: диск один раз собирается в картинку и крутится её
// поворотом; в корпусе остаются щит и ступица (GreedJunk.wheelApart).
// Свет при этом не крутится вместе с диском: блик сверху-слева и
// затенение края — отдельный неподвижный слой поверх, тень на щит — под.
//
// Палец: колесо идёт за пальцем, на отпускании крутится со скоростью
// броска и тормозит. Слабый бросок — только покачнуть, крутки нет.
// Каждый гвоздь отгибает резиновый язычок — щелчок в палец, к концу всё
// реже; на остановке — удар. Где встанет, решено в момент броска:
// торможение подбирается так, чтобы колесо замерло ровно на нужном
// секторе (onWheel — игра; без неё превью берёт случайный).
Object.assign(GreedJunkLit, {
    // a — торможение трением (рад/мс²) для слабого качания; minW — скорость
    // броска (рад/мс), с которой начинается крутка; turns — сколько оборотов
    // минимум, чтобы крутка читалась круткой
    WHEEL_SPIN: { a: 0.000012, minW: 0.0035, turns: 1.6, flap: 0.5, flapK: 0.02, flapC: 0.012 },

    wheelBox() {
        const W = GreedJunk.SLOTS.wheel, R = GreedJunk.WHEEL.rEdge + 6;
        const x0 = Math.max(0, W.cx - R), y0 = Math.max(0, W.cy - R - 16);
        return { x: x0, y: y0, w: W.cx + R - x0, h: W.cy + R - y0 };
    },

    wheelMountLit(wrap) {
        if (!GreedJunk.wheelShown || !GreedJunk.wheelShown()) return;
        const B = this.wheelBox(), G = GreedJunk, S = this.SCALE, cv = document.createElement('canvas');
        cv.width = Math.round(B.w * S); cv.height = Math.round(B.h * S);
        cv.style.cssText = `position:absolute;left:${B.x / G.W * 100}%;top:${B.y / G.H * 100}%;` +
            `width:${B.w / G.W * 100}%;height:${B.h / G.H * 100}%;z-index:1;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        this.wheelCv = cv;
        this._wheel = { rot: 0, w: 0, st: 'idle', flap: 0, fv: 0, at: 0, shown: null, lastPeg: null };
        this.wheelSprites();
        // палец: схватил диск — крутишь
        const field = (e) => {
            const r = wrap.getBoundingClientRect();
            return [(e.clientX - r.left) / r.width * G.W, (e.clientY - r.top) / r.height * G.H];
        };
        const W = G.SLOTS.wheel, ang = (p) => Math.atan2(p[1] - W.cy, p[0] - W.cx);
        let grab = null;
        wrap.addEventListener('pointerdown', (e) => {
            const p = field(e), M = this._wheel;
            if (Math.hypot(p[0] - W.cx, p[1] - W.cy) > G.WHEEL.rEdge || M.st === 'spin') return;
            e.preventDefault(); e.stopPropagation();
            wrap.setPointerCapture(e.pointerId);
            grab = { a: ang(p), rot: M.rot, hist: [[performance.now(), M.rot]] };
            M.st = 'drag'; M.w = 0;
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!grab) return;
            const M = this._wheel, a = ang(field(e));
            let d = a - grab.a;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            grab.a = a;
            M.rot += d;
            const now = performance.now();
            grab.hist.push([now, M.rot]);
            grab.hist = grab.hist.filter(h => now - h[0] < 90);
        });
        const up = () => {
            if (!grab) return;
            const M = this._wheel, h = grab.hist, now = performance.now();
            grab = null;
            const w = h.length > 1 ? (h[h.length - 1][1] - h[0][1]) / Math.max(16, h[h.length - 1][0] - h[0][0]) : 0;
            this.wheelThrow(w, now);
        };
        wrap.addEventListener('pointerup', up);
        wrap.addEventListener('pointercancel', up);
    },

    // бросок: слабый — колесо докатится трением; сильный — крутка с
    // заранее выбранной остановкой
    wheelThrow(w, now) {
        const M = this._wheel, P = this.WHEEL_SPIN;
        M.w = w; M.at = now;
        if (Math.abs(w) < P.minW) { M.st = 'coast'; return; }
        const n = GreedJunk.WHEEL_SECTORS.length;
        // какой сектор: игра (onWheel → индекс) или случайный в превью
        const idx = this.onWheel ? this.onWheel() : Math.floor(Math.random() * n);
        if (idx === false) { M.st = 'coast'; return; }      // крутка не состоялась
        // угол, при котором сектор idx под язычком: сектор i вверху при rot = −i·2π/n
        const dir = Math.sign(w), sec = Math.PI * 2 / n;
        const want = -idx * sec + (Math.random() - 0.5) * sec * 0.6;
        // путь: не меньше turns оборотов и не меньше, чем докатилось бы само
        const natural = w * w / (2 * P.a);
        const dist = Math.max(P.turns * Math.PI * 2, natural * 0.6), T = Math.PI * 2;
        // первый угол want (по модулю оборота) дальше пути dist по ходу вращения
        const end = dir > 0 ? want + T * Math.ceil((M.rot + dist - want) / T)
                            : want - T * Math.ceil((want - (M.rot - dist)) / T);
        M.st = 'spin'; M.from = M.rot; M.to = end; M.w0 = Math.abs(w);
        // равнозамедленно: путь L при начальной скорости w0 — время 2L/w0
        M.dur = 2 * Math.abs(end - M.rot) / M.w0;
        M.t0 = now;
    },

    wheelStep(now) {
        const M = this._wheel, P = this.WHEEL_SPIN;
        if (!M || !this._wheelSpr) return;
        const dt = Math.min(40, M.at0 ? now - M.at0 : 16);
        M.at0 = now;
        const prev = M.rot;
        if (M.st === 'spin') {
            const u = Math.min(1, (now - M.t0) / M.dur);
            // равнозамедленно: s = L·(2u − u²)
            M.rot = M.from + (M.to - M.from) * (2 * u - u * u);
            if (u >= 1) {
                M.st = 'idle'; M.rot = M.to;
                if (typeof Haptics !== 'undefined') Haptics.impact('heavy');
                if (this.onWheelDone) this.onWheelDone();
            }
        } else if (M.st === 'coast') {
            const s = Math.sign(M.w);
            M.w -= s * P.a * dt * 4;
            if (Math.sign(M.w) !== s) { M.w = 0; M.st = 'idle'; }
            M.rot += M.w * dt;
        }
        // язычок: гвоздь, проходящий под ним, отгибает его по ходу вращения
        const n = GreedJunk.WHEEL_SECTORS.length, sec = Math.PI * 2 / n;
        // угол ближайшего гвоздя к верху: гвозди на границах, (i − ½)·sec + rot
        const off = ((M.rot + sec / 2) % sec + sec) % sec - sec / 2;   // −sec/2..sec/2, 0 — гвоздь под язычком
        const contact = Math.abs(off) < sec * 0.32;
        const pegIdx = Math.round((M.rot + sec / 2) / sec);
        if (contact) {
            // гвоздь толкает кончик в сторону, пока не проскочит
            M.flap = -off / (sec * 0.32) * P.flap;
            M.fv = 0;
        } else {
            M.fv += (-P.flapK * M.flap - P.flapC * M.fv) * dt;
            M.flap += M.fv * dt;
        }
        if (M.lastPeg !== null && pegIdx !== M.lastPeg && M.rot !== prev) {
            // проскочил гвоздь — щелчок (не чаще 30 мс: на полном ходу сливаются)
            if (typeof Haptics !== 'undefined' && now - (M.tickAt || 0) > 30) { Haptics.tick(); M.tickAt = now; }
        }
        M.lastPeg = pegIdx;
        const key = M.rot.toFixed(4) + ',' + M.flap.toFixed(3);
        if (key === M.shown) return;
        M.shown = key;
        this.wheelDraw();
    },

    // ---------- КАРТИНКИ: ОДИН РАЗ ----------
    async wheelSprites() {
        const G = GreedJunk, W = G.WHEEL, S = this.SCALE, R = W.rEdge + 4;
        try {
            G.pass = 'baked';
            const F = G.wheelFace();
            const disc = `<svg xmlns="http://www.w3.org/2000/svg" width="${R * 2 * S}" height="${R * 2 * S}" viewBox="${-R} ${-R} ${R * 2} ${R * 2}">` +
                G.passStyle('baked') + G.defs() + `<style>.fx{display:none}</style>` + F.edge + F.sec + F.chip + F.icons + F.pegs + F.hub + '</svg>';
            const Wc = G.SLOTS.wheel, px = Wc.cx, py = Wc.cy - W.rEdge - 16;
            const ptr = `<svg xmlns="http://www.w3.org/2000/svg" width="${30 * S}" height="${36 * S}" viewBox="${px - 15} ${py - 2} 30 36">` +
                G.passStyle('baked') + G.defs() + G.wheelPointer() + '</svg>';
            const [d, p] = await Promise.all([this.image(disc), this.image(ptr)]);
            this._wheelSpr = { disc: d, ptr: p, R, px, py };
            this._wheel.shown = null;
        } catch (e) {
            // видно в 🐞 на кнопке «Колесо»: на iPhone консоли нет
            this.wheelError = String((e && e.message) || e || 'картинка').slice(0, 40);
            console.warn('[Аппарат] колесо не собралось', e);
        }
    },

    wheelDraw() {
        const M = this._wheel, Sp = this._wheelSpr, B = this.wheelBox(), S = this.SCALE, G = GreedJunk, W = G.SLOTS.wheel, R = G.WHEEL.rEdge;
        const c = this.wheelCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.wheelCv.width, this.wheelCv.height);
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        // тень диска на щит — неподвижна
        c.globalAlpha = 0.4; c.fillStyle = PALETTE.greedJunk.hole;
        c.beginPath(); c.arc(W.cx + 3.5, W.cy + 5.5, R, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        c.save();
        c.translate(W.cx, W.cy); c.rotate(M.rot);
        c.drawImage(Sp.disc, -Sp.R, -Sp.R, Sp.R * 2, Sp.R * 2);
        c.restore();
        // свет не крутится: блик сверху-слева, край снизу-справа в тени
        if (!this._wheelLight) {
            const hi = PALETTE.greedJunk.reel.jar.glassHi, lo = PALETTE.greedJunk.hole;
            const rgba = (h, a) => 'rgba(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',') + ',' + a + ')';
            const g = c.createRadialGradient(W.cx - R * 0.45, W.cy - R * 0.5, R * 0.1, W.cx, W.cy, R * 1.05);
            g.addColorStop(0, rgba(hi, 0.16)); g.addColorStop(0.55, rgba(hi, 0)); g.addColorStop(1, rgba(lo, 0.25));
            this._wheelLight = g;
        }
        c.fillStyle = this._wheelLight;
        c.beginPath(); c.arc(W.cx, W.cy, R, 0, Math.PI * 2); c.fill();
        // язычок: поворачивается вокруг болта на уголке
        const pivX = W.cx, pivY = W.cy - R - 16 + 9.6;
        c.save();
        c.translate(pivX, pivY); c.rotate(M.flap); c.translate(-pivX, -pivY);
        c.drawImage(Sp.ptr, Sp.px - 15, Sp.py - 2, 30, 36);
        c.restore();
    }
});
