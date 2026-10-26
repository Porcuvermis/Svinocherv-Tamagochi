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
                `.bump,.bump *{fill:${g(0.06)}!important;stroke:${g(0.06)}!important}` +
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
    // света, ни блика. Профиль рисуется ТОЛЬКО в проходе высот (класс hpass)
    // стопкой слоёв, каждый выше предыдущего: купол — кругами, цилиндр —
    // обводками того же пути всё уже. rise — подъём вершины в единицах.
    dh(units) { return (units / this.HMAX).toFixed(3); },

    // Круглое сечение (высота √(1−x²)) в n ступенях — для крупных
    // выпуклых деталей, где четырёх ступеней мало (барабан окна).
    profile(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const k = 1 - i / n;
            out.push([k, Math.sqrt(Math.max(0, 1 - k * k)) * 0.85 + 0.15]);
        }
        return out;
    },

    domeH(cx, cy, r, rise) {
        rise = rise == null ? r * 0.8 : rise;
        const f = this.f;
        // крупный купол (колпачок кнопки) четырьмя ступенями выходил мишенью
        // из колец — ему ступеней больше
        const steps = r > 4 ? this.profile(Math.round(r * 1.6)) : [[1, 0.15], [0.78, 0.6], [0.52, 0.85], [0.26, 1]];
        return '<g class="hpass">' + steps.map(([k, u]) =>
            `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * k)}" style="--dh:${this.dh(rise * u)}"/>`).join('') + '</g>';
    },

    rodH(d, width, rise) {
        rise = rise == null ? width * 0.5 : rise;
        return '<g class="hpass">' + [[1, 0.15], [0.78, 0.6], [0.52, 0.85], [0.26, 1]].map(([k, u]) =>
            `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="${(width * k).toFixed(2)}" stroke-linecap="round" ` +
            `stroke-linejoin="round" style="--dh:${this.dh(rise * u)}"/>`).join('') + '</g>';
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
        stud: (x, y) => [x, y, 3.6, 3],
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
