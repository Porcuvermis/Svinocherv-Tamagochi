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
        this._meter = { L: v, T: v, v: 0, w: 0, wv: 0, bubbles: [], next: 0, at: 0, shown: '' };
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
    meterKick(k) { if (this._meter) this._meter.wv += 0.03 * k; },

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
        // пузырёк в колбе — раз в пару секунд
        if (now > M.next) {
            M.next = now + 1800 + Math.random() * 2600;
            M.bubbles.push({ at: now, x: (Math.random() - 0.5) * 8, r: 0.7 + Math.random() * 0.8 });
        }
        M.bubbles = M.bubbles.filter(b => now - b.at < 1100);
        const key = M.L.toFixed(4) + ',' + M.w.toFixed(3) + ',' + M.bubbles.map(b => Math.round((now - b.at) / 30)).join('.');
        if (key === M.shown) return;
        M.shown = key;
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
        // пузырьки: всплывают из колбы вверх и тают
        ctx.lineWidth = 0.45;
        M.bubbles.forEach(b => {
            const u = (now - b.at) / 1100;
            ctx.globalAlpha = 0.9 * (1 - u * 0.7);
            ctx.beginPath();
            ctx.arc(x + b.x * 0.6 * (1 - u * 0.6), R.by + R.br * 0.6 - u * (R.br * 1.6 + 10), b.r, 0, Math.PI * 2);
            ctx.stroke();
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
