// ================= ОБЛАКО ИЗ НОЧИ НА ХОЛСТЕ =================
// Продолжение BATH_CLOTH (bath-cloth.js). Облако (ступень 8) в ванной — не
// svg, а холст canvas рядом с холстом вещи: пух, небо под обрезкой телом,
// ободок света, макушки клубов и искры — спрайтами (cloudArt, paint).
//
// ПОЧЕМУ. Облако живёт ФОРМОЙ: клубы плывут, и на каждой его правке svg
// перезаписывал картинку всей вещи — путь тела, обрезку, две картинки неба,
// два десятка макушек с порами. Замер (tools/prof-bath-live.js, 4×): одно
// облако на полке стоило главному потоку столько же, сколько волшебный
// флакон до слоёв. На холсте та же картинка — пара десятков drawImage.
// Флакон переехал на слои тем же доводом (bath-soap-rig.js, docs/bench/art.md
// «Дёшево, а выглядит дорого»).
//
// svg облака остаётся в дереве НЕВИДИМЫМ (visibility, а не display): по
// габариту его группы осадки squashOf ставит точку осадки в руке.
// Слой — сосед холста вещи в той же обёртке и с тем же местом (ccFollow);
// подъём, парение и осадку он повторяет теми же анимациями (lust-wash.js:
// liftGo, floatTool, squashAnim — общий класс .bsm-rig). Небо рисуется в
// координатах экрана с учётом качания (BATH_SOAP.worldMatrix → bobFast),
// поэтому стоит, пока облако парит.
Object.assign(BATH_CLOTH, {
    CC_BOXES: ['bt-cloth-box', 'bt-hand', 'bt-hand-home'],
    CC_DPR: 2,
    // Как часто облако перерисовывается: 30 в секунду, на трении — 15. Холст
    // дешёвый, а парящее облако качается — небо в нём должно успевать.
    CC_MS: [33, 66],

    ccRoot(svg) { return svg && svg.querySelector('.bt-cloth-cloud'); },

    // Небо — те же картинки, что за волшебным флаконом, только Image для холста.
    ccSkyImgs() {
        const T = typeof BATH_SOAP !== 'undefined' ? BATH_SOAP.cosmosTex() : null;
        if (!T) return null;
        if (!this._ccSky || this._ccSky.src !== T.far) {
            const mk = (u) => { const im = new Image(); im.decoding = 'async'; im.src = u; return im; };
            this._ccSky = { src: T.far, far: mk(T.far), near: mk(T.near) };
        }
        return this._ccSky;
    },

    ccMake(svg) {
        const back = document.createElement('div'), cv = document.createElement('canvas');
        back.className = 'bsm-rig bcc-rig';
        cv.className = 'bsm-cv';
        back.appendChild(cv);
        svg.parentNode.insertBefore(back, svg.nextSibling);
        const R = { svg, back, cv, ctx: cv.getContext('2d'), root: null, key: '', shown: true, draws: 0 };
        svg._bccRig = R;
        return R;
    },

    // Место: тот же угол и размер, что у холста вещи; T — единицы сцены
    // облака → точки слоя. Зовут placeShelf, fitCarry, emptyCarry (lust.js)
    // и шаг цикла (сверка строки).
    ccFollow(svg) {
        if (!svg || typeof document === 'undefined' || typeof DOMMatrix === 'undefined' || this.CC_BOXES.indexOf(svg.id) < 0) return null;
        const root = this.ccRoot(svg);
        let R = svg._bccRig;
        if (!root) { if (R) this.ccHide(R); return null; }
        if (!R) R = this.ccMake(svg);
        if (R.root !== root) {
            if (R.root) R.root.classList.remove('bcc-rigged');
            R.root = root; R.key = '';
            R.sky = root.querySelector('g[data-sky]');
            root.classList.add('bcc-rigged');
        }
        const st = svg.style, vb = svg.getAttribute('viewBox');
        const key = [st.left, st.top, st.width, st.height, vb].join('|');
        if (key !== R.key) {
            R.key = key;
            const W = parseFloat(st.width), H = parseFloat(st.height), v = vb ? vb.split(/[\s,]+/).map(Number) : null;
            if (!W || !H || !v || !v[2] || !v[3] || !R.sky) { this.ccHide(R); return null; }
            const n = R.back.style;
            n.display = ''; n.left = st.left; n.top = st.top; n.width = st.width; n.height = st.height;
            const sx = W / v[2], sy = H / v[3];
            R.T = new DOMMatrix([sx, 0, 0, sy, -v[0] * sx, -v[1] * sy]).multiply(BATH_SOAP.chainMatrix(R.sky));
            const k = Math.min(this.CC_DPR, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
            R.dpr = k;
            R.cv.style.width = W + 'px'; R.cv.style.height = H + 'px';
            R.cv.width = Math.round(W * k); R.cv.height = Math.round(H * k);
            this.ccDraw(R);
        }
        this.ccShow(R, this.ccOk(R));
        return R;
    },

    ccOk(R) {
        const r = R.root, h = r && r.closest('#bt-cloth-home');
        return !!r && r.isConnected && R.svg.contains(r) && !(h && h.style.opacity === '0') && !!R.svg.getAttribute('viewBox');
    },
    // Прозрачностью с тем же переходом, что у гнезда (как у флакона, rigShow).
    ccShow(R, on, instant) {
        if (R.shown === on && R.back.style.display !== 'none') return;
        R.shown = on;
        const n = R.back;
        n.style.display = '';
        if (instant) n.style.transition = 'none';
        n.style.opacity = on ? '' : '0';
        if (instant) { void n.offsetWidth; n.style.transition = ''; }
    },
    ccHide(R) {
        R.shown = false; R.key = '';
        R.back.style.display = 'none';
        if (R.cv.width) R.cv.width = R.cv.height = 0;
        if (R.root) { R.root.classList.remove('bcc-rigged'); R.root = null; }
    },
    ccAll(fn) {
        if (typeof document === 'undefined') return;
        for (const id of this.CC_BOXES) { const s = document.getElementById(id); if (s && s._bccRig) fn(s._bccRig); }
    },
    ccSweep(instant) {
        this.ccAll(R => {
            if (R.root && !R.root.isConnected) { this.ccHide(R); return; }
            if (R.root) this.ccShow(R, this.ccOk(R), instant);
        });
    },

    // ---------- кадр ----------
    ccDraw(R) {
        const g = R.ctx, cv = R.cv, art = this._cloud;
        if (!g || !cv.width || !R.T || !art) return;
        const k = R.dpr, T = R.T;
        // Осадка — та же, что у копии в svg: на полке осевшее, в руке шар.
        const sg = R.root.querySelector('[data-j="sag"]'), sm = sg && sg.transform.baseVal.consolidate();
        const s = sm ? (sm.matrix.a - 1) / 0.06 : 0;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cv.width, cv.height);
        g.setTransform(k * T.a, k * T.b, k * T.c, k * T.d, k * T.e, k * T.f);
        const SK = this.ccSkyImgs();
        const sky = (SK && SK.far.complete && SK.far.naturalWidth) ? (gg) => {
            // Небо — в координатах экрана: точки слоя ← единицы неба, как у
            // слоёв флакона (rigSky), с качанием парящего холста.
            const m = BATH_SOAP.worldMatrix(R.sky);
            if (!m) return;
            const inv = m.inverse(), L = BATH_SOAP.live, P = BATH_SOAP.MAGIC.PLX, TX = BATH_SOAP.TEX;
            for (const [im, kk] of [[SK.far, P.far], [SK.near, P.near]]) {
                if (!im.complete || !im.naturalWidth) continue;
                const q = T.multiply(inv).translate(-L.px * kk, -L.py * kk);
                if (kk === P.far) R.skyAt = [q.e, q.f];          // для прогона: где на слое угол неба
                gg.setTransform(k * q.a, k * q.b, k * q.c, k * q.d, k * q.e, k * q.f);
                gg.drawImage(im, TX.x, TX.y, TX.w, TX.h);
            }
            gg.setTransform(k * T.a, k * T.b, k * T.c, k * T.d, k * T.e, k * T.f);
        } : null;
        art.paint(g, this.kt, s, sky);
        R.draws++;
    },

    // Палец двинул обёртку — небо в облаке перерисовывается в ТОМ ЖЕ кадре
    // (rAF до вывода кадра), иначе окно и небо разъехались бы на кадр.
    ccKick(svg) {
        const R = svg && svg._bccRig;
        if (!R || !R.root || R.kick || typeof requestAnimationFrame === 'undefined') return;
        R.kick = requestAnimationFrame(() => { R.kick = 0; if (R.root) this.ccDraw(R); });
    }
});
