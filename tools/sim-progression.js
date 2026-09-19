// ============ ТЕМП ПРОКАЧКИ: ДОЛГО ЛИ И ЧАСТО ЛИ ============
// Отвечает на два вопроса, которые в конфиге не видны ни по отдельности, ни
// вместе, и которые тянут в РАЗНЫЕ стороны:
//
//   1. СКОЛЬКО ВСЕГО. Полная прокавка должна занимать от полугода до года.
//      Выкупить всё за месяц — значит остаться без игры на второй месяц.
//   2. КАК ЧАСТО. Игрок должен покупать что-нибудь примерно раз в неделю,
//      иначе он не видит прогресса и уходит задолго до всякого «потолка».
//
// Одно без другого делается тривиально и оба раза неправильно: дешёвая
// лестница даёт частые покупки и кончается за месяц, дорогая тянется год и
// стоит игроку двух месяцев тишины между ступенями.
//
// ---------- ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ progression.js ----------
// `tools/progression.js` считает СИЛУ: во сколько раз ступень сильнее и как
// цена обязана обгонять силу (docs/plan/15-progression.md, разд. 4). Здесь
// сила не считается вовсе — считается КАЛЕНДАРЬ: в какой день игрок нажмёт
// кнопку «купить» и сколько дней между соседними нажатиями.
//
// ---------- МОДЕЛЬ ИГРОКА ----------
// Покупает ЖАДНО: как только хватает на самую дешёвую доступную ступень —
// берёт её. Так и ведёт себя живой игрок, и так получается САМАЯ ЧАСТАЯ из
// возможных раскладок покупок: если даже она даёт провалы, у живого игрока
// они будут больше.
//
// Доход у каждого греха свой и объявлен ниже, в INCOME: это не «числа из
// конфига», а предположения о ПРИСУТСТВИИ игрока, и врать они могут только
// явно — их видно и можно оспорить.
//
// Запуск из корня:  node tools/sim-progression.js
// Печатает все три профиля присутствия сразу; проверки ставятся на среднего.

const fs = require('fs');
const root = __dirname + '/..';
const src = fs.readFileSync(root + '/src/config/kitchen.js', 'utf8') + '\n'
          + fs.readFileSync(root + '/src/config/wrath-gear.js', 'utf8') + '\n'
          + fs.readFileSync(root + '/src/config/garden.js', 'utf8') + '\n'
          + fs.readFileSync(root + '/src/config/economy.js', 'utf8') + '\n'
          + 'module.exports = { KITCHEN, WRATH_GEAR, GARDEN, ECONOMY };';
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const { KITCHEN, WRATH_GEAR, GARDEN, ECONOMY } = mod.exports;

const say = console.log;
let bad = 0;
const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

// ---------- ЦЕЛЕВЫЕ ЧИСЛА ----------
// Полгода–год на всё и покупка примерно раз в неделю. Разбор, почему
// недельный темп меряется ПО ИГРЕ ЦЕЛИКОМ, а внутри одного греха допускается
// втрое реже, — docs/plan/15-progression.md, раздел 4а.
// ---------- ПОЧЕМУ ПОРОГ НЕ НА САМОМ ХУДШЕМ ПРОМЕЖУТКЕ ----------
// Самый долгий промежуток в любой лестнице — ПОСЛЕДНИЙ, и это не дефект, а
// определение: последняя ступень самая дорогая, копить на неё дольше всего.
// Порог, поставленный на него, требует уравнять все ступени — то есть убрать
// лестницу вовсе.
//
// Поэтому меряется РАСПРЕДЕЛЕНИЕ: медиана (типичная неделя игрока) и худший
// провал среди первых 90% покупок (вся игра, кроме финишной прямой). Хвост
// из нескольких дорогих ступеней в конце — это и есть ощущение «добрался до
// края», ради которого лестница и строится.
const TARGET = {
    fullDaysMin: 180,
    fullDaysMax: 365,
    gameMedianDays: 7,   // по игре целиком: типичная неделя с покупкой
    gameBulkGapDays: 14, // и на первых 90% покупок — без месячной тишины
    sinMedianDays: 14,   // внутри одного греха реже: у игрока ещё шесть лавок
    firstBuyDays: 2      // первую покупку игрок обязан сделать почти сразу
};

// Проверки ставятся на СРЕДНЕГО игрока: ленивый и усердный печатаются рядом
// как вилка, но подгонять числа под них нельзя — цель одна, и она посередине.
const CHECK_PROFILE = 'средний';

// ---------- ПРОФИЛИ ПРИСУТСТВИЯ ----------
// Сколько раз в сутки игрок заходит В КАЖДЫЙ грех. Это вилка, а не гадание:
// по ней видно, во сколько раз расходятся сроки у разного игрока.
const PROFILES = {
    'ленивый':  0.5,
    'средний':  1.5,
    'усердный': 3
};
// Текущий профиль прогона. Меняется в report() — модели дохода читают его.
let visits = PROFILES['средний'];

// ---------- ДОХОД ПО ГРЕХАМ ----------
// Возвращает, сколько ВАЛЮТЫ ЛЕСТНИЦЫ набегает за сутки при текущих уровнях.
// Доход зависит от уровней намеренно: прокачка, которая не ускоряет добычу,
// упирается в стену ровно посередине.
const INCOME = {

    // ---------- КУХНЯ ----------
    // Осколок падает за БЛЮДО, блюд в сутки столько, сколько раз успела
    // опуститься шкала до порога голода (payAt). Золото темп не двигает
    // вовсе — это и проверяет sim-kitchen-shop.js.
    //
    // Осколков за блюдо тем больше, чем больше РАЗНЫХ типов удалось собрать,
    // а это упирается в холодильник: с маленькой кладовой три типа
    // одновременно просто не лежат. Отсюда рост дохода вдоль лестницы: 1.5
    // осколка за блюдо в начале, 3 (потолок таблицы качества) в конце.
    gluttony(levels, conf) {
        const fridgeMax = conf.fridge.levels.length;
        const share = fridgeMax ? Math.min(1, (levels.fridge || 0) / fridgeMax) : 0;
        const shards = 1.5 + (3 - 1.5) * share;
        const cooksCap = 24 / (ECONOMY.sins.gluttony.drainHours *
                               (1 - ECONOMY.sins.gluttony.payAt / ECONOMY.sins.gluttony.max));
        return Math.min(visits, cooksCap) * shards / ECONOMY.exchange.glut_shard.per;
    },

    // ---------- ГНЕВ ----------
    // Доход здесь НЕ выводится, а взят готовым: его считает tools/sim-wrath-year.js
    // по настоящим боям — темп задаёт полоса здоровья и её регенерация, а не
    // число заходов, и повторять эту модель тут значило бы завести ей вторую
    // копию. Оттуда же взят и рост вдоль лестницы: 1.86 → 2.55 жетона в сутки
    // у среднего игрока (прокачка окупается). Профиль двигает это число
    // пропорционально присутствию.
    //
    // Числа сверяются запуском sim-wrath-year.js: разъедутся — увидим там.
    wrath(levels, conf) {
        const steps = (conf.order || []).reduce((s, k) => s + (levels[k] || 0), 0);
        const maxSteps = (conf.order || []).reduce(
            (s, k) => s + ((conf[k] && conf[k].levels) ? conf[k].levels.length : 0), 0);
        const share = maxSteps ? steps / maxSteps : 0;
        return (1.86 + (2.55 - 1.86) * share) * visits / PROFILES['средний'];
    },

    // ---------- ЛЕНЬ ----------
    // Осколок лени падает за СОБРАННЫЙ ПЛОД, три осколка — жетон. Урожаев в
    // сутки с грядки считает tools/sim-garden.js: около 0.5 при заходе раз в
    // день и около 1.5 при трёх — числа взяты оттуда, а не выведены заново.
    //
    // Доход растёт вдвойне: от КОЛИЧЕСТВА грядок (их покупают тут же) и от
    // граблей, которые вводят второй этап в полосу терпения игрока. Трава
    // сюда не считается вовсе — она даёт сено, но ни плода, ни осколка.
    sloth(levels, conf) {
        const beds = GARDEN.BEDS_OPEN + (levels.beds || 0);
        // Грабли ниже порога терпения (8 мин) удваивают число урожаев: игрок
        // дожидается второго этапа, не уходя.
        const rakeMin = GARDEN.RAKE_TIERS[Math.min(levels.rake || 0,
                        GARDEN.RAKE_TIERS.length - 1)].minutes;
        const perBed = (rakeMin <= 8 ? 1.0 : 0.5) * visits;
        return beds * perBed * GARDEN.HARVEST_SHARDS / ECONOMY.exchange.sloth_shard.per;
    },

    // ---------- ТЩЕСЛАВИЕ ----------
    // Поцелуи за выход, размена на жетоны нет — валюта прямая. Темп и здесь
    // держит не число заходов, а порог голода: платят только за выход, до
    // которого червь успел проголодаться. Числа сверены с tools/sim-pride.js
    // (у него всё выкупается на 199-й день при частых заходах).
    pride(levels, conf) {
        const steps = (conf.order || []).reduce((s, k) => s + (levels[k] || 0), 0);
        const maxSteps = (conf.order || []).reduce((s, k) => s + conf[k].levels.length, 0);
        const share = maxSteps ? steps / maxSteps : 0;
        const perRun = 12 + 30 * share;       // от 12 поцелуев за выход до 42
        const runsCap = 24 / (ECONOMY.sins.pride.drainHours *
                              (1 - ECONOMY.sins.pride.payAt / ECONOMY.sins.pride.max));
        return Math.min(visits, runsCap) * perRun;
    }
};

// ---------- ЛЕСТНИЦЫ САДА ----------
// У лени нет записи в ECONOMY.minigames: её ступени живут в GARDEN рядом с
// тем, что они меняют (миллисекунды полива, минуты прополки, циклы копания,
// шанс возврата семечки), а не отдельной таблицей бонусов. Собираем их к
// общей форме здесь — в календаре важна только ЦЕНА.
//
// Сюда же идут грядки и открытие новых видов: для игрока это такие же
// покупки за жетон, и пропустить их значит посчитать половину сада.
function slothLadders() {
    const price = (p) => ({ price: p });
    const out = {
        can:   { levels: GARDEN.CAN_TIERS.slice(1).map(t => price(t.price)) },
        rake:  { levels: GARDEN.RAKE_TIERS.slice(1).map(t => price(t.price)) },
        seed:  { levels: GARDEN.SEED_TIERS.slice(1).map(t => price(t.price)) },
        spade: { levels: (GARDEN.work.dig.price || []).filter(Boolean).map(price) },
        beds:  { levels: GARDEN.BED_COST.amounts.map(
                    n => price({ [GARDEN.BED_COST.currency]: n })) }
    };
    // Виды: каждый — своя одноступенчатая «лестница». Порядок в кошельке
    // игрока они делят с остальным, и жадная покупка возьмёт самый дешёвый.
    Object.keys(GARDEN.species).forEach(key => {
        const sp = GARDEN.species[key];
        if (sp.unlock) out['species_' + key] = { levels: [price(sp.unlock)] };
    });
    return out;
}

// Снаряжение гнева, разложенное по слотам, — те же лестницы: в слоте
// покупают по порядку, от дешёвого к дорогому.
function gearLadders() {
    const out = {};
    Object.keys(WRATH_GEAR.items).forEach(id => {
        const it = WRATH_GEAR.items[id];
        const key = 'gear_' + it.slot;
        (out[key] = out[key] || { name: it.slot, levels: [] }).levels.push(
            { price: it.price, bonus: it.tier || 0, tier: it.tier || 0 });
    });
    Object.keys(out).forEach(k =>
        out[k].levels.sort((a, b) => a.tier - b.tier));
    return out;
}

// Худший промежуток БЕЗ финишной прямой: последние 10% покупок отбрасываются.
const bulkWorst = (gaps) => {
    const keep = gaps.slice(0, Math.max(1, Math.ceil(gaps.length * 0.9)));
    return keep.length ? Math.max(...keep) : 0;
};

// ---------- ПРОГОН ОДНОГО ГРЕХА ----------
// Жадная покупка: каждый день копим доход, потом берём всё, на что хватает,
// начиная с самой дешёвой доступной ступени.
function run(sinKey) {
    // У лени лестницы лежат не в ECONOMY, а в GARDEN — рядом с тем, что они
    // меняют. Собираем их к общей форме (см. slothLadders).
    const base = (sinKey === 'sloth')
        ? Object.assign({ order: [] }, slothLadders(),
                        { order: Object.keys(slothLadders()) })
        : (ECONOMY.minigames[sinKey] && ECONOMY.minigames[sinKey].upgrades);
    if (!base || !INCOME[sinKey]) return null;

    // У гнева половина покупок — это НЕ прокачка, а снаряжение: оно
    // покупается из того же кошелька и в той же лавке. Считать лестницу
    // гнева без него значит считать половину его календаря.
    const extra = (sinKey === 'wrath') ? gearLadders() : {};
    const conf = Object.assign({}, base, extra);
    conf.order = (base.order || []).concat(Object.keys(extra));
    const branches = (conf.order || []).filter(k => conf[k] && conf[k].levels);
    const levels = {};
    branches.forEach(k => { levels[k] = 0; });
    const total = branches.reduce((s, k) => s + conf[k].levels.length, 0);

    let purse = 0, day = 0, done = 0;
    const buys = [];                 // дни покупок

    while (done < total && day < 3000) {
        day += 1;
        purse += INCOME[sinKey](levels, conf);
        // Внутри дня покупаем сколько влезет: игрок не станет ждать до завтра,
        // если денег хватило на две ступени сразу.
        for (;;) {
            let best = null;
            branches.forEach(k => {
                const next = conf[k].levels[levels[k]];
                if (!next) return;
                const price = Object.values(next.price)[0];
                if (best === null || price < best.price) best = { key: k, price };
            });
            if (!best || purse < best.price) break;
            purse -= best.price;
            levels[best.key] += 1;
            done += 1;
            buys.push(day);
        }
    }

    // Промежутки между покупками. Первый — от начала игры до первой покупки.
    const gaps = [];
    let prev = 0;
    buys.forEach(d => { gaps.push(d - prev); prev = d; });
    const bulk = bulkWorst(gaps);
    gaps.sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

    return {
        sin: sinKey, steps: total, days: buys.length === total ? day : Infinity,
        buys, gaps, median, bulk, max: gaps.length ? gaps[gaps.length - 1] : 0,
        firstBuy: buys[0] || Infinity,
        overWeek: gaps.filter(g => g > TARGET.gameGapDays).length,
        cost: branches.reduce((s, k) =>
            s + conf[k].levels.reduce((t, l) => t + Object.values(l.price)[0], 0), 0)
    };
}

// ---------- ПРОГОН ТРЁХ ПРОФИЛЕЙ ----------
// Печатаются все три, проверяется средний: вилка нужна, чтобы видеть, во
// сколько раз расходятся сроки, но целиться можно только в одну точку.
function report(name) {
    visits = PROFILES[name];
    const runs = Object.keys(ECONOMY.minigames).concat(['sloth']).map(run).filter(Boolean);

    const all = [].concat(...runs.map(r => r.buys)).sort((a, b) => a - b);
    const gaps = [];
    let prev = 0;
    all.forEach(d => { gaps.push(d - prev); prev = d; });
    const bulk = bulkWorst(gaps);
    const sorted = gaps.slice().sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const days = Math.max(...runs.map(r => r.days === Infinity ? 0 : r.days));

    say('');
    say(`======== игрок «${name}»: ${visits} захода в грех в сутки ========`);
    say('  грех        ступеней  всё за   первая  промежутки между покупками');
    say('                        (дней)   покупка  медиана  без финиша   худший');
    runs.forEach(r => {
        say(`  ${r.sin.padEnd(11)} ${String(r.steps).padStart(6)}   ` +
            `${String(r.days === Infinity ? '—' : r.days).padStart(6)}   ` +
            `${String(r.firstBuy === Infinity ? '—' : r.firstBuy).padStart(6)}   ` +
            `${String(r.median).padStart(7)}  ${String(r.bulk).padStart(10)}  ` +
            `${String(r.max).padStart(7)}`);
    });
    say(`  ПО ИГРЕ:    ${String(all.length).padStart(6)}   ${String(days).padStart(6)}   ` +
        `${String(all[0] || '—').padStart(6)}   ${String(median).padStart(7)}  ` +
        `${String(bulk).padStart(10)}  ${String(sorted[sorted.length - 1] || 0).padStart(7)}`);

    return { runs, days, median, bulk };
}

say('');
say('  «без финиша» — худший промежуток среди первых 90% покупок.');
say('  Последние ступени самые дорогие по построению, и мерить по ним нечего.');

let target = null;
Object.keys(PROFILES).forEach(name => {
    const r = report(name);
    if (name === CHECK_PROFILE) target = r;
});

say('');
say(`======== ПРОВЕРКИ (по игроку «${CHECK_PROFILE}») ========`);
check(target.days >= TARGET.fullDaysMin,
      `всё выкупается за ${target.days} дн. — не быстрее полугода (${TARGET.fullDaysMin})`);
check(target.days <= TARGET.fullDaysMax,
      `и не дольше года (${TARGET.fullDaysMax})`);
check(target.median <= TARGET.gameMedianDays,
      `типичный промежуток между покупками по игре — ${target.median} дн. ` +
      `(порог ${TARGET.gameMedianDays})`);
check(target.bulk <= TARGET.gameBulkGapDays,
      `худшая тишина до финишной прямой — ${target.bulk} дн. ` +
      `(порог ${TARGET.gameBulkGapDays})`);

say('');
target.runs.forEach(r => {
    check(r.firstBuy <= TARGET.firstBuyDays,
          `${r.sin}: первая покупка на ${r.firstBuy}-й день (порог ${TARGET.firstBuyDays})`);
    check(r.median <= TARGET.sinMedianDays,
          `${r.sin}: типичный промежуток ${r.median} дн. (порог ${TARGET.sinMedianDays})`);
});

say('');
say(bad ? `ПРОВАЛЕНО ПРОВЕРОК: ${bad}` : 'ВСЁ СОШЛОСЬ');
process.exit(bad ? 1 : 0);
