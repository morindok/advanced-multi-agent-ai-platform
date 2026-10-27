// js/entities.js

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 50;
        this.velocityX = 0;
        this.velocityY = 0;
        this.speed = 200;
        this.jumpPower = 450;
        this.gravity = 0.6;
        this.onGround = false;
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.attackDuration = 15; // frames
        this.facingRight = true;
        this.health = 3;
        this.maxHealth = 3;
        this.invincibleTimer = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this.died = false;
    }

    update(delta, keys, level) {
        if (this.died) return;

        // Gravity
        this.velocityY += this.gravity;
        
        // Horizontal movement
        if (keys.left && !keys.right) {
            this.velocityX = -this.speed;
            this.facingRight = false;
        } else if (keys.right && !keys.left) {
            this.velocityX = this.speed;
            this.facingRight = true;
        } else {
            this.velocityX = 0;
        }

        // Jump
        if (keys.up && this.onGround) {
            this.velocityY = -this.jumpPower;
            this.onGround = false;
        }

        // Attack
        if (keys.attack && this.attackCooldown === 0) {
            this.isAttacking = true;
            this.attackTimer = this.attackDuration;
            this.attackCooldown = 20;
        }

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }

        if (this.invincibleTimer > 0) this.invincibleTimer--;

        // Animation
        if (Math.abs(this.velocityX) > 10) {
            this.animTimer += delta;
            if (this.animTimer > 150) {
                this.animFrame = (this.animFrame + 1) % 4;
                this.animTimer = 0;
            }
        } else {
            this.animFrame = 0;
        }

        // Apply velocity
        this.x += this.velocityX * delta;
        this.y += this.velocityY * delta;

        // World bounds
        if (this.x < 0) this.x = 0;
        if (this.x > level.width - this.width) this.x = level.width - this.width;

        // Platform collision
        this.onGround = false;
        for (let p of level.platforms) {
            if (this.checkCollision(p)) {
                // Resolve collision
                if (this.velocityY > 0) {
                    this.y = p.y - this.height;
                    this.velocityY = 0;
                    this.onGround = true;
                } else if (this.velocityY < 0) {
                    this.y = p.y + p.height;
                    this.velocityY = 0;
                }
            }
        }

        // Fall off level
        if (this.y > level.height + 100) {
            this.die();
        }

        // Enemy collision
        for (let enemy of level.enemies) {
            if (!enemy.dead && this.checkCollision(enemy)) {
                if (this.isAttacking && this.attackTimer > this.attackDuration - 5) {
                    enemy.takeHit(this);
                } else if (this.invincibleTimer === 0) {
                    this.takeDamage();
                }
            }
        }

        // Check level gate
        for (let gate of level.gates) {
            if (this.checkCollision(gate) && !gate.triggered) {
                gate.triggered = true;
                return 'nextLevel';
            }
        }
    }

    checkCollision(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    takeDamage() {
        this.health--;
        this.invincibleTimer = 60;
        this.velocityY = -200;
        this.velocityX = this.facingRight ? -200 : 200;
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.died = true;
    }

    respawn(x, y) {
        this.x = x;
        this.y = y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.health = this.maxHealth;
        this.died = false;
        this.invincibleTimer = 0;
    }

    draw(ctx) {
        if (this.died) return;
        
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        
        if (!this.facingRight) {
            ctx.scale(-1, 1);
        }

        // Body
        ctx.fillStyle = this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 5) % 2 === 0 ? 'rgba(255, 100, 100, 0.5)' : '#FFD700';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);

        // Head
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.arc(0, -this.height/2 + 10, 15, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(5, -this.height/2 + 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(10, -this.height/2 + 8, 3, 0, Math.PI * 2);
        ctx.fill();

        // Legs
        ctx.strokeStyle = '#FF8C00';
        ctx.lineWidth = 4;
        let legOffset = Math.sin(this.animFrame * Math.PI / 2) * 5;
        ctx.beginPath();
        ctx.moveTo(-10, this.height/2 - 10);
        ctx.lineTo(-10 - legOffset, this.height/2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(10, this.height/2 - 10);
        ctx.lineTo(10 + legOffset, this.height/2);
        ctx.stroke();

        // Attack effect
        if (this.isAttacking) {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
            ctx.beginPath();
            ctx.arc(25, 0, 20, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

class Mushroom {
    constructor(x, y, type = 'walker') {
        this.x = x;
        this.y = y;
        this.width = 35;
        this.height = 35;
        this.type = type; // 'walker', 'jump', 'shooter'
        this.dead = false;
        this.velocityX = type === 'walker' ? (Math.random() > 0.5 ? 50 : -50) : 0;
        this.velocityY = 0;
        this.gravity = 0.5;
        this.health = 1;
        this.animFrame = 0;
        this.animTimer = 0;
        this.jumpTimer = type === 'jump' ? Math.random() * 60 : 0;
        this.shootTimer = type === 'shooter' ? Math.random() * 30 : 0;
        this.facingRight = this.velocityX > 0 || type !== 'walker';
    }

    update(delta, level) {
        if (this.dead) return;

        this.animTimer += delta;
        if (this.animTimer > 200) {
            this.animFrame = (this.animFrame + 1) % 4;
            this.animTimer = 0;
        }

        // Gravity
        this.velocityY += this.gravity;

        // Movement
        if (this.type === 'walker') {
            this.x += this.velocityX * delta;
            
            // Bounce off walls and platform edges
            for (let p of level.platforms) {
                if (this.checkCollision(p)) {
                    if (this.velocityX > 0) {
                        this.x = p.x - this.width;
                    } else {
                        this.x = p.x + p.width;
                    }
                    this.velocityX = -this.velocityX;
                    this.facingRight = this.velocityX > 0;
                }
            }
        } else if (this.type === 'jump') {
            this.jumpTimer += delta;
            if (this.jumpTimer > 90) {
                this.velocityY = -300;
                this.jumpTimer = 0;
            }
            this.x += (this.velocityX + Math.sin(this.jumpTimer / 10) * 10) * delta;
        } else if (this.type === 'shooter') {
            this.shootTimer += delta;
        }

        this.y += this.velocityY * delta;

        // Platform collision
        for (let p of level.platforms) {
            if (this.checkCollision(p)) {
                if (this.velocityY > 0) {
                    this.y = p.y - this.height;
                    this.velocityY = 0;
                } else if (this.velocityY < 0) {
                    this.y = p.y + p.height;
                    this.velocityY = 0;
                }
            }
        }

        // Fall off
        if (this.y > level.height + 100) {
            this.dead = true;
        }
    }

    checkCollision(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    takeHit(attacker) {
        this.dead = true;
        return true;
    }

    draw(ctx) {
        if (this.dead) return;

        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        
        if (!this.facingRight && this.type === 'walker') {
            ctx.scale(-1, 1);
        }

        // Cap
        ctx.fillStyle = this.type === 'walker' ? '#FF4444' : (this.type === 'jump' ? '#44FF44' : '#FF44FF');
        ctx.beginPath();
        ctx.arc(0, -5, this.width/2, Math.PI, 0);
        ctx.fill();

        // Spots
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-8, -8, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(8, -10, 3, 0, Math.PI * 2);
        ctx.fill();

        // Stem
        ctx.fillStyle = '#FFE0B2';
        ctx.fillRect(-this.width/4, 0, this.width/2, this.height/2);

        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-5, 5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, 5, 2, 0, Math.PI * 2);
        ctx.fill();

        // Mouth
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 8, 4, 0, Math.PI);
        ctx.stroke();

        ctx.restore();
    }
}

class Platform {
    constructor(x, y, width, height, type = 'solid') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type; // 'solid', 'breakable', 'moving'
        this.broken = false;
        this.movingX = false;
        this.startX = x;
        this.moveSpeed = 50;
        this.moveTimer = Math.random() * 100;
        this.brokenAnim = 0;
    }

    update(delta) {
        if (this.type === 'moving') {
            this.moveTimer += delta;
            this.x = this.startX + Math.sin(this.moveTimer / 30) * 100;
        }

        if (this.broken) {
            this.brokenAnim += delta;
        }
    }

    break() {
        if (this.type === 'breakable') {
            this.broken = true;
        }
    }

    draw(ctx) {
        if (this.broken && this.brokenAnim > 20) return;

        ctx.save();
        
        if (this.broken) {
            ctx.globalAlpha = 1 - (this.brokenAnim / 20);
            ctx.translate(0, this.brokenAnim * 2);
        }

        // Base
        ctx.fillStyle = this.type === 'breakable' ? '#8B4513' : (this.type === 'moving' ? '#4682B4' : '#696969');
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Top highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(this.x, this.y, this.width, 5);

        // Texture
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i < this.width; i += 20) {
            ctx.beginPath();
            ctx.moveTo(this.x + i, this.y);
            ctx.lineTo(this.x + i, this.y + this.height);
            ctx.stroke();
        }

        ctx.restore();
    }
}

class Gate {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 80;
        this.triggered = false;
        this.animFrame = 0;
    }

    update() {
        this.animFrame += 0.1;
    }

    draw(ctx) {
        if (this.triggered) return;

        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);

        // Pole
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-3, -this.height/2, 6, this.height);

        // Flag
        let wave = Math.sin(this.animFrame) * 5;
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(0, -this.height/2);
        ctx.lineTo(25 + wave, -this.height/2 + 10);
        ctx.lineTo(25 - wave, -this.height/2 + 20);
        ctx.lineTo(0, -this.height/2 + 30);
        ctx.closePath();
        ctx.fill();

        // Star on flag
        ctx.fillStyle = '#FFD700';
        ctx.font = '12px Arial';
        ctx.fillText('★', 8 + wave/2, -this.height/2 + 18);

        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.width = 15;
        this.height = 15;
        this.dead = false;
        this.life = 120;
    }

    update(delta, level) {
        this.life -= 1;
        if (this.life <= 0) {
            this.dead = true;
            return;
        }

        this.x += this.velocityX * delta;
        this.y += this.velocityY * delta;

        // Collision with platforms
        for (let p of level.platforms) {
            if (!p.broken && this.checkCollision(p)) {
                this.dead = true;
            }
        }

        // Out of bounds
        if (this.x < -50 || this.x > level.width + 50 || this.y > level.height + 50) {
            this.dead = true;
        }
    }

    checkCollision(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    draw(ctx) {
        if (this.dead) return;
        ctx.fillStyle = '#FF69B4';
        ctx.beginPath();
        ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Particle {
    constructor(x, y, color, life = 30) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = (Math.random() - 0.5) * 200;
        this.dead = false;
        this.size = 5 + Math.random() * 5;
    }

    update(delta) {
        this.life -= 1;
        if (this.life <= 0) {
            this.dead = true;
            return;
        }
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        this.vy += 2; // gravity
    }

    draw(ctx) {
        if (this.dead) return;
        let alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}
