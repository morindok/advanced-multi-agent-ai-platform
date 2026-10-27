// src/core/Engine.ts
// No build required. Classic ES5-compatible JavaScript running in browser.
// Exposes global 'Engine' object.

var Engine = (function () {
    "use strict";

    // Constants
    var FIXED_TIMESTEP = 1 / 60;
    var MAX_FRAME_RATE = 60;
    var ACCUMULATOR_MAX = 0.25;

    // State
    var renderer = null;
    var scene = null;
    var camera = null;
    var ecsWorld = null;
    var eventBus = null;
    var gameStates = null;
    var inputManager = null;

    var lastTime = 0;
    var accumulator = 0;
    var simulationTime = 0;
    var isRunning = false;
    var isPaused = false;

    // Systems
    var updateSystems = [];
    var renderSystems = [];
    var fixedUpdateSystems = [];

    /**
     * Initialize the engine with all necessary components
     */
    function init(rendererObj, sceneObj, cameraObj, worldObj, eventBusObj, gameStateManager, inputMgr) {
        renderer = rendererObj;
        scene = sceneObj;
        camera = cameraObj;
        ecsWorld = worldObj;
        eventBus = eventBusObj;
        gameStates = gameStateManager;
        inputManager = inputMgr;

        // Register core fixed-step systems in correct order:
        // 1. Input handling (handled in loop)
        // 2. Physics
        // 3. AI
        // 4. Combat resolution
        registerSystem(fixedUpdateSystems, function (dt) {
            updatePhysics(dt);
        });

        registerSystem(fixedUpdateSystems, function (dt) {
            updateAI(dt);
        });

        registerSystem(fixedUpdateSystems, function (dt) {
            updateCombat(dt);
        });

        // Variable-rate systems (interpolated or non-fixed)
        registerSystem(updateSystems, function (dt) {
            updatePlayer(dt);
        });

        registerSystem(updateSystems, function (dt) {
            updateCrowd(dt);
        });

        // Rendering
        registerSystem(renderSystems, function (delta, alpha) {
            renderScene(delta, alpha);
        });

        // Game State Listening
        eventBus.subscribe("GAME_STATE_CHANGE", function (data) {
            if (data.state === "PAUSED") {
                isPaused = true;
            } else if (data.state === "PLAYING") {
                isPaused = false;
                lastTime = performance.now();
                accumulator = 0;
            }
        });
    }

    /**
     * Register a system function into an array
     */
    function registerSystem(systemArray, fn) {
        systemArray.push(fn);
    }

    /**
     * Physics Simulation Step
     * Moves entities based on velocity and applies gravity
     */
    function updatePhysics(dt) {
        if (!ecsWorld) return;
        
        var entities = ecsWorld.getEntitiesByComponent("Velocity");
        for (var i = 0; i < entities.length; i++) {
            var e = entities[i];
            var vel = ecsWorld.getComponent(e, "Velocity");
            var pos = ecsWorld.getComponent(e, "Position");
            if (pos && vel) {
                // Apply velocity
                pos.x += vel.x * dt;
                pos.y += vel.y * dt;
                pos.z += vel.z * dt;

                // Gravity
                if (!vel.isGrounded) {
                    vel.y -= 9.8 * dt;
                    // Update position with new y
                    pos.y += vel.y * dt;

                    // Ground check
                    if (pos.y <= 0) {
                        pos.y = 0;
                        vel.y = 0;
                        vel.isGrounded = true;
                    }
                }
                
                // Floor clamp
                if (pos.y < 0) {
                    pos.y = 0;
                }
            }
        }
    }

    /**
     * AI Simulation Step
     * Updates enemy behavior states (IDLE, CHASE, ATTACK, FLEE)
     */
    function updateAI(dt) {
        if (!ecsWorld) return;

        var entities = ecsWorld.getEntitiesByComponent("AI");
        var heroEntity = ecsWorld.getHeroEntity ? ecsWorld.getHeroEntity() : null;
        var playerPos = heroEntity ? ecsWorld.getComponent(heroEntity, "Position") : null;

        for (var i = 0; i < entities.length; i++) {
            var e = entities[i];
            var ai = ecsWorld.getComponent(e, "AI");
            var pos = ecsWorld.getComponent(e, "Position");
            var vel = ecsWorld.getComponent(e, "Velocity");

            if (!ai || !pos || !playerPos) continue;

            var dx = playerPos.x - pos.x;
            var dz = playerPos.z - pos.z;
            var distSq = dx * dx + dz * dz;
            var dist = Math.sqrt(distSq);

            // Decay cooldowns
            ai.attackCooldown = Math.max(0, ai.attackCooldown - dt);

            switch (ai.state) {
                case "IDLE":
                    if (dist < ai.aggroRange) {
                        ai.state = "CHASE";
                    }
                    break;

                case "CHASE":
                    if (dist > ai.attackRange) {
                        // Move toward player
                        if (dist > 0.001) {
                            var nx = dx / dist;
                            var nz = dz / dist;
                            vel.x = nx * ai.speed;
                            vel.z = nz * ai.speed;
                            vel.y = 0;
                        }
                    } else {
                        // In range: stop and attack
                        vel.x = 0;
                        vel.z = 0;
                        if (ai.attackCooldown <= 0) {
                            eventBus.emit("ENEMY_ATTACK", { target: heroEntity, source: e, damage: ai.damage || 10 });
                            ai.attackCooldown = 1.5; // Cooldown seconds
                        }
                    }
                    
                    // Morale/Health check for fleeing
                    if (ai.morale < 20 && dist > 15) {
                        ai.state = "FLEE";
                    }
                    break;

                case "FLEE":
                    // Run away from player
                    if (dist > 0.001) {
                        var fx = -dx / dist;
                        var fz = -dz / dist;
                        vel.x = fx * ai.speed * 1.2;
                        vel.z = fz * ai.speed * 1.2;
                    }
                    break;
            }
        }
    }

    /**
     * Combat Resolution Step
     * Handles hitboxes, damage application, and combo tracking
     */
    function updateCombat(dt) {
        // In a full implementation, we'd check active hitboxes against entities
        // Here we trigger damage events if pending hits exist
        if (ecsWorld && eventBus) {
            // Clear expired hitboxes
            var entities = ecsWorld.getEntitiesByComponent("Hitbox");
            for (var i = 0; i < entities.length; i++) {
                var e = entities[i];
                var hb = ecsWorld.getComponent(e, "Hitbox");
                if (hb) {
                    hb.life -= dt;
                    if (hb.life <= 0) {
                        // Remove hitbox logic or set inactive
                        hb.active = false;
                    }
                }
            }
        }
    }

    /**
     * Player Input -> Movement/Action Step
     */
    function updatePlayer(dt) {
        if (!ecsWorld || !inputManager) return;
        
        var hero = ecsWorld.getHeroEntity ? ecsWorld.getHeroEntity() : null;
        if (!hero) return;

        var input = inputManager.getInputState ? inputManager.getInputState() : null;
        var vel = ecsWorld.getComponent(hero, "Velocity");
        var pos = ecsWorld.getComponent(hero, "Position");
        
        if (!input || !vel || !pos) return;

        var speed = 8.0;
        var moveX = 0;
        var moveZ = 0;

        if (input.up) moveZ -= 1;
        if (input.down) moveZ += 1;
        if (input.left) moveX -= 1;
        if (input.right) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
            var len = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (len > 0) {
                moveX /= len;
                moveZ /= len;
            }
            vel.x = moveX * speed;
            vel.z = moveZ * speed;
        } else {
            vel.x = 0;
            vel.z = 0;
        }

        // Jump
        if (input.jump && vel.y === 0 && vel.isGrounded) {
            vel.y = 10.0;
            vel.isGrounded = false;
        }

        // Attack Input
        if (input.attack) {
            // De-duplicate attacks if held
            if (!updatePlayer._lastAttackFrame || updatePlayer._lastAttackFrame !== performance.now()) {
                eventBus.emit("PLAYER_ATTACK", { source: hero });
                updatePlayer._lastAttackFrame = performance.now();
            }
        }
        
        // Dash
        if (input.dash && vel.y === 0) {
            vel.x *= 2.5;
            vel.z *= 2.5;
        }
    }

    /**
     * Crowd Separation Logic
     */
    function updateCrowd(dt) {
        if (!ecsWorld) return;
        var entities = ecsWorld.getEntitiesByComponent("Crowd");
        // Simplified separation force
        for (var i = 0; i < entities.length; i++) {
            var e = entities[i];
            var pos = ecsWorld.getComponent(e, "Position");
            var vel = ecsWorld.getComponent(e, "Velocity");
            if (!pos || !vel) continue;
            
            var separationX = 0;
            var separationZ = 0;
            
            // Check neighbors (simplified: only check hero for now, add spatial hash for full game)
            var hero = ecsWorld.getHeroEntity ? ecsWorld.getHeroEntity() : null;
            if (hero) {
                var hPos = ecsWorld.getComponent(hero, "Position");
                if (hPos) {
                    var dx = pos.x - hPos.x;
                    var dz = pos.z - hPos.z;
                    var distSq = dx * dx + dz * dz;
                    if (distSq < 1.0 && distSq > 0.001) {
                        var dist = Math.sqrt(distSq);
                        var force = (1.0 / dist) * 0.5;
                        separationX += (dx / dist) * force;
                        separationZ += (dz / dist) * force;
                    }
                }
            }
            
            vel.x += separationX * dt * 5;
            vel.z += separationZ * dt * 5;
        }
    }

    /**
     * Rendering Step
     */
    function renderScene(delta, alpha) {
        if (renderer && scene && camera) {
            // Update camera if lock-on or dynamic
            if (camera.isPerspectiveCamera) {
                // Placeholder for camera updates
            }
            renderer.render(scene, camera);
        }
    }

    /**
     * Main Loop (Fixed Timestep)
     */
    function loop() {
        if (!isRunning) return;
        requestAnimationFrame(loop);

        var now = performance.now();
        var frameTime = (now - lastTime) / 1000;
        lastTime = now;

        // Clamp to avoid spiral of death
        if (frameTime > ACCUMULATOR_MAX) {
            frameTime = ACCUMULATOR_MAX;
        }

        if (!isPaused) {
            accumulator += frameTime;

            // Process fixed steps
            while (accumulator >= FIXED_TIMESTEP) {
                // 1. Update Input
                if (inputManager && inputManager.update) {
                    inputManager.update();
                }

                // 2. Run Fixed Systems
                for (var i = 0; i < fixedUpdateSystems.length; i++) {
                    fixedUpdateSystems[i](FIXED_TIMESTEP);
                }

                simulationTime += FIXED_TIMESTEP;
                accumulator -= FIXED_TIMESTEP;
            }
        }

        // Interpolation Alpha
        var alpha = accumulator / FIXED_TIMESTEP;

        // 3. Run Variable Systems (interpolated)
        for (var j = 0; j < updateSystems.length; j++) {
            updateSystems[j](alpha * FIXED_TIMESTEP, alpha);
        }

        // 4. Render
        for (var k = 0; k < renderSystems.length; k++) {
            renderSystems[k](frameTime, alpha);
        }
    }

    /**
     * Start the engine
     */
    function start() {
        if (isRunning) return;
        isRunning = true;
        lastTime = performance.now();
        accumulator = 0;
        simulationTime = 0;
        requestAnimationFrame(loop);
    }

    /**
     * Stop the engine
     */
    function stop() {
        isRunning = false;
        isPaused = false;
    }

    /**
     * Pause the engine
     */
    function pause() {
        isPaused = true;
        if (eventBus) {
            eventBus.emit("GAME_STATE_CHANGE", { state: "PAUSED" });
        }
    }

    /**
     * Resume the engine
     */
    function resume() {
        isPaused = false;
        lastTime = performance.now();
        accumulator = 0;
        if (eventBus) {
            eventBus.emit("GAME_STATE_CHANGE", { state: "PLAYING" });
        }
    }

    /**
     * Reset simulation state
     */
    function reset() {
        simulationTime = 0;
        accumulator = 0;
        lastTime = performance.now();
        if (ecsWorld && ecsWorld.reset) {
            ecsWorld.reset();
        }
    }

    return {
        init: init,
        start: start,
        stop: stop,
        pause: pause,
        resume: resume,
        reset: reset,
        // Expose systems for external registration if needed
        registerFixedSystem: function(fn) { registerSystem(fixedUpdateSystems, fn); },
        registerVariableSystem: function(fn) { registerSystem(updateSystems, fn); },
        registerRenderSystem: function(fn) { registerSystem(renderSystems, fn); },
        getSimulationTime: function() { return simulationTime; },
        getIsRunning: function() { return isRunning; },
        getIsPaused: function() { return isPaused; }
    };
})();

window.Engine = Engine;
