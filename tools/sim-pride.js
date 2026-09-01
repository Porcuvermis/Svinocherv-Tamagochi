const RUN_MS = 20000;        // длина выхода по дорожке
const ON_WORM_SHARE = 1 / 3; // доля зон, вспыхивающих прямо на черве
const HYPE_HIT = 1;          // попадание: +1 к ажиотажу
const HYPE_MISS = -2;        // промах: −2 (дороже попадания, но не обнуляет)
const HYPE_PER_STEP = 3;     // за сколько ажиотажа множитель +1
const RUNS = 20000;

// ================= АВТОМАТ АЛЧНОСТИ, НО ДЛЯ ДОРОЖКИ =================
// Считает, сколько поцелуев приносит один выход при разной толпе, разной
// машине и разной точности игрока. Нужен затем же, зачем sim-slots.js:
// сначала посчитать, потом расставлять ценники (docs/plan/17-pride.md).
//
// Правила ровно те, что в плане:
//   • зона живёт 1.5 сек, новая появляется раз в INTERVAL — его задаёт ТОЛПА;
//   • попадание по любой зоне (и вспышка, и поцелуй) поднимает АЖИОТАЖ;
//   • множитель = 1 + ажиотаж/3, потолок задаёт МАШИНА;
//   • платят только зоны НА ЧЕРВЕ, платят 1 × текущий множитель;
//   • промах и не пойманная зона роняют ажиотаж на 2, но НЕ обнуляют.
//
// Обнуление серии в ноль (первая версия правил) пришлось выбросить: при
// точности 85% серия рвалась раз в семь попаданий, множитель выше трёх не
// успевал набраться, и покупка машины не давала ничего — 9.8 поцелуя против
// 10.4 на топовой. Ажиотаж, который копится и проседает, а не сбрасывается,
// эту дыру закрывает: чем ровнее играешь, тем выше держится множитель, и
// потолок машины начинает упираться.
//
// Запуск:  node tools/sim-pride.js

const CROWD = [
    { lvl: 1, interval: 1000 },
    { lvl: 2, interval: 850 },
    { lvl: 3, interval: 700 },
    { lvl: 4, interval: 550 }
];
const CARS = [
    { lvl: 1, cap: 3 },
    { lvl: 2, cap: 4 },
    { lvl: 3, cap: 5 },
    { lvl: 4, cap: 7 }
];

function run(interval, cap, accuracy) {
    const zones = Math.floor(RUN_MS / interval);
    let hype = 0, kisses = 0;
    for (let i = 0; i < zones; i++) {
        const caught = Math.random() < accuracy;
        hype = Math.max(0, hype + (caught ? HYPE_HIT : HYPE_MISS));
        if (!caught) continue;
        const mult = Math.min(cap, 1 + Math.floor(hype / HYPE_PER_STEP));
        if (Math.random() < ON_WORM_SHARE) kisses += mult;
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
    const head = ['толпа\\машина'].concat(CARS.map(c => `×${c.cap}`));
    console.log(head.map(h => String(h).padStart(13)).join(''));
    for (const cr of CROWD) {
        const zones = Math.floor(RUN_MS / cr.interval);
        const row = [`${cr.lvl} (${zones} зон)`];
        for (const car of CARS) row.push(avg(cr.interval, car.cap, accuracy).toFixed(1));
        console.log(row.map(h => String(h).padStart(13)).join(''));
    }
}

// ---------- ЦЕНЫ ----------
// Первое улучшение должно стоить 3–4 выхода на стартовых числах, дальше
// лестница ×1.8 (правило цен из docs/plan/15-progression.md).
const base = avg(CROWD[0].interval, CARS[0].cap, 0.85);
const first = Math.round(base * 3.5 / 5) * 5;
const prices = [];
let p = first;
for (let i = 0; i < 3; i++) { prices.push(Math.round(p / 5) * 5); p *= 1.8; }

const top = avg(CROWD[3].interval, CARS[3].cap, 0.85);
const lineCost = prices.reduce((a, b) => a + b, 0);
console.log(`\nстартовый доход (толпа 1, ×3, точность 85%): ${base.toFixed(1)} поцелуев/выход`);
console.log(`полностью прокачанный:                        ${top.toFixed(1)} поцелуев/выход  (×${(top / base).toFixed(1)})`);
console.log(`цены ступеней одной линии: ${prices.join(' → ')}   всего ${lineCost} за линию`);
console.log(`три линии: ${lineCost * 3} поцелуев`);
console.log(`при среднем доходе ${((base + top) / 2).toFixed(0)}/выход это ≈ ${Math.round(lineCost * 3 / ((base + top) / 2))} выходов`);
