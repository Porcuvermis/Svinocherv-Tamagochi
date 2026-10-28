// ================= АППАРАТ АЛЧНОСТИ: СЛУЖЕБНЫЕ КАРТЫ ДЛЯ СВЕТА =================
// Свет корпуса считается не рисунком, а шейдером — один источник на всю
// сцену, блики и тени от него (как у монет рамки алчности). Для этого
// рисунок корпуса умеет выходить в нескольких проходах:
//
//   baked   — как раньше: свет и тени нарисованы руками (запасной вид,
//             когда нет видеокарты);
//   albedo  — только цвет и фактура материала, без нарисованного света:
//             градиенты сплющены в ровный цвет, тени и блики спрятаны;
//   height  — карта высот: каждая деталь — оттенок серого по своей высоте
//             над задней стенкой, дыры — ниже своей детали, болты — выше;
//   mat     — карта материалов: R — сила блика, G — его острота (блеск),
//             B — металл ли это (блик металла окрашен его цветом).
//
// Высота и материал не дописываются в каждую фигуру: деталь оборачивается
// в <g style="--h:…;--m:…"> (GreedJunk.T), а проход перекрашивает всё по
// этим переменным одним <style>. CSS-переменная наследуется, и ближайшая
// обёртка побеждает — так болт на пластине на ступице получает высоту
// своей ступицы плюс свою прибавку (класс bump).
//
// Разметка фигур внутри деталей: fx — нарисованные тень/затемнение,
// hl — нарисованный блик, pit — углубление (дыра, паз, щель).
Object.assign(GreedJunk, {

    pass: 'baked',

    // Материалы — общий справочник src/core/materials.js (MATERIALS):
    // здесь только имя материала на детали, свойства берутся оттуда.

    // Высота детали в единицах каталога (задняя стенка — 0) → доля 0..1
    // карты высот. Ниже стенки бывают только щели и дыры (класс pit).
    // Запас вниз — 12 единиц: окно табло утоплено глубоко, а при 4 его
    // дно упиралось в ноль карты и глубина не читалась.
    H0: 12,
    HMAX: 32,
    hv(h) { return Math.max(0, Math.min(1, (h + this.H0) / this.HMAX)); },

    // Обёртка детали: высота h и материал mat.
    T(h, mat, inner) {
        const m = (MATERIALS[mat] || MATERIALS.steel).shine;
        const c = m.map(v => Math.round(v * 255)).join(',');
        return `<g style="--h:${this.hv(h).toFixed(3)};--m:rgb(${c})">${inner}</g>`;
    },

    // <style> прохода. baked — пусто.
    // --dh — прибавка к высоте детали для профиля внутри неё (купол болта,
    // цилиндр кабеля): задаётся ОТНОСИТЕЛЬНО --h предка, поэтому болт на
    // любой детали выпуклый от её поверхности, не зная, на какой высоте она.
    passStyle(pass) {
        if (pass === 'baked') return `<style>.hpass{display:none}</style>`;
        if (pass === 'albedo') return `<style>.fx,.hl,.hpass{display:none}</style>`;
        if (pass === 'height') {
            const v = (d) => `calc((var(--h,${this.hv(0).toFixed(3)}) + var(--dh,0) + ${d}) * 255)`;
            const g = (d) => `rgb(${v(d)},${v(d)},${v(d)})`;
            return `<style>` +
                `*{fill:${g(0)}!important;stroke:${g(0)}!important}` +
                `.bump,.bump *{fill:${g(0.06)}!important;stroke:${g(0.06)}!important}.bump{--bmp:0.06}` +
                `.pit,.pit *{fill:${g(-0.12)}!important;stroke:${g(-0.12)}!important}` +
                `[fill="none"]{fill:none!important}*:not([stroke]){stroke:none!important}[stroke="none"]{stroke:none!important}` +
                `.fx,.hl,.nh{display:none}</style>`;
        }
        // Маска барабанов: белым — открытая поверхность ленты (класс drum),
        // чёрным — всё, что лежит поверх (нитка, узелки, окантовка). Блики
        // стекла (nh) и нарисованный свет маску не перекрывают: лента видна
        // и под ними. По маске шейдер решает, где рисовать ленту барабана.
        if (pass === 'mask') {
            return `<style>*{fill:#000!important;stroke:#000!important}` +
                `[fill="none"]{fill:none!important}*:not([stroke]){stroke:none!important}[stroke="none"]{stroke:none!important}` +
                `.drum,.drum *{fill:#fff!important;stroke:none!important}.fx,.hl,.hpass,.nh{display:none}</style>`;
        }
        if (pass === 'mat') {
            // профиль высот в карте материалов не нужен — он того же материала
            return this.passStyleMat();
        }
        return '';
    },

    passStyleMat() {
        return `<style>*{fill:var(--m,rgb(0,0,0))!important;stroke:var(--m,rgb(0,0,0))!important}` +
                `.pit,.pit *{fill:rgb(0,0,0)!important;stroke:rgb(0,0,0)!important}` +
                `[fill="none"]{fill:none!important}*:not([stroke]){stroke:none!important}[stroke="none"]{stroke:none!important}` +
                `.fx,.hl,.hpass{display:none}</style>`;
    },

    // ---------- ПРОФИЛЬ ВЫСОТ ----------
    // Ровная площадка на всю деталь годится доске и пластине, но круглое
    // так выходит плоским: пруток крюка, кабель, шляпка болта не ловили ни
    // света, ни блика. Профиль рисуется ТОЛЬКО в проходе высот (класс hpass).
    // Круглое — ОДНОЙ плавной формой, а не стопкой плоских слоёв: стопка —
    // это уступы по определению, и свет рисовал на каждом полоску (кольца на
    // шаре рычага, полосы на колпаках колбы). Было: купол — кругами, валик —
    // обводками всё уже, и при жалобах слоёв становилось больше — уступы
    // мельчали, но оставались (игрок: «круглое — круглым, плоское — плоским»).
    // rise — подъём вершины в единицах.
    dh(units) { return (units / this.HMAX).toFixed(3); },
    _gid: 0,
    gid(p) { return `gj${p}${++this._gid}`; },
    // Цвет высоты прохода height для точки на d единиц выше детали — тем же
    // счётом, что в passStyle, но для градиента: его узлы наследуют --h
    // детали, потому что лежат внутри неё.
    hcol(d) {
        const v = `calc((var(--h,${this.hv(0).toFixed(3)}) + var(--dh,0) + var(--bmp,0) + ${d}) * 255)`;
        return `rgb(${v},${v},${v})`;
    },

    // Купол (шляпка, шар, колпачок): высота по радиусу — четверть косинуса,
    // радиальным градиентом. Косинус, а не дуга круга: у дуги на краю наклон
    // вертикальный, и 8-битная карта передаёт его рваными уровнями.
    domeH(cx, cy, r, rise) {
        rise = rise == null ? r * 0.8 : rise;
        // Узлы — чаще шага карты: между узлами высота линейна. Место узла —
        // точно (toFixed(4)), не через f(): f() оставляет десятые, и узлы
        // слипались в десять ступеней — кольца на шаре, полосы на колбе.
        const f = this.f, id = this.gid('d'), n = Math.max(12, Math.ceil(r * 4));
        let st = '';
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            st += `<stop offset="${t.toFixed(4)}" style="stop-color:${this.hcol(this.dh(rise * Math.cos(t * Math.PI / 2)))}"/>`;
        }
        return `<g class="hpass"><defs><radialGradient id="${id}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" gradientUnits="userSpaceOnUse">${st}</radialGradient></defs>` +
            `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" style="fill:url(#${id})!important;stroke:none!important"/></g>`;
    },

    // Цилиндр с осью по вертикали — высота одной плавной кривой поперёк:
    // base + rise·cos(πx/2), градиентом, а не стопкой полос. Стопка (rodH,
    // profile) — это ступени по определению: сколько их ни делай, каждая —
    // уступ, и свет рисует на нём полоску (игрок: «больше ступенек — не
    // исправление»). Градиент даёт непрерывную высоту. base — высота детали
    // в единицах (как в T), rise — подъём оси. Заливка — инлайн !important:
    // проход высот перекрашивает всё по --h, а тут высота своя.
    cylG(id, x0, y, w, h, base, rise, rx) {
        // Профиль — косинус, а не дуга круга √(1−x²): у дуги на краю наклон
        // уходит в вертикаль, карта высот (256 уровней) передаёт такой обрыв
        // скачками уровней, и у края всё равно шли полоски. У косинуса наклон
        // конечный — край скруглён так же, но гладко. Узлы градиента — не
        // ступени: между ними высота меняется непрерывно.
        const f = this.f, n = Math.max(24, Math.ceil(w * 4));
        let st = '';
        for (let i = 0; i <= n; i++) {
            const t = i / n, u = Math.cos((2 * t - 1) * Math.PI / 2);
            const c = (this.hv(base + rise * u) * 255).toFixed(1);
            st += `<stop offset="${t.toFixed(4)}" stop-color="rgb(${c},${c},${c})"/>`;
        }
        return `<g class="hpass"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${st}</linearGradient></defs>` +
            `<rect x="${f(x0)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''} style="fill:url(#${id})!important;stroke:none!important"/></g>`;
    },

    // Валик вдоль любого пути (кабель, шток, ребро): та же полоса, только
    // уже, размытая и обрезанная по полной ширине. Размытие даёт одну
    // плавную кривую поперёк — вершина по оси, к краям спадает до детали.
    // Ядро 0.6 ширины, размытие 0.18 ширины: вершина доходит до 0.9
    // подъёма (отсюда деление), край — около 0.13. Области маски и размытия
    // — по рамке пути (pathBox): у прямой линии рамка нулевой толщины, и
    // область «в долях рамки» вырезала бы всё.
    rodH(d, width, rise) {
        rise = rise == null ? width * 0.5 : rise;
        const f = this.f, m = this.gid('m'), b = this.gid('b'), B = this.pathBox(d), pad = width * 1.5;
        const reg = `x="${f(B.x - pad)}" y="${f(B.y - pad)}" width="${f(B.w + pad * 2)}" height="${f(B.h + pad * 2)}"`;
        const line = (w, extra) => `<path d="${d}" fill="none" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
        return `<g class="hpass"><defs>` +
            `<mask id="${m}" maskUnits="userSpaceOnUse" ${reg}>${line(width, 'style="stroke:#fff!important;fill:none!important"')}</mask>` +
            `<filter id="${b}" filterUnits="userSpaceOnUse" ${reg}><feGaussianBlur stdDeviation="${f(width * 0.18)}"/></filter></defs>` +
            `<g mask="url(#${m})">${line(width * 0.6, `stroke="${PALETTE.ink}" filter="url(#${b})" style="--dh:${this.dh(rise / 0.9)}"`)}</g></g>`;
    },
    // Рамка пути в его же координатах — браузер считает сам (getBBox).
    pathBox(d) {
        const C = this._pbox || (this._pbox = new Map());
        if (C.has(d)) return C.get(d);
        if (!this._pboxSvg) {
            const ns = 'http://www.w3.org/2000/svg', sv = document.createElementNS(ns, 'svg');
            sv.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
            sv.appendChild(document.createElementNS(ns, 'path'));
            document.body.appendChild(sv);
            this._pboxSvg = sv;
        }
        const pth = this._pboxSvg.firstChild;
        pth.setAttribute('d', d);
        let r;
        try { const q = pth.getBBox(); r = { x: q.x, y: q.y, w: q.width, h: q.height }; } catch (e) { r = { x: -1e3, y: -1e3, w: 2e3, h: 2e3 }; }
        C.set(d, r);
        return r;
    },

    // Цвет посередине градиента — им градиент заменяется в проходе albedo.
    mid(a, b) {
        const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
        const x = p(a), y = p(b);
        return '#' + x.map((v, i) => Math.round((v + y[i]) / 2).toString(16).padStart(2, '0')).join('');
    }
});

// ---------- РАЗМЕТКА ДЕТАЛЕЙ ----------
// Крепёж всегда чуть выше того, на чём сидит, — класс bump. Цельные детали
// получают высоту и материал обёрткой метода целиком; детали из частей
// разной высоты (ступица, гнездо на бруске, рельс со скобами) размечены
// внутри своих методов вызовами GreedJunk.T.
//
// Обёртка ставится здесь, а не в каждом методе: файл подключается
// последним, и рисующий код не обрастает разметкой там, где хватает одной
// строки в таблице.
(function () {
    // шляпка — куполом (радиус как у нарисованной, подъём — свой)
    const heads = {
        bolt: (x, y, r) => [x, y, r || 2.6, null],
        nail: (x, y) => [x, y, 1.6, null],
        ironNail: (x, y) => [x, y, 1.4, null],
        lagBolt: (x, y) => [x, y, 3.6, 2]
    };
    Object.keys(heads).forEach(k => {
        const fn = GreedJunk[k];
        GreedJunk[k] = function () {
            const [x, y, r, rise] = heads[k].apply(null, arguments);
            return '<g class="bump">' + fn.apply(this, arguments) + this.domeH(x, y, r, rise) + '</g>';
        };
    });
    const table = {
        // метод: [высота над стенкой, материал]
        slabBar: [6, 'slab'],
        socketHome: [5, 'plastic'],
        conduit: [3, 'rubber'],
        rail: [4, 'alu'],
        junctionBox: [6, 'plastic'],
        harness: [3, 'plastic'],
        powerCable: [2.5, 'rubber'],
        angleIron: [3, 'paint'],
        cutPlate: [5, 'raw'],
        brakeDisc: [9, 'polished'],
        cornerBracket: [17, 'steel']
    };
    Object.keys(table).forEach(k => {
        const fn = GreedJunk[k], hm = table[k];
        GreedJunk[k] = function () { return this.T(hm[0], hm[1], fn.apply(this, arguments)); };
    });
})();
