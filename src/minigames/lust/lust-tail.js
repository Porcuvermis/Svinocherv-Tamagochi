// ================= ПОХОТЬ: ХВОСТ, ПЕНА, ПУЗЫРИ =================
// Хвост всплывает, горка пены, поглаживание и изгиб хвоста, пузыри.
// Продолжение LustMinigame (lust.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после lust.js.
Object.assign(LustMinigame, {

    // ---------- ХВОСТ ВСПЛЫВАЕТ ----------
    raiseTail() {
        this.phase = 'tail';
        // Кадр СЖИМАЕТСЯ до двоих: мыло, мочалка и полка отработали, и
        // держать их на экране больше незачем. Переезд плавный, и червь
        // уходит в расфокус одновременно с ним: это не новая сцена, а
        // смена того, на что смотрят.
        this.setCamera('tail', 1000);
        // Червь стал ФОНОМ за хвостом, и платить за него полную цену больше
        // незачем: на наезде он занимает пол-экрана, а каждая правка его
        // геометрии — это перерисовка всей этой площади. Замер на айфоне:
        // живой персонаж 24 кадра, замерший 60.
        if (this.wormHandle && this.wormHandle.setFrameHz) this.wormHandle.setFrameHz(5);
        this.wormHost.classList.add('bt-soft');
        this.blurFar(BATH_ART.FAR_BLUR, 900);
        // Червя ополаскивают: муть и пена сходят. Оставить их — значит
        // держать белую вуаль поверх морды весь финал, а именно морда в нём
        // и работает (блаженство, открытый рот).
        this.el('bt-wash').style.opacity = '0';
        const model = window.WormModelAPI ? this.bathModel() : null;
        this.tailModel = model;
        this.bend = 0;
        this.bendHand = null;

        this.el('bt-tail').innerHTML =
            `<g id="bt-tail-pivot">${BATH_ART.tail(model)}</g>`;
        this.drawTail();
        this.setOpacity('bt-tail', 1);

        // НИКАКОГО ВСПЛЫТИЯ. Хвост просто оказывается на своём месте — под
        // горкой пены, которая его целиком закрывает. Раньше он выезжал
        // снизу, и это было видно: сначала кончик показывался из-за борта,
        // потом подъезжал к пене и прятался под ней. Появление, которое
        // прячут, не нужно анимировать — его нужно не показывать.
        const g = this.el('bt-tail');
        g.removeAttribute('transform');
        this.spawnBubbles();
    },

    // Размытие ДАЛЬНЕГО плана. Стена с плиткой стоит дальше всех, значит и
    // мылится сильнее всех — из этого и берётся глубина кадра. Пока размыт
    // был один червь, резкая плитка спорила с ним и тянула взгляд на себя.
    //
    // Ставится в svg-фильтр, а не в css: css filter не действует на
    // внутренние элементы svg в WebKit, и на айфоне размытия бы не было
    // вовсе (та же грабля, что у фильтра истощения в worm-renderer).
    blurFar(to, ms) {
        const n = this.el('bt-far-blur-amount'), g = this.el('bt-shower');
        const lines = this.el('bt-far-lines');
        if (!n || !g) return;
        cancelAnimationFrame(this.blurRaf || 0);
        // Дальний план мылится ДВУМЯ РАЗНЫМИ СРЕДСТВАМИ, и это не небрежность.
        // Стена и пол — плоские заливки, размывать в них нечего; расфокус на
        // них читается пропавшим контрастом ЛИНИЙ, а это одна прозрачность.
        // Честный гауссиан остаётся только на душе — единственном предмете
        // дальнего плана с формой, зато и площадью с ладонь. Фильтр во всю
        // стену стоил трети кадров: дождь перерисовывается каждый кадр и
        // тянет за собой пересчёт размытия по всему экрану.
        //
        // Фильтр СНИМАЕТСЯ вовсе, когда размывать нечего: нулевая
        // stdDeviation не бесплатна, группа всё равно гоняется через
        // конвейер фильтра каждый кадр.
        const set = (v) => {
            n.setAttribute('stdDeviation', v.toFixed(2));
            if (v < 0.05) g.removeAttribute('filter');
            else g.setAttribute('filter', 'url(#bt-far-blur)');
            // Швы гаснут вместе с наводкой: на полном размытии от них
            // остаётся четверть, то есть намёк на кафель, а не сетка.
            if (lines) lines.setAttribute('opacity',
                (1 - 0.75 * Math.min(1, v / BATH_ART.FAR_BLUR)).toFixed(3));
        };
        const from = parseFloat(n.getAttribute('stdDeviation')) || 0;
        if (!ms) { set(to); return; }
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / ms);
            set(from + (to - from) * k * k * (3 - 2 * k));
            this.blurRaf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        this.blurRaf = requestAnimationFrame(step);
    },

    // ---------- ГОРКА ПЕНЫ ----------
    // Список пузырей собирается ОДИН РАЗ, ещё на этапе мочалки, и потом
    // только показывается по частям. Так горка растёт на глазах, а не
    // возникает готовой в момент, когда её нужно лопать.
    buildPile() {
        const C = this.cfg(), T = BATH_ART.TAIL;
        const lo = C.bubblesMin || 16, hi = C.bubblesMax || 20;
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        const A = BATH_ART.slots();
        // Горка обязана закрывать НЕВЫРОСШИЙ хвост целиком, с запасом:
        // всплывает он маленьким.
        this.pileW = T.base * 2.4;
        this.pileH = T.len * 1.15;
        this.pileSeed = 1 + Math.floor(Math.random() * 999);
        this.pile = [];
        for (let i = 0; i < n; i++) {
            // Кладутся по той же горке, что и комки: доля вдоль высоты, и
            // чем выше, тем уже разброс. Иначе пузыри висят по краям над
            // пустотой, а сама горка остаётся голой.
            const t = Math.pow((i + 0.5) / n, 0.8);
            const half = (this.pileW / 2) * (1 - 0.55 * t);
            this.pile.push({
                x: A.tail.x + (Math.random() - 0.5) * 2 * half,
                y: A.tail.y - t * this.pileH - 4,
                // Порядок ПОЯВЛЕНИЯ — по высоте, снизу вверх: пена не
                // возникает в воздухе, она нарастает от борта ванны, комок
                // на комок. Порядок ОТРИСОВКИ другой (крупные первыми), и
                // путать их нельзя: иначе мелкий тонет под соседним крупным
                // и по нему нечем попасть.
                ord: i,
                // Мельче прежних (было 4…15): хвост стал вдвое короче, и
                // старый калибр закрывал его целиком. Попадать по ним от
                // размера не зависит — зона срабатывания общая (popReach).
                r: 5 + Math.pow(Math.random(), 1.6) * 9,
                alive: true, seed: i * 37 + 5
            });
        }
        this.pile.sort((a, b) => b.r - a.r);
        this.pileShow(0);
    },

    // Показать долю k горки: сама горка растёт, пузыри проступают по одному.
    pileShow(k) {
        if (!this.pile) return;
        const A = BATH_ART.slots(), g = Math.max(0, Math.min(1, k));
        this.el('bt-foam').innerHTML = BATH_ART.foamMound(
            A.tail.x, A.tail.y, this.pileW, this.pileH, g, this.pileSeed);
        const upto = Math.round(g * this.pile.length);
        this.el('bt-bubbles').innerHTML = this.pile
            .filter(b => b.ord < upto && b.alive)
            .map(b => BATH_ART.bubble(b.x, b.y, b.r, b.seed)).join('');
    },

    // Точка рта червя. Считается по НАРИСОВАННОМУ рту, а не по числу: рот
    // ездит вместе с моделью, и подобранное число разошлось бы с ней при
    // первой же правке персонажа.
    mouthPoint() {
        const box = this.wormBoxScene(), B = this.WORM_BASE, k = box.w / B.w;
        let p = null;
        if (this.wormHandle && this.wormHandle.getPartPoint) {
            const q = this.wormHandle.getPartPoint('mouth');
            if (q) p = { x: box.x + q.x * k, y: box.y + q.y * k };
        }
        return p || { x: box.x + box.w * 0.6, y: box.y + box.h * 0.42 };
    },

    // Куда сейчас смотрит кончик и где он стоит.
    // Во сколько раз хвост крупнее исходного. Считается ОТ ЗАРЯДА, а не
    // хранится: заряд меняется каждый кадр, и держать рядом второе число,
    // которое обязано с ним совпадать, — верный способ их развести.
    tailGrow() { return 1 + this.charge * (this.cfg().rubGrow || 0.3); },

    tipState(bend) {
        const A = BATH_ART.slots();
        const c = BATH_ART.tailCurve(bend == null ? this.bend : bend,
                                     this.tailGrow());
        return { x: A.tail.x + c.tip.x, y: A.tail.y + c.tip.y, dir: c.dir, curve: c };
    },

    // ---------- ПОГЛАЖИВАНИЕ ----------
    // Между лопаньем пузырей и финалом. Палец ВЕДЁТ вдоль хвоста, хвост
    // наливается и растёт; перестал вести — заряд спадает.
    //
    // Ровно та же механика, что у прицела в финале, и по той же причине:
    // засчитывается ПУТЬ пальца вдоль оси, а не то, где он лежит. Иначе
    // достаточно положить палец и ждать.
    startRub() {
        this.phase = 'rub';
        this.charge = 0;
        // Морда откликается заранее: рот приоткрыт, глаза приспущены. В
        // финале то же лицо доводится до блаженства — так по нему видно, что
        // этап идёт и к чему ведёт (инвариант 9: сказано позой, не подписью).
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ mouthOpenness: 0.3, eyelidLevel: 0.55 });
        // Червь уходит в расфокус: главный в кадре — хвост.
        this.wormHost.classList.add('bt-soft');
        this.el('bt-bubbles').innerHTML = '';
        this.rubLast = performance.now();
        this.rubMoved = this.rubLast;
        const tick = (now) => {
            const dt = Math.min(0.05, (now - this.rubLast) / 1000);
            this.rubLast = now;
            if (this.phase !== 'rub') { this.rubRaf = 0; return; }
            const C = this.cfg();
            // Спад НЕ СРАЗУ: рука не может водить без единой остановки, а
            // прирост за ход мелкий — мгновенный спад не давал набрать вовсе.
            if ((now - this.rubMoved) / 1000 > (C.rubIdle || 1.1))
                this.charge = Math.max(0, this.charge - (C.rubRelax || 0.06) * dt);
            this.drawTail();
            this.drawRubGauge();
            // Веки опускаются ВМЕСТЕ с наливом: тот же прогресс, сказанный
            // мордой. Каждый кадр и без ступеней: setLivePose только кладёт
            // числа в живой канал, а применяет их тот же кадровый цикл
            // рендерера — округлять было не за чем, а ступени на веках
            // видно.
            //
            // Глубже ПОЛОВИНЫ веки не опускаются. Зажмуренный червь теряет
            // морду: в финале он ловит струю ртом, и по прикрытым глазам
            // читается блаженство, а по закрытым — что он спит.
            if (this.wormHandle && this.wormHandle.setLivePose) {
                this.wormHandle.setLivePose({
                    mouthOpenness: 0.3 + this.charge * 0.3,
                    eyelidLevel: this.LID_MAX * (0.5 + this.charge * 0.5) });
            }
            if (this.charge >= 1) { this.rubRaf = 0; this.startFinale(); return; }
            this.rubRaf = requestAnimationFrame(tick);
        };
        this.rubRaf = requestAnimationFrame(tick);
    },

    // Доля вдоль хвоста (0 — корень, 1 — кончик) для точки сцены и
    // расстояние до оси. Нужны обе: заряд даёт только палец НА хвосте.
    rubAt(p) {
        const A = BATH_ART.slots();
        const spine = BATH_ART.tailSpine(this.bend, this.tailGrow());
        let best = 0, dist = Infinity;
        for (let i = 0; i < spine.length; i++) {
            const d = Math.hypot(A.tail.x + spine[i].x - p.x,
                                 A.tail.y + spine[i].y - p.y);
            if (d < dist) { dist = d; best = i / (spine.length - 1); }
        }
        return { t: best, dist };
    },

    // Столбик налива СЛЕВА ОТ ХВОСТА: работа идёт по хвосту, туда игрок и
    // смотрит. Высота столбика — по самому хвосту, чтобы он не жил в кадре
    // отдельной деталью.
    drawRubGauge() {
        const A = BATH_ART.slots(), T = BATH_ART.TAIL;
        const h = T.len * 1.05;
        // Столбик стоит с ВНЕШНЕЙ стороны хвоста — той, куда хвост НЕ гнётся:
        // иначе он оказывается между хвостом и мордой, ровно в том коридоре,
        // где идёт вся работа.
        this.el('bt-gauge').innerHTML = BATH_ART.rubGauge(
            A.tail.x + (T.side || 1) * T.base * 0.95 * -1,
            A.tail.y - h - 6, h, this.charge);
    },

    rubMove(p) {
        const C = this.cfg(), a = this.rubAt(p);
        const reach = BATH_ART.TAIL.base * this.tailGrow() * 1.3;
        if (a.dist > reach) { this.drag.t = null; return; }
        if (this.drag.t != null && a.t !== this.drag.t) {
            this.charge = Math.min(1, this.charge
                + Math.abs(a.t - this.drag.t) * (C.rubGain || 0.09));
            this.rubMoved = performance.now();
        }
        this.drag.t = a.t;
    },

    // Изгиб, при котором капля НОМИНАЛЬНОЙ силы проходит через рот. Ищется
    // перебором и ТОЙ ЖЕ физикой, которой капля потом летит: прицел обязан
    // считаться по тому же, по чему считается попадание.
    solveBend(target) {
        const C = this.cfg();
        // Прицел считается ПОЧТИ ПОЛНОЙ силой, а не средней. Цель близко и
        // почти вровень с кончиком, и на такой дистанции в корзину рта
        // проходит широкая пачка траекторий: если прицел взять по середине
        // размаха силы, то и слабый, и сильный толчок всё равно попадают —
        // сила перестаёт значить что-либо, а прокачка, которая её и
        // поднимает, становится бесполезной (проверено симулятором: от
        // ±10° до ±30° разброса попаданий поровну).
        // Прицел «впритык» разворачивает это правильной стороной: полный
        // толчок едва достаёт, слабый НЕ ДОЛЕТАЕТ и падает в ванну. Промах
        // виден целиком, и прокачка силы — это ровно то, что покупается.
        const v = C.speedMin + 0.92 * (C.speedMax - C.speedMin);
        const LO = -0.25, HI = this.BEND_MAX, N = 240;
        // Собираем ВСЕ изгибы, при которых капля проходит через рот, и
        // возвращаем СЕРЕДИНУ первой непрерывной полосы попаданий.
        //
        // Раньше возвращался «лучший по промаху». Промах у любого попадания
        // равен нулю, попадают несколько изгибов подряд, и правило «строго
        // лучше» выбирало ПЕРВЫЙ из них — то есть самый край окна. Игрок
        // держал прицел идеально и мазал половину толчков: разброс уводил
        // каплю только в одну сторону, наружу.
        //
        // Первая полоса, а не лучшая: перебор идёт от малого изгиба, и
        // первая — навесная. Дуга видна целиком, и по ней читается перелёт.
        const hits = [], bends = [];
        let best = LO, near = Infinity;
        for (let i = 0; i <= N; i++) {
            const b = LO + (HI - LO) * i / N;
            const s = this.tipState(b);
            const r = LustShot.fly(C, s,
                { vx: Math.cos(s.dir) * v, vy: Math.sin(s.dir) * v },
                target, C.mouthR);
            bends.push(b); hits.push(r.hit);
            if (r.near < near) { near = r.near; best = b; }
        }
        const from = hits.indexOf(true);
        if (from < 0) return best;          // не долетает ни при каком изгибе
        let to = from;
        while (to + 1 <= N && hits[to + 1]) to++;
        return (bends[from] + bends[to]) / 2;
    },


    drawTail(force) {
        const A = BATH_ART.slots(), g = this.el('bt-tail-pivot');
        if (!g) return;
        // Пересобирать путь хвоста имеет смысл, только если он изменился.
        // Кадров, где палец стоит, а хвост уже выпрямился, за забег набегает
        // половина, и каждый из них стоил двух сотен toFixed и двух записей
        // в дерево.
        const key = `${this.bend.toFixed(4)}|${this.charge.toFixed(4)}`;
        if (key === this._tailKey) return;

        // ---------- И НЕ ЧАЩЕ ТРИДЦАТИ РАЗ В СЕКУНДУ ----------
        // Хвост — крупная фигура, а правка его пути значит перерисовку всей
        // его площади процессором (svg рисует CPU, видеокарта только двигает
        // готовое). Шестьдесят перерисовок в секунду телефон не тянет, а
        // разницы между 30 и 60 на упругом движении не видно.
        //
        // Последний кадр движения рисуется ВСЕГДА (force): иначе хвост
        // застывал бы чуть-чуть не там, где его отпустили.
        const now = performance.now();
        if (!force && this._tailTs && now - this._tailTs < 33) return;
        this._tailTs = now;
        this._tailKey = key;
        // Ни одного поворота: группа только переносится, а гнётся сама фигура.
        g.setAttribute('transform', `translate(${A.tail.x} ${A.tail.y})`);
        const d = BATH_ART.tailD(this.bend, this.tailGrow());
        this.el('bt-tail-body').setAttribute('d', d.body);
        this.el('bt-tail-shine').setAttribute('d', d.shine);
        // Прилипшее к хвосту едет вместе с ним.
        if (typeof LustGoo !== 'undefined') LustGoo.drawTail(force);
    },

    // ---------- ПУЗЫРИ ----------
    // Пена налипла на хвост ГУСТО и разным калибром: одинаковые кружки в ряд
    // складываются в бусы, а не в пену. Доля возводится в степень, поэтому
    // мелких много, крупных единицы.
    //
    // Лопаются ПО ОДНОМУ за касание. Пачкой было быстрее, но щелчок по
    // пузырю — сам по себе удовольствие, ради которого этап и существует;
    // пачка съедала его ради экономии десятка тапов.
    // Горка уже стоит и уже полная — здесь только отдаётся управление
    // игроку. Новых пузырей не появляется: те же, что копились под мочалкой,
    // теперь можно лопать.
    spawnBubbles() {
        this.phase = 'pop';
        if (!this.pile) this.buildPile();
        this.bubbles = this.pile;
        this.pileShow(1);
    },

    // Горка тает вместе с пузырями: её доля — это доля целых. Иначе игрок
    // разобрал бы всю пену, а ширма осталась бы стоять поверх хвоста.
    drawBubbles() {
        const A = BATH_ART.slots();
        const alive = this.bubbles.filter(b => b.alive);
        this.el('bt-bubbles').innerHTML = alive
            .map(b => BATH_ART.bubble(b.x, b.y, b.r, b.seed)).join('');
        this.el('bt-foam').innerHTML = BATH_ART.foamMound(
            A.tail.x, A.tail.y, this.pileW, this.pileH,
            alive.length / Math.max(1, this.bubbles.length), this.pileSeed);
    },

    pop(p) {
        // ОДИН за касание, и ближайший: под пальцем часто оказываются два, и
        // лопаться должен тот, по которому целились.
        //
        // Зона срабатывания ОДНА НА ВСЕХ и не зависит от радиуса пузыря.
        // Пока она была «радиус плюс немного», по мелким было физически не
        // попасть: палец закрывает их целиком, а засчитывалось попадание в
        // круг вдвое меньше подушечки. Ближайший всё равно один, так что
        // широкая зона ничего не путает — она снимает прицеливание.
        const reach = this.cfg().popReach || 34;
        let hit = null, best = Infinity;
        for (const b of this.bubbles) {
            if (!b.alive) continue;
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d > reach || d >= best) continue;
            best = d; hit = b;
        }
        if (!hit) return;
        hit.alive = false;
        this.drawBubbles();
        if (!this.bubbles.some(b => b.alive)) this.startRub();
    },
});
