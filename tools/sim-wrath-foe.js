// ================= СИМУЛЯЦИЯ ПОДБОРА СОПЕРНИКА =================
// Отвечает на два вопроса, на которые чтением кода не ответить.
//
// ПЕРВЫЙ: честен ли подбор. Соперник берётся из коридора вокруг силы игрока
// (ECONOMY.minigames.wrath.opponent.spread), и «честно» значит: в среднем
// около половины побед, а отдельные бои разные — то полегче, то потяжелее.
// Проверяется прогоном настоящих боёв по настоящей формуле урона.
//
// ВТОРОЙ, и он важнее: ЗНАЧИТ ЛИ ЧТО-НИБУДЬ ПРОКАЧКА. Пока соперником была
// копия игрока, ответ был «нет»: в зеркале ни оружие, ни броня, ни здоровье
// не двигали шанс победы — 40–44% при любой сборке. Теперь недокачанный
// игрок обязан проигрывать, перекачанный — выигрывать, и видно это должно
// быть числом, а не на глаз.
//
// Подбор берётся ОТСЮДА ЖЕ, из backend.js, а не переписывается рядом:
// калькулятор, считающий по своей копии правил, врёт на второй правке.
//
// Запуск из корня:  node tools/sim-wrath-foe.js [прогонов]

const fs = require('fs');
const root = __dirname + '/..';
const src = fs.readFileSync(root + '/src/config/wrath-gear.js', 'utf8') + '\n'
          + fs.readFileSync(root + '/src/config/economy.js', 'utf8') + '\n'
          + fs.readFileSync(root + '/src/core/backend.js', 'utf8') + '\n'
          + 'module.exports = { WRATH_GEAR, ECONOMY, LocalBackend, wrathRandom };';
const mod = { exports: {} };

// Заглушки того, чего в узле нет: подбору соперника нужны только конфиги и
// снаряжение с прокачкой игрока — ни времени, ни отрисовки он не трогает.
const GameState = { data: { equipment: {}, upgrades: {} } };
const GameTime = { now: () => 0, secondsSince: () => 0 };
new Function('module', 'window', 'GameState', 'GameTime', 'WormMarks', 'WormModelAPI',
             'PRIDE_WARDROBE', 'console', 'crypto', src)
    (mod, {}, GameState, GameTime, undefined, undefined, undefined, console, undefined);
const { WRATH_GEAR, ECONOMY, LocalBackend: B, wrathRandom } = mod.exports;

const W = ECONOMY.minigames.wrath;
const ZONES = W.zones, FLOOR = W.minHitDamage;
const N = Number(process.argv[2]) || 20000;
const pick = l => l[Math.floor(Math.random() * l.length)];
const roll = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Один бой по правилам wrath-duel: обе стороны бьют и блокируют вслепую.
function duel(a, b) {
    let ah = a.hp, bh = b.hp, r = 0;
    while (ah > 0 && bh > 0 && r++ < 400) {
        const aa = pick(ZONES), ad = pick(ZONES), ba = pick(ZONES), bd = pick(ZONES);
        if (aa !== bd) bh -= Math.max(FLOOR, roll(a.damageMin, a.damageMax) - (b.armor[aa] || 0));
        if (ba !== ad) ah -= Math.max(FLOOR, roll(b.damageMin, b.damageMax) - (a.armor[ba] || 0));
    }
    return (bh <= 0 && ah > 0) ? 1 : ((ah <= 0 && bh > 0) ? 0 : 0.5);
}

// Сборки игрока: от голого до полностью выкупленного.
const tiers = B.gearTiers();
function wear(tier) {
    const eq = {};
    Object.keys(tiers).forEach(slot => {
        const t = Math.min(tier, tiers[slot].length);
        if (t > 0) eq[slot] = tiers[slot][t - 1];
    });
    return eq;
}
const maxTier = Math.max(...Object.keys(tiers).map(s => tiers[s].length));
const BUILDS = [];
for (let t = 0; t <= maxTier; t++) {
    const up = {};
    ['damage', 'hp'].forEach(k => { up[k] = Math.min(t, W.upgrades[k].levels.length); });
    BUILDS.push({ tier: t, equipment: wear(t), upgrades: up });
}

function asPlayer(build) {
    GameState.data.equipment = build.equipment;
    GameState.data.upgrades = build.upgrades;
}

console.log(`прогонов на точку: ${N}`);
console.log(`коридор подбора: ×${W.opponent.spread[0]}…×${W.opponent.spread[1]}, `
          + `кандидатов на бой: ${W.opponent.candidates}, разброс ступеней: ±${W.opponent.tierSpread}`);
console.log(`каталог: ` + Object.keys(tiers).map(s => `${s} ${tiers[s].length}`).join(', '));

// ---------- 1. ЧЕСТЕН ЛИ ПОДБОР ----------
console.log('\n---------- ПОДБОР ПРОТИВ РОВНИ ----------');
console.log('ступень  хп  урон     броня     сила   ×сил соперника        побед');
BUILDS.forEach(build => {
    asPlayer(build);
    const mine = B.wrathStats(build.equipment, build.upgrades);
    const myAvg = (mine.damageMin + mine.damageMax) / 2;
    let wins = 0, ratios = [];
    const fights = Math.max(400, Math.round(N / 40));
    for (let i = 0; i < fights; i++) {
        const foe = B.matchOpponent(wrathRandom(Math.floor(Math.random() * 1e9)), W.opponent);
        const his = B.wrathStats(foe.equipment, foe.upgrades);
        ratios.push(foe.ratio);
        wins += duel(mine, his);
    }
    ratios.sort((a, b) => a - b);
    const armor = `${mine.armor.head}/${mine.armor.body}/${mine.armor.tail}`;
    console.log(
        String(build.tier).padStart(5) + '  '
      + String(mine.hp).padStart(4) + '  '
      + `${mine.damageMin}-${mine.damageMax}`.padEnd(8)
      + armor.padEnd(10)
      + B.wrathPower(mine, myAvg).toFixed(0).padStart(5) + '   '
      + `×${ratios[0].toFixed(2)}…×${ratios[ratios.length - 1].toFixed(2)} (сред ×${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)})`.padEnd(30)
      + `${(wins / fights * 100).toFixed(0)}%`.padStart(5));
});

// ---------- 2. ЗНАЧИТ ЛИ ЧТО-НИБУДЬ ПРОКАЧКА ----------
// Тот же соперник, подобранный под СРЕДНЮЮ ступень, против игроков разных
// ступеней. Если снаряжение работает, проценты обязаны расти.
console.log('\n---------- ТОТ ЖЕ СОПЕРНИК ПРОТИВ РАЗНЫХ СБОРОК ----------');
const midIndex = Math.round(BUILDS.length / 2);
asPlayer(BUILDS[midIndex]);
const foes = [];
for (let i = 0; i < 40; i++) {
    const f = B.matchOpponent(wrathRandom(Math.floor(Math.random() * 1e9)), W.opponent);
    foes.push(B.wrathStats(f.equipment, f.upgrades));
}
console.log(`соперники подобраны под ступень ${BUILDS[midIndex].tier}`);
console.log('ступень игрока   сила   побед');
BUILDS.forEach(build => {
    const mine = B.wrathStats(build.equipment, build.upgrades);
    const myAvg = (mine.damageMin + mine.damageMax) / 2;
    let wins = 0;
    const fights = Math.max(400, Math.round(N / 40));
    for (let i = 0; i < fights; i++) wins += duel(mine, foes[i % foes.length]);
    console.log(String(build.tier).padStart(13) + '  '
      + B.wrathPower(mine, myAvg).toFixed(0).padStart(6) + '  '
      + `${(wins / fights * 100).toFixed(0)}%`.padStart(5));
});

// ---------- 3. РАЗНЫЕ ЛИ ОНИ ВООБЩЕ ----------
console.log('\n---------- НАСКОЛЬКО СОПЕРНИКИ РАЗНЫЕ ----------');
asPlayer(BUILDS[midIndex]);
const seen = {};
let sample = [];
for (let i = 0; i < 200; i++) {
    const f = B.matchOpponent(wrathRandom(Math.floor(Math.random() * 1e9)), W.opponent);
    const key = Object.keys(tiers).map(s => f.equipment[s] || '-').join('|')
              + '#' + ['damage', 'hp'].map(k => f.upgrades[k]).join('');
    seen[key] = (seen[key] || 0) + 1;
    if (i < 6) sample.push(f);
}
const uniq = Object.keys(seen).length;
console.log(`разных сборок среди 200 боёв: ${uniq}`);
const top = Object.keys(seen).sort((a, b) => seen[b] - seen[a])[0];
console.log(`самая частая встречается ${seen[top]} раз из 200 (${(seen[top] / 2).toFixed(0)}%)`);
console.log('\nпримеры соперников:');
sample.forEach(f => {
    const st = B.wrathStats(f.equipment, f.upgrades);
    const worn = Object.keys(tiers).map(s => f.equipment[s] ? WRATH_GEAR.items[f.equipment[s]].emoji : '·').join(' ');
    console.log(`  ${worn}  прокачка ур.${f.upgrades.damage}/${f.upgrades.hp}  `
      + `${st.hp} хп, ${st.damageMin}-${st.damageMax}, броня ${st.armor.head}/${st.armor.body}/${st.armor.tail}  ×${f.ratio.toFixed(2)}`);
});
