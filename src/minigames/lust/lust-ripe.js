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
        // Отблеск на хвосте — тоже: вышли посреди прохода, а в следующий
        // забег хвост всплыл бы с застрявшим светом.
        if (typeof BATH_ART !== 'undefined' && BATH_ART.gleam && BATH_ART.gleam.a) this.ripeGleam(0, 0);
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
    // отблеск света, который сам проходит по хвосту тем же ходом: от корня к
    // кончику и обратно, пауза, и снова.
    //
    // Рисует его сам хвост (BATH_ART.tailLights, gleam): те же линзы со
    // стороны света, что и постоянный блик, — поэтому отблеск повторяет
    // вздутия звеньев, изгиб и купол головки и читается блеском кожи.
    // Были до него: светлый обруч поперёк (топорно) и полоса-градиент,
    // обрезанная по силуэту (плоская наклейка, не материал).
    // Заряд подсказка НЕ даёт: его копит rubMove от настоящего пальца.
    //
    // Зовётся каждый кадр из цикла startRub. Время — от кадра рендерера, а
    // не таймером: подсказка сама замолкает вместе с циклом этапа.
    ripeTail(now) {
        const C = this.cfg(), idle = !this.drag && now - this.rubMoved > (C.ripeMs || 3000);
        if (!idle) {
            if (this._tailHint) this.ripeGleam(0, 0);
            this._tailHint = false; this._tailHint0 = 0;
            return;
        }
        if (!this._tailHint0) this._tailHint0 = now;
        const sweep = C.ripeSweepMs || 1100, k = (now - this._tailHint0) % (2 * sweep + (C.ripePauseMs || 1400));
        if (k < 2 * sweep) {
            // Вверх, потом вниз — одним плавным ходом туда-обратно (косинус):
            // у кончика свет на миг задерживается и вспыхивает ярче, как
            // блик на вершине выпуклости.
            const u = k / (2 * sweep), t = 0.06 + 0.88 * (1 - Math.cos(2 * Math.PI * u)) / 2;
            const fade = Math.min(1, u * 6, (1 - u) * 6);
            this._tailHint = true;
            this.ripeGleam(t, fade * (0.75 + 0.25 * t));
        } else if (this._tailHint) {
            this.ripeGleam(0, 0);
            this._tailHint = false;
        }
    },

    ripeGleam(t, a) {
        BATH_ART.setGleam(t, a);
        const g = this.el('bt-tail-gleam');
        if (g) g.setAttribute('opacity', Math.min(1, a * 1.3).toFixed(2));
    },
});
