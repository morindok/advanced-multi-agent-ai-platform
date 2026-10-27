(function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('score-display');
    const livesDisplay = document.getElementById('lives-display');
    const gameOverScreen = document.getElementById('game-over-screen');
    const finalScoreDisplay = document.getElementById('final-score');
    const restartBtn = document.getElementById('restart-btn');

    const CANVAS_WIDTH = canvas.width;
    const CANVAS_HEIGHT = canvas.height;

    let gameRunning = false;
    let score = 0;
    let lives = 3;
    let enemies = [];
    let enemyBullets = [];
    let playerBullets = [];
    let particles = [];
    let enemySpawnTimer = 0;
    let enemySpawnInterval = 60;
    let enemySpeed = 2;
    let frameCount = 0;
    let animationId = null;

    const player = {
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT - 60,
        width: 40,
        height: 40,
        speed: 5,
        cooldown: 0
    };

    const keys = {
        ArrowLeft: false,
        ArrowRight: false,
        a: false,
        d: false,
        ' ': false
    };

    function createEnemy() {
        const size = Math.random() * 20 + 20;
        const x = Math.random() * (CANVAS_WIDTH - size) + size / 2;
        const type = Math.random() > 0.7 ? 'tank' : 'normal';
        enemies.push({
            x: x,
            y: -size,
            width: size,
            height: size,
            speed: enemySpeed + Math.random() * 1.5,
            type: type,
            hp: type === 'tank' ? 3 : 1,
            maxHp: type === 'tank' ? 3 : 1
        });
    }

    function createParticle(x, y, color) {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: Math.random() * 0.03 + 0.02,
                color: color,
                size: Math.random() * 4 + 2
            });
        }
    }

    function shoot() {
        if (player.cooldown <= 0) {
            playerBullets.push({
                x: player.x,
                y: player.y - player.height / 2,
                width: 4,
                height: 15,
                speed: 8
            });
            player.cooldown = 15;
        }
    }

    function updatePlayer() {
        let moveX = 0;
        if (keys.ArrowLeft || keys.a) moveX -= player.speed;
        if (keys.ArrowRight || keys.d) moveX += player.speed;
        player.x += moveX;

        player.x = Math.max(player.width / 2, Math.min(CANVAS_WIDTH - player.width / 2, player.x));

        if (player.cooldown > 0) player.cooldown--;
        if (keys[' ']) shoot();
    }

    function updateEnemies() {
        for (let i = enemies.length - 1; i >= 0; i--) {
            enemies[i].y += enemies[i].speed;

            if (enemies[i].y - enemies[i].height / 2 > CANVAS_HEIGHT) {
                enemies.splice(i, 1);
                lives--;
                updateLivesDisplay();
                if (lives <= 0) {
                    gameOver();
                }
                continue;
            }

            if (Math.random() < 0.005 * (enemies[i].type === 'tank' ? 2 : 1)) {
                enemyBullets.push({
                    x: enemies[i].x,
                    y: enemies[i].y + enemies[i].height / 2,
                    width: 4,
                    height: 10,
                    speed: 4
                });
            }
        }
    }

    function updateBullets() {
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            playerBullets[i].y -= playerBullets[i].speed;
            if (playerBullets[i].y + playerBullets[i].height < 0) {
                playerBullets.splice(i, 1);
            }
        }

        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            enemyBullets[i].y += enemyBullets[i].speed;
            if (enemyBullets[i].y > CANVAS_HEIGHT) {
                enemyBullets.splice(i, 1);
            }
        }
    }

    function checkCollisions() {
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const bullet = playerBullets[i];
            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j];
                if (
                    bullet.x + bullet.width / 2 > enemy.x - enemy.width / 2 &&
                    bullet.x - bullet.width / 2 < enemy.x + enemy.width / 2 &&
                    bullet.y + bullet.height / 2 > enemy.y - enemy.height / 2 &&
                    bullet.y - bullet.height / 2 < enemy.y + enemy.height / 2
                ) {
                    enemies[j].hp--;
                    playerBullets.splice(i, 1);

                    if (enemies[j].hp <= 0) {
                        createParticle(enemies[j].x, enemies[j].y, enemies[j].type === 'tank' ? '#ffaa00' : '#ff4444');
                        enemies.splice(j, 1);
                        score += enemies[j] ? 10 : 10;
                        updateScoreDisplay();
                        enemySpawnInterval = Math.max(30, enemySpawnInterval - 2);
                        enemySpeed = Math.min(4, enemySpeed + 0.1);
                    }
                    break;
                }
            }
        }

        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const bullet = enemyBullets[i];
            if (
                bullet.x + bullet.width / 2 > player.x - player.width / 2 &&
                bullet.x - bullet.width / 2 < player.x + player.width / 2 &&
                bullet.y + bullet.height / 2 > player.y - player.height / 2 &&
                bullet.y - bullet.height / 2 < player.y + player.height / 2
            ) {
                enemyBullets.splice(i, 1);
                createParticle(player.x, player.y, '#00ff88');
                lives--;
                updateLivesDisplay();
                if (lives <= 0) {
                    gameOver();
                }
            }
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            if (
                enemy.x + enemy.width / 2 > player.x - player.width / 2 &&
                enemy.x - enemy.width / 2 < player.x + player.width / 2 &&
                enemy.y + enemy.height / 2 > player.y - player.height / 2 &&
                enemy.y - enemy.height / 2 < player.y + player.height / 2
            ) {
                createParticle(enemy.x, enemy.y, '#ff4444');
                enemies.splice(i, 1);
                lives--;
                updateLivesDisplay();
                if (lives <= 0) {
                    gameOver();
                }
            }
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].x += particles[i].vx;
            particles[i].y += particles[i].vy;
            particles[i].life -= particles[i].decay;
            if (particles[i].life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function updateEnemySpawning() {
        enemySpawnTimer++;
        if (enemySpawnTimer >= enemySpawnInterval) {
            createEnemy();
            enemySpawnTimer = 0;
        }
    }

    function updateScoreDisplay() {
        scoreDisplay.textContent = 'Score: ' + score;
    }

    function updateLivesDisplay() {
        livesDisplay.textContent = 'Lives: ' + lives;
    }

    function gameOver() {
        gameRunning = false;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        finalScoreDisplay.textContent = 'Score: ' + score;
        gameOverScreen.style.display = 'flex';
    }

    function resetGame() {
        score = 0;
        lives = 3;
        enemies = [];
        enemyBullets = [];
        playerBullets = [];
        particles = [];
        enemySpawnTimer = 0;
        enemySpawnInterval = 60;
        enemySpeed = 2;
        frameCount = 0;
        player.x = CANVAS_WIDTH / 2;
        player.cooldown = 0;
        gameOverScreen.style.display = 'none';
        updateScoreDisplay();
        updateLivesDisplay();
        startGame();
    }

    function drawPlayer() {
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.moveTo(player.x, player.y - player.height / 2);
        ctx.lineTo(player.x - player.width / 2, player.y + player.height / 2);
        ctx.lineTo(player.x + player.width / 2, player.y + player.height / 2);
        ctx.closePath();
        ctx.fill();
    }

    function drawEnemies() {
        for (let enemy of enemies) {
            if (enemy.type === 'tank') {
                ctx.fillStyle = '#ffaa00';
            } else {
                ctx.fillStyle = '#ff4444';
            }
            ctx.beginPath();
            ctx.moveTo(enemy.x, enemy.y + enemy.height / 2);
            ctx.lineTo(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2);
            ctx.lineTo(enemy.x + enemy.width / 2, enemy.y - enemy.height / 2);
            ctx.closePath();
            ctx.fill();

            if (enemy.type === 'tank') {
                ctx.fillStyle = '#ffffff';
                ctx.font = '10px monospace';
                ctx.fillText(enemy.hp + '/' + enemy.maxHp, enemy.x - 10, enemy.y + 5);
            }
        }
    }

    function drawBullets() {
        ctx.fillStyle = '#ffffff';
        for (let bullet of playerBullets) {
            ctx.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height);
        }

        ctx.fillStyle = '#ff4444';
        for (let bullet of enemyBullets) {
            ctx.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height);
        }
    }

    function drawParticles() {
        for (let p of particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function draw() {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        drawPlayer();
        drawEnemies();
        drawBullets();
        drawParticles();
    }

    function gameLoop() {
        if (!gameRunning) return;

        frameCount++;
        updatePlayer();
        updateEnemies();
        updateBullets();
        checkCollisions();
        updateParticles();
        updateEnemySpawning();
        draw();

        if (gameRunning) {
            animationId = requestAnimationFrame(gameLoop);
        }
    }

    function startGame() {
        gameRunning = true;
        animationId = requestAnimationFrame(gameLoop);
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            keys.ArrowLeft = true;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            keys.ArrowRight = true;
        }
        if (e.key === ' ') {
            keys[' '] = true;
            e.preventDefault();
        }
    });

    document.addEventListener('keyup', function(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            keys.ArrowLeft = false;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            keys.ArrowRight = false;
        }
        if (e.key === ' ') {
            keys[' '] = false;
        }
    });

    let touchStartX = null;
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            touchStartX = e.touches[0].clientX;
        }
    });

    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();
        if (touchStartX !== null && e.touches.length > 0) {
            const currentX = e.touches[0].clientX;
            const diff = currentX - touchStartX;
            if (diff > 5) {
                keys.ArrowRight = true;
                keys.ArrowLeft = false;
            } else if (diff < -5) {
                keys.ArrowLeft = true;
                keys.ArrowRight = false;
            }
        }
    });

    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        keys.ArrowLeft = false;
        keys.ArrowRight = false;
        touchStartX = null;
        if (e.changedTouches.length > 0 && gameRunning) {
            const rect = canvas.getBoundingClientRect();
            const touchY = e.changedTouches[0].clientY - rect.top;
            if (touchY < CANVAS_HEIGHT / 2) {
                keys[' '] = true;
                setTimeout(() => {
                    keys[' '] = false;
                }, 100);
            }
        }
    });

    canvas.addEventListener('click', function(e) {
        if (gameRunning) {
            keys[' '] = true;
            setTimeout(() => {
                keys[' '] = false;
            }, 100);
        }
    });

    restartBtn.addEventListener('click', resetGame);

    updateScoreDisplay();
    updateLivesDisplay();
    startGame();
})();
