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

    // Минимальный размер мишени. Хвост у взрослого червя тонкий, и зона по
    // его габаритам была бы меньше пальца.
    MIN_TOUCH: 46,

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
    resultLine: null,

    fighters: null,     // { player, enemy }
    playerHP: 0,
    enemyHP: 0,
    chosenDefense: null,
    chosenAttack: null,
    isFighting: false,
    fightOver: false,
    lastHitZone: null,  // куда прилетело игроку — по ней садится шрам
    endFightTimeoutId: null,
    healClock: null,
    mode: 'duel',

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
        this.resultLine = document.getElementById('wrath-result');
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
        const again = document.getElementById('wrath-again-btn');
        const toLobby = document.getElementById('wrath-lobby-btn');
        if (again) again.onclick = (e) => { e.stopPropagation(); this.restartFight(); };
        if (toLobby) toLobby.onclick = (e) => { e.stopPropagation(); this.host.showLobby(); };

        window.addEventListener('resize', () => {
            if (this.host && this.host.current === 'duel') this.layoutFighters();
        });
    },

    // ---------- ЖИЗНЕННЫЙ ЦИКЛ ЭКРАНА ----------
    enter(mode) {
        this.mode = mode || 'duel';
        this.fighters = { player: WrathFighter.forPlayer(), enemy: null };
        this.setName('player', this.fighters.player.name);
        this.setName('enemy', '…');

        this.mountFighter('player', this.fighters.player.model, false);

        // Противник приходит через переходник: сегодня это копия игрока,
        // завтра — слепок другого игрока с сервера. Вызывающий код одинаков.
        Backend.getOpponent(this.mode).then(answer => {
            if (!this.host || this.host.current !== 'duel') return;
            this.fighters.enemy = WrathFighter.fromSnapshot(answer && answer.opponent);
            this.setName('enemy', this.fighters.enemy.name);
            this.mountFighter('enemy', this.fighters.enemy.model, true);
            this.restartFight();
        });
    },

    leave() {
        this.stopFightTimer();
        this.stopHealWatch();
        ['player', 'enemy'].forEach(side => {
            if (this.handles[side]) {
                this.handles[side].destroy();
                this.handles[side] = null;
            }
        });
        if (this.resultOverlay) this.resultOverlay.classList.remove('active');
        this.fightOver = false;
        this.isFighting = false;
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
        const scale = WrathFighter.fitWorm(handle, stage, box, 0.82);
        this.layoutZones(side, scale);
    },

    // Зоны живут ВНУТРИ той же масштабируемой сцены, что и червь, — иначе
    // пришлось бы пересчитывать их координаты на каждый масштаб. Размер
    // мишени берётся от габаритов самой части, но не меньше пальца.
    layoutZones(side, scale) {
        const handle = this.handles[side];
        if (!handle) return;

        Object.keys(this.ZONE_PARTS).forEach(zone => {
            const el = this.zones[side][zone];
            if (!el) return;
            const partEl = handle.svgRoot.querySelector(`[data-part="${this.ZONE_PARTS[zone]}"]`);
            const part = WrathFighter.boxOf(handle, partEl);
            if (!part) return;

            // Палец не уменьшается вместе с червём, поэтому минимальный
            // размер задан в экранных единицах и делится на масштаб сцены.
            const minSize = this.MIN_TOUCH / Math.max(0.2, scale);
            const w = Math.max(minSize, part.w);
            const h = Math.max(minSize, part.h);

            el.style.left = `${part.cx.toFixed(1)}px`;
            el.style.top = `${part.cy.toFixed(1)}px`;
            el.style.width = `${w.toFixed(1)}px`;
            el.style.height = `${h.toFixed(1)}px`;
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

    // ---------- ВЫБОР ----------
    selectDefense(zone) {
        if (this.fightOver || this.isFighting) return;
        this.chosenDefense = zone;
        this.markSelected('player', zone);
        if (this.daggerDefense) this.daggerDefense.classList.add('filled');
    },

    selectAttack(zone) {
        if (this.fightOver || this.isFighting) return;
        this.chosenAttack = zone;
        this.markSelected('enemy', zone);
        if (this.daggerAttack) this.daggerAttack.classList.add('filled');
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
        this.stopHealWatch();
        if (!this.fighters || !this.fighters.enemy) return;

        // Драться нечем: здоровье зарастает, и пока оно на нуле, бой не
        // начинается. Иначе «Ещё раз» после поражения означало бы мгновенное
        // второе поражение.
        if (GameState.fighterHp(this.fighters.player.stats.hp) <= 0) {
            this.showHealWait();
            return;
        }

        // Игрок входит в бой с тем здоровьем, что у него есть: побитым после
        // прошлой драки или уже заросшим. Противник — слепок, он всегда целый.
        this.playerHP = GameState.fighterHp(this.fighters.player.stats.hp);
        this.enemyHP = this.fighters.enemy.stats.hp;
        this.isFighting = false;
        this.fightOver = false;
        this.lastHitZone = null;
        this.resetSelections();
        this.updateHPBars();
        this.setResult('');
        if (this.awardLine) this.awardLine.textContent = '';

        if (this.resultOverlay) this.resultOverlay.classList.remove('active');
        if (this.daggerBtn) this.daggerBtn.classList.remove('disabled');
    },

    doRound() {
        if (this.isFighting) return;
        this.isFighting = true;

        const player = this.fighters.player;
        const enemy = this.fighters.enemy;
        const playerAttack = this.chosenAttack;
        const playerDefense = this.chosenDefense;
        const enemyAttack = this.randomZone();
        const enemyDefense = this.randomZone();

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
        // посреди драки — остался с тем, с чем свернул.
        Backend.setFighterHp(this.playerHP);

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
        }
    },

    // ---------- ОЖИДАНИЕ ЗАРАСТАНИЯ ----------
    // Не отказ, а ожидание: экран честно говорит, сколько осталось, и кнопка
    // оживает сама. Пересчёт раз в секунду — только показ, само здоровье
    // считается формулой от метки времени.
    showHealWait() {
        this.fightOver = true;
        if (this.overlayText) {
            this.overlayText.textContent = 'ЧЕРВЬ БЕЗ СИЛ';
            this.overlayText.style.color = '#ff9500';
        }
        if (this.resultOverlay) this.resultOverlay.classList.add('active');
        this.startHealWatch();
    },

    startHealWatch() {
        if (this.healClock) return;
        const again = document.getElementById('wrath-again-btn');
        const update = () => {
            const max = this.fighters && this.fighters.player ? this.fighters.player.stats.hp : 0;
            const hp = GameState.fighterHp(max);
            if (hp > 0) {
                this.stopHealWatch();
                if (again) { again.textContent = 'Ещё раз'; again.disabled = false; }
                if (this.awardLine) this.awardLine.textContent = 'червь ожил — можно снова';
                return;
            }
            if (again) {
                again.disabled = true;
                again.textContent = `зарастает: ${GameState.fighterHealSeconds(max)} с`;
            }
        };
        update();
        this.healClock = WrathFighter.startHealClock(update);
    },

    stopHealWatch() {
        if (this.healClock) {
            this.healClock.stop();
            this.healClock = null;
        }
        const again = document.getElementById('wrath-again-btn');
        if (again) { again.disabled = false; again.textContent = 'Ещё раз'; }
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

        let outcome, text, color;
        if (this.playerHP <= 0 && this.enemyHP <= 0) {
            outcome = 'draw'; text = 'НИЧЬЯ'; color = '#ffd700';
        } else if (this.enemyHP <= 0) {
            outcome = 'win'; text = 'ПОБЕДА!'; color = '#4CAF50';
        } else {
            outcome = 'lose'; text = 'ПОРАЖЕНИЕ...'; color = '#ff3b30';
        }

        this.setResult(text);
        if (this.overlayText) {
            this.overlayText.textContent = text;
            this.overlayText.style.color = color;
        }
        if (this.resultOverlay) this.resultOverlay.classList.add('active');

        // Мини-игра сообщает, ЧТО произошло. Сколько это стоит и выпадет ли
        // шрам — решает конфиг наград на стороне Backend. Зона последнего
        // пропущенного удара едет в meta: по ней шрам садится туда, куда били.
        GameEvents.emit('minigame:result', {
            sin: 'wrath',
            mode: 'duel',
            outcome,
            meta: { lastHitZone: this.lastHitZone }
        });
    },

    // ---------- ПОКАЗ ----------
    // Строка «что получено». Осколки, золото и собравшийся жетон — это и есть
    // единственная видимая связь боя с экономикой, без неё непонятно, зачем
    // драться после того, как шкала уже полная.
    showAward(awarded) {
        if (!this.awardLine) return;
        const parts = [];

        Object.keys(awarded.currencies || {}).forEach(key => {
            const delta = awarded.currencies[key];
            if (!delta) return;
            const conf = ECONOMY.currencies[key];
            parts.push(`+${delta} ${conf ? conf.emoji : key}`);
        });

        // Убывающая доходность объясняется прямо здесь, иначе «золота стало
        // меньше» читается как поломка.
        if (awarded.goldShare != null && awarded.goldShare < 1) {
            parts.push(`золота ${Math.round(awarded.goldShare * 100)}% — много побед за сутки`);
        }
        if (awarded.exchanged) {
            const conf = ECONOMY.currencies[awarded.exchanged.into];
            parts.push(`${conf ? conf.emoji : ''} собрался жетон!`);
        }
        if (awarded.mark) parts.push('остался шрам');
        if (awarded.everyN && !awarded.currencies.wrath_shard) {
            const left = awarded.everyN.n - (awarded.everyN.total % awarded.everyN.n);
            parts.push(`осколок через ${left} поражения`);
        }

        this.awardLine.textContent = parts.join(' · ');
    },

    setName(side, name) {
        const el = document.getElementById(`wrath-${side}-name`);
        if (el) el.textContent = name;
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
        popup.textContent = amount > 0 ? `-${amount}` : 'броня!';
        popup.classList.remove('show');
        void popup.offsetWidth;
        popup.classList.add('show');
    },

    setResult(text) {
        if (this.resultLine) this.resultLine.textContent = text;
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
