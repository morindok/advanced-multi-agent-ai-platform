// js/input.js - manages keyboard and touch input for mushroom-runner

(function (global) {
    'use strict';

    // Input state object
    const inputState = {
        left: false,
        right: false,
        jump: false,
        attack: false,
        jumpBuffer: 0,
        jumpBufferFrames: 8,
        coyoteTime: 0,
        coyoteFrames: 6
    };

    // Track pressed keys
    const pressedKeys = {};
    const touchState = {
        active: false,
        startX: 0,
        startY: 0,
        isDragging: false,
        dragDirection: 0 // -1 left, 1 right, 0 none
    };

    // Button elements (created if not present)
    let touchButtons = null;
    let jumpButton = null;
    let attackButton = null;

    // Keyboard event handlers
    function onKeyDown(event) {
        switch (event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                inputState.left = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                inputState.right = true;
                break;
            case 'Space':
            case 'ArrowUp':
            case 'KeyW':
                if (!pressedKeys[event.code]) {
                    inputState.jumpBuffer = inputState.jumpBufferFrames;
                }
                inputState.jump = true;
                event.preventDefault();
                break;
            case 'KeyZ':
            case 'KeyJ':
            case 'Enter':
                inputState.attack = true;
                break;
        }
        pressedKeys[event.code] = true;
    }

    function onKeyUp(event) {
        switch (event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                inputState.left = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                inputState.right = false;
                break;
            case 'Space':
            case 'ArrowUp':
            case 'KeyW':
                inputState.jump = false;
                break;
            case 'KeyZ':
            case 'KeyJ':
            case 'Enter':
                inputState.attack = false;
                break;
        }
        pressedKeys[event.code] = false;
    }

    // Touch button setup
    function createTouchButtons() {
        const container = document.createElement('div');
        container.id = 'touchControls';
        container.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:100px;display:flex;justify-content:space-between;align-items:flex-end;padding:10px;z-index:1000;pointer-events:none;';

        // Left/Right buttons
        const moveButtons = document.createElement('div');
        moveButtons.style.cssText = 'display:flex;gap:10px;pointer-events:auto;';

        const leftBtn = document.createElement('button');
        leftBtn.textContent = '◀';
        leftBtn.id = 'btnLeft';
        leftBtn.style.cssText = 'width:60px;height:60px;font-size:20px;border:none;border-radius:50%;background:rgba(0,0,0,0.6);color:white;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;';

        const rightBtn = document.createElement('button');
        rightBtn.textContent = '▶';
        rightBtn.id = 'btnRight';
        rightBtn.style.cssText = 'width:60px;height:60px;font-size:20px;border:none;border-radius:50%;background:rgba(0,0,0,0.6);color:white;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;';

        moveButtons.appendChild(leftBtn);
        moveButtons.appendChild(rightBtn);

        // Action buttons
        const actionButtons = document.createElement('div');
        actionButtons.style.cssText = 'display:flex;gap:10px;pointer-events:auto;flex-direction:column;align-items:center;';

        attackButton = document.createElement('button');
        attackButton.textContent = '⚔';
        attackButton.id = 'btnAttack';
        attackButton.style.cssText = 'width:50px;height:50px;font-size:18px;border:none;border-radius:50%;background:rgba(150,50,50,0.7);color:white;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;margin-bottom:10px;';

        jumpButton = document.createElement('button');
        jumpButton.textContent = '⬆';
        jumpButton.id = 'btnJump';
        jumpButton.style.cssText = 'width:60px;height:60px;font-size:22px;border:none;border-radius:50%;background:rgba(50,100,200,0.7);color:white;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;';

        actionButtons.appendChild(attackButton);
        actionButtons.appendChild(jumpButton);

        container.appendChild(moveButtons);
        container.appendChild(actionButtons);
        document.body.appendChild(container);

        touchButtons = {
            leftBtn: leftBtn,
            rightBtn: rightBtn
        };

        // Attach events
        attachTouchEvent(leftBtn, true);
        attachTouchEvent(rightBtn, false);
        attachActionEvent(jumpButton, 'jump');
        attachActionEvent(attackButton, 'attack');
    }

    function attachTouchEvent(btn, isLeft) {
        const start = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isLeft) inputState.left = true;
            else inputState.right = true;
            btn.style.background = 'rgba(0,0,0,0.9)';
            btn.style.transform = 'scale(0.95)';
        };
        const end = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isLeft) inputState.left = false;
            else inputState.right = false;
            btn.style.background = 'rgba(0,0,0,0.6)';
            btn.style.transform = 'scale(1)';
        };

        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('touchcancel', end, { passive: false });
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
    }

    function attachActionEvent(btn, action) {
        const start = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (action === 'jump') {
                inputState.jumpBuffer = inputState.jumpBufferFrames;
                inputState.jump = true;
            } else if (action === 'attack') {
                inputState.attack = true;
            }
            btn.style.transform = 'scale(0.9)';
        };
        const end = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (action === 'jump') {
                inputState.jump = false;
            } else if (action === 'attack') {
                inputState.attack = false;
            }
            btn.style.transform = 'scale(1)';
        };

        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('touchcancel', end, { passive: false });
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
    }

    // Initialize input system
    function init() {
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        // Detect touch capability
        const isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
        if (isTouchDevice) {
            createTouchButtons();
        }

        // Prevent default behavior for game keys
        const gameKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        gameKeys.forEach(key => {
            document.addEventListener('keydown', (e) => {
                if (e.code === key || (e.code === 'Space' && e.key === ' ')) {
                    e.preventDefault();
                }
            }, { passive: false });
        });
    }

    // Update per frame
    function update() {
        if (inputState.jumpBuffer > 0) {
            inputState.jumpBuffer--;
        }
        if (inputState.coyoteTime > 0) {
            inputState.coyoteTime--;
        }
    }

    // Consume jump buffer (called when jump is actually executed)
    function consumeJumpBuffer() {
        inputState.jumpBuffer = 0;
    }

    // Reset coyote time (called when on ground)
    function resetCoyoteTime() {
        inputState.coyoteTime = inputState.coyoteFrames;
    }

    // Reset all input state
    function reset() {
        inputState.left = false;
        inputState.right = false;
        inputState.jump = false;
        inputState.attack = false;
        inputState.jumpBuffer = 0;
        inputState.coyoteTime = 0;
    }

    // Public API
    global.Input = {
        state: inputState,
        init,
        update,
        reset,
        consumeJumpBuffer,
        resetCoyoteTime
    };

})(window);
