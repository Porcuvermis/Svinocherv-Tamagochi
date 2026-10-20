// ================= ВОЛШЕБНЫЙ ФЛАКОН НА СЛОЯХ =================
// Продолжение BATH_SOAP (bath-soap.js). Флакон в ванной — не один svg, а
// бутерброд из слоёв, разведённых по частоте изменений:
//
//   сзади  (.bsm-rig-b) — сияние (css-анимация) и НЕБО: окно с неподвижной
//                         маской полости и окно линзы; внутри — картинки
//                         неба, которые двигает только transform. Мерцание
//                         — две картинки звёзд, плавно сменяющие друг друга;
//   svg    (сам холст)  — стекло, огранка, золото: не меняются вовсе. Живы
//                         в нём только пробка, пар, кольцо и пузыри у горла
//                         — маленький участок;
//   спереди (.bsm-rig-f) — холст canvas: блик по огранке и живое у горла
//                         заранее нарисованными спрайтами. Шлейф искр —
//                         не здесь: искры улетают за край вещи
//                         (bath-soap-trail.js).
//
// ПОЧЕМУ. Пока всё жило в одном svg, ~75 правок за кадр перерисовывали весь
// холст вещи вместе с двумя картинками неба, сиянием во весь холст и
// восемью десятками звёзд — кадры флакона падали вдвое против соседних
// ступеней (tools/prof-bath-live.js). Правило под этим (docs/bench/art.md,
// «Дёшево, а выглядит дорого»): любая правка внутри svg перерисовывает весь
// его холст, поэтому живое и неподвижное — на разных холстах.
//
// Слои — соседи холста вещи в той же обёртке, с тем же местом и размером
// (rigFollow), и едут с ним: перетаскивание — общей обёрткой, парение и
// подъём — теми же анимациями (lust-wash.js, liftGo и floatTool). Небо по-
// прежнему привязано к экрану: его transform — обратная матрица «флакон →
// холст ванной» (rigSky), как у прежних слоёв неба в svg.
//
// Слои есть только у живых холстов ванной (RIG_BOXES). В журнале и до первого
// кадра слоёв флакон рисует всё сам (разметка .bsm-inl в magic()).
Object.assign(BATH_SOAP, {
    RIG_BOXES: ['bt-soap-box', 'bt-hand', 'bt-hand-home'],
    // Пар, пузыри, блик — мягкое: плотности 2 им хватает, а холст во всю
    // вещь при плотности 3 стоил бы видеопамяти вдвое (п. 152).
    RIG_DPR: 2,
    // Мерцание: две картинки звёзд в противофазе (css, lust.css).
    TW_PX: 1,

    // Матрица «единицы флакона → единицы холста-svg»: transform всех предков
    // до корня svg. Только атрибуты — ни раскладки, ни getScreenCTM.
    chainMatrix(root) {
        const svg = root && root.ownerSVGElement;
        let m = new DOMMatrix();
        for (let el = root; el && el !== svg; el = el.parentNode) {
            const tl = el.transform && el.transform.baseVal;
            if (!tl) continue;
            for (let i = tl.numberOfItems - 1; i >= 0; i--) {
                const q = tl.getItem(i).matrix;
                m = new DOMMatrix([q.a, q.b, q.c, q.d, q.e, q.f]).multiply(m);
            }
        }
        return m;
    },

    rgba(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
    },

    // ---------- сборка ----------
    rigMake(svg) {
        const P = btPal(), C = P.soapCosmos, D = C.deep, Am = C.amethyst, M = this.MAGIC;
        const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
        const back = el('div', 'bsm-rig bsm-rig-b'), front = el('div', 'bsm-rig bsm-rig-f');
        const aura = el('div', 'bsm-aur');
        aura.style.background = `radial-gradient(circle closest-side, ${this.rgba(Am[2], 0.55)} 0%, ${this.rgba(Am[1], 0.3)} 30%, ${this.rgba(C.cyan, 0.12)} 62%, ${this.rgba(C.cyan, 0)} 100%)`;
        // Небо: дальний слой, ближний (с двумя картинками мерцания) и они же
        // в линзе — крупнее. Основа окна — та же глубина, что в svg (-deep):
        // пока картинки пекутся, полость не пустая.
        const sky = (tw) => {
            const box = el('div', 'bsm-sk'), img = el('img', 'bsm-ski');
            img.alt = ''; img.decoding = 'async';
            box.appendChild(img);
            const r = { box, img, tw: [] };
            if (tw) for (const k of ['bsm-twa', 'bsm-twb']) { const t = el('img', 'bsm-ski ' + k); t.alt = ''; box.appendChild(t); r.tw.push(t); }
            return r;
        };
        const deep = (cx, cy) => `radial-gradient(circle at ${cx} ${cy}, ${D[3]} 0%, ${D[2]} 40%, ${D[1]} 78%, ${D[0]} 100%)`;
        const win = el('div', 'bsm-win'), lens = el('div', 'bsm-lensw');
        const far = sky(false), near = sky(true), lfar = sky(false), lnear = sky(false);
        // Обёртка против качания: парящий холст качается css-анимацией
        // (bt-float), и небо гасит её ТОЙ ЖЕ анимацией наоборот (lust.css,
        // bt-unfloat) — видеокарта сама, без чтения качания скриптом. Читать
        // его (getComputedStyle на каждом кадре) стоило пересчёта стиля и
        // было самым дорогим в кадре флакона.
        const unbob = (...kids) => { const u = el('div', 'bsm-unbob'); u.append(...kids); return u; };
        win.append(unbob(far.box, near.box));
        lens.append(unbob(lfar.box, lnear.box));
        back.append(aura, win, lens);
        const cv = el('canvas', 'bsm-cv');
        front.appendChild(cv);
        svg.parentNode.insertBefore(back, svg);
        svg.parentNode.insertBefore(front, svg.nextSibling);
        // Маска полости — в единицах флакона, по габариту полости.
        const SH = this.magicShape(), xs = SH.cav.map(p => p[0]), ys = SH.cav.map(p => p[1]);
        const cb = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const d = 'M' + SH.cav.map(p => `${(p[0] - cb.x).toFixed(2)} ${(p[1] - cb.y).toFixed(2)}`).join('L') + 'Z';
        const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cb.w.toFixed(2)} ${cb.h.toFixed(2)}" preserveAspectRatio="none"><path d="${d}"/></svg>`)}")`;
        win.style.webkitMaskImage = win.style.maskImage = mask;
        const LN = M.LENS;
        // Где центр линзы внутри окна полости — для основы-глубины.
        win.style.background = deep(`${((LN.cx - cb.x) / cb.w * 100).toFixed(1)}%`, `${((LN.cy - cb.y) / cb.h * 100).toFixed(1)}%`);
        lens.style.background = deep('50%', '50%');
        const body = new Path2D('M' + SH.outline.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L') + 'Z');
        const R = { svg, back, front, aura, win, lens, far, near, lfar, lnear, cv, ctx: cv.getContext('2d'),
                    cb, body, root: null, key: '', shown: true };
        svg._bsmRig = R;
        this.rigTex(R);
        return R;
    },

    // Картинки неба и мерцания — как только испеклись (applyTex зовёт снова).
    rigTex(R) {
        const T = this._tex, W = this.twinkleTex();
        const put = (img, u) => { if (u && img.getAttribute('src') !== u) img.src = u; img.style.visibility = u ? '' : 'hidden'; };
        put(R.far.img, T && T.far); put(R.lfar.img, T && T.far);
        put(R.near.img, T && T.near); put(R.lnear.img, T && T.near);
        R.near.tw.forEach((t, i) => put(t, W && W[i]));
    },

    // Мерцающие звёзды — две прозрачные картинки (чётные и нечётные звёзды)
    // в координатах неба, рисуются один раз. Прежде их было 80 узлов svg
    // (по 40 в окне и линзе), и каждая перемена прозрачности перерисовывала
    // весь флакон.
    twinkleTex() {
        if (this._tw || this._twStarted || typeof document === 'undefined') return this._tw || null;
        this._twStarted = true;
        const TX = this.TEX, k = this.TW_PX, M = this.MAGIC, C = btPal().soapCosmos;
        const cols = [C.glow, C.cyan, C.core, C.blush], rnd = btRng(4242), out = [null, null];
        const sets = [[], []];
        for (let i = 0; i < M.TWINKLERS; i++) {
            const x = rnd() * TX.w, y = rnd() * TX.h, r = 0.5 + rnd() * 0.35;
            sets[i % 2].push({ x, y, r, c: cols[Math.floor(rnd() * cols.length)] });
        }
        sets.forEach((S, si) => {
            const cv = document.createElement('canvas');
            cv.width = Math.round(TX.w * k); cv.height = Math.round(TX.h * k);
            const g = cv.getContext('2d');
            g.scale(k, k);
            for (const s of S) {
                const R = s.r * 6, gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
                gr.addColorStop(0, this.rgba(s.c, 1)); gr.addColorStop(0.16, this.rgba(s.c, 0.6));
                gr.addColorStop(0.45, this.rgba(s.c, 0.16)); gr.addColorStop(1, this.rgba(s.c, 0));
                g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, R, 0, 2 * Math.PI); g.fill();
                g.fillStyle = '#ffffff'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 2 * Math.PI); g.fill();
            }
            cv.toBlob((b) => {
                if (!b) return;
                out[si] = URL.createObjectURL(b);
                if (out[0] && out[1]) { this._tw = out; this.rigAll(R => this.rigTex(R)); }
            }, 'image/png');
        });
        return null;
    },

    rigAll(fn) {
        if (typeof document === 'undefined') return;
        for (const id of this.RIG_BOXES) { const s = document.getElementById(id); if (s && s._bsmRig) fn(s._bsmRig); }
    },

    // ---------- место ----------
    // Слои встают туда же, куда холст вещи: тот же угол и размер в точках
    // обёртки, а внутри — те же единицы, что окно холста (viewBox). Зовут
    // placeShelf, fitCarry и emptyCarry (lust.js) — там же, где двигают
    // холст, — и кадр флакона (дёшево: сверка строки).
    rigFollow(svg) {
        if (!svg || typeof document === 'undefined' || typeof DOMMatrix === 'undefined' || this.RIG_BOXES.indexOf(svg.id) < 0) return null;
        const root = svg.querySelector('.bt-soap-magic');
        let R = svg._bsmRig;
        if (!root) { if (R) this.rigHide(R); return null; }
        if (!R) R = this.rigMake(svg);
        if (R.root !== root) {
            if (R.root) R.root.classList.remove('bsm-rigged');
            R.root = root; R.key = '';
            root.classList.add('bsm-rigged');
        }
        const st = svg.style, vb = svg.getAttribute('viewBox');
        const key = [st.left, st.top, st.width, st.height, vb].join('|');
        if (key === R.key) { this.rigShow(R, this.rigOk(R)); return R; }
        R.key = key;
        const W = parseFloat(st.width), H = parseFloat(st.height), v = vb ? vb.split(/[\s,]+/).map(Number) : null;
        if (!W || !H || !v || !v[2] || !v[3]) { this.rigHide(R); return null; }
        for (const n of [R.back, R.front]) {
            n.style.left = st.left; n.style.top = st.top; n.style.width = st.width; n.style.height = st.height;
        }
        const sx = W / v[2], sy = H / v[3];
        // T: единицы флакона → точки холста (от его угла).
        R.T = new DOMMatrix([sx, 0, 0, sy, -v[0] * sx, -v[1] * sy]).multiply(this.chainMatrix(root));
        const T = R.T, M = this.MAGIC, LN = M.LENS;
        const rect = (x, y, w, h) => {
            const a = T.transformPoint(new DOMPoint(x, y)), b = T.transformPoint(new DOMPoint(x + w, y + h));
            return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
        };
        const place = (n, r) => { const s = n.style; s.left = r.x.toFixed(2) + 'px'; s.top = r.y.toFixed(2) + 'px'; s.width = r.w.toFixed(2) + 'px'; s.height = r.h.toFixed(2) + 'px'; };
        R.wr = rect(R.cb.x, R.cb.y, R.cb.w, R.cb.h);
        R.lr = rect(LN.cx - LN.rx, LN.cy - LN.ry, 2 * LN.rx, 2 * LN.ry);
        place(R.win, R.wr); place(R.lens, R.lr);
        place(R.aura, rect(-74, M.CY - 74, 148, 148));
        const k = Math.min(this.RIG_DPR, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
        R.dpr = k;
        R.cv.style.width = W + 'px'; R.cv.style.height = H + 'px';
        R.cv.width = Math.round(W * k); R.cv.height = Math.round(H * k);
        R.drawn = false;
        R.skyKey = '';
        this.rigSky(R);
        this.rigShow(R, this.rigOk(R));
        return R;
    },

    // Показ и прятание — прозрачностью с тем же переходом, что у гнезда на
    // полке (lust.css, #bt-soap-home: 0.25 с): иначе небо появлялось бы
    // раньше стекла. instant — как у гнезда при подъёме (homeShown).
    rigShow(R, on, instant) {
        const o = on ? '' : '0';
        if (R.shown === on && R.back.style.display !== 'none') return;
        R.shown = on;
        for (const n of [R.back, R.front]) {
            n.style.display = '';
            if (instant) n.style.transition = 'none';
            n.style.opacity = o;
            if (instant) { void n.offsetWidth; n.style.transition = ''; }
        }
    },
    rigHide(R) {
        R.shown = false;
        R.back.style.display = R.front.style.display = 'none';
        R.key = '';
        // Холст отдаёт память: спрятанный слой мог бы держать её долго.
        if (R.cv.width) { R.cv.width = R.cv.height = 0; }
        if (R.root) { R.root.classList.remove('bsm-rigged'); R.root = null; }
    },

    // Видны ли слои: копия на полке под рукой (прозрачность гнезда 0) и
    // опустевший холст — нет. Вещь за кадром или спящая на полке видна, просто
    // не живёт, — слоёв не теряет.
    rigOk(R) {
        const r = R.root, h = r && r.closest('#bt-soap-home, #bt-cloth-home');
        return !!r && r.isConnected && R.svg.contains(r) && !(h && h.style.opacity === '0') && !!R.svg.getAttribute('viewBox');
    },
    // Зовут те, кто прячет и показывает копии (showTools, homeShown), и цикл.
    rigSweep(instant) {
        this.rigAll(R => {
            if (R.root && !R.root.isConnected) { this.rigHide(R); return; }
            if (R.root) this.rigShow(R, this.rigOk(R), instant);
        });
    },

    // ---------- небо ----------
    // Картинка неба в окне: точки окна ← единицы неба. Та же цепочка, что у
    // слоя неба в svg (layerTr), только до точек окна: T · обратная(флакон →
    // холст ванной) · сдвиг глубины · угол картинки.
    rigSky(R) {
        if (!R || !R.T || !R.root) return;
        const m = this.worldMatrix(R.root, true);
        if (!m) return;
        const L = this.live, P = this.MAGIC.PLX, TX = this.TEX, LN = this.MAGIC.LENS;
        const inv = m.inverse();
        const key = [inv.a, inv.b, inv.c, inv.d, inv.e, inv.f, L.px, L.py].map(v => v.toFixed(3)).join(',');
        if (key === R.skyKey) return;
        R.skyKey = key;
        const zoom = new DOMMatrix().translate(LN.cx, LN.cy).scale(LN.zoom).translate(-LN.cx, -LN.cy);
        const tr = (box, r, k, lens) => {
            let q = new DOMMatrix().translate(-r.x, -r.y).multiply(R.T);
            if (lens) q = q.multiply(zoom);
            q = q.multiply(inv).translate(-L.px * k, -L.py * k).translate(TX.x, TX.y);
            const s = `matrix(${[q.a, q.b, q.c, q.d, q.e, q.f].map(v => v.toFixed(4)).join(', ')})`;
            if (box.style.transform !== s) box.style.transform = s;
        };
        tr(R.far.box, R.wr, P.far, false);
        tr(R.near.box, R.wr, P.near, false);
        tr(R.lfar.box, R.lr, P.far, true);
        tr(R.lnear.box, R.lr, P.near, true);
    },

    // ---------- убранство спрайтами ----------
    // Мягкие пятна света (радиальные заливки svg-убранства) — один раз на
    // маленьких холстах, дальше только drawImage.
    sprites() {
        if (this._spr) return this._spr;
        const C = btPal().soapCosmos, Z = 64;
        const mk = (stops) => {
            const c = document.createElement('canvas');
            c.width = c.height = Z;
            const g = c.getContext('2d'), gr = g.createRadialGradient(Z / 2, Z / 2, 0, Z / 2, Z / 2, Z / 2);
            stops.forEach(([o, col, a]) => gr.addColorStop(o, this.rgba(col, a)));
            g.fillStyle = gr; g.fillRect(0, 0, Z, Z);
            return c;
        };
        const W = '#ffffff';
        return (this._spr = {
            soft: mk([[0, W, 1], [0.35, W, 0.55], [1, W, 0]]),
            vapor: mk([[0, C.glow, 0.9], [0.5, C.cyan, 0.35], [1, C.cyan, 0]]),
            bub: (() => {
                // Мыльный пузырь (как bubG и bubRim в svg): прозрачная
                // середина, радужная кромка, блик. Единичный, r = 1 → Z/2.
                const c = document.createElement('canvas');
                c.width = c.height = Z;
                const g = c.getContext('2d'), h = Z / 2;
                const gr = g.createRadialGradient(h, h, 0, h, h, h);
                [[0, C.cyan, 0.04], [0.72, C.cyan, 0.14], [0.9, C.pink, 0.35], [1, C.glow, 0.7]].forEach(([o, col, a]) => gr.addColorStop(o, this.rgba(col, a)));
                g.fillStyle = gr; g.beginPath(); g.arc(h, h, h, 0, 2 * Math.PI); g.fill();
                const lg = g.createLinearGradient(0, 0, Z, Z);
                C.prism.forEach((col, i) => lg.addColorStop(i / (C.prism.length - 1), col));
                g.strokeStyle = lg; g.lineWidth = 0.14 * h; g.beginPath(); g.arc(h, h, 0.94 * h, 0, 2 * Math.PI); g.stroke();
                g.fillStyle = W; g.beginPath();
                g.ellipse(h - 0.38 * h, h - 0.42 * h, 0.3 * h, 0.16 * h, -35 * Math.PI / 180, 0, 2 * Math.PI); g.fill();
                return c;
            })()
        });
    },

    // Пробка и камень — две картинки, снятые с разметки самого флакона (тот
    // же рисунок, те же заливки): дальше их только двигают на холсте.
    // Пока картинки грузятся, пробка остаётся в svg (класс bsm-stopok).
    STOP_PX: 8,
    stopperSprites(root) {
        if (this._stop || this._stopStarted || typeof XMLSerializer === 'undefined') return this._stop || null;
        const defs = root.querySelector('defs'), st = root.querySelector('.bsm-stopper');
        if (!defs || !st) return null;
        this._stopStarted = true;
        const S = this.MAGIC.STOP, box = { x: -10, y: S - 37, w: 20, h: 40 }, Z = this.STOP_PX, ser = new XMLSerializer();
        const stem = st.cloneNode(true);
        stem.removeAttribute('transform'); stem.removeAttribute('class');
        const gemEl = stem.querySelector('.bsm-gem'), gem = gemEl.cloneNode(true);
        gemEl.remove(); gem.removeAttribute('transform');
        const out = {}, svgOf = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${box.w * Z}" height="${box.h * Z}">`
            + ser.serializeToString(defs) + ser.serializeToString(n) + `</svg>`;
        let left = 2;
        for (const [k, n] of [['stem', stem], ['gem', gem]]) {
            const im = new Image(), url = URL.createObjectURL(new Blob([svgOf(n)], { type: 'image/svg+xml' }));
            im.onload = () => { out[k] = im; if (!--left) { this._stop = { stem: out.stem, gem: out.gem, box }; this.rigAll(R => R.root && R.root.classList.add('bsm-stopok')); } };
            im.onerror = () => URL.revokeObjectURL(url);
            im.src = url;
        }
        return null;
    },

    // Кадр холста спереди: блик по огранке и живое у горла.
    rigDraw(R, Fr) {
        const g = R.ctx, cv = R.cv;
        if (!g || !cv.width) return;
        const sweep = Fr.sweepX != null;
        const ST = this.stopperSprites(R.root);
        if (ST && !R.root.classList.contains('bsm-stopok')) R.root.classList.add('bsm-stopok');
        const S = this.sprites(), k = R.dpr, T = R.T, C = btPal().soapCosmos;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cv.width, cv.height);
        g.setTransform(k * T.a, k * T.b, k * T.c, k * T.d, k * T.e, k * T.f);
        R.drawn = true;
        const spr = (im, x, y, r) => g.drawImage(im, x - r, y - r, 2 * r, 2 * r);
        const flare = (L) => { const w = Math.max(0.35, L * 0.1); g.drawImage(S.soft, -L, -w, 2 * L, 2 * w); g.drawImage(S.soft, -w, -L, 2 * w, 2 * L); };
        // Блик по огранке — под пузом, в силуэте.
        if (sweep) {
            g.save();
            g.clip(R.body);
            g.translate(Fr.sweepX, 0);
            g.rotate(22 * Math.PI / 180);
            const lg = g.createLinearGradient(-5, 0, 5, 0);
            lg.addColorStop(0, this.rgba(C.glow, 0)); lg.addColorStop(0.5, this.rgba(C.glow, 0.7)); lg.addColorStop(1, this.rgba(C.glow, 0));
            g.fillStyle = lg;
            g.fillRect(-5, -70, 10, 120);
            g.restore();
        }
        this.rigNeck(g, Fr, S, ST, spr, flare);
        g.globalAlpha = 1;
    },

    // У горла: пар, кольцо с бегущими точками, пузыри, пробка с камнем.
    rigNeck(g, Fr, S, ST, spr, flare) {
        const M = this.MAGIC, NK = M.NECK, C = btPal().soapCosmos, SP = M.STOP;
        g.globalAlpha = +Fr.vapor;
        g.drawImage(S.vapor, -9, NK.top - 7 - 11, 18, 22);
        const [rk, dash] = Fr.ringN, ry = SP + 3;
        g.save();
        g.translate(0, ry); g.scale(rk, rk); g.translate(0, -ry);
        g.globalAlpha = 0.35; g.strokeStyle = C.cyan; g.lineWidth = 2.2;
        g.beginPath(); g.ellipse(0, ry, 10.5, 2.6, 0, 0, 2 * Math.PI); g.stroke();
        g.globalAlpha = 1; g.strokeStyle = C.glow; g.lineWidth = 0.9; g.lineCap = 'round';
        g.setLineDash([0.6, 3.4]); g.lineDashOffset = dash;
        g.beginPath(); g.ellipse(0, ry, 10.5, 2.6, 0, 0, 2 * Math.PI); g.stroke();
        g.setLineDash([]);
        g.restore();
        Fr.bubs.forEach(b => {
            const x = +b.x, y = +b.y, r = +b.r, o = +b.o, pop = +b.pop;
            if (r > 0.01 && o > 0) { g.globalAlpha = o; spr(S.bub, x, y, r); }
            if (pop > 0) { g.save(); g.globalAlpha = pop; g.translate(x, y); flare(3.4); g.restore(); }
        });
        g.globalAlpha = 1;
        if (!ST) return;
        const [bob, rot, gk] = Fr.stopN, B = ST.box, py = SP - 12;
        g.save();
        g.translate(0, bob); g.translate(0, py); g.rotate(rot * Math.PI / 180); g.translate(0, -py);
        g.drawImage(ST.stem, B.x, B.y, B.w, B.h);
        g.scale(gk, 1);
        g.drawImage(ST.gem, B.x, B.y, B.w, B.h);
        g.restore();
    }
});
