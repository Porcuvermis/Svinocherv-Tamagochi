// ================= ЧРЕВОУГОДИЕ: ВВОД =================
// Палец на кухне: нажатие, перетаскивание, отпускание — во всех фазах.
// Продолжение GluttonyMinigame (gluttony.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после gluttony.js.
Object.assign(GluttonyMinigame, {

    // ================= ВВОД =================
    // Один обработчик на всю сцену: что взяли, решает предмет под пальцем.
    onDown(e) {
        if (this.phase === 'feed' || this.locked) return;
        this.touched();

        const t = e.target;
        const item = t.closest ? t.closest('g.kt-item') : null;
        const bottle = t.closest ? t.closest('g.kt-bottle') : null;
        const inId = (id) => !!(t.closest && t.closest('#' + id));

        if (this.phase === 'overview') {
            // Телефон проверяется ПЕРВЫМ: на общем виде тап по чему угодно
            // открывает холодильник, и без этой строки телефон нажать
            // нельзя вовсе.
            if (inId('kt-phone')) { this.pop(this.el('kt-phone')); this.openShop(); return; }
            this.pop(this.el('kt-fridge'));
            this.openFridge();
            return;
        }

        if (this.phase === 'fridge') {
            // Продукт БЕРУТ И ТАЩАТ, а не тапают: тап ничего не сообщает о
            // том, куда предмет денется, а перетаскивание показывает это
            // само.
            if (item && item.dataset.where === 'fridge') { this.grabFromShelf(e, item); return; }
            if (item && item.dataset.where === 'board') {
                const entry = this.onBoard.find(o => o.el === item);
                if (entry) { this.grabFromBoard(e, entry); return; }
            }
            // Доску не держат, а ОТОДВИГАЮТ: во всей остальной игре переход
            // между этапами — это перенос доски или кастрюли, и удержание тут
            // выбивалось из ряда. Один жест на все переходы.
            if (inId('kt-board')) { this.startDrag(e, this.el('kt-board'), 'boardaway'); return; }
            // Тап по открытой дверце закрывает холодильник — тем же жестом,
            // которым открывали.
            if (inId('kt-door-main') || inId('kt-door-freezer')) { this.closeFridge(); return; }
            return;
        }

        if (this.phase === 'chop') {
            if (this.chops < this.CHOPS_TOTAL) {
                if (inId('kt-knife') || inId('kt-board')) {
                    e.preventDefault();
                    this.drag = { kind: 'knife', last: this.toStage(e) };
                }
                return;
            }
            if (inId('kt-board')) { this.startDrag(e, this.el('kt-board'), 'boardup'); return; }
            return;
        }

        if (this.phase === 'stove') {
            if (!this.liquid && inId('kt-hose')) { this.startDrag(e, this.el('kt-hose'), 'hose'); return; }
            if (!this.liquid && bottle && !bottle.dataset.empty) { this.pop(bottle); this.startDrag(e, bottle, 'bottle'); return; }
            if (!this.liquid && bottle) { this.shake(bottle); return; }
            if (item && item.dataset.where === 'pile') {
                if (!this.liquid) { this.shake(item); return; }
                this.pop(item);
                this.startDrag(e, item, 'pile');
            }
            return;
        }

        if (this.phase === 'potzoom') {
            if (this.stirSwings < this.STIR_SWINGS) {
                if (inId('kt-spoon') || inId('kt-pot')) {
                    e.preventDefault();
                    this.drag = { kind: 'stir', last: this.toScene(e).x };
                }
                return;
            }
            if (inId('kt-pot')) { this.startDrag(e, this.el('kt-pot'), 'potdown'); return; }
        }
    },

    // Продукт с полки: под пальцем он ПОДРАСТАЕТ, иначе прячется под ним же.
    grabFromShelf(e, node) {
        const key = node.dataset.key;
        if (!this.canPutOnBoard(key)) { this.shake(node); return; }
        const pantry = (GameState.data && GameState.data.pantry) || {};
        if (!KITCHEN.ingredients[key].infinite && !(pantry[key] > 0)) { this.shake(node); return; }
        e.preventDefault();

        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        ghost.setAttribute('class', 'kt-item kt-dragging');
        ghost.dataset.key = key;
        ghost.dataset.seed = node.dataset.seed;
        ghost.innerHTML = KITCHEN_ART.ingredient(key, +node.dataset.seed);
        this.fgEl.appendChild(ghost);
        const grab = +(node.dataset.scale || 0.52) * this.GRAB_ZOOM;
        this.moveTo(ghost, this.toStage(e), 0, grab);
        this.drag = { kind: 'shelf', node: ghost, key, source: node, grab };
    },

    grabFromBoard(e, entry) {
        e.preventDefault();
        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        ghost.setAttribute('class', 'kt-item kt-dragging');
        ghost.dataset.key = entry.key;
        ghost.dataset.seed = entry.el.dataset.seed;
        ghost.innerHTML = KITCHEN_ART.ingredient(entry.key, +entry.el.dataset.seed);
        this.fgEl.appendChild(ghost);
        const grab = +(entry.el.dataset.scale || 0.62) * this.GRAB_ZOOM;
        this.moveTo(ghost, this.toStage(e), 0, grab);
        entry.el.style.opacity = '0';
        this.drag = { kind: 'unboard', node: ghost, entry, grab };
    },

    startDrag(e, node, kind) {
        e.preventDefault();
        node.classList.add('kt-dragging');
        // Переносы предметов (доска, кастрюля) считаются ОТ ТОЧКИ ЗАХВАТА, а
        // не от абсолютного положения пальца: иначе предмет прыгает под палец
        // в момент нажатия, а порог перехода зависит от того, за какой край
        // его взяли. Взяли за левый край доски — тащить надо было через пол
        // экрана, за правый — она уезжала сразу.
        const carry = kind === 'boardup' || kind === 'potdown' || kind === 'boardaway';
        const scale = +(node.dataset.scale || 1);
        this.drag = {
            node, kind,
            home: node.dataset.home ? JSON.parse(node.dataset.home) : null,
            scale,
            // Пока предмет в руке — он крупный. Доска и кастрюля не в счёт:
            // их «несут», а не держат, и они и без того во весь экран.
            grab: carry ? scale : scale * this.GRAB_ZOOM,
            from: carry ? this.toStage(e) : null,
            base: carry ? this.nodePos(node) : null
        };
        if (kind === 'pile' || kind === 'bottle' || kind === 'hose') this.el('kt-pot').classList.add('kt-target');
        // Кастрюлю понесли — ложка убирается сразу. Иначе она остаётся висеть
        // в воздухе там, где была кастрюля, и это видно весь перенос.
        if (kind === 'potdown') this.setOpacity('kt-spoon', 0);
    },

    onMove(e) {
        if (!this.drag) return;
        const d = this.drag;

        if (d.kind === 'knife') {
            // Угол считается ОТ ПРЕДЫДУЩЕГО положения пальца, а не от начала
            // свайпа. С отсчётом от начала появлялся завод: увели палец на
            // 300 px вниз — нож упёрся в доску через 130, а чтобы поднять
            // его обратно, надо было сперва отыграть лишние 170 «вслепую».
            // Именно это и читалось как «свайпы не работают».
            const p = this.toStage(e);
            this.knifeStep(this.knifeAngle - (p.y - d.last.y) * this.KNIFE_SENS);
            d.last = p;
            return;
        }

        if (d.kind === 'stir') {
            const x = this.toScene(e).x;
            const dx = x - d.last;
            if (Math.abs(dx) < 46) return;
            d.last = x;
            this.stirStep(dx);
            return;
        }

        if (d.kind === 'shelf' || d.kind === 'unboard') {
            this.moveTo(d.node, this.toStage(e), 0, d.grab);
            return;
        }

        if (d.kind === 'boardup' || d.kind === 'potdown' || d.kind === 'boardaway') {
            const p = this.toStage(e);
            const dx = p.x - d.from.x, dy = p.y - d.from.y;
            // Предмет едет ровно настолько, насколько увели палец, и только в
            // ту сторону, куда его несут: доску вправо, доску вверх, кастрюлю
            // вниз. Обратный ход ничего не двигает — переносят, а не возят.
            if (d.kind === 'boardaway') {
                this.moveTo(d.node, { x: d.base.x + Math.max(0, dx), y: d.base.y });
            } else if (d.kind === 'boardup') {
                this.moveTo(d.node, { x: d.base.x, y: d.base.y + Math.min(0, dy) });
            } else {
                // Кастрюля живёт в СЦЕНЕ, а палец меряется в стейдже: делим на
                // масштаб камеры, иначе она отстаёт от пальца во столько же
                // раз, во сколько кухня уменьшена наездом.
                this.moveTo(d.node, { x: d.base.x, y: d.base.y + Math.max(0, dy) / this.camScale() });
            }
            return;
        }

        const p = this.toScene(e);
        if (d.kind === 'hose') {
            // Лейка в руке ПОДРАСТАЕТ — ровно как продукт, взятый с полки:
            // иначе она теряется под пальцем и непонятно, держат её или нет.
            // Масштаб идёт вокруг СВОЕГО центра, а не вокруг нуля сцены:
            // лейка нарисована в абсолютных координатах, и простой scale
            // унёс бы её в другой конец кухни.
            const H = this.hose();
            this.el('kt-nozzle').setAttribute('transform',
                `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) ` +
                `scale(${H.zoom}) translate(${-H.pivot.x} ${-H.pivot.y})`);
            // Шланг ПРОВИСАЕТ, и провис большой: точка изгиба уходит на 130
            // ниже конца. Слабый провис давал ровную нитку через всю кухню —
            // читалось бельевой верёвкой, а не шлангом. Провисая, шланг
            // ложится на столешницу и уходит ЗА бутыли (они нарисованы
            // позже), то есть ведёт себя как настоящий.
            const A = H.anchor;
            this.el('kt-hose-line').setAttribute('d',
                `M${A.x} ${A.y} Q${(A.x + (p.x - A.x) * 0.35).toFixed(1)} ` +
                `${(Math.max(A.y, p.y) + 130).toFixed(1)} ` +
                `${p.x.toFixed(1)} ${(p.y - 30).toFixed(1)}`);
        } else {
            // Бутыль над кастрюлей опрокидывается: держать её стоймя и при
            // этом лить — значит лить из закрытой пробки.
            const tip = (d.kind === 'bottle' && this.pouring) ? this.POUR_TILT : 0;
            this.moveTo(d.node, p, tip, d.grab);
        }

        // Держат над кастрюлей — льётся. Отвели — перестало.
        if (d.kind === 'hose' || d.kind === 'bottle') {
            const key = d.kind === 'hose' ? 'water' : d.node.dataset.key;
            if (this.overPot(p)) {
                if (!this.pouring) this.startPour(key, p);
                this.updatePour(p, d.kind, d.grab);
            } else if (this.pouring) {
                this.stopPour();
            }
        }
    },

    onUp(e) {
        if (!this.drag) return;
        const d = this.drag;
        this.drag = null;
        this.touched();
        this.el('kt-pot').classList.remove('kt-target');
        if (d.node) d.node.classList.remove('kt-dragging');

        if (d.kind === 'knife') { this.knifeArmed = false; return; }
        if (d.kind === 'stir') return;

        if (d.kind === 'shelf') {
            const p = this.toStage(e);
            if (this.overBoard(p)) this.putOnBoard(d.key, d.source);
            d.node.remove();
            return;
        }

        if (d.kind === 'unboard') {
            const p = this.toStage(e);
            if (!this.overBoard(p)) this.takeOffBoard(d.entry);
            else d.entry.el.style.opacity = '';
            d.node.remove();
            return;
        }

        if (d.kind === 'boardaway') {
            // Порог — ПУТЬ ПАЛЬЦА, а не место, куда он пришёл: жест один и
            // тот же, где бы за доску ни взялись.
            if (this.carried(d, e).dx > this.CARRY_MIN) { this.goToChop(); return; }
            this.moveTo(d.node, KITCHEN_ART.FG.board.fridge);
            return;
        }

        if (d.kind === 'boardup') {
            // Утащили доску заметно вверх — значит понесли к плите.
            if (this.carried(d, e).dy < -this.CARRY_MIN) { this.goToStove(); return; }
            this.moveTo(d.node, KITCHEN_ART.FG.board.chop);
            return;
        }

        if (d.kind === 'potdown') {
            if (this.carried(d, e).dy > this.CARRY_MIN) { this.goToFeed(); return; }
            // Не донёс — кастрюля возвращается на плиту, ложка вместе с ней.
            this.moveTo(d.node, { x: 0, y: 0 });
            this.setOpacity('kt-spoon', 1);
            return;
        }

        if (this.pouring) this.stopPour();

        if (d.kind === 'hose' || d.kind === 'bottle') { this.returnVessel(d); return; }

        if (d.kind === 'pile') {
            const p = this.toScene(e);
            const entry = this.piles.find(x => x.el === d.node);
            if (entry && this.overPot(p)) { this.dropInPot(entry); return; }
            const i = this.piles.indexOf(entry);
            const S = KITCHEN_ART.SLOTS;
            this.moveTo(d.node, { x: S.boardRest.x - 40 + Math.max(0, i) * 40, y: S.boardRest.y - 20 }, 0, d.scale);
        }
    },

    overBoard(p) {
        const b = this.nodePos(this.el('kt-board'));
        return Math.abs(p.x - b.x) < 190 && Math.abs(p.y - b.y) < 96;
    },
});
