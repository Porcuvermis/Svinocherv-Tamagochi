// ================= АППАРАТ АЛЧНОСТИ: ПАЧИНКО — ФИЗИКА ШАРИКА =================
// Продолжение GreedJunk. Шарик против гвоздей, стенок, дуги, перегородки
// дорожки и лунок. Своя маленькая физика, а не библиотека: зависимостей в
// игре нет (правка видна в браузере сразу), и нужен детерминизм — один и тот
// же запуск всегда ведёт в одну и ту же лунку. На шаге «исход» запуск
// подбирается перебором той же физики без рисования (исход решён заранее,
// инвариант 2), поэтому здесь ни DOM, ни времени — только состояние и шаг.
//
// Единицы — поля аппарата, время — секунды, y вниз. Шаг фиксированный
// (STEP): на любом кадре телефона путь шарика один и тот же.
Object.assign(GreedJunk, {
    PACH_PHYS: {
        STEP: 1 / 480,       // шаг физики, с: при 400 ед/с — меньше радиуса шарика за шаг
        g: 260,              // тяжесть, ед/с²: поле ~240 падает за ~1.4 с
        r: 2.5,              // радиус шарика
        nailR: 1.7,
        eNail: 0.5,          // упругость гвоздя (доля нормальной скорости после удара)
        eWall: 0.35,
        eArc: 0.15,          // дуга почти не отбивает — шарик катится по ней
        fric: 0.985,         // трение вдоль поверхности при ударе
        hit: 25,             // нормальная скорость, с которой касание — удар
        lip: 2.4,            // радиус губы стаканчика: вход 18 − 4·2.4 ≈ 8, шарик 5
        vmax: 520,
        v0: [345, 385],      // скорость запуска кнопкой: разброс пружины
        maxT: 12             // дольше — шарик застрял, уходит в сток
    },

    // Мир: что неподвижно. Собирается один раз из рисунка (PACH, гвозди,
    // лунки) — чтобы шарик бился ровно о то, что нарисовано.
    pachWorld() {
        if (this._pachWorld) return this._pachWorld;
        const P = this.PACH, A = P.arc, C = P.cup, K = this.PACH_PHYS;
        const fx0 = P.x0 + P.wall, fx1 = P.x1 - P.wall, fy1 = P.y1 - P.panel;
        const nails = this.pachNails();
        // гвозди по клеткам 16×16: проверять только соседей
        const grid = new Map(), cell = 16, key = (i, j) => i + ',' + j;
        nails.forEach(([x, y]) => {
            const k = key(Math.floor(x / cell), Math.floor(y / cell));
            (grid.get(k) || grid.set(k, []).get(k)).push([x, y]);
        });
        const cups = this.PACH_CUPS.map(c => ({ key: c.key, x0: c.x - C.w / 2, x1: c.x + C.w / 2, y0: c.y, y1: c.y + C.h }));
        const laneX = (P.sep + 2 + fx1) / 2;
        return (this._pachWorld = {
            nails, grid, cell, key, cups,
            left: fx0, sep: P.sep + 1, sepTop: A.cy + 12, laneR: A.cx + A.r - 1, drain: P.drain,
            arc: A, start: { x: laneX, y: fy1 - 12 - K.r }
        });
    },

    // Новый шарик на пружине дорожки, скорость запуска v0 вверх.
    pachBall(v0) {
        const S = this.pachWorld().start;
        return { x: S.x, y: S.y, vx: 0, vy: -v0, t: 0, done: null, hits: 0 };
    },

    // Отражение от поверхности с нормалью (nx, ny): нормальная доля
    // скорости гасится упругостью e, касательная — трением, но только при
    // ударе (|vn| > hit). Было — трение на каждом шаге касания: шарик,
    // катящийся по дуге, касается её каждый шаг и терял всю скорость наверху.
    // Возвращает true, если это удар (а не качение): по нему — отдача в палец.
    pachBounce(b, nx, ny, e) {
        const vn = b.vx * nx + b.vy * ny;
        if (vn >= 0) return false;
        const tx = b.vx - vn * nx, ty = b.vy - vn * ny, k = vn < -this.PACH_PHYS.hit ? this.PACH_PHYS.fric : 1;
        b.vx = tx * k - vn * e * nx;
        b.vy = ty * k - vn * e * ny;
        // лежит или катится — касается каждый шаг, это не удар
        return vn < -this.PACH_PHYS.hit;
    },

    // Один шаг. Возвращает событие: 'nail' — удар о гвоздь (отдача в палец),
    // 'cup:<ключ>' / 'drain' — шарик пойман (b.done), иначе null.
    pachStepBall(b) {
        if (b.done) return null;
        const K = this.PACH_PHYS, Wd = this.pachWorld(), A = Wd.arc, r = K.r, dt = K.STEP;
        b.vy += K.g * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > K.vmax) { b.vx *= K.vmax / sp; b.vy *= K.vmax / sp; }
        b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
        let ev = null;

        // дуга сверху: внутри круга
        if (b.y < A.cy) {
            const dx = b.x - A.cx, dy = b.y - A.cy, d = Math.hypot(dx, dy), lim = A.r - 1.2 - r;
            if (d > lim) { const nx = -dx / d, ny = -dy / d; b.x = A.cx - nx * lim; b.y = A.cy - ny * lim; this.pachBounce(b, nx, ny, K.eArc); }
        }
        // стенки: левая, правая стенка дорожки
        if (b.x < Wd.left + r) { b.x = Wd.left + r; this.pachBounce(b, 1, 0, K.eWall); }
        if (b.x > Wd.laneR - r) { b.x = Wd.laneR - r; this.pachBounce(b, -1, 0, K.eWall); }
        // Клапан наверху дорожки: шарик вылетел на дугу — назад в дорожку не
        // пускает (у настоящих пачинко так же). Без него отскочивший шарик
        // падал обратно на пружину и лежал там.
        if (b.y < Wd.sepTop - r - 2) b.out = true;
        if (b.out && b.x > Wd.sep && b.y > Wd.sepTop - r) { b.y = Wd.sepTop - r; this.pachBounce(b, 0, -1, K.eWall); }
        // перегородка дорожки: ниже её верха шарик либо в дорожке, либо на поле
        if (b.y > Wd.sepTop) {
            const inLane = b.x > Wd.sep;
            if (inLane && b.x < Wd.sep + 1 + r) { b.x = Wd.sep + 1 + r; this.pachBounce(b, 1, 0, K.eWall); }
            if (!inLane && b.x > Wd.sep - 1 - r) { b.x = Wd.sep - 1 - r; this.pachBounce(b, -1, 0, K.eWall); }
            // в дорожке шарик лежит на пружине
            if (inLane && b.y > Wd.start.y) { b.y = Wd.start.y; this.pachBounce(b, 0, -1, K.eWall); }
        } else if (Math.abs(b.y - Wd.sepTop) < r && Math.abs(b.x - Wd.sep) < 1 + r * 0.6) {
            // торец перегородки — как гвоздь
            const dx = b.x - Wd.sep, dy = b.y - Wd.sepTop, d = Math.hypot(dx, dy) || 1;
            if (d < r + 1) { b.x = Wd.sep + dx / d * (r + 1); b.y = Wd.sepTop + dy / d * (r + 1); this.pachBounce(b, dx / d, dy / d, K.eNail); }
        }
        // гвозди: только в соседних клетках
        const ci = Math.floor(b.x / Wd.cell), cj = Math.floor(b.y / Wd.cell), R = r + K.nailR;
        for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
            const list = Wd.grid.get(Wd.key(i, j));
            if (!list) continue;
            for (const n of list) {
                const dx = b.x - n[0], dy = b.y - n[1], d2 = dx * dx + dy * dy;
                if (d2 >= R * R) continue;
                const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d;
                b.x = n[0] + nx * R; b.y = n[1] + ny * R;
                if (this.pachBounce(b, nx, ny, K.eNail)) { b.hits++; ev = 'nail'; }
            }
        }
        // Лунки. Вход — середина верха между закатанными краями (губы —
        // круги lip у углов): коснулся входа сверху — пойман. Губа отбивает,
        // как гвоздь. Было — весь верх банки входом: стаканчики ловили две
        // трети шариков, в сток уходило 4%. А ещё раньше верх был стенкой —
        // шарик ложился на него и лежал до конца времени.
        // Ниже губ — стенка банки (бока и дно).
        const lip = K.lip;
        for (const c of Wd.cups) {
            if (b.x < c.x0 - r - lip || b.x > c.x1 + r + lip || b.y < c.y0 - r - lip || b.y > c.y1 + r) continue;
            if (b.x > c.x0 + 2 * lip && b.x < c.x1 - 2 * lip && b.y < c.y0 + 2 && b.y + r >= c.y0 && b.vy >= 0) {
                b.done = 'cup:' + c.key; return b.done;
            }
            for (const lx of [c.x0 + lip, c.x1 - lip]) {
                const dx = b.x - lx, dy = b.y - c.y0, d = Math.hypot(dx, dy), R2 = r + lip;
                if (d >= R2 || d < 1e-6) continue;
                b.x = lx + dx / d * R2; b.y = c.y0 + dy / d * R2;
                if (this.pachBounce(b, dx / d, dy / d, K.eNail)) ev = 'nail';
            }
            if (b.y < c.y0) continue;
            // ближайшая точка банки ниже губ
            const qx = Math.max(c.x0, Math.min(c.x1, b.x)), qy = Math.max(c.y0, Math.min(c.y1, b.y));
            let dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy);
            if (d >= r) continue;
            if (d < 1e-6) { dx = 0; dy = -1; d = 1; }    // внутри — наверх
            const nx = dx / d, ny = dy / d;
            b.x = qx + nx * r; b.y = qy + ny * r;
            if (this.pachBounce(b, nx, ny, K.eWall)) ev = 'nail';
        }
        // Почти стоит полсекунды — подтолкнуть к середине поля. Раскладка
        // гвоздей щелей уже шарика не оставляет, но лечь шарику ещё есть
        // где (ровно на шляпку). Толчок от места, не от случая: запуск
        // по-прежнему всегда ведёт в одну лунку.
        b.slow = Math.hypot(b.vx, b.vy) < 6 ? (b.slow || 0) + dt : 0;
        if (b.slow > 0.5) { b.vx += b.x < A.cx ? 28 : -28; b.vy -= 12; b.slow = 0; }
        // сток
        if (b.y > Wd.drain + 2 && b.x < Wd.sep) { b.done = 'drain'; return b.done; }
        if (b.t > K.maxT) { b.done = 'drain'; return b.done; }
        return ev;
    }
});
