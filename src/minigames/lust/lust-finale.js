// ================= ПОХОТЬ: ФИНАЛ И КОНЕЦ ЗАБЕГА =================
// Толчки и ловля ртом, доигрывание, капли и струя, живой слой выстрела,
// вход в магазин, купленные ступени, шкала, остановка и done().
// Продолжение LustMinigame (lust.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после lust.js.
Object.assign(LustMinigame, {

    // ---------- ФИНАЛ: ТОЛЧКИ И ЛОВЛЯ ----------
    // Через сколько после входа в финал снимается точка рта: две с лишним
    // перерисовки червя на его пяти кадрах в секунду. Меньше первой паузы
    // между толчками (0.75 с на верхней ступени).
    MOUTH_SETTLE: 450,

    startFinale() {
        this.phase = 'aim';
        // Кадр НЕ МЕНЯЕТСЯ и расфокус НЕ СНИМАЕТСЯ: пузыри, поглаживание и
        // стрельба — один эпизод, а переезд камеры и возврат резкости
        // посреди него читаются сменой сцены. Червь и здесь фон: игрок
        // работает хвостом.
        this.setCamera('tail');
        this.hits = 0;
        this.drops = [];
        this.splats = [];
        // Рот пуст: канал живой, значит его надо явно опустошить, иначе в
        // следующий забег червь входит с чужой лужицей.
        this.mouthFill = null;
        this.setMouthFill(0);
        this.dropAcc = 0;
        this.shotsLeft = this.tailTier().shots || 10;

        // Блаженство: рот открыт, глаза зажмурены. Сказано позой, а не
        // подписью (инвариант 9).
        // Веки остаются там же, где их оставило поглаживание: этап другой,
        // а состояние то же. Скачок до зажмуренных читался сменой сцены.
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ mouthOpenness: 0.75,
                                          eyelidLevel: this.LID_MAX });

        // Рот считается ОДИН РАЗ на весь финал: он стоит на месте, а его
        // запрос дёргает раскладку страницы. По нему же решается и прицел —
        // так цель у прицела и у попадания заведомо одна.
        //
        // Но НЕ СРАЗУ. Поза с открытым ртом только что заказана, а червь в
        // финале перерисовывается пять раз в секунду (setFrameHz в
        // raiseTail): замер в этот же миг ловил рот таким, каким его
        // нарисовали в последний раз, — то есть зависел от того, как шло
        // поглаживание. Цель прицела гуляла на пять единиц от захода к
        // заходу, а сверка с калькулятором краснела через раз. Замер ждёт,
        // пока поза точно нарисуется (MOUTH_SETTLE); первый толчок всё равно
        // позже. До замера прицел считается по текущему рту — прикидкой.
        this.mouthAt = null;
        this.mouthDue = performance.now() + this.MOUTH_SETTLE;
        this.bendAim = this.solveBend(this.mouthPoint());
        this.drawGauge();

        this.aimLast = performance.now();
        const tick = (now) => {
            // Шаг по времени, а не по кадру: на медленном телефоне упругость
            // иначе становится другой физикой.
            const dt = Math.min(0.05, (now - this.aimLast) / 1000);
            this.aimLast = now;
            if (!this.mouthAt && now >= this.mouthDue) {
                this.mouthAt = this.mouthPoint();
                this.bendAim = this.solveBend(this.mouthAt);
            }
            // На доигрывании хвостом распоряжается relaxTail: он опадает, а
            // не слушается упругости. Двое пишущих в bend дёргали бы его.
            if (this.phase === 'aim') {
                this.stepBend(dt);
                // Хвост стоит — дорисовать начисто, дальше ключ всё равно
                // совпадёт и записи не будет.
                this.drawTail((this.bendStep || 0) < 0.0005);
            }
            this.stepDrops(dt);
            this.aimRaf = requestAnimationFrame(tick);
        };
        this.aimRaf = requestAnimationFrame(tick);
        this.shotTimer = setTimeout(() => this.shoot(), this.shotMs());
    },

    // Шаг упругости. Палец тянет с ПОСТОЯННОЙ силой, упругость тянет обратно
    // и растёт быстрее отклонения — поэтому кончик всегда встаёт НЕ ТАМ, где
    // палец, а там, где силы сошлись. Чем дальше отгибаешь, тем сильнее
    // недобор, и держать цель приходится всё время.
    //
    // Порядок первый (без инерции) выбран нарочно: пружина второго порядка
    // раскачивается, и хвост начинает болтаться сам по себе — целиться в
    // болтающийся хвост нечестно, разброс и так намеренно случайный.
    // Выпрямление. Идёт ВСЕГДА, в том числе пока палец на экране: в этом вся
    // разница с прежней версией, где неподвижный палец держал угол сам.
    stepBend(dt) {
        const was = this.bend;
        const t = this.tailTier();
        this.bend = LustShot.relaxBend(this.bend, dt,
            { relax: t.relax, hard: this.BEND_HARD }, this.BEND_MAX);
        // Насколько хвост сдвинулся за этот шаг: по этому числу кадровый цикл
        // решает, дорисовывать ли его начисто (см. drawTail).
        this.bendStep = Math.abs(this.bend - was);
    },

    // Угол пальца вокруг корня хвоста. Ноль — прямо над корнем, вправо
    // положительный.
    handAngle(p) {
        const A = BATH_ART.slots();
        const dx = (BATH_ART.TAIL.side || 1) * (p.x - A.tail.x), dy = A.tail.y - p.y;
        if (Math.hypot(dx, dy) < this.BEND_MIN_R) return null;
        return Math.atan2(dx, dy);
    },

    // Палец ВЕДЁТ хвост: наклон меняется от пройденного по дуге пути, а не
    // от того, где палец остановился, — и в ОБЕ стороны. Ход к морде гнёт,
    // ход обратно разгибает, и разгибание складывается с собственным
    // выпрямлением хвоста. Отдача в обе стороны одна — из ступени хвоста.
    // Завести руку заново — оторвать палец: пока он в воздухе, хода нет.
    aimAt(p) {
        const a = this.handAngle(p);
        if (a == null) return;
        if (this.bendHand == null) { this.bendHand = a; return; }
        const d = a - this.bendHand;
        this.bendHand = a;
        if (d) this.bend = LustShot.pushBend(this.bend, d, this.tailTier(), this.BEND_MAX);
    },

    // Один толчок. Из кончика вылетает КАПЛЯ-СНАРЯД: дальше она живёт по
    // баллистике, и попадание — это её столкновение с открытым ртом. Раньше
    // исход решала формула, а полёт был отдельной картинкой про то же самое:
    // игрок видел струю в рот и не попадал.
    shoot() {
        if (this.phase !== 'aim') return;
        const C = this.cfg();
        const t = this.tailTier();
        const s = this.tipState();
        const v = LustShot.launch(C, t, s.dir);
        // Попадёт ли — решается ЗДЕСЬ, тем же полётом, что у калькулятора
        // (LustShot.fly): шаг фиксированный, случайности после вылета нет,
        // значит и путь тот же самый. Капле, которая долетит, ничто больше
        // не мешает: иначе морда вокруг рта ловила бы её раньше корзины, и
        // игра засчитывала бы меньше, чем посчитал баланс.
        const m = this.mouthAt || this.mouthPoint();
        const main = { x: s.x, y: s.y, vx: v.vx, vy: v.vy, t: 0, r: 11,
                       main: true, trail: [], shed: 0, shedT: 0, seed: Math.random(),
                       willHit: LustShot.fly(C, { x: s.x, y: s.y }, v, m, C.mouthR).hit,
                       // Струя за головой: откуда и с какой скоростью
                       // вылетела, и какая доля её ещё цела (1 — вся).
                       stream: { x0: s.x, y0: s.y, vx: v.vx, vy: v.vy, back: 1 } };
        if (typeof LustGoo !== 'undefined') LustGoo.arm(main);
        this.drops.push(main);
        // Мелкие брызги рядом — только вид. На счёт они не влияют: иначе
        // десять толчков превращаются в полсотни попыток.
        for (let i = 0; i < (C.spray || 0); i++) {
            const a = v.angle + (Math.random() - 0.5) * 0.22;
            const k = 0.82 + Math.random() * 0.3;
            const sp = Math.hypot(v.vx, v.vy) * k;
            this.spawnDrop(s.x, s.y, Math.cos(a) * sp, Math.sin(a) * sp,
                           4 + Math.random() * 3);
        }

        if (--this.shotsLeft > 0) {
            this.shotTimer = setTimeout(() => this.shoot(), this.shotMs());
        } else {
            this.startSettle();
        }
    },

    // Мелкая капля: брызги у кончика и то, что отрывается от хвоста кометы.
    spawnDrop(x, y, vx, vy, r) {
        const d = { x, y, vx, vy, t: 0, r, main: false, trail: [], seed: Math.random() };
        if (typeof LustGoo !== 'undefined') LustGoo.arm(d);
        this.drops.push(d);
        return d;
    },

    // ---------- ДОИГРЫВАНИЕ ----------
    // Управление у игрока отобрано, но игра ещё не кончилась: последние капли
    // обязаны долететь и растечься там, где долетели.
    //
    // Раньше здесь стоял таймер на done(), а done() гасил кадровый цикл — и
    // капли, не успевшие приземлиться, ЗАМИРАЛИ В ВОЗДУХЕ. Ждать «примерно
    // достаточно» нельзя: сколько летит капля, зависит от силы толчка и
    // угла, и в редком случае она живёт вдвое дольше средней.
    //
    // Поэтому ждём не время, а ПУСТОЕ НЕБО: как только последняя капля
    // приземлилась, доигрывание кончилось. Потолок в maxT + запас всё равно
    // стоит — на случай капли, застрявшей в углу расчёта.
    startSettle() {
        this.phase = 'settle';
        this.bendHand = null;
        this.drag = null;
        // Три знака сразу говорят, что управление отобрано, и ни одного
        // слова (инвариант 9): вода перестаёт литься, хвост опадает, червь
        // тяжело дышит.
        this.setOpacity('bt-rain-far', 0);
        this.setOpacity('bt-rain-near', 0);
        this.setOpacity('bt-rain-veil', 0);
        this.relaxTail();
        this.startPanting();
        const t0 = performance.now();
        const wait = () => {
            const dry = !this.drops.length;
            if (dry || performance.now() - t0 > 4000) {
                this.settleRaf = 0;
                this.shotTimer = setTimeout(() => this.done(), 900);
                return;
            }
            this.settleRaf = requestAnimationFrame(wait);
        };
        this.settleRaf = requestAnimationFrame(wait);
    },

    // Тяжёлое дыхание. Дышит ТЕЛО, а не червь целиком: сегменты набухают и
    // опадают на месте.
    //
    // Первая версия качала всю фигуру по вертикали — и червь читался не
    // дышащим, а качающимся на волнах. Дыхание не двигает существо с места:
    // оно меняет ОБЪЁМ, и только его.
    //
    // Раздувание идёт собственным механизмом рендерера (WORM_BREATH_RATIO:
    // живот сильнее всех, за ним второй сегмент, потом первый), просто с
    // размахом втрое больше обычного. Заводить своё было бы вторым способом
    // делать то же самое.
    //
    // Морда идёт ТОЙ ЖЕ волной, и это половина эффекта: на вдохе шире открыт
    // рот и приподняты веки, на выдохе опадают уши. По одному телу дыхание
    // читается бурлением в кишках, а не усталостью.
    PANT_HZ: 0.8,
        // вдохов в секунду: глубоко, а не часто
    PANT_AMP: 0.14,
      // размах вдоха, доля радиуса (обычный — 0.035)

    startPanting() {
        const t0 = performance.now();
        const step = (now) => {
            // Та же однополярная волна и та же частота, что у рендерера, —
            // иначе морда дышала бы отдельно от тела.
            const t = (now - t0) / 1000;
            const w = (1 - Math.cos(t * this.PANT_HZ * Math.PI * 2)) / 2;
            if (this.wormHandle && this.wormHandle.setLivePose) {
                this.wormHandle.setLivePose({
                    breathAmp: this.PANT_AMP,
                    breathSpeed: this.PANT_HZ,
                    mouthOpenness: 0.45 + 0.4 * w,
                    eyelidLevel: this.LID_MAX * (1 - 0.4 * w),
                    earTilt: 12 - 12 * w
                });
            }
            this.pantRaf = requestAnimationFrame(step);
        };
        this.pantRaf = requestAnimationFrame(step);
    },

    // Шаг всех капель. Идёт ФИКСИРОВАННЫМ шагом из конфига, а не длиной
    // кадра: тем же шагом считает баланс tools/sim-lust.js, и расходиться им
    // нельзя. Лишнее время копится и доедается на следующем кадре.
    stepDrops(dt) {
        // Рот берётся ИЗ КЭША, а не спрашивается у персонажа каждый кадр:
        // getPartPoint читает getBBox и getScreenCTM, то есть заставляет
        // браузер пересчитать раскладку — по три раза за кадр только ради
        // точки, которая весь финал стоит на месте.
        const C = this.cfg(), m = this.mouthAt || this.mouthPoint();
        const goo = typeof LustGoo !== 'undefined' ? LustGoo : null;
        this.dropAcc = (this.dropAcc || 0) + dt;
        let guard = 12;
        while (this.dropAcc >= C.dt && guard-- > 0) {
            this.dropAcc -= C.dt;
            for (let i = this.drops.length - 1; i >= 0; i--) {
                const d = this.drops[i];
                if (!d.stream) d.trail.unshift({ x: d.x, y: d.y });
                LustShot.step(d, C);
                if (!d.stream) this.trimTrail(d);
                if (d.main && LustShot.inMouth(d, m, C.mouthR)) {
                    this.drops.splice(i, 1);
                    this.breakStream(d);
                    this.hits++;
                    this.drawGauge();
                    this.splats.push({ x: m.x, y: m.y, r: 16, t: 0, gulp: true });
                    continue;
                }
                // Брызги, залетевшие в рот, он тоже глотает — но НЕ
                // засчитывает: иначе десять толчков стали бы полусотней
                // попыток.
                if (!d.main && LustShot.inMouth(d, m, C.mouthR * 0.8)) {
                    this.drops.splice(i, 1);
                    continue;
                }
                if (d.stream) this.shedStream(d);
                // Долетающую каплю ничто не ловит по дороге (см. shoot).
                const over = d.willHit ? LustShot.spent(d, C)
                           : goo ? goo.hit(d) : LustShot.spent(d, C);
                if (over) {
                    this.drops.splice(i, 1);
                    if (d.stream) this.breakStream(d);
                }
            }
        }
        // Вспышка попадания гаснет сама. Промахи сюда больше не попадают:
        // они прилипают к тому, во что упёрлись, и дальше ими ведает
        // LustGoo — у каждой поверхности свой слой глубины.
        for (let i = this.splats.length - 1; i >= 0; i--) {
            const sp = this.splats[i];
            sp.t += dt;
            if (sp.t > 0.45) this.splats.splice(i, 1);
        }
        this.renderShots();

        // Лужица во рту рисуется САМИМ ЧЕРВЁМ — это часть его рта, а не
        // пятно поверх морды. Значит она едет с ним при любом переезде
        // камеры, обрезается его же губами и уходит в расфокус вместе с ним.
        // Пока её рисовала мини-игра в своём слое, она жила отдельной
        // жизнью и на камере, собранной под хвост, оказывалась на щеке.
        // Лужа растёт до полной на ПОЛНОМ жетоне, то есть по сумме цен всех
        // частей шкалы, а не по числу толчков.
        const full = this.gaugeSteps().reduce((a, b) => a + b, 0) || 1;
        this.setMouthFill(this.hits / full);
    },

    // ---------- КОМЕТА ----------
    // Хвост кометы — это просто прошлые положения капли, обрезанные по
    // длине, а не по числу: на быстрой капле он длиннее, чем на
    // зависшей в верхней точке дуги, — так и видно скорость.
    trimTrail(d) {
        // Хвост мелкой капли — в два её радиуса: длиннее он читался шипом.
        const max = d.r * (d.main ? 6.5 : 2.2);
        let len = 0, px = d.x, py = d.y;
        for (let k = 0; k < d.trail.length; k++) {
            const q = d.trail[k];
            len += Math.hypot(q.x - px, q.y - py);
            px = q.x; py = q.y;
            if (len > max) { d.trail.length = k + 1; return; }
        }
    },

    // ---------- СТРУЯ: ЛЕНТА, ОТ КОТОРОЙ ОТРЫВАЮТСЯ КАПЛИ ----------
    // Толчок — один выплеск: жижа выходит из кончика не мгновенно, а за
    // долю секунды (STREAM.emit), и чем позже вышла, тем медленнее летит
    // (STREAM.slow — во сколько раз хвост ленты медленнее головы). Отсюда
    // вся форма: сначала лента тянется от кончика, потом отрывается от него
    // и вытягивается по дуге, потому что голова уходит вперёд.
    //
    // Точка ленты u (0 — голова, 1 — самый хвост) — это частица, вылетевшая
    // позже на u·emit со скоростью (1 − (1 − slow)·u). Её место — формула
    // баллистики от момента вылета, без шагов и без хранения: лента из
    // десяти точек стоит десять формул за кадр.
    //
    // Голова — это та самая капля, по которой считается попадание, и её путь
    // обязан совпадать с калькулятором (LustShot.fly). Поэтому ленту строит
    // формула, а к голове она лишь подтягивается поправкой: шаги полёта
    // головы и точная формула за секунду расходятся на несколько единиц.
    // Первая подборка (0.12 с, хвост в 0.62 скорости) давала ленту в
    // полсотни единиц длиной и два десятка толщиной — короткий крючок, а не
    // струю. Струя читается струёй, когда она раз в пять-шесть длиннее
    // своей толщины.
    STREAM: { emit: 0.22, slow: 0.5, points: 12, pinch: 0.07, pieces: 6 },

    streamAt(d, u) {
        const S = d.stream, C = this.cfg(), T = this.STREAM;
        const k = 1 - (1 - T.slow) * u, tt = Math.max(0, d.t - u * T.emit);
        const g = C.gravity;
        // Поправка к голове: разница между шагами полёта и формулой.
        const hx = S.x0 + S.vx * d.t, hy = S.y0 + S.vy * d.t + 0.5 * g * d.t * d.t;
        const w = 1 - u;
        return { x: S.x0 + S.vx * k * tt + (d.x - hx) * w,
                 y: S.y0 + S.vy * k * tt + 0.5 * g * tt * tt + (d.y - hy) * w,
                 vx: S.vx * k, vy: S.vy * k + g * tt, out: d.t >= u * T.emit };
    },

    // Хвост ленты РВЁТСЯ: как только лента оторвалась от кончика, с её
    // заднего конца раз в pinch секунд отщипывается капля. Оторвавшаяся —
    // уже отдельная капля: своя скорость (та, с какой летел этот кусок
    // ленты), своя дуга, свой след. Лента после этого короче и тоньше: у
    // неё меньше массы и нет самого медленного хвоста.
    shedStream(d) {
        const S = d.stream, T = this.STREAM;
        if (d.shed >= T.pieces || d.t < T.emit + 0.04 || d.t - d.shedT < T.pinch) return;
        const q = this.streamAt(d, S.back);
        d.shed++;
        d.shedT = d.t;
        S.back = Math.max(0.2, S.back - 0.8 / T.pieces);
        this.spawnDrop(q.x, q.y, q.vx + (Math.random() - 0.5) * 30,
                       q.vy + (Math.random() - 0.5) * 30, 2.4 + Math.random() * 1.6);
    },

    // Голова приземлилась (в рот, на тело, на борт) — остаток ленты в
    // воздухе не исчезает, а распадается на капли, каждая со скоростью
    // своего куска. Иначе вся струя пропадала в одном кадре с головой.
    breakStream(d) {
        const S = d.stream;
        if (!S) return;
        for (const u of [S.back * 0.45, S.back]) {
            const q = this.streamAt(d, u);
            if (!q.out) continue;
            this.spawnDrop(q.x, q.y, q.vx, q.vy, 2.6 + 3 * S.back * (1 - u));
        }
        d.stream = null;
    },

    // Ось и полуширина ленты для рисунка. Голова тоньше, когда лента
    // растеряла массу; хвост скруглён и тонок — там она и рвётся.
    streamShape(d, scale) {
        const S = d.stream, T = this.STREAM, n = T.points;
        const pts = [], ws = [];
        const head = d.r * 0.72 * (0.85 + 0.15 * S.back);
        for (let i = 0; i < n; i++) {
            const u = S.back * i / (n - 1);
            const q = this.streamAt(d, u);
            pts.push(q);
            // Сужение — по ОСТАВШЕЙСЯ ленте: растеряв хвост, она всё равно
            // сужается к концу, а не становится палочкой ровной толщины.
            ws.push(head * (1 - 0.6 * Math.pow(u / S.back, 0.8)) * scale);
        }
        return BATH_ART.streamD(pts, ws, Math.atan2(S.vy, S.vx));
    },

    // ---------- ЖИВОЙ СЛОЙ ВЫСТРЕЛА: УЗЛЫ, А НЕ РАЗМЕТКА ----------
    // Капли в полёте и ползущие потёки меняются КАЖДЫЙ кадр. Пока слой
    // пересобирался строкой, браузер на каждом кадре заново разбирал
    // разметку, строил узлы и выбрасывал прежние — и всё это ради четырёх
    // сдвинувшихся эллипсов.
    //
    // Теперь узлы живут в пуле и переиспользуются: за кадр правится по
    // нескольку атрибутов, разбора разметки нет вовсе. Лишние узлы не
    // удаляются, а прячутся — удаление и создание стоят столько же, сколько
    // разбор, а капель за забег ровно столько же, сколько было.
    shotNode(kind, i, markup) {
        if (!this._pool) this._pool = {};
        const pool = this._pool[kind] || (this._pool[kind] = []);
        if (pool[i]) return pool[i];
        const layer = this.el('bt-shots');
        if (!layer) return null;
        layer.insertAdjacentHTML('beforeend', markup());
        pool[i] = layer.lastElementChild;
        return pool[i];
    },

    hideRest(kind, from) {
        const pool = (this._pool && this._pool[kind]) || [];
        for (let i = from; i < pool.length; i++) pool[i].setAttribute('display', 'none');
    },

    renderShots() {
        let flash = 0;
        for (const s of this.splats) {
            // Попадание: короткая вспышка в самой корзине рта.
            const n = this.shotNode('flash', flash++, () => BATH_ART.flashNode());
            if (!n) continue;
            const k = 1 - s.t / 0.45;
            n.setAttribute('cx', s.x.toFixed(1));
            n.setAttribute('cy', s.y.toFixed(1));
            n.setAttribute('r', (s.r * (1.6 - k)).toFixed(1));
            n.setAttribute('opacity', (k * 0.9).toFixed(2));
            n.removeAttribute('display');
        }
        this.hideRest('flash', flash);

        // Все капли в полёте — ОДНИМ путём: одна запись атрибута за кадр,
        // сколько бы их ни летело. С отрывающимися от кометы каплями их в
        // воздухе бывает под два десятка, и узел на каждую был бы два
        // десятка записей.
        // Тень — тот же путь со сдвигом узла. Ядро — та же комета, вдвое
        // тоньше: по оси струи жижа толще и мутнее, к краям просвечивает.
        // Блик — только у крупных.
        let d = '', core = '', hi = '';
        for (const q of this.drops) {
            if (q.stream) {
                d += this.streamShape(q, 1);
                core += this.streamShape(q, 0.5);
            } else {
                // Мелкая капля — капля, а не шип: хвост по её следу
                // сужается вдвое, а не в точку, и кончик скруглён.
                const pts = [q].concat(q.trail), n = pts.length - 1;
                const ws = pts.map((_, i) => q.r * (1 - 0.55 * (n ? i / n : 0)));
                const dir = Math.atan2(q.vy, q.vx);
                d += BATH_ART.streamD(pts, ws, dir);
                core += BATH_ART.streamD(pts, ws.map(w => w * 0.55), dir);
            }
            if (q.r > 5) hi += BATH_ART.cometHi(q.x, q.y, q.r);
        }
        this.setFly(d, hi, core);
    },

    setFly(d, hi, core) {
        for (const [id, v] of [['bt-fly', d], ['bt-fly-sh', d], ['bt-fly-hi', hi],
                               ['bt-fly-core', core || '']]) {
            const n = this.el(id);
            if (n && n.getAttribute('d') !== v) n.setAttribute('d', v);
        }
    },

    // Уровень жидкости во рту. Отдельным методом, потому что его дёргают из
    // двух мест: полёт капель и сброс на старте забега.
    setMouthFill(k) {
        if (!this.wormHandle || !this.wormHandle.setLivePose) return;
        const v = Math.max(0, Math.min(1, k || 0));
        if (v === this.mouthFill) return;
        this.mouthFill = v;
        this.wormHandle.setLivePose({
            mouthFill: v, mouthFillColor: PALETTE.bathScene.milk[500] });
    },

    // ---------- ВХОД В МАГАЗИН ----------
    // Только до забега и после него: «готовятся до, тратят после»
    // (docs/plan/21-lust-bath.md, разд. 6). Кнопка не просто глохнет, а
    // УХОДИТ с экрана — неживая кнопка посреди мытья читалась бы поломкой.
    shopAllowed() {
        return this.phase === 'idle' || this.phase === 'done';
    },

    syncShopButton() {
        if (!this.shopBtn) this.shopBtn = document.getElementById('bt-shop-btn');
        if (this.shopBtn) this.shopBtn.classList.toggle('on', this.shopAllowed());
    },

    // ---------- КУПЛЕННЫЕ СТУПЕНИ ----------
    // Один вход на все четыре полки магазина. Читается КАЖДЫЙ РАЗ, а не
    // запоминается на входе в забег: покупка случается между забегами, и
    // кешированное здесь значение отстало бы ровно на один заход.
    //
    // Backend.upgradeValue отдаёт ЗНАЧЕНИЕ ступени, а не прибавку, — у
    // хвоста это объект из шести чисел, у мыла и мочалки одно число.
    up(key, fallback) {
        if (typeof Backend === 'undefined' || !Backend.upgradeValue) return fallback;
        const v = Backend.upgradeValue('lust', key);
        return (v === 0 || v) ? v : fallback;
    },

    // Ступень хвоста: толчки, сила, разброс и послушность одной записью.
    // Почему одной, а не четырьмя полками — в комментарии у лестницы
    // (src/config/economy.js, ECONOMY.minigames.lust.upgrades.tail).
    tailTier() {
        return this.up('tail', { shots: 10, minPower: 0, maxPower: 0.9,
                                 spread: 45, gain: 0.35, relax: 0.30 }) || {};
    },

    // Цены делений шкалы: сколько попаданий стоит каждое. Набираются по
    // порядку и с нуля (LustShot.gaugeState).
    gaugeSteps() {
        return this.cfg().gauge || [2, 5, 8];
    },

    // Шкала над головой — жетон из трёх частей разной цены. Рисуется
    // заново на каждое попадание: попаданий за забег не больше двадцати, и
    // строка в шестьдесят узлов раз в полсекунды ничего не стоит.
    drawGauge() {
        const m = this.mouthPoint();
        // Над головой, считая от ВЕРХА нарисованного червя: доля от холста
        // персонажа уводила шкалу за кадр, стоило поменять его посадку.
        const top = this.coverBox().y;
        this.el('bt-gauge').innerHTML =
            BATH_ART.gauge(m.x, top - 40, this.gaugeSteps(), this.hits);
    },

    // Дыхание живёт ДОЛЬШЕ остальных часов: оно продолжается и на итоговом
    // экране — червь только что отработал, ему есть от чего отдышаться.
    // Поэтому гасится оно не в stopClocks, а на входе и выходе из игры.
    stopPanting() {
        if (this.pantRaf) { cancelAnimationFrame(this.pantRaf); this.pantRaf = 0; }
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ breathAmp: null, breathSpeed: null });
    },

    stopClocks() {
        if (this.fillRaf) { cancelAnimationFrame(this.fillRaf); this.fillRaf = 0; }
        if (this.aimRaf) { cancelAnimationFrame(this.aimRaf); this.aimRaf = 0; }
        if (this.camTimer) { this.endCamMove(); }
        if (this.rubRaf) { cancelAnimationFrame(this.rubRaf); this.rubRaf = 0; }
        if (this.blurRaf) { cancelAnimationFrame(this.blurRaf); this.blurRaf = 0; }
        if (this.settleRaf) { cancelAnimationFrame(this.settleRaf); this.settleRaf = 0; }
        if (this.relaxRaf) { cancelAnimationFrame(this.relaxRaf); this.relaxRaf = 0; }
        clearTimeout(this.shotTimer); this.shotTimer = 0;
        this.clearHint();
    },

    done() {
        this.phase = 'done';
        this.stopClocks();
        this.relaxTail();
        const sections = LustShot.gaugeState(this.hits, this.gaugeSteps()).done;
        // Мини-игра НИЧЕГО не начисляет сама (инвариант 2): она сообщает,
        // сколько частей жетона закрыто, а что за это дать — решает конфиг
        // наград (осколок за каждую).
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'bath', outcome: 'win',
            meta: { hits: this.hits, sections, shots: this.tailTier().shots || 10 }
        });
        this.syncShopButton();
    },

    // Забег кончился — хвост опадает: сдувается до исходного размера и
    // выпрямляется. Замерший в согнутом положении налитый хвост читался
    // зависшей игрой: всё остановилось, а он всё ещё стоит под нагрузкой.
    //
    // Заряд и изгиб — те же два числа, что рисуют хвост весь забег, так что
    // ничего особенного тут нет: их просто ведут к нулю.
    relaxTail() {
        const from = this.charge, bend0 = this.bend, DUR = 900;
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / DUR);
            const e = 1 - Math.pow(1 - k, 3);
            this.charge = from * (1 - e);
            this.bend = bend0 * (1 - e);
            // Последний кадр опадания — начисто (force): иначе частота
            // перерисовки хвоста могла бы его пропустить, и хвост вместе с
            // пятнами на нём застыл бы чуть согнутым.
            this.drawTail(k >= 1);
            this.relaxRaf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        this.relaxRaf = requestAnimationFrame(step);
    },
});

// Запуск игры — здесь, а не в lust.js: этот файл подключается последним из
// продолжений LustMinigame, и к init() все методы уже на месте.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LustMinigame.init());
} else {
    LustMinigame.init();
}
