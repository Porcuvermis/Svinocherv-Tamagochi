// ============ ПРОВЕРКА ПЕРСПЕКТИВЫ ============
//
// «Нарушение перспективы» — не вкусовщина, а измеримая вещь: у предмета,
// нарисованного в одной перспективе, ВСЕ уходящие вглубь горизонтали
// сходятся в одну точку. Если одна грань идёт полого, а соседняя круто,
// предмет разваливается по глубине, даже когда все стыки сошлись.
//
// Как считается:
//   1. из разметки каждого предмета вытаскиваются ВСЕ почти-горизонтальные
//      рёбра (полигоны и прямые куски путей) — руками ничего объявлять не
//      надо, проверка читает то, что нарисовано;
//   2. по ним методом наименьших квадратов ищется точка схода;
//   3. для каждого ребра считается, на сколько его наклон расходится с
//      наклоном «в найденную точку».
//
// Отдельно сверяются предметы, стоящие в ОДНОМ ряду (столешница, варочная
// панель, мойка): их точки схода обязаны быть рядом — они лежат на одной
// плоскости. Разные точки схода у столешницы и панели означают, что панель
// вставлена в столешницу под другим углом.
//
// Запуск: node tools/check-perspective.js [подробно]

const fs = require('fs');
const load = (f) => fs.readFileSync(f, 'utf8');
const scope = eval(
    load('src/core/palette.js') + '\n' +
    load('src/config/kitchen.js') + '\n' +
    load('src/minigames/gluttony/kitchen-objects.js') + '\n' +
    load('src/minigames/gluttony/kitchen-art.js') + '\n' +
    '({ KO: KITCHEN_OBJECTS, ART: KITCHEN_ART })');
const KO = scope.KO;
const verbose = process.argv[2] === 'подробно';

// ---------- 1. РЁБРА ИЗ РАЗМЕТКИ ----------
// Берутся полигоны и прямые отрезки путей. Кривые пропускаются: у дуги нет
// наклона, а перспективу держат прямые.
function edges(markup) {
    const out = [];
    const add = (x1, y1, x2, y2) => {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        // Почти-горизонтальные и достаточно длинные: короткие рёбра дают
        // наклон с огромной погрешностью и только зашумляют подгонку.
        if (len < 45 || Math.abs(dx) < 1 || Math.abs(dy / dx) > 0.6) return;
        out.push({ x1, y1, x2, y2, len, slope: dy / dx });
    };

    const poly = /<polygon[^>]*points="([^"]+)"/g;
    let m;
    while ((m = poly.exec(markup))) {
        const n = m[1].trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 3 < n.length; i += 2)
            add(n[i], n[i + 1], n[i + 2], n[i + 3]);
        if (n.length >= 4) add(n[n.length - 2], n[n.length - 1], n[0], n[1]);
    }

    // Прямые куски путей: M/L в абсолютных координатах.
    const path = /<path[^>]*\sd="([^"]+)"/g;
    while ((m = path.exec(markup))) {
        const toks = m[1].match(/[MLHVQqCcAaZz]|-?\d+(\.\d+)?/g) || [];
        let cx = 0, cy = 0, sx = 0, sy = 0, i = 0, cmd = '';
        while (i < toks.length) {
            const t = toks[i];
            if (/[A-Za-z]/.test(t)) { cmd = t; i++; } else if (!cmd) { i++; continue; }
            if (cmd === 'M') { cx = +toks[i++]; cy = +toks[i++]; sx = cx; sy = cy; cmd = 'L'; }
            else if (cmd === 'L') { const x = +toks[i++], y = +toks[i++]; add(cx, cy, x, y); cx = x; cy = y; }
            else if (cmd === 'H') { const x = +toks[i++]; add(cx, cy, x, cy); cx = x; }
            else if (cmd === 'V') { const y = +toks[i++]; cy = y; }
            else if (cmd === 'Z' || cmd === 'z') { add(cx, cy, sx, sy); cx = sx; cy = sy; }
            else { // кривые и относительные команды: пропускаем их числа
                const n = { Q: 4, q: 4, C: 6, c: 6, A: 7, a: 7, l: 2, h: 1, v: 1, m: 2 }[cmd] || 2;
                for (let k = 0; k < n && i < toks.length && !/[A-Za-z]/.test(toks[i]); k++) i++;
                cx = NaN; cy = NaN; cmd = '';
                // После кривой текущая точка неизвестна — дальше рёбра не берём.
                break;
            }
        }
    }
    return out;
}

// ---------- 2. ТОЧКА СХОДА ----------
// Каждое ребро задаёт прямую. Ищем точку, сумма квадратов расстояний до
// этих прямых от которой минимальна. Веса — по длине ребра: длинное ребро
// задаёт направление точнее.
function vanishing(es) {
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const e of es) {
        const dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy);
        const nx = -dy / L, ny = dx / L;                 // нормаль
        const c = -(nx * e.x1 + ny * e.y1);
        const w = e.len;
        a11 += w * nx * nx; a12 += w * nx * ny; a22 += w * ny * ny;
        b1 -= w * nx * c;   b2 -= w * ny * c;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-9) return null;
    return { x: (b1 * a22 - b2 * a12) / det, y: (a11 * b2 - a12 * b1) / det };
}

// Насколько ребро расходится с точкой схода: разница наклона «как нарисовано»
// и «как надо, чтобы прийти в точку».
function deviation(e, vp) {
    const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
    if (Math.abs(vp.x - mx) < 1) return 0;
    return e.slope - (vp.y - my) / (vp.x - mx);
}

// ---------- 3. РАЗБОР ----------
// Группы, помеченные `room`, стоят вдоль ОДНОЙ стены и уходят вглубь в одном
// направлении — значит их точки схода обязаны совпасть. Разные точки у
// столешницы и стоящей под ней духовки означают, что духовка отваливается от
// кухни, даже если внутри себя она сходится идеально.
const ROOM = 'вдоль правой стены';
const groups = {
    'столешница и всё на ней': ['counter', 'cooktop', 'sink'],
    'фасад духовки': ['oven'],
    'фасад тумбы': ['cabinet'],
    'холодильник': ['fridgeBody', 'fridgeDoorTop', 'fridgeDoorBottom', 'fridgeInside'],
    'стол': ['table'],
    'подоконник': ['sill']
};

let bad = 0;
const TOL = 0.055;   // расхождение наклона, выше которого грань «валится»
const roomGroups = ['столешница и всё на ней', 'фасад духовки', 'фасад тумбы'];
const roomVps = {};
const vpByGroup = {};

for (const gname of Object.keys(groups)) {
    const all = [];
    for (const name of groups[gname]) {
        const o = KO[name];
        if (!o) continue;
        edges(o.draw()).forEach(e => all.push(Object.assign({ obj: name }, e)));
    }
    // РАЗНЫЕ НАПРАВЛЕНИЯ — РАЗНЫЕ ТОЧКИ СХОДА. У крышки холодильника и у
    // столешницы стола есть рёбра, уходящие и вправо-вверх, и вправо-вниз:
    // это две разные горизонтальные оси, и сводить их в одну точку —
    // требовать невозможного. Делим по знаку наклона.
    const families = [
        { n: 'уходят вправо-вверх', es: all.filter(e => e.slope < 0) },
        { n: 'уходят вправо-вниз',  es: all.filter(e => e.slope > 0) }
    ];
    console.log(`\n--- ${gname} ---`);
    for (const fam of families) {
        if (fam.es.length < 3) continue;
        const vp = vanishing(fam.es);
        if (!vp) continue;
        const devs = fam.es.map(e => ({ e, d: deviation(e, vp) }));
        const off = devs.filter(w => Math.abs(w.d) > TOL)
                        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
        console.log(`  ${fam.n}: рёбер ${fam.es.length},`
            + ` точка схода (${vp.x.toFixed(0)}, ${vp.y.toFixed(0)})`);
        if (roomGroups.includes(gname) && fam.es[0].slope < 0) roomVps[gname] = vp;
        (vpByGroup[gname] = vpByGroup[gname] || []).push(vp);
        if (!off.length) { console.log('    все грани сходятся'); }
        else {
            bad += off.length;
            for (const w of off.slice(0, 6))
                console.log(`    ВАЛИТСЯ ${w.e.obj}: (${w.e.x1.toFixed(0)},${w.e.y1.toFixed(0)})`
                    + `-(${w.e.x2.toFixed(0)},${w.e.y2.toFixed(0)})`
                    + ` наклон ${w.e.slope.toFixed(3)}, надо ${(w.e.slope - w.d).toFixed(3)}`);
            if (off.length > 6) console.log(`    ...и ещё ${off.length - 6}`);
        }
        if (verbose)
            devs.sort((a, b) => a.e.y1 - b.e.y1).forEach(w =>
                console.log(`       ${w.e.obj.padEnd(16)} y≈${((w.e.y1 + w.e.y2) / 2).toFixed(0)}`
                    + ` наклон ${w.e.slope.toFixed(3)} промах ${w.d.toFixed(3)}`));
    }
}

// ---------- ОДНА СТЕНА — ОДИН НАКЛОН ----------
// Сравнивать сами КООРДИНАТЫ точек схода нельзя: чем точка дальше, тем
// сильнее она пляшет от долей градуса в наклоне граней. У далёкой точки
// (а она у этой кухни в шести тысячах единиц) разброс по y в сотню — это
// шум подгонки, а не расхождение картинки.
// Меряем то, что видно глазом: НАКЛОН горизонтали, проведённой из одной и
// той же точки в каждую из точек схода. Он и есть «под каким углом эта
// плоскость уходит вглубь».
const names = Object.keys(roomVps);
if (names.length > 1) {
    console.log(`\n--- ${ROOM}: одинаково ли уходят вглубь ---`);
    const PX = 470, PY = 500;                       // общая точка промера
    const slope = (v) => (v.y - PY) / (v.x - PX);
    const ks = names.map(n => slope(roomVps[n]));
    const spread = Math.max(...ks) - Math.min(...ks);
    names.forEach((n, i) => console.log(`  ${n.padEnd(26)} наклон`
        + ` ${ks[i].toFixed(4)}   точка схода (${roomVps[n].x.toFixed(0)},`
        + ` ${roomVps[n].y.toFixed(0)})`));
    // Порог — десятая часть самого наклона: меньше глаз не ловит, больше
    // читается как «соседние шкафы стоят под разными углами».
    const TOL_ROOM = Math.abs(ks[0]) * 0.1;
    if (spread > TOL_ROOM) {
        bad++;
        console.log(`  ВАЛИТСЯ: наклоны разъехались на ${spread.toFixed(4)}`
            + ` при пороге ${TOL_ROOM.toFixed(4)} — соседние плоскости уходят`
            + ' вглубь под разными углами');
    } else {
        console.log(`  сходится, разброс наклона ${spread.toFixed(4)}`
            + ` при пороге ${TOL_ROOM.toFixed(4)}`);
    }
}

// ---------- ОДИН ГОРИЗОНТ НА КАДР ----------
// Повёрнутый предмет (холодильник, стол) имеет ПРАВО на свою точку схода:
// его грани уходят вглубь в другую сторону. Чего он не имеет права делать —
// это ставить свою точку выше или ниже общего горизонта. Горизонт есть
// высота глаза, а глаз в кадре один. Точка ниже горизонта означает, что на
// этот предмет смотрят с другой высоты, чем на всю остальную кухню, — и
// именно так читается «предмет вывернут», когда каждая его грань по
// отдельности сходится.
const HORIZON = KO.ROOM_VP.y;
const TOL_HZ = 120;         // на кадр в 1440 единиц это меньше десятой доли
console.log(`\n--- один ли горизонт: он на y = ${HORIZON} ---`);
for (const n of Object.keys(vpByGroup)) {
    for (const v of vpByGroup[n]) {
        const off = Math.abs(v.y - HORIZON);
        const line = `  ${n.padEnd(26)} точка схода y = ${v.y.toFixed(0)},`
            + ` промах ${off.toFixed(0)}`;
        if (off > TOL_HZ) { bad++; console.log(line + '   ВЫШЕ/НИЖЕ ГОРИЗОНТА'); }
        else console.log(line);
    }
}

console.log(`\nграней мимо точки схода: ${bad}`);
process.exit(bad ? 1 : 0);
