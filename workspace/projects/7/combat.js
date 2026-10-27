// combat.js - Advanced combat system for Dynasty 3D Battle

class CombatSystem {
    constructor(game) {
        this.game = game;
        this.weapons = {
            sword: {
                name: "Sword",
                damage: 15,
                range: 100,
                attackSpeed: 0.5, // seconds per attack
                critChance: 0.15,
                color: "#ff6b6b",
                keys: ["A", "D"],
                type: "melee"
            },
            bow: {
                name: "Bow",
                damage: 10,
                range: 400,
                attackSpeed: 1.0,
                critChance: 0.25,
                color: "#4ecdc4",
                keys: ["W", "S"],
                type: "ranged"
            },
            spear: {
                name: "Spear",
                damage: 20,
                range: 150,
                attackSpeed: 0.8,
                critChance: 0.1,
                color: "#ffe66d",
                keys: ["Q", "E"],
                type: "melee"
            }
        };
        this.currentWeapon = "sword";
        this.attackCooldown = 0;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.maxCombo = 0;
        this.hitEffects = [];
        this.projectiles = [];
        this.lastAttackTime = 0;
        this.isAttacking = false;
        this.attackDirection = { x: 0, y: 1 };
        this.critThreshold = 0.85; // 85% health needed for guaranteed crit
    }

    setWeapon(weaponName) {
        if (this.weapons[weaponName]) {
            this.currentWeapon = weaponName;
            this.attackCooldown = 0;
            this.game.ui.updateWeaponIndicator(this.weapons[weaponName].name);
        }
    }

    getWeapon() {
        return this.weapons[this.currentWeapon];
    }

    canAttack() {
        return this.attackCooldown <= 0 && !this.isAttacking;
    }

    attack(targetDir) {
        if (!this.canAttack()) return;

        this.isAttacking = true;
        this.lastAttackTime = Date.now();
        this.attackDirection = targetDir || this.attackDirection;

        const weapon = this.getWeapon();
        const now = Date.now();
        
        // Check for critical hit
        const isCrit = Math.random() < weapon.critChance;
        
        if (weapon.type === "melee") {
            this.performMeleeAttack(weapon, isCrit, targetDir);
        } else if (weapon.type === "ranged") {
            this.performRangedAttack(weapon, isCrit, targetDir);
        }

        this.attackCooldown = weapon.attackSpeed * 1000;
    }

    performMeleeAttack(weapon, isCrit, dir) {
        const player = this.game.player;
        const enemies = this.game.enemies;
        
        // Create hitbox for melee attack
        const hitbox = this.getMeleeHitbox(player, dir, weapon.range);
        
        // Check collision with all enemies
        let hits = 0;
        for (let enemy of enemies) {
            if (enemy.isDead || enemy.invincible) continue;
            
            if (this.checkCollision(hitbox, enemy.boundingBox)) {
                hits++;
                this.applyDamageToEnemy(enemy, weapon.damage, isCrit, weapon.name);
            }
        }

        if (hits > 0) {
            this.increaseCombo();
        }

        // Visual effect
        this.createAttackEffect(player.x, player.y, dir.x, dir.y, weapon.color, weapon.range);
    }

    performRangedAttack(weapon, isCrit, dir) {
        const player = this.game.player;
        const projectile = {
            x: player.x,
            y: player.y,
            z: player.z,
            vx: dir.x * 10,
            vy: 0,
            vz: dir.y * 10,
            damage: weapon.damage,
            isCrit: isCrit,
            weaponName: weapon.name,
            color: weapon.color,
            life: 2000,
            radius: 8
        };
        this.projectiles.push(projectile);
        
        // Visual effect for shooting
        this.createMuzzleEffect(player.x, player.y, weapon.color);
    }

    getMeleeHitbox(player, dir, range) {
        // Create a box in front of the player
        const width = 40;
        const depth = range;
        
        return {
            x: player.x + dir.x * depth/2,
            y: player.z,
            z: player.y + dir.y * depth/2,
            width: width,
            height: 60,
            depth: depth
        };
    }

    checkCollision(hitbox1, hitbox2) {
        // Simple AABB collision in 3D
        return (
            Math.abs(hitbox1.x - hitbox2.x) < (hitbox1.width + hitbox2.width) / 2 &&
            Math.abs(hitbox1.y - hitbox2.y) < (hitbox1.height + hitbox2.height) / 2 &&
            Math.abs(hitbox1.z - hitbox2.z) < (hitbox1.depth + hitbox2.depth) / 2
        );
    }

    applyDamageToEnemy(enemy, damage, isCrit, weaponName) {
        const totalDamage = isCrit ? Math.floor(damage * 1.5) : damage;
        enemy.takeDamage(totalDamage, weaponName);
        
        // Create damage popup
        this.createDamagePopup(enemy.x, enemy.y, enemy.z, totalDamage, isCrit);
        
        // Update stats
        this.game.stats.damageDealt += totalDamage;
        this.game.stats.hits++;
        
        if (isCrit) {
            this.game.stats.crits++;
        }
        
        // Add hit effect
        this.addHitEffect(enemy.x, enemy.y, enemy.z, isCrit);
    }

    increaseCombo() {
        this.comboCount++;
        this.comboTimer = 3000; // 3 seconds to maintain combo
        if (this.comboCount > this.maxCombo) {
            this.maxCombo = this.comboCount;
        }
        this.game.ui.showComboIndicator(this.comboCount);
    }

    resetCombo() {
        this.comboCount = 0;
        this.comboTimer = 0;
        this.game.ui.hideComboIndicator();
    }

    createAttackEffect(x, y, dirX, dirY, color, range) {
        const effect = {
            x: x,
            y: y,
            z: y,
            dirX: dirX,
            dirY: dirY,
            color: color,
            range: range,
            life: 300,
            maxLife: 300
        };
        this.hitEffects.push(effect);
    }

    createMuzzleEffect(x, y, color) {
        const effect = {
            x: x,
            y: y,
            z: y,
            color: color,
            life: 150,
            maxLife: 150,
            isMuzzle: true
        };
        this.hitEffects.push(effect);
    }

    createDamagePopup(x, y, z, damage, isCrit) {
        this.game.ui.createDamagePopup(x, y, z, damage, isCrit);
    }

    addHitEffect(x, y, z, isCrit) {
        this.game.addHitEffect(x, y, z, isCrit);
    }

    update(deltaTime) {
        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }

        // Update combo timer
        if (this.comboTimer > 0) {
            this.comboTimer -= deltaTime;
            if (this.comboTimer <= 0) {
                this.resetCombo();
            }
        }

        // Update projectiles
        this.updateProjectiles(deltaTime);

        // Update hit effects
        this.updateHitEffects(deltaTime);

        // Reset attack state after small delay
        if (this.isAttacking && Date.now() - this.lastAttackTime > 100) {
            this.isAttacking = false;
        }
    }

    updateProjectiles(deltaTime) {
        const enemies = this.game.enemies;
        
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            
            // Update position
            p.x += p.vx;
            p.z += p.vz;
            p.life -= deltaTime;
            
            // Check collision with enemies
            let hit = false;
            for (let enemy of enemies) {
                if (enemy.isDead || enemy.invincible) continue;
                
                const dx = p.x - enemy.x;
                const dz = p.z - enemy.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                
                if (dist < enemy.boundingBox.width + p.radius) {
                    this.applyDamageToEnemy(enemy, p.damage, p.isCrit, p.weaponName);
                    this.projectiles.splice(i, 1);
                    hit = true;
                    break;
                }
            }
            
            // Remove if expired or out of bounds
            if (!hit && (p.life <= 0 || 
                        p.x < -500 || p.x > 5000 || 
                        p.z < -500 || p.z > 5000)) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    updateHitEffects(deltaTime) {
        for (let i = this.hitEffects.length - 1; i >= 0; i--) {
            const effect = this.hitEffects[i];
            effect.life -= deltaTime;
            if (effect.life <= 0) {
                this.hitEffects.splice(i, 1);
            }
        }
    }

    draw(ctx, camera) {
        // Draw projectiles
        for (const p of this.projectiles) {
            ctx.save();
            const screenPos = camera.worldToScreen(p.x, p.z, p.y);
            
            if (screenPos.z > 0) {
                const size = p.radius * (1000 / screenPos.z);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, size, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw trail
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(screenPos.x - p.vx * 5, screenPos.y - p.vz * 5);
                ctx.lineTo(screenPos.x, screenPos.y);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Draw hit effects
        for (const effect of this.hitEffects) {
            ctx.save();
            const screenPos = camera.worldToScreen(effect.x, effect.z, effect.y);
            
            if (screenPos.z > 0) {
                const alpha = effect.life / effect.maxLife;
                const size = (effect.isMuzzle ? 20 : effect.range) * (1000 / screenPos.z);
                
                ctx.fillStyle = effect.color;
                ctx.globalAlpha = alpha;
                
                if (effect.isMuzzle) {
                    // Muzzle flash
                    ctx.beginPath();
                    ctx.arc(screenPos.x, screenPos.y, size * alpha, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Melee swing
                    ctx.lineWidth = 5 * alpha;
                    ctx.strokeStyle = effect.color;
                    ctx.beginPath();
                    const endX = screenPos.x + effect.dirX * size;
                    const endY = screenPos.y + effect.dirY * size;
                    ctx.moveTo(screenPos.x, screenPos.y);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
    }

    switchWeapon(key) {
        const weapons = Object.keys(this.weapons);
        const currentIndex = weapons.indexOf(this.currentWeapon);
        
        if (key === 'q' || key === 'Q') {
            this.currentWeapon = weapons[(currentIndex - 1 + weapons.length) % weapons.length];
        } else if (key === 'w' || key === 'W' || key === 'e' || key === 'E') {
            this.currentWeapon = weapons[(currentIndex + 1) % weapons.length];
        }
        
        this.attackCooldown = 0;
        this.game.ui.updateWeaponIndicator(this.getWeapon().name);
    }
}
