// ================= ТЩЕСЛАВИЕ: ГРИМЁРКА ПОД СВЕТОМ ВИДЕОКАРТЫ =================
// Холст гримёрки (рисунок — pride-room.js, свет — src/core/lit-gl.js) и всё,
// что с ним связано в игре: когда собирать, как класть под сцену, как
// освещать по наклону телефона и как резать на куски для смены декораций.
// Продолжение PrideMinigame (pride.js): `this` в методах — он же.
//
// ---------- КОГДА СОБИРАТЬ ----------
// Растр трёх карт во весь экран и сборка шейдера — заметная работа (на
// телефоне — сотни миллисекунд, docs/traps.md, п. 172). Поэтому она идёт
// ПОД ПОКРОВОМ перехода: покров ждёт готовности игры (veilReady), и игрок
// видит гримёрку уже освещённой. Не успела за VEIL_WAIT — покров раскрывается
// на нарисованный вид (baked), а свет проявится поверх, когда дозреет.
//
// ---------- ПОЧЕМУ ХОЛСТ ПОД СЦЕНОЙ, А НЕ В НЕЙ ----------
// Картинку шейдера в svg можно вложить только через foreignObject или
// <image> с адресом картинки. Первое на айфоне ломается под трансформами,
// второе требует кодировать холст в картинку на каждом сдвиге света. Холст
// лежит отдельным слоем под svg сцены и вписан в окно ТЕМ ЖЕ правилом, что
// и сцена (slice по viewBox 390×844), — единицы у них общие.
Object.assign(PrideMinigame, {
    lit: null,
    roomMode: 'none',        // 'gl' — свет видеокартой, 'baked' — нарисованный
    _litP: null,
    VEIL_WAIT: 2600,         // сколько покров ждёт свет, прежде чем раскрыться
    LIGHT_MS: 60,            // свет от наклона — не чаще: шейдер во весь экран
    TILT_DEAD: 0.02,         // мёртвая зона: 0.6° — меньше дрожи руки

    // Готовность для покрова перехода (src/core/mg-veil.js).
    veilReady() {
        const lit = this.roomLitStart();
        return Promise.race([lit, new Promise(r => setTimeout(r, this.VEIL_WAIT))]);
    },

    // ---------- СБОРКА ----------
    roomLitStart() {
        if (this._litP) return this._litP;
        const host = document.getElementById('pr-room-lit');
        if (!host) return Promise.resolve(false);
        this.fitRoomLit();
        let canvas = host.querySelector('#pr-lit-main');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'pr-lit-main';
            canvas.className = 'pr-lit-main';
            host.appendChild(canvas);
        }
        // Нарисованный вид — запасной, а не первый: он тоже растр во весь
        // экран, и класть его, когда через полсекунды придёт свет, — двойная
        // работа ровно в момент входа. Ставится, только если свет не успел.
        this._bakedTimer = setTimeout(() => { if (this.roomMode !== 'gl') this.showBakedRoom(); }, this.VEIL_WAIT);
        const run = this._litRun = (this._litRun || 0) + 1;
        this._litP = (async () => {
            if (typeof LitGL === 'undefined' || typeof PRIDE_ROOM === 'undefined' || !PRIDE_ROOM.K) return false;
            const R = await LitGL.create(canvas, PRIDE_ROOM.litOptions());
            if (!R) return false;
            // Пока собиралось, игру могли закрыть: свет не нужен, контекст —
            // отдать сразу (оставленный жить, он держит видеопамять).
            if (run !== this._litRun || !this.screenElement.classList.contains('active')) { R.destroy(); return false; }
            this.lit = R;
            R.onLost = () => { this.lit = null; this.roomMode = 'none'; this.showBakedRoom(); };
            this._litT = { x: 0, y: 0, lx: 0, ly: 0, sx: 9, sy: 9, at: 0 };
            R.draw(this.litTilt());
            this.roomMode = 'gl';
            clearTimeout(this._bakedTimer);
            host.classList.add('on');
            this.clearBakedRoom();
            // Силуэты кусков для смены декораций — заранее, пока игрок одевается,
            // а не в момент старта, которого он ждёт.
            this._maskTimer = setTimeout(() => this.prepareSplitMasks(), 900);
            return true;
        })().catch((e) => {
            if (typeof console !== 'undefined') console.error('[lit] гримёрка: ' + (e && e.message));
            return false;
        }).then((ok) => {
            if (!ok && run === this._litRun && this.screenElement.classList.contains('active')) this.showBakedRoom();
            return ok;
        });
        return this._litP;
    },

    // Закрытие игры: свет отдаётся целиком, следующая игра соберёт заново.
    roomLitStop() {
        this._litRun = (this._litRun || 0) + 1;
        clearTimeout(this._bakedTimer);
        clearTimeout(this._maskTimer);
        if (this.lit) { this.lit.destroy(); this.lit = null; }
        this._litP = null;
        this._masks = null;
        this.roomMode = 'none';
        const host = document.getElementById('pr-room-lit');
        if (host) {
            host.classList.remove('on');
            host.querySelectorAll('.pr-lit-piece').forEach(c => { c.width = 1; c.height = 1; c.remove(); });
        }
        this.clearBakedRoom();
    },

    // ---------- ХОЛСТ ТЕМ ЖЕ ПРАВИЛОМ, ЧТО СЦЕНА ----------
    // Сцена — svg с viewBox 390×844 и slice. Слой света — блок 390×844 px,
    // сдвинутый и увеличенный так же: тогда единица сцены и пиксель внутри
    // слоя — одно и то же, и куски при смене декораций двигаются в единицах
    // сцены, как и группы svg. Размеры — раскладочные (offsetWidth), без
    // трансформаций предков: они действуют на слой и на svg одинаково.
    fitRoomLit() {
        const host = document.getElementById('pr-room-lit');
        const svg = document.getElementById('pr-svg');
        if (!host || !svg) return;
        const W = svg.clientWidth || svg.offsetWidth, H = svg.clientHeight || svg.offsetHeight;
        if (!W || !H) return;
        const k = Math.max(W / PRIDE_ART.W, H / PRIDE_ART.H);
        const left = (W - PRIDE_ART.W * k) / 2, top = (H - PRIDE_ART.H * k) / 2;
        host.style.transform = `translate(${left.toFixed(2)}px, ${top.toFixed(2)}px) scale(${k.toFixed(5)})`;
    },

    // ---------- ЗАПАСНОЙ ВИД ----------
    showBakedRoom() {
        if (this.roomMode === 'gl' || typeof PRIDE_ROOM === 'undefined' || !PRIDE_ROOM.K) return;
        const map = { 'pr-room-back': 'back', 'pr-room-floor': 'floor', 'pr-room-l': 'left', 'pr-room-r': 'right' };
        Object.keys(map).forEach(id => {
            const g = this.roomEl && this.roomEl.querySelector(`#${id} > .pr-room-baked`);
            if (g && !g.childNodes.length) g.innerHTML = PRIDE_ROOM.part(map[id]);
        });
        this.roomMode = 'baked';
    },
    clearBakedRoom() {
        if (!this.roomEl) return;
        this.roomEl.querySelectorAll('.pr-room-baked').forEach(g => { g.innerHTML = ''; });
    },

    // ---------- НАКЛОН ----------
    // Свет стоит в мире, наклон поворачивает под ним гримёрку: блики латуни
    // и полосы обоев бегут, отражение в зеркале сдвигается, отсвет скользит
    // по стеклу. Перерисовка — только когда наклон заметно ушёл и не чаще
    // LIGHT_MS: неподвижный телефон не жжёт видеокарту (урок аппарата).
    litTilt() {
        const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
        return T.live ? { x: T.x, y: T.y } : { x: 0, y: 0 };
    },
    litStep(now) {
        if (!this.lit || !this.lit.alive || this.phase !== 'wardrobe' || this._pieces) return;
        const S = this._litT, want = this.litTilt();
        S.x += (want.x - S.x) * 0.15; S.y += (want.y - S.y) * 0.15;
        if (Math.abs(S.x - S.lx) > this.TILT_DEAD || Math.abs(S.y - S.ly) > this.TILT_DEAD) { S.lx = S.x; S.ly = S.y; }
        if ((S.lx !== S.sx || S.ly !== S.sy) && now - S.at >= this.LIGHT_MS) {
            S.sx = S.lx; S.sy = S.ly; S.at = now;
            this.lit.draw({ x: S.lx, y: S.ly });
        }
    },

    // ---------- КУСКИ ДЛЯ СМЕНЫ ДЕКОРАЦИЙ ----------
    // Силуэты столика и шкафа — проходом mask, в холст на единицу сцены:
    // куски едут три четверти секунды, и резкость в движении не видна.
    prepareSplitMasks() {
        if (this._masks || this._maskP || !this.lit || typeof LitGL === 'undefined') return this._maskP;
        const W = PRIDE_ART.W, H = PRIDE_ART.H;
        this._maskP = Promise.all([
            LitGL.raster(PRIDE_ROOM.svg('mask', ['left']), W, H),
            LitGL.raster(PRIDE_ROOM.svg('mask', ['right']), W, H)
        ]).then(([l, r]) => { this._masks = { l, r }; this._maskP = null; })
          .catch(() => { this._maskP = null; });
        return this._maskP;
    },

    // Свежая картинка света → четыре холста-куска. Шейдер рисует, и тут же,
    // в той же задаче, картинка копируется: буфер видеокарты не хранится
    // между кадрами (preserveDrawingBuffer выключен ради скорости).
    splitRoom() {
        const host = document.getElementById('pr-room-lit');
        if (!host || !this.lit || !this.lit.alive) return false;
        const W = PRIDE_ART.W, H = PRIDE_ART.H, FY = PRIDE_ROOM.FLOOR_Y;
        const T = this._litT || { lx: 0, ly: 0 };
        this.lit.draw({ x: T.lx, y: T.ly });
        const src = this.lit.canvas, M = this._masks;
        const ids = ['pr-lit-back', 'pr-lit-floor', 'pr-lit-l', 'pr-lit-r'];
        const cv = {};
        ids.forEach(id => {
            let c = host.querySelector('#' + id);
            if (!c) {
                c = document.createElement('canvas');
                c.id = id; c.className = 'pr-lit-piece';
                host.appendChild(c);
            }
            if (c.width !== W) { c.width = W; c.height = H; }
            const g = c.getContext('2d');
            g.globalCompositeOperation = 'source-over';
            g.clearRect(0, 0, W, H);
            cv[id] = { c, g };
        });
        const full = (g) => g.drawImage(src, 0, 0, W, H);
        // Пол — всё ниже стыка. Стена — всё выше, без столика и шкафа.
        const fl = cv['pr-lit-floor'].g;
        fl.drawImage(src, 0, FY * src.height / H, src.width, src.height - FY * src.height / H, 0, FY, W, H - FY);
        const bk = cv['pr-lit-back'].g;
        bk.drawImage(src, 0, 0, src.width, FY * src.height / H, 0, 0, W, FY);
        if (M) {
            ['l', 'r'].forEach(k => {
                // Силуэт, потом картинка внутрь него (source-in).
                const g = cv['pr-lit-' + k].g;
                g.drawImage(M[k], 0, 0, W, H);
                g.globalCompositeOperation = 'source-in';
                full(g);
                g.globalCompositeOperation = 'source-over';
                bk.globalCompositeOperation = 'destination-out';
                bk.drawImage(M[k], 0, 0, W, H);
            });
            bk.globalCompositeOperation = 'source-over';
            // Ножки столика и цоколь шкафа уходят со своими кусками и с пола.
            fl.globalCompositeOperation = 'destination-out';
            fl.drawImage(M.l, 0, 0, W, H); fl.drawImage(M.r, 0, 0, W, H);
            fl.globalCompositeOperation = 'source-over';
        }
        this._pieces = true;
        host.classList.add('split');
        return true;
    },

    // Куски больше не нужны — холст света снова целый.
    joinRoom() {
        const host = document.getElementById('pr-room-lit');
        this._pieces = false;
        if (!host) return;
        host.classList.remove('split');
        if (this.lit && this.lit.alive) {
            const T = this._litT || { lx: 0, ly: 0 };
            this.lit.draw({ x: T.lx, y: T.ly });
        }
    }
});
