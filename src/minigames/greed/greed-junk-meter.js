// ================= АППАРАТ АЛЧНОСТИ: ГРАДУСНИК НАСЫЩЕНИЯ =================
// По верху дверцы, над окном барабанов, — шкала греха: старый градусник,
// положенный набок (решение игрока: «колба с жидкостью»). Слева круглая
// колба-резервуар, вправо трубка с делениями, столбик янтарной жидкости
// растёт вправо с каждой круткой. Лёжа колба уровнем не показывает бы —
// жидкость растеклась бы по дну; столбик градусника лежит ровно так же,
// как стоит.
//
// Стекло, деления и хомуты — в корпусе (свет шейдером); жидкость —
// живая, своим холстом поверх: подрастает с оттяжкой, кончик столбика
// колышется от наклона и удара рычага, в колбе изредка всплывает пузырёк.
Object.assign(GreedJunk, {
    // bx, by — центр колбы, br — её радиус; трубка от x0 до x1, радиус r
    // Толстая — шкалу греха должно быть отлично видно (игрок): трубка
    // заходит на жалюзи и на скос окна, там ничего важного нет.
    METER: { bx: 72, by: 303, br: 11, x0: 81, x1: 293, r: 6.4, clamps: [128, 236] },

    meterGlass() {
        const J = PALETTE.greedJunk, M = this.METER, Mc = J.reel.meter, f = this.f, ink = PALETTE.ink;
        const y = M.by, r = M.r;
        const tube = `M${M.x0 - 2} ${f(y - r)} H${M.x1 - r} A${r} ${r} 0 0 1 ${M.x1 - r} ${f(y + r)} H${M.x0 - 2} Z`;
        let g = `<path d="${tube}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(1 1.8)"/>` +
            `<circle cx="${M.bx + 1}" cy="${y + 1.8}" r="${M.br}" class="fx" fill="${J.hole}" opacity="0.35"/>`;
        // стекло: чуть тонированное, сквозь него видно дверцу
        g += `<path d="${tube}" fill="${Mc.glass}" fill-opacity="0.35" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${M.bx}" cy="${y}" r="${M.br}" fill="${Mc.glass}" fill-opacity="0.35" stroke="${ink}" stroke-width="${STROKE.structure}"/>`;
        // деления: каждые 10% — короткое, на половине — длинное (цифр нет)
        let ticks = '';
        for (let i = 1; i < 10; i++) {
            const x = M.x0 + (M.x1 - r - M.x0) * i / 10, L = i === 5 ? r * 1.4 : r * 0.8;
            if (M.clamps.some(c => Math.abs(c - x) < 4)) continue;
            ticks += `M${f(x)} ${f(y + r - 0.3)} V${f(y + r - 0.3 - L)} `;
        }
        g += `<path d="${ticks}" stroke="${J.tin[900]}" stroke-width="0.9" stroke-linecap="round" opacity="0.85"/>`;
        // скол на стекле у колбы
        g += `<path d="M${M.x0 + 4} ${f(y - r)} l2.4 1.8 l2 -1.8" fill="none" stroke="${J.tin[900]}" stroke-width="0.45"/>`;
        // рельеф цилиндра трубки и шара колбы
        g += this.rodH(`M${M.x0 - 2} ${y} H${M.x1 - r}`, r * 2, r * 0.9) + this.domeH(M.bx, y, M.br, M.br * 0.8);
        let out = this.T(13, 'glass', g);
        // хомуты: жестяная лента вокруг трубки и ушко с саморезом под ней
        M.clamps.forEach(x => {
            const c = `<rect x="${x - 3.4}" y="${f(y - r - 1.2)}" width="6.8" height="${f(r * 2 + 2.4)}" rx="1.4" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
                `<path d="M${x - 2.4} ${f(y - r - 0.4)} V${f(y + r)}" class="hl" stroke="${J.tin[100]}" stroke-width="0.8"/>` +
                `<path d="M${x + 2.2} ${f(y - r)} V${f(y + r)}" stroke="${J.tin[700]}" stroke-width="0.7"/>` + this.rodH(`M${x} ${f(y - r - 1)} V${f(y + r + 1)}`, 6.8, 1.2) +
                // ушко с саморезом — под трубкой, в лист дверцы (сбоку его
                // закрывала жидкость: холст столбика лежит поверх корпуса)
                `<rect x="${x + 2}" y="${f(y + r + 0.2)}" width="7" height="4.6" rx="1" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                this.bolt(x + 5.6, y + r + 2.5, 1.4);
            out += this.T(14, 'steel', c);
        });
        return out;
    }
});

Object.assign(GreedJunkLit, {
    METER_BOX: { x: 58, y: 288, w: 242, h: 30 },
    // k, c — пружина уровня (подрастает с оттяжкой и чуть перелетает);
    // wob — колыхание кончика: жёсткость и затухание
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
        // кончик столбика: тянется за наклоном вбок и колышется после удара
        const want = Hang.down() * 1.4;
        M.wv += ((want - M.w) * P.wk - P.wc * M.wv) * dt;
        M.w += M.wv * dt;
        // пузырёк в колбе — раз в пару секунд
        if (now > M.next) {
            M.next = now + 1800 + Math.random() * 2600;
            M.bubbles.push({ at: now, x: (Math.random() - 0.5) * 10, r: 0.7 + Math.random() * 0.8 });
        }
        M.bubbles = M.bubbles.filter(b => now - b.at < 900);
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
        const y = R.by, ri = R.r - 0.9;
        // жидкость: колба полная, столбик до уровня; кончик — округлый мениск
        const end = R.x0 + (R.x1 - R.r - R.x0) * Math.max(0, Math.min(1, M.L)) + M.w;
        ctx.save();
        // хомуты в корпусе — поверх стекла; жидкость под ними не рисуется,
        // иначе холст поверх корпуса закрывал бы их
        ctx.beginPath();
        ctx.rect(B.x, B.y, B.w, B.h);
        R.clamps.forEach(x => ctx.rect(x + 3.5, B.y, -7, B.h));
        ctx.clip('evenodd');
        ctx.beginPath();
        ctx.arc(R.bx, y, R.br - 1, 0, Math.PI * 2);
        ctx.moveTo(R.x0 - 2, y - ri);
        ctx.lineTo(Math.max(R.x0, end), y - ri);
        ctx.quadraticCurveTo(Math.max(R.x0, end) + 2.6, y, Math.max(R.x0, end), y + ri);
        ctx.lineTo(R.x0 - 2, y + ri);
        ctx.closePath();
        const gr = ctx.createLinearGradient(0, y - R.br, 0, y + R.br);
        gr.addColorStop(0, C.liquidLo); gr.addColorStop(0.32, C.liquidHi); gr.addColorStop(0.55, C.liquid); gr.addColorStop(1, C.liquidLo);
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.clip();
        // пузырьки: всплывают в колбе и лопаются у верха
        ctx.strokeStyle = C.liquidHi; ctx.lineWidth = 0.45;
        M.bubbles.forEach(b => {
            const u = (now - b.at) / 900;
            ctx.globalAlpha = 0.9 * (1 - u * 0.6);
            ctx.beginPath();
            ctx.arc(R.bx + b.x * (1 - u * 0.5), y + R.br * 0.8 - u * R.br * 1.6, b.r, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.restore();
        // деления — на стекле, поверх жидкости
        ctx.strokeStyle = PALETTE.greedJunk.tin[900]; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
            const x = R.x0 + (R.x1 - R.r - R.x0) * i / 10, L = i === 5 ? R.r * 1.4 : R.r * 0.8;
            if (R.clamps.some(c => Math.abs(c - x) < 4)) continue;
            ctx.moveTo(x, y + R.r - 0.3); ctx.lineTo(x, y + R.r - 0.3 - L);
        }
        ctx.stroke();
        // блик стекла поверх жидкости — иначе столбик лежал бы на стекле, а не в нём
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = C.glassHi; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
        const xs = [R.x0 + 2].concat(...R.clamps.map(c => [c - 4.4, c + 4.4]), [R.x1 - 6]);
        ctx.beginPath();
        for (let i = 0; i < xs.length; i += 2) { ctx.moveTo(xs[i], y - R.r + 1.8); ctx.lineTo(xs[i + 1], y - R.r + 1.8); }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(R.bx, y, R.br - 2.6, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
        ctx.globalAlpha = 1;
    }
});
