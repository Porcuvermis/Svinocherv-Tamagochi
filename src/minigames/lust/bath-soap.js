// ================= МЫЛО: ЛЕСТНИЦА ВИДА =================
// Мыло прокачивает ширину мазка и долготу чистоты, и с каждой покупкой
// меняется сам ПРЕДМЕТ, а не оттенок: засохший обмылок → брусок → флакон →
// колба → хрустальный флакон (docs/plan/21-lust-bath.md, разд. 5в).
//
// Одна вещь в трёх местах: на полке, в руке и на иконке магазина. Поэтому
// предмет рисуется в координатах СЦЕНЫ вокруг гнезда мыла, как рисовался
// запечённый брусок: рука (BATH_ART.held) и иконка сдвигают его на гнездо
// сами и ничего не знают о ступенях.
//
// Гнездо и зона захвата не двигаются от ступени — меняется только картинка.

// ================= НЕБО ЗА ВОЛШЕБНЫМ ФЛАКОНОМ =================
// Чистая функция: рисует две картинки неба (дальнюю и ближнюю) и ничего не
// берёт снаружи — ни палитру, ни шум, ни DOM. Поэтому её же текст уходит в
// фоновый поток (Worker + OffscreenCanvas): растр неба — десятки и сотни
// миллисекунд, и в основном потоке это заминка при входе в ванную.
//   mk(w, h) — фабрика холста; a — { T, C, seed }.
function bathSkyPaint(mk, a) {
    const T = a.T, C = a.C, D = C.deep;
    let seed = a.seed >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const rgba = (hex, al) => {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${al})`;
    };
    const canvas = (px) => {
        const cv = mk(Math.round(T.w * px), Math.round(T.h * px));
        const g = cv.getContext('2d');
        g.scale(px, px); g.translate(-T.x, -T.y);
        return [cv, g];
    };
    const blob = (g, x, y, r, col, al) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rgba(col, al)); gr.addColorStop(0.5, rgba(col, al * 0.45)); gr.addColorStop(1, rgba(col, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    // Кривая, вдоль которой лежат туманность, пыль и Млечный путь.
    const curve = (x0, y0, x1, y1, bend, t) => {
        const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend, u = 1 - t;
        return [u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1];
    };
    const X0 = T.x, Y0 = T.y, X1 = T.x + T.w, Y1 = T.y + T.h;

    // ---- мягкое: тон неба, туманности, пыль — на маленьком холсте ----
    // Мягкое по природе рисуется в низком разрешении и растягивается: на
    // полном сотни крупных размытых пятен стоили основное время растра.
    const [low, gl] = canvas(0.6);
    gl.fillStyle = D[0]; gl.fillRect(X0, Y0, T.w, T.h);
    // Тональные облака глубины: космос не ровно-чёрный.
    for (let i = 0; i < 22; i++) blob(gl, X0 + rnd() * T.w, Y0 + rnd() * T.h, 90 + rnd() * 170, rnd() < 0.5 ? D[1] : D[2], 0.5 + rnd() * 0.3);
    // Млечный путь — диагональная полоса, где светлее и звёзд больше.
    const band = (t) => curve(X0 - 40, Y1 - 160, X1 + 40, Y0 + 220, 0.12, t);
    gl.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 90; i++) { const [x, y] = band(rnd()); blob(gl, x + (rnd() - 0.5) * 70, y + (rnd() - 0.5) * 70, 30 + rnd() * 60, D[3], 0.09); }
    // Туманности — волокна из облачков вдоль кривых, разных тонов.
    const fil = (x0, y0, x1, y1, bend, col, n, al) => {
        for (let i = 0; i < n; i++) {
            const [x, y] = curve(x0, y0, x1, y1, bend, rnd());
            blob(gl, x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40, 14 + rnd() * 46, col, al * (0.5 + rnd()));
        }
    };
    fil(X0, 180, 330, 40, 0.25, C.pink, 70, 0.07);
    fil(40, 620, X1, 360, -0.2, C.cyan, 70, 0.06);
    fil(-20, 420, 300, 520, 0.3, C.violet, 50, 0.06);
    fil(120, Y1, 420, 700, 0.2, C.pink, 50, 0.06);
    fil(200, Y0, 60, 260, -0.3, C.cyan, 45, 0.05);
    gl.globalCompositeOperation = 'source-over';
    // Пыль — тёмные прожилки поверх свечения: без них туманность плоская.
    const dust = (x0, y0, x1, y1, bend, n) => {
        for (let i = 0; i < n; i++) {
            const [x, y] = curve(x0, y0, x1, y1, bend, rnd());
            blob(gl, x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16, 8 + rnd() * 20, C.dust, 0.35);
        }
    };
    dust(X0, 230, 360, 90, 0.2, 90);
    dust(60, 600, X1, 400, -0.15, 90);
    dust(150, Y1 - 60, 430, 740, 0.25, 60);

    // ---- резкое: на полном разрешении ----
    const [far, gf] = canvas(T.px);
    gf.imageSmoothingEnabled = true;
    gf.drawImage(low, T.x, T.y, T.w, T.h);
    // Далёкие галактики — крошечные светлые пятнышки-эллипсы.
    for (let i = 0; i < 9; i++) {
        const x = X0 + rnd() * T.w, y = Y0 + rnd() * T.h;
        gf.save(); gf.translate(x, y); gf.rotate(rnd() * Math.PI); gf.scale(1, 0.35 + rnd() * 0.3);
        blob(gf, 0, 0, 3 + rnd() * 3, C.core, 0.7); gf.restore();
    }
    // Звёзды: тысячи, яркость по степенному закону (тусклых много, ярких
    // мало), гуще в полосе Млечного пути, цвет — от голубого до тёплого.
    // Рисуются ПАЧКАМИ «цвет × яркость», один путь на пачку: по одной
    // (fillStyle + fill на каждую) небо стоило треть секунды.
    const cols = ['#ffffff', C.glow, C.cyan, C.core], ALV = [0.3, 0.5, 0.75, 1];
    const packs = cols.map(() => ALV.map(() => []));
    for (let i = 0; i < 11000; i++) {
        let x, y;
        if (rnd() < 0.35) { const p = band(rnd()); x = p[0] + (rnd() - 0.5) * 120; y = p[1] + (rnd() - 0.5) * 120; }
        else { x = X0 + rnd() * T.w; y = Y0 + rnd() * T.h; }
        const b = Math.pow(rnd(), 3.2), q = rnd();
        const ci = q < 0.62 ? 0 : q < 0.8 ? 1 : q < 0.92 ? 2 : 3;
        const ai = Math.min(3, Math.floor((b * 2.2 + rnd() * 0.3) * 4));
        packs[ci][ai].push(x, y, 0.18 + b * 0.55);
    }
    packs.forEach((row, ci) => row.forEach((arr, ai) => {
        gf.fillStyle = rgba(cols[ci], ALV[ai]); gf.beginPath();
        for (let k = 0; k < arr.length; k += 3) { gf.moveTo(arr[k] + arr[k + 2], arr[k + 1]); gf.arc(arr[k], arr[k + 1], arr[k + 2], 0, Math.PI * 2); }
        gf.fill();
    }));

    // ---- ближний слой (прозрачный): яркие звёзды со свечением и иглами ----
    const [near, gn] = canvas(T.px);
    const glows = ['#ffffff', C.glow, C.cyan, C.core, C.blush];
    for (let i = 0; i < 260; i++) {
        const x = X0 + rnd() * T.w, y = Y0 + rnd() * T.h;
        const bright = rnd() < 0.14, r = bright ? 0.6 + rnd() * 0.4 : 0.3 + rnd() * 0.3;
        gn.globalCompositeOperation = 'lighter';
        blob(gn, x, y, r * (bright ? 8 : 5.5), glows[Math.floor(rnd() * glows.length)], bright ? 0.55 : 0.4);
        gn.globalCompositeOperation = 'source-over';
        if (bright) {
            // Лучи короткие и гаснут к концам градиентом — длинные иглы с
            // резким концом торчали палками.
            const L = 3 + rnd() * 3, rot = (rnd() - 0.5) * 0.35;
            gn.save(); gn.translate(x, y); gn.rotate(rot);
            for (const [ax, ay] of [[1, 0], [0, 1]]) {
                const gr = gn.createLinearGradient(-L * ax, -L * ay, L * ax, L * ay);
                gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
                gn.fillStyle = gr; gn.beginPath();
                gn.ellipse(0, 0, ax ? L : 0.18, ay ? L : 0.18, 0, 0, Math.PI * 2); gn.fill();
            }
            gn.restore();
        }
        gn.fillStyle = '#ffffff'; gn.beginPath(); gn.arc(x, y, r, 0, Math.PI * 2); gn.fill();
    }
    return { far, near };
}

const BATH_SOAP = {
    // Вид на каждой ступени. Ещё не нарисованные ступени берут запечённый
    // брусок — пока лестница не закончена.
    TIERS: ['stub', 'bar', 'toilet', 'pump', 'gel', 'premium', 'elixir', 'flask', 'magic'],
    uid: 0,

    level() {
        if (typeof GameState === 'undefined' || !GameState.upgradeLevel || typeof Backend === 'undefined') return 0;
        return GameState.upgradeLevel(Backend.upgradeKey('lust', 'soap')) || 0;
    },
    tier(level) {
        const L = level == null ? this.level() : level;
        return Math.max(0, Math.min(this.TIERS.length - 1, L | 0));
    },

    // where === 'shelf' — предмет на полке: у него есть то, чего нет в руке
    // и на иконке (сопля обмылка из корзины).
    draw(level, where) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'stub') return this.stub(where);
        if (kind === 'bar') return this.bar();
        if (kind === 'toilet') return this.toilet(where);
        if (kind === 'pump') return this.pump();
        if (kind === 'gel') return this.gel();
        if (kind === 'premium') return this.premium();
        if (kind === 'elixir') return this.elixir();
        if (kind === 'flask') { this.wake(); return this.flask(level == null); }
        if (kind === 'magic') { this.wake(); return this.magic(); }
        return BATH_BAKED.draw('soap');
    },

    // Габарит на сцене — по нему иконка магазина ужимает вещь под клетку.
    box(level) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'stub') return { x: 546, y: 322, w: 60, h: 44 };
        if (kind === 'bar') return { x: 536, y: 314, w: 92, h: 64 };
        if (kind === 'toilet') return { x: 532, y: 313, w: 84, h: 38 };
        if (kind === 'pump') return { x: 550, y: 284, w: 54, h: 90 };
        if (kind === 'gel') return { x: 548, y: 276, w: 52, h: 100 };
        if (kind === 'premium') return { x: 551, y: 272, w: 46, h: 104 };
        if (kind === 'elixir') return { x: 548, y: 270, w: 62, h: 106 };
        if (kind === 'flask') return { x: 546, y: 250, w: 57, h: 110 };
        if (kind === 'magic') return { x: 527, y: 180, w: 94, h: 196 };
        return BATH_BAKED.box('soap');
    },

    // Сколько вещь рисует ВОКРУГ своего габарита: ореол и сияние, огоньки
    // на орбите, сопля обмылка, капли — [слева, сверху, справа, снизу], в
    // единицах сцены. По этому окну вещи дают СВОЙ холст — на полке и в руке
    // (lust.js, placeShelf и setHeld): правка живой вещи перерисовывает
    // холст размером с неё, а не весь экран (docs/traps.md, п. 156).
    // Числа — ЗАМЕР, а не прикидка: вещь одна на прозрачном фоне, камера
    // ×1, десять секунд живого цикла, всё с ненулевой альфой, округлено
    // наружу. Волшебному флакону столько потому, что его сияние — круг
    // r≈74×1.5 и дышит. Запас PAINT_M — на сглаживание краёв и упругий
    // подъём; что ничего не срезано, проверяет tools/test-soap.js.
    PAD: { stub: [0, 0, 0, 26], bar: [0, 0, 0, 2], toilet: [10, 2, 10, 28], pump: [0, 0, 0, 4], gel: [2, 0, 0, 2],
           premium: [0, 0, 0, 2], elixir: [26, 0, 16, 28], flask: [38, 4, 38, 30], magic: [72, 32, 72, 66] },
    PAINT_M: 6,
    paint(level) {
        const b = this.box(level), p = this.PAD[this.TIERS[this.tier(level)]] || [0, 0, 0, 0], M = this.PAINT_M;
        return { x: b.x - p[0] - M, y: b.y - p[1] - M, w: b.w + p[0] + p[2] + 2 * M, h: b.h + p[1] + p[3] + 2 * M };
    },

    // Полка перерисовывается после покупки и после debug-панели: ступень
    // меняется, пока ванная открыта. У новой ступени своё окно — холст
    // вещи на полке подгоняется под него.
    refresh() {
        const el = typeof document !== 'undefined' && document.getElementById('bt-soap-art');
        if (el) el.innerHTML = this.draw(null, 'shelf');
        if (typeof LustMinigame !== 'undefined' && LustMinigame.placeShelf) LustMinigame.placeShelf();
    },

    // Многоугольник со скруглёнными вершинами: у мыла острых углов нет.
    roundPoly(pts, q) {
        const pt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
        let d = '';
        for (let i = 0; i < pts.length; i++) {
            const a = pts[(i + pts.length - 1) % pts.length], p = pts[i], c = pts[(i + 1) % pts.length];
            const ka = Math.min(0.5, q / Math.hypot(a[0] - p[0], a[1] - p[1]));
            const kc = Math.min(0.5, q / Math.hypot(c[0] - p[0], c[1] - p[1]));
            const p0 = [p[0] + (a[0] - p[0]) * ka, p[1] + (a[1] - p[1]) * ka];
            const p1 = [p[0] + (c[0] - p[0]) * kc, p[1] + (c[1] - p[1]) * kc];
            d += (i ? 'L' : 'M') + pt(p0) + 'Q' + pt(p) + ' ' + pt(p1);
        }
        return d + 'Z';
    },

    // ---------- 8. ВОЛШЕБНЫЙ ФЛАКОН ----------
    // Вершина лестницы: хрустальный графин, в котором космос. Замысел по
    // частям — docs/plan/21-lust-bath.md, разд. 5в, ступень 8.
    //
    // ФОРМА собрана по мотивам коньячных графинов: круглое пузо с огранкой
    // «солнцем» и гладкой ЛИНЗОЙ в центре; угловатые плечи; толстое
    // хрустальное дно на пьедестале; высокий золотой воротник на горле. Пузо
    // широкое и плоское лицом к нам — это окно: чем оно больше, тем лучше
    // видна глубина. Прежняя «луковица» на золотой чаше была мала для окна, а
    // дух внутри закрывал его собой — его больше нет.
    //
    // ГЛУБИНА: звёзды и туманность лежат ЗА стеклом двумя слоями, видны
    // только сквозь полость и сдвигаются против наклона телефона (дальний
    // сильнее ближнего).
    // Линза в центре — увеличительное стекло: за ней те же слои, но крупнее
    // и со своим сдвигом, как у настоящей линзы.
    //
    // ОГРАНКА выводится из формы, а не рисуется руками: лучи от линзы к краю,
    // два кольца треугольных граней; свет грани — из её наклона (пузо
    // выпуклое, соседние грани повёрнуты в разные стороны), поэтому светлые и
    // тёмные грани чередуются, как у настоящей огранки. Грани — тонкая
    // вуаль: космос сквозь них обязан читаться.
    //
    // ЖИВОСТЬ — покадрово из кода (wake/applyFrame), до 30 кадров, и только
    // transform, координаты и fill-opacity отдельных узлов: ни фильтра, ни
    // маски, ни прозрачности группы на живом слое (docs/traps.md, п. 73).
    // Огранка статична. Ванная закрылась — цикл стоит (lust.js, close → stop).
    MAGIC: {
        CY: -4,                          // центр пуза
        RX: 30, RY: 25, SQ: 2.35,        // пузо — суперэллипс (чуть «квадратнее» круга)
        LENS: { cx: 0, cy: -5, rx: 10.5, ry: 9.5, zoom: 1.35 },
        NECK: { r: 5.8, collar: [-35, -50], top: -53.5 },
        STOP: -61,                       // низ хвостовика пробки
        LV: -26,                         // уровень жижи — под самые плечи
        FLOOR: 29,                       // пол корзины
        // Флакон крупный — в полтора раза больше своих единиц: внутри живёт
        // космос, и мелким его не разглядеть (решение игрока: вершина
        // лестницы может стоять выше стоек).
        SCALE: 1.5,
        // Глубина: насколько сдвигаются слои неба при полном наклоне (в
        // единицах холста), и насколько флакон чувствительнее общего датчика. У датчика полный наклон — 35°
        // (так висит одежда), а глубину при нём приходилось «выкручивать»
        // телефоном (замечание игрока): у флакона полный сдвиг уже при ~15°.
        PLX: { far: 30, near: 12, gain: 2.4 },
        BUBS: 6, TWINKLE: 12,
        TWINKLERS: 40,                   // мерцающих звёзд по всему небу
        // ---- убранство вокруг ----
        // Всё живое, и живёт только сдвигом и прозрачностью отдельных узлов.
        // Всё — ПРИВЯЗАНО к флакону. Два вращающихся веера лучей и радужные
        // зайчики на кафеле были здесь раньше и читались мусором вокруг вещи,
        // а не сиянием (замечание игрока): веер крутился сам по себе, а
        // зайчики висели на стене оторванными полосками — и в руке над
        // червём тоже. Сияние теперь — круглое, дышит, и огоньки, бегущие
        // по кромке хрусталя.
        // Ореола по силуэту (три полупрозрачные обводки пуза с горлом) больше
        // нет: без размытия он читался плотной каймой — графическим
        // артефактом, а не свечением (замечание игрока). Свечение держат
        // круглое сияние (aura), огоньки по кромке и орбита.
        // Огоньки по кромке: два, на противоположных сторонах силуэта, с
        // хвостиком из двух точек; скорость — единиц силуэта в секунду.
        // Штрих обводки вместо них (пробовали) ломался углом на горле и
        // читался неоновой рамкой выделения.
        BEADS: { n: 2, speed: 22, tail: 5 },
        FADE: [0.25, 0.4],               // убранство гаснет под пальцем и загорается, отпущенное (с)
        MOTES: 8,                        // огоньков на орбите
        ORBIT: { rx: 42, ry: 9, cy: 4, tilt: -12 },
        GLINTS: 6,                       // одновременных вспышек на контуре
        DUST: 16                         // пылинок, поднимающихся от плеч
    },

    // ---------- космос на весь экран ----------
    // Космос — не картинка ВО флаконе, а небо ЗА ним, привязанное к экрану:
    // флакон — окно, и, двигая его (в руке, камерой), игрок буквально
    // разглядывает разные участки неба. Поэтому небо одно на весь холст
    // (390×844, с запасом на наклон), нарисовано ОДИН раз на холсте-canvas
    // и лежит двумя картинками: дальняя (фон, туманности, пыль, тысячи
    // звёзд) и ближняя (яркие звёзды со свечением и иглами, прозрачная).
    // Картинка вместо тысяч svg-кружков: сдвиг одной картинки дёшев, а
    // тысячи узлов под клипом перерисовывались бы на каждом кадре.
    // Плотность 2 пикселя на единицу: при 2.4 две картинки неба занимали
    // 25 МБ декодированной памяти, а видеопамять айфона в финале на пределе.
    TEX: { x: -80, y: -80, w: 550, h: 1004, px: 2 },

    buildTex() {
        if (typeof document === 'undefined') return;
        const C = btPal().soapCosmos;
        const args = { T: this.TEX, seed: 20260926,
                       C: { deep: C.deep, pink: C.pink, cyan: C.cyan, glow: C.glow, core: C.core, dust: C.dust,
                            blush: C.blush, violet: C.amethyst[2] } };
        // В blob-URL, а не в data-URL: мегабайтная строка в атрибуте
        // копировалась бы в каждую перерисовку полки и руки.
        const done = (bf, bn) => {
            if (!bf || !bn) return;
            this._tex = { far: URL.createObjectURL(bf), near: URL.createObjectURL(bn) };
            this.applyTex();
        };
        const main = () => {
            try {
                const r = bathSkyPaint((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, args);
                r.far.toBlob((bf) => r.near.toBlob((bn) => done(bf, bn), 'image/png'), 'image/jpeg', 0.9);
            } catch (e) { /* нет canvas — флакон живёт на своей основе космоса */ }
        };
        // Главный путь — фоновый поток: кадр не ждёт растра неба вовсе.
        if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
            try {
                const src = `const bathSkyPaint = ${bathSkyPaint.toString()};
onmessage = async (e) => {
    try {
        const r = bathSkyPaint((w, h) => new OffscreenCanvas(w, h), e.data);
        const bf = await r.far.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
        const bn = await r.near.convertToBlob({ type: 'image/png' });
        postMessage({ bf, bn });
    } catch (err) { postMessage({ fail: true }); }
};`;
                const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
                const w = new Worker(url);
                const end = () => { w.terminate(); URL.revokeObjectURL(url); };
                w.onmessage = (e) => { end(); if (e.data && !e.data.fail) done(e.data.bf, e.data.bn); else main(); };
                w.onerror = () => { end(); main(); };
                w.postMessage(args);
                return;
            } catch (e) { /* поток не поднялся — рисуем здесь */ }
        }
        main();
    },

    // Небо рисуется не в момент отрисовки флакона, а чуть позже и один раз
    // за сессию: флакон появляется сразу (полость — своя основа космоса), а
    // картинки подставляются, как только готовы.
    cosmosTex() {
        if (this._tex) return this._tex;
        if (!this._texStarted && typeof setTimeout !== 'undefined') {
            this._texStarted = true;
            setTimeout(() => this.buildTex(), 30);
        }
        return null;
    },

    applyTex() {
        const T = this._tex;
        if (!T || typeof document === 'undefined') return;
        document.querySelectorAll('.bsm-tf').forEach(el => el.setAttribute('href', T.far));
        document.querySelectorAll('.bsm-tn').forEach(el => el.setAttribute('href', T.near));
    },

    // Как локальные единицы флакона ложатся на холст ванной (390×844):
    // произведение transform всех предков до корневого svg. Читаются только
    // атрибуты — ни раскладки, ни getScreenCTM (на айфоне он врёт). Не в
    // ванной (иконка магазина) — условное место в середине неба.
    // Живые вещи лежат на СВОИХ маленьких холстах (полка — окно в единицах
    // сцены, рука — в единицах вещи, docs/traps.md, п. 156): как единицы
    // такого холста ложатся на холст ванной, знает сам холст (_btWorld —
    // ставят lust.js, placeShelf и placeCarry; там же, где его двигают).
    worldMatrix(root) {
        const svg = root && root.ownerSVGElement;
        const vb = svg && svg.viewBox && svg.viewBox.baseVal;
        const W = svg && svg._btWorld;
        if (typeof DOMMatrix === 'undefined') return null;
        if (!W && (!vb || Math.abs(vb.width - 390) > 1)) return new DOMMatrix([1.4, 0, 0, 1.4, 195, 300]);
        let m = new DOMMatrix();
        for (let el = root; el && el !== svg; el = el.parentNode) {
            const tl = el.transform && el.transform.baseVal;
            if (!tl) continue;
            for (let i = tl.numberOfItems - 1; i >= 0; i--) {
                const q = tl.getItem(i).matrix;
                m = new DOMMatrix([q.a, q.b, q.c, q.d, q.e, q.f]).multiply(m);
            }
        }
        return W ? new DOMMatrix(W).multiply(m) : m;
    },

    // Слой неба в координатах флакона: обратное к «флакон → холст», плюс
    // сдвиг глубины от наклона (в единицах холста).
    layerTr(m, k) {
        const L = this.live, f4 = (v) => v.toFixed(4);
        const sh = `translate(${(-L.px * k).toFixed(2)} ${(-L.py * k).toFixed(2)})`;
        if (!m) return sh;
        const i = m.inverse();
        return `matrix(${[i.a, i.b, i.c, i.d, i.e, i.f].map(f4).join(' ')}) ${sh}`;
    },

    // Силуэт и полость — точками (их же спрашивают огранка и поверхность).
    magicShape() {
        if (this._shape) return this._shape;
        const M = this.MAGIC, n = M.SQ;
        const belly = (th) => {
            const c = Math.cos(th), s = Math.sin(th);
            return [M.RX * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), M.CY + M.RY * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
        };
        // Нижняя половина пуза справа налево, без куска под пьедестал.
        const lower = [];
        for (let i = 0; i <= 48; i++) {
            const p = belly(Math.PI * i / 48);
            if (Math.abs(p[0]) >= 15.5 || p[1] < 17) lower.push(p);
        }
        const R = lower.filter(p => p[0] > 0), L = lower.filter(p => p[0] < 0);
        // Угловатые плечи и горло.
        const shR = [[6.5, -31.5], [18.5, -26.5], [27.5, -16], [30, -5]];
        const outline = [...shR, ...R.slice(1), [19.5, 27], [19, M.FLOOR], [-19, M.FLOOR], [-19.5, 27], ...L.slice(0, -1),
                         ...shR.slice().reverse().map(([x, y]) => [-x, y])];
        // Полость: всё, кроме пьедестала, ужатое к центру (толщина стекла),
        // дно плоское и толстое.
        const cav = [...shR, ...R.slice(1), ...L.slice(0, -1), ...shR.slice().reverse().map(([x, y]) => [-x, y])]
            .map(([x, y]) => [x * 0.9, M.CY + (y - M.CY) * 0.9])
            .map(([x, y]) => [x, Math.min(y, 15)]);
        // Силуэт целиком — пузо и горло с воротником и венчиком одним
        // контуром: по нему бегут огоньки (раньше по нему лежал и ореол).
        const K = M.NECK, [k0, k1] = K.collar;
        const neckL = [[-K.r, k0], [-6.8, k0], [-6.8, k1], [-7.8, k1 - 1.2], [-7, K.top]];
        const sil = [...outline, ...neckL, ...neckL.slice().reverse().map(([x, y]) => [-x, y])];
        let silLen = 0;
        const cum = [0];
        for (let i = 0; i < sil.length; i++) { const a = sil[i], b = sil[(i + 1) % sil.length]; silLen += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(silLen); }
        // Точка силуэта на расстоянии d от начала (по кругу).
        const silAt = (d) => {
            d = ((d % silLen) + silLen) % silLen;
            let i = 0; while (cum[i + 1] < d) i++;
            const a = sil[i], b = sil[(i + 1) % sil.length], u = (d - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
            return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        };
        return (this._shape = { outline, cav, R, L, sil, silLen, silAt });
    },

    // Покадровая геометрия — одна функция и для первого кадра (строкой), и
    // для живого (атрибутами): картинка на иконке и на полке совпадают.
    magicFrame(t) {
        const M = this.MAGIC, out = {}, f2 = (v) => v.toFixed(2);
        // Пробка: качается, «вращается» (сжатие по ширине — дёшево и читается
        // как оборот камня), наклоняется.
        const bob = Math.sin(t * 1.5) * 2;
        out.stopper = `translate(0 ${f2(bob)}) rotate(${f2(Math.sin(t * 0.8) * 4)} 0 ${M.STOP - 12})`;
        out.gemSpin = `scale(${(0.78 + 0.22 * Math.abs(Math.cos(t * 0.9))).toFixed(3)} 1)`;
        out.ringDash = f2(-(t * 9) % 40);
        out.ringScale = `translate(0 ${M.STOP + 3}) scale(${(1 + 0.05 * Math.sin(t * 3)).toFixed(3)}) translate(0 ${-(M.STOP + 3)})`;
        out.vapor = (0.55 + 0.25 * Math.sin(t * 2.2)).toFixed(2);
        out.twinkle = [];
        for (let i = 0; i < M.TWINKLE; i++) out.twinkle.push((0.2 + 0.8 * Math.abs(Math.sin(t * 1.3 + i * 2.1))).toFixed(2));
        // Вспышка по огранке: раз в 5 с проходит слева направо за 1.2 с.
        const ph = (t % 5) / 1.2;
        out.sweep = `translate(${ph < 1 ? f2(-46 + ph * 92) : 90} 0)`;
        // Пузыри пара: из горла, обтекают камень, наверху лопаются искрой.
        out.bubs = [];
        for (let i = 0; i < M.BUBS; i++) {
            const u = (t * 0.26 + i / M.BUBS) % 1, side = i % 2 ? 1 : -1;
            const around = Math.sin(Math.min(1, u / 0.7) * Math.PI) * 12;
            const pop = u > 0.86;
            out.bubs.push({
                x: f2(side * around + Math.sin(u * 8 + i) * 2),
                y: f2(M.NECK.top - 4 - u * 60),
                r: pop ? '0.001' : f2(1.2 + u * 2.8),
                o: f2(u < 0.1 ? u / 0.1 : 1),
                pop: pop ? f2(1 - (u - 0.86) / 0.14) : '0'
            });
        }
        // ---- убранство ----
        // Сияние дышит.
        out.aura = `translate(0 ${M.CY}) scale(${(1 + 0.07 * Math.sin(t * 1.1)).toFixed(3)})`;
        // Огоньки по кромке: голова и хвостик — точки силуэта позади неё.
        const SHb = this.magicShape(), B = M.BEADS;
        out.beads = [];
        for (let i = 0; i < B.n; i++) {
            const d0 = t * B.speed + i * SHb.silLen / B.n;
            [0, 1, 2].forEach(j => { const p = SHb.silAt(d0 - j * B.tail); out.beads.push({ x: f2(p[0]), y: f2(p[1]), s: [1, 0.62, 0.38][j] }); });
        }
        // Огоньки по наклонной орбите: сзади флакона — в заднем слое, спереди
        // — в переднем. Каждый в обоих, видимость решает сторона орбиты.
        const O = M.ORBIT, ca = Math.cos(O.tilt * Math.PI / 180), sa = Math.sin(O.tilt * Math.PI / 180);
        const orb = (a) => { const x = O.rx * Math.cos(a), y = O.ry * Math.sin(a); return [x * ca - y * sa, O.cy + x * sa + y * ca, Math.sin(a)]; };
        // Каждый огонёк — ОДИН узел (голова и два шлейфа), который
        // перекладывается между задним и передним слоем в момент, когда
        // уходит за флакон. Две копии с переключаемой прозрачностью писали
        // вдвое больше атрибутов на каждом кадре.
        out.motes = [];
        for (let i = 0; i < M.MOTES; i++) {
            const a0 = t * 0.75 + i * 2 * Math.PI / M.MOTES + (i % 2) * 0.35;
            const pts = [0, 0.14, 0.28].map(d => orb(a0 - d));
            const k = 0.75 + 0.35 * pts[0][2];
            out.motes.push({ front: pts[0][2] > 0,
                pts: pts.map(([x, y], j) => `translate(${f2(x)} ${f2(y)}) scale(${(k * (1 - j * 0.22)).toFixed(3)})`) });
        }
        // Вспышки: у каждой своё окно жизни, место берётся по номеру окна —
        // каждый раз новое, но детерминированно (без Math.random).
        const SH = this.magicShape(), ol = SH.outline, NG = M.GLINTS;
        out.glints = [];
        for (let i = 0; i < NG; i++) {
            const per = 2.3 + i * 0.37, tt = t + i * 0.9, cyc = Math.floor(tt / per), u = (tt % per) / per;
            const p = ol[(cyc * 7 + i * 11) % ol.length], life = u < 0.4 ? Math.sin(u / 0.4 * Math.PI) : 0;
            const nx = p[0], ny = p[1] - M.CY, nl = Math.hypot(nx, ny) || 1;
            out.glints.push({
                // На самом стекле (чуть внутрь контура): снаружи вспышка
                // висела в воздухе.
                tr: `translate(${f2(p[0] - nx / nl * 1.2)} ${f2(p[1] - ny / nl * 1.2)}) rotate(${f2(u * 40)}) scale(${(0.05 + life).toFixed(3)})`,
                o: f2(life)
            });
        }
        // Звёздная пыль поднимается от плеч вверх, покачиваясь.
        out.dust = [];
        for (let i = 0; i < M.DUST; i++) {
            const u = (t * 0.16 + i / M.DUST) % 1, side = i % 2 ? 1 : -1;
            const x0 = side * (12 + (i * 7) % 16), y0 = -14 - (i * 5) % 12;
            out.dust.push({
                tr: `translate(${f2(x0 + side * u * 10 + Math.sin(u * 9 + i) * 2.2)} ${f2(y0 - u * 62)}) scale(${(1 - u * 0.5).toFixed(3)})`,
                o: f2(Math.sin(u * Math.PI) * (0.55 + 0.45 * Math.abs(Math.sin(t * 5 + i))))
            });
        }
        return out;
    },

    magic() {
        this.live.dirty = true;
        const P = btPal(), C = P.soapCosmos, D = C.deep, Am = C.amethyst, Au = P.soapGold, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap, M = this.MAGIC, LN = M.LENS, NK = M.NECK;
        const f = (v) => v.toFixed(2);
        const pt = (p) => `${f(p[0])} ${f(p[1])}`;
        const poly = (pts) => 'M' + pts.map(pt).join('L') + 'Z';
        const Fr = this.magicFrame(0);
        const rnd = btRng(8888);
        const SH = this.magicShape();
        const body = poly(SH.outline), cav = poly(SH.cav);

        // Блик-звезда — ИГЛЫ, а не звёздочка: крест из тонких ромбов,
        // сужающихся к концам. Длинная бледная пара и короткая яркая — так
        // луч гаснет к концу без градиента. Звёздочка из кривых (star4) у
        // центра толстая по самой форме и читалась мультяшным ромбом.
        // Блик — МЯГКИЙ крест: два узких эллипса с радиальной заливкой по
        // собственной рамке, гаснущие ко всем краям. Иглы-ромбы с острым
        // концом висели в воздухе палками (замечание игрока). Прозрачность
        // не задаётся — наследуется от группы, чтобы её можно было оживлять.
        const flare = (L) => `<ellipse rx="${f(L)}" ry="${f(Math.max(0.35, L * 0.1))}" fill="url(#${id}-soft)"/>`
            + `<ellipse rx="${f(Math.max(0.35, L * 0.1))}" ry="${f(L)}" fill="url(#${id}-soft)"/>`;
        // Где луч из точки упирается в силуэт.
        const hit = (pts, ox, oy, a) => {
            const dx = Math.cos(a), dy = Math.sin(a);
            let best = 99;
            for (let i = 0; i < pts.length; i++) {
                const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
                const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
                if (Math.abs(den) < 1e-9) continue;
                const tt = ((x1 - ox) * ey - (y1 - oy) * ex) / den, u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
                if (tt > 0 && u >= 0 && u <= 1 && tt < best) best = tt;
            }
            return [ox + dx * best, oy + dy * best];
        };
        // Где горизонталь пересекает полость (для поверхности жижи).
        const span = (pts, y) => {
            const xs = [];
            for (let i = 0; i < pts.length; i++) {
                const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
                if ((y1 - y) * (y2 - y) <= 0 && y1 !== y2) xs.push(x1 + (x2 - x1) * (y - y1) / (y2 - y1));
            }
            return [Math.min(...xs), Math.max(...xs)];
        };

        // ---------- огранка «солнцем» ----------
        const N = 16, ang = (k) => -Math.PI / 2 + 2 * Math.PI * k / N;
        const Lp = (k) => [LN.cx + LN.rx * Math.cos(ang(k)), LN.cy + LN.ry * Math.sin(ang(k))];
        const Mp = (k) => [LN.cx + 19.5 * Math.cos(ang(k)), LN.cy + 16.5 * Math.sin(ang(k))];
        const Op = (k) => { const q = hit(SH.outline, LN.cx, LN.cy, ang(k)); return [q[0] + Math.cos(ang(k)) * 2, q[1] + Math.sin(ang(k)) * 2]; };
        const Lv = (() => { const v = [-0.55, -0.65, 0.52], l = Math.hypot(...v); return v.map(c => c / l); })();
        const Hv = (() => { const v = [Lv[0], Lv[1], Lv[2] + 1], l = Math.hypot(...v); return v.map(c => c / l); })();
        let facets = '', edges = '';
        const tri = (a, b, c, sgn) => {
            const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
            const rx = (cx - LN.cx) / 36, ry = (cy - LN.cy) / 31;
            const al = Math.atan2(cy - LN.cy, cx - LN.cx);
            // Выпуклое пузо + поворот грани вбок: соседние грани смотрят в
            // разные стороны, и свет на них разный.
            let n = [rx + sgn * 0.42 * -Math.sin(al), ry + sgn * 0.42 * Math.cos(al), Math.sqrt(Math.max(0.08, 1 - rx * rx - ry * ry))];
            const nl = Math.hypot(...n); n = n.map(v => v / nl);
            const d = n[0] * Lv[0] + n[1] * Lv[1] + n[2] * Lv[2];
            const sp = Math.pow(Math.max(0, n[0] * Hv[0] + n[1] * Hv[1] + n[2] * Hv[2]), 16);
            const dpath = `M${pt(a)}L${pt(b)}L${pt(c)}Z`;
            const jit = (rnd() - 0.5) * 0.06;
            if (d > 0.1) facets += `<path d="${dpath}" fill="${C.glow}" fill-opacity="${Math.max(0.02, Math.min(0.34, 0.02 + 0.2 * d * d + 0.45 * sp + jit)).toFixed(3)}"/>`;
            else facets += `<path d="${dpath}" fill="${C.dust}" fill-opacity="${(0.17 + jit).toFixed(3)}"/>`;
        };
        for (let k = 0; k < N; k++) {
            tri(Lp(k), Lp(k + 1), Mp(k + 0.5), 1);
            tri(Lp(k), Mp(k + 0.5), Mp(k - 0.5), -1);
            tri(Mp(k + 0.5), Op(k), Op(k + 1), -1);
            tri(Mp(k + 0.5), Mp(k + 1.5), Op(k + 1), 1);
            edges += `M${pt(Lp(k))}L${pt(Mp(k + 0.5))}L${pt(Lp(k + 1))}M${pt(Mp(k + 0.5))}L${pt(Op(k))}M${pt(Mp(k + 0.5))}L${pt(Op(k + 1))}L${pt(Mp(k + 1.5))}`;
        }

        // ---------- поверхность жижи ----------
        // Одна ломаная: на границах граней — короткие ступеньки (преломление).
        const LV = M.LV, [sx0, sx1] = span(SH.cav, LV), steps = [], NS = 6;
        for (let k = 0; k < NS; k++) {
            const x0 = sx0 + (sx1 - sx0) * k / NS, x1 = sx0 + (sx1 - sx0) * (k + 1) / NS;
            const dy = Math.sin(k * 2.3 + 0.7) * 0.45;
            steps.push([x0, LV + dy], [x1, LV + dy]);
        }
        const menis = 'M' + steps.map(pt).join('L');
        const menisGlow = 'M' + steps.map(([x, y]) => pt([x, y + 1.6])).join('L');
        const empty = `M-40 -60H40V${f(steps[steps.length - 1][1])}` + steps.slice().reverse().map(p => 'L' + pt(p)).join('') + 'Z';

        // ---------- небо за стеклом ----------
        // Две картинки на весь холст (cosmosTex) и мерцающие звёзды поверх
        // ближней — они же в координатах холста.
        const TX = this.TEX, tex = this.cosmosTex();
        const img = (cls, u) => `<image class="${cls}"${u ? ` href="${u}"` : ''} x="${TX.x}" y="${TX.y}" width="${TX.w}" height="${TX.h}" preserveAspectRatio="none"/>`;
        const far = img('bsm-tf', tex && tex.far);
        const GLOW = ['wh', 'bl', 'wm', 'pk'];
        let near = img('bsm-tn', tex && tex.near);
        for (let i = 0; i < M.TWINKLERS; i++) {
            const x = TX.x + rnd() * TX.w, y = TX.y + rnd() * TX.h, r = 0.5 + rnd() * 0.35;
            const g = GLOW[Math.floor(rnd() * GLOW.length)], ti = i % M.TWINKLE;
            near += `<g transform="translate(${f(x)} ${f(y)})"><circle class="bsm-tw" data-i="${ti}" r="${f(r * 6)}" fill="url(#${id}-st-${g})" fill-opacity="${Fr.twinkle[ti]}"/>`
                  + `<circle r="${f(r)}" fill="#ffffff"/></g>`;
        }
        const layer0 = (k) => this.layerTr(this.worldMatrix(null), k);

        // ---------- убранство вокруг ----------
        // Огоньки, бегущие по кромке хрусталя: мягкая точка света, а не
        // штрих — гаснет ко всем краям.
        const beads = `<g class="bsm-beads">` + Fr.beads.map((q, j) => `<g transform="translate(${q.x} ${q.y}) scale(${q.s})">`
            + `<circle r="5" fill="url(#${id}-mote)"/>${j % 3 ? '' : '<circle r="0.9" fill="#ffffff"/>'}</g>`).join('') + `</g>`;
        // Огонёк и три точки шлейфа, в заднем ('b') и переднем ('f') слое.
        const moteSvg = (m, i) => {
            const g = ['mote', 'moteP', 'moteG'][i % 3];
            return `<g class="bsm-mote" data-i="${i}" fill-opacity="${m.front ? 1 : 0.8}">`
                + m.pts.map((tr, j) => `<g transform="${tr}" fill-opacity="${[1, 0.7, 0.42][j]}">`
                    + (j === 0 ? `<circle r="5.5" fill="url(#${id}-${g})"/><circle r="1" fill="#ffffff"/>` : `<circle r="${(3 - j * 0.6).toFixed(1)}" fill="url(#${id}-${g})"/>`)
                    + `</g>`).join('') + `</g>`;
        };
        const motes = (side) => `<g class="bsm-motes-${side}">`
            + Fr.motes.map((m, i) => ((side === 'f') === m.front ? moteSvg(m, i) : '')).join('') + `</g>`;
        const glints = Fr.glints.map(g => `<g class="bsm-glint" transform="${g.tr}" fill-opacity="${g.o}">
                <circle r="4.5" fill="url(#${id}-mote)"/>
                ${flare(7)}
                <circle r="0.9" fill="#ffffff"/>
            </g>`).join('');
        const dust = Fr.dust.map((d, i) => `<g class="bsm-dust" transform="${d.tr}" fill-opacity="${d.o}">
                <circle r="2.6" fill="url(#${id}-${['mote', 'moteP', 'moteG'][i % 3]})"/><circle r="0.6" fill="#ffffff"/>
            </g>`).join('');
        const lensZ = `translate(${LN.cx} ${LN.cy}) scale(${LN.zoom}) translate(${-LN.cx} ${-LN.cy})`;

        // ---------- горло, воротник, пробка ----------
        const [c0, c1] = NK.collar;
        const neck = `M${-NK.r} -30V${c0}H${NK.r}V-30Z`;
        const collar = `M-6.8 ${c0}V${c1 + 1}Q-6.8 ${c1} -5.8 ${c1}H5.8Q6.8 ${c1} 6.8 ${c1 + 1}V${c0}Z`;
        let ribs = '';
        for (let x = -5.4; x <= 5.5; x += 1.35) ribs += `M${f(x)} ${c1 + 2.5}V${c1 + 5.5}M${f(x)} ${c0 - 5.5}V${c0 - 2.5}`;
        const lip = `M-6 ${c1}L-7.8 ${c1 - 1.2}Q-8.4 ${NK.top + 1} -7 ${NK.top}H7Q8.4 ${NK.top + 1} 7.8 ${c1 - 1.2}L6 ${c1}Z`;
        const S = M.STOP;
        const stem = `M-2.6 ${S}L-4 ${S - 8}H4L2.6 ${S}Z`;
        const setting = `M-5.8 ${S - 8}H5.8L5 ${S - 11}H-5Z`;
        // Камень вытянутый и остроконечный: приземистый шестигранник
        // читался гайкой.
        const G0 = S - 11, GR = S - 15, GS = S - 26, GT = S - 33;
        const gem = `M-5 ${G0}L-7 ${GR}L-5.6 ${GS}L0 ${GT}L5.6 ${GS}L7 ${GR}L5 ${G0}Z`;
        const gemLines = `M-7 ${GR}H7M-5.6 ${GS}L-2.2 ${GR}L0 ${GT}L2.2 ${GR}L5.6 ${GS}M-2.2 ${GR}L0 ${G0}L2.2 ${GR}M-5 ${G0}L-2.2 ${GR}M5 ${G0}L2.2 ${GR}M0 ${GT}V${GR}`;

        const bubs = Fr.bubs.map(b =>
            // Пузырь как мыльный: прозрачная середина, радужная кромка, блик.
            // Рисуется единичным и масштабируется — размер растёт на подъёме.
            `<g class="bsm-bub" transform="translate(${b.x} ${b.y})"><g transform="scale(${b.r})" fill-opacity="${b.o}" stroke-opacity="${b.o}">`
          + `<circle r="1" fill="url(#${id}-bubG)"/><circle r="0.94" fill="none" stroke="url(#${id}-bubRim)" stroke-width="0.14"/>`
          + `<ellipse cx="-0.38" cy="-0.42" rx="0.3" ry="0.16" fill="#ffffff" transform="rotate(-35 -0.38 -0.42)"/></g>`
          + `<g fill-opacity="${b.pop}">${flare(3.4)}</g></g>`).join('');

        // ---------- пьедестал: толстое дно с вертикальными насечками ----------
        const ped = `M-15.5 17H15.5L19.5 27L19 ${M.FLOOR}H-19L-19.5 27Z`;
        let cuts = '';
        for (let x = -15; x <= 15.1; x += 3.75) cuts += `M${f(x * 0.95)} 18.5L${f(x * 1.22)} 27.5`;

        const inset = (pts, k) => pts.map(([x, y]) => [x * k, M.CY + (y - M.CY) * k]);
        const line = (pts) => 'M' + pts.map(pt).join('L');
        // Блик пуза: широкая дуга по левому-нижнему краю и узкая — по плечу.
        const bellyHi = line(inset(SH.L.filter(p => p[1] > -2 && p[1] < 14), 0.86));


        return `
        <g class="bt-soap bt-soap-magic" transform="translate(${A.x} ${A.y + 2 + M.FLOOR * (1 - M.SCALE)}) scale(${M.SCALE})">
            <defs>
                <!-- Основа космоса: светлее за линзой, в индиго к краям. -->
                <radialGradient id="${id}-deep" gradientUnits="userSpaceOnUse" cx="${LN.cx}" cy="${LN.cy}" r="32">
                    <stop offset="0" stop-color="${D[3]}"/>
                    <stop offset="0.4" stop-color="${D[2]}"/>
                    <stop offset="0.78" stop-color="${D[1]}"/>
                    <stop offset="1" stop-color="${D[0]}"/>
                </radialGradient>
                ${[['wh', C.glow], ['bl', C.cyan], ['wm', C.core], ['pk', C.blush]].map(([k, c]) => `
                <radialGradient id="${id}-st-${k}" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="${c}" stop-opacity="1"/>
                    <stop offset="0.16" stop-color="${c}" stop-opacity="0.6"/>
                    <stop offset="0.45" stop-color="${c}" stop-opacity="0.16"/>
                    <stop offset="1" stop-color="${c}" stop-opacity="0"/>
                </radialGradient>`).join('')}
                <!-- Линза: край темнее (толщина выпуклого стекла), середина
                     светлее — так гладкое окно читается выпуклым. -->
                <radialGradient id="${id}-lensV" gradientUnits="objectBoundingBox" cx="0.42" cy="0.38">
                    <stop offset="0" stop-color="${C.glow}" stop-opacity="0.16"/>
                    <stop offset="0.7" stop-color="${C.glow}" stop-opacity="0"/>
                    <stop offset="1" stop-color="${D[0]}" stop-opacity="0.4"/>
                </radialGradient>
                <linearGradient id="${id}-emptyG" gradientUnits="userSpaceOnUse" x1="0" y1="-33" x2="0" y2="${LV}">
                    <stop offset="0" stop-color="${C.crystal}" stop-opacity="0.7"/>
                    <stop offset="0.75" stop-color="${C.crystal}" stop-opacity="0.6"/>
                    <stop offset="1" stop-color="${C.cyan}" stop-opacity="0.45"/>
                </linearGradient>
                <linearGradient id="${id}-neckV" gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="${NK.top}">
                    <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.75"/>
                    <stop offset="0.5" stop-color="${C.crystal}" stop-opacity="0.6"/>
                    <stop offset="1" stop-color="${C.glow}" stop-opacity="0.85"/>
                </linearGradient>
                <linearGradient id="${id}-stemV" gradientUnits="userSpaceOnUse" x1="0" y1="${S}" x2="0" y2="${S - 8}">
                    <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.9"/>
                    <stop offset="0.6" stop-color="${C.crystal}" stop-opacity="0.75"/>
                    <stop offset="1" stop-color="${Am[3]}" stop-opacity="0.9"/>
                </linearGradient>
                <!-- Толстое дно: хрусталь, подсвеченный космосом сверху. -->
                <linearGradient id="${id}-ped" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="${M.FLOOR}">
                    <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.8"/>
                    <stop offset="0.45" stop-color="${C.crystal}" stop-opacity="0.85"/>
                    <stop offset="1" stop-color="${Am[2]}" stop-opacity="0.6"/>
                </linearGradient>
                <linearGradient id="${id}-shadeR" gradientUnits="userSpaceOnUse" x1="-30" y1="0" x2="30" y2="0">
                    <stop offset="0" stop-color="${D[0]}" stop-opacity="0"/>
                    <stop offset="0.6" stop-color="${D[0]}" stop-opacity="0"/>
                    <stop offset="1" stop-color="${D[0]}" stop-opacity="0.3"/>
                </linearGradient>
                <linearGradient id="${id}-ame" gradientUnits="userSpaceOnUse" x1="-7.6" y1="0" x2="7.6" y2="0">
                    <stop offset="0" stop-color="${Am[1]}"/>
                    <stop offset="0.3" stop-color="${Am[3]}"/>
                    <stop offset="0.5" stop-color="${Am[2]}"/>
                    <stop offset="0.75" stop-color="${Am[1]}"/>
                    <stop offset="1" stop-color="${Am[0]}"/>
                </linearGradient>
                <!-- Золото — металл: резкий перепад, два блика. -->
                <linearGradient id="${id}-gold" gradientUnits="userSpaceOnUse" x1="-7" y1="0" x2="7" y2="0">
                    <stop offset="0" stop-color="${Au[0]}"/>
                    <stop offset="0.16" stop-color="${Au[3]}"/>
                    <stop offset="0.28" stop-color="${Au[4]}"/>
                    <stop offset="0.44" stop-color="${Au[2]}"/>
                    <stop offset="0.75" stop-color="${Au[1]}"/>
                    <stop offset="0.88" stop-color="${Au[3]}"/>
                    <stop offset="1" stop-color="${Au[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-sweep" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="${C.glow}" stop-opacity="0"/>
                    <stop offset="0.5" stop-color="${C.glow}" stop-opacity="0.7"/>
                    <stop offset="1" stop-color="${C.glow}" stop-opacity="0"/>
                </linearGradient>
                <radialGradient id="${id}-vapor" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="${C.glow}" stop-opacity="0.9"/>
                    <stop offset="0.5" stop-color="${C.cyan}" stop-opacity="0.35"/>
                    <stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-aura" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="74">
                    <stop offset="0" stop-color="${Am[2]}" stop-opacity="0.55"/>
                    <stop offset="0.3" stop-color="${Am[1]}" stop-opacity="0.3"/>
                    <stop offset="0.62" stop-color="${C.cyan}" stop-opacity="0.12"/>
                    <stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-soft" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
                    <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.55"/>
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-mote" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
                    <stop offset="0.22" stop-color="${C.cyan}" stop-opacity="0.95"/>
                    <stop offset="0.55" stop-color="${Am[1]}" stop-opacity="0.4"/>
                    <stop offset="1" stop-color="${Am[1]}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-moteP" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
                    <stop offset="0.22" stop-color="${C.pink}" stop-opacity="0.95"/>
                    <stop offset="0.55" stop-color="${Am[1]}" stop-opacity="0.4"/>
                    <stop offset="1" stop-color="${Am[1]}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-moteG" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
                    <stop offset="0.22" stop-color="${Au[3]}" stop-opacity="0.95"/>
                    <stop offset="0.55" stop-color="${Au[1]}" stop-opacity="0.4"/>
                    <stop offset="1" stop-color="${Au[1]}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-bubG" gradientUnits="objectBoundingBox">
                    <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.04"/>
                    <stop offset="0.72" stop-color="${C.cyan}" stop-opacity="0.14"/>
                    <stop offset="0.9" stop-color="${C.pink}" stop-opacity="0.35"/>
                    <stop offset="1" stop-color="${C.glow}" stop-opacity="0.7"/>
                </radialGradient>
                <linearGradient id="${id}-bubRim" x1="0" y1="0" x2="1" y2="1">
                    ${C.prism.map((c, i) => `<stop offset="${(i / (C.prism.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}
                </linearGradient>
                <clipPath id="${id}-cav"><path d="${cav}"/></clipPath>
                <clipPath id="${id}-lens"><ellipse cx="${LN.cx}" cy="${LN.cy}" rx="${LN.rx}" ry="${LN.ry}"/></clipPath>
                <clipPath id="${id}-body"><path d="${body}"/></clipPath>
            </defs>

            <!-- УБРАНСТВО СЗАДИ: сияние и задняя половина орбиты огоньков. -->
            <circle class="bsm-aura" r="74" fill="url(#${id}-aura)" transform="${Fr.aura}"/>
            ${motes('b')}
            <!-- ТЕЛО. -->
            <path d="${neck}${lip}${collar}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.structure}" stroke-linejoin="round"/>
            <path d="${body}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="${C.crystal}" fill-opacity="0.6"/>
            <path d="${ped}" fill="url(#${id}-ped)"/>
            <path d="${cuts}" fill="none" stroke="${C.glow}" stroke-width="0.9" stroke-opacity="0.8" stroke-linecap="round"/>
            <path d="${cuts}" fill="none" stroke="${Am[2]}" stroke-width="0.6" stroke-opacity="0.6" transform="translate(1 0)"/>
            <path d="${cav}" fill="url(#${id}-deep)"/>
            <g clip-path="url(#${id}-cav)">
                <!-- Космос за стеклом: два слоя глубины. -->
                <g class="bsm-far" transform="${layer0(M.PLX.far)}">${far}</g>
                <g class="bsm-near" transform="${layer0(M.PLX.near)}">${near}</g>
                <!-- Линза: те же слои, крупнее — увеличительное стекло. -->
                <g clip-path="url(#${id}-lens)">
                    <ellipse cx="${LN.cx}" cy="${LN.cy}" rx="${LN.rx}" ry="${LN.ry}" fill="url(#${id}-deep)"/>
                    <g transform="${lensZ}">
                        <g class="bsm-far" transform="${layer0(M.PLX.far)}">${far}</g>
                        <g class="bsm-near" transform="${layer0(M.PLX.near)}">${near}</g>
                    </g>
                    <ellipse cx="${LN.cx}" cy="${LN.cy}" rx="${LN.rx}" ry="${LN.ry}" fill="url(#${id}-lensV)"/>
                </g>
                <!-- Отсвет космоса по стенкам полости. -->
                <path d="${cav}" fill="none" stroke="${C.cyan}" stroke-width="2.6" stroke-opacity="0.3"/>
                <!-- Пустота над жижей: прозрачный хрусталь с отсветом снизу. -->
                <path d="${empty}" fill="url(#${id}-emptyG)"/>
            </g>
            <!-- Поверхность, сломанная гранями. -->
            <path d="${menisGlow}" fill="none" stroke="${C.cyan}" stroke-width="2.2" stroke-opacity="0.35" stroke-linejoin="round"/>
            <path d="${menis}" fill="none" stroke="${C.glow}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>

            <!-- ОГРАНКА поверх: солнце граней вокруг линзы. -->
            <g clip-path="url(#${id}-body)">
                ${facets}
                <path d="${edges}" fill="none" stroke="${C.glow}" stroke-width="0.55" stroke-opacity="0.4" stroke-linejoin="round"/>
                <rect x="-32" y="-34" width="64" height="52" fill="url(#${id}-shadeR)"/>
                <g class="bsm-sweep" transform="${Fr.sweep}">
                    <rect x="-5" y="-70" width="10" height="120" fill="url(#${id}-sweep)" transform="rotate(22)"/>
                </g>
                <path d="${bellyHi}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.55" stroke-linecap="round"/>
                <path d="M-8 -30L-17.5 -25.5L-25.5 -15.8" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>
            </g>
            <!-- Рама линзы: светлая кромка шлифа и тень под ней. -->
            <ellipse cx="${LN.cx + 0.4}" cy="${LN.cy + 0.5}" rx="${LN.rx}" ry="${LN.ry}" fill="none" stroke="${D[0]}" stroke-width="1" stroke-opacity="0.4"/>
            <ellipse cx="${LN.cx}" cy="${LN.cy}" rx="${LN.rx}" ry="${LN.ry}" fill="none" stroke="${C.glow}" stroke-width="1.1" stroke-opacity="0.85"/>
            <path d="M${LN.cx - LN.rx * 0.82} ${LN.cy - LN.ry * 0.3}Q${LN.cx - LN.rx * 0.7} ${LN.cy - LN.ry * 0.85} ${LN.cx - LN.rx * 0.15} ${LN.cy - LN.ry * 0.93}"
                  fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.9"/>
            <path d="${body}" fill="none" stroke="${C.glow}" stroke-width="0.7" stroke-opacity="0.7" stroke-linejoin="round"/>
            ${[[-19, -12, 2.4], [-24, 4, 1.8], [12, -23, 1.6], [22, 9, 1.3]].map(([x, y, r]) => `<g transform="translate(${x} ${y})" fill-opacity="0.85">${flare(r * 1.5)}<circle r="0.4" fill="#ffffff"/></g>`).join('')}

            <!-- ГОРЛО: стекло, высокий золотой воротник, хрустальный венчик. -->
            <path d="${neck}" fill="url(#${id}-neckV)"/>
            <path d="M${-NK.r + 1} -31V${c0}" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>
            <path class="bsm-collar" d="${collar}" fill="url(#${id}-gold)"/>
            <path d="${ribs}" stroke="${Au[0]}" stroke-width="0.55" stroke-opacity="0.75"/>
            <path d="M-6.8 ${c1 + 6.5}H6.8M-6.8 ${c0 - 6.5}H6.8" stroke="${Au[4]}" stroke-width="0.7" stroke-opacity="0.9"/>
            <!-- Камень-кабошон в середине воротника. -->
            <ellipse cx="0" cy="${(c0 + c1) / 2}" rx="2.3" ry="2.9" fill="${C.pink}" stroke="${Au[0]}" stroke-width="0.7"/>
            <ellipse cx="-0.7" cy="${(c0 + c1) / 2 - 1}" rx="0.7" ry="0.9" fill="#ffffff" fill-opacity="0.85"/>
            <path d="${collar}" fill="none" stroke="${mixColor(ink, Au[0], 0.4)}" stroke-width="0.6"/>
            <path d="${lip}" fill="url(#${id}-neckV)" stroke="${C.glow}" stroke-width="0.5"/>
            <path d="M-6.4 ${NK.top + 1}H5.5" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round"/>

            <!-- УБРАНСТВО СПЕРЕДИ: огоньки по кромке, передняя половина
                 орбиты, вспышки на контуре, звёздная пыль. -->
            ${beads}
            ${motes('f')}
            <g class="bsm-fx">${glints}${dust}</g>
            <!-- ЛЕВИТАЦИЯ: пар из горла, кольцо с бегущими точками, пузыри. -->
            <ellipse class="bsm-vapor" cx="0" cy="${NK.top - 7}" rx="9" ry="11" fill="url(#${id}-vapor)" fill-opacity="${Fr.vapor}"/>
            <g class="bsm-ring" transform="${Fr.ringScale}">
                <ellipse cx="0" cy="${S + 3}" rx="10.5" ry="2.6" fill="none" stroke="${C.cyan}" stroke-width="2.2" stroke-opacity="0.35"/>
                <ellipse class="bsm-ringd" cx="0" cy="${S + 3}" rx="10.5" ry="2.6" fill="none" stroke="${C.glow}" stroke-width="0.9"
                         stroke-dasharray="0.6 3.4" stroke-dashoffset="${Fr.ringDash}" stroke-linecap="round"/>
            </g>
            ${bubs}
            <!-- ПРОБКА парит. -->
            <g class="bsm-stopper" transform="${Fr.stopper}">
                <path d="${stem}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.structure}" stroke-linejoin="round"/>
                <path d="${stem}" fill="url(#${id}-stemV)"/>
                <path d="M-1.9 ${S - 1}L-2.9 ${S - 7}" stroke="#ffffff" stroke-width="0.7" stroke-linecap="round"/>
                <g class="bsm-gem" transform="${Fr.gemSpin}">
                    <path d="${gem}${setting}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.structure}" stroke-linejoin="round"/>
                    <path d="${gem}" fill="url(#${id}-ame)"/>
                    <path d="M-7 ${GR}L-5.6 ${GS}L0 ${GT}L-2.2 ${GR}Z" fill="${Am[3]}" fill-opacity="0.5"/>
                    <path d="M2.2 ${GR}L5.6 ${GS}L7 ${GR}Z" fill="${Am[0]}" fill-opacity="0.4"/>
                    <path d="M2.2 ${GR}L7 ${GR}L5 ${G0}L0 ${G0}Z" fill="${Am[0]}" fill-opacity="0.35"/>
                    <path d="${gemLines}" fill="none" stroke="${Am[3]}" stroke-width="0.5" stroke-opacity="0.9"/>
                    <path d="${setting}" fill="url(#${id}-gold)"/>
                    <path d="M-5 ${S - 9.4}H4" stroke="${Au[4]}" stroke-width="0.6"/>
                    <path d="M-5.4 ${S - 10.6}L-6.6 ${GR - 1.5}M5.4 ${S - 10.6}L6.6 ${GR - 1.5}" stroke="${Au[2]}" stroke-width="1.4" stroke-linecap="round"/>
                    <path d="M-3.6 ${GS + 1}L-1.2 ${GT + 4}" stroke="#ffffff" stroke-width="1" stroke-linecap="round" stroke-opacity="0.9"/>
                    <g transform="translate(-1.8 ${GS - 1})">${flare(3)}</g>
                </g>
            </g>
        </g>`;
    },

    // ---------- живость флакона ----------
    live: { raf: 0, last: 0, px: 0, py: 0, cache: new WeakMap() },

    // Наклон для глубины. Датчика нет (компьютер, отказ в разрешении) —
    // слой медленно плывёт сам, чтобы флакон не выглядел плоским.
    lean(t) {
        const T = typeof Tilt !== 'undefined' && Tilt.lean ? Tilt.lean() : null;
        const g = this.MAGIC.PLX.gain, cl = (v) => Math.max(-1, Math.min(1, v * g));
        if (T && T.live) return { x: cl(T.x), y: cl(T.y) };
        return { x: 0.55 * Math.sin(t * 0.35), y: 0.4 * Math.sin(t * 0.23) };
    },

    // Проснуться: цикл нужен, пока на экране есть живая вещь. Зовётся из
    // draw, поэтому узлы появятся чуть позже — первый кадр подождёт.
    //
    // Цикл ОДИН на все живые вещи ванной: волшебный флакон (мыло, ступень 8),
    // колба с жижей, подчинённой тяжести (мыло, ступень 7, flaskTick), и
    // живые мочалки — конняку и облако (ступени 7 и 8, BATH_CLOTH.liveTick). Правила у
    // них общие — стоят за закрытой дверью, под магазином, на переезде
    // камеры и за кадром, — и холст полки становится слоем композитора по
    // объединению видимых вещей: два цикла спорили бы за класс .bt-live.
    wake() {
        if (this.live.raf || typeof requestAnimationFrame === 'undefined') return;
        const step = (now) => {
            // Флаконы ищутся в документе не на каждом кадре экрана, а когда
            // их перерисовали (live.dirty из magic()) или один из прежних
            // вынули из дерева. querySelectorAll на каждом кадре стоил
            // заметную долю скрипта.
            const Lv = this.live;
            if (Lv.dirty || !Lv.roots || Lv.roots.some(r => !r.isConnected)) {
                const CL = typeof BATH_CLOTH !== 'undefined' ? ', ' + BATH_CLOTH.LIVE_SEL : '';
                Lv.roots = Array.from(document.querySelectorAll('.bt-soap-magic, .bt-soap-flask' + CL));
                Lv.dirty = false;
            }
            // Ванная закрыта — цикл встаёт. Сцена собирается при загрузке
            // страницы, и живая вещь на полке крутилась бы до первого входа;
            // вход перерисовывает полку (lust.js, open) и будит цикл снова.
            const L0 = typeof LustMinigame !== 'undefined' ? LustMinigame : null;
            const closed = L0 && L0.screenElement && !L0.screenElement.classList.contains('active');
            if (!Lv.roots.length || closed) { Lv.raf = 0; this.layers([]); return; }
            // 30 кадров хватает: флакон — украшение, а не игра.
            // Замер с телефона («Слои → мыло замерло»), переезд камеры:
            // флакон не трогается. Во время переезда сцена едет ГОТОВОЙ
            // текстурой (lust.js, camMove), и любая перемена внутри —
            // анимация или включение слоя — перерисовывала бы её прямо на
            // ходу (docs/traps.md, пп. 150 и 152).
            const hold = this.frozen || (L0 && L0.camTimer);
            // Не чаще 30 раз в секунду И не два кадра экрана подряд — порог
            // по времени ДЕЛИТЕЛЕМ КАДРОВ (docs/traps.md, пп. 36 и 155). Один
            // порог «прошло 33 мс» на медленном устройстве срабатывает на
            // КАЖДОМ кадре: кадр там и так длиннее — потому и длиннее, что
            // флакон дорогой. Его кадр — это не записи, а сам факт перемены в
            // полке: стиль, перерисовка, раскладка слоёв (замер под 4×: полка
            // 8 — 21 кадр живым, 52 замершим, и спрятанное убранство цену почти
            // не снимает). Делитель чередует тяжёлый кадр с лёгким. На
            // устройстве, которое держит 30 кадров и больше, не меняется
            // ничего: там два кадра и так проходят раньше 33 мс. Часы флакона
            // идут по времени (dt), поэтому скорость движения та же — реже
            // только выборка, и только там, где иначе тормозила бы вся ванная.
            Lv.fc = (Lv.fc || 0) + 1;
            if (!hold && now - Lv.last >= 33 && Lv.fc - (Lv.fcAt || 0) >= 2) {
                const dt = Lv.last ? Math.min(0.1, (now - Lv.last) / 1000) : 0;
                Lv.last = now; Lv.n = (Lv.n || 0) + 1; Lv.fcAt = Lv.fc;
                // Спрятанный флакон не крутится: пока мыло в руке, копия на
                // полке стоит с нулевой прозрачностью, и её анимация удваивала
                // работу ровно тогда, когда кадр и так тяжелее всего.
                // И флакон за кадром не крутится: в финале камера смотрит на
                // хвост, полка далеко за краем, а анимация шла бы вхолостую.
                // Под открытым магазином полку не видно — анимирует только
                // иконка (docs/traps.md, п. 68).
                const shop = typeof LustShop !== 'undefined' && LustShop.open;
                // Пока трут, живая мочалка стоит целиком (BATH_CLOTH.liveTick),
                // и если флакона нет, искать видимые незачем: трение — самый
                // тяжёлый кадр ванной, и цикл в нём только сверяет часы.
                const rub = L0 && L0.drag && (L0.drag.kind === 'soap' || L0.drag.kind === 'cloth')
                    && now - (L0.rubMovedAt || 0) < 250;
                // Часы флакона — СВОИ (Lv.mt), а не часы экрана, и идут они с
                // переменной скоростью: пока трут, плавно замедляются до
                // остановки, палец замер — так же плавно разгоняются (FADE за
                // ~0,4 с). Раньше убранство на трении вставало намертво, а с
                // остановкой пальца оживало разом: часы экрана ушли вперёд, и
                // пробка, камень и пузыри прыгали в новую фазу — читалось
                // рывками (замечание игрока). Стоять на трении флакону по-
                // прежнему выгодно (кадр трения самый тяжёлый): при нулевой
                // скорости кадр тот же, и записей нет. Камера и «мыло
                // замерло» часы тоже не двигают — после них флакон
                // продолжает с той же фазы.
                // ВЕЩЬ НА ПОЛКЕ СПИТ, ПОКА В РАБОТЕ ДРУГАЯ. Самописец с айфона:
                // облако парит, а каждый второй кадр 35–70 мс — ровно те, где
                // правился волшебный флакон на полке (одно облако на полке —
                // ровные 16–21 мс). Тот же замер под 4×: облако в воздухе при
                // живом флаконе — 35–42 кадра и худший 50–83 мс, при
                // спрятанном — 50–56 и 33. На айфоне длинный кадр посреди
                // подъёма и парения читается тряской вещи в руке — кадр
                // отнимает у неё вещь, на которую никто не смотрит. Флакон
                // засыпает плавно (часы — как на трении, убранство гаснет).
                // Живые мочалки не спят: видна — значит живёт (игрок), а стоят
                // они дёшево. Колба (ступень 7) не спит: её жижа отвечает
                // телефону, а не часам, и в покое не пишет ничего.
                const work = L0 && (L0.phase === 'soap' || L0.phase === 'cloth') ? L0.phase : null;
                Lv.away = work ? (work === 'soap' ? '#bt-cloth-home' : '#bt-soap-home') : null;
                const doze = !!Lv.away && Lv.roots.some(r => r.classList.contains('bt-soap-magic') && r.closest(Lv.away));
                Lv.rub = rub;
                Lv.sp = Math.max(0, Math.min(1, (Lv.sp == null ? 1 : Lv.sp) + (rub || doze ? -dt : dt) / 0.4));
                Lv.mt = (Lv.mt || 0) + dt * Lv.sp * Lv.sp * (3 - 2 * Lv.sp);
                const L = this.lean(Lv.mt), k = 0.2;
                Lv.px += (L.x - Lv.px) * k;
                Lv.py += (L.y - Lv.py) * k;
                const isMagic = (r) => r.classList.contains('bt-soap-magic');
                const isFlask = (r) => r.classList.contains('bt-soap-flask');
                const cloth = (r) => !isMagic(r) && !isFlask(r);
                // Колба на трении НЕ стоит: она едет за пальцем, и жижа в ней
                // колышется ровно тогда — это и есть её живость. Цена — один
                // transform группы на холсте руки, который и так
                // перерисовывается за пальцем.
                // Живая мочалка в руке на трении ТОЖЕ живёт (игрок: «когда
                // перетаскиваешь облако, все анимации в нём останавливаются —
                // это тупо»), только реже (BATH_CLOTH.liveTick). Видимость
                // считать незачем: под пальцем вещь на экране по определению.
                if (rub && Lv.roots.every(cloth)) {
                    if (typeof BATH_CLOTH !== 'undefined')
                        BATH_CLOTH.liveTick(Lv.roots.filter(r => r.closest('#bt-held')), now, true);
                    Lv.raf = requestAnimationFrame(step);
                    return;
                }
                const hiddenFl = [], mats = new Map();
                const vis = Lv.roots.filter(r => {
                    // Живая мочалка и колба на иконке магазина стоят.
                    const kj = cloth(r), fl = isFlask(r);
                    if ((kj || fl) && r.closest('#bt-shop')) return false;
                    if (shop && !r.closest('#bt-shop')) return false;
                    const h = r.closest('#bt-soap-home, #bt-cloth-home');
                    if (h && h.style.opacity === '0') { if (fl) hiddenFl.push(r); else if (!kj) this.unlit(r); return false; }
                    // Спит (см. выше) только флакон — когда догас. Живые
                    // мочалки на полке не спят: видна — значит живёт (игрок:
                    // «конняку в покое замирает — это баг»); стоят они
                    // дёшево — облако на полке давало ровные 16–21 мс.
                    if (h && Lv.away && !fl && !kj && r.closest(Lv.away)) {
                        const lc = this.live.cache.get(r);
                        if (Lv.sp === 0 && lc && lc.pres === 0) return false;
                    }
                    const m = this.worldMatrix(r);
                    if (fl) mats.set(r, m);
                    if (!m || !r.closest('.bt-svg')) return true;       // иконка магазина
                    // Запас — сам флакон с орбитой огоньков (±50 единиц), без лучей:
                    // с лучами полка в финале считалась видимой. У мочалки —
                    // вещь вокруг своей середины (от гнезда +16, −10).
                    // У колбы — центр шара.
                    const [ox, oy] = kj ? [16, -10] : fl ? [0, this.FLASK.CY] : [0, -30];
                    const x = m.a * ox + m.c * oy + m.e, y = m.b * ox + m.d * oy + m.f, R = 50 * Math.abs(m.a);
                    return x > -R && x < 390 + R && y > -R && y < 844 + R;
                });
                // Слоем — только холсты полки с видимой живой вещью. Холст
                // руки здесь не решается: он слой, пока в руке что-то есть
                // (lust.js, setHeld), и размером с вещь — колба под парящим
                // холстом с тенью-ореолом больше не заставляет пересчитывать
                // тень во весь экран (было: 22 кадра вместо 54 под 4×).
                this.layers(vis);
                // Пока ТРУТ (мылом или мочалкой), флакон в ванной замедляется
                // до остановки — и в руке, и на полке (часы выше). В руке он
                // едет за пальцем и перерисовывается целиком на каждом
                // движении, а его живость (пробка, камень, пузыри, звёзды)
                // добавляла к этому ещё столько же: на ступени 8 кадры падали
                // вдвое против седьмой (замер лестницы, 4× замедление). Небо
                // за стеклом при этом НЕ стоит: оно привязано к экрану и едет
                // вместе с пальцем всегда — стоявшее небо потом «доезжало» на
                // место, и это тоже читалось рывком.
                if (typeof BATH_CLOTH !== 'undefined') BATH_CLOTH.liveTick(vis.filter(cloth), now, rub);
                const fls = vis.filter(isFlask);
                if (fls.length || hiddenFl.length) this.flaskTick(fls, hiddenFl, now, dt, mats);
                const mag = vis.filter(isMagic);
                if (mag.length) {
                    // Кадр — от часов флакона; стоят часы — кадр тот же.
                    if (Lv.frT !== Lv.mt || !Lv.fr) { Lv.fr = this.magicFrame(Lv.mt); Lv.frT = Lv.mt; }
                    mag.forEach(r => this.applyFrame(r, Lv.fr, dt));
                }
            }
            Lv.raf = requestAnimationFrame(step);
        };
        this.live.raf = requestAnimationFrame(step);
    },

    stop() {
        if (this.live.raf) cancelAnimationFrame(this.live.raf);
        this.live.raf = 0;
        this.layers([]);
    },

    // Холсты живых вещей на полке — слоем композитора ТОЛЬКО пока на них
    // живая и видимая вещь (комментарий в index.html у #bt-soap-box). Холст
    // каждой вещи — размером с неё, поэтому и слой размером с неё, а не с
    // экран (docs/traps.md, п. 156). Вещь в руке — на своём холсте, слоем
    // он стоит, пока в руке что-то есть (lust.js, setHeld): его двигают за
    // пальцем, и ехать ему положено на видеокарте.
    LIVE_BOXES: ['bt-soap-box', 'bt-cloth-box'],
    layers(vis) {
        if (typeof document === 'undefined') return;
        for (const id of this.LIVE_BOXES) {
            const svg = document.getElementById(id);
            if (!svg) continue;
            const on = vis.some(r => svg.contains(r));
            if (svg.classList.contains('bt-live') !== on) svg.classList.toggle('bt-live', on);
        }
    },

    // Спрятанная копия на полке гаснет сразу: вернётся — загорится плавно,
    // а не вспыхнет в миг посадки.
    unlit(root) {
        const c = this.live.cache.get(root);
        if (!c || c.pres === 0) return;
        c.pres = 0; c.shown = false;
        c.deco.forEach(el => el.setAttribute('display', 'none'));
    },

    applyFrame(root, Fr, dt) {
        let c = this.live.cache.get(root);
        if (!c) {
            const one = (s) => root.querySelector(s), all = (s) => Array.from(root.querySelectorAll(s));
            // Слои космоса — в двух копиях (окно и линза), поэтому списками.
            c = { stopper: one('.bsm-stopper'), gem: one('.bsm-gem'), ring: one('.bsm-ring'), ringd: one('.bsm-ringd'),
                  vapor: one('.bsm-vapor'),
                  far: all('.bsm-far'), near: all('.bsm-near'), sweep: one('.bsm-sweep'),
                  aura: one('.bsm-aura'), beadG: one('.bsm-beads'),
                  motes: all('.bsm-mote'), motesF: one('.bsm-motes-f'), motesB: one('.bsm-motes-b'), fx: one('.bsm-fx'),
                  glints: all('.bsm-glint'), dust: all('.bsm-dust'),
                  tw: all('.bsm-tw'), bubs: all('.bsm-bub') };
            c.bubParts = c.bubs.map(g => [g.children[0], g.children[1]]);   // пузырь (масштаб) и искра
            // Огоньки — в порядке номера (разметка раскладывает их по двум
            // слоям, а кадр перечисляет по номеру).
            c.motes.sort((a, b) => +a.dataset.i - +b.dataset.i);
            c.moteParts = c.motes.map(g => Array.from(g.children));
            c.beads = c.beadG ? Array.from(c.beadG.children) : [];
            c.deco = [c.aura, c.beadG, c.motesF, c.motesB, c.fx].filter(Boolean);
            this.live.cache.set(root, c);
        }
        const M = this.MAGIC;
        // Под пальцем убранство не нужно: флакон едет за пальцем и
        // перерисовывается целиком на каждом кадре, а сияние, огоньки и пыль
        // — самое дорогое в этой перерисовке. По замыслу игрока вещь в руке и
        // не светится — светится оставленная: парящий флакон (холст руки с
        // .bt-float) возвращает убранство, это и есть его свечение (lust.js,
        // floatTool). Гаснет и загорается оно ПЛАВНО (c.pres, FADE):
        // сияние — прозрачностью, огоньки и пыль собираются к
        // флакону масштабом. Разом появлявшееся убранство читалось рывком.
        // «Под пальцем» — и летящий домой (он тоже не светится), но не
        // поднимающийся с полки: тот уже зовёт «бери меня».
        const L0 = typeof LustMinigame !== 'undefined' ? LustMinigame : null;
        const held = !!root.closest('#bt-homing')
            || (!!root.closest('#bt-held') && !root.closest('.bt-float') && !(L0 && L0.liftRaf))
            || (!!this.live.away && !!root.closest(this.live.away));          // спит на полке (wake)
        // Новая копия (вещь перерисована в руку) продолжает с той яркости,
        // что была у прежней, — иначе подхват гасил бы сияние разом.
        if (c.pres == null) c.pres = this.live.lastPres != null ? this.live.lastPres : held ? 0 : 1;
        const [fOut, fIn] = M.FADE;
        c.pres = Math.max(0, Math.min(1, c.pres + (held ? -(dt || 0) / fOut : (dt || 0) / fIn)));
        const show = c.pres > 0;
        if (c.shown !== show) {
            c.shown = show;
            c.deco.forEach(el => show ? el.removeAttribute('display') : el.setAttribute('display', 'none'));
        }
        const set = (el, k, v) => { if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); };
        set(c.stopper, 'transform', Fr.stopper);
        set(c.gem, 'transform', Fr.gemSpin);
        set(c.ring, 'transform', Fr.ringScale);
        set(c.ringd, 'stroke-dashoffset', Fr.ringDash);
        set(c.vapor, 'fill-opacity', Fr.vapor);
        // Небо привязано к холсту: флакон двигается — окно едет по небу.
        // Всегда, без стоянок и догоняний (часы выше).
        // Пока трут — через кадр цикла (15 в секунду): правка неба
        // перезаписывает обе его копии (окно и линза) с картинками и
        // звёздами, а трение — самый тяжёлый кадр ванной. Так трение стоит
        // столько же, сколько с замершим флаконом (замер, 4×); палец в это
        // время смотрит на пену, ступенька неба мала, а догоняния нет.
        if (!(this.live.rub && (this.live.n || 0) % 2)) {
            const m = this.worldMatrix(root), P = M.PLX;
            const tf = this.layerTr(m, P.far), tn = this.layerTr(m, P.near);
            c.far.forEach(el => set(el, 'transform', tf));
            c.near.forEach(el => set(el, 'transform', tn));
        }
        set(c.sweep, 'transform', Fr.sweep);
        // Убранство. fill-opacity и stroke-opacity — у самих фигур или
        // наследуемым атрибутом, а не прозрачность группы: отдельного буфера
        // нет (docs/traps.md, п. 73).
        if (show) {
            const n = this.live.n || 0, e = c.pres * c.pres * (3 - 2 * c.pres);
            // Медленное (сияние) — через кадр, пока не идёт
            // проявление: дыхание в секунду на 15 кадрах не отличить от 30,
            // а перерисовка больших градиентов — самая дорогая в убранстве.
            if (n % 2 === 0 || e < 1) {
                set(c.aura, 'transform', Fr.aura);
                set(c.aura, 'fill-opacity', e.toFixed(2));
            }
            const gather = `translate(0 ${M.CY}) scale(${(0.5 + 0.5 * e).toFixed(3)}) translate(0 ${-M.CY})`;
            [c.motesF, c.motesB, c.fx].forEach(el => set(el, 'transform', gather));
            // Огоньки на кромке гаснут и загораются размером.
            c.beads.forEach((el, i) => { const q = Fr.beads[i]; set(el, 'transform', `translate(${q.x} ${q.y}) scale(${(q.s * e).toFixed(3)})`); });
            c.motes.forEach((g, i) => {
                const mo = Fr.motes[i], box = mo.front ? c.motesF : c.motesB;
                if (g.parentNode !== box) { box.appendChild(g); set(g, 'fill-opacity', mo.front ? '1' : '0.8'); }
                c.moteParts[i].forEach((el, j) => set(el, 'transform', mo.pts[j]));
            });
            c.glints.forEach((el, i) => { set(el, 'transform', Fr.glints[i].tr); set(el, 'fill-opacity', Fr.glints[i].o); });
            c.dust.forEach((el, i) => { set(el, 'transform', Fr.dust[i].tr); set(el, 'fill-opacity', Fr.dust[i].o); });
        }
        this.live.lastPres = c.pres;
        // Мерцающих звёзд десятки в двух копиях — каждая переписывается раз в
        // три кадра (по трети за кадр): мерцание медленное, разницы не видно.
        const n = this.live.n || 0;
        c.tw.forEach((el, i) => { if (i % 3 === n % 3) set(el, 'fill-opacity', Fr.twinkle[+el.dataset.i]); });
        c.bubs.forEach((g, i) => {
            const b = Fr.bubs[i], [ci, st] = c.bubParts[i];
            set(g, 'transform', `translate(${b.x} ${b.y})`);
            set(ci, 'transform', `scale(${b.r})`);
            set(ci, 'fill-opacity', b.o);
            set(ci, 'stroke-opacity', b.o);
            set(st, 'fill-opacity', b.pop);
        });
    },

    // ---------- 7. КОЛБА ----------
    // Алхимическая колба в медной оплётке — предпоследняя ступень, мостик к
    // волшебному флакону. Вариант «c2» художника (генератор gen2.js,
    // перенесён генератором, а не готовой строкой). Чем богаче эликсира:
    //   * СИЛУЭТ: шар крупнее и поднят над сеткой корзины, горло толще и
    //     короче, на горле шар-перетяжка с розовой дымкой, сверху пробка под
    //     сургучом с оттиском солнца; с воротника на правое плечо свисает
    //     сургучная печать на шнуре (видна поверх сетки);
    //   * МАТЕРИАЛ: медная оплётка — пояс по экватору с заклёпками, четыре
    //     меридиана от воротника, воротник с заклёпками. Медь — тёмная
    //     опора тона, которой у прежней колбы не было (рампа soapCopper);
    //   * ЖИЖА в два слоя: тёмный лиловый сверху (масса, родство с
    //     лиловой восьмой), светящийся розовый снизу — граница волной над
    //     поясом, свет виден и над сеткой; пузыри столбиками, искры.
    //
    // ЖИЖА ПОДЧИНЯЕТСЯ ТЯЖЕСТИ (просьба игрока): стремится вниз при наклоне
    // телефона и колышется после движения. Шар — круг, а плоскость,
    // повёрнутая вокруг ЦЕНТРА шара, сохраняет объём под собой. Поэтому
    // каждый слой живёт ОДНИМ transform rotate вокруг центра шара — ни
    // одного `d` на кадре. Клип — круг стенки с тем же центром: поворот его
    // не меняет, жижа не выливается ни в горло, ни за стенку.
    //
    // ДВЕ НЕСМЕШИВАЮЩИЕСЯ ЖИДКОСТИ ведут себя по-разному (просьба игрока),
    // как в бутылке «волна» — масло над подкрашенной водой. Верхняя
    // поверхность (воздух над лиловым) — быстрая: качается часто и стихает
    // за пару секунд. Граница лилового и розового — медленная и ленивая:
    // плотности близки, тяжесть для неё «ослаблена», поэтому она качается
    // вдвое-втрое реже, отстаёт, перелетает дальше и долго колышется плавной
    // волной, когда верх уже встал. Это и делает такие бутылки красивыми.
    // Устроено вложением: .bsf-liq — всё ниже поверхности (лиловый слой,
    // его пузыри и искры, мениск), повёрнуто на угол верха; внутри него
    // .bsf-low — всё ниже границы (розовый, его пузыри, волна), повёрнуто
    // ещё на разницу углов. Граница не может выйти за поверхность внутри
    // шара: разница углов ограничена зазором из геометрии (flaskGap).
    // Кадр — flaskTick (общий живой цикл, wake).
    FLASK: {
        R: 27, CY: -12,                  // шар
        NX: 6.5, NT: -76,                // горло: полуширина, верх
        BULB: { cy: -58, r: 7.8 },       // шар-перетяжка на горле
        LV: -27, MID: -17,               // уровень жижи и граница слоёв
        // Колыхание — маятник: «низ» жижи тянется к направлению тяжести
        // пружиной с демпфером. hz — своя частота (≈1.4 качания в секунду —
        // шар с ладонь, а не ведро), zeta — затухание (0.13: три-четыре
        // заметных качания, ~2.5 с до покоя). g — тяжесть игры в единицах
        // холста за с²: она же решает, НАСКОЛЬКО ускорение вещи на экране
        // качает жижу. Настоящая (≈54 000 ед/с² при 390 ед на 7 см экрана)
        // гасила бы рывок пальцем до пары градусов — глазу не видно; при
        // 9 000 остановка пальца с 600 ед/с качает жижу на ≈30° (при 12 000
        // качание в руке на экране читалось едва-едва — по съёмке).
        // kick — потолок перемены скорости за кадр (ед/с): подмена копии
        // или скачок камеры — не рывок. jump — скачок места за кадр, после
        // которого вещь считается переставленной, а не брошенной. still —
        // ниже этого (рад, рад/с) жижа стоит и записей нет. flat — длина
        // проекции тяжести, ниже которой телефон считается лежащим: тяжесть
        // ушла в спину телефона, и жижа плавно возвращается к «вниз по
        // экрану», а не мечется от дрожи руки. smooth — доля за кадр,
        // которой жижа догоняет датчик (дрожь руки не дёргает поверхность).
        // fric — сухое трение (рад/с²): одно вязкое затухание тянуло хвост
        // качаний в доли градуса ещё секунд пять, и всё это время шли
        // записи; сухое трение гасит хвост за конечное время (≈1° за
        // качание) и держит жижу на месте, пока телефон дрожит в пределах
        // fric/ω² ≈ 0.25°. still — ближе этого к равновесию (рад) жижа
        // встаёт в него ровно.
        // top — верхняя поверхность; mid — граница слоёв: частота 0.6
        // (втрое реже), тяжесть вдвое слабее (близкие плотности: тот же
        // толчок качает её дальше), затухание и сухое трение меньше —
        // колышется после рывка ещё секунды три после того, как верх встал
        // (калькулятор двух маятников, рывок 600 ед/с: верх стих к 2.9 с,
        // граница к ~5.5 с; меньшее трение тянуло её до восьми секунд записей).
        // margin — доля геометрического зазора, до которой граница может
        // разойтись с поверхностью (flaskGap): ближе — линии сошлись бы у
        // стенки.
        SLOSH: { kick: 900, jump: 60, still: 0.005, flat: [0.15, 0.45], smooth: 0.3, step: 0.1, margin: 0.85,
                 top: { hz: 1.4, zeta: 0.13, g: 9000, fric: 0.34 },
                 mid: { hz: 0.6, zeta: 0.12, g: 4500, fric: 0.15 } },
        // ВАТЕРЛИНИИ (замечание игрока): в покое обе линии — поверхность и
        // граница слоёв — РОВНЫЕ; шевельнулась жидкость — линия чуть
        // волнится, успокоилась — выпрямляется. Размах — от живости СВОЕГО
        // маятника (отклонение от равновесия плюс скорость, в радианах), с
        // огибающей: набирается сразу, спадает с долей rel за кадр, ниже off
        // — ровно ноль, точная прямая и больше ни одной записи. Волна бежит
        // вдоль линии (speed — рад/с фазы, len — длина волны в единицах) и
        // гаснет к стенкам (концы линии стоят на окружности стенки). Верх —
        // мельче, короче и быстрее; граница — крупнее, длиннее, ленивее и
        // спадает дольше: по характеру своих маятников. amp — потолок
        // размаха (ед.): «чуть-чуть», пара единиц.
        WAVE: { n: 32, off: 0.08,
                top: { amp: 1.6, gain: 3, len: 16, speed: 8, rel: 0.12 },
                mid: { amp: 2.2, gain: 3.5, len: 30, speed: 3, rel: 0.05 } }
    },

    // Парк — Миллер, как в генераторе художника: картинка совпадает с c2.
    flaskRng(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; },

    // live — копия в ванной (полка, рука): рисуется с нынешним углом жижи.
    flask(live) {
        this.live.dirty = true;
        const P = btPal(), M = P.soapMagic, V = P.soapViolet, Wx = P.soapWax, Ck = P.soapCork, CU = P.soapCopper,
              G = P.soapBottle, HI = G.hi, SPARK = P.soapGold[4], ink = PALETTE.ink;
        const SC = STROKE.contour, SS = STROKE.structure;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap, K = this.FLASK;
        const f = (v) => (+v).toFixed(1);
        const { R, CY, NX, NT, LV: lv, MID: mid } = K, BC = K.BULB.cy, BR = K.BULB.r;

        // ---- станки генератора (gen.js художника) ----
        const ny = CY - Math.sqrt(R * R - NX * NX);
        const flask = `M${-NX} ${f(ny)}A${R} ${R} 0 1 0 ${NX} ${f(ny)}V${NT}H${-NX}Z`;
        const lipPath = (T, w) => `M${-w} ${T}Q${-w - 1} ${T} ${-w - 1} ${T - 1.6}Q${-w - 1} ${T - 3.2} ${-w + 0.5} ${T - 3.2}H${w - 0.5}Q${w + 1} ${T - 3.2} ${w + 1} ${T - 1.6}Q${w + 1} ${T} ${w} ${T}Z`;
        const corkPath = (T, w) => `M${-w} ${T}L${-w - 1.6} ${T - 9}Q${-w - 1.6} ${T - 10.5} ${-w} ${T - 10.5}H${w}Q${w + 1.6} ${T - 10.5} ${w + 1.6} ${T - 9}L${w} ${T}Z`;
        // Сургуч: шапка с наплывом и потёки разной длины [x, длина, ширина].
        const waxPath = (T, w, drips) => {
            let d = `M${-w - 0.5} ${T - 8}Q${-w - 1} ${T - 14} 0 ${T - 14.6}Q${w + 1} ${T - 14} ${w + 0.5} ${T - 8}L${w + 1.2} ${T - 0.5}Q${w + 1.3} ${T + 1.2} ${w} ${T + 1.3}`;
            for (const [x, len, wd] of drips) d += `L${f(x + wd)} ${T + 1.3}Q${f(x + wd)} ${f(T + len)} ${f(x)} ${f(T + len + 0.6)}Q${f(x - wd)} ${f(T + len)} ${f(x - wd)} ${T + 1.3}`;
            return d + `L${-w} ${T + 1.1}Q${-w - 1.4} ${T + 0.9} ${-w - 1.2} ${T - 0.8}Z`;
        };
        // Алхимические знаки — символы, не буквы (инвариант 9).
        const sun = (x, y, s) => `M${f(x + s)} ${f(y)}A${s} ${s} 0 1 0 ${f(x - s)} ${f(y)}A${s} ${s} 0 1 0 ${f(x + s)} ${f(y)}M${f(x + 0.4)} ${f(y)}A0.4 0.4 0 1 0 ${f(x - 0.4)} ${f(y)}A0.4 0.4 0 1 0 ${f(x + 0.4)} ${f(y)}`;
        const mercury = (x, y, s) => `M${f(x + s * 0.55)} ${f(y - s * 0.2)}A${s * 0.55} ${s * 0.55} 0 1 0 ${f(x - s * 0.55)} ${f(y - s * 0.2)}A${s * 0.55} ${s * 0.55} 0 1 0 ${f(x + s * 0.55)} ${f(y - s * 0.2)}M${f(x)} ${f(y + s * 0.35)}V${f(y + s * 1.2)}M${f(x - s * 0.4)} ${f(y + s * 0.8)}H${f(x + s * 0.4)}M${f(x - s * 0.55)} ${f(y - s * 1.15)}Q${f(x)} ${f(y - s * 0.55)} ${f(x + s * 0.55)} ${f(y - s * 1.15)}`;
        // Пузырь: прозрачный, кромка светлая, искра-блик. Искра — крестик.
        const bubble = (x, y, r, col) =>
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${col}" fill-opacity="0.22" stroke="${col}" stroke-width="${r > 1.5 ? 0.7 : 0.5}" stroke-opacity="0.95"/>`
          + `<circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.38)}" r="${f(Math.max(0.3, r * 0.3))}" fill="${HI}"/>`;
        const spark = (x, y, s, col, o) => `<path d="M${f(x - s)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y - s)}Q${f(x)} ${f(y)} ${f(x + s)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + s)}Q${f(x)} ${f(y)} ${f(x - s)} ${f(y)}Z" fill="${col}" fill-opacity="${o || 1}"/>`;
        // Столбик пузырей: шаг и размер НЕ равные, столбик чуть гуляет.
        const bubbleColumn = (x0, yBot, yTop, seed, col) => {
            const r = this.flaskRng(seed); let out = '', y = yBot, i = 0;
            while (y > yTop + 2) {
                const t = (yBot - y) / (yBot - yTop), rad = 0.7 + t * 1.8 + r() * 0.5;
                out += bubble(x0 + Math.sin(i * 1.9 + r()) * 1.6, y, rad, col);
                y -= rad * 2 + 1 + r() * 3.2; i++;
            }
            return out;
        };
        const motes = (n, x0, x1, y0, y1, seed, col, ok) => {
            const r = this.flaskRng(seed); let out = '';
            for (let i = 0; i < n; i++) {
                const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
                if (ok && !ok(x, y)) continue;
                const k = r();
                out += k < 0.2 ? spark(x, y, 1.6 + r() * 1.2, col, 0.95) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.35 + r() * 0.7)}" fill="${col}" fill-opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`;
            }
            return out;
        };

        // ---- жижа ----
        const r = R - 1.9;
        // Линии жижи — из того же станка, что живой кадр (flaskLines): на
        // полке и в руке картинка совпадает с той, что пишет цикл.
        const sl0 = live && this.live.slosh;
        const LN = this.flaskLines(sl0 ? sl0.w1A : 0, sl0 ? sl0.w1P : 0, sl0 ? sl0.w2A : 0, sl0 ? sl0.w2P : 0);
        const inBall = (x, y) => Math.hypot(x, y - CY) < R - 4;
        const bubs = bubbleColumn(-3, 10, mid + 2, 81, M[4]) + bubbleColumn(9, 9, mid + 6, 85, M[4]).split('<circle').slice(0, 7).join('<circle');
        const bubsTop = bubbleColumn(-2.4, mid - 2, lv + 2, 83, V[4]);
        const moLow = motes(8, -20, 20, mid + 2, 12, 87, M[4], inBall), moTop = motes(6, -18, 18, lv + 2, mid - 2, 89, SPARK, inBall);

        // ---- верх: венчик, пробка, сургуч с оттиском ----
        const W = NT - 3;
        const lip = lipPath(NT, NX + 1.6), cork = corkPath(W, NX - 0.4), wax = waxPath(W, NX + 1.8, [[5.4, 6.4, 1.2], [-1.6, 3.4, 1.1]]);
        const bulb = `M${BR} ${BC}A${BR} ${BR} 0 1 0 ${-BR} ${BC}A${BR} ${BR} 0 1 0 ${BR} ${BC}Z`;

        // ---- оплётка ----
        // Пояс по экватору дугой (корзина выше глаза — видно низ кольца).
        const B0 = CY + 4, BH = 6.5;
        const band = `M${-R - 1} ${B0}Q0 ${B0 - 7} ${R + 1} ${B0}L${R + 1} ${B0 + BH}Q0 ${B0 + BH - 7} ${-R - 1} ${B0 + BH}Z`;
        const bandY = (x) => B0 + BH / 2 - 3.5 * (1 - (x / R) ** 2) + 0.3;
        let mer = '';
        for (const a of [-62, -24, 18, 57]) {
            const s = Math.sin(a * Math.PI / 180), xb = (R + 0.6) * s, yb = B0 - 3.5 * (1 - s * s) + 0.5;
            mer += `M${f(s * 7)} ${f(ny + 1)}Q${f(xb * 1.08)} ${f(CY - R * 0.62)} ${f(xb)} ${f(yb)}`;
        }
        const C0 = ny - 1.5, CH = 7;
        const collar = `M-8.5 ${f(C0)}V${f(C0 - CH + 1.5)}Q-8.5 ${f(C0 - CH)} -7 ${f(C0 - CH)}H7Q8.5 ${f(C0 - CH)} 8.5 ${f(C0 - CH + 1.5)}V${f(C0)}Q0 ${f(C0 + 1.6)} -8.5 ${f(C0)}Z`;
        const rv = (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="0.95" fill="${CU[0]}"/><circle cx="${f(x - 0.3)}" cy="${f(y - 0.3)}" r="0.42" fill="${CU[4]}"/>`;
        let rivets = '';
        for (const x of [-5.6, -0.4, 5]) rivets += rv(x, C0 - CH / 2 + 0.3);
        for (const x of [-21, -8, 6.5, 19.5]) rivets += rv(x, bandY(x));

        // ---- печать на шнуре: продет в воротник справа, лежит на плече ----
        const SX = 19.5, SY = -25;
        const seal = `M${SX + 6.6} ${SY}C${SX + 6.8} ${SY + 4.1} ${SX + 3.1} ${SY + 7} ${SX - 0.6} ${SY + 6.6}C${SX - 4.6} ${SY + 6.8} ${SX - 7} ${SY + 3.1} ${SX - 6.5} ${SY - 0.6}C${SX - 6.8} ${SY - 4.7} ${SX - 3.1} ${SY - 6.8} ${SX + 0.4} ${SY - 6.5}C${SX + 4.5} ${SY - 6.7} ${SX + 7.1} ${SY - 3.5} ${SX + 6.6} ${SY}Z`;
        const cy0 = C0 - CH / 2;
        const cord = `M8.4 ${f(cy0)}C12.5 ${f(cy0 + 1)} 15.5 ${f(cy0 + 5)} ${SX - 1.5} ${SY - 6}M8.4 ${f(cy0 + 1.2)}C10.5 ${f(cy0 + 5)} 12.5 ${f(cy0 + 8)} ${SX - 4} ${SY - 4.6}`;

        // Блики шара: окошко изгибом по сфере (главный признак), мягкий
        // широкий и узкий резкий слои, отражение жижи снизу справа.
        const gloss = `
            <path d="M${f(-R * 0.72)} ${f(CY - R * 0.36)}C${f(-R * 0.64)} ${f(CY - R * 0.6)} ${f(-R * 0.46)} ${f(CY - R * 0.76)} ${f(-R * 0.25)} ${f(CY - R * 0.84)}L${f(-R * 0.2)} ${f(CY - R * 0.71)}C${f(-R * 0.37)} ${f(CY - R * 0.64)} ${f(-R * 0.5)} ${f(CY - R * 0.52)} ${f(-R * 0.59)} ${f(CY - R * 0.32)}Z" fill="${HI}" fill-opacity="0.9"/>
            <path d="M${f(-R * 0.86)} ${f(CY - R * 0.05)}Q${f(-R * 0.88)} ${f(CY + R * 0.18)} ${f(-R * 0.8)} ${f(CY + R * 0.38)}" fill="none" stroke="${HI}" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
            <path d="M${f(-R * 0.62)} ${f(CY - R * 0.5)}Q${f(-R * 0.82)} ${f(CY - R * 0.1)} ${f(-R * 0.7)} ${f(CY + R * 0.3)}" fill="none" stroke="${HI}" stroke-width="6" stroke-opacity="0.13" stroke-linecap="round"/>
            <circle cx="${f(-R * 0.12)}" cy="${f(CY - R * 0.62)}" r="1.1" fill="${HI}" fill-opacity="0.85"/>
            <path d="M${f(R * 0.42)} ${f(CY + R * 0.8)}Q${f(R * 0.72)} ${f(CY + R * 0.6)} ${f(R * 0.84)} ${f(CY + R * 0.3)}" fill="none" stroke="${M[4]}" stroke-width="1.8" stroke-opacity="0.75" stroke-linecap="round"/>`;

        // Угол жижи на момент рисования — тот, что сейчас у живой: вещь,
        // перерисованная в руку, продолжает с того же наклона, без скачка.
        // На иконке магазина колба стоит (вне ванной кадров нет) — ровно.
        const sl = live && this.live.slosh, ang = this.flaskRot(sl ? sl.a : 0), ang2 = this.flaskRot(sl ? sl.a2 - sl.a : 0);

        return `
        <g class="bt-soap bt-soap-flask" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <radialGradient id="${id}-halo" gradientUnits="userSpaceOnUse" cx="0" cy="${CY - 8}" r="66">
                    <stop offset="0" stop-color="${M[2]}" stop-opacity="0.62"/><stop offset="0.45" stop-color="${M[2]}" stop-opacity="0.24"/><stop offset="1" stop-color="${M[2]}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-halo2" gradientUnits="userSpaceOnUse" cx="0" cy="${CY - 6}" r="36">
                    <stop offset="0" stop-color="${M[3]}" stop-opacity="0.7"/><stop offset="1" stop-color="${M[3]}" stop-opacity="0"/>
                </radialGradient>
                <!-- Жижа: белёсое ядро, густые малиновые края — свет, а не краска. -->
                <radialGradient id="${id}-liq" gradientUnits="userSpaceOnUse" cx="-3" cy="${CY + 9}" r="${R}">
                    <stop offset="0" stop-color="${M[4]}"/><stop offset="0.18" stop-color="${M[3]}"/><stop offset="0.45" stop-color="${M[2]}"/>
                    <stop offset="0.72" stop-color="${M[1]}"/><stop offset="1" stop-color="${M[0]}"/>
                </radialGradient>
                <!-- Стекло: прозрачная середина, края уходят в густую малину. -->
                <radialGradient id="${id}-glass" gradientUnits="userSpaceOnUse" cx="-3" cy="${CY - 3}" r="${R + 1}">
                    <stop offset="0" stop-color="${G.wall}" stop-opacity="0.1"/>
                    <stop offset="0.68" stop-color="${G.wall}" stop-opacity="0.2"/>
                    <stop offset="0.86" stop-color="${M[1]}" stop-opacity="0.45"/>
                    <stop offset="1" stop-color="${M[0]}" stop-opacity="0.95"/>
                </radialGradient>
                <linearGradient id="${id}-neck" gradientUnits="userSpaceOnUse" x1="-6" y1="0" x2="6" y2="0">
                    <stop offset="0" stop-color="${G.edge}" stop-opacity="0.95"/><stop offset="0.3" stop-color="${G.wall}" stop-opacity="0.3"/>
                    <stop offset="0.75" stop-color="${G.wall}" stop-opacity="0.25"/><stop offset="1" stop-color="${G.edge}" stop-opacity="0.95"/>
                </linearGradient>
                <linearGradient id="${id}-wax" gradientUnits="userSpaceOnUse" x1="-9" y1="0" x2="9" y2="0">
                    <stop offset="0" stop-color="${Wx[0]}"/><stop offset="0.3" stop-color="${Wx[2]}"/>
                    <stop offset="0.65" stop-color="${Wx[1]}"/><stop offset="1" stop-color="${Wx[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-cork" gradientUnits="userSpaceOnUse" x1="-7" y1="0" x2="7" y2="0">
                    <stop offset="0" stop-color="${Ck[0]}"/><stop offset="0.35" stop-color="${Ck[2]}"/><stop offset="1" stop-color="${Ck[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-cuH" gradientUnits="userSpaceOnUse" x1="-26" y1="0" x2="26" y2="0">
                    <stop offset="0" stop-color="${CU[0]}"/><stop offset="0.22" stop-color="${CU[3]}"/><stop offset="0.32" stop-color="${CU[4]}"/>
                    <stop offset="0.45" stop-color="${CU[2]}"/><stop offset="0.85" stop-color="${CU[1]}"/><stop offset="1" stop-color="${CU[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-top" gradientUnits="userSpaceOnUse" x1="0" y1="${lv}" x2="0" y2="${mid}">
                    <stop offset="0" stop-color="${V[2]}"/><stop offset="0.55" stop-color="${V[1]}"/><stop offset="1" stop-color="${V[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-band" gradientUnits="userSpaceOnUse" x1="0" y1="${B0 - 4}" x2="0" y2="${B0 + BH}">
                    <stop offset="0" stop-color="${CU[4]}"/><stop offset="0.35" stop-color="${CU[3]}"/><stop offset="0.7" stop-color="${CU[2]}"/><stop offset="1" stop-color="${CU[1]}"/>
                </linearGradient>
                <radialGradient id="${id}-mist" gradientUnits="userSpaceOnUse" cx="-1" cy="${BC + 1}" r="${BR}">
                    <stop offset="0" stop-color="${M[4]}" stop-opacity="0.9"/><stop offset="0.6" stop-color="${M[3]}" stop-opacity="0.5"/><stop offset="1" stop-color="${M[2]}" stop-opacity="0.2"/>
                </radialGradient>
                <radialGradient id="${id}-bglass" gradientUnits="userSpaceOnUse" cx="-1" cy="${BC - 1}" r="${BR + 0.5}">
                    <stop offset="0" stop-color="${G.wall}" stop-opacity="0.05"/><stop offset="0.72" stop-color="${G.wall}" stop-opacity="0.2"/><stop offset="1" stop-color="${M[0]}" stop-opacity="0.85"/>
                </radialGradient>
                <radialGradient id="${id}-seal" gradientUnits="userSpaceOnUse" cx="${SX - 2}" cy="${SY - 2.5}" r="8.5">
                    <stop offset="0" stop-color="${Wx[2]}"/><stop offset="0.6" stop-color="${Wx[1]}"/><stop offset="1" stop-color="${Wx[0]}"/>
                </radialGradient>
                <clipPath id="${id}-ball"><circle cx="0" cy="${CY}" r="${R}"/></clipPath>
                <clipPath id="${id}-ball2"><circle cx="0" cy="${CY}" r="${R + 1.2}"/></clipPath>
            </defs>
            <circle class="bs-over" cx="0" cy="${CY - 8}" r="66" fill="url(#${id}-halo)"/>
            <circle class="bs-over" cx="0" cy="${CY - 6}" r="36" fill="url(#${id}-halo2)"/>
            <path d="${flask}${bulb}${lip}${wax}${collar}" fill="none" stroke="${ink}" stroke-width="${2 * SC}" stroke-linejoin="round"/>
            <path d="${band}" fill="none" stroke="${ink}" stroke-width="${2 * SS}" stroke-linejoin="round"/>
            <path d="${seal}" fill="none" stroke="${ink}" stroke-width="${2 * SS}"/>
            <!-- ЖИЖА: лиловый слой сверху, розовый светится снизу. Лиловый —
                 всё ниже поверхности, повёрнут на угол верха; розовый вложен
                 в него и повёрнут ещё на разницу углов (flaskTick). Клипа нет:
                 всё лежит внутри круга стенки (искры — по inBall, пузыри и
                 мениск — внутри радиуса), а поворот вокруг центра круга
                 оставляет их внутри. Клип в генераторе художника ничего не
                 срезал, а на парящем холсте каждый лишний клип — цена
                 растра на каждом кадре качания. -->
            <g class="bsf-liq" transform="${ang}">
                <path class="bsf-surf" d="${LN.all}" fill="url(#${id}-top)"/>
                ${moTop}${bubsTop}
                <g class="bsf-low" transform="${ang2}">
                    <path class="bsf-pink" d="${LN.low}" fill="url(#${id}-liq)"/>
                    ${moLow}${bubs}
                    <path class="bsf-wave" d="${LN.wave}" fill="none" stroke="${M[4]}" stroke-width="1.3" stroke-opacity="0.95"/>
                </g>
                <path class="bsf-men" d="${LN.men}" fill="${V[3]}" fill-opacity="0.65" stroke="${V[4]}" stroke-width="1"/>
            </g>
            <!-- Стекло поверх: шар, горло, шар-перетяжка. -->
            <circle cx="0" cy="${CY}" r="${R}" fill="url(#${id}-glass)"/>
            <path d="M${-NX} ${NT}V${f(ny + 1)}H${NX}V${NT}Z" fill="url(#${id}-neck)"/>
            <circle cx="0" cy="${BC}" r="${BR}" fill="url(#${id}-mist)"/>
            <circle cx="0" cy="${BC}" r="${BR}" fill="url(#${id}-bglass)"/>
            ${bubble(1.2, BC + 2.4, 1.3, M[4])}${bubble(-2.3, BC - 2.2, 0.8, M[4])}
            <path d="M${-BR + 2.2} ${BC - 2.5}Q${-BR + 2.6} ${BC - 5.4} ${-BR + 5.3} ${BC - 6.3}" fill="none" stroke="${HI}" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.9"/>
            <path d="M${BR - 2} ${BC + 3}Q${BR - 1.2} ${BC + 1} ${BR - 1.5} ${BC - 1}" fill="none" stroke="${M[3]}" stroke-width="1.1" stroke-linecap="round"/>
            <g clip-path="url(#${id}-ball)">
                <circle cx="0" cy="${CY}" r="${f(r)}" fill="none" stroke="${HI}" stroke-width="0.7" stroke-opacity="0.6"/>
                ${gloss}
            </g>
            <path d="M${-NX + 1.6} ${NT + 1}V${BC - BR - 0.4}M${-NX + 1.6} ${BC + BR + 0.4}V${f(C0 - CH - 0.4)}" stroke="${HI}" stroke-width="1.4" stroke-opacity="0.85" stroke-linecap="round"/>
            <path d="M${NX - 1.2} ${NT + 1}V${BC - BR}M${NX - 1.2} ${BC + BR}V${f(C0 - CH)}" stroke="${G.edge}" stroke-width="0.8"/>
            <!-- Оплётка: меридианы, пояс, воротник с заклёпками. -->
            <g clip-path="url(#${id}-ball2)">
                <path d="${mer}" fill="none" stroke="${ink}" stroke-width="4.2" stroke-linecap="round"/>
                <path d="${mer}" fill="none" stroke="${CU[2]}" stroke-width="2.6"/>
                <path d="${mer}" fill="none" stroke="${CU[4]}" stroke-width="0.6" transform="translate(-0.5 -0.2)"/>
            </g>
            <path d="${band}" fill="url(#${id}-band)"/>
            <path d="M${-R + 1} ${B0 + 0.4}Q0 ${B0 - 6.2} ${R - 1} ${B0 + 0.4}" fill="none" stroke="${CU[4]}" stroke-width="0.9" stroke-opacity="0.9"/>
            <path d="M${-R} ${B0 + BH - 0.8}Q0 ${B0 + BH - 7.6} ${R} ${B0 + BH - 0.8}" fill="none" stroke="${CU[0]}" stroke-width="0.8"/>
            <path d="${collar}" fill="url(#${id}-cuH)"/>
            <path d="M-7.4 ${f(C0 - CH + 1)}H6.4" stroke="${CU[4]}" stroke-width="0.8" stroke-linecap="round"/>
            ${rivets}
            <!-- Венчик, пробка, сургуч с оттиском солнца. -->
            <path d="${lip}" fill="url(#${id}-neck)" stroke="${G.edge}" stroke-width="0.6"/>
            <path d="M${-NX - 0.2} ${NT - 1.7}H${NX - 0.8}" stroke="${HI}" stroke-width="0.8" stroke-opacity="0.9" stroke-linecap="round"/>
            <path d="${cork}" fill="url(#${id}-cork)"/>
            <path d="${wax}" fill="url(#${id}-wax)"/>
            <path d="M${-NX - 0.6} ${W - 12.4}Q${-NX + 2} ${W - 14.3} 2 ${W - 13.8}" fill="none" stroke="${Wx[2]}" stroke-width="1.3" stroke-linecap="round"/>
            <ellipse cx="${-NX + 1.6}" cy="${W - 11.4}" rx="1.5" ry="0.75" fill="${HI}" fill-opacity="0.7" transform="rotate(-20 ${-NX + 1.6} ${W - 11.4})"/>
            <circle cx="0.4" cy="${W - 6.2}" r="3.4" fill="${Wx[1]}" stroke="${Wx[0]}" stroke-width="0.8"/>
            <path d="${sun(0.4, W - 6.2, 2.1)}" fill="none" stroke="${Wx[0]}" stroke-width="0.7" stroke-linejoin="round" stroke-linecap="round"/>
            <path d="M-2.6 ${W - 4.4}A3.4 3.4 0 0 0 3.2 ${W - 4.6}" fill="none" stroke="${Wx[2]}" stroke-width="0.6"/>
            <!-- Печать на шнуре. -->
            <path d="${cord}" fill="none" stroke="${Wx[0]}" stroke-width="2" stroke-linecap="round"/>
            <path d="${cord}" fill="none" stroke="${Wx[1]}" stroke-width="1.1" stroke-linecap="round"/>
            <path d="${seal}" fill="url(#${id}-seal)"/>
            <circle cx="${SX}" cy="${SY}" r="4.2" fill="none" stroke="${Wx[0]}" stroke-width="0.9"/>
            <path d="${mercury(SX, SY - 0.2, 2.3)}" fill="none" stroke="${Wx[0]}" stroke-width="0.75" stroke-linecap="round"/>
            <path d="M${SX - 4.7} ${SY - 2.6}Q${SX - 3} ${SY - 5.5} ${SX + 0.4} ${SY - 5.4}" fill="none" stroke="${Wx[2]}" stroke-width="1" stroke-linecap="round" stroke-opacity="0.9"/>
        </g>`;
    },

    // Угол жижи → transform. Угол — в понятиях игрока: куда ушёл «низ»
    // жижи, ПЛЮС — вправо по экрану (docs/traps.md, п. 116). У svg ось y
    // вниз, и rotate(+α) уводит низ ВЛЕВО, поэтому знак меняется ровно
    // здесь, один раз. Шаг 0.1° — мельче глазу не видно, а дрожь руки не
    // пишет атрибут на каждом кадре.
    flaskRot(a) {
        const d = Math.round(-a * 1800 / Math.PI) / 10;
        return `rotate(${(d === 0 ? 0 : d).toFixed(1)} 0 ${this.FLASK.CY})`;
    },

    // ---------- живость колбы: тяжесть и колыхание ----------
    flaskNodes(r) {
        const q = (s) => r.querySelector(s);
        return { liq: q('.bsf-liq'), low: q('.bsf-low'), surf: q('.bsf-surf'), men: q('.bsf-men'), pink: q('.bsf-pink'), wave: q('.bsf-wave') };
    },

    // Пути жижи при размахе волн A1 (поверхность) и A2 (граница) и их
    // фазах. Ровно ноль — точная прямая: заливка — хорда и дуга, мениск —
    // настоящий эллипс дугами, как в рисунке художника. Иначе — ломаная
    // из n точек; волна гаснет к стенкам синусом, концы стоят на стенке.
    // Розовая граница в покое тоже прямая: постоянная волна у неё убрана
    // (замечание игрока — шевеление искривляет линию, а не она сама).
    flaskLines(A1, P1, A2, P2) {
        const K = this.FLASK, W = K.WAVE, r = K.R - 1.9, f = (v) => (+v).toFixed(1), g = (v) => (+v).toFixed(2);
        const lv = K.LV, mid = K.MID;
        const hT = Math.sqrt(r * r - (lv - K.CY) ** 2), hM = Math.sqrt(r * r - (mid - K.CY) ** 2);
        const line = (h, y0, A, P, w) => {
            if (!A) return null;
            const out = [], k = 2 * Math.PI / w.len;
            for (let i = 0; i <= W.n; i++) {
                const u = i / W.n, x = -h + 2 * h * u;
                // Плюс к y — вниз (svg): гребни и впадины одинаковы.
                const y = y0 - A * Math.sin(Math.PI * u) * (Math.sin(k * x - P) + 0.35 * Math.sin(2.3 * k * x - 1.7 * P + 1));
                out.push([x, y]);
            }
            return out;
        };
        const t = line(hT, lv, A1, P1, W.top), m = line(hM, mid, A2, P2, W.mid);
        const pl = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + g(p[0]) + ' ' + g(p[1])).join('');
        const all = (t ? pl(t) : `M${f(-hT)} ${lv}L${f(hT)} ${lv}`) + `A${r} ${r} 0 1 1 ${f(-hT)} ${lv}Z`;
        const wave = m ? pl(m) : `M${f(-hM)} ${mid}L${f(hM)} ${mid}`;
        const low = wave + `A${r} ${r} 0 1 1 ${f(-hM)} ${mid}Z`;
        // Мениск — линза вокруг поверхности: толщина по эллипсу.
        const RY = 2.7;
        let men;
        if (!t) men = `M${f(-hT)} ${lv}A${f(hT)} ${RY} 0 1 0 ${f(hT)} ${lv}A${f(hT)} ${RY} 0 1 0 ${f(-hT)} ${lv}Z`;
        else {
            const th = (x) => RY * Math.sqrt(Math.max(0, 1 - (x / hT) ** 2));
            men = pl(t.map(([x, y]) => [x, y - th(x)])) + t.slice().reverse().map(([x, y]) => 'L' + g(x) + ' ' + g(y + th(x))).join('') + 'Z';
        }
        return { all, low, wave, men };
    },

    // Числа маятника из частоты, затухания и тяжести: k = ω², длина L = g/ω²
    // (толчок скорости Δv поворачивает на Δv/L).
    pend(p) {
        const om = 2 * Math.PI * p.hz, k = om * om;
        return { om, k, damp: 2 * p.zeta * om, L: p.g / k, fric: p.fric };
    },

    // Наибольшая разница углов поверхности и границы, при которой линии ещё
    // не сходятся внутри шара. Поверхность — хорда на расстоянии d1 от
    // центра, граница — d2 (с запасом на волны обеих линий); при
    // разнице Δ они пересекаются на расстоянии
    //   √(d1² + d2² − 2·d1·d2·cosΔ) / sinΔ
    // от центра, и оно обязано остаться не меньше радиуса стенки r.
    flaskGap() {
        if (this._gap) return this._gap;
        // Граница с волной поднимается на свой потолок размаха, поверхность
        // опускается на свой — запас на обе волны сразу.
        const K = this.FLASK, r = K.R - 1.9, d1 = K.CY - K.LV, d2 = K.CY - K.MID + K.WAVE.top.amp + K.WAVE.mid.amp;
        const c = (d1 * d2 + Math.sqrt(d1 * d1 * d2 * d2 - r * r * (d1 * d1 + d2 * d2 - r * r))) / (r * r);
        return (this._gap = Math.acos(Math.min(1, c)) * K.SLOSH.margin);
    },
    // Шаг общего цикла (wake). roots — видимые копии, hidden — спрятанные
    // (полочная, пока колба в руке): пока колба летит домой, им пишется тот
    // же угол, чтобы в миг посадки полочная копия встала с тем же
    // наклоном, что у летевшей.
    //
    // Модель — маятник (у каждого из двух слоёв свой): «низ» жижи (угол a, плюс — вправо) тянется к
    // направлению ДЕЙСТВУЮЩЕЙ тяжести g_eff = g·down − ускорение вещи:
    //   a'' = ω²/g · (g_eff.x·cos a − g_eff.y·sin a) − 2ζω·a'.
    // Тяжесть — Tilt.down() (наклон телефона), ускорение — из того, как
    // сама вещь едет по холсту (её матрица, worldMatrix): палец, взлёт с
    // полки, полёт домой, камера. Поэтому lust.js о колбе ничего не знает.
    // Ускорение входит толчком: перемена скорости за кадр сразу в a', а не
    // второй разностью мест — та шумит от неровного шага кадров.
    // Покой — ни одной записи (как блики пены: телефон неподвижен — ни
    // одной перерисовки).
    flaskTick(roots, hidden, now, dt, mats) {
        const S = this.FLASK.SLOSH, CY = this.FLASK.CY, Lv = this.live;
        const st = Lv.slosh || (Lv.slosh = { a: 0, w: 0, a2: 0, w2: 0, gx: 0, gy: 1, w1A: 0, w1P: 0, w2A: 0, w2P: 0 });
        // Тяжесть с датчика. Лёг на стол — проекция короткая: направление
        // плавно уходит к «вниз по экрану», иначе жижа металась бы от дрожи.
        const D = typeof Tilt !== 'undefined' && Tilt.down ? Tilt.down() : null;
        let gx = 0, gy = 1;
        if (D && D.live) {
            const m = Math.hypot(D.x, D.y), [f0, f1] = S.flat;
            const u = Math.max(0, Math.min(1, (m - f0) / (f1 - f0))), w = u * u * (3 - 2 * u);
            const ax = m > 1e-6 ? D.x / m : 0, ay = m > 1e-6 ? D.y / m : 1;
            const nx = ax * w, ny = ay * w + (1 - w), nl = Math.hypot(nx, ny) || 1;
            gx = nx / nl; gy = ny / nl;
        }
        st.gx += (gx - st.gx) * S.smooth; st.gy += (gy - st.gy) * S.smooth;
        // Толчок: перемена скорости центра шара на холсте. Копия, которая
        // давно не жила (спрятанная, переезд камеры) или прыгнула, — без
        // толчка: её переставили, а не бросили.
        let dvx = 0, dvy = 0;
        roots.forEach(r => {
            let c = Lv.cache.get(r);
            if (!c) { c = this.flaskNodes(r); Lv.cache.set(r, c); }
            // Матрица уже посчитана циклом (видимость) — второй обход предков
            // с DOMMatrix на каждом кадре стоил заметную долю скрипта.
            const m = mats && mats.has(r) ? mats.get(r) : this.worldMatrix(r);
            if (!m || !r.closest('.bt-svg')) return;
            const x = m.c * CY + m.e, y = m.d * CY + m.f, h = (now - (c.at || 0)) / 1000;
            if (!c.p || h > 0.12 || h <= 0 || Math.hypot(x - c.p[0], y - c.p[1]) > S.jump) {
                c.p = [x, y]; c.v = [0, 0]; c.at = now; return;
            }
            const vx = (x - c.p[0]) / h, vy = (y - c.p[1]) / h;
            let ex = vx - c.v[0], ey = vy - c.v[1];
            const el = Math.hypot(ex, ey);
            if (el > S.kick) { ex *= S.kick / el; ey *= S.kick / el; }
            if (Math.hypot(ex, ey) > Math.hypot(dvx, dvy)) { dvx = ex; dvy = ey; }
            c.p = [x, y]; c.v = [vx, vy]; c.at = now;
        });
        // Два маятника — верх (a) и граница (a2): та же тяжесть и тот же
        // толчок, свои частота, затухание и сила тяжести.
        const P1 = this.pend(S.top), P2 = this.pend(S.mid), GAP = this.flaskGap();
        st.w -= (dvx * Math.cos(st.a) - dvy * Math.sin(st.a)) / P1.L;
        st.w2 -= (dvx * Math.cos(st.a2) - dvy * Math.sin(st.a2)) / P2.L;
        const n = Math.max(1, Math.ceil(dt / (S.step / P1.om)));
        const swing = (P, a, w, h) => {
            const v = w + (P.k * (st.gx * Math.cos(a) - st.gy * Math.sin(a)) - P.damp * w) * h, fd = P.fric * h;
            // Сухое трение: меньше него — стоит, больше — вычитается.
            return Math.abs(v) <= fd ? 0 : v - fd * Math.sign(v);
        };
        for (let i = 0; i < n; i++) {
            const h = dt / n;
            st.w = swing(P1, st.a, st.w, h); st.a += st.w * h;
            st.w2 = swing(P2, st.a2, st.w2, h); st.a2 += st.w2 * h;
            // Граница упёрлась в поверхность — дальше её несёт верх (удар
            // без отскока): лиловый слой у стенки истончается, но не рвётся.
            const d = st.a2 - st.a;
            if (Math.abs(d) > GAP) { st.a2 = st.a + Math.sign(d) * GAP; st.w2 = st.w; }
        }
        // Встала рядом с равновесием — ровно в него, и больше не пишется.
        const eq = Math.atan2(st.gx, st.gy);
        if (st.w === 0 && Math.abs(st.a - eq) < S.still) st.a = eq;
        if (st.w2 === 0 && Math.abs(st.a2 - eq) < S.still) st.a2 = eq;
        // Волны ватерлиний — от живости своего маятника (WAVE).
        const WV = this.FLASK.WAVE;
        const env = (A, a, w, om, Wp) => {
            const live = Math.hypot(a - eq, w / om), want = Math.min(Wp.amp, Wp.gain * live);
            A = want > A ? want : A + (want - A) * Wp.rel;
            return A < WV.off ? 0 : A;
        };
        const was1 = st.w1A, was2 = st.w2A;
        st.w1A = env(st.w1A, st.a, st.w, P1.om, WV.top);
        st.w2A = env(st.w2A, st.a2, st.w2, P2.om, WV.mid);
        if (st.w1A) st.w1P += WV.top.speed * dt;
        if (st.w2A) st.w2P += WV.mid.speed * dt;
        // Линии переписываются 15 раз в секунду, пока волна жива, и один
        // раз в миг, когда она стала ровно нулём, — точная прямая.
        const waveNow = ((st.w1A || st.w2A) && !((Lv.n || 0) % 2)) || (was1 && !st.w1A) || (was2 && !st.w2A);
        const LN = waveNow ? this.flaskLines(st.w1A, st.w1P, st.w2A, st.w2P) : null;
        // Пока трут — запись через кадр цикла (15 в секунду), как небо
        // флакона 8: трение — самый тяжёлый кадр ванной, а поворот жижи
        // перерисовывает весь шар с градиентами (замер под 4×: 34 кадра без
        // записей, 29 с записью на каждом). Счёт при этом идёт каждый кадр —
        // качание не замедляется, только реже показывается.
        // Так же — когда верх уже стоит и колышется одна граница: она
        // медленная (0.6 качания в секунду), и 15 кадров её не рвут, а
        // качается она секунд пять после каждого рывка — замер «в руке
        // после рывка» под 4×: 45 кадров с записью на каждом, против 53 до
        // второй жидкости.
        const putLines = (r) => {
            let c = Lv.cache.get(r);
            if (!c) { c = this.flaskNodes(r); Lv.cache.set(r, c); }
            const set = (el, k, v) => { if (el && c[k] !== v) { c[k] = v; el.setAttribute('d', v); Lv.flaskWrites = (Lv.flaskWrites || 0) + 1; } };
            set(c.surf, 'dAll', LN.all); set(c.men, 'dMen', LN.men); set(c.pink, 'dLow', LN.low); set(c.wave, 'dWave', LN.wave);
        };
        if (LN) { roots.forEach(putLines); if (roots.some(r => r.closest('#bt-homing'))) hidden.forEach(putLines); }
        if ((Lv.rub || (st.w === 0 && st.a2 !== st.a)) && (Lv.n || 0) % 2) return;
        const tr = this.flaskRot(st.a), tr2 = this.flaskRot(st.a2 - st.a);
        const put = (r) => {
            let c = Lv.cache.get(r);
            if (!c) { c = this.flaskNodes(r); Lv.cache.set(r, c); }
            if (c.liq && c.tr !== tr) { c.tr = tr; c.liq.setAttribute('transform', tr); Lv.flaskWrites = (Lv.flaskWrites || 0) + 1; }
            if (c.low && c.tr2 !== tr2) { c.tr2 = tr2; c.low.setAttribute('transform', tr2); Lv.flaskWrites = (Lv.flaskWrites || 0) + 1; }
        };
        roots.forEach(put);
        // Спрятанной полочной копии угол нужен только к посадке летящей
        // домой (lust.js, flyHome): в остальное время запись в неё — лишняя
        // перерисовка полки на самом тяжёлом кадре (трение).
        if (roots.some(r => r.closest('#bt-homing'))) hidden.forEach(put);
    },

    // ---------- 6. ЭЛИКСИР ----------
    // Аптечная склянка тёмного стекла с пипеткой — здесь мыло впервые
    // перестаёт быть бытовой химией. Первая версия была «слабой моделькой»:
    // янтарный прямоугольник, жижа ровной полосой, пипетка из чёрных
    // брусков, этикетка за сеткой. Что держит качество теперь:
    //   * СТЕКЛО: видна толщина — внутренняя стенка светлой линией и толстое
    //     дно; края тёмные (там взгляд проходит больше стекла), середина
    //     прозрачная; блики двумя слоями (широкий мягкий и узкий резкий),
    //     окошко на плече; венчик-валик на горле;
    //   * ЖИЖА светится изнутри: ядро ярче краёв, мениск снизу — светлый
    //     эллипс (поверхность ловит свет изнутри), в толще — искры, по
    //     стенкам — зелёный отсвет, в толстом дне — светлый серп;
    //   * трубка пипетки на входе в жижу смещена — преломление;
    //   * пипетка: воротник с мелким рифлением и скруглённым верхом, груша
    //     с раструбом и двумя кольцами у основания;
    //   * бирка на бечёвке висит с плеча — поверх сетки её видно всегда
    //     (наклеенная этикетка пряталась за сеткой);
    //   * ореол двумя слоями — широкий слабый и тесный поярче. Градиенты, без
    //     фильтра (docs/traps.md, п. 73).
    elixir() {
        const P = btPal(), Am = P.soapAmber, Gl = P.soapGlow, Pa = P.soapParch, Ru = P.soapRubber, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        // Бостонская круглая склянка: прямые бока, круглые плечи, горло.
        const bottle = (bx, bot, r, sh, nx, ny) =>
            `M${-bx} ${bot - r}V${sh}C${-bx} ${sh - 9} ${-nx - 6} ${ny + 1} ${-nx} ${ny}V${ny - 7}H${nx}V${ny}`
          + `C${nx + 6} ${ny + 1} ${bx} ${sh - 9} ${bx} ${sh}V${bot - r}Q${bx} ${bot} ${bx - r} ${bot}H${-bx + r}Q${-bx} ${bot} ${-bx} ${bot - r}Z`;
        const BX = 22, BOT = 29, SH = -14, NX = 7.5, NY = -30;
        const body = bottle(BX, BOT, 5, SH, NX, NY);
        const inner = bottle(BX - 2.6, BOT - 5, 4, SH, NX - 2.4, NY + 2);   // полость: стенки и толстое дно
        const lv = -8;                                                       // уровень жижи
        const lip = `M-9.5 ${NY - 7}Q-10.5 ${NY - 7} -10.5 ${NY - 8.8}Q-10.5 ${NY - 10.5} -9.5 ${NY - 10.5}H9.5Q10.5 ${NY - 10.5} 10.5 ${NY - 8.8}Q10.5 ${NY - 7} 9.5 ${NY - 7}Z`;
        const CT = NY - 10.5, CB = CT - 10;                                  // воротник пипетки
        const collar = `M-10 ${CT}V${CB + 2}Q-10 ${CB} -8 ${CB}H8Q10 ${CB} 10 ${CB + 2}V${CT}Z`;
        const bulb = `M-7 ${CB}C-5 ${CB - 1} -4.8 ${CB - 2.5} -5 ${CB - 4}C-7.8 ${CB - 7} -8 ${CB - 13} -5.5 ${CB - 17}`
                   + `Q0 ${CB - 22} 5.5 ${CB - 17}C8 ${CB - 13} 7.8 ${CB - 7} 5 ${CB - 4}C4.8 ${CB - 2.5} 5 ${CB - 1} 7 ${CB}Z`;
        let ribs = '';
        for (let x = -8.6; x <= 8.7; x += 1.9) ribs += `M${f(x)} ${CB + 2.5}V${CT - 0.8}`;

        // Искры в жиже: из сида, мелкие; у двух — крестик.
        const rnd = btRng(606);
        let motes = '';
        for (let i = 0; i < 10; i++) {
            const x = -BX + 6 + rnd() * (2 * BX - 12), y = lv + 5 + rnd() * (BOT - lv - 14), r = 0.4 + rnd() * 0.8;
            motes += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${Gl[4]}" fill-opacity="${(0.6 + rnd() * 0.4).toFixed(2)}"/>`;
            if (i < 2) motes += `<path d="M${f(x - 2.6)} ${f(y)}H${f(x + 2.6)}M${f(x)} ${f(y - 2.6)}V${f(y + 2.6)}" stroke="${Gl[4]}" stroke-width="0.5" stroke-linecap="round"/>`;
        }
        // Бирка: форма бирки со срезанными углами, дырочка с кольцом.
        const tag = 'M0 0H11L13 2.5V15H0Z';

        return `
        <g class="bt-soap bt-soap-elixir" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <radialGradient id="${id}-halo" gradientUnits="userSpaceOnUse" cx="0" cy="8" r="52">
                    <stop offset="0" stop-color="${Gl[2]}" stop-opacity="0.6"/>
                    <stop offset="0.45" stop-color="${Gl[2]}" stop-opacity="0.24"/>
                    <stop offset="1" stop-color="${Gl[2]}" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="${id}-halo2" gradientUnits="userSpaceOnUse" cx="0" cy="10" r="30">
                    <stop offset="0" stop-color="${Gl[3]}" stop-opacity="0.6"/>
                    <stop offset="1" stop-color="${Gl[3]}" stop-opacity="0"/>
                </radialGradient>
                <!-- Жижа светится изнутри: ядро светлее краёв. -->
                <!-- Свечение — это КОНТРАСТ: белёсое ядро и густые края.
                     Ровная мятная заливка читалась краской, а не светом. -->
                <radialGradient id="${id}-liq" gradientUnits="userSpaceOnUse" cx="-3" cy="6" r="21"
                                gradientTransform="translate(-3 6) scale(1.15 1) translate(3 -6)">
                    <stop offset="0" stop-color="${Gl[4]}"/>
                    <stop offset="0.18" stop-color="${Gl[3]}"/>
                    <stop offset="0.5" stop-color="${Gl[2]}"/>
                    <stop offset="0.82" stop-color="${Gl[1]}"/>
                    <stop offset="1" stop-color="${Gl[0]}"/>
                </radialGradient>
                <!-- Янтарь стекла поверх: края густые, середина прозрачная. -->
                <linearGradient id="${id}-amber" gradientUnits="userSpaceOnUse" x1="${-BX}" y1="0" x2="${BX}" y2="0">
                    <stop offset="0" stop-color="${Am[0]}" stop-opacity="0.95"/>
                    <stop offset="0.1" stop-color="${Am[1]}" stop-opacity="0.6"/>
                    <stop offset="0.3" stop-color="${Am[3]}" stop-opacity="0.18"/>
                    <stop offset="0.72" stop-color="${Am[3]}" stop-opacity="0.22"/>
                    <stop offset="0.9" stop-color="${Am[1]}" stop-opacity="0.65"/>
                    <stop offset="1" stop-color="${Am[0]}" stop-opacity="0.95"/>
                </linearGradient>
                <!-- Пустое стекло над жижей: тёмный янтарь. -->
                <linearGradient id="${id}-empty" gradientUnits="userSpaceOnUse" x1="${-BX}" y1="0" x2="${BX}" y2="0">
                    <stop offset="0" stop-color="${Am[0]}"/>
                    <stop offset="0.28" stop-color="${Am[3]}"/>
                    <stop offset="0.6" stop-color="${Am[2]}"/>
                    <stop offset="1" stop-color="${Am[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-rub" gradientUnits="userSpaceOnUse" x1="-10" y1="0" x2="10" y2="0">
                    <stop offset="0" stop-color="${Ru[0]}"/>
                    <stop offset="0.28" stop-color="${Ru[2]}"/>
                    <stop offset="0.45" stop-color="${Ru[1]}"/>
                    <stop offset="1" stop-color="${Ru[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-lip" gradientUnits="userSpaceOnUse" x1="0" y1="${NY - 10.5}" x2="0" y2="${NY - 7}">
                    <stop offset="0" stop-color="${Am[4]}"/>
                    <stop offset="0.45" stop-color="${Am[2]}"/>
                    <stop offset="1" stop-color="${Am[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-tag" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="13" y2="15">
                    <stop offset="0" stop-color="${Pa[2]}"/>
                    <stop offset="1" stop-color="${Pa[1]}"/>
                </linearGradient>
                <clipPath id="${id}-in"><path d="${inner}"/></clipPath>
                <clipPath id="${id}-body"><path d="${body}"/></clipPath>
            </defs>
            <!-- Ореол на кафеле. -->
            <circle class="bs-over" cx="0" cy="8" r="52" fill="url(#${id}-halo)"/>
            <circle class="bs-over" cx="0" cy="10" r="30" fill="url(#${id}-halo2)"/>

            <path d="${body}${lip}${collar}${bulb}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <!-- Стекло: тёмное целиком, полость — светящаяся жижа. -->
            <path d="${body}" fill="url(#${id}-empty)"/>
            <g clip-path="url(#${id}-in)">
                <rect x="${-BX}" y="${lv}" width="${2 * BX}" height="${BOT - lv}" fill="url(#${id}-liq)"/>
                ${motes}
                <!-- Трубка пипетки: над жижей — стекло, в жиже — сдвинута
                     преломлением и налита светом. -->
                <path d="M-1.6 ${NY - 8}V${lv}M1.6 ${NY - 8}V${lv}" stroke="${Am[4]}" stroke-width="0.7" stroke-opacity="0.8"/>
                <path d="M-0.4 ${lv}V${BOT - 12}Q1 ${BOT - 9.5} 2.4 ${BOT - 12}V${lv}" fill="${Gl[4]}" fill-opacity="0.55" stroke="${Gl[1]}" stroke-width="0.6"/>
                <!-- Мениск снизу: светлый эллипс — поверхность ловит свет изнутри. -->
                <ellipse cx="0" cy="${lv}" rx="${BX - 2.6}" ry="2.4" fill="${Gl[3]}" fill-opacity="0.55" stroke="${Gl[4]}" stroke-width="1"/>
                <!-- Отсвет жижи по стенкам. -->
                <path d="${inner}" fill="none" stroke="${Gl[3]}" stroke-width="2.2" stroke-opacity="0.35"/>
            </g>
            <!-- Янтарь поверх всего тела: края густые. -->
            <path d="${body}" fill="url(#${id}-amber)"/>
            <g clip-path="url(#${id}-body)">
                <!-- Толщина стекла: внутренняя стенка светлой линией. -->
                <path d="${inner}" fill="none" stroke="${Am[4]}" stroke-width="0.8" stroke-opacity="0.55"/>
                <!-- Толстое дно: серп света от жижи. -->
                <path d="M${-BX + 6} ${BOT - 2.5}Q0 ${BOT - 0.5} ${BX - 6} ${BOT - 2.5}" fill="none" stroke="${Gl[3]}" stroke-width="1.6" stroke-opacity="0.8" stroke-linecap="round"/>
                <!-- Блики: широкий мягкий, узкий резкий, окошко на плече. -->
                <path d="M${-BX + 6.5} ${SH - 2}V${BOT - 8}" stroke="${F.hi}" stroke-width="5" stroke-opacity="0.16" stroke-linecap="round"/>
                <path d="M${-BX + 5} ${SH}V${BOT - 9}" stroke="${F.hi}" stroke-width="1.6" stroke-opacity="0.9" stroke-linecap="round"/>
                <path d="M${-BX + 9} ${SH + 3}V${SH + 9}" stroke="${F.hi}" stroke-width="1.2" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="M-17 ${SH - 7}C-15 ${SH - 12} -12 ${NY + 3} -9 ${NY + 1.5}" fill="none" stroke="${F.hi}" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
                <!-- Справа край ловит зелёный свет изнутри. -->
                <path d="M${BX - 2} ${SH + 2}V${BOT - 7}" stroke="${Gl[3]}" stroke-width="1.1" stroke-opacity="0.75" stroke-linecap="round"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, Am[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Венчик горла. -->
            <path d="${lip}" fill="url(#${id}-lip)"/>
            <path d="M-8 ${NY - 9.4}H6" stroke="${Am[4]}" stroke-width="0.8" stroke-linecap="round" stroke-opacity="0.9"/>
            <!-- Бечёвка: два витка на горле, узелок, свисает к бирке. -->
            <path d="M-7.5 ${NY + 2.5}Q0 ${NY + 4.5} 7.5 ${NY + 2.5}M-7.8 ${NY + 5}Q0 ${NY + 7} 8 ${NY + 5}" fill="none" stroke="${mixColor(P.soapTwine, ink, 0.35)}" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M-7.5 ${NY + 2.5}Q0 ${NY + 4.5} 7.5 ${NY + 2.5}M-7.8 ${NY + 5}Q0 ${NY + 7} 8 ${NY + 5}" fill="none" stroke="${P.soapTwine}" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M7 ${NY + 4}C12 ${NY + 6} 17 ${NY + 9} 21.5 ${NY + 13.5}" fill="none" stroke="${P.soapTwine}" stroke-width="1" stroke-linecap="round"/>
            <path d="M7 ${NY + 4}q-1 5 1.5 8" fill="none" stroke="${P.soapTwine}" stroke-width="1" stroke-linecap="round"/>
            <circle cx="7" cy="${NY + 4}" r="1.5" fill="${P.soapTwine}" stroke="${mixColor(P.soapTwine, ink, 0.4)}" stroke-width="0.5"/>
            <!-- Бирка висит с плеча, поверх сетки её видно всегда. -->
            <g transform="translate(17 ${NY + 12}) rotate(14)">
                <path d="${tag}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.structure}" stroke-linejoin="round"/>
                <path d="${tag}" fill="url(#${id}-tag)"/>
                <path d="M11 0L13 2.5H11Z" fill="${Pa[0]}"/>
                <circle cx="4.5" cy="2.8" r="1.6" fill="${Pa[0]}"/>
                <circle cx="4.5" cy="2.8" r="0.8" fill="${Am[1]}"/>
                <path d="M3 13C3.5 9 7 6.5 10.5 6.5C10 10 7 12.8 3 13ZM3 13L8.5 8.3" fill="${Gl[1]}" stroke="${Gl[0]}" stroke-width="0.5" stroke-linejoin="round"/>
                <path d="${tag}" fill="none" stroke="${Pa[0]}" stroke-width="0.6"/>
            </g>
            <!-- Воротник пипетки. -->
            <path d="${collar}" fill="url(#${id}-rub)"/>
            <path d="${ribs}" stroke="${Ru[0]}" stroke-width="0.6" stroke-opacity="0.9"/>
            <path d="M-7 ${CB + 1}H6" stroke="${Ru[2]}" stroke-width="1" stroke-linecap="round"/>
            <path d="M-10 ${CT - 0.6}H10" stroke="${Ru[2]}" stroke-width="0.8"/>
            <!-- Груша: раструб, два кольца у основания, мягкий матовый блик. -->
            <path d="${bulb}" fill="url(#${id}-rub)"/>
            <path d="M-5.6 ${CB - 2}Q0 ${CB - 1} 5.6 ${CB - 2}M-5 ${CB - 4}Q0 ${CB - 3} 5 ${CB - 4}" fill="none" stroke="${Ru[0]}" stroke-width="0.8"/>
            <path d="M-4.8 ${CB - 15}Q-6.4 ${CB - 11} -5.4 ${CB - 6}" fill="none" stroke="${Ru[2]}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.9"/>
            <ellipse cx="-2.6" cy="${CB - 17.5}" rx="1.6" ry="0.8" fill="${F.hi}" fill-opacity="0.55" transform="rotate(-30 -2.6 ${CB - 17.5})"/>
        </g>`;
    },

    // ---------- 5. ПРЕМИУМ-ГЕЛЬ ----------
    // Прозрачный флакон с фиолетовым гелем и золотой крышкой. Отличие от
    // простого геля — не цвет, а материал и сдержанность:
    //   * стекло толстое: вокруг геля светлая кайма стенок, блики резкие
    //     (у мягкого пластика они были размытые);
    //   * в геле застыли пузырьки — примета дорогого геля;
    //   * крышка — высокий золотой колпачок: металл с резким перепадом
    //     света и рифлением;
    //   * этикетки нет — только маленькая золотая эмблема на стекле.
    // Стоит крышкой вверх: дорогую вещь ставят на показ.
    premium() {
        const P = btPal(), V = P.soapViolet, Au = P.soapGold, G = P.soapBottle, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        const bx = 18, sh = -38, bot = 29;
        // Плечи — крутой изгиб к горлышку, бока прямые.
        const body = `M${-bx} ${bot - 3}V${sh + 9}C${-bx} ${sh + 2} -12 ${sh - 2} -8 ${sh - 3}V${sh - 7}H8V${sh - 3}`
                   + `C12 ${sh - 2} ${bx} ${sh + 2} ${bx} ${sh + 9}V${bot - 3}Q${bx} ${bot} ${bx - 3} ${bot}H${-bx + 3}Q${-bx} ${bot} ${-bx} ${bot - 3}Z`;
        // Гель: внутри толстых стенок (кайма 3), налит почти до горлышка.
        const w = 3, lv = sh + 5;
        const gel = `M${-bx + w} ${lv}Q0 ${lv + 2} ${bx - w} ${lv}V${bot - 7}Q${bx - w} ${bot - 5} ${bx - w - 3} ${bot - 5}`
                  + `H${-bx + w + 3}Q${-bx + w} ${bot - 5} ${-bx + w} ${bot - 7}Z`;
        const cap = `M-9 ${sh - 7}V${sh - 27}Q-9 ${sh - 30} -6 ${sh - 30}H6Q9 ${sh - 30} 9 ${sh - 27}V${sh - 7}Z`;
        let ribs = '';
        for (let x = -7.5; x <= 7.6; x += 2.5) ribs += `M${f(x)} ${sh - 15}V${sh - 8}`;

        // Пузырьки в геле — из сида, мелкие и разные.
        const rnd = btRng(55);
        let bub = '';
        for (let i = 0; i < 11; i++) {
            const x = -bx + w + 3 + rnd() * (2 * (bx - w) - 6), y = lv + 4 + rnd() * (bot - lv - 14), r = 0.7 + rnd() * 1.7;
            bub += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${V[3]}" fill-opacity="0.5" stroke="${V[4]}" stroke-width="0.5"/>`
                 + `<circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.3)}" fill="${F.hi}" fill-opacity="0.9"/>`;
        }
        // Эмблема: золотой ромб-кристалл с гранью внутри. Листок в кольце
        // читался глазом.
        const emb = 'M0 -6L4.2 0L0 6L-4.2 0ZM0 -3L2.1 0L0 3L-2.1 0Z';

        return `
        <g class="bt-soap bt-soap-premium" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <linearGradient id="${id}-wall" gradientUnits="userSpaceOnUse" x1="${-bx}" y1="0" x2="${bx}" y2="0">
                    <stop offset="0" stop-color="${G.edge}" stop-opacity="0.8"/>
                    <stop offset="0.15" stop-color="${G.wall}" stop-opacity="0.4"/>
                    <stop offset="0.85" stop-color="${G.wall}" stop-opacity="0.3"/>
                    <stop offset="1" stop-color="${G.edge}" stop-opacity="0.85"/>
                </linearGradient>
                <!-- Гель — цилиндр: светлая середина, глубокие края. -->
                <linearGradient id="${id}-gel" gradientUnits="userSpaceOnUse" x1="${-bx + w}" y1="0" x2="${bx - w}" y2="0">
                    <stop offset="0" stop-color="${V[0]}"/>
                    <stop offset="0.3" stop-color="${V[2]}"/>
                    <stop offset="0.55" stop-color="${V[3]}"/>
                    <stop offset="1" stop-color="${V[0]}"/>
                </linearGradient>
                <!-- Золото: резкий перепад — металл, а не жёлтый пластик. -->
                <linearGradient id="${id}-gold" gradientUnits="userSpaceOnUse" x1="-9" y1="0" x2="9" y2="0">
                    <stop offset="0" stop-color="${Au[0]}"/>
                    <stop offset="0.2" stop-color="${Au[3]}"/>
                    <stop offset="0.32" stop-color="${Au[4]}"/>
                    <stop offset="0.45" stop-color="${Au[2]}"/>
                    <stop offset="0.8" stop-color="${Au[1]}"/>
                    <stop offset="0.9" stop-color="${Au[3]}"/>
                    <stop offset="1" stop-color="${Au[0]}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
            </defs>
            <path d="${body}${cap}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="url(#${id}-wall)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${gel}" fill="url(#${id}-gel)" fill-opacity="0.95"/>
                ${bub}
                <path d="M${-bx + w} ${lv}Q0 ${lv + 2} ${bx - w} ${lv}" fill="none" stroke="${V[4]}" stroke-width="1.2"/>
                <!-- Эмблема на стекле. -->
                <g transform="translate(0 -12)">
                    <path d="${emb}" fill="none" stroke="${Au[0]}" stroke-width="1.4" transform="translate(0.4 0.5)"/>
                    <path d="${emb}" fill="none" stroke="${Au[3]}" stroke-width="1"/>
                </g>
                <!-- Стекло: резкий блик слева, тонкое отражение справа, свет
                     по плечу. -->
                <path d="M${-bx + 4.5} ${sh + 8}V${bot - 6}" stroke="${G.hi}" stroke-width="2.2" stroke-opacity="0.95" stroke-linecap="round"/>
                <path d="M${-bx + 8} ${sh + 10}V${sh + 26}" stroke="${G.hi}" stroke-width="0.9" stroke-opacity="0.8" stroke-linecap="round"/>
                <path d="M${bx - 3.5} ${sh + 10}V${bot - 8}" stroke="${G.hi}" stroke-width="1.1" stroke-opacity="0.6" stroke-linecap="round"/>
                <path d="M-14 ${sh + 4}C-12 ${sh} -9 ${sh - 1.5} -7 ${sh - 2}" fill="none" stroke="${G.hi}" stroke-width="1.4" stroke-opacity="0.9" stroke-linecap="round"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, G.edge, 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Колпачок. -->
            <path d="${cap}" fill="url(#${id}-gold)"/>
            <path d="${ribs}" stroke="${Au[0]}" stroke-width="0.8" stroke-opacity="0.7"/>
            <path d="M-9 ${sh - 16}H9" stroke="${Au[4]}" stroke-width="0.9" stroke-opacity="0.8"/>
            <path d="M-6 ${sh - 28.5}H5" stroke="${Au[4]}" stroke-width="1.2" stroke-linecap="round"/>
            <path d="${cap}" fill="none" stroke="${mixColor(ink, Au[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
        </g>`;
    },

    // ---------- 4. ГЕЛЬ ----------
    // Мягкая бутылка геля для душа, стоящая крышкой вниз, — как её и держат
    // в ванной, чтобы гель стекал к горлышку. Что делает её гелем:
    //   * перевёрнутый силуэт: широко вверху, книзу сужается к широкой
    //     откидной крышке (на полке крышка за сеткой — её видно в руке, а
    //     силуэт работает и без неё);
    //   * мягкий пластик: вмятина на боку — бутылку уже сжимали;
    //   * яркий глянцевый непрозрачный цвет и этикетка без букв — белая
    //     волна с пузырьками.
    gel() {
        const P = btPal(), C = P.soapGel, W = P.soapPump, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;

        // Тело: горлышко у крышки (y 17) → плечи наверху → скруглённый верх.
        // Вытянутая: такие бутылки геля высокие. Узкая и высокая с
        // перехватом посередине читалась вазой, приземистая — не гелем;
        // здесь бока почти прямые, перехват только к горлышку.
        const top = -64;
        const body = `M-12 17C-14 8 -21 -2 -21 -18C-21 -44 -20 ${top + 3} -12 ${top}H12C20 ${top + 3} 21 -44 21 -18`
                   + `C21 -2 14 8 12 17Z`;
        // Крышка-откидушка: широкий низ, шов шарнира.
        const cap = `M-13 17H13Q15 17 15 19.5V26.5Q15 29 12.5 29H-12.5Q-15 29 -15 26.5V19.5Q-15 17 -13 17Z`;
        // Этикетка: полоса поперёк тела с волной по верхнему краю.
        // Этикетка — поясом, а не во всё тело: бутылка должна остаться
        // бирюзовой.
        const label = `M-24 -32C-12 -37 -3 -28 8 -33S19 -35 24 -33V-6H-24Z`;
        const wave = `M-24 -22C-14 -27 -5 -17 6 -22S17 -25 24 -22V-17C18 -20 12 -14 5 -17S-13 -21 -24 -16Z`;

        return `
        <g class="bt-soap bt-soap-gel" transform="translate(${A.x - 2} ${A.y + 2})">
            <defs>
                <!-- Цилиндр глянцевого пластика: тёмные края, светлая треть
                     слева, мягкое отражение справа. -->
                <linearGradient id="${id}-body" gradientUnits="userSpaceOnUse" x1="-23" y1="0" x2="23" y2="0">
                    <stop offset="0" stop-color="${C[0]}"/>
                    <stop offset="0.22" stop-color="${C[3]}"/>
                    <stop offset="0.5" stop-color="${C[2]}"/>
                    <stop offset="0.85" stop-color="${C[1]}"/>
                    <stop offset="1" stop-color="${C[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-label" gradientUnits="userSpaceOnUse" x1="-24" y1="0" x2="24" y2="0">
                    <stop offset="0" stop-color="${W[1]}"/>
                    <stop offset="0.25" stop-color="${W[4]}"/>
                    <stop offset="0.8" stop-color="${W[3]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <linearGradient id="${id}-cap" gradientUnits="userSpaceOnUse" x1="-15" y1="0" x2="15" y2="0">
                    <stop offset="0" stop-color="${W[1]}"/>
                    <stop offset="0.3" stop-color="${W[4]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
            </defs>
            <path d="${body}${cap}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="url(#${id}-body)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${label}" fill="url(#${id}-label)"/>
                <path d="${wave}" fill="${C[2]}"/>
                <path d="M-24 -16C-13 -21 -5 -11 6 -17S17 -20 24 -17" fill="none" stroke="${C[1]}" stroke-width="1.2" stroke-opacity="0.7"/>
                <!-- Пузырьки на этикетке. -->
                ${[[-8, -10, 2.6], [1, -12, 1.8], [9, -10, 2.3]].map(([x, y, r]) =>
                    `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${C[2]}" stroke-width="1.1"/>
                     <circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.28}" fill="${C[3]}"/>`).join('')}
                <!-- Край этикетки — тонкий шов. -->
                <path d="M-24 -6H24" stroke="${C[0]}" stroke-width="0.8" stroke-opacity="0.5"/>
                <!-- Вмятина от пальцев: тёмная ложбинка и светлый край. -->
                <path d="M21 -54C14 -51 13 -45 20 -41" fill="none" stroke="${C[0]}" stroke-width="3.2" stroke-opacity="0.45" stroke-linecap="round"/>
                <path d="M18.5 -55C12 -51 11.5 -46 17 -42" fill="none" stroke="${C[4]}" stroke-width="1.3" stroke-opacity="0.8" stroke-linecap="round"/>
                <!-- Глянец: длинный блик слева и горячая точка у плеча. -->
                <path d="M-14 -56C-16 -38 -16 -16 -12 4" fill="none" stroke="${C[4]}" stroke-width="3.2" stroke-opacity="0.75" stroke-linecap="round"/>
                <ellipse cx="-9" cy="-59" rx="3.4" ry="1.5" fill="${F.hi}" fill-opacity="0.95" transform="rotate(-15 -9 -59)"/>
                <!-- Горлышко темнее: туда стекает гель, стенка там толще. -->
                <path d="M-12 12H12" stroke="${C[0]}" stroke-width="6" stroke-opacity="0.35"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, C[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
            <path d="${cap}" fill="url(#${id}-cap)"/>
            <path d="M-15 22.5H15" stroke="${W[1]}" stroke-width="1"/>
            <path d="M-4 22.5V29" stroke="${W[1]}" stroke-width="0.8"/>
            <path d="${cap}" fill="none" stroke="${mixColor(ink, W[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
        </g>`;
    },

    // ---------- 3. ЖИДКОЕ ----------
    // Флакон с дозатором-помпой: первая ступень, где мыло — жидкость. Что
    // делает его дозатором, а не просто бутылкой:
    //   * головка помпы с носиком вбок, на носике висит капля; под головкой
    //     шток и рифлёный воротник на горлышке;
    //   * флакон прозрачный — внутри видна жижа, её поверхность и трубка,
    //     уходящая ко дну;
    //   * цилиндр, а не плашка: объём сказан вертикальными полосами света
    //     (блик слева, отражение справа, тёмные края).
    // Стоит в корзине, помпа чуть выше стоек — это разрешено (разд. 5в).
    pump() {
        const P = btPal(), W = P.soapPump, G = P.soapBottle, L = P.soapPeach, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);

        // Корпус: плечики скруглены, дно на полу корзины (низ за сеткой).
        const bx = 18, sh = -22, bot = 29;
        const body = `M${-bx} ${bot - 4}V${sh + 8}Q${-bx} ${sh} ${-bx + 8} ${sh - 2}H${bx - 8}Q${bx} ${sh} ${bx} ${sh + 8}V${bot - 4}`
                   + `Q${bx} ${bot} ${bx - 4} ${bot}H${-bx + 4}Q${-bx} ${bot} ${-bx} ${bot - 4}Z`;
        // Жижа: до уровня lv, поверхность — узкий эллипс (снизу видна
        // своей нижней кромкой).
        const lv = -11;
        const liq = `M${-bx + 1.2} ${lv}Q0 ${lv + 2.6} ${bx - 1.2} ${lv}V${bot - 4}Q${bx - 1.2} ${bot - 1.2} ${bx - 5} ${bot - 1.2}H${-bx + 5}Q${-bx + 1.2} ${bot - 1.2} ${-bx + 1.2} ${bot - 4}Z`;
        // Воротник, шток, головка и носик.
        const collar = `M-10 ${sh - 12}H10V${sh - 1}H-10Z`;
        const stem = `M-2.6 ${sh - 21}H2.6V${sh - 12}H-2.6Z`;
        const head = `M-9 ${sh - 21}V${sh - 29}Q-9 ${sh - 33} -5 ${sh - 33}H6Q9 ${sh - 33} 10 ${sh - 30}`
                   + `H24Q27 ${sh - 30} 27 ${sh - 27}V${sh - 25}H10V${sh - 21}Z`;
        let ribs = '';
        for (let x = -8; x <= 8; x += 2.7) ribs += `M${f(x)} ${sh - 11}V${sh - 2}`;
        // Трубка: от штока ко дну, чуть изогнута.
        const tube = `M0 ${sh - 1}C1 ${sh + 14} -3 ${bot - 16} -1 ${bot - 3}`;

        return `
        <g class="bt-soap bt-soap-pump" transform="translate(${A.x - 2} ${A.y + 2})">
            <defs>
                <!-- Прозрачная стенка: края плотнее (там взгляд идёт через
                     больше пластика), середина почти пустая. -->
                <linearGradient id="${id}-wall" gradientUnits="userSpaceOnUse" x1="${-bx}" y1="0" x2="${bx}" y2="0">
                    <stop offset="0" stop-color="${G.edge}" stop-opacity="0.75"/>
                    <stop offset="0.18" stop-color="${G.wall}" stop-opacity="0.35"/>
                    <stop offset="0.7" stop-color="${G.wall}" stop-opacity="0.2"/>
                    <stop offset="1" stop-color="${G.edge}" stop-opacity="0.8"/>
                </linearGradient>
                <!-- Жижа — цилиндр: светлее в середине, темнее к стенкам. -->
                <linearGradient id="${id}-liq" gradientUnits="userSpaceOnUse" x1="${-bx}" y1="0" x2="${bx}" y2="0">
                    <stop offset="0" stop-color="${L[1]}"/>
                    <stop offset="0.35" stop-color="${L[3]}"/>
                    <stop offset="0.65" stop-color="${L[2]}"/>
                    <stop offset="1" stop-color="${L[0]}"/>
                </linearGradient>
                <!-- Белый пластик помпы: тот же цилиндрический свет. -->
                <linearGradient id="${id}-cap" gradientUnits="userSpaceOnUse" x1="-10" y1="0" x2="10" y2="0">
                    <stop offset="0" stop-color="${W[1]}"/>
                    <stop offset="0.3" stop-color="${W[4]}"/>
                    <stop offset="0.7" stop-color="${W[3]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <linearGradient id="${id}-head" gradientUnits="userSpaceOnUse" x1="0" y1="${sh - 33}" x2="0" y2="${sh - 21}">
                    <stop offset="0" stop-color="${W[4]}"/>
                    <stop offset="0.6" stop-color="${W[3]}"/>
                    <stop offset="1" stop-color="${W[1]}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
            </defs>
            <path d="${body}${collar}${stem}${head}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${body}" fill="url(#${id}-wall)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${tube}" fill="none" stroke="${G.edge}" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="${liq}" fill="url(#${id}-liq)" fill-opacity="0.92"/>
                <!-- Перламутр: мягкая светлая жилка в толще. -->
                <path d="M-8 ${lv + 8}C-2 ${lv + 14} 4 ${lv + 4} 9 ${lv + 12}" fill="none" stroke="${L[4]}" stroke-width="3" stroke-opacity="0.45" stroke-linecap="round"/>
                <!-- Трубка сквозь жижу: темнее. -->
                <path d="${tube}" fill="none" stroke="${L[0]}" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round"
                      clip-path="url(#${id}-clip)"/>
                <!-- Поверхность жижи: светлая кромка. -->
                <path d="M${-bx + 1.2} ${lv}Q0 ${lv + 2.6} ${bx - 1.2} ${lv}" fill="none" stroke="${L[4]}" stroke-width="1.4"/>
                <!-- Блик стенки слева и отражение справа — это и делает цилиндр. -->
                <path d="M${-bx + 5} ${sh + 4}V${bot - 6}" stroke="${G.hi}" stroke-width="3" stroke-opacity="0.8" stroke-linecap="round"/>
                <path d="M${-bx + 9} ${sh + 6}V${sh + 22}" stroke="${G.hi}" stroke-width="1.2" stroke-opacity="0.6" stroke-linecap="round"/>
                <path d="M${bx - 4} ${sh + 6}V${bot - 8}" stroke="${G.hi}" stroke-width="1.4" stroke-opacity="0.45" stroke-linecap="round"/>
            </g>
            <path d="${body}" fill="none" stroke="${mixColor(ink, G.edge, 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Воротник с рифлением. -->
            <path d="${collar}" fill="url(#${id}-cap)"/>
            <path d="${ribs}" stroke="${W[1]}" stroke-width="0.9"/>
            <path d="M-10 ${sh - 1}H10" stroke="${W[0]}" stroke-width="1.2" stroke-opacity="0.6"/>
            <path d="${stem}" fill="url(#${id}-cap)"/>
            <path d="${head}" fill="url(#${id}-head)"/>
            <path d="M-6 ${sh - 31}H5" stroke="${W[4]}" stroke-width="1.6" stroke-linecap="round"/>
            <path d="${head}" fill="none" stroke="${mixColor(ink, W[0], 0.5)}" stroke-width="${STROKE.hairline}"/>
            <!-- Капля на носике. -->
            <path d="M24 ${sh - 25}C24 ${sh - 22} 22.2 ${sh - 20.5} 22.2 ${sh - 18.8}A1.9 1.9 0 0 0 26 ${sh - 18.8}C26 ${sh - 20.5} 24.2 ${sh - 22} 24.2 ${sh - 25}Z"
                  fill="${L[2]}" stroke="${mixColor(ink, L[0], 0.4)}" stroke-width="0.7"/>
            <circle cx="23.4" cy="${sh - 19.6}" r="0.6" fill="${F.hi}"/>
        </g>`;
    },

    // ---------- 2. ТУАЛЕТНОЕ ----------
    // Розоватый скруглённый брусок на мыльнице. Розовая скруглённая плашка
    // сама по себе читается ластиком или конфетой, поэтому мылом её делают
    // три вещи сразу:
    //   * МЫЛЬНИЦА (только на полке): фаянсовая ракушка с волнистым краем.
    //     Корзина выше глаза, поэтому видна не чаша изнутри, а передний борт
    //     — выпуклой дугой, ближняя точка выше всего. Борт высокий: низкую
    //     мыльницу целиком закрыла бы передняя сетка;
    //   * выпуклая эмблема — цветок в овальной рамке. Выпуклая, а не
    //     вдавленная, как у хозяйственного: свет на верхней кромке, тень на
    //     нижней;
    //   * полуглянец (мягкий отлив и точечный блик) и пара пузырьков пены у
    //     борта — им только что мылись.
    // Брусок — плоская овальная подушка лицом к нам (не углом: так он уходил
    // в глубину кирпичом). Плашкой в лоб он не выглядит, потому что объём
    // держит купол светотенью и поясок толщины снизу.
    toilet(where) {
        const P = btPal(), K = P.soapPink, Dc = P.soapDish, F = P.foam, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);
        const pt = (p) => `${f(p[0])} ${f(p[1])}`;

        // Брусок — невысокая овальная «подушка» лицом к нам. Развёрнутый
        // углом, как хозяйственный, он уходил в глубину кирпичом: туалетное
        // мыло плоское и круглое, и объём ему даёт купол светотенью, а не
        // торец. Силуэт — суперэллипс (между овалом и прямоугольником с
        // круглыми углами); купол — такой же, чуть меньше и выше, а полоса
        // между ними внизу — боковой поясок толщины.
        const oval = (cx, cy, rx, ry, n) => {
            let d = '';
            for (let i = 0; i < 48; i++) {
                const a = 2 * Math.PI * i / 48, c = Math.cos(a), sn = Math.sin(a);
                const x = cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
                const y = cy + ry * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
                d += (i ? 'L' : 'M') + pt([x, y]);
            }
            return d + 'Z';
        };
        const sil = oval(0, -12, 40, 17, 3.2);
        const dome = oval(0, -14.5, 38.5, 14.5, 3.2);

        // Эмблема: овальная рамка и цветок из пяти лепестков.
        let petals = '';
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * 2 * Math.PI / 5, x = Math.cos(a) * 3.2, y = Math.sin(a) * 3.2;
            petals += `M${f(x - 2.2)} ${f(y)}a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0`;
        }
        const emblem = `M-12 0a12 7.5 0 1 0 24 0a12 7.5 0 1 0 -24 0` + petals + 'M-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0';
        const eT = 'translate(3 -14)';

        // Мыльница.
        let dish = '';
        if (where === 'shelf') {
            // Верхний край борта: дуга (ближняя середина выше краёв) и
            // волна-ракушка по ней.
            const W = 47, top = (x) => -4 + 6 * (x / W) * (x / W);
            let edge = `M${f(-W)} ${f(top(-W))}`;
            const n = 8;
            for (let i = 0; i < n; i++) {
                const x0 = -W + 2 * W * i / n, x1 = -W + 2 * W * (i + 1) / n, xm = (x0 + x1) / 2;
                edge += `Q${f(xm)} ${f(top(xm) - 3.6)} ${f(x1)} ${f(top(x1))}`;
            }
            const body = edge + `Q${W + 1} ${f(top(W) + 6)} ${W - 6} 20Q${W - 12} 30 ${W - 22} 31H${-W + 22}Q${-W + 12} 30 ${-W + 6} 20Q${-W - 1} ${f(top(-W) + 6)} ${-W} ${f(top(-W))}Z`;
            // Рёбрышки ракушки: веером от ножки.
            let ribs = '';
            for (let i = 1; i < n; i++) {
                const x = -W + 2 * W * i / n;
                ribs += `M${f(x)} ${f(top(x) + 1)}Q${f(x * 0.8)} ${f(top(x) + 14)} ${f(x * 0.45)} 31`;
            }
            dish = `
            <clipPath id="${id}-dish-clip"><path d="${body}"/></clipPath>
            <g class="bt-soap-dish">
                <path d="${body}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
                <path d="${body}" fill="url(#${id}-dish)"/>
                <g clip-path="url(#${id}-dish-clip)">
                    <path d="${ribs}" fill="none" stroke="${Dc[1]}" stroke-width="1.2" stroke-opacity="0.45"/>
                    <path d="${ribs}" fill="none" stroke="${Dc[4]}" stroke-width="0.8" stroke-opacity="0.6" transform="translate(-1.2 0)"/>
                    <!-- Глазурь: вертикальный блик слева и отсвет справа. -->
                    <rect x="-34" y="-12" width="9" height="44" fill="url(#${id}-glaze)"/>
                    <!-- Закатанный край борта светлее тела. -->
                    <path d="${edge}" fill="none" stroke="${Dc[4]}" stroke-width="3" stroke-opacity="0.9" transform="translate(0 1.8)"/>
                </g>
                <path d="${edge}" fill="none" stroke="${mixColor(ink, Dc[1], 0.5)}" stroke-width="${STROKE.hairline}"/>
            </g>`;
        }

        return `
        <g class="bt-soap bt-soap-toilet" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <!-- Купол: свет сверху-слева, к краям подушка уходит в тень. -->
                <radialGradient id="${id}-dome" gradientUnits="userSpaceOnUse" cx="-12" cy="-22" r="48"
                                gradientTransform="translate(-12 -22) scale(1 0.6) translate(12 22)">
                    <stop offset="0" stop-color="${K[4]}"/>
                    <stop offset="0.45" stop-color="${K[3]}"/>
                    <stop offset="0.8" stop-color="${K[2]}"/>
                    <stop offset="1" stop-color="${K[1]}"/>
                </radialGradient>
                <!-- Полуглянец: мягкий отлив по верху купола. -->
                <radialGradient id="${id}-sheen" gradientUnits="userSpaceOnUse" cx="-12" cy="-24" r="20"
                                gradientTransform="translate(-12 -24) scale(1.3 0.35) translate(12 24)">
                    <stop offset="0" stop-color="${F.hi}" stop-opacity="0.8"/>
                    <stop offset="1" stop-color="${F.hi}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="${id}-dish" gradientUnits="userSpaceOnUse" x1="0" y1="-6" x2="0" y2="31">
                    <stop offset="0" stop-color="${Dc[3]}"/>
                    <stop offset="0.35" stop-color="${Dc[2]}"/>
                    <stop offset="1" stop-color="${Dc[0]}"/>
                </linearGradient>
                <linearGradient id="${id}-glaze" gradientUnits="userSpaceOnUse" x1="-34" y1="0" x2="-25" y2="0">
                    <stop offset="0" stop-color="${Dc[4]}" stop-opacity="0"/>
                    <stop offset="0.5" stop-color="${Dc[4]}" stop-opacity="0.85"/>
                    <stop offset="1" stop-color="${Dc[4]}" stop-opacity="0"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${sil}"/></clipPath>

            </defs>
            <path d="${sil}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <!-- Поясок толщины: темнее купола, снизу отсвет от мыльницы. -->
            <path d="${sil}" fill="${K[1]}"/>
            <g clip-path="url(#${id}-clip)">
                <path d="M-40 1Q0 9 40 1" fill="none" stroke="${K[2]}" stroke-width="2.2" stroke-opacity="0.8"/>
                <path d="${dome}" fill="url(#${id}-dome)"/>
                <!-- Кромка купола: мягкий переход в поясок, а не ребро. -->
                <path d="${dome}" fill="none" stroke="${K[2]}" stroke-width="1.4" stroke-opacity="0.7"/>
                <!-- Эмблема выпуклая: свет сверху-слева, тень снизу-справа. -->
                <g transform="${eT}">
                    <path d="${emblem}" fill="none" stroke="${K[1]}" stroke-width="1.3" stroke-opacity="0.6" transform="translate(0.6 0.7)"/>
                    <path d="${emblem}" fill="none" stroke="${K[4]}" stroke-width="1.3" transform="translate(-0.5 -0.6)"/>
                    <path d="${emblem}" fill="none" stroke="${K[3]}" stroke-width="1"/>
                </g>
                <path d="${dome}" fill="url(#${id}-sheen)"/>
                <ellipse cx="-17" cy="-24.5" rx="4.5" ry="1.4" fill="${F.hi}" fill-opacity="0.9" transform="rotate(-6 -17 -24.5)"/>
            </g>
            <path d="${sil}" fill="none" stroke="${mixColor(ink, K[0], 0.5)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            ${where === 'shelf' ? `
            <!-- Пена у борта: им только что мылись. -->
            <g class="bt-soap-suds">
                ${[[-18, -5, 3.4], [-12.5, -7, 2.4], [-8.5, -5, 1.6], [23, -4.5, 3], [28, -7, 2]].map(([x, y, r]) =>
                    `<circle cx="${x}" cy="${y}" r="${r}" fill="${F[500]}" fill-opacity="0.85" stroke="${F.rim}" stroke-width="0.5"/>
                     <circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="${F.hi}"/>`).join('')}
            </g>` : ''}
            ${dish}
        </g>`;
    },

    // ---------- 1. ХОЗЯЙСТВЕННОЕ ----------
    // Целый брусок «72%». Две прежние попытки провалились, и обе поучительны:
    //   * в обёртке — лишнее: вещь должна читаться самим мылом;
    //   * лицом к нам, светло-жёлтый, с ровными яркими фасками и крупным
    //     «72%» по центру — золотой слиток или табличка «скидка 72%».
    //     Плоская грань в лоб — это плашка, а не кирпич.
    // Что делает его мылом:
    //   * брусок развёрнут углом, видны ДВЕ грани — длинная и торец — и
    //     ближнее ребро выше всего: корзина выше глаза, поэтому верхние
    //     рёбра уходят вниз от ближнего угла (крыша «домиком»). Низ закрыт
    //     сеткой, как и у всего в корзине;
    //   * цвет тёмный коричнево-охристый и матовый, рёбра мягкие —
    //     скруглённые светом, а не срезанные фаской;
    //   * белёсый содовый налёт пятнами — по нему хозяйственное мыло
    //     узнаётся сразу;
    //   * клеймо небольшое и лежит В грани — наклонено вместе с ней.
    bar() {
        const P = btPal(), S = P.soapBar, R = S.ramp, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;
        const f = (v) => v.toFixed(1);
        const pt = (p) => `${f(p[0])} ${f(p[1])}`;

        // Углы. N — ближнее вертикальное ребро, L — дальний конец торца
        // (слева), Rr — дальний конец длинной грани (справа). Верхние рёбра
        // уходят вниз круче нижних: верх дальше от горизонта.
        // Снизу видно и ДНО (Bb — дальний нижний угол): без третьей грани
        // брусок читался согнутым листом картона. На полке дно закрыто
        // сеткой; ничего не опускается ниже 33 — иначе торчит из-под корзины.
        const Nt = [-12, -24], Nb = [-12, 18];
        const Rt = [50, -14.5], Rb = [50, 23];
        const Lt = [-34, -12.5], Lb = [-34, 24];
        const Bb = [Lb[0] + Rb[0] - Nb[0], Lb[1] + Rb[1] - Nb[1] + 3];
        const longF = `M${pt(Nt)}L${pt(Rt)}L${pt(Rb)}L${pt(Nb)}Z`;
        const endF = `M${pt(Lt)}L${pt(Nt)}L${pt(Nb)}L${pt(Lb)}Z`;
        const botF = `M${pt(Lb)}L${pt(Nb)}L${pt(Rb)}L${pt(Bb)}Z`;
        // Силуэт со скруглёнными углами: у мыла нет острых вершин.
        const round = (pts, q) => {
            let d = '';
            for (let i = 0; i < pts.length; i++) {
                const a = pts[(i + pts.length - 1) % pts.length], p = pts[i], c = pts[(i + 1) % pts.length];
                const ka = q / Math.hypot(a[0] - p[0], a[1] - p[1]), kc = q / Math.hypot(c[0] - p[0], c[1] - p[1]);
                const p0 = [p[0] + (a[0] - p[0]) * ka, p[1] + (a[1] - p[1]) * ka];
                const p1 = [p[0] + (c[0] - p[0]) * kc, p[1] + (c[1] - p[1]) * kc];
                d += (i ? 'L' : 'M') + pt(p0) + 'Q' + pt(p) + ' ' + pt(p1);
            }
            return d + 'Z';
        };
        const sil = round([Lt, Nt, Rt, Rb, Bb, Lb], 4);

        // Налёт: неровные пятна, гуще у рёбер — там мыло сохнет первым.
        const rnd = btRng(1972);
        const blobs = [];
        const blob = (cx, cy, rx, ry) => {
            const n = 7, q = [];
            for (let i = 0; i < n; i++) {
                const a = 2 * Math.PI * i / n, k = 0.6 + rnd() * 0.6;
                q.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
            }
            let d = `M${pt([(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2])}`;
            for (let i = 1; i <= n; i++) {
                const p = q[i % n], c = q[(i + 1) % n];
                d += `Q${pt(p)} ${pt([(p[0] + c[0]) / 2, (p[1] + c[1]) / 2])}`;
            }
            return d + 'Z';
        };
        for (const [x, y, rx, ry] of [[-9, -17, 9, 5], [44, -9, 7, 7], [22, -15, 11, 4], [-29, -5, 5, 8], [-21, 8, 4, 8],
                                      [36, 6, 7, 5], [2, 10, 8, 4], [12, -4, 5, 3], [-4, 0, 4, 5]])
            blobs.push(blob(x, y, rx, ry));
        // Поры и мелкие вмятинки.
        let pores = '';
        for (let i = 0; i < 10; i++) {
            const x = -32 + rnd() * 80, y = -18 + rnd() * 34, q = 0.35 + rnd() * 0.45;
            pores += `M${f(x - q)} ${f(y)}a${q.toFixed(2)} ${q.toFixed(2)} 0 1 0 ${(2 * q).toFixed(2)} 0a${q.toFixed(2)} ${q.toFixed(2)} 0 1 0 ${(-2 * q).toFixed(2)} 0Z`;
        }

        // Клеймо — в плоскости длинной грани: сдвиг по её наклону, сжатие
        // по ширине. Небольшое — это клеймо, а не вывеска.
        const slope = (Rt[1] - Nt[1]) / (Rt[0] - Nt[0]);
        const mark = 'M-24 -14L-12 -14L-19 4'
                   + 'M-7 -10.5Q-5 -15 -0.5 -14.5Q4 -14 3 -8.5L-7 4L4 4'
                   + 'M9 4L21 -14'
                   + 'M8.1 -10a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0'
                   + 'M17.1 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0';
        const mT = `translate(19 -3) skewY(${(Math.atan(slope) * 180 / Math.PI).toFixed(1)}) scale(0.6 0.62) translate(1 5)`;

        return `
        <g class="bt-soap bt-soap-bar" transform="translate(${A.x} ${A.y + 2})">
            <defs>
                <!-- Длинная грань смотрит вперёд-вправо: средний тон, к
                     дальнему концу темнее. -->
                <linearGradient id="${id}-long" gradientUnits="userSpaceOnUse" x1="${Nt[0]}" y1="0" x2="${Rt[0]}" y2="0">
                    <stop offset="0" stop-color="${R[2]}"/>
                    <stop offset="0.3" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${mixColor(R[1], R[0], 0.35)}"/>
                </linearGradient>
                <!-- Торец смотрит влево, к свету: светлее. -->
                <linearGradient id="${id}-end" gradientUnits="userSpaceOnUse" x1="${Lt[0]}" y1="${Lt[1]}" x2="${Nb[0]}" y2="${Nb[1]}">
                    <stop offset="0" stop-color="${mixColor(R[4], S.bloom, 0.12)}"/>
                    <stop offset="1" stop-color="${R[4]}"/>
                </linearGradient>
                <!-- Мягкое скруглённое ребро: свет растекается с него на обе
                     грани, без резкой кромки. -->
                <linearGradient id="${id}-edge" gradientUnits="userSpaceOnUse" x1="${Nt[0] - 3.5}" y1="0" x2="${Nt[0] + 1.5}" y2="0">
                    <stop offset="0" stop-color="${R[4]}" stop-opacity="0"/>
                    <stop offset="0.6" stop-color="${mixColor(R[4], S.bloom, 0.3)}" stop-opacity="0.9"/>
                    <stop offset="1" stop-color="${R[4]}" stop-opacity="0"/>
                </linearGradient>
                <!-- Налёт пыльный: пятно без края, плотнее к середине. -->
                <radialGradient id="${id}-bloom">
                    <stop offset="0" stop-color="${S.bloom}" stop-opacity="0.45"/>
                    <stop offset="0.6" stop-color="${S.bloom}" stop-opacity="0.22"/>
                    <stop offset="1" stop-color="${S.bloom}" stop-opacity="0"/>
                </radialGradient>
                <clipPath id="${id}-clip"><path d="${sil}"/></clipPath>
                <clipPath id="${id}-long-clip"><path d="${longF}"/></clipPath>
            </defs>
            <path d="${sil}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${longF}" fill="url(#${id}-long)"/>
                <path d="${endF}" fill="url(#${id}-end)"/>
                <!-- Дно смотрит вниз, от лампы: самое тёмное. -->
                <path d="${botF}" fill="${R[0]}"/>
                <path d="M${pt(Lb)}L${pt(Nb)}L${pt(Rb)}" fill="none" stroke="${R[2]}" stroke-width="1.6" stroke-opacity="0.6" stroke-linejoin="round"/>
                <rect x="${Nt[0] - 3.5}" y="${Nt[1] - 2}" width="5" height="${Nb[1] - Nt[1] + 2}" fill="url(#${id}-edge)"/>
                <!-- Верхние рёбра скруглены: узкий свет вдоль кромки. -->
                <path d="M${pt([Lt[0], Lt[1] + 1.6])}L${pt([Nt[0], Nt[1] + 1.6])}L${pt([Rt[0], Rt[1] + 1.6])}" fill="none"
                      stroke="${R[4]}" stroke-width="2.4" stroke-opacity="0.55" stroke-linejoin="round"/>
                <path d="${pores}" fill="${R[0]}" fill-opacity="0.3"/>
                <g clip-path="url(#${id}-long-clip)">
                    <g transform="${mT}">
                        <path d="${mark}" fill="none" stroke="${R[3]}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"
                              transform="translate(0.6 1)" stroke-opacity="0.8"/>
                        <path d="${mark}" fill="none" stroke="${S.mark}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                              stroke-opacity="0.75"/>
                    </g>
                </g>
                ${blobs.map(d => `<path d="${d}" fill="url(#${id}-bloom)"/>`).join('')}
            </g>
            <!-- Граница граней — не линия, а стык тонов; тонкая тень только
                 внизу, где ребро уходит от света. -->
            <path d="${sil}" fill="none" stroke="${mixColor(ink, R[1], 0.5)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
        </g>`;
    },

    // ---------- 0. ОБМЫЛОК ----------
    // Жалкий огрызок хозяйственного «72%»: то, что остаётся, когда мылом
    // мылись годами и выбросить всё жалко. Узнаётся по цвету и по обрывку
    // клейма, а жалким его делает всё остальное:
    //   * он МАЛЕНЬКИЙ — вдвое меньше бруска, и тонкий: торец — ниточка,
    //     края просвечивают (истёртое мыло на краю стекленеет);
    //   * покороблен и завален набок — стоять ровно ему уже нечем;
    //   * угол отколот, скол светлее — внутри мыло ещё свежее;
    //   * от клейма осталась «7» и кусок «2»;
    //   * трещина насквозь, сухие трещинки, въевшаяся грязь;
    //   * прилипший волос свешивается через край;
    //   * на полке — мыльная сопля тянется из корзины вниз.
    // Кусок стоит на ребре у стенки корзины: плашмя он целиком прятался бы
    // за передней сеткой (она закрывает нижние 17 единиц).
    stub(where) {
        const P = btPal(), S = P.soapStub, R = S.ramp, ink = PALETTE.ink;
        const id = 'bsp' + (this.uid++);
        const A = BATH_ART.slots().soap;

        // Лицо: кривой обкатанный лоскут. Острые только вершины скола.
        const CHIP = [[6, -17], [10, -11], [14, -13], [19, -7]];
        // Форма — всё ещё брусок (плоский, шире, чем выше), только стёртый:
        // круглый огрызок читался картофелиной, а не мылом.
        const face = 'M-24 -12Q-22 -17 -14 -16.5Q-4 -15 6 -17'
            + CHIP.slice(1).map(p => `L${p[0]} ${p[1]}`).join('')
            + 'Q24 -4 24 4Q24 13 16 15L-16 16Q-25 16 -25 6Q-26 -6 -24 -12Z';
        // Торец — ниточка: кусок почти прозрачный по толщине.
        const T = { x: 2, y: 1.3 };
        const back = `<path d="${face}" transform="translate(${T.x} ${T.y})"`;
        const c0 = CHIP.map(p => `${p[0]} ${p[1]}`), c1 = CHIP.map(p => `${p[0] + T.x} ${p[1] + T.y}`).reverse();
        const fracture = `M${c0.join('L')}L${c1.join('L')}Z`;
        const scarRim = 'M19 -7L16 -4L11.5 -6L7.5 -10L3.5 -16L6 -17';
        const scar = `M${c0.join('L')}` + scarRim.replace(/^M19 -7/, '') + 'Z';

        const craq = 'M24 2L19.5 3.5L16 1.5M19.5 3.5L18.5 8M-25 3L-21 4.5L-18.5 2';
        const crack = 'M-4 -15.5L-6 -10L-2 -5L-4 1L-1 7';
        // Обрывок клейма: «7» и начало «2», стёртые почти до гладкого.
        const mark = 'M-20 -10L-12 -10L-16 1M-8 -7.5Q-6.5 -11 -3.5 -10.5Q-1 -10 -2 -6';
        // Въевшаяся грязь: серые точки в порах.
        const rnd = btRng(27);
        let dirt = '';
        for (let i = 0; i < 14; i++) {
            const x = -21 + rnd() * 42, y = -13 + rnd() * 25, r = 0.4 + rnd() * 0.7;
            dirt += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;
        }
        // Мыльная сопля из корзины: только на полке. Висит из-под дна
        // (передний край дна — BATH_SHELF.FLOORS[0]) и собирается в каплю.
        let goo = '';
        if (where === 'shelf') {
            const fy = BATH_SHELF.FLOORS[0], x = A.x + 6;
            const d = `M${x - 3.2} ${fy}C${x - 3} ${fy + 5} ${x - 1.2} ${fy + 7} ${x - 1.5} ${fy + 10}`
                    + `C${x - 3.4} ${fy + 12} ${x - 2.6} ${fy + 16.5} ${x} ${fy + 16.5}`
                    + `C${x + 2.6} ${fy + 16.5} ${x + 3.2} ${fy + 12} ${x + 1.3} ${fy + 10}`
                    + `C${x + 1} ${fy + 7} ${x + 3} ${fy + 5} ${x + 3.2} ${fy}Z`;
            goo = `<g class="bt-soap-goo">
                <path d="${d}" fill="none" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-opacity="0.6"/>
                <path d="${d}" fill="${S.fresh}" fill-opacity="0.8"/>
                <path d="M${x - 0.9} ${fy + 11.8}q-0.6 1.6 0.4 2.8" fill="none" stroke="${P.soapLit}" stroke-width="0.9" stroke-linecap="round"/>
            </g>`;
        }

        return `
        <g class="bt-soap bt-soap-stub" transform="translate(${A.x + 2} ${A.y + 3}) rotate(-7)">
            <defs>
                <!-- Свет сверху-слева; покоробленный кусок темнеет к
                     завёрнутому краю. -->
                <linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="-24" y1="-17" x2="22" y2="16">
                    <stop offset="0" stop-color="${R[3]}"/>
                    <stop offset="0.45" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${R[1]}"/>
                </linearGradient>
                <!-- Затёртая середина — тусклый восковой отлив. -->
                <radialGradient id="${id}-wax" gradientUnits="userSpaceOnUse" cx="-9" cy="-7" r="14"
                                gradientTransform="translate(-9 -7) scale(1.4 0.8) translate(9 7)">
                    <stop offset="0" stop-color="${P.soapLit}" stop-opacity="0.4"/>
                    <stop offset="1" stop-color="${P.soapLit}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="${id}-scar" gradientUnits="userSpaceOnUse" x1="12" y1="-14" x2="8" y2="-7">
                    <stop offset="0" stop-color="${S.fresh}"/>
                    <stop offset="1" stop-color="${mixColor(S.fresh, R[2], 0.55)}"/>
                </linearGradient>
                <clipPath id="${id}-clip"><path d="${face}"/></clipPath>
            </defs>
            ${back} fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            <path d="${face}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            ${back} fill="${R[0]}"/>
            <path d="${fracture}" fill="${S.fresh}"/>
            <path d="${face}" fill="url(#${id}-face)"/>
            <g clip-path="url(#${id}-clip)">
                <!-- Истёртый край просвечивает: светлая стеклянная кайма. -->
                <path d="${face}" fill="none" stroke="${S.fresh}" stroke-width="4.5" stroke-opacity="0.45"/>
                <!-- Покороблен: вдоль изгиба — тень прогиба. -->
                <path d="M-25 7Q0 2 24 -1" fill="none" stroke="${R[0]}" stroke-width="7" stroke-opacity="0.18" stroke-linecap="round"/>
                <path d="${face}" fill="url(#${id}-wax)"/>
                <path d="${mark}" fill="none" stroke="${P.soapLit}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
                      stroke-opacity="0.4" transform="translate(0.5 0.6)"/>
                <path d="${mark}" fill="none" stroke="${P.soapMark}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
                      stroke-opacity="0.6"/>
                <path d="${dirt}" fill="${S.crack}" fill-opacity="0.45"/>
                <path d="${scar}" fill="url(#${id}-scar)"/>
                <path d="${scarRim}" fill="none" stroke="${S.crack}" stroke-width="${STROKE.hairline}" stroke-linejoin="round" stroke-opacity="0.8"/>
                <path d="${craq}" fill="none" stroke="${S.crack}" stroke-width="${STROKE.hairline}" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="${crack}" fill="none" stroke="${P.soapLit}" stroke-width="0.6" stroke-opacity="0.5" transform="translate(0.6 0.4)"/>
                <path d="${crack}" fill="none" stroke="${S.crack}" stroke-width="1.1" stroke-linejoin="round"/>
            </g>
            <path d="${face}" fill="none" stroke="${mixColor(ink, R[1], 0.4)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            <!-- Волос: прилип к лицу и свешивается через край. -->
            <path class="bs-over" d="M-14 -2C-8 -7 -4 1 2 -3S10 0 13 5Q17 11 15 18Q13 24 17 29" fill="none" stroke="${S.hair}"
                  stroke-width="0.55" stroke-linecap="round"/>
        </g>${goo}`;
    }
};

if (typeof window !== 'undefined') window.BATH_SOAP = BATH_SOAP;
