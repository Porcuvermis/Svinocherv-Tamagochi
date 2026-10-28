// ================= АППАРАТ АЛЧНОСТИ: СВЕТ СЦЕНЫ =================
// Продолжение GreedJunkLit. Свет как режиссёр (docs/plan/30-greed-light.md):
// сцена в полутени гаража, игровые места светятся сами или стоят под
// лампой. Было — шейдеры нормировали свет так, что ровная поверхность
// показывала ровно свой цвет, и ярче всего на аппарате было то, что светлее
// покрашено (пустая колба, стикер, сосна), а барабаны и рычаг терялись.
//
// Свет двух родов.
//
// 1. Карта (текстура на всё поле, тексел — CELL единиц, один раз при
//    сборке): R — рассеянный свет места (во сколько раз светлее краски:
//    R × KMAX), G — тёплое свечение, B — холодное. Это то, что светится
//    САМО: ленты барабанов на лампочках, поле пачинко на трубке, кнопка
//    запуска. Свечение не знает направления — так и надо: светится вещь.
//
// 2. Источники (LIGHTS): у каждого место над сценой, цвет, спад с
//    расстоянием; у прожектора ещё и конус. Свет считается по нормали —
//    шар рычага горит бликом с той стороны, откуда бьёт прожектор, рёбра
//    гофры светлеют с одного бока, пятно на доске вытянуто по лучу, рычаг
//    кладёт от прожектора свою тень. Было (первая попытка): «светлее здесь»
//    пятнами в карте — свет без источника, пятно по контуру колеса, пятно
//    на рычаге; игрок: «выглядит как баг, а не подсветка».
//
// Плёнка с дырками поверх аппарата отвергнута: гасит блики и края самих
// игр, а режим наложения на iOS дорогой.
Object.assign(GreedJunkLit, {

    KEY: {
        CELL: 3,
        KMAX: 2,
        // Рассеянный свет гаража. Сверху светлее (лампа над аппаратом),
        // к низу и к краям — гуще: глаз сам идёт сверху вниз к табло.
        // Было 0.58 ровно — всё, что не под лампой, проваливалось в черноту.
        base: 0.72, baseLow: 0.66, edge: 0.06,
        warm: [1.0, 0.72, 0.38],           // лампы накаливания
        cool: [0.62, 0.82, 1.0],           // трубка дневного света
        // три лампочки в коробе барабанов: середина окна, спад к краям
        reel: { k: 0.15, warm: 0.95, rx: 0.75, ry: 0.62 },
        // поле пачинко светится за стеклом: сверху ярче (трубка под верхней
        // кромкой), книзу и к стенкам спадает — ровная заливка выглядела
        // плоской (игрок: «в кадре плосковато»)
        // k < 0: рассеянный гаража в коробе гаснет — поле светит своей
        // трубкой, а не общим светом; edge — спад света к стенкам кожуха
        pach: { k: -0.2, cool: 0.62, coolLow: 0.12, feather: 5, edge: 16 },
        // кнопка запуска — с подсветкой изнутри, как у игровых автоматов
        button: { r: 11, warm: 0.55 },
        // ореол лампы над рычагом на корпусе и коробе (сама лампа с колбой —
        // рисунком поверх, GreedJunk.leverLampSvg)
        leverLamp: { x: 314, y: 283, rx: 22, ry: 12, warm: 0.45 },
        // «отрицательная заливка» за рычагом: доска справа и полоса над
        // коробом гуще, чтобы освещённый рычаг читался силуэтом
        leverFlag: { x: 315, y: 335, rx: 42, ry: 72, k: -0.3 },
        // слои поверх корпуса (свои холсты): ряд 2 — результат. Жидкость
        // колбы и летящая монета — без фильтра: светится только столбик.
        overlay: { tray: 0.9, jar: 0.95 }
    },

    // Источники. Место — в единицах поля (z — к зрителю над задней
    // стенкой), r — расстояние, на котором свет слабеет вдвое, rgb — цвет с
    // силой. Ровно четыре: столько ждёт шейдер.
    LIGHTS: [
        // 0. Рычаг — вещь на витрине: лампа в металлическом плафоне под
        // коробом пачинко прямо над шаром (GreedJunk.leverLamp), бьёт сверху
        // вниз; место — колба лампы, чуть вперёд от стены. На глянцевом шаре —
        // корона блика, книзу шар уходит в темноту; каждое ребро гофры ловит
        // свет верхней гранью — ритм полос; под рычагом лужица света на
        // коробе, тень рычага падает вниз. Колба светится (KEY.leverLamp),
        // фон справа нарочно гуще
        // (KEY.leverFlag), чтобы рычаг стоял светлым силуэтом на тёмном.
        // Было: лампа «спрятана под кромкой» — свет есть, источника нет,
        // игрок: «выглядит странно». Ещё раньше: прожектор сбоку справа — он ярче всего
        // светил на сосновую доску за рычагом, и рычаг выходил тёмной
        // вырезкой на светлом фоне; свет без идеи и без источника.
        // barn — шторки: эллипс на стене (центр, полуоси), за ним свет гаснет,
        // чтобы лужица не растекалась на окно барабанов.
        // dif/spec — доли рассеянного и блика. Шар и гофра тёмные: рассеянный
        // свет на них почти не виден, а стену за ними заливал ярче самого
        // рычага — рычаг выходил тёмной вырезкой на светлом. Тёмную
        // глянцевую вещь показывают бликами: рассеянного мало, блика много.
        { x: 314, y: 284, z: 30, r: 110, rgb: [3.0, 2.1, 1.25], at: [314, 372, 6], inner: 20, outer: 42,
          barn: [314, 350, 24, 74], dif: 0.22, spec: 2.4 },
        // 1. Лампа с абажуром над верхним ящиком: круг света на колесе,
        // края круга уходят на доски и на кожух пачинко — не по контуру
        // колеса. Было: колесо светлее досок ровно по своему краю — «моделька
        // с другим освещением».
        { x: 110, y: 100, z: 210, r: 260, rgb: [0.62, 0.56, 0.46], at: [105, 125, 0], inner: 16, outer: 40 },
        // 2. Трубка в коробе пачинко: выбивается из-под стекла на внутренние
        // стенки кожуха — холодный отсвет по кромкам.
        { x: 271, y: 50, z: 4, r: 80, rgb: [0.24, 0.34, 0.46] },
        // 3. Лампочки барабанов: тот же тёплый свет выходит из окна на скос
        // короба — у окна краска короба теплеет.
        { x: 180, y: 388, z: 2, r: 70, rgb: [0.55, 0.36, 0.16] }
    ],

    // Рассеянный, тёплый и холодный свет в точке поля.
    keyAt(x, y) {
        const K = this.KEY, G = GreedJunk;
        const ss = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
        const v = (y - G.Y0) / G.H, ex = Math.min(x - 21, 339 - x);
        let k = K.base + (K.baseLow - K.base) * ss(v) - K.edge * (1 - ss(ex / 60)), w = 0, c = 0;
        // барабаны: эллипс на окно, как лампочка за лентой
        G.SLOTS.reels.forEach(r => {
            const dx = (x - (r.x + r.w / 2)) / (r.w / 2 + 4), dy = (y - (r.y + r.h / 2)) / (r.h / 2 + 4);
            const d = Math.hypot(dx * K.reel.rx, dy * K.reel.ry);
            const s = ss(1.15 - d * 1.15);
            k += K.reel.k * s; w += K.reel.warm * s;
        });
        const Lf = K.leverFlag, Ll = K.leverLamp;
        k += Lf.k * ss(1 - Math.hypot((x - Lf.x) / Lf.rx, (y - Lf.y) / Lf.ry));
        w += Ll.warm * ss(1 - Math.hypot((x - Ll.x) / Ll.rx, (y - Ll.y) / Ll.ry));
        if (G.pachinkoShown && G.pachinkoShown()) {
            const R = G.pachGlassRect(), [x0, y0] = G.pachPt(R.x0, R.y0), [x1, y1] = G.pachPt(R.x1, R.y1);
            const f = K.pach.feather, e = Math.min(x - x0, x1 - x, y - y0, y1 - y);
            const s = ss(e / f + 0.5), t = ss((y - y0) / (y1 - y0)), se = 0.55 + 0.45 * ss(e / K.pach.edge);
            k += K.pach.k * s; c += (K.pach.cool + (K.pach.coolLow - K.pach.cool) * t) * s * se;
            const B = G.PACH.button, [bx, by] = G.pachPt(B.x, B.y);
            w += K.button.warm * ss(1 - Math.hypot(x - bx, y - by) / K.button.r);
        }
        return [k, w, c];
    },

    // Карта в холст: поле W×H (от Y0), тексел — CELL единиц.
    keyCanvas() {
        if (this._keyCv) return this._keyCv;
        const G = GreedJunk, K = this.KEY, cw = Math.ceil(G.W / K.CELL), ch = Math.ceil(G.H / K.CELL);
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const g = cv.getContext('2d'), im = g.createImageData(cw, ch), b = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
            const [k, w, c] = this.keyAt((i + 0.5) * K.CELL, G.Y0 + (j + 0.5) * K.CELL), o = (j * cw + i) * 4;
            im.data[o] = b(k / K.KMAX); im.data[o + 1] = b(w); im.data[o + 2] = b(c); im.data[o + 3] = 255;
        }
        g.putImageData(im, 0, 0);
        return (this._keyCv = cv);
    },

    // Источники в шейдере: общий кусок для корпуса и прибора. Точка p и
    // места источников — в сотнях единиц поля (mediump держит). Спад —
    // 1/(1 + (d/r)²): мягче обратного квадрата, без чёрной дыры за радиусом.
    // Рассеянный с «обёрткой» 0.15: свет чуть заходит за терминатор — у
    // шара мягкая граница света, как у настоящего, а не срез.
    lightsGlsl() {
        return `
            uniform vec3 uLP[4], uLC[4];
            uniform float uLR[4];
            uniform vec3 uSD[4]; uniform vec2 uSC[4];   // конус: ось, cos внешнего и внутреннего
            uniform vec3 uField;      // (W, H, Y0) поля
            uniform vec4 uBarn;       // шторки прожектора 0: центр и полуоси
            uniform vec2 uW0;         // источник 0: доля рассеянного и блика
            void localLights(vec3 p, vec3 n, float shin, out vec3 dif, out vec3 spe, out float spot) {
                dif = vec3(0.0); spe = vec3(0.0); spot = 0.0;
                for (int i = 0; i < 4; i++) {
                    vec3 d = uLP[i] - p;
                    float dist = length(d);
                    vec3 l = d / max(dist, 0.001);
                    float att = 1.0 / (1.0 + dist * dist / (uLR[i] * uLR[i]));
                    att *= smoothstep(uSC[i].x, uSC[i].y, dot(-l, uSD[i]));
                    if (i == 0) { att *= smoothstep(1.0, 0.55, length((p.xy - uBarn.xy) / uBarn.zw)); spot = att; }
                    vec3 e = uLC[i] * att;
                    vec2 w = i == 0 ? uW0 : vec2(1.0);
                    dif += e * w.x * max((dot(n, l) + 0.15) / 1.15, 0.0);
                    // острый блик и широкий отсвет вокруг: одним острым шар
                    // горел точкой, глянец читался как пятнышко
                    float nh = max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0);
                    spe += e * w.y * (pow(nh, shin) + 0.22 * pow(nh, 5.0));
                }
            }`;
    },
    lightsBind(gl, p) {
        const G = GreedJunk, L = this.LIGHTS, u = (n) => gl.getUniformLocation(p, n);
        gl.useProgram(p);
        gl.uniform3fv(u('uLP'), L.flatMap(s => [s.x / 100, s.y / 100, s.z / 100]));
        gl.uniform3fv(u('uLC'), L.flatMap(s => s.rgb));
        gl.uniform1fv(u('uLR'), L.map(s => s.r / 100));
        // без конуса — ось любая, косинусы −2…−1: smoothstep даёт 1 везде
        const cone = L.map(S => {
            if (!S.at) return { d: [0, 0, 1], c: [-2, -1] };
            const d = [S.at[0] - S.x, S.at[1] - S.y, S.at[2] - S.z], n = Math.hypot(...d);
            return { d: d.map(v => v / n), c: [Math.cos(S.outer * Math.PI / 180), Math.cos(S.inner * Math.PI / 180)] };
        });
        gl.uniform3fv(u('uSD'), cone.flatMap(c => c.d));
        gl.uniform2fv(u('uSC'), cone.flatMap(c => c.c));
        gl.uniform3f(u('uField'), G.W, G.H, G.Y0);
        const B = L[0].barn || [0, 0, 1e4, 1e4];
        gl.uniform4f(u('uBarn'), B[0] / 100, B[1] / 100, B[2] / 100, B[3] / 100);
        gl.uniform2f(u('uW0'), L[0].dif ?? 1, L[0].spec ?? 1);
    },

    // Карта в текстуру unit, плюс общие числа шейдеру p (uKey, uKMax,
    // uWarm, uCool) и источники.
    keyBind(gl, p, unit) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.keyCanvas());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const K = this.KEY;
        gl.useProgram(p);
        gl.uniform1i(gl.getUniformLocation(p, 'uKey'), unit);
        gl.uniform1f(gl.getUniformLocation(p, 'uKMax'), K.KMAX);
        gl.uniform3f(gl.getUniformLocation(p, 'uWarm'), ...K.warm);
        gl.uniform3f(gl.getUniformLocation(p, 'uCool'), ...K.cool);
        this.lightsBind(gl, p);
        // Активным оставить unit 0: следующая createTexture + bindTexture
        // (deviceSet) иначе села бы в unit карты и подменила её — колесо и
        // пачинко выходили чёрными.
        gl.activeTexture(gl.TEXTURE0);
        return t;
    },

    // Прибор: где на поле лежит его холст (rect в единицах поля), чтобы
    // точка холста нашла себя на карте света и среди источников.
    deviceKey(Q, rect) {
        const G = GreedJunk;
        Q.lm = [rect.x / G.W, (rect.y - G.Y0) / G.H, rect.w / G.W, rect.h / G.H];
        this.keyBind(Q.gl, Q.pr, 4);
        Q.gl.uniform4f(Q.U.uLmR, ...Q.lm);
        Q.gl.uniform2f(Q.gl.getUniformLocation(Q.pr, 'uHMap'), G.H0, G.HMAX);
    },

    // Слой поверх корпуса своим холстом (лоток, банка): шейдером света он
    // не читает — та же полутень фильтром яркости, один раз. Своя доля из
    // KEY.overlay: это ряд 2.
    keyOverlay(el, kind) {
        if (el) el.style.filter = `brightness(${this.KEY.overlay[kind]})`;
    }
});
