// ui.js - User Interface Module for Dynasty 3D Battle
// This file handles DOM manipulation for UI updates: health, stamina, score, combo, etc.

(function (window, document, undefined) {
    "use strict";

    // Cache UI elements
    let uiElements = {
        healthBar: null,
        healthBarFill: null,
        staminaBar: null,
        staminaBarFill: null,
        scoreDisplay: null,
        comboDisplay: null,
        comboTimerBar: null,
        messageOverlay: null,
        gameOverlay: null,
        startButton: null,
        restartButton: null,
        pauseOverlay: null,
        pauseButton: null,
        waveDisplay: null,
        killsDisplay: null,
        bossHealthBar: null,
        bossHealthFill: null,
        bossName: null,
        skillCooldowns: null
    };

    let uiConfig = {
        maxHealth: 100,
        maxStamina: 100,
        comboDuration: 5000,
        messageDuration: 2000
    };

    let state = {
        health: uiConfig.maxHealth,
        stamina: uiConfig.maxStamina,
        score: 0,
        combo: 0,
        comboTimer: 0,
        lastComboTime: 0,
        wave: 1,
        kills: 0,
        gameOver: false,
        paused: false,
        bossActive: false,
        bossHealth: 100,
        bossMaxHealth: 100,
        skillCooldowns: {}
    };

    // Message queue
    let messageQueue = [];
    let currentMessageTimeout = null;

    // Initialize UI elements
    function initUI() {
        // Create UI structure if it doesn't exist
        if (!document.getElementById('game-ui')) {
            createUIElements();
        } else {
            cacheUIElements();
        }

        // Initialize skill cooldown displays
        initSkillCooldowns();

        // Bind UI buttons
        bindUIButtons();

        // Start UI update loop
        startUIUpdateLoop();

        // Show start screen
        showStartScreen();
    }

    function createUIElements() {
        const mainUI = document.createElement('div');
        mainUI.id = 'game-ui';
        mainUI.className = 'game-ui-container';

        // HUD Top Left - Player Stats
        const hudTopLeft = document.createElement('div');
        hudTopLeft.id = 'hud-top-left';
        hudTopLeft.className = 'hud-section';

        // Health Bar
        const healthContainer = document.createElement('div');
        healthContainer.id = 'health-bar-container';
        healthContainer.className = 'status-bar-container';
        healthContainer.innerHTML = `
            <div class="status-bar-label">
                <span class="icon health-icon">❤</span>
                <span id="health-text">${uiConfig.maxHealth}/${uiConfig.maxHealth}</span>
            </div>
            <div class="status-bar">
                <div id="health-bar-fill" class="status-bar-fill health-fill"></div>
            </div>
        `;

        // Stamina Bar
        const staminaContainer = document.createElement('div');
        staminaContainer.id = 'stamina-bar-container';
        staminaContainer.className = 'status-bar-container';
        staminaContainer.innerHTML = `
            <div class="status-bar-label">
                <span class="icon stamina-icon">⚡</span>
                <span id="stamina-text">${uiConfig.maxStamina}/${uiConfig.maxStamina}</span>
            </div>
            <div class="status-bar">
                <div id="stamina-bar-fill" class="status-bar-fill stamina-fill"></div>
            </div>
        `;

        hudTopLeft.appendChild(healthContainer);
        hudTopLeft.appendChild(staminaContainer);

        // Wave and Kills Display
        const waveKillsDisplay = document.createElement('div');
        waveKillsDisplay.id = 'wave-kills-display';
        waveKillsDisplay.className = 'wave-kills-display';
        waveKillsDisplay.innerHTML = `
            <div id="wave-display" class="display-item">Wave: <span id="wave-value">1</span></div>
            <div id="kills-display" class="display-item">Kills: <span id="kills-value">0</span></div>
        `;
        hudTopLeft.appendChild(waveKillsDisplay);

        mainUI.appendChild(hudTopLeft);

        // HUD Top Right - Score and Combo
        const hudTopRight = document.createElement('div');
        hudTopRight.id = 'hud-top-right';
        hudTopRight.className = 'hud-section';

        // Score Display
        const scoreContainer = document.createElement('div');
        scoreContainer.id = 'score-display';
        scoreContainer.className = 'score-container';
        scoreContainer.innerHTML = `
            <div class="score-label">Score</div>
            <div id="score-value" class="score-value">0</div>
        `;

        // Combo Display
        const comboContainer = document.createElement('div');
        comboContainer.id = 'combo-display';
        comboContainer.className = 'combo-container';
        comboContainer.innerHTML = `
            <div id="combo-value" class="combo-value">0</div>
            <div class="combo-label">COMBO</div>
            <div class="combo-timer-bar">
                <div id="combo-timer-fill" class="combo-timer-fill"></div>
            </div>
        `;
        comboContainer.style.display = 'none';

        hudTopRight.appendChild(scoreContainer);
        hudTopRight.appendChild(comboContainer);

        mainUI.appendChild(hudTopRight);

        // Boss Health Bar (Top Center)
        const bossBarContainer = document.createElement('div');
        bossBarContainer.id = 'boss-bar-container';
        bossBarContainer.className = 'boss-bar-container';
        bossBarContainer.style.display = 'none';
        bossBarContainer.innerHTML = `
            <div id="boss-name" class="boss-name">BOSS</div>
            <div class="boss-health-bar">
                <div id="boss-health-fill" class="boss-health-fill"></div>
            </div>
        `;
        mainUI.appendChild(bossBarContainer);

        // Skill Cooldowns (Bottom Left)
        const skillContainer = document.createElement('div');
        skillContainer.id = 'skill-cooldowns';
        skillContainer.className = 'skill-cooldown-container';
        skillContainer.innerHTML = `
            <div class="skill-item" id="skill-1" data-skill="special1">
                <div class="skill-icon">✦</div>
                <div class="cooldown-overlay"><span class="cooldown-text"></span></div>
                <div class="skill-key">Q</div>
            </div>
            <div class="skill-item" id="skill-2" data-skill="special2">
                <div class="skill-icon">✸</div>
                <div class="cooldown-overlay"><span class="cooldown-text"></span></div>
                <div class="skill-key">E</div>
            </div>
            <div class="skill-item" id="skill-3" data-skill="special3">
                <div class="skill-icon">⚡</div>
                <div class="cooldown-overlay"><span class="cooldown-text"></span></div>
                <div class="skill-key">R</div>
            </div>
        `;
        mainUI.appendChild(skillContainer);

        // Message Overlay (Center)
        const messageOverlay = document.createElement('div');
        messageOverlay.id = 'message-overlay';
        messageOverlay.className = 'message-overlay';
        messageOverlay.style.display = 'none';
        mainUI.appendChild(messageOverlay);

        // Game Over Overlay
        const gameOverlay = document.createElement('div');
        gameOverlay.id = 'game-overlay';
        gameOverlay.className = 'game-overlay';
        gameOverlay.style.display = 'none';
        gameOverlay.innerHTML = `
            <div class="overlay-content">
                <h1 id="overlay-title">GAME OVER</h1>
                <div id="final-stats" class="final-stats"></div>
                <button id="restart-button" class="overlay-button">Restart</button>
            </div>
        `;
        mainUI.appendChild(gameOverlay);

        // Start Screen Overlay
        const startOverlay = document.createElement('div');
        startOverlay.id = 'start-overlay';
        startOverlay.className = 'start-overlay';
        startOverlay.innerHTML = `
            <div class="start-content">
                <h1 class="game-title">DYNASTY 3D BATTLE</h1>
                <p class="subtitle">Master the art of ancient warfare</p>
                <div class="controls-info">
                    <div class="control-row">
                        <span class="control-key">WASD</span>
                        <span class="control-desc">Move</span>
                    </div>
                    <div class="control-row">
                        <span class="control-key">Mouse</span>
                        <span class="control-desc">Aim & Shoot</span>
                    </div>
                    <div class="control-row">
                        <span class="control-key">Shift</span>
                        <span class="control-desc">Dash</span>
                    </div>
                    <div class="control-row">
                        <span class="control-key">Q/E/R</span>
                        <span class="control-desc">Special Abilities</span>
                    </div>
                    <div class="control-row">
                        <span class="control-key">ESC</span>
                        <span class="control-desc">Pause</span>
                    </div>
                </div>
                <button id="start-button" class="overlay-button">Start Battle</button>
            </div>
        `;
        mainUI.appendChild(startOverlay);

        // Pause Overlay
        const pauseOverlay = document.createElement('div');
        pauseOverlay.id = 'pause-overlay';
        pauseOverlay.className = 'pause-overlay';
        pauseOverlay.style.display = 'none';
        pauseOverlay.innerHTML = `
            <div class="pause-content">
                <h2>PAUSED</h2>
                <button id="resume-button" class="overlay-button">Resume</button>
                <button id="pause-restart-button" class="overlay-button">Restart</button>
            </div>
        `;
        mainUI.appendChild(pauseOverlay);

        // Add to body
        document.body.appendChild(mainUI);

        // Cache all elements
        cacheUIElements();
    }

    function cacheUIElements() {
        uiElements.healthBar = document.getElementById('health-bar-container');
        uiElements.healthBarFill = document.getElementById('health-bar-fill');
        uiElements.staminaBar = document.getElementById('stamina-bar-container');
        uiElements.staminaBarFill = document.getElementById('stamina-bar-fill');
        uiElements.scoreDisplay = document.getElementById('score-value');
        uiElements.comboDisplay = document.getElementById('combo-display');
        uiElements.comboValue = document.getElementById('combo-value');
        uiElements.comboTimerBar = document.getElementById('combo-timer-fill');
        uiElements.messageOverlay = document.getElementById('message-overlay');
        uiElements.gameOverlay = document.getElementById('game-overlay');
        uiElements.startButton = document.getElementById('start-button');
        uiElements.restartButton = document.getElementById('restart-button');
        uiElements.pauseOverlay = document.getElementById('pause-overlay');
        uiElements.pauseButton = document.getElementById('pause-button');
        uiElements.waveDisplay = document.getElementById('wave-value');
        uiElements.killsDisplay = document.getElementById('kills-value');
        uiElements.bossHealthBar = document.getElementById('boss-bar-container');
        uiElements.bossHealthFill = document.getElementById('boss-health-fill');
        uiElements.bossName = document.getElementById('boss-name');
        uiElements.skillCooldowns = {
            special1: document.getElementById('skill-1'),
            special2: document.getElementById('skill-2'),
            special3: document.getElementById('skill-3')
        };
        uiElements.overlayTitle = document.getElementById('overlay-title');
        uiElements.finalStats = document.getElementById('final-stats');
        uiElements.resumeButton = document.getElementById('resume-button');
        uiElements.pauseRestartButton = document.getElementById('pause-restart-button');
        uiElements.startOverlay = document.getElementById('start-overlay');
    }

    function bindUIButtons() {
        if (uiElements.startButton) {
            uiElements.startButton.addEventListener('click', function () {
                hideStartScreen();
                if (typeof window.game !== 'undefined' && typeof window.game.start === 'function') {
                    window.game.start();
                }
            });
        }

        if (uiElements.restartButton) {
            uiElements.restartButton.addEventListener('click', function () {
                restartGame();
            });
        }

        if (uiElements.resumeButton) {
            uiElements.resumeButton.addEventListener('click', function () {
                resumeGame();
            });
        }

        if (uiElements.pauseRestartButton) {
            uiElements.pauseRestartButton.addEventListener('click', function () {
                restartGame();
            });
        }
    }

    let uiUpdateInterval = null;

    function startUIUpdateLoop() {
        if (uiUpdateInterval) {
            clearInterval(uiUpdateInterval);
        }
        uiUpdateInterval = setInterval(updateUI, 16); // ~60 FPS
    }

    function stopUIUpdateLoop() {
        if (uiUpdateInterval) {
            clearInterval(uiUpdateInterval);
            uiUpdateInterval = null;
        }
    }

    // ==================== PUBLIC API FUNCTIONS ====================

    // Update player health
    function updateHealth(currentHealth) {
        state.health = Math.max(0, Math.min(uiConfig.maxHealth, currentHealth));
        updateHealthBar();
    }

    // Update player stamina
    function updateStamina(currentStamina) {
        state.stamina = Math.max(0, Math.min(uiConfig.maxStamina, currentStamina));
        updateStaminaBar();
    }

    // Update score
    function updateScore(newScore) {
        state.score = newScore;
        updateScoreDisplay();
    }

    // Add to score
    function addScore(points) {
        state.score += points;
        updateScoreDisplay();
    }

    // Update combo
    function updateCombo(comboCount) {
        state.combo = comboCount;
        if (comboCount > 0) {
            state.lastComboTime = Date.now();
            state.comboTimer = uiConfig.comboDuration;
            showComboDisplay();
        } else {
            hideComboDisplay();
        }
        updateComboDisplay();
    }

    // Reset combo
    function resetCombo() {
        state.combo = 0;
        state.comboTimer = 0;
        hideComboDisplay();
        updateComboDisplay();
    }

    // Check if combo should expire
    function checkComboExpiry() {
        if (state.combo > 0 && Date.now() - state.lastComboTime > uiConfig.comboDuration) {
            resetCombo();
        }
    }

    // Update wave display
    function updateWave(waveNumber) {
        state.wave = waveNumber;
        updateWaveDisplay();
    }

    // Update kills display
    function updateKills(killCount) {
        state.kills = killCount;
        updateKillsDisplay();
    }

    // Add to kills
    function addKill() {
        state.kills++;
        updateKillsDisplay();
    }

    // Show boss health bar
    function showBossHealth(bossName, bossHealth, bossMaxHealth) {
        state.bossActive = true;
        state.bossHealth = bossHealth;
        state.bossMaxHealth = bossMaxHealth;
        updateBossHealthBar(bossName);
    }

    // Update boss health
    function updateBossHealth(bossHealth, bossName) {
        state.bossHealth = bossHealth;
        if (bossName) {
            uiElements.bossName.textContent = bossName;
        }
        updateBossHealthBar();
    }

    // Hide boss health bar
    function hideBossHealth() {
        state.bossActive = false;
        state.bossHealth = 0;
        updateBossHealthBar();
    }

    // Update skill cooldown
    function updateSkillCooldown(skillName, remainingTime, totalTime) {
        state.skillCooldowns[skillName] = { remaining: remainingTime, total: totalTime };
        updateSkillCooldownDisplay(skillName);
    }

    // Show message
    function showMessage(text, duration) {
        messageQueue.push({ text: text, duration: duration || uiConfig.messageDuration });
        processMessageQueue();
    }

    // Show game over
    function showGameOver(stats) {
        state.gameOver = true;
        uiElements.overlayTitle.textContent = 'GAME OVER';
        uiElements.finalStats.innerHTML = '';

        if (stats) {
            const statsMap = {
                wave: 'Wave Reached',
                kills: 'Enemies Defeated',
                score: 'Final Score',
                combo: 'Max Combo'
            };

            for (let key in stats) {
                if (statsMap[key]) {
                    const div = document.createElement('div');
                    div.className = 'stat-line';
                    div.innerHTML = `<span>${statsMap[key]}:</span> <span>${stats[key]}</span>`;
                    uiElements.finalStats.appendChild(div);
                }
            }
        }

        uiElements.gameOverlay.style.display = 'flex';
        stopUIUpdateLoop();
    }

    // Show victory
    function showVictory(stats) {
        state.gameOver = true;
        uiElements.overlayTitle.textContent = 'VICTORY!';
        uiElements.finalStats.innerHTML = '';

        if (stats) {
            const statsMap = {
                wave: 'Final Wave',
                kills: 'Total Enemies',
                score: 'Final Score',
                combo: 'Max Combo'
            };

            for (let key in stats) {
                if (statsMap[key]) {
                    const div = document.createElement('div');
                    div.className = 'stat-line';
                    div.innerHTML = `<span>${statsMap[key]}:</span> <span>${stats[key]}</span>`;
                    uiElements.finalStats.appendChild(div);
                }
            }
        }

        uiElements.gameOverlay.style.display = 'flex';
        stopUIUpdateLoop();
    }

    // Show start screen
    function showStartScreen() {
        uiElements.startOverlay.style.display = 'flex';
        uiElements.gameOverlay.style.display = 'none';
        uiElements.pauseOverlay.style.display = 'none';
    }

    // Hide start screen
    function hideStartScreen() {
        uiElements.startOverlay.style.display = 'none';
    }

    // Pause game
    function pauseGame() {
        if (state.gameOver) return;
        state.paused = true;
        uiElements.pauseOverlay.style.display = 'flex';
        stopUIUpdateLoop();
    }

    // Resume game
    function resumeGame() {
        state.paused = false;
        uiElements.pauseOverlay.style.display = 'none';
        startUIUpdateLoop();
    }

    // Restart game
    function restartGame() {
        // Reset state
        state.health = uiConfig.maxHealth;
        state.stamina = uiConfig.maxStamina;
        state.score = 0;
        state.combo = 0;
        state.comboTimer = 0;
        state.lastComboTime = 0;
        state.wave = 1;
        state.kills = 0;
        state.gameOver = false;
        state.paused = false;
        state.bossActive = false;
        state.bossHealth = 0;
        state.bossMaxHealth = 100;
        state.skillCooldowns = {};

        // Hide overlays
        uiElements.gameOverlay.style.display = 'none';
        uiElements.pauseOverlay.style.display = 'none';
        hideComboDisplay();
        updateAllUI();

        // Start UI loop
        startUIUpdateLoop();

        // Call game restart if available
        if (typeof window.game !== 'undefined' && typeof window.game.restart === 'function') {
            window.game.restart();
        }
    }

    // ==================== PRIVATE UPDATE FUNCTIONS ====================

    function updateUI() {
        checkComboExpiry();
        updateHealthBar();
        updateStaminaBar();
        updateScoreDisplay();
        updateComboDisplay();
        updateWaveDisplay();
        updateKillsDisplay();
        updateBossHealthBar();
        updateSkillCooldownDisplays();
    }

    function updateHealthBar() {
        if (uiElements.healthBarFill) {
            const percentage = (state.health / uiConfig.maxHealth) * 100;
            uiElements.healthBarFill.style.width = percentage + '%';

            // Change color based on health
            if (percentage > 60) {
                uiElements.healthBarFill.className = 'status-bar-fill health-fill high';
            } else if (percentage > 30) {
                uiElements.healthBarFill.className = 'status-bar-fill health-fill medium';
            } else {
                uiElements.healthBarFill.className = 'status-bar-fill health-fill low';
            }

            // Update text
            const healthText = document.getElementById('health-text');
            if (healthText) {
                healthText.textContent = Math.round(state.health) + '/' + uiConfig.maxHealth;
            }
        }
    }

    function updateStaminaBar() {
        if (uiElements.staminaBarFill) {
            const percentage = (state.stamina / uiConfig.maxStamina) * 100;
            uiElements.staminaBarFill.style.width = percentage + '%';

            // Update text
            const staminaText = document.getElementById('stamina-text');
            if (staminaText) {
                staminaText.textContent = Math.round(state.stamina) + '/' + uiConfig.maxStamina;
            }
        }
    }

    function updateScoreDisplay() {
        if (uiElements.scoreDisplay) {
            uiElements.scoreDisplay.textContent = state.score.toLocaleString();
        }
    }

    function showComboDisplay() {
        if (uiElements.comboDisplay) {
            uiElements.comboDisplay.style.display = 'block';
        }
    }

    function hideComboDisplay() {
        if (uiElements.comboDisplay) {
            uiElements.comboDisplay.style.display = 'none';
        }
    }

    function updateComboDisplay() {
        if (uiElements.comboValue && uiElements.comboDisplay && state.combo > 0) {
            uiElements.comboValue.textContent = state.combo;

            // Update combo timer bar
            const timeRemaining = uiConfig.comboDuration - (Date.now() - state.lastComboTime);
            const percentage = Math.max(0, (timeRemaining / uiConfig.comboDuration) * 100);
            if (uiElements.comboTimerBar) {
                uiElements.comboTimerBar.style.width = percentage + '%';
            }

            // Color intensity based on combo count
            const color = getComboColor(state.combo);
            uiElements.comboValue.style.color = color;
        }
    }

    function getComboColor(combo) {
        if (combo >= 50) return '#ff00ff';
        if (combo >= 30) return '#ff4444';
        if (combo >= 20) return '#ffaa00';
        if (combo >= 10) return '#ffff00';
        return '#ffffff';
    }

    function updateWaveDisplay() {
        if (uiElements.waveDisplay) {
            uiElements.waveDisplay.textContent = state.wave;
        }
    }

    function updateKillsDisplay() {
        if (uiElements.killsDisplay) {
            uiElements.killsDisplay.textContent = state.kills;
        }
    }

    function updateBossHealthBar(bossName) {
        if (uiElements.bossHealthBar) {
            if (state.bossActive && state.bossMaxHealth > 0) {
                uiElements.bossHealthBar.style.display = 'block';
                if (bossName && uiElements.bossName) {
                    uiElements.bossName.textContent = bossName;
                }

                const percentage = (state.bossHealth / state.bossMaxHealth) * 100;
                if (uiElements.bossHealthFill) {
                    uiElements.bossHealthFill.style.width = Math.max(0, percentage) + '%';

                    // Color based on health
                    if (percentage > 60) {
                        uiElements.bossHealthFill.className = 'boss-health-fill high';
                    } else if (percentage > 30) {
                        uiElements.bossHealthFill.className = 'boss-health-fill medium';
                    } else {
                        uiElements.bossHealthFill.className = 'boss-health-fill low';
                    }
                }
            } else {
                uiElements.bossHealthBar.style.display = 'none';
            }
        }
    }

    function initSkillCooldowns() {
        if (!uiElements.skillCooldowns) {
            uiElements.skillCooldowns = {
                special1: document.getElementById('skill-1'),
                special2: document.getElementById('skill-2'),
                special3: document.getElementById('skill-3')
            };
        }

        // Reset all skill displays
        for (let skill in uiElements.skillCooldowns) {
            resetSkillCooldownDisplay(skill);
        }
    }

    function resetSkillCooldownDisplay(skillName) {
        const skillEl = uiElements.skillCooldowns[skillName];
        if (skillEl) {
            const overlay = skillEl.querySelector('.cooldown-overlay');
            const text = skillEl.querySelector('.cooldown-text');
            if (overlay) {
                overlay.style.display = 'none';
                overlay.style.opacity = '0';
            }
            if (text) {
                text.textContent = '';
            }
            skillEl.classList.remove('on-cooldown');
        }
        state.skillCooldowns[skillName] = { remaining: 0, total: 1 };
    }

    function updateSkillCooldownDisplay(skillName) {
        const skillData = state.skillCooldowns[skillName];
        if (!skillData) return;

        const skillEl = uiElements.skillCooldowns[skillName];
        if (!skillEl) return;

        const overlay = skillEl.querySelector('.cooldown-overlay');
        const text = skillEl.querySelector('.cooldown-text');

        if (skillData.remaining > 0) {
            skillEl.classList.add('on-cooldown');
            if (overlay) {
                const percentage = (skillData.remaining / skillData.total) * 100;
                overlay.style.display = 'block';
                overlay.style.opacity = '1';
                // Could add radial or linear progress here
                if (text) {
                    text.textContent = Math.ceil(skillData.remaining) + 's';
                }
            }
        } else {
            skillEl.classList.remove('on-cooldown');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    if (state.skillCooldowns[skillName] && state.skillCooldowns[skillName].remaining <= 0) {
                        overlay.style.display = 'none';
                    }
                }, 200);
            }
            if (text) {
                text.textContent = '';
            }
        }
    }

    function updateSkillCooldownDisplays() {
        // Decrease remaining time for all skills
        const now = Date.now();
        for (let skill in state.skillCooldowns) {
            const data = state.skillCooldowns[skill];
            if (data.remaining > 0) {
                // This is simplified - in a real game, this would be driven by actual cooldown timers
                // For now, just update display
                updateSkillCooldownDisplay(skill);
            }
        }
    }

    function processMessageQueue() {
        if (messageQueue.length === 0) return;

        const message = messageQueue.shift();
        if (!uiElements.messageOverlay) return;

        uiElements.messageOverlay.textContent = message.text;
        uiElements.messageOverlay.style.display = 'block';
        uiElements.messageOverlay.classList.add('visible');

        if (currentMessageTimeout) {
            clearTimeout(currentMessageTimeout);
        }

        currentMessageTimeout = setTimeout(() => {
            uiElements.messageOverlay.classList.remove('visible');
            setTimeout(() => {
                uiElements.messageOverlay.style.display = 'none';
            }, 300);
            processMessageQueue();
        }, message.duration);
    }

    function updateAllUI() {
        updateHealthBar();
        updateStaminaBar();
        updateScoreDisplay();
        updateComboDisplay();
        updateWaveDisplay();
        updateKillsDisplay();
        updateBossHealthBar();
        updateSkillCooldownDisplays();
    }

    // ==================== EXPOSE TO GLOBAL SCOPE ====================

    window.UI = {
        init: initUI,
        updateHealth: updateHealth,
        updateStamina: updateStamina,
        updateScore: updateScore,
        addScore: addScore,
        updateCombo: updateCombo,
        resetCombo: resetCombo,
        updateWave: updateWave,
        updateKills: updateKills,
        addKill: addKill,
        showBossHealth: showBossHealth,
        updateBossHealth: updateBossHealth,
        hideBossHealth: hideBossHealth,
        updateSkillCooldown: updateSkillCooldown,
        showMessage: showMessage,
        showGameOver: showGameOver,
        showVictory: showVictory,
        pauseGame: pauseGame,
        resumeGame: resumeGame,
        restartGame: restartGame,
        getState: function () {
            return {
                health: state.health,
                stamina: state.stamina,
                score: state.score,
                combo: state.combo,
                wave: state.wave,
                kills: state.kills,
                gameOver: state.gameOver,
                paused: state.paused
            };
        }
    };

    // Initialize on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initUI();
        });
    } else {
        initUI();
    }

})(window, document);
