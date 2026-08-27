// ================= ДОБЫЧА В ЗАВИСТИ =================
// Сколько ресурсов приносит забег при разных ступенях прокачки и не ломает ли
// это суточный бюджет золота. Правила ровно те, что в docs/plan/18-envy.md:
//
//   • шкала 6 делений, зелёный +2, красный −1, ниже несгораемого порога не
//     падает; цель — 6;
//   • ходов ограниченное число, кончились без полной шкалы — провал;
//   • ресурс даёт значимый образ НЕЗАВИСИМО от цвета, но только при
//     успешном забеге (провал сжигает добычу);
//   • цвет образа игрок узнаёт бесплатно: подсказка приходит на секунде,
//     засчитывается выбор на второй — можно отпустить.
//
// Игрок в симуляции жадный, но не самоубийца: берёт самый ценный красный,
// если оставшихся ходов ещё хватит на победу, иначе берёт зелёный.
//
// Запуск:  node tools/sim-envy.js

const POOL = 35;             // образов в пуле (столько же наклеек на полотне)
const GOAL = 6;              // делений в шкале
const GREEN = 2;             // зелёный заполняет
const RED = 1;               // красный стирает
const RUNS = 50000;

// Что даёт сама ПОБЕДА, без образов, — из конфига наград. Гарантия, чтобы
// стартовый забег не приносил «полглаза» и первая покупка не стояла месяц.
const WIN_GOLD = 10;
const WIN_EYES = 1;

// Ценные образы: что дают. Остальные образы пула не дают ничего.
// Золото здесь — ДОБАВКА, а не основной доход: за победу платит общий конфиг
// наград (goldBase), как всем грехам. Иначе стартовый забег приносил бы
// монету с копейками и зависть была бы самым бедным грехом в игре.
// Глаза — внутренняя валюта зависти, их бюджет ничем не связан, поэтому они и
// есть то, ради чего лезут за красными.
const VALUABLES = [
    { key: 'coin', gold: 2, eyes: 0 },
    { key: 'bag',  gold: 5, eyes: 0 },
    { key: 'eye',  gold: 0, eyes: 1 },
    { key: 'eye2', gold: 0, eyes: 1 }
];

// Ступени прокачки. weight — во сколько раз охотнее ценный образ становится
// значимым (1 = наравне со всеми).
const TIERS = [
    { name: 'старт',      moves: 3, floor: 0, weight: 1, wrongBase: 3, wrongMax: 5 },
    { name: 'ходы 5',     moves: 5, floor: 0, weight: 1, wrongBase: 3, wrongMax: 5 },
    { name: '+порог 1',   moves: 5, floor: 1, weight: 2, wrongBase: 3, wrongMax: 5 },
    { name: 'ходы 7',     moves: 7, floor: 1, weight: 2, wrongBase: 4, wrongMax: 6 },
    { name: 'всё',        moves: 8, floor: 2, weight: 3, wrongBase: 4, wrongMax: 7 }
];

// Сколько зелёных ещё нужно, чтобы добить шкалу с текущего значения.
function greensNeeded(fill) {
    return Math.ceil((GOAL - fill) / GREEN);
}

function pickSignificant(tier, wrongCount) {
    // Значимые выбираются из пула без повтора; ценные образы тянут вес.
    const bag = [];
    for (let i = 0; i < POOL; i++) bag.push(i < VALUABLES.length ? VALUABLES[i] : null);
    const chosen = [];
    const weights = bag.map(v => (v ? tier.weight : 1));
    for (let n = 0; n < wrongCount + 1; n++) {
        let total = 0;
        for (let i = 0; i < bag.length; i++) total += weights[i];
        let r = Math.random() * total;
        let idx = 0;
        for (let i = 0; i < bag.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
        chosen.push(bag[idx]);
        bag.splice(idx, 1); weights.splice(idx, 1);
    }
    return { green: chosen[0], reds: chosen.slice(1) };
}

function run(tier) {
    let fill = 0, moves = tier.moves, gold = 0, eyes = 0;
    while (moves > 0 && fill < GOAL) {
        // Красных становится больше от числа СДЕЛАННЫХ ходов, а не от
        // заполнения шкалы. В прежнем виде (от шкалы) выходило наоборот:
        // взял красный — шкала просела — следующее облако стало РЕДЬШЕ и
        // читать его легче. Жадность облегчала игру.
        const used = tier.moves - moves;
        const wrongCount = Math.min(tier.wrongMax, tier.wrongBase + used);
        const { green, reds } = pickSignificant(tier, wrongCount);

        // Самый ценный красный на столе.
        let best = null;
        for (const r of reds) {
            if (!r) continue;
            if (!best || r.gold + r.eyes * 3 > best.gold + best.eyes * 3) best = r;
        }

        // Красный по карману, если после него оставшихся ходов хватит на добивку.
        const after = Math.max(tier.floor, fill - RED);
        const affordable = best && (moves - 1) >= greensNeeded(after);

        if (affordable) {
            gold += best.gold; eyes += best.eyes;
            fill = after;
        } else {
            if (green) { gold += green.gold; eyes += green.eyes; }
            fill = Math.min(GOAL, fill + GREEN);
        }
        moves--;
    }
    const won = fill >= GOAL;
    return won ? { won, gold, eyes } : { won, gold: 0, eyes: 0 };
}

console.log(`пул ${POOL} образов, ценных ${VALUABLES.length}: ` +
    VALUABLES.map(v => `${v.key} ${v.gold ? v.gold + '🪙' : v.eyes + '👁'}`).join(', '));
console.log(`шкала ${GOAL} делений, зелёный +${GREEN}, красный −${RED}\n`);
console.log('за победу сверх образов: ' + WIN_GOLD + '🪙 + ' + WIN_EYES + '👁\n');
console.log(['ступень', 'ходов', 'порог', 'вес', '🪙 всего', '👁 всего', 'провалов']
    .map(h => String(h).padStart(11)).join(''));

for (const tier of TIERS) {
    let gold = 0, eyes = 0, lost = 0;
    for (let i = 0; i < RUNS; i++) {
        const r = run(tier);
        gold += r.gold; eyes += r.eyes;
        if (!r.won) lost++;
    }
    const wins = RUNS - lost;
    console.log([tier.name, tier.moves, tier.floor, `×${tier.weight}`,
        ((gold + wins * WIN_GOLD) / RUNS).toFixed(1),
        ((eyes + wins * WIN_EYES) / RUNS).toFixed(2),
        (lost / RUNS * 100).toFixed(1) + '%']
        .map(h => String(h).padStart(11)).join(''));
}
