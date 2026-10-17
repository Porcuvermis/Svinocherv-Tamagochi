// ================= ПЕРЕХОДНИК: ЗАБЕГ ГНЕВА =================
// Рогалик: сложность, эффекты, магазин и события забега, боевая прокачка.
// Продолжение LocalBackend (backend.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после backend.js.
Object.assign(LocalBackend, {

    // ---------- РОГАЛИК ГНЕВА ----------
    // Забег — это состояние, а не сессия экрана: он переживает закрытие игры,
    // не имеет таймера жизни и продолжается там, где остановился. Поэтому всё
    // про него живёт здесь и в state.runs, а экран только показывает.
    //
    // Что предложат за победу, задано узлом карты, а не броском: забег
    // должен восстанавливаться из состояния один в один. Seed у забега уже
    // есть — он понадобится магазину и событиям, где случайность нужна, и
    // тогда она будет выводиться из него, а не храниться списком.
    rogueConfig() {
        return (ECONOMY.minigames.wrath && ECONOMY.minigames.wrath.rogue) || null;
    },

    // Текущий забег или null.
    //
    // Здесь же отбраковка забегов старого формата. Забег живёт неделями и
    // переживает обновления игры, а карта и награды в конфиге меняются —
    // забег, собранный по другой карте, дальше пойдёт вкривь. Дешевле
    // выбросить его на входе, чем чинить каждое место, где он используется.
    run() {
        const run = GameState.data.runs && GameState.data.runs.wrath;
        if (!run || !run.map) return null;
        const cfg = this.rogueConfig();
        if (!cfg || !run.bonus || run.map.length !== cfg.map.length) {
            delete GameState.data.runs.wrath;
            GameState.save();
            return null;
        }
        return run;
    },

    // Противник узла. Числа — из конфига, модель придёт отдельно
    // (getOpponent): своих обликов у врагов забега пока нет.
    // ---------- СЛОЖНОСТЬ ЗАБЕГА ----------
    // Уровень выбирается при входе и живёт в самом забеге: поменять его на
    // середине нельзя, иначе цена входа перестанет что-либо значить.
    rogueLevels() {
        const cfg = this.rogueConfig();
        return (cfg && cfg.levels) || [{ sign: '🔥', entry: cfg ? cfg.entry : {}, enemy: 1, loot: 1 }];
    },

    rogueLevel(index) {
        const levels = this.rogueLevels();
        const i = Math.max(0, Math.min(levels.length - 1, index || 0));
        return Object.assign({ index: i }, levels[i]);
    },

    // Уровень ИДУЩЕГО забега. Старые сохранения его не знают — там ноль,
    // то есть та самая сложность, на которой они и начинались.
    runLevel() {
        const run = this.run();
        return this.rogueLevel(run ? (run.level || 0) : 0);
    },

    // Враг узла с поправкой на сложность. Множитель применяется ЗДЕСЬ, а не
    // записывается в забег при старте: тогда правка конфига догоняла бы уже
    // идущие забеги, а таблица врагов оставалась бы одна на все сложности.
    //
    // levelIndex нужен окну входа: там забега ещё нет, а показать, каким
    // станет босс на выбранной сложности, надо ДО того, как жетон списан.
    // Без этого довода окно показывало босса первой сложности на всех трёх.
    rogueEnemy(node, levelIndex) {
        const cfg = this.rogueConfig();
        if (!cfg || !node || !node.enemy) return null;
        const enemy = cfg.enemies[node.enemy];
        if (!enemy) return null;
        const k = (levelIndex == null ? this.runLevel() : this.rogueLevel(levelIndex)).enemy || 1;
        if (k === 1) return Object.assign({ id: node.enemy }, enemy);
        // Вверх, а не вниз: враг на высокой сложности не должен оказаться
        // слабее, чем на низкой, из-за округления.
        return Object.assign({ id: node.enemy }, enemy, {
            hp: Math.ceil(enemy.hp * k),
            damage: (enemy.damage || [1, 3]).map(d => Math.ceil(d * k))
        });
    },

    // Шаг проходим, если он не закрыт целиком. У развилки хватает одного
    // открытого пути: магазин и события ещё не сделаны, но привал работает,
    // и развилка из-за них не становится тупиком.
    stepOpen(step) {
        if (!step || step.locked) return false;
        if (step.kind === 'fork') return (step.options || []).some(o => !o.locked);
        return true;
    },

    // Следующий шаг, который вообще работает. Закрытые остаются на карте, но
    // перешагиваются: они нарисованы заранее, чтобы карта не поехала, когда
    // их сделают.
    nextOpenNode(run, from) {
        let i = from;
        while (i < run.map.length && !this.stepOpen(run.map[i])) i += 1;
        return i;
    },

    // Начать забег. Вход платный и невозвратный: жетон списывается здесь.
    startRun(levelIndex) {
        const cfg = this.rogueConfig();
        if (!cfg) return { ok: false, error: 'no_config' };
        if (this.run()) return { ok: false, error: 'run_in_progress' };

        const level = this.rogueLevel(levelIndex);
        const price = level.entry || cfg.entry || {};
        const short = Object.keys(price).find(key => GameState.currency(key) < price[key]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(key => {
            GameState.addCurrency(key, -price[key]);
            GameState.pushLedger({
                currency: key, delta: -price[key],
                reason: 'rogue.wrath.entry', client_request_id: requestId
            });
        });

        // Забег ИЗОЛИРОВАН: снаряжение и прокачка внутрь не едут, боец
        // входит с числами из конфига — одинаково всегда и у всех
        // (docs/plan/10-wrath-rogue.md, раздел 8).
        //
        // Здоровье лобби при этом НЕ замораживается: забег его не тратит, у
        // него своё. Раньше заморозка была нужна, потому что бой забега бил
        // по тому же здоровью; теперь это разные жизни, и регенерация идёт
        // своим чередом, пока игрок ходит по карте.
        const maxHp = (cfg.start && cfg.start.hp) || this.fighterMaxHp();
        const run = {
            started_at: GameTime.now(),
            seed: Math.floor(Math.random() * 1e9),
            level: level.index,
            map: cfg.map.map((step, i) => {
                const node = {
                    id: i,
                    kind: step.kind,
                    enemy: step.enemy || null,
                    locked: !!step.locked,
                    done: false
                };
                // Развилка — три пути, из которых проходится один. Что
                // выбрали, хранится номером: по нему рисуется дорожка и
                // видно, чем игрок ходил.
                if (step.kind === 'fork') {
                    node.options = (step.options || []).map(o => ({
                        kind: o.kind, locked: !!o.locked
                    }));
                    node.chosen = null;
                }
                return node;
            }),
            node: 0,
            hp: maxHp,
            maxHp,
            teeth: 0,
            // Усиления забега — суммой для боя и списком для показа. В
            // состоянии игрока их нет: забег кончится вместе с ними.
            bonus: { damage: 0, armor: 0, hp: 0 },
            boosts: [],
            pending: null
        };
        run.node = this.nextOpenNode(run, 0);
        GameState.data.runs.wrath = run;
        GameState.save();
        return { ok: true, run };
    },

    // Бросить забег. Жетон не возвращается — это цена входа, а не залог.
    //
    // Возвращается ИТОГ, в той же форме, что у проигранного боя: докуда
    // дошёл и сколько зубов сгорело. Нужен он экрану: брошенный забег
    // обязан кончаться таким же итоговым окном, как любой другой, — иначе
    // экран входа встаёт под палец сразу после броска (docs/traps.md, п. 94).
    abandonRun() {
        const run = this.run();
        if (!run) return { ok: false, error: 'no_run' };
        const nodesTotal = run.map.filter(n => this.stepOpen(n)).length;
        const nodesDone = run.map.filter(n => n.done).length;
        const teethLost = run.teeth || 0;
        delete GameState.data.runs.wrath;
        GameState.save();
        return { ok: true, outcome: 'abandon', nodesDone, nodesTotal, teethLost };
    },

    // Подлечить забег, но не выше максимума. Возвращает, сколько реально
    // прибавилось: экран показывает именно это, а не то, что обещал конфиг.
    rogueHeal(run, amount) {
        const healed = Math.max(0, Math.min(Math.round(amount), run.maxHp - run.hp));
        run.hp += healed;
        return healed;
    },

    // ---------- ОДИН ФОРМАТ ЭФФЕКТА НА ВСЁ ----------
    // Товар магазина, вариант события и когда-нибудь ловушка на карте дают
    // одно и то же: здоровье, максимум, урон, броню, зубы, валюту. Раз так —
    // применяет их ОДНО место, а конфиг пишет табличкой. Иначе каждая новая
    // механика забега тащила бы свою ветку в resolveNode.
    //
    // hpShare — доля от МАКСИМУМА забега, а не от текущего: «отдай четверть
    // здоровья» не должно дешеветь по мере того, как игрок его теряет.
    //
    // ЗДОРОВЬЕМ ЭФФЕКТ НЕ УБИВАЕТ: цена обрезается так, чтобы осталась хотя бы
    // единица. Умереть от нажатия на картинку, не увидев боя, — худшее, что
    // может случиться за жетон (docs/plan/10-wrath-rogue.md, разд. 4).
    applyRogueEffect(run, eff, gained) {
        const out = gained || { currencies: {} };
        if (!eff) return out;

        // ---------- ДВА ВИДА ЗДОРОВЬЯ, ОДИН ЗНАЧОК ----------
        // hp поднимает И максимум, И текущее — так же, как усиление здоровьем
        // после боя: карточка, доставшаяся пустой, это карточка, которую не
        // берут. hpShare только лечит, долей от максимума.
        //
        // Раньше первое звалось maxHp и показывалось значком 💪 — четвёртой
        // величиной, которой у бойца нет. Механика та же, поэтому теперь и
        // имя, и значок общие: ❤️ (src/config/economy.js).
        if (eff.hp) {
            run.maxHp += eff.hp;
            run.hp += eff.hp;
            out.healed = (out.healed || 0) + eff.hp;
        }

        const hpDelta = eff.hpShare ? run.maxHp * eff.hpShare : 0;
        if (hpDelta > 0) out.healed = (out.healed || 0) + this.rogueHeal(run, hpDelta);
        else if (hpDelta < 0) {
            const paid = Math.min(Math.round(-hpDelta), run.hp - 1);
            if (paid > 0) { run.hp -= paid; out.hurt = (out.hurt || 0) + paid; }
        }

        if (eff.damage) { run.bonus.damage += eff.damage; out.damage = eff.damage; }
        if (eff.armor) { run.bonus.armor += eff.armor; out.armor = eff.armor; }

        if (eff.teeth) {
            const delta = eff.teeth > 0 ? eff.teeth : -Math.min(-eff.teeth, run.teeth);
            run.teeth += delta;
            out.teeth = (out.teeth || 0) + delta;
        }

        Object.keys(eff.currencies || {}).forEach(key => {
            const amount = eff.currencies[key];
            const requestId = newRequestId();
            GameState.addCurrency(key, amount);
            GameState.pushLedger({
                currency: key, delta: amount,
                reason: 'rogue.wrath.effect', client_request_id: requestId
            });
            out.currencies = Object.assign(out.currencies || {}, { [key]: amount });
        });
        return out;
    },

    // ---------- ЧТО ПРЕДЛАГАЕТ МАГАЗИН И КАКОЕ ВЫПАЛО СОБЫТИЕ ----------
    // Считается из СИДА ЗАБЕГА и номера узла, а не бросается при открытии.
    // Иначе перезаход перекатывал бы витрину, и «выйти и зайти, пока не
    // выпадет нужное» стало бы основной механикой магазина.
    rogueRoll(run, salt) {
        return wrathRandom(((run && run.seed) || 1) + salt * 7919);
    },

    rogueShopOffer(run, step) {
        const cfg = this.rogueConfig();
        const shop = (cfg && cfg.shop) || { slots: 3, items: {} };
        // Обязательные вещи стоят на витрине всегда. Причина в конфиге: без
        // дешёвой перевязки случайная тройка могла оказаться целиком не по
        // карману, и заход в магазин кончался ничем — а путь развилки при
        // этом потрачен.
        const must = (shop.always || []).filter(id => (shop.items || {})[id]);
        const ids = Object.keys(shop.items || {}).filter(id => must.indexOf(id) < 0);
        const rnd = this.rogueRoll(run, step + 1);
        // Тасовка, а не «взять N случайных»: повторов в витрине быть не
        // должно, две одинаковые вещи рядом читаются ошибкой.
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
        }
        return must.concat(ids).slice(0, shop.slots || 3);
    },

    rogueEventPick(run, step) {
        const cfg = this.rogueConfig();
        const ids = Object.keys((cfg && cfg.events) || {});
        if (!ids.length) return null;
        return ids[Math.floor(this.rogueRoll(run, step + 101)() * ids.length)];
    },

    // Что даёт узел, у которого нет противника. Отдельно, потому что таким
    // узлом может быть и путь развилки, и когда-нибудь обычная точка карты.
    //
    // Привал срабатывает СРАЗУ, а магазин и событие открывают лавку —
    // `run.pending`, тот же механизм, что у выбора усиления после боя. Пока
    // она открыта, дальше по карте не пускает (resolveNode отказывает), и
    // переживает она перезаход: мобильная сессия обязательно прервётся, а
    // потерять из-за этого выбор на развилке нельзя.
    applyPlainNode(run, cfg, kind, gained, step) {
        if (kind === 'heal') {
            gained.healed = this.rogueHeal(run, run.maxHp * (cfg.healShare || 0.5));
            return;
        }
        if (kind === 'shop') {
            run.pending = { kind: 'shop', step, offer: this.rogueShopOffer(run, step), bought: [] };
            return;
        }
        if (kind === 'event') {
            run.pending = { kind: 'event', step, id: this.rogueEventPick(run, step) };
        }
    },

    // Эффект, который ничего не изменит. Сейчас такой ровно один — лечение на
    // полном здоровье, — но проверка общая: любая вещь, которая сводится к
    // чистому лечению, на полной полосе бесполезна.
    rogueEffectEmpty(run, eff) {
        if (!eff) return true;
        const onlyHeal = !eff.hp && !eff.damage && !eff.armor && !eff.teeth
                         && !eff.currencies;
        return onlyHeal && run.hp >= run.maxHp;
    },

    // ---------- ПОКУПКА В МАГАЗИНЕ ЗАБЕГА ----------
    // Платят ЗУБАМИ — валютой, которая живёт только внутри забега и сгорает
    // на выходе. Поэтому и проверка здесь своя, а не общая на валюты.
    buyRogueItem(id) {
        const run = this.run();
        const cfg = this.rogueConfig();
        if (!run || !cfg) return { ok: false, error: 'no_run' };
        const pending = run.pending;
        if (!pending || pending.kind !== 'shop') return { ok: false, error: 'no_shop' };
        if ((pending.offer || []).indexOf(id) < 0) return { ok: false, error: 'not_offered' };
        // Каждая вещь в витрине одна: витрина — это ВЫБОР, а не автомат по
        // размену зубов на здоровье.
        if ((pending.bought || []).indexOf(id) >= 0) return { ok: false, error: 'sold_out' };

        const item = (cfg.shop.items || {})[id];
        if (!item) return { ok: false, error: 'unknown_item' };
        if (run.teeth < item.price) return { ok: false, error: 'not_enough', currency: 'teeth' };
        // ПУСТУЮ ВЕЩЬ НЕ ПРОДАЁМ. Перевязка на полном здоровье не даёт
        // ничего, а зубы списывает — это не выбор игрока, а ловушка. То же
        // правило, по которому усиление здоровьем поднимает и максимум:
        // карточка не должна доставаться пустой.
        if (this.rogueEffectEmpty(run, item.effect)) return { ok: false, error: 'no_effect' };

        run.teeth -= item.price;
        const gained = this.applyRogueEffect(run, item.effect, { currencies: {} });
        pending.bought = (pending.bought || []).concat(id);
        GameState.save();
        return { ok: true, gained, teeth: run.teeth };
    },

    // Уйти из магазина. Отдельным шагом, а не «купил и вышел»: покупок может
    // быть несколько, и решает игрок, а не последняя цена.
    closeRogueShop() {
        const run = this.run();
        if (!run || !run.pending || run.pending.kind !== 'shop') {
            return { ok: false, error: 'no_shop' };
        }
        run.pending = null;
        GameState.save();
        return { ok: true };
    },

    // ---------- ВАРИАНТ СОБЫТИЯ ----------
    // Вариантов два, и оба чего-то стоят. Выбор закрывает событие сразу:
    // передумать нельзя, в этом и риск.
    takeRogueEvent(index) {
        const run = this.run();
        const cfg = this.rogueConfig();
        if (!run || !cfg) return { ok: false, error: 'no_run' };
        const pending = run.pending;
        if (!pending || pending.kind !== 'event') return { ok: false, error: 'no_event' };

        const event = (cfg.events || {})[pending.id];
        const option = event && (event.options || [])[index];
        if (!option) return { ok: false, error: 'bad_choice' };
        // Не хватило зубов — вариант не берётся. Долгов в забеге нет.
        if (option.teeth < 0 && run.teeth < -option.teeth) {
            return { ok: false, error: 'not_enough', currency: 'teeth' };
        }

        const gained = this.applyRogueEffect(run, option, { currencies: {} });
        run.pending = null;
        GameState.save();
        return { ok: true, gained };
    },

    // Узел пройден. Что за это дать, решает конфиг, а не экран забега.
    // outcome: 'win' | 'lose'. choice — номер пути на развилке.
    resolveNode(outcome, choice) {
        const run = this.run();
        const cfg = this.rogueConfig();
        if (!run || !cfg) return { ok: false, error: 'no_run' };
        // Пока не выбрана награда за прошлый узел, дальше не пускает: выбор
        // лежит в состоянии и переживает перезаход, иначе он терялся бы
        // вместе со свёрнутой игрой.
        if (run.pending) return { ok: false, error: 'pending_choice' };

        const node = run.map[run.node];
        if (!node) return { ok: false, error: 'no_node' };

        // Два разных счёта, и путать их нельзя. Конец карты считается по
        // ДЛИНЕ карты: run.node — индекс в ней. А показывается игроку счёт
        // проходимых узлов: закрытые (магазин, событие) нарисованы, но он их
        // не проходит, и «4 из 11» врало бы.
        const openTotal = run.map.filter(n => this.stepOpen(n)).length;
        const passed = () => run.map.filter(n => n.done).length;

        // Поражение обрывает забег целиком: жетон сгорел, зубы сгорели.
        // Выданное по дороге (осколок за мини-босса) остаётся — оно уже в
        // кошельке, а не в забеге.
        if (outcome === 'lose') {
            const teethLost = run.teeth;
            delete GameState.data.runs.wrath;
            GameState.save();
            return {
                ok: true, finished: true, outcome: 'lose',
                nodesDone: passed(), nodesTotal: openTotal, teethLost
            };
        }

        const gained = { teeth: 0, healed: 0, currencies: {} };

        if (node.kind === 'fork') {
            // Развилка: проходится ОДИН путь из трёх, дальше дорога снова
            // сходится. Закрытый путь выбрать нельзя — он и не нажимается.
            const option = (node.options || [])[choice];
            if (!option || option.locked) return { ok: false, error: 'bad_choice' };
            node.chosen = choice;
            this.applyPlainNode(run, cfg, option.kind, gained, run.node);
        } else if (!node.enemy) {
            this.applyPlainNode(run, cfg, node.kind, gained, run.node);
        } else {
            const enemy = this.rogueEnemy(node);
            const reward = (enemy && enemy.reward) || null;
            if (reward) {
                // Добыча растёт вместе со сложностью — за то и платили на
                // входе. Здоровье, которое узел возвращает, НЕ растёт: оно
                // считается долей от максимума забега, а тот у всех один.
                const loot = this.runLevel().loot || 1;
                gained.teeth = Math.round((reward.teeth || 0) * loot);
                run.teeth += gained.teeth;

                if (reward.healFull) gained.healed = this.rogueHeal(run, run.maxHp);
                else if (reward.heal) gained.healed = this.rogueHeal(run, reward.heal);

                // Мясо в кладовую. Умножается на сложность, как и всё
                // остальное, но КЛАДЁТСЯ с потолком: кладовая не резиновая, и
                // забег на верхней сложности не должен её переполнять молча.
                // Сколько влезло, возвращает pantryStore — это и показывается.
                Object.keys(reward.pantry || {}).forEach(key => {
                    const want = Math.round(reward.pantry[key] * loot);
                    const got = this.pantryStore(key, want);
                    if (got > 0) gained.pantry = Object.assign(gained.pantry || {}, { [key]: got });
                });

                Object.keys(reward.currencies || {}).forEach(key => {
                    const requestId = newRequestId();
                    const amount = Math.round(reward.currencies[key] * loot);
                    GameState.addCurrency(key, amount);
                    GameState.pushLedger({
                        currency: key, delta: amount,
                        reason: 'rogue.wrath.' + (node.enemy || node.kind),
                        client_request_id: requestId
                    });
                    gained.currencies[key] = amount;
                });

                if (reward.choices && reward.choices.length) {
                    // kind проставляется явно: в pending теперь живут три
                    // разные вещи — выбор усиления, витрина и событие.
                    // Старые сохранения его не знают, и отсутствие kind
                    // читается как 'boost' (там ничего другого быть не могло).
                    run.pending = { kind: 'boost', choices: reward.choices.slice() };
                }
            }
        }

        node.done = true;
        run.node = this.nextOpenNode(run, run.node + 1);

        // Карта кончилась — забег пройден. Невыбранное усиление на последнем
        // узле пропадает вместе с забегом: применять его уже некуда.
        const finished = run.node >= run.map.length;
        if (finished) delete GameState.data.runs.wrath;

        GameState.save();
        return {
            ok: true, finished, outcome: 'win', gained,
            pending: finished ? null : run.pending,
            nodesDone: passed(),
            nodesTotal: openTotal,
            run: this.run()
        };
    },

    // Выбрана карточка усиления. Как и везде: экран говорит «беру вот это»,
    // а что это значит в числах, решает конфиг.
    chooseBoost(id) {
        const run = this.run();
        const cfg = this.rogueConfig();
        if (!run || !cfg) return { ok: false, error: 'no_run' };
        if (!run.pending) return { ok: false, error: 'no_choice' };
        // Лавка и событие висят в том же pending, но выбираются другими
        // ручками: общий ящик — один, а ключи к нему разные.
        if (run.pending.kind && run.pending.kind !== 'boost') return { ok: false, error: 'no_choice' };
        if ((run.pending.choices || []).indexOf(id) < 0) return { ok: false, error: 'not_offered' };

        const boost = cfg.boosts[id];
        if (!boost) return { ok: false, error: 'unknown_boost' };

        if (boost.damage) run.bonus.damage += boost.damage;
        if (boost.armor) run.bonus.armor += boost.armor;
        if (boost.hp) {
            // Здоровьем усиление лечит ровно на столько, на сколько подняло
            // максимум: иначе на полном здоровье его брали бы вслепую «на
            // потом», а побитый не брал бы никогда.
            run.bonus.hp += boost.hp;
            run.maxHp += boost.hp;
            run.hp += boost.hp;
        }

        run.boosts.push(id);
        run.pending = null;
        GameState.save();
        return { ok: true, boost: id, run };
    },

    // Здоровье забега меняется не только боем (усиления, узлы отхила),
    // поэтому запись отдельная — и снова с сохранением после каждого шага.
    setRunHp(hp) {
        const run = this.run();
        if (!run) return null;
        run.hp = Math.max(0, Math.min(run.maxHp, Math.round(hp)));
        GameState.save();
        return run.hp;
    },

    // Максимум здоровья бойца по снаряжению и прокачке. Живёт здесь, а не в
    // мини-игре: забег стартует до того, как экран боя вообще открыт.
    //
    // Считает wrathStats, а не своя сумма рядом. Своя здесь и была — те же
    // три слагаемых, выписанные второй раз, — и это ровно тот случай, когда
    // два места однажды разойдутся: правка в одном (скажем, новое поле
    // предмета) молча не доедет до другого, и максимум в шапке разойдётся с
    // максимумом в бою.
    fighterMaxHp() {
        return this.wrathStats(GameState.data.equipment || {},
                               GameState.data.upgrades || {}).hp;
    },

    // ---------- БОЕВАЯ ПРОКАЧКА ----------
    // Купить следующий уровень ветки. Как и с предметами: клиент говорит
    // «качни вот это», а хватает ли валюты и не упёрлись ли в потолок,
    // решает эта сторона.
    buyUpgrade(key, sin) {
        const sinKey = sin || 'wrath';
        const conf = ECONOMY.minigames[sinKey] && ECONOMY.minigames[sinKey].upgrades;
        const branch = conf && conf[key];
        if (!branch || !branch.levels) return { ok: false, error: 'unknown_upgrade' };

        const stateKey = this.upgradeKey(sinKey, key);
        const level = GameState.upgradeLevel(stateKey);
        if (level >= branch.levels.length) return { ok: false, error: 'maxed' };

        const price = branch.levels[level].price || {};
        const short = Object.keys(price).find(cur => GameState.currency(cur) < price[cur]);
        if (short) return { ok: false, error: 'not_enough', currency: short };

        const requestId = newRequestId();
        Object.keys(price).forEach(cur => {
            GameState.addCurrency(cur, -price[cur]);
            GameState.pushLedger({
                currency: cur,
                delta: -price[cur],
                reason: 'upgrade.' + sinKey + '.' + key + '.' + (level + 1),
                client_request_id: requestId
            });
        });

        // Ступень, которая меняет СКОРОСТЬ шкалы (у похоти — мыло), сперва
        // фиксирует шкалу на сейчас. Значение считается формулой от метки
        // времени, и новая скорость, применённая к старой метке, пересчитала
        // бы задним числом всё прошедшее время: шкала прыгнула бы вверх в
        // момент покупки.
        const sinConf = ECONOMY.sins[sinKey] || {};
        if (sinConf.drainUpgrade === key) GameState.setSinValue(sinKey, GameState.sinValue(sinKey));

        GameState.data.upgrades[stateKey] = level + 1;
        GameState.save();
        return { ok: true, key, sin: sinKey, level: level + 1,
                 value: this.upgradeValue(sinKey, key) };
    },

    // Ключ прокачки в состоянии. У гнева он БЕЗ приставки, и это не
    // вкусовщина: на сейвах игроков уже лежат damage/hp/regen, а инвариант 5
    // запрещает ронять накопленное ради красоты формата. Все остальные грехи
    // пишутся с приставкой, чтобы одинаковые имена веток в разных грехах не
    // сложились в одну.
    upgradeKey(sinKey, key) {
        return sinKey === 'wrath' ? key : sinKey + '_' + key;
    },

    // ЗНАЧЕНИЕ ветки на текущем уровне, а не прибавка. У гнева прокачка
    // прибавляет к базе (+2 здоровья), у тщеславия — ЗАМЕНЯЕТ число
    // (интервал 1000 → 850 мс): «прибавка −150 мс» читалась бы как ошибка
    // знака. Поэтому base лежит в самой ветке, а levels[].bonus — это
    // готовое значение уровня.
    upgradeValue(sinKey, key) {
        const conf = ECONOMY.minigames[sinKey] && ECONOMY.minigames[sinKey].upgrades;
        const branch = conf && conf[key];
        if (!branch) return 0;
        const level = GameState.upgradeLevel(this.upgradeKey(sinKey, key));
        if (level <= 0) return branch.base;
        const step = branch.levels[Math.min(level, branch.levels.length) - 1];
        return step ? step.bonus : branch.base;
    },
});
