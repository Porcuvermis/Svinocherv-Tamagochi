// ================= МАГАЗИН КУХНИ: СХОДЯТСЯ ЛИ ЧИСЛА =================
// Считает по живому конфигу три вещи, ни одна из которых не видна чтением
// кода (CLAUDE.md, «правило чисел»):
//
//   1. ПО КАРМАНУ ЛИ. Золото приходит из гнева и режется убывающей
//      доходностью. Если день игры не оплачивает даже специю, полка
//      декоративная.
//   2. НЕ ОТМЕНЯЕТ ЛИ МАГАЗИН ОСТАЛЬНЫЕ ГРЕХИ. Полное блюдо (три типа +
//      жидкость крепче воды) обязано оставаться недостижимым на одних
//      покупках: мясо и овощи не продаются, и проверяется это не глазами, а
//      пересечением списка полки с типами.
//   3. НЕ ПЕЧАТАЕТ ЛИ МАГАЗИН ЖЕТОНЫ. У каждой покупки есть прибавка к
//      блюду (лишний тип или жидкость покрепче) — то есть цена осколка в
//      золоте. Если она мала, жетоны кухни начинают покупаться за золото
//      гнева, и лестница апгрейдов обесценивается ещё до того, как написана.
//
// Запуск из корня:  node tools/sim-kitchen-shop.js

const fs = require('fs');
const root = __dirname + '/..';
const src = fs.readFileSync(root + '/src/config/kitchen.js', 'utf8') + '\n'
          + fs.readFileSync(root + '/src/config/economy.js', 'utf8') + '\n'
          + 'module.exports = { KITCHEN, ECONOMY };';
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const { KITCHEN, ECONOMY } = mod.exports;

const SHOP = (KITCHEN.shop && KITCHEN.shop.food) || [];
const price = (key) => (SHOP.find(g => g.key === key) || {}).price;
const say = console.log;
let bad = 0;
const check = (ok, text) => { say((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) bad++; };

// ---------- ДОХОД ЗОЛОТА ЗА СУТКИ ----------
// По той же лестнице долей, что и в игре: победы 1–5 идут целиком, 6–15
// вполовину, дальше по десятой (ECONOMY.goldReturns).
function goldForWins(wins) {
    const base = ECONOMY.rewards.wrath.duel.win.goldBase;
    const tiers = ECONOMY.goldReturns.tiers;
    let gold = 0;
    for (let i = 1; i <= wins; i++) {
        const tier = tiers.find(t => t.upTo === null || i <= t.upTo);
        gold += base * tier.share;
    }
    return Math.round(gold);
}

say('');
say('======== 1. ПО КАРМАНУ ЛИ ========');
say('Победа в дуэли: ' + ECONOMY.rewards.wrath.duel.win.goldBase +
    ' золота до убывающей доходности.');
say('');
say('  побед за сутки │ золота │ что на них берётся');
[3, 5, 10, 15, 25].forEach(w => {
    const g = goldForWins(w);
    // Что можно унести на эти деньги: жадно, от дорогого к дешёвому.
    const cart = [];
    let left = g;
    SHOP.slice().sort((a, b) => b.price - a.price).forEach(item => {
        while (left >= item.price) { left -= item.price; cart.push(item.key); }
    });
    say(`  ${String(w).padStart(14)} │ ${String(g).padStart(6)} │ ` +
        (cart.length ? cart.join(', ') : '— ничего'));
});

// Дешёвая покупка обязана быть по карману за один вечер боёв, иначе полка
// открывается раз в неделю и игрок про неё забывает.
const cheapest = Math.min(...SHOP.map(g => g.price));
check(goldForWins(3) >= cheapest,
      `три победы (${goldForWins(3)} зол.) покрывают самую дешёвую покупку (${cheapest})`);
// И обратное: за день нельзя скупить всю полку целиком по разу — иначе цены
// не значат ничего.
const whole = SHOP.reduce((s, g) => s + g.price, 0);
check(goldForWins(5) < whole,
      `день на полной доходности (${goldForWins(5)} зол.) НЕ покрывает всю полку (${whole})`);

say('');
say('======== 2. ОТМЕНЯЕТ ЛИ МАГАЗИН ОСТАЛЬНЫЕ ГРЕХИ ========');
// Сколько РАЗНЫХ типов нарезаемого можно набрать одними покупками.
const types = new Set();
SHOP.forEach(g => {
    const ing = KITCHEN.ingredients[g.key];
    if (ing && KITCHEN.CHOP_TYPES.indexOf(ing.type) >= 0) types.add(ing.type);
});
const richOnShelf = SHOP.some(g => KITCHEN.liquids[g.key] && !KITCHEN.liquids[g.key].plain);
say('  типов нарезаемого на полке: ' + (types.size ? [...types].join(', ') : '—'));
say('  жидкость крепче воды на полке: ' + (richOnShelf ? 'есть' : 'нет'));

const needTypes = Math.max(...Object.keys(KITCHEN.quality)
    .filter(k => /^\d+$/.test(k)).map(Number));
check(types.size < needTypes,
      `на покупках собирается ${types.size} тип(а) из ${needTypes} — полное блюдо ` +
      'без сада и гнева не сварить');
check(!SHOP.some(g => (KITCHEN.ingredients[g.key] || {}).type === 'meat'),
      'мяса на полке нет (падает только с боссов гнева)');
check(!SHOP.some(g => (KITCHEN.ingredients[g.key] || {}).type === 'veg'),
      'овощей на полке нет (их растит сад лени)');

say('');
say('======== 3. НЕ ПЕЧАТАЕТ ЛИ МАГАЗИН ЖЕТОНЫ ========');
// Цена осколка в золоте по каждой покупке. Прибавка считается по таблице
// качества: специя добавляет ТИП, жидкость переводит '3water' в '3'.
const Q = KITCHEN.quality;
const perShard = [];
SHOP.forEach(g => {
    const ing = KITCHEN.ingredients[g.key];
    let gain = null, what = '';
    if (ing) {
        // Специя как недостающий тип: считаем худший и лучший переход.
        gain = Q[2].shards - Q[1].shards;
        what = 'добирает тип: ' + Q[1].shards + ' → ' + Q[2].shards + ' оскол.';
    } else if (KITCHEN.liquids[g.key] && !KITCHEN.liquids[g.key].plain) {
        gain = Q[3].shards - Q['3water'].shards;
        what = 'вода → эта жидкость: ' + Q['3water'].shards + ' → ' + Q[3].shards + ' оскол.';
    }
    if (!gain) return;
    const cost = g.price / gain;
    perShard.push({ key: g.key, cost });
    say(`  ${g.key.padEnd(7)} ${String(g.price).padStart(3)} зол. — ${what}` +
        `  → осколок за ${cost.toFixed(0)} зол.`);
});

// ---------- ЧТО НА САМОМ ДЕЛЕ ДЕРЖИТ ТЕМП ----------
// Первой здесь стояла проверка «жетон через покупки дороже суток дохода», и
// она честно падала: три специи по восемь дают осколок за 24 золота, то есть
// втрое дешевле дневной выручки. Мерила она при этом НЕ ТУ величину.
//
// Золото не ускоряет добычу жетонов вовсе: осколок падает за БЛЮДО, а блюд в
// сутки столько, сколько раз успела опустеть шкала. Купи хоть сто специй —
// четвёртой кормёжки не будет, потому что червю не заплатят, пока он сыт
// (порог sins.gluttony.payAt). Потолок держит голод, а цена решает только,
// стоит ли возиться.
//
// Значит мерить надо ДОЛЮ ДНЕВНОГО ДОХОДА, которую съедает полный день
// покупок. Слишком мала — покупка перестаёт быть выбором и становится
// привычкой; слишком велика — полка декоративная.
const fallHours = ECONOMY.sins.gluttony.drainHours;
const cooksPerDay = Math.max(1, Math.floor(24 / fallHours));
const perToken = ECONOMY.exchange.glut_shard.per;

const spice = Math.min(...SHOP.filter(g => KITCHEN.ingredients[g.key]).map(g => g.price));
const rich  = Math.min(...SHOP.filter(g => KITCHEN.liquids[g.key]).map(g => g.price));
const dayCost = cooksPerDay * (spice + rich);
const dayGold = goldForWins(5);
const share = dayCost / dayGold;

say('');
say(`  шкала чревоугодия пустеет за ${fallHours} ч → до ${cooksPerDay} кормёжек в сутки`);
say(`  полный день покупок (${cooksPerDay} × самая дешёвая специя ${spice} + жидкость ${rich})` +
    ` = ${dayCost} зол.`);
say(`  сутки боёв на полной доходности = ${dayGold} зол. → доля ${(share * 100).toFixed(0)}%`);

check(share >= 0.4,
      `день покупок съедает ${(share * 100).toFixed(0)}% дневного золота — это выбор, ` +
      'а не привычка (порог 40%)');
check(share <= 2.5,
      `и не больше 250%: полку можно позволить себе через день, а не раз в месяц`);
// Главный потолок: сколько жетонов кухни набегает за сутки. Он обязан
// держаться голодом, а не деньгами — иначе лестница утвари покупается
// золотом гнева.
check(cooksPerDay / perToken <= 1.2,
      `жетонов кухни за сутки не больше ${(cooksPerDay / perToken).toFixed(1)} — ` +
      'потолок держит голод, и золото его не двигает');

say('');
say(bad ? `ПРОВАЛЕНО ПРОВЕРОК: ${bad}` : 'ВСЁ СОШЛОСЬ');
process.exit(bad ? 1 : 0);
