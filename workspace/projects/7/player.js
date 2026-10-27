/* player.js — Player character controller for Dynasty 3D Battle (web) */

// This module is designed to be loaded via <script src="player.js"></script>
// and registers itself onto the global namespace (window.GAME = window.GAME || {}).

(function () {
    "use strict";

    var GAME = window.GAME = window.GAME || {};

    // ---------------------------
    // Player class
    // ---------------------------

    /**
     * @class Player
     * @param {Object} opts
     * @param {number} opts.x
     * @param {number} opts.y
     * @param {number} opts.z
     * @param {number} [opts.speed=10]
     * @param {number} [opts.jumpForce=12]
     * @param {number} [opts.health=100]
     * @param {number} [opts.attackPower=15]
     * @param {number} [opts.attackRange=3.5]
     */
    function Player(opts) {
        opts = opts || {};

        this.position = {
            x: opts.x !== undefined ? opts.x : 0,
            y: opts.y !== undefined ? opts.y : 0,
            z: opts.z !== undefined ? opts.z : 0
        };

        this.velocity = { x: 0, y: 0, z: 0 };
        this.speed = opts.speed || 10;
        this.jumpForce = opts.jumpForce || 12;
        this.gravity = 0.6;

        this.maxHealth = opts.health || 100;
        this.health = this.maxHealth;

        this.attackPower = opts.attackPower || 15;
        this.attackRange = opts.attackRange || 3.5;
        this.attackCooldown = 0.35;       // seconds between attacks
        this.attackTimer = 0;
        this.isAttacking = false;
        this.attackFrame = 0;

        this.hitReactionTimer = 0;
        this.invincibilityTimer = 0;       // i-frames after being hit
        this.invincibilityDuration = 0.8;  // seconds

        this.facing = { x: 0, z: -1 };     // normalized direction player faces
        this.yaw = 0;                      // radians, rotation around Y

        this.grounded = true;
        this.scale = 1.0;
        this.baseScale = 1.0;
        this.animTime = 0;

        this.input = {
            up: false, down: false, left: false, right: false,
            jump: false, attack: false,
            keyMap: {}
        };

        this.mesh = null;          // three.js group
        this.swordMesh = null;
        this.bodyMesh = null;

        this._lastUpdateTime = 0;
        this._prevPosition = { x: 0, y: 0, z: 0 };
    }

    // ---------------------------
    // Public API
    // ---------------------------

    /**
     * Register input listeners. Call once during init.
     */
    Player.prototype.bindInput = function (canvas) {
        var self = this;

        // Keyboard
        window.addEventListener("keydown", function (e) {
            var code = e.code || e.key;
            self._setInput(code, true);
            e.preventDefault();
        });
        window.addEventListener("keyup", function (e) {
            var code = e.code || e.key;
            self._setInput(code, false);
            e.preventDefault();
        });

        // Touch controls (simple swipe + tap zones)
        if (canvas) {
            var touchStart = null;

            canvas.addEventListener("touchstart", function (e) {
                e.preventDefault();
                if (e.touches.length === 1) {
                    var t = e.touches[0];
                    touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
                }
            }, { passive: false });

            canvas.addEventListener("touchmove", function (e) {
                e.preventDefault();
                if (touchStart && e.touches.length === 1) {
                    var t = e.touches[0];
                    var dx = t.clientX - touchStart.x;
                    var dy = t.clientY - touchStart.y;
                    var threshold = 20;
                    self.input.left = dx < -threshold;
                    self.input.right = dx > threshold;
                    self.input.up = dy < -threshold;
                    self.input.down = dy > threshold;
                }
            }, { passive: false });

            canvas.addEventListener("touchend", function (e) {
                e.preventDefault();
                if (touchStart) {
                    var elapsed = performance.now() - touchStart.time;
                    if (elapsed < 150) {
                        // quick tap = attack
                        self.input.attack = true;
                        setTimeout(function () { self.input.attack = false; }, 100);
                    }
                    touchStart = null;
                    self.input.left = false;
                    self.input.right = false;
                    self.input.up = false;
                    self.input.down = false;
                }
            }, { passive: false });

            // Double-tap for jump
            var lastTapTime = 0;
            canvas.addEventListener("touchstart", function (e) {
                e.preventDefault();
                var now = performance.now();
                if (now - lastTapTime < 300) {
                    self.input.jump = true;
                    setTimeout(function () { self.input.jump = false; }, 100);
                }
                lastTapTime = now;
            }, { passive: false });
        }

        // Mouse click for attack (desktop)
        if (canvas) {
            canvas.addEventListener("mousedown", function (e) {
                e.preventDefault();
                self.input.attack = true;
            });
            canvas.addEventListener("mouseup", function (e) {
                e.preventDefault();
                self.input.attack = false;
            });
        }
    };

    /**
     * Create the Three.js visual representation.
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     */
    Player.prototype.createVisuals = function (scene) {
        var THREE = window.THREE;
        if (!THREE) return;

        var group = new THREE.Group();

        // Body (cylinder for torso)
        var bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8);
        var bodyMat = new THREE.MeshPhongMaterial({ color: 0xc0392b });
        this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.bodyMesh.position.y = 0.6;
        group.add(this.bodyMesh);

        // Head (sphere)
        var headGeo = new THREE.SphereGeometry(0.3, 12, 12);
        var headMat = new THREE.MeshPhongMaterial({ color: 0xf5cba7 });
        var head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.6;
        group.add(head);

        // Helmet
        var helmetGeo = new THREE.ConeGeometry(0.32, 0.4, 8);
        var helmetMat = new THREE.MeshPhongMaterial({ color: 0x8b0000 });
        var helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.y = 1.85;
        group.add(helmet);

        // Sword (box, attached to a pivot for animation)
        var swordPivot = new THREE.Group();
        swordPivot.position.set(0.5, 0.9, 0.3);

        var swordGeo = new THREE.BoxGeometry(0.08, 0.08, 1.5);
        var swordMat = new THREE.MeshPhongMaterial({ color: 0xbdc3c7, shininess: 80 });
        this.swordMesh = new THREE.Mesh(swordGeo, swordMat);
        this.swordMesh.position.z = 0.75;
        swordPivot.add(this.swordMesh);

        // Sword guard
        var guardGeo = new THREE.BoxGeometry(0.3, 0.1, 0.15);
        var guardMat = new THREE.MeshPhongMaterial({ color: 0x7d6608 });
        var guard = new THREE.Mesh(guardGeo, guardMat);
        guard.position.z = 0.1;
        swordPivot.add(guard);

        // Sword handle
        var handleGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6);
        var handleMat = new THREE.MeshPhongMaterial({ color: 0x5d4037 });
        var handle = new THREE.Mesh(handleGeo, handleMat);
        handle.rotation.x = Math.PI / 2;
        handle.position.z = -0.1;
        swordPivot.add(handle);

        group.add(swordPivot);
        this.swordPivot = swordPivot;

        // Shield
        var shieldGeo = new THREE.CircleGeometry(0.35, 16);
        var shieldMat = new THREE.MeshPhongMaterial({
            color: 0x2c3e50,
            side: THREE.DoubleSide
        });
        var shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(-0.5, 0.9, 0.3);
        shield.rotation.y = Math.PI / 2;
        group.add(shield);

        // Legs
        var legMat = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
        var leftLegGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        var leftLeg = new THREE.Mesh(leftLegGeo, legMat);
        leftLeg.position.set(-0.2, 0.4, 0);
        group.add(leftLeg);

        var rightLeg = new THREE.Mesh(leftLegGeo, legMat);
        rightLeg.position.set(0.2, 0.4, 0);
        group.add(rightLeg);

        // Arms
        var armMat = new THREE.MeshPhongMaterial({ color: 0xc0392b });
        var armGeo = new THREE.BoxGeometry(0.15, 0.7, 0.15);
        var rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.5, 0.9, 0.3);
        rightArm.rotation.x = -Math.PI / 4;
        group.add(rightArm);

        var leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.5, 0.9, 0.3);
        leftArm.rotation.x = -Math.PI / 4;
        group.add(leftArm);

        this.mesh = group;
        this.positionOnMesh();
        scene.add(group);
    };

    Player.prototype.positionOnMesh = function () {
        if (this.mesh) {
            this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        }
    };

    /**
     * Per-frame update.
     * @param {number} dt - delta time in seconds
     * @param {Object} world - game world reference (optional, for collision)
     */
    Player.prototype.update = function (dt, world) {
        this.animTime += dt;

        // --- Input to movement ---
        var moveX = 0;
        var moveZ = 0;

        if (this.input.up) moveZ -= 1;
        if (this.input.down) moveZ += 1;
        if (this.input.left) moveX -= 1;
        if (this.input.right) moveX += 1;

        // Normalize diagonal movement
        var moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLen > 0) {
            moveX /= moveLen;
            moveZ /= moveLen;
        }

        // Apply movement with facing-based rotation
        if (moveLen > 0 && !this.isAttacking) {
            var targetYaw = Math.atan2(moveX, moveZ);
            this.yaw = targetYaw;
            this.facing.x = Math.sin(this.yaw);
            this.facing.z = Math.cos(this.yaw);
        }

        // Lerp toward target position
        var targetX = this.position.x + this.facing.x * this.speed * dt * moveLen;
        var targetZ = this.position.z + this.facing.z * this.speed * dt * moveLen;

        // Grounded check
        if (this.grounded) {
            // Simple ground plane at y = 0
            this.velocity.y = 0;
        }

        // Gravity
        this.velocity.y -= this.gravity;
        if (this.velocity.y < -30) this.velocity.y = -30;

        // Jump
        if (this.input.jump && this.grounded) {
            this.velocity.y = this.jumpForce;
            this.grounded = false;
        }

        // Apply velocity
        this.position.x += this.velocity.x * dt;
        this.position.z += this.velocity.z * dt;
        this.position.y += this.velocity.y * dt;

        // Ground collision
        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
        }

        // Reset horizontal velocity each frame (movement is input-driven)
        this.velocity.x = 0;
        this.velocity.z = 0;

        // Attack
        if (this.input.attack && this.attackTimer <= 0 && !this.isAttacking) {
            this._startAttack();
        }
        if (this.isAttacking) {
            this.attackFrame += dt;
            if (this.attackFrame >= 0.3) {
                this.isAttacking = false;
                this.attackFrame = 0;
                this.attackTimer = this.attackCooldown;
            }
        } else {
            if (this.attackTimer > 0) {
                this.attackTimer -= dt;
            }
        }

        // Hit reaction
        if (this.hitReactionTimer > 0) {
            this.hitReactionTimer -= dt;
            if (this.hitReactionTimer <= 0) {
                this.hitReactionTimer = 0;
            }
        }

        // Invincibility frames
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= dt;
            if (this.invincibilityTimer <= 0) {
                this.invincibilityTimer = 0;
            }
        }

        // Update mesh transform
        this.positionOnMesh();
        if (this.mesh) {
            this.mesh.rotation.y = this.yaw;
            this._updateAnimation();
        }

        // Store previous position for external systems
        this._prevPosition.x = this.position.x;
        this._prevPosition.y = this.position.y;
        this._prevPosition.z = this.position.z;
    };

    // ---------------------------
    // Private methods
    // ---------------------------

    Player.prototype._setInput = function (code, state) {
        switch (code) {
            case "KeyW":
            case "ArrowUp":
                this.input.up = state; break;
            case "KeyS":
            case "ArrowDown":
                this.input.down = state; break;
            case "KeyA":
            case "ArrowLeft":
                this.input.left = state; break;
            case "KeyD":
            case "ArrowRight":
                this.input.right = state; break;
            case "Space":
            case "KeyJ":
                this.input.jump = state; break;
            case "KeyK":
            case "KeyL":
            case "Enter":
                this.input.attack = state; break;
        }
    };

    Player.prototype._startAttack = function () {
        this.isAttacking = true;
        this.attackFrame = 0;
        this.attackTimer = this.attackCooldown;
    };

    Player.prototype._updateAnimation = function () {
        if (!this.mesh) return;

        // Swing sword
        if (this.swordPivot) {
            if (this.isAttacking) {
                // Arc swing: rotate from -60 deg to +60 deg over attackFrame
                var progress = this.attackFrame / 0.3;
                var swingAngle = -Math.PI / 3 + (2 * Math.PI / 3) * progress;
                this.swordPivot.rotation.x = swingAngle;
            } else if (this.hitReactionTimer > 0) {
                // Flinch
                this.swordPivot.rotation.x = Math.sin(this.hitReactionTimer * 20) * 0.3;
            } else if (moveLenActive(this, 0.1)) {
                // Idle walk bob
                this.swordPivot.rotation.x = Math.sin(this.animTime * 8) * 0.1;
            } else {
                // Idle rest
                this.swordPivot.rotation.x = 0.2;
            }
        }

        // Body bob when moving
        if (this.mesh.children) {
            var body = this.mesh.children.find(function (c) { return c.name === "body"; });
            if (body) {
                if (moveLenActive(this, 0.1)) {
                    body.position.y = 0.6 + Math.abs(Math.sin(this.animTime * 10)) * 0.05;
                } else {
                    body.position.y = 0.6;
                }
            }
        }

        // Invincibility blink (scale pulse)
        if (this.invincibilityTimer > 0) {
            var blink = Math.sin(this.invincibilityTimer * 30) * 0.3 + 0.7;
            this.scale = this.baseScale * blink;
        } else {
            this.scale = this.baseScale;
        }
        if (this.mesh) {
            this.mesh.scale.set(this.scale, this.scale, this.scale);
        }
    };

    /**
     * Check if player can take damage right now.
     * @returns {boolean}
     */
    Player.prototype.canBeHit = function () {
        return this.invincibilityTimer <= 0 && this.hitReactionTimer <= 0;
    };

    /**
     * Apply damage to the player.
     * @param {number} amount
     * @returns {number} actual damage dealt (0 if invincible)
     */
    Player.prototype.takeDamage = function (amount) {
        if (!this.canBeHit()) {
            return 0;
        }
        this.health -= amount;
        if (this.health < 0) this.health = 0;

        this.hitReactionTimer = 0.2;
        this.invincibilityTimer = this.invincibilityDuration;

        // Knockback impulse
        this.velocity.y = Math.max(this.velocity.y, 2);

        return amount;
    };

    /**
     * Heal the player.
     * @param {number} amount
     */
    Player.prototype.heal = function (amount) {
        this.health += amount;
        if (this.health > this.maxHealth) this.health = this.maxHealth;
    };

    /**
     * Reset player to a starting state.
     * @param {number} x
     * @param {number} z
     */
    Player.prototype.reset = function (x, z) {
        this.position.x = x || 0;
        this.position.y = 0;
        this.position.z = z || 0;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.velocity.z = 0;
        this.health = this.maxHealth;
        this.invincibilityTimer = 0;
        this.hitReactionTimer = 0;
        this.isAttacking = false;
        this.attackFrame = 0;
        this.attackTimer = 0;
        this.grounded = true;
        this.yaw = 0;
        this.facing.x = 0;
        this.facing.z = -1;
        this.input.up = false;
        this.input.down = false;
        this.input.left = false;
        this.input.right = false;
        this.input.jump = false;
        this.input.attack = false;
        this.scale = this.baseScale;
        if (this.mesh) {
            this.mesh.scale.set(1, 1, 1);
            this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        }
    };

    /**
     * Check if player is alive.
     * @returns {boolean}
     */
    Player.prototype.isAlive = function () {
        return this.health > 0;
    };

    /**
     * Get the attack hitbox in world space.
     * @returns {{x:number, y:number, z:number, radius:number}}
     */
    Player.prototype.getAttackHitbox = function () {
        var forwardX = this.facing.x;
        var forwardZ = this.facing.z;
        var hitX = this.position.x + forwardX * this.attackRange * 0.5;
        var hitZ = this.position.z + forwardZ * this.attackRange * 0.5;
        return {
            x: hitX,
            y: this.position.y + 0.8,
            z: hitZ,
            radius: this.attackRange * 0.4
        };
    };

    /**
     * Get the player's bounding box for collision detection.
     * @returns {{x:number, y:number, z:number, radius:number}}
     */
    Player.prototype.getBoundingBox = function () {
        return {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z,
            radius: 0.6
        };
    };

    /**
     * Get the current health percentage.
     * @returns {number} 0-100
     */
    Player.prototype.getHealthPercent = function () {
        return (this.health / this.maxHealth) * 100;
    };

    // Helper: check if there is active movement input
    function moveLenActive(player, threshold) {
        return (
            player.input.up || player.input.down ||
            player.input.left || player.input.right
        );
    }

    // Expose
    GAME.Player = Player;

})();
