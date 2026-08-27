// ================= САД ЛЕНИ: ПРОПУСКНАЯ СПОСОБНОСТЬ =================
// Отвечает на два вопроса, без которых сад собирать нельзя:
//   1) в каком масштабе времени держать ожидания — в часах или в минутах;
//   2) сколько грядок имеет смысл, и когда следующая перестаёт что-то давать.
//
// ---------- ПОЧЕМУ ЧАСЫ НЕ РАБОТАЮТ ----------
// Первая версия расчёта ставила ожидания в часы (полив 4 ч, прополка 3 ч) и
// считала заходы в игру. Вышло, что за один заход грядка продвигается ровно на
// ОДНУ стадию, сколько бы ни ждала: следующая стадия всё равно начинает
// отсчёт заново. Поэтому урожай определялся только числом заходов, а прокачка
// лейки не давала НИЧЕГО — 1.47 урожая в сутки и на стартовых инструментах, и
// на лучших. Та же дыра, что в зависти: улучшение, которого нельзя
// почувствовать.
//
// Значит ожидания живут в МИНУТАХ, а сад — игра, в которой сидят: пока одна
// грядка тянется, копаешь вторую. Оффлайн при этом не отменяется — растение
// считается от метки времени и дозревает без игрока (инвариант 1), просто он
// не единственный путь.
//
// Запуск:  node tools/sim-garden.js

const SESSION_MIN = 10;      // сколько игрок сидит в саду за заход
const TICK = 1;              // секунда

// Ступени инструментов: ожидание после действия, СЕКУНДЫ.
const CANS = [180, 120, 75];   // лейка: ждать после полива
const HOES = [120, 80, 50];    // тяпка: ждать после прополки

// Ручная работа: сколько секунд занимает само действие. Это и есть
// «размеренность» — действия нарочно не мгновенные, и они же наполняют
// шкалу лени.
const WORK = { dig: 6, sow: 4, water: 5, weed: 5, pick: 3 };
const HANDS_ON = WORK.dig + WORK.sow + WORK.water + WORK.weed + WORK.pick;

function simulate(beds, canLvl, hoeLvl) {
    const w1 = CANS[canLvl], w2 = HOES[hoeLvl];
    const state = new Array(beds).fill(null).map(() => ({ stage: 'empty', readyAt: 0 }));
    let t = 0, busyUntil = 0, harvests = 0;

    while (t < SESSION_MIN * 60) {
        if (t >= busyUntil) {
            // Руки свободны — ищем грядку, с которой можно что-то сделать.
            let picked = null;
            for (const b of state) {
                if (b.stage === 'empty') { picked = { b, work: WORK.dig + WORK.sow + WORK.water, next: 'watered', wait: w1 }; break; }
                if (b.stage === 'watered' && t >= b.readyAt) { picked = { b, work: WORK.weed, next: 'weeded', wait: w2 }; break; }
                if (b.stage === 'weeded' && t >= b.readyAt) { picked = { b, work: WORK.pick, next: 'empty', wait: 0, harvest: true }; break; }
            }
            if (picked) {
                busyUntil = t + picked.work;
                picked.b.stage = picked.next;
                picked.b.readyAt = busyUntil + picked.wait;
                if (picked.harvest) harvests++;
            }
        }
        t += TICK;
    }
    return harvests;
}

console.log(`заход ${SESSION_MIN} минут, ручной работы на цикл ${HANDS_ON} с\n`);
console.log('урожаев за заход');
const beds = [1, 2, 3, 4, 6, 8, 10];
console.log(['грядок'].concat(beds).map(h => String(h).padStart(9)).join(''));
const setups = [
    { name: 'стартовые', can: 0, hoe: 0 },
    { name: 'средние',   can: 1, hoe: 1 },
    { name: 'лучшие',    can: 2, hoe: 2 }
];
for (const s of setups) {
    const row = [s.name];
    for (const n of beds) row.push(simulate(n, s.can, s.hoe));
    console.log(row.map(h => String(h).padStart(9)).join(''));
}

console.log('\nчистое ожидание одного цикла:');
for (const s of setups) {
    console.log(`  ${s.name.padEnd(11)} ${((CANS[s.can] + HOES[s.hoe]) / 60).toFixed(1)} мин` +
        `   (руками ещё ${HANDS_ON} с)`);
}

console.log('\nгде грядка перестаёт окупаться (средние инструменты):');
let prev = 0;
for (let n = 1; n <= 12; n++) {
    const h = simulate(n, 1, 1);
    const gain = h - prev;
    console.log(`  грядка ${String(n).padStart(2)}: всего ${String(h).padStart(2)} урожая  ` +
        (gain > 0 ? `(+${gain})` : '(+0 — лишняя)'));
    prev = h;
}
