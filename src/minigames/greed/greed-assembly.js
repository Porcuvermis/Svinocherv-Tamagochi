// ================= АППАРАТ АЛЧНОСТИ: СБОРКА ИГРЫ ПО ЗАПЧАСТЯМ =================
// Колесо открыто в банке-магазине — и на глазах у игрока, сквозь стекло
// банки, собирается на своём месте (docs/plan/31-greed-premium.md, «Открытие
// игры»): крепления у гаражного аппарата уже стоят (гнездо с проводами),
// прилетают доски щита, саморезы, которые его держат, голый диск (краска
// без значков), в него по одному — гвозди-колышки, резинка язычка; потом
// колесо крутанётся «на проверку», и значки проявятся на секторах, когда те
// выходят из-за невидимой половины колеса (под монетами рамки).
//
// Как без скачка в конце. Картинки деталей снимаются с УЖЕ собранного
// аппарата: он пересобирается с колесом под стоп-кадром прежнего, с нового
// вырезаются доски, саморезы, диск и язычок. Диск — тем же шейдером в трёх
// видах (голый, с колышками, целиком): колышки и значки — разница между
// ними. Всё нарисовано при повороте колеса, на котором оно встанет, и
// поворачивается на холсте: в конце поворот ноль — ровно то, что под ним.
//
// Дёшево (игрок, 17.11: «тоже лагает»): два холста. Нижний — стоп-кадр и
// всё, что уже легло; перерисовывается, только когда деталь легла. Верхний —
// только летящие детали и крутящийся диск.
const GreedAssembly = {
    // место игры на поле: под стоп-кадр прежнего аппарата
    REGIONS: { wheel: { x0: 0, y0: -57, x1: 207, y1: 293 }, pach: { x0: 204, y0: -57, x1: 360, y1: 293 } },

    wheel(lower) { return this.run('wheel', lower); },
    pachinko(lower) { return this.run('pach', lower); },

    async run(game, lower) {
        const L = GreedJunkLit, host = L.wrapEl && L.wrapEl.parentElement;
        if (!host || !L.gl) { if (GreedDebug && GreedDebug.rebuild) await GreedDebug.rebuild(); return; }
        this.setup(host);
        this.snap = this.snapshot(host);
        this.mode = 'full'; this.parts = []; this.fade = 1; this.spin = null; this.spinOn = false; this.glint = null;
        this.REGION = this.REGIONS[game];
        this.paintBase();
        const lowered = new Promise(r => setTimeout(r, 450)).then(() => lower ? lower() : null);
        // Под стоп-кадром — аппарат с колесом. Ждём корпус и колесо, но не
        // рычаг. Подготовка картинок рычага (растр SVG и чтение пикселей —
        // секунды процессора) отложена до конца сборки: она шла одновременно
        // с полётом досок, и начало сборки рвалось (игрок, 17.11; замер
        // assembly-jank.js — задача 2,7 с через 0,8 с после старта).
        const P = GreedDebug.pristine, prep = P.prepareLever;
        let release; const after = new Promise(r => { release = r; });
        P.prepareLever = function () { return after.then(() => prep.call(GreedJunkLit)); };
        this.release = () => { P.prepareLever = prep; release(); };
        await GreedDebug.rebuild();
        await Promise.all([L._mountP, game === 'wheel' ? L._wheelP : L._pachP].map(p => Promise.resolve(p).catch(() => {})));
        const sets = game === 'wheel' ? await this.discSets() : await this.pachSets();
        await lowered;
        this.parts = game === 'wheel' ? this.cut(sets) : this.cutPach(sets);
        this.mode = 'part';
        this.paintBase();
        // Первая отрисовка слоёв — до старта часов: её тяжёлый кадр приходится
        // на неподвижную картинку, а не на первые кадры полёта досок.
        this.t0 = performance.now() + 1e9; this.frame(performance.now());
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        this.t0 = performance.now();
        this.loop();
        const end = this.END + 0.15;
        await new Promise(r => setTimeout(r, end * 1000));
        const f0 = performance.now();
        await new Promise(r => { const st = () => { this.fade = 1 - (performance.now() - f0) / 250; this.base.style.opacity = this.fly.style.opacity = Math.max(0, this.fade); if (this.fade > 0) requestAnimationFrame(st); else r(); }; st(); });
        this.stop = true; this.base.remove(); this.fly.remove(); this.base = this.fly = null;
        // Рычаг готовится, когда банка села на место (магазин закрыт) или
        // через 4 с, если игрок остался в магазине: его подготовка — секунды
        // процессора и роняла кадры подъёма и закрытия банки.
        if (this.release) this.relTimer = setTimeout(() => this.flushRelease(), 4000);
    },
    flushRelease() {
        clearTimeout(this.relTimer);
        const rel = this.release; this.release = null;
        if (rel) rel();
    },

    setup(host) {
        [this.base, this.fly].forEach(c => c && c.remove());
        const W = host.offsetWidth, H = host.offsetHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
        // Верхний холст (летящее) — в точках экрана без умножения: он
        // перерисовывается каждый кадр, и полноэкранный холст в 4 раза
        // больше по точкам стоил переноса в видеокарту ~30 мс на кадр при
        // процессоре ×4 (assembly-jank.js). Летящее размыто движением —
        // чёткость там не видна.
        const mk = (q = dpr) => {
            const cv = document.createElement('canvas'); cv.width = Math.round(W * q); cv.height = Math.round(H * q); cv.q = q;
            // над аппаратом, под банкой (z 6) и под рамкой из монет
            cv.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:5;pointer-events:none;background:none`;
            host.appendChild(cv); return cv;
        };
        this.base = mk(); this.fly = mk(1);
        this.host = host; this.dpr = dpr; this.stop = false;
    },
    scene(x, y) {
        const w = GreedJunkLit.wrapEl, k = w.offsetWidth / GreedJunk.W;
        return [w.offsetLeft + x * k, w.offsetTop + (y - GreedJunk.Y0) * k, k];
    },
    // Все видимые холсты аппарата — в одну картинку. Холсты видеокарты
    // снимаются в той же задаче, что отрисованы.
    snapshot(host) {
        const L = GreedJunkLit, cv = document.createElement('canvas');
        cv.width = this.base.width; cv.height = this.base.height;
        const c = cv.getContext('2d'), hr = host.getBoundingClientRect(), s = hr.width / host.offsetWidth;
        try { if (L.draw) L.draw(L.lightFor({ x: 0, y: 0 })); if (L.wheelDraw && L._wgl) L.wheelDraw(); if (L.pachDraw) L.pachDraw(); } catch (e) { /* что есть */ }
        L.wrapEl.querySelectorAll('canvas').forEach((el) => {
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') return;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            c.globalAlpha = +st.opacity || 1;
            try { c.drawImage(el, (r.left - hr.left) / s * this.dpr, (r.top - hr.top) / s * this.dpr, r.width / s * this.dpr, r.height / s * this.dpr); } catch (e) { /* пусто */ }
        });
        c.globalAlpha = 1;
        return cv;
    },

    // ---------- диск в трёх видах (тем же шейдером колеса) ----------
    // голый — краска, торец, ступица; с колышками; целиком (значки) — уже есть
    async discSets() {
        const L = GreedJunkLit, G = GreedJunk, W = G.WHEEL, S = L.SCALE, R = W.rEdge + 4, k = G.wheelK(), n = Math.round(R * 2 * S * k);
        const Q = L._wgl;
        if (!Q) return null;
        const svg = (pass, pegs) => {
            G.pass = pass;
            const f = G.wheelFace(), h0 = 8;
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="${-R} ${-R} ${R * 2} ${R * 2}">` +
                G.passStyle(pass) + G.defs() + G.T(h0 - 0.6, 'raw', f.edge) + G.T(h0, 'paint', f.sec + f.chip) +
                (pegs ? G.T(h0 + W.pegUp, 'steel', f.pegs) : '') + G.T(h0 + 1.9, 'steel', f.hub) + '</svg>';
        };
        const set = async (pegs) => {
            const maps = await Promise.all(['albedo', 'height', 'mat'].map(p => L.image(svg(p, pegs))));
            G.pass = 'baked';
            return L.deviceSet(Q, maps);
        };
        return { bare: await set(false), pegs: await set(true) };
    },

    // ---------- детали с собранного аппарата ----------
    cut(discs) {
        const L = GreedJunkLit, G = GreedJunk, S = L.SCALE, body = L._glCanvas, Sh = G.SHIELD, parts = [];
        L.draw(L.lightFor({ x: 0, y: 0 }));
        const crop = (x, y, w, h) => {
            const cv = document.createElement('canvas'); cv.width = Math.round(w * S); cv.height = Math.round(h * S);
            cv.getContext('2d').drawImage(body, x * S, (y - G.Y0) * S, w * S, h * S, 0, 0, cv.width, cv.height);
            return cv;
        };
        const bw = Sh.w / Sh.boards, bolts = [];
        for (let i = 0; i < Sh.boards; i++) {
            const x = Sh.x + bw * (i + 0.5);
            [[x - 5, Sh.y + 6], [x + 5, Sh.y + 6], [x - 5, Sh.y + Sh.h - 6], [x + 5, Sh.y + Sh.h - 6]].forEach(p => bolts.push(p));
        }
        const br = 3.4, boltCv = bolts.map(([x, y]) => {
            const cv = crop(x - br, y - br, br * 2, br * 2), g = cv.getContext('2d');
            g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.arc(br * S, br * S, (br - 0.4) * S, 0, 7); g.fill();
            return cv;
        });
        // доски — без саморезов (место самореза заклеено той же доской ниже)
        [2, 1, 3, 0, 4].forEach((i, n) => {
            const x0 = Sh.x + bw * i, cv = crop(x0, Sh.y - 1, bw, Sh.h + 2), g = cv.getContext('2d');
            bolts.forEach(([bx, by]) => {
                if (bx < x0 || bx > x0 + bw) return;
                const lx = (bx - x0) * S, ly = (by - Sh.y + 1) * S, dy = (by < Sh.y + Sh.h / 2 ? 9 : -9) * S;
                g.save(); g.beginPath(); g.arc(lx, ly, br * S, 0, 7); g.clip();
                g.drawImage(cv, 0, dy, cv.width, cv.height, 0, 0, cv.width, cv.height); g.restore();
            });
            parts.push({ kind: 'board', cv, x: x0, y: Sh.y - 1, w: bw, h: Sh.h + 2, at: n * 0.13, dur: 0.42, s0: 2.6, rot0: (n % 2 ? 1 : -1) * 0.35, from: n % 2 ? -1 : 1 });
        });
        boltCv.forEach((cv, i) => {
            const [x, y] = bolts[i];
            parts.push({ kind: 'bolt', cv, x: x - br, y: y - br, w: br * 2, h: br * 2, at: 0.85 + i * 0.035, dur: 0.3, s0: 4.5, spin: 9, from: i % 2 ? -1 : 1, tick: i % 2 === 0 });
        });
        // диск: голый, с колышками, целиком — с холста колеса при его повороте
        const Q = L._wgl, Sp = L._wheelSpr, M = L._wheel, B = L.wheelBox(), W = G.SLOTS.wheel;
        this.END = 2.0;
        if (Q && Sp && M && discs) {
            const light = L.lightFor(M.lt || { x: 0, y: 0 });
            const grab = (draw) => {
                L.deviceBegin(Q, light); draw();
                const cv = document.createElement('canvas'); cv.width = L.wheelCv.width; cv.height = L.wheelCv.height;
                cv.getContext('2d').drawImage(L.wheelCv, 0, 0); return cv;
            };
            // Диск — ЦЕЛИКОМ (не по видимому участку): его вращают, и
            // половина за краем поля выезжает на виду. Нарисован при повороте
            // 0, на холсте поворачивается на нужный угол.
            const DS = Sp.R * 2, px = Math.round(DS * S);
            const disc = (set) => L.deviceSprite(Q, set, px, px, light);
            const bare = disc(discs.bare), withPegs = disc(discs.pegs), full = disc(Q.disc);
            const Pt = Sp.ptr;
            const ptr = grab(() => { L.deviceDraw(Q, B, Q.brk, Pt.cx, Pt.cy, Pt.hw, Pt.hh, 0, 0, 0); L.deviceDraw(Q, B, Q.ptr, Pt.cx, Pt.cy, Pt.hw, Pt.hh, M.flap, Pt.pivX, Pt.pivY); });
            L.wheelDraw();
            // колышки и значки — разница между видами диска
            const diff = (a, b, grow) => {
                const w = a.width, h = a.height, A = a.getContext('2d').getImageData(0, 0, w, h), Bd = b.getContext('2d').getImageData(0, 0, w, h).data;
                const m = new Uint8Array(w * h);
                for (let i = 0, p = 0; p < m.length; p++, i += 4) {
                    const d = Math.abs(A.data[i] - Bd[i]) + Math.abs(A.data[i + 1] - Bd[i + 1]) + Math.abs(A.data[i + 2] - Bd[i + 2]) + Math.abs(A.data[i + 3] - Bd[i + 3]);
                    m[p] = d > 18 ? 1 : 0;
                }
                // расширить на grow (два прохода по осям)
                const m2 = new Uint8Array(w * h), m3 = new Uint8Array(w * h);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let on = 0; for (let dx = -grow; dx <= grow && !on; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && m[y * w + xx]) on = 1; } m2[y * w + x] = on; }
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let on = 0; for (let dy = -grow; dy <= grow && !on; dy++) { const yy = y + dy; if (yy >= 0 && yy < h && m2[yy * w + x]) on = 1; } m3[y * w + x] = on; }
                const out = document.createElement('canvas'); out.width = w; out.height = h;
                const o = out.getContext('2d'), img = o.createImageData(w, h);
                for (let p = 0, i = 0; p < m3.length; p++, i += 4) if (m3[p]) { img.data[i] = A.data[i]; img.data[i + 1] = A.data[i + 1]; img.data[i + 2] = A.data[i + 2]; img.data[i + 3] = A.data[i + 3]; }
                o.putImageData(img, 0, 0);
                return out;
            };
            const pegLayer = diff(withPegs, bare, 2), icons = diff(full, withPegs, 2);
            const n = G.WHEEL_SECTORS.length, kk = G.wheelK(), rp = G.WHEEL.rPeg * kk, sc = px / DS;
            const DX = W.cx - Sp.R, DY = W.cy - Sp.R;
            // диск ляжет на пол-оборота раньше финального угла — проверка докрутит
            const Rd = M.rot - Math.PI;
            parts.push({ kind: 'disc', cv: bare, x: DX, y: DY, w: DS, h: DS, at: 1.75, dur: 0.62, s0: 2.3, spin: -2.2, base: Rd, pivot: [W.cx, W.cy], from: 1, shadow: L.wheelShadowCv, heavy: true });
            const pr = 5.2;
            for (let i = 0; i < n; i++) {
                const a = (i - 0.5) / n * Math.PI * 2 - Math.PI / 2, x = W.cx + Math.cos(a) * rp, y = W.cy + Math.sin(a) * rp;
                const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(pr * 2 * sc);
                cv.getContext('2d').drawImage(pegLayer, (x - pr - DX) * sc, (y - pr - DY) * sc, pr * 2 * sc, pr * 2 * sc, 0, 0, cv.width, cv.height);
                // колышек летит в своё место на диске, повёрнутом на Rd; видимые — первыми
                parts.push({ kind: 'peg', cv, x: x - pr, y: y - pr, w: pr * 2, h: pr * 2, dur: 0.24, s0: 5, from: i % 2 ? -1 : 1, orbit: [W.cx, W.cy, Rd], tick: true, vis: Math.cos(a + Rd) });
            }
            parts.filter(p => p.kind === 'peg').sort((a, b) => b.vis - a.vis).forEach((p, j) => { p.at = 2.4 + j * 0.05; });
            const pegEnd = 2.4 + n * 0.05 + 0.24;
            parts.push({ kind: 'ptr', cv: ptr, x: B.x, y: B.y, w: B.w, h: B.h, at: pegEnd + 0.05, dur: 0.3, s0: 2, from: -1, pivot: [Pt.cx, Pt.cy] });
            // Проверка: колесо крутанули — полтора оборота с затуханием; значки
            // проявляются на секторах, когда те выходят из-за невидимой
            // половины колеса (под монетами рамки слева).
            this.spin = { at: pegEnd + 0.45, dur: 1.9, withPegs, icons, box: { x: DX, y: DY, w: DS, h: DS }, pivot: [W.cx, W.cy], from: Rd - 2 * Math.PI, to: M.rot, n, seen: new Array(n).fill(false), shadow: L.wheelShadowCv };
            this.END = this.spin.at + this.spin.dur;
        }
        return parts;
    },

    // ---------- пачинко ----------
    // Короб тем же шейдером слоями: каждый следующий вид — плюс одна часть
    // (рама, поле со стоком, дуга с дорожкой, лунки, гвозди, уголки и
    // саморезы стекла, кнопка). Детали — разница соседних видов, порезанная
    // по местам (игрок, 18.11: «короб — на детали поменьше, не одним куском»).
    PACH_LAYERS: ['frame', 'field', 'steel', 'cups', 'nails', 'corners'],
    async pachSets() {
        const L = GreedJunkLit, G = GreedJunk, P = G.PACH, Q = L._pgl, S = L.SCALE, B = L.pachBox();
        if (!Q) return null;
        const svg = (pass, n) => {
            G.pass = pass;
            const p = G.pachParts();
            const T = { frame: G.T(12, 'raw', p.frame), field: G.T(2, 'paint', p.field) + G.T(2, 'raw', p.drain), steel: G.T(6.5, 'steel', p.steel),
                cups: G.T(6, 'paint', p.cups), nails: G.T(2 + P.nailUp, 'steel', p.nails), corners: G.T(13, 'steel', p.corners) };
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(B.w * S)}" height="${Math.round(B.h * S)}" viewBox="${B.x} ${B.y} ${B.w} ${B.h}">` +
                G.passStyle(pass) + G.defs() + this.PACH_LAYERS.slice(0, n).map(k => T[k]).join('') + '</svg>';
        };
        const sets = {};
        for (let n = 1; n <= this.PACH_LAYERS.length; n++) {
            const maps = await Promise.all(['albedo', 'height', 'mat'].map(ps => L.image(svg(ps, n))));
            G.pass = 'baked';
            sets[this.PACH_LAYERS[n - 1]] = L.deviceSet(Q, maps);
        }
        return sets;
    },
    // разница двух картинок (что появилось во второй), расширенная на grow
    diff(a, b, grow) {
        const w = a.width, h = a.height, A = a.getContext('2d').getImageData(0, 0, w, h), Bd = b.getContext('2d').getImageData(0, 0, w, h).data;
        const m = new Uint8Array(w * h), m2 = new Uint8Array(w * h), m3 = new Uint8Array(w * h);
        for (let i = 0, p = 0; p < m.length; p++, i += 4) m[p] = (Math.abs(A.data[i] - Bd[i]) + Math.abs(A.data[i + 1] - Bd[i + 1]) + Math.abs(A.data[i + 2] - Bd[i + 2]) + Math.abs(A.data[i + 3] - Bd[i + 3])) > 18 ? 1 : 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let on = 0; for (let dx = -grow; dx <= grow && !on; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && m[y * w + xx]) on = 1; } m2[y * w + x] = on; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let on = 0; for (let dy = -grow; dy <= grow && !on; dy++) { const yy = y + dy; if (yy >= 0 && yy < h && m2[yy * w + x]) on = 1; } m3[y * w + x] = on; }
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        const o = out.getContext('2d'), img = o.createImageData(w, h);
        for (let p = 0, i = 0; p < m3.length; p++, i += 4) if (m3[p]) { img.data[i] = A.data[i]; img.data[i + 1] = A.data[i + 1]; img.data[i + 2] = A.data[i + 2]; img.data[i + 3] = A.data[i + 3]; }
        o.putImageData(img, 0, 0);
        return out;
    },
    // кусок картинки src, покрывающей box поля, → холст участка r поля
    sub(src, box, r) {
        const sx = src.width / box.w, sy = src.height / box.h, cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(r.w * sx)); cv.height = Math.max(1, Math.round(r.h * sy));
        cv.getContext('2d').drawImage(src, (r.x - box.x) * sx, (r.y - box.y) * sy, r.w * sx, r.h * sy, 0, 0, cv.width, cv.height);
        return cv;
    },
    cutPach(sets) {
        const L = GreedJunkLit, G = GreedJunk, S = L.SCALE, body = L._glCanvas, Sh = G.PACH_SHIELD, P = G.PACH, parts = [];
        L.draw(L.lightFor({ x: 0, y: 0 }));
        const s = G.PACH_AT.s, R = (x, y, w, h) => G.pachRect({ x, y, w, h });
        const crop = (r) => this.sub(body, { x: 0, y: G.Y0, w: G.W, h: G.H }, r);
        // доски щита и саморезы (в пространстве короба → поле)
        const bw = Sh.w / Sh.boards, bolts = [];
        for (let i = 0; i < Sh.boards; i++) {
            const x = Sh.x + bw * (i + 0.5);
            [[x - 5, Sh.y + 6], [x + 5, Sh.y + 6], [x - 5, Sh.y + Sh.h - 6], [x + 5, Sh.y + Sh.h - 6]].forEach(p => bolts.push(G.pachPt(...p)));
        }
        const br = 3.4 * s;
        [1, 0, 2].forEach((i, n) => {
            const r = R(Sh.x + bw * i, Sh.y - 1, bw, Sh.h + 2), cv = crop(r), g = cv.getContext('2d'), k = cv.width / r.w;
            bolts.forEach(([bx, by]) => {
                if (bx < r.x || bx > r.x + r.w) return;
                const dy = (by < r.y + r.h / 2 ? 9 : -9) * s * k;
                g.save(); g.beginPath(); g.arc((bx - r.x) * k, (by - r.y) * k, br * k, 0, 7); g.clip();
                g.drawImage(cv, 0, dy, cv.width, cv.height, 0, 0, cv.width, cv.height); g.restore();
            });
            parts.push({ kind: 'board', cv, x: r.x, y: r.y, w: r.w, h: r.h, at: n * 0.13, dur: 0.42, s0: 2.6, rot0: (n % 2 ? 1 : -1) * 0.35, from: n % 2 ? -1 : 1 });
        });
        bolts.forEach(([x, y], i) => {
            const cv = crop({ x: x - br, y: y - br, w: br * 2, h: br * 2 }), g = cv.getContext('2d'), k = cv.width / (br * 2);
            g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.arc(br * k, br * k, (br - 0.4) * k, 0, 7); g.fill();
            parts.push({ kind: 'bolt', cv, x: x - br, y: y - br, w: br * 2, h: br * 2, at: 0.55 + i * 0.035, dur: 0.3, s0: 4.5, spin: 9, from: i % 2 ? -1 : 1, tick: i % 2 === 0 });
        });
        // полка под коробом с кабелем — от низа короба до табло
        const yb = G.pachPt(0, P.y1)[1] - 6, shelf = { x: 204, y: yb, w: 136, h: 292 - yb };
        parts.push({ kind: 'shelf', cv: crop(shelf), x: shelf.x, y: shelf.y, w: shelf.w, h: shelf.h, at: 1.05, dur: 0.38, s0: 2, from: 1 });
        this.END = 1.6;
        const Q = L._pgl;
        if (!Q || !sets) return parts;
        // короб в четырёх видах — картинками его настоящего размера на аппарате
        const B0 = L.pachBox(), BX = G.pachRect(B0), px = Math.round(BX.w * S), py = Math.round(BX.h * S);
        const light = L.lightFor((L._tilt) || { x: 0, y: 0 });
        const shot = (set) => L.deviceSprite(Q, set, px, py, light);
        const V = {};
        this.PACH_LAYERS.forEach(k => { V[k] = shot(sets[k]); });
        V.full = shot(Q.box);
        const lay = { field: this.diff(V.field, V.frame, 1), steel: this.diff(V.steel, V.field, 2), cups: this.diff(V.cups, V.steel, 2),
            nails: this.diff(V.nails, V.cups, 2), corners: this.diff(V.corners, V.nails, 2), button: this.diff(V.full, V.corners, 2) };
        const sh = L.pachShadowCv ? [L.pachShadowCv.far, L.pachShadowCv.near] : null;
        const fx0 = P.x0 + P.wall, fx1 = P.x1 - P.wall, fy0 = P.y0 + P.top, fy1 = P.y1 - P.panel, A = P.arc;
        const piece = (src, r, o) => Object.assign({ cv: this.sub(src, BX, r), x: r.x, y: r.y, w: r.w, h: r.h }, o);
        let t = 1.4;
        // задняя стенка: лист рамы между стенками — первым, с тенью
        parts.push(piece(V.frame, R(fx0, fy0, fx1 - fx0, fy1 - fy0), { kind: 'back', at: t, dur: 0.5, s0: 2.2, rot0: 0.25, from: -1, shadow: sh, heavy: true }));
        t += 0.45;
        // боковины, верх и нижняя панель — с четырёх сторон, по очереди
        [[R(P.x0 - 1, P.y0 - 1, P.wall + 1, P.y1 - P.y0 + 2), -1, 0.2], [R(fx1, P.y0 - 1, P.wall + 1, P.y1 - P.y0 + 2), 1, -0.2],
         [R(fx0, P.y0 - 1, fx1 - fx0, P.top + 1), -1, 0.1], [R(fx0, fy1, fx1 - fx0, P.panel + 1), 1, -0.1]].forEach(([r, from, rot0], n) => {
            parts.push(piece(V.frame, r, { kind: 'wall', at: t + n * 0.12, dur: 0.36, s0: 2.4, rot0, from, tick: true }));
        });
        t += 0.6;
        // поле фанерой со стоком — в заднюю стенку
        parts.push(piece(lay.field, R(fx0 - 0.5, fy0 - 0.5, fx1 - fx0 + 1, fy1 - fy0 + 1), { kind: 'field', at: t, dur: 0.4, s0: 1.8, from: 1 }));
        t += 0.45;
        // игровые элементы: дуга сверху, перегородка с пружиной дорожки
        const arcR = R(fx0, fy0, fx1 - fx0, A.cy + 4 - fy0), laneR = R(P.sep - 3, A.cy + 4, fx1 - P.sep + 3, fy1 - A.cy - 4);
        parts.push(piece(lay.steel, arcR, { kind: 'arc', at: t, dur: 0.38, s0: 2.6, rot0: -0.4, from: -1, tick: true }));
        parts.push(piece(lay.steel, laneR, { kind: 'lane', at: t + 0.15, dur: 0.34, s0: 2.6, rot0: 0.3, from: 1, tick: true }));
        t += 0.6;
        // лунки — по одной
        G.PACH_CUPS.forEach((cu, i) => {
            parts.push(piece(lay.cups, R(cu.x - P.cup.w / 2 - 2.5, cu.y - 2.5, P.cup.w + 5, P.cup.h + 5), { kind: 'cup', at: t + i * 0.09, dur: 0.3, s0: 3.2, rot0: (i % 2 ? 0.6 : -0.6), from: i % 2 ? -1 : 1 }));
        });
        t += G.PACH_CUPS.length * 0.09 + 0.25;
        // гвозди — рядами сверху вниз, как вбивают: в ряду — волной
        const nails = G.pachNails(), rows = {};
        nails.forEach(([x, y]) => { const k = Math.round(y / 11); (rows[k] = rows[k] || []).push([x, y]); });
        const keys = Object.keys(rows).map(Number).sort((a, b) => a - b), nr = 3.4;
        keys.forEach((rk, ri) => rows[rk].sort((a, b) => a[0] - b[0]).forEach(([x, y], j) => {
            // по кругу шляпки: разница видов вокруг гвоздя ловит и его тень
            // на краске (затенение по высоте) — квадрат поля летел вместе с
            // гвоздём (игрок, 18.11)
            const pc = piece(lay.nails, R(x - nr, y - nr, nr * 2, nr * 2), {}), g = pc.cv.getContext('2d'), kk = pc.cv.width / pc.w;
            g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.arc(pc.w / 2 * kk, pc.h / 2 * kk, 2.25 * s * kk, 0, 7); g.fill();
            parts.push(Object.assign(pc, { kind: 'nail', at: t + ri * 0.075 + j * 0.018, dur: 0.18, s0: 4, from: (ri + j) % 2 ? -1 : 1, tick: j === 0 }));
        }));
        t += keys.length * 0.075 + 0.3;
        // переднее стекло — сверху
        if (L.pachGlassCv) {
            const gc = document.createElement('canvas'); gc.width = L.pachGlassCv.width; gc.height = L.pachGlassCv.height;
            gc.getContext('2d').drawImage(L.pachGlassCv, 0, 0);
            parts.push({ kind: 'glass', cv: gc, x: BX.x, y: BX.y, w: BX.w, h: BX.h, at: t, dur: 0.5, s0: 1.35, from: -1 });
            t += 0.55;
        }
        // уголки и саморезы стекла — прижимают его, по углам
        const mx = (P.x0 + P.x1) / 2, my = (P.y0 + P.y1) / 2, b0 = L.pachBox();
        [[b0.x, b0.y], [mx, b0.y], [b0.x, my], [mx, my]].forEach(([x, y], n) => {
            parts.push(piece(lay.corners, R(x, y, mx - b0.x, my - b0.y), { kind: 'corner', at: t + n * 0.1, dur: 0.28, s0: 3, spin: (n % 2 ? 1 : -1) * 1.5, from: n < 2 ? -1 : 1, tick: true }));
        });
        t += 0.55;
        // кнопка запуска — последней
        const Bt = P.button;
        parts.push(piece(lay.button, R(Bt.x - Bt.r - 4, Bt.y - Bt.r - 4, Bt.r * 2 + 8, Bt.r * 2 + 8), { kind: 'btn', at: t, dur: 0.32, s0: 3.5, from: 1, heavy: true }));
        t += 0.45;
        // проверка: блик по стеклу
        const Gr = G.pachGlassRect();
        this.glint = { at: t + 0.1, dur: 0.6, r: R(Gr.x0, Gr.y0, Gr.x1 - Gr.x0, Gr.y1 - Gr.y0) };
        this.END = this.glint.at + this.glint.dur;
        return parts;
    },

    // ---------- кадр ----------
    loop() {
        const step = () => {
            if (this.stop || !this.fly) return;
            this.frame(performance.now());
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },
    // нижний слой: стоп-кадр (на месте колеса) и всё, что уже легло
    paintBase() {
        const c = this.base.getContext('2d'), d = this.dpr;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.base.width, this.base.height);
        if (this.mode === 'full' || !GreedJunkLit.wrapEl) { c.drawImage(this.snap, 0, 0); return; }
        const R = this.REGION, [ax, ay] = this.scene(R.x0, R.y0), [bx, by] = this.scene(R.x1, R.y1);
        c.save(); c.beginPath(); c.rect(ax * d, ay * d, (bx - ax) * d, (by - ay) * d); c.clip(); c.drawImage(this.snap, 0, 0); c.restore();
        const k = this.scene(0, 0)[2], spinning = this.spin && this.spinOn;
        this.parts.forEach(p => { if (p.landed && !(spinning && (p.kind === 'disc' || p.kind === 'peg'))) this.draw(c, p, 1, 9, k); });
    },
    frame(now) {
        const c = this.fly.getContext('2d'), t = (now - this.t0) / 1000, k = this.scene(0, 0)[2];
        // ничего не летит и не пружинит — холст не трогать (очистить один раз)
        const busy = this.parts.some(p => { const u = t - p.at; return u >= 0 && u < p.dur + 0.25; }) || (this.spin && t >= this.spin.at) || (this.glint && t >= this.glint.at && t < this.glint.at + this.glint.dur + 0.05) || this.parts.some(p => t >= p.at + p.dur && !p.landed);
        if (!busy) { if (this.flyDirty) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.fly.width, this.fly.height); this.flyDirty = false; } return; }
        this.flyDirty = true;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.fly.width, this.fly.height);
        const outC = (x) => 1 - Math.pow(1 - x, 3);
        let landedNow = false;
        this.parts.forEach((p) => {
            const u = (t - p.at) / p.dur;
            if (u < 0) return;
            if (u < 1) { this.draw(c, p, outC(u), -1, k); return; }
            const after = t - p.at - p.dur;
            if (!p.landed) {
                p.landed = true;
                // легла — дорисовать в нижний слой (без полной перерисовки)
                if (!(this.spinOn && (p.kind === 'disc' || p.kind === 'peg'))) this.draw(this.base.getContext('2d'), p, 1, 9, k);
                if (typeof Haptics !== 'undefined' && p.tick !== false && (p.kind !== 'bolt' || p.tick)) {
                    if (p.heavy && Haptics.impact) Haptics.impact('heavy'); else Haptics.tick();
                }
            }
            // защёлкивание — короткая пружина поверх нижнего слоя
            if (after < 0.25) this.draw(c, p, 1, after, k);
        });
        // проверка колеса: диск с колышками крутится, значки проявляются
        const Sn = this.spin;
        if (Sn && t >= Sn.at) {
            if (!this.spinOn) { this.spinOn = true; landedNow = true; }
            const u = Math.min(1, (t - Sn.at) / Sn.dur), e = 1 - Math.pow(1 - u, 2.6);
            this.drawSpin(c, Sn, Sn.from + (Sn.to - Sn.from) * e, k);
            // язычок — поверх крутящегося диска
            const ptr = this.parts.find(p => p.kind === 'ptr');
            if (ptr && ptr.landed) this.draw(c, ptr, 1, 9, k);
        }
        // проверка пачинко: блик проходит по стеклу сверху вниз
        const Gl = this.glint;
        if (Gl && t >= Gl.at && t < Gl.at + Gl.dur) {
            const u = (t - Gl.at) / Gl.dur, d = this.fly.q, [x0, y0] = this.scene(Gl.r.x, Gl.r.y), [x1, y1] = this.scene(Gl.r.x + Gl.r.w, Gl.r.y + Gl.r.h);
            const yb = y0 + (y1 - y0 + 120) * u - 60, g = c.createLinearGradient(0, (yb - 40) * d, 0, (yb + 40) * d);
            g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            c.save(); c.setTransform(d, 0, 0, d, 0, 0); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
            c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = g; c.fillRect(x0 * d, (yb - 40) * d, (x1 - x0) * d, 80 * d); c.restore();
        }
        if (landedNow) this.paintBase();
    },
    // Деталь на прогрессе e (0 — у камеры, 1 — на месте); after — сколько
    // секунд как легла (−1 — ещё летит).
    draw(c, p, e, after, k) {
        const d = c.canvas.q || this.dpr, [tx, ty] = this.scene(p.x, p.y), w = p.w * k, h = p.h * k, C = this.scene(180, 160);
        let pv = p.pivot ? this.scene(p.pivot[0], p.pivot[1]) : [tx + w / 2, ty + h / 2];
        let s = 1, rot = p.base || 0, ox = 0, oy = 0, cx0 = 0, cy0 = 0;
        if (p.orbit) {                                    // колышек на диске, повёрнутом на D0
            const [ox0, oy0] = this.scene(p.orbit[0], p.orbit[1]), a = p.orbit[2];
            const dx = pv[0] - ox0, dy = pv[1] - oy0;
            cx0 = ox0 + dx * Math.cos(a) - dy * Math.sin(a) - pv[0]; cy0 = oy0 + dx * Math.sin(a) + dy * Math.cos(a) - pv[1];
            rot = a;
        }
        if (after < 0) {
            s = p.s0 + (1 - p.s0) * e;
            ox = (pv[0] - C[0]) * (1 - e) * 1.3; oy = ((pv[1] - C[1]) * 1.3 + p.from * 140) * (1 - e);
            rot += ((p.rot0 || 0) + (p.spin || 0)) * (1 - e);
        } else if (after < 9) {
            const sp = Math.exp(-after * 18) * Math.sin(after * 40);
            s = 1 - 0.06 * sp;
        }
        c.save();
        c.setTransform(d, 0, 0, d, 0, 0);
        c.translate(pv[0] + cx0 + ox, pv[1] + cy0 + oy); c.rotate(rot); c.scale(s, s); c.translate(-pv[0], -pv[1]);
        if (p.shadow && after >= 0) [].concat(p.shadow).forEach(sh => sh && this.shadow(c, sh, after >= 9 ? 1 : Math.min(1, after / 0.25), -(p.base || 0), pv));
        c.drawImage(p.cv, tx, ty, w, h);
        c.restore();
    },
    // тень диска лежит на щите и не крутится вместе с ним
    shadow(c, cv, a, unrot, pv) {
        const r = cv.getBoundingClientRect(), hr = this.host.getBoundingClientRect(), q = hr.width / this.host.offsetWidth;
        c.save(); c.translate(pv[0], pv[1]); c.rotate(unrot); c.translate(-pv[0], -pv[1]);
        c.globalAlpha = a; c.drawImage(cv, (r.left - hr.left) / q, (r.top - hr.top) / q, r.width / q, r.height / q);
        c.restore();
    },
    // Прокрут: одна картинка диска поворачивается целиком. Значок сектора
    // впечатывается в неё один раз — когда сектор побывал слева под
    // монетами (16 обновлений за прокрут). Было: каждый кадр две большие
    // картинки и вырезка по секторам — на прокруте кадр стоил ~60 мс при
    // процессоре ×4.
    drawSpin(c, Sn, rot, k) {
        const d = c.canvas.q || this.dpr, [tx, ty] = this.scene(Sn.box.x, Sn.box.y), w = Sn.box.w * k, h = Sn.box.h * k, pv = this.scene(Sn.pivot[0], Sn.pivot[1]);
        if (!Sn.acc) {
            Sn.acc = document.createElement('canvas'); Sn.acc.width = Sn.withPegs.width; Sn.acc.height = Sn.withPegs.height;
            Sn.acc.getContext('2d').drawImage(Sn.withPegs, 0, 0);
        }
        const n = Sn.n, A = Sn.acc, g = A.getContext('2d'), cx = A.width / 2, cy = A.height / 2;
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 - Math.PI / 2;                    // середина сектора (поворот 0)
            if (Sn.seen[i] || Math.cos(a + rot) >= -0.35) continue;
            Sn.seen[i] = true;
            g.save(); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, A.width, a - Math.PI / n, a + Math.PI / n); g.closePath(); g.clip();
            g.drawImage(Sn.icons, 0, 0); g.restore();
        }
        c.save(); c.setTransform(d, 0, 0, d, 0, 0);
        if (Sn.shadow) this.shadow(c, Sn.shadow, 1, 0, pv);
        c.translate(pv[0], pv[1]); c.rotate(rot); c.translate(-pv[0], -pv[1]);
        c.drawImage(A, tx, ty, w, h);
        c.restore();
    }
};
