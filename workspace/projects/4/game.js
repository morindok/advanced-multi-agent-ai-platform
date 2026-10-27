(function () {
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var highScoreEl = document.getElementById('highScore');
  var gameOverScreen = document.getElementById('gameOverScreen');
  var finalScoreEl = document.getElementById('finalScore');
  var restartBtn = document.getElementById('restartBtn');
  var startScreen = document.getElementById('startScreen');
  var startBtn = document.getElementById('startBtn');
  var pauseLabel = document.getElementById('pauseLabel');

  var GRID = 20;
  var COLS = 25;
  var ROWS = 25;
  canvas.width = COLS * GRID;
  canvas.height = ROWS * GRID;

  var snake, direction, nextDirection, food, score, highScore, gameRunning, gamePaused, speed, loopId, lastTime, moveTimer;

  highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
  highScoreEl.textContent = highScore;

  function randomFood() {
    var pos;
    do {
      pos = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS)
      };
    } while (snake.some(function(s) { return s.x === pos.x && s.y === pos.y; }));
    return pos;
  }

  function init() {
    var midX = Math.floor(COLS / 2);
    var midY = Math.floor(ROWS / 2);
    snake = [
      { x: midX, y: midY },
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    food = randomFood();
    score = 0;
    speed = 130;
    gameRunning = true;
    gamePaused = false;
    scoreEl.textContent = score;
    gameOverScreen.style.display = 'none';
    startScreen.style.display = 'none';
    pauseLabel.style.display = 'none';
    lastTime = performance.now();
    moveTimer = 0;
  }

  function update() {
    direction = nextDirection;
    var head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      endGame();
      return;
    }

    for (var i = 0; i < snake.length; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        endGame();
        return;
      }
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      if (speed > 55) speed -= 2;
      food = randomFood();
    } else {
      snake.pop();
    }
  }

  function drawGrid() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a3a';
    ctx.lineWidth = 0.5;
    for (var x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * GRID, 0);
      ctx.lineTo(x * GRID, canvas.height);
      ctx.stroke();
    }
    for (var y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * GRID);
      ctx.lineTo(canvas.width, y * GRID);
      ctx.stroke();
    }
  }

  function drawSnake() {
    snake.forEach(function(seg, i) {
      var ratio = 1 - (i / snake.length) * 0.5;
      var r = Math.floor(0 * ratio);
      var g = Math.floor(220 * ratio + 35);
      var b = Math.floor(100 * ratio + 50);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      var pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(seg.x * GRID + pad, seg.y * GRID + pad, GRID - pad * 2, GRID - pad * 2, 4);
      ctx.fill();
    });

    var h = snake[0];
    ctx.fillStyle = '#fff';
    var ex1 = h.x * GRID + 6;
    var ey1 = h.y * GRID + 6;
    var ex2 = h.x * GRID + 14;
    var ey2 = h.y * GRID + 6;
    if (direction.y !== 0) {
      ex1 = h.x * GRID + 5;
      ey1 = h.y * GRID + 5;
      ex2 = h.x * GRID + 15;
      ey2 = h.y * GRID + 5;
    }
    ctx.beginPath();
    ctx.arc(ex1, ey1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex2, ey2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFood() {
    var fx = food.x * GRID + GRID / 2;
    var fy = food.y * GRID + GRID / 2;
    var pulse = Math.sin(Date.now() / 200) * 2 + 8;

    var grad = ctx.createRadialGradient(fx, fy, 1, fx, fy, pulse + 4);
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(0.6, '#ee5a24');
    grad.addColorStop(1, 'rgba(238,90,36,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, pulse + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(fx - 2, fy - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    drawGrid();
    drawFood();
    drawSnake();
  }

  function endGame() {
    gameRunning = false;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('snakeHighScore', highScore);
      highScoreEl.textContent = highScore;
    }
    finalScoreEl.textContent = score;
    gameOverScreen.style.display = 'flex';
  }

  function gameLoop(timestamp) {
    if (!gameRunning) return;
    if (gamePaused) {
      loopId = requestAnimationFrame(gameLoop);
      return;
    }
    moveTimer += timestamp - lastTime;
    lastTime = timestamp;
    if (moveTimer >= speed) {
      update();
      moveTimer = 0;
    }
    draw();
    loopId = requestAnimationFrame(gameLoop);
  }

  function startGame() {
    if (loopId) cancelAnimationFrame(loopId);
    init();
    lastTime = performance.now();
    loopId = requestAnimationFrame(gameLoop);
  }

  document.addEventListener('keydown', function(e) {
    if (!gameRunning && e.key !== 'Enter') return;

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        if (direction.y !== 1) nextDirection = { x: 0, y: -1 };
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        if (direction.y !== -1) nextDirection = { x: 0, y: 1 };
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        if (direction.x !== 1) nextDirection = { x: -1, y: 0 };
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        if (direction.x !== -1) nextDirection = { x: 1, y: 0 };
        e.preventDefault();
        break;
      case ' ':
        gamePaused = !gamePaused;
        pauseLabel.style.display = gamePaused ? 'block' : 'none';
        e.preventDefault();
        break;
      case 'Enter':
        if (!gameRunning || startScreen.style.display !== 'none') startGame();
        break;
    }
  });

  var touchStartX, touchStartY;
  canvas.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    if (!touchStartX || !gameRunning) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 20 && direction.x !== -1) nextDirection = { x: 1, y: 0 };
      else if (dx < -20 && direction.x !== 1) nextDirection = { x: -1, y: 0 };
    } else {
      if (dy > 20 && direction.y !== -1) nextDirection = { x: 0, y: 1 };
      else if (dy < -20 && direction.y !== 1) nextDirection = { x: 0, y: -1 };
    }
    touchStartX = null;
    touchStartY = null;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('click', function() {
    if (!gameRunning) startGame();
  });

  restartBtn.addEventListener('click', startGame);
  startBtn.addEventListener('click', startGame);

  draw();
})();
