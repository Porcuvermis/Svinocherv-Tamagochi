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
    METER: { bx: 70, by: 446, br: 10, y0: 437, y1: 316, r: 6.4, clamps: [352, 410] },

    meterGlass() {
        const J = PALETTE.greedJunk, M = this.METER, Mc = J.reel.meter, f = this.f, ink = PALETTE.ink;
        const x = M.bx, r = M.r;
        const tube = `M${f(x - r)} ${M.y0 + 2} V${M.y1 + r} A${r} ${r} 0 0 1 ${f(x + r)} ${M.y1 + r} V${M.y0 + 2} Z`;
        let g = `<path d="${tube}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(1.4 1.8)"/>` +
            `<circle cx="${x + 1.4}" cy="${M.by + 1.8}" r="${M.br}" class="fx" fill="${J.hole}" opacity="0.35"/>`;
        // стекло: чуть тонированное, сквозь него видна рамка
        g += `<path d="${tube}" fill="${Mc.glass}" fill-opacity="0.35" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${x}" cy="${M.by}" r="${M.br}" fill="${Mc.glass}" fill-opacity="0.35" stroke="${ink}" stroke-width="${STROKE.structure}"/>`;
        // деления: каждые 10% — короткое, на половине — длинное (цифр нет)
        let ticks = '';
        for (let i = 1; i < 10; i++) {
            const y = this.meterY(i / 10), L = i === 5 ? r * 1.4 : r * 0.8;
            if (M.clamps.some(c => Math.abs(c - y) < 4)) continue;
            ticks += `M${f(x - r + 0.3)} ${f(y)} H${f(x - r + 0.3 + L)} `;
        }
        g += `<path d="${ticks}" stroke="${J.tin[900]}" stroke-width="0.9" stroke-linecap="round" opacity="0.85"/>`;
        // скол на стекле у колбы
        g += `<path d="M${f(x + r)} ${M.y0 - 6} l-1.8 2.4 l1.8 2" fill="none" stroke="${J.tin[900]}" stroke-width="0.45"/>`;
        // рельеф цилиндра трубки и шара колбы
        g += this.rodH(`M${x} ${M.y0 + 2} V${M.y1 + r}`, r * 2, r * 0.9) + this.domeH(x, M.by, M.br, M.br * 0.8);
        let out = this.T(13, 'glass', g);
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
        const x = R.bx, ri = R.r - 0.9;
        const top = G.meterY(Math.max(0, Math.min(1, M.L)));
        ctx.save();
        // хомуты в корпусе — поверх стекла; жидкость под ними не рисуется,
        // иначе холст поверх корпуса закрывал бы их
        ctx.beginPath();
        ctx.rect(B.x, B.y, B.w, B.h);
        R.clamps.forEach(y => ctx.rect(B.x, y + 3.5, B.w, -7));
        ctx.clip('evenodd');
        // жидкость: колба полная, столбик до уровня; поверхность — мениск,
        // перекошенный наклоном и колыханием
        ctx.beginPath();
        ctx.arc(x, R.by, R.br - 1, 0, Math.PI * 2);
        ctx.moveTo(x - ri, R.y0 + 3);
        ctx.lineTo(x - ri, top + M.w);
        ctx.quadraticCurveTo(x, top + 2.2, x + ri, top - M.w);
        ctx.lineTo(x + ri, R.y0 + 3);
        ctx.closePath();
        const gr = ctx.createLinearGradient(x - R.br, 0, x + R.br, 0);
        gr.addColorStop(0, C.liquidLo); gr.addColorStop(0.32, C.liquidHi); gr.addColorStop(0.55, C.liquid); gr.addColorStop(1, C.liquidLo);
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.clip();
        // пузырьки: всплывают из колбы вверх и тают
        ctx.strokeStyle = C.liquidHi; ctx.lineWidth = 0.45;
        M.bubbles.forEach(b => {
            const u = (now - b.at) / 1100;
            ctx.globalAlpha = 0.9 * (1 - u * 0.7);
            ctx.beginPath();
            ctx.arc(x + b.x * (1 - u * 0.6), R.by + R.br * 0.7 - u * (R.br * 1.7 + 10), b.r, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.restore();
        // деления — на стекле, поверх жидкости
        ctx.strokeStyle = PALETTE.greedJunk.tin[900]; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
            const y = G.meterY(i / 10), L = i === 5 ? R.r * 1.4 : R.r * 0.8;
            if (R.clamps.some(c => Math.abs(c - y) < 4)) continue;
            ctx.moveTo(x - R.r + 0.3, y); ctx.lineTo(x - R.r + 0.3 + L, y);
        }
        ctx.stroke();
        // блик стекла поверх жидкости — иначе столбик лежал бы на стекле, а не в нём
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = C.glassHi; ctx.lineWidth = 1.1;
        const ys = [R.y1 + R.r].concat(...R.clamps.map(c => [c - 4.4, c + 4.4]), [R.y0]);
        ctx.beginPath();
        for (let i = 0; i < ys.length; i += 2) { ctx.moveTo(x + R.r - 1.8, ys[i]); ctx.lineTo(x + R.r - 1.8, ys[i + 1]); }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(x, R.by, R.br - 2.6, Math.PI * 1.55, Math.PI * 1.9); ctx.stroke();
        ctx.globalAlpha = 1;
    }
});
