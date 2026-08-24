// ================= ЭКРАН ЗАГРУЗКИ: ЧЁРНАЯ ПЕЛЕНА И ОТКРЫТИЕ КРУГОМ =========
// Игровой логики здесь нет. Этот файл отвечает на вопрос «что игрок видит,
// пока игра ещё не готова показаться».
//
// ---------- ЗАЧЕМ ----------
// До него запуск с домашнего экрана выглядел как двойная загрузка: экран
// показывал игру, моргал и показывал её ещё раз. Причина — не кеш телефона,
// а перезагрузка страницы при смене service worker'а (см. boot.js): свежая
// сборка приезжает после того, как игра уже нарисовалась. Прятать саму
// перезагрузку нельзя, она нужна, а вот прятать её ОТ ГЛАЗ — можно: пока
// висит пелена, любые пересборки экрана происходят под чернотой.
//
// Плюс запас на будущее: игра будет тяжелеть, и «пусто → внезапно всё» —
// худший вариант появления. Лучше секунда честной черноты и театральное
// открытие.
//
// ---------- КАК ЭТО УСТРОЕНО ----------
// Никакого отдельного оверлея-дива нет, и это осознанно: любой лишний слой
// поверх игры — это ещё один кандидат перехватить тап и остаться висеть
// невидимым. Вместо него — два состояния на <html>:
//
//   .boot-veil  — фон документа чёрный, а #game-container обрезан в точку
//                 (clip-path: circle(0%)). Экран чёрный, но игра под ним
//                 живёт, считает и рисует первый кадр.
//   .boot-open  — радиус круга едет до 150%, игра проявляется из центра.
//                 После анимации ОБА класса снимаются, clip-path исчезает
//                 совсем — на мини-игры (они position:fixed внутри
//                 контейнера) обрезка уже не влияет.
//
// Файл подключается ПЕРВЫМ в <head> и сам вставляет свои стили: пелена
// должна накрыть первый кадр, а не появиться после загрузки style.css.
// Если файл не подключился или сломался — класса нет, игра просто видна
// сразу. Это штатная деградация, чёрного экрана навсегда быть не должно.
//
// ---------- КТО СНИМАЕТ ПЕЛЕНУ ----------
// Не таймер, а список «держателей» (holds). Пелена уходит, когда список
// пуст И прошло минимум времени черноты. Держат:
//   'document' — до window.load (стили, скрипты, картинки);
//   'game'     — до первого нарисованного кадра свиночервя (main.js);
//   'sw'       — пока ставится новая сборка (boot.js), чтобы перезагрузка
//                случилась под пеленой.
// Сверху всего этого — предохранитель HARD_CAP_MS: что бы ни зависло,
// пелена уйдёт. Забытый hold не должен запирать игру.
(function () {
    const REVEAL_MS = 1100;     // сколько раскрывается круг
    const MIN_BLACK_MS = 900;   // минимум черноты, чтобы открытие читалось
    const HARD_CAP_MS = 7000;   // предохранитель: дальше показываем как есть
    const COVER_MS = 300;       // затемнение перед перезагрузкой на ходу

    const root = document.documentElement;
    const startedAt = Date.now();

    // Уважаем системную настройку «меньше движения»: там круг не едет, а
    // чернота просто уходит.
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealMs = calm ? 200 : REVEAL_MS;

    // Цвет пульсации — PALETTE.flesh[500] (#a75863). Продублирован числом
    // намеренно: палитра грузится позже, а пелена нужна с первого кадра.
    const style = document.createElement('style');
    style.id = 'boot-screen-style';
    style.textContent = `
        html.boot-veil, html.boot-veil body { background: #000; }

        html.boot-veil #game-container {
            -webkit-clip-path: circle(0% at 50% 50%);
            clip-path: circle(0% at 50% 50%);
        }

        html.boot-veil.boot-open #game-container {
            -webkit-clip-path: circle(150% at 50% 50%);
            clip-path: circle(150% at 50% 50%);
            -webkit-transition: -webkit-clip-path ${revealMs}ms cubic-bezier(0.22, 0.61, 0.36, 1);
            transition: clip-path ${revealMs}ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }

        /* Пульс включается с задержкой: быстрый запуск остаётся просто
           чёрным, а долгое ожидание перестаёт выглядеть зависанием. */
        html.boot-veil::after {
            content: '';
            position: fixed;
            left: 50%;
            top: 50%;
            width: 140px;
            height: 140px;
            margin: -70px 0 0 -70px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(167, 88, 99, 0.45) 0%, rgba(167, 88, 99, 0) 70%);
            opacity: 0;
            pointer-events: none;
            z-index: 2147483646;
            animation: boot-veil-pulse 2.2s ease-in-out 1.3s infinite;
        }

        html.boot-veil.boot-open::after {
            animation: boot-veil-out 220ms linear forwards;
        }

        @keyframes boot-veil-pulse {
            0%, 100% { opacity: 0.12; transform: scale(0.85); }
            50%      { opacity: 0.55; transform: scale(1.08); }
        }

        @keyframes boot-veil-out {
            to { opacity: 0; }
        }

        /* Затемнение перед перезагрузкой на ходу (новая сборка приехала,
           пока игрок играл): не моргаем, а уходим в черноту. */
        #boot-cover {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #000;
            opacity: 0;
            z-index: 2147483647;
            pointer-events: auto;
            transition: opacity ${COVER_MS}ms linear;
        }
        #boot-cover.on { opacity: 1; }
    `;
    (document.head || root).appendChild(style);
    root.classList.add('boot-veil');

    const holds = new Set(['document', 'game']);
    let state = 'veiled';   // veiled → opening → done
    let minBlackTimer = null;

    const capTimer = setTimeout(() => {
        // Что-то не отпустило свой hold. Показать игру важнее, чем дождаться.
        if (holds.size) console.warn('[Пелена] снята по таймауту, держали:', Array.from(holds));
        open();
    }, HARD_CAP_MS);

    function open() {
        if (state !== 'veiled') return;
        state = 'opening';
        clearTimeout(capTimer);
        clearTimeout(minBlackTimer);

        root.classList.add('boot-open');

        setTimeout(() => {
            // Снимаем оба класса: clip-path не должен пережить открытие,
            // иначе он продолжит резать position:fixed мини-игры.
            root.classList.remove('boot-veil', 'boot-open');
            state = 'done';
            document.dispatchEvent(new CustomEvent('boot:revealed'));
        }, revealMs + 60);
    }

    function maybeOpen() {
        if (state !== 'veiled' || holds.size) return;
        const waited = Date.now() - startedAt;
        if (waited >= MIN_BLACK_MS) {
            open();
        } else {
            clearTimeout(minBlackTimer);
            minBlackTimer = setTimeout(maybeOpen, MIN_BLACK_MS - waited);
        }
    }

    window.BootScreen = {
        // Задержать открытие. Токен — строка, повторный hold с тем же
        // токеном ничего не ломает.
        hold(token) {
            if (state === 'veiled') holds.add(token);
        },

        release(token) {
            if (!holds.delete(token)) return;
            maybeOpen();
        },

        // true, пока экран чёрный: boot.js по этому признаку решает, можно
        // ли перезагружаться молча.
        isVeiled() {
            return state === 'veiled';
        },

        // Перезагрузка на ходу: сначала уводим экран в чёрное, потом
        // reload. Новая страница поднимется уже под своей пеленой.
        coverThenReload() {
            if (state === 'veiled') {
                location.reload();
                return;
            }
            const cover = document.createElement('div');
            cover.id = 'boot-cover';
            (document.body || root).appendChild(cover);
            // Кадр на применение стартовой прозрачности, иначе браузер
            // склеит оба состояния и перехода не будет.
            requestAnimationFrame(() => {
                cover.classList.add('on');
                setTimeout(() => location.reload(), COVER_MS + 40);
            });
        }
    };

    if (document.readyState === 'complete') {
        window.BootScreen.release('document');
    } else {
        window.addEventListener('load', () => window.BootScreen.release('document'));
    }

    // Если на старте что-то упало, свой hold уже никто не отпустит. Держать
    // из-за этого чёрный экран до предохранителя — худшее, что можно
    // сделать: игрок увидит «приложение не запускается» вместо ошибки.
    // Поэтому на любой сбой открываемся сразу, что бы там ни было готово.
    const openAfterCrash = () => {
        holds.clear();
        setTimeout(maybeOpen, 150);
    };
    window.addEventListener('error', openAfterCrash);
    window.addEventListener('unhandledrejection', openAfterCrash);
})();
