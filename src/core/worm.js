// ================= ГЛАВНЫЙ ЭКРАН: МОНТАЖ СВИНОЧЕРВЯ =================
// Раньше здесь была вся отрисовка на Canvas. Теперь вся отрисовка живёт в
// WormRenderer (src/core/worm-renderer.js) и работает с общей моделью
// персонажа (src/core/worm-model.js) — тем же кодом, что используют и
// мини-игры. Этот файл только загружает модель игрока и монтирует рендерер
// в контейнер главного экрана.

let MainWormHandle = null;

// Отметины из состояния игрока. Состояния может не быть вовсе (мини-игра
// монтирует червя у себя, отдельный экран) — тогда просто пустой список.
function wormMarksFromState() {
    if (typeof GameState === 'undefined' || !GameState.data) return [];
    return GameState.data.scars || [];
}

// Перерисовать червя с актуальными отметинами. Дёргается, когда появилась
// новая: пересборка SVG — вещь недешёвая, поэтому по событию, а не по
// таймеру и не на каждое сохранение состояния.
function refreshWormMarks() {
    if (!MainWormHandle) return;
    MainWormHandle.setOverride({ scars: wormMarksFromState() });
}

function initWorm() {
    try {
        // Без этих двух файлов (и соответствующих <script> в index.html)
        // рендерер персонажа работать не может — сообщаем об этом явно
        // через alert(), раз консоль недоступна (iPhone/Safari).
        if (!window.WormModelAPI) {
            alert('Свиночервь: не найден src/core/worm-model.js — проверь, что файл добавлен в репозиторий и подключён в index.html до worm.js.');
            return;
        }
        if (!window.WormRenderer) {
            alert('Свиночервь: не найден src/core/worm-renderer.js — проверь, что файл добавлен в репозиторий и подключён в index.html до worm.js.');
            return;
        }

        let container = document.getElementById('worm-stage');

        // Совместимость: если разметка ещё не обновлена и в HTML остался
        // старый <canvas id="gameCanvas">, сами подменяем его на
        // div-контейнер — ничего вручную в index.html менять не обязательно.
        if (!container) {
            const legacyCanvas = document.getElementById('gameCanvas');
            if (legacyCanvas) {
                container = document.createElement('div');
                container.id = 'worm-stage';
                legacyCanvas.replaceWith(container);
            }
        }
        if (!container) {
            alert('Свиночервь: не найден контейнер #worm-stage (и старого #gameCanvas тоже нет) — проверь разметку index.html внутри #game-container.');
            return;
        }

        // Критичные для видимости стили выставляем прямо здесь, а не
        // полагаемся только на style.css — так персонаж не пропадёт, даже
        // если CSS-файл ещё не подтянул правило под #worm-stage.
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        if (!container.style.zIndex) container.style.zIndex = '1';
        if (!container.style.background) {
            container.style.background = 'radial-gradient(circle, #3a3a3a 0%, #1a1a1a 100%)';
        }

        const model = window.WormModelAPI.loadWormModel();

        // Внешность червя (модель) и его летопись (отметины) — разные вещи и
        // хранятся раздельно: модель это «как он устроен», отметины — «что с
        // ним было». Правда об отметинах живёт в состоянии игрока, а сюда
        // они попадают только на время отрисовки.
        model.scars = wormMarksFromState();

        MainWormHandle = window.WormRenderer.mount(container, model, {
            context: 'main',
            wander: true,
            // Главный экран — комната с полом в перспективе.
            room: true,
            blink: true,
            anchorX: 0.5,
            anchorY: 0.55
        });

        window.MainWormHandle = MainWormHandle;
    } catch (err) {
        // Любая другая ошибка внутри рендера — тоже наружу через alert(),
        // чтобы можно было прочитать текст без доступа к консоли браузера.
        alert('Свиночервь: ошибка при отрисовке — ' + (err && err.message ? err.message : err));
        console.error(err);
    }
}
