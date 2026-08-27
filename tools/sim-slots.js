// ================= АВТОМАТ АЛЧНОСТИ: СЧЁТ ВОЗВРАТА =================
// Крутка стоит монету, заполняет шкалу алчности на 10% и иногда платит.
// Вопрос ровно один: сколько золота автомат в итоге ОТДАЁТ игроку.
//
// ---------- ПОЧЕМУ ЭТО ГЛАВНОЕ ЧИСЛО ----------
// Возврат выше 100% ломает экономику мгновенно: круток никто не ограничивает,
// и лучшей стратегией в игре становится «сидеть и крутить вечно». Никакая
// балансировка остального после этого не имеет смысла.
//
// Рабочий коридор — 60–80%: автомат убыточен, но не грабителен, а шкала
// алчности всё равно закрывается каждой круткой
// (docs/plan/16-greed-slots.md, docs/plan/15-progression.md, раздел 10).
//
// Запуск из корня:  node tools/sim-slots.js [круток]

const SPIN_COST = 1;          // сколько стоит одна крутка
const FILL_SPINS = 10;        // круток на полную шкалу алчности
const PITY = 6;               // не больше стольких круток подряд без выигрыша
const PITY_PAY = 3;           // что выдаёт гарантия

// Таблица выплат: шанс и во сколько раз окупается ставка. Это ЧЕРНОВИК под
// проверку, а не окончательные числа: подбирать надо здесь, а не в коде игры.
const TABLE = [
    { name: 'две монеты',  chance: 0.090, pay: 2 },
    { name: 'три монеты',  chance: 0.030, pay: 5 },
    { name: 'три черепа',  chance: 0.004, pay: 20 },
    { name: 'джекпот',     chance: 0.0005, pay: 100 }
];

const N = parseInt(process.argv[2] || '2000000', 10);

let spent = 0, paid = 0, wins = 0, sinceWin = 0, worstStreak = 0, pityFired = 0;
for (let i = 0; i < N; i++) {
    spent += SPIN_COST;

    // Гарантия против тильта: шесть пустых круток подряд не бывает.
    if (sinceWin >= PITY - 1) {
        paid += PITY_PAY; wins++; pityFired++;
        worstStreak = Math.max(worstStreak, sinceWin);
        sinceWin = 0;
        continue;
    }

    const roll = Math.random();
    let acc = 0, hit = null;
    for (const row of TABLE) {
        acc += row.chance;
        if (roll < acc) { hit = row; break; }
    }
    if (hit) {
        paid += hit.pay; wins++;
        worstStreak = Math.max(worstStreak, sinceWin);
        sinceWin = 0;
    } else {
        sinceWin++;
    }
}

const rtp = paid / spent;
const fillCost = FILL_SPINS * SPIN_COST * (1 - rtp);

console.log('выплаты:');
TABLE.forEach(r => console.log('  ' + r.name.padEnd(14)
    + 'шанс ' + (r.chance * 100).toFixed(2).padStart(6) + '%'
    + '   платит ' + String(r.pay).padStart(3)
    + '   вклад в возврат ' + (r.chance * r.pay * 100).toFixed(1) + '%'));
console.log('  гарантия      раз в ' + PITY + ' круток   платит ' + PITY_PAY
    + '   сработала в ' + (pityFired / N * 100).toFixed(1) + '% круток');

console.log('\nвозврат (RTP): ' + (rtp * 100).toFixed(1) + '%'
    + (rtp > 1 ? '   ⚠ ПЕЧАТНЫЙ СТАНОК: выгоднее крутить вечно, чем играть в игру'
      : rtp < 0.6 ? '   ⚠ грабёж: игрок почувствует себя обобранным'
      : rtp > 0.8 ? '   ⚠ великовато: коридор 60–80%'
      : '   в коридоре 60–80%'));
console.log('выигрышных круток: ' + (wins / N * 100).toFixed(1) + '%');
console.log('дольше всего без выигрыша: ' + worstStreak + ' круток подряд');
console.log('одна шкала алчности (' + FILL_SPINS + ' круток) стоит игроку '
    + fillCost.toFixed(1) + ' монет');
