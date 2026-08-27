// ================= ГНЕВ: БОЙ ОДИН НА ОДИН =================
// Два бойца на общей модели свиночервя. Игрок — со своим телом, шрамами и
// косметикой; противник — слепком от Backend.getOpponent() (пока это копия
// игрока, потом придёт с сервера).
//
// ---------- ЧТО ЗДЕСЬ ПРИНЦИПИАЛЬНО ИНАЧЕ, ЧЕМ БЫЛО ----------
// Раньше бой рисовал червей сам, функцией на 145 строк, и это были другие
// существа: другие пропорции, другой цвет, никакой связи с состоянием игрока.
// Теперь тело одно на всю игру, поэтому:
//
//   • бьют по тому самому червю, которого растят — со шрамами и всем прочим;
//   • зоны ударов стоят не «в процентах от холста», а на РЕАЛЬНЫХ частях тела
//     (getPartPoint). Тело вырастет — зоны переедут сами;
//   • зона удара и зона шрама — одно и то же понятие (WormMarks.ZONES),
//     поэтому шрам за поражение садится ровно туда, куда били.
//
// Механика раунда не менялась: выбрал блок, выбрал удар, тапнул кинжалы.
// Это осознанно оставленная угадайка один из трёх — усиление боя отдельным
// шагом (docs/plan/09-wrath-rework.md, разделы 10 и 11).

const WrathDuel = {

    // Зона боя → часть тела, от которой считается её место и размер.
    // Тело как зона — это живот: он посередине цепочки и крупнее соседей.
    ZONE_PARTS: { head: 'head', body: 'belly', tail: 'tail' },

    // Размер мишени. ОДИН на все три зоны, а не по габаритам части тела:
    // раньше голова была вдвое крупнее хвоста, и попасть по хвосту было
    // объективно труднее — то есть выбор зоны решался не тактикой, а
    // меткостью. Теперь три равные мишени: промахнуться нельзя ни по одной.
    //
    // Число в экранных единицах и делится на масштаб сцены: палец не
    // уменьшается вместе с червём.
    ZONE_TOUCH: 78,

    // Сколько боёв игрок считается новичком и подсветка горит в полный голос,
    // и после скольких она затихает совсем. Между этими числами — средняя
    // громкость. Считается по накопительному счётчику боёв: это про опыт
    // игрока, а не про текущую сессию.
    GUIDE_LOUD_FIGHTS: 5,
    GUIDE_QUIET_FIGHTS: 15,

    // Сколько экран не принимает нажатий после оглашения результата. Палец в
    // этот момент почти всегда уже летит к экрану — добивающий удар только что
    // тапнули, — и без паузы результат смахивается раньше, чем его прочитают.
    OK_DELAY_MS: 1100,

    host: null,
    root: null,
    boxes: null,
    stages: null,
    handles: null,
    zones: null,        // { player: {head:el,…}, enemy: {…} }

    daggerBtn: null,
    daggerDefense: null,
    daggerAttack: null,
    resultOverlay: null,
    overlayText: null,

    fighters: null,     // { player, enemy }
    playerHP: 0,
    enemyHP: 0,
    chosenDefense: null,
    chosenAttack: null,
    isFighting: false,
    fightOver: false,
    lastHitZone: null,  // куда прилетело игроку — по ней садится шрам
    endFightTimeoutId: null,
    okTimeoutId: null,
    okBtn: null,
    mode: 'duel',
    // Заказ на бой от забега: противник узла, здоровье забега и куда
    // сообщить исход. У обычного боя его нет — там всё берётся из состояния.
    order: null,
    outcome: null,
    // Что противник СОБИРАЕТСЯ сделать в этом раунде. Решается ДО того, как
    // игрок выбирает защиту, и до конца раунда не меняется.
    //
    // Раньше бросок был в момент удара, и это было равнозначно — но только
    // пока никто не умеет подглядывать. «Шестое чувство» показывает зону,
    // куда противник точно не ударит, а показать намерение можно лишь тогда,
    // когда оно уже есть. Заодно так честнее: план зафиксирован заранее и не
    // подстраивается под выбор игрока.
    enemyPlan: null,
    safeZone: null,     // зона, по которой в этом раунде удара не будет
    awardPrefix: '',    // что дал узел забега — показывается вместе с наградой

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-duel');
        if (!this.root) return;

        this.boxes = {
            player: document.getElementById('wrath-player-box'),
            enemy: document.getElementById('wrath-enemy-box')
        };
        this.stages = {
            player: document.getElementById('wrath-player-stage'),
            enemy: document.getElementById('wrath-enemy-stage')
        };
        this.handles = { player: null, enemy: null };

        this.daggerBtn = document.getElementById('dagger-btn');
        this.daggerDefense = document.getElementById('dagger-defense');
        this.daggerAttack = document.getElementById('dagger-attack');
        this.resultOverlay = document.getElementById('wrath-result-overlay');
        this.overlayText = document.getElementById('wrath-overlay-text');
        this.awardLine = document.getElementById('wrath-award');

        // Что начислили за бой, приходит ОТВЕТОМ с той стороны: мини-игра
        // сообщила исход, а сколько это стоило — решил конфиг наград. Здесь
        // только показ пришедшего.
        GameEvents.on('minigame:awarded', (awarded) => {
            if (!awarded || awarded.sin !== 'wrath') return;
            this.showAward(awarded);
        });

        this.buildZones();

        if (this.daggerBtn) {
            this.daggerBtn.onclick = (e) => { e.stopPropagation(); this.handleDaggerClick(); };
        }
        this.okBtn = document.getElementById('wrath-ok-btn');
        if (this.okBtn) {
            this.okBtn.onclick = (e) => { e.stopPropagation(); this.finish(); };
        }

        window.addEventListener('resize', () => {
            if (this.host && this.host.current === 'duel') this.layoutFighters();
        });
    },

    // ---------- ЖИЗНЕННЫЙ ЦИКЛ ЭКРАНА ----------
    // order — заказ от забега (docs/plan/10-wrath-rogue.md):
    //   { enemy, hp, maxHp, bonus, onResult(outcome), onClose() }
    // Без него это обычный бой, и всё берётся из состояния, как раньше.
    enter(mode, order) {
        this.mode = mode || 'duel';
        this.order = order || null;
        this.outcome = null;
        this.awardPrefix = '';

        // В бою здоровье не зарастает: оно ресурс этой драки. Размораживает
        // лобби, когда игрок туда вернётся, — в том числе после того, как игру
        // закрыли прямо посреди боя. В забеге замораживать нечего: здоровье
        // лобби стоит на паузе всё время забега, и трогать его здесь значило
        // бы разморозить его посреди дороги.
        if (!this.order) Backend.freezeHeal();

        // В забеге боец собирается от чисел забега, а не от снаряжения:
        // забег изолирован (docs/plan/10-wrath-rogue.md, раздел 8).
        this.fighters = {
            player: this.order
                ? WrathFighter.forRun({ bonus: this.order.bonus, maxHp: this.order.maxHp })
                : WrathFighter.forPlayer(),
            enemy: null
        };


        this.mountFighter('player', this.fighters.player.model, false);

        // Противник приходит через переходник: сегодня это копия игрока,
        // завтра — слепок другого игрока с сервера. Вызывающий код одинаков.
        // Забегу оттуда нужно только тело: числа у его врагов свои.
        Backend.getOpponent(this.mode).then(answer => {
            if (!this.host || this.host.current !== 'duel') return;
            const snapshot = answer && answer.opponent;
            this.fighters.enemy = this.order
                ? WrathFighter.fromEnemy(this.order.enemy, snapshot)
                : WrathFighter.fromSnapshot(snapshot);
            this.mountFighter('enemy', this.fighters.enemy.model, true);
            this.restartFight();
        });
    },

    leave() {
        this.stopFightTimer();
        this.stopResultTimer();
        // Ушли с боя — здоровье снова зарастает. Дублируется в лобби на
        // случай, когда игру закрыли посреди драки и leave() не случился.
        // Во время забега Backend его не разморозит — там здоровье своё.
        Backend.resumeHeal();
        ['player', 'enemy'].forEach(side => {
            if (this.handles[side]) {
                this.handles[side].destroy();
                this.handles[side] = null;
            }
        });
        this.hideResult();
        this.fightOver = false;
        this.isFighting = false;
        this.enemyPlan = null;
        this.safeZone = null;
        this.markSafeZone();
        // Заказ забега снимается последним: до этой строки по нему решалось,
        // размораживать ли здоровье лобби.
        this.order = null;
    },

    mountFighter(side, model, flip) {
        const stage = this.stages[side];
        if (!stage || !model || typeof WormRenderer === 'undefined') return;
        if (this.handles[side]) this.handles[side].destroy();

        this.handles[side] = WormRenderer.mount(stage, model, {
            context: 'wrath-duel',
            room: false,
            wander: false,
            blink: true,
            // Тело замирает в базовой позе. Не ради экономии кадров, а ради
            // зон: пока тело колышется, мишени ездят вместе с ним, и палец
            // попадает не туда, куда целился.
            idleWave: false,
            pose: 'standing',
            flip: !!flip,
            anchorX: 0.5,
            anchorY: 0.4
        });

        // Зоны переезжают в сцену ПОСЛЕ монтирования: mount() очищает
        // контейнер, и зоны, подвешенные заранее, он бы снёс. Зато внутри
        // сцены они масштабируются вместе с червём и не нуждаются в
        // пересчёте координат под каждый масштаб.
        Object.keys(this.ZONE_PARTS).forEach(zone => {
            stage.appendChild(this.zones[side][zone]);
        });

        // Раскладка считается по РЕАЛЬНОМУ силуэту, а он появляется только
        // после первого кадра: сегменты получают transform в tick(), не при
        // сборке (тот же вывод, что в правке 17 для Чревоугодия).
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.layoutFighter(side);
        }));
    },

    // ---------- РАСКЛАДКА ----------
    layoutFighters() {
        this.layoutFighter('player');
        this.layoutFighter('enemy');
    },

    // Вписать бойца в свою половину арены и расставить зоны по его телу.
    //
    // Масштаб считается от ИЗМЕРЕННОГО силуэта, а не от заданного числа:
    // червь растёт (взросление добавляет сегменты), и любая константа здесь
    // однажды перестанет годиться. Меряем — значит переживём.
    layoutFighter(side) {
        const handle = this.handles[side];
        const stage = this.stages[side];
        const box = this.boxes[side];
        if (!handle || !stage || !box) return;
        // Множитель крупнее, чем был: здоровье уехало в свободные углы, и
        // бойцу достался весь его угол целиком.
        const scale = WrathFighter.fitWorm(handle, stage, box, 0.94);
        this.layoutZones(side, scale);
    },

    // Зоны живут ВНУТРИ той же масштабируемой сцены, что и червь, — иначе
    // пришлось бы пересчитывать их координаты на каждый масштаб. Размер
    // мишени берётся от габаритов самой части, но не меньше пальца.
    layoutZones(side, scale) {
        const handle = this.handles[side];
        if (!handle) return;

        // Размер один на все три зоны; от тела берётся только МЕСТО. Тело
        // вырастет — мишени переедут вместе с ним, но останутся равными.
        const size = this.ZONE_TOUCH / Math.max(0.2, scale);

        Object.keys(this.ZONE_PARTS).forEach(zone => {
            const el = this.zones[side][zone];
            if (!el) return;
            const partEl = handle.svgRoot.querySelector(`[data-part="${this.ZONE_PARTS[zone]}"]`);
            const part = WrathFighter.boxOf(handle, partEl);
            if (!part) return;

            el.style.left = `${part.cx.toFixed(1)}px`;
            el.style.top = `${part.cy.toFixed(1)}px`;
            el.style.width = `${size.toFixed(1)}px`;
            el.style.height = `${size.toFixed(1)}px`;
        });
    },

    // Сами элементы зон создаются один раз и переживают перемонтирование
    // бойцов: обработчики на них вешаются здесь и больше не трогаются.
    buildZones() {
        this.zones = { player: {}, enemy: {} };
        ['player', 'enemy'].forEach(side => {
            Object.keys(this.ZONE_PARTS).forEach(zone => {
                const el = document.createElement('div');
                el.className = `zone-hit ${side}-zone`;
                el.dataset.zone = zone;
                el.onclick = (e) => {
                    e.stopPropagation();
                    if (side === 'player') this.selectDefense(zone);
                    else this.selectAttack(zone);
                };
                this.zones[side][zone] = el;
            });
        });
    },

    // ---------- ПОДСКАЗКА ПО ШАГАМ ----------
    // Задача: новичок должен видеть, куда жать, а опытный — не смотреть на
    // мигание всю драку. Решается двумя способами сразу.
    //
    // Первое: подсвечивается ТОЛЬКО та сторона, от которой сейчас ждут ход.
    // Не выбрана защита — дышат зелёные зоны на своём черве; выбрана —
    // гаснут, и начинают дышать красные на противнике; выбрано всё — дышат
    // сами кинжалы. Подсветка ведёт по шагам, а не горит везде разом.
    //
    // Второе: громкость падает с опытом. Первые бои — пульс не
    // останавливается; дальше он делает несколько вдохов и затихает; у
    // бойца с пятнадцатью боями за плечами — два вдоха в начале шага, и
    // всё. Он и так помнит, где зоны.
    guideLevel() {
        const fights = GameState.totalCounter('wrath.duel.fights');
        if (fights < this.GUIDE_LOUD_FIGHTS) return 'guide-loud';
        if (fights < this.GUIDE_QUIET_FIGHTS) return 'guide-mid';
        return 'guide-quiet';
    },

    updateGuide() {
        if (!this.root) return;
        const stage = this.fightOver ? ''
            : (this.chosenDefense === null ? 'await-defense'
            : (this.chosenAttack === null ? 'await-attack' : 'await-strike'));

        this.root.classList.remove('await-defense', 'await-attack', 'await-strike');
        if (stage) this.root.classList.add(stage);
        this.root.classList.toggle('chose-defense', this.chosenDefense !== null);
        this.root.classList.toggle('chose-attack', this.chosenAttack !== null);
    },

    // ---------- ВЫБОР ----------
    selectDefense(zone) {
        if (this.fightOver || this.isFighting) return;
        this.chosenDefense = zone;
        this.markSelected('player', zone);
        if (this.daggerDefense) this.daggerDefense.classList.add('filled');
        this.updateGuide();
    },

    selectAttack(zone) {
        if (this.fightOver || this.isFighting) return;
        this.chosenAttack = zone;
        this.markSelected('enemy', zone);
        if (this.daggerAttack) this.daggerAttack.classList.add('filled');
        this.updateGuide();
    },

    markSelected(side, zone) {
        Object.keys(this.zones[side]).forEach(key => {
            this.zones[side][key].classList.toggle('selected', key === zone);
        });
    },

    resetSelections() {
        this.chosenDefense = null;
        this.chosenAttack = null;
        ['player', 'enemy'].forEach(side => {
            Object.keys(this.zones[side]).forEach(key => {
                this.zones[side][key].classList.remove('selected');
            });
        });
        if (this.daggerDefense) this.daggerDefense.classList.remove('filled');
        if (this.daggerAttack) this.daggerAttack.classList.remove('filled');
        this.updateGuide();
    },

    randomZone() {
        const zones = Object.keys(this.ZONE_PARTS);
        return zones[Math.floor(Math.random() * zones.length)];
    },

    // Тап по кинжалам: чего не выбрал — доберётся случайным, и только когда
    // выбрано всё, идёт раунд. Так же было и раньше.
    handleDaggerClick() {
        if (this.fightOver || this.isFighting || !this.fighters || !this.fighters.enemy) return;
        if (this.chosenDefense === null) { this.selectDefense(this.randomZone()); return; }
        if (this.chosenAttack === null) { this.selectAttack(this.randomZone()); return; }
        this.doRound();
    },

    // ---------- РАУНД ----------
    restartFight() {
        this.stopFightTimer();
        this.hideResult();
        if (!this.fighters || !this.fighters.enemy) return;

        // Драться нечем. В лобби кнопка боя в этот момент заперта, так что
        // сюда можно попасть только окольным путём — возвращаемся туда, где
        // видно, сколько зарастать.
        if (!this.order && GameState.fighterHp(this.fighters.player.stats.hp) <= 0) {
            this.host.showLobby();
            return;
        }

        // Игрок входит в бой с тем здоровьем, что у него есть: побитым после
        // прошлой драки или уже заросшим. В забеге это здоровье забега, оно
        // не зарастает само. Противник всегда целый.
        this.playerHP = this.order
            ? this.order.hp
            : GameState.fighterHp(this.fighters.player.stats.hp);
        this.enemyHP = this.fighters.enemy.stats.hp;
        this.isFighting = false;
        this.fightOver = false;
        this.lastHitZone = null;

        // Счётчик боёв — накопительный: он про опыт игрока, а не про сессию.
        // По нему решается, насколько громко подсказывать (guideLevel).
        if (this.root) {
            GameState.bumpTotal('wrath.duel.fights');
            GameState.save();
            this.root.classList.remove('guide-loud', 'guide-mid', 'guide-quiet');
            this.root.classList.add(this.guideLevel());
        }

        this.resetSelections();
        this.planEnemyRound();
        this.updateHPBars();
        if (this.awardLine) this.awardLine.textContent = '';

        if (this.daggerBtn) this.daggerBtn.classList.remove('disabled');
    },

    // ---------- ПЛАН ПРОТИВНИКА ----------
    // Бросается в начале раунда, а не в момент удара. Пока никто не видит
    // намерений, разницы нет; с «шестым чувством» она принципиальна —
    // показать можно только то, что уже решено.
    planEnemyRound() {
        this.enemyPlan = { attack: this.randomZone(), defense: this.randomZone() };

        // Пассивка помечает ОДНУ из двух зон, по которым удара не будет.
        // Не обе: тогда защита стала бы бесплатной. Одна — и выбор из трёх
        // превращается в выбор из двух (docs/plan/13-passives.md).
        this.safeZone = null;
        if (WrathFighter.hasPassive('sixth_sense', this.mode)) {
            const safe = Object.keys(this.ZONE_PARTS)
                .filter(zone => zone !== this.enemyPlan.attack);
            this.safeZone = safe[Math.floor(Math.random() * safe.length)];
        }
        this.markSafeZone();
    },

    markSafeZone() {
        if (!this.zones) return;
        Object.keys(this.zones.player).forEach(zone => {
            this.zones.player[zone].classList.toggle('safe', zone === this.safeZone);
        });
    },

    doRound() {
        if (this.isFighting) return;
        this.isFighting = true;

        const player = this.fighters.player;
        const enemy = this.fighters.enemy;
        const playerAttack = this.chosenAttack;
        const playerDefense = this.chosenDefense;
        // План уже решён в начале раунда — здесь только исполняется.
        const plan = this.enemyPlan || { attack: this.randomZone(), defense: this.randomZone() };
        const enemyAttack = plan.attack;
        const enemyDefense = plan.defense;

        if (playerAttack !== enemyDefense) {
            const dmg = WrathFighter.rollDamage(player, enemy, playerAttack);
            this.enemyHP = Math.max(0, this.enemyHP - dmg);
            this.showDamage('enemy', dmg);
            this.triggerImpact('enemy', playerAttack, dmg > 0 ? 'hit' : 'block');
        } else {
            this.triggerImpact('enemy', playerAttack, 'block');
        }

        if (enemyAttack !== playerDefense) {
            const dmg = WrathFighter.rollDamage(enemy, player, enemyAttack);
            this.playerHP = Math.max(0, this.playerHP - dmg);
            this.showDamage('player', dmg);
            this.triggerImpact('player', enemyAttack, dmg > 0 ? 'hit' : 'block');
            // Куда прилетело последним — там и появится шрам за поражение.
            if (dmg > 0) this.lastHitZone = enemyAttack;
        } else {
            this.triggerImpact('player', enemyAttack, 'block');
        }

        this.updateHPBars();
        // Здоровье записывается КАЖДЫЙ раунд, а не в конце боя: свернул игру
        // посреди драки — остался с тем, с чем свернул. В забеге пишется
        // здоровье забега, а не лобби: это разные жизни.
        if (this.order) Backend.setRunHp(this.playerHP);
        else Backend.setFighterHp(this.playerHP);

        if (this.enemyHP <= 0 || this.playerHP <= 0) {
            // Id таймера хранится, чтобы уход с экрана мог его отменить:
            // иначе оверлей результата всплывёт уже на другом экране.
            this.endFightTimeoutId = setTimeout(() => {
                this.endFightTimeoutId = null;
                this.endFight();
            }, 700);
        } else {
            this.isFighting = false;
            this.resetSelections();
            // Новый раунд — новый план противника и новая подсказка.
            this.planEnemyRound();
        }
    },

    // ---------- ПОКАЗ РЕЗУЛЬТАТА ----------
    // Бой кончился — экран замирает на секунду с результатом и НИЧЕГО не
    // принимает: оверлей накрывает поле целиком, а кнопки на нём ещё нет.
    // Только потом проявляется «Окей», и уход в лобби становится осознанным
    // действием игрока, а не случайным тапом.
    showResult() {
        if (!this.resultOverlay) return;
        this.stopResultTimer();
        this.resultOverlay.classList.add('active');
        this.resultOverlay.classList.remove('ready');
        if (this.okBtn) this.okBtn.disabled = true;

        this.okTimeoutId = setTimeout(() => {
            this.okTimeoutId = null;
            this.resultOverlay.classList.add('ready');
            if (this.okBtn) this.okBtn.disabled = false;
        }, this.OK_DELAY_MS);
    },

    hideResult() {
        this.stopResultTimer();
        if (this.resultOverlay) this.resultOverlay.classList.remove('active', 'ready');
        if (this.okBtn) this.okBtn.disabled = true;
    },

    stopResultTimer() {
        if (this.okTimeoutId) {
            clearTimeout(this.okTimeoutId);
            this.okTimeoutId = null;
        }
    },

    stopFightTimer() {
        if (this.endFightTimeoutId) {
            clearTimeout(this.endFightTimeoutId);
            this.endFightTimeoutId = null;
        }
    },

    endFight() {
        this.fightOver = true;
        this.isFighting = false;
        if (this.daggerBtn) this.daggerBtn.classList.add('disabled');
        this.updateGuide();

        // Исход — знаком, а не словом (CLAUDE.md, инвариант 9): кубок,
        // череп, рукопожатие. Цвет добавляет громкости, но читается и без
        // него.
        let outcome, sign, color;
        if (this.playerHP <= 0 && this.enemyHP <= 0) {
            outcome = 'draw'; sign = '🤝'; color = '#ffd700';
        } else if (this.enemyHP <= 0) {
            outcome = 'win'; sign = '🏆'; color = '#4CAF50';
        } else {
            outcome = 'lose'; sign = '💀'; color = '#ff3b30';
        }
        this.outcome = outcome;

        if (this.overlayText) {
            this.overlayText.textContent = sign;
            this.overlayText.style.color = color;
        }
        this.showResult();

        // Мини-игра сообщает, ЧТО произошло. Сколько это стоит и выпадет ли
        // шрам — решает конфиг наград на стороне Backend. Зона последнего
        // пропущенного удара едет в meta: по ней шрам садится туда, куда били.
        //
        // Режим едет тот же, в котором дрались: у забега в конфиге наград
        // своя строка, и валюту его бои не дают — за них платит карта.
        GameEvents.emit('minigame:result', {
            sin: 'wrath',
            mode: this.mode,
            outcome,
            meta: { lastHitZone: this.lastHitZone }
        });

        // Узел забега засчитывается ЗДЕСЬ, а не по кнопке «Окей». Здоровье
        // уже записано, и если игру закрыть между концом боя и кнопкой,
        // забег обязан помнить, что бой был.
        if (this.order && this.order.onResult) {
            // Строка забега встаёт ПЕРЕД строкой наград: та придёт следом,
            // ответом на minigame:result, и перепишет поле целиком.
            this.awardPrefix = this.order.onResult(outcome) || '';
            if (this.awardLine) this.awardLine.textContent = this.awardPrefix;
        }
    },

    // Кнопка «Окей»: обычный бой возвращает в лобби, бой забега — на карту.
    finish() {
        if (this.order && this.order.onClose) {
            this.order.onClose(this.outcome);
            return;
        }
        this.host.showLobby();
    },

    // ---------- ПОКАЗ ----------
    // Строка «что получено». Осколки, золото и собравшийся жетон — это и есть
    // единственная видимая связь боя с экономикой, без неё непонятно, зачем
    // драться после того, как шкала уже полная.
    showAward(awarded) {
        if (!this.awardLine) return;
        const parts = [];
        if (this.awardPrefix) parts.push(this.awardPrefix);

        Object.keys(awarded.currencies || {}).forEach(key => {
            const delta = awarded.currencies[key];
            if (!delta) return;
            const conf = ECONOMY.currencies[key];
            parts.push(`+${delta} ${conf ? conf.emoji : key}`);
        });

        // Убывающая доходность показывается долей, а не объясняется словами:
        // монета с процентом рядом с числом золота. Правило игрок выведет за
        // два-три боя (docs/plan/11-no-words.md).
        if (awarded.goldShare != null && awarded.goldShare < 1) {
            parts.push(`🪙 ${Math.round(awarded.goldShare * 100)}%`);
        }
        // Осколки сложились в жетон — показываем сам жетон со стрелкой.
        if (awarded.exchanged) {
            const conf = ECONOMY.currencies[awarded.exchanged.into];
            parts.push(`🩸→${conf ? conf.emoji : ''}`);
        }
        if (awarded.mark) parts.push('🩹');
        // Сколько поражений осталось до осколка: череп с числом и стрелка.
        if (awarded.everyN && !awarded.currencies.wrath_shard) {
            const left = awarded.everyN.n - (awarded.everyN.total % awarded.everyN.n);
            parts.push(`💀 ${left}→🩸`);
        }

        this.awardLine.textContent = parts.join(' · ');
    },


    updateHPBars() {
        ['player', 'enemy'].forEach(side => {
            const bar = document.getElementById(`${side}-hp-bar`);
            if (!bar || !this.fighters || !this.fighters[side]) return;
            const max = this.fighters[side].stats.hp || 1;
            const hp = side === 'player' ? this.playerHP : this.enemyHP;
            bar.style.width = `${Math.max(0, (hp / max) * 100)}%`;
            // Цифрами тоже: со снаряжением максимумы у бойцов разные, и по
            // одной длине полоски не понять, кто сколько ещё держит.
            const num = document.getElementById(`${side}-hp-num`);
            if (num) num.textContent = `${hp}/${max}`;
        });
    },

    showDamage(who, amount) {
        const popup = document.getElementById(`${who}-dmg-popup`);
        if (!popup) return;
        // Ноль урона — это броня, и говорит об этом щит, а не слово.
        popup.textContent = amount > 0 ? `−${amount}` : '🛡';
        popup.classList.remove('show');
        void popup.offsetWidth;
        popup.classList.add('show');
    },

    // ---------- ЭФФЕКТЫ ----------
    triggerImpact(side, zone, type) {
        const zoneEl = this.zones[side] && this.zones[side][zone];
        const stage = this.stages[side];
        if (!zoneEl || !stage) return;

        const x = zoneEl.style.left;
        const y = zoneEl.style.top;

        if (type === 'hit') {
            this.shake(side);
            this.spawnFlash(stage, x, y);
        } else {
            this.spawnShield(stage, x, y, side);
        }
    },

    // Трясётся сцена с червём, а не сами зоны: мишени должны оставаться
    // на месте, иначе следующий тап промахнётся.
    shake(side) {
        const handle = this.handles[side];
        if (!handle) return;
        const root = handle.svgRoot;
        root.classList.remove('hit-shake');
        void root.getBoundingClientRect();
        root.classList.add('hit-shake');
        setTimeout(() => root.classList.remove('hit-shake'), 420);
    },

    spawnFlash(stage, x, y) {
        const flash = document.createElement('div');
        flash.className = 'zone-flash';
        flash.style.left = x;
        flash.style.top = y;
        stage.appendChild(flash);
        setTimeout(() => flash.remove(), 780);

        const rayCount = 8;
        for (let i = 0; i < rayCount; i++) {
            const ray = document.createElement('div');
            ray.className = 'impact-ray';
            ray.style.left = x;
            ray.style.top = y;
            ray.style.setProperty('--ray-rot', `${(360 / rayCount) * i + (Math.random() * 12 - 6)}deg`);
            stage.appendChild(ray);
            setTimeout(() => ray.remove(), 560);
        }
    },

    spawnShield(stage, x, y, side) {
        const shield = document.createElement('div');
        shield.className = 'zone-shield';
        shield.style.left = x;
        shield.style.top = y;
        shield.innerHTML = `<svg viewBox="0 0 64 64" width="100%" height="100%">
            <path d="M32 2 L58 12 L58 30 C58 46 46 58 32 62 C18 58 6 46 6 30 L6 12 Z"
                  fill="rgba(90,210,255,0.4)" stroke="#8fe9ff" stroke-width="4"/>
        </svg>`;
        stage.appendChild(shield);
        setTimeout(() => shield.remove(), 760);

        const ring = document.createElement('div');
        ring.className = 'shield-ring';
        ring.style.left = x;
        ring.style.top = y;
        stage.appendChild(ring);
        setTimeout(() => ring.remove(), 600);

        const dirSign = side === 'player' ? -1 : 1;
        [-16, 0, 16].forEach(angleDeg => {
            const spark = document.createElement('div');
            spark.className = 'deflect-spark';
            spark.style.left = x;
            spark.style.top = y;
            const dist = 95 + Math.random() * 45;
            const angleRad = (angleDeg * Math.PI) / 180;
            spark.style.setProperty('--tx', `${dirSign * dist * Math.cos(angleRad)}px`);
            spark.style.setProperty('--ty', `${dist * Math.sin(angleRad) * 0.6}px`);
            spark.style.setProperty('--rot', `${dirSign * (angleDeg + 90)}deg`);
            stage.appendChild(spark);
            setTimeout(() => spark.remove(), 620);
        });
    }
};

if (typeof window !== 'undefined') {
    window.WrathDuel = WrathDuel;
}
