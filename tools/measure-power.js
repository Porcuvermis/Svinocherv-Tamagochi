// ================= ПРОВЕРКА МЕРЫ СИЛЫ =================
// Проверка гипотезы: годится ли Сила = ЭХП × ДПС как единая мера бойца.
// Если годится, то бойцы с ОДИНАКОВОЙ силой, набранной по-разному (через
// здоровье или через урон), должны выигрывать друг у друга примерно поровну,
// а шанс победы должен зависеть только от ОТНОШЕНИЯ сил.
const FLOOR = 1, ZONES = 3, N = 40000;
const roll = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function duel(a, b) {
    let ah = a.hp, bh = b.hp, r = 0;
    while (ah > 0 && bh > 0 && r++ < 500) {
        const aAtk = Math.floor(Math.random() * ZONES), aDef = Math.floor(Math.random() * ZONES);
        const bAtk = Math.floor(Math.random() * ZONES), bDef = Math.floor(Math.random() * ZONES);
        if (aAtk !== bDef) bh -= Math.max(FLOOR, roll(a.dmg[0], a.dmg[1]) - b.armor);
        if (bAtk !== aDef) ah -= Math.max(FLOOR, roll(b.dmg[0], b.dmg[1]) - a.armor);
    }
    if (ah > 0 && bh <= 0) return 1;      // победа A
    if (bh > 0 && ah <= 0) return 0;      // победа B
    return 0.5;                            // ничья / затянулось
}

function winRate(a, b, n = N) {
    let s = 0;
    for (let i = 0; i < n; i++) s += duel(a, b);
    return s / n;
}

// Сила: сколько урона боец успевает нанести, прежде чем умрёт.
// ЭХП — здоровье с поправкой на броню (против конкретного противника),
// ДПС — средний урон, умноженный на долю дошедших ударов.
const HIT = (ZONES - 1) / ZONES;
function power(f, vs) {
    const avg = (f.dmg[0] + f.dmg[1]) / 2;
    const dps = avg * HIT;
    const incoming = vs ? (vs.dmg[0] + vs.dmg[1]) / 2 : avg;
    const perHit = Math.max(FLOOR, incoming - f.armor);
    const ehp = f.hp * (incoming / perHit);
    return { dps, ehp, power: ehp * dps };
}

// Ответ на оба вопроса — в docs/plan/15-progression.md, разделы 2 и 3.
// Отсюда же взята таблица «отношение сил → шанс победы», по которой
// tools/progression.js переводит числа в проценты побед.
//
// Запуск из корня:  node tools/measure-power.js

console.log('=== 1. Одна сила, набранная по-разному ===');
const base = { hp: 20, dmg: [3, 5], armor: 0 };
// Удваиваем силу тремя способами и стравливаем между собой.
const viaHp   = { hp: 40, dmg: [3, 5], armor: 0 };
const viaDmg  = { hp: 20, dmg: [6, 10], armor: 0 };
const viaMix  = { hp: 28, dmg: [4.5, 7], armor: 0 };
[['через хп', viaHp], ['через урон', viaDmg], ['поровну', viaMix]].forEach(([name, f]) => {
    const p = power(f, base);
    console.log(name.padEnd(12), 'сила', p.power.toFixed(0).padStart(4),
        '| против базы выигрывает', (winRate(f, base) * 100).toFixed(1) + '%');
});
console.log('\nмежду собой (должно быть около 50%, если мера честная):');
console.log('  хп против урона:', (winRate(viaHp, viaDmg) * 100).toFixed(1) + '%');
console.log('  хп против смеси:', (winRate(viaHp, viaMix) * 100).toFixed(1) + '%');

console.log('\n=== 2. Шанс победы от отношения сил ===');
console.log('отношение | шанс победы');
[0.5, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4, 1.6, 2.0, 2.5, 3.0].forEach(k => {
    // Наращиваем силу поровну: и хп, и урон в корень из k.
    const s = Math.sqrt(k);
    const f = { hp: Math.round(base.hp * s), dmg: [base.dmg[0] * s, base.dmg[1] * s], armor: 0 };
    const p = power(f, base).power / power(base, f).power;
    console.log(('×' + k.toFixed(1)).padStart(8), '  ', (winRate(f, base) * 100).toFixed(1) + '%',
        '  (реальное отношение сил ×' + p.toFixed(2) + ')');
});
