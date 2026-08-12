// ================= ГЛОБАЛЬНЫЙ МЕНЕДЖЕР ИГРЫ (GAMEMANAGER) =================
const GameManager = {
    // Состояние шкал Смертных Грехов
    sins: {
        pride: { name: 'Гордыня', emoji: '👑', color: '#FFD700', value: 100, decay: 0.5 },
        greed: { name: 'Алчность', emoji: '💰', color: '#4CAF50', value: 100, decay: 0.7 },
        envy: { name: 'Зависть', emoji: '🍏', color: '#00FF7F', value: 100, decay: 0.4 },
        wrath: { name: 'Гнев', emoji: '🤬', color: '#FF3B30', value: 100, decay: 0.9 },
        lust: { name: 'Похоть', emoji: '💋', color: '#FF69B4', value: 100, decay: 0.8 },
        gluttony: { name: 'Чревоугодие', emoji: '🍖', color: '#FF9500', value: 100, decay: 1.2 },
        sloth: { name: 'Лень', emoji: '🦥', color: '#8E8E93', value: 100, decay: 0.3 }
    },

    init() {
        this.initUI();
        this.updateUI();
        this.setupEvents();

        // Запуск персонажа (Свиночервя)
        if (typeof initWorm === 'function') {
            initWorm();
        }

        // Запуск ежесекундного падения шкал
        setInterval(() => this.decaySins(), 500);
    },

    // Генерация шкал в HUD и в меню «Грехи»
    initUI() {
        const miniHud = document.getElementById('mini-hud');
        const sinsContainer = document.getElementById('sins-container');
        if (!miniHud || !sinsContainer) return;

        miniHud.innerHTML = '';
        sinsContainer.innerHTML = '';

        Object.keys(this.sins).forEach(key => {
            const sin = this.sins[key];
            
            // Кружок в верхнем HUD
            const circleHtml = `
                <div class="stat-circle" id="mini-${key}">
                    <svg viewBox="0 0 36 36">
                        <circle class="bg" cx="18" cy="18" r="16"></circle>
                        <circle class="progress" cx="18" cy="18" r="16" stroke="${sin.color}"></circle>
                    </svg>
                    <div class="emoji">${sin.emoji}</div>
                </div>
            `;
            miniHud.insertAdjacentHTML('beforeend', circleHtml);

            // Строка в полноэкранном меню
            const rowHtml = `
                <div class="sin-row">
                    <div class="sin-info">
                        <div class="sin-name"><span>${sin.emoji} ${sin.name}</span></div>
                        <div class="sin-bar-container">
                            <div class="sin-bar" id="bar-${key}" style="background-color: ${sin.color}"></div>
                            <div class="sin-value" id="val-${key}">100%</div>
                        </div>
                    </div>
                    <button class="sin-btn" style="background-color: ${sin.color}" onclick="GameManager.handleSinAction('${key}')">Утолить</button>
                </div>
            `;
            sinsContainer.insertAdjacentHTML('beforeend', rowHtml);
        });
    },

    // Синхронизация данных шкал с интерфейсом
    updateUI() {
        Object.keys(this.sins).forEach(key => {
            const sin = this.sins[key];
            const roundedVal = Math.round(sin.value);

            const bar = document.getElementById(`bar-${key}`);
            const valText = document.getElementById(`val-${key}`);
            if (bar) bar.style.width = `${sin.value}%`;
            if (valText) valText.textContent = `${roundedVal}%`;

            const miniCircle = document.querySelector(`#mini-${key} .progress`);
            if (miniCircle) {
                miniCircle.style.strokeDashoffset = 100 - sin.value;
            }
        });
    },

    // Закрытие полноэкранного меню грехов и возврат HUD (общая логика для всех мини-игр)
    closeMenuBeforeMinigame() {
        const fullMenu = document.getElementById('full-menu');
        const miniHud = document.getElementById('mini-hud');
        if (fullMenu) fullMenu.classList.remove('active');
        if (miniHud) {
            miniHud.style.opacity = '1';
            miniHud.style.pointerEvents = 'auto';
        }
    },

    // Обработка нажатий на кнопки "Утолить"
    handleSinAction(sinKey) {
        if (sinKey === 'greed') {
            this.closeMenuBeforeMinigame();
            if (typeof GreedMinigame !== 'undefined') {
                GreedMinigame.open();
            }
        } else if (sinKey === 'sloth') {
            this.closeMenuBeforeMinigame();
            if (typeof SlothMinigame !== 'undefined') {
                SlothMinigame.open();
            }
        } else if (sinKey === 'wrath') {
            this.closeMenuBeforeMinigame();
            if (typeof WrathMinigame !== 'undefined') {
                WrathMinigame.open();
            }
        } else if (sinKey === 'lust') {
            this.closeMenuBeforeMinigame();
            if (typeof LustMinigame !== 'undefined') {
                LustMinigame.open();
            }
        } else if (sinKey === 'gluttony') {
            this.closeMenuBeforeMinigame();
            if (typeof GluttonyMinigame !== 'undefined') {
                GluttonyMinigame.open();
            }
        } else if (sinKey === 'pride') {
            this.closeMenuBeforeMinigame();
            if (typeof PrideMinigame !== 'undefined') {
                PrideMinigame.open();
            }
        } else {
            // Заглушка для остальных грехов
            this.sins[sinKey].value = Math.min(100, this.sins[sinKey].value + 30);
            this.updateUI();
        }
    },

    // Понижение шкал со временем
    decaySins() {
        Object.keys(this.sins).forEach(key => {
            this.sins[key].value = Math.max(0, this.sins[key].value - (this.sins[key].decay * 0.5));
        });
        this.updateUI();
    },

    // Навешивание событий на шторку меню
    setupEvents() {
        const closeMenuArea = document.getElementById('close-menu-area');
        const fullMenu = document.getElementById('full-menu');
        const miniHud = document.getElementById('mini-hud');

        // Открываем меню при клике на верхний HUD со шкалами-кружками
        if (miniHud && fullMenu) {
            miniHud.onclick = (e) => {
                e.stopPropagation(); // Не даем клику уйти на игровой Canvas
                fullMenu.classList.add('active');
                miniHud.style.opacity = '0';
                miniHud.style.pointerEvents = 'none'; // Полностью отключаем кликабельность скрытого HUD
            };
        }

        // Закрываем меню при клике на верхнюю зону стрелок
        if (closeMenuArea && fullMenu && miniHud) {
            closeMenuArea.onclick = (e) => {
                e.stopPropagation();
                fullMenu.classList.remove('active');
                miniHud.style.opacity = '1';
                miniHud.style.pointerEvents = 'auto'; // Снова разрешаем клики
            };
        }
    }
};

// Железобетонный старт при загрузке документа
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GameManager.init());
} else {
    GameManager.init();
}
