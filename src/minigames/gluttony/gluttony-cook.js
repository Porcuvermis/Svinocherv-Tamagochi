// ================= ЧРЕВОУГОДИЕ: ГОТОВКА =================
// Холодильник, доска, нарезка, плита, помешивание.
// Продолжение GluttonyMinigame (gluttony.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после gluttony.js.
Object.assign(GluttonyMinigame, {

    // ================= ХОЛОДИЛЬНИК =================
    openFridge() {
        // Доска со стола уходит В РУКИ: набор на столе гаснет, иначе она
        // лежит на столе и одновременно едет к игроку.
        this.setOpacity('kt-table-set', 0);
        this.showPhone(false);
        this.phase = 'fridge';
        this.setCamera('fridge');
        this.el('kt-fridge').classList.add('open');
        // Доска въезжает снизу-справа ПОСЛЕ открытия: сначала игрок видит,
        // что холодильник открылся, и только потом — куда класть.
        setTimeout(() => {
            this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.fridge);
        }, 260);
        setTimeout(() => this.fillShelves(), 220);
        this.touched();
    },

    // Закрыть можно тапом по открытой дверце — так же, как открывали.
    closeFridge() {
        this.el('kt-fridge').classList.remove('open');
        this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.hidden);
        Array.from(this.el('kt-loose').children).forEach(n => {
            if (n.dataset.where === 'fridge') n.remove();
        });
        // Всё, что успели положить, возвращается: игрок закрыл холодильник,
        // значит передумал готовить, а не потерял продукты.
        this.el('kt-board-items').innerHTML = '';
        this.onBoard = [];
        // Доска возвращается на стол: передумали — значит и не брали.
        this.setOpacity('kt-table-set', 1);
        this.showPhone(true);
        this.phase = 'overview';
        this.setCamera('overview');
        this.touched();
    },

    fillShelves() {
        const loose = this.el('kt-loose');
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const S = KITCHEN_ART.SLOTS;

        // Сначала собираем, ЧТО вообще есть, и только потом раскладываем.
        // Раскладка знает число продуктов на полке заранее — иначе она не
        // может ни расставить их по всей полке, ни ужать, когда их много.
        const shelves = { meat: [], veg: [], spice: [] };
        const frozen = [];
        Object.keys(KITCHEN.ingredients).forEach(key => {
            const item = KITCHEN.ingredients[key];
            if (!item.infinite && !((pantry[key] || 0) > 0)) return;
            (item.frozen ? frozen : (shelves[item.type] || [])).push(key);
        });

        const put = (key, spot, scale) => {
            const g = this.spawnItem(key, spot, scale, loose);
            g.dataset.home = JSON.stringify(spot);
            g.dataset.where = 'fridge';
            g.dataset.type = KITCHEN.ingredients[key].type;
            this.countFor(g, key);
        };

        // Полка своя у каждого типа: мясо сверху, овощи в середине, зелень
        // внизу. Устройство холодильника читается с одного взгляда.
        Object.keys(shelves).forEach(type => {
            const keys = shelves[type];
            if (!keys.length) return;
            const L = S.shelf;
            const step = keys.length < 2
                ? 0
                : Math.min(L.gap, (L.x1 - L.x0) / (keys.length - 1));
            // Тесно — продукты мельчают, а не наползают. Наползающие
            // невозможно ни разглядеть, ни взять по отдельности.
            const scale = 0.52 * Math.min(1, step ? step / L.tight : 1);
            const startX = L.cx - step * (keys.length - 1) / 2;
            keys.forEach((key, i) => {
                const x = Math.round(startX + step * i);
                // Высота берётся у ЛИНИИ полки, а не у одного числа: полка
                // уходит в точку схода, и продукты идут по ней.
                put(key, { x, y: Math.round(KITCHEN_ART.shelfLineY(type, x)) }, scale);
            });
        });

        frozen.forEach(key => put(key, S.freezer, 0.52));
    },

    // Цифра рядом с продуктом — это ОСТАТОК В КЛАДОВОЙ. У пищеблока остатка
    // нет: он бесконечный, на то и страховка от тупика. Раньше на нём
    // появлялся «0» — ровно противоположное тому, что есть на самом деле, —
    // и не исчезал даже когда пищеблок возвращали в морозилку.
    countFor(g, key) {
        if (KITCHEN.ingredients[key] && KITCHEN.ingredients[key].infinite) {
            const old = g.querySelector('.kt-count');
            if (old) old.remove();
            return;
        }
        const pantry = (GameState.data && GameState.data.pantry) || {};
        this.setCount(g, Math.max(0, pantry[key] || 0));
    },

    setCount(g, n) {
        let label = g.querySelector('.kt-count');
        if (!label) {
            label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('class', 'kt-count');
            label.setAttribute('x', '0');
            label.setAttribute('y', String(KITCHEN_ART.COUNT_DY));
            g.appendChild(label);
        }
        label.textContent = n;
    },

    spawnItem(key, spot, scale, host) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'kt-item');
        g.dataset.key = key;
        g.dataset.seed = String(Math.floor(Math.random() * 1e6));
        g.innerHTML = KITCHEN_ART.ingredient(key, +g.dataset.seed);
        this.moveTo(g, spot, 0, scale || 1);
        g.dataset.scale = String(scale || 1);
        (host || this.el('kt-loose')).appendChild(g);
        return g;
    },

    // ================= ДОСКА =================
    // Что уже лежит: по одному продукту каждого типа. Пищеблок — сам по себе
    // и ни с чем не сочетается: он и есть «еды нет», а не ингредиент.
    canPutOnBoard(key) {
        const type = KITCHEN.ingredients[key].type;
        if (this.onBoard.some(o => o.type === 'block')) return false;
        if (type === 'block') return this.onBoard.length === 0;
        return !this.onBoard.some(o => o.type === type);
    },

    putOnBoard(key, ghostNode) {
        const F = KITCHEN_ART.FG;
        const slot = F.slots[this.onBoard.length] || F.slots[0];
        const g = this.spawnItem(key, slot, 0.62, this.el('kt-board-items'));
        g.dataset.where = 'board';
        g.dataset.type = KITCHEN.ingredients[key].type;
        this.onBoard.push({ key, type: g.dataset.type, el: g, ghost: ghostNode });
        // На полке остаётся силуэт: видно, ЧТО взяли и что это можно вернуть.
        if (ghostNode) {
            ghostNode.dataset.where = 'ghost';
            ghostNode.innerHTML = KITCHEN_ART.ghost(key, +ghostNode.dataset.seed);
            if (KITCHEN.ingredients[key].infinite) {
                this.countFor(ghostNode, key);
            } else {
                const pantry = (GameState.data && GameState.data.pantry) || {};
                this.setCount(ghostNode, Math.max(0, (pantry[key] || 0) - 1));
            }
        }
        this.touched();
        return g;
    },

    // Передумал — тащим обратно, силуэт снова становится продуктом.
    takeOffBoard(entry) {
        const i = this.onBoard.indexOf(entry);
        if (i !== -1) this.onBoard.splice(i, 1);
        entry.el.remove();
        if (entry.ghost) {
            entry.ghost.dataset.where = 'fridge';
            entry.ghost.innerHTML = KITCHEN_ART.ingredient(entry.key, +entry.ghost.dataset.seed);
            this.countFor(entry.ghost, entry.key);
        }
        // Остальные подвигаются в свои гнёзда: дырки в ряду читаются потерей.
        this.onBoard.forEach((o, n) => this.moveTo(o.el, KITCHEN_ART.FG.slots[n], 0, 0.62));
        this.touched();
    },

    // ================= НАРЕЗКА =================
    goToChop() {
        this.phase = 'chop';
        this.el('kt-fridge').classList.remove('open');
        Array.from(this.el('kt-loose').children).forEach(n => n.remove());
        // Доска уезжает вниз, камера переезжает к столу, и та же доска
        // въезжает уже там: движение непрерывно, сцена не «прыгает».
        this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.hidden);
        this.setCamera('chop');
        setTimeout(() => {
            this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.chop);
            this.el('kt-knife').classList.remove('kt-done');
            this.el('kt-knife').removeAttribute('pointer-events');
            this.setOpacity('kt-knife', 1);
            this.moveTo(this.el('kt-knife'), KITCHEN_ART.FG.knife);
            this.setKnifeAngle(this.KNIFE_UP);
            this.touched();
        }, 520);
    },

    // Спрятать нож совсем. Класс .kt-done снимается обязательно: у него в
    // стилях своя прозрачность, и она перебивает атрибут opacity — из-за
    // этого отработавший нож оставался висеть призраком поверх плиты.
    hideKnife() {
        const knife = this.el('kt-knife');
        knife.classList.remove('kt-done');
        knife.removeAttribute('pointer-events');
        this.setOpacity('kt-knife', 0);
    },

    setKnifeAngle(a) {
        this.knifeAngle = Math.max(this.KNIFE_DOWN, Math.min(this.KNIFE_UP, a));
        const arm = this.el('kt-knife-arm');
        if (arm) arm.setAttribute('transform', `rotate(${this.knifeAngle.toFixed(1)})`);
    },

    // Один надрез = полный размах: поднять нож доверху и опустить донизу.
    // Одного движения вниз мало — иначе можно было бы «дрожать» у доски и
    // нарезать всё за секунду.
    knifeStep(angle) {
        this.setKnifeAngle(angle);
        // Пороги — доли размаха, а не абсолютные градусы: подвинули KNIFE_UP
        // или KNIFE_DOWN — взвод и рез уехали следом, а не разошлись с ними.
        const span = this.KNIFE_UP - this.KNIFE_DOWN;
        if (this.knifeAngle >= this.KNIFE_UP - span * 0.18) { this.knifeArmed = true; return; }
        if (this.knifeAngle <= this.KNIFE_DOWN + span * 0.14 && this.knifeArmed) {
            this.knifeArmed = false;
            this.chopOnce();
        }
    },

    chopOnce() {
        if (this.chops >= this.CHOPS_TOTAL) return;
        this.chops++;
        this.el('kt-board').classList.remove('kt-cut');
        void this.el('kt-board').getBoundingClientRect();
        this.el('kt-board').classList.add('kt-cut');

        // Половина взмахов — крупные куски, вторая половина — мелкие.
        const stage = this.chops >= this.CHOPS_TOTAL ? 2
            : (this.chops >= this.CHOPS_TOTAL / 2 ? 1 : 0);
        if (stage > 0) this.renderChopped(stage);
        if (this.chops >= this.CHOPS_TOTAL) this.parkKnife();
    },

    // Нож отработал: сам ложится на стол рядом с доской. Пока он едет, ввод
    // отобран — иначе игрок продолжает возить пальцем по уже нарезанному и не
    // понимает, кончился этап или нет.
    parkKnife() {
        const knife = this.el('kt-knife');
        this.locked = true;
        this.drag = null;
        knife.classList.add('kt-done');
        knife.setAttribute('pointer-events', 'none');
        this.setKnifeAngle(this.KNIFE_UP);
        this.moveTo(knife, KITCHEN_ART.FG.knifeRest, 0);
        setTimeout(() => {
            // Нож ложится плашмя: он больше не инструмент, а предмет на столе.
            this.el('kt-knife-arm').setAttribute('transform', 'rotate(8)');
            this.locked = false;
            this.touched();
        }, 520);
    },

    // Все ингредиенты режутся ВМЕСТЕ и в одну кучу: цвет кусков берётся из
    // типов, которые лежат на доске, поэтому по куче видно состав блюда.
    renderChopped(stage) {
        const items = this.el('kt-board-items');
        const keys = this.onBoard.map(o => o.key);
        items.innerHTML = '';
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'kt-item');
        g.dataset.where = 'chopped';
        g.innerHTML = KITCHEN_ART.chopped(keys, stage, 17);
        this.moveTo(g, { x: 0, y: -4 }, 0, 0.7);
        g.dataset.scale = '0.7';
        items.appendChild(g);
    },

    // ================= ПЛИТА =================
    goToStove() {
        this.phase = 'stove';
        // Доска уходит вверх и встаёт на столешницу слева от плиты — там же,
        // где игрок её и оставил бы.
        this.moveTo(this.el('kt-board'), KITCHEN_ART.FG.board.away);
        // Нож остаётся в переднем плане и камере не подчиняется, поэтому его
        // надо убрать руками: иначе он висит поперёк плиты весь остаток игры.
        this.hideKnife();
        this.setCamera('stove');
        this.setOpacity('kt-flame', 1);
        setTimeout(() => {
            this.setOpacity('kt-board-rest', 1);
            this.spawnPiles();
            this.touched();
        }, 420);
    },

    // Нарезанное перекладывается с доски на столешницу отдельными кучками:
    // их и будут кидать в кастрюлю по одной.
    spawnPiles() {
        const S = KITCHEN_ART.SLOTS;
        this.el('kt-board-items').innerHTML = '';
        this.piles = this.onBoard.map((o, i) => {
            // Гнёзда спрашиваем у картинки: они лежат вдоль доски, которая
            // нарисована в перспективе. Считать их здесь «шагом вправо»
            // значит уронить левую кучку мимо доски.
            const spot = S.piles[i] || S.piles[S.piles.length - 1];
            const g = this.spawnItem(o.key, spot, S.pileScale, this.el('kt-loose'));
            g.innerHTML = KITCHEN_ART.chopped([o.key], 2, 31 + i);
            g.dataset.where = 'pile';
            return { key: o.key, el: g };
        });
    },

    buildBottles() {
        const host = this.el('kt-bottles');
        if (!host) return;
        host.innerHTML = '';
        const pantry = (GameState.data && GameState.data.pantry) || {};
        const spots = KITCHEN_ART.SLOTS.bottles;
        let i = 0;
        Object.keys(KITCHEN.liquids).forEach(key => {
            if (KITCHEN.liquids[key].tap) return;   // вода — это кран, не бутыль
            const spot = spots[i] || spots[0];
            const empty = !(pantry[key] > 0);
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'kt-bottle');
            g.dataset.key = key;
            g.innerHTML = KITCHEN_ART.bottle(key, empty);
            if (empty) g.dataset.empty = '1';
            g.dataset.home = JSON.stringify(spot);
            g.dataset.scale = String(spot.s);
            this.moveTo(g, spot, 0, spot.s);
            host.appendChild(g);
            i++;
        });
    },

    // Зона кастрюли нарочно ВЫШЕ неё: жидкость держат НАД кастрюлей и льют,
    // а не вставляют внутрь. Так это и делают руками.
    overPot(p) {
        const z = KITCHEN_ART.SLOTS.potZone;
        return p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h;
    },

    // Пока сосуд держат над кастрюлей — течёт струя и уровень растёт. Не
    // «отпустил и появилось»: наливание должно занимать время и быть видно.
    // Струя — тот же движок, что на кормёжке, только в координатах СЦЕНЫ и
    // шариками покрупнее: единицы сцены мельче экранных.
    startPour(key, from) {
        if (this.liquid) return;
        this.pouring = { key, from };
        this.setAttr('kt-pot-fill', { fill: KITCHEN_ART.liquid(key)[500] });
        this.streamColor(this.potStream, key);
        this.pourLastTick = null;
        if (!this.pourRafId) this.pourRafId = requestAnimationFrame(t => this.pourTick(t));
    },

    // Один цикл на уровень и на струю. Крутится, пока льют ИЛИ пока в воздухе
    // остаются шарики: убрали бутыль — струя не исчезает, а долетает.
    pourTick(now) {
        if (!this.pourLastTick) this.pourLastTick = now;
        const dt = Math.min(0.05, (now - this.pourLastTick) / 1000);
        this.pourLastTick = now;

        if (this.pouring) {
            this.pourLevel = Math.min(this.POUR_FULL,
                (this.pourLevel || 0) + this.POUR_RATE_PER_SEC * dt);
            this.updatePotLevel();
            if (this.pourLevel >= this.POUR_FULL && !this.liquid) {
                this.liquid = this.pouring.key;
                this.setOpacity('kt-steam', 1);
                this.finishPour();
            }
        }

        const live = this.streamTick(this.potStream, dt,
                                     this.pouring ? this.pourSource() : null,
                                     KITCHEN_ART.SLOTS.potMouth);
        if (this.pouring || live > 0) {
            this.pourRafId = requestAnimationFrame(t => this.pourTick(t));
        } else {
            this.pourRafId = null;
            this.pourLastTick = null;
        }
    },

    // Откуда именно бьёт струя. У крана это выход лейки, у бутыли — её
    // горлышко, а горлышко ездит вместе с наклоном: бутыль над кастрюлей
    // ОПРОКИДЫВАЮТ, а не держат стоймя, иначе жидкость идёт из закрытой
    // пробки.
    pourSource() {
        if (!this.pouring) return null;
        const p = this.pouring.from;
        if (this.pouring.kind === 'hose') {
            // Лейка: выход под ней, льёт строго вниз. Смещение выхода от
            // точки захвата растёт вместе с увеличением лейки в руке.
            const H = this.hose();
            return {
                x: p.x + (H.out.x - H.pivot.x) * H.zoom,
                y: p.y + (H.out.y - H.pivot.y) * H.zoom,
                dx: 0, dy: 1
            };
        }
        const a = this.POUR_TILT * Math.PI / 180;
        const sc = this.pouring.scale || 0.6;
        const sin = Math.sin(a), cos = Math.cos(a);
        return {
            x: p.x + KITCHEN_ART.BOTTLE_NECK * sin * sc,
            y: p.y - KITCHEN_ART.BOTTLE_NECK * cos * sc,
            dx: sin,
            dy: -cos
        };
    },

    updatePour(from, kind, scale) {
        if (!this.pouring) return;
        this.pouring.from = from;
        this.pouring.kind = kind;
        this.pouring.scale = scale;
    },

    stopPour() {
        this.pouring = null;
    },

    // Кастрюля налита — дальше лить некуда, и держать сосуд незачем. Игра
    // забирает его сама: струя иссякает, сосуд возвращается на место, а
    // управление на это время отбирается. Иначе игрок стоит и льёт в полную
    // кастрюлю, а картинка делает вид, что что-то происходит.
    finishPour() {
        const d = this.drag;
        this.stopPour();
        this.drag = null;
        this.locked = true;
        if (d) this.returnVessel(d);
        setTimeout(() => { this.locked = false; this.touched(); }, 520);
    },

    // Сосуд на своё место: бутыль — в свой угол столешницы и пустой, лейка —
    // обратно в кран. Одна дорога и для отпускания пальцем, и для
    // автоматического конца налива.
    returnVessel(d) {
        if (!d || !d.node) return;
        d.node.classList.remove('kt-dragging');
        if (d.kind === 'hose') {
            // Головка возвращается в излив, шланг втягивается за ней.
            const H = this.hose();
            this.el('kt-nozzle').setAttribute('transform', '');
            this.el('kt-hose-line').setAttribute('d',
                `M${H.anchor.x} ${H.anchor.y} V${H.anchor.y + 8}`);
            return;
        }
        if (d.kind === 'bottle') {
            if (this.liquid === d.node.dataset.key) d.node.dataset.empty = '1';
            this.moveTo(d.node, d.home, 0, d.scale);
        }
    },

    updatePotLevel() {
        const fill = this.el('kt-pot-fill');
        if (!fill) return;
        const F = KITCHEN_ART.POT_FILL;
        const h = Math.min(F.max, ((this.pourLevel || 0) + this.inPot.length * 22) * F.max / 140);
        fill.setAttribute('height', h.toFixed(1));
        fill.setAttribute('y', (F.bottom - h).toFixed(1));
    },

    dropInPot(entry) {
        const i = this.piles.indexOf(entry);
        if (i !== -1) this.piles.splice(i, 1);
        this.inPot.push(entry.key);
        entry.el.dataset.where = 'pot';
        this.moveTo(entry.el, KITCHEN_ART.SLOTS.pot, 0, 0.3);
        entry.el.style.opacity = '0';
        setTimeout(() => entry.el.remove(), 420);
        this.updatePotLevel();
        this.touched();

        if (!this.piles.length && this.liquid) setTimeout(() => this.goToPotZoom(), 500);
    },

    // ================= ПОМЕШИВАНИЕ =================
    // Отдельный наезд на кастрюлю: мешать вслепую сбоку экрана неудобно, и
    // движение ложки должно быть видно целиком.
    goToPotZoom() {
        this.phase = 'potzoom';
        this.setCamera('pot');
        setTimeout(() => {
            this.setOpacity('kt-spoon', 1);
            this.moveTo(this.el('kt-spoon'), KITCHEN_ART.SLOTS.spoon);
            this.touched();
        }, 420);
    },

    // Мешают СЛЕВА НАПРАВО: это движение по кругу в кастрюле, а не рубка.
    stirStep(dx) {
        const spoon = this.el('kt-spoon-body');
        if (spoon) spoon.setAttribute('transform', `rotate(${(dx > 0 ? 20 : -20)})`);
        this.stirSwings++;
        if (this.stirSwings < this.STIR_SWINGS) return;
        this.setOpacity('kt-spoon', 0);
        this.touched();
    },
});
