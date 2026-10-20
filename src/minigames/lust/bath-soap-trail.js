// ================= ШЛЕЙФ ИСКР ВОЛШЕБНОГО ФЛАКОНА =================
// Продолжение BATH_SOAP (bath-soap.js). Замысел игрока (docs/plan/24-soap-
// trail.md): флакон «чиркает о воздух», как спичка, и из-под него
// высекаются разноцветные искры. Каждая получает при рождении толчок назад
// от движения и дальше летит своим путём — «как упавший на стол волос»:
// почти прямо, волной, с завитком. Живёт 0,3–0,7 с, к концу мельчает и
// пропадает разом. Натирают флаконом червя — искр втрое больше.
//
// Шлейф заменил орбиту огоньков, огоньки по кромке, вспышки и пыль: они
// крутились вокруг вещи одним и тем же узором и читались заставкой.
//
// ПОЧЕМУ СВОЙ ХОЛСТ. Холст флакона спереди (bath-soap-rig.js) — размером с
// вещь и едет вместе с ней, а искра, родившись, остаётся в мире и улетает
// за край вещи. Поэтому — холст во всю сцену поверх руки, в единицах
// холста ванной (390×844). Живёт, только пока есть искры: нет искр —
// очищен и спрятан, слоя впустую не держит (docs/traps.md, п. 152).
//
// ПОЧЕМУ СВОЙ ЦИКЛ. Цикл флакона (wake) — не чаще 30 кадров, а через кадр
// на медленном устройстве; искра в полсекунды на таком шаге дёргается.
// Цикл флакона только сообщает, какие флаконы видны (trailWatch); стоит он
// (ванная закрыта, переезд камеры, «мыло замерло») — новых искр нет,
// прежние доживают.
//
// Случай — только при рождении искры: дальше её путь считается по времени.
Object.assign(BATH_SOAP, {
    TRAIL_DPR: 2,
    trail: { ps: [], src: new Map(), roots: [], seen: 0, raf: 0, last: 0, el: null, ctx: null, map: '', shown: false },

    trailWatch(roots, now) {
        const T = this.trail;
        T.roots = roots; T.seen = now;
        if ((roots.length || T.ps.length) && !T.raf && typeof requestAnimationFrame !== 'undefined')
            T.raf = requestAnimationFrame(t => this.trailStep(t));
    },

    trailStep(now) {
        const T = this.trail, M = this.MAGIC.TRAIL;
        // «Мыло замерло» (замер, снимок) — искры стоят где были, цикл
        // встаёт; оживит его цикл флакона (trailWatch), когда отомрёт.
        if (this.frozen) { T.raf = 0; T.last = 0; return; }
        const dt = T.last ? Math.min(0.05, (now - T.last) / 1000) : 0;
        T.last = now;
        const fresh = now - T.seen < 200;
        if (fresh) this.trailEmit(now, dt);
        else T.src.clear();
        for (let i = T.ps.length - 1; i >= 0; i--) {
            const p = T.ps[i];
            p.t += dt;
            if (p.t >= p.life) { T.ps.splice(i, 1); continue; }
            const u = p.t / p.life;
            p.a += (p.w0 + p.curl * u + p.wave * Math.sin(p.f * p.t + p.ph)) * dt;
            p.v *= Math.exp(-M.DRAG * dt);
            p.tail.unshift(p.x, p.y);
            if (p.tail.length > 2 * M.TAIL) p.tail.length = 2 * M.TAIL;
            p.x += Math.cos(p.a) * p.v * dt;
            p.y += Math.sin(p.a) * p.v * dt;
        }
        this.trailDraw();
        if (!T.ps.length && !fresh) { T.raf = 0; T.last = 0; return; }
        T.raf = requestAnimationFrame(t => this.trailStep(t));
    },

    // Рождение — от пути низа флакона, а не по таймеру: стоит — не сыплет
    // (разве что изредка одна), ведут быстрее — гуще.
    trailEmit(now, dt) {
        const T = this.trail, M = this.MAGIC.TRAIL, L0 = typeof LustMinigame !== 'undefined' ? LustMinigame : null;
        // Натирают — мылом по телу, а не просто ведут мыло по воздуху
        // (rubBodyAt ставит lust-wash.js, onMove, только когда тёрли тело).
        const rub = !!(L0 && L0.drag && L0.drag.kind === 'soap' && now - (L0.rubBodyAt || 0) < 250);
        const keep = new Set();
        for (const r of T.roots) {
            const svg = r.isConnected && r.ownerSVGElement, m = svg && this.worldMatrix(r);
            if (!m) continue;
            // Ключ — холст, а не узел: вещь в руке перерисовывается, а путь
            // её низа должен продолжаться.
            const key = svg.id;
            keep.add(key);
            const s = Math.hypot(m.a, m.b), p = m.transformPoint(new DOMPoint(0, this.MAGIC.FLOOR));
            let q = T.src.get(key);
            if (!q) { T.src.set(key, { x: p.x, y: p.y, vx: 0, vy: 0, acc: Math.random() }); continue; }
            const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) / s;
            q.x = p.x; q.y = p.y;
            // Перескок (вещь встала в другое место за один кадр) — не путь.
            if (d > 60 || !dt) continue;
            // Скорость — сглаженная: шаг пальца неровный, и «назад» дрожало бы.
            const a = Math.min(1, dt * 12);
            q.vx += (dx / dt - q.vx) * a; q.vy += (dy / dt - q.vy) * a;
            const k = rub && key === 'bt-hand' ? M.RUB : 1;
            const moving = Math.hypot(q.vx, q.vy) / s > 8;
            // В покое — изредка одна, но только у оставленного флакона (парит,
            // стоит на полке): палец замер с флаконом — значит, замер и шлейф.
            q.acc += moving ? d * M.PER * k : L0 && L0.drag ? 0 : dt * M.IDLE;
            if (q.acc < 1) continue;
            const n = Math.floor(q.acc);
            q.acc -= n;
            for (let i = 0; i < n && T.ps.length < M.MAX * k; i++) {
                // По отрезку пути за кадр, а не в одну точку: иначе быстрый
                // взмах сыпал бы искры кучками.
                const back = moving ? Math.random() : 0;
                T.ps.push(this.trailSpark(p.x - dx * back, p.y - dy * back, moving ? q.vx : 0, moving ? q.vy : 0, s, M));
            }
        }
        for (const key of T.src.keys()) if (!keep.has(key)) T.src.delete(key);
    },

    trailSpark(x, y, vx, vy, s, M) {
        const rnd = (a, b) => a + Math.random() * (b - a), sgn = () => (Math.random() < 0.5 ? -1 : 1);
        const go = vx || vy;
        // Назад от движения с разбросом; в покое — куда угодно, но медленнее.
        const a = (go ? Math.atan2(-vy, -vx) : Math.random() * 2 * Math.PI) + (Math.random() - 0.5) * 2 * M.SPREAD;
        // Путь: постоянный изгиб (w0) + закрутка, растущая к концу жизни
        // (curl — завиток, пока скорость гаснет) + волна (wave). Какой будет
        // искра — решает жребий: треть почти прямые, треть волнистые,
        // остальные с завитком.
        const j = Math.random();
        const p = { x, y, a, t: 0,
            v: rnd(M.V[0], M.V[1]) * s * (go ? 1 : 0.5),
            w0: rnd(-1, 1) * M.TURN * (j < 0.33 ? 0.06 : 0.25),
            curl: j >= 0.66 ? sgn() * rnd(0.7, 1.5) * M.TURN : 0,
            wave: j >= 0.33 && j < 0.66 ? rnd(0.5, 1) * M.TURN : 0,
            f: rnd(9, 20), ph: Math.random() * 2 * Math.PI,
            life: rnd(M.LIFE[0], M.LIFE[1]),
            r: rnd(M.R[0], M.R[1]) * s,
            c: Math.floor(Math.random() * this.trailColors().length),
            tail: [] };
        return p;
    },

    // Цвета искр — волшебные, разные: космос флакона, радуга пузырей, золото.
    trailColors() {
        if (this._trCol) return this._trCol;
        const P = btPal(), C = P.soapCosmos;
        return (this._trCol = [C.cyan, C.pink, C.blush, C.glow, ...C.prism, P.soapGold[3]]);
    },
    // Спрайт свечения — один раз на цвет; дальше только drawImage.
    trailSprites() {
        if (this._trSpr) return this._trSpr;
        const Z = 32, W = '#ffffff';
        return (this._trSpr = this.trailColors().map(col => {
            const c = document.createElement('canvas');
            c.width = c.height = Z;
            const g = c.getContext('2d'), gr = g.createRadialGradient(Z / 2, Z / 2, 0, Z / 2, Z / 2, Z / 2);
            [[0, W, 1], [0.18, W, 0.95], [0.32, col, 0.85], [0.6, col, 0.28], [1, col, 0]].forEach(([o, cc, al]) => gr.addColorStop(o, this.rgba(cc, al)));
            g.fillStyle = gr; g.fillRect(0, 0, Z, Z);
            return c;
        }));
    },

    // Холст — во всю сцену, поверх руки (index.html: после #bt-hand-at).
    trailCanvas() {
        const T = this.trail;
        if (T.el && T.el.isConnected) return T.el;
        const at = document.getElementById('bt-hand-at');
        if (!at) return null;
        const el = document.createElement('canvas');
        el.id = 'bt-soap-trail'; el.className = 'bt-trail';
        el.style.display = 'none';
        at.parentNode.insertBefore(el, at.nextSibling);
        T.el = el; T.ctx = el.getContext('2d'); T.map = ''; T.shown = false;
        return el;
    },

    trailDraw() {
        const T = this.trail;
        if (!T.ps.length) {
            if (T.shown) { T.ctx.setTransform(1, 0, 0, 1, 0, 0); T.ctx.clearRect(0, 0, T.el.width, T.el.height); T.el.style.display = 'none'; T.shown = false; }
            return;
        }
        if (typeof document === 'undefined' || !this.trailCanvas()) return;
        const el = T.el, g = T.ctx, L0 = typeof LustMinigame !== 'undefined' ? LustMinigame : null;
        const st = L0 && L0.stageEl, SM = L0 && L0.stageMap ? L0.stageMap() : { m: 1, ox: 0, oy: 0 };
        const W = (st && st.clientWidth) || 390, H = (st && st.clientHeight) || 844;
        const k = Math.min(this.TRAIL_DPR, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
        const key = [W, H, k].join('|');
        if (T.map !== key) {
            T.map = key;
            el.style.width = W + 'px'; el.style.height = H + 'px';
            el.width = Math.round(W * k); el.height = Math.round(H * k);
        }
        if (!T.shown) { el.style.display = ''; T.shown = true; }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, el.width, el.height);
        g.setTransform(k * SM.m, 0, 0, k * SM.m, k * SM.ox, k * SM.oy);
        const S = this.trailSprites(), cols = this.trailColors(), M = this.MAGIC.TRAIL;
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (const p of T.ps) {
            const z = 1 - (1 - M.END) * (p.t / p.life), r = p.r * z;
            // Хвостик — след последних кадров: искра читается летящей, а не
            // висящей точкой.
            if (p.tail.length >= 2) {
                g.globalAlpha = 0.55;
                g.strokeStyle = cols[p.c];
                g.lineWidth = r * 0.9;
                g.beginPath(); g.moveTo(p.x, p.y);
                for (let i = 0; i < p.tail.length; i += 2) g.lineTo(p.tail[i], p.tail[i + 1]);
                g.stroke();
            }
            g.globalAlpha = 1;
            g.drawImage(S[p.c], p.x - 3 * r, p.y - 3 * r, 6 * r, 6 * r);
        }
        g.globalAlpha = 1;
    }
});
