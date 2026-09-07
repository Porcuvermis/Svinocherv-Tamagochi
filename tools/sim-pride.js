// ================= ДОРОЖКА ТЩЕСЛАВИЯ: СКОЛЬКО ПЛАТИТ ВЫХОД =================
// Считает, сколько поцелуев приносит один выход при разной толпе, разной
// машине и разной точности игрока. Нужен затем же, зачем sim-slots.js:
// сначала посчитать, потом расставлять ценники (docs/plan/17-pride.md).
//
// Правила ровно те, что в игре:
//   • зона живёт targetLifeMs, новая появляется раз в интервал ТОЛПЫ;
//   • попадание по любой зоне (и вспышка, и поцелуй) поднимает АЖИОТАЖ;
//   • множитель = 1 + ажиотаж/perStep, потолок задаёт МАШИНА;
//   • платят только зоны НА ЧЕРВЕ, платят 1 × текущий множитель;
//   • промах и не пойманная зона роняют ажиотаж, но НЕ обнуляют.
//
// Обнуление серии в ноль (первая версия правил) пришлось выбросить: при
// точности 85% серия рвалась раз в семь попаданий, множитель выше трёх не
// успевал набраться, и покупка машины не давала ничего — 9.8 поцелуя против
// 10.4 на топовой. Ажиотаж, который копится и проседает, а не сбрасывается,
// эту дыру закрывает: чем ровнее играешь, тем выше держится множитель, и
// потолок машины начинает упираться.
//
// Числа берутся из ЖИВОГО конфига, а не из копии здесь: копия тут БЫЛА, и
// это ровно тот случай, против которого написано правило проекта — правишь
// баланс, а калькулятор считает по старому и уверенно докладывает, что всё
// сходится.
//
// Запуск:  node tools/sim-pride.js

const fs = require('fs');
const ECONOMY = eval(fs.readFileSync(__dirname + '/../src/config/economy.js', 'utf8') + '\nECONOMY');
const CFG = ECONOMY.minigames.pride;
const UP = CFG.upgrades;
const RUNS = 20000;

// Ступени берутся из конфига: base — то, с чего начинают, levels[].bonus —
// значение каждой купленной ступени.
const steps = (branch) => [branch.base].concat(branch.levels.map(l => l.bonus));
const CROWD = steps(UP.crowd);
const CARS = steps(UP.car);
const PRICES = UP.crowd.levels.map(l => l.price.pride_kiss);

function run(interval, cap, accuracy) {
    const zones = Math.floor(CFG.runMs / interval);
    let hype = 0, kisses = 0;
    for (let i = 0; i < zones; i++) {
        const caught = Math.random() < accuracy;
        hype = Math.max(0, hype + (caught ? CFG.hype.hit : CFG.hype.miss));
        if (!caught) continue;
        const mult = Math.min(cap, 1 + Math.floor(hype / CFG.hype.perStep));
        if (Math.random() < CFG.kissShare) kisses += mult;
    }
    return kisses;
}

function avg(interval, cap, accuracy) {
    let sum = 0;
    for (let i = 0; i < RUNS; i++) sum += run(interval, cap, accuracy);
    return sum / RUNS;
}

for (const accuracy of [1, 0.85, 0.7]) {
    console.log(`\n=== точность ${(accuracy * 100).toFixed(0)}% — поцелуев за выход ===`);
    console.log(['толпа\\машина'].concat(CARS.map(c => `×${c}`))
        .map(h => String(h).padStart(13)).join(''));
    CROWD.forEach((interval, lvl) => {
        const zones = Math.floor(CFG.runMs / interval);
        const row = [`${lvl} (${zones} зон)`];
        for (const cap of CARS) row.push(avg(interval, cap, accuracy).toFixed(1));
        console.log(row.map(h => String(h).padStart(13)).join(''));
    });
}

// ---------- ЦЕНЫ И ТЕМП ----------
const base = avg(CROWD[0], CARS[0], 0.85);
const top = avg(CROWD[CROWD.length - 1], CARS[CARS.length - 1], 0.85);
const lineCost = PRICES.reduce((a, b) => a + b, 0);
console.log(`\nстартовый доход (толпа 0, ×${CARS[0]}, точность 85%): ${base.toFixed(1)} поцелуев/выход`);
console.log(`полностью прокачанный:                            ${top.toFixed(1)} поцелуев/выход  (×${(top / base).toFixed(1)})`);
console.log(`цены ступеней одной линии: ${PRICES.join(' → ')}   всего ${lineCost} за линию`);
console.log(`три линии: ${lineCost * 3} поцелуев`);
console.log(`при среднем доходе ${((base + top) / 2).toFixed(0)}/выход это ≈ ${Math.round(lineCost * 3 / ((base + top) / 2))} выходов`);

// ---------- ПУБЛИКА УСТАЁТ ----------
// Тормоз против гринда виден только суточным итогом: сам по себе выход
// платит одинаково, а десятый за сутки — уже нет.
const tiers = ECONOMY.crowdReturns.tiers;
const share = (n) => (tiers.find(t => t.upTo === null || n <= t.upTo) || { share: 1 }).share;
let day = 0;
const line = [];
for (let n = 1; n <= 10; n++) {
    const paid = Math.max(1, Math.round(base * share(n)));
    day += paid;
    line.push(paid);
}
console.log(`\nвыходы подряд за сутки (стартовые числа): ${line.join(' ')}`);
console.log(`итого за десять выходов ${day} поцелуев — против ${Math.round(base * 10)} без усталости публики`);

// Первое улучшение должно быть в досягаемости за несколько выходов, иначе
// линия покупок начинается с недели ожидания.
const first = PRICES[0] / base;
console.log(`первая покупка — ${first.toFixed(1)} выхода на стартовых числах` +
            (first > 5 ? '   ⚠ дороговато для первой' : ''));
