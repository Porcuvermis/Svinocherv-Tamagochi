// ================= СИМУЛЯЦИЯ ТЕМПА ГНЕВА =================
// Считает, КАК ЧАСТО игрок реально дерётся и что за это получает: гоняет
// зеркальный спарринг по настоящей формуле урона из конфига, а между боями
// отматывает время по настоящей скорости регенерации.
//
// Зачем машина, а не глаз. У гнева два числа спорят друг с другом: сколько
// здоровья съедает бой и как быстро оно возвращается. Ни то, ни другое не
// видно из кода — бой это угадайка один из трёх, и «примерно половина» там
// неверно (на самом деле около 85% полосы). Пока это не посчитали, темп
// гнева задавался наугад.
//
// Здесь же проверяется то, ради чего регенерация стало ДОЛЕЙ от максимума:
// цикл «бой — ожидание — бой» обязан быть одинаковым у голого червя и у
// полностью прокачанного. С плоскими хп в секунду он расходился вдвое, и
// ветка «+здоровье» превращалась в наказание.
//
// Запуск из корня:  node tools/sim-wrath-regen.js [прогонов]

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../src/config/wrath-gear.js', 'utf8') + '\n'
          + fs.readFileSync(__dirname + '/../src/config/economy.js', 'utf8') + '\n'
          + 'module.exports = { WRATH_GEAR, ECONOMY };';
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const { WRATH_GEAR, ECONOMY } = mod.exports;

const W = ECONOMY.minigames.wrath;
const ZONES = W.zones;
const FLOOR = W.minHitDamage || 0;
const N = Number(process.argv[2]) || 200000;

const pick = list => list[Math.floor(Math.random() * list.length)];
const roll = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// ---------- СБОРКА БОЙЦА ----------
// Ровно как WrathFighter.stats: база плюс прокачка плюс надетое.
function build(upgrades, equipment) {
    const out = {
        hp: W.baseHp, damage: 0,
        armor: { head: 0, body: 0, tail: 0 },
        dmgMin: W.damageMin, dmgMax: W.damageMax
    };
    Object.keys(upgrades || {}).forEach(key => {
        const branch = W.upgrades[key];
        const level = upgrades[key];
        if (!branch || !level) return;
        const step = branch.levels[Math.min(level, branch.levels.length) - 1];
        if (!step || step.bonus === undefined) return;
        if (key === 'hp') out.hp += step.bonus;
        if (key === 'damage') out.damage += step.bonus;
    });
    (equipment || []).forEach(id => {
        const item = WRATH_GEAR.items[id];
        if (!item) return;
        if (item.hp) out.hp += item.hp;
        if (item.damage) out.damage += item.damage;
        if (item.armor) ZONES.forEach(z => { if (item.armor[z]) out.armor[z] += item.armor[z]; });
    });
    out.dmgMin += out.damage;
    out.dmgMax += out.damage;
    return out;
}

// Хп в минуту: база плюс ступень ветки, как GameState.regenPerMinute.
function share(upgrades) {
    const branch = W.upgrades.regen;
    const level = (upgrades || {}).regen || 0;
    const step = level > 0 ? branch.levels[Math.min(level, branch.levels.length) - 1] : null;
    return W.regenPerMinute + (step ? step.bonus : 0);
}

// ---------- БОЙ ----------
// Спарринг зеркальный: противник — копия игрока (Backend.getOpponent), и
// прокачка в его числа входит тоже (WrathFighter.stats читает GameState).
// Поэтому у обеих сторон одни и те же характеристики.
function duel(f, startHp) {
    let p = startHp, e = f.hp, rounds = 0;
    while (p > 0 && e > 0 && rounds < 300) {
        rounds++;
        const pa = pick(ZONES), pd = pick(ZONES), ea = pick(ZONES), ed = pick(ZONES);
        if (pa !== ed) e -= Math.max(FLOOR, roll(f.dmgMin, f.dmgMax) - (f.armor[pa] || 0));
        if (ea !== pd) p -= Math.max(FLOOR, roll(f.dmgMin, f.dmgMax) - (f.armor[ea] || 0));
    }
    return { win: e <= 0 && p > 0, draw: e <= 0 && p <= 0, left: Math.max(0, p), rounds };
}

// ---------- ЦИКЛ ----------
// Игрок ждёт до полного и дерётся. Ждёт именно до полного не из вежливости:
// заход побитым — почти гарантированное поражение (см. таблицу входа ниже).
function cycle(f, perMin, runs) {
    let hp = f.hp, minutes = 0, waited = 0, wins = 0, draws = 0, rounds = 0;
    for (let i = 0; i < runs; i++) {
        if (hp < f.hp) {
            const wait = (f.hp - hp) / perMin;
            minutes += wait; waited += wait; hp = f.hp;
        }
        const d = duel(f, hp);
        if (d.win) wins++;
        if (d.draw) draws++;
        rounds += d.rounds;
        hp = d.left;
        minutes += 1;              // сам бой — примерно минута
    }
    return {
        perFight: minutes / runs, wait: waited / runs,
        winRate: wins / runs, drawRate: draws / runs, rounds: rounds / runs,
        hpPerMin: perMin
    };
}

const goldShare = n => {
    for (const t of ECONOMY.goldReturns.tiers) if (t.upTo === null || n <= t.upTo) return t.share;
    return 0;
};

// ---------- СБОРКИ ----------
const BUILDS = [
    ['голый',   {}, []],
    ['середина', { hp: 2, damage: 2 }, ['bucket-helm', 'beetle-shell', 'claw-gloves', 'rusty-saw', 'barn-door']],
    ['полный',   { hp: 3, damage: 3 }, ['hog-skull', 'chitin-plate', 'pincers', 'great-tusk', 'tombstone']]
];
const LEVELS = [0, 1, 2, 3];

console.log(`прогонов: ${N}`);
console.log(`база регенерации: ${W.regenPerMinute} хп в минуту `
          + `(полная полоса базового бойца за ${(W.baseHp / W.regenPerMinute).toFixed(0)} мин)`);
console.log(`порог голода у боя снят: ${ECONOMY.rewards.wrath.duel.win.alwaysPays ? 'да (alwaysPays)' : 'НЕТ'}`);

console.log('\n---------- ЦИКЛ «БОЙ → ОЖИДАНИЕ → БОЙ» ----------');
console.log('сборка      регенерация  хп   хп/мин  ожидание  цикл   побед  боёв/ч  побед/ч  жетонов/ч');
const cycles0 = {};
BUILDS.forEach(([name, upg, gear]) => {
    LEVELS.forEach(level => {
        const f = build(Object.assign({}, upg, { regen: level }), gear);
        const s = share({ regen: level });
        const c = cycle(f, s, Math.max(20000, Math.round(N / 4)));
        cycles0[name + '/' + level] = c;
        const perHour = 60 / c.perFight;
        const winsHour = perHour * c.winRate;
        console.log(
            `${name.padEnd(10)}  ${s.toFixed(1).padStart(4)} хп/мин  `
          + `${String(f.hp).padStart(2)}   ${c.hpPerMin.toFixed(1).padStart(5)}  `
          + `${c.wait.toFixed(1).padStart(6)} м  ${c.perFight.toFixed(1).padStart(4)} м  `
          + `${(c.winRate * 100).toFixed(0).padStart(4)}%  ${perHour.toFixed(1).padStart(5)}   `
          + `${winsHour.toFixed(1).padStart(5)}     ${(winsHour / 3).toFixed(2).padStart(5)}`);
    });
});

// ---------- ГЛАВНАЯ ТАБЛИЦА: ЦИКЛ ВДОЛЬ ПУТИ ПРОКАЧКИ ----------
// Таблица выше сравнивает сборки при ОДИНАКОВОЙ регенерации, и по ней легко
// сделать неверный вывод: «полный ждёт втрое дольше голого». Так и есть — но
// только если игрок скупил снаряжение и не тронул регенерацию, то есть выбрал
// худший из возможных путей.
//
// Настоящий вопрос другой: что происходит, если качаться РАЗУМНО — брать
// каждый раз самое дешёвое из доступного, отчего регенерация покупается
// вперемешку с остальным. Вот на него и отвечает эта таблица, и отвечает она
// «ничего страшного не происходит»: цикл держится около десяти минут от
// голого до полностью выкупленного.
//
// Пила в столбце дохода — это и есть замысел: покупка «+хп» цикл удлиняет,
// следующая ступень регенерации возвращает его обратно и немного сверх. Две
// ветки спорят друг с другом, как и задумано.
console.log('\n---------- ЦИКЛ ВДОЛЬ РАЗУМНОГО ПУТИ ПРОКАЧКИ ----------');
console.log('(каждый раз покупается самое дешёвое из доступного)\n');
console.log('покупка              цена всего   хп  реген  ожидание  цикл   боёв/ч  жетонов/ч');

const perShard = ECONOMY.exchange.wrath_shard.per;
const loseEveryN = ECONOMY.rewards.wrath.duel.lose.everyN;
const tiersOf = {};
WRATH_GEAR.slots.forEach(sl => {
    tiersOf[sl.key] = Object.keys(WRATH_GEAR.items)
        .filter(id => WRATH_GEAR.items[id].slot === sl.key)
        .sort((x, y) => WRATH_GEAR.items[x].tier - WRATH_GEAR.items[y].tier);
});

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

const path = [];
const eq = {}, up = { damage: 0, hp: 0, regen: 0 };
const record = (label, price, spent) => {
    const f = statsOf(eq, up), r = share(up);
    const c = cycle(f, r, Math.max(15000, Math.round(N / 6)));
    const perHour = 60 / c.perFight;
    const shards = perHour * (c.winRate + (1 - c.winRate - c.drawRate) / loseEveryN.n);
    path.push({ perFight: c.perFight, tokens: shards / perShard });
    console.log(label.padEnd(20) + String(price).padStart(4) + String(spent).padStart(6)
      + String(f.hp).padStart(5) + r.toFixed(1).padStart(7)
      + (c.wait.toFixed(1) + ' м').padStart(10) + (c.perFight.toFixed(1) + ' м').padStart(7)
      + perHour.toFixed(1).padStart(8) + (shards / perShard).toFixed(2).padStart(11));
};
record('голый', 0, 0);
let spent = 0;
for (;;) {
    let best = null;
    Object.keys(tiersOf).forEach(slot => {
        const owned = eq[slot] ? WRATH_GEAR.items[eq[slot]].tier : 0;
        if (owned >= tiersOf[slot].length) return;
        const id = tiersOf[slot][owned];
        const price = WRATH_GEAR.items[id].price.wrath_token;
        if (!best || price < best.price) best = { kind: 'gear', slot, id, price };
    });
    ['damage', 'hp', 'regen'].forEach(key => {
        const levels = W.upgrades[key].levels;
        if (up[key] >= levels.length) return;
        const price = levels[up[key]].price.wrath_token;
        if (!best || price < best.price) best = { kind: 'up', slot: key, price };
    });
    if (!best) break;
    if (best.kind === 'gear') eq[best.slot] = best.id; else up[best.slot]++;
    spent += best.price;
    record(best.kind === 'gear'
        ? `${WRATH_GEAR.items[best.id].emoji} ${best.slot} т${WRATH_GEAR.items[best.id].tier}`
        : `⬆ ${best.slot} ур.${up[best.slot]}`, best.price, spent);
}

const cycles = path.map(r => r.perFight);
const tokens = path.map(r => r.tokens);
const first = path[0], last = path[path.length - 1];
console.log(`\nцикл: голый ${first.perFight.toFixed(1)} м → всё куплено ${last.perFight.toFixed(1)} м `
  + `(по пути ${Math.min(...cycles).toFixed(1)}…${Math.max(...cycles).toFixed(1)} м, размах ×${(Math.max(...cycles) / Math.min(...cycles)).toFixed(2)})`);
console.log(`доход: ${first.tokens.toFixed(2)} → ${last.tokens.toFixed(2)} жетона/час `
  + `(по пути ${Math.min(...tokens).toFixed(2)}…${Math.max(...tokens).toFixed(2)})`);

// Поправка на незаконченность: у веток прокачки пока по три уровня — столько,
// чтобы механика была. Снаряжение уже растёт дальше, поэтому хвост пути идёт
// без противовеса. Строка печатается, чтобы читающий таблицу знал: это
// недописанная лестница, а не свойство баланса.
const top = W.upgrades.regen.levels[W.upgrades.regen.levels.length - 1];
console.log(`\nпотолок регенерации: ${W.upgrades.regen.levels.length} уровня, `
  + `верхняя скорость ${(W.regenPerMinute + top.bonus).toFixed(1)} хп/мин — это заглушка. `
  + `Снаряжение растёт дальше, поэтому хвост пути идёт без противовеса; `
  + `появятся следующие ступени — выправится сам.`);

// ---------- ЧТО СТОИТ ВЕТКА «+ЗДОРОВЬЕ» ПРИ ФИКСИРОВАННОЙ РЕГЕНЕРАЦИИ ----------
// Оставлено ради одного вывода: без регенерации большой запас действительно
// невыносим. Это НЕ «прогресс отрицательный» — это цена отказа качать вторую
// ветку, и сравнивать по этой таблице разные сборки нельзя.
console.log('\n---------- ЦЕНА ОТКАЗА КАЧАТЬ РЕГЕНЕРАЦИЮ ----------');
LEVELS.forEach(level => {
    const s = share({ regen: level });
    const line = BUILDS.map(([name]) => `${name} ${cycles0[name + '/' + level].perFight.toFixed(1)} м`).join(', ');
    console.log(`регенерация ${s.toFixed(1)} хп/мин: ${line}`);
});

// ---------- ЧЕМ ПЛАТИТ ЗАХОД ПОБИТЫМ ----------
console.log('\n---------- ВХОД НЕ НА ПОЛНОЙ ПОЛОСЕ ----------');
const bare = build({}, []);
[1, 0.8, 0.6, 0.4].forEach(part => {
    const start = Math.max(1, Math.round(bare.hp * part));
    let wins = 0;
    for (let i = 0; i < N; i++) if (duel(bare, start).win) wins++;
    console.log(`вход с ${String(start).padStart(2)}/${bare.hp}: побед ${(wins / N * 100).toFixed(1)}%`);
});

// ---------- ДОХОД ----------
// Порога голода у боя больше нет, поэтому доход режет только убывающая
// доходность золота (ECONOMY.goldReturns). Осколки не режутся ничем —
// тормозом работает время регенерации.
console.log('\n---------- ЗА ЧАС И ЗА СУТКИ НЕПРЕРЫВНОЙ ИГРЫ (голый, база) ----------');
const c0 = cycles0['голый/0'];
const winsHour = 60 / c0.perFight * c0.winRate;
const losesHour = 60 / c0.perFight * (1 - c0.winRate - c0.drawRate);
const everyN = ECONOMY.rewards.wrath.duel.lose.everyN;
const shardsHour = winsHour + losesHour / everyN.n;
console.log(`боёв/час ${(60 / c0.perFight).toFixed(1)}, побед ${winsHour.toFixed(1)}, поражений ${losesHour.toFixed(1)}`);
console.log(`осколков/час ${shardsHour.toFixed(1)} (победа 1 + каждое ${everyN.n}-е поражение) `
          + `→ жетонов/час ${(shardsHour / ECONOMY.exchange.wrath_shard.per).toFixed(2)}`);
let gold = 0;
const winsDay = Math.round(winsHour * 24);
for (let i = 1; i <= winsDay; i++) gold += Math.round(ECONOMY.rewards.wrath.duel.win.goldBase * goldShare(i));
console.log(`сутки без перерыва: ${winsDay} побед → золота ${gold} `
          + `(без убывающей доходности было бы ${winsDay * ECONOMY.rewards.wrath.duel.win.goldBase})`);

// ---------- СКОЛЬКО СТОИТ ВЫКАЧАТЬ ЗАРАСТАНИЕ ----------
const price = W.upgrades.regen.levels.reduce((sum, l) => sum + (l.price.wrath_token || 0), 0);
console.log(`\nвыкачать регенерацию целиком: ${price} жетона = `
          + `${price * ECONOMY.exchange.wrath_shard.per} осколков ≈ `
          + `${Math.round(price * ECONOMY.exchange.wrath_shard.per / shardsHour)} ч боёв на базовой скорости`);
