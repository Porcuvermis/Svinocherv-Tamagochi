// ================= АППАРАТ АЛЧНОСТИ: КОЛЕСО КРУТИТСЯ =================
// Продолжение GreedJunkLit. Колесо (рисунок — greed-junk-wheel.js) на свету
// живёт своим холстом: диск и резинка язычка — карты цвета, высот и
// материала, свет считает свой шейдер (wheelGL): нормаль крутится с диском,
// свет и тени — нет. В корпусе остаются щит и уголок язычка
// (GreedJunk.wheelApart). Тень диска на щит — свой холст под колесом,
// уходит от света (wheelShadowAt).
//
// Палец: колесо идёт за пальцем, на отпускании крутится со скоростью
// броска и тормозит. Слабый бросок — только покачнуть, крутки нет.
// Каждый гвоздь отгибает резиновый язычок — щелчок в палец, к концу всё
// реже; на остановке — удар. Где встанет, решено в момент броска:
// торможение подбирается так, чтобы колесо замерло ровно на нужном
// секторе (onWheel — игра; без неё превью берёт случайный).
Object.assign(GreedJunkLit, {
    // Колесо тяжёлое: a — торможение (рад/мс²; меньше — дольше катится),
    // maxW — предельная скорость броска: тяжёлое колесо рукой сильно не
    // раскрутить, и между гвоздями при ней не меньше 35 мс — каждый сектор
    // успевает отдать свой толчок в палец. minW — бросок, с которого
    // начинается крутка; turns — минимум оборотов; drag — запаздывание за
    // пальцем (доля пути за кадр); settle — откат назад на остановке:
    // язычок упирается в гвоздь. Язычок: flap — наибольший отгиб (рад),
    // fw/fz — частота и затухание его пружины.
    // Было: легче вдвое, без предела скорости, пружина язычка одним шагом
    // на кадр — на медленном кадре её разносило, язычок бесился и пропадал.
    WHEEL_SPIN: { a: 0.0000028, maxW: 0.011, minW: 0.0035, turns: 2, drag: 0.3, settle: 0.035, settleMs: 380,
        flap: 0.42, fw: 0.05, fz: 0.22 },

    // pad — запас вокруг диска: колесу хватает 6, тени — своего (она
    // размыта и уезжает от света, а край холста резал её прямой линией)
    // Слева поле кончается (x 0): за ним монеты рамки, вторая половина
    // колеса там не рисуется. Язычок торчит за обод — его квадрат (wheelPtr)
    // входит в участок.
    wheelBox(pad = 6) {
        const G = GreedJunk, W = G.SLOTS.wheel, R = W.r + pad, P = this.wheelPtr();
        const x0 = Math.max(0, Math.min(W.cx - R, P.cx - P.hw)), y0 = Math.min(W.cy - R, P.cy - P.hh);
        const x1 = Math.max(W.cx + R, P.cx + P.hw), y1 = Math.max(W.cy + R, P.cy + P.hh);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    // Квадрат резинки язычка на аппарате: середина и полуразмеры (поле).
    // Рисунок язычка — «сверху», 30×36 с серединой на ободе; на место его
    // ставят поворот на POINTER_ANGLE и масштаб колеса (wheelPtrG).
    wheelPtr() {
        const G = GreedJunk, W = G.SLOTS.wheel, k = G.wheelK(), a = G.POINTER_ANGLE, R = G.WHEEL.rEdge * k;
        const side = Math.abs(Math.sin(a)) > 0.5;
        return { cx: W.cx + Math.sin(a) * R, cy: W.cy - Math.cos(a) * R, hw: (side ? 18 : 15) * k, hh: (side ? 15 : 18) * k,
            // болт, на котором качается резинка: в рисунке на 6.4 выше середины
            pivX: Math.sin(a) * 6.4 * k, pivY: -Math.cos(a) * 6.4 * k };
    },

    wheelMountLit(wrap) {
        if (!GreedJunk.wheelShown || !GreedJunk.wheelShown()) return;
        const G = GreedJunk, S = this.SCALE;
        const layer = (B) => {
            const cv = document.createElement('canvas');
            cv.width = Math.round(B.w * S); cv.height = Math.round(B.h * S);
            cv.style.cssText = `position:absolute;${G.css(B)}z-index:1;pointer-events:none;background:none`;
            wrap.appendChild(cv);
            return cv;
        };
        // тень диска на щит — рисуется один раз, от света сдвигается
        // переносом холста (wheelShadowAt); сам диск и язычок — своим
        // шейдером поверх
        this.wheelShadowCv = layer(this.wheelShadowBox());
        // Пачинко стоит — тень колеса двумя слоями. На щит — под коробом
        // (где короб, её закрывает сам короб). На короб — свой слой поверх
        // него, обрезанный по коробу, с малым зазором: короб ближе к колесу,
        // чем щит. Было: одна тень с зазором до щита ложилась и на короб.
        if (this._pach && this.pachShadowCv && this.pachShadowCv.near) {
            const P0 = G.PACH, first = this.pachShadowCv.near.parentNode;
            if (first && first.parentNode === wrap) wrap.insertBefore(this.wheelShadowCv, first);
            // короб на аппарате — увеличенный (PACH_AT): обрезка по нему
            const P = G.pachRect({ x: P0.x0, y: P0.y0, w: P0.x1 - P0.x0, h: P0.y1 - P0.y0 });
            const clip = document.createElement('div');
            clip.style.cssText = `position:absolute;${G.css(P)}overflow:hidden;z-index:1;pointer-events:none`;
            const B = this.wheelShadowBox(), cv = layer(B);
            cv.style.left = `${(B.x - P.x) / P.w * 100}%`; cv.style.top = `${(B.y - P.y) / P.h * 100}%`;
            cv.style.width = `${B.w / P.w * 100}%`; cv.style.height = `${B.h / P.h * 100}%`;
            clip.appendChild(cv);
            wrap.appendChild(clip);
            this.wheelShadowBoxCv = cv;
        }
        this.wheelCv = layer(this.wheelBox());
        this._wheel = { rot: 0, w: 0, st: 'idle', flap: 0, fv: 0, at: 0, shown: null, lastPeg: null, target: 0, mdir: 1 };
        this._wheelP = this.wheelSprites();
        // палец: схватил диск — крутишь
        const field = (e) => G.toField(e, wrap);
        const W = G.SLOTS.wheel, ang = (p) => Math.atan2(p[1] - W.cy, p[0] - W.cx);
        let grab = null;
        wrap.addEventListener('pointerdown', (e) => {
            const p = field(e), M = this._wheel;
            if (Math.hypot(p[0] - W.cx, p[1] - W.cy) > W.r || M.st === 'spin' || M.st === 'settle') return;
            e.preventDefault(); e.stopPropagation();
            wrap.setPointerCapture(e.pointerId);
            grab = { a: ang(p), hist: [[performance.now(), M.rot]] };
            M.st = 'drag'; M.w = 0; M.target = M.rot;
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!grab) return;
            const M = this._wheel, a = ang(field(e));
            let d = a - grab.a;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            grab.a = a;
            // тяжёлое колесо идёт за пальцем с запаздыванием (wheelStep)
            M.target += d;
            const now = performance.now();
            grab.hist.push([now, M.target]);
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
        w = Math.max(-P.maxW, Math.min(P.maxW, w));
        M.w = w;
        if (Math.abs(w) < P.minW) { M.st = 'coast'; return; }
        const SEC = GreedJunk.WHEEL_SECTORS, n = SEC.length;
        // Какой сектор: игра решает ключ (onWheel → 'gold1', 'blank'…, по
        // весам конфига), колесо встаёт на случайный из нарисованных
        // секторов с этим ключом — шанс задаёт конфиг, а не ширина сектора.
        // Без игры (превью) — случайный.
        let idx = Math.floor(Math.random() * n);
        if (this.onWheel) {
            const key = this.onWheel();
            // Крутки нет (нет денег, не куплено, занято): колесо
            // проворачивается и тут же тормозит, будто зажато, — и отказ в
            // палец. Без этого бесплатный холостой проворот читался как
            // крутка без выигрыша.
            if (key === false || key == null) {
                M.st = 'coast'; M.brake = true;
                if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
                return;
            }
            const at = SEC.map((k, i) => k === key ? i : -1).filter(i => i >= 0);
            idx = at.length ? at[Math.floor(Math.random() * at.length)] : idx;
        }
        // угол, при котором сектор idx под язычком: сектор i вверху при
        // rot = −i·2π/n, язычок — на POINTER_ANGLE от верха по часовой
        const dir = Math.sign(w), sec = Math.PI * 2 / n, T = Math.PI * 2;
        const want = GreedJunk.POINTER_ANGLE - idx * sec + (Math.random() - 0.5) * sec * 0.6;
        // путь: не меньше turns оборотов и почти столько, сколько докатилось бы само
        const dist = Math.max(P.turns * T, w * w / (2 * P.a) * 0.85);
        // первый угол want (по модулю оборота) дальше пути dist по ходу вращения
        const end = dir > 0 ? want + T * Math.ceil((M.rot + dist - want) / T)
                            : want - T * Math.ceil((want - (M.rot - dist)) / T);
        // равнозамедленно с той же начальной скоростью, что бросок: время 2L/w0
        M.st = 'spin'; M.from = M.rot; M.to = end; M.dir = dir;
        M.dur = 2 * Math.abs(end - M.rot) / Math.abs(w);
        M.t0 = now;
    },

    wheelStep(now) {
        const M = this._wheel, P = this.WHEEL_SPIN;
        if (!M || !this._wheelSpr) return;
        const dt = Math.min(40, M.at0 ? now - M.at0 : 16);
        M.at0 = now;
        const prev = M.rot;
        if (M.st === 'drag') {
            // за пальцем — с запаздыванием, на любой частоте кадров одинаково
            M.rot += (M.target - M.rot) * (1 - Math.pow(1 - P.drag, dt / 16));
        } else if (M.st === 'spin') {
            const u = Math.min(1, (now - M.t0) / M.dur);
            // равнозамедленно: s = L·(2u − u²)
            M.rot = M.from + (M.to - M.from) * (2 * u - u * u);
            if (u >= 1) {
                M.st = 'settle'; M.rot = M.to; M.t0 = now;
                if (typeof Haptics !== 'undefined') Haptics.impact('heavy', true);
            }
        } else if (M.st === 'settle') {
            // откат: язычок упёрся в гвоздь — колесо подаётся назад и встаёт
            const v = Math.min(1, (now - M.t0) / P.settleMs);
            M.rot = M.to - M.dir * P.settle * Math.sin(v * Math.PI) * (1 - v * 0.4);
            if (v >= 1) {
                M.st = 'idle'; M.rot = M.to;
                if (this.onWheelDone) this.onWheelDone();
            }
        } else if (M.st === 'coast') {
            const sg = Math.sign(M.w);
            // зажатое (крутка не состоялась) тормозит в разы сильнее
            M.w -= sg * P.a * dt * (M.brake ? 28 : 3);
            if (Math.sign(M.w) !== sg) { M.w = 0; M.st = 'idle'; M.brake = false; }
            M.rot += M.w * dt;
        }
        this.wheelFlap(now, dt, M.rot - prev);
        // свет от наклона — не чаще LIGHT_MS, как у корпуса
        const t = this._tilt || { x: 0, y: 0 };
        if (!M.lt || ((Math.abs(t.x - M.lt.x) > 0.002 || Math.abs(t.y - M.lt.y) > 0.002) && now - (M.ltAt || 0) >= this.LIGHT_MS)) {
            M.lt = { x: t.x, y: t.y }; M.ltAt = now; M.shown = null;
            this.wheelShadowAt(this.lightFor(M.lt));
        }
        const key = M.rot.toFixed(4) + ',' + M.flap.toFixed(3);
        if (key === M.shown) return;
        M.shown = key;
        this.wheelDraw();
    },

    // Язычок. Гвоздь, подходящий к нему, плавно отгибает кончик по ходу
    // вращения; проскочив, отпускает — дальше язычок качается пружиной и
    // затухает. Пружина — мелкими шагами по 4 мс: одним шагом на кадр на
    // медленном кадре счёт разносило (язычок бесился и пропадал).
    wheelFlap(now, dt, d) {
        const M = this._wheel, P = this.WHEEL_SPIN, n = GreedJunk.WHEEL_SECTORS.length, sec = Math.PI * 2 / n;
        if (d) M.mdir = Math.sign(d);
        const dir = M.mdir || 1;
        // Ближайший гвоздь к язычку: −sec/2..sec/2, 0 — гвоздь под язычком.
        // Гвоздь i стоит на (i − ½)·sec от верха; под язычком он, когда
        // rot ≡ sec/2 по модулю сектора (язычок на POINTER_ANGLE — плюс он).
        // Было: сдвиг на полсектора не в ту сторону — язычок отгибался в
        // пустом промежутке между гвоздями.
        const base = M.rot - sec / 2 - GreedJunk.POINTER_ANGLE;
        let off = (base % sec + sec) % sec;
        if (off > sec / 2) off -= sec;
        const c = sec * 0.3, along = dir * off;     // < 0 — гвоздь ещё подходит
        // номер промежутка между гвоздями: меняется ровно на гвозде
        const pegIdx = Math.floor(base / sec);
        // canvas: поворот + — по часовой; кончик ниже оси уходит по ходу
        // вращения колеса — значит язычок поворачивается против
        if (d && along > -c && along < c * 0.6) {
            const s = (along + c) / (1.6 * c);
            const f = -dir * P.flap * s * s;
            M.fv = (f - M.flap) / Math.max(4, dt);
            M.flap = f;
        } else {
            for (let t = 0; t < dt; t += 4) {
                const h = Math.min(4, dt - t);
                M.fv += (-P.fw * P.fw * M.flap - 2 * P.fz * P.fw * M.fv) * h;
                M.flap += M.fv * h;
            }
        }
        if (!isFinite(M.flap)) { M.flap = 0; M.fv = 0; }
        M.flap = Math.max(-0.8, Math.min(0.8, M.flap));
        // Каждый гвоздь — свой толчок в палец. Проскочило за кадр два —
        // второй встаёт в очередь и отдаётся следом: сектор не теряется.
        if (M.lastPeg !== null && M.lastPeg !== undefined) M.ticks = (M.ticks || 0) + Math.abs(pegIdx - M.lastPeg);
        M.lastPeg = pegIdx;
        if (M.ticks > 0 && now - (M.tickAt || 0) >= 25) {
            M.ticks = Math.min(M.ticks - 1, 3);
            M.tickAt = now;
            if (typeof Haptics !== 'undefined') Haptics.impact('light', true);
        }
    },

    // ---------- НА СВЕТУ: КАРТЫ И СВОЙ ШЕЙДЕР ----------
    // Колесо — в той же системе материалов и высот, что корпус: диск и
    // резинка язычка рисуются в три карты (цвет, высоты, материал) один раз,
    // а свет считает маленький шейдер на холсте колеса каждый кадр, пока оно
    // движется. Квадрат карты поворачивается вместе с колесом, нормали из
    // карты высот поворачиваются с ним, а свет — нет: блик гвоздей и гаек
    // остаётся сверху-слева, тени от них ложатся от света. Тени — короткий
    // поиск по карте высот (гвозди и гайки низкие). Было: диск — плоская
    // картинка без шейдера, блики крутились вместе с ним.
    async wheelSprites() {
        // R — в единицах рисунка; на аппарате диск крупнее в k раз, и карты
        // растрируются сразу в его настоящий размер (иначе мыло)
        const G = GreedJunk, W = G.WHEEL, S = this.SCALE, R = W.rEdge + 4, k = G.wheelK(), n = Math.round(R * 2 * S * k);
        try {
            const F = () => G.wheelFace();
            // Части диска на своих высотах и материалах. Карта у колеса своя,
            // важна только разница высот — диск опущен к 8: карта кончается
            // на 20 (HMAX − H0), а в корпусе краска колеса стоит на 17.6, и
            // торчащему гвоздю там некуда расти — он обрезался до кнопки.
            const h0 = 8;
            const discFull = (pass) => {
                G.pass = pass;
                const f = F();
                return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="${-R} ${-R} ${R * 2} ${R * 2}">` +
                    G.passStyle(pass) + G.defs() + G.T(h0 - 0.6, 'raw', f.edge) + G.T(h0, 'paint', f.sec + f.chip + f.icons) +
                    G.T(h0 + W.pegUp, 'steel', f.pegs) + G.T(h0 + 1.9, 'steel', f.hub) + '</svg>';
            };
            const Pt = this.wheelPtr();
            const ptr = (pass, part = 'strip') => {
                G.pass = pass;
                return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(Pt.hw * 2 * S)}" height="${Math.round(Pt.hh * 2 * S)}" ` +
                    `viewBox="${Pt.cx - Pt.hw} ${Pt.cy - Pt.hh} ${Pt.hw * 2} ${Pt.hh * 2}">` +
                    G.passStyle(pass) + G.defs() + G.wheelPtrG(G.wheelPointer(part)) + '</svg>';
            };
            const passes = ['albedo', 'height', 'mat'];
            const dm = await Promise.all(passes.map(ps => this.image(discFull(ps))));
            const pm = await Promise.all(passes.map(ps => this.image(ptr(ps))));
            // уголок-держатель — только силуэт для тени (сам он в корпусе)
            const bm = await this.image(ptr('albedo', 'bracket'));
            G.pass = 'baked';
            if (!this.wheelGL(dm, pm, bm)) throw new Error('нет WebGL');
            this._wheelSpr = { R: R * k, ptr: Pt };
            this.wheelShadow();
            this._wheel.shown = null;
        } catch (e) {
            G.pass = 'baked';
            // видно в 🐞 на кнопке «Колесо»: на iPhone консоли нет
            this.wheelError = String((e && e.message) || e || 'картинка').slice(0, 40);
            console.warn('[Аппарат] колесо не собралось', e);
        }
    },

    // свет колеса — общий прибор (greed-junk-lit-device.js)
    wheelGL(dm, pm, bm) {
        const Q = this.deviceGL(this.wheelCv);
        if (!Q) return false;
        Object.assign(Q, { disc: this.deviceSet(Q, dm), ptr: this.deviceSet(Q, pm), brk: this.deviceSet(Q, [bm]) });
        this._wgl = Q;
        return true;
    },

    // Тень диска на щит: мягкий круг ровно под диском — один раз. Куда она
    // ляжет, решает wheelShadowAt. Было: сдвиг вниз-вправо зашит в рисунок,
    // и при наклоне телефона свет на колесе ходил, а тень стояла.
    wheelShadow() {
        const B = this.wheelShadowBox(), S = this.SCALE, W = GreedJunk.SLOTS.wheel, R = W.r, P = this.WHEEL_SHADOW;
        [this.wheelShadowCv, this.wheelShadowBoxCv].forEach((cv, i) => {
            if (!cv) return;
            const c = cv.getContext('2d');
            c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
            // на коробе — ближе, значит чётче
            c.filter = 'blur(' + ((i ? P.blur * 0.5 : P.blur) * S) + 'px)';
            c.globalAlpha = P.a; c.fillStyle = PALETTE.greedJunk.hole;
            c.beginPath(); c.arc(W.cx, W.cy, R, 0, Math.PI * 2); c.fill();
            c.filter = 'none'; c.globalAlpha = 1;
        });
        this.wheelShadowAt(this.lightFor((this._wheel && this._wheel.lt) || { x: 0, y: 0 }));
    },

    // Сдвиг тени от света: диск висит над щитом на gap, тень уходит
    // от света на gap·L.xy/L.z. Переносом холста на видеокарте — без
    // перерисовки. Свет у края наклона почти лежит (L.z до 0.15), тень
    // улетала бы на полколеса — потолок max.
    // Зазор 13: колесо стоит на ступице далеко от щита. Было 7 — тень
    // полоской в 5 единиц, колесо казалось приклеенным к доскам. Чем дальше
    // от щита, тем шире полутень — blur вырос вместе с зазором.
    // boxGap — до короба пачинко: он стоит почти вплотную за колесом
    WHEEL_SHADOW: { gap: 13, max: 18, blur: 4, a: 0.42, boxGap: 3 },
    wheelShadowBox() { return this.wheelBox(this.WHEEL_SHADOW.blur * 3); },
    wheelShadowAt(L) {
        const P = this.WHEEL_SHADOW, B = this.wheelShadowBox();
        [[this.wheelShadowCv, P.gap], [this.wheelShadowBoxCv, P.boxGap]].forEach(([cv, gap]) => {
            if (!cv) return;
            let dx = -L[0] / L[2] * gap, dy = -L[1] / L[2] * gap;
            const d = Math.hypot(dx, dy), max = P.max * gap / P.gap;
            if (d > max) { dx *= max / d; dy *= max / d; }
            cv.style.transform = `translate(${(dx / B.w * 100).toFixed(2)}%, ${(dy / B.h * 100).toFixed(2)}%)`;
        });
    },

    // высота резинки язычка над краской диска: чуть выше шляпок гвоздей
    // (WHEEL.pegUp), об которые она бьёт
    WHEEL_FLAP_UP: 11,

    wheelDraw() {
        const M = this._wheel, Sp = this._wheelSpr, Q = this._wgl, B = this.wheelBox(), G = GreedJunk, W = G.SLOTS.wheel;
        if (!Q) return;
        const L = this.lightFor(M.lt || { x: 0, y: 0 }), n = Math.hypot(L[0], L[1], L[2]) || 1;
        this.deviceBegin(Q, L);
        const draw = (set, cx, cy, hw, hh, rot, pivX, pivY) => this.deviceDraw(Q, B, set, cx, cy, hw, hh, rot, pivX, pivY);
        // диск: квадрат карты вокруг центра, поворот вокруг центра
        draw(Q.disc, W.cx, W.cy, Sp.R, Sp.R, M.rot, 0, 0);
        // резинка: свой квадрат (wheelPtr), поворот вокруг болта
        const Pt = Sp.ptr, pcx = Pt.cx, pcy = Pt.cy;
        // Тень резинки на диск: тот же квадрат с тем же поворотом, сдвинутый
        // от света на высоту резинки над краской (она перед шляпками
        // гвоздей). Смешение только темнит цвет и не трогает прозрачность:
        // где диска нет (щит над ободом), тень не рисуется — там она легла
        // бы дальше, и её место — в корпусе.
        // Вместе с ней — тень уголка-держателя: без неё тень резинки висела
        // на диске сама по себе, оторванной полоской (на iPhone при наклоне
        // уезжала на 20–30 единиц). Сдвиг — не дальше, чем ищутся тени
        // гвоздей в шейдере (16×3 текселя = 16 единиц): иначе у пологого
        // света гвозди дают полосу до 16, а резинка улетает вдвое дальше.
        const ux = L[0] / n, uy = L[1] / n, uz = Math.max(0.15, L[2] / n), up = this.WHEEL_FLAP_UP;
        let sx = -ux / uz * up, sy = -uy / uz * up;
        const sd = Math.hypot(sx, sy);
        if (sd > 16) { sx *= 16 / sd; sy *= 16 / sd; }
        this.deviceShade(Q, 0.5);
        draw(Q.brk, pcx + sx, pcy + sy, Pt.hw, Pt.hh, 0, 0, 0);
        draw(Q.ptr, pcx + sx, pcy + sy, Pt.hw, Pt.hh, M.flap, Pt.pivX, Pt.pivY);
        this.deviceShade(Q, 0);
        draw(Q.ptr, pcx, pcy, Pt.hw, Pt.hh, M.flap, Pt.pivX, Pt.pivY);
    }
});
