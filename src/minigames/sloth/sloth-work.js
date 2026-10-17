// ================= ЛЕНЬ: ВВОД И РАБОТА НА ГРЯДКЕ =================
// Палец в саду, ручная работа, действие инструментом, полив.
// Продолжение SlothMinigame (sloth.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после sloth.js.
Object.assign(SlothMinigame, {

    // ---------- ВВОД ----------    // ---------- ВВОД ----------
    onDown(e) {
        if (this.locked) return;
        const t = e.target;

        // ---- стрелки перехода ----
        // Первыми: они лежат поверх всего и перекрывают края соседних
        // грядок, а дело у них своё.
        const arrow = t.closest ? t.closest('.gd-arrow') : null;
        if (arrow && !this.work) {
            e.preventDefault();
            this.step(+arrow.dataset.dir);
            return;
        }

        // ---- открытый мешок ----
        if (this.sackOpen) {
            const cell = t.closest ? t.closest('.gd-sack-cell') : null;
            if (cell) {
                e.preventDefault();
                const key = cell.dataset.key;
                // Пустая ячейка не тянется: семечки этого вида нет, и рука
                // должна это чувствовать, а не узнавать после броска. Купить
                // её можно в магазине — мешок только выдаёт.
                if (cell.dataset.state !== 'have') { this.refuseSack(cell); return; }
                this.closeSack();
                this.startDrag(e, 'seed', key, GARDEN_ART.seedItem(key));
                return;
            }
            // Нажатие мимо мешка — закрыть. Крестика у него нет и не будет:
            // это мешок, а не окно.
            this.closeSack();
            return;
        }

        const tool = t.closest ? t.closest('.gd-tool') : null;
        // ---- мешок на полке: открывается ТАПОМ ----
        // Было удержание — и это оказалось неверно: удержанием в саду больше
        // ничего не делается, и единственный предмет с особым правилом
        // ощущается сломанным, а не особенным. Жест должен быть тем же, каким
        // игрок трогает всё остальное.
        if (tool && tool.dataset.kind === 'sack' && !this.work) {
            e.preventDefault();
            this.openSack();
            return;
        }

        // ---- магазин ----
        // Корзину нельзя взять в руку: это не инструмент, а дверь.
        if (tool && tool.dataset.kind === 'shop' && !this.work) {
            e.preventDefault();
            if (typeof SlothShop !== 'undefined') SlothShop.show();
            return;
        }

        if (tool && !this.work) {
            e.preventDefault();
            this.startDrag(e, tool.dataset.kind, tool.dataset.key, tool.innerHTML);
            return;
        }

        const bed = t.closest ? t.closest('.gd-bed') : null;
        const bedIdx = bed ? +bed.dataset.bed : -1;

        // Идёт ручная работа — палец продолжает её. Нажатие мимо этой грядки
        // работу отменяет: иначе из неё нет выхода, кроме как доделать.
        if (this.work) {
            if (bedIdx === this.work.i || this.workZone(e)) { this.strokeStart(e); return; }
            this.cancelWork();
            return;
        }

        // Что делают РУКАМИ: разбирают завал на новой грядке и срывают спелый
        // плод. Инструмента для этого нет и не будет — рука уже есть у
        // каждого, а лишний предмет на полке пришлось бы объяснять.
        if (bedIdx >= 0) {
            const state = Backend.gardenBed(bedIdx);
            if (state && state.stage === 'locked') { this.startWork(bedIdx, 'clear'); this.strokeStart(e); return; }
            if (state && state.stage === 'ripe') { this.startWork(bedIdx, 'harvest'); this.strokeStart(e); return; }
        }

        // Свободной панорамы нет: всё остальное — просто промах мимо
        // грядки, и он ничего не делает. Переезд к соседней грядке живёт на
        // стрелках (проверяются в самом начале onDown).
    },

    // Предмет в руке. Один вход на всё, что можно взять: инструмент с полки и
    // семечку из мешка — иначе у них разъезжаются масштаб, слой и правила.
    startDrag(e, kind, key, art) {
        const p = this.toStage(e);
        const NS = 'http://www.w3.org/2000/svg';
        const ghost = document.createElementNS(NS, 'g');
        ghost.setAttribute('class', 'gd-tool gd-dragging');
        ghost.innerHTML = art;
        // Предмет под пальцем обязан быть крупнее самого пальца, иначе не
        // видно, что именно держишь.
        ghost.setAttribute('transform',
            `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${this.DRAG_SCALE})`);
        this.fgEl.appendChild(ghost);
        this.drag = {
            kind: 'tool', node: ghost, tool: kind, key: key || '',
            x: p.x, y: p.y,
            pourBed: -1,        // над какой грядкой льём прямо сейчас
            pourAcc: 0          // сколько миллисекунд уже налито
        };
        if (kind === 'can') this.startPour();
    },

    // Пустая ячейка отвечает движением: сказать «семечек нет» нечем.
    refuseSack(cell) {
        cell.classList.remove('gd-no');
        void cell.getBoundingClientRect();
        cell.classList.add('gd-no');
    },

    onMove(e) {
        if (this.stroke) { this.strokeMove(e); return; }
        if (!this.drag) return;
        const d = this.drag;
        const p = this.toStage(e);
        d.x = p.x; d.y = p.y;
        // Грядка под пальцем подсвечивается: до того, как игрок отпустил,
        // должно быть видно, куда попадёт инструмент.
        const i = this.bedUnder(e, d.tool === 'can');
        const ok = i >= 0 && this.allowed(d, i);
        Array.from(document.querySelectorAll('.gd-bed')).forEach((g, n) => {
            g.classList.toggle('gd-target', n === i && ok);
        });

        // Лейка — единственный инструмент, который не «срабатывает», а
        // РАБОТАЕТ: её держат над грядкой, пока льётся вода. Наклон здесь же:
        // предмет обязан выглядеть льющим, пока из него льёт.
        if (d.tool === 'can') {
            if (ok && i !== d.pourBed) { d.pourBed = i; d.pourAcc = 0; }
            if (!ok) { d.pourBed = -1; d.pourAcc = 0; }
        }
        const tilt = (d.tool === 'can' && d.pourBed >= 0) ? GARDEN_ART.CAN_TILT : 0;
        d.node.setAttribute('transform',
            `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${tilt}) scale(${this.DRAG_SCALE})`);
    },

    onUp(e) {
        if (this.stroke) { this.stroke = null; return; }
        const d = this.drag;
        this.drag = null;
        if (!d) return;
        Array.from(document.querySelectorAll('.gd-bed')).forEach(g => g.classList.remove('gd-target'));
        d.node.remove();

        const i = this.bedUnder(e, d.tool === 'can');
        if (i < 0 || !this.allowed(d, i)) return;
        // Лейка при отпускании НЕ срабатывает: она уже отработала, пока её
        // держали. Не долил — вода ушла в землю впустую, и это честно: иначе
        // «поднести и отпустить» было бы быстрее, чем полить.
        if (d.tool === 'can') return;
        // Остальные инструменты донести до грядки — это только НАЧАЛО работы.
        // Лопата втыкается в землю, грабли ложатся зубьями — и дальше игрок
        // работает ими сам.
        this.startWork(i, this.actionOf(d), d.key ? { species: d.key } : null);
    },

    // Какое действие соответствует инструменту. Таблица одна и здесь: если
    // действие некуда положить в неё, значит инструмента для него нет.
    actionOf(d) {
        return { spade: 'dig', seed: 'sow', can: 'water', rake: 'weed', dung: 'fertilize' }[d.tool];
    },

    // Можно ли этим по этой грядке. Проверяется ДО отпускания, чтобы подсветка
    // не обещала того, чего не будет. Таблица «что на какой стадии» живёт в
    // Backend в единственном экземпляре: вторая копия здесь разъехалась бы с
    // ней молча.
    allowed(d, i) {
        return Backend.gardenCan(i, this.actionOf(d), d.key ? { species: d.key } : null);
    },

    // Какая грядка под пальцем. `tall` — зона на всю высоту НАД грядкой:
    // это зона ПОЛИВА. Лейку нельзя держать там же, где лежит грядка, — она
    // закрывает собой ровно то, что поливает, и струе неоткуда падать. Ровно
    // та же правка, что понадобилась наливу в кастрюлю на кухне: зона тянется
    // до верха экрана, и вода летит сверху вниз, как ей и положено.
    bedUnder(e, tall) {
        const p = this.toScene(e);
        for (let i = 0; i < this.beds; i++) {
            const x = GARDEN_ART.bedX(i);
            if (Math.abs(p.x - x) > GARDEN_ART.BED_W / 2 + 10) continue;
            const top = tall ? -200 : GARDEN_ART.SOIL_Y - 90;
            if (p.y > top && p.y < GARDEN_ART.SOIL_Y + 40) return i;
        }
        return -1;
    },

    // ---------- РУЧНАЯ РАБОТА ----------
    // Ни одно действие в саду не срабатывает от того, что предмет донесли до
    // грядки. Инструмент встаёт в рабочее положение, и дальше игрок РАБОТАЕТ
    // им сам: дёргает лопату, приминает землю ладонью, водит граблями. Ровно
    // тот же приём, что нож на кухне, и по той же причине — сад про возню
    // руками, а мгновенное срабатывание превращает его в список кнопок.
    //
    // Устроено это так:
    //   startWork  — инструмент занял позицию, дальше ждём движений;
    //   strokeMove — считаем движения: длина по нужной оси, разворот = мазок;
    //   finishWork — движений набралось, действие уходит в Backend.
    //
    // Отмена — нажатие мимо грядки. Без выхода работа была бы ловушкой:
    // передумал, а деться некуда.
    startWork(i, action, opts) {
        const cfg = GARDEN.work[action];
        if (!cfg) { this.act(i, action, opts); return; }      // действие без возни
        // Проверяем ДО того, как инструмент встанет в позицию: разгребать
        // завал, за который нечем заплатить, игрок не должен.
        if (!Backend.gardenCan(i, action, opts)) { this.refuse(i); return; }

        this.work = {
            i, action, opts: opts || null, cfg,
            // Сколько движений нужно, решает Backend по ступени инструмента:
            // прокачка сокращает работу, и экрану об этом знать нечего.
            need: Backend.gardenWorkNeed(action), done: 0, swing: 0
        };
        this.stroke = null;
        this.renderWork(true);
        this.render();
    },

    cancelWork() {
        if (!this.work) return;
        this.work = null;
        this.stroke = null;
        this.renderWork();
        this.render();
    },

    // Зона работы — та же вертикальная полоса над грядкой, что у полива:
    // дёргать лопату игрок будет там, где ему удобно, а не строго в границах
    // короба.
    workZone(e) {
        return this.work && this.bedUnder(e, true) === this.work.i;
    },

    strokeStart(e) {
        if (!this.work) return;
        const p = this.toScene(e);
        // Отсчёт ведётся ОТ ПРЕДЫДУЩЕГО положения пальца, а не от начала
        // жеста: с отсчётом от начала инструмент «заводится» и уезжает
        // (docs/traps.md, п. 3).
        this.stroke = { last: this.work.cfg.axis === 'y' ? p.y : p.x, run: 0, dir: 0 };
    },

    // Считается РАЗВОРОТ, а не пройденное расстояние. Первая версия считала
    // расстояние и обнуляла набег после каждого зачёта — один длинный свайп
    // через весь экран засчитывался как десяток движений, и вся работа
    // делалась за долю секунды одним махом. Работа — это «туда и обратно»,
    // значит и засчитывать надо возврат.
    strokeMove(e) {
        const w = this.work, st = this.stroke;
        if (!w || !st) return;
        const p = this.toScene(e);
        const now = w.cfg.axis === 'y' ? p.y : p.x;
        const d = now - st.last;
        if (!d) return;
        st.last = now;
        const dir = d > 0 ? 1 : -1;

        // Рывок (сбор) — единственное движение без возврата: плод срывают в
        // одну сторону, и ждать, пока рука вернётся, незачем.
        if (w.cfg.dir) {
            if (dir !== w.cfg.dir) { st.run = 0; st.dir = dir; this.showSwing(0); return; }
            st.run += Math.abs(d);
            this.showSwing(Math.min(1, st.run / w.cfg.min) * dir);
            if (st.run >= w.cfg.min) { st.run = 0; this.countStroke(); }
            return;
        }

        if (st.dir === 0) st.dir = dir;
        if (dir !== st.dir) {
            // Развернулся. Засчитываем, только если размах добрал до
            // минимума: дрожание пальца туда-сюда работой не считается.
            const earned = st.run >= w.cfg.min;
            st.dir = dir;
            st.run = Math.abs(d);
            if (earned) { this.countStroke(); return; }
        } else {
            st.run += Math.abs(d);
        }
        // Инструмент ходит ЗА ПАЛЬЦЕМ и ровно настолько, насколько тот ушёл:
        // это единственный отклик на движение, которое ещё не засчитано.
        this.showSwing(Math.min(1, st.run / w.cfg.min) * st.dir);
    },

    // Отклик на незасчитанное движение — только картинка, состояние не
    // трогается. Поэтому перерисовывается один слой работы, а не грядки.
    showSwing(v) {
        if (!this.work) return;
        this.work.swing = v;
        this.renderWork();
    },

    countStroke() {
        const w = this.work;
        w.done++;
        w.swing = 0;
        // Грядка меняется от КАЖДОГО засчитанного движения: камень отлетел,
        // лунка глубже, сорняк выдран. Перерисовывается она только здесь —
        // собирать шесть грядок заново на каждый кадр незачем.
        this.render();
        this.renderWork();
        if (w.done >= w.need) this.finishWork();
    },

    finishWork() {
        const w = this.work;
        this.work = null;
        this.stroke = null;
        this.renderWork();
        this.act(w.i, w.action, w.opts);
    },

    // Слой работы устроен тремя уровнями, и это не бюрократия:
    //   внешняя группа — ГДЕ грядка (transform с координатой в сцене);
    //   .gd-work-in    — анимация втыкания, играет ОДИН раз при заходе;
    //   внутри неё     — сам инструмент, он переписывается на каждое движение.
    // Собери это одним узлом — и либо анимация сотрёт позицию грядки
    // (docs/traps.md, п. 2), либо она будет запускаться заново на каждом
    // кадре, потому что узел пересоздаётся.
    renderWork(rebuild) {
        const layer = document.getElementById('gd-work');
        if (!layer) return;
        const w = this.work;
        if (!w) { layer.innerHTML = ''; return; }
        const art = GARDEN_ART.workTool(w.action, w.swing, w.done / w.need);
        const inner = layer.querySelector('.gd-work-in');
        if (rebuild || !inner) {
            layer.innerHTML = `<g transform="translate(${GARDEN_ART.bedX(w.i)} 0)">`
                + `<g class="gd-work-in">${art}</g></g>`;
            return;
        }
        inner.innerHTML = art;
    },

    // ---------- ДЕЙСТВИЕ ----------
    // Действие занимает время и на это время отбирает управление: из
    // неспешности и складывается сад. Мгновенные действия превратили бы его в
    // список кнопок.
    act(i, action, opts) {
        if (this.locked) return;
        const res = Backend.gardenAct(i, action, opts);
        if (!res.ok) { this.refuse(i); return; }

        this.locked = true;
        this.bump(i, 'gd-act');

        setTimeout(() => {
            this.locked = false;
            GameState.save();
            this.render();
            if (res.grown) this.flyToPantry(i);
            // Что нашлось в земле — показывается ПРЕДМЕТОМ над грядкой.
            // Число в кошельке игрок не связывает с ямкой, которую только что
            // выкопал, а связь «копнул — нашёл» и есть весь смысл находок.
            // ВСЯ добыча за одно действие — одним списком, чтобы порядок и
            // разбежка считались в одном месте, а не собирались из
            // разбросанных таймеров.
            const gains = [];
            // Плод показывается только если он реально лёг в кладовую:
            // склад не резиновый, и «+1» при полном складе был бы враньём.
            if (res.grown && res.taken) {
                const fruit = (GARDEN.species[res.grown] || {}).fruit;
                if (fruit) gains.push({ what: 'fruit', key: fruit, amount: res.taken });
            }
            if (res.seedBack) gains.push({ what: 'seed', key: res.seedBack, amount: 1 });
            if (res.shards) gains.push({ what: 'sloth_shard', amount: res.shards });
            if (res.hay) gains.push({ what: 'hay', amount: res.hay });
            if (res.find) {
                gains.push({ what: res.find.what, key: res.find.key,
                             amount: res.find.amount == null ? 1 : res.find.amount });
            }
            this.showGains(i, gains);
            // Шкала дёргается на каждом действии: без этого игрок не связывает
            // «повозился в саду» с «лень закрылась», а связь тут и есть весь
            // смысл мини-игры.
            if (res.fill) {
                const w = document.getElementById('gd-gauge-wrap');
                if (w) { w.classList.remove('gd-bump'); void w.getBoundingClientRect(); w.classList.add('gd-bump'); }
            }
            if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        }, this.ACT_MS);
    },

    // Отказ, сказанный движением: написать «сюда нельзя» нечем.
    refuse(i) { this.bump(i, 'gd-no'); },

    // Любая анимация грядки вешается на ВЛОЖЕННУЮ группу. На внешней записана
    // позиция грядки в сцене (`transform="translate(x 0)"`), и CSS-анимация,
    // правящая transform, стирала её на время проигрывания: грядка прыгала к
    // левому краю экрана и возвращалась. Ровно тот же случай, что с пульсом
    // значка (docs/traps.md, п. 2).
    bump(i, cls) {
        const g = document.getElementById('gd-bed-' + i);
        const inner = g && g.querySelector('.gd-bed-in');
        if (!inner) return;
        inner.classList.remove(cls);
        void inner.getBoundingClientRect();
        inner.classList.add(cls);
    },

    // ---------- ПОЛИВ ----------
    // Полив — не мгновенное «сработало», а работа: лейку подносят к грядке и
    // ДЕРЖАТ, пока в неё льётся вода. Ровно как налив на кухне, и той же
    // струёй (src/core/liquid-stream.js) — второй физики жидкости в игре быть
    // не должно.
    //
    // Из этого следует главное для баланса: время полива — единственное
    // ускорение в саду, которое игрок ВИДИТ. Часы роста он не ждёт, он
    // уходит; а секунды с лейкой в руке стоит прямо сейчас. Поэтому ранние
    // ступени лейки сокращают именно их (GARDEN.CAN_TIERS).
    startPour() {
        if (this.pourRaf) return;
        let last = performance.now();
        const step = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const live = this.pourTick(dt);
            // Цикл живёт, пока держат лейку ИЛИ пока летит вода: струя не
            // может пропасть в воздухе посреди падения (та же причина, что на
            // кухне).
            if ((this.drag && this.drag.tool === 'can') || live > 0) {
                this.pourRaf = requestAnimationFrame(step);
            } else {
                this.pourRaf = 0;
                LiquidStream.clear(this.stream);
                if (this.wetEl) this.wetEl.innerHTML = '';
            }
        };
        this.pourRaf = requestAnimationFrame(step);
    },

    pourTick(dt) {
        const d = this.drag;
        const pouring = d && d.tool === 'can' && d.pourBed >= 0 && !this.locked;

        if (!pouring) {
            if (this.wetEl) this.wetEl.innerHTML = '';
            return LiquidStream.tick(this.stream, dt, null, null);
        }

        const need = Backend.gardenPourMs();
        d.pourAcc += dt * 1000;
        const frac = Math.min(1, d.pourAcc / need);

        // Куда льём: земля грядки в координатах ЭКРАНА. По вертикали сцена и
        // экран совпадают, по горизонтали разъезжаются ровно на камеру.
        const to = this.toStagePoint(GARDEN_ART.bedX(d.pourBed), GARDEN_ART.SOIL_Y - 10);
        const from = this.spoutPoint(d);
        LiquidStream.tick(this.stream, dt, from, to);

        // Лужа растёт вместе с налитым: сколько вылито, столько и мокрого.
        // Это и есть шкала полива — без цифр и без подписи.
        this.wetEl.innerHTML = `<g transform="translate(${to.x.toFixed(1)} ${(to.y + 8).toFixed(1)})">`
            + GARDEN_ART.puddle(frac) + `</g>`;

        if (d.pourAcc >= need) {
            // Долил. Управление отбирается, лейка возвращается на полку — так
            // же, как сосуд на кухне встаёт на место, когда кастрюля полна.
            const bed = d.pourBed;
            d.node.remove();
            this.drag = null;
            this.act(bed, 'water');
        }
        return this.stream.live;
    },

    // Носик лейки в координатах экрана. Считается из ЕЁ ЖЕ рисунка
    // (GARDEN_ART.CAN_SPOUT/CAN_AXIS), повёрнутого и увеличенного так же, как
    // сам предмет в руке: подобранная на глаз точка совпала бы с носиком
    // ровно при одном угле наклона, а он меняется.
    spoutPoint(d) {
        const a = GARDEN_ART.CAN_TILT * Math.PI / 180;
        const cos = Math.cos(a), sin = Math.sin(a), k = this.DRAG_SCALE;
        const SP = GARDEN_ART.CAN_SPOUT, AX = GARDEN_ART.CAN_AXIS;
        return {
            x: d.x + (SP.x * cos - SP.y * sin) * k,
            y: d.y + (SP.x * sin + SP.y * cos) * k,
            // Куда смотрит носик: направление его оси, повёрнутое вместе с
            // лейкой. Вода выходит ПО НЕМУ и только потом заворачивает вниз.
            dx: AX.x * cos - AX.y * sin,
            dy: AX.x * sin + AX.y * cos
        };
    },

    // Находка всплывает над грядкой и тает. Живёт в слое сцены грядки, чтобы
    // уехать вместе с участком, если игрок в этот момент ведёт панораму.
    // Что игрок получил — показывается ПРЕДМЕТАМИ над грядкой, по очереди,
    // с числами. Цифра в кошельке со сбором не связывается: связь «сорвал —
    // получил» держится на том, что вещь вылетает из той самой грядки.
    //
    // Порядок — от ценного к дешёвому: плод, семечко, осколок, сено. Первым
    // показывается то, ради чего сажали, а сено — то, что достаётся всегда.
    GAIN_ORDER: ['fruit', 'seed', 'gold', 'sloth_shard', 'wrath_shard', 'hay'],
    // Разбежка между предметами. Летит каждый секунду, поэтому шаг должен
    // быть заметно больше половины полёта — иначе следующий выходит из грядки
    // раньше, чем предыдущий отлетел, и вместо очереди получается куча.
    GAIN_STEP_MS: 480,

    showGains(i, list) {
        const sorted = (list || []).filter(g => g && (g.amount == null || g.amount > 0))
            .sort((a, b) => this.GAIN_ORDER.indexOf(a.what) - this.GAIN_ORDER.indexOf(b.what));
        // Вразбежку: два предмета, вылетевшие одновременно, читаются как один.
        sorted.forEach((g, n) => setTimeout(() => this.showGain(i, g), n * this.GAIN_STEP_MS));
    },

    showGain(i, g) {
        // Слой добычи отдельный: грядка перерисовывается целиком раз в
        // секунду, и предмет, положенный внутрь неё, пропадал бы на середине
        // полёта. Позиция — на внешней группе, анимация — на вложенной
        // (docs/traps.md, п. 2 и 2а).
        const layer = document.getElementById('gd-finds');
        if (!layer) return;
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        node.setAttribute('class', 'gd-find-fly');
        node.setAttribute('transform',
            `translate(${GARDEN_ART.bedX(i)} ${GARDEN_ART.SOIL_Y - 40})`);
        node.innerHTML = GARDEN_ART.gain(g.what, g.key, g.amount);
        layer.appendChild(node);
        setTimeout(() => node.remove(), 1100);
    },

    // Собранный плод улетает вниз — туда, где кладовая. Связь «сад кормит
    // кухню» показывается движением, а не объяснением.
    flyToPantry(i) { this.bump(i, 'gd-harvest'); },
});
