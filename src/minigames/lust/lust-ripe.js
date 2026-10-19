// Похоть: ванная. «Созревший» пузырь — подсказка к этапу, где пену лопают
// тапами (горка над хвостом, а в забеге «только помыть» — кусок пены на
// червяке). Слов нет (инвариант 9): один пузырь крупнее и ярче соседей,
// дышит и пускает кольцо — «меня можно лопнуть».
//
// Почему не палец-призрак: игрок отказался, рука поверх сцены читалась как
// интерфейс, а не как мир. Пузырь — часть той же пены.
//
// Появляется после ripeMs тишины и гаснет от любого тапа. setTimeout тут —
// ожидание анимации, а не состояние игры (инвариант 1): ничего не копится и
// не сохраняется, вышел из ванной — и подсказка начинается заново.
Object.assign(LustMinigame, {
    // Взвести подсказку заново: прошлую убрать, новую вызвать через ripeMs.
    ripeArm() {
        this.ripeHide();
        if (this.phase !== 'pop' && this.phase !== 'wipe') return;
        this._ripeTimer = setTimeout(() => {
            this._ripeTimer = 0;
            this.ripeShow();
        }, this.cfg().ripeMs || 3000);
    },

    ripeHide() {
        clearTimeout(this._ripeTimer);
        this._ripeTimer = 0;
        if (this._ripe && this._ripe.node) this._ripe.node.remove();
        this._ripe = null;
    },

    // Где вырастить пузырь: горка — крупнейший пузырь верхней группы (она
    // лопнет следующей), червь — самая «серединная» клетка куска, который
    // смоется следующим. Координаты в тех же единицах, в каких лежит
    // соответствующий холст: сцена или точки слоя червя.
    ripeSpot() {
        if (this.phase === 'pop') {
            const H = this.pile;
            if (!H || !H.alive) return null;
            const G = this.pileGroup(H.alive - 1);
            if (!G || !G.bubs || !G.bubs.length) return null;
            let best = 0;
            for (let i = 3; i < G.bubs.length; i += 3) if (G.bubs[i + 2] > G.bubs[best + 2]) best = i;
            return { kind: 'pile', x: H.pb.x + G.bubs[best] / H.R, y: H.pb.y + G.bubs[best + 1] / H.R,
                     r: Math.max(G.bubs[best + 2] / H.R * 1.15, this.cfg().ripeR || 9), look: H.look };
        }
        const C = this.washChunks();
        if (!C) return null;
        const c = C.gone.indexOf(0);
        if (c < 0) return null;
        let sx = 0, sy = 0, n = 0;
        for (let k = 0; k < C.lab.length; k++) if (C.lab[k] === c) { sx += k % C.gw; sy += (k / C.gw) | 0; n++; }
        if (!n) return null;
        sx /= n; sy /= n;
        let at = -1, bd = Infinity;
        for (let k = 0; k < C.lab.length; k++) if (C.lab[k] === c) {
            const d = Math.hypot(k % C.gw - sx, ((k / C.gw) | 0) - sy);
            if (d < bd) { bd = d; at = k; }
        }
        const S = this.MASK_SCALE;
        return { kind: 'worm', x: ((at % C.gw) + 0.5) * C.S / S, y: (((at / C.gw) | 0) + 0.5) * C.S / S,
                 r: this.cfg().ripeWormR || 14,
                 look: Object.assign({}, BATH_ART.latherLook(null, 'cloth'), { foam: BATH_ART.foamLook() }) };
    },

    ripeShow() {
        if (this.phase !== 'pop' && this.phase !== 'wipe') return;
        // Лопается группа или сползает кусок — подождать, пока отыграют.
        if (this._ripe || (this._sloughs && this._sloughs.length) || (this._bursts && this._bursts.length)) {
            this._ripeTimer = setTimeout(() => { this._ripeTimer = 0; this.ripeShow(); }, 400);
            return;
        }
        const s = this.ripeSpot();
        if (!s) return;
        const after = this.el(s.kind === 'pile' ? 'bt-pile-glint' : 'bt-glint');
        if (!after || !after.parentNode) return;
        // Холст 96×96, пузырь радиусом 30 в центре: запас вокруг — на дыхание
        // и кольцо. Слоёв два, чтобы дышал пузырь, а кольцо уходило отдельно.
        const N = 96, R0 = 30, col = BATH_ART.latherColors(s.look, 'cloth');
        const mk = cls => {
            const cv = document.createElement('canvas');
            cv.width = cv.height = N;
            cv.className = cls;
            return cv;
        };
        const ring = mk('bt-ripe-ring'), body = mk('bt-ripe-body');
        const rc = ring.getContext('2d');
        rc.strokeStyle = col.hi; rc.lineWidth = 2.5;
        rc.beginPath(); rc.arc(N / 2, N / 2, R0, 0, Math.PI * 2); rc.stroke();
        const bc = body.getContext('2d');
        const g = bc.createRadialGradient(N / 2 - R0 * 0.3, N / 2 - R0 * 0.35, R0 * 0.1, N / 2, N / 2, R0);
        g.addColorStop(0, col.hi); g.addColorStop(0.55, col[500]); g.addColorStop(1, col.lo);
        bc.globalAlpha = 0.75;
        bc.fillStyle = g;
        bc.beginPath(); bc.arc(N / 2, N / 2, R0, 0, Math.PI * 2); bc.fill();
        bc.globalAlpha = 1;
        bc.strokeStyle = col.lo; bc.lineWidth = 3.5;
        bc.beginPath(); bc.arc(N / 2, N / 2, R0 - 1, 0, Math.PI * 2); bc.stroke();
        // Блик: дуга вверху слева и точка — так пузырь читается пузырём.
        bc.strokeStyle = col.hi; bc.lineWidth = 3.5; bc.lineCap = 'round';
        bc.beginPath(); bc.arc(N / 2, N / 2, R0 * 0.68, Math.PI * 1.1, Math.PI * 1.45); bc.stroke();
        bc.fillStyle = col.hi;
        bc.beginPath(); bc.arc(N / 2 + R0 * 0.38, N / 2 - R0 * 0.5, 2.6, 0, Math.PI * 2); bc.fill();
        const node = document.createElement('div');
        node.className = 'bt-ripe';
        node.appendChild(ring); node.appendChild(body);
        after.parentNode.insertBefore(node, after.nextSibling);
        // Сторона слоя в единицах холста-хозяина: пузырь радиуса r занимает
        // R0 из N/2 половины стороны.
        this._ripe = { node, kind: s.kind, x: s.x, y: s.y, side: s.r * N / 2 / R0 * 2 };
        this.ripeLayout();
    },

    // Поставить слой на место — тем же преобразованием, что у холстов-хозяев
    // (горка — единицы сцены, червь — точки его слоя). Зовётся и при
    // каждой перекладке камеры.
    ripeLayout(pxPerScene) {
        const Z = this._ripe;
        if (!Z) return;
        const half = Z.side / 2, st = Z.node.style;
        st.width = st.height = Z.side + 'px';
        if (Z.kind === 'pile') {
            if (pxPerScene == null) {
                const a = this.sceneToHost({ x: 0, y: 0 }), c = this.sceneToHost({ x: 100, y: 0 });
                pxPerScene = (c.x - a.x) / 100 || 1;
            }
            const o = this.sceneToHost({ x: Z.x - half, y: Z.y - half });
            st.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) scale(${pxPerScene.toFixed(4)})`;
        } else {
            st.transform = `${this._wormT || ''} translate(${(Z.x - half).toFixed(2)}px, ${(Z.y - half).toFixed(2)}px)`;
        }
    },

    // ---------- ХВОСТ: БЛЕСК ПО МАТЕРИАЛУ ----------
    // Этап «поглаживание» водят пальцем вдоль хвоста вверх-вниз. Подсказка —
    // отблеск, который сам проходит по хвосту тем же ходом: от корня к
    // кончику и обратно, пауза, и снова. Он лежит НА коже и обрезан по
    // силуэту хвоста, поэтому читается блеском материала, а не наклейкой.
    // Первая версия — светлый обруч-кольцо — игроку показалась топорной.
    // Заряд подсказка НЕ даёт: его копит rubMove от настоящего пальца.
    //
    // Зовётся каждый кадр из цикла startRub. Время — от кадра рендерера, а
    // не таймером: подсказка сама замолкает вместе с циклом этапа.
    ripeTail(now) {
        const C = this.cfg(), idle = !this.drag && now - this.rubMoved > (C.ripeMs || 3000);
        if (!idle) {
            if (this._tailHint) this.ripeGloss(null);
            this._tailHint = false; this._tailHint0 = 0;
            return;
        }
        if (!this._tailHint0) this._tailHint0 = now;
        const sweep = C.ripeSweepMs || 1000, k = (now - this._tailHint0) % (2 * sweep + (C.ripePauseMs || 1400));
        if (k < 2 * sweep) {
            // Вверх, потом вниз: у каждого хода свой плавный разгон.
            const up = k < sweep, u = (up ? k : k - sweep) / sweep, e = u * u * (3 - 2 * u);
            this._tailHint = true;
            this.ripeGloss(up ? e : 1 - e, Math.sin(Math.PI * u));
        } else if (this._tailHint) {
            this.ripeGloss(null);
            this._tailHint = false;
        }
    },

    // Полоса блеска на доле t оси (0 — корень, 1 — кончик), яркость k.
    // Живёт в группе хвоста (его координаты, борт режет её так же, как
    // хвост), создаётся один раз и только двигается. Форма — прямоугольник
    // поперёк ствола с градиентом ВДОЛЬ оси: ярко посередине, к краям в
    // ноль; поверх него узкая белая жилка — как у глянца. Обрезка — по
    // силуэту хвоста с запасом на изгиб (clip пересобирается только когда
    // хвост изменился).
    ripeGloss(t, k) {
        let g = this.el('bt-tail-gloss');
        if (t == null) { if (g) g.setAttribute('opacity', '0'); return; }
        const pivot = this.el('bt-tail-pivot');
        if (!pivot) return;
        if (!g || !g.isConnected) {
            const col = BATH_ART.latherColors(BATH_ART.latherLook(null, 'cloth'), 'cloth');
            pivot.insertAdjacentHTML('beforeend',
                `<defs>`
                + `<clipPath id="bt-tail-gloss-clip"><path id="bt-tail-gloss-body" d=""/></clipPath>`
                + `<linearGradient id="bt-tail-gloss-glow" x1="0" y1="0" x2="0" y2="1">`
                + `<stop offset="0" stop-color="${col.hi}" stop-opacity="0"/>`
                + `<stop offset="0.5" stop-color="${col.hi}" stop-opacity="0.7"/>`
                + `<stop offset="1" stop-color="${col.hi}" stop-opacity="0"/></linearGradient>`
                + `<linearGradient id="bt-tail-gloss-vein" x1="0" y1="0" x2="0" y2="1">`
                + `<stop offset="0" stop-color="${col.hi}" stop-opacity="0"/>`
                + `<stop offset="0.5" stop-color="${col.hi}" stop-opacity="0.95"/>`
                + `<stop offset="1" stop-color="${col.hi}" stop-opacity="0"/></linearGradient>`
                + `</defs>`
                + `<g id="bt-tail-gloss" opacity="0" pointer-events="none" clip-path="url(#bt-tail-gloss-clip)">`
                + `<g id="bt-tail-gloss-band">`
                + `<rect id="bt-tail-gloss-a" fill="url(#bt-tail-gloss-glow)"/>`
                + `<rect id="bt-tail-gloss-b" fill="url(#bt-tail-gloss-vein)"/></g></g>`);
            g = this.el('bt-tail-gloss');
        }
        const grow = this.tailGrow(), T = BATH_ART.TAIL;
        const key = this.bend.toFixed(3) + '|' + grow.toFixed(3);
        if (key !== this._glossKey) {
            this._glossKey = key;
            this.el('bt-tail-gloss-body').setAttribute('d', BATH_ART.tailD(this.bend, grow).body);
        }
        const pts = BATH_ART.tailSpine(this.bend, grow), p = BATH_ART.tailAt(pts, t);
        const w = (BATH_ART.tailHalfSide(t, grow, -1) + BATH_ART.tailHalfSide(t, grow, 1)) / 2;
        // Поперёк оси — в системе ствола (см. tailD): поворот полосы на угол
        // оси; по краям полоса шире ствола, лишнее срежет clip.
        const deg = Math.atan2(Math.sin(p.a), (T.side || 1) * Math.cos(p.a)) * 180 / Math.PI;
        const len = T.len * grow * 0.3, W = Math.max(w, T.base * 0.4) * 2.6;
        const band = this.el('bt-tail-gloss-band');
        band.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${deg.toFixed(1)})`);
        const a = this.el('bt-tail-gloss-a'), b = this.el('bt-tail-gloss-b');
        // Полоса лежит вдоль оси (x — поперёк, y — вдоль) и чуть скошена к
        // ходу, как блик на цилиндре.
        a.setAttribute('x', (-W / 2).toFixed(1)); a.setAttribute('width', W.toFixed(1));
        a.setAttribute('y', (-len / 2).toFixed(1)); a.setAttribute('height', len.toFixed(1));
        b.setAttribute('x', (-W / 2).toFixed(1)); b.setAttribute('width', W.toFixed(1));
        b.setAttribute('y', (-len * 0.09).toFixed(1)); b.setAttribute('height', (len * 0.18).toFixed(1));
        g.setAttribute('opacity', Math.min(1, k * 1.5).toFixed(2));
    },
});
