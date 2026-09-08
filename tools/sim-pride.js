// ================= ДОРОЖКА ТЩЕСЛАВИЯ: СКОЛЬКО ПЛАТИТ ВЫХОД =================
// Считает, сколько поцелуев приносит один выход при разной толпе, разной
// машине и разной точности игрока. Нужен затем же, зачем sim-slots.js:
// сначала посчитать, потом расставлять ценники (docs/plan/17-pride.md).
//
// Правила ровно те, что в игре:
//   • зона живёт lifeMs, новая появляется раз в интервал spawnMs;
//   • СТРИК растят только БЕЛЫЕ зоны, множитель = длина стрика до потолка
//     машины;
//   • ПОЦЕЛУЙНЫЕ зоны не появляются вовсе, пока стрик нулевой; поцелуй
//     платит множителем, стрик удерживает, но не растит;
//   • ЛЮБАЯ незакрытая зона рвёт стрик — и та, что погасла, и тап в пустоту.
//
// Ажиотаж, который копился и проседал, выброшен целиком. Он решал ту же
// задачу, что теперь решает стрик, и решал мягче — а мягкость здесь как раз
// и была проблемой: множитель полз вверх сам собой и почти не зависел от
// того, как играют. Зато у жёсткого стрика есть своя цена, и она видна ниже:
// доход целиком упирается в ТОЧНОСТЬ, а не в покупки.
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
// Выходов на клетку. Было двадцать тысяч, пока выход считался одним проходом
// по списку зон; событийная модель дороже раз в пять, и на двадцати тысячах
// калькулятор идёт минуты. Четырёх хватает: разброс между запусками держится
// в пределах ±0.1 поцелуя, а проверка ступеней сравнивает разницы в единицы.
const RUNS = 4000;

// ---------- ПОТОЛОК ПАЛЬЦА ----------
// Главное число этого калькулятора и единственное, которого нет в конфиге:
// сколько зон человек ФИЗИЧЕСКИ успевает закрыть за секунду. Тапать в одну
// точку можно и впятеро быстрее, но здесь каждый тап — это ещё и заметить
// зону и довести до неё палец; устойчиво выходит два с половиной в секунду.
//
// Без этого потолка калькулятор считает, что игрок успевает всё, и любая
// прибавка плотности выглядит чистым выигрышем. На деле у неё есть край, за
// которым зоны начинают гаснуть сами, а погасшая зона рвёт стрик и гасит
// экран — то есть покупка массовки может начать ВРЕДИТЬ. Ровно этот край
// здесь и ищем.
const TAP_RATE = 2.5;

// Ступени берутся из конфига: base — то, с чего начинают, levels[].bonus —
// значение каждой купленной ступени.
const steps = (branch) => [branch.base].concat(branch.levels.map(l => l.bonus));
const RADIUS = steps(UP.crowd);     // толпа — ширина зоны
const CARS = steps(UP.car);         // машина — потолок множителя
const LIFE = steps(UP.carpet);      // дорожка — сколько зона висит
const PRICES = UP.crowd.levels.map(l => l.price.pride_kiss);
const CAR_PRICES = UP.car.levels.map(l => l.price.pride_kiss);

// ---------- ЧАСТОТА ЗОН ----------
// Скрытая ручка: её двигает любая купленная ступень любой линии. Считается
// так же, как в Backend.prideRun(), и это не дубль ради удобства — иначе
// калькулятор считал бы другую игру.
const spawnAt = (steps) => Math.max(CFG.spawnFloor, CFG.spawnBase - CFG.spawnStep * steps);

// ---------- ТОЧНОСТЬ ОТ ШИРИНЫ И ВРЕМЕНИ ----------
// Обе покупки, кроме машины, работают только через ОДНО — через то, чаще ли
// игрок попадает. Модель простая и намеренно грубая: базовая точность даётся
// на стартовой зоне (радиус 44, полторы секунды), шире зона и дольше висит —
// промахов меньше. Дальше единицы: доля НЕзакрытых зон делится пополам между
// «не успел» (зона погасла) и «ткнул мимо» (сброс).
// Точность — это ТОЛЬКО «попал ли пальцем», без «успел ли вообще»: успевание
// теперь считает сама событийная модель ниже. Поэтому показатель у времени
// жизни стал втрое мягче прежнего (0.8 → 0.3): длинная зона по-прежнему даёт
// прицелиться спокойнее, но больше не изображает заодно и запас времени,
// который модель и так видит.
function accuracyAt(radius, lifeMs, base) {
    const miss = 1 - base;
    const byRadius = Math.pow(UP.crowd.base / radius, 1.15);   // шире зона — реже мажешь
    const byLife = Math.pow(UP.carpet.base / lifeMs, 0.3);     // дольше висит — спокойнее целишься
    return 1 - Math.min(0.98, miss * byRadius * byLife);
}

// Мешок зон — ТОТ ЖЕ, что в игре: из `of` зон ровно `kisses` поцелуйных,
// тянем без возврата. Доля теперь фиксированная, но мешок остался: он
// заметно ровнее монетки на коротком выходе в тридцать зон.
function drawBag() {
    const b = CFG.kissBag;
    const bag = Array.from({ length: b.of }, (_, i) => i < b.kisses);
    for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    return bag;
}

// ---------- ОДИН ВЫХОД, ПО СОБЫТИЯМ ----------
// Раньше здесь зоны шли ПОДРЯД: одна зона — одна итерация, «успел/не успел»
// решалось долей от потолка пальца. Это перестало годиться, когда разрыв стал
// сносить ВЕСЬ экран: цена разрыва — это число ВИСЯЩИХ зон, а сколько их
// висит, в модели «зоны подряд» вообще не выражается. Попытка приписать
// потерю формулой lifeMs/interval дала прямую ложь: покупка дорожки выходила
// ВРЕДНОЙ (`docs/traps.md`, п. 64).
//
// Поэтому теперь считается ровно то, что происходит на экране:
//
//   • зона появляется раз в interval, живёт lifeMs, больше maxTargets на
//     экране не держится;
//   • палец обрабатывает одну зону раз в 1/TAP_RATE секунды и берёт ту, что
//     умрёт раньше всех, — так же, как игра выбирает зону под тапом;
//   • промах пальца и погасшая зона рвут стрик и ГАСЯТ ЭКРАН.
//
// Цена разрыва после этого не задаётся коэффициентом, а получается сама: и
// снесённые зоны, и пауза до следующего спавна, и то, что часть снесённых
// игрок всё равно не успел бы закрыть.
function run(interval, cap, accuracy, lifeMs) {
    const tapEvery = 1000 / TAP_RATE;
    const need = CFG.streak.needForKiss;
    let live = [], streak = 0, kisses = 0, bag = [];
    let tSpawn = interval, tTap = tapEvery;
    const wipe = () => { streak = 0; bag = []; live = []; };
    for (;;) {
        const tDie = live.length ? live[0].die : Infinity;
        const t = Math.min(tSpawn, tTap, tDie);
        if (t > CFG.runMs) break;

        if (t === tDie) { wipe(); continue; }        // не успели — экран гаснет

        if (t === tTap) {
            tTap = t + tapEvery;
            if (!live.length) continue;              // тыкать не во что — палец ждёт
            if (Math.random() > accuracy) { wipe(); continue; }
            const z = live.shift();
            if (z.kiss) kisses += Math.min(cap, Math.max(1, streak));
            else streak += CFG.streak.perHit;
            continue;
        }

        tSpawn = t + interval;
        if (live.length >= CFG.maxTargets) continue;
        // Пока стрик нулевой, мешок НЕ трогаем: поцелуйных зон в это время не
        // бывает, и выпавший впустую поцелуй съедал бы долю уже открытого
        // периода (в игре так же — pride.js, spawnTarget).
        const kiss = streak >= need ? (bag.length ? bag : (bag = drawBag())).pop() : false;
        live.push({ die: t + lifeMs, kiss });
        live.sort((a, b) => a.die - b.die);
    }
    return kisses;
}

// Память на посчитанное: дневная модель спрашивает доход по одной и той же
// клетке сотни раз (каждый день до следующей покупки — одна и та же), а
// каждый ответ стоит двадцати тысяч выходов.
const AVG_CACHE = new Map();
// Доход клетки: сколько поцелуев даёт выход при таких покупках. Все три
// линии сходятся здесь — толпа через ширину зоны, дорожка через её время,
// машина через потолок множителя, а частота считается из их суммы.
function avg(lv, base) {
    const key = lv.crowd + ':' + lv.car + ':' + lv.carpet + ':' + base;
    if (AVG_CACHE.has(key)) return AVG_CACHE.get(key);
    const interval = spawnAt(lv.crowd + lv.car + lv.carpet);
    const acc = accuracyAt(RADIUS[lv.crowd], LIFE[lv.carpet], base);
    let sum = 0;
    for (let i = 0; i < RUNS; i++) sum += run(interval, CARS[lv.car], acc, LIFE[lv.carpet]);
    const v = sum / RUNS;
    AVG_CACHE.set(key, v);
    return v;
}
const L = (crowd, car, carpet) => ({ crowd, car, carpet });

for (const base of [1, 0.85, 0.7]) {
    console.log(`\n=== точность ${(base * 100).toFixed(0)}% на стартовой зоне — поцелуев за выход ===`);
    console.log(['линии\\машина'].concat(CARS.map(c => `×${c}`))
        .map(h => String(h).padStart(16)).join(''));
    // Строка — одинаковый уровень толпы и дорожки: игрок редко качает одну
    // линию в отрыве от другой, а таблица с тремя осями нечитаема.
    for (let lv = 0; lv < RADIUS.length; lv++) {
        const zones = Math.floor(CFG.runMs / spawnAt(lv * 2));
        const row = [`${lv}: ${RADIUS[lv]}px ${LIFE[lv]}мс`];
        for (let car = 0; car < CARS.length; car++) row.push(avg(L(lv, car, lv), base).toFixed(1));
        console.log(row.map(h => String(h).padStart(16)).join(''));
    }
}

// ---------- ЦЕНЫ И ТЕМП ----------
const base = avg(L(0, 0, 0), 0.85);
const top = avg(L(RADIUS.length - 1, CARS.length - 1, LIFE.length - 1), 0.85);
const lineCost = PRICES.reduce((a, b) => a + b, 0);
console.log(`\nстартовый доход (толпа 0, ×${CARS[0]}, точность 85%): ${base.toFixed(1)} поцелуев/выход`);
console.log(`полностью прокачанный:                            ${top.toFixed(1)} поцелуев/выход  (×${(top / base).toFixed(1)})`);
console.log(`массовка и дорожка: ${PRICES.join(' → ')}   всего ${lineCost} за линию`);
console.log(`машина:             ${CAR_PRICES.join(' → ')}   всего ${CAR_PRICES.reduce((a, b) => a + b, 0)}`);
console.log(`три линии: ${lineCost * 2 + CAR_PRICES.reduce((a, b) => a + b, 0)} поцелуев`);
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

// ---------- НЕ СТАЛА ЛИ КАКАЯ-ТО ЛИНИЯ ЛОВУШКОЙ ----------
// Каждая ступень каждой линии ОБЯЗАНА платить больше предыдущей. Проверка
// стоит здесь с тех пор, как плотная лестница массовки однажды провалилась:
// зоны пошли гуще, чем успевает палец, и купленная ступень стала приносить
// МЕНЬШЕ некупленной (docs/traps.md, п. 53). Теперь частота скрытая и общая,
// но проверять надо тем более.
// Смотреть надо ПРИ КУПЛЕННЫХ соседях, а не в вакууме: при машине ×1
// множитель не работает вовсе, и вклад ширины зоны с временем выглядит
// втрое меньше, чем он есть в живой игре.
console.log('\nпроверка ступеней (точность 85%, у соседних линий середина):');
const MID = 3, MIDCAR = 3;
let trap = false;
[['crowd', (i) => L(i, MIDCAR, MID)], ['car', (i) => L(MID, i, MID)], ['carpet', (i) => L(MID, MIDCAR, i)]]
    .forEach(([key, mk]) => {
        const n = UP[key].levels.length;
        let prev = null;
        const row = [];
        for (let i = 0; i <= n; i++) {
            const v = avg(mk(i), 0.85);
            row.push(v.toFixed(1) + (prev !== null && v < prev ? ' ✗' : ''));
            if (prev !== null && v < prev) trap = true;
            prev = v;
        }
        console.log(`  ${UP[key].name.padEnd(9)} ${row.join(' → ')}`);
    });
console.log(trap ? '  ✗ ЕСТЬ СТУПЕНЬ, КОТОРАЯ ПЛАТИТ МЕНЬШЕ ПРЕДЫДУЩЕЙ'
                 : '  каждая ступень платит больше предыдущей — ловушки нет');

// Первое улучшение должно быть в досягаемости за несколько выходов, иначе
// линия покупок начинается с недели ожидания.
// Смотреть надо на САМУЮ ДЕШЁВУЮ из трёх, а не на цену массовки: игрок
// покупает то, на что первым хватило, и это машина за тридцать. Пока здесь
// стояла одна линия, проверка ругалась на цену, до которой очередь дойдёт
// только третьей.
const cheapest = Math.min(PRICES[0], CAR_PRICES[0], steps(UP.carpet).length ? UP.carpet.levels[0].price.pride_kiss : Infinity);
const first = cheapest / base;
console.log(`первая покупка — ${cheapest} 💋, это ${first.toFixed(1)} выхода на стартовых числах` +
            (first > 8 ? '   ⚠ дороговато для первой' : ''));

// ================= СКОЛЬКО ДНЕЙ КОПИТЬ =================
// Главный вопрос ко всей линии покупок, и «сколько выходов» на него не
// отвечает. Выходов можно сделать хоть двести за вечер — а вот заплатят за
// них по убывающей, и именно суточная лестница, а не ценник, решает, растянется
// прокачка на месяцы или кончится за час.
//
// Поэтому здесь считается ДЕНЬ, а не выход: игрок делает N выходов в сутки,
// каждый следующий оплачивается всё хуже, купленное поднимает доход
// следующих дней. Покупается всегда самое дешёвое из доступного — так ведёт
// себя человек, у которого три ценника перед глазами.
function daysToBuyAll(perDay, accuracy) {
    const levels = { crowd: 0, car: 0, carpet: 0 };
    const price = (key) => {
        const l = UP[key].levels[levels[key]];
        return l ? l.price.pride_kiss : Infinity;
    };
    const income = () => avg(levels, accuracy);
    const total = ['crowd', 'car', 'carpet']
        .reduce((sum, k) => sum + UP[k].levels.reduce((a, l) => a + l.price.pride_kiss, 0), 0);

    let wallet = 0, day = 0, bought = 0;
    const log = [];
    const steps = ['crowd', 'car', 'carpet'].reduce((n, k) => n + UP[k].levels.length, 0);
    while (bought < steps && day < 3000) {
        day++;
        const per = income();
        let dayIncome = 0;
        for (let i = 1; i <= perDay; i++) dayIncome += Math.max(1, Math.round(per * share(i)));
        wallet += dayIncome;
        // Покупки разбираются в конце дня: игрок заходит, видит, что хватило.
        let again = true;
        while (again) {
            again = false;
            const best = ['crowd', 'car', 'carpet']
                .filter(k => levels[k] < UP[k].levels.length)
                .sort((a, b) => price(a) - price(b))[0];
            if (best && wallet >= price(best)) {
                const paid = price(best);
                wallet -= paid;
                levels[best]++;
                bought++;
                // Копил — в ДОЛЯХ ДНЯ, а не в целых: на дешёвых ступенях
                // разница «один день против двух» это округление, а не
                // кривая, и по целым дням любая лестница выглядит стеной.
                log.push({ day, key: best, lvl: levels[best], price: paid,
                           daysFor: paid / dayIncome });
                again = true;
            }
        }
    }
    return { day, log, total, income: income() };
}

console.log('\n=== сколько дней копить на ВСЮ прокачку ===');
console.log('(покупается самое дешёвое из доступного, точность 85%)');
for (const perDay of [2, 4, 10, 40]) {
    const r = daysToBuyAll(perDay, 0.85);
    const firstDay = r.log.length ? r.log[0].day : '—';
    console.log(`  ${String(perDay).padStart(2)} выхода в день: всё куплено на ${String(r.day).padStart(3)}-й день   ` +
                `(первая покупка на ${firstDay}-й, всего ${r.total} 💋)`);
}

// Корридор времени из docs/plan/15-progression.md: каждая следующая ступень
// копится в 1.2–1.7 раза дольше предыдущей. Ниже — контент выедается за
// вечер, выше — игрок упирается в стену.
const ref = daysToBuyAll(3, 0.85);
// Коридор считается ВНУТРИ ЛИНИИ, а не по порядку покупок. Три линии стоят
// одинаково и разбираются вперемешку, и сравнивать соседние покупки из разных
// линий бессмысленно: ряд 1.0, 0.9, 0.8, 1.5, 1.4 — это не кривая цен, это
// три одинаковые ступени подряд.
console.log('\nпо ступеням при трёх выходах в день (коридор 1.2–1.7 внутри линии):');
['crowd', 'car', 'carpet'].forEach(key => {
    console.log(`  ${UP[key].name}:`);
    let prevFor = null;
    ref.log.filter(b => b.key === key).forEach(b => {
        const ratio = prevFor ? b.daysFor / prevFor : null;
        console.log(`    ур.${b.lvl}  ${String(b.price).padStart(5)} 💋   ` +
                    `куплено на ${String(b.day).padStart(3)}-й день   ` +
                    `копил ${b.daysFor.toFixed(1)} дн.` +
                    (ratio ? `   ×${ratio.toFixed(2)}` +
                        (ratio > 1.75 ? '  ⚠ стена' : (ratio < 1.15 ? '  ⚠ слишком дёшево' : '')) : ''));
        prevFor = b.daysFor;
    });
});
