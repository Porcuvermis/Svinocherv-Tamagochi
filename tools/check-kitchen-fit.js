// ============ ПРОВЕРКА ПОДГОНКИ КУХНИ ПОД ГЕЙМПЛЕЙ ============
//
// Прогонные тесты (test-kitchen.js, test-kitchen-block.js) отвечают на
// вопрос «дошло ли до конца». Они были ЗЕЛЁНЫМИ, когда нижняя полка
// холодильника уехала за доску, кучки летели мимо кастрюли, а доска при
// нарезке висела ниже стола (docs/traps.md, п. 12а).
//
// Здесь проверяется другое: СТОИТ ЛИ ВСЁ ТАМ, ГДЕ ДОЛЖНО. Ни браузера, ни
// скриншотов — чистая геометрия по числам самой картинки. Поэтому проверка
// мгновенная, и её можно гонять после каждой правки координат.
//
// Что проверяется:
//   1. ОПОРА       — предмет стоит на поверхности, а не парит и не утонул;
//   2. ЗАЗОР       — предметы, которые берут пальцем, не налезают друг на друга;
//   3. ВИДИМОСТЬ   — гнездо видно в своём кадре камеры, а не за краем экрана;
//   4. ПЕРЕКРЫТИЕ  — доска переднего плана не закрывает то, что надо трогать;
//   5. ОПОРА ДОСКИ — при нарезке доска лежит НА СТОЛЕ, всеми четырьмя углами;
//   6. ДОСЯГАЕМОСТЬ— предмет под пальцем крупнее пальца при своём наезде;
//   7. ЦЕЛЬ        — зона кастрюли накрывает саму кастрюлю.
//
// Запуск: node tools/check-kitchen-fit.js

const fs = require('fs');
const load = (f) => fs.readFileSync(f, 'utf8');
const scope = eval(
    load('src/core/palette.js') + '\n' +
    load('src/minigames/gluttony/kitchen-objects.js') + '\n' +
    load('src/config/kitchen.js') + '\n' +
    load('src/minigames/gluttony/kitchen-art.js') + '\n' +
    '({ KO: KITCHEN_OBJECTS, ART: KITCHEN_ART, CFG: KITCHEN, PAL: PALETTE })');
const KO = scope.KO, ART = scope.ART, CFG = scope.CFG, PAL = scope.PAL;

let bad = 0, total = 0;
const ok = (name, cond, detail) => {
    total++;
    if (!cond) bad++;
    console.log(`${cond ? '  ok  ' : ' ПЛОХО'} ${name}${detail ? '   ' + detail : ''}`);
};
const head = (t) => console.log('\n--- ' + t + ' ---');

// Камера: тот же расчёт, что в GluttonyMinigame.setCamera. Повторён здесь
// намеренно — проверка должна считать САМА, а не спрашивать у проверяемого.
function cam(name) {
    const f = ART.FOCUS[name];
    const s = Math.min(390 / f.w, 844 / f.h);
    return {
        s,
        tx: 195 - s * (f.x + f.w / 2),
        ty: 422 - s * (f.y + f.h / 2),
        at(p) { return { x: this.s * p.x + this.tx, y: this.s * p.y + this.ty }; }
    };
}

// Точка внутри выпуклого четырёхугольника (углы по часовой стрелке).
function inQuad(p, q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
        const a = q[i], b = q[(i + 1) % 4];
        const cr = (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0]);
        if (Math.abs(cr) < 1e-6) continue;
        const s = cr > 0 ? 1 : -1;
        if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
}

const S = ART.SLOTS, C = KO.counterGeom, CT = KO.cooktopGeom, T = KO.tableGeom;

// ---------------------------------------------------------------- 1. ОПОРА
// Предмет стоит на поверхности, если ТОЧКА ЕГО ДНА лежит между дальней и
// ближней кромкой этой поверхности. Парящий на два пикселя предмет глазом
// не ловится, а числом ловится сразу.
head('1. ОПОРА: предмет стоит на поверхности, а не парит');

const onSurface = (name, x, baseY, surf, slack) => {
    const b = surf.back(x), f = surf.front(x);
    ok(name, baseY >= b - (slack || 0) && baseY <= f + (slack || 0),
       `дно ${baseY.toFixed(0)}, опора ${b.toFixed(0)}..${f.toFixed(0)}`);
};

// Кастрюля: дно из её пути в kitchen-objects (нижняя дуга корпуса).
onSurface('кастрюля на варочной панели', 365, 522, CT, 6);

// Бутыли: дно = центр + половина высоты тулова с учётом масштаба.
const BOTTLE_BASE = 46;   // от нуля бутыли до её донца (kitchen-objects)
S.bottles.forEach((b, i) =>
    onSurface(`бутыль ${i + 1} на столешнице`, b.x, b.y + BOTTLE_BASE * b.s, C, 4));

// Доска с нарезанным и кучки на ней.
onSurface('доска с нарезанным на столешнице', S.boardRest.x, S.boardRest.y + 22, C, 10);
S.piles.forEach((p, i) =>
    onSurface(`кучка ${i + 1} на столешнице`, p.x, p.y + 20, C, 12));

// Лейка крана: висит в изливе, то есть НАД мойкой, а не на столешнице.
ok('лейка крана висит над мойкой',
   S.hose.y > 400 && S.hose.y < C.back(S.hose.x) + 6 && S.hose.x > 600 && S.hose.x < 720,
   `лейка (${S.hose.x}, ${S.hose.y}), кромка столешницы ${C.back(S.hose.x).toFixed(0)}`);

// Ложка: чаша должна быть В горловине кастрюле, а не над ней и не под.
ok('ложка в горловине кастрюли',
   Math.abs(S.spoon.x - S.potMouth.x) < 20 && Math.abs(S.spoon.y - S.potMouth.y) < 30,
   `ложка (${S.spoon.x}, ${S.spoon.y}), горловина (${S.potMouth.x}, ${S.potMouth.y})`);

// ---------------------------------------------------------------- 2. ЗАЗОР
head('2. ЗАЗОР: предметы под пальцем не налезают друг на друга');
const BOTTLE_HALF = 19;
for (let i = 1; i < S.bottles.length; i++) {
    const a = S.bottles[i - 1], b = S.bottles[i];
    const gap = (b.x - a.x) - (BOTTLE_HALF * a.s + BOTTLE_HALF * b.s);
    ok(`бутыли ${i} и ${i + 1} не касаются`, gap > 4, `зазор ${gap.toFixed(0)}`);
}
ok('лейка не за бутылями', S.hose.x - S.bottles[S.bottles.length - 1].x > 40,
   `отступ ${(S.hose.x - S.bottles[S.bottles.length - 1].x).toFixed(0)}`);

// Центр предмета не должен попадать в зону захвата того, кто нарисован
// ПОЗЖЕ: верхний забирает касание себе, и нижний перестаёт браться, хотя
// виден. Это самый частый класс ошибок на кухне (docs/traps.md, п. 1).
// Проверка направленная: важно не «пересекаются», а «кто кого перекрывает».
head('2а. ЗАХВАТ: центр предмета не накрыт зоной того, кто выше');
{
    // Порядок — как в KITCHEN_ART.scene(): позже нарисованный выше.
    const layers = [];
    layers.push({ n: 'лейка крана', x: S.hose.x, y: S.hose.y + 6, rx: 26, ry: 30 });
    S.bottles.forEach((b, i) =>
        layers.push({ n: `бутыль ${i + 1}`, x: b.x, y: b.y, rx: 28 * b.s, ry: 52 * b.s }));
    S.piles.forEach((p, i) => layers.push({
        n: `кучка ${i + 1}`, x: p.x, y: p.y,
        rx: 96 * ART.ITEM * S.pileScale, ry: 54 * ART.ITEM * S.pileScale }));

    const clash = [];
    for (let lo = 0; lo < layers.length; lo++)
        for (let hi = lo + 1; hi < layers.length; hi++) {
            const a = layers[lo], b = layers[hi];
            const dx = (a.x - b.x) / b.rx, dy = (a.y - b.y) / b.ry;
            if (dx * dx + dy * dy < 1) clash.push(`${a.n} под зоной «${b.n}»`);
        }
    ok('ни один предмет не спрятан под чужой зоной', clash.length === 0,
       clash.join('; '));
}

// ------------------------------------------------------------ 3. ВИДИМОСТЬ
head('3. ВИДИМОСТЬ: гнездо видно в своём кадре');
const M = 10;   // поле у края экрана: у самой кромки пальцем не попасть
const visible = (name, pt, focus) => {
    const p = cam(focus).at(pt);
    ok(name, p.x > M && p.x < 390 - M && p.y > M && p.y < 844 - M,
       `экран (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
};
['meat', 'veg', 'spice'].forEach(t =>
    visible(`полка ${t} видна в кадре холодильника`,
            { x: S.shelf.cx, y: S.shelfY[t] }, 'fridge'));
visible('морозилка видна в кадре холодильника', S.freezer, 'fridge');
visible('кастрюля видна в кадре плиты', S.pot, 'stove');
S.bottles.forEach((b, i) => visible(`бутыль ${i + 1} видна в кадре плиты`, b, 'stove'));
visible('лейка видна в кадре плиты', S.hose, 'stove');
visible('доска с нарезанным видна в кадре плиты', S.boardRest, 'stove');
visible('ложка видна в кадре кастрюли', S.spoon, 'pot');

// ----------------------------------------------------------- 4. ПЕРЕКРЫТИЕ
// Доска переднего плана камере не подчиняется и лежит поверх сцены. Всё, что
// в этот момент трогают в сцене, обязано быть ВНЕ её прямоугольника.
head('4. ПЕРЕКРЫТИЕ: доска переднего плана не закрывает нужное');
const boardRect = (pos) => ({
    x0: pos.x - 186, x1: pos.x + 186, y0: pos.y - 78, y1: pos.y + 92
});
const notUnderBoard = (name, pt, focus, pos) => {
    const p = cam(focus).at(pt), r = boardRect(pos);
    const inside = p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
    ok(name, !inside, `экран (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), доска y ${r.y0}..${r.y1}`);
};
['meat', 'veg', 'spice'].forEach(t =>
    notUnderBoard(`полка ${t} не за доской`,
                  { x: S.shelf.cx, y: S.shelfY[t] }, 'fridge', ART.FG.board.fridge));
notUnderBoard('морозилка не за доской', S.freezer, 'fridge', ART.FG.board.fridge);

// --------------------------------------------------------- 5. ОПОРА ДОСКИ
// При нарезке доска обязана лежать НА СТОЛЕ — всеми четырьмя углами внутри
// его столешницы. Иначе она висит в воздухе перед столом, и весь этап
// читается «режу на весу».
head('5. ОПОРА ДОСКИ: при нарезке доска лежит на столе');
{
    const c = cam('chop');
    const quad = [T.L, T.B, T.R, T.F].map(p => [c.at({ x: p[0], y: p[1] }).x,
                                                c.at({ x: p[0], y: p[1] }).y]);
    const r = boardRect(ART.FG.board.chop);
    const corners = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
    const names = ['левый дальний', 'правый дальний', 'правый ближний', 'левый ближний'];
    corners.forEach((p, i) =>
        ok(`угол доски ${names[i]} на столе`, inQuad({ x: p[0], y: p[1] }, quad),
           `угол (${p[0].toFixed(0)}, ${p[1].toFixed(0)})`));
}

// Нож живёт в том же переднем плане и обязан лежать НА СТОЛЕ: и когда им
// режут (над доской), и когда он отработал и лёг рядом.
{
    const c = cam('chop');
    const quad = [T.L, T.B, T.R, T.F].map(p => [c.at({ x: p[0], y: p[1] }).x,
                                                c.at({ x: p[0], y: p[1] }).y]);
    const r = boardRect(ART.FG.board.chop);
    const K = ART.FG.knife, KR = ART.FG.knifeRest;
    ok('нож при нарезке над доской',
       K.x > r.x0 && K.x < r.x1 && K.y > r.y0 && K.y < r.y1,
       `нож (${K.x}, ${K.y}), доска ${r.x0}..${r.x1} / ${r.y0}..${r.y1}`);
    ok('отработавший нож лежит на столе', inQuad({ x: KR.x, y: KR.y }, quad),
       `нож (${KR.x}, ${KR.y})`);
    // Кончик лезвия при опущенном ноже обязан ВОЙТИ в кучку на доске, а не
    // парить над ней: иначе удар не читается ударом.
    const tipX = K.x - ART.FG.knifePivot * 2;
    ok('лезвие достаёт до середины доски', tipX < ART.FG.board.chop.x + 20,
       `кончик на x≈${tipX.toFixed(0)}, середина доски ${ART.FG.board.chop.x}`);
}

// ------------------------------------------------------- 6. ДОСЯГАЕМОСТЬ
// Предмет под пальцем обязан быть крупнее пальца (план, §2 «предмет в руке
// крупнее»). Меряем габарит зоны захвата на экране при своём наезде.
head('6. ДОСЯГАЕМОСТЬ: предмет под пальцем крупнее пальца');
const FINGER = 34;
const graspable = (name, halfW, focus) => {
    const px = halfW * 2 * cam(focus).s;
    ok(name, px >= FINGER, `${px.toFixed(0)} px при пороге ${FINGER}`);
};
graspable('бутыль берётся пальцем', 28 * S.bottles[0].s, 'stove');
graspable('лейка берётся пальцем', 26, 'stove');
graspable('кучка берётся пальцем', 96 * S.pileScale * ART.ITEM, 'stove');
graspable('продукт на полке берётся пальцем', ART.GRAB.rx * 0.52 * ART.ITEM, 'fridge');
graspable('ложка берётся пальцем', 46, 'pot');

// -------------------------------------------------------------- 7. ЦЕЛЬ
head('7. ЦЕЛЬ: зона кастрюли накрывает кастрюлю');
{
    const z = S.potZone;
    const inZone = (p) => p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h;
    ok('горловина внутри зоны', inZone(S.potMouth));
    ok('центр кастрюли внутри зоны', inZone(S.pot));
    ok('зона начинается выше кадра', z.y < 0, `верх зоны ${z.y}`);
    // План (§2.5): зона нарочно ШИРЕ кастрюли. Зона по её габариту означает
    // «целься в горловину», а именно этого игрок сделать и не может.
    const potW = 144;   // ширина корпуса кастрюли в kitchen-objects
    ok('зона шире самой кастрюли', z.w > potW + 20,
       `зона ${z.w}, кастрюля ${potW}`);
    ok('бутыли ВНЕ зоны кастрюли', S.bottles.every(b => !inZone(b)),
       'иначе бутыль начинает лить, стоя на месте');
}

// ------------------------------------------------------------- 8. ЖИДКОСТИ
// У каждой жидкости из конфига обязан быть свой цвет, и цвета обязаны
// различаться. Недостающий ключ не падает, а молча подставляет чужой цвет:
// из крана начинает литься бульон, и заметить это можно только глазами.
head('8. ЖИДКОСТИ: у каждой свой цвет');
{
    const keys = Object.keys(CFG.liquids);
    const seen = {};
    keys.forEach(k => {
        const c = PAL.kitchenScene[k];
        ok(`у «${k}» есть свой цвет`, !!c, c ? c[500] : 'цвета нет — подставится чужой');
        if (c) {
            ok(`цвет «${k}» не повторяет другой`, !seen[c[500]],
               seen[c[500]] ? `совпал с «${seen[c[500]]}»` : c[500]);
            seen[c[500]] = k;
        }
    });
    // Бутылей ровно столько, сколько НЕ-водяных жидкостей: вода приходит из
    // крана, и бутыль ей не нужна.
    const inBottles = keys.filter(k => !CFG.liquids[k].tap).length;
    ok('гнёзд под бутыли столько же, сколько жидкостей в бутылях',
       ART.SLOTS.bottles.length === inBottles,
       `гнёзд ${ART.SLOTS.bottles.length}, жидкостей ${inBottles}`);
}

// ---------------------------------------------------------- 9. ПЕРЕЕЗДЫ
// Доска въезжает из-за края и уезжает за край: по движению видно, что этап
// сменился. Значит обе «внешние» стоянки обязаны быть ЗА пределами экрана,
// иначе доска не уезжает, а просто прыгает в угол.
head('9. ПЕРЕЕЗДЫ: доска приходит и уходит за край экрана');
{
    const B = ART.FG.board, half = 186, tall = 92;
    ok('стоянка «спрятана» за нижним краем', B.hidden.y - tall > 844 - 40 ||
       B.hidden.x - half > 390 - 40, `(${B.hidden.x}, ${B.hidden.y})`);
    ok('стоянка «унесли» за верхним краем', B.away.y + tall < 40,
       `(${B.away.x}, ${B.away.y})`);
    ok('на полке холодильника доска не закрывает указатель',
       Math.abs(B.fridge.y - B.chop.y) > 40, 'у полки и у стола доска стоит по-разному');
}

console.log(`\nитого: ${total - bad} из ${total}` + (bad ? `, ПЛОХО: ${bad}` : ', всё сходится'));
process.exit(bad ? 1 : 0);
