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
            this.draw(light);
            const rest = grab();
            const order = GreedJunk.LEVER_ORDER;
            for (const k of order) {
                this.upload(parts[k]);
                this.draw(light);
                const c = grab();
                sprites[k] = c;
                // поверх одиночного света — кадр покоя там, где часть видна
                // (её силуэт минус силуэты частей, лежащих на ней); одиночный
                // остаётся только под соседями — там, что откроется на рывке
                const m = document.createElement('canvas');
                m.width = c.width; m.height = c.height;
                const mg = m.getContext('2d');
                mg.drawImage(parts[k][0], 0, 0);
                mg.globalCompositeOperation = 'destination-out';
                order.slice(order.indexOf(k) + 1).forEach(j => mg.drawImage(parts[j][0], 0, 0));
                mg.globalCompositeOperation = 'source-in';
                mg.drawImage(rest, 0, 0);
                c.getContext('2d').drawImage(m, 0, 0);
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
