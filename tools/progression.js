// ================= КАЛЬКУЛЯТОР ПРОГРЕССИИ =================
// Считает по НАСТОЯЩЕМУ конфигу три кривые и сводит их вместе:
//
//   сила бойца  →  цена следующей ступени  →  время на её накопление
//
// Зачем это тулза, а не таблица в документе: числа в конфиге меняются каждую
// неделю, а таблица в документе устаревает в тот же день. Здесь считается по
// живому конфигу, поэтому ответ всегда про текущую игру.
//
// Модель и целевые числа — docs/plan/15-progression.md.
//
// Запуск из корня:  node tools/progression.js

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../src/config/wrath-gear.js', 'utf8') + '\n'
          + fs.readFileSync(__dirname + '/../src/config/economy.js', 'utf8') + '\n'
          + 'module.exports = { WRATH_GEAR, ECONOMY };';
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const { WRATH_GEAR, ECONOMY } = mod.exports;

const W = ECONOMY.minigames.wrath;
const ZONES = W.zones;
const FLOOR = W.minHitDamage || 1;
const HIT = (ZONES.length - 1) / ZONES.length;   // доля ударов, прошедших мимо блока

// ---------- ЦЕЛЕВЫЕ ЧИСЛА МОДЕЛИ ----------
// Откуда взялись — docs/plan/15-progression.md, раздел 3.
const TARGET = {
    levelStep: 1.60,      // во сколько раз сильнее СЛЕДУЮЩИЙ УРОВЕНЬ силы
    powerStep: 1.30,      // во сколько раз ступень снаряжения сильнее предыдущей
    costStep: 1.90,       // во сколько раз ступень дороже предыдущей
    timeStep: [1.2, 1.7], // во сколько раз дольше копится (допустимый коридор)
    firstTierMinutes: 12  // первая ступень должна быть по силам за один заход
};

// Уровень силы — читаемое целое поверх сырой силы. Сила умножается, уровень
// прибавляется: каждый уровень это ×1.6, то есть решающая разница (при равных
// уровнях бой 50/50, на уровень ниже — 13% побед, на уровень выше — 87%).
// Разбор — docs/plan/15-progression.md, раздел 9.
function level(value, base) {
    return Math.log(value / base) / Math.log(TARGET.levelStep);
}

// ---------- ДОПУЩЕНИЯ ПРО ИГРУ ----------
// Меняются здесь; всё, что ниже, пересчитается само.
const PLAY = {
    duelSeconds: 60,      // бой плюс ожидание зарастания
    winRate: 0.5,         // против зеркала это ровно половина
    sessionMinutes: 10
};

// ---------- СИЛА ----------
// Сколько урона боец успевает нанести, прежде чем умрёт:
//   ДПС = средний удар × доля прошедших мимо блока
//   ЭХП = здоровье, растянутое бронёй
// Броня меряется против КОНКРЕТНОГО противника: против слабых ударов она
// стоит дороже, чем против сильных, и честно это учесть можно только так.
function power(f, vsAvgDamage) {
    const avg = (f.damageMin + f.damageMax) / 2;
    const dps = avg * HIT;
    const armor = ZONES.reduce((s, z) => s + (f.armor[z] || 0), 0) / ZONES.length;
    const perHit = Math.max(FLOOR, vsAvgDamage - armor);
    const ehp = f.hp * (vsAvgDamage / perHit);
    return { dps, ehp, value: ehp * dps };
}

// ---------- СТУПЕНИ СНАРЯЖЕНИЯ ----------
// Ступень n — это боец, у которого в каждом слоте стоит ЛУЧШЕЕ из доступного
// до тира n включительно. Именно так игрок и выглядит: покупка оружия тира 3
// не снимает с него броню тира 2, а слотов с тремя тирами всего один.
//
// Цена ступени — то, что докупается ПРИ ПЕРЕХОДЕ на неё: предметы ровно тира
// n и уровень n у веток прокачки. Пропустить тир и копить сразу на следующий
// игрок может, и модель считает именно такой, разумный путь.
function stage(n) {
    const stats = {
        hp: W.baseHp, damageMin: W.damageMin, damageMax: W.damageMax,
        armor: { head: 0, body: 0, tail: 0 }
    };
    let cost = 0;
    if (n === 0) return { stats, cost };

    WRATH_GEAR.slots.forEach(slot => {
        const owned = Object.keys(WRATH_GEAR.items)
            .map(k => WRATH_GEAR.items[k])
            .filter(it => it.slot === slot.key && (it.tier || 1) <= n)
            .sort((a, b) => (a.tier || 1) - (b.tier || 1))
            .pop();
        if (!owned) return;
        stats.hp += owned.hp || 0;
        stats.damageMin += owned.damage || 0;
        stats.damageMax += owned.damage || 0;
        ZONES.forEach(z => { if (owned.armor && owned.armor[z]) stats.armor[z] += owned.armor[z]; });
        if ((owned.tier || 1) === n) cost += (owned.price && owned.price.wrath_token) || 0;
    });

    const up = W.upgrades;
    (up.order || []).forEach(key => {
        const branch = up[key];
        if (!branch || !branch.levels || branch.tab === 'passive') return;
        const lvl = branch.levels[Math.min(n, branch.levels.length) - 1];
        if (!lvl) return;
        if (branch.levels[n - 1]) cost += (branch.levels[n - 1].price.wrath_token) || 0;
        if (key === 'damage') { stats.damageMin += lvl.bonus; stats.damageMax += lvl.bonus; }
        if (key === 'hp') stats.hp += lvl.bonus;
    });
    return { stats, cost };
}

// ---------- ДОХОД ----------
// Сколько жетонов приносит час игры. Осколок — треть жетона; сколько их
// падает, решает конфиг наград, а не это место.
function income() {
    const per = ECONOMY.exchange.wrath_shard.per;
    const win = ECONOMY.rewards.wrath.duel.win.currencies || {};
    const lose = ECONOMY.rewards.wrath.duel.lose || {};
    const shardsPerWin = win.wrath_shard || 0;
    const everyN = lose.everyN ? (lose.everyN.currencies.wrath_shard || 0) / lose.everyN.n : 0;

    const duelsPerHour = 3600 / PLAY.duelSeconds;
    const shards = duelsPerHour * (PLAY.winRate * shardsPerWin + (1 - PLAY.winRate) * everyN);
    return { tokensPerHour: shards / per, duelsPerHour };
}

// ---------- ОТЧЁТ ----------
const inc = income();
const tiers = [1, 2, 3].map(stage).filter(s => s.cost > 0);
const zero = stage(0);

// Сила меряется против «ровни» — противника такой же ступени: в бою с ботом
// это буквально копия игрока.
const rows = [zero, ...tiers].map((s, i) => {
    const avg = (s.stats.damageMin + s.stats.damageMax) / 2;
    return { n: i, stats: s.stats, cost: s.cost, power: power(s.stats, avg).value };
});

console.log('доход: ' + inc.tokensPerHour.toFixed(2) + ' жетона/час ('
    + inc.duelsPerHour.toFixed(0) + ' боёв/час, побед ' + (PLAY.winRate * 100) + '%)\n');

const BASE = rows[0].power;
console.log('ст.  хп   урон    броня   сила   ур.   ×пред   цена  всего  часов  ×пред');
let cum = 0, prevPower = null, prevTime = null;
rows.forEach(r => {
    cum += r.cost;
    const time = r.cost / inc.tokensPerHour;
    const pStep = prevPower ? (r.power / prevPower) : null;
    const tStep = (prevTime && prevTime > 0) ? (time / prevTime) : null;
    console.log(
        String(r.n).padEnd(4) +
        String(r.stats.hp).padStart(3) + '  ' +
        (r.stats.damageMin + '-' + r.stats.damageMax).padStart(6) + '  ' +
        ZONES.map(z => r.stats.armor[z]).join('/').padStart(6) + '  ' +
        r.power.toFixed(0).padStart(5) + '  ' +
        level(r.power, BASE).toFixed(1).padStart(4) + '  ' +
        (pStep ? '×' + pStep.toFixed(2) : '  —  ').padStart(6) + '  ' +
        String(r.cost).padStart(4) + '  ' +
        String(cum).padStart(5) + '  ' +
        time.toFixed(1).padStart(5) + '  ' +
        (tStep ? '×' + tStep.toFixed(2) : '  —  ').padStart(6));
    prevPower = r.power;
    if (r.cost > 0) prevTime = time;
});

// ---------- СВЕРКА С МОДЕЛЬЮ ----------
console.log('\n--- сверка с моделью ---');
const warn = [];
for (let i = 1; i < rows.length; i++) {
    const p = rows[i].power / rows[i - 1].power;
    if (Math.abs(p - TARGET.powerStep) > 0.15) {
        warn.push('ступень ' + i + ': сила ×' + p.toFixed(2)
            + ', модель ждёт ×' + TARGET.powerStep.toFixed(2));
    }
}
const firstMinutes = rows[1] ? rows[1].cost / inc.tokensPerHour * 60 : 0;
if (firstMinutes > TARGET.firstTierMinutes) {
    warn.push('первая ступень копится ' + firstMinutes.toFixed(0)
        + ' мин, модель ждёт не больше ' + TARGET.firstTierMinutes);
}
for (let i = 2; i < rows.length; i++) {
    const t = rows[i].cost / rows[i - 1].cost;
    if (t < TARGET.timeStep[0] || t > TARGET.timeStep[1]) {
        warn.push('ступень ' + i + ': копится ×' + t.toFixed(2)
            + ' от предыдущей, коридор ×' + TARGET.timeStep.join('–×'));
    }
}
console.log(warn.length ? warn.map(w => '  ⚠ ' + w).join('\n') : '  всё в коридоре модели');

// ---------- ЧТО ЭТО ЗНАЧИТ В БОЮ ----------
// Перевод отношения сил в шанс победы. Кривая измерена симуляцией боя
// (docs/plan/15-progression.md, раздел 2).
const CURVE = [[0.5, 4], [0.7, 20], [0.8, 28], [0.9, 39], [1.0, 50],
               [1.2, 67], [1.4, 80], [1.6, 87], [2.0, 95], [2.5, 99]];
function winChance(ratio) {
    if (ratio <= CURVE[0][0]) return CURVE[0][1];
    for (let i = 1; i < CURVE.length; i++) {
        if (ratio <= CURVE[i][0]) {
            const [x0, y0] = CURVE[i - 1], [x1, y1] = CURVE[i];
            return y0 + (y1 - y0) * (ratio - x0) / (x1 - x0);
        }
    }
    return 99;
}
// ---------- ПРОТИВНИКИ ЗАБЕГА В ТЕХ ЖЕ УРОВНЯХ ----------
// Чтобы силу контента и силу игрока можно было сравнивать одним числом.
const rogue = W.rogue;
if (rogue && rogue.enemies) {
    console.log('\n--- противники забега в уровнях силы ---');
    Object.keys(rogue.enemies).forEach(key => {
        const e = rogue.enemies[key];
        const p = power({
            hp: e.hp, damageMin: e.damage[0], damageMax: e.damage[1],
            armor: { head: 0, body: 0, tail: 0 }
        }, (e.damage[0] + e.damage[1]) / 2).value;
        console.log('  ' + key.padEnd(10) + 'сила ' + p.toFixed(0).padStart(4)
            + '   уровень ' + level(p, BASE).toFixed(1));
    });
    if (rogue.start) {
        const st = power({
            hp: rogue.start.hp, damageMin: rogue.start.damage[0],
            damageMax: rogue.start.damage[1], armor: { head: 0, body: 0, tail: 0 }
        }, (rogue.start.damage[0] + rogue.start.damage[1]) / 2).value;
        console.log('  ' + 'вход'.padEnd(10) + 'сила ' + st.toFixed(0).padStart(4)
            + '   уровень ' + level(st, BASE).toFixed(1));
    }
}

console.log('\n--- если войти на ступень со снаряжением предыдущей ---');
for (let i = 1; i < rows.length; i++) {
    const ratio = rows[i - 1].power / rows[i].power;
    console.log('  ступень ' + i + ': отношение сил ×' + ratio.toFixed(2)
        + ' → побед около ' + winChance(ratio).toFixed(0) + '%');
}
