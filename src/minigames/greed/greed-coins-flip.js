// ================= АЛЧНОСТЬ: МОНЕТА ПОЯВЛЯЕТСЯ И ИСЧЕЗАЕТ В БЛИКЕ =================
// docs/plan/27-greed-skin.md, переход. Замысел игрока:
//   монета стоит ребром к экрану — её не видно; поворачивается и, пока ещё
//   бесплотная, показывает на своей плоскости только блик (прозрачный
//   материал, который отражает свет). Когда ось монеты проходит точно на
//   свет, блик в пике — вспышка цвета самого яркого места монеты, — и под
//   ней монета становится настоящей. Дальше блик гаснет, монета
//   докручивается в свою позу. Исчезает обратным ходом: поворачивается в
//   любую сторону, ловит пиковый блик, в нём становится бесплотной и уходит
//   на ребро.
//
// Свет тот же, что у кучи (GreedCoins.LIGHT, наклон телефона — Tilt.turn):
// «пик» — не придуманная вспышка по таймеру, а момент, когда нормаль монеты
// совпадает с полувектором света. Поэтому путь оси монеты: ребро → H → поза
// (дуги по сфере), а материализация — в точке H.
//
// Здесь — только расчёт состояния монеты по времени (ось, проявленность,
// вспышка, искра). Рисует greed-coins-batch.js: плоская монета, повёрнутая
// в шейдере, — без перепекания поз. Толщины ребра нет: на ребре монета и так
// невидима. Отработано на показе в 🐞 (одна монета → кучка → весь экран;
// показ убран, когда переход встал в игру, — история в docs/plan/27).
Object.assign(GreedCoins, {
    FLIP: { toPeak: 520, fromPeak: 680, flash: 45, glow: 0.75, spark: 300, seen: 0.05, lead: 90, ghost: 0 },

    // ---------- векторы ----------
    v3: {
        norm: (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; },
        dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        // дуга по сфере от a к b, доля t
        slerp(a, b, t) {
            const d = Math.max(-1, Math.min(1, this.dot(a, b))), w = Math.acos(d);
            if (w < 1e-4) return a.slice();
            const s = Math.sin(w), k0 = Math.sin((1 - t) * w) / s, k1 = Math.sin(t * w) / s;
            return this.norm([a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1]);
        }
    },
    tiltMat(t) {
        const S = this.LIGHT, D = Math.PI / 180, ay = t.x * S.tiltMax * D, ax = t.y * S.tiltMax * D;
        const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
        return [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
    },
    // Полувектор света в «системе блюда»: какая ось монеты сейчас ловит пик.
    peakAxis(t) {
        const S = this.LIGHT, l = this.v3.norm(S.L), H = this.v3.norm([l[0], l[1], l[2] + 1]), M = this.tiltMat(t);
        // M — столбцами; Mᵀ·H
        return this.v3.norm([M[0] * H[0] + M[1] * H[1] + M[2] * H[2], M[3] * H[0] + M[4] * H[1] + M[5] * H[2], M[6] * H[0] + M[7] * H[1] + M[8] * H[2]]);
    },
    // Ось на ребре: в плоскости экрана, со стороны, противоположной позе от
    // пика, — тогда дуга ребро → пик → поза идёт одним махом, без возврата.
    edgeAxis(H, pose, rnd) {
        let x = H[0] - pose[0], y = H[1] - pose[1];
        if (Math.hypot(x, y) < 0.05) { const a = rnd * Math.PI * 2; x = Math.cos(a); y = Math.sin(a); }
        const l = Math.hypot(x, y);
        return [x / l, y / l, 0];
    },

    // Состояние монеты в момент t (мс от начала хода). dir: 'in' | 'out'.
    // → { n, m (0 — бесплотна, 1 — настоящая), flash (0..1) }
    // Когда загорается искра: за F.lead мс до того, как блик бесплотной
    // монеты станет заметен (ярче F.seen) — искра успевает вспыхнуть и
    // раскрыться прямо в этот блик. Расчёт блика — как в шейдере (ghost).
    // Было: искра на «почти ребре» и ровное стеклянное свечение до блика —
    // игрок: полупрозрачная миндалина выбивается из стиля, убрать.
    firstSeen(c) {
        const F = this.FLIP, V = this.v3, S = this.LIGHT;
        const toP = (x) => 1 - Math.cos(x * Math.PI / 2);
        for (let t = 0; t <= F.toPeak; t += 4) {
            const n = V.slerp(c.edge, c.H, toP(t / F.toPeak)), c0 = Math.max(0, V.dot(n, c.H));
            if (S.sharp * Math.pow(c0, S.shin * 3) * 1.1 + Math.pow(c0, S.shin) * 0.35 > F.seen) return Math.max(0, t - F.lead);
        }
        return F.toPeak;
    },

    // Состояние монеты в момент t (мс от начала хода). dir: 'in' | 'out'.
    // → { n, m (0 — бесплотна, 1 — настоящая), flash (0..1),
    //     reveal (докуда от центра виден бесплотный блик, доли радиуса),
    //     star (0..1 — звёздочка в центре) }
    // Звёздочка (замысел игрока): пока монету ещё не видно, в её центре
    // вспыхивает искра в несколько пикселей и взрывается в форму первого
    // кадра блика. Блик проявляется от центра кругом в плоскости монеты —
    // на экране это эллипс самой монеты. На исчезновении — наоборот: блик
    // стягивается в искру, искра гаснет.
    flipState(c, t, dir) {
        const F = this.FLIP, V = this.v3;
        if (c.quiet) return this.quietState(c, t, dir);
        // К пику — разгоном, от пика — торможением: монета проносится через
        // пик на полной скорости. С плавным входом-выходом она замедлялась у
        // самого пика, и белая фаза тянулась (игрок: «укороти белую фазу»).
        const toP = (x) => 1 - Math.cos(x * Math.PI / 2), fromP = (x) => Math.sin(x * Math.PI / 2);
        let n, m;
        if (dir === 'in') {
            if (t < F.toPeak) { n = V.slerp(c.edge, c.H, toP(t / F.toPeak)); m = 0; }
            else { n = V.slerp(c.H, c.pose, fromP(Math.min(1, (t - F.toPeak) / F.fromPeak))); m = 1; }
        } else {
            if (t < F.fromPeak) { n = V.slerp(c.pose, c.H, toP(t / F.fromPeak)); m = 1; }
            else { n = V.slerp(c.H, c.edge, fromP(Math.min(1, (t - F.fromPeak) / F.toPeak))); m = 0; }
        }
        const tp = dir === 'in' ? F.toPeak : F.fromPeak, dt = (t - tp) / F.flash;
        if (c.seen === undefined) c.seen = this.firstSeen(c);
        // искра стоит вокруг первого видимого кадра блика
        const ts = dir === 'in' ? c.seen : F.fromPeak + (F.toPeak - c.seen);
        let p = (t - ts) / F.spark;
        if (dir === 'out') p = 1 - p;                 // время назад
        p = Math.max(0, Math.min(1, p));
        const reveal = p <= 0 ? 0 : 1.15 * (1 - Math.pow(1 - p, 3));
        const star = p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, p * 1.6)) * (1 - p * 0.6);
        return { n, m, flash: Math.exp(-dt * dt), reveal: m ? 9 : reveal, star, starP: p, ghost: F.ghost };
    },

    // Тихая монета: без искры, блика бесплотной монеты и вспышки — просто
    // поворачивается с ребра в позу, проступая из темноты (m растёт с
    // поворотом). Так появляются нижние слои кучи: вспыхивает только верх.
    // Когда вспыхивали все, в разгар появления экран заливало белым (игрок),
    // а нижние монеты всё равно закрыты верхними — их вспышки только слепили.
    quietState(c, t, dir) {
        const F = this.FLIP, run = F.toPeak + F.fromPeak;
        let p = Math.max(0, Math.min(1, t / run));
        if (dir === 'out') p = 1 - p;
        const e = Math.sin(p * Math.PI / 2);
        return { n: this.v3.slerp(c.edge, c.pose, e), m: p * p, flash: 0, reveal: 9, star: 0, starP: 0, quiet: true };
    }
});
