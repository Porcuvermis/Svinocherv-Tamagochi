// ================= ТЩЕСЛАВИЕ: РАМКА ОКНА ИЗ ФОТОАППАРАТОВ =================
// Шкурка окна (MinigameWindow.attach, опция skin; CLAUDE.md, инвариант 8;
// docs/plan/32-pride-cameras.md). Материал греха — толпа фотографов: рамка
// собрана из разных камер (профессиональные, плёночные, мыльницы, смартфоны),
// крестик — отдельная камера с закрытым объективом и крестом на крышке.
//
// Камеры нарисованы заранее (cameras/*.svg, лист — docs/cameras/*-sheet.png).
// Здесь только раскладка и вывод:
//   * верх и низ — широкие камеры внахлёст, наклон ±6°;
//   * бока (18 единиц) — смартфоны и «высокие» камеры стоймя, широкие —
//     лёжа на боку, чтобы влезть в узкую полосу;
//   * рядом одинаковая модель не ставится, и три камеры одного семейства
//     подряд тоже (как правило «похожий сосед» у глаз зависти);
//   * два ряда: дальний придавлен тёмным слоем, ближний с тенью.
// Всё считается один раз, из зерна: раскладка не меняется от запуска к запуску.
//
// ПЕРЕХОД (вспышки) — следующая задача плана; пока шкурка без `veil`, и окно
// открывается и закрывается как раньше.
const PrideCameras = {
    rim: { side: 18, top: 59 },
    cross: { x: 336, y: 31, size: 60 },
    CORNER: 10,
    HANG: 10,            // насколько камеры заходят на сцену; полосы окна берут ровно столько
    SEED: 1717,
    DIR: 'src/minigames/pride/cameras/',

    // Размеры — из viewBox каждого файла (единицы рисунка). kind: wide — лежат
    // на верху и низу, tall — стоят на боках, оба — годятся и там и там.
    MODELS: {
        'pro-1': { w: 563, h: 346.5, fam: 'pro', kind: 'wide' },
        'pro-2': { w: 559, h: 298.5, fam: 'pro', kind: 'wide' },
        'pro-3': { w: 543, h: 397, fam: 'pro', kind: 'wide' },
        'pro-4': { w: 551, h: 338.5, fam: 'pro', kind: 'wide' },
        'film-1': { w: 547, h: 332.5, fam: 'film', kind: 'wide' },
        'film-2': { w: 559, h: 320.5, fam: 'film', kind: 'wide' },
        'film-3': { w: 386.5, h: 403, fam: 'film', kind: 'both' },
        'film-4': { w: 489, h: 325, fam: 'film', kind: 'wide' },
        'compact-1': { w: 495, h: 285, fam: 'compact', kind: 'wide' },
        'compact-2': { w: 491, h: 289, fam: 'compact', kind: 'wide' },
        'compact-3': { w: 220.5, h: 332.5, fam: 'compact', kind: 'both' },
        'compact-4': { w: 486.5, h: 285, fam: 'compact', kind: 'wide' },
        'phone-1': { w: 190, h: 411, fam: 'phone', kind: 'tall' },
        'phone-2': { w: 190, h: 411, fam: 'phone', kind: 'tall' },
        'phone-3': { w: 192, h: 411, fam: 'phone', kind: 'tall' },
        'phone-4': { w: 191.5, h: 411, fam: 'phone', kind: 'tall' }
    },
    CROSS: { w: 555, h: 330 },

    get bg() { return PALETTE.ink; },
    reach() { return this.HANG; },
    inner() { return MinigameWindow.skinGeometry(this).inner; },

    // ---------- картинки грузятся сразу при подключении файла ----------
    imgs: null,
    load() {
        if (this.imgs) return this.imgs;
        const I = this.imgs = { ready: false, pic: {}, left: 0 };
        const ids = Object.keys(this.MODELS).concat('cross');
        I.left = ids.length;
        ids.forEach(id => {
            const im = new Image();
            I.pic[id] = im;
            im.onload = im.onerror = () => {
                if (--I.left > 0) return;
                I.ready = true;
                // Рамку рисовали без камер (картинки не успели) — перерисовать.
                const el = document.getElementById('pride-game'), w = el && el._mgWindow;
                if (w && w._rimScale && w._rimDrewBlank) { w._rimDrewBlank = false; w._rimScale = null; w.ensureSkin(); }
            };
            im.src = this.DIR + id + '.svg';
        });
        return I;
    },

    // ---------- раскладка ----------
    rng(seed) {
        let a = seed >>> 0;
        return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    // Следующая модель: не повторяет последние четыре и не даёт трёх одного
    // семейства подряд.
    pick(rnd, kinds, recent) {
        const ids = Object.keys(this.MODELS).filter(id => kinds.includes(this.MODELS[id].kind));
        for (let tries = 0; tries < 40; tries++) {
            const id = ids[Math.floor(rnd() * ids.length)];
            if (recent.slice(-4).includes(id)) continue;
            const f = this.MODELS[id].fam, l = recent.slice(-2).map(r => this.MODELS[r].fam);
            if (l.length === 2 && l[0] === f && l[1] === f) continue;
            return id;
        }
        return ids[0];
    },
    // Одна лента: камеры вдоль полосы, внахлёст. axis 'x' — верх/низ, 'y' — бока.
    strip(rnd, o) {
        const out = [], recent = [];
        let cur = o.from;
        while (cur < o.to) {
            const id = this.pick(rnd, o.kinds, recent); recent.push(id);
            const M = this.MODELS[id];
            // Толщина ленты (поперёк) задана полосой, длина — по пропорции.
            let rot = (rnd() * 2 - 1) * o.tilt, flip = false;
            let thick = o.thick * (0.9 + rnd() * 0.22), len;
            if (o.axis === 'x') {
                // верх/низ: высота камеры = thick
                len = thick * M.w / M.h;
            } else if (M.kind === 'tall' || (M.kind === 'both' && rnd() < 0.7)) {
                // бок: стоит, ширина = thick
                len = thick * M.h / M.w;
            } else {
                // бок: лёжа на боку
                flip = true; rot += (rnd() < 0.5 ? 90 : -90);
                len = thick * M.w / M.h;
            }
            const c = cur + len / 2 + (rnd() * 2 - 1) * 2;
            const across = o.at + (rnd() * 2 - 1) * o.jit;
            const scale = flip || o.axis === 'x' ? thick / M.h : thick / M.w;
            out.push({ id, x: o.axis === 'x' ? c : across, y: o.axis === 'x' ? across : c, rot, s: scale, w: M.w, h: M.h });
            cur += len * (o.axis === 'x' ? 0.78 : 0.8) + (rnd() * 2 - 1) * 3;
        }
        return out;
    },
    layout() {
        if (this._lay) return this._lay;
        const I = this.inner(), R = this.rng(this.SEED);
        const back = [], front = [];
        // Верх (без угла креста) и низ.
        const topCrossX = this.cross.x - 44;            // левый край камеры-крестика
        const top = this.strip(R, { axis: 'x', from: -8, to: topCrossX + 14, at: 29, jit: 2.5, thick: 50, tilt: 6, kinds: ['wide', 'both'] });
        const bot = this.strip(R, { axis: 'x', from: -8, to: 398, at: this.inner().y1 + 29 + (STAGE_H - I.y1 - 59) / 2, jit: 2.5, thick: 50, tilt: 6, kinds: ['wide', 'both'] });
        // Бока.
        const left = this.strip(R, { axis: 'y', from: I.y0 - 14, to: I.y1 + 14, at: 9, jit: 1.5, thick: 24, tilt: 7, kinds: ['tall', 'both', 'wide'] });
        const right = this.strip(R, { axis: 'y', from: I.y0 - 8, to: I.y1 + 14, at: STAGE_W - 9, jit: 1.5, thick: 24, tilt: 7, kinds: ['tall', 'both', 'wide'] });
        front.push(...top, ...bot, ...left, ...right);
        // Дальний ряд: те же ленты с другим зерном, глубже и придавлены тёмным.
        const R2 = this.rng(this.SEED + 99);
        back.push(
            ...this.strip(R2, { axis: 'x', from: -20, to: topCrossX + 30, at: 38, jit: 3, thick: 46, tilt: 9, kinds: ['wide', 'both'] }),
            ...this.strip(R2, { axis: 'x', from: -20, to: 410, at: I.y1 + 20, jit: 3, thick: 46, tilt: 9, kinds: ['wide', 'both'] }),
            ...this.strip(R2, { axis: 'y', from: I.y0 - 20, to: I.y1 + 20, at: 14, jit: 2, thick: 22, tilt: 10, kinds: ['tall', 'both'] }),
            ...this.strip(R2, { axis: 'y', from: I.y0 - 14, to: I.y1 + 20, at: STAGE_W - 14, jit: 2, thick: 22, tilt: 10, kinds: ['tall', 'both'] })
        );
        return (this._lay = { back, front });
    },

    // ---------- рисунок ----------
    put(g, it, shadow) {
        const im = this.imgs.pic[it.id];
        if (!im || !im.complete || !im.naturalWidth) return;
        g.save();
        g.translate(it.x, it.y);
        g.rotate(it.rot * Math.PI / 180);
        const w = it.w * it.s, h = it.h * it.s;
        if (shadow) { g.shadowColor = 'rgba(8,6,10,0.6)'; g.shadowBlur = 5; g.shadowOffsetY = 2; }
        g.drawImage(im, -w / 2, -h / 2, w, h);
        g.restore();
    },
    *drawGen(g) {
        const I = this.inner(), R = this.CORNER;
        this.load();
        g.clearRect(0, 0, STAGE_W, STAGE_H);
        // Всё вне окна сцены — тёмная подложка (скруглённый вырез), чтобы
        // между камерами не светила сцена и угол окна был скруглён.
        g.fillStyle = this.bg;
        g.beginPath();
        g.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        if (g.roundRect) g.roundRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0, R); else g.rect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0);
        g.fill('evenodd');
        yield;
        const handle = (document.getElementById('pride-game') || {})._mgWindow;
        if (!this.imgs.ready) { if (handle) handle._rimDrewBlank = true; return; }
        const L = this.layout();
        // Дальний ряд, затем тёмная вуаль на всё кольцо рамки, затем ближний.
        L.back.forEach(it => this.put(g, it, false));
        yield;
        g.fillStyle = 'rgba(12,10,14,0.58)';
        g.beginPath();
        g.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        g.rect(I.x0 + this.HANG * 0.3, I.y0 + this.HANG * 0.3, I.x1 - I.x0 - this.HANG * 0.6, I.y1 - I.y0 - this.HANG * 0.6);
        g.fill('evenodd');
        L.front.forEach(it => this.put(g, it, true));
        yield;
        // Камера-крестик — поверх всего, в углу. Ширина по высоте полосы.
        const h = 52, w = h * this.CROSS.w / this.CROSS.h, c = this.cross;
        this.put(g, { id: 'cross', x: c.x, y: c.y, rot: 0, s: h / this.CROSS.h, w: this.CROSS.w, h: this.CROSS.h }, true);
    }
};
if (typeof window !== 'undefined') PrideCameras.load();
