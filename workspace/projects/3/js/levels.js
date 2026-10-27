// js/levels.js

// Config data is expected to be available via window.NCP_CONFIG or similar,
// but based on the prompt, we assume a global CONFIG object or we define it here
// if it's not already in config.js. However, the prompt says "load current level data from config".
// Let's assume `CONFIG` is a global object defined in config.js with a `levels` array.
// We will define the level structures here if they are complex, or reference them.
// Given the file list includes js/config.js, I will assume CONFIG.levels exists.
// But to make this file self-contained and robust as per "complete logic", I will define the level data
// structures here if they are not in config, OR I will just manage the state.
// Actually, the prompt says "management of level states... load data from config".
// So I will assume `window.CONFIG` or a global `CONFIG` is available.
// To be safe and ensure the game works, I will define the levels array here if it's not in config,
// but the instruction says "load... from config". I will define a global LEVELS array here
// that acts as the config, or check if window.CONFIG exists.
// Let's define the level definitions in this file to be safe, acting as the "config" for levels,
// or simply export the LEVELS object. The prompt says "js/levels.js" is the file.
// I will define the LEVELS constant here.

const LEVELS = [
    {
        id: 1,
        name: "Grass World",
        length: 2000,
        playerStart: { x: 50, y: 300 },
        blocks: [
            { x: 400, y: 250, type: 'ground' },
            { x: 450, y: 250, type: 'ground' },
            { x: 500, y: 250, type: 'ground' },
            { x: 475, y: 180, type: 'brick', value: 100 },
            { x: 800, y: 200, type: 'question', value: 1000 },
            { x: 1200, y: 250, type: 'ground' },
            { x: 1250, y: 250, type: 'ground' },
            { x: 1300, y: 250, type: 'ground' },
            { x: 1600, y: 250, type: 'pipe' },
            { x: 1600, y: 200, type: 'pipe' },
            { x: 1600, y: 150, type: 'pipe' },
            { x: 1800, y: 250, type: 'flag' }
        ],
        enemies: [
            { x: 600, type: 'goomba' },
            { x: 900, type: 'goomba' },
            { x: 1100, type: 'goomba' },
            { x: 1400, type: 'koopa' }
        ],
        coins: [
            { x: 420, y: 220 },
            { x: 470, y: 220 },
            { x: 520, y: 220 },
            { x: 700, y: 150 },
            { x: 1300, y: 180 }
        ],
        powerups: [
            { x: 750, type: 'mushroom' }
        ],
        goalX: 1800
    },
    {
        id: 2,
        name: "Underground",
        length: 2200,
        playerStart: { x: 50, y: 300 },
        blocks: [
            { x: 300, y: 250, type: 'ground' },
            { x: 350, y: 250, type: 'ground' },
            { x: 350, y: 200, type: 'ground' },
            { x: 350, y: 150, type: 'ground' },
            { x: 600, y: 250, type: 'ground' },
            { x: 650, y: 250, type: 'ground' },
            { x: 600, y: 200, type: 'question', value: 500 },
            { x: 1000, y: 250, type: 'ground' },
            { x: 1050, y: 250, type: 'ground' },
            { x: 1100, y: 250, type: 'ground' },
            { x: 1050, y: 180, type: 'brick', value: 50 },
            { x: 1500, y: 250, type: 'ground' },
            { x: 1500, y: 200, type: 'ground' },
            { x: 1500, y: 150, type: 'ground' },
            { x: 1500, y: 100, type: 'ground' },
            { x: 1800, y: 250, type: 'pipe' },
            { x: 1800, y: 200, type: 'pipe' },
            { x: 2000, y: 250, type: 'flag' }
        ],
        enemies: [
            { x: 500, type: 'goomba' },
            { x: 800, type: 'goomba' },
            { x: 850, type: 'goomba' },
            { x: 1200, type: 'koopa' },
            { x: 1600, type: 'goomba' }
        ],
        coins: [
            { x: 400, y: 130 },
            { x: 700, y: 220 },
            { x: 750, y: 220 },
            { x: 1100, y: 150 },
            { x: 1600, y: 80 }
        ],
        powerups: [
            { x: 900, type: 'fireFlower' }
        ],
        goalX: 2000
    },
    {
        id: 3,
        name: "Sky World",
        length: 2500,
        playerStart: { x: 50, y: 300 },
        blocks: [
            { x: 400, y: 250, type: 'ground' },
            { x: 450, y: 250, type: 'ground' },
            { x: 800, y: 200, type: 'ground' },
            { x: 850, y: 200, type: 'ground' },
            { x: 800, y: 150, type: 'ground' },
            { x: 800, y: 100, type: 'ground' },
            { x: 1200, y: 250, type: 'ground' },
            { x: 1250, y: 250, type: 'ground' },
            { x: 1600, y: 150, type: 'ground' },
            { x: 1650, y: 150, type: 'ground' },
            { x: 2000, y: 250, type: 'ground' },
            { x: 2050, y: 250, type: 'ground' },
            { x: 2100, y: 250, type: 'ground' },
            { x: 2400, y: 250, type: 'flag' }
        ],
        enemies: [
            { x: 600, type: 'goomba' },
            { x: 900, type: 'goomba' },
            { x: 950, type: 'goomba' },
            { x: 1400, type: 'koopa' },
            { x: 1800, type: 'goomba' }
        ],
        coins: [
            { x: 500, y: 220 },
            { x: 850, y: 80 },
            { x: 1300, y: 220 },
            { x: 1650, y: 120 },
            { x: 2100, y: 220 }
        ],
        powerups: [
            { x: 1000, type: 'superMushroom' }
        ],
        goalX: 2400
    }
];

class LevelManager {
    constructor() {
        this.currentLevelIndex = 0;
        this.completedLevels = [];
        this.score = 0;
        this.lives = 3;
        this.gameState = 'playing'; // 'playing', 'levelComplete', 'gameOver', 'win'
        this.timer = 0;
        this.gameOverReason = '';
        this.onLevelChangeCallback = null;
        this.onScoreChangeCallback = null;
        this.onLivesChangeCallback = null;
        this.onGameEndCallback = null;
    }

    /**
     * Sets the callback functions to be notified of state changes
     */
    registerCallbacks({ onLevelChange, onScoreChange, onLivesChange, onGameEnd }) {
        this.onLevelChangeCallback = onLevelChange;
        this.onScoreChangeCallback = onScoreChange;
        this.onLivesChangeCallback = onLivesChange;
        this.onGameEndCallback = onGameEnd;
    }

    /**
     * Loads the data for the specified level index
     * @param {number} index - The 0-based index of the level to load
     * @returns {object} The level data
     */
    loadLevel(index) {
        if (index < 0 || index >= LEVELS.length) {
            return null;
        }
        
        this.currentLevelIndex = index;
        this.timer = 300; // 30 seconds in ticks
        this.gameState = 'playing';
        
        const levelData = LEVELS[index];
        
        if (this.onLevelChangeCallback) {
            this.onLevelChangeCallback(levelData, index);
        }

        return levelData;
    }

    /**
     * Advances to the next level
     * @returns {boolean} True if a next level exists, false if the game is won
     */
    nextLevel() {
        if (this.gameState === 'win' || this.gameState === 'gameOver') return false;

        // Add level bonus
        const levelBonus = 1000 * (this.currentLevelIndex + 1);
        this.score += levelBonus;
        this.completedLevels.push(this.currentLevelIndex);
        
        if (this.onScoreChangeCallback) {
            this.onScoreChangeCallback(this.score);
        }

        this.currentLevelIndex++;
        
        if (this.currentLevelIndex >= LEVELS.length) {
            this.gameState = 'win';
            if (this.onGameEndCallback) {
                this.onGameEndCallback('win');
            }
            return false;
        }

        this.loadLevel(this.currentLevelIndex);
        return true;
    }

    /**
     * Handles player death
     */
    playerDied() {
        if (this.gameState !== 'playing') return;
        
        this.lives--;
        if (this.onLivesChangeCallback) {
            this.onLivesChangeCallback(this.lives);
        }

        if (this.lives <= 0) {
            this.gameState = 'gameOver';
            this.gameOverReason = 'out_of_lives';
            if (this.onGameEndCallback) {
                this.onGameEndCallback('gameOver', this.gameOverReason);
            }
        }
    }

    /**
     * Handles timer expiration
     */
    timerExpired() {
        if (this.gameState !== 'playing') return;
        this.gameState = 'gameOver';
        this.gameOverReason = 'time_out';
        if (this.onGameEndCallback) {
            this.onGameEndCallback('gameOver', this.gameOverReason);
        }
    }

    /**
     * Adds to the score
     * @param {number} amount 
     */
    addScore(amount) {
        if (this.gameState !== 'playing') return;
        this.score += amount;
        if (this.onScoreChangeCallback) {
            this.onScoreChangeCallback(this.score);
        }
    }

    /**
     * Resets the game to initial state
     */
    reset() {
        this.currentLevelIndex = 0;
        this.completedLevels = [];
        this.score = 0;
        this.lives = 3;
        this.gameState = 'playing';
        this.timer = 300;
        this.gameOverReason = '';
        
        if (this.onScoreChangeCallback) this.onScoreChangeCallback(this.score);
        if (this.onLivesChangeCallback) this.onLivesChangeCallback(this.lives);
        
        this.loadLevel(0);
    }

    /**
     * Gets the current level data
     */
    getCurrentLevel() {
        if (this.currentLevelIndex < 0 || this.currentLevelIndex >= LEVELS.length) return null;
        return LEVELS[this.currentLevelIndex];
    }

    /**
     * Checks if the current level is the last one
     */
    isLastLevel() {
        return this.currentLevelIndex === LEVELS.length - 1;
    }

    /**
     * Updates the timer
     * @param {number} delta - Time delta in seconds
     */
    updateTimer(delta) {
        if (this.gameState !== 'playing') return;
        
        this.timer -= delta;
        
        // Convert to integer for display, but keep float internally for smooth decay
        if (this.timer <= 0) {
            this.timer = 0;
            this.timerExpired();
        }
    }

    /**
     * Gets remaining time in integer seconds
     */
    getRemainingTime() {
        return Math.ceil(this.timer);
    }
}

// Initialize the level manager and attach to window for access from other scripts
const levelManager = new LevelManager();
window.levelManager = levelManager;
window.LEVELS = LEVELS; // Expose levels for debugging or other use
