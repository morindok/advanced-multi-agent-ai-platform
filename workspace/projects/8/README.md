# Warlords of the Three Kingdoms

ساخته‌شده توسط مغز NCP — اجرای #8

## اجرا
1. پوشه‌ی ZIP را خارج کنید.
2. فایل **index.html** را با مرورگر باز کنید (دوبار کلیک).

نیازی به نصب، سرور یا مرحله‌ی build نیست.

## فایل‌ها
- `index.html` — Entry point containing the main game canvas container, HUD overlays for health, musou gauge, minimap, and menu system, plus the root script tag to bootstrap the TypeScript application.
- `style.css` — Defines global styles, UI layout for all menu screens (main, character select, settings), HUD elements, and responsive canvas sizing with z-index layering for the 3D viewport and 2D overlays.
- `src/main.ts` — Application entry point that initializes the global service container, loads the Vite entry, starts the main game loop, and handles initial WebGL2 and Rapier WASM feature detection and error reporting.
- `src/core/Engine.ts` — Manages the main fixed-timestep simulation loop (60Hz) decoupled from rendering, orchestrates scene graph traversal, and coordinates updates for ECS systems, AI, and physics in the correct order.
- `src/core/ECS.ts` — Implements the custom ECS kernel using structure-of-arrays memory layout for archetypes and component storage, providing high-performance entity queries and lifecycle management for the 300+ enemy crowd.
- `src/core/EventBus.ts` — Provides a typed, zero-allocation publish/subscribe system for decoupling combat hits, AI state changes, and VFX triggers without direct object dependencies, optimizing garbage collection in hot paths.
- `src/game/PlayerController.ts` — Handles input mapping, player movement, third-person camera lock-on logic, and state machine for combat animations (C1-C6 combos, charge attacks, musou ultimates) with precise hit-detection timing.
- `src/game/CrowdAI.ts` — Implements flocking/steering behaviors, distance-based tick throttling, attack token limiting, and morale-driven flee logic for the enemy crowd, utilizing spatial hash grids for efficient neighbor queries.
- `src/render/Instancing.ts` — Sets up GPU instancing and skinned mesh vertex animation textures for the soldier crowd to achieve 60 FPS performance, managing LOD switching and frustum culling for the large battlefield scale.
- `src/audio/AudioManager.ts` — Manages the WebAudio API context, handles procedural synthesis of battle drums and SFX, implements adaptive music intensity based on KO counters, and spatializes 3D sound effects for enemies and weapons.
- `src/ui/HUDManager.ts` — Updates the HTML/CSS overlay UI elements including health bars, musou gauge, combo/KO counters, objective trackers, and the live minimap, ensuring zero layout thrash and optimized DOM updates during gameplay.
- `src/data/heroes.json` — Stores data-driven definitions for the 12 playable heroes, including unique stats, weapon types, move sets, musou parameters, and procedural model configurations to decouple content from engine logic.

## وضعیت اعتبارسنجی
- ⚠ src/data/heroes.json: JSON نامعتبر: Expected ',' or '}' after property value in JSON at position 28410 (line 892 column 1)
