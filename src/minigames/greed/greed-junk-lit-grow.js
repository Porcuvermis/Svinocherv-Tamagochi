// ================= АППАРАТ АЛЧНОСТИ: ИГРА ВРАСТАЕТ В ЖИВОЙ АППАРАТ =================
// Продолжение GreedJunkLit. Купленное в банке колесо или пачинко встаёт в
// аппарат БЕЗ его пересборки.
//
// Было (игрок, 18.11: «вся игра застывает, банка вниз одним прыжком, в
// половине случаев вылетает»): покупка пересобирала аппарат целиком —
// корпус растрировался заново во всех проходах, рычаг, колесо, короб;
// при процессоре ×4 от последнего жетона до первых досок 11–16 с, задачи
// до 2,5 с подряд (tools/greed-lux-sketch/jar/deposit-prof.js). А каждая
// пересборка оставляла живыми контексты WebGL колеса и короба вместе с
// текстурами — память росла с каждой покупкой.
//
// Стало. Игра меняет в корпусе только свой участок (GROW_REGION: щит,
// крепления, разметка, полка — те же участки сборка закрывает стоп-кадром),
// поэтому:
//   * заготовка (growPrep) — заранее, когда покупка близка (банка-магазин
//     открыта и жетонов хватает): SVG участка корпуса, слоя игры и видов
//     для деталей сборки растрируются в холсты по одному, с кадром между
//     ними. Растр SVG идёт не при загрузке картинки, а при первой
//     отрисовке — поэтому сразу в холст: пиксели готовы;
//   * покупка (growGame) — участок заливается в текстуры корпуса (и в
//     комплект «корпус без рычага»), нормали — пересчётом, слой игры
//     ставится в тот же аппарат из готовых картинок. Новый контекст — один,
//     самой игры.
Object.assign(GreedJunkLit, {
    // Участки игр на поле. Низ пачинко — 302, а не 293: полка под коробом
    // заходит ниже, и её край оставался от старого корпуса
    // (tools/greed-lux-sketch/jar/grow-same.js). Стоп-кадр сборки — те же.
    GROW_REGION: { wheel: { x0: 0, y0: -57, x1: 207, y1: 293 }, pachinko: { x0: 204, y0: -57, x1: 360, y1: 302 } },
    // null, а не {}: пересборка из отладки восстанавливает поля из снимка
    // (GreedDebug.pristine), и общий объект вернул бы старые заготовки
    growPre: null,

    // SVG → холст: растр — сейчас, а не при первой отрисовке.
    async raster(svg) {
        const img = await this.image(svg);
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        cv.getContext('2d').drawImage(img, 0, 0);
        return cv;
    },

    // Все SVG, нужные игре game, — в состоянии «игра стоит» (GreedJunk._growAs).
    growSvgs(game) {
        const G = GreedJunk, was = G._growAs, S = this.SCALE, passes = ['albedo', 'height', 'mat'];
        G._growAs = game;
        try {
            const R = this.GROW_REGION[game], crop = { x: R.x0, y: R.y0, w: R.x1 - R.x0, h: R.y1 - R.y0 };
            const sized = (svg) => svg.replace('<svg ', `<svg width="${crop.w * S}" height="${crop.h * S}" `);
            const body = passes.map(p => sized(G.bodySvg(p, crop)));
            // Комплект «корпус без рычага» (на рывке шейдер читает его): там,
            // где участок не задевает рычаг, он совпадает с корпусом.
            const C = this.LEVER_CROP, hit = R.x0 < C.x + C.w && R.x1 > C.x && R.y0 < C.y + C.h && R.y1 > C.y;
            const bare = hit ? passes.map(p => sized(G.bodySvg(p, crop, false))) : null;
            const layer = game === 'wheel' ? this.wheelSvgs() : this.pachSvgs();
            const asm = typeof GreedAssembly !== 'undefined' && GreedAssembly.svgs ? GreedAssembly.svgs(game) : null;
            return { body, bare, layer, asm };
        } finally { G._growAs = was; G.pass = 'baked'; }
    },

    // Заготовка: всё растрировано в холсты. Один раз на игру; повторный вызов
    // — то же обещание.
    growPrep(game) {
        const pre = this.growPre || (this.growPre = {}), had = pre[game];
        if (had) return had.p;
        const rec = pre[game] = { state: 'busy' };
        const t0 = performance.now();
        rec.p = (async () => {
            const sv = this.growSvgs(game);
            // по одному растру на задачу, кадр между ними: банка и монеты
            // живут, пока заготовка идёт
            const walk = async (o) => {
                if (typeof o === 'string') { await new Promise(r => setTimeout(r, 16)); return this.raster(o); }
                if (Array.isArray(o)) { const r = []; for (const x of o) r.push(await walk(x)); return r; }
                if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = await walk(o[k]); return r; }
                return o;
            };
            const out = await walk(sv);
            if (!this.growPre || this.growPre[game] !== rec) return rec;
            // прибор игры — тоже заранее: контекст, текстуры с нормалями;
            // большие холсты после заливки больше не нужны
            out.gl = await this.growLayerGL(game, out);
            if (!this.growPre || this.growPre[game] !== rec) { this.growLose(out.gl); return rec; }
            if (out.gl) {
                if (game === 'wheel') out.layer = null;
                else out.layer = { glass: out.layer.glass, glare: out.layer.glare };
                if (out.asm) out.asm.sets = null;
            }
            Object.assign(rec, out, { state: 'ready', ms: Math.round(performance.now() - t0) });
            return rec;
        })().catch((e) => {
            if (this.growPre && this.growPre[game] === rec) delete this.growPre[game];
            console.warn('[Аппарат] заготовка не собралась', e);
            throw e;
        });
        return rec.p;
    },
    // Прибор игры заранее: холст (не в странице), контекст, комплекты
    // текстур слоя и видов для деталей сборки. При покупке холст просто
    // встаёт в аппарат (growPut): ни компиляции шейдеров, ни заливки.
    async growLayerGL(game, out) {
        if (!this.gl || !this.deviceGL) return null;
        const G = GreedJunk, S = this.SCALE, B = game === 'wheel' ? this.wheelBox() : this.pachBox();
        const cv = document.createElement('canvas');
        cv.width = Math.round(B.w * S); cv.height = Math.round(B.h * S);
        const Q = this.deviceGL(cv);
        if (!Q) return null;
        const tick = () => new Promise(r => setTimeout(r, 16));
        if (game === 'wheel') {
            Q.disc = this.deviceSet(Q, out.layer.disc); await tick();
            Q.ptr = this.deviceSet(Q, out.layer.ptr); Q.brk = this.deviceSet(Q, [out.layer.brk]);
        } else {
            Q.box = this.deviceSet(Q, out.layer.maps); await tick();
            await this.pachBallMaps(Q);
            G.pass = 'baked';
        }
        // виды для деталей: у пачинко — слоями, сложить в накопительные
        if (out.asm && out.asm.layers && typeof GreedAssembly !== 'undefined') Object.assign(out.asm, GreedAssembly.stack(out.asm), { layers: null });
        const asm = {};
        if (out.asm && out.asm.sets) for (const k of Object.keys(out.asm.sets)) { await tick(); asm[k] = this.deviceSet(Q, out.asm.sets[k]); }
        return { cv, Q, asm };
    },
    growLose(g) {
        const ext = g && g.Q && g.Q.gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
    },
    // готовый холст прибора — на место слоя: B — прямоугольник на поле
    growPut(wrap, cv, B) {
        cv.style.cssText = `position:absolute;${GreedJunk.css(B)}z-index:1;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        return cv;
    },

    // Заготовки — по текущему состоянию аппарата: после покупки, при выходе
    // из алчности и при пересборке они устаревают. Невзятый прибор — его
    // контекст с текстурами сразу назад.
    growDrop() {
        const pre = this.growPre;
        this.growPre = null;
        if (pre) Object.values(pre).forEach(rec => { if (rec.gl && !rec.glTaken) this.growLose(rec.gl); });
    },

    // Готовая часть заготовки — только для врастания этой игры (во время
    // growGame): обычная сборка аппарата растрирует сама.
    growTake(game, part) {
        const rec = this.growPre && this.growPre[game];
        if (!(this._growing === game && rec && rec.state === 'ready')) return null;
        if (part === 'gl' && rec.gl) rec.glTaken = true;
        return rec[part];
    },

    // Покупка: игра встаёт в живой аппарат. Заготовки нет — делается сейчас
    // (всё равно дешевле пересборки: участок, а не корпус целиком).
    async growGame(game) {
        const rec = await this.growPrep(game);
        this._growing = game;
        try {
            this.growBody(game, rec);
            if (game === 'pachinko') this.growKey();
            // что лежало за живым слоем до врастания — там и остаётся
            const wrap = this.wrapEl, kids0 = [...wrap.children], li = kids0.indexOf(this.live);
            const before = new Set(li >= 0 ? kids0.slice(li + 1) : kids0);
            if (game === 'wheel') this.wheelMountLit(wrap);
            else { this.pachMountLit(wrap); this.growWheelOnTop(); }
            this.growPlace(before);
            this.draw();
            await (game === 'wheel' ? this._wheelP : this._pachP);
        } finally { this._growing = null; }
        this.growDrop();
        return rec;
    },

    // Участок корпуса — в текстуры: основной комплект и «без рычага».
    // Нормали — пересчётом карты высот (heightDirty → normalsFor в draw).
    growBody(game, rec) {
        const G = GreedJunk, gl = this.gl, S = this.SCALE, R = this.GROW_REGION[game];
        if (!gl) return;
        const x = R.x0 * S, y = (R.y0 - G.Y0) * S;
        const put = (set, imgs) => imgs.forEach((img, u) => {
            gl.activeTexture(gl.TEXTURE0 + u);
            gl.bindTexture(gl.TEXTURE_2D, set[u]);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, u === 0);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, img);
        });
        const rect = { x, y, w: rec.body[0].width, h: rec.body[0].height };
        const all = () => {
            put(this.tex, rec.body);
            this.heightDirty(this.tex[1], rect);
            if (this.lever && this.lever.bare) { put(this.lever.bare, rec.bare || rec.body); this.heightDirty(this.lever.bare[1], rect); }
            this.bindSet(this.tex);
        };
        all();
        // Рычаг ещё готовится — он перезальёт основной комплект из полных
        // карт, снятых до покупки, и соберёт «без рычага» по ним: участок —
        // ещё раз, когда он закончит.
        if (!this.lever && this._prepP) this._prepP.then(() => { if (this.gl === gl) { all(); this.draw(); } });
    },

    // Карта света: у пачинко своё свечение (стекло, кнопка) — карта заново,
    // в корпус и в прибор колеса, если он стоит.
    growKey() {
        if (!this.keyBind) return;
        this._keyCv = null;
        if (this.gl && this.prog) {
            if (this._keyTex) this.gl.deleteTexture(this._keyTex);
            this._keyTex = this.keyBind(this.gl, this.prog, 6);
            this.gl.useProgram(this.prog);
        }
        const Q = this._wgl;
        if (Q && Q.lm) { this.keyBind(Q.gl, Q.pr, 4); Q.gl.uniform4f(Q.U.uLmR, ...Q.lm); }
    },

    // Слои новой игры — туда же, где они встают при сборке аппарата с нуля:
    // перед живым слоем (ламп и нити, this.live), а не в конец обёртки.
    growPlace(before) {
        const wrap = this.wrapEl, live = this.live;
        if (!live || live.parentNode !== wrap) return;
        // Всё, что после врастания оказалось за живым слоем, а до него там не
        // было: новые слои и переставленные слои колеса (growWheelOnTop).
        // Было — только новые и холст колеса: тень диска уезжала за живой
        // слой, ложилась поверх колеса и тушила его (tools/greed-lux-sketch/
        // jar/grow-same.js, колесо, потом пачинко).
        const kids = [...wrap.children], after = kids.slice(kids.indexOf(live) + 1);
        after.filter(n => !before.has(n)).forEach(n => wrap.insertBefore(n, live));
    },

    // Пачинко встало при стоящем колесе: колесо — на переднем плане, его
    // слои поверх короба, как при сборке с нуля (wheelMountLit): тень диска
    // на щит — под коробом, на короб — свой слой поверх, обрезанный по нему.
    growWheelOnTop() {
        const G = GreedJunk, wrap = this.wrapEl;
        if (!this.wheelCv || !this.pachShadowCv || !this.pachShadowCv.near) return;
        const first = this.pachShadowCv.near.parentNode;
        if (this.wheelShadowCv && first && first.parentNode === wrap) wrap.insertBefore(this.wheelShadowCv, first);
        if (!this.wheelShadowBoxCv) {
            const P0 = G.PACH, P = G.pachRect({ x: P0.x0, y: P0.y0, w: P0.x1 - P0.x0, h: P0.y1 - P0.y0 });
            const clip = document.createElement('div');
            clip.style.cssText = `position:absolute;${G.css(P)}overflow:hidden;z-index:1;pointer-events:none`;
            const B = this.wheelShadowBox(), S = this.SCALE, cv = document.createElement('canvas');
            cv.width = Math.round(B.w * S); cv.height = Math.round(B.h * S);
            cv.style.cssText = `position:absolute;z-index:1;pointer-events:none;background:none;left:${(B.x - P.x) / P.w * 100}%;top:${(B.y - P.y) / P.h * 100}%;` +
                `width:${B.w / P.w * 100}%;height:${B.h / P.h * 100}%`;
            clip.appendChild(cv);
            wrap.appendChild(clip);
            this.wheelShadowBoxCv = cv;
        }
        wrap.appendChild(this.wheelCv);
        if (this.wheelShadow) this.wheelShadow();
    }
});
