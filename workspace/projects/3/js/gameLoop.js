(function() {
    const state = {
        playing: false,
        gameOver: false,
        won: false,
        paused: false,
        score: 0,
        coins: 0,
        lives: 3,
        levelIndex: 0,
        time: 0,
        frameCount: 0,
        invulnTimer: 0,
        comboCount: 0,
        comboTimer: 0,
        shakeX: 0,
        shakeY: 0,
        shakeDuration: 0,
        shakeMax: 0,
        lastTime: 0
    };

    let player = null;
    let enemies = [];
    let platforms = [];
    let coinsArr = [];
    let powerups = [];
    let particles = [];
    let decorations = [];
    let flagObj = null;
    let levelStartTimer = 0;
    let transitionAlpha = 0;
    let transitioning = false;
    let transitionTarget = null;

    function resetGame() {
        state.score = 0;
        state.coins = 0;
        state.lives = 3;
        state.levelIndex = 0;
        state.time = 0;
        state.frameCount = 0;
        state.invulnTimer = 0;
        state.comboCount = 0;
        state.comboTimer = 0;
        state.shakeX = 0;
        state.shakeY = 0;
        state.shakeDuration = 0;
        state.shakeMax = 0;
        state.playing = true;
        state.gameOver = false;
        state.won = false;
        state.paused = false;
        enemies = [];
        platforms = [];
        coinsArr = [];
        powerups = [];
        particles = [];
        decorations = [];
        flagObj = null;
        loadLevel(0);
    }

    function loadLevel(idx) {
        state.levelIndex = idx;
        state.invulnTimer = 0;
        state.comboCount = 0;
        state.comboTimer = 0;
        state.shakeDuration = 0;
        state.shakeMax = 0;
        state.shakeX = 0;
        state.shakeY = 0;
        enemies = [];
        platforms = [];
        coinsArr = [];
        powerups = [];
        particles = [];
        decorations = [];
        flagObj = null;
        levelStartTimer = 1.5;

        const level = LEVELS[idx];
        const tiles = level.tiles;

        for (let ty = 0; ty < tiles.length; ty++) {
            for (let tx = 0; tx < tiles[ty].length; tx++) {
                const ch = tiles[ty][tx];
                if (ch === '#' || ch === '=' || ch === '~') {
                    platforms.push({
                        x: tx * TILE_W,
                        y: ty * TILE_H,
                        w: TILE_W,
                        h: TILE_H,
                        type: ch === '#' ? 'ground' : (ch === '=' ? 'brick' : 'cloud'),
                        destroyed: false,
                        bounce: 0
                    });
                }
                if (ch === 'P') {
                    const p = createPlayer(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2 - 5);
                    player = p;
                }
                if (ch === 'E') {
                    enemies.push(createEnemy(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2));
                }
                if (ch === 'F') {
                    enemies.push(createFlameEnemy(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2));
                }
                if (ch === 'B') {
                    enemies.push(createBatEnemy(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2));
                }
                if (ch === 'c') {
                    coinsArr.push(createCoin(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2));
                }
                if (ch === 'H') {
                    powerups.push(createPowerup(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2, 'heart'));
                }
                if (ch === 'S') {
                    powerups.push(createPowerup(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2, 'star'));
                }
                if (ch === 'J') {
                    powerups.push(createPowerup(tx * TILE_W + TILE_W/2, ty * TILE_H + TILE_H/2, 'jump'));
                }
                if (ch === 'I') {
                    flagObj = { x: tx * TILE_W + TILE_W/2, y: ty * TILE_H, h: TILE_H * 3, reached: false, flagWave: 0 };
                }
                if (ch === 'D') {
                    decorations.push({ x: tx * TILE_W + TILE_W/2, y: ty * TILE_H + TILE_H, type: 'tree' });
                }
                if (ch === 'd') {
                    decorations.push({ x: tx * TILE_W + TILE_W/2, y: ty * TILE_H + TILE_H, type: 'flower' });
                }
                if (ch === 'L') {
                    const lastTile = { x: tx * TILE_W, y: ty * TILE_H, w: TILE_W, h: TILE_H, type: 'last' };
                    platforms.push(lastTile);
                }
            }
        }

        if (!player) {
            player = createPlayer(TILE_W * 2, TILE_H * 2);
        }

        state.levelWidth = Math.max(...level.tiles.map(row => row.length)) * TILE_W;
        state.levelHeight = level.tiles.length * TILE_H;
    }

    function createPlayer(x, y) {
        return {
            x: x, y: y,
            vx: 0, vy: 0,
            w: 24, h: 32,
            onGround: false,
            facingRight: true,
            jumpPressed: false,
            crouch: false,
            speed: 0,
            maxSpeed: 4.5,
            jumpForce: -11.5,
            power: 0, // 0 normal, 1 super
            invuln: 0,
            animFrame: 0,
            animTimer: 0,
            squashTimer: 0,
            mushroomState: 'small',
            growingTimer: 0,
            dying: false,
            deathTimer: 0,
            coinPopUp: 0,
            starEffect: 0
        };
    }

    function createEnemy(x, y) {
        return {
            x: x, y: y,
            vx: -1.2, vy: 0,
            w: 28, h: 28,
            onGround: false,
            active: false,
            activeX: x,
            type: 'goomba',
            hp: 1,
            squashed: false,
            squashTimer: 0,
            animFrame: 0,
            animTimer: 0,
            dead: false,
            deathAnim: 0
        };
    }

    function createFlameEnemy(x, y) {
        return {
            x: x, y: y,
            vx: -0.8, vy: 0,
            w: 28, h: 28,
            onGround: false,
            active: false,
            activeX: x,
            type: 'flame',
            hp: 1,
            squashed: false,
            squashTimer: 0,
            animFrame: 0,
            animTimer: 0,
            dead: false,
            deathAnim: 0,
            flameFrame: 0
        };
    }

    function createBatEnemy(x, y) {
        return {
            x: x, y: y,
            vx: 1, vy: 0,
            w: 28, h: 28,
            onGround: false,
            active: false,
            activeX: x,
            type: 'bat',
            hp: 1,
            squashed: false,
            squashTimer: 0,
            animFrame: 0,
            animTimer: 0,
            dead: false,
            deathAnim: 0,
            baseY: y,
            batAngle: Math.random() * Math.PI * 2,
            batFloat: 0
        };
    }

    function createCoin(x, y) {
        return {
            x: x, y: y,
            w: 16, h: 16,
            collected: false,
            spinAngle: 0,
            popUp: 0,
            active: true
        };
    }

    function createPowerup(x, y, type) {
        return {
            x: x, y: y,
            vx: type === 'star' ? -1.5 : 0,
            vy: 0,
            w: 24, h: 24,
            type: type,
            active: true,
            onGround: false,
            animFrame: 0,
            animTimer: 0,
            starGlow: 0
        };
    }

    function createParticle(x, y, vx, vy, color, life, size, gravity) {
        return {
            x: x, y: y,
            vx: vx, vy: vy,
            color: color,
            life: life,
            maxLife: life,
            size: size,
            gravity: gravity || 0.3
        };
    }

    function spawnParticles(x, y, count, color, spread, life) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * spread;
            particles.push(createParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 1,
                color,
                life || 40,
                Math.random() * 4 + 2,
                0.15
            ));
        }
    }

    function spawnCoinParticles(x, y) {
        for (let i = 0; i < 8; i++) {
            particles.push(createParticle(
                x, y,
                (Math.random() - 0.5) * 3,
                -Math.random() * 4 - 2,
                '#FFD700',
                30 + Math.random() * 20,
                3 + Math.random() * 3,
                0.2
            ));
        }
    }

    function triggerShake(intensity) {
        state.shakeDuration = 15;
        state.shakeMax = intensity;
    }

    function addScore(points, x, y) {
        state.score += points;
        if (x !== undefined && y !== undefined) {
            particles.push(createParticle(x, y - 10, 0, -1.5, '#FFF', 40, 12, -0.05));
        }
    }

    function addCoin() {
        state.coins++;
        addScore(100);
    }

    function triggerCombo() {
        state.comboCount++;
        state.comboTimer = 90;
        if (state.comboCount > 1) {
            const bonus = state.comboCount * 50;
            addScore(bonus);
        }
    }

    function checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.w &&
               rect1.x + rect1.w > rect2.x &&
               rect1.y < rect2.y + rect2.h &&
               rect1.y + rect1.h > rect2.y;
    }

    function updatePlayer(dt, keys, mouse) {
        if (!player || player.dying) return;

        if (player.growingTimer > 0) {
            player.growingTimer -= dt;
            return;
        }

        if (player.invuln > 0) {
            player.invuln -= dt;
            if (player.invuln < 0) player.invuln = 0;
        }

        if (player.starEffect > 0) {
            player.starEffect -= dt;
        }

        const accel = 0.4;
        const friction = 0.88;
        const maxSpd = player.power === 1 ? 5.5 : 4.5;

        let moveDir = 0;
        if (keys.left) {
            moveDir = -1;
            player.facingRight = false;
        }
        if (keys.right) {
            moveDir = 1;
            player.facingRight = true;
        }

        if (moveDir !== 0) {
            player.vx += moveDir * accel;
            if (player.vx > maxSpd) player.vx = maxSpd;
            if (player.vx < -maxSpd) player.vx = -maxSpd;
        } else {
            player.vx *= friction;
            if (Math.abs(player.vx) < 0.1) player.vx = 0;
        }

        if (keys.jump && !player.jumpPressed && player.onGround) {
            player.vy = player.jumpForce * (player.power === 1 ? 1.1 : 1.0);
            player.onGround = false;
            player.jumpPressed = true;
            spawnParticles(player.x, player.y + player.h/2, 5, '#8B4513', 2, 20);
        }
        if (!keys.jump) {
            player.jumpPressed = false;
            if (player.vy < -3) player.vy = -3;
        }

        player.vy += GRAVITY * dt * 60;
        if (player.vy > 14) player.vy = 14;

        player.x += player.vx * dt * 60;
        player.y += player.vy * dt * 60;

        player.onGround = false;
        for (let p of platforms) {
            if (p.destroyed) continue;
            if (checkCollision(player, p)) {
                const overlapX = Math.min(player.x + player.w - p.x, p.x + p.w - player.x);
                const overlapY = Math.min(player.y + player.h - p.y, p.y + p.h - player.y);
                if (overlapX < overlapY) {
                    if (player.x + player.w/2 < p.x + p.w/2) {
                        player.x = p.x - player.w;
                    } else {
                        player.x = p.x + p.w;
                    }
                    player.vx = 0;
                } else {
                    if (player.y + player.h/2 < p.y + p.h/2) {
                        player.y = p.y - player.h;
                        if (player.vy > 0) {
                            if (p.type === 'cloud') {
                                p.bounce = 1;
                            }
                            player.vy = 0;
                            player.onGround = true;
                        } else {
                            if (p.type === 'brick' && player.power === 1) {
                                p.destroyed = true;
                                p.bounce = 1;
                                spawnParticles(p.x + p.w/2, p.y + p.h/2, 8, '#A0522D', 3, 35);
                                triggerShake(4);
                                addScore(50, p.x + p.w/2, p.y);
                            } else {
                                player.vy = 0;
                                player.onGround = true;
                            }
                        }
                    } else {
                        if (p.type === 'cloud') {
                            player.vy = 0;
                            player.onGround = true;
                        } else {
                            player.y = p.y + p.h;
                            if (player.vy < 0) player.vy = 0;
                        }
                    }
                }
            }
        }

        if (player.x < 0) player.x = 0;
        if (player.x > state.levelWidth - player.w) player.x = state.levelWidth - player.w;

        if (player.y > state.levelHeight + 100) {
            killPlayer();
            return;
        }

        player.animTimer += dt * 60;
        if (player.animTimer > 8) {
            player.animTimer = 0;
            player.animFrame = (player.animFrame + 1) % 4;
        }

        if (player.squashTimer > 0) player.squashTimer -= dt * 60;
    }

    function killPlayer() {
        if (player.dying) return;
        player.dying = true;
        player.deathTimer = 60;
        triggerShake(6);
        spawnParticles(player.x + player.w/2, player.y + player.h/2, 15, '#FF4444', 5, 50);
    }

    function damagePlayer() {
        if (player.invuln > 0 || player.dying || player.starEffect > 0) return;

        if (player.power === 1) {
            player.power = 0;
            player.invuln = 90;
            triggerShake(3);
            spawnParticles(player.x + player.w/2, player.y + player.h/2, 8, '#FF6644', 3, 30);
        } else {
            killPlayer();
        }
    }

    function updateEnemies(dt, keys, mouse) {
        for (let e of enemies) {
            if (e.dead) {
                e.deathAnim += dt * 60;
                if (e.deathAnim > 40) e.active = false;
                continue;
            }
            if (e.squashed) {
                e.squashTimer -= dt * 60;
                if (e.squashTimer <= 0) e.active = false;
                continue;
            }

            const distToPlayer = Math.abs(e.x - (player ? player.x : -1000));
            if (!e.active) {
                if (distToPlayer < 300 && player) {
                    e.active = true;
                    e.activeX = e.x;
                }
                if (!e.active) continue;
            }

            if (e.type === 'bat') {
                e.batAngle += 0.05 * dt * 60;
                e.batFloat = Math.sin(e.batAngle) * 20;
                e.y = e.baseY + e.batFloat;
                e.x += e.vx * dt * 60;
                if (e.x < e.activeX - 150 || e.x > e.activeX + 150) e.vx *= -1;
            } else {
                e.vy += GRAVITY * dt * 60;
                if (e.vy > 10) e.vy = 10;
                e.x += e.vx * dt * 60;
                e.y += e.vy * dt * 60;

                e.onGround = false;
                for (let p of platforms) {
                    if (p.destroyed) continue;
                    if (checkCollision(e, p)) {
                        const overlapX = Math.min(e.x + e.w - p.x, p.x + p.w - e.x);
                        const overlapY = Math.min(e.y + e.h - p.y, p.y + p.h - e.y);
                        if (overlapX < overlapY) {
                            if (e.x + e.w/2 < p.x + p.w/2) {
                                e.x = p.x - e.w;
                                e.vx = 0;
                            } else {
                                e.x = p.x + p.w;
                                e.vx = 0;
                            }
                            e.vx = -Math.abs(e.vx || 1) * (e.type === 'flame' ? 0.8 : 1.2);
                        } else {
                            if (e.y + e.h/2 < p.y + p.h/2) {
                                e.y = p.y - e.h;
                                if (e.vy > 0) e.vy = 0;
                                e.onGround = true;
                            } else {
                                e.y = p.y + p.h;
                                e.vx = 0;
                            }
                        }
                    }
                }

                if (e.x < e.activeX - 200) e.vx = Math.abs(e.vx || 1.2);
                if (e.x > e.activeX + 200) e.vx = -Math.abs(e.vx || 1.2);
            }

            if (e.x < -100 || e.x > state.levelWidth + 100 || e.y > state.levelHeight + 100) {
                e.active = false;
            }

            e.animTimer += dt * 60;
            if (e.animTimer > 10) {
                e.animTimer = 0;
                e.animFrame = (e.animFrame + 1) % 2;
            }
        }
    }

    function updateCoins(dt) {
        for (let c of coinsArr) {
            if (c.collected) continue;
            c.spinAngle += 0.08 * dt * 60;
            if (c.popUp > 0) c.popUp -= dt * 60;
        }
    }

    function updatePowerups(dt) {
        for (let pu of powerups) {
            if (!pu.active) continue;

            if (pu.type === 'star') {
                pu.starGlow += 0.15 * dt * 60;
                pu.vy += GRAVITY * dt * 60;
                if (pu.vy > 8) pu.vy = 8;
                pu.x += pu.vx * dt * 60;
                pu.y += pu.vy * dt * 60;

                pu.onGround = false;
                for (let p of platforms) {
                    if (p.destroyed) continue;
                    if (checkCollision(pu, p)) {
                        const overlapX = Math.min(pu.x + pu.w - p.x, p.x + p.w - pu.x);
                        const overlapY = Math.min(pu.y + pu.h - p.y, p.y + p.h - pu.y);
                        if (overlapX < overlapY) {
                            if (pu.x + pu.w/2 < p.x + p.w/2) {
                                pu.x = p.x - pu.w;
                            } else {
                                pu.x = p.x + p.w;
                            }
                            pu.vx = -pu.vx;
                        } else {
                            if (pu.y + pu.h/2 < p.y + p.h/2) {
                                pu.y = p.y - pu.h;
                                if (pu.vy > 0) pu.vy = 0;
                                pu.onGround = true;
                            } else {
                                pu.y = p.y + p.h;
                            }
                        }
                    }
                }
            } else {
                pu.vy += GRAVITY * dt * 60;
                if (pu.vy > 10) pu.vy = 10;
                pu.x += pu.vx * dt * 60;
                pu.y += pu.vy * dt * 60;

                pu.onGround = false;
                for (let p of platforms) {
                    if (p.destroyed) continue;
                    if (checkCollision(pu, p)) {
                        const overlapX = Math.min(pu.x + pu.w - p.x, p.x + p.w - pu.x);
                        const overlapY = Math.min(pu.y + pu.h - p.y, p.y + p.h - pu.y);
                        if (overlapX < overlapY) {
                            pu.x = p.x + p.w;
                            pu.vx = 0;
                        } else {
                            if (pu.y + pu.h/2 < p.y + p.h/2) {
                                pu.y = p.y - pu.h;
                                if (pu.vy > 0) pu.vy = 0;
                                pu.onGround = true;
                            } else {
                                pu.y = p.y + p.h;
                            }
                        }
                    }
                }
            }

            if (pu.x < -100 || pu.x > state.levelWidth + 100 || pu.y > state.levelHeight + 100) {
                pu.active = false;
            }
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.vy += p.gravity * dt * 60;
            p.life -= dt * 60;
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function updateDecorations(dt) {
        // no-op, decorative
    }

    function handleCollisions() {
        if (!player || player.dying) return;

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.dead || e.squashed || !e.active) continue;
            if (!checkCollision(player, e)) continue;

            if (player.starEffect > 0) {
                e.dead = true;
                e.deathAnim = 0;
                triggerCombo();
                addScore(200, e.x, e.y);
                spawnParticles(e.x + e.w/2, e.y + e.h/2, 10, '#FF6600', 4, 40);
                triggerShake(3);
            } else if (player.vy > 0 && player.y + player.h - e.y < 15 && (e.type === 'goomba' || e.type === 'flame')) {
                e.squashed = true;
                e.squashTimer = 20;
                e.vy = 0;
                triggerCombo();
                const bonus = state.comboCount * 100;
                addScore(100 + bonus, e.x, e.y);
                player.vy = -7;
                triggerShake(2);
                spawnParticles(e.x + e.w/2, e.y + e.h/2, 6, '#888', 3, 25);
            } else {
                damagePlayer();
                player.vy = -6;
                player.vx = player.x < e.x ? -4 : 4;
            }
        }

        for (let c of coinsArr) {
            if (c.collected) continue;
            if (checkCollision(player, c)) {
                c.collected = true;
                addCoin();
                spawnCoinParticles(c.x, c.y);
            }
        }

        for (let pu of powerups) {
            if (!pu.active) continue;
            if (checkCollision(player, pu)) {
                pu.active = false;
                if (pu.type === 'heart') {
                    state.lives++;
                    spawnParticles(pu.x, pu.y, 8, '#FF4466', 3, 35);
                    addScore(50, pu.x, pu.y);
                } else if (pu.type === 'star') {
                    player.starEffect = 480;
                    player.power = 1;
                    spawnParticles(pu.x, pu.y, 12, '#FFFF00', 4, 40);
                    addScore(200, pu.x, pu.y);
                } else if (pu.type === 'jump') {
                    player.power = 1;
                    spawnParticles(pu.x, pu.y, 8, '#44FF44', 3, 35);
                    addScore(100, pu.x, pu.y);
                }
            }
        }

        if (flagObj && !flagObj.reached) {
            flagObj.flagWave += 0.1 * 60 / 60;
            const flagRect = { x: flagObj.x - 15, y: flagObj.y, w: 30, h: flagObj.h };
            if (checkCollision(player, flagRect)) {
                flagObj.reached = true;
                state.won = true;
                addScore(1000);
                spawnParticles(flagObj.x, flagObj.y + flagObj.h/2, 20, '#FFD700', 5, 60);
                triggerShake(5);
            }
        }
    }

    function updatePlatforms(dt) {
        for (let p of platforms) {
            if (p.bounce > 0) {
                p.bounce -= dt * 60 * 0.1;
                if (p.bounce < 0) p.bounce = 0;
            }
        }
    }

    function update(dt, keys, mouse) {
        if (!state.playing || state.gameOver || state.won) return;

        if (levelStartTimer > 0) {
            levelStartTimer -= dt;
            return;
        }

        if (transitioning) {
            transitionAlpha += dt * 4;
            if (transitionAlpha >= 1) {
                transitionAlpha = 1;
                if (transitionTarget !== null) {
                    loadLevel(transitionTarget);
                    transitionTarget = null;
                }
                transitioning = false;
            }
            return;
        }

        state.time += dt;
        state.frameCount++;

        if (state.invulnTimer > 0) state.invulnTimer -= dt * 60;
        if (state.comboTimer > 0) {
            state.comboTimer -= dt * 60;
            if (state.comboTimer <= 0) state.comboCount = 0;
        }

        updatePlayer(dt, keys, mouse);
        updateEnemies(dt, keys, mouse);
        updateCoins(dt);
        updatePowerups(dt);
        updateParticles(dt);
        updateDecorations(dt);
        updatePlatforms(dt);
        handleCollisions();

        if (player.dying) {
            player.deathTimer -= dt * 60;
            player.vy += GRAVITY * 0.5 * dt * 60;
            player.y += player.vy * dt * 60;
            if (player.deathTimer <= 0) {
                state.lives--;
                if (state.lives <= 0) {
                    state.gameOver = true;
                    state.playing = false;
                } else {
                    loadLevel(state.levelIndex);
                }
                player = null;
            }
        }

        if (player && !player.dying) {
            const viewOffset = state.levelWidth > CANVAS_W ? (player.x + player.w/2 - CANVAS_W/2) : 0;
            state.cameraX = Math.max(0, Math.min(viewOffset, state.levelWidth - CANVAS_W));
            if (state.cameraX > state.levelWidth - CANVAS_W) state.cameraX = state.levelWidth - CANVAS_W;
            if (state.levelWidth <= CANVAS_W) state.cameraX = 0;

            if (state.won) {
                state.transitioning = true;
                transitioning = true;
                transitionAlpha = 0;
                if (state.levelIndex < LEVELS.length - 1) {
                    transitionTarget = state.levelIndex + 1;
                } else {
                    state.gameOver = true;
                    state.playing = false;
                }
            }
        }

        if (state.shakeDuration > 0) {
            state.shakeDuration -= dt * 60;
            state.shakeX = (Math.random() - 0.5) * state.shakeMax * (state.shakeDuration / 15);
            state.shakeY = (Math.random() - 0.5) * state.shakeMax * (state.shakeDuration / 15);
        } else {
            state.shakeX = 0;
            state.shakeY = 0;
        }
    }

    function startGame() {
        resetGame();
    }

    function restartGame() {
        resetGame();
    }

    function nextLevel() {
        if (state.levelIndex < LEVELS.length - 1) {
            transitioning = true;
            transitionAlpha = 0;
            transitionTarget = state.levelIndex + 1;
            state.won = false;
        }
    }

    function gameLoop(timestamp) {
        if (!state.lastTime) state.lastTime = timestamp;
        let dt = (timestamp - state.lastTime) / 1000;
        state.lastTime = timestamp;
        if (dt > 0.1) dt = 0.016;

        if (state.playing && !state.paused && !state.gameOver && !state.won) {
            update(dt, getInputState().keys, getInputState().mouse);
        }

        if (renderer && renderer.render) {
            renderer.render(state, player, enemies, platforms, coinsArr, powerups, particles, decorations, flagObj, transitioning, transitionAlpha);
        }

        requestAnimationFrame(gameLoop);
    }

    let inputCache = { keys: {}, mouse: { x: 0, y: 0, down: false }, lastTouch: null };

    function getInputState() {
        return inputCache;
    }

    function initGameLoop() {
        if (typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', function(e) {
                if (state.gameOver || state.won) {
                    if (e.code === 'Space' || e.code === 'Enter') {
                        restartGame();
                    }
                    return;
                }
                switch (e.code) {
                    case 'ArrowLeft':
                    case 'KeyA':
                        inputCache.keys.left = true;
                        e.preventDefault();
                        break;
                    case 'ArrowRight':
                    case 'KeyD':
                        inputCache.keys.right = true;
                        e.preventDefault();
                        break;
                    case 'Space':
                    case 'ArrowUp':
                    case 'KeyW':
                        inputCache.keys.jump = true;
                        e.preventDefault();
                        break;
                    case 'KeyS':
                    case 'ArrowDown':
                        inputCache.keys.crouch = true;
                        e.preventDefault();
                        break;
                    case 'KeyR':
                        restartGame();
                        break;
                    case 'KeyP':
                        if (state.playing && !state.gameOver && !state.won) {
                            state.paused = !state.paused;
                        }
                        break;
                }
            });

            window.addEventListener('keyup', function(e) {
                switch (e.code) {
                    case 'ArrowLeft':
                    case 'KeyA':
                        inputCache.keys.left = false;
                        break;
                    case 'ArrowRight':
                    case 'KeyD':
                        inputCache.keys.right = false;
                        break;
                    case 'Space':
                    case 'ArrowUp':
                    case 'KeyW':
                        inputCache.keys.jump = false;
                        break;
                    case 'KeyS':
                    case 'ArrowDown':
                        inputCache.keys.crouch = false;
                        break;
                }
            });

            if (typeof document !== 'undefined' && document.documentElement) {
                document.addEventListener('touchstart', function(e) {
                    e.preventDefault();
                    if (state.gameOver || state.won) {
                        restartGame();
                        return;
                    }
                    const touches = e.changedTouches;
                    for (let i = 0; i < touches.length; i++) {
                        const t = touches[i];
                        if (t.clientX < window.innerWidth / 3) {
                            inputCache.keys.left = true;
                        } else if (t.clientX > window.innerWidth * 2 / 3) {
                            inputCache.keys.right = true;
                        } else {
                            inputCache.keys.jump = true;
                        }
                    }
                }, { passive: false });

                document.addEventListener('touchend', function(e) {
                    e.preventDefault();
                    inputCache.keys.left = false;
                    inputCache.keys.right = false;
                    inputCache.keys.jump = false;
                }, { passive: false });
            }

            document.addEventListener('mousemove', function(e) {
                if (typeof document !== 'undefined' && document.elementFromPoint) {
                    inputCache.mouse.x = e.clientX;
                    inputCache.mouse.y = e.clientY;
                }
            });
            document.addEventListener('mousedown', function(e) {
                if (state.gameOver || state.won) {
                    restartGame();
                    return;
                }
                inputCache.mouse.down = true;
                if (e.button === 0) {
                    inputCache.keys.jump = true;
                }
            });
            document.addEventListener('mouseup', function(e) {
                inputCache.mouse.down = false;
                if (e.button === 0) {
                    inputCache.keys.jump = false;
                }
            });
        }

        startGame();
        requestAnimationFrame(gameLoop);
    }

    function startGameLoop() {
        initGameLoop();
    }

    if (typeof window !== 'undefined') {
        window.MushroomRunnerGameLoop = {
            start: startGameLoop,
            restart: restartGame,
            nextLevel: nextLevel,
            state: state
        };
        window.addEventListener('DOMContentLoaded', function() {
            initGameLoop();
        });
    }
})();
