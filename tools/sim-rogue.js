// ================= СИМУЛЯЦИЯ ЗАБЕГА =================
// Считает, чем кончается забег при заданном бойце: прогоняет тысячи заходов
// по НАСТОЯЩЕЙ таблице врагов и настоящей формуле урона из конфига.
//
// Зачем машина, а не глаз: бой — угадайка один из трёх, и «на глаз тяжело»
// здесь ничего не значит. Значение имеет доля дошедших до босса, а её можно
// только посчитать.
//
// Запуск из корня:  node tools/sim-rogue.js [прогонов]

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../src/config/wrath-gear.js', 'utf8') + '\n'
          + fs.readFileSync(__dirname + '/../src/config/economy.js', 'utf8') + '\n'
          + 'module.exports = { WRATH_GEAR, ECONOMY };';
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const { WRATH_GEAR, ECONOMY } = mod.exports;

const W = ECONOMY.minigames.wrath;
const ROGUE = W.rogue;
const FLOOR = W.minHitDamage || 0;
const ZONES = W.zones;

const pick = list => list[Math.floor(Math.random() * list.length)];
const roll = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Один раунд размена. Оба выбирают вслепую, как в игре.
function round(p, e) {
    const pa = pick(ZONES), pd = pick(ZONES);
    const ea = pick(ZONES), ed = pick(ZONES);
    if (pa !== ed) e.hp -= Math.max(FLOOR, roll(p.dmgMin, p.dmgMax) - (e.armor[pa] || 0));
    if (ea !== pd) p.hp -= Math.max(FLOOR, roll(e.dmgMin, e.dmgMax) - (p.armor[ea] || 0));
}

function fight(p, enemy) {
    const e = {
        hp: enemy.hp, dmgMin: enemy.damage[0], dmgMax: enemy.damage[1],
        armor: { head: 0, body: 0, tail: 0 }
    };
    let rounds = 0;
    while (p.hp > 0 && e.hp > 0 && rounds < 200) { round(p, e); rounds++; }
    return { win: e.hp <= 0 && p.hp > 0, rounds };
}

// Политика выбора награды: во что игрок вкладывается.
function takeBoost(p, choices, policy) {
    let id = choices[0];
    if (policy === 'hp') id = choices.find(c => ROGUE.boosts[c].hp) || choices[0];
    else if (policy === 'damage') id = choices.find(c => ROGUE.boosts[c].damage) || choices[0];
    else if (policy === 'mixed') {
        id = (p.hp / p.maxHp < 0.6)
            ? (choices.find(c => ROGUE.boosts[c].hp) || choices[0])
            : (choices.find(c => ROGUE.boosts[c].damage) || choices[0]);
    }
    const b = ROGUE.boosts[id];
    if (b.damage) { p.dmgMin += b.damage; p.dmgMax += b.damage; }
    if (b.armor) ZONES.forEach(z => { p.armor[z] += b.armor; });
    if (b.hp) { p.maxHp += b.hp; p.hp += b.hp; }
}

// ---------- СИЛА ----------
// Та же мера, что в tools/progression.js: сколько урона боец успевает
// нанести, прежде чем умрёт (docs/plan/15-progression.md, раздел 2).
const HIT = (ZONES.length - 1) / ZONES.length;
function power(hp, dmgMin, dmgMax, armor, incoming) {
    const dps = ((dmgMin + dmgMax) / 2) * HIT;
    const perHit = Math.max(FLOOR, incoming - (armor || 0));
    return hp * (incoming / perHit) * dps;
}

function run(start, policy, tension) {
    const p = {
        hp: start.hp, maxHp: start.hp,
        dmgMin: start.dmgMin, dmgMax: start.dmgMax,
        armor: Object.assign({ head: 0, body: 0, tail: 0 }, start.armor)
    };
    let node = 0;
    for (const step of ROGUE.map) {
        if (step.kind === 'fork') {
            // Открыт только привал: магазин и события ещё не сделаны.
            const heal = Math.round(p.maxHp * (ROGUE.healShare || 0.5));
            p.hp = Math.min(p.maxHp, p.hp + heal);
            node++;
            continue;
        }
        const enemy = ROGUE.enemies[step.enemy];

        // Натяжение узла: во сколько раз боец сильнее противника В МОМЕНТ
        // прихода. Меряется здесь, а не в таблице врагов, потому что внутри
        // забега боец растёт — «процент от силы босса» без этого врёт.
        if (tension) {
            const incoming = (enemy.damage[0] + enemy.damage[1]) / 2;
            const armor = ZONES.reduce((a, z) => a + p.armor[z], 0) / ZONES.length;
            const mine = power(p.hp, p.dmgMin, p.dmgMax, armor, incoming);
            const his = power(enemy.hp, enemy.damage[0], enemy.damage[1], 0,
                (p.dmgMin + p.dmgMax) / 2);
            const t = tension[node] || (tension[node] = { name: step.enemy, mine: 0, his: 0, n: 0 });
            t.mine += mine; t.his += his; t.n++;
        }

        const res = fight(p, enemy);
        if (!res.win) return { died: node, rounds: res.rounds };
        const reward = enemy.reward || {};
        if (reward.healFull) p.hp = p.maxHp;
        else if (reward.heal) p.hp = Math.min(p.maxHp, p.hp + reward.heal);
        if (reward.choices) takeBoost(p, reward.choices, policy);
        node++;
    }
    return { died: null, hp: p.hp, maxHp: p.maxHp, dmg: p.dmgMin + '-' + p.dmgMax };
}

// ---------- бойцы, которых сравниваем ----------
// Главный — тот, с которым в забег и входят: ROGUE.start. Остальные два для
// сравнения: голая база (что было бы без стартового набора) и полный комплект
// из магазина (что было бы без изоляции).
const start = ROGUE.start || { hp: W.baseHp, damage: [W.damageMin, W.damageMax] };
const runner = { hp: start.hp, dmgMin: start.damage[0], dmgMax: start.damage[1], armor: {} };
const bare = { hp: W.baseHp, dmgMin: W.damageMin, dmgMax: W.damageMax, armor: {} };

// Полный комплект: по лучшему предмету в каждый слот плюс потолок прокачки.
const geared = (() => {
    const slots = {};
    Object.keys(WRATH_GEAR.items).forEach(id => {
        const i = WRATH_GEAR.items[id];
        (slots[i.slot] = slots[i.slot] || []).push(i);
    });
    const armor = { head: 0, body: 0, tail: 0 };
    let dmg = 0, hp = 0;
    Object.keys(slots).forEach(slot => {
        const score = i => (i.armor ? Object.values(i.armor).reduce((a, b) => a + b, 0) : 0)
                         + (i.damage || 0) + (i.hp || 0);
        const top = slots[slot].reduce((a, b) => score(b) > score(a) ? b : a);
        ZONES.forEach(z => { if (top.armor && top.armor[z]) armor[z] += top.armor[z]; });
        dmg += top.damage || 0; hp += top.hp || 0;
    });
    const up = W.upgrades;
    return {
        hp: W.baseHp + hp + up.hp.levels[2].bonus,
        dmgMin: W.damageMin + dmg + up.damage.levels[2].bonus,
        dmgMax: W.damageMax + dmg + up.damage.levels[2].bonus,
        armor
    };
})();

const N = parseInt(process.argv[2] || '20000', 10);
const nodesTotal = ROGUE.map.filter(s => s.kind !== 'fork').length;

[['боец забега', runner], ['голая база', bare], ['полный комплект', geared]].forEach(([label, start]) => {
    console.log('\n=== ' + label + ' === хп ' + start.hp
        + ', урон ' + start.dmgMin + '-' + start.dmgMax
        + ', броня ' + ZONES.map(z => start.armor[z] || 0).join('/'));
    ['damage', 'hp', 'mixed'].forEach(policy => {
        let wins = 0;
        const deaths = new Array(ROGUE.map.length).fill(0);
        const tension = (policy === 'mixed') ? {} : null;
        for (let i = 0; i < N; i++) {
            const r = run(start, policy, tension);
            if (r.died === null) wins++; else deaths[r.died]++;
        }
        if (tension) start._tension = tension;
        const where = deaths.map((d, i) => d ? (i + 1) + ':' + Math.round(d / N * 100) + '%' : null)
            .filter(Boolean).join(' ');
        console.log('  политика ' + policy.padEnd(7)
            + ' дошли до конца: ' + (wins / N * 100).toFixed(1) + '%   гибнут на узлах: ' + where);
    });
});
console.log('\nузлов с боем: ' + nodesTotal + ', прогонов на политику: ' + N);

// ---------- НАТЯЖЕНИЕ ПО УЗЛАМ ----------
// Чем ближе отношение к единице, тем ровнее бой. Меряется по бойцу, который
// пришёл на узел, а не по таблице врагов: внутри забега игрок растёт, и
// «процент от силы босса» без этого ничего не значит.
if (runner._tension) {
    console.log('\n=== натяжение по узлам (боец забега) ===');
    console.log('узел  противник       его сила  сила игрока  отношение  доля от босса');
    const t = runner._tension;
    const keys = Object.keys(t).map(Number).sort((a, b) => a - b);
    const bossPower = t[keys[keys.length - 1]].his / t[keys[keys.length - 1]].n;
    keys.forEach(k => {
        const row = t[k];
        const his = row.his / row.n, mine = row.mine / row.n;
        console.log(String(k + 1).padEnd(6) + row.name.padEnd(16)
            + his.toFixed(0).padStart(8)
            + mine.toFixed(0).padStart(13)
            + ('×' + (mine / his).toFixed(2)).padStart(11)
            + ((his / bossPower * 100).toFixed(0) + '%').padStart(15));
    });
}
