// ================= АППАРАТ АЛЧНОСТИ: ГРАДУСНИК НАСЫЩЕНИЯ =================
// Слева от окна барабанов, по скосу рамки, стоит шкала греха: старый
// градусник (решение игрока: «колба с жидкостью», вертикально слева от
// барабанов). Внизу круглая колба-резервуар, вверх трубка с делениями,
// столбик янтарной жидкости поднимается с каждой круткой. Толстый — шкалу
// должно быть отлично видно; полоса скоса под ним ничего важного не несёт.
// Было: лёжа по верху дверцы — игрок переставил сюда.
//
// Стекло, деления и хомуты — в корпусе (свет шейдером); жидкость —
// живая, своим холстом поверх: подрастает с оттяжкой, мениск колышется
// от наклона и удара рычага, в колбе изредка всплывает пузырёк.
Object.assign(GreedJunk, {
    // bx, by — центр колбы, br — её радиус; трубка по x = bx от y0 (низ, у
    // колбы) до y1 (верх), радиус r; clamps — y хомутов
    METER: { bx: 70, by: 446, br: 10, y0: 437, y1: 318, r: 6.4, wall: 1.8, clamps: [352, 410] },

    // Контур стекла одной линией: трубка плечами переходит в шар колбы
    // (было: шар просто приставлен к трубке). inset — внутрь на толщину
    // стенки: по нему налита жидкость.
    meterPath(inset) {
        const M = this.METER, f = this.f, x = M.bx, r = M.r - inset, br = M.br - inset;
        const a = 50 * Math.PI / 180, sx = br * Math.sin(a), sy = M.by - br * Math.cos(a);
        const sh = M.y0 - 3;   // где трубка начинает раздаваться в плечи
        return `M${f(x - r)} ${f(M.y1 + M.r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(M.y1 + M.r)} V${f(sh)} ` +
            `Q${f(x + r)} ${f(sy - 1)} ${f(x + sx)} ${f(sy)} A${f(br)} ${f(br)} 0 1 1 ${f(x - sx)} ${f(sy)} Q${f(x - r)} ${f(sy - 1)} ${f(x - r)} ${f(sh)} Z`;
    },

    meterGlass() {
        const J = PALETTE.greedJunk, M = this.METER, Mc = J.reel.meter, f = this.f, ink = PALETTE.ink;
        const x = M.bx, r = M.r, P = this.meterPath(0), Pin = this.meterPath(M.wall);
        let g = `<path d="${P}" class="fx" fill="${J.hole}" opacity="0.4" transform="translate(1.6 2)"/>`;
        // Стекло — молочно-светлое и плотнее: сквозь прозрачное просвечивали
        // полосы скоса, и пустая трубка читалась покраской, а не стеклом.
        g += `<path d="${P}" fill="${Mc.glass}" fill-opacity="0.72" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            // толщина стенки: внутренний контур — тёмная тонкая линия
            `<path d="${Pin}" fill="${Mc.glassIn}" fill-opacity="0.5" stroke="${J.tin[500]}" stroke-width="0.5"/>`;
        // деления: каждые 10% — короткое, на половине — длинное (цифр нет);
        // вытравлены на стекле слева
        let ticks = '';
        for (let i = 1; i < 10; i++) {
            const y = this.meterY(i / 10), L = i === 5 ? r * 1.2 : r * 0.7;
            if (M.clamps.some(c => Math.abs(c - y) < 4)) continue;
            ticks += `M${f(x - r + 0.8)} ${f(y)} H${f(x - r + 0.8 + L)} `;
        }
        g += `<path d="${ticks}" stroke="${J.tin[900]}" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>`;
        // рельеф цилиндра трубки и шара колбы
        g += this.rodH(`M${x} ${M.y0} V${M.y1 + r}`, r * 2, r * 0.9) + this.domeH(x, M.by, M.br, M.br * 0.8);
        let out = this.T(13, 'glass', g);
        // колпачок сверху: латунная гильза с рубчиками и ушком
        const cy = M.y1 + 1.5, cw = r * 2 + 1.6;
        const Br = { 300: J.brass.hi, 500: J.brass.base, 700: J.brass.lo };
        let cap = `<circle cx="${x}" cy="${M.y1 - 3.4}" r="2.4" fill="none" stroke="${ink}" stroke-width="1.6"/>` +
            `<circle cx="${x}" cy="${M.y1 - 3.4}" r="2.4" fill="none" stroke="${Br[500]}" stroke-width="0.9"/>` +
            `<rect x="${f(x - cw / 2)}" y="${f(cy - 3)}" width="${f(cw)}" height="7" rx="1.4" fill="${Br[500]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M${f(x - cw / 2 + 0.6)} ${f(cy - 0.6)} H${f(x + cw / 2 - 0.6)} M${f(x - cw / 2 + 0.6)} ${f(cy + 1.6)} H${f(x + cw / 2 - 0.6)}" stroke="${Br[700]}" stroke-width="0.5"/>` +
            `<path d="M${f(x - cw / 2 + 1.2)} ${f(cy - 2.3)} V${f(cy + 3.2)}" class="hl" stroke="${Br[300]}" stroke-width="0.8"/>` +
            `<path d="M${f(x + cw / 2 - 1.2)} ${f(cy - 2.3)} V${f(cy + 3.2)}" stroke="${Br[700]}" stroke-width="0.8"/>`;
        // рельефа валиком (rodH) у гильзы нет: круглые концы валика шире её
        // высоты и вылезали светлым кругом над колпачком
        out += this.T(14, 'brass', cap);
        // хомуты: жестяная лента вокруг трубки и ушко с саморезом влево,
        // в лист дверцы (между петлями)
        M.clamps.forEach(y => {
            const c = `<rect x="${f(x - r - 1.2)}" y="${y - 3.4}" width="${f(r * 2 + 2.4)}" height="6.8" rx="1.4" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
                `<path d="M${f(x - r - 0.4)} ${y - 2.4} H${f(x + r)}" class="hl" stroke="${J.tin[100]}" stroke-width="0.8"/>` +
                `<path d="M${f(x - r)} ${y + 2.2} H${f(x + r)}" stroke="${J.tin[700]}" stroke-width="0.7"/>` + this.rodH(`M${f(x - r - 1)} ${y} H${f(x + r + 1)}`, 6.8, 1.2) +
                `<rect x="${f(x - r - 7.4)}" y="${y - 2.4}" width="7.2" height="4.8" rx="1" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                this.bolt(x - r - 4.4, y, 1.4);
            out += this.T(14, 'steel', c);
        });
        return out;
    },
    // y уровня v (0 — у колбы, 1 — верх трубки)
    meterY(v) {
        const M = this.METER;
        return M.y0 - (M.y0 - (M.y1 + M.r)) * v;
    }
});

Object.assign(GreedJunkLit, {
    METER_BOX: { x: 52, y: 306, w: 36, h: 156 },
    // k, c — пружина уровня (подрастает с оттяжкой и чуть перелетает);
    // wk, wc — колыхание мениска: жёсткость и затухание
    METER_SPRING: { k: 0.00002, c: 0.008, wk: 0.0006, wc: 0.012 },

    meterMount(wrap) {
        const B = this.METER_BOX, G = GreedJunk, cv = document.createElement('canvas');
        cv.width = B.w * this.SCALE; cv.height = B.h * this.SCALE;
        cv.style.cssText = `position:absolute;left:${B.x / G.W * 100}%;top:${B.y / G.H * 100}%;` +
            `width:${B.w / G.W * 100}%;height:${B.h / G.H * 100}%;z-index:1;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        this.meterCv = cv;
        const v = this.meterValue();
        this._meter = { L: v, T: v, v: 0, w: 0, wv: 0, bubbles: [], foam: [], fizz: 0, sites: this.meterSites(), at: 0 };
    },
    // насыщение греха 0..1 из состояния игры (в превью без игры — половина)
    meterValue() {
        if (typeof GameState === 'undefined' || !GameState.sinValue) return 0.5;
        const max = GameState.maxValue('greed') || 100;
        return Math.max(0, Math.min(1, GameState.sinValue('greed') / max));
    },
    // игра сообщает новое значение (после крутки) — столбик идёт к нему
    meterSet(v) { if (this._meter) this._meter.T = Math.max(0, Math.min(1, v)); },
    meterBump() {
        const M = this._meter, cfg = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames.greed) || { fillPerSpin: 10 };
        if (!M) return;
        // превью: полная шкала начинается заново, чтобы рост было видно всегда
        M.T = M.T >= 0.999 ? 0.1 : Math.min(1, M.T + cfg.fillPerSpin / 100);
    },
    // удар рычага: мениск колышется, а жидкость вскипает, как встряхнутое
    // пиво, — центры кипения на время работают вчетверо чаще
    meterKick(k) {
        if (!this._meter) return;
        this._meter.wv += 0.03 * k;
        this._meter.fizz = Math.min(1, this._meter.fizz + 0.9 * k);
    },

    // ---------- ПУЗЫРЬКИ, КАК В ПИВЕ ----------
    // В пиве пузырьки идут не по одному откуда попало, а ЦЕПОЧКАМИ из
    // центров кипения — царапин и соринок на стекле: из одной точки ровной
    // ниткой, один за другим. Поднимаясь, каждый растёт (газ выходит в
    // него по пути) и разгоняется; большие чуть виляют. У поверхности
    // собираются в тонкую пенку и лопаются. Центры — на дне шара и на
    // стенках трубки; у каждого свой темп и свой размер пузырьков.
    // Было: одиночный пузырь раз в пару секунд — читался воздухом в трубке.
    BUBBLE: { a: 0.000045, vmax: 0.06, grow: 0.012, rmax: 0.95, foamMs: 1400, foamMax: 34 },
    meterSites() {
        const R = GreedJunk.METER, x = R.bx, ri = R.r - R.wall;
        return [
            // дно шара: две нитки, частые и мелкие
            { x: x - 2.6, y: R.by + 6.2, every: 80, r0: 0.3 },
            { x: x + 1.8, y: R.by + 6.8, every: 110, r0: 0.34 },
            // царапины на стенках трубки: реже, пузырьки крупнее
            { x: x - ri + 0.6, y: GreedJunk.meterY(0.12), every: 180, r0: 0.38 },
            { x: x + ri - 0.6, y: GreedJunk.meterY(0.34), every: 230, r0: 0.4 },
            { x: x - ri + 0.7, y: GreedJunk.meterY(0.58), every: 280, r0: 0.36 }
        ].map(s => Object.assign(s, { next: Math.random() * s.every }));
    },
    // dt — мс; top — y поверхности
    bubbleStep(M, now, dt, top) {
        const B = this.BUBBLE, R = GreedJunk.METER, x = R.bx, ri = R.r - R.wall;
        M.fizz = Math.max(0, M.fizz - dt / 2600);
        const rate = 1 + M.fizz * 3;
        M.sites.forEach(s => {
            if (s.y < top + 2) return;                // точка над жидкостью — молчит
            s.next -= dt * rate;
            while (s.next <= 0) {
                s.next += s.every * (0.7 + Math.random() * 0.6);
                M.bubbles.push({ x: s.x, x0: s.x, y: s.y, v: 0.004 + Math.random() * 0.004, r: s.r0 * (0.8 + Math.random() * 0.4),
                    ph: Math.random() * 6.3, wob: 0.15 + Math.random() * 0.25 });
            }
        });
        // при встряске — ещё и россыпь из ниоткуда по всему столбику
        if (M.fizz > 0.2 && Math.random() < M.fizz * 0.5) {
            const yy = top + 3 + Math.random() * (R.by - top);
            const half = yy > R.y0 ? Math.sqrt(Math.max(0, R.br * R.br - (yy - R.by) * (yy - R.by))) - 1.2 : ri - 0.6;
            M.bubbles.push({ x: x + (Math.random() * 2 - 1) * half, x0: 0, y: yy, v: 0.01, r: 0.3 + Math.random() * 0.3, ph: Math.random() * 6.3, wob: 0.3 });
            M.bubbles[M.bubbles.length - 1].x0 = M.bubbles[M.bubbles.length - 1].x;
        }
        M.bubbles = M.bubbles.filter(b => {
            b.v = Math.min(B.vmax, b.v + B.a * dt);
            b.y -= b.v * dt;
            b.r = Math.min(B.rmax, b.r + B.grow * b.v * dt);
            b.ph += dt * 0.012;
            // в шаре пузырёк тянется к горлу трубки, в трубке — не шире стенок
            if (b.y < R.y0) b.x0 += (x - b.x0) * Math.min(1, dt * 0.004) * (Math.abs(b.x0 - x) > ri - 0.6 - b.r ? 1 : 0.15);
            b.x = b.x0 + Math.sin(b.ph) * b.wob * b.r;
            if (b.y <= top + b.r + 0.4) {
                // поднялся — в пенку у поверхности
                if (M.foam.length < B.foamMax) M.foam.push({ x: Math.max(x - ri + 0.6, Math.min(x + ri - 0.6, b.x)), r: b.r * 0.8, at: now, life: B.foamMs * (0.5 + Math.random()) });
                return false;
            }
            return true;
        });
        M.foam = M.foam.filter(f => now - f.at < f.life);
    },
    // пузырёк: прозрачный шарик в янтаре — светлее середина, тёмная кромка
    // по краю, белая искра сверху-слева (так пузырёк в пиве и блестит)
    bubbleDraw(ctx, x, y, r, a, C) {
        ctx.globalAlpha = 0.35 * a; ctx.fillStyle = C.liquidHi;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = C.liquidLo; ctx.lineWidth = Math.max(0.12, r * 0.28);
        ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.1, Math.PI * 1.1); ctx.stroke();
        ctx.globalAlpha = 0.95 * a; ctx.fillStyle = C.glassHi;
        ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.38, Math.max(0.12, r * 0.32), 0, Math.PI * 2); ctx.fill();
    },


    meterStep(now) {
        const M = this._meter, P = this.METER_SPRING;
        if (!M) return;
        const dt = Math.min(40, M.at ? now - M.at : 16);
        M.at = now;
        M.v += ((M.T - M.L) * P.k - P.c * M.v) * dt;
        M.L += M.v * dt;
        // мениск: перекос от наклона вбок (жидкость держит горизонт) и колыхание после удара
        const want = Hang.down() * 1.2;
        M.wv += ((want - M.w) * P.wk - P.wc * M.wv) * dt;
        M.w += M.wv * dt;
        // пузырьки идут всегда — холст перерисовывается каждый кадр; он
        // маленький (полоса у окна), это дёшево
        this.bubbleStep(M, now, dt, GreedJunk.meterY(Math.max(0, Math.min(1, M.L))));
        this.meterDraw(now);
    },

    meterDraw(now) {
        const M = this._meter, G = GreedJunk, R = G.METER, B = this.METER_BOX, S = this.SCALE, C = PALETTE.greedJunk.reel.meter;
        const ctx = this.meterCv.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.meterCv.width, this.meterCv.height);
        ctx.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        if (!this._meterIn) this._meterIn = new Path2D(G.meterPath(R.wall));
        const x = R.bx, ri = R.r - R.wall;
        const top = G.meterY(Math.max(0, Math.min(1, M.L)));
        ctx.save();
        // хомуты в корпусе — поверх стекла; жидкость под ними не рисуется,
        // иначе холст поверх корпуса закрывал бы их
        ctx.beginPath();
        ctx.rect(B.x, B.y, B.w, B.h);
        R.clamps.forEach(y => ctx.rect(B.x, y + 3.5, B.w, -7));
        ctx.clip('evenodd');
        // жидкость налита внутри стенок (inset — толщина стекла); поверхность —
        // мениск, перекошенный наклоном и колыханием
        ctx.clip(this._meterIn);
        ctx.beginPath();
        ctx.moveTo(x - ri - 1, top + M.w);
        ctx.quadraticCurveTo(x, top + 2, x + ri + 1, top - M.w);
        ctx.lineTo(x + R.br + 1, R.by + R.br + 1);
        ctx.lineTo(x - R.br - 1, R.by + R.br + 1);
        ctx.closePath();
        // в трубке поперечный градиент цилиндра; у краёв темнее — стекло
        // преломляет, середина светлее
        const gr = ctx.createLinearGradient(x - ri, 0, x + ri, 0);
        gr.addColorStop(0, C.liquidLo); gr.addColorStop(0.3, C.liquidHi); gr.addColorStop(0.55, C.liquid); gr.addColorStop(1, C.liquidLo);
        ctx.fillStyle = gr;
        ctx.fill();
        // шар колбы — свой круговой градиент, светлее к блику
        const rg = ctx.createRadialGradient(x - 3, R.by - 3, 1, x, R.by, R.br);
        rg.addColorStop(0, C.liquidHi); rg.addColorStop(0.5, C.liquid); rg.addColorStop(1, C.liquidLo);
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(x, R.by, R.br, 0, Math.PI * 2); ctx.fill();
        // мениск: светлая кромка по поверхности
        ctx.strokeStyle = C.liquidHi; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(x - ri, top + M.w + 0.4); ctx.quadraticCurveTo(x, top + 2.4, x + ri, top - M.w + 0.4); ctx.stroke();
        // пузырьки цепочками; пенка — у поверхности, по мениску, тает и лопается
        M.bubbles.forEach(b => this.bubbleDraw(ctx, b.x, b.y, b.r, 1, C));
        M.foam.forEach(fo => {
            const u = (now - fo.at) / fo.life, k = (fo.x - x) / ri;
            const fy = top + 1.1 + (1 - k * k) * 0.9 - k * M.w;
            // пена светлее пузырьков в толще: кремовая, почти белая
            const fa = u > 0.85 ? (1 - u) / 0.15 : 1, fr = fo.r * (1 + u * 0.2);
            ctx.globalAlpha = 0.6 * fa; ctx.fillStyle = C.glassHi;
            ctx.beginPath(); ctx.arc(fo.x, fy - fo.r * 0.4, fr, 0, Math.PI * 2); ctx.fill();
            this.bubbleDraw(ctx, fo.x, fy - fo.r * 0.4, fr, fa, C);
        });
        ctx.restore();
        // деления — на стекле, поверх жидкости
        ctx.strokeStyle = PALETTE.greedJunk.tin[900]; ctx.lineWidth = 0.7; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
            const y = G.meterY(i / 10), L = i === 5 ? R.r * 1.2 : R.r * 0.7;
            if (R.clamps.some(c => Math.abs(c - y) < 4)) continue;
            ctx.moveTo(x - R.r + 0.8, y); ctx.lineTo(x - R.r + 0.8 + L, y);
        }
        ctx.stroke();
        // блики стекла поверх жидкости: яркий справа, слабый слева, окно на
        // шаре — иначе столбик лежал бы на стекле, а не в нём
        ctx.strokeStyle = C.glassHi;
        const seg = (xx, w, a) => {
            const ys = [R.y1 + R.r].concat(...R.clamps.map(c => [c - 4.4, c + 4.4]), [R.y0 - 3]);
            ctx.globalAlpha = a; ctx.lineWidth = w;
            ctx.beginPath();
            for (let i = 0; i < ys.length; i += 2) { ctx.moveTo(xx, ys[i]); ctx.lineTo(xx, ys[i + 1]); }
            ctx.stroke();
        };
        seg(x + R.r - 2, 1.3, 0.85);
        seg(x - R.r + 1.4, 0.5, 0.45);
        ctx.globalAlpha = 0.85; ctx.fillStyle = C.glassHi;
        ctx.save(); ctx.translate(x - 3.6, R.by - 3.4); ctx.rotate(-0.7);
        ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 1.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(x + 4.2, R.by + 4.6, 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }
});
