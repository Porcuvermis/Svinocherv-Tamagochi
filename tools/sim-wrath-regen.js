// ================= СИМУЛЯЦИЯ ТЕМПА ГНЕВА =================
// Считает, КАК ЧАСТО игрок реально дерётся и что за это получает: гоняет
// зеркальный спарринг по настоящей формуле урона из конфига, а между боями
// отматывает время по настоящей скорости зарастания.
//
// Зачем машина, а не глаз. У гнева два числа спорят друг с другом: сколько
// здоровья съедает бой и как быстро оно возвращается. Ни то, ни другое не
// видно из кода — бой это угадайка один из трёх, и «примерно половина» там
// неверно (на самом деле около 85% полосы). Пока это не посчитали, темп
// гнева задавался наугад.
//
// Здесь же проверяется то, ради чего зарастание стало ДОЛЕЙ от максимума:
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

// Доля максимума в минуту: база плюс ступень ветки, как GameState.regenShare.
function share(upgrades) {
    const branch = W.upgrades.regen;
    const level = (upgrades || {}).regen || 0;
    const step = level > 0 ? branch.levels[Math.min(level, branch.levels.length) - 1] : null;
    return W.regenSharePerMinute + (step ? step.bonus : 0);
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
function cycle(f, sharePerMin, runs) {
    const perMin = sharePerMin * f.hp;
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
    ['середина', { hp: 2, damage: 2 }, ['pot-helmet', 'hide-armor']],
    ['полный',   { hp: 3, damage: 3 }, ['tusk-saber', 'skull-cap', 'bone-plate', 'spiked-gloves', 'tower-shield']]
];
const LEVELS = [0, 1, 2, 3];

console.log(`прогонов: ${N}`);
console.log(`база зарастания: ${(W.regenSharePerMinute * 100).toFixed(0)}% полосы в минуту `
          + `(полная полоса за ${(1 / W.regenSharePerMinute).toFixed(0)} мин)`);
console.log(`порог голода у боя снят: ${ECONOMY.rewards.wrath.duel.win.alwaysPays ? 'да (alwaysPays)' : 'НЕТ'}`);

console.log('\n---------- ЦИКЛ «БОЙ → ОЖИДАНИЕ → БОЙ» ----------');
console.log('сборка      зарастание   хп   хп/мин  ожидание  цикл   побед  боёв/ч  побед/ч  жетонов/ч');
const cycles = {};
BUILDS.forEach(([name, upg, gear]) => {
    LEVELS.forEach(level => {
        const f = build(Object.assign({}, upg, { regen: level }), gear);
        const s = share({ regen: level });
        const c = cycle(f, s, Math.max(20000, Math.round(N / 4)));
        cycles[name + '/' + level] = c;
        const perHour = 60 / c.perFight;
        const winsHour = perHour * c.winRate;
        console.log(
            `${name.padEnd(10)}  ${(s * 100).toFixed(0).padStart(3)}%/мин   `
          + `${String(f.hp).padStart(2)}   ${c.hpPerMin.toFixed(1).padStart(5)}  `
          + `${c.wait.toFixed(1).padStart(6)} м  ${c.perFight.toFixed(1).padStart(4)} м  `
          + `${(c.winRate * 100).toFixed(0).padStart(4)}%  ${perHour.toFixed(1).padStart(5)}   `
          + `${winsHour.toFixed(1).padStart(5)}     ${(winsHour / 3).toFixed(2).padStart(5)}`);
    });
});

// ---------- ПРОВЕРКА, РАДИ КОТОРОЙ ВСЁ ЗАТЕВАЛОСЬ ----------
// Доля от максимума обязана держать цикл ОДИНАКОВЫМ при любой сборке.
console.log('\n---------- РОВНЫЙ ЛИ ЦИКЛ ПРИ РАЗНЫХ СБОРКАХ ----------');
LEVELS.forEach(level => {
    const values = BUILDS.map(([name]) => cycles[name + '/' + level].perFight);
    const spread = Math.max(...values) / Math.min(...values);
    const verdict = spread <= 1.1 ? 'ровно' : 'РАСХОДИТСЯ';
    console.log(`зарастание ${(share({ regen: level }) * 100).toFixed(0)}%/мин: `
      + values.map((v, i) => `${BUILDS[i][0]} ${v.toFixed(1)} м`).join(', ')
      + `  → разброс ×${spread.toFixed(2)} — ${verdict}`);
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
// тормозом работает время зарастания.
console.log('\n---------- ЗА ЧАС И ЗА СУТКИ НЕПРЕРЫВНОЙ ИГРЫ (голый, база) ----------');
const c0 = cycles['голый/0'];
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
console.log(`\nвыкачать зарастание целиком: ${price} жетона = `
          + `${price * ECONOMY.exchange.wrath_shard.per} осколков ≈ `
          + `${Math.round(price * ECONOMY.exchange.wrath_shard.per / shardsHour)} ч боёв на базовой скорости`);
