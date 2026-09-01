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

// Конфиг берётся ЖИВОЙ, а не переписывается сюда числами: цена плода в
// какашках задаётся таблицей качества блюда на кухне, и списанная копия
// разошлась бы с ней при первой же правке — а именно на этом отношении и
// держится проверка «круг не печатает ресурсы».
const fs = require('fs');
const win = {};
new Function('module', 'window',
    fs.readFileSync(__dirname + '/../src/config/kitchen.js', 'utf8'))({ exports: {} }, win);
const KITCHEN = win.KITCHEN;
new Function('module', 'window',
    fs.readFileSync(__dirname + '/../src/config/garden.js', 'utf8'))({ exports: {} }, win);
const GARDEN = win.GARDEN;

const DAYS = 60;
const H = 60;                       // час в минутах

// Ступени инструментов берутся из ЖИВОГО конфига, а не переписываются сюда.
// Одна такая копия уже соврала: в симуляторе стояла своя цена плода в
// какашках, разошлась с кухней, и «круг не печатает» проверялось по числу,
// которого в игре нет (docs/traps.md, п. 11).
const CANS  = GARDEN.CAN_TIERS.map(t => t.hours * H);   // лейка: база этапа 1
const RAKES = GARDEN.RAKE_MINUTES;                      // грабли: этап 2, минуты
// Сколько минут игрок готов ждать в саду, не уходя. Это НЕ константа игры, а
// свойство живого человека: у одного три минуты, у другого пятнадцать.
// Поэтому грабли меряются не одним порогом, а полосой — см. таблицу внизу.
let PATIENCE = 8;

// Сколько какашек приносит ОДИН плод. Считается из живой таблицы качества:
// лучшее блюдо кухни требует по одному продукту каждого из трёх типов и
// возвращает столько-то мелких — делим одно на другое.
//
// Это и есть точка стыка двух мини-игр, и её нельзя задавать числом здесь:
// подняли награду за блюдо на кухне — сад немедленно начинает печатать
// ресурсы, и узнать об этом надо ЗДЕСЬ, а не через месяц.
const FRUITS_PER_DISH = KITCHEN.CHOP_TYPES.length;
const POOP_PER_FRUIT = KITCHEN.quality[KITCHEN.CHOP_TYPES.length].poop / FRUITS_PER_DISH;
const BASE_POOPS_PER_DAY = 3;            // кормёжки без своего урожая

// Сколько какашек стоит снять ОДИН час этапа 1. Это число сада, а не кухни, и
// именно им круг удерживается от печатания: награда за плод задана кухней и
// трогать её нельзя, а цену времени сад назначает себе сам.
const FERT_COST = +(process.env.FERT_COST || 1);

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
                        const use = Math.min(want, hoursLeft, Math.floor(bank / FERT_COST));
                        if (use > 0) {
                            readyAt -= use * H;
                            bank -= use * FERT_COST;
                            poopsSpent += use * FERT_COST;
                            acted = true;
                        }
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

// ---------- ГЛАВНАЯ ПРОВЕРКА СТЫКА С КУХНЕЙ ----------
// Круг «удобрение → урожай → блюдо → какашки» не имеет права печатать ресурсы
// из ничего: платят за ВРЕМЯ, а не за прибыль. Опасный угол — не стартовая
// лейка, а ЛУЧШАЯ: она втрое удешевляет скип, оставляя награду за плод той же.
// Считаем по всем ступеням лейки и по всем расписаниям сразу, потому что
// печатать круг может начать в одной-единственной клетке этой таблицы.
console.log('\nПЕЧАТАЕТ ЛИ КРУГ (итог за сутки: приносит − тратит)');
console.log(`  час стоит ${FERT_COST} 💩, плод стоит ${POOP_PER_FRUIT.toFixed(2)} 💩 ` +
            `(блюдо из ${FRUITS_PER_DISH} плодов даёт ${KITCHEN.quality[KITCHEN.CHOP_TYPES.length].poop})`);
console.log('    лейка'.padEnd(12) + ['не удобрять', 'скипать всё', 'разница'].map(s => s.padStart(14)).join(''));
let printing = false;
for (let can = 0; can < CANS.length; can++) {
    const row = [];
    let none = 0, all = 0;
    for (const policy of ['none', 'all']) {
        const res = simulate(can, 2, SCHEDULES['три раза'], policy, 99);
        const net = res.perDay * POOP_PER_FRUIT - res.poopsPerDay;
        if (policy === 'none') none = net; else all = net;
        row.push(net.toFixed(2).padStart(14));
    }
    const diff = all - none;
    if (diff > 0) printing = true;
    row.push((diff > 0 ? '+' + diff.toFixed(2) + ' ⚠' : diff.toFixed(2)).padStart(14));
    console.log(`  ${(CANS[can] / H) + ' ч'}`.padEnd(12) + row.join(''));
}
console.log(printing
    ? '  ⚠ УДОБРЕНИЕ ВЫГОДНО ПО РЕСУРСУ — круг печатает, баланс надо править'
    : '  удобрение убыточно по ресурсу во всех ступенях — как и задумано');

// ================= ЧТО ПОКУПАЮТ СТУПЕНИ ЛЕЙКИ =================
// Таблицы выше меряют ЧАСЫ — то, чего игрок не ждёт, а уходит. Ранние ступени
// лейки часов не трогают вовсе, они сокращают СЕКУНДЫ С ЛЕЙКОЙ В РУКЕ, и в
// расчёте урожая их не видно совсем. Считать их надо отдельно, иначе три
// первые покупки выглядят пустыми, хотя они единственные, чей эффект игрок
// видит своими глазами.
console.log('\nЧТО ПОКУПАЮТ СТУПЕНИ ЛЕЙКИ');
console.log('  ступень'.padEnd(12) + ['полив', 'этап 1'].map(s => s.padStart(14)).join('') +
            '   секунд с лейкой в сутки');
const PLANTS_PER_DAY = 3;        // столько раз в сутки в среднем сажают заново
GARDEN.CAN_TIERS.forEach((t, i) => {
    const sec = (t.pour / 1000);
    console.log(`  ${i}`.padEnd(12) +
        (sec.toFixed(1) + ' с').padStart(14) +
        (t.hours + ' ч').padStart(14) +
        (sec * PLANTS_PER_DAY).toFixed(1).padStart(20));
});

// ================= НАХОДКИ В ЗЕМЛЕ =================
// Лунку копают перед каждой посадкой, значит находки — самый частый приток в
// саду. Бросок идёт по очереди от редкого к частому и останавливается на
// первой удаче, поэтому шанс частой находки НЕ равен её собственному: его
// съедают те, кто стоит выше. Считаем ровно так, как это делает Backend.
console.log('\nНАХОДКИ ЗА ОДИН КОПОК (бросок по очереди, останов на первой удаче)');
let pass = 1;
const perDig = {};
GARDEN.digFinds.forEach(f => {
    const p = pass * f.chance;
    perDig[f.what] = p;
    pass *= (1 - f.chance);
    console.log(`  ${f.what}`.padEnd(18) +
        `${(f.chance * 100).toFixed(1)}% сам по себе`.padStart(20) +
        `${(p * 100).toFixed(1)}% на деле`.padStart(18) +
        `  раз в ${(1 / p).toFixed(1)} копков`);
});
console.log(`  ничего`.padEnd(18) + `${(pass * 100).toFixed(1)}%`.padStart(38));
console.log(`\n  при ${PLANTS_PER_DAY} посадках в сутки: ` +
    Object.keys(perDig).map(k => `${k} ${(perDig[k] * PLANTS_PER_DAY).toFixed(2)}/сутки`).join(', '));
console.log('  Числа прикидочные: сток (цены апгрейдов) ещё не написан, и сводить\n' +
    '  приток с пустотой нечего. Проверять их снова — когда появится магазин.');

// ================= ЧЕМ ПЛАТИТСЯ НОВАЯ ГРЯДКА =================
// Заваленные грядки открываются за жетоны лени, а жетон копится из осколков
// за собранный урожай. Значит цена грядки меряется не золотом, а СБОРАМИ — и
// её надо держать в уме рядом с пропускной способностью участка, иначе
// участок либо раскрывается за пять минут, либо не раскрывается никогда.
const perToken = 3;                        // ECONOMY.exchange: три осколка = жетон
const harvestsPerBed = (GARDEN.BED_COST.amount * perToken) / GARDEN.HARVEST_SHARDS;
console.log('\nЦЕНА НОВОЙ ГРЯДКИ');
console.log(`  ${GARDEN.BED_COST.amount} жетон = ${harvestsPerBed} собранных урожая ` +
            `(осколок за урожай, ${perToken} осколка в жетоне)`);
[1, 2, 3].forEach(visits => {
    const res = simulate(0, 0, SCHEDULES[visits === 1 ? 'раз в день' : visits === 2 ? 'два раза' : 'три раза'], 'none', 99);
    const days = harvestsPerBed / Math.max(0.01, res.perDay);
    // Счёт идёт на ОДНУ грядку, как и все таблицы выше. На старте их две,
    // значит вдвое быстрее — но и открытая грядка требует ухода, поэтому
    // делить надо на то, сколько игрок реально обслуживает, а не на число мест.
    console.log(`  ${visits} заход(а) в день: ${res.perDay.toFixed(2)} урожая/сутки с ОДНОЙ грядки → ` +
                `грядка раз в ${days.toFixed(1)} суток (с двух — вдвое быстрее)`);
});
console.log(`  Все ${GARDEN.BEDS_TOTAL - GARDEN.BEDS_OPEN} заваленных грядок — это ` +
            `${(GARDEN.BEDS_TOTAL - GARDEN.BEDS_OPEN) * harvestsPerBed} урожаев. ` +
            `Число прикидочное:\n  сводить его надо вместе с ценами инструментов, когда появится магазин.`);

// ================= СЕМЕНА И СЕНО =================
// Семечка тратится на посадку и возвращается лишь иногда. Отсюда простое и
// жёсткое следствие, которое надо видеть числом, а не на ощупь: одна семечка
// даёт 1/(1−шанс) посадок, и без притока вид ВЫМИРАЕТ. Приток до магазина
// один — находки в земле.
console.log('\nСЕМЕНА: СКОЛЬКО ЖИВЁТ ОДИН ВИД');
GARDEN.SEED_RETURN.forEach((p, i) => {
    const perSeed = 1 / (1 - p);
    // Копка лунки идёт перед каждой посадкой, значит на посадку приходится
    // ровно один шанс найти семечко (см. таблицу находок выше).
    const find = perDig.seed || 0;
    const withFind = 1 / Math.max(0.001, 1 - p - find);
    console.log(`  ступень ${i} (${Math.round(p * 100)}%): ` +
        `${perSeed.toFixed(2)} посадок с семечки, ` +
        `${withFind.toFixed(2)} с учётом находок`);
});
console.log('  Вымирание — задумано: семена покупаются в магазине за сено,\n' +
            '  а новые виды открываются за жетоны. Пока магазина нет, огород\n' +
            '  держится на находках и на бесконечной траве.');

console.log('\nСЕНО: ВТОРОЙ ПРОДУКТ ЛЮБОГО РАСТЕНИЯ');
Object.keys(GARDEN.species).forEach(key => {
    const sp = GARDEN.species[key];
    console.log(`  ${key}`.padEnd(12) + `${sp.hay} сена`.padStart(9) +
        (sp.fruit ? `, плод + осколок` : `, без плода и осколка — бесконечная`));
});
[1, 2, 3].forEach(visits => {
    const res = simulate(0, 0, SCHEDULES[visits === 1 ? 'раз в день' : visits === 2 ? 'два раза' : 'три раза'], 'none', 99);
    console.log(`  ${visits} заход(а) в день, одна грядка травой: ` +
        `${(res.perDay * GARDEN.species.grass.hay).toFixed(1)} сена/сутки`);
});
console.log('  Цену семечки в сене ставить рано: магазина нет, и сводить\n' +
            '  приток не с чем. Считать здесь же, когда он появится.');
