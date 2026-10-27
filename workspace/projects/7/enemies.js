// enemies.js - Enemy AI Logic, Wave Spawning, Group Tactics, Difficulty Scaling, State Machines

const EnemyStates = {
    IDLE: "IDLE",
    MOVE_TO_TARGET: "MOVE_TO_TARGET",
    ATTACK: "ATTACK",
    COOLDOWN: "COOLDOWN",
    RECOVER: "RECOVER",
    STUNNED: "STUNNED",
    DEAD: "DEAD"
};

class Enemy {
    constructor(type, position, waveNumber, difficulty) {
        this.type = type;
        this.position = position.clone();
        this.initialPosition = position.clone();
        this.waveNumber = waveNumber;
        this.difficulty = difficulty;
        this.state = EnemyStates.IDLE;
        this.health = this.getMaxHealth();
        this.maxHealth = this.health;
        this.energy = this.getMaxEnergy();
        this.maxEnergy = this.energy;
        this.speed = this.getSpeed();
        this.attackDamage = this.getAttackDamage();
        this.attackRange = this.getAttackRange();
        this.attackCooldown = this.getAttackCooldown();
        this.currentAttackCooldown = 0;
        this.target = null;
        this.lastAttackTime = 0;
        this.alive = true;
        this.groupId = 0;
        this.movementOffset = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
        this.isMoving = false;
        this.targetDirection = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.stunTimer = 0;
        this.recoverTimer = 0;
        this.spawnTime = 0;
        this.spawnDuration = 0.5;
        this.mesh = null;
        this.createMesh();
    }

    createMesh() {
        const geometry = this.getTypeGeometry();
        const material = this.getTypeMaterial();
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.scale.set(0.01, 0.01, 0.01);
        
        const healthBarGeometry = new THREE.PlaneGeometry(0.8, 0.1);
        const healthBarMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
        const healthBarBg = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
        healthBarBg.position.y = 1.5;
        healthBarBg.renderOrder = 2;
        this.mesh.add(healthBarBg);
        
        const healthBarFillGeometry = new THREE.PlaneGeometry(0.75, 0.05);
        const healthBarFillMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        this.healthBarFill = new THREE.Mesh(healthBarFillGeometry, healthBarFillMaterial);
        this.healthBarFill.position.y = 1.5;
        this.healthBarFill.position.z = 0.01;
        this.healthBarFill.renderOrder = 3;
        this.mesh.add(this.healthBarFill);
        
        this.mesh.visible = false;
    }

    getTypeGeometry() {
        switch (this.type) {
            case "soldier":
                return new THREE.ConeGeometry(0.4, 1.2, 6);
            case "archer":
                return new THREE.CylinderGeometry(0.3, 0.4, 1.0, 8);
            case "knight":
                return new THREE.BoxGeometry(0.8, 1.4, 0.8);
            case "boss":
                return new THREE.SphereGeometry(1.0, 16, 16);
            default:
                return new THREE.BoxGeometry(0.5, 1.0, 0.5);
        }
    }

    getTypeMaterial() {
        switch (this.type) {
            case "soldier":
                return new THREE.MeshPhongMaterial({ color: 0x8b4513, emissive: 0x2b1a09 });
            case "archer":
                return new THREE.MeshPhongMaterial({ color: 0x4169e1, emissive: 0x1a2f5c });
            case "knight":
                return new THREE.MeshPhongMaterial({ color: 0xc0c0c0, emissive: 0x404040, metalness: 0.8 });
            case "boss":
                return new THREE.MeshPhongMaterial({ color: 0xff4500, emissive: 0x7a2200, metalness: 0.3 });
            default:
                return new THREE.MeshPhongMaterial({ color: 0x696969 });
        }
    }

    getMaxHealth() {
        let baseHealth = 100;
        switch (this.type) {
            case "soldier": baseHealth = 80; break;
            case "archer": baseHealth = 60; break;
            case "knight": baseHealth = 150; break;
            case "boss": baseHealth = 500; break;
            default: baseHealth = 100; break;
        }
        return baseHealth * (1 + this.waveNumber * 0.15) * (1 + this.difficulty * 0.2);
    }

    getMaxEnergy() {
        return 50 + this.difficulty * 10;
    }

    getSpeed() {
        let baseSpeed = 2.0;
        switch (this.type) {
            case "soldier": baseSpeed = 2.5; break;
            case "archer": baseSpeed = 1.8; break;
            case "knight": baseSpeed = 1.5; break;
            case "boss": baseSpeed = 1.2; break;
            default: baseSpeed = 2.0; break;
        }
        return baseSpeed * (1 + this.difficulty * 0.1);
    }

    getAttackDamage() {
        let baseDamage = 10;
        switch (this.type) {
            case "soldier": baseDamage = 15; break;
            case "archer": baseDamage = 20; break;
            case "knight": baseDamage = 25; break;
            case "boss": baseDamage = 40; break;
            default: baseDamage = 10; break;
        }
        return baseDamage * (1 + this.waveNumber * 0.1) * (1 + this.difficulty * 0.15);
    }

    getAttackRange() {
        switch (this.type) {
            case "soldier": return 1.5;
            case "archer": return 8.0;
            case "knight": return 2.0;
            case "boss": return 3.0;
            default: return 2.0;
        }
    }

    getAttackCooldown() {
        let baseCooldown = 1.0;
        switch (this.type) {
            case "soldier": baseCooldown = 0.8; break;
            case "archer": baseCooldown = 1.5; break;
            case "knight": baseCooldown = 1.2; break;
            case "boss": baseCooldown = 2.0; break;
            default: baseCooldown = 1.0; break;
        }
        return baseCooldown / (1 + this.difficulty * 0.1);
    }

    update(deltaTime, playerPosition, enemies, scene) {
        if (!this.alive) {
            return;
        }

        this.spawnTime += deltaTime;
        if (this.spawnTime < this.spawnDuration) {
            this.mesh.visible = false;
            this.mesh.scale.set(0.01, 0.01, 0.01);
            return;
        }

        if (!this.mesh.visible) {
            this.mesh.visible = true;
        }

        this.mesh.scale.set(1, 1, 1);

        this.stunTimer = Math.max(0, this.stunTimer - deltaTime);
        this.recoverTimer = Math.max(0, this.recoverTimer - deltaTime);
        this.currentAttackCooldown = Math.max(0, this.currentAttackCooldown - deltaTime);

        this.updateHealthBar();

        switch (this.state) {
            case EnemyStates.IDLE:
                this.handleIdleState(deltaTime, playerPosition);
                break;
            case EnemyStates.MOVE_TO_TARGET:
                this.handleMoveToTargetState(deltaTime, playerPosition);
                break;
            case EnemyStates.ATTACK:
                this.handleAttackState(deltaTime, playerPosition);
                break;
            case EnemyStates.COOLDOWN:
                this.handleCooldownState(deltaTime, playerPosition);
                break;
            case EnemyStates.RECOVER:
                this.handleRecoverState(deltaTime, playerPosition);
                break;
            case EnemyStates.STUNNED:
                this.handleStunnedState(deltaTime, playerPosition);
                break;
            case EnemyStates.DEAD:
                break;
        }

        this.mesh.position.copy(this.position);
        
        if (this.target) {
            const directionToTarget = new THREE.Vector3().subVectors(this.target, this.position).normalize();
            this.targetDirection.lerp(directionToTarget, 0.1);
            this.mesh.lookAt(new THREE.Vector3().copy(this.position).add(this.targetDirection));
        }

        if (this.health <= 0 && this.state !== EnemyStates.DEAD) {
            this.die();
        }
    }

    handleIdleState(deltaTime, playerPosition) {
        if (!this.target) {
            this.target = playerPosition;
        }

        const distanceToTarget = this.position.distanceTo(this.target);
        const attackRange = this.getAttackRange();

        if (distanceToTarget > attackRange) {
            this.state = EnemyStates.MOVE_TO_TARGET;
        } else if (this.currentAttackCooldown <= 0) {
            this.state = EnemyStates.ATTACK;
        }
    }

    handleMoveToTargetState(deltaTime, playerPosition) {
        if (!this.target) {
            this.target = playerPosition;
        }

        const distanceToTarget = this.position.distanceTo(this.target);
        const attackRange = this.getAttackRange();

        if (distanceToTarget <= attackRange) {
            this.state = EnemyStates.ATTACK;
            return;
        }

        const moveDirection = new THREE.Vector3().subVectors(this.target, this.position).normalize();
        
        const separationForce = this.calculateSeparationForce(deltaTime);
        const alignedDirection = moveDirection.clone().add(separationForce).normalize();
        
        const movementSpeed = this.speed * (1 + this.difficulty * 0.1);
        this.position.add(alignedDirection.multiplyScalar(movementSpeed * deltaTime));
        
        this.position.y = 0;
        
        if (this.position.distanceTo(this.initialPosition) > 50) {
            this.position.lerp(this.initialPosition, 0.1);
        }
    }

    calculateSeparationForce(deltaTime) {
        const separation = new THREE.Vector3();
        const separationRadius = 1.5;
        const allEnemies = window.game ? window.game.enemies : [];
        
        for (let i = 0; i < allEnemies.length; i++) {
            const otherEnemy = allEnemies[i];
            if (otherEnemy === this || !otherEnemy.alive) continue;
            
            const distance = this.position.distanceTo(otherEnemy.position);
            if (distance < separationRadius && distance > 0) {
                const repulsion = new THREE.Vector3().subVectors(this.position, otherEnemy.position).normalize();
                const strength = 1.0 - distance / separationRadius;
                separation.add(repulsion.multiplyScalar(strength));
            }
        }
        
        return separation.multiplyScalar(0.5);
    }

    handleAttackState(deltaTime, playerPosition) {
        if (!this.target) {
            this.state = EnemyStates.IDLE;
            return;
        }

        const distanceToTarget = this.position.distanceTo(this.target);
        const attackRange = this.getAttackRange();

        if (distanceToTarget > attackRange * 1.2) {
            this.state = EnemyStates.MOVE_TO_TARGET;
            return;
        }

        this.executeAttack();
        this.currentAttackCooldown = this.getAttackCooldown();
        this.state = EnemyStates.COOLDOWN;
    }

    executeAttack() {
        if (!this.target) return;
        
        const attackType = this.getAttackType();
        
        if (window.combat && window.combat.damagePlayer) {
            window.combat.damagePlayer(this.attackDamage, this.position, attackType);
        }
    }

    getAttackType() {
        switch (this.type) {
            case "soldier": return "slash";
            case "archer": return "arrow";
            case "knight": return "charge";
            case "boss": return "slam";
            default: return "punch";
        }
    }

    handleCooldownState(deltaTime, playerPosition) {
        if (this.currentAttackCooldown <= 0) {
            this.state = EnemyStates.IDLE;
        }
    }

    handleRecoverState(deltaTime, playerPosition) {
        this.health = Math.min(this.maxHealth, this.health + (this.maxHealth * 0.01) * deltaTime);
        
        if (this.recoverTimer <= 0) {
            this.state = EnemyStates.IDLE;
        }
    }

    handleStunnedState(deltaTime, playerPosition) {
        if (this.stunTimer <= 0) {
            this.state = EnemyStates.IDLE;
        }
    }

    takeDamage(amount, sourcePosition) {
        if (!this.alive || this.state === EnemyStates.DEAD) return;
        
        this.health -= amount;
        
        if (sourcePosition) {
            const knockbackDirection = new THREE.Vector3().subVectors(this.position, sourcePosition).normalize();
            const knockbackForce = 0.5;
            this.position.add(knockbackDirection.multiplyScalar(knockbackForce));
        }
        
        if (this.health <= 0) {
            this.die();
        } else if (this.health < this.maxHealth * 0.3) {
            this.state = EnemyStates.RECOVER;
            this.recoverTimer = 2.0;
        }
    }

    die() {
        this.alive = false;
        this.state = EnemyStates.DEAD;
        
        if (window.combat && window.combat.onEnemyKilled) {
            window.combat.onEnemyKilled(this);
        }
        
        if (this.mesh) {
            this.mesh.visible = false;
        }
    }

    updateHealthBar() {
        if (!this.healthBarFill || !this.maxHealth) return;
        
        const healthPercent = Math.max(0, this.health / this.maxHealth);
        this.healthBarFill.scale.x = healthPercent;
        
        let color;
        if (healthPercent > 0.5) {
            color = 0x00ff00;
        } else if (healthPercent > 0.25) {
            color = 0xffff00;
        } else {
            color = 0xff0000;
        }
        
        this.healthBarFill.material.color.setHex(color);
        this.healthBarFill.position.x = -(0.375 * (1 - healthPercent));
    }

    setState(newState) {
        this.state = newState;
        if (newState === EnemyStates.STUNNED) {
            this.stunTimer = 1.0 + this.difficulty * 0.5;
        }
        if (newState === EnemyStates.RECOVER) {
            this.recoverTimer = 1.5;
        }
    }

    getGroupTacticPosition(groupCenter, groupIndex, groupSize) {
        const angle = (groupIndex / groupSize) * Math.PI * 2;
        const radius = Math.max(1.0, groupSize * 0.3);
        
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;
        
        return new THREE.Vector3(groupCenter.x + offsetX, 0, groupCenter.z + offsetZ);
    }
}

class EnemyWaveManager {
    constructor(scene, game) {
        this.scene = scene;
        this.game = game;
        this.currentWave = 0;
        this.enemies = [];
        this.waveTimer = 0;
        this.waveDelay = 5.0;
        this.isWaveActive = false;
        this.maxEnemiesPerWave = 5;
        this.difficultyLevel = 1;
        
        this.spawnPoints = [];
        this.setupSpawnPoints();
    }

    setupSpawnPoints() {
        this.spawnPoints = [
            new THREE.Vector3(-15, 0, -15),
            new THREE.Vector3(15, 0, -15),
            new THREE.Vector3(-15, 0, 15),
            new THREE.Vector3(15, 0, 15),
            new THREE.Vector3(0, 0, -20),
            new THREE.Vector3(-20, 0, 0),
            new THREE.Vector3(20, 0, 0)
        ];
    }

    startWave() {
        this.currentWave++;
        this.isWaveActive = true;
        this.waveTimer = 0;
        
        const waveConfig = this.getWaveConfig(this.currentWave);
        
        window.ui.showMessage(`WAVE ${this.currentWave}!`, 2.0);
        
        this.scheduleEnemySpawns(waveConfig);
    }

    getWaveConfig(waveNumber) {
        const baseEnemies = 3 + waveNumber;
        const soldierRatio = Math.max(0.3, 0.7 - waveNumber * 0.05);
        const archerRatio = Math.max(0.1, 0.3 - waveNumber * 0.02);
        const knightRatio = Math.min(0.3, waveNumber * 0.05);
        const bossChance = waveNumber % 5 === 0 ? 0.2 : 0;
        
        const totalEnemies = Math.min(20, baseEnemies);
        const soldiers = Math.floor(totalEnemies * soldierRatio);
        const archers = Math.floor(totalEnemies * archerRatio);
        const knights = Math.floor(totalEnemies * knightRatio);
        const bosses = waveNumber % 5 === 0 ? 1 : 0;
        
        const finalCount = Math.max(1, totalEnemies - soldiers - archers - knights - bosses);
        
        return {
            total: finalCount,
            soldiers: soldiers,
            archers: archers,
            knights: knights,
            bosses: bosses,
            difficulty: waveNumber
        };
    }

    scheduleEnemySpawns(waveConfig) {
        const enemyQueue = [];
        
        for (let i = 0; i < waveConfig.soldiers; i++) {
            enemyQueue.push({ type: "soldier", delay: i * 0.5 });
        }
        for (let i = 0; i < waveConfig.archers; i++) {
            enemyQueue.push({ type: "archer", delay: 2.0 + i * 0.7 });
        }
        for (let i = 0; i < waveConfig.knights; i++) {
            enemyQueue.push({ type: "knight", delay: 3.0 + i * 1.0 });
        }
        for (let i = 0; i < waveConfig.bosses; i++) {
            enemyQueue.push({ type: "boss", delay: 5.0 });
        }
        
        enemyQueue.forEach((enemyInfo, index) => {
            setTimeout(() => {
                if (this.isWaveActive) {
                    this.spawnEnemy(enemyInfo.type, waveConfig.difficulty);
                }
            }, enemyInfo.delay * 1000);
        });
    }

    spawnEnemy(type, difficulty) {
        const spawnPoint = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
        const position = spawnPoint.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            0,
            (Math.random() - 0.5) * 2
        ));
        
        const enemy = new Enemy(type, position, this.currentWave, difficulty);
        enemy.groupId = this.enemies.length;
        
        this.enemies.push(enemy);
        this.scene.add(enemy.mesh);
        
        if (window.ui && window.ui.updateEnemyCount) {
            window.ui.updateEnemyCount(this.getAliveEnemyCount());
        }
    }

    getAliveEnemyCount() {
        return this.enemies.filter(e => e.alive).length;
    }

    checkWaveCompletion() {
        if (!this.isWaveActive) return;
        
        const aliveEnemies = this.getAliveEnemyCount();
        
        if (aliveEnemies === 0) {
            this.isWaveActive = false;
            this.waveTimer = this.waveDelay;
            
            if (window.ui && window.ui.showWaveComplete) {
                window.ui.showWaveComplete(this.currentWave);
            }
            
            setTimeout(() => {
                if (this.game && this.game.isRunning) {
                    this.startWave();
                }
            }, this.waveDelay * 1000);
        }
    }

    update(deltaTime, playerPosition) {
        if (this.isWaveActive) {
            this.checkWaveCompletion();
        } else {
            this.waveTimer -= deltaTime;
            if (this.waveTimer <= 0 && this.enemies.every(e => !e.alive)) {
                this.startWave();
            }
        }

        this.enemies.forEach(enemy => {
            if (enemy.alive) {
                enemy.update(deltaTime, playerPosition, this.enemies, this.scene);
            }
        });

        this.enemies = this.enemies.filter(enemy => {
            if (!enemy.alive && enemy.state === EnemyStates.DEAD) {
                if (enemy.mesh && enemy.mesh.parent) {
                    enemy.mesh.parent.remove(enemy.mesh);
                }
                return false;
            }
            return true;
        });

        if (window.ui && window.ui.updateEnemyCount) {
            window.ui.updateEnemyCount(this.getAliveEnemyCount());
        }
    }

    getNearestEnemies(playerPosition, count) {
        return this.enemies
            .filter(e => e.alive)
            .map(e => ({ enemy: e, distance: e.position.distanceTo(playerPosition) }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, count)
            .map(item => item.enemy);
    }

    applyGroupTactics(playerPosition) {
        const groups = this.groupEnemiesByType();
        
        for (const [type, enemies] of Object.entries(groups)) {
            if (enemies.length >= 2) {
                const groupCenter = this.calculateGroupCenter(enemies);
                const formation = this.getFormationForType(type, enemies.length);
                
                enemies.forEach((enemy, index) => {
                    if (enemy.alive && enemy.state === EnemyStates.MOVE_TO_TARGET) {
                        const targetPos = formation(index, groupCenter, enemies.length, playerPosition);
                        enemy.position.lerp(targetPos, 0.05);
                    }
                });
            }
        }
    }

    groupEnemiesByType() {
        const groups = {};
        this.enemies.forEach(enemy => {
            if (!enemy.alive) return;
            if (!groups[enemy.type]) {
                groups[enemy.type] = [];
            }
            groups[enemy.type].push(enemy);
        });
        return groups;
    }

    calculateGroupCenter(enemies) {
        const center = new THREE.Vector3();
        enemies.forEach(e => center.add(e.position));
        center.divideScalar(enemies.length);
        return center;
    }

    getFormationForType(type, count) {
        switch (type) {
            case "soldier":
                return (index, center, total, target) => {
                    const angle = (index / total) * Math.PI * 2;
                    const radius = 2.0;
                    const spreadAngle = Math.atan2(target.x - center.x, target.z - center.z);
                    const offsetAngle = angle + spreadAngle;
                    
                    return new THREE.Vector3(
                        center.x + Math.cos(offsetAngle) * radius,
                        0,
                        center.z + Math.sin(offsetAngle) * radius
                    );
                };
            case "archer":
                return (index, center, total, target) => {
                    const backOffset = 5.0;
                    const sideOffset = (index - (total - 1) / 2) * 1.5;
                    
                    const dirToTarget = new THREE.Vector3().subVectors(target, center).normalize();
                    const rightVector = new THREE.Vector3().crossVectors(dirToTarget, new THREE.Vector3(0, 1, 0)).normalize();
                    
                    return new THREE.Vector3(
                        center.x - dirToTarget.x * backOffset + rightVector.x * sideOffset,
                        0,
                        center.z - dirToTarget.z * backOffset + rightVector.z * sideOffset
                    );
                };
            case "knight":
                return (index, center, total, target) => {
                    const veeSize = 3.0;
                    const depth = index % 2 === 0 ? 0 : veeSize;
                    const side = index < total / 2 ? -1 : 1;
                    
                    const dirToTarget = new THREE.Vector3().subVectors(target, center).normalize();
                    const rightVector = new THREE.Vector3().crossVectors(dirToTarget, new THREE.Vector3(0, 1, 0)).normalize();
                    
                    return new THREE.Vector3(
                        center.x - dirToTarget.x * depth + rightVector.x * side * veeSize,
                        0,
                        center.z - dirToTarget.z * depth + rightVector.z * side * veeSize
                    );
                };
            default:
                return (index, center, total, target) => {
                    const angle = (index / total) * Math.PI * 2;
                    const radius = 3.0;
                    return new THREE.Vector3(
                        center.x + Math.cos(angle) * radius,
                        0,
                        center.z + Math.sin(angle) * radius
                    );
                };
        }
    }

    clearAll() {
        this.enemies.forEach(enemy => {
            if (enemy.mesh && enemy.mesh.parent) {
                enemy.mesh.parent.remove(enemy.mesh);
            }
        });
        this.enemies = [];
        this.currentWave = 0;
        this.isWaveActive = false;
    }

    getStats() {
        return {
            currentWave: this.currentWave,
            aliveEnemies: this.getAliveEnemyCount(),
            totalEnemies: this.enemies.length
        };
    }
}

window.enemiesModule = {
    Enemy,
    EnemyWaveManager,
    EnemyStates
};
