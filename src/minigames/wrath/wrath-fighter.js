// ================= БОЕЦ ГНЕВА =================
// Кто дерётся: модель свиночервя + надетое снаряжение + выведенные из него
// характеристики. Один тип данных на все режимы гнева — бой с ботом, бой с
// игроком, рогалик. Поэтому он лежит отдельно от самого боя: рогалик потом
// возьмёт этот же файл, а не скопирует расчёт себе.
//
// ---------- ЧТО ЗДЕСЬ НЕ ЖИВЁТ ----------
// Числа. Базовое здоровье и разброс урона — в ECONOMY.minigames.wrath,
// предметы — в WRATH_GEAR. Здесь только «как это складывается», и складывается
// оно в лоб: суммы, без множителей и особых случаев.
//
// Характеристики НЕ хранятся в состоянии. Они выводятся из надетого каждый
// раз: поменял предмет — пересчиталось. Хранится только что надето, иначе
// правка баланса в конфиге не догнала бы старые сохранения.

const WrathFighter = {

    ZONES: ['head', 'body', 'tail'],

    // Три зоны боя — это те же три зоны, в которых живут шрамы
    // (WormMarks.ZONES). Совпадение не случайное: зона последнего удара
    // уезжает в Backend.grantMark() как есть, без переходников.
    balance() {
        const cfg = (ECONOMY.minigames && ECONOMY.minigames.wrath) || {};
        return {
            baseHp: cfg.baseHp || 10,
            damageMin: cfg.damageMin || 1,
            damageMax: cfg.damageMax || 3
        };
    },

    // Характеристики от надетого. Пустые слоты = голые базовые числа.
    stats(equipment) {
        const base = this.balance();
        const out = {
            hp: base.baseHp,
            damage: 0,                              // прибавка к броску
            armor: { head: 0, body: 0, tail: 0 },
            damageMin: base.damageMin,
            damageMax: base.damageMax
        };

        Object.keys(equipment || {}).forEach(slot => {
            const item = WRATH_GEAR.items[equipment[slot]];
            if (!item) return;
            if (item.hp) out.hp += item.hp;
            if (item.damage) out.damage += item.damage;
            if (item.armor) {
                this.ZONES.forEach(zone => {
                    if (item.armor[zone]) out.armor[zone] += item.armor[zone];
                });
            }
        });

        out.damageMin += out.damage;
        out.damageMax += out.damage;
        return out;
    },

    // Боец игрока: его собственная модель со шрамами и косметикой.
    forPlayer() {
        const model = (typeof WormModelAPI !== 'undefined')
            ? WormModelAPI.loadWormModel() : null;
        const equipment = (GameState.data && GameState.data.equipment) || {};
        return {
            name: 'Ты',
            model,
            equipment: Object.assign({}, equipment),
            stats: this.stats(equipment),
            is_bot: false
        };
    },

    // Боец из слепка, который отдал Backend.getOpponent(). Слепок приходит в
    // той форме, в какой его вернёт сервер, — здесь он только обрастает
    // посчитанными характеристиками.
    fromSnapshot(snapshot) {
        const snap = snapshot || {};
        return {
            name: snap.name || 'Противник',
            model: snap.model || null,
            equipment: Object.assign({}, snap.equipment || {}),
            stats: this.stats(snap.equipment || {}),
            is_bot: true,
            is_self_copy: !!snap.is_self_copy
        };
    },

    // Сколько снял удар. Всё в лоб: бросок из диапазона плюс оружие, минус
    // броня той зоны, куда прилетело. Ниже нуля не уходит — «броня лечит»
    // выглядело бы ошибкой, а не тактикой.
    rollDamage(attacker, defender, zone) {
        const a = attacker.stats;
        const span = Math.max(0, a.damageMax - a.damageMin);
        const raw = a.damageMin + Math.floor(Math.random() * (span + 1));
        const armor = (defender.stats.armor && defender.stats.armor[zone]) || 0;
        return Math.max(0, raw - armor);
    },

    // ---------- ТЕКУЩЕЕ ЗДОРОВЬЕ ----------
    // Максимум зависит от снаряжения, а сколько от него осталось — от
    // прошлого боя и от того, сколько с тех пор заросло. Обе половины нужны
    // и лобби, и бою, поэтому считаются здесь.
    playerHp() {
        const stats = this.stats((GameState.data && GameState.data.equipment) || {});
        const max = stats.hp;
        const hp = GameState.fighterHp(max);
        return {
            hp,
            max,
            full: hp >= max,
            healSeconds: GameState.fighterHealSeconds(max)
        };
    },

    // ---------- ЧАСЫ ЗАРАСТАНИЯ ----------
    // Раз в секунду дёргают колбэк, пока экран открыт. Это НЕ таймер
    // состояния: здоровье считается формулой от метки времени и растёт само,
    // даже когда игра закрыта. Здесь только перерисовка числа — ровно как
    // единственный таймер в main.js, который перерисовывает шкалы.
    startHealClock(onTick) {
        const clock = {
            raf: null,
            stop() {
                if (this.raf) cancelAnimationFrame(this.raf);
                this.raf = null;
            }
        };
        let last = 0;
        const tick = (now) => {
            clock.raf = requestAnimationFrame(tick);
            if (document.hidden) return;      // в фоне рисовать некому
            if (now - last < 1000) return;
            last = now;
            onTick();
        };
        clock.raf = requestAnimationFrame(tick);
        return clock;
    },

    // ---------- ПОКАЗ БОЙЦА ----------
    // Вписать смонтированную модель в отведённое место. Нужно и лобби, и бою,
    // поэтому живёт здесь, а не в одном из них.
    //
    // Масштаб считается от ИЗМЕРЕННОГО силуэта, а не от заданного числа:
    // червь растёт (взросление добавляет сегменты), и любая константа однажды
    // перестанет годиться. Меряем — значит переживём.
    //
    // Сцена (stage) — контейнер постоянного размера, в который смонтирована
    // модель; коробка (box) — место, куда это всё надо уместить. Масштабируется
    // сцена целиком, вместе со всем, что в ней лежит (в бою — с зонами ударов).
    fitWorm(handle, stage, box, factor) {
        if (!handle || !stage || !box) return 1;
        const body = this.boxOf(handle, handle.svgRoot.querySelector('.worm-root'));
        if (!body || body.w < 1) return 1;

        // Центрируем силуэт в сцене: точка стояния — это голова, а центр тела
        // от неё далеко и у каждого червя по-своему (тело тянется в одну
        // сторону намного дальше, чем в другую).
        const pos = handle.getPosition();
        handle.setPosition(
            pos.x + (stage.clientWidth / 2 - body.cx),
            pos.y + (stage.clientHeight / 2 - body.cy)
        );

        const fit = Math.min(box.clientWidth / body.w, box.clientHeight / body.h) * (factor || 0.85);
        const scale = Math.max(0.2, Math.min(2.2, fit));
        stage.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        return scale;
    },

    // Габариты части (или всего тела) в единицах СЦЕНЫ — они же единицы
    // viewBox: рендерер ставит viewBox по clientWidth/clientHeight контейнера.
    //
    // Меряется getBBox, а не getBoundingClientRect, и на то две причины.
    // Первая: клиентский прямоугольник раздут фильтрами — тенью и размытием, —
    // и мишень по нему выходит заметно больше самой части. Вторая: он в
    // экранных пикселях, а сцена масштабирована и своей трансформацией, и
    // общей трансформацией холста (stage.js), так что его пришлось бы
    // переводить обратно двумя множителями. getBBox сразу даёт геометрию.
    boxOf(handle, el) {
        if (!handle || !el || !el.getBBox || !handle.svgRoot.getScreenCTM) return null;
        try {
            const b = el.getBBox();
            const m = handle.svgRoot.getScreenCTM().inverse().multiply(el.getScreenCTM());
            const pt = handle.svgRoot.createSVGPoint();
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            // Все четыре угла, а не два: у зеркального противника матрица
            // содержит scale(-1,1), и «левый верхний» после неё оказывается
            // справа.
            [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
                .forEach(corner => {
                    pt.x = corner[0]; pt.y = corner[1];
                    const p = pt.matrixTransform(m);
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
            return {
                x: minX, y: minY,
                w: maxX - minX, h: maxY - minY,
                cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
            };
        } catch (err) {
            return null;
        }
    },

    // Короткая сводка для интерфейса: то, что показывается строкой в лобби.
    summary(stats) {
        return {
            hp: stats.hp,
            damage: stats.damageMin === stats.damageMax
                ? String(stats.damageMin)
                : `${stats.damageMin}–${stats.damageMax}`,
            armor: `${stats.armor.head}/${stats.armor.body}/${stats.armor.tail}`
        };
    }
};

if (typeof window !== 'undefined') {
    window.WrathFighter = WrathFighter;
}
