// ================= ЧЕРВЬ: ПУБЛИЧНЫЙ HANDLE ЭКЗЕМПЛЯРА =================
// То, что WormRenderer.mount возвращает мини-играм и главному экрану:
// update/setOverride/setLivePose/setPose/setDigestion/setRoomObjects/destroy и
// остальное. Текст перенесён из mount как есть; всё, чем методы пользуются
// из экземпляра, приходит параметром. Имена методов — публичный API, их не
// переименовывать (их зовут мини-игры, инспектор, студия, тесты).
function createWormHandle({ GEOM_LADDER, container, mergedModel, objectLayer, onResize, onStageDown, onStageMove, onStageUp, opts, paintBolus, rebuild, roomLayer, rootTransform, state, svg, tick, updateFood, walkTo, witherPaint, worldLayer }) {
    return {
        update(newModel) {
            state.baseModel = newModel;
            rebuild();
        },
        setOverride(patch) {
            state.override = patch;
            rebuild();
        },
        // ---------- ЧТО СЕЙЧАС НА ЭКРАНЕ ----------
        // Модель ПОСЛЕ наложения оверрайда — то есть та, по которой
        // персонаж нарисован прямо сейчас, а не сохранённая базовая.
        // Разница не теоретическая: в лобби гнева оверрайд подменяет
        // половину внешности, и инспектор, спросивший loadWormModel(),
        // показывал бы числа не того червя, на которого смотрят.
        //
        // Снимок, а не ссылка: mergeWormOverride базу не мутирует и
        // возвращает новый объект, поэтому правка возвращённого ничего
        // не меняет на экране. Менять надо через setOverride/setLivePose.
        getModel() {
            return mergedModel();
        },
        // Чужой оверрайд — тот, что поставила мини-игра. Нужен пульту:
        // setOverride ЗАМЕНЯЕТ патч целиком, а не сливает, и пульт,
        // положивший свой патч не глядя, стёр бы подмену внешности,
        // которую делает лобби гнева. Своё он кладёт ПОВЕРХ этого.
        getOverride() {
            return state.override || null;
        },
        // ---------- МОДЕЛЬ БЕЗ ОВЕРРАЙДА ----------
        // Исходная, «как задумано». Нужна пульту, и без неё он считал
        // от ТОГО, ЧТО САМ ЖЕ НАПИСАЛ: ползунок стоял на +0.5, а голова
        // на каждом его движении множилась ещё раз — 1.5, 2.25, 3.375.
        // Относительная ручка обязана отсчитывать от неподвижной точки,
        // иначе она не ручка, а педаль газа.
        getBaseModel() {
            return state.baseModel;
        },
        // Живые каналы целиком — их значения не лежат в модели, а
        // мини-игра могла перехватить любой (см. setLivePose).
        getLivePose() {
            return Object.assign({}, state.livePose);
        },
        setPose(name) {
            setAttr(svg, 'data-pose', name || '');
        },
        // Повернуть голову в именованную позу: 'left' | 'center' | 'right'.
        // Голова доедет туда сама, за кадры — без пересборки SVG.
        // Можно передать и число (-1..1), если нужна произвольная точка
        // оси, например слежение за курсором.
        setHeadPose(pose, opts) {
            // 'auto' — вернуть управление автоматике (голова снова
            // следит за направлением ползания).
            if (pose === 'auto' || pose == null) {
                state.headYawAuto = true;
                state.headYawTarget = null;
                return;
            }
            // Зажим по ЕДИНОМУ пределу (worm-paint.js): дальше голова не
            // поворачивается ни у кого — ни у автоповорота, ни у поз, ни
            // у ползунка в студии.
            const v = typeof pose === 'number'
                ? wormClampYaw(pose)
                : (WORM_HEAD_POSES[pose] != null ? WORM_HEAD_POSES[pose] : 0);
            state.headYawAuto = false;
            state.headYawTarget = v;
            state.livePose.headYaw = null; // именованная поза перебивает ручной канал
            // instant: встать в позу без переходной анимации.
            if (opts && opts.instant) state.headYawCurrent = v;
        },
        getHeadPose() {
            return {
                current: state.headYawCurrent,
                target: state.headYawTarget,
                // Предел отдаётся наружу, чтобы студия не заводила своё
                // число: два предела рано или поздно разъедутся.
                limit: WORM_HEAD_YAW_LIMIT,
                poses: Object.assign({}, WORM_HEAD_POSES)
            };
        },
        setLivePose(patch) {
            // Изменение живого канала обязано попасть в ближайший же
            // кадр: мини-игра ведёт хвост за пальцем, и пропуск кадра
            // здесь читается как задержка управления. Но именно
            // ИЗМЕНЕНИЕ: если мини-игра каждый кадр присылает те же
            // значения, деформация остаётся на своей ступени.
            if (patch) {
                for (const k in patch) {
                    if (state.livePose[k] !== patch[k]) { state.geomDirty = true; break; }
                }
            }
            Object.assign(state.livePose, patch);
            // Степень просвечивания органов — единственный "живой"
            // параметр, который нельзя поменять одним transform: он
            // задан непрозрачностью слоя. Меняем её точечно, без
            // пересборки SVG (тот же принцип "не трогаем DOM зря").
            if (patch && patch.organVisibility !== undefined && state.built) {
                const layers = state.built.root.querySelectorAll('.worm-organ-layer');
                const m = mergedModel();
                const base = (m.anatomy && m.anatomy.organs && m.anatomy.organs.visibility != null)
                    ? m.anatomy.organs.visibility : 0.55;
                for (let i = 0; i < layers.length; i++) {
                    const host = layers[i].closest('[data-anat]');
                    const partName = host ? host.getAttribute('data-anat') : null;
                    const thin = partName && m.anatomy
                        ? anatThinness(m.anatomy, partName, (m.growingSegments || []).length) : 1;
                    const vis = patch.organVisibility != null ? patch.organVisibility : base;
                    setAttr(layers[i], 'opacity', clamp01(vis * thin).toFixed(3));
                }
            }
        },
        // Переключение опций монтирования на ходу. Пока нужна ровно одна
        // пара — wander и blink: мёртвый червь не бродит по комнате и не
        // моргает, а перемонтировать его ради этого значило бы собрать
        // весь SVG заново. Опции читаются в tick() каждый кадр, поэтому
        // достаточно их подменить.
        setOptions(patch) {
            Object.assign(opts, patch);
        },
        // Сменить локацию. Перестраивается ТОЛЬКО слой комнаты: персонаж,
        // след слизи и предметы на полу к ней не привязаны, а геометрия
        // коробки у всех локаций общая — значит червь остаётся стоять
        // ровно там же, где стоял, и заново собирать его незачем.
        setLocation(key) {
            if (!opts.room || !state.room) return false;
            if (typeof RoomLocations === 'undefined' || !RoomLocations.has(key)) return false;
            state.location = key;
            buildRoom(roomLayer, state.room, key);
            return true;
        },
        getLocation() {
            return state.location;
        },
        // Отправить червя в точку пола (в единицах холста). Тот же путь,
        // которым идёт тап игрока: точка вписывается в допустимую область.
        walkTo,
        // Истощение: 1 = здоровый цвет, 0 = полностью обесцвечен.
        // Показанное значение догоняет это за кадры — вызывающему не надо
        // сглаживать самому.
        setWither(saturation) {
            state.witherTarget = Math.max(0, Math.min(1, saturation));
        },
        // ---------- ШАГ НА МЕСТЕ ----------
        // «Иди со скоростью v, оставаясь на месте»: 0 — стоит, 1 — идёт
        // в полную силу. Перемещения не даёт вовсе — двигать сцену под
        // персонажем должна сама мини-игра. Сделано отдельным каналом, а
        // не включением wander: wander тянет за собой выбор целей, дугу
        // разворота, слизистый след и привязку к полу комнаты — на
        // дорожке тщеславия не нужно ничего из этого.
        setTreadmill(v) {
            state.treadmill = Math.max(0, Math.min(1, Number(v) || 0));
        },
        // Точечная перестановка "точки стояния" персонажа уже ПОСЛЕ
        // монтирования — нужна мини-играм, где раскладку нельзя выразить
        // одним фиксированным anchorX/anchorY.
        setPosition(x, y) {
            state.wormX = x;
            state.wormY = y;
            state.targetX = x;
            state.targetY = y;
            if (state.built) setAttr(state.built.root, 'transform', rootTransform());
        },
        getPosition() {
            return { x: state.wormX, y: state.wormY };
        },
        // Что сейчас у персонажа с кадрами: сглаженная длительность кадра
        // страницы и ступень разрежения деформации (1 = деформация в
        // каждом собственном кадре). Нужно инструментам техосмотра —
        // иначе про лестницу можно узнать только по косвенным признакам.
        getFrameStats() {
            return {
                frameMs: +(state.frameMs || 0).toFixed(1),
                geomLevel: state.geomLevel,
                geomPart: GEOM_LADDER[state.geomLevel].join('/'),
                geomFrames: state.geomFrames || 0,
                frameHz: opts.frameHz
            };
        },

        // Где сейчас конкретная часть тела — в координатах сцены.
        // Нужно тому, кто кладёт что-то рядом с червём: «под хвостом»
        // нельзя посчитать снаружи, потому что тело поворачивается по
        // ходу движения, а хвост уезжает за ним.
        // Точка части тела в координатах КОМНАТЫ — тех же, в которых
        // работают getPosition/setPosition и всё остальное снаружи.
        //
        // Пересчёт идёт в систему worldLayer, а НЕ svg. Разница появилась
        // вместе с камерой: worldLayer сдвинут на -camX, и пересчёт в
        // систему svg давал бы ЭКРАННЫЕ координаты. По этой точке
        // кладутся кучки на пол, а рисуются они внутри worldLayer — то
        // есть в комнате, — и кучка ложилась бы мимо червя ровно на сдвиг
        // камеры. Там, где комнаты нет (мини-игры), worldLayer без
        // трансформации и обе системы совпадают.
        getPartPoint(partName) {
            const el = svg.querySelector(`[data-part="${partName}"]`);
            if (!el || !el.getScreenCTM || !worldLayer.getScreenCTM) {
                return { x: state.wormX, y: state.wormY };
            }
            try {
                const box = el.getBBox();
                const pt = svg.createSVGPoint();
                pt.x = box.x + box.width / 2;
                pt.y = box.y + box.height / 2;
                // Порядок умножения важен: нужно СНАЧАЛА перевести точку
                // из части в экран (el), и только потом из экрана в
                // worldLayer (обратная матрица). Это W⁻¹ × E, а не
                // E × W⁻¹.
                //
                // Ошибка не всплывала годами, потому что обе матрицы были
                // переносами, а переносы переставимы. Сломалось на первом
                // же зеркальном персонаже (opts.flip у противника в
                // гневе): scale(-1,1) с переносом не переставляется, и
                // точка части уезжала за пределы сцены.
                const local = pt.matrixTransform(worldLayer.getScreenCTM().inverse().multiply(el.getScreenCTM()));
                return { x: local.x, y: local.y };
            } catch (err) {
                return { x: state.wormX, y: state.wormY };
            }
        },

        // ---------- ПИЩЕВАРЕНИЕ ----------
        // Рендерер не считает время и не знает про еду ничего, кроме
        // «нарисуй комки вот в этих точках тракта». Куда они доехали —
        // считает вызывающий по метке времени кормёжки (worm.js).
        //
        //   boluses    — [{ s: 0..1 вдоль тракта, size: доля толщины }]
        //   stomachFill — 0..1, насколько наполнен желудок
        setDigestion(data) {
            const d = data || {};
            const tract = state.built && state.built.gutTract;
            state.digest.stomachFill = Math.max(0, Math.min(1, d.stomachFill || 0));
            if (tract && tract.foodLayer) {
                const list = d.boluses || [];
                state.digest.boluses = list;
                state.digest.scale = d.scale || 7;

                // Узлы переиспользуются: комков три-четыре, создавать их
                // заново каждый кадр незачем.
                while (tract.foodNodes.length < list.length) {
                    const ref = createBolusNode(tract.color);
                    paintBolus(ref);
                    tract.foodLayer.appendChild(ref.group);
                    tract.foodNodes.push(ref);
                }
                // Размер и цвет переставляются ЗДЕСЬ, а не в кадре: список
                // еды меняется раз в несколько секунд, а кадров за это
                // время сотни.
                for (let i = 0; i < tract.foodNodes.length; i++) {
                    const ref = tract.foodNodes[i], b = list[i];
                    if (!b) continue;
                    const size = (b.size || 1) * state.digest.scale;
                    if (ref.size === size && !b.color) continue;
                    ref.size = size;
                    setAttr(ref.wall, 'rx', (size * 1.85).toFixed(1));
                    setAttr(ref.wall, 'ry', (size * 1.4).toFixed(1));
                    setAttr(ref.body, 'rx', (size * 1.4).toFixed(1));
                    setAttr(ref.body, 'ry', size.toFixed(1));
                    setAttr(ref.shine, 'rx', (size * 0.52).toFixed(1));
                    setAttr(ref.shine, 'ry', (size * 0.3).toFixed(1));
                    setAttr(ref.shine, 'cx', (size * 0.36).toFixed(1));
                    setAttr(ref.shine, 'cy', (-size * 0.42).toFixed(1));
                    setAttr(ref.chunkA, 'rx', (size * 0.42).toFixed(1));
                    setAttr(ref.chunkA, 'ry', (size * 0.34).toFixed(1));
                    setAttr(ref.chunkA, 'cx', (-size * 0.5).toFixed(1));
                    setAttr(ref.chunkA, 'cy', (size * 0.24).toFixed(1));
                    setAttr(ref.chunkB, 'rx', (size * 0.3).toFixed(1));
                    setAttr(ref.chunkB, 'ry', (size * 0.26).toFixed(1));
                    setAttr(ref.chunkB, 'cx', (size * 0.44).toFixed(1));
                    setAttr(ref.chunkB, 'cy', (size * 0.3).toFixed(1));
                    // Перетяжка стоит позади комка: он движется вдоль
                    // +X собственной системы (её задаёт rotate по
                    // направлению кишки), значит «сзади» — это −X.
                    setAttr(ref.pinch, 'cx', (-size * 1.75).toFixed(1));
                    setAttr(ref.pinch, 'rx', (size * 0.42).toFixed(1));
                    setAttr(ref.pinch, 'ry', (size * 1.35).toFixed(1));
                    if (b.color) { ref.base.body = b.color; setAttr(ref.body, 'fill', witherPaint(b.color)); }
                }
                // Комки едут покадрово (updateFood), но первый кадр после
                // смены списка рисуем сразу: иначе новый комок появится
                // в точке предыдущего.
                updateFood(0);
            }

            // Наполненный желудок слегка раздувается — но остаётся
            // желудком, а не превращается в шар. Узел ищется один раз на
            // сборку тела: querySelector по семи сотням узлов пятнадцать
            // раз в секунду — ровно та мелочь, из которой складываются
            // потерянные кадры.
            if (state.stomachContent === undefined && state.built && state.built.root) {
                state.stomachContent = state.built.root.querySelector('.worm-stomach-content') || null;
            }
            const content = state.stomachContent;
            if (content) {
                const fill = state.digest.stomachFill;
                const fx = parseFloat(content.getAttribute('data-full-rx')) || 0;
                const fy = parseFloat(content.getAttribute('data-full-ry')) || 0;
                setAttr(content, 'rx', (fx * fill).toFixed(1));
                setAttr(content, 'ry', (fy * fill).toFixed(1));
            }
        },

        // ---------- ЧТО ЛЕЖИТ НА ПОЛУ ----------
        // Комната принадлежит рендереру, поэтому и предметы в ней рисует
        // он: тогда они живут в тех же координатах и получают ту же
        // перспективу, что и персонаж.
        setRoomObjects(list) {
            const layer = objectLayer;
            if (!layer) return;
            while (layer.firstChild) layer.removeChild(layer.firstChild);

            state.roomObjects = (list || []).filter(o => o.x != null && o.y != null);
            state.roomObjects.forEach(obj => {
                const depthScale = (opts.room && state.room)
                    ? roomCharScaleAt(roomDepthAt(state.room, obj.y)) : 1;
                const g = buildPoopNode(obj, depthScale);
                setAttr(g, 'data-poop-id', obj.id);
                g.style.cursor = 'pointer';

                // Обработчик висит на самом предмете, а не считает
                // попадание по координатам. Разница видна, когда червь
                // стоит над кучкой: событие достаётся ему, и убрать
                // кучку нельзя, пока он не отойдёт. Так и задумано —
                // тело физически загораживает пол, а тап по самому
                // червю в будущем станет способом с ним повозиться.
                g.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    if (typeof opts.onRoomObjectTap === 'function') opts.onRoomObjectTap(obj.id);
                });
                layer.appendChild(g);
            });
        },
        // Прямой доступ к SVG для точечных вещей (хит-тест по конкретной
        // части, разовая подстройка стиля мини-игрой). Ищи части по
        // '[data-part="tail"]', '[data-part="belly"]' и т.п.
        svgRoot: svg,
        getMergedModel: mergedModel,

        // ---------- ПАУЗА ----------
        // Остановить кадровый цикл, не разбирая персонажа.
        //
        // Зачем: у рендерера уже есть проверка «сцену не видно» (см.
        // isStageVisible), но она ловит только спрятанное стилями или
        // выкинутое из документа. Персонаж главного экрана под ОТКРЫТОЙ
        // мини-игрой по всем признакам виден — его просто закрыли сверху
        // непрозрачным окном. И он продолжает считать кадры: на медленном
        // телефоне в бою гнева это третий живой червь поверх двух бойцов.
        //
        // Метка времени сбрасывается, иначе после паузы dt окажется равным
        // всей паузе и персонаж прыгнет.
        // Частота пересчёта персонажа НА ХОДУ. Мини-игра знает то, чего
        // не знает рендерер: сейчас червь — герой кадра или фон за
        // хвостом. Замер на айфоне: в ванной на наезде живой персонаж
        // стоил 36 кадров из 60, а замерший — ноль.
        setFrameHz(hz) {
            opts.frameHz = (hz > 0) ? hz : 0;
        },

        setPaused(paused) {
            if (paused) {
                if (state.rafId) {
                    cancelAnimationFrame(state.rafId);
                    state.rafId = null;
                }
            } else if (!state.rafId) {
                state.lastFrameTs = 0;
                // Метки времени кадра и деформации тоже сбрасываются:
                // иначе первый же кадр после паузы получит dt длиной во
                // всю паузу, и дыхание с вилянием прыгнут вперёд.
                state.rafPrevTs = null;
                state.lastGeomTs = null;
                state.geomDirty = true;
                state.rafId = requestAnimationFrame(tick);
            }
        },

        destroy() {
            if (state.rafId) cancelAnimationFrame(state.rafId);
            window.removeEventListener('resize', onResize);
            svg.removeEventListener('pointerdown', onStageDown);
            svg.removeEventListener('pointermove', onStageMove);
            svg.removeEventListener('pointerup', onStageUp);
            svg.removeEventListener('pointercancel', onStageUp);
            container.innerHTML = '';
        }
    };
}
