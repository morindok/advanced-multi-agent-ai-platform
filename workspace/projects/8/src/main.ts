(function () {
  const SERVICES = {
    renderer: null,
    scene: null,
    camera: null,
    clock: { last: 0, delta: 0, time: 0 },
    hud: null,
    audio: null,
    input: null,
    engine: null
  };

  function detectWebGL2() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      document.body.innerHTML =
        '<div style="color:#fff;background:#1a1a1a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:monospace;font-size:1.2em;">WebGL2 not supported. Please use a modern browser with hardware acceleration enabled.</div>';
      return false;
    }
    return true;
  }

  function initServices() {
    const canvas = document.getElementById('gameCanvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 60, 180);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(0, 5, 10);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeecc, 1.4);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    scene.add(sun);

    SERVICES.renderer = renderer;
    SERVICES.scene = scene;
    SERVICES.camera = camera;

    buildTerrain(scene);
    initHUD();
    initAudio();
    initInput();

    const world = new THREE.Box3().setFromObject(scene);
    const engine = new GameEngine(renderer, scene, camera, world);
    SERVICES.engine = engine;
    SERVICES.input.addListener();

    window.addEventListener('resize', onResize);
    engine.start();
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    SERVICES.renderer.setSize(w, h);
    SERVICES.camera.aspect = w / h;
    SERVICES.camera.updateProjectionMatrix();
  }

  function buildTerrain(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a6b3a, roughness: 0.9 });
    const geo = new THREE.PlaneGeometry(200, 200, 40, 40);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const noise = Math.sin(x * 0.08) * Math.cos(y * 0.08) * 1.5 + Math.sin(x * 0.2 + y * 0.15) * 0.6;
      pos.setZ(i, noise);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const fortMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7 });
    for (let i = 0; i < 12; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), fortMat);
      const angle = (i / 12) * Math.PI * 2;
      box.position.set(Math.cos(angle) * 45, 1.5 + Math.sin(angle * 2), Math.sin(angle) * 45);
      box.castShadow = true;
      box.receiveShadow = true;
      scene.add(box);
    }

    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37 }));
    flagPole.position.set(0, 6, 0);
    flagPole.castShadow = true;
    scene.add(flagPole);

    const flagGeo = new THREE.PlaneGeometry(3, 1.5, 10, 1);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, side: THREE.DoubleSide, roughness: 0.8 });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(1.6, 11, 0);
    flag.castShadow = true;
    scene.add(flag);
    SERVICES.scene.userData.flag = flag;
  }

  function initHUD() {
    const hud = document.createElement('div');
    hud.id = 'gameHud';
    hud.style.cssText = `
      position:fixed;inset:0;pointer-events:none;font-family:'Segoe UI',system-ui,sans-serif;z-index:10;
    `;

    const topBar = document.createElement('div');
    topBar.style.cssText = `position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:6px;pointer-events:auto;`;

    const healthRow = document.createElement('div');
    healthRow.innerHTML = `
      <label style="font-size:0.75rem;color:#e0e0e0;margin-bottom:2px;display:block;">Health</label>
      <div style="width:260px;height:14px;background:#222;border:2px solid #444;border-radius:7px;overflow:hidden;">
        <div id="healthFill" style="width:100%;height:100%;background:linear-gradient(90deg,#e74c3c,#c0392b);transition:width 0.15s;"></div>
      </div>
    `;

    const musouRow = document.createElement('div');
    musouRow.innerHTML = `
      <label style="font-size:0.75rem;color:#e0e0e0;margin-bottom:2px;display:block;margin-top:4px;">Musou Gauge</label>
      <div style="width:260px;height:10px;background:#222;border:2px solid #554422;border-radius:5px;overflow:hidden;">
        <div id="musouFill" style="width:0%;height:100%;background:linear-gradient(90deg,#f39c12,#e67e22);transition:width 0.1s;"></div>
      </div>
    `;

    const comboBox = document.createElement('div');
    comboBox.style.cssText = `margin-top:8px;`;
    comboBox.innerHTML = `
      <div id="comboCounter" style="font-size:2rem;font-weight:900;color:#f1c40f;text-shadow:2px 2px 0 #000;display:none;">0 HITS</div>
    `;

    topBar.appendChild(healthRow);
    topBar.appendChild(musouRow);
    topBar.appendChild(comboBox);

    const rightBar = document.createElement('div');
    rightBar.style.cssText = `position:absolute;top:12px;right:12px;text-align:right;pointer-events:auto;`;
    rightBar.innerHTML = `
      <div style="font-size:0.8rem;color:#aaa;background:rgba(0,0,0,0.5);padding:6px 10px;border-radius:6px;">
        <strong style="color:#fff;font-size:1rem;">WARLORDS: THREE KINGDOMS</strong><br>
        <span style="font-size:0.65rem;">WASD Move | LMB Attack | RMB Dash | SPACE Jump | Q Musou | E Guard</span>
      </div>
      <div id="koCounter" style="font-size:1.2rem;font-weight:800;color:#fff;margin-top:8px;text-shadow:1px 1px 0 #000;">0 KOs</div>
    `;

    const minimap = document.createElement('div');
    minimap.style.cssText = `position:absolute;bottom:12px;right:12px;width:140px;height:140px;background:rgba(0,0,0,0.6);border:2px solid #555;border-radius:8px;overflow:hidden;`;
    const canvas2d = document.createElement('canvas');
    canvas2d.width = 140; canvas2d.height = 140;
    minimap.appendChild(canvas2d);

    const msgBox = document.createElement('div');
    msgBox.id = 'gameMsg';
    msgBox.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.5rem;font-weight:900;color:#fff;text-shadow:3px 3px 0 #000;opacity:0;transition:opacity 0.3s;pointer-events:none;`;

    const startScreen = document.createElement('div');
    startScreen.id = 'startScreen';
    startScreen.style.cssText = `position:absolute;inset:0;background:rgba(10,10,20,0.85);display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:auto;z-index:100;`;
    startScreen.innerHTML = `
      <h1 style="font-size:3rem;font-weight:900;color:#f39c12;text-shadow:0 0 20px rgba(243,156,18,0.5);margin:0 0 10px;">WARLORDS<br>THREE KINGDOMS</h1>
      <p style="color:#ccc;font-size:0.9rem;max-width:400px;text-align:center;margin:0 0 24px;">A 3D Musou Action Game. Battle hundreds of enemies, capture the fort, and become legendary.</p>
      <button id="startBtn" style="pointer-events:auto;padding:14px 48px;font-size:1.1rem;font-weight:700;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;border-radius:8px;cursor:pointer;box-shadow:0 4px 15px rgba(231,76,60,0.4);">START BATTLE</button>
      <p style="color:#666;font-size:0.7rem;margin-top:16px;">Requires WebGL2</p>
    `;

    hud.appendChild(topBar);
    hud.appendChild(rightBar);
    hud.appendChild(minimap);
    hud.appendChild(msgBox);
    hud.appendChild(startScreen);
    document.body.appendChild(hud);

    SERVICES.hud = {
      healthFill: document.getElementById('healthFill'),
      musouFill: document.getElementById('musouFill'),
      comboCounter: document.getElementById('comboCounter'),
      koCounter: document.getElementById('koCounter'),
      msgBox: msgBox,
      startScreen: startScreen,
      minimapCtx: canvas2d.getContext('2d'),
      minimapCanvas: canvas2d,
      update: function (data) {
        if (data.health !== undefined) this.healthFill.style.width = Math.max(0, data.health) + '%';
        if (data.musou !== undefined) this.musouFill.style.width = data.musou + '%';
        if (data.combo !== undefined) {
          if (data.combo > 2) {
            this.comboCounter.textContent = data.combo + ' HITS';
            this.comboCounter.style.display = 'block';
            this.comboCounter.style.color = data.combo > 50 ? '#e74c3c' : data.combo > 20 ? '#f39c12' : '#f1c40f';
          } else {
            this.comboCounter.style.display = 'none';
          }
        }
        if (data.kos !== undefined) this.koCounter.textContent = data.kos + ' KOs';
        if (data.msg) {
          this.msgBox.textContent = data.msg;
          this.msgBox.style.opacity = '1';
          clearTimeout(this._msgTimer);
          this._msgTimer = setTimeout(() => { this.msgBox.style.opacity = '0'; }, 2000);
        }
      },
      drawMinimap: function (playerPos, enemies, playerHeading) {
        const ctx = this.minimapCtx;
        ctx.clearRect(0, 0, 140, 140);
        ctx.fillStyle = '#1a2a1a';
        ctx.fillRect(0, 0, 140, 140);
        ctx.strokeStyle = '#334433';
        ctx.lineWidth = 2;
        ctx.strokeRect(70, 70, 40, 40);
        const scale = 140 / 200;
        const toMinimap = (x, z) => ({
          px: 70 + x * scale,
          py: 70 + z * scale
        });

        enemies.forEach(e => {
          const p = toMinimap(e.x, e.z);
          ctx.fillStyle = '#e74c3c';
          ctx.beginPath();
          ctx.arc(p.px, p.py, 2, 0, Math.PI * 2);
          ctx.fill();
        });

        const pp = toMinimap(playerPos.x, playerPos.z);
        ctx.save();
        ctx.translate(pp.px, pp.py);
        ctx.rotate(playerHeading);
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    };

    document.getElementById('startBtn').addEventListener('click', function () {
      SERVICES.hud.startScreen.style.display = 'none';
      if (SERVICES.audio) SERVICES.audio.init().then(() => {
        SERVICES.engine.startGame();
        SERVICES.hud.update({ msg: 'BATTLE BEGINS!' });
      }).catch(() => {
        SERVICES.engine.startGame();
        SERVICES.hud.update({ msg: 'BATTLE BEGINS!' });
      });
    });
  }

  function initAudio() {
    let ctx = null;
    let masterGain = null;

    function ensureCtx() {
      if (ctx) return ctx;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);
      return ctx;
    }

    function playHit(intensity) {
      const c = ensureCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      osc.type = 'square';
      osc.frequency.setValueAtTime(200 - intensity * 50, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.12);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 0.15);
    }

    function playKO() {
      const c = ensureCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.2);
      gain.gain.setValueAtTime(0.25, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.25);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 0.3);
    }

    function playMusou() {
      const c = ensureCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.4);
      gain.gain.setValueAtTime(0.4, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.5);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 0.55);
    }

    SERVICES.audio = {
      init: function () {
        return ensureCtx().resume();
      },
      playHit,
      playKO,
      playMusou,
      setVolume: function (v) {
        if (masterGain) masterGain.gain.value = v;
      }
    };
  }

  function initInput() {
    const keys = {};
    let mouseDown = false;
    let rightMouseDown = false;
    let mousePos = { x: 0, y: 0 };

    document.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    });
    document.addEventListener('keyup', function (e) { keys[e.code] = false; });

    document.getElementById('gameCanvas').addEventListener('mousedown', function (e) {
      if (e.button === 0) mouseDown = true;
      if (e.button === 2) rightMouseDown = true;
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) mouseDown = false;
      if (e.button === 2) rightMouseDown = false;
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('mousemove', function (e) {
      mousePos.x = e.clientX;
      mousePos.y = e.clientY;
    });

    document.addEventListener('touchstart', function (e) {
      e.preventDefault();
      const t = e.touches[0];
      keys['KeyW'] = t.clientY < window.innerHeight * 0.5;
      keys['KeyA'] = t.clientX < window.innerWidth * 0.33;
      keys['KeyD'] = t.clientX > window.innerWidth * 0.66;
      mouseDown = true;
    });
    document.addEventListener('touchend', function (e) {
      e.preventDefault();
      keys['KeyW'] = keys['KeyA'] = keys['KeyD'] = false;
      mouseDown = false;
    });

    SERVICES.input = {
      isDown: function (code) { return !!keys[code]; },
      getMouse: function () { return mousePos; },
      isMouseDown: function () { return mouseDown; },
      isRightMouseDown: function () { return rightMouseDown; },
      consumeMouse: function () {
        mouseDown = false;
      },
      consumeRightMouse: function () {
        rightMouseDown = false;
      }
    };
  }

  function GameEngine(renderer, scene, camera, bounds) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.bounds = bounds;

    this.state = {
      health: 100,
      maxHealth: 100,
      musou: 0,
      combo: 0,
      kos: 0,
      lastAttackTime: 0,
      attackChain: 0,
      attackCooldown: 0,
      isAttacking: false,
      isDashing: false,
      isGuarding: false,
      dashTimer: 0,
      guardTimer: 0,
      invulnTimer: 0,
      gameOver: false,
      victory: false,
      playerHeading: 0,
      enemies: [],
      enemyIndex: 0,
      spawnTimer: 0,
      time: 0
    };

    this.player = this.createHero();
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.running = false;
    this.acc = 0;
    const FIXED_DT = 1 / 60;

    const playerGroup = new THREE.Group();
    playerGroup.add(this.player.group);
    scene.add(playerGroup);

    const groundMesh = scene.children.find(c => c.geometry && c.geometry.type === 'PlaneGeometry');
    this.groundY = 0;

    this.lastFrameTime = performance.now();
  }

  GameEngine.prototype.createHero = function () {
    const group = new THREE.Group();

    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x2c5aa0, roughness: 0.6, metalness: 0.2 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a3a6a, roughness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf5d5b8, roughness: 0.5 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.3, metalness: 0.8, emissive: 0x222244, emissiveIntensity: 0.2 });
    const hiltMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.5), torsoMat);
    torso.position.y = 1.4;
    torso.castShadow = true;
    group.add(torso);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.35), legMat);
    legL.position.set(-0.22, 0.45, 0);
    legL.castShadow = true;
    group.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.35), legMat);
    legR.position.set(0.22, 0.45, 0);
    legR.castShadow = true;
    group.add(legR);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat);
    head.position.y = 2.15;
    head.castShadow = true;
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.3 }));
    helmet.position.y = 2.45;
    helmet.castShadow = true;
    group.add(helmet);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), torsoMat);
    armL.position.set(-0.55, 1.4, 0);
    armL.castShadow = true;
    group.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), torsoMat);
    armR.position.set(0.55, 1.4, 0);
    armR.castShadow = true;
    group.add(armR);

    const swordGroup = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.04), bladeMat);
    blade.position.y = 0.9;
    swordGroup.add(blade);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.15), hiltMat);
    swordGroup.add(hilt);
    swordGroup.position.set(0.7, 1.6, 0.2);
    swordGroup.rotation.z = -0.2;
    group.add(swordGroup);

    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.4, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xcc2222, side: THREE.DoubleSide, roughness: 0.8 })
    );
    cape.position.set(0, 1.2, -0.3);
    cape.rotation.x = 0.15;
    group.add(cape);

    this.playerSword = swordGroup;
    this.playerCape = cape;
    this.playerLegL = legL;
    this.playerLegR = legR;
    this.playerArmL = armL;
    this.playerArmR = armR;

    const speed = 8;
    const attackDamage = 12;
    const attackRange = 2.5;

    return {
      group,
      speed,
      attackDamage,
      attackRange,
      position: new THREE.Vector3(0, 0, -10),
      health: 100
    };
  };

  GameEngine.prototype.createSoldier = function (tier, position) {
    const group = new THREE.Group();
    const tierColors = {
      grunt: 0x6b4226,
      archer: 0x4a7042,
      spearman: 0x8b6f47,
      shield: 0x5a5a5a,
      elite: 0x2c2c5a,
      officer: 0x8b0000
    };

    const bodyMat = new THREE.MeshStandardMaterial({ color: tierColors[tier] || 0x6b4226, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.45), bodyMat);
    torso.position.y = 1.3;
    torso.castShadow = true;
    group.add(torso);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.3), bodyMat);
    legL.position.set(-0.18, 0.4, 0);
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.3), bodyMat);
    legR.position.set(0.18, 0.4, 0);
    group.add(legR);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0xf0d0a0 }));
    head.position.y = 1.95;
    group.add(head);

    let weaponMesh = null;
    if (tier === 'spearman') {
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
      spear.position.set(0.5, 1.5, 0.3);
      group.add(spear);
      weaponMesh = spear;
    } else if (tier === 'archer') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x654321 }));
      bow.position.set(0.5, 1.5, 0.3);
      bow.rotation.z = Math.PI / 2;
      group.add(bow);
      weaponMesh = bow;
    } else if (tier === 'shield') {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }));
      shield.position.set(-0.5, 1.3, 0.3);
      group.add(shield);
    } else {
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.05), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.7 }));
      sword.position.set(0.5, 1.5, 0.3);
      group.add(sword);
      weaponMesh = sword;
    }

    if (tier === 'elite' || tier === 'officer') {
      const helmet = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6 }));
      helmet.position.y = 2.3;
      group.add(helmet);
    }

    const stats = {
      grunt: { speed: 2.5, health: 30, damage: 4, attackCooldown: 1.5, range: 1.8 },
      archer: { speed: 2, health: 25, damage: 8, attackCooldown: 2.5, range: 12, ranged: true },
      spearman: { speed: 3, health: 40, damage: 6, attackCooldown: 1.8, range: 2.8 },
      shield: { speed: 1.8, health: 80, damage: 3, attackCooldown: 2.0, range: 1.5, shielded: true },
      elite: { speed: 3.5, health: 60, damage: 10, attackCooldown: 1.2, range: 2.5 },
      officer: { speed: 4, health: 150, damage: 15, attackCooldown: 1.5, range: 3, boss: true }
    };

    const s = stats[tier] || stats.grunt;
    const soldier = {
      group,
      tier,
      position: position.clone(),
      health: s.health,
      maxHealth: s.health,
      speed: s.speed,
      damage: s.damage,
      attackCooldown: s.attackCooldown,
      range: s.range,
      ranged: s.ranged || false,
      shielded: s.shielded || false,
      boss: s.boss || false,
      attackTimer: Math.random() * 2,
      target: null,
      state: 'idle',
      hitFlash: 0,
      weaponMesh
    };

    group.position.copy(soldier.position);
    this.scene.add(group);
    return soldier;
  };

  GameEngine.prototype.spawnWave = function (count) {
    const tiers = ['grunt', 'grunt', 'grunt', 'grunt', 'archer', 'spearman', 'shield', 'elite'];
    for (let i = 0; i < count; i++) {
      const tier = tiers[Math.floor(Math.random() * tiers.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 25;
      const pos = new THREE.Vector3(
        this.state.player.x * 0 + Math.cos(angle) * dist,
        0,
        Math.sin(angle) * dist
      );
      pos.x = this.state.player.position.x + Math.cos(angle) * dist;
      pos.z = this.state.player.position.z + Math.sin(angle) * dist;

      const x = this.state.player.position.x + Math.cos(angle) * dist;
      const z = this.state.player.position.z + Math.sin(angle) * dist;
      const soldier = this.createSoldier(tier, new THREE.Vector3(x, 0, z));
      this.enemies.push(soldier);
    }
  };

  GameEngine.prototype.startGame = function () {
    this.state.gameOver = false;
    this.state.victory = false;
    this.state.health = 100;
    this.state.musou = 0;
    this.state.combo = 0;
    this.state.kos = 0;
    this.state.enemies = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];

    this.player.position.set(0, 0, -10);
    this.player.group.position.copy(this.player.position);
    this.state.playerHeading = Math.PI;

    this.spawnWave(20);
    this.state.spawnTimer = 0;

    this.running = true;
    this.acc = 0;
    this.lastFrameTime = performance.now();

    if (!this._rafId) this._loop();
  };

  GameEngine.prototype._loop = function () {
    const self = this;
    this._rafId = requestAnimationFrame(function () { self._loop(); });

    const now = performance.now();
    const rawDt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    if (!this.running) return;

    this.acc += rawDt;
    const FIXED_DT = 1 / 60;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 4) {
      this.fixedUpdate(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    this.renderFrame();
  };

  GameEngine.prototype.fixedUpdate = function (dt) {
    this.state.time += dt;

    if (this.state.gameOver) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.updateSpawning(dt);

    if (this.enemies.length === 0 && this.state.kos > 0) {
      this.state.victory = true;
      this.state.gameOver = true;
      if (SERVICES.hud) SERVICES.hud.update({ msg: 'VICTORY!' });
      setTimeout(function () {
        SERVICES.hud.update({ msg: 'Press SPACE to restart' });
      }, 2000);
    }

    if (this.state.health <= 0 && !this.state.gameOver) {
      this.state.gameOver = true;
      this.state.victory = false;
      if (SERVICES.hud) SERVICES.hud.update({ msg: 'DEFEATED' });
    }

    if (this.state.gameOver && SERVICES.input.isDown('Space') && !this._restartCooldown) {
      this._restartCooldown = 1;
      setTimeout(function () { self._restartCooldown = 0; }, 1000);
      this.startGame();
    }

    if (SERVICES.hud) {
      SERVICES.hud.update({
        health: this.state.health,
        musou: this.state.musou,
        combo: this.state.combo,
        kos: this.state.kos
      });
      const enemyData = this.enemies.map(function (e) {
        return { x: e.position.x, z: e.position.z };
      });
      SERVICES.hud.drawMinimap(this.player.position, enemyData, this.state.playerHeading);
    }

    this.renderer.render(this.scene, this.camera);
  };

  GameEngine.prototype.updatePlayer = function (dt) {
    const p = this.player;
    const state = this.state;
    const input = SERVICES.input;

    if (state.attackCooldown > 0) state.attackCooldown -= dt;
    if (state.invulnTimer > 0) state.invulnTimer -= dt;
    if (state.dashTimer > 0) state.dashTimer -= dt;
    if (state.guardTimer > 0) state.guardTimer -= dt;

    const moveX = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const moveZ = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    let moveMag = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMag > 0) moveMag = 1;

    if (input.isRightMouseDown() && state.dashTimer <= 0 && state.attackCooldown <= 0) {
      state.isDashing = true;
      state.dashTimer = 0.3;
      state.musou = Math.min(100, state.musou + 5);
      input.consumeRightMouse();
    } else {
      state.isDashing = false;
    }

    if (input.isDown('KeyE')) {
      state.isGuarding = true;
      if (moveMag > 0) {
        p.position.x += moveX * p.speed * 0.3 * dt;
        p.position.z += moveZ * p.speed * 0.3 * dt;
      }
      p.group.position.copy(p.position);
      p.group.rotation.y = state.playerHeading;
