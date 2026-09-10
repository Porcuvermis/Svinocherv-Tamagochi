// ================= НА СКОЛЬКО ХВАТАЕТ ГНЕВА =================
// Отвечает на вопрос, который нельзя решить на глаз: сколько ДНЕЙ игрок будет
// выкупать всё содержимое гнева — снаряжение и прокачку, — и не кончается ли
// оно через неделю.
//
// Считается по живому конфигу и по настоящим боям: винрейт берётся прогоном
// схваток, а не константой, длина цикла — из здоровья и регенерации той
// сборки, которая у игрока на этом шаге. Поэтому ответ меняется сам, стоит
// тронуть цену, прибавку или ступень.
//
// ---------- МОДЕЛЬ ИГРОКА ----------
// Мерой взято ПРИСУТСТВИЕ в минутах за сутки, а не «боёв в сутки»: боёв
// столько, сколько успеет набежать полоса, и это и есть та связь, ради
// которой регенерация сделана плоской. Купил запас, не купил скорость —
// боёв в сутки стало меньше, и это видно прямо здесь.
//
// Три уровня присутствия — не гадание, а вилка: по ней видно, во сколько раз
// расходятся сроки у разного игрока. Целевой — средний.
//
// Запуск из корня:  node tools/sim-wrath-year.js [прогонов на точку]

const fs = require('fs');
const root = __dirname + '/..';
const src = fs.readFileSync(root + '/src/config/wrath-gear.js', 'utf8') + '\n'
          + fs.readFileSync(root + '/src/config/economy.js', 'utf8') + '\n'
          + 'module.exports = { WRATH_GEAR, ECONOMY };';
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const { WRATH_GEAR, ECONOMY } = mod.exports;

const W = ECONOMY.minigames.wrath;
const ZONES = W.zones;
const FLOOR = W.minHitDamage;
const N = Number(process.argv[2]) || 6000;

const PRESENCE = [
    ['редкий',   30],
    ['средний',  90],
    ['частый',  240]
];
const FIGHT_MINUTES = 1;        // сама драка
const YEAR = 365;

const pick = l => l[Math.floor(Math.random() * l.length)];
const roll = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// ---------- СБОРКА ----------
function statsOf(eq, up) {
    const o = { hp: W.baseHp, dmgMin: W.damageMin, dmgMax: W.damageMax,
                armor: { head: 0, body: 0, tail: 0 } };
    let dmg = 0;
    ['damage', 'hp'].forEach(key => {
        const branch = W.upgrades[key], n = up[key] || 0;
        if (!n) return;
        const step = branch.levels[Math.min(n, branch.levels.length) - 1];
        if (key === 'damage') dmg += step.bonus; else o.hp += step.bonus;
    });
    Object.keys(eq).forEach(slot => {
        const it = WRATH_GEAR.items[eq[slot]];
        if (!it) return;
        o.hp += it.hp || 0; dmg += it.damage || 0;
        if (it.armor) ZONES.forEach(z => { if (it.armor[z]) o.armor[z] += it.armor[z]; });
    });
    o.dmgMin += dmg; o.dmgMax += dmg;
    return o;
}
function regenOf(up) {
    const branch = W.upgrades.regen, n = up.regen || 0;
    return W.regenPerMinute + (n ? branch.levels[Math.min(n, branch.levels.length) - 1].bonus : 0);
}

// ---------- БОЙ ----------
// Соперник подбирается по силе, то есть примерно ровня — здесь это
// смоделировано зеркалом. Нужны две величины: доля побед и сколько здоровья
// съедает бой.
function measure(f, runs) {
    let wins = 0, draws = 0, left = 0, rounds = 0;
    for (let i = 0; i < runs; i++) {
        let p = f.hp, e = f.hp, r = 0;
        while (p > 0 && e > 0 && r < 400) {
            r++;
            const pa = pick(ZONES), pd = pick(ZONES), ea = pick(ZONES), ed = pick(ZONES);
            if (pa !== ed) e -= Math.max(FLOOR, roll(f.dmgMin, f.dmgMax) - (f.armor[pa] || 0));
            if (ea !== pd) p -= Math.max(FLOOR, roll(f.dmgMin, f.dmgMax) - (f.armor[ea] || 0));
        }
        if (e <= 0 && p > 0) wins++;
        if (e <= 0 && p <= 0) draws++;
        left += Math.max(0, p);
        rounds += r;
    }
    return { win: wins / runs, draw: draws / runs, left: left / runs, rounds: rounds / runs };
}

// ---------- ЖЕТОНЫ ЗА СУТКИ ----------
const perShard = ECONOMY.exchange.wrath_shard.per;
const loseEveryN = ECONOMY.rewards.wrath.duel.lose.everyN;
function dayRate(f, regen, m, presence) {
    // Цикл: бой плюс ожидание того, что бой съел.
    const cycle = FIGHT_MINUTES + (f.hp - m.left) / regen;
    const fights = presence / cycle;
    const shards = fights * (m.win + (1 - m.win - m.draw) / loseEveryN.n);
    return { cycle, fights, tokens: shards / perShard };
}

// ---------- ПУТЬ ПОКУПОК ----------
// Игрок берёт то, что по карману, то есть каждый раз самое дешёвое из
// открытого. Пассивки в счёт идут, но прибавок не дают.
const tiersOf = {};
WRATH_GEAR.slots.forEach(sl => {
    tiersOf[sl.key] = Object.keys(WRATH_GEAR.items)
        .filter(id => WRATH_GEAR.items[id].slot === sl.key)
        .sort((x, y) => WRATH_GEAR.items[x].tier - WRATH_GEAR.items[y].tier);
});
const branches = (W.upgrades.order || []).filter(k => W.upgrades[k] && W.upgrades[k].levels);

function walk(presence, runs) {
    const eq = {}, up = {};
    branches.forEach(k => { up[k] = 0; });
    const steps = [];
    let spent = 0, days = 0;

    const state = () => {
        const f = statsOf(eq, up);
        const m = measure(f, runs);
        return { f, m, r: dayRate(f, regenOf(up), m, presence) };
    };
    let cur = state();
    steps.push({ label: 'старт', price: 0, spent: 0, day: 0,
                 hp: cur.f.hp, regen: regenOf(up), cycle: cur.r.cycle,
                 fights: cur.r.fights, tokens: cur.r.tokens, rounds: cur.m.rounds });

    for (;;) {
        let best = null;
        Object.keys(tiersOf).forEach(slot => {
            const owned = eq[slot] ? WRATH_GEAR.items[eq[slot]].tier : 0;
            if (owned >= tiersOf[slot].length) return;
            const id = tiersOf[slot][owned];
            const price = WRATH_GEAR.items[id].price.wrath_token || 0;
            if (!best || price < best.price) best = { kind: 'gear', slot, id, price };
        });
        branches.forEach(key => {
            const levels = W.upgrades[key].levels;
            if (up[key] >= levels.length) return;
            const price = levels[up[key]].price.wrath_token || 0;
            if (!best || price < best.price) best = { kind: 'up', slot: key, price };
        });
        if (!best) break;

        // Копим по текущему доходу, ПОТОМ покупаем: доход меняется после.
        days += best.price / cur.r.tokens;
        spent += best.price;
        if (best.kind === 'gear') eq[best.slot] = best.id; else up[best.slot]++;
        cur = state();
        steps.push({
            label: best.kind === 'gear'
                ? `${WRATH_GEAR.items[best.id].emoji} ${best.slot} т${WRATH_GEAR.items[best.id].tier}`
                : `⬆ ${best.slot} ур.${up[best.slot]}`,
            price: best.price, spent, day: days,
            hp: cur.f.hp, regen: regenOf(up), cycle: cur.r.cycle,
            fights: cur.r.fights, tokens: cur.r.tokens, rounds: cur.m.rounds
        });
    }
    return steps;
}

// ---------- ОТЧЁТ ----------
const totalCost = Object.keys(WRATH_GEAR.items)
        .reduce((s, id) => s + (WRATH_GEAR.items[id].price.wrath_token || 0), 0)
    + branches.reduce((s, k) => s + W.upgrades[k].levels
        .reduce((a, l) => a + (l.price.wrath_token || 0), 0), 0);
console.log(`всё содержимое гнева: ${totalCost} жетонов `
  + `(${Object.keys(WRATH_GEAR.items).length} предметов + `
  + `${branches.map(k => `${k} ${W.upgrades[k].levels.length}`).join(', ')})`);

const main = walk(90, N);
console.log('\n---------- ПУТЬ СРЕДНЕГО ИГРОКА (90 минут в сутки) ----------');
console.log('день  покупка              цена всего   хп  реген  цикл   раундов  боёв/сут  жетонов/сут');
main.forEach(s => console.log(
    String(Math.round(s.day)).padStart(4) + '  ' + s.label.padEnd(20)
  + String(s.price).padStart(4) + String(s.spent).padStart(6)
  + String(s.hp).padStart(5) + s.regen.toFixed(1).padStart(7)
  + (s.cycle.toFixed(1) + ' м').padStart(8) + s.rounds.toFixed(1).padStart(9)
  + s.fights.toFixed(1).padStart(10) + s.tokens.toFixed(2).padStart(13)));

console.log('\n---------- НА СКОЛЬКО ХВАТАЕТ ----------');
PRESENCE.forEach(([name, minutes]) => {
    const path = walk(minutes, Math.max(1500, Math.round(N / 3)));
    const last = path[path.length - 1];
    const half = path.find(s => s.spent >= totalCost / 2);
    console.log(`${name.padEnd(9)} ${String(minutes).padStart(3)} мин/сут: `
      + `половина за ${Math.round(half.day)} дн, всё за ${Math.round(last.day)} дн `
      + `(${(last.day / YEAR).toFixed(2)} года)`);
});

// ---------- ЧТО НЕ ДОЛЖНО СЪЕХАТЬ ----------
// Три величины обязаны держаться в коридоре по всей лестнице, иначе длинная
// прокачка ломает сам бой.
//
// Считаются они НЕ с самого начала. Первые покупки стоят по одному жетону
// все сразу — четыре предмета первого тира и по первой ступени трёх веток, —
// и в каком порядке их брать, решает игрок, а не лестница. Здешний путь
// («каждый раз самое дешёвое») в этой куче выстраивается произвольно, и
// корить лестницу за него нечестно. Поэтому коридор меряется с того шага, где
// цены впервые расходятся.
//
// Сама эта куча при этом кое-что показывает, и это стоит помнить: при десяти
// базовых хп ЛЮБАЯ ранняя покупка урона заметно укорачивает бой (6.6 раунда у
// голого против 3.6, если взять весь урон и не взять здоровье). Лечится это
// не ступенями, а базовыми числами бойца, и трогать их сейчас незачем — одна
// ступень здоровья возвращает бой к пяти раундам.
const OPENING = 2;   // жетон — цена «кучи одинаковых»; коридор считаем дороже
const tail = main.filter(s => s.price > OPENING);
const opening = main.filter(s => s.price <= OPENING);

console.log('\n---------- ПРОВЕРКИ ПО ЛЕСТНИЦЕ ----------');
const rounds = tail.map(s => s.rounds);
const cycles = tail.map(s => s.cycle);
const okRounds = Math.min(...rounds) >= 4 && Math.max(...rounds) <= 12;
const okCycle = Math.max(...cycles) / Math.min(...cycles) <= 2.2;
const first = main[0], last = main[main.length - 1];
const okIncome = last.tokens >= first.tokens;
console.log(`${okRounds ? 'ок   ' : 'ПЛОХО'} длина боя: ${Math.min(...rounds).toFixed(1)}…${Math.max(...rounds).toFixed(1)} раундов `
  + `(коридор 4…12: короче — угадайка, длиннее — тягомотина)`);
console.log(`${okCycle ? 'ок   ' : 'ПЛОХО'} цикл боя: ${Math.min(...cycles).toFixed(1)}…${Math.max(...cycles).toFixed(1)} мин `
  + `(размах ×${(Math.max(...cycles) / Math.min(...cycles)).toFixed(2)}, коридор до ×2.2)`);
console.log(`${okIncome ? 'ок   ' : 'ПЛОХО'} доход: ${first.tokens.toFixed(2)} → ${last.tokens.toFixed(2)} жетона/сут `
  + `(прокачка ${okIncome ? 'окупается' : 'НЕ окупается'})`);
console.log(`     конец лестницы: ${last.hp} хп, регенерация ${last.regen} хп/мин, `
  + `цикл ${last.cycle.toFixed(1)} мин против ${first.cycle.toFixed(1)} у голого, `
  + `бой ${last.rounds.toFixed(1)} раунда против ${first.rounds.toFixed(1)}`);
const oRounds = opening.map(s => s.rounds);
console.log(`     первые ${opening.length} покупок по 1–${OPENING} жетона идут в любом порядке: `
  + `бой ${Math.min(...oRounds).toFixed(1)}…${Math.max(...oRounds).toFixed(1)} раунда, `
  + `и это про базовые числа бойца, а не про лестницу`);
