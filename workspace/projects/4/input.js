(function () {
  'use strict';

  const KEY_MAP = {
    ArrowUp:    { x:  0, y: -1 },
    ArrowDown:  { x:  0, y:  1 },
    ArrowLeft:  { x: -1, y:  0 },
    ArrowRight: { x:  1, y:  0 },
    w: { x:  0, y: -1 },
    s: { x:  0, y:  1 },
    a: { x: -1, y:  0 },
    d: { x:  1, y:  0 },
    W: { x:  0, y: -1 },
    S: { x:  0, y:  1 },
    A: { x: -1, y:  0 },
    D: { x:  1, y:  0 },
  };

  let currentDirection = { x: 1, y: 0 };
  let nextDirection    = { x: 1, y: 0 };
  let gameRunning      = false;
  let gameOver         = false;

  function setGameRunning(value) {
    gameRunning = value;
  }

  function setGameOver(value) {
    gameOver = value;
  }

  function isReversed(dx, dy) {
    return dx === -currentDirection.x && dy === -currentDirection.y;
  }

  function getSnake() {
    try { return window.__snakeBody || []; } catch (e) { return []; }
  }

  function startGame() {
    try {
      if (typeof window.__startGame === 'function') window.__startGame();
    } catch (e) { /* ignore */ }
  }

  function applyDirection(dx, dy) {
    if (dx === 0 && dy === 0) return;
    if (isReversed(dx, dy)) return;
    nextDirection = { x: dx, y: dy };
  }

  function commitNextDirection() {
    currentDirection = { ...nextDirection };
  }

  function onKeyDown(e) {
    const dir = KEY_MAP[e.key];

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (gameOver) startGame();
      return;
    }

    if (dir) {
      e.preventDefault();
      applyDirection(dir.x, dir.y);
    }
  }

  function onTouchStart(e) {
    window.__touchStartX = e.touches[0].clientX;
    window.__touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (window.__touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - window.__touchStartX;
    const dy = e.changedTouches[0].clientY - window.__touchStartY;
    window.__touchStartX = null;
    window.__touchStartY = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 10 && absDy < 10) {
      if (gameOver) startGame();
      return;
    }

    if (absDx > absDy) {
      applyDirection(dx > 0 ? 1 : -1, 0);
    } else {
      applyDirection(0, dy > 0 ? 1 : -1);
    }
  }

  function init() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  init();

  window.__setDirection     = applyDirection;
  window.__commitDirection  = commitNextDirection;
  window.__setGameRunning   = setGameRunning;
  window.__setGameOver      = setGameOver;
  window.__isReversed       = isReversed;
  window.__getDirection     = function () { return currentDirection; };
  window.__getNextDirection = function () { return nextDirection; };
})();
