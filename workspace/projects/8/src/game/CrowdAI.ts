class CrowdAI {
    constructor(game) {
        this.game = game;
        this.enemies = [];
        this.soldierTiers = ['grunt', 'archer', 'spearman', 'shield', 'cavalry', 'elite', 'officer'];
        this.maxAttackTokens = 3;
        this.currentAttackTokens = 0;
        this.moraleThreshold = 0.3;
        this.fleeRadius = 15;
        this.surroundRadius = 12;
        this.gridSize = 10;
        this.grid = new Map();
        this.tickInterval = 1 / 60;
        this.lastTickTime = 0;
        this.distanceThrottle = {
            grunt: 5,
            archer: 8,
            spearman: 6,
            shield: 4,
            cavalry: 7,
            elite: 3,
            officer: 2
        };
        this.flockParams = {
            separation: 2.5,
            alignment: 0.8,
            cohesion: 0.7,
            maxSpeed: 4,
            maxForce: 0.15
        };
        this.behaviorWeights = {
            flee: 1.5,
            surround: 1.0,
            flock: 0.8,
            seek: 1.2
        };
        this.attackCooldowns = {};
        this.spawnTimer = 0;
        this.maxEnemies = 300;
        this.waveSize = 50;
        this.betweenWaves = 3;
        this.missionType = 'defeat_commander';
        this.commanderDefeated = false;
        this.reinforcementTriggers = [
            { distance: 30, chance: 0.3, type: 'ambush' },
            { time: 60, chance: 0.5, type: 'reinforcement' },
            { lowHealth: 0.2, chance: 0.4, type: 'officer_challenge' }
        ];
        this.audioEvents = ['hit', 'death', 'flee', 'charge'];
        this.onFleeStart = null;
        this.onAttackStart = null;
        this.onEnemySpawned = null;
        this.onWaveComplete = null;
        this.onMoraleBreak = null;
    }

    init() {
        this.reset();
        this.startNextWave();
    }

    reset() {
        this.enemies = [];
        this.currentAttackTokens = 0;
        this.attackCooldowns = {};
        this.spawnTimer = 0;
        this.commanderDefeated = false;
        this.lastTickTime = 0;
        this.clearGrid();
        if (this.onReset) this.onReset();
    }

    startNextWave() {
        if (this.enemies.length >= this.maxEnemies) return;
        const waveType = this.randomWaveType();
        const composition = this.generateWaveComposition(waveType);
        composition.forEach((tier, i) => {
            setTimeout(() => this.spawnEnemy(tier, i * 0.1), i * 200);
        });
        if (this.onWaveComplete) this.onWaveComplete(composition.length);
    }

    randomWaveType() {
        const types = ['basic', 'mixed', 'elite', 'reinforcement'];
        if (this.commanderDefeated) return 'reinforcement';
        const rand = Math.random();
        if (rand < 0.3) return 'basic';
        if (rand < 0.6) return 'mixed';
        if (rand < 0.8) return 'elite';
        return 'reinforcement';
    }

    generateWaveComposition(type) {
        const comp = [];
        const sizes = { basic: 15, mixed: 30, elite: 20, reinforcement: 40 };
        const distribution = {
            basic: { grunt: 0.7, archer: 0.2, spearman: 0.1 },
            mixed: { grunt: 0.4, archer: 0.2, spearman: 0.15, shield: 0.15, cavalry: 0.1 },
            elite: { grunt: 0.3, archer: 0.2, spearman: 0.15, shield: 0.1, cavalry: 0.1, elite: 0.15 },
            reinforcement: { grunt: 0.25, archer: 0.15, spearman: 0.15, shield: 0.15, cavalry: 0.1, elite: 0.15, officer: 0.05 }
        };
        const size = sizes[type];
        const dist = distribution[type];
        for (let i = 0; i < size; i++) {
            const roll = Math.random();
            let cumulative = 0;
            let tier = 'grunt';
            for (const [t, prob] of Object.entries(dist)) {
                cumulative += prob;
                if (roll < cumulative) {
                    tier = t;
                    break;
                }
            }
            comp.push(tier);
        }
        return comp;
    }

    spawnEnemy(tier, offsetDelay = 0) {
        const player = this.game.player;
        if (!player) return;
        const spawnPos = this.getSpawnPosition(tier);
        const enemy = {
            id: `enemy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tier: tier,
            position: spawnPos,
            velocity: { x: 0, y: 0 },
            health: this.getTierStats(tier).health,
            maxHealth: this.getTierStats(tier).health,
            speed: this.getTierStats(tier).speed,
            damage: this.getTierStats(tier).damage,
            attackRange: this.getTierStats(tier).attackRange,
            morale: 1.0,
            state: 'idle',
            attackCooldown: 0,
            fleeTimer: 0,
            facing: 0,
            isAttacking: false,
            tokenHeld: false,
            lastTick: 0,
            flockOffset: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 }
        };
        if (tier === 'officer' && Math.random() < 0.1 && !this.commanderDefeated) {
            enemy.isCommander = true;
            enemy.health *= 3;
            enemy.maxHealth = enemy.health;
        }
        this.enemies.push(enemy);
        if (this.onEnemySpawned) this.onEnemySpawned(enemy);
    }

    getSpawnPosition(tier) {
        const player = this.game.player;
        if (!player) return { x: 0, y: 0 };
        const angle = Math.random() * Math.PI * 2;
        const distance = tier === 'officer' ? 40 : tier === 'commander' ? 50 : 25 + Math.random() * 15;
        const x = player.position.x + Math.cos(angle) * distance;
        const y = player.position.y + Math.sin(angle) * distance;
        return { x: this.clampPosition(x, 0, 0.9), y: this.clampPosition(y, 0, 0.9) };
    }

    clampPosition(val, min, max) {
        return Math.max(min * 100, Math.min(max * 100, val));
    }

    getTierStats(tier) {
        const baseStats = {
            grunt: { health: 50, speed: 2.0, damage: 8, attackRange: 3 },
            archer: { health: 40, speed: 1.8, damage: 12, attackRange: 15 },
            spearman: { health: 70, speed: 2.2, damage: 10, attackRange: 5 },
            shield: { health: 120, speed: 1.5, damage: 6, attackRange: 2.5 },
            cavalry: { health: 80, speed: 3.5, damage: 15, attackRange: 4 },
            elite: { health: 150, speed: 2.5, damage: 20, attackRange: 4 },
            officer: { health: 300, speed: 2.0, damage: 30, attackRange: 6 }
        };
        return baseStats[tier] || baseStats.grunt;
    }

    update(dt) {
        if (this.enemies.length === 0) {
            this.spawnTimer += dt;
            if (this.spawnTimer >= this.betweenWaves) {
                this.spawnTimer = 0;
                this.startNextWave();
            }
            return;
        }

        this.lastTickTime += dt;
        if (this.lastTickTime < this.tickInterval) return;
        this.lastTickTime = 0;

        this.updateGrid();
        this.assignAttackTokens();
        
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.health <= 0) {
                this.enemies.splice(i, 1);
                continue;
            }

            this.checkDistanceThrottle(enemy);
            if (enemy.lastTick < dt) continue;

            const distToPlayer = this.distance(enemy.position, this.game.player.position);
            const neighbors = this.queryGrid(enemy.position, 10);

            let behavior = 'seek';
            if (enemy.morale < this.moraleThreshold && distToPlayer < this.fleeRadius) {
                behavior = 'flee';
            } else if (distToPlayer < this.surroundRadius && this.currentAttackTokens < this.maxAttackTokens) {
                behavior = 'surround';
            } else if (distToPlayer > 30) {
                behavior = 'seek';
            } else {
                behavior = 'flock';
            }

            this.updateBehavior(enemy, behavior, neighbors, distToPlayer, dt);
        }

        this.checkReinforcements();
    }

    checkDistanceThrottle(enemy) {
        const throttle = this.distanceThrottle[enemy.tier] || 5;
        if (enemy.lastTick === 0) {
            enemy.lastTick = 0;
            return;
        }
        enemy.lastTick += 1;
        if (enemy.lastTick >= throttle) {
            enemy.lastTick = 0;
        } else {
            return;
        }
    }

    updateGrid() {
        this.clearGrid();
        for (const enemy of this.enemies) {
            const cellX = Math.floor(enemy.position.x / this.gridSize);
            const cellY = Math.floor(enemy.position.y / this.gridSize);
            const key = `${cellX},${cellY}`;
            if (!this.grid.has(key)) {
                this.grid.set(key, []);
            }
            this.grid.get(key).push(enemy);
        }
    }

    clearGrid() {
        this.grid.clear();
    }

    queryGrid(position, radius) {
        const results = [];
        const cellRadius = Math.ceil(radius / this.gridSize);
        const centerCellX = Math.floor(position.x / this.gridSize);
        const centerCellY = Math.floor(position.y / this.gridSize);

        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dy = -cellRadius; dy <= cellRadius; dy++) {
                const key = `${centerCellX + dx},${centerCellY + dy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const enemy of cell) {
                        if (enemy !== this.game.player && this.distance(position, enemy.position) <= radius) {
                            results.push(enemy);
                        }
                    }
                }
            }
        }
        return results;
    }

    assignAttackTokens() {
        this.currentAttackTokens = 0;
        for (const enemy of this.enemies) {
            enemy.tokenHeld = false;
        }

        const inRange = this.enemies.filter(e => {
            const d = this.distance(e.position, this.game.player.position);
            return d < e.attackRange && e.health > 0;
        });

        inRange.sort((a, b) => {
            const da = this.distance(a.position, this.game.player.position);
            const db = this.distance(b.position, this.game.player.position);
            return da - db;
        });

        for (let i = 0; i < inRange.length && this.currentAttackTokens < this.maxAttackTokens; i++) {
            inRange[i].tokenHeld = true;
            this.currentAttackTokens++;
        }
    }

    updateBehavior(enemy, behavior, neighbors, distToPlayer, dt) {
        switch (behavior) {
            case 'flee':
                this.updateFlee(enemy, dt);
                break;
            case 'surround':
                this.updateSurround(enemy, neighbors, dt);
                break;
            case 'flock':
                this.updateFlock(enemy, neighbors, dt);
                break;
            case 'seek':
                this.updateSeek(enemy, dt);
                break;
        }

        if (enemy.tokenHeld && distToPlayer < enemy.attackRange && enemy.attackCooldown <= 0) {
            this.executeAttack(enemy);
            enemy.attackCooldown = 1.5 + Math.random() * 1;
        }

        if (enemy.attackCooldown > 0) {
            enemy.attackCooldown -= dt;
        }

        this.updateMorale(enemy, distToPlayer, dt);
        this.applyVelocity(enemy, dt);
    }

    updateFlee(enemy, dt) {
        const toPlayer = this.vectorTo(enemy.position, this.game.player.position);
        const fleeDir = {
            x: -toPlayer.x / (Math.hypot(toPlayer.x, toPlayer.y) || 1),
            y: -toPlayer.y / (Math.hypot(toPlayer.x, toPlayer.y) || 1)
        };

        enemy.velocity.x += fleeDir.x * this.flockParams.maxForce * 2;
        enemy.velocity.y += fleeDir.y * this.flockParams.maxForce * 2;

        if (this.onFleeStart && enemy.state !== 'fleeing') {
            this.onFleeStart(enemy);
            if (this.onMoraleBreak) this.onMoraleBreak(enemy);
        }
        enemy.state = 'fleeing';
    }

    updateSurround(enemy, neighbors, dt) {
        const toPlayer = this.vectorTo(enemy.position, this.game.player.position);
        const dist = Math.hypot(toPlayer.x, toPlayer.y);
        
        if (dist > enemy.attackRange) {
            const dir = {
                x: toPlayer.x / dist,
                y: toPlayer.y / dist
            };
            enemy.velocity.x += dir.x * this.flockParams.maxForce;
            enemy.velocity.y += dir.y * this.flockParams.maxForce;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const surroundDir = {
                x: Math.cos(angle),
                y: Math.sin(angle)
            };
            enemy.velocity.x += surroundDir.x * this.flockParams.maxForce * 0.5;
            enemy.velocity.y += surroundDir.y * this.flockParams.maxForce * 0.5;
        }

        enemy.state = 'surrounding';
    }

    updateFlock(enemy, neighbors, dt) {
        let sepX = 0, sepY = 0;
        let alignX = 0, alignY = 0;
        let cohX = 0, cohY = 0;
        let neighborCount = 0;

        for (const neighbor of neighbors) {
            if (neighbor === enemy) continue;
            const dist = this.distance(enemy.position, neighbor.position);
            if (dist < 1 && dist > 0) {
                sepX += (enemy.position.x - neighbor.position.x) / dist;
                sepY += (enemy.position.y - neighbor.position.y) / dist;
            }
            if (dist < 5) {
                alignX += neighbor.velocity.x;
                alignY += neighbor.velocity.y;
                cohX += neighbor.position.x;
                cohY += neighbor.position.y;
                neighborCount++;
            }
        }

        if (neighborCount > 0) {
            alignX /= neighborCount;
            alignY /= neighborCount;
            cohX = cohX / neighborCount - enemy.position.x;
            cohY = cohY / neighborCount - enemy.position.y;

            const alignForce = this.limitForce({
                x: alignX - enemy.velocity.x,
                y: alignY - enemy.velocity.y
            }, this.flockParams.maxForce);

            const cohForce = this.limitForce({
                x: cohX,
                y: cohY
            }, this.flockParams.maxForce);

            enemy.velocity.x += alignForce.x * this.behaviorWeights.alignment + cohForce.x * this.behaviorWeights.cohesion;
            enemy.velocity.y += alignForce.y * this.behaviorWeights.alignment + cohForce.y * this.behaviorWeights.cohesion;
        }

        const sepForce = this.limitForce({
            x: sepX / (neighborCount || 1),
            y: sepY / (neighborCount || 1)
        }, this.flockParams.maxForce * 1.5);

        enemy.velocity.x += sepForce.x * this.behaviorWeights.separation;
        enemy.velocity.y += sepForce.y * this.behaviorWeights.separation;

        enemy.state = 'flocking';
    }

    updateSeek(enemy, dt) {
        const toPlayer = this.vectorTo(enemy.position, this.game.player.position);
        const dist = Math.hypot(toPlayer.x, toPlayer.y);
        if (dist > 0) {
            const dir = {
                x: toPlayer.x / dist,
                y: toPlayer.y / dist
            };
            const seekForce = this.limitForce({
                x: dir.x * enemy.speed - enemy.velocity.x,
                y: dir.y * enemy.speed - enemy.velocity.y
            }, this.flockParams.maxForce);
            enemy.velocity.x += seekForce.x * this.behaviorWeights.seek;
            enemy.velocity.y += seekForce.y * this.behaviorWeights.seek;
        }
        enemy.state = 'seeking';
    }

    executeAttack(enemy) {
        const player = this.game.player;
        const hitChance = 0.8;
        if (Math.random() < hitChance) {
            player.health -= enemy.damage;
            if (this.game.audioManager) {
                this.game.audioManager.playSFX('enemy_hit');
            }
            if (this.game.eventBus) {
                this.game.eventBus.emit('enemy_attack', { 
                    enemy: enemy, 
                    damage: enemy.damage, 
                    position: player.position 
                });
            }
        }
        if (this.onAttackStart) this.onAttackStart(enemy);
        enemy.isAttacking = true;
        setTimeout(() => { enemy.isAttacking = false; }, 500);
    }

    updateMorale(enemy, distToPlayer, dt) {
        if (distToPlayer < this.fleeRadius * 0.5) {
            enemy.morale -= dt * 0.1;
        } else if (distToPlayer > 30) {
            enemy.morale += dt * 0.05;
        }
        enemy.morale = Math.max(0, Math.min(1, enemy.morale));
    }

    applyVelocity(enemy, dt) {
        const speedLimit = enemy.state === 'fleeing' ? enemy.speed * 1.5 : enemy.speed;
        const velocityMag = Math.hypot(enemy.velocity.x, enemy.velocity.y);
        if (velocityMag > speedLimit) {
            enemy.velocity.x = (enemy.velocity.x / velocityMag) * speedLimit;
            enemy.velocity.y = (enemy.velocity.y / velocityMag) * speedLimit;
        }

        enemy.position.x += enemy.velocity.x * dt;
        enemy.position.y += enemy.velocity.y * dt;

        enemy.position.x = this.clampPosition(enemy.position.x, 0.05, 0.95);
        enemy.position.y = this.clampPosition(enemy.position.y, 0.05, 0.95);

        const toPlayer = this.vectorTo(enemy.position, this.game.player.position);
        enemy.facing = Math.atan2(toPlayer.y, toPlayer.x);
    }

    checkReinforcements() {
        const player = this.game.player;
        for (const trigger of this.reinforcementTriggers) {
            let shouldTrigger = false;
            if (trigger.distance && this.distance(player.position, this.game.battlefieldCenter || {x:0.5,y:0.5}) > trigger.distance) {
                shouldTrigger = Math.random() < trigger.chance;
            } else if (trigger.time && this.game.elapsedTime > trigger.time) {
                shouldTrigger = Math.random() < trigger.chance;
            } else if (trigger.lowHealth && player.health < player.maxHealth * trigger.lowHealth) {
                shouldTrigger = Math.random() < trigger.chance;
            }

            if (shouldTrigger) {
                this.startReinforcement(trigger.type);
            }
        }
    }

    startReinforcement(type) {
        const composition = this.generateWaveComposition('reinforcement');
        composition.forEach((tier, i) => {
            setTimeout(() => this.spawnEnemy(tier), i * 300);
        });
        if (this.game.eventBus) {
            this.game.eventBus.emit('reinforcement', { type: type, count: composition.length });
        }
    }

    checkCommanderDefeat() {
        const commander = this.enemies.find(e => e.isCommander);
        if (commander && commander.health <= 0) {
            this.commanderDefeated = true;
            if (this.game.eventBus) {
                this.game.eventBus.emit('commander_defeated', { commander: commander });
            }
            return true;
        }
        return false;
    }

    getStats() {
        const stats = {
            totalEnemies: this.enemies.length,
            currentAttackTokens: this.currentAttackTokens,
            maxAttackTokens: this.maxAttackTokens,
            moraleBreakCount: 0,
            fleeingEnemies: 0,
            attackingEnemies: 0
        };

        for (const enemy of this.enemies) {
            if (enemy.state === 'fleeing') stats.fleeingEnemies++;
            if (enemy.tokenHeld) stats.attackingEnemies++;
            if (enemy.morale < this.moraleThreshold) stats.moraleBreakCount++;
        }

        return stats;
    }

    distance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        return Math.hypot(dx, dy);
    }

    vectorTo(from, to) {
        return {
            x: to.x - from.x,
            y: to.y - from.y
        };
    }

    limitForce(force, maxForce) {
        const magnitude = Math.hypot(force.x, force.y);
        if (magnitude > maxForce) {
            return {
                x: (force.x / magnitude) * maxForce,
                y: (force.y / magnitude) * maxForce
            };
        }
        return force;
    }

    onEnemyTakeDamage(enemy, damage, source) {
        enemy.health -= damage;
        if (enemy.health <= 0) {
            this.game.eventBus.emit('enemy_defeated', { enemy: enemy, source: source });
            if (enemy.isCommander) {
                this.commanderDefeated = true;
            }
        }
    }

    addCallback(callbackType, callback) {
        this[callbackType] = callback;
    }

    destroy() {
        this.enemies = [];
        this.clearGrid();
    }
}

if (typeof window !== 'undefined') {
    window.CrowdAI = CrowdAI;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CrowdAI;
}
