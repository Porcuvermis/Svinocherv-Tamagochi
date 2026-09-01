// ================= АВТОМАТ АЛЧНОСТИ: PAR-ЛИСТ =================
// Считает автомат так, как их считают на самом деле: по барабанам с
// ВЕСАМИ символов, полным перебором всех исходов, а не на глазок.
//
// ---------- КАК УСТРОЕН НАСТОЯЩИЙ АВТОМАТ ----------
// У механического «однорукого бандита» Чарльза Фея (1895) три барабана по
// десять позиций — тысяча исходов, выигрыш выпадал в 26.4% круток, и машина
// возвращала игроку 75.6% денег.
//
// Современные автоматы устроены иначе: с патента Инге Телнеса (1984, US
// 4,448,419) каждая ВИДИМАЯ позиция барабана отображается на большую таблицу
// невидимых, «виртуальных» позиций в памяти. На барабане один символ джекпота
// из двадцати, а в таблице — один из сотни, и шанс задаётся таблицей, а не
// картинкой. Отсюда огромные джекпоты при честной картинке из трёх барабанов.
//
// Мы берём ровно это: символ на барабане имеет ВЕС, шанс считается по весам.
// Дальше перебор всех сочетаний даёт точный возврат — без симуляции, без
// погрешности. Именно так выглядит PAR-лист, внутренний документ автомата.
//
// ---------- ЧТО МЫ ДЕЛАЕМ ИНАЧЕ ----------
// 1. Возврат ниже. У казино 85–98%, у нас 60–80%: у нас автомат не
//    развлечение за деньги, а СТОК золота, и заодно способ закрыть шкалу
//    алчности (docs/plan/16-greed-slots.md).
// 2. Есть гарантия против тильта: шести пустых круток подряд не бывает.
//    В настоящих автоматах такого нет и быть не может — там каждая крутка
//    независима. У нас игра, а не касса, и злить игрока незачем.
// 3. Мы НЕ подкручиваем «почти выигрыши». В автоматах пустые позиции
//    нарочно ставят рядом с джекпотом, чтобы барабан чаще останавливался в
//    шаге от него, — приём известный и работающий, но это ловушка для
//    зависимости, а не игровая механика. Веса у нас ровные.
//
// Запуск из корня:  node tools/sim-slots.js

const SPIN_COST = 1;        // крутка стоит монету
const FILL_SPINS = 10;      // круток на полную шкалу алчности
const PITY = 6;             // не больше стольких пустых круток подряд
const PITY_PAY = 3;         // что выдаёт гарантия
const TARGET_RTP = 0.75;    // сколько автомат возвращает игроку ВСЕГО

// Барабаны: символ → вес (сколько виртуальных позиций он занимает). Три
// одинаковых барабана — так проще читать, но веса могут отличаться.
const REEL = { '💀': 1, '🪙': 10, '🍖': 10, '🦴': 12, '▫️': 7 };

// Сколько платит комбинация. Числа — ОТНОШЕНИЯ: калькулятор сам подгонит их
// множителем под нужный возврат, чтобы не подбирать вручную.
const PAYS = { '💀': 100, '🪙': 20, '🍖': 10, '🦴': 5 };
const PAIR_SYMBOL = '🪙';   // две монеты платят по-мелкому, как две подковы у Фея
const PAIR_PAY = 2;

// ---------- ТОЧНЫЙ ПЕРЕБОР ----------
// Все сочетания трёх барабанов с их вероятностями. Символов мало, поэтому
// перебор дешевле и честнее любой симуляции: погрешности нет вовсе.
const SYMBOLS = Object.keys(REEL);
const TOTAL = SYMBOLS.reduce((s, k) => s + REEL[k], 0);

function outcomes(scale) {
    let rtp = 0, hit = 0;
    const byPay = {};
    SYMBOLS.forEach(a => SYMBOLS.forEach(b => SYMBOLS.forEach(c => {
        const p = (REEL[a] / TOTAL) * (REEL[b] / TOTAL) * (REEL[c] / TOTAL);
        let pay = 0;
        if (a === b && b === c && PAYS[a]) pay = Math.max(1, Math.round(PAYS[a] * scale));
        else if ([a, b, c].filter(x => x === PAIR_SYMBOL).length === 2) {
            pay = Math.max(1, Math.round(PAIR_PAY * scale));
        }
        if (pay > 0) {
            rtp += p * pay;
            hit += p;
            byPay[pay] = (byPay[pay] || 0) + p;
        }
    })));
    return { rtp, hit, byPay };
}

// ---------- ГАРАНТИЯ ----------
// Она добавляет к возврату, и добавляет прилично. Считается симуляцией:
// зависит от того, как часто случаются шесть пустых круток подряд, а это уже
// не одна крутка, а последовательность.
function withPity(scale, spins) {
    const base = outcomes(scale);
    let paid = 0, spent = 0, sinceWin = 0, pityFired = 0, wins = 0, worst = 0;
    for (let i = 0; i < spins; i++) {
        spent += SPIN_COST;
        if (sinceWin >= PITY - 1) {
            paid += PITY_PAY; pityFired++; wins++;
            worst = Math.max(worst, sinceWin);
            sinceWin = 0;
            continue;
        }
        if (Math.random() < base.hit) {
            // Какую именно выплату дала крутка — по долям внутри выигрышей.
            let r = Math.random() * base.hit, acc = 0, pay = 0;
            for (const key of Object.keys(base.byPay)) {
                acc += base.byPay[key];
                if (r <= acc) { pay = Number(key); break; }
            }
            paid += pay; wins++;
            worst = Math.max(worst, sinceWin);
            sinceWin = 0;
        } else sinceWin++;
    }
    return { rtp: paid / spent, hit: wins / spins, pityShare: pityFired / spins, worst, base };
}

// ---------- ПОДГОНКА ПОД ВОЗВРАТ ----------
// Сначала выбирается возврат, потом под него подбираются выплаты — а не
// наоборот (docs/plan/16-greed-slots.md, раздел 4).
let scale = 1, res = null;
for (let i = 0; i < 40; i++) {
    res = withPity(scale, 300000);
    if (Math.abs(res.rtp - TARGET_RTP) < 0.004) break;
    scale *= TARGET_RTP / res.rtp;
}

// ---------- ОТЧЁТ ----------
console.log('барабан (веса виртуальных позиций, всего ' + TOTAL + '):');
SYMBOLS.forEach(s => console.log('  ' + s + '  вес ' + String(REEL[s]).padStart(2)
    + '   шанс на барабане ' + (REEL[s] / TOTAL * 100).toFixed(1) + '%'));

console.log('\nвыплаты (подогнаны множителем ' + scale.toFixed(2) + '):');
Object.keys(PAYS).forEach(s => {
    const p = Math.pow(REEL[s] / TOTAL, 3);
    console.log('  ' + s + s + s + '  шанс ' + (p * 100).toFixed(3).padStart(7) + '%'
        + '   платит ' + String(Math.max(1, Math.round(PAYS[s] * scale))).padStart(3));
});
const pairP = 3 * Math.pow(REEL[PAIR_SYMBOL] / TOTAL, 2) * (1 - REEL[PAIR_SYMBOL] / TOTAL);
console.log('  ' + PAIR_SYMBOL + PAIR_SYMBOL + '·  шанс ' + (pairP * 100).toFixed(3).padStart(7) + '%'
    + '   платит ' + String(Math.max(1, Math.round(PAIR_PAY * scale))).padStart(3));
console.log('  гарантия  раз в ' + PITY + '     платит ' + String(PITY_PAY).padStart(3)
    + '   (срабатывает в ' + (res.pityShare * 100).toFixed(1) + '% круток)');

console.log('\nвозврат (RTP): ' + (res.rtp * 100).toFixed(1) + '%'
    + (res.rtp > 1 ? '   ⚠ ПЕЧАТНЫЙ СТАНОК'
      : res.rtp < 0.6 ? '   ⚠ грабёж'
      : res.rtp > 0.8 ? '   ⚠ великовато'
      : '   в коридоре 60–80%'));
console.log('выигрышных круток: ' + (res.hit * 100).toFixed(1) + '%'
    + '   (у «Liberty Bell» 1895 года было 26.4%)');
console.log('дольше всего без выигрыша: ' + res.worst + ' круток подряд');
console.log('одна шкала алчности (' + FILL_SPINS + ' круток) стоит игроку '
    + (FILL_SPINS * SPIN_COST * (1 - res.rtp)).toFixed(1) + ' монет');
