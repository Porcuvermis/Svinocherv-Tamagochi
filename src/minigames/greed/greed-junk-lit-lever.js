// АППАРАТ АЛЧНОСТИ: РЫЧАГ НА СВЕТУ — ЧАСТИ, ХОД, ОТДАЧА, ГОТОВНОСТЬ
// Продолжение GreedJunkLit (greed-junk-lit.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk-lit.js.
Object.assign(GreedJunkLit, {

    // ---------- РЫЧАГ ----------
    // Рычаг на общем свете, как весь корпус, но двигается — и плавно.
    // Растрировать корпус на каждый кадр дорого, поэтому один раз (после
    // первого кадра, не задерживая его) каждая часть рычага — юбка, рамка,
    // шток, хомут, рукоять — освещается шейдером отдельно, на прозрачном
    // фоне, и запоминается картинкой. На рывке участок рычага в текстурах
    // подменяется корпусом без рычага, а части рисуются поверх своим
    // холстом и непрерывно двигаются по геометрии GreedJunk.leverGeom:
    // шток сжимается ракурсом, рукоять едет вниз и растёт, юбка
    // сминается. Тени частей — их же силуэты, сдвинутые от света; чем
    // ближе к игроку часть, тем дальше тень. После рывка участок
    // возвращается в текстуры с рычагом — в покое он снова на шейдере
    // целиком, с настоящей тенью.
    // Было: тринадцать заранее снятых положений, подменяемых по очереди, —
    // движение шло ступеньками.
    LEVER_CROP: { x: 280, y: 282, w: 60, h: 104 },
    async prepareLever() {
        const S = this.SCALE, C = this.LEVER_CROP;
        const sized = (svg) => svg.replace('<svg ', `<svg width="${C.w * S}" height="${C.h * S}" `);
        const maps = (make) => Promise.all(['albedo', 'height', 'mat'].map(ps => this.image(sized(make(ps)))));
        // Корпус без рычага — ВТОРОЙ ПОЛНЫЙ комплект текстур, собранный так
        // же, как основной; на рывке шейдер просто читает его. Участками
        // корпус больше не собирается: на iPhone и растр участком, и вырез
        // из полного рисунка через холст выходили пустыми — за рычагом
        // пропадал весь корпус. Полная картинка прямо в текстуру — тот же
        // путь, которым собран основной корпус, и на iPhone он верный.
        const W = GreedJunk.W * S, H = GreedJunk.H * S, gl = this.gl;
        try {
            const bareFull = await Promise.all(['albedo', 'height', 'mat'].map(ps =>
                this.image(GreedJunk.bodySvg(ps, null, false).replace('<svg ', `<svg width="${W}" height="${H}" `))));
            const bare = bareFull.map((img, i) => this.texture(gl, img, i));
            // нормали голого корпуса — сейчас, а не на первом рывке (заминка)
            this.normalsFor(bare[1]);
            this.bindSet(this.tex);
            const parts = {};
            for (const k of GreedJunk.LEVER_ORDER) parts[k] = await maps(ps => GreedJunk.leverPartSvg(ps, C, k));
            GreedJunk.pass = 'baked';
            // освещённые части и их тени
            const sprites = {}, shadows = {};
            const light = this.lightFor(this._tilt || { x: 0, y: 0 });
            const grab = () => {
                const c = document.createElement('canvas');
                c.width = C.w * S; c.height = C.h * S;
                c.getContext('2d').drawImage(this.gl.canvas, C.x * S, (C.y - GreedJunk.Y0) * S, C.w * S, C.h * S, 0, 0, C.w * S, C.h * S);
                return c;
            };
            // Рычаг в покое целиком, на своём месте в корпусе: с него снимается
            // видимое у каждой части. Было: части освещались только поодиночке
            // на пустом фоне — у пустоты высота минимальная, края тонких частей
            // (шток, рёбра юбки) выходили крутым ложным скатом, лампа над
            // рычагом на нём не светит, — и с первого касания рычаг темнел и
            // холодел, а встав на место, снова «облеплялся» светом (игрок).
            // Снимки — только участок рычага (scissor): весь корпус шейдером
            // перед каждым снимком стоил ~0,6 с (снимок ждёт видеокарту), а
            // снимков восемь — сборка рычага, которую ждёт вход в алчность.
            this.draw(light, C);
            const rest = grab();
            // Тень рычага в покое — какая она в корпусе: кадр с рычагом против
            // кадра без него, вне силуэта частей. В покое и около него она
            // лежит под картинками частей вместо нарисованной тени движения:
            // иначе через 0,9 с после касания, на подмене картинок корпусом,
            // нарисованная тень (вправо-вниз, гуще) пропадала, шейдерная (узкая)
            // появлялась — стена у рычага светлела скачком (видео игрока).
            this.bindSet(bare);
            this.draw(light, C);
            const bareImg = grab();
            this.bindSet(this.tex);
            const order = GreedJunk.LEVER_ORDER;
            const stillShadow = this.leverStillShadow(rest, bareImg, order.map(k => parts[k][0]));
            for (const k of order) {
                this.upload(parts[k]);
                this.draw(light, C);
                const c = grab();
                sprites[k] = c;
                // Шар — без кадра покоя: в нём схема передач вклеена на угле
                // покоя, а на рывке схема рисуется поверх по своему углу — на
                // дотянутом рычаге выходило две схемы. Шар в покое со схемой —
                // отдельная картинка (knobRest, ниже).
                if (k === 'knob') { this.leverShadow(c, shadows, k); continue; }
                // поверх одиночного света — кадр покоя там, где часть видна
                // (её силуэт минус силуэты частей, лежащих на ней); одиночный
                // остаётся только под соседями — там, что откроется на рывке
                // Видимое — без полупрозрачного края (hard): на краю маски
                // иначе просвечивал одиночный свет части с её ложным скатом на
                // пустоту, и по контуру шла кромка, которой в покое нет.
                const m = document.createElement('canvas');
                m.width = c.width; m.height = c.height;
                const mg = m.getContext('2d');
                mg.drawImage(parts[k][0], 0, 0);
                mg.globalCompositeOperation = 'destination-out';
                order.slice(order.indexOf(k) + 1).forEach(j => mg.drawImage(parts[j][0], 0, 0));
                this.hardMask(m);
                const cg = c.getContext('2d');
                cg.globalCompositeOperation = 'destination-out';
                cg.drawImage(m, 0, 0);
                mg.globalCompositeOperation = 'source-in';
                mg.drawImage(rest, 0, 0);
                cg.globalCompositeOperation = 'source-over';
                cg.drawImage(m, 0, 0);
                this.leverShadow(c, shadows, k);
            }
            // Шар в покое — со схемой передач, как в корпусе: на рывке схема
            // рисуется поверх плоско, по углу поворота, и в покое она шла бы
            // скачком из рельефной и освещённой в плоскую кремовую. Цвет плоской
            // схемы — снятый с освещённой: среднее по её точкам в кадре покоя.
            {
                const K = GreedJunk.leverGeom(0).K, KP = GreedJunk.knobPattern(K.x, K.y, K.r, GreedJunk.KNOB_PHI);
                const kr = document.createElement('canvas');
                kr.width = rest.width; kr.height = rest.height;
                const kg = kr.getContext('2d');
                kg.drawImage(parts.knob[0], 0, 0);
                this.hardMask(kr);
                kg.globalCompositeOperation = 'source-in';
                kg.drawImage(rest, 0, 0);
                sprites.knobRest = kr;
                const rd = rest.getContext('2d'), acc = [0, 0, 0];
                let n = 0;
                KP.lines.forEach(l => l.forEach(q => {
                    const d = rd.getImageData(Math.round((q[0] - C.x) * S), Math.round((q[1] - C.y) * S), 1, 1).data;
                    if (d[3] > 200) { acc[0] += d[0]; acc[1] += d[1]; acc[2] += d[2]; n++; }
                }));
                this.leverPatColor = n ? `rgb(${acc.map(v => Math.round(v / n)).join(',')})` : null;
            }
            // основной комплект — заново целиком из полных картинок: части
            // писались в него участками
            this.maps.forEach((img, u) => {
                gl.activeTexture(gl.TEXTURE0 + u);
                gl.bindTexture(gl.TEXTURE_2D, this.tex[u]);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, u === 0);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            });
            this.heightDirty(this.tex[1]);
            this.draw(light);
            this.lever = { bare, sprites, shadows, stillShadow };
        } catch (e) { console.warn('[Аппарат] части рычага не собрались', e); }
        GreedJunk.pass = 'baked';
    },
    // Тень в покое: чёрный с прозрачностью 1 − (с рычагом / без) — поверх
    // корпуса без рычага даёт ровно корпус с рычагом. Где рычаг стену светлит
    // (такого быть не должно — это аномалия, docs/bench/greed-audit.md,
    // разд. 8), прозрачность 0. Под самими частями — 0: там они.
    leverStillShadow(rest, bare, masks) {
        const w = rest.width, h = rest.height;
        const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
        const sg = sil.getContext('2d');
        masks.forEach(m => sg.drawImage(m, 0, 0));
        const A = rest.getContext('2d').getImageData(0, 0, w, h).data, B = bare.getContext('2d').getImageData(0, 0, w, h).data;
        const M = sg.getImageData(0, 0, w, h).data;
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        const og = out.getContext('2d'), im = og.createImageData(w, h);
        const lum = (d, i) => d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
        for (let i = 0; i < w * h * 4; i += 4) {
            const lb = lum(B, i);
            let a = lb > 2 ? 1 - lum(A, i) / lb : 0;
            a = Math.max(0, Math.min(1, a)) * (1 - M[i + 3] / 255);
            im.data[i + 3] = Math.round(a * 255);
        }
        og.putImageData(im, 0, 0);
        return out;
    },
    // маска без полупрозрачного края: всё, что хоть чуть закрыто, — целиком
    hardMask(cv) {
        const g = cv.getContext('2d'), im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
        for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 8 ? 255 : 0;
        g.putImageData(im, 0, 0);
    },
    // тень части: её силуэт, чёрный, размытый несколькими сдвигами
    leverShadow(c, shadows, k) {
        const S = this.SCALE, sc = document.createElement('canvas');
        sc.width = c.width; sc.height = c.height;
        const g = sc.getContext('2d');
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
            g.globalAlpha = 0.06; g.drawImage(c, dx * S, dy * S);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-in';
        g.fillStyle = PALETTE.greedJunk.hole; g.fillRect(0, 0, sc.width, sc.height);
        shadows[k] = sc;
    },
    // какой комплект текстур читает шейдер
    bindSet(set) {
        const gl = this.gl;
        set.forEach((t, u) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); });
        this._boundH = set[1];      // нормали к ней — normalsFor в draw
    },
    // участок рычага в трёх текстурах
    upload(imgs, crop) {
        const gl = this.gl, C = crop || this.LEVER_CROP, S = this.SCALE;
        imgs.forEach((img, u) => {
            gl.activeTexture(gl.TEXTURE0 + u);
            gl.bindTexture(gl.TEXTURE_2D, this.tex[u]);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, u === 0);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, C.x * S, (C.y - GreedJunk.Y0) * S, gl.RGBA, gl.UNSIGNED_BYTE, img);
        });
        this.heightDirty(this.tex[1]);
    },
});
