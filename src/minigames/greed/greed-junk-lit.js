// ================= АППАРАТ АЛЧНОСТИ: СВЕТ ШЕЙДЕРОМ =================
// Корпус освещается ОДНИМ источником на всю сцену. Рисунок даёт три
// карты (greed-junk-light.js): цвет без света, высоты, материалы. Здесь они
// становятся текстурами, а свет считает видеокарта:
//
//   * нормаль — из карты высот (разница соседей; шаг в полтора тексела
//     сглаживает ступеньки в мягкую фаску);
//   * рассеянный свет — по углу между нормалью и светом, нормированный так,
//     что ровная поверхность выходит ровно в свой цвет: рисунок не темнеет
//     и не выцветает, свет только лепит рельеф;
//   * блик — по материалу: сила, острота, у металла окрашен его цветом;
//   * тень — шагами по карте высот к свету: если по пути есть что-то выше
//     луча — точка в тени. Длина тени выходит сама, от разницы высот, и у
//     всех деталей в одну сторону;
//   * глубина — чем ниже поверхность, тем темнее (в ящик света попадает меньше).
//
// Карты растрируются один раз; дальше на кадр — один проход шейдера. Это
// тот же приём, что у монет рамки алчности (greed-coins-batch.js).
const GreedJunkLit = {
    SCALE: 3,
    // Лента старого аппарата — контурная, одной тушью; цветная — у
    // прокачанного (решение игрока: цвет на барабане читается плохо).
    REEL_MONO: true,              // текселей на единицу поля: экран айфона — три точки на пиксель

    // SVG-строка → картинка.
    image(svg) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            img.src = url;
        });
    },

    // Готовит холст: три прохода рисунка → текстуры, шейдер собран.
    // Возвращает false, если видеокарты нет (тогда показывается baked).
    async init(canvas) {
        const W = GreedJunk.W * this.SCALE, H = GreedJunk.H * this.SCALE;
        canvas.width = W; canvas.height = H;
        // preserveDrawingBuffer: пока крутятся барабаны, кадр перерисовывает
        // только окна (scissor), остальное должно остаться с прошлого кадра
        const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
        if (!gl) return false;
        this.gl = gl;
        this.size = [W, H];

        const sized = (svg) => svg.replace('<svg ', `<svg width="${W}" height="${H}" `);
        const [a, h, m] = await Promise.all(['albedo', 'height', 'mat']
            .map(p => this.image(sized(GreedJunk.bodySvg(p)))));
        GreedJunk.pass = 'baked';

        this.prog = this.program(gl);
        this.maps = [a, h, m];
        this.tex = [a, h, m].map((img, i) => this.texture(gl, img, i));
        // лента барабанов (3) и маска их поверхности (4)
        const [strip, mask] = await Promise.all([
            this.image(GreedJunk.reelStripSvg(this.SCALE, this.REEL_MONO)),
            this.image(sized(GreedJunk.bodySvg('mask')))]);
        GreedJunk.pass = 'baked';
        this.texture(gl, strip, 3);
        this.texture(gl, mask, 4);
        // барабаны стоят на случайных ячейках
        const n = GreedJunk.REEL_STRIP.length;
        // барабаны: s — смещение ленты (единицы поля), v — скорость
        const C = GreedJunk.CELL;
        this.reels = [0, 1, 2].map(() => ({ s: Math.floor(Math.random() * n) * C.h + C.h / 2, v: 0, blur: 0 }));
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(this.prog, 'aPos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        return true;
    },

    texture(gl, img, unit) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unit === 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        // размеры не степени двойки: без мипмапов и с обрезкой по краю
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    },

    program(gl) {
        const vs = `attribute vec2 aPos; varying vec2 vUv;
            void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;
        // Координаты экранные: x вправо, y ВНИЗ, z к зрителю. Свет uL —
        // направление НА источник.
        const fs = `precision mediump float;
            uniform sampler2D uA, uH, uM, uS, uK;
            // барабаны: окно (x, y, w, h в uv поля), смещение ленты в
            // единицах поля; лента — uLen единиц по кругу, радиус барабана
            uniform vec4 uReel0, uReel1, uReel2;
            uniform vec3 uOff, uBlur;
            uniform float uLen, uDrumR, uFieldH;
            uniform vec3 uCream;
            uniform vec2 uTex;        // размер тексела в uv
            uniform vec3 uL;          // на источник, нормирован
            uniform float uRelief;    // крутизна рельефа для нормали
            uniform float uPxPerH;    // текселей на единицу карты высот
            uniform vec2 uHMap;       // карта высот: (H0, HMAX) — h = v * HMAX − H0
            varying vec2 vUv;
            float hh(vec2 p) { return texture2D(uH, p).r; }
            // Для нормали — высота, усреднённая крестом в пять текселей.
            // Карта высот 8-битная: на пологом длинном уклоне (скос окна)
            // высота растёт ступеньками в один уровень, и нормаль по ним
            // дёргалась — скос шёл полосами. Среднее соседей превращает
            // ступеньки обратно в уклон.
            float hs(vec2 p) {
                return (hh(p) * 2.0 + hh(p + vec2(uTex.x, 0.0)) + hh(p - vec2(uTex.x, 0.0)) +
                        hh(p + vec2(0.0, uTex.y)) + hh(p - vec2(0.0, uTex.y))) / 6.0;
            }
            // Лента барабана в точке окна r со смещением off: высота точки
            // переводится в угол на цилиндре, по углу — место на ленте; у
            // краёв окна ячейки сжимаются (уходят за изгиб). Цвет барабана
            // в рисунке — его освещённость (затемнение к краям, блики стекла):
            // делится на цвет бумаги барабана и умножается на ленту.
            // На ходу лента смазана вдоль хода: девять проб вдоль ленты на
            // длину blur (сколько лента проезжает за выдержку кадра).
            vec3 reelAt(vec4 r, float off, float blur, vec3 base) {
                float u = (vUv.x - r.x) / r.z;
                float y = (vUv.y - (r.y + r.w * 0.5)) * uFieldH;
                float s = off + asin(clamp(y / uDrumR, -1.0, 1.0)) * uDrumR;
                vec3 st = vec3(0.0);
                for (int k = 0; k < 9; k++)
                    st += texture2D(uS, vec2(u, fract((s + (float(k) / 8.0 - 0.5) * blur) / uLen))).rgb;
                return st / 9.0 * base / uCream;
            }
            void main() {
                vec4 a = texture2D(uA, vUv);
                if (a.a < 0.004) { gl_FragColor = vec4(0.0); return; }
                // поверхность барабана — лента вместо пустой бумаги
                if (texture2D(uK, vUv).r > 0.5) {
                    if (vUv.x > uReel0.x && vUv.x < uReel0.x + uReel0.z && vUv.y > uReel0.y && vUv.y < uReel0.y + uReel0.w) a.rgb = reelAt(uReel0, uOff.x, uBlur.x, a.rgb);
                    else if (vUv.x > uReel1.x && vUv.x < uReel1.x + uReel1.z && vUv.y > uReel1.y && vUv.y < uReel1.y + uReel1.w) a.rgb = reelAt(uReel1, uOff.y, uBlur.y, a.rgb);
                    else if (vUv.x > uReel2.x && vUv.x < uReel2.x + uReel2.z && vUv.y > uReel2.y && vUv.y < uReel2.y + uReel2.w) a.rgb = reelAt(uReel2, uOff.z, uBlur.z, a.rgb);
                }
                // Нормаль по соседям в четырёх текселях, а не в одном: фаска
                // шире чёрного контура, иначе контур её целиком закрывает
                vec2 d = uTex * 4.0;
                float h0 = hh(vUv);
                // Соседи не выше самой точки: фаска ложится только на ВЕРХНЮЮ
                // деталь. Без этого подножие ступеньки на стенке тоже получало
                // наклонную нормаль, смотрящую на свет, — вокруг деталей
                // светился ореол на поверхности, на которой они лежат.
                float h0s = hs(vUv);
                float hl = min(hs(vUv - vec2(d.x, 0.0)), h0s), hr = min(hs(vUv + vec2(d.x, 0.0)), h0s);
                float hu = min(hs(vUv - vec2(0.0, d.y)), h0s), hd = min(hs(vUv + vec2(0.0, d.y)), h0s);
                vec3 n = normalize(vec3((hl - hr) * uRelief, (hu - hd) * uRelief, 1.0));

                // рассеянный: ровная поверхность = свой цвет
                float amb = 0.42;
                float lit = (amb + (1.0 - amb) * max(dot(n, uL), 0.0)) / (amb + (1.0 - amb) * uL.z);

                // тень: шаги к свету по карте высот
                vec2 dir = normalize(uL.xy);
                float rise = uL.z / length(uL.xy) / uPxPerH;   // подъём луча на тексел
                float occ = 0.0;
                // Уклон своей плоскости вдоль луча: тень дают только уступы,
                // торчащие и над лучом, и над продолжением своей плоскости.
                // Иначе ровный крутой уклон (скос окна) затенял сам себя, и
                // шаги луча штриховали его полосами. Свою отвёрнутость от
                // света плоскость и так получает рассеянным светом.
                float gx = (hh(vUv + vec2(d.x, 0.0)) - hh(vUv - vec2(d.x, 0.0))) / 8.0;
                float gy = (hh(vUv + vec2(0.0, d.y)) - hh(vUv - vec2(0.0, d.y))) / 8.0;
                float plane = max(rise, dot(vec2(gx, gy), dir));
                // 20 шагов по 3 текселя (тот же охват, что 40 по 1,5 — тень не
                // короче), начало сдвинуто на долю шага по месту точки: рябь
                // от крупного шага рассыпается в незаметный шум. Было 40 —
                // вдвое больше чтений на каждую точку экрана.
                float jit = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
                for (int i = 1; i <= 20; i++) {
                    float t = (float(i) - jit) * 3.0;
                    float hs = hh(vUv + dir * uTex * t);
                    occ = max(occ, clamp((hs - (h0 + t * plane) - 0.01) * 5.0, 0.0, 1.0));
                }
                float sh = 1.0 - 0.55 * occ;

                // блик по материалу
                vec4 m = texture2D(uM, vUv);
                vec3 hv = normalize(uL + vec3(0.0, 0.0, 1.0));
                float nh = max(dot(n, hv), 0.0);
                // острый блик на гранях и широкий мягкий отблеск на ровном:
                // без второго полированный диск на ровной полосе был матовым
                float sp = m.r * (pow(nh, mix(6.0, 90.0, m.g)) + 0.35 * m.g * pow(nh, 3.0) - 0.35 * m.g * pow(uL.z * 0.5 + 0.5, 3.0) * 0.6);
                vec3 spc = mix(vec3(1.0), a.rgb / max(a.a, 0.01) * 1.5, m.b);

                // глубина: ниже — темнее
                float hu0 = h0 * uHMap.y - uHMap.x;      // высота в единицах сцены
                float depth = mix(0.72, 1.0, clamp((hu0 + 1.6) / 12.0, 0.0, 1.0));

                vec3 col = a.rgb * lit * sh * depth + spc * sp * sh * a.a;
                gl_FragColor = vec4(col, a.a);
            }`;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
    },

    // Свет по умолчанию — сверху-слева, как был нарисован руками (LIGHT в
    // palette.js): x влево, y вверх, и довольно высоко над сценой.
    LIGHT: [-0.45, -0.55, 0.70],

    // ---------- НАКЛОН ТЕЛЕФОНА ----------
    // Свет стоит в мире, а наклон поворачивает под ним корпус — так же, как
    // кучу монет рамки алчности (GreedCoins.tiltMat, та же матрица и тот же
    // предельный угол): оба места ведут себя одинаково, и направление
    // проверено там на телефоне. Здесь свет переводится в систему корпуса:
    // Mᵀ·L. Экранная y у корпуса смотрит вниз, у монет вверх — отсюда
    // переворот y туда и обратно.
    TILT_MAX: 30,
    lightFor(t) {
        const D = Math.PI / 180, ay = t.x * this.TILT_MAX * D, ax = t.y * this.TILT_MAX * D;
        const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
        const M = [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
        const L = [this.LIGHT[0], -this.LIGHT[1], this.LIGHT[2]];
        const r = [M[0] * L[0] + M[1] * L[1] + M[2] * L[2],
                   M[3] * L[0] + M[4] * L[1] + M[5] * L[2],
                   M[6] * L[0] + M[7] * L[1] + M[8] * L[2]];
        // Свет не подходит к оси экрана ближе LIGHT_CONE: блик в шейдере
        // считается для бесконечно далёких света и глаза, и когда свет бьёт
        // прямо из экрана, полный острый блик загорается на КАЖДОЙ ровной
        // поверхности разом — на краю наклона аппарат белел целиком (краска
        // +0.32 белого против 0.03 без наклона). У конуса блик на ровном
        // не больше двух обычных, а на гранях и болтах он по-прежнему бегает.
        const len = Math.hypot(r[0], r[1], r[2]) || 1, zMax = Math.cos(this.LIGHT_CONE * D) * len;
        if (r[2] > zMax) {
            let hx = r[0], hy = r[1], hl = Math.hypot(hx, hy);
            // свет ровно из экрана — сторону берём у света по умолчанию
            if (hl < 1e-4) { hx = L[0]; hy = L[1]; hl = Math.hypot(hx, hy); }
            const k = Math.sqrt(len * len - zMax * zMax) / hl;
            r[0] = hx * k; r[1] = hy * k; r[2] = zMax;
        }
        return [r[0], -r[1], Math.max(0.15, r[2])];
    },
    LIGHT_CONE: 32,

    // Перерисовка, пока холст на экране: только когда наклон заметно
    // сдвинулся — неподвижный телефон не жжёт видеокарту.
    LIGHT_MS: 60,
    // группы живого слоя: определения свечений — один раз
    liveParts() {
        const ns = 'http://www.w3.org/2000/svg', P = { keys: {} };
        this.live.innerHTML = GreedJunk.haloDefs();
        ['glows', 'thread', 'lamp', 'ind'].forEach(k => { P[k] = document.createElementNS(ns, 'g'); this.live.appendChild(P[k]); });
        return P;
    },
    run(canvas) {
        if (this._running) return;
        this._running = true;
        const t = { x: 0, y: 0 }, last = { x: 9, y: 9 };
        let lastFull = 0;
        // тряпка — первой: пока её нет, доска под табло пустая. Готовится один
        // раз: аппарат потом только переезжает (mount), а не собирается заново
        if (!this._prepared) {
            this._prepared = true;
            (this.prepareRag ? this.prepareRag() : Promise.resolve()).then(() => this.prepareLever());
        }
        // кончик нитки — упругая цепочка (src/core/hang.js): гнётся кончик,
        // а не весь хвостик целиком; тяжесть — по наклону телефона
        const tail = { s: Hang.create(GreedJunk.TAIL.len, GreedJunk.TAIL.root, 'thread'), shown: null };
        // красная лампа на проводах — тоже подвес, с тяжёлым грузом
        const lamp = GreedJunk.lampHang();
        this._hangs = [tail.s, lamp];          // удар рычага их раскачивает
        const loop = (now) => {
            // аппарат сняли со страницы — цикл стоит; mount в новое место запустит
            if (!canvas.isConnected) { this._running = false; return; }
            if (this.live) {
                const g = Hang.down();
                Hang.step(tail.s, g);
                Hang.step(lamp, g);
                const glow = this.glowStep(now);
                const ind = this.readyStep(now);
                // Живой слой — четыре группы, и пересобирается только та, что
                // изменилась. Было: весь слой (определения свечений, три лампы,
                // нитка, висячая лампа, индикатор) заново из текста каждый
                // кадр, пока хоть что-то качалось, — а от дрожи датчика
                // качается всегда. Углы подвесов — до сотых: тысячные ловили
                // шум, сдвиг на сотую радиана — меньше точки экрана.
                const P = this._liveParts || (this._liveParts = this.liveParts());
                const put = (k, key, html) => { if (P.keys[k] !== key) { P.keys[k] = key; P[k].innerHTML = html(); } };
                put('glows', this.GLOW_ORDER.map(k => glow[k].toFixed(2)).join(','),
                    () => ['pear', 'flame', 'globe'].map(k => GreedJunk.bulbGlow(k, glow[k])).join(''));
                put('thread', tail.s.th.map(v => v.toFixed(2)).join(','), () => GreedJunk.threadTail(tail.s));
                put('lamp', lamp.th.map(v => v.toFixed(2)).join(',') + glow.red.toFixed(2), () => GreedJunk.hangLamp(lamp, glow.red));
                put('ind', ind.red.toFixed(2) + ind.green.toFixed(2), () => GreedJunk.readyLampGlow(ind.red, ind.green));
            }
            const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
            const want = T.live ? T : { x: 0, y: 0 };
            t.x += (want.x - t.x) * 0.15; t.y += (want.y - t.y) * 0.15;
            this._tilt = t;
            const moved = this.leverStep(now);
            this.shakeStep(now);
            const reels = this.spinStep(now);
            if (this.trayStep) this.trayStep(now);
            // Свет от наклона — не чаще LIGHT_MS: каждая перерисовка — весь
            // корпус шейдером с поиском тени, а датчик в руке дрожит всегда.
            // Сдвиг света за 1/16 с глазу не виден, а видеокарта отдыхает.
            // Рычаг (moved) рисуется каждый кадр — он движется сам.
            const tilted = Math.abs(t.x - last.x) > 0.002 || Math.abs(t.y - last.y) > 0.002;
            if (moved || (tilted && now - lastFull >= this.LIGHT_MS)) {
                last.x = t.x; last.y = t.y; lastFull = now;
                this.draw(this.lightFor(t));
            } else if (reels) {
                this.draw(this.lightFor(t), this.REEL_BOX);   // только окна
            }
            if (this.ragStep) this.ragStep(now);
            if (this.coinStep) this.coinStep(now);
            if (this.meterStep) this.meterStep(now);
            if (this.jarStep) this.jarStep(now);
            if (this.wheelStep) this.wheelStep(now);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },
    // ---- ход рычага ----
    // Состояния: drag — рычаг идёт за пальцем; free — сорвался и сам падает
    // до упора; back — пружина возвращает его с откатом и затуханием.
    // Тянуть пальцем: сначала храповик — рычаг упирается и проскакивает
    // зубцами, по щелчку на каждый зубец; на последнем зубце он срывается,
    // отдаёт одним сильным толчком и дальше падает до низа сам. Отпустил
    // раньше срыва — пружина возвращает, крутки нет. Тап — сразу срыв.
    // Ход: храповик — зубцы до срыва; fall — падение после срыва, мс;
    // over — насколько рычаг проскакивает упор и отскакивает; hold — сколько
    // стоит внизу после удара; back — затухание пружины на возврате, мс.
    LEVER: { teeth: 5, breakAt: 0.28, travel: 44, fall: 190, over: 0.06, hold: 240, back: 170 },
    onPull: null,              // срыв рычага — крутка (игра подставит своё)
    leverState(st, p) {
        if (!this.lever || !this.leverCanvas) return false;
        this._lv = { st, p0: p || 0, at: -1, p: p || 0 };
        return true;
    },
    // ---- готовность рычага ----
    // Дёргать можно, только когда прошлая крутка кончилась: от срыва до
    // её конца лампа на кулисе красная и рычаг не берётся, потом — зелёная.
    // Игра сообщает конец крутки setReady(true); превью — само, когда
    // встал последний барабан и рычаг вернулся.
    ready: true,
    ind: { red: 0, green: 1 },
    _indOn: 'green',
    IND_PAUSE: 70,             // мс темноты между цветами
    setReady(on) { this.ready = !!on; this._readyAt = null; },
    // Смена цвета — не перетеканием, а как у прибора: горевший цвет гаснет,
    // едва заметная пауза темноты, загорается другой. Нить разгорается и
    // остывает быстро, но не мгновенно.
    readyStep(now) {
        if (this._readyAt != null && now >= this._readyAt) this.setReady(true);
        const want = this.ready ? 'green' : 'red', I = this.ind;
        if (want !== this._indOn) {
            const v = I[this._indOn];
            I[this._indOn] = v < 0.04 ? 0 : v * 0.4;
            if (I[this._indOn] === 0) {
                if (this._indDark == null) this._indDark = now;
                if (now - this._indDark >= this.IND_PAUSE) { this._indOn = want; this._indDark = null; }
            }
        } else {
            const v = I[want];
            I[want] = v > 0.99 ? 1 : v + (1 - v) * 0.45;
        }
        return I;
    },
    // тап по рычагу
    pull() { if (this.ready && this.leverState('free', 0)) this.leverBreak(); },
    // ---- отдача в палец ----
    // Рисунок по ходу рычага, а не одна отдача на всё. На iPhone виды
    // удара по силе почти не различаются (проверено рукой: «разница
    // неощутима»), поэтому сила здесь — ДЛИТЕЛЬНОСТЬ, число ударов подряд:
    // натяжение — самый тихий щелчок выбора; зубец — один удар, последние
    // зубцы — два; срыв — очередь из шести тяжёлых, длинный мощный
    // толчок; падение и упор — без своей отдачи (упор приходит, пока ещё
    // идёт очередь срыва). Тройной импульс «ошибка» в конце очереди
    // убран: он длинный, и его хвост доставал до подъёма рычага.
    leverBreak() {
        this.setReady(false);
        if (typeof Haptics !== 'undefined') Haptics.burst('heavy', 6, 40);
        this._leverIdle = false;
        // Сначала решает игра (onPull: false — крутки нет, денег нет), потом
        // монета из банки в щель; без денег банка пуста — монеты нет.
        let ok = true;
        if (this.onPull) ok = this.onPull() !== false;
        else {
            this.spin(this.previewOutcome());
            // в превью шкалы игры не трогаем — градусник подрастает сам, как от крутки
            if (this.meterBump) this.meterBump();
        }
        if (this.coinIn && ok) this.coinIn();
    },
    // dy — сколько палец прошёл вниз, в единицах поля
    leverDrag(dy) {
        const L = this.LEVER, v = this._lv;
        if (!v || v.st !== 'drag') return;
        const x = Math.max(0, dy / L.travel) * L.teeth;
        if (x >= L.teeth) {                       // последний зубец — срыв
            this._lv = { st: 'free', p0: v.p, at: -1, p: v.p };
            this.leverBreak();
            return;
        }
        // Храповик: внутри зубца рычаг почти стоит и только в конце
        // проскакивает на следующий — упирается, а не ползёт за пальцем.
        const n = Math.floor(x), fr = x - n, e = fr * fr * fr * fr;
        // натяжение: два тихих щелчка внутри зубца
        const sub = n * 3 + Math.floor(fr * 3);
        if (sub > (v.sub || 0) && n === (v.n || 0) && typeof Haptics !== 'undefined') Haptics.tick();
        v.sub = Math.max(v.sub || 0, sub);
        if (n > (v.n || 0)) {
            // проскок зубца: жёстко и коротко, к концу — тяжелее
            if (typeof Haptics !== 'undefined') Haptics.burst('rigid', n >= 3 ? 2 : 1, 45);
            v.kickAt = performance.now();         // проскок зубца — рывок вперёд
            this.shake(v.kickAt, 1);              // и корпус вздрагивает
        }
        v.n = Math.max(v.n || 0, n);
        v.fr = fr;                                // натяжение внутри зубца
        v.p = L.breakAt * (n + e) / L.teeth;
    },
    leverRelease() {
        const v = this._lv;
        if (v && v.st === 'drag') {
            this._lv = { st: 'back', p0: v.p, at: -1, p: v.p };
            if (typeof Haptics !== 'undefined' && v.p > 0.02) Haptics.impact('soft', true);
        }
    },
    // Кадр. true — текстуры сменились, нужен проход шейдера.
    leverStep(now) {
        const v = this._lv;
        if (!v || !this.lever) return false;
        let swap = false;
        if (!this.leverCanvas.style.display || this.leverCanvas.style.display === 'none') {
            this.bindSet(this.lever.bare);
            this.leverCanvas.style.display = 'block';
            swap = true;
        }
        if (v.at === -1) v.at = now;
        const t = now - v.at, L = this.LEVER;
        let show = v.p;
        if (v.st === 'drag') {
            // Упирается: внутри зубца рычаг мелко дрожит от натяжения, тем
            // сильнее, чем ближе конец зубца. Проскочив зубец, дёргается
            // вперёд и сразу гасит рывок.
            const fr = v.fr || 0;
            show += 0.018 * fr * fr * Math.sin(now / 18);
            if (v.kickAt) {
                const d = now - v.kickAt;
                show += 0.07 * Math.exp(-d / 50) * Math.sin(d / 25);
            }
        } else if (v.st === 'free') {
            // Падает с разгоном, как под своим весом, проскакивает упор и
            // отскакивает от него — удар железа о железо.
            if (t < L.fall) {
                const u = t / L.fall;
                v.p = v.p0 + (1 + L.over - v.p0) * Math.pow(u, 2.2);
            } else {
                const b = t - L.fall;
                v.p = 1 + L.over * Math.exp(-b / 45) * Math.cos(b / 28 * Math.PI);
                if (!v.hit) { v.hit = now; this.leverImpact(now); }
            }
            show = v.p;
            // Палец ещё на экране — рычаг стоит внизу, пока его не отпустят.
            if (t > L.fall + L.hold && !this._held) this._lv = { st: 'back', p0: 1, at: now, p: 1 };
        } else if (v.st === 'back') {
            // пружина: медленнее, с перелётом назад и парой качаний
            // к концу качание гаснет в ноль плавно: иначе на переходе к
            // рычагу на шейдере он прыгал на последние градусы
            const fade = t < 700 ? 1 : Math.max(0, 1 - (t - 700) / 200);
            v.p = v.p0 * Math.exp(-t / L.back) * Math.cos(t / 115 * Math.PI / 2) * fade * fade;
            // Встал на место: пружина с разгону проходит точку покоя (первый
            // ноль косинуса) — удар покороче срыва, два удара вместо шести.
            // Только после полного рывка: недотянутый рычаг возвращается тихо.
            if (!v.home && t >= 115 && v.p0 > 0.5) {
                v.home = true;
                if (typeof Haptics !== 'undefined') Haptics.burst('heavy', 2, 40);
            }
            show = v.p;
            if (t > 900) {
                this._lv = null;
                this._leverIdle = true;
                this.tryReady();
                this.bindSet(this.tex);
                this.leverCanvas.style.display = 'none';
                return true;
            }
        }
        // Рукоять живая: на падении вытягивается по ходу и тащит за собой
        // смазанный след, на ударе сплющивается и качается, в пальцах — чуть
        // набухает. Скорость — по разнице кадров.
        const fx = { sx: 1, sy: 1, trail: [], dust: this._dust };
        const vel = v.prevAt != null && now > v.prevAt ? (show - v.prevShow) / (now - v.prevAt) : 0;
        v.prevShow = show; v.prevAt = now;
        if (v.st === 'drag') { fx.sx = fx.sy = 1.05; }
        if (v.st === 'free' && !v.hit && vel > 0) {
            const st = Math.min(0.22, vel * 50);
            fx.sy = 1 + st; fx.sx = 1 - st * 0.45;
            v.hist = (v.hist || []).concat([show]).slice(-4);
            fx.trail = v.hist.slice(0, -1);
        }
        if (v.hit) {
            const b = now - v.hit, q = 0.24 * Math.exp(-b / 70) * Math.cos(b / 45 * Math.PI);
            fx.sx = 1 + q; fx.sy = 1 - q;
        }
        this.drawLever(show, fx);
        return swap;
    },
    // Удар о нижний упор. Отдаётся всему аппарату: корпус трясёт, висящая
    // лампа и кончик нитки получают толчок и раскачиваются по своей
    // физике, лампы на полке разом вспыхивают — скачок тока от рычага, —
    // из-под юбки выдыхает облачко пыли.
    leverImpact(now) {
        this.shake(now, 4.5);
        // упор без своей отдачи: в это время ещё идёт очередь срыва, и
        // лишний удар смазывал бы её
        (this._hangs || []).forEach((h, j) => h.v.forEach((_, i) => { h.v[i] += (j ? -0.05 : 0.09) * (i + 1) / h.n; }));
        if (this.ragKick) this.ragKick(1);
        if (this.meterKick) this.meterKick(1);
        this.GLOW_ORDER.forEach(k => { this.glow[k] = Math.max(this.glow[k], 0.9); });
        const rnd = GreedJunk.rng(Math.floor(now));
        this._dust = { at: now, parts: Array.from({ length: 10 }, (_, i) => {
            const side = i % 2 ? 1 : -1;
            return { vx: side * (0.015 + rnd() * 0.02), vy: -(0.005 + rnd() * 0.02), r: 1.2 + rnd() * 1.8, x: side * (8 + rnd() * 6) };
        }) };
    },
    // тряска корпуса: amp — в пикселях экрана, затухает за треть секунды
    shake(now, amp) { this._shake = { at: now, amp }; },
    shakeStep(now) {
        const S = this._shake;
        if (!S || !this.wrapEl) return;
        const d = now - S.at;
        if (d > 360) { this._shake = null; this.wrapEl.style.transform = ''; return; }
        const a = S.amp * Math.exp(-d / 80);
        this.wrapEl.style.transform = `translate(${(a * Math.sin(d / 14)).toFixed(2)}px, ${(a * 0.7 * Math.cos(d / 11)).toFixed(2)}px)`;
    },

    // части по геометрии рывка: каждая — масштаб вокруг своей точки
    drawLever(p, fx) {
        fx = fx || { sx: 1, sy: 1, trail: [] };
        const L = this.lever, C = this.LEVER_CROP, S = this.SCALE;
        const G0 = GreedJunk.leverGeom(0), G = GreedJunk.leverGeom(p), kx = G0.K.x;
        const ctx = this.leverCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.leverCanvas.width, this.leverCanvas.height);
        // (x0, y0) части в покое → (x1, y1) сейчас, масштаб sx, sy
        const place = (x0, y0, x1, y1, sx, sy, dx, dy) => ctx.setTransform(sx, 0, 0, sy,
            ((x1 - C.x) - (x0 - C.x) * sx + (dx || 0)) * S, ((y1 - C.y) - (y0 - C.y) * sy + (dy || 0)) * S);
        const kb = G.h0 / G0.h0, ks = (G.top - G.s0) / (G0.top - G0.s0), kk = G.K.r / G0.K.r;
        const pose = {
            boot: [kx, G0.base, kx, G.base, G.bootW, kb],
            frame: [kx, 0, kx, 0, 1, 1],
            shaft: [kx, G0.top, kx, G.top, 1, ks],
            clamp: [kx, G0.top, kx, G.top, 1, 1],
            knob: [kx, G0.K.y, kx, G.K.y, kk * fx.sx, kk * fx.sy]
        };
        // смазанный след рукояти — её прошлые положения, бледнее и бледнее
        fx.trail.forEach((tp, i) => {
            const T = GreedJunk.leverGeom(tp), k = T.K.r / G0.K.r;
            ctx.globalAlpha = 0.12 + 0.1 * i;
            place(kx, G0.K.y, kx, T.K.y, k, k);
            ctx.drawImage(L.sprites.knob, 0, 0);
        });
        ctx.globalAlpha = 1;
        // тени: от света вправо-вниз, дальше у того, что ближе к игроку
        const lift = { boot: 1, frame: 0.6, shaft: 2 + 3 * G.sn, clamp: 1.5 + 2 * G.sn, knob: 3 + 5 * G.sn };
        ctx.globalAlpha = 0.3;
        GreedJunk.LEVER_ORDER.forEach(k => {
            const a = pose[k], d = Math.max(0.5, lift[k]);
            place(a[0], a[1], a[2], a[3], a[4], a[5], d * 0.63, d * 0.77);
            ctx.drawImage(L.shadows[k], 0, 0);
        });
        ctx.globalAlpha = 1;
        GreedJunk.LEVER_ORDER.forEach(k => {
            const a = pose[k];
            place(a[0], a[1], a[2], a[3], a[4], a[5]);
            ctx.drawImage(L.sprites[k], 0, 0);
        });
        // Схема передач — поверх шара, по углу его поворота: картинка шара
        // для рывка снята без неё (схема крутится, блик света — нет).
        {
            const J = PALETTE.greedJunk, cy = G.K.y;
            const KP = GreedJunk.knobPattern(kx, cy, G.K.r, GreedJunk.KNOB_PHI + p * GreedJunk.LEVER_TILT);
            const X = (q) => kx + (q[0] - kx) * fx.sx, Y = (q) => cy + (q[1] - cy) * fx.sy;
            ctx.setTransform(S, 0, 0, S, -C.x * S, -C.y * S);
            ctx.strokeStyle = J.paint.cream; ctx.fillStyle = J.paint.cream;
            ctx.lineWidth = STROKE.structure; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            KP.lines.forEach(l => {
                ctx.beginPath();
                l.forEach((q, i) => i ? ctx.lineTo(X(q), Y(q)) : ctx.moveTo(X(q), Y(q)));
                ctx.stroke();
            });
            KP.dots.forEach(d => { ctx.beginPath(); ctx.arc(X(d), Y(d), d[2], 0, Math.PI * 2); ctx.fill(); });
        }
        // облачко пыли из-под юбки: разлетается в стороны, тает
        const D = fx.dust;
        if (D) {
            const d = performance.now() - D.at;
            if (d < 520) {
                ctx.setTransform(S, 0, 0, S, -C.x * S, -C.y * S);
                ctx.fillStyle = PALETTE.greedJunk.chip.hi;
                D.parts.forEach(q => {
                    ctx.globalAlpha = 0.55 * (1 - d / 520);
                    ctx.beginPath();
                    ctx.arc(kx + q.x + q.vx * d, G.base - 1 + q.vy * d, q.r * (1 + d / 260), 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
            } else this._dust = null;
        }
    },

    // ---------- МИГАНИЕ ПРИ ВЫИГРЫШЕ ----------
    // blink() — выигрыш: огонёк бежит по лампам слева направо три круга,
    // потом все разом мигают дважды. Накал не прыгает: нить разгорается
    // быстро, а гаснет медленнее (остывает, краснея), — по этому лампа
    // накаливания и отличается от светодиода. Часы — отметка кадра
    // requestAnimationFrame: это анимация, а не состояние игры.
    GLOW_ORDER: ['pear', 'flame', 'red', 'globe'],
    CHASE: { step: 110, rounds: 3, flash: 220, flashes: 2 },
    glow: { pear: 0, flame: 0, red: 0, globe: 0 },
    blink() { this._blinkAt = -1; },
    glowStep(now) {
        if (this._blinkAt === -1) this._blinkAt = now;
        const C = this.CHASE, O = this.GLOW_ORDER, t = this._blinkAt == null ? Infinity : now - this._blinkAt;
        const chase = C.step * O.length * C.rounds;
        O.forEach((k, i) => {
            let on = false;
            if (t < chase) on = Math.floor(t / C.step) % O.length === i;
            else if (t < chase + C.flash * 2 * C.flashes) on = Math.floor((t - chase) / C.flash) % 2 === 0;
            const v = this.glow[k];
            this.glow[k] = on ? v + (1 - v) * 0.55 : (v < 0.01 ? 0 : v * 0.82);
        });
        return this.glow;
    },

    // ---------- ПРЕВЬЮ ИЗ ОТЛАДКИ ----------
    // 🐞 → «Аппарат»: корпус на весь экран, свет от наклона. Тап — закрыть.
    // Корпус в игру ещё не встроен, а свет надо проверить на телефоне.
    // Без видеокарты показывается рисунок с нарисованным светом.
    // Готовность (зелёная лампа): рычаг вернулся, барабаны стоят и игра не
    // занята выплатой (canReady). Зовётся и рычагом, и барабанами, и игрой.
    canReady: null,
    tryReady() {
        if (this.ready || this._lv || this.spinning()) return;
        if (this.canReady && !this.canReady()) return;
        this.setReady(true);
    },

    // ---------- АППАРАТ В КОНТЕЙНЕР ----------
    // Собирается ОДИН раз (растр корпуса шейдером — секунды), дальше обёртка
    // просто переезжает в новый контейнер: превью из отладки и экран игры —
    // один и тот же аппарат. opts.onPull — игра решает исход рывка (вернуть
    // false — крутки нет); без него превью крутит случайно. opts.onSpinDone
    // — барабаны встали (keys — символы под ниткой); opts.canReady — можно ли
    // зажечь готовность. Возвращает обещание: аппарат нарисован.
    mount(container, opts) {
        opts = opts || {};
        this.onPull = opts.onPull || null;
        this.onSpinDone = opts.onSpinDone || null;
        this.canReady = opts.canReady || null;
        if (this.wrapEl) {
            container.appendChild(this.wrapEl);
            this.fit(container);
            if (this.gl && this._glCanvas) this.run(this._glCanvas);
            this.tryReady();
            return this._mountP;
        }
        const wrap = document.createElement('div');
        this.wrapEl = wrap;
        wrap.style.cssText = 'position:relative;flex:none';
        container.appendChild(wrap);
        this.fit(container);
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0';
        wrap.appendChild(canvas);
        this._glCanvas = canvas;
        // Холст движущегося рычага — над его участком корпуса. Фон снят
        // явно: общий style.css красит ВСЕ canvas непрозрачным цветом, и
        // холст закрывал участок сплошным прямоугольником — за рычагом
        // «пропадал» корпус (отладкой на iPhone: карты целы, виноват фон).
        const C = this.LEVER_CROP, lv = document.createElement('canvas');
        lv.width = C.w * this.SCALE; lv.height = C.h * this.SCALE;
        lv.style.cssText = `position:absolute;left:${C.x / GreedJunk.W * 100}%;top:${C.y / GreedJunk.H * 100}%;` +
            `width:${C.w / GreedJunk.W * 100}%;height:${C.h / GreedJunk.H * 100}%;z-index:1;display:none;pointer-events:none;background:none`;
        wrap.appendChild(lv);
        this.leverCanvas = lv;
        if (this.trayMount) this.trayMount(wrap);
        if (this.ragMount) this.ragMount(wrap);
        if (this.coinMount) this.coinMount(wrap);
        if (this.meterMount) this.meterMount(wrap);
        if (this.jarMount) this.jarMount(wrap);
        if (this.wheelMountLit) this.wheelMountLit(wrap);
        // рычаг пальцем: взялся — тянешь вниз; короткий тап — рывок целиком
        const field = (e) => {
            const r = wrap.getBoundingClientRect();
            return [(e.clientX - r.left) / r.width * GreedJunk.W, (e.clientY - r.top) / r.height * GreedJunk.H];
        };
        let grab = null;
        wrap.addEventListener('pointerdown', (e) => {
            const [x, y] = field(e);
            if (!(x > 300 && y > 262 && y < 400) || this._lv || !this.ready) return;
            e.preventDefault();
            e.stopPropagation();
            wrap.setPointerCapture(e.pointerId);
            grab = { y, at: Date.now(), moved: 0 };
            this._held = true;
            this.leverState('drag', 0);
            if (typeof Haptics !== 'undefined') Haptics.tick();
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!grab) return;
            const dy = field(e)[1] - grab.y;
            grab.moved = Math.max(grab.moved, Math.abs(dy));
            this.leverDrag(dy);
        });
        const up = () => {
            if (!grab) return;
            const tap = grab.moved < 4 && Date.now() - grab.at < 350;
            grab = null;
            this._held = false;
            if (tap && this._lv && this._lv.st === 'drag') { this._lv = null; this.pull(); }
            else this.leverRelease();
        };
        wrap.addEventListener('pointerup', up);
        wrap.addEventListener('pointercancel', up);
        wrap.style.touchAction = 'none';
        const live = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        live.setAttribute('viewBox', `0 0 ${GreedJunk.W} ${GreedJunk.H}`);
        live.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
        wrap.appendChild(live);
        this.live = live;
        this._mountP = (async () => {
            let ok = false;
            // тряпка на свету — своя картинка поверх корпуса (greed-junk-lit-rag.js)
            GreedJunk.ragApart = !!this.ragMount;
            GreedJunk.wheelApart = !!this.wheelMountLit;
            try { ok = await this.init(canvas); } catch (e) { console.warn('[Аппарат] свет шейдером не собрался', e); }
            if (!ok) {
                GreedJunk.ragApart = false;
                GreedJunk.wheelApart = false;
                wrap.innerHTML = GreedJunk.bodySvg('baked').replace('<svg ', '<svg style="position:absolute;inset:0;width:100%;height:100%" ');
                return false;
            }
            this.draw();
            this.run(canvas);
            return true;
        })();
        return this._mountP;
    },
    // Размер по контейнеру с пропорцией корпуса. clientWidth, а не
    // getBoundingClientRect: окно мини-игры масштабирует тело трансформом,
    // и видимый размер уже уменьшен — мерили бы дважды.
    fit(container) {
        const W = GreedJunk.W, H = GreedJunk.H, cw = container.clientWidth, ch = container.clientHeight;
        if (!cw || !ch || !this.wrapEl) return;
        const k = Math.min(cw / W, ch / H);
        this.wrapEl.style.width = (W * k).toFixed(1) + 'px';
        this.wrapEl.style.height = (H * k).toFixed(1) + 'px';
    },

    // ---------- ПРЕВЬЮ ИЗ ОТЛАДКИ ----------
    // Тот же аппарат, что в игре, во весь экран; исход крутки — случайный.
    async preview() {
        const old = document.getElementById('gj-preview');
        if (old) { old.remove(); return; }
        const host = document.getElementById('game-container') || document.body;
        const box = document.createElement('div');
        box.id = 'gj-preview';
        box.style.cssText = 'position:absolute;inset:0;z-index:100001;display:flex;align-items:center;' +
            'justify-content:center;background:' + PALETTE.greedJunk.hole;
        // тап по полке с лампами — мигание выигрыша, по рычагу — рывок,
        // в любом другом месте — закрыть
        box.addEventListener('click', (e) => {
            const r = (this.live && this.live.getBoundingClientRect()) || { left: 0, top: 0, width: 1, height: 1 };
            const y = (e.clientY - r.top) / r.height * GreedJunk.H;
            const x = (e.clientX - r.left) / r.width * GreedJunk.W;
            const Wh = GreedJunk.SLOTS.wheel, onWheel = this._wheel && Math.hypot(x - Wh.cx, y - Wh.cy) < GreedJunk.WHEEL.rEdge;
            if (y > 440 && y < 520) this.blink();
            else if (x > 300 && y > 262 && y < 400) { /* рычаг — своими событиями */ }
            else if (onWheel) { /* колесо — своими событиями */ }
            else box.remove();
        });
        host.appendChild(box);
        return this.mount(box);
    },

    // region — перерисовать только участок поля {x, y, w, h} (барабаны на ходу)
    draw(light, region) {
        const gl = this.gl, p = this.prog;
        if (!gl) return;
        if (region) {
            const S = this.SCALE;
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(region.x * S, (GreedJunk.H - region.y - region.h) * S, region.w * S, region.h * S);
        } else gl.disable(gl.SCISSOR_TEST);
        const L = light || this.LIGHT;
        const n = Math.hypot(L[0], L[1], L[2]) || 1;
        gl.viewport(0, 0, this.size[0], this.size[1]);
        gl.useProgram(p);
        ['uA', 'uH', 'uM', 'uS', 'uK'].forEach((u, i) => gl.uniform1i(gl.getUniformLocation(p, u), i));
        // барабаны: окна по поверхности ленты (drum в рисунке — на 1 внутри
        // окна), смещение ленты каждого барабана, размытие на ходу
        const G = GreedJunk, C = G.CELL, W = G.W, H = G.H;
        G.SLOTS.reels.forEach((r, i) => gl.uniform4f(gl.getUniformLocation(p, 'uReel' + i), (r.x + 1) / W, (r.y + 1) / H, (r.w - 2) / W, (r.h - 2) / H));
        const R = this.reels || [0, 1, 2].map(() => ({ s: C.h / 2, blur: 0 }));
        gl.uniform3f(gl.getUniformLocation(p, 'uOff'), ...R.map(r => r.s));
        gl.uniform3f(gl.getUniformLocation(p, 'uBlur'), ...R.map(r => r.blur));
        gl.uniform1f(gl.getUniformLocation(p, 'uLen'), G.REEL_STRIP.length * C.h);
        // радиус барабана: в окне видна дуга ±60° — 47 единиц половины окна
        gl.uniform1f(gl.getUniformLocation(p, 'uDrumR'), 47 / Math.sin(Math.PI / 3));
        gl.uniform1f(gl.getUniformLocation(p, 'uFieldH'), H);
        const cr = PALETTE.greedJunk.paint.cream;
        gl.uniform3f(gl.getUniformLocation(p, 'uCream'), ...[1, 3, 5].map(k => parseInt(cr.slice(k, k + 2), 16) / 255));
        gl.uniform2f(gl.getUniformLocation(p, 'uTex'), 1 / this.size[0], 1 / this.size[1]);
        gl.uniform3f(gl.getUniformLocation(p, 'uL'), L[0] / n, L[1] / n, L[2] / n);
        // крутизна — под шкалу карты высот: при шкале 24 было 9
        gl.uniform1f(gl.getUniformLocation(p, 'uRelief'), 9.0 * GreedJunk.HMAX / 24);
        gl.uniform2f(gl.getUniformLocation(p, 'uHMap'), GreedJunk.H0, GreedJunk.HMAX);
        gl.uniform1f(gl.getUniformLocation(p, 'uPxPerH'), GreedJunk.HMAX * this.SCALE);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
};
