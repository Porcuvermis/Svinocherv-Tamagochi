// ================= ПОХОТЬ: ФИНАЛ И ЛЕСТНИЦА ХВОСТА =================
// Сколько частей жетона выносит средний игрок на каждой ступени хвоста.
//
// ---------- ЧТО ЗДЕСЬ СЧИТАЕТСЯ ----------
// Финал целиком, по тем же правилам, что в игре:
//   • хвост держится СВАЙПАМИ: каждый добавляет наклон (LustShot.pushBend),
//     а хвост всё время выпрямляется сам (LustShot.relaxBend). Сколько даёт
//     свайп и как быстро выпрямляется — решает ступень хвоста;
//   • толчков столько, сколько даёт ступень (10…20), а финал длится всегда
//     одинаково (finalMs): лишние толчки сокращают паузу между ними;
//   • капля летит по баллистике (LustShot.fly) с силой из промежутка
//     minPower…maxPower и разбросом ±spread;
//   • шкала — жетон из трёх частей разной цены (gauge: 2, 5, 8), части
//     набираются по порядку и с нуля (LustShot.gaugeState).
//
// Физика, динамика хвоста и шкала взяты из src/minigames/lust/lust-shot.js
// — ТОГО ЖЕ файла, что у игры. Копия любой из них однажды разошлась бы с
// игрой, и калькулятор уверенно докладывал бы, что всё сходится.
//
// ---------- СРЕДНИЙ ИГРОК ----------
// Прокачка меряется не на идеальном игроке, а на среднем: он свайпает не
// чаще трёх раз в секунду, самым размашистым свайпом проводит 1.2 радиана по
// дуге, промахивается рукой на треть задуманного и сам прицел знает с
// ошибкой в пару градусов. Эти числа — НЕ баланс и не прокачка: это рука,
// под которую баланс подбирается. Не геймплей подстраивается под игрока, а
// игрок под геймплей — поэтому рука одна на все ступени.
//
// Модель сверена с тем, как игралось до новой лестницы: на прежних числах
// (10 толчков, сила 0…1, ±32°, отдача 0.55, выпрямление 0.20, по 2 попадания
// на часть) она даёт 1.0 осколка и хотя бы один в 77% игр — ровно столько
// же давала прежняя модель с «уводом хвоста» ±15°.
//
// Запуск:  node tools/sim-lust.js

const fs = require('fs');
const root = __dirname + '/..';
const CFG = eval(fs.readFileSync(root + '/src/config/economy.js', 'utf8')
    + '\nECONOMY').minigames.lust;
const SHOT = eval(fs.readFileSync(root + '/src/minigames/lust/lust-shot.js', 'utf8')
    + '\nLustShot');

const RUNS = +(process.env.RUNS || 6000);
const STEPS = CFG.gauge;
const T_FINAL = (CFG.finalMs || 15000) / 1000;
const DT = 1 / 60;
const BEND_MAX = 1.0, BEND_HARD = 1.3;     // как в lust.js

// ---------- ГЕОМЕТРИЯ ФИНАЛА, СНЯТАЯ С ЖИВОЙ СЦЕНЫ ----------
// Кончик хвоста при каждом изгибе (заряд полный) и рот. Направление кончика
// в игре ровно −90° + изгиб: хвост гнётся луком, и угол кончика растёт
// вместе с изгибом один к одному. Числа печатает tools/test-lust.js — если
// сцена переехала, а они нет, таблица считается для геометрии, которой в
// игре больше нет.
const TIP_ROWS = [[0, 238, 617.4], [0.05, 241.4, 617.4], [0.1, 244.8, 617.6],
    [0.15, 248.2, 617.9], [0.2, 251.6, 618.4], [0.25, 255, 619], [0.3, 258.3, 619.7],
    [0.35, 261.6, 620.5], [0.4, 264.9, 621.4], [0.45, 268.1, 622.5], [0.5, 271.3, 623.7],
    [0.55, 274.4, 625], [0.6, 277.4, 626.4], [0.65, 280.4, 628], [0.7, 283.4, 629.6],
    [0.75, 286.3, 631.4], [0.8, 289, 633.2], [0.85, 291.8, 635.2], [0.9, 294.4, 637.2],
    [0.95, 296.9, 639.3], [1, 299.4, 641.6]];
// Рот — ТОТ, по которому игра считает попадания (LustMinigame.mouthAt: снят
// один раз на входе в финал, рот открыт). Прежде здесь стоял рот, снятый в
// другой момент — закрытый или на выдохе после забега, — и расходился с
// игровым на семь точек.
const MOUTH = { x: 388.3, y: 598.0 };

function tip(bend) {
    const b = Math.max(0, Math.min(1, bend));
    const i = Math.min(TIP_ROWS.length - 2, Math.floor(b / 0.05));
    const u = (b - TIP_ROWS[i][0]) / 0.05;
    return { x: TIP_ROWS[i][1] + (TIP_ROWS[i + 1][1] - TIP_ROWS[i][1]) * u,
             y: TIP_ROWS[i][2] + (TIP_ROWS[i + 1][2] - TIP_ROWS[i][2]) * u,
             dir: -Math.PI / 2 + b };
}

// Прицел — как в игре (LustMinigame.solveBend): середина первой полосы
// попаданий при силе 0.92.
function solveAim() {
    const v = CFG.speedMin + 0.92 * (CFG.speedMax - CFG.speedMin);
    let from = -1, to = -1;
    for (let i = 0; i <= 400; i++) {
        const b = i / 400, s = tip(b);
        const h = SHOT.fly(CFG, s, { vx: Math.cos(s.dir) * v, vy: Math.sin(s.dir) * v },
                           MOUTH, CFG.mouthR).hit;
        if (h) { if (from < 0) from = b; to = b; }
        else if (from >= 0) break;
    }
    return (from + to) / 2;
}
const AIM = solveAim();

const PLAYER = { rate: 3, arcMax: 1.2, noise: 0.30, bias: 0.035, over: 0.06 };
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return s - 3; };

// ---------- ОДИН ФИНАЛ ----------
function runOnce(t) {
    const N = t.shots, gap = T_FINAL / N;
    const target = AIM + PLAYER.bias * gauss();
    const hard = { relax: t.relax, hard: BEND_HARD };
    let bend = 0, last = -9, next = gap, hits = 0, time = 0, fired = 0;
    while (fired < N) {
        bend = SHOT.relaxBend(bend, DT, hard, BEND_MAX);
        // Игрок подталкивает, как только прицел просел, — но не чаще, чем
        // успевает рука, и не размашистее, чем позволяет дуга. Перегнул
        // заметно — отводит назад: ход пальца работает в обе стороны
        // (LustShot.pushBend). Заметно — это больше PLAYER.over: мелкий
        // перегиб рука не ловит, его и так снимет выпрямление.
        if (time - last >= 1 / PLAYER.rate) {
            const miss = target - bend;
            if (miss > 0 || -miss > PLAYER.over) {
                const arc = Math.sign(miss) * Math.min(Math.abs(miss) / t.gain, PLAYER.arcMax)
                          * Math.max(0, 1 + PLAYER.noise * gauss());
                bend = SHOT.pushBend(bend, arc, t, BEND_MAX);
                last = time;
            }
        }
        time += DT;
        if (time >= next - 1e-9) {
            const s = tip(bend);
            const v = SHOT.launch(CFG, t, s.dir);
            if (SHOT.fly(CFG, s, v, MOUTH, CFG.mouthR).hit) hits++;
            fired++; next += gap;
        }
    }
    return hits;
}

function measure(t) {
    let hits = 0, sh = 0, sq = 0, any = 0, whole = 0;
    for (let i = 0; i < RUNS; i++) {
        const h = runOnce(t), s = SHOT.gaugeState(h, STEPS).done;
        hits += h; sh += s; sq += s * s;
        if (s > 0) any++;
        if (s === STEPS.length) whole++;
    }
    const mean = sh / RUNS;
    return { hits: hits / RUNS, mean, any: any / RUNS, whole: whole / RUNS,
             err: Math.sqrt(Math.max(0, sq / RUNS - mean * mean) / RUNS) };
}

// ---------- ТАБЛИЦА ----------
const TAIL = CFG.upgrades.tail;
const TIERS = [TAIL.base].concat(TAIL.levels.map(l => l.bonus));
console.log(`шкала — жетон из частей ${STEPS.join(' / ')} попаданий, финал ${T_FINAL} с, ` +
            `прицел — изгиб ${AIM.toFixed(3)}\n`);
console.log(['ст.', 'толчков', 'сила', 'разброс', 'отдача', 'выпрям.', 'цена',
             'попаданий', 'осколков', 'хоть один', 'жетон'].map(h => String(h).padStart(11)).join(''));
const stats = TIERS.map(t => measure(t));
TIERS.forEach((t, i) => {
    const m = stats[i];
    console.log([i, t.shots, `${t.minPower.toFixed(2)}…${t.maxPower.toFixed(2)}`, `±${t.spread}°`,
                 t.gain.toFixed(2), t.relax.toFixed(3),
                 i ? TAIL.levels[i - 1].price.lust_token : '—',
                 m.hits.toFixed(1), m.mean.toFixed(2),
                 (m.any * 100).toFixed(0) + '%', (m.whole * 100).toFixed(0) + '%']
        .map(h => String(h).padStart(11)).join(''));
});

console.log('\nжетонов в сутки при двух оплаченных заходах:');
TIERS.forEach((t, i) => console.log(`  ступень ${String(i).padStart(2)}  ` +
    `${(stats[i].mean * 2 / 3).toFixed(2)}`));

const sum = (b) => b.levels.reduce((s, l) => s + l.price.lust_token, 0);
console.log('\nлестницы:');
CFG.upgrades.order.forEach(k => {
    const b = CFG.upgrades[k];
    console.log(`  ${k.padEnd(6)} ${b.levels.length} ступеней, ${sum(b)} жетонов`);
});

// ---------- УСЛОВИЯ, КОТОРЫЕ КАЛЬКУЛЯТОР СТОРОЖИТ САМ ----------
const problems = [];

// 1. Без прокачки хоть одна часть жетона — в 60–75% игр. Новичок не должен
//    уходить пустым через раз, но и гарантии у него быть не должно: низ
//    лестницы как раз отбирает у игрока возможность сыграть идеально.
if (stats[0].any < 0.60 || stats[0].any > 0.75)
    problems.push(`без прокачки хоть один осколок в ${(stats[0].any * 100).toFixed(0)}% игр, ` +
                  'надо 60–75%');

// 2. Верх доводит целый жетон почти до гарантии — и именно верх, а не
//    ступенью раньше: иначе последняя покупка пустая.
const last = stats[stats.length - 1], prev = stats[stats.length - 2];
if (last.whole < 0.95)
    problems.push(`верхняя ступень даёт жетон в ${(last.whole * 100).toFixed(0)}% игр, надо от 95%`);
if (prev.whole >= 0.95)
    problems.push(`предпоследняя уже даёт жетон в ${(prev.whole * 100).toFixed(0)}% — верхняя лишняя`);

// 3. Лестница монотонна: ни одна покупка не делает хуже. Порог — три
//    погрешности, соседние ступени близки.
for (let i = 1; i < stats.length; i++) {
    const d = stats[i].mean - stats[i - 1].mean;
    const err = 3 * Math.hypot(stats[i].err, stats[i - 1].err);
    if (d < -err)
        problems.push(`ступень ${i}: ${stats[i].mean.toFixed(2)} против ${stats[i - 1].mean.toFixed(2)} ` +
                      'на прошлой — покупка делает ХУЖЕ');
}

// 4. На верхней ступени даже САМЫЙ СЛАБЫЙ толчок долетает при верном
//    прицеле — с запасом. Иначе полностью прокачанный игрок всё равно видит
//    недолёты, и прокачка силы обманывает.
const top = TIERS[TIERS.length - 1], s0 = tip(AIM);
const reaches = (p) => {
    const v = CFG.speedMin + p * (CFG.speedMax - CFG.speedMin);
    return SHOT.fly(CFG, s0, { vx: Math.cos(s0.dir) * v, vy: Math.sin(s0.dir) * v },
                    MOUTH, CFG.mouthR).hit;
};
if (!reaches(top.minPower - 0.05) || !reaches(top.minPower) || !reaches(top.maxPower))
    problems.push(`на верхней ступени слабейший толчок (${top.minPower}) не долетает с запасом`);

console.log();
if (problems.length) {
    console.log('ПЛОХО:');
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
}
console.log('условия замысла выполнены');
