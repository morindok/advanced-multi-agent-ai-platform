/**
 * HUDManager.ts - HTML/CSS overlay UI manager for Warlords of the Three Kingdoms
 * Handles: health bars, musou gauge, combo/KO counters, objective trackers, live minimap
 * Optimized to minimize DOM updates and avoid layout thrash
 */

class HUDManager {
  private _container: HTMLElement;
  private _healthBar: HTMLElement;
  private _healthBarInner: HTMLElement;
  private _musouGauge: HTMLElement;
  private _musouGaugeInner: HTMLElement;
  private _comboCounter: HTMLElement;
  private _koCounter: HTMLElement;
  private _objectiveTracker: HTMLElement;
  private _minimapCanvas: HTMLCanvasElement;
  private _minimapCtx: CanvasRenderingContext2D;
  private _minimapSize: number;

  // Cache values to avoid redundant DOM writes
  private _lastHealth: number;
  private _lastMusou: number;
  private _lastCombo: number;
  private _lastKO: number;
  private _lastObjectives: string;
  private _lastMinimapFrame: number;

  // For minimap rendering
  private _enemies: Array<{ x: number; y: number; type: string }> = [];
  private _allies: Array<{ x: number; y: number; type: string }> = [];
  private _playerPos: { x: number; y: number } = { x: 0, y: 0 };
  private _mapBounds: { minX: number; minY: number; maxX: number; maxY: number } = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
  private _capturePoints: Array<{ x: number; y: number; owner: 'player' | 'enemy' | 'neutral' }> = [];

  // Animation states
  private _healthPulseTimer: number = 0;
  private _musouFlashTimer: number = 0;
  private _comboPopTimer: number = 0;
  private _koPopTimer: number = 0;
  private _objectiveSlideTimer: number = 0;

  constructor(container: HTMLElement) {
    this._container = container;
    this._lastHealth = -1;
    this._lastMusou = -1;
    this._lastCombo = -1;
    this._lastKO = -1;
    this._lastObjectives = '';
    this._lastMinimapFrame = 0;
    this._minimapSize = 160;

    this._buildDOM();
    this._bindStyles();
  }

  private _buildDOM(): void {
    // Create HUD container
    this._container.innerHTML = `
      <div id="hud-root" class="hud-root">
        <!-- Health Bar -->
        <div id="health-container" class="hud-health-container">
          <div id="health-bar" class="hud-bar">
            <div id="health-bar-inner" class="hud-bar-inner health-fill"></div>
          </div>
          <div id="health-text" class="hud-health-text">HP</div>
        </div>

        <!-- Musou Gauge -->
        <div id="musou-container" class="hud-musou-container">
          <div id="musou-bar" class="hud-bar musou-bar">
            <div id="musou-bar-inner" class="hud-bar-inner musou-fill"></div>
          </div>
          <div id="musou-text" class="hud-musou-text">MUSOU</div>
        </div>

        <!-- Combo Counter -->
        <div id="combo-container" class="hud-combo-container">
          <div id="combo-counter" class="hud-counter combo-counter">0</div>
          <div class="hud-counter-label">COMBO</div>
        </div>

        <!-- KO Counter -->
        <div id="ko-container" class="hud-ko-container">
          <div id="ko-counter" class="hud-counter ko-counter">0</div>
          <div class="hud-counter-label">KOs</div>
        </div>

        <!-- Objective Tracker -->
        <div id="objective-container" class="hud-objective-container">
          <div id="objective-text" class="hud-objective-text">Complete the objective</div>
        </div>

        <!-- Minimap -->
        <div id="minimap-container" class="hud-minimap-container">
          <canvas id="minimap-canvas" width="160" height="160"></canvas>
        </div>
      </div>
    `;

    this._healthBar = document.getElementById('health-bar') as HTMLElement;
    this._healthBarInner = document.getElementById('health-bar-inner') as HTMLElement;
    this._musouGauge = document.getElementById('musou-bar') as HTMLElement;
    this._musouGaugeInner = document.getElementById('musou-bar-inner') as HTMLElement;
    this._comboCounter = document.getElementById('combo-counter') as HTMLElement;
    this._koCounter = document.getElementById('ko-counter') as HTMLElement;
    this._objectiveTracker = document.getElementById('objective-text') as HTMLElement;
    this._minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this._minimapCtx = this._minimapCanvas.getContext('2d') as CanvasRenderingContext2D;

    this._minimapCanvas.width = this._minimapSize;
    this._minimapCanvas.height = this._minimapSize;
  }

  private _bindStyles(): void {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .hud-root {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #fff;
      }

      .hud-health-container {
        position: absolute;
        top: 20px;
        left: 20px;
        width: 250px;
      }

      .hud-bar {
        width: 100%;
        height: 18px;
        background: rgba(0, 0, 0, 0.6);
        border: 2px solid #555;
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }

      .hud-bar-inner {
        height: 100%;
        width: 100%;
        transition: width 0.15s ease-out;
        border-radius: 2px;
      }

      .health-fill {
        background: linear-gradient(to right, #ff4444, #ff6666);
      }

      .musou-fill {
        background: linear-gradient(to right, #ffaa00, #ffdd44);
      }

      .hud-health-text, .hud-musou-text {
        font-size: 10px;
        font-weight: bold;
        margin-top: 4px;
        text-shadow: 1px 1px 2px #000;
        letter-spacing: 1px;
      }

      .hud-musou-container {
        position: absolute;
        top: 50px;
        left: 20px;
        width: 250px;
      }

      .musou-bar {
        height: 14px;
      }

      .hud-combo-container {
        position: absolute;
        top: 40px;
        right: 30px;
        text-align: right;
      }

      .hud-counter {
        font-size: 48px;
        font-weight: 900;
        text-shadow: 2px 2px 4px #000, 0 0 10px rgba(255, 170, 0, 0.5);
        transition: transform 0.1s ease-out;
      }

      .hud-counter-label {
        font-size: 14px;
        font-weight: bold;
        text-shadow: 1px 1px 2px #000;
        letter-spacing: 2px;
        color: #ffcc00;
      }

      .hud-ko-container {
        position: absolute;
        top: 120px;
        right: 30px;
        text-align: right;
      }

      .ko-counter {
        color: #ff4444;
        font-size: 36px;
      }

      .hud-objective-container {
        position: absolute;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .hud-objective-text {
        font-size: 14px;
        font-weight: 500;
        text-shadow: 1px 1px 2px #000;
        min-width: 200px;
        text-align: center;
      }

      .hud-minimap-container {
        position: absolute;
        bottom: 30px;
        right: 30px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 8px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        padding: 4px;
      }

      #minimap-canvas {
        display: block;
        border-radius: 4px;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      @keyframes pop {
        0% { transform: scale(1); }
        50% { transform: scale(1.3); }
        100% { transform: scale(1); }
      }

      .pulse {
        animation: pulse 0.3s ease-in-out;
      }

      .pop {
        animation: pop 0.2s ease-out;
      }
    `;
    document.head.appendChild(styleEl);
  }

  public update(deltaTime: number, gameState: GameState): void {
    this._healthPulseTimer = Math.max(0, this._healthPulseTimer - deltaTime);
    this._musouFlashTimer = Math.max(0, this._musouFlashTimer - deltaTime);
    this._comboPopTimer = Math.max(0, this._comboPopTimer - deltaTime);
    this._koPopTimer = Math.max(0, this._koPopTimer - deltaTime);
    this._objectiveSlideTimer = Math.max(0, this._objectiveSlideTimer - deltaTime);

    this._updateHealthBar(gameState.health, gameState.maxHealth);
    this._updateMusouGauge(gameState.musou, gameState.maxMusou);
    this._updateComboCounter(gameState.combo);
    this._updateKOCounter(gameState.koCount);
    this._updateObjectiveTracker(gameState.objective);
    this._updateMinimap(deltaTime, gameState);
  }

  private _updateHealthBar(health: number, maxHealth: number): void {
    const normalized = Math.max(0, Math.min(1, health / maxHealth));

    if (normalized !== this._lastHealth) {
      const widthPercent = normalized * 100;
      this._healthBarInner.style.width = widthPercent + '%';

      // Color change based on health level
      if (normalized < 0.25) {
        this._healthBarInner.style.background = 'linear-gradient(to right, #cc0000, #ff2222)';
        if (this._healthPulseTimer <= 0) {
          this._healthBarInner.classList.add('pulse');
          this._healthPulseTimer = 0.5;
        }
      } else if (normalized < 0.5) {
        this._healthBarInner.style.background = 'linear-gradient(to right, #ff8800, #ffaa22)';
      } else {
        this._healthBarInner.style.background = 'linear-gradient(to right, #ff4444, #ff6666)';
      }

      this._lastHealth = normalized;
    }
  }

  private _updateMusouGauge(musou: number, maxMusou: number): void {
    const normalized = Math.max(0, Math.min(1, musou / maxMusou));

    if (normalized !== this._lastMusou) {
      const widthPercent = normalized * 100;
      this._musouGaugeInner.style.width = widthPercent + '%';

      if (normalized >= 0.95) {
        this._musouGaugeInner.style.background = 'linear-gradient(to right, #ffff00, #ffaa00)';
        if (this._musouFlashTimer <= 0) {
          this._musouGaugeInner.classList.add('pulse');
          this._musouFlashTimer = 0.4;
        }
      } else {
        this._musouGaugeInner.style.background = 'linear-gradient(to right, #ffaa00, #ffdd44)';
      }

      this._lastMusou = normalized;
    }
  }

  private _updateComboCounter(combo: number): void {
    if (combo !== this._lastCombo) {
      this._comboCounter.textContent = combo.toString();

      if (combo > 0 && this._lastCombo >= 0 && combo > this._lastCombo) {
        if (this._comboPopTimer <= 0) {
          this._comboCounter.classList.add('pop');
          this._comboPopTimer = 0.2;
          // Remove class after animation
          setTimeout(() => {
            this._comboCounter.classList.remove('pop');
          }, 200);
        }
      }

      this._lastCombo = combo;
    }
  }

  private _updateKOCounter(koCount: number): void {
    if (koCount !== this._lastKO) {
      this._koCounter.textContent = koCount.toString();

      if (this._lastKO >= 0 && koCount > this._lastKO) {
        if (this._koPopTimer <= 0) {
          this._koCounter.classList.add('pop');
          this._koPopTimer = 0.3;
          setTimeout(() => {
            this._koCounter.classList.remove('pop');
          }, 300);
        }
      }

      this._lastKO = koCount;
    }
  }

  private _updateObjectiveTracker(objective: string): void {
    if (objective !== this._lastObjectives) {
      this._objectiveTracker.textContent = objective;
      this._lastObjectives = objective;

      if (this._objectiveSlideTimer <= 0) {
        this._objectiveSlideTimer = 1.0;
      }
    }
  }

  private _updateMinimap(deltaTime: number, gameState: GameState): void {
    // Throttle minimap updates to every 4 frames to reduce load
    this._lastMinimapFrame += 1;
    if (this._lastMinimapFrame < 4) return;
    this._lastMinimapFrame = 0;

    this._playerPos = gameState.playerPos;
    this._enemies = gameState.enemies;
    this._allies = gameState.allies;
    this._capturePoints = gameState.capturePoints;
    this._mapBounds = gameState.mapBounds;

    this._renderMinimap();
  }

  private _renderMinimap(): void {
    const ctx = this._minimapCtx;
    if (!ctx) return;

    const size = this._minimapSize;
    const bounds = this._mapBounds;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const scale = size / Math.max(width, height);

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = 'rgba(20, 30, 40, 0.8)';
    ctx.fillRect(0, 0, size, size);

    // Helper: world to minimap coordinates
    const toMinimap = (wx: number, wy: number): { x: number; y: number } => {
      const mx = (wx - bounds.minX) / width * size;
      const my = size - ((wy - bounds.minY) / height * size);
      return { x: mx, y: my };
    };

    // Draw capture points
    for (const cp of this._capturePoints) {
      const pos = toMinimap(cp.x, cp.y);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      if (cp.owner === 'player') {
        ctx.fillStyle = '#44aaff';
      } else if (cp.owner === 'enemy') {
        ctx.fillStyle = '#ff4444';
      } else {
        ctx.fillStyle = '#aaaaaa';
      }
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw allies
    ctx.fillStyle = '#44ff44';
    for (const ally of this._allies) {
      const pos = toMinimap(ally.x, ally.y);
      ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
    }

    // Draw enemies
    for (const enemy of this._enemies) {
      const pos = toMinimap(enemy.x, enemy.y);
      if (enemy.type === 'elite') {
        ctx.fillStyle = '#ff44ff';
        ctx.fillRect(pos.x - 3, pos.y - 3, 6, 6);
      } else if (enemy.type === 'commander') {
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ff6666';
        ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
      }
    }

    // Draw player (last, on top)
    const playerPos = toMinimap(this._playerPos.x, this._playerPos.y);
    ctx.beginPath();
    ctx.arc(playerPos.x, playerPos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player direction indicator
    ctx.beginPath();
    ctx.moveTo(playerPos.x, playerPos.y);
    ctx.lineTo(playerPos.x + 8, playerPos.y);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  public showVictory(): void {
    this._container.innerHTML = `
      <div class="hud-root">
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center;">
          <h1 style="font-size:64px; color:#ffdd00; text-shadow:3px 3px 6px #000; margin:0;">VICTORY</h1>
          <p style="font-size:24px; color:#fff; margin-top:10px;">The battlefield is yours, Warlord.</p>
        </div>
      </div>
    `;
  }

  public showDefeat(): void {
    this._container.innerHTML = `
      <div class="hud-root">
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center;">
          <h1 style="font-size:64px; color:#ff2222; text-shadow:3px 3px 6px #000; margin:0;">DEFEAT</h1>
          <p style="font-size:24px; color:#fff; margin-top:10px;">Your army has fallen...</p>
        </div>
      </div>
    `;
  }

  public showPauseMenu(): void {
    this._container.innerHTML = `
      <div class="hud-root">
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); padding:30px 60px; border-radius:12px; text-align:center; border:2px solid rgba(255,255,255,0.2);">
          <h1 style="font-size:48px; color:#ffcc00; margin:0;">PAUSED</h1>
          <p style="font-size:18px; color:#ccc; margin-top:15px;">Press ESC to resume or R to restart</p>
        </div>
      </div>
    `;
  }

  public clear(): void {
    this._container.innerHTML = '';
  }
}

// GameState interface for type safety
interface GameState {
  health: number;
  maxHealth: number;
  musou: number;
  maxMusou: number;
  combo: number;
  koCount: number;
  objective: string;
  playerPos: { x: number; y: number };
  enemies: Array<{ x: number; y: number; type: string }>;
  allies: Array<{ x: number; y: number; type: string }>;
  capturePoints: Array<{ x: number; y: number; owner: 'player' | 'enemy' | 'neutral' }>;
  mapBounds: { minX: number; minY: number; maxX: number; maxY: number };
}
