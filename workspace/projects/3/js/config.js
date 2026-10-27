// js/config.js
// Game configuration for Mushroom Runner

var GAME_CONFIG = {
    // Canvas dimensions
    CANVAS_WIDTH: 960,
    CANVAS_HEIGHT: 540,

    // Game speed and physics
    GAME_SPEED: 1,
    GRAVITY: 0.8,
    JUMP_FORCE: -16,
    JUMP_DURATION: 12,
    FRICTION: 0.9,
    MAX_FALL_SPEED: 15,
    PLAYER_ACCEL: 0.5,
    PLAYER_DECEL: 0.85,
    MAX_RUN_SPEED: 6,
    COYOTE_TIME: 8,
    JUMP_BUFFER: 6,

    // Player properties
    PLAYER_WIDTH: 32,
    PLAYER_HEIGHT: 32,
    PLAYER_INVINCIBLE_FRAMES: 60,
    PLAYER_MAX_LIVES: 3,

    // Enemy properties
    ENEMY_SPEED: 1.5,
    ENEMY_GRAVITY: 0.8,
    ENEMY_JUMP_COOLDOWN: 60,

    // Obstacle properties
    OBSTACLE_DAMAGE: true,

    // Level transitions
    LEVEL_TRANSITION_FRAMES: 30,
    SPAWN_X: 60,
    SPAWN_Y: -50,

    // Colors
    COLORS: {
        sky: '#87CEEB',
        ground: '#8B4513',
        groundTop: '#228B22',
        player: '#FF0000',
        playerShade: '#CC0000',
        enemy: '#800080',
        enemyShade: '#4B0082',
        obstacle: '#555555',
        coin: '#FFD700',
        coinShine: '#FFFFE0',
        health: '#FF4444',
        background: '#4682B4',
        cloud: '#FFFFFF',
        parallax1: '#3CB371',
        parallax2: '#2E8B57',
        text: '#FFFFFF',
        textShadow: '#000000'
    },

    // Level definitions
    // Each level: { name, theme, width, spawns, enemies, obstacles, coins, goal, decorations }
    // Theme affects background colors
    LEVELS: [
        {
            name: "Grassy Plains",
            theme: "grass",
            width: 3000,
            groundHeight: 100,
            // Platforms: array of {x, y, width, height, type}
            platforms: [
                { x: 0, y: 540 - 100, width: 3000, height: 100, type: 'ground' },
                { x: 400, y: 400, width: 120, height: 20, type: 'platform' },
                { x: 600, y: 320, width: 100, height: 20, type: 'platform' },
                { x: 800, y: 260, width: 150, height: 20, type: 'platform' },
                { x: 1000, y: 400, width: 200, height: 20, type: 'platform' },
                { x: 1300, y: 350, width: 120, height: 20, type: 'platform' },
                { x: 1500, y: 300, width: 100, height: 20, type: 'platform' },
                { x: 1700, y: 400, width: 180, height: 20, type: 'platform' },
                { x: 2000, y: 350, width: 150, height: 20, type: 'platform' },
                { x: 2300, y: 300, width: 120, height: 20, type: 'platform' },
                { x: 2500, y: 250, width: 100, height: 20, type: 'platform' }
            ],
            enemies: [
                { x: 500, y: 490, type: 'walker' },
                { x: 900, y: 490, type: 'walker' },
                { x: 1200, y: 490, type: 'walker' },
                { x: 1600, y: 490, type: 'hopper' },
                { x: 2100, y: 490, type: 'walker' },
                { x: 2400, y: 490, type: 'hopper' }
            ],
            obstacles: [
                { x: 750, y: 510, width: 40, height: 30, type: 'spike' },
                { x: 1850, y: 510, width: 40, height: 30, type: 'spike' }
            ],
            coins: [
                { x: 450, y: 360 }, { x: 650, y: 280 }, { x: 875, y: 220 },
                { x: 1100, y: 360 }, { x: 1360, y: 310 }, { x: 1550, y: 260 },
                { x: 1790, y: 360 }, { x: 2080, y: 310 }, { x: 2360, y: 260 },
                { x: 2560, y: 210 }
            ],
            goal: { x: 2800, y: 440, width: 40, height: 100 },
            decorations: [
                { x: 200, y: 100, type: 'cloud' }, { x: 600, y: 80, type: 'cloud' },
                { x: 1200, y: 120, type: 'cloud' }, { x: 1800, y: 90, type: 'cloud' },
                { x: 2400, y: 110, type: 'cloud' }, { x: 2800, y: 70, type: 'cloud' }
            ]
        },
        {
            name: "Desert Dunes",
            theme: "desert",
            width: 3500,
            groundHeight: 100,
            platforms: [
                { x: 0, y: 540 - 100, width: 3500, height: 100, type: 'ground' },
                { x: 300, y: 420, width: 100, height: 20, type: 'platform' },
                { x: 500, y: 350, width: 80, height: 20, type: 'platform' },
                { x: 700, y: 280, width: 120, height: 20, type: 'platform' },
                { x: 900, y: 220, width: 100, height: 20, type: 'platform' },
                { x: 1100, y: 300, width: 150, height: 20, type: 'platform' },
                { x: 1350, y: 380, width: 120, height: 20, type: 'platform' },
                { x: 1550, y: 440, width: 100, height: 20, type: 'platform' },
                { x: 1750, y: 350, width: 200, height: 20, type: 'platform' },
                { x: 2050, y: 280, width: 120, height: 20, type: 'platform' },
                { x: 2250, y: 200, width: 100, height: 20, type: 'platform' },
                { x: 2450, y: 280, width: 150, height: 20, type: 'platform' },
                { x: 2700, y: 350, width: 120, height: 20, type: 'platform' },
                { x: 2950, y: 420, width: 100, height: 20, type: 'platform' },
                { x: 3150, y: 300, width: 150, height: 20, type: 'platform' }
            ],
            enemies: [
                { x: 600, y: 490, type: 'walker' },
                { x: 1000, y: 490, type: 'hopper' },
                { x: 1400, y: 490, type: 'walker' },
                { x: 1800, y: 490, type: 'walker' },
                { x: 2100, y: 490, type: 'hopper' },
                { x: 2500, y: 490, type: 'walker' },
                { x: 2800, y: 490, type: 'hopper' },
                { x: 3200, y: 490, type: 'walker' }
            ],
            obstacles: [
                { x: 850, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 1600, y: 510, width: 60, height: 30, type: 'spike' },
                { x: 2300, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 3000, y: 510, width: 40, height: 30, type: 'spike' }
            ],
            coins: [
                { x: 350, y: 380 }, { x: 540, y: 310 }, { x: 760, y: 240 },
                { x: 950, y: 180 }, { x: 1175, y: 260 }, { x: 1410, y: 340 },
                { x: 1600, y: 400 }, { x: 1850, y: 310 }, { x: 2110, y: 240 },
                { x: 2300, y: 160 }, { x: 2525, y: 240 }, { x: 2760, y: 310 },
                { x: 3000, y: 380 }, { x: 3225, y: 260 }
            ],
            goal: { x: 3300, y: 440, width: 40, height: 100 },
            decorations: [
                { x: 400, y: 150, type: 'cloud' }, { x: 1000, y: 100, type: 'cloud' },
                { x: 1600, y: 130, type: 'cloud' }, { x: 2200, y: 80, type: 'cloud' },
                { x: 2800, y: 120, type: 'cloud' }, { x: 3200, y: 90, type: 'cloud' }
            ]
        },
        {
            name: "Frozen Peaks",
            theme: "ice",
            width: 4000,
            groundHeight: 100,
            platforms: [
                { x: 0, y: 540 - 100, width: 4000, height: 100, type: 'ground' },
                { x: 200, y: 430, width: 80, height: 20, type: 'platform' },
                { x: 400, y: 360, width: 100, height: 20, type: 'platform' },
                { x: 600, y: 290, width: 80, height: 20, type: 'platform' },
                { x: 800, y: 220, width: 120, height: 20, type: 'platform' },
                { x: 1000, y: 180, width: 100, height: 20, type: 'platform' },
                { x: 1200, y: 250, width: 150, height: 20, type: 'platform' },
                { x: 1450, y: 320, width: 120, height: 20, type: 'platform' },
                { x: 1650, y: 400, width: 100, height: 20, type: 'platform' },
                { x: 1850, y: 350, width: 200, height: 20, type: 'platform' },
                { x: 2150, y: 280, width: 120, height: 20, type: 'platform' },
                { x: 2350, y: 200, width: 100, height: 20, type: 'platform' },
                { x: 2550, y: 280, width: 150, height: 20, type: 'platform' },
                { x: 2800, y: 350, width: 120, height: 20, type: 'platform' },
                { x: 3050, y: 420, width: 100, height: 20, type: 'platform' },
                { x: 3250, y: 350, width: 150, height: 20, type: 'platform' },
                { x: 3500, y: 280, width: 120, height: 20, type: 'platform' },
                { x: 3700, y: 200, width: 100, height: 20, type: 'platform' }
            ],
            enemies: [
                { x: 500, y: 490, type: 'walker' },
                { x: 900, y: 490, type: 'hopper' },
                { x: 1300, y: 490, type: 'walker' },
                { x: 1700, y: 490, type: 'walker' },
                { x: 2000, y: 490, type: 'hopper' },
                { x: 2400, y: 490, type: 'walker' },
                { x: 2800, y: 490, type: 'hopper' },
                { x: 3200, y: 490, type: 'walker' },
                { x: 3600, y: 490, type: 'hopper' }
            ],
            obstacles: [
                { x: 700, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 1500, y: 510, width: 60, height: 30, type: 'spike' },
                { x: 2200, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 2900, y: 510, width: 60, height: 30, type: 'spike' },
                { x: 3400, y: 510, width: 50, height: 30, type: 'spike' }
            ],
            coins: [
                { x: 240, y: 390 }, { x: 450, y: 320 }, { x: 640, y: 250 },
                { x: 860, y: 180 }, { x: 1050, y: 140 }, { x: 1275, y: 210 },
                { x: 1510, y: 280 }, { x: 1700, y: 360 }, { x: 1950, y: 310 },
                { x: 2210, y: 240 }, { x: 2400, y: 160 }, { x: 2625, y: 240 },
                { x: 2860, y: 310 }, { x: 3100, y: 380 }, { x: 3325, y: 310 },
                { x: 3560, y: 240 }, { x: 3750, y: 160 }
            ],
            goal: { x: 3800, y: 440, width: 40, height: 100 },
            decorations: [
                { x: 300, y: 100, type: 'cloud' }, { x: 800, y: 140, type: 'cloud' },
                { x: 1400, y: 90, type: 'cloud' }, { x: 2000, y: 120, type: 'cloud' },
                { x: 2600, y: 100, type: 'cloud' }, { x: 3200, y: 140, type: 'cloud' },
                { x: 3800, y: 110, type: 'cloud' }
            ]
        },
        {
            name: "Volcanic Caves",
            theme: "volcano",
            width: 4500,
            groundHeight: 100,
            platforms: [
                { x: 0, y: 540 - 100, width: 4500, height: 100, type: 'ground' },
                { x: 250, y: 440, width: 60, height: 20, type: 'platform' },
                { x: 450, y: 380, width: 80, height: 20, type: 'platform' },
                { x: 650, y: 310, width: 60, height: 20, type: 'platform' },
                { x: 850, y: 240, width: 100, height: 20, type: 'platform' },
                { x: 1050, y: 180, width: 80, height: 20, type: 'platform' },
                { x: 1250, y: 250, width: 120, height: 20, type: 'platform' },
                { x: 1450, y: 320, width: 100, height: 20, type: 'platform' },
                { x: 1650, y: 400, width: 80, height: 20, type: 'platform' },
                { x: 1850, y: 350, width: 180, height: 20, type: 'platform' },
                { x: 2100, y: 280, width: 100, height: 20, type: 'platform' },
                { x: 2300, y: 200, width: 80, height: 20, type: 'platform' },
                { x: 2500, y: 280, width: 120, height: 20, type: 'platform' },
                { x: 2750, y: 350, width: 100, height: 20, type: 'platform' },
                { x: 3000, y: 420, width: 80, height: 20, type: 'platform' },
                { x: 3200, y: 350, width: 140, height: 20, type: 'platform' },
                { x: 3450, y: 280, width: 100, height: 20, type: 'platform' },
                { x: 3650, y: 200, width: 80, height: 20, type: 'platform' },
                { x: 3850, y: 280, width: 120, height: 20, type: 'platform' },
                { x: 4100, y: 350, width: 100, height: 20, type: 'platform' },
                { x: 4300, y: 280, width: 120, height: 20, type: 'platform' }
            ],
            enemies: [
                { x: 600, y: 490, type: 'walker' },
                { x: 1000, y: 490, type: 'hopper' },
                { x: 1400, y: 490, type: 'walker' },
                { x: 1800, y: 490, type: 'hopper' },
                { x: 2200, y: 490, type: 'walker' },
                { x: 2600, y: 490, type: 'walker' },
                { x: 3000, y: 490, type: 'hopper' },
                { x: 3400, y: 490, type: 'walker' },
                { x: 3800, y: 490, type: 'hopper' },
                { x: 4200, y: 490, type: 'walker' }
            ],
            obstacles: [
                { x: 500, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 1100, y: 510, width: 60, height: 30, type: 'spike' },
                { x: 1700, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 2400, y: 510, width: 70, height: 30, type: 'spike' },
                { x: 3100, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 3700, y: 510, width: 60, height: 30, type: 'spike' },
                { x: 4300, y: 510, width: 50, height: 30, type: 'spike' }
            ],
            coins: [
                { x: 280, y: 400 }, { x: 490, y: 340 }, { x: 680, y: 270 },
                { x: 900, y: 200 }, { x: 1090, y: 140 }, { x: 1310, y: 210 },
                { x: 1500, y: 280 }, { x: 1690, y: 360 }, { x: 1940, y: 310 },
                { x: 2150, y: 240 }, { x: 2340, y: 160 }, { x: 2560, y: 240 },
                { x: 2800, y: 310 }, { x: 3040, y: 380 }, { x: 3270, y: 310 },
                { x: 3500, y: 240 }, { x: 3690, y: 160 }, { x: 3910, y: 240 },
                { x: 4150, y: 310 }, { x: 4360, y: 240 }
            ],
            goal: { x: 4350, y: 440, width: 40, height: 100 },
            decorations: [
                { x: 400, y: 80, type: 'cloud' }, { x: 1000, y: 120, type: 'cloud' },
                { x: 1600, y: 90, type: 'cloud' }, { x: 2200, y: 140, type: 'cloud' },
                { x: 2800, y: 100, type: 'cloud' }, { x: 3400, y: 130, type: 'cloud' },
                { x: 4000, y: 110, type: 'cloud' }
            ]
        },
        {
            name: "Final Fortress",
            theme: "castle",
            width: 5000,
            groundHeight: 100,
            platforms: [
                { x: 0, y: 540 - 100, width: 5000, height: 100, type: 'ground' },
                { x: 200, y: 450, width: 50, height: 20, type: 'platform' },
                { x: 400, y: 390, width: 60, height: 20, type: 'platform' },
                { x: 600, y: 330, width: 50, height: 20, type: 'platform' },
                { x: 800, y: 270, width: 80, height: 20, type: 'platform' },
                { x: 1000, y: 210, width: 60, height: 20, type: 'platform' },
                { x: 1200, y: 160, width: 80, height: 20, type: 'platform' },
                { x: 1400, y: 220, width: 100, height: 20, type: 'platform' },
                { x: 1600, y: 300, width: 80, height: 20, type: 'platform' },
                { x: 1800, y: 380, width: 60, height: 20, type: 'platform' },
                { x: 2000, y: 330, width: 160, height: 20, type: 'platform' },
                { x: 2250, y: 260, width: 80, height: 20, type: 'platform' },
                { x: 2450, y: 180, width: 60, height: 20, type: 'platform' },
                { x: 2650, y: 260, width: 100, height: 20, type: 'platform' },
                { x: 2900, y: 330, width: 80, height: 20, type: 'platform' },
                { x: 3100, y: 400, width: 60, height: 20, type: 'platform' },
                { x: 3300, y: 330, width: 120, height: 20, type: 'platform' },
                { x: 3550, y: 260, width: 80, height: 20, type: 'platform' },
                { x: 3750, y: 180, width: 60, height: 20, type: 'platform' },
                { x: 3950, y: 260, width: 100, height: 20, type: 'platform' },
                { x: 4200, y: 330, width: 80, height: 20, type: 'platform' },
                { x: 4400, y: 400, width: 60, height: 20, type: 'platform' },
                { x: 4600, y: 330, width: 100, height: 20, type: 'platform' },
                { x: 4800, y: 260, width: 80, height: 20, type: 'platform' }
            ],
            enemies: [
                { x: 500, y: 490, type: 'walker' },
                { x: 900, y: 490, type: 'hopper' },
                { x: 1300, y: 490, type: 'walker' },
                { x: 1700, y: 490, type: 'walker' },
                { x: 2100, y: 490, type: 'hopper' },
                { x: 2500, y: 490, type: 'walker' },
                { x: 2900, y: 490, type: 'hopper' },
                { x: 3300, y: 490, type: 'walker' },
                { x: 3700, y: 490, type: 'hopper' },
                { x: 4100, y: 490, type: 'walker' },
                { x: 4500, y: 490, type: 'hopper' },
                { x: 4800, y: 490, type: 'walker' }
            ],
            obstacles: [
                { x: 400, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 1000, y: 510, width: 60, height: 30, type: 'spike' },
                { x: 1600, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 2300, y: 510, width: 70, height: 30, type: 'spike' },
                { x: 3000, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 3600, y: 510, width: 60, height: 30, type: 'spike' },
                { x: 4200, y: 510, width: 50, height: 30, type: 'spike' },
                { x: 4700, y: 510, width: 60, height: 30, type: 'spike' }
            ],
            coins: [
                { x: 225, y: 410 }, { x: 430, y: 350 }, { x: 625, y: 290 },
                { x: 840, y: 230 }, { x: 1030, y: 170 }, { x: 1240, y: 120 },
                { x: 1450, y: 180 }, { x: 1640, y: 260 }, { x: 1830, y: 340 },
                { x: 2080, y: 290 }, { x: 2290, y: 220 }, { x: 2480, y: 140 },
                { x: 2700, y: 220 }, { x: 2940, y: 290 }, { x: 3130, y: 360 },
                { x: 3360, y: 290 }, { x: 3590, y: 220 }, { x: 3780, y: 140 },
                { x: 4000, y: 220 }, { x: 4240, y: 290 }, { x: 4430, y: 360 },
                { x: 4650, y: 290 }, { x: 4840, y: 220 }
            ],
            goal: { x: 4850, y: 440, width: 40, height: 100 },
            decorations: [
                { x: 300, y: 60, type: 'cloud' }, { x: 900, y: 100, type: 'cloud' },
                { x: 1500, y: 80, type: 'cloud' }, { x: 2100, y: 120, type: 'cloud' },
                { x: 2700, y: 90, type: 'cloud' }, { x: 3300, y: 110, type: 'cloud' },
                { x: 3900, y: 70, type: 'cloud' }, { x: 4500, y: 100, type: 'cloud' }
            ]
        }
    ],

    // Theme color overrides
    THEMES: {
        grass: {
            sky: '#87CEEB',
            ground: '#8B4513',
            groundTop: '#228B22',
            platform: '#A0522D',
            background: '#4682B4'
        },
        desert: {
            sky: '#E8D5B7',
            ground: '#C19A6B',
            groundTop: '#D2B48C',
            platform: '#A0522D',
            background: '#F5DEB3'
        },
        ice: {
            sky: '#B0E0E6',
            ground: '#87CEEB',
            groundTop: '#ADD8E6',
            platform: '#B0C4DE',
            background: '#E0FFFF'
        },
        volcano: {
            sky: '#2F1B1B',
            ground: '#4A2513',
            groundTop: '#654321',
            platform: '#8B4513',
            background: '#1C1005'
        },
        castle: {
            sky: '#2C3E50',
            ground: '#4A4A4A',
            groundTop: '#5A5A5A',
            platform: '#6B5B73',
            background: '#1A1A2E'
        }
    },

    // UI settings
    UI: {
        fontSize: '16px',
        largeFontSize: '32px',
        titleFontSize:
