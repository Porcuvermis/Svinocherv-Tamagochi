// ================= АППАРАТ АЛЧНОСТИ: КОЛОДА КОЛЕСА =================
// Продолжение GreedJunkLit. Половина колеса всегда под монетами рамки,
// поэтому на нём не обязательно держать все призы сразу: то, что за кадром,
// меняется (docs/plan/31-greed-premium.md, разд. 0б, идея игрока 17.11).
//
// На броске (wheelDeckPlan) колесо знает исход и строит новую раскладку:
//   * выпавший приз — на сектор, который встанет под язычок; обычный приз
//     ищется среди секторов, где он уже есть, — подмены нет;
//   * редкие призы прошлой крутки уходят — сектор возвращается к основе
//     (GreedJunk.WHEEL_BASE);
//   * ложные редкие: каждый редкий кладётся «просто так» с шансом вдвое
//     больше, чем выпадает. Иначе редкий значок на колесе выдавал бы
//     выигрыш за секунды до остановки. Кладутся случайно и НЕ рядом с
//     выпавшим сектором: «почти выигрыш» не делаем (план 16, разд. 3).
// Подмена — только когда сектор целиком под монетами (wheelHidden): кусок
// карт диска вокруг значка растрируется заново (те же пиксели, что у диска
// целиком) и ложится в текстуры (deviceTile). По одному куску за раз: куски
// соседних значков перекрываются, и каждый рисуется с текущей раскладкой
// соседей — иначе один затёр бы другой.
Object.assign(GreedJunkLit, {
    WHEEL_DECOY: 2,       // ложный редкий — во столько раз чаще, чем выпадает
    WHEEL_RARE: 0.1,      // приз с шансом меньше этого — редкий
    // полусторона куска вокруг значка, единицы рисунка диска: значок с
    // поворотом торчит от середины до ~26 (кость мяса) — при 23 хвост
    // убранного значка оставался на секторе (tools/greed-wheel-deck.js)
    WHEEL_TILE: 27,

    wheelDeckReset() {
        const G = GreedJunk;
        if (!G.wheelNow) G.wheelNow = G.WHEEL_SECTORS.slice();
        // карты диска только что собраны по wheelNow — очередь прошлой
        // раскладки к ним не относится
        this._deck = { queue: [], busy: null, target: -1, forced: 0, swaps: 0 };
    },

    // Шансы призов колеса из конфига: ключ → доля.
    wheelOdds() {
        const list = (ECONOMY.minigames.greed && ECONOMY.minigames.greed.wheel && ECONOMY.minigames.greed.wheel.sectors) || [];
        const all = list.reduce((s, x) => s + x.weight, 0) || 1, p = {};
        list.forEach(x => { p[x.key] = (p[x.key] || 0) + x.weight / all; });
        return p;
    },

    // Новая раскладка под исход key (null — превью: любой сектор). Возвращает
    // номер сектора, который встанет под язычок.
    wheelDeckPlan(key) {
        const G = GreedJunk, D = this._deck;
        const now = G.wheelKeys(), n = now.length, base = G.WHEEL_BASE, p = this.wheelOdds();
        const rnd = (a) => a[Math.floor(Math.random() * a.length)];
        const rare = (k) => k in p && p[k] < this.WHEEL_RARE;
        if (!D) return Math.floor(Math.random() * n);
        const next = now.map((k, i) => rare(k) ? base[i] : k);
        let idx;
        if (key == null) idx = Math.floor(Math.random() * n);
        else {
            const at = next.map((k, i) => k === key ? i : -1).filter(i => i >= 0);
            idx = at.length ? rnd(at) : Math.floor(Math.random() * n);
            next[idx] = key;
        }
        const far = (i) => Math.min((i - idx + n) % n, (idx - i + n) % n) > 2;
        Object.keys(p).filter(rare).forEach(k => {
            if (Math.random() >= Math.min(0.6, this.WHEEL_DECOY * p[k])) return;
            const free = next.map((x, i) => far(i) && !rare(x) ? i : -1).filter(i => i >= 0);
            if (free.length) next[rnd(free)] = k;
        });
        if (!G.wheelNow) G.wheelNow = now.slice();
        D.queue = next.map((k, i) => k !== G.wheelNow[i] ? { i, k } : null).filter(Boolean);
        D.target = idx;
        return idx;
    },

    // Значок сектора i целиком под монетами рамки при повороте rot. Рамка
    // закрывает поле левее x 0 — за ним колесо не видно.
    wheelHidden(i, rot) {
        const G = GreedJunk, W = G.SLOTS.wheel, k = G.wheelK(), n = G.wheelKeys().length;
        const a = i / n * Math.PI * 2 - Math.PI / 2 + rot;
        return W.cx + Math.cos(a) * G.WHEEL.rIcon * k + this.WHEEL_TILE * k < 0;
    },

    // Каждый кадр колеса: первая подмена из очереди, чей сектор сейчас за
    // кадром (сектор выпавшего — первым).
    wheelDeckStep() {
        const D = this._deck, M = this._wheel;
        if (!D || D.busy || !D.queue.length || !M) return;
        const c = D.queue.find(q => q.force) ||
                  D.queue.find(q => q.i === D.target && this.wheelHidden(q.i, M.rot)) ||
                  D.queue.find(q => this.wheelHidden(q.i, M.rot));
        if (c) this.wheelSwap(c);
    },

    // Колесо встало, а сектор выпавшего ещё не подменён (растр не успел ни
    // в один заход за кадр) — подменить сразу, на виду: приз под язычком
    // важнее. Счётчик forced — для проверки (tools/greed-wheel-deck.js).
    wheelDeckEnsure() {
        const D = this._deck;
        if (!D) return;
        const c = D.queue.find(q => q.i === D.target);
        if (!c) return;
        D.forced++;
        c.force = true;
        this.wheelDeckStep();
    },

    wheelSwap(c) {
        const D = this._deck, G = GreedJunk, Q = this._wgl, Sp = this._wheelSpr;
        if (!Q || !Sp) return;
        D.busy = c;
        const keys = G.wheelNow.slice();
        keys[c.i] = c.k;
        const W = G.WHEEL, n = keys.length, R = Sp.Rd, px = Q.disc.w, ps = px / (R * 2), T = this.WHEEL_TILE;
        const a = c.i / n * Math.PI * 2 - Math.PI / 2, cx = Math.cos(a) * W.rIcon, cy = Math.sin(a) * W.rIcon;
        const x0 = Math.max(0, Math.floor((cx - T + R) * ps)), y0 = Math.max(0, Math.floor((cy - T + R) * ps));
        const x1 = Math.min(px, Math.ceil((cx + T + R) * ps)), y1 = Math.min(Q.disc.h, Math.ceil((cy + T + R) * ps));
        const vb = { x: x0 / ps - R, y: y0 / ps - R, w: (x1 - x0) / ps, h: (y1 - y0) / ps, pw: x1 - x0, ph: y1 - y0 };
        const svgs = ['albedo', 'height', 'mat'].map(pass => Sp.svg(pass, keys, vb));
        G.pass = 'baked';
        Promise.all(svgs.map(s => this.image(s))).then(imgs => {
            D.busy = null;
            if (this._deck !== D || this._wgl !== Q) return;
            // пока шёл растр: сектор вышел на виду — в следующий заход за
            // кадр; соседи подменились — кусок нарисован со старыми, заново
            if (!c.force && !this.wheelHidden(c.i, this._wheel.rot)) return;
            if (G.wheelNow.some((k, j) => j !== c.i && k !== keys[j])) return;
            this.deviceTile(Q, Q.disc, imgs, x0, y0);
            G.wheelNow[c.i] = c.k;
            D.queue = D.queue.filter(q => q !== c);
            D.swaps++;
            if (this._wheel) this._wheel.shown = null;
        }).catch(() => { D.busy = null; });
    }
});
