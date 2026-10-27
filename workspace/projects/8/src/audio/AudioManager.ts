/**
 * AudioManager.ts
 * Manages the WebAudio API context, procedural synthesis of battle drums/SFX,
 * adaptive music intensity based on KO counters, and spatial 3D sound effects.
 *
 * NOTE: This file is written in standard JavaScript (no TypeScript types)
 * to be directly loadable via <script> without a build step.
 * The class `AudioManager` is exposed as `window.AudioManager`.
 */

(function(global) {
  'use strict';

  var AudioManager = function(config) {
    // Configuration with defaults
    this.cfg = Object.assign({
      masterVolume: 0.8,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      ambientVolume: 0.3,
      sampleRate: 44100,
      maxSpatialVoices: 32,
      adaptiveMusicBaseBPM: 90,
      adaptiveMusicMaxBPM: 140,
      adaptiveMusicKoThresholds: [10, 30, 60, 100, 200],
      audioContextClass: (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null
    }, config || {});

    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.ambientGain = null;

    // Pools
    this._oscPools = [];
    this._bufferPools = {};
    this._noiseBuffers = {};

    // Adaptive music state
    this._musicLayerNodes = [];
    this._musicBPM = this.cfg.adaptiveMusicBaseBPM;
    this._musicIntensity = 0; // 0.0 to 1.0
    this._lastUpdateT = 0;

    // Spatial nodes (for 3D enemy/weapons)
    this._spatialNodes = {};
    this._spatialNodeIndex = 0;

    // Event subscribers
    this._eventSubs = {};

    // Initialized flag
    this._initialized = false;

    // Pre-generate noise buffers for different lengths
    this._generateNoiseBuffers();

    // Pre-generate oscillator pool slots
    this._initOscPool();
  };

  // ---------- PUBLIC API ----------

  AudioManager.prototype.init = function(callback) {
    var self = this;
    if (this._initialized) {
      if (callback) callback(this.ctx);
      return;
    }
    var AudioCtxClass = this.cfg.audioContextClass;
    if (!AudioCtxClass) {
      if (callback) callback(null);
      return;
    }

    // User gesture requirement for audio start
    var tryInit = function() {
      if (self._initialized) {
        if (callback) callback(self.ctx);
        return;
      }
      var ctx = new AudioCtxClass({ sampleRate: self.cfg.sampleRate });
      self.ctx = ctx;

      // Master gain
      self.masterGain = ctx.createGain();
      self.masterGain.gain.value = self.cfg.masterVolume;
      self.masterGain.connect(ctx.destination);

      // Sub-gains
      self.musicGain = ctx.createGain();
      self.musicGain.gain.value = self.cfg.musicVolume;
      self.musicGain.connect(self.masterGain);

      self.sfxGain = ctx.createGain();
      self.sfxGain.gain.value = self.cfg.sfxVolume;
      self.sfxGain.connect(self.masterGain);

      self.ambientGain = ctx.createGain();
      self.ambientGain.gain.value = self.cfg.ambientVolume;
      self.ambientGain.connect(self.masterGain);

      // Start adaptive music layers
      self._startAdaptiveMusic();

      self._initialized = true;

      if (callback) callback(ctx);
    };

    // Attach one-time listeners for user interaction
    var userGesture = ['click', 'touchstart', 'keydown', 'pointerdown'];
    var onGesture = function() {
      document.removeEventListener('click', onGesture, true);
      document.removeEventListener('touchstart', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      document.removeEventListener('pointerdown', onGesture, true);
      tryInit();
    };
    for (var i = 0; i < userGesture.length; i++) {
      document.addEventListener(userGesture[i], onGesture, { once: true, capture: true });
    }
  };

  AudioManager.prototype.dispose = function() {
    if (this.ctx && this.ctx.state !== 'closed') {
      var self = this;
      // Disconnect all connected nodes we tracked
      this._musicLayerNodes.forEach(function(n) {
        try {
          if (n.stop) n.stop();
          if (n.disconnect) n.disconnect();
        } catch (e) { /* */ }
      });
      this._musicLayerNodes = [];
      setTimeout(function() {
        if (self.ctx.state !== 'closed') {
          self.ctx.close();
        }
      }, 100);
    }
    this.ctx = null;
    this._initialized = false;
    this._spatialNodes = {};
    this._spatialNodeIndex = 0;
  };

  // ---------------- SOUND SFX ----------------

  AudioManager.prototype.playSfx = function(name, options) {
    if (!this.ctx) return;
    options = options || {};
    var ctx = this.ctx;
    var out = options.output || this.sfxGain;
    switch (name) {
      case 'hit_light': this._synthesizeHitLight(out, options); break;
      case 'hit_heavy': this._synthesizeHitHeavy(out, options); break;
      case 'slash_wind': this._synthesizeSlashWind(out, options); break;
      case 'guard_block': this._synthesizeGuardBlock(out, options); break;
      case 'enemy_hit': this._synthesizeEnemyHit(out, options); break;
      case 'enemy_ko': this._synthesizeEnemyKO(out, options); break;
      case 'muso_charge': this._synthesizeMusuoCharge(out, options); break;
      case 'muso_release': this._synthesizeMusuoRelease(out, options); break;
      case 'dash': this._synthesizeDash(out, options); break;
      case 'mount_trample': this._synthesizeMountTrample(out, options); break;
      case 'bow_shot': this._synthesizeBowShot(out, options); break;
      case 'arrow_impact': this._synthesizeArrowImpact(out, options); break;
      case 'fire_burst': this._synthesizeFireBurst(out, options); break;
      case 'thunder_strike': this._synthesizeThunderStrike(out, options); break;
      case 'item_pickup': this._synthesizeItemPickup(out, options); break;
      case 'ui_click': this._synthesizeUIClick(out, options); break;
      case 'ui_select': this._synthesizeUISelect(out, options); break;
      case 'battle_drum_strike': this._synthesizeBattleDrumStrike(out, options); break;
      case 'battle_drum_roll': this._synthesizeBattleDrumRoll(out, options); break;
      default: break;
    }
  };

  // ---------------- SPATIAL SFX ----------------

  AudioManager.prototype.playSpatialSfx = function(name, position, options) {
    if (!this.ctx) return;
    options = options || {};
    var ctx = this.ctx;

    var source = ctx.createBufferSource();
    var gain = ctx.createGain();
    var panner = ctx.createPanner ? ctx.createPanner() : null;
    if (!panner) {
      // Fallback panner using StereoPannerNode with distance-based gain
      panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      panner.channelCount = 2;
      panner.channelCountMode = 'explicit';
      panner.channelInterpretation = 'discrete';
      panner.outputChannelCount = 2;
      panner.fallbackType = 'stereo';
      if (typeof panner.connect === 'function') {
        panner.connect(ctx.destination);
      }
    }

    var out = options.output || this.sfxGain;

    source.connect(gain);
    if (panner) {
      gain.connect(panner);
    } else {
      gain.connect(out);
    }

    // Set positional panner params
    if (position) {
      this._setPannerPosition(panner, position, options.listener || null);
    }

    // Configure based on SFX name (reuse synth generators but into buffer)
    var bufferName = name;
    var buffer = this._getOrGenerateBufferForSfx(bufferName, gain);
    source.buffer = buffer;
    source.playbackRate.value = (options.pitch || 1.0);
    source.loop = false;

    var now = ctx.currentTime;
    var attack = 0.005;
    var release = 0.1;
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(options.volume || 1.0, now + attack);
    gain.gain.setValueAtTime(options.volume || 1.0, now + attack + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + attack + 0.5);

    source.start(now);
    source.stop(now + 2);

    // Track spatial nodes for updating positions
    this._spatialNodeIndex++;
    var nodeKey = 'spatial_' + this._spatialNodeIndex;
    this._spatialNodes[nodeKey] = {
      panner: panner,
      position: position,
      listener: options.listener
    };

    // Auto cleanup after 2 seconds
    var self = this;
    setTimeout(function() {
      if (self._spatialNodes[nodeKey]) {
        try { panner.disconnect(); } catch (e) {}
        try { source.disconnect(); } catch (e) {}
        delete self._spatialNodes[nodeKey];
      }
    }, 2000);

    // Expose node key for updates if needed
    this._lastSpatialKey = nodeKey;
  };

  AudioManager.prototype.updateSpatialListener = function(listenerPos, listenerFwd, listenerUp) {
    if (!this.ctx) return;
    var pos = [listenerPos[0], listenerPos[1], listenerPos[2]];
    var fwd = [listenerFwd[0], listenerFwd[1], listenerFwd[2]];
    var up = [listenerUp[0], listenerUp[1], listenerUp[2]];

    // Update all active panners with the new listener
    for (var key in this._spatialNodes) {
      var node = this._spatialNodes[key];
      if (node && node.panner && typeof node.panner.setListener === 'function') {
        node.panner.setListener(pos, fwd, up);
      } else if (node && node.panner && node.panner.positionX) {
        // PannerNode new API
        var p = node.panner;
        if (p.positionX) p.positionX.value = pos[0];
        if (p.positionY) p.positionY.value = pos[1];
        if (p.positionZ) p.positionZ.value = pos[2];
        if (p.forwardX) p.forwardX.value = fwd[0];
        if (p.forwardY) p.forwardY.value = fwd[1];
        if (p.forwardZ) p.forwardZ.value = fwd[2];
        if (p.upX) p.upX.value = up[0];
        if (p.upY) p.upY.value = up[1];
        if (p.upZ) p.upZ.value = up[2];
      }
    }
  };

  AudioManager.prototype.updateSpatialNodePosition = function(nodeKey, position) {
    if (!this.ctx) return;
    var node = this._spatialNodes[nodeKey];
    if (!node || !node.panner) return;
    if (typeof node.panner.setPosition === 'function') {
      node.panner.setPosition(position[0], position[1], position[2]);
    } else if (node.panner.positionX) {
      node.panner.positionX.value = position[0];
      node.panner.positionY.value = position[1];
      node.panner.positionZ.value = position[2];
    }
    node.position = position;
  };

  // ---------------- ADAPTIVE MUSIC ----------------

  AudioManager.prototype.setAdaptiveMusicIntensity = function(intensity, koCounter) {
    if (!this.ctx) return;
    intensity = Math.max(0.0, Math.min(1.0, intensity || 0));
    this._musicIntensity = intensity;
    this._lastUpdateT = this.ctx.currentTime;

    // Map KO counter to intensity tier
    var thresholds = this.cfg.adaptiveMusicKoThresholds || [10, 30, 60, 100, 200];
    var tier = 0;
    if (koCounter !== undefined) {
      for (var i = 0; i < thresholds.length; i++) {
        if (koCounter >= thresholds[i]) tier = i + 1;
      }
    }
    var targetBPM = this.cfg.adaptiveMusicBaseBPM +
                    (this.cfg.adaptiveMusicMaxBPM - this.cfg.adaptiveMusicBaseBPM) * Math.min(tier / thresholds.length, 1.0);
    targetBPM = targetBPM * (0.8 + 0.4 * intensity);
    this._musicBPM = targetBPM;

    // Adjust layer gains based on intensity
    this._adjustMusicLayers(intensity, targetBPM);

    // Update scheduled notes if we already have active layers
    if (this._musicLayerNodes.length > 0) {
      this._scheduleAdaptiveMusicStep();
    }
  };

  AudioManager.prototype._startAdaptiveMusic = function() {
    var ctx = this.ctx;
    var self = this;

    // Create a master music sequencer via setInterval-like pattern using context timing
    // We'll schedule 8th-note events at adaptive BPM.
    this._musicStep = 0;
    this._musicNextNoteTime = ctx.currentTime + 0.1;
    this._musicLayerNodes = [];

    // Layer 1: Drums (low frequency pulse)
    var drumOsc = ctx.createOscillator();
    var drumGain = ctx.createGain();
    drumOsc.type = 'sine';
    drumOsc.frequency.value = 80;
    drumGain.gain.value = 0.0;
    drumOsc.connect(drumGain);
    drumGain.connect(this.musicGain);
    drumOsc.start();
    this._musicLayerNodes.push({ osc: drumOsc, gain: drumGain, type: 'drum' });

    // Layer 2: Melody (square wave, pentatonic D minor)
    var melOsc = ctx.createOscillator();
    var melGain = ctx.createGain();
    melOsc.type = 'square';
    melOsc.frequency.value = 293.66; // D4
    melGain.gain.value = 0.0;
    melOsc.connect(melGain);
    melGain.connect(this.musicGain);
    melOsc.start();
    this._musicLayerNodes.push({ osc: melOsc, gain: melGain, type: 'melody', baseF: 293.66 });

    // Layer 3: Bass drone (sawtooth low)
    var bassOsc = ctx.createOscillator();
    var bassGain = ctx.createGain();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.value = 73.42; // D2
    bassGain.gain.value = 0.0;
    bassOsc.connect(bassGain);
    bassGain.connect(this.musicGain);
    bassOsc.start();
    this._musicLayerNodes.push({ osc: bassOsc, gain: bassGain, type: 'bass' });

    // Start the music loop scheduler
    this._musicSchedulerInterval = setInterval(function() {
      self._scheduleAdaptiveMusicStep();
    }, 100); // check every 100ms

    this._scheduleAdaptiveMusicStep();
  };

  AudioManager.prototype._adjustMusicLayers = function(intensity, bpm) {
    var ctx = this.ctx;
    if (!ctx) return;
    var now = ctx.currentTime;
    var layers = this._musicLayerNodes;

    // Drum gain
    var drumLayer = layers.find(function(l) { return l.type === 'drum'; });
    if (drumLayer) {
      var targetDrumGain = 0.2 + 0.5 * intensity;
      drumLayer.gain.gain.cancelScheduledValues(now);
      drumLayer.gain.gain.linearRampToValueAtTime(targetDrumGain, now + 0.2);
      drumLayer.osc.frequency.setValueAtTime(60 + 40 * intensity, now);
    }

    // Melody gain and rate
    var melLayer = layers.find(function(l) { return l.type === 'melody'; });
    if (melLayer) {
      var targetMelGain = 0.05 + 0.35 * intensity;
      melLayer.gain.gain.cancelScheduledValues(now);
      melLayer.gain.gain.linearRampToValueAtTime(targetMelGain, now + 0.2);
      // Melody frequency shifts with intensity
      melLayer.osc.frequency.setValueAtTime(melLayer.baseF * (1 + intensity * 0.3), now);
    }

    // Bass gain
    var bassLayer = layers.find(function(l) { return l.type === 'bass'; });
    if (bassLayer) {
      var targetBassGain = 0.1 + 0.4 * intensity;
      bassLayer.gain.gain.cancelScheduledValues(now);
      bassLayer.gain.gain.linearRampToValueAtTime(targetBassGain, now + 0.3);
      bassLayer.osc.frequency.setValueAtTime(73.42 * (1 + intensity * 0.2), now);
    }
  };

  AudioManager.prototype._scheduleAdaptiveMusicStep = function() {
    var ctx = this.ctx;
    if (!ctx) return;
    var now = ctx.currentTime;

    // If we're far in the future, resync
    if (now > this._musicNextNoteTime) {
      this._musicNextNoteTime = now + 0.05;
      this._musicStep = 0;
    }

    // Schedule next notes
    var beatSec = 60 / (this._musicBPM || this.cfg.adaptiveMusicBaseBPM);
    var eighth = beatSec / 2;
    var stepsAhead = 16;
    for (var i = 0; i < stepsAhead; i++) {
      var stepTime = this._musicNextNoteTime + i * eighth;
      if (stepTime < now - 0.1) continue;

      this._scheduleStepAt(stepTime, this._musicStep + i, eighth);
    }
    this._musicNextNoteTime += stepsAhead * eighth;
  };

  AudioManager.prototype._scheduleStepAt = function(time, step, eighthSec) {
    var ctx = this.ctx;
    var layers = this._musicLayerNodes;
    var self = this;

    // D minor pentatonic: D, E, F, G, A
    var pentatonic = [293.66, 329.63, 349.23, 392.0, 440.0]; // D4, E4, F4, G4, A4
    var stepMod = step % 16;

    // Drum layer: pulse on every 4th 8th-note
    var drumLayer = layers.find(function(l) { return l.type === 'drum'; });
    if (drumLayer && stepMod % 4 === 0) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 50 + Math.random() * 30;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.6, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.25);
    }

    // Melody layer: play pentatonic notes
    var melLayer = layers.find(function(l) { return l.type === 'melody'; });
    if (melLayer && stepMod % 2 === 0) {
      var noteIndex = (stepMod / 2) % pentatonic.length;
      var freq = pentatonic[noteIndex];
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.15, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.2);
    }

    // Bass layer: long drone
    var bassLayer = layers.find(function(l) { return l.type === 'bass'; });
    if (bassLayer && stepMod === 0) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 73.42; // D2
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.15, time + 0.1);
      g.gain.exponentialRampToValueAtTime(0.01, time + eighthSec * 15);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + eighthSec * 16);
    }
  };

  // ---------------- SFX SYNTHESIS ----------------

  AudioManager.prototype._synthesizeHitLight = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    // Short click + thud
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.15);

    // Noise burst
    this._playNoise(out, 'short', 0.2, now, options || {});
  };

  AudioManager.prototype._synthesizeHitHeavy = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.8, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.5);

    this._playNoise(out, 'medium', 0.4, now, options || {});
  };

  AudioManager.prototype._synthesizeSlashWind = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var bufferSize = ctx.sampleRate * 0.3;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      var t = i / ctx.sampleRate;
      data[i] = (Math.sin(t * 40 * Math.PI) * Math.exp(-t * 8)) * 0.3;
    }
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.25);
    filter.Q.value = 2;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 0.35);
  };

  AudioManager.prototype._synthesizeGuardBlock = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.2);

    this._playNoise(out, 'short', 0.3, now, options || {});
  };

  AudioManager.prototype._synthesizeEnemyHit = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.2);
  };

  AudioManager.prototype._synthesizeEnemyKO = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.6);

    this._playNoise(out, 'long', 0.3, now, options || {});
  };

  AudioManager.prototype._synthesizeMusuoCharge = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.8);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
    gain.gain.setValueAtTime(0.4, now + 0.6);
    gain.gain.linearRampToValueAtTime(0, now + 0.8);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.9);
  };

  AudioManager.prototype._synthesizeMusuoRelease = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    // Shockwave
    var bufferSize = ctx.sampleRate * 0.6;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      var t = i / ctx.sampleRate;
      data[i] = (Math.sin(t * 30 * Math.PI) * Math.exp(-t * 5)) * 0.5;
    }
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.5);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 0.7);

    // Deeper thud
    var osc = ctx.createOscillator();
    var gain2 = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.8, now + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc.connect(gain2);
    gain2.connect(out);
    osc.start(now);
    osc.stop(now + 0.7);
  };

  AudioManager.prototype._synthesizeDash = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.2);
  };

  AudioManager.prototype._synthesizeMountTrample = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    this._playNoise(out, 'long', 0.6, now, options || {});
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.6);
  };

  AudioManager.prototype._synthesizeBowShot = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.2);
  };

  AudioManager.prototype._synthesizeArrowImpact = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    this._playNoise(out, 'short', 0.3, now, options || {});
  };

  AudioManager.prototype._synthesizeFireBurst = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    this._playNoise(out, 'medium', 0.5, now, options || {});
  };

  AudioManager.prototype._synthesizeThunderStrike = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var bufferSize = ctx.sampleRate * 1.0;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      var t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4) * 0.4;
    }
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.8);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 1.2);
  };

  AudioManager.prototype._synthesizeItemPickup = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var notes = [880, 1100, 1320];
    for (var i = 0; i < notes.length; i++) {
      (function(freq, idx) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        var t0 = now + idx * 0.05;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.15, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.2);
        osc.connect(gain);
        gain.connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.25);
      })(notes[i], i);
    }
  };

  AudioManager.prototype._synthesizeUIClick = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.06);
  };

  AudioManager.prototype._synthesizeUISelect = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1500;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.12);
  };

  AudioManager.prototype._synthesizeBattleDrumStrike = function(out, options) {
    var ctx = this.ctx;
    var now = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    gain.gain.setValueAtTime(0, now);
    gain.gain
