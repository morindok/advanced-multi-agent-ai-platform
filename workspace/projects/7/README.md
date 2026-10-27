# Dynasty 3D Battle

ساخته‌شده توسط مغز NCP — اجرای #7

## اجرا
1. پوشه‌ی ZIP را خارج کنید.
2. فایل **index.html** را با مرورگر باز کنید (دوبار کلیک).

نیازی به نصب، سرور یا مرحله‌ی build نیست.

## فایل‌ها
- `index.html` — HTML skeleton with Three.js CDN, WebGL canvas container, and UI overlay for health bar, combo counter, and pause menu.
- `style.css` — Dark fantasy UI styles, HUD layout, button hover effects, and responsive scaling for the 3D battle interface.
- `main.js` — Three.js scene initialization, camera controls, lighting setup, main game loop, and global state management (game start, pause, end).
- `combat.js` — Advanced combat logic including weapon switching, combo chains, critical hits, and collision detection using bounding boxes.
- `enemies.js` — Enemy AI logic with wave spawning, group tactics, difficulty scaling, and individual enemy state machines.
- `player.js` — Player character controller including 3D movement (WASD), jumping, attack animations, hit reaction, and invincibility frames.
- `ui.js` — DOM manipulation for updating health, stamina, score, and combo UI in real-time based on game state.

## وضعیت اعتبارسنجی
✓ همه‌ی فایل‌ها بررسی شده‌اند و خطای نحوی یا ارجاع شکسته ندارند.
