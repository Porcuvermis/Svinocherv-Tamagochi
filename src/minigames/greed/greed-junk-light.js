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

    // Материалы: [сила блика, острота, металл]. Числа на глаз, без физики:
    // задача — чтобы всё было освещено ОДНИМ светом, а не правдоподобие.
    MAT: {
        pine:     [0.06, 0.15, 0],
        chip:     [0.03, 0.10, 0],
        lacquer:  [0.55, 0.70, 0],
        slab:     [0.03, 0.10, 0],
        steel:    [0.35, 0.45, 1],
        alu:      [0.60, 0.60, 1],
        polished: [0.90, 0.90, 1],
        plastic:  [0.25, 0.50, 0],
        rubber:   [0.12, 0.30, 0],
        paint:    [0.30, 0.50, 0],
        hole:     [0, 0, 0]
    },

    // Высота детали в единицах каталога (задняя стенка — 0) → доля 0..1
    // карты высот. Ниже стенки бывают только щели и дыры (класс pit).
    H0: 4,
    HMAX: 24,
    hv(h) { return Math.max(0, Math.min(1, (h + this.H0) / this.HMAX)); },

    // Обёртка детали: высота h и материал mat.
    T(h, mat, inner) {
        const m = this.MAT[mat] || this.MAT.steel;
        const c = m.map(v => Math.round(v * 255)).join(',');
        return `<g style="--h:${this.hv(h).toFixed(3)};--m:rgb(${c})">${inner}</g>`;
    },

    // <style> прохода. baked — пусто.
    passStyle(pass) {
        if (pass === 'albedo') return `<style>.fx,.hl{display:none}</style>`;
        if (pass === 'height') {
            const g = (d) => `rgb(calc((var(--h,0.17) + ${d}) * 255),calc((var(--h,0.17) + ${d}) * 255),calc((var(--h,0.17) + ${d}) * 255))`;
            return `<style>` +
                `*{fill:${g(0)}!important;stroke:${g(0)}!important}` +
                `.bump,.bump *{fill:${g(0.06)}!important;stroke:${g(0.06)}!important}` +
                `.pit,.pit *{fill:${g(-0.12)}!important;stroke:${g(-0.12)}!important}` +
                `[fill="none"]{fill:none!important}*:not([stroke]){stroke:none!important}[stroke="none"]{stroke:none!important}` +
                `.fx,.hl{display:none}</style>`;
        }
        if (pass === 'mat') {
            return `<style>*{fill:var(--m,rgb(0,0,0))!important;stroke:var(--m,rgb(0,0,0))!important}` +
                `.pit,.pit *{fill:rgb(0,0,0)!important;stroke:rgb(0,0,0)!important}` +
                `[fill="none"]{fill:none!important}*:not([stroke]){stroke:none!important}[stroke="none"]{stroke:none!important}` +
                `.fx,.hl{display:none}</style>`;
        }
        return '';
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
    ['bolt', 'nail', 'ironNail', 'stud', 'lagBolt'].forEach(k => {
        const fn = GreedJunk[k];
        GreedJunk[k] = function () { return '<g class="bump">' + fn.apply(this, arguments) + '</g>'; };
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
        angleIron: [3, 'steel'],
        cutPlate: [5, 'steel'],
        brakeDisc: [9, 'polished'],
        cornerBracket: [17, 'steel']
    };
    Object.keys(table).forEach(k => {
        const fn = GreedJunk[k], hm = table[k];
        GreedJunk[k] = function () { return this.T(hm[0], hm[1], fn.apply(this, arguments)); };
    });
})();
