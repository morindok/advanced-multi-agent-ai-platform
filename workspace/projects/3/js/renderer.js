(function () {
  "use strict";

  var canvas, ctx;
  var camera = { x: 0, y: 0, zoom: 1 };
  var lastTime = 0;
  var totalLevelIndex = 0;
  var totalLevelCount = 0;
  var globalScore = 0;
  var globalLives = 3;
  var levelStartTime = 0;
  var levelClearTime = 0;
  var gamePhase = "menu";

  var keys = {};
  var mouseX = 0, mouseY = 0, mouseDown = false;
  var leftTouch = null, rightTouch = null, jumpTouch = null, crouchTouch = null;
  var touchActive = false;

  var player = null;
  var enemies = [];
  var mushrooms = [];
  var clouds = [];
  var platforms = [];
  var currentLevelData = null;
  var currentLevelIndex = 0;

  var TILE = 32;
  var GRAVITY = 0.65;
  var JUMP = -12.2;
  var JUMP_TALL = -13.4;
  var PLAYER_SPEED = 3.8;
  var PLAYER_SPEED_TALL = 3.2;
  var ENEMY_SPEED = 1.3;
  var MAX_FALL = 14;
  var CAMERA_SPEED = 4.2;
  var PARTICLES = [];

  var levelDefs = null;
  var flagpole = null;
  var levelTransitionTimer = 0;

  function initRenderer() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");

    window.addEventListener("keydown", function (e) {
      var k = e.key.toLowerCase();
      keys[k] = true;
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].indexOf(k) !== -1) e.preventDefault();
      if (k === "escape" && gamePhase === "playing") {
        gamePhase = "paused";
        var po = document.getElementById("pauseOverlay");
        if (po) po.style.display = "flex";
      } else if (k === "escape" && gamePhase === "paused") {
        gamePhase = "playing";
        lastTime = performance.now();
        var po2 = document.getElementById("pauseOverlay");
        if (po2) po2.style.display = "none";
      }
    });
    window.addEventListener("keyup", function (e) {
      keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener("mousedown", function (e) {
      mouseDown = true;
      var rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / rect.width * canvas.width;
      mouseY = (e.clientY - rect.top) / rect.height * canvas.height;
    });
    canvas.addEventListener("mousemove", function (e) {
      var rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / rect.width * canvas.width;
      mouseY = (e.clientY - rect.top) / rect.height * canvas.height;
    });
    canvas.addEventListener("mouseup", function () { mouseDown = false; });
    canvas.addEventListener("touchstart", function (e) {
      e.preventDefault();
      touchActive = true;
      var rect = canvas.getBoundingClientRect();
      for (var i = 0; i < e.touches.length; i++) {
        var t = e.touches[i];
        var x = (t.clientX - rect.left) / rect.width * canvas.width;
        var y = (t.clientY - rect.top) / rect.height * canvas.height;
        if (x < canvas.width * 0.33) leftTouch = t.identifier;
        else if (x > canvas.width * 0.66) rightTouch = t.identifier;
        else { jumpTouch = t.identifier; mouseDown = true; }
      }
      if (e.touches.length >= 2) crouchTouch = e.touches[1].identifier;
    }, { passive: false });
    canvas.addEventListener("touchmove", function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      for (var i = 0; i < e.touches.length; i++) {
        var t = e.touches[i];
        var x = (t.clientX - rect.left) / rect.width * canvas.width;
        var y = (t.clientY - rect.top) / rect.height * canvas.height;
        mouseX = x; mouseY = y;
        if (t.identifier === leftTouch && x >= canvas.width * 0.33) leftTouch = null;
        if (t.identifier === rightTouch && x <= canvas.width * 0.66) rightTouch = null;
        if (t.identifier === jumpTouch && (x < canvas.width * 0.33 || x > canvas.width * 0.66)) jumpTouch = null;
      }
    }, { passive: false });
    canvas.addEventListener("touchend", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var id = e.changedTouches[i].identifier;
        if (id === leftTouch) leftTouch = null;
        if (id === rightTouch) rightTouch = null;
        if (id === jumpTouch) { jumpTouch = null; mouseDown = false; }
        if (id === crouchTouch) crouchTouch = null;
      }
      if (e.touches.length === 0) {
        touchActive = false;
        mouseDown = false;
        leftTouch = null;
        rightTouch = null;
        jumpTouch = null;
        crouchTouch = null;
      } else if (e.touches.length === 1) {
        crouchTouch = null;
      }
    }, { passive: false });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    var startBtn = document.getElementById("startBtn");
    if (startBtn) startBtn.addEventListener("click", startGame);
    var restartBtn = document.getElementById("restartBtn");
    if (restartBtn) restartBtn.addEventListener("click", startGame);
    var continueBtn = document.getElementById("continueBtn");
    if (continueBtn) continueBtn.addEventListener("click", continueLevel);
    var pauseBtn = document.getElementById("pauseBtn");
    if (pauseBtn) pauseBtn.addEventListener("click", function () {
      if (gamePhase === "playing") {
        gamePhase = "paused";
        var po = document.getElementById("pauseOverlay");
        if (po) po.style.display = "flex";
      }
    });
    var pauseResumeBtn = document.getElementById("pauseResumeBtn");
    if (pauseResumeBtn) pauseResumeBtn.addEventListener("click", function () {
      gamePhase = "playing";
      lastTime = performance.now();
      var po = document.getElementById("pauseOverlay");
      if (po) po.style.display = "none";
    });

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    levelDefs = (typeof getLevelDefs === "function") ? getLevelDefs() : null;
    if (levelDefs) totalLevelCount = levelDefs.length;

    requestAnimationFrame(gameFrame);
  }

  function resizeCanvas() {
    var wrap = document.getElementById("canvasWrap");
    var maxW = Math.min(window.innerWidth, 1024);
    var maxH = Math.min(window.innerHeight - 80, 512);
    var w = maxW;
    var h = Math.max(320, Math.min(maxH, maxW * 0.5));
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    if (wrap) { wrap.style.maxWidth = w + "px"; }
  }

  function startGame() {
    globalScore = 0;
    globalLives = 3;
    totalLevelIndex = 0;
    loadLevel(0);
    gamePhase = "playing";
    lastTime = performance.now();
    var hud = document.getElementById("hud");
    var menu = document.getElementById("menuOverlay");
    var go = document.getElementById("gameOverOverlay");
    var vic = document.getElementById("victoryOverlay");
    var pau = document.getElementById("pauseOverlay");
    var lc = document.getElementById("levelClearOverlay");
    if (hud) hud.style.display = "flex";
    if (menu) menu.style.display = "none";
    if (go) go.style.display = "none";
    if (vic) vic.style.display = "none";
    if (pau) pau.style.display = "none";
    if (lc) lc.style.display = "none";
    PARTICLES = [];
    updateHUD();
  }

  function continueLevel() {
    var go = document.getElementById("gameOverOverlay");
    var vic = document.getElementById("victoryOverlay");
    var pau = document.getElementById("pauseOverlay");
    var lc = document.getElementById("levelClearOverlay");
    if (go) go.style.display = "none";
    if (vic) vic.style.display = "none";
    if (pau) pau.style.display = "none";
    if (lc) lc.style.display = "none";
    gamePhase = "playing";
    lastTime = performance.now();
  }

  function loadLevel(index) {
    currentLevelIndex = index;
    totalLevelIndex = index;
    var defs = levelDefs || [];
    var def = defs[index] || null;
    if (!def) {
      currentLevelData = generateDefaultLevel(index);
    } else {
      currentLevelData = parseLevelDef(def);
    }
    if (!currentLevelData) {
      currentLevelData = generateDefaultLevel(index);
    }

    var levelH = currentLevelData.height;
    player = {
      x: 80,
      y: levelH - TILE * 4,
      w: 26,
      h: 44,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      animFrame: 0,
      animTimer: 0,
      alive: true,
      deathTimer: 0,
      tall: false,
      invuln: 0,
      spawnX: 80,
      spawnY: levelH - TILE * 4
    };

    enemies = [];
    mushrooms = [];
    platforms = [];
    clouds = [];
    PARTICLES = [];

    for (var i = 0; i < currentLevelData.platforms.length; i++) {
      platforms.push(currentLevelData.platforms[i]);
    }

    for (var e = 0; e < currentLevelData.enemies.length; e++) {
      var ed = currentLevelData.enemies[e];
      enemies.push({
        x: ed.x,
        y: ed.y,
        w: ed.w || 30,
        h: ed.h || 30,
        vx: -(ENEMY_SPEED + (ed.speedBonus || 0)),
        vy: 0,
        type: ed.type || "slime",
        alive: true,
        animTimer: 0,
        dir: -1,
        dead: false,
        deadTimer: 0
      });
    }

    for (var m = 0; m < currentLevelData.mushrooms.length; m++) {
      var md = currentLevelData.mushrooms[m];
      mushrooms.push({
        x: md.x,
        y: md.y,
        w: 26,
        h: 30,
        type: md.type || "normal",
        collected: false,
        animTimer: Math.random() * Math.PI * 2
      });
    }

    for (var c = 0; c < 12; c++) {
      clouds.push({
        x: Math.random() * currentLevelData.width,
        y: 20 + Math.random() * 80,
        w: 60 + Math.random() * 70,
        h: 20 + Math.random() * 20,
        speed: 0.2 + Math.random() * 0.4,
        opacity: 0.5 + Math.random() * 0.3
      });
    }

    flagpole = null;
    if (currentLevelData.goal && currentLevelData.goal.length > 0) {
      flagpole = {
        x: currentLevelData.goal[0].x + 18,
        y: currentLevelData.goal[0].y - 80,
        w: 8,
        h: 80
      };
    }

    camera.x = 0;
    camera.y = 0;
    levelStartTime = performance.now();
    levelClearTime = 0;
    updateHUD();
  }

  function parseLevelDef(def) {
    if (def && def.platforms && def.enemies && def.mushrooms && def.width && def.height) {
      return def;
    }
    return null;
  }

  function generateDefaultLevel(index) {
    var width = 2400 + index * 600;
    var height = 480;
    var groundY = height - TILE;
    var platforms = [];
    var enemies = [];
    var mushrooms = [];
    var flagX = width - 100;
    var goal = [{ x: flagX, y: groundY - 40, w: 40, h: 40, type: "goal" }];

    platforms.push({ x: 0, y: groundY, w: width, h: TILE, type: "ground" });

    for (var i = 0; i < 6 + index * 2; i++) {
      var seed = i * 137 + index * 997;
      var px = 300 + i * (250 + (seed % 100));
      var py = groundY - (60 + (seed % 80));
      var pw = 80 + (seed % 60);
      if (px + pw < flagX - 50) {
        platforms.push({ x: px, y: py, w: pw, h: 22, type: "platform" });
        if (i % 2 === 0) {
          mushrooms.push({ x: px + pw / 2, y: py - 34, type: "normal" });
        }
      }
    }

    var gapCount = 2 + index;
    for (var g = 0; g < gapCount; g++) {
      var gapStart = 600 + g * 400;
      var gapEnd = gapStart + 80;
      if (gapStart > 200 && gapEnd < flagX - 200) {
        platforms.push({ x: gapEnd, y: groundY, w: Math.max(0, flagX - 200 - gapEnd), h: TILE, type: "ground" });
      }
    }

    var enemyCount = 4 + index * 2;
    for (var e = 0; e < enemyCount; e++) {
      var ex = 400 + e * 220;
      if (ex < flagX - 100) {
        var etype = e % 3 === 0 ? "goomba" : "slime";
        var eh = etype === "goomba" ? 30 : 26;
        enemies.push({
          x: ex,
          y: groundY - eh,
          w: 30,
          h: eh,
          type: etype,
          speedBonus: index * 0.12
        });
      }
    }

    if (index > 0) {
      for (var extra = 0; extra < index; extra++) {
        var mx = 500 + extra * 300;
        if (mx < flagX - 100) {
          mushrooms.push({ x: mx, y: groundY - 34, type: "fire" });
        }
      }
    }

    return {
      width: width,
      height: height,
      platforms: platforms,
      enemies: enemies,
      mushrooms: mushrooms,
      goal: goal
    };
  }

  function updateHUD() {
    var scoreEl = document.getElementById("score");
    var livesEl = document.getElementById("lives");
    var levelEl = document.getElementById("level");
    if (scoreEl) scoreEl.textContent = globalScore.toString();
    if (livesEl) livesEl.textContent = globalLives.toString();
    if (levelEl) levelEl.textContent = (currentLevelIndex + 1) + " / " + totalLevelCount;
  }

  function gameFrame(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = timestamp - lastTime;
    lastTime = timestamp;

    if (gamePhase === "playing") {
      updateGame(dt / 16.67);
    }

    render();
    requestAnimationFrame(gameFrame);
  }

  function updateGame(dtScale) {
    if (!player || !currentLevelData) return;

    if (player.alive) {
      updatePlayer(dtScale);
    } else {
      player.deathTimer += dtScale;
      if (player.deathTimer > 60) {
        globalLives--;
        if (globalLives <= 0) {
          gamePhase = "gameover";
          var go = document.getElementById("gameOverOverlay");
          if (go) go.style.display = "flex";
          updateHUD();
        } else {
          player.x = player.spawnX;
          player.y = player.spawnY;
          player.vx = 0;
          player.vy = 0;
          player.alive = true;
          player.deathTimer = 0;
          player.invuln = 120;
        }
      }
    }

    updateEnemies(dtScale);
    updateMushrooms(dtScale);
    updateParticles(dtScale);
    updateCamera();
    checkCollisions();

    if (flagpole && player.alive) {
      if (player.x + player.w > flagpole.x && player.x < flagpole.x + 30) {
        levelClearTime += dtScale;
        if (levelClearTime > 30) {
          gamePhase = "levelClear";
          var lc = document.getElementById("levelClearOverlay");
          if (lc) lc.style.display = "flex";
          var nextBtn = document.getElementById("nextLevelBtn");
          if (nextBtn) nextBtn.onclick = function () {
            totalLevelIndex++;
            if (totalLevelIndex >= totalLevelCount) {
              gamePhase = "victory";
              var vic = document.getElementById("victoryOverlay");
              if (vic) vic.style.display = "flex";
            } else {
              loadLevel(totalLevelIndex);
              gamePhase = "playing";
              lastTime = performance.now();
              var lcEl = document.getElementById("levelClearOverlay");
              if (lcEl) lcEl.style.display = "none";
            }
            updateHUD();
          };
        }
      }
    }
  }

  function updatePlayer(dtScale) {
    var moveSpeed = player.tall ? PLAYER_SPEED_TALL : PLAYER_SPEED;
    var jumpForce = player.tall ? JUMP_TALL : JUMP;

    var moveDir = 0;
    if (keys["arrowleft"] || keys["a"] || (leftTouch !== null)) moveDir -= 1;
    if (keys["arrowright"] || keys["d"] || (rightTouch !== null)) moveDir += 1;

    player.vx = moveDir * moveSpeed;
    if (moveDir !== 0) player.facing = moveDir;

    if (player.invuln > 0) player.invuln -= dtScale;

    var jumpPressed = keys["arrowup"] || keys["w"] || keys[" "] || (jumpTouch !== null) || mouseDown;
    if (jumpPressed && player.onGround) {
      player.vy = jumpForce;
      player.onGround = false;
    }

    player.vy += GRAVITY * dtScale;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;

    player.x += player.vx * dtScale;
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > currentLevelData.width) player.x = currentLevelData.width - player.w;

    player.y += player.vy * dtScale;
    player.onGround = false;

    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (player.x + player.w > p.x && player.x < p.x + p.w) {
        if (player.vy >= 0 && player.y + player.h >= p.y && player.y + player.h - player.vy * dtScale <= p.y + 5) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }
      }
    }

    if (player.y > currentLevelData.height) {
      player.alive = false;
      player.deathTimer = 0;
      player.y = currentLevelData.height;
    }

    player.animTimer += dtScale;
    if (player.animTimer > 10) {
      player.animFrame = (player.animFrame + 1) % 4;
      player.animTimer = 0;
    }
  }

  function updateEnemies(dtScale) {
    for (var i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      if (!en.alive) {
        en.deadTimer += dtScale;
        continue;
      }

      en.vx = en.dir * ENEMY_SPEED;
      en.x += en.vx * dtScale;

      if (en.x <= 0) { en.dir = 1; en.x = 0; }
      if (en.x + en.w >= currentLevelData.width) { en.dir = -1; en.x = currentLevelData.width - en.w; }

      en.vy += GRAVITY * dtScale;
      if (en.vy > MAX_FALL) en.vy = MAX_FALL;
      en.y += en.vy * dtScale;

      for (var p = 0; p < platforms.length; p++) {
        var plat = platforms[p];
        if (en.x + en.w > plat.x && en.x < plat.x + plat.w) {
          if (en.vy >= 0 && en.y + en.h >= plat.y && en.y + en.h - en.vy * dtScale <= plat.y + 5) {
            en.y = plat.y - en.h;
            en.vy = 0;
          }
        }
      }

      if (en.y > currentLevelData.height) {
        en.alive = false;
        en.dead = true;
      }

      en.animTimer += dtScale;
      if (en.animTimer > 15) {
        en.animTimer = 0;
      }
    }
  }

  function updateMushrooms(dtScale) {
    for (var i = 0; i < mushrooms.length; i++) {
      var mu = mushrooms[i];
      if (!mu.collected) {
        mu.animTimer += 0.05 * dtScale;
      }
    }
  }

  function updateParticles(dtScale) {
    for (var i = PARTICLES.length - 1; i >= 0; i--) {
      var pt = PARTICLES[i];
      pt.x += pt.vx * dtScale;
      pt.y += pt.vy * dtScale;
      pt.vy += 0.2 * dtScale;
      pt.life -= dtScale;
      if (pt.life <= 0) {
        PARTICLES.splice(i, 1);
      }
    }
  }

  function updateCamera() {
    var targetX = player.x + player.w / 2 - canvas.width / 2;
    if (targetX < 0) targetX = 0;
    var maxCamX = currentLevelData.width - canvas.width;
    if (targetX > maxCamX) targetX = maxCamX;
    camera.x += (targetX - camera.x) * 0.1 * (dtScale || 1);

    var targetY = player.y + player.h / 2 - canvas.height / 2;
    if (targetY < 0) targetY = 0;
    var maxCamY = currentLevelData.height - canvas.height;
    if (targetY > maxCamY) targetY = maxCamY;
    camera.y += (targetY - camera.y) * 0.1 * (dtScale || 1);
  }

  function checkCollisions() {
    if (!player.alive) return;

    for (var i = 0; i < mushrooms.length; i++) {
      var mu = mushrooms[i];
      if (!mu.collected) {
        if (player.x < mu.x + mu.w && player.x + player.w > mu.x &&
            player.y < mu.y + mu.h && player.y + player.h > mu.y) {
          mu.collected = true;
          globalScore += (mu.type === "fire") ? 500 : 200;
          if (mu.type === "fire" && !player.tall) {
            player.tall = true;
            player.h = 52;
          }
          for (var p = 0; p < 8; p++) {
            PARTICLES.push({
              x: mu.x + mu.w / 2,
              y: mu.y + mu.h / 2,
              vx: (Math.random() - 0.5) * 4,
              vy: -Math.random() * 3,
              life: 20 + Math.random() * 10,
              color: mu.type === "fire" ? "#ff4444" : "#44ff44",
              size: 3 + Math.random() * 3
            });
          }
          updateHUD();
        }
      }
    }

    for (var e = 0; e < enemies.length; e++) {
      var en = enemies[e];
      if (!en.alive || en.dead) continue;

      if (player.x < en.x + en.w && player.x + player.w > en.x &&
          player.y < en.y + en.h && player.y + player.h > en.y) {
        if (player.vy > 0 && player.y + player.h - player.vy < en.y) {
          en.alive = false;
          en.dead = true;
          en.deadTimer = 0;
          player.vy = -8;
          globalScore += 100;
          for (var pp = 0; pp < 6; pp++) {
            PARTICLES.push({
              x: en.x + en.w / 2,
              y: en.y + en.h / 2,
              vx: (Math.random() - 0.5) * 5,
              vy: -Math.random() * 4,
              life: 15 + Math.random() * 10,
              color: en.type === "goomba" ? "#aa5500" : "#55aa00",
              size: 2 + Math.random() * 4
            });
          }
          updateHUD();
        } else if (player.invuln <= 0) {
          if (player.tall) {
            player.tall = false;
            player.h = 44;
            player.invuln = 90;
          } else {
            player.alive = false;
            player.deathTimer = 0;
            player.vy = -8;
          }
        }
      }
    }
  }

  function render() {
    if (!canvas || !ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

    drawPlatforms();
    drawClouds();
    drawMushrooms();
    drawEnemies();
    drawFlagpole();
    drawPlayer();
    drawParticles();

    ctx.restore();
  }

  function drawBackground() {
    var grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#87CEEB");
    grad.addColorStop(0.7, "#87CEEB");
    grad.addColorStop(1, "#4a7c23");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var sunX = canvas.width - 80;
    var sunY = 50;
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlatforms() {
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (p.type === "ground") {
        ctx.fillStyle = "#4a7c23";
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = "#2d5016";
        for (var gx = p.x; gx < p.x + p.w; gx += 32) {
          if (gx >= camera.x - 32 && gx + 32 <= camera.x + canvas.width + 32) {
            ctx.fillRect(gx, p.y, 32, 4);
          }
        }
        ctx.fillStyle = "#8B4513";
        for (var gy = p.y + 8; gy < p.y + p.h; gy += 12) {
          ctx.fillRect(p.x, gy, p.w, 2);
        }
      } else {
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = "#A0522D";
        ctx.fillRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
        ctx.fillStyle = "#DEB887";
        for (var px = p.x + 5; px < p.x + p.w - 5; px += 10) {
          ctx.fillRect(px, p.y + 4, 6, 3);
        }
      }
    }
  }

  function drawClouds() {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x -= c.speed * 0.5;
      if (c.x + c.w < 0) c.x = currentLevelData.width;

      ctx.save();
      ctx.globalAlpha = c.opacity;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x - c.w / 4, c.y + 5, c.w / 3, c.h / 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x + c.w / 4, c.y + 3, c.w / 3, c.h / 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMushrooms() {
    for (var i = 0; i < mushrooms.length; i++) {
      var mu = mushrooms[i];
      if (mu.collected) continue;

      var bobY = Math.sin(mu.animTimer) * 3;
      var mx = mu.x;
      var my = mu.y + bobY;

      if (mu.type === "fire") {
        ctx.fillStyle = "#FF4444";
        ctx.beginPath();
        ctx.arc(mx + mu.w / 2, my + mu.h * 0.4, mu.w * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFFF00";
        ctx.beginPath();
        ctx.arc(mx + mu.w / 2, my + mu.h * 0.5, mu.w * 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#FF6B6B";
        ctx.beginPath();
        ctx.arc(mx + mu.w / 2, my + mu.h * 0.45, mu.w * 0.45, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(mx + mu.w / 2 - 6, my + mu.h * 0.4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx + mu.w / 2 + 6, my + mu.h * 0.35, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFF8DC";
        ctx.fillRect(mx + mu.w * 0.3, my + mu.h * 0.5, mu.w * 0.4, mu.h * 0.5);
      }
    }
  }

  function drawEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      if (en.dead) {
        if (en.deadTimer < 30) {
          ctx.save();
          ctx.globalAlpha = 1 - en.deadTimer / 30;
          drawEnemyBody(en);
          ctx.restore();
        }
        continue;
      }
      drawEnemyBody(en);
    }
  }

  function drawEnemyBody(en) {
    var ex = en.x;
    var ey = en.y;
    var ew = en.w;
    var eh = en.h;

    if (en.type === "goomba") {
      ctx.fillStyle = "#8B4513";
      ctx.beginPath();
      ctx.ellipse(ex + ew / 2, ey + eh * 0.6, ew * 0.45, eh * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#DEB887";
      ctx.beginPath();
      ctx.ellipse(ex + ew / 2, ey + eh * 0.7, ew * 0.3, eh * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(ex + ew * 0.3, ey + eh * 0.35, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + ew * 0.7, ey + eh * 0.35, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(ex + ew * 0.3, ey + eh * 0.38, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + ew * 0.7, ey + eh * 0.38, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#55AA00";
      ctx.beginPath();
      ctx.ellipse(ex + ew / 2, ey + eh * 0.55, ew * 0.45, eh * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#77CC22";
      ctx.beginPath();
      ctx.ellipse(ex + ew / 2, ey + eh * 0.4, ew * 0.3, eh * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(ex + ew * 0.35, ey + eh * 0.4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + ew * 0.65, ey + eh * 0.4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(ex + ew * 0.35, ey + eh * 0.42, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + ew * 0.65, ey + eh * 0.42, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFlagpole() {
    if (!flagpole) return;

    ctx.fillStyle = "#888888";
    ctx.fillRect(flagpole.x, flagpole.y, 6, flagpole.h + 40);
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(flagpole.x + 3, flagpole.y, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#FF0000";
    ctx.beginPath();
    ctx.moveTo(flagpole.x + 6, flagpole.y + 10);
    ctx.lineTo(flagpole.x + 36, flagpole.y + 20);
    ctx.lineTo(flagpole.x + 6, flagpole.y + 30);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayer() {
    if (!player) return;

    if (player.invuln > 0 && Math.floor(player.invuln / 5) % 2 === 0) return;

    var px = player.x;
    var py = player.y;
    var pw = player.w;
    var ph = player.h;

    ctx.save();
    if (player.facing === -1) {
      ctx.translate(px + pw, py);
      ctx.scale(-1,
