// src/game/PlayerController.ts

// Define interfaces for Three.js types to ensure compatibility in TS environment
import * as THREE from "three";

// Assuming a global or module-scope EventBus from src/core/EventBus.ts
import { EventBus } from "../core/EventBus";
import { Engine } from "../core/Engine";

// Constants for Player Configuration
const PLAYER_SPEED = 8.0;
const DASH_SPEED = 25.0;
const DASH_DURATION = 0.3;
const DASH_COOLDOWN = 0.5;
const GRAB_TIME = 0.5;
const RELEASE_TIME = 0.1;
const WEAPON_RANGE = 2.5;
const WEAPON_HEIGHT = 1.2;

// Input Mapping
const Keys = {
    W: 87,
    A: 65,
    S: 83,
    D: 68,
    SPACE: 32,
    SHIFT: 16,
    CTRL: 17,
    E: 69,
    Q: 81,
    MOUSE_LEFT: 0,
    MOUSE_RIGHT: 2,
    WASD_UP: 38,
    WASD_DOWN: 40,
    WASD_LEFT: 37,
    WASD_RIGHT: 39
};

class PlayerInputState {
    forward = 0;
    backward = 0;
    left = 0;
    right = 0;
    isJumping = false;
    isDashCharged = false;
    isDashCooldown = 0;
    attackPressed = false;
    guardPressed = false;
    lockOnPressed = false;
    dashPressed = false;
    mouseDownLeft = false;
    mouseDownRight = false;
    mouseMovedX = 0;
    mouseMovedY = 0;
    gamepadLeftX = 0;
    gamepadLeftY = 0;
    gamepadRightX = 0;
    gamepadRightY = 0;
    gamepadA = false;
    gamepadX = false;
    gamepadB = false;
    gamepadY = false;
    gamepadLB = false;
    gamepadRB = false;
    gamepadLT = 0;
    gamepadRT = 0;
    gamepadDPadUp = false;
    gamepadDPadDown = false;
    gamepadDPadLeft = false;
    gamepadDPadRight = false;
}

class PlayerAnimationState {
    currentClip: THREE.AnimationMixer | null = null;
    state = "idle";
    comboIndex = 0;
    comboDuration = 0.0;
    comboTimer = 0.0;
    isGuarding = false;
    guardPerfectWindow = 0.0;
    guardStagger = 0.0;
    dashTimer = 0.0;
    dashDir: THREE.Vector3 = new THREE.Vector3();
    hitstunTimer = 0.0;
    hitstopTimer = 0.0;
    musouGauge = 0.0;
    health = 100;
}

class PlayerCameraState {
    lockOnTarget: THREE.Object3D | null = null;
    isLockingOn = false;
    cameraOffset = new THREE.Vector3(0, 2.5, -4.0);
    cameraPos = new THREE.Vector3();
    cameraLookAt = new THREE.Vector3();
    cameraLerp = 0.15;
    camShakeAmount = 0;
}

// Player Controller class managing movement, input, combat animations, and state
class PlayerController {
    private playerMesh: THREE.Group;
    private weaponMesh: THREE.Mesh | null = null;
    private inputState: PlayerInputState;
    private animState: PlayerAnimationState;
    private camState: PlayerCameraState;
    private playerVelocity: THREE.Vector3;
    private groundY = 0;
    private canMove = true;
    private canAct = true;
    private isDead = false;
    private timeScale = 1.0;
    private currentAnimation: THREE.AnimationAction | null = null;
    private privateActions: Map<string, THREE.AnimationAction>;
    private privateMixer: THREE.AnimationMixer | null;

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        // Instantiate Player Character (Simple placeholder setup for demo)
        this.playerMesh = this.createPlayerMesh();
        scene.add(this.playerMesh);
        this.playerMesh.position.set(0, 0, 0);

        // Weapon
        this.weaponMesh = this.createWeaponMesh();
        this.playerMesh.add(this.weaponMesh);

        // Initialize Input and States
        this.inputState = new PlayerInputState();
        this.animState = new PlayerAnimationState();
        this.camState = new PlayerCameraState();
        this.playerVelocity = new THREE.Vector3();
        this.privateActions = new Map();

        // Setup Animation Mixer
        const skinnedMesh = this.playerMesh.getObjectByName("PlayerBody");
        if (skinnedMesh && skinnedMesh instanceof THREE.SkinnedMesh) {
            this.privateMixer = new THREE.AnimationMixer(skinnedMesh);
            this.setupAnimations();
        } else {
            console.warn("Skinned mesh not found for animations. Using static placeholders.");
            this.privateMixer = null;
        }

        // Event Listeners
        this.addInputListeners(camera);

        // Initialize Camera
        this.updateCamera();
    }

    private createPlayerMesh(): THREE.Group {
        const group = new THREE.Group();
        const bodyGeo = new THREE.CapsuleGeometry(0.5, 0.8, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.4, metalness: 0.1 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.name = "PlayerBody";
        body.position.y = 1.2;
        group.add(body);

        const headGeo = new THREE.SphereGeometry(0.3, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.8 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.6;
        body.add(head);

        return group;
    }

    private createWeaponMesh(): THREE.Mesh {
        const weaponGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
        const weaponMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 });
        const weapon = new THREE.Mesh(weaponGeo, weaponMat);
        weapon.position.set(0.8, 1.0, 0.2);
        weapon.name = "WeaponMesh";
        return weapon;
    }

    private setupAnimations() {
        if (!this.privateMixer) return;

        // Procedural or loaded AnimationClips placeholders
        const clips = {
            "Idle": this.createClip(new THREE.Quaternion(), 1.0),
            "Run": this.createClip(new THREE.Quaternion(), 0.5),
            "C1": this.createComboClip(1),
            "C2": this.createComboClip(2),
            "C3": this.createComboClip(3),
            "C4": this.createComboClip(4),
            "C5": this.createComboClip(5),
            "C6": this.createComboClip(6),
            "Dash": this.createClip(new THREE.Quaternion(), 0.4),
            "Guard": this.createGuardClip(),
            "Musou": this.createMusouClip(),
            "Dead": this.createDeadClip()
        };

        for (const [name, clip] of Object.entries(clips)) {
            const action = this.privateMixer.clipAction(clip);
            this.privateActions.set(name, action);
            if (name === "Idle") {
                action.play();
                this.currentAnimation = action;
            }
        }
    }

    private createClip(q: THREE.Quaternion, duration: number): THREE.AnimationClip {
        const time = [0, duration];
        const values = [q.x, q.y, q.z, q.w];
        const track = new THREE.QuaternionKeyframeTrack("PlayerBody.quaternion", time, values);
        return new THREE.AnimationClip("", duration, [track]);
    }

    private createComboClip(index: number): THREE.AnimationClip {
        const duration = 0.3 + index * 0.05;
        const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 4 * index);
        const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4 * index);
        const q3 = q1;
        const time = [0, duration * 0.5, duration];
        const values = [
            q1.x, q1.y, q1.z, q1.w,
            q2.x, q2.y, q2.z, q2.w,
            q3.x, q3.y, q3.z, q3.w
        ];
        const track = new THREE.QuaternionKeyframeTrack("WeaponMesh.quaternion", time, values);
        return new THREE.AnimationClip(`Combo_${index}`, duration, [track]);
    }

    private createGuardClip(): THREE.AnimationClip {
        const duration = 0.2;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        const time = [0, duration];
        const values = [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w];
        const track = new THREE.QuaternionKeyframeTrack("WeaponMesh.quaternion", time, values);
        return new THREE.AnimationClip("Guard", duration, [track]);
    }

    private createMusouClip(): THREE.AnimationClip {
        const duration = 2.0;
        // Spin animation
        const trackValues: number[] = [];
        const time: number[] = [];
        for (let i = 0; i < 10; i++) {
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.6);
            trackValues.push(q.x, q.y, q.z, q.w);
            time.push(i * 0.2);
        }
        const track = new THREE.QuaternionKeyframeTrack("WeaponMesh.quaternion", time, trackValues);
        return new THREE.AnimationClip("Musou", duration, [track]);
    }

    private createDeadClip(): THREE.AnimationClip {
        const duration = 1.0;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        const time = [0, duration];
        const values = [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w];
        const track = new THREE.QuaternionKeyframeTrack("PlayerBody.quaternion", time, values);
        return new THREE.AnimationClip("Dead", duration, [track]);
    }

    private addInputListeners(camera: THREE.PerspectiveCamera) {
        window.addEventListener("keydown", (e) => this.onKeyDown(e));
        window.addEventListener("keyup", (e) => this.onKeyUp(e));
        window.addEventListener("mousedown", (e) => this.onMouseDown(e));
        window.addEventListener("mouseup", (e) => this.onMouseUp(e));
        window.addEventListener("mousemove", (e) => this.onMouseMove(e, camera));
        window.addEventListener("touchstart", (e) => this.onTouchStart(e));
        window.addEventListener("touchmove", (e) => this.onTouchMove(e));
        window.addEventListener("touchend", (e) => this.onTouchEnd(e));
        window.addEventListener("gamepadconnected", this.onGamepadConnected);
        window.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    }

    private onKeyDown(e: KeyboardEvent) {
        switch (e.code) {
            case "KeyW": this.inputState.forward = 1; break;
            case "KeyS": this.inputState.backward = 1; break;
            case "KeyA": this.inputState.left = 1; break;
            case "KeyD": this.inputState.right = 1; break;
            case "Space": this.inputState.isJumping = true; break;
            case "ShiftLeft": this.inputState.dashPressed = true; break;
            case "KeyE": this.inputState.attackPressed = true; break;
            case "KeyQ": this.inputState.guardPressed = true; break;
            case "ControlLeft": this.inputState.lockOnPressed = true; break;
            default:
                if (e.code.startsWith("Digit")) this.inputState.dashPressed = true;
        }
    }

    private onKeyUp(e: KeyboardEvent) {
        switch (e.code) {
            case "KeyW": this.inputState.forward = 0; break;
            case "KeyS": this.inputState.backward = 0; break;
            case "KeyA": this.inputState.left = 0; break;
            case "KeyD": this.inputState.right = 0; break;
            case "Space": this.inputState.isJumping = false; break;
            case "ShiftLeft": this.inputState.dashPressed = false; break;
            case "KeyE": this.inputState.attackPressed = false; break;
            case "KeyQ": this.inputState.guardPressed = false; break;
            case "ControlLeft": this.inputState.lockOnPressed = false; break;
        }
    }

    private onMouseDown(e: MouseEvent) {
        if (e.button === 0) this.inputState.mouseDownLeft = true;
        if (e.button === 2) this.inputState.mouseDownRight = true;
        if (e.button === 0) this.inputState.attackPressed = true;
        if (e.button === 2) this.inputState.dashPressed = true;
        e.preventDefault();
    }

    private onMouseUp(e: MouseEvent) {
        if (e.button === 0) this.inputState.mouseDownLeft = false;
        if (e.button === 2) this.inputState.mouseDownRight = false;
        if (e.button === 0) this.inputState.attackPressed = false;
        if (e.button === 2) this.inputState.dashPressed = false;
    }

    private onMouseMove(e: MouseEvent, camera: THREE.PerspectiveCamera) {
        if (document.pointerLockElement) {
            this.inputState.mouseMovedX = e.movementX;
            this.inputState.mouseMovedY = e.movementY;
        } else {
            // Fallback: Calculate delta
            this.inputState.mouseMovedX = e.movementX || 0;
            this.inputState.mouseMovedY = e.movementY || 0;
        }
    }

    private onTouchStart(e: TouchEvent) {
        const touch = e.touches[0];
        if (touch && touch.clientX < window.innerWidth * 0.5) {
            // Left side - Joystick/Forward
            this.inputState.forward = 1;
        } else if (touch) {
            // Right side - Action
            this.inputState.attackPressed = true;
        }
    }

    private onTouchMove(e: TouchEvent) {
        const touch = e.touches[0];
        if (touch && touch.clientX < window.innerWidth * 0.5) {
            const centerX = window.innerWidth * 0.25;
            const deltaX = (touch.clientX - centerX) / 50;
            this.inputState.right = Math.min(1, Math.max(0, deltaX));
            this.inputState.left = Math.max(0, -deltaX);
        }
    }

    private onTouchEnd(e: TouchEvent) {
        this.inputState.forward = 0;
        this.inputState.attackPressed = false;
        this.inputState.right = 0;
        this.inputState.left = 0;
    }

    private onGamepadConnected(e: GamepadEvent) {
        this.pollGamepad();
    }

    private onGamepadDisconnected() {
        this.pollGamepad();
    }

    private pollGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (gamepads.length > 0) {
            const gp = gamepads[0];
            this.inputState.gamepadLeftX = gp.axes[0] || 0;
            this.inputState.gamepadLeftY = gp.axes[1] || 0;
            this.inputState.gamepadRightX = gp.axes[2] || 0;
            this.inputState.gamepadRightY = gp.axes[3] || 0;
            this.inputState.gamepadA = gp.buttons[0].pressed;
            this.inputState.gamepadX = gp.buttons[2].pressed;
            this.inputState.gamepadB = gp.buttons[1].pressed;
            this.inputState.gamepadY = gp.buttons[3].pressed;
            this.inputState.gamepadLB = gp.buttons[4].pressed;
            this.inputState.gamepadRB = gp.buttons[5].pressed;
            this.inputState.gamepadLT = gp.buttons[7].value;
            this.inputState.gamepadRT = gp.buttons[8].value;
        }
    }

    // Main Update Logic
    update(dt: number, eventBus: EventBus, engine: Engine) {
        if (this.isDead) {
            this.updateDeadState(dt);
            return;
        }

        this.pollGamepad();
        this.updateInput();
        this.updateMovement(dt);
        this.updateCombat(dt);
        this.updateAnimations(dt);
        this.updateCamera(dt);
        this.updateMusouGauge(dt, eventBus);
    }

    private updateInput() {
        // Gamepad Mapping
        if (Math.abs(this.inputState.gamepadLeftX) > 0.2 || Math.abs(this.inputState.gamepadLeftY) > 0.2) {
            this.inputState.forward = -this.inputState.gamepadLeftY;
            this.inputState.left = this.inputState.gamepadLeftX;
            this.inputState.right = -this.inputState.gamepadLeftX;
            this.inputState.backward = this.inputState.gamepadLeftY;
        }

        if (this.inputState.gamepadA) this.inputState.attackPressed = true;
        if (this.inputState.gamepadB) this.inputState.guardPressed = true;
        if (this.inputState.gamepadX) this.inputState.dashPressed = true;
        if (this.inputState.gamepadY) this.inputState.lockOnPressed = true;

        // Mouse Lock
        if (this.inputState.lockOnPressed && !this.camState.isLockingOn && !document.pointerLockElement) {
            document.body.requestPointerLock();
            this.camState.isLockingOn = true;
        }
        if (!this.inputState.lockOnPressed && this.camState.isLockingOn && document.pointerLockElement) {
            document.exitPointerLock();
            this.camState.isLockingOn = false;
        }

        if (document.pointerLockElement === document.body) {
            this.camState.cameraOffset.x = 0; // Reset X rotation based on lock-on
            this.camState.cameraOffset.y = 2.5;
            this.camState.cameraOffset.z = -4.0;
            // Apply mouse look relative to lock-on
            const sensitivity = 0.002;
            const yaw = this.inputState.mouseMovedX * sensitivity;
            const pitch = this.inputState.mouseMovedY * sensitivity;

            // Calculate desired camera position
            const target = this.camState.lockOnTarget ? this.camState.lockOnTarget.position : this.playerMesh.position;
            const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.playerMesh.quaternion);
            const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.playerMesh.quaternion);

            const camAngle = yaw;
            const camPitch = pitch;

            const dist = 4.0;
            const offsetX = Math.sin(camAngle) * Math.cos(camPitch) * dist;
            const offsetY = Math.cos(camPitch) * dist + 2.0;
            const offsetZ = Math.cos(camAngle) * Math.cos(camPitch) * dist;

            this.camState.cameraPos.set(
                target.x - forwardDir.x * offsetZ + rightDir.x * offsetX,
                target.y + offsetY,
                target.z - forwardDir.z * offsetZ + rightDir.z * offsetX
            );
        } else {
            // Free Mouse Orbit
            const yaw = this.inputState.mouseMovedX * 0.005;
            const pitch = this.inputState.mouseMovedY * 0.005;
            // Orbit around player
        }

        this.inputState.mouseMovedX = 0;
        this.inputState.mouseMovedY = 0;
    }

    private updateMovement(dt: number) {
        if (this.animState.dashTimer > 0) {
            this.animState.dashTimer -= dt;
            this.playerVelocity.copy(this.animState.dashDir).multiplyScalar(DASH_SPEED);
            if (this.animState.dashTimer <= 0) {
                this.inputState.isDashCharged = false;
                this.animState.dashTimer = 0;
            }
        } else if (this.canMove && this.animState.hitstunTimer <= 0) {
            const moveInput = new THREE.Vector3(
                this.inputState.right - this.inputState.left,
                0,
                this.inputState.forward - this.inputState.backward
            );

            if (moveInput.length() > 1) moveInput.normalize();
            if (moveInput.length() > 0) {
                this.playerVelocity.copy(moveInput).multiplyScalar(PLAYER_SPEED);
                if (this.currentAnimation && this.currentAnimation.getEffectiveName() !== "Run") {
                    this.changeAnimation("Run");
                }
            } else {
                this.playerVelocity.lerp(new THREE.Vector3(), 0.1);
                if (this.currentAnimation && this.currentAnimation.getEffectiveName() !== "Idle") {
                    this.changeAnimation("Idle");
                }
            }
        }

        // Apply Velocity
        this.playerMesh.position.add(this.playerVelocity.clone().multiplyScalar(dt));
        this.playerMesh.position.y = this.groundY; // Ground Snap
        this.playerMesh.position.x = Math.max(-20, Math.min(20, this.playerMesh.position.x));
        this.playerMesh.position.z = Math.max(-20, Math.min(20, this.playerMesh.position.z));

        // Dash Cooldown
        if (this.inputState.isDashCharged) {
            this.inputState.isDashCooldown -= dt;
            if (this.inputState.isDashCooldown <= 0) this.inputState.isDashCharged = false;
        }

        // Dash Trigger
        if (this.inputState.dashPressed && !this.inputState.isDashCharged && this.canAct) {
            this.triggerDash();
        }
    }

    private triggerDash() {
        this.inputState.isDashCharged = true;
        this.inputState.isDashCooldown = DASH_COOLDOWN;
        this.animState.dashTimer = DASH_DURATION;

        const moveDir = new THREE.Vector3(
            this.inputState.right - this.inputState.left,
            0,
            this.inputState.forward - this.inputState.backward
        );
        if (moveDir.lengthSq() < 0.01) {
            moveDir.copy(this.playerMesh.quaternion);
            moveDir.z *= -1; // Dash forward
        }
        moveDir.normalize();
        this.animState.dashDir.copy(moveDir);

        this.changeAnimation("Dash");
        EventBus.emit("PlayerDash");
    }

    private updateCombat(dt: number) {
        if (this.inputState.attackPressed && this.canAct && this.animState.dashTimer <= 0) {
            this.triggerAttack();
            this.inputState.attackPressed = false;
        }
        if (this.inputState.guardPressed) {
            if (this.canAct && this.animState.guardStagger <= 0) {
                this.changeAnimation("Guard");
                this.animState.isGuarding = true;
            }
        } else {
            this.animState.isGuarding = false;
        }

        // Hitstun
        if (this.animState.hitstunTimer > 0) {
            this.animState.hitstunTimer -= dt;
            this.canMove = false;
        } else {
            this.canMove = true;
        }

        // Hitstop
        if (this.animState.hitstopTimer > 0) {
            this.animState.hitstopTimer -= dt;
            this.canAct = false;
        } else {
            this.canAct = true;
        }
    }

    private triggerAttack() {
        const comboState = this.animState;
        if (comboState.comboTimer > 0) {
            comboState.comboIndex = (comboState.comboIndex + 1) % 6;
            const clipName = `C${comboState.comboIndex + 1}`;
            this.changeAnimation(clipName);
        } else {
            comboState.comboIndex = 0;
            this.changeAnimation("C1");
        }

        comboState.comboDuration = 0.3 + comboState.comboIndex * 0.05;
        comboState.comboTimer = comboState.comboDuration;
        EventBus.emit("PlayerAttackStart", { comboIndex: comboState.comboIndex });

        // Hit detection timing (approximate active frame)
        const hitTime = 0.1 + comboState.comboIndex * 0.05;
        setTimeout(() => {
            if (!this.isDead) {
                EventBus.emit("PlayerHitboxActive", {
                    position: this.playerMesh.position,
                    comboIndex: this.animState.comboIndex
                });
                this.triggerHitReaction(comboState.comboIndex);
            }
        }, hitTime * 1000);
    }

    private triggerHitReaction(comboIndex: number) {
        const damage = 10 + comboIndex * 2;
        this.animState.musouGauge = Math.min(1.0, this.animState.musouGauge + 0.05);
        EventBus.emit("CombatDamage", { amount: damage, position: this.playerMesh.position });

        // Check for Lock-On Target
        if (this.camState.lockOnTarget && this.camState.lockOnTarget instanceof THREE.Object3D) {
            const target = this.camState.lockOnTarget;
            const dist = target.position.distanceTo(this.playerMesh.position);
            if (dist < WEAPON_RANGE) {
                EventBus.emit("EnemyHit", {
                    target: target,
                    damage: damage,
                    position: target.position
                });

                // Combo Knockback
                const knockback = new THREE.Vector3(
                    target.position.x - this.playerMesh.position.x,
                    0,
                    target.position.z - this.playerMesh.position.z
                ).normalize().multiplyScalar(2.0 + comboIndex * 0.5);

                // Hit-stop
                this.animState.hitstopTimer = 0.05;
                this.camState.camShakeAmount = 0.1;

                if (comboIndex === 5) {
                    // Blowaway
                    EventBus.emit("EnemyBlowAway", { target: target, force: knockback });
                }
            }
        }
    }

    private updateMusouGauge(dt: number, eventBus: EventBus) {
        // Fill on hit
        // Decay when not in combat

        if (this.inputState.gamepadRT > 0.5 && this.animState.musouGauge >= 1.0) {
            this.triggerMusou();
        }
    }

    private triggerMusou() {
        this.changeAnimation("Musou");
        this.animState.musouGauge = 0;
        EventBus.emit("PlayerMusou");
        // Screen Clear Logic
        setTimeout(() => {
            EventBus.emit("MusouClearScreen");
        }, 1000);
    }

    private updateAnimations(dt: number) {
        if (!this.privateMixer) return;
        this.privateMixer.update(dt * this.timeScale);

        if (this.animState.hitstunTimer > 0) {
            this.changeAnimation("Dead", true);
        } else if (this.animState.dashTimer > 0) {
            this.changeAnimation("Dash");
        } else if (this.animState.comboTimer > 0) {
            this.animState.comboTimer -= dt;
            if (this.animState.comboTimer <= 0) {
                this.animState.comboIndex = 0;
                this.changeAnimation("Idle");
            }
        } else if (this.animState.isGuarding) {
            this.changeAnimation("Guard");
        } else if (this.canMove && this.playerVelocity.lengthSq() > 0.1) {
            this.changeAnimation("Run");
        } else {
            this.changeAnimation("Idle");
        }
    }

    private changeAnimation(name: string, once = false) {
        if (!this.privateMixer) return;
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(0.1);
        }
        const newAction = this.privateActions.get(name);
        if (newAction) {
            newAction.reset();
            newAction.play();
            if (once) newAction.setLoop(THREE.LoopOnce, 1);
            newAction.fadeIn(0.1);
            this.currentAnimation = newAction;
        }
    }

    private updateCamera(dt: number) {
        if (this.camState.camShakeAmount > 0) {
            this.camState.camShakeAmount -= dt * 2.0;
            if (this.camState.camShakeAmount < 0) this.camState.camShakeAmount = 0;
        }

        const target = this.camState.lockOnTarget && this.camState.isLockingOn ? this.camState.lockOnTarget : this.playerMesh;
        const targetPos = (target instanceof THREE.Object3D) ? target.position : this.playerMesh.position;

        // Smoothing
        const currentCam = this.camState.cameraPos;
        currentCam.lerp(new THREE.Vector3(), 0); // Reset for logic
        // Calculate desired
        const desiredPos = new THREE.Vector3(
            targetPos.x,
            targetPos.y + 2.0,
            targetPos.z - 4.0
        ).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);

        // Lerp camera position
        this.camState.cameraPos.lerp(desiredPos, 0.15);
        this.camState.cameraLookAt.lerp(targetPos, 0.2);
    }

    updateDeadState(dt: number) {
        this.playerVelocity.set(0, 0, 0);
        this.playerMesh.position.y -= 0.5 * dt;
    }

    takeDamage(amount: number) {
        if (this.isDead) return;
        this.animState.health -= amount;
        this.animState.hitstunTimer = 0.2;
        this.animState.guardStagger = 0;
        this.changeAnimation("Dead");
        EventBus.emit("PlayerHit");

        if (this.animState.health <= 0) {
            this.isDead = true;
            this.changeAnimation("Dead", true);
            EventBus.emit("PlayerDeath");
        }
    }

    heal(amount: number) {
        if (this.isDead) return;
        this.animState.health = Math.min(100, this.animState.health + amount);
    }

    setLockOnTarget(target: THREE.Object3D | null) {
        this.camState.lockOnTarget = target;
        if (target) {
            this.camState.isLockingOn = true;
        }
    }

    dispose() {
        // Remove event listeners
        if (this.privateMixer) {
            this.privateMixer.stopAllAction();
            this.privateMixer = null;
        }
    }
}

export { PlayerController };
