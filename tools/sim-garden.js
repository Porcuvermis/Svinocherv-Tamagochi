// ================= САД ЛЕНИ: УРОЖАЙ, УДОБРЕНИЕ, ИНСТРУМЕНТЫ =================
// Модель цикла (docs/plan/19-sloth-garden.md):
//   вскопал+посеял+полил → ЭТАП 1 (часы) → прополол → ЭТАП 2 (минуты) → собрал
//
// Этап 1 длинный и оффлайновый. Его ускоряет УДОБРЕНИЕ: одна какашка снимает
// час, скинуть можно хоть все часы разом. Базу этапа сокращает ЛЕЙКА.
// Этап 2 короткий и внутрисессионный. Его сокращают ГРАБЛИ.
//
// ---------- ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ ----------
// 1) Работает ли инструмент, который сокращает ожидание. Проверка нужна,
//    потому что первый расчёт этого сада показал: при ожидании в часы прокачка
//    не даёт НИЧЕГО — за один заход грядка продвигается ровно на одну стадию,
//    сколько бы ни ждала. Инструмент чего-то стоит только если ожидание
//    сравнимо с тем, сколько игрок готов ждать НЕ УХОДЯ (patience).
// 2) Не печатает ли круг «удобрение → урожай → блюдо → какашки» ресурсы из
//    ничего. Удобрение обязано быть чуть убыточным по ресурсу: платят за
//    ВРЕМЯ, а не за прибыль.
//
// Запуск:  node tools/sim-garden.js

const DAYS = 60;
const H = 60;                       // час в минутах

const CANS  = [3 * H, 2 * H, 1 * H];     // лейка: база этапа 1, ЦЕЛЫМИ часами
const RAKES = [25, 15, 6];               // грабли: этап 2, минуты
// Сколько минут игрок готов ждать в саду, не уходя. Это НЕ константа игры, а
// свойство живого человека: у одного три минуты, у другого пятнадцать.
// Поэтому грабли меряются не одним порогом, а полосой — см. таблицу внизу.
let PATIENCE = 8;

// Сколько какашек приносит плод, попав в блюдо. Блюдо из 4 плодов даёт 10
// мелких, то есть плод стоит 2.5 — а полный скип этапа 1 стоит 3 какашки.
// Отношение НАРОЧНО меньше единицы: см. проверку 2 выше.
const POOP_PER_FRUIT = 2.5;
const BASE_POOPS_PER_DAY = 3;            // кормёжки без своего урожая

const SCHEDULES = {
    'раз в день': [20],
    'два раза':   [9, 21],
    'три раза':   [8, 14, 21],
    'пять раз':   [8, 12, 15, 18, 22]
};

// policy: 'none' — не удобрять; 'top' — досыпать ровно столько, чтобы
// дозрело прямо сейчас; 'all' — скипать всегда всё.
function simulate(canLvl, rakeLvl, visits, policy, poopBudgetPerDay) {
    const b1 = CANS[canLvl], b2 = RAKES[rakeLvl];
    let stage = 'empty', readyAt = 0;
    let harvests = 0, poopsSpent = 0;
    let bank = 0;

    for (let day = 0; day < DAYS; day++) {
        bank += poopBudgetPerDay;
        for (const h of visits) {
            let now = day * 24 * H + h * H;
            const leaveAt = now + PATIENCE;
            let acted = true;
            while (acted) {
                acted = false;
                if (stage === 'empty') {
                    stage = 'growing'; readyAt = now + b1; acted = true;
                } else if (stage === 'growing') {
                    if (now < readyAt && policy !== 'none') {
                        // Удобрение снимает ЦЕЛЫЙ час, дробить нельзя.
                        const hoursLeft = Math.ceil((readyAt - now) / H);
                        const want = policy === 'all' ? hoursLeft
                            : (readyAt - now <= PATIENCE + H ? 1 : 0);
                        const use = Math.min(want, hoursLeft, Math.floor(bank));
                        if (use > 0) { readyAt -= use * H; bank -= use; poopsSpent += use; acted = true; }
                    }
                    if (now >= readyAt) { stage = 'weeded'; readyAt = now + b2; acted = true; }
                } else if (stage === 'weeded') {
                    // Готово сейчас — собираем. Осталось меньше терпения —
                    // ждём прямо в саду, не уходя.
                    if (now >= readyAt) { harvests++; stage = 'empty'; acted = true; }
                    else if (readyAt <= leaveAt) { now = readyAt; acted = true; }
                }
            }
        }
    }
    return { perDay: harvests / DAYS, poopsPerDay: poopsSpent / DAYS };
}

console.log(`этап 1 — часы (удобрение снимает час), этап 2 — минуты (грабли)`);
console.log(`игрок готов ждать в саду ${PATIENCE} мин, дальше уходит\n`);

console.log('УРОЖАЕВ В СУТКИ С ОДНОЙ ГРЯДКИ, без удобрений');
console.log(['лейка/грабли'].concat(Object.keys(SCHEDULES)).map(s => String(s).padStart(13)).join(''));
for (let i = 0; i < 3; i++) {
    const row = [`ступень ${i}`];
    for (const k of Object.keys(SCHEDULES)) {
        row.push(simulate(i, i, SCHEDULES[k], 'none', 0).perDay.toFixed(2));
    }
    console.log(row.map(s => String(s).padStart(13)).join(''));
}

console.log('\nОТДЕЛЬНО ГРАБЛИ (лейка стартовая, три захода, без удобрений)');
console.log(`  порог «подожду, не уходя» — ${PATIENCE} мин`);
for (let r = 0; r < 3; r++) {
    const res = simulate(0, r, SCHEDULES['три раза'], 'none', 0);
    const waits = RAKES[r] <= PATIENCE ? '  ← укладывается в терпение' : '';
    console.log(`  грабли ${String(RAKES[r]).padStart(2)} мин: ${res.perDay.toFixed(2)} урожая/сутки${waits}`);
}

// Грабли по полосе терпения: у разных игроков порог разный, поэтому ступень
// инструмента ценна ровно тем, какую часть этой полосы она захватывает.
console.log('\nГРАБЛИ ПО ПОЛОСЕ ТЕРПЕНИЯ (урожаев в сутки, три захода)');
const band = [3, 5, 8, 12, 20];
console.log(['грабли'].concat(band.map(p => p + ' мин')).map(s => String(s).padStart(10)).join(''));
for (let r = 0; r < 3; r++) {
    const row = [`${RAKES[r]} мин`];
    for (const p of band) {
        PATIENCE = p;
        row.push(simulate(0, r, SCHEDULES['три раза'], 'none', 0).perDay.toFixed(2));
    }
    console.log(row.map(s => String(s).padStart(10)).join(''));
}
PATIENCE = 8;

console.log('\nОТДЕЛЬНО ЛЕЙКА — она меняет не ожидание, а ЦЕНУ полного скипа');
for (let c = 0; c < 3; c++) {
    const res = simulate(c, 0, SCHEDULES['три раза'], 'all', 99);
    console.log(`  лейка ${(CANS[c] / H)} ч: ${res.perDay.toFixed(2)} урожая/сутки, ` +
        `скип стоит ${res.poopsPerDay.toFixed(2)} 💩/сутки`);
}

console.log('\nУДОБРЕНИЕ (три захода, стартовые инструменты, запас 3 какашки/сутки)');
for (const policy of ['none', 'top', 'all']) {
    const res = simulate(0, 0, SCHEDULES['три раза'], policy, BASE_POOPS_PER_DAY);
    const gained = res.perDay * POOP_PER_FRUIT;
    const label = { none: 'не удобрять', top: 'досыпать час', all: 'скипать всё' }[policy];
    console.log(`  ${label.padEnd(14)} ${res.perDay.toFixed(2)} урожая  ` +
        `тратит ${res.poopsPerDay.toFixed(2)} 💩  приносит ${gained.toFixed(2)} 💩  ` +
        `итог ${(gained - res.poopsPerDay).toFixed(2)}`);
}
