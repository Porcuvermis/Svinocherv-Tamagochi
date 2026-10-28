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
    LEVER_CROP: { x: 300, y: 262, w: 60, h: 124 },
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
            for (const k of GreedJunk.LEVER_ORDER) {
                this.upload(parts[k]);
                this.draw(light);
                const c = document.createElement('canvas');
                c.width = C.w * S; c.height = C.h * S;
                c.getContext('2d').drawImage(this.gl.canvas, C.x * S, (C.y - GreedJunk.Y0) * S, C.w * S, C.h * S, 0, 0, C.w * S, C.h * S);
                sprites[k] = c;
                // тень: силуэт части, чёрный, размытый несколькими сдвигами
                const sc = document.createElement('canvas');
                sc.width = c.width; sc.height = c.height;
                const g = sc.getContext('2d');
                for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
                    g.globalAlpha = 0.06; g.drawImage(c, dx * S, dy * S);
                }
                g.globalAlpha = 1; g.globalCompositeOperation = 'source-in';
                g.fillStyle = PALETTE.greedJunk.hole; g.fillRect(0, 0, sc.width, sc.height);
                shadows[k] = sc;
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
            this.lever = { bare, sprites, shadows };
        } catch (e) { console.warn('[Аппарат] части рычага не собрались', e); }
        GreedJunk.pass = 'baked';
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
