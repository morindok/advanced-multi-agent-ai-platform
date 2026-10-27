(function () {
  "use strict";

  // ---------- Global state ----------
  var State = {
    running: false,
    paused: false,
    ended: false,
    score: 0,
    health: 100,
    maxHealth: 100,
    wave: 1,
    maxWave: 10,
    enemiesAlive: 0,
    time: 0,
    lastTime: 0
  };

  // ---------- Three.js setup ----------
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0a1a, 20, 120);
  scene.background = new THREE.Color(0x0d0d1f);

  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById("game-canvas").appendChild(renderer.domElement);

  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 28, 38);
  var camTarget = new THREE.Vector3(0, 0, 0);
  camera.lookAt(camTarget);

  // ---------- Lighting ----------
  var ambient = new THREE.AmbientLight(0x445566, 0.6);
  scene.add(ambient);

  var hemi = new THREE.HemisphereLight(0x8899bb, 0x223344, 0.5);
  scene.add(hemi);

  var sun = new THREE.DirectionalLight(0xffeedd, 1.2);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  scene.add(sun);

  var moonLight = new THREE.PointLight(0x6688ff, 0.8, 80);
  moonLight.position.set(-40, 30, -20);
  scene.add(moonLight);

  // ---------- Ground ----------
  function buildGround() {
    var geo = new THREE.PlaneGeometry(200, 200, 32, 32);
    var mat = new THREE.MeshStandardMaterial({
      color: 0x2a3a2a,
      roughness: 0.9,
      metalness: 0.1
    });
    var ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = "ground";
    scene.add(ground);

    // subtle grid
    var grid = new THREE.GridHelper(200, 40, 0x334455, 0x223344);
    grid.position.y = 0.01;
    grid.material.opacity = 0.15;
    grid.material.transparent = true;
    scene.add(grid);

    // scatter rocks / trees for atmosphere
    for (var i = 0; i < 30; i++) {
      var rx = (Math.random() - 0.5) * 160;
      var rz = (Math.random() - 0.5) * 160;
      if (Math.abs(rx) < 8 && Math.abs(rz) < 8) continue;
      var rGeo = new THREE.DodecahedronGeometry(0.5 + Math.random() * 1.2);
      var rMat = new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.95 });
      var rock = new THREE.Mesh(rGeo, rMat);
      rock.position.set(rx, 0.4, rz);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }

    // trees (stylized)
    for (var t = 0; t < 14; t++) {
      var tx = (Math.random() - 0.5) * 150;
      var tz = (Math.random() - 0.5) * 150;
      if (Math.abs(tx) < 12 && Math.abs(tz) < 12) { tx += 20; }
      var trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 3, 6);
      var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });
      var trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 1.5, tz);
      trunk.castShadow = true;
      scene.add(trunk);

      var leafGeo = new THREE.ConeGeometry(2.2, 4, 8);
      var leafMat = new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.85 });
      var leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(tx, 4.5, tz);
      leaves.castShadow = true;
      scene.add(leaves);
    }
  }
  buildGround();

  // ---------- Particles / VFX helpers ----------
  var particles = [];
  function spawnHitVFX(pos, color) {
    var pGeo = new THREE.SphereGeometry(0.15, 6, 6);
    var pMat = new THREE.MeshBasicMaterial({ color: color || 0xffcc00 });
    var p = new THREE.Mesh(pGeo, pMat);
    p.position.copy(pos);
    p.userData = { life: 0.35, vel: new THREE.Vector3((Math.random()-0.5)*4, 3+Math.random()*3, (Math.random()-0.5)*4) };
    scene.add(p);
    particles.push(p);
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.userData.life -= dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 9.8 * dt;
      var s = Math.max(0.02, p.userData.life / 0.35);
      p.scale.setScalar(s);
      if (p.userData.life <= 0) {
        scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        particles.splice(i, 1);
      }
    }
  }

  // ---------- Player ----------
  var player;
  function loadPlayer() {
    if (typeof window.Player !== "function") {
      console.error("player.js not loaded");
      return;
    }
    player = new Player();
    scene.add(player.mesh);
  }

  // ---------- Enemies ----------
  var enemies = [];
  var enemySpawns = [];
  function loadEnemies() {
    if (typeof window.Enemies !== "object") {
      console.error("enemies.js not loaded");
    }
  }

  function spawnWave(wave) {
    enemySpawns = [];
    enemies = [];
    var count = 4 + wave * 3;
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      var dist = 35 + Math.random() * 20;
      var ex = Math.cos(angle) * dist;
      var ez = Math.sin(angle) * dist;
      var type = (i % 3 === 0 && wave >= 3) ? "heavy" : (i % 2 === 0 ? "medium" : "light");
      var enemy = createEnemy(type, new THREE.Vector3(ex, 0, ez));
      enemies.push(enemy);
      scene.add(enemy.mesh);
    }
    State.enemiesAlive = enemies.length;
    State.wave = wave;
    updateUI();
  }

  function createEnemy(type, pos) {
    var baseMesh = null;
    var health, speed, damage, color, scale;

    if (type === "heavy") {
      health = 120 + State.wave * 15;
      speed = 2.2;
      damage = 18;
      color = 0xaa3333;
      scale = 1.4;
      var geo = new THREE.BoxGeometry(1.2, 1.8, 1.2);
      baseMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.3 }));
    } else if (type === "medium") {
      health = 70 + State.wave * 10;
      speed = 3.2;
      damage = 12;
      color = 0xcc6622;
      scale = 1.1;
      var geo = new THREE.ConeGeometry(0.6, 1.6, 8);
      baseMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color, roughness: 0.6, metalness: 0.2 }));
      baseMesh.rotation.x = Math.PI;
      baseMesh.position.y = 0.8;
    } else {
      health = 40 + State.wave * 6;
      speed = 4.0;
      damage = 8;
      color = 0x66aa44;
      scale = 0.9;
      var geo = new THREE.SphereGeometry(0.5, 12, 12);
      baseMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.15 }));
      baseMesh.position.y = 0.5;
    }

    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    baseMesh.position.copy(pos);
    baseMesh.position.y = (type === "medium" ? 0 : 0.4) * scale;

    // health bar sprite
    var barW = 1.5;
    var barH = 0.15;
    var barGeo = new THREE.PlaneGeometry(barW, barH);
    var barMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    var healthBar = new THREE.Mesh(barGeo, barMat);
    healthBar.position.y = 2.2 * scale;
    baseMesh.add(healthBar);

    var e = {
      mesh: baseMesh,
      type: type,
      health: health,
      maxHealth: health,
      speed: speed,
      damage: damage,
      scale: scale,
      attackCooldown: 0,
      state: "idle",
      healthBar: healthBar,
      lastHitTime: 0
    };
    return e;
  }

  function updateEnemies(dt) {
    if (!player || !player.mesh) return;
    var playerPos = player.mesh.position;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.health <= 0) continue;

      var toPlayer = new THREE.Vector3().subVectors(playerPos, e.mesh.position);
      toPlayer.y = 0;
      var dist = toPlayer.length();
      toPlayer.normalize();

      if (dist > 1.8) {
        e.state = "chase";
        var move = toPlayer.multiplyScalar(e.speed * dt * e.scale);
        e.mesh.position.x += move.x;
        e.mesh.position.z += move.z;
        e.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      } else {
        e.state = "attack";
        e.attackCooldown -= dt;
        if (e.attackCooldown <= 0) {
          e.attackCooldown = 1.2 / e.scale;
          player.takeDamage(e.damage);
          spawnHitVFX(playerPos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff3333);
        }
      }

      // update health bar
      var frac = Math.max(0, e.health / e.maxHealth);
      e.healthBar.scale.x = frac;
      e.healthBar.position.x = -(1 - frac) * 0.75;
      e.healthBar.material.color.setHSL(frac * 0.33, 1, 0.5);

      // billboard health bar to camera
      e.healthBar.lookAt(camera.position);
    }
  }

  function killEnemy(e) {
    e.health = 0;
    State.enemiesAlive--;
    State.score += e.type === "heavy" ? 200 : e.type === "medium" ? 100 : 50;
    spawnHitVFX(e.mesh.position.clone(), 0xffaa00);
    // explosion VFX
    for (var k = 0; k < 6; k++) {
      spawnHitVFX(
        e.mesh.position.clone().add(new THREE.Vector3((Math.random()-0.5)*2, Math.random()*1.5, (Math.random()-0.5)*2)),
        0xff6622
      );
    }
    scene.remove(e.mesh);
    // dispose
    if (e.mesh.geometry) e.mesh.geometry.dispose();
    if (e.mesh.material) e.mesh.material.dispose();

    for (var j = enemies.length - 1; j >= 0; j--) {
      if (enemies[j] === e) enemies.splice(j, 1);
    }

    updateUI();

    if (State.enemiesAlive <= 0) {
      nextWave();
    }
  }

  function nextWave() {
    if (State.wave >= State.maxWave) {
      winGame();
    } else {
      State.wave++;
      setTimeout(function () {
        if (State.running && !State.paused && !State.ended) {
          spawnWave(State.wave);
        }
      }, 1500);
    }
  }

  // ---------- Combat ----------
  function loadCombat() {
    if (typeof window.Combat !== "object") {
      console.error("combat.js not loaded");
    }
  }

  // ---------- UI ----------
  function updateUI() {
    if (typeof window.UI !== "object") return;
    UI.updateScore(State.score);
    UI.updateHealth(State.health, State.maxHealth);
    UI.updateWave(State.wave, State.maxWave);
    UI.updateEnemies(State.enemiesAlive);
  }

  // ---------- Game flow ----------
  function startGame() {
    if (State.ended || State.running) return;
    State.running = true;
    State.paused = false;
    State.ended = false;
    State.score = 0;
    State.health = State.maxHealth;
    State.wave = 1;
    State.enemiesAlive = 0;

    // reset player
    if (player) {
      player.reset();
      player.health = State.maxHealth;
    }

    spawnWave(1);
    updateUI();

    if (typeof window.UI !== "object" || !UI.hideStart) {
      // fallback: remove start overlay
      var el = document.getElementById("start-overlay");
      if (el) el.style.display = "none";
    } else {
      UI.hideStart();
    }
  }

  function pauseGame() {
    if (!State.running || State.ended) return;
    State.paused = !State.paused;
    if (typeof window.UI !== "undefined" && window.UI.togglePause) {
      UI.togglePause();
    }
  }

  function winGame() {
    State.ended = true;
    State.running = false;
    State.score += 1000 + State.health * 10;
    updateUI();
    showEndScreen("Victory!", "You conquered all " + State.maxWave + " waves.", 0x44ff88);
  }

  function loseGame() {
    if (State.ended) return;
    State.ended = true;
    State.running = false;
    updateUI();
    showEndScreen("Defeat", "Your dynasty has fallen...", 0xff4444);
  }

  function showEndScreen(title, subtitle, color) {
    var overlay = document.getElementById("end-overlay");
    var titleEl = document.getElementById("end-title");
    var subEl = document.getElementById("end-subtitle");
    var btn = document.getElementById("restart-btn");

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (titleEl) titleEl.style.color = "#" + color.toString(16).padStart(6, "0");

    if (overlay) {
      overlay.style.display = "flex";
      overlay.style.background = "rgba(5,5,15,0.85)";
    }

    if (btn) {
      btn.onclick = function () {
        // clean up enemies
        for (var i = 0; i < enemies.length; i++) {
          scene.remove(enemies[i].mesh);
          if (enemies[i].mesh.geometry) enemies[i].mesh.geometry.dispose();
          if (enemies[i].mesh.material) enemies[i].mesh.material.dispose();
        }
        enemies = [];
        particleCleanup();
        overlay.style.display = "none";
        startGame();
      };
    }
  }

  function particleCleanup() {
    for (var i = particles.length - 1; i >= 0; i--) {
      scene.remove(particles[i]);
      particles[i].geometry.dispose();
      particles[i].material.dispose();
      particles.splice(i, 1);
    }
  }

  function restartGame() {
    showEndScreen("", "", 0x000000); // hide
    document.getElementById("end-overlay").style.display = "none";
    startGame();
  }

  // ---------- Input ----------
  var keys = {};
  var mouseDown = false;
  var mousePos = new THREE.Vector2();

  window.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (e.code === "Escape" || e.code === "KeyP") {
      pauseGame();
    }
    if (e.code === "Enter" && !State.running && !State.ended) {
      startGame();
    }
  });

  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
  });

  renderer.domElement.addEventListener("mousedown", function (e) {
    mouseDown = true;
    mousePos.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    handleAttack(e);
  });

  renderer.domElement.addEventListener("mouseup", function () {
    mouseDown = false;
  });

  renderer.domElement.addEventListener("mousemove", function (e) {
    mousePos.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
  });

  // Touch
  renderer.domElement.addEventListener("touchstart", function (e) {
    e.preventDefault();
    var t = e.touches[0];
    mousePos.set(
      (t.clientX / window.innerWidth) * 2 - 1,
      -(t.clientY / window.innerHeight) * 2 + 1
    );
    mouseDown = true;
    handleAttack(t);
  }, { passive: false });

  renderer.domElement.addEventListener("touchmove", function (e) {
    e.preventDefault();
    var t = e.touches[0];
    mousePos.set(
      (t.clientX / window.innerWidth) * 2 - 1,
      -(t.clientY / window.innerHeight) * 2 + 1
    );
  }, { passive: false });

  renderer.domElement.addEventListener("touchend", function () {
    mouseDown = false;
  });

  function handleAttack() {
    if (!player || !player.mesh || !State.running || State.paused || State.ended) return;
    if (typeof player.attack !== "function") return;

    // Raycast for target
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mousePos, camera);
    var hits = raycaster.intersectObjects(enemies.map(function (e) { return e.mesh; }));

    if (hits.length > 0) {
      var hitObj = hits[0].object;
      var targetEnemy = null;
      for (var i = 0; i < enemies.length; i++) {
        if (enemies[i].mesh === hitObj) { targetEnemy = enemies[i]; break; }
      }
      if (targetEnemy) {
        player.attack(targetEnemy, targetEnemy.mesh.position);
      }
    } else {
      // melee: damage nearest enemy in range
      player.attack(null, null);
    }
  }

  // ---------- Update ----------
  function updatePlayer(dt) {
    if (!player || !player.mesh) return;

    var moveX = 0, moveZ = 0;
    if (keys["KeyW"] || keys["ArrowUp"]) moveZ -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) moveZ += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) moveX -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) moveX += 1;

    if (moveX !== 0 || moveZ !== 0) {
      var len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= len;
      moveZ /= len;
      player.move(moveX, moveZ, dt);
    }

    player.update(dt);

    if (player.health !== undefined) {
      State.health = Math.max(0, Math.round(player.health));
      if (State.health <= 0) {
        loseGame();
      }
    }
  }

  function updateCamera(dt) {
    if (!player || !player.mesh) return;
    var targetPos = player.mesh.position.clone();
    targetPos.y += 3;
    camTarget.lerp(targetPos, 0.08);
    camera.position.lerp(
      new THREE.Vector3(player.mesh.position.x, 28, player.mesh.position.z + 38),
      0.04
    );
    camera.lookAt(camTarget);
  }

  function update(dt) {
    State.time += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateCamera(dt);
    updateParticles(dt);

    if (State.health <= 0) {
      loseGame();
    }
  }

  // ---------- Main loop ----------
  var clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);

    if (State.running && !State.paused && !State.ended) {
      update(dt);
    }

    // idle camera sway
    if (!State.running) {
      camera.position.x = Math.sin(State.time * 0.3) * 10;
      camera.position.z = 35 + Math.cos(State.time * 0.2) * 5;
      camera.position.y = 25;
      camera.lookAt(camTarget);
    }

    renderer.render(scene, camera);
  }

  // ---------- Resize ----------
  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  // ---------- Init ----------
  function init() {
    loadPlayer();
    loadEnemies();
    loadCombat();

    // Wire up UI buttons
    var startBtn = document.getElementById("start-btn");
    var pauseBtn = document.getElementById("pause-btn");
    if (startBtn) startBtn.addEventListener("click", startGame);
    if (pauseBtn) pauseBtn.addEventListener("click", pauseGame);

    // UI init
    if (typeof window.UI !== "undefined" && window.UI.init) {
      UI.init();
    }

    // Start loop
    State.lastTime = performance.now();
    clock.getDelta();
    animate();
  }

  // Expose for other modules
  window.GameState = State;
  window.startGame = startGame;
  window.pauseGame = pauseGame;
  window.restartGame = restartGame;
  window.spawnHitVFX = spawnHitVFX;
  window.kilLenemy = killEnemy;
  window.enemies = enemies;
  window.player = null; // set after load

  // DOMContentLoaded or immediate
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
