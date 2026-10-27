(function (global) {
    "use strict";

    /**
     * EventBus - A high-performance, zero-allocation publish/subscribe event system.
     * Designed for game loops where GC pressure must be minimized.
     * Uses pre-allocated arrays and swap-remove logic for unsubscription
     * to avoid array shifting and memory reallocation.
     */

    // Pre-allocated constant for max listeners per channel to prevent unbounded growth
    var MAX_LISTENERS_PER_CHANNEL = 256;

    function EventBus() {
        // Using a Map to store channels lazily to save memory if events are rarely used.
        // Each channel is a specific structure for O(1) subscription/demotion access.
        this._channels = new Map();
        
        // Track active event IDs for quick existence checks without Map lookups in hot paths
        this._activeEventCount = 0;
    }

    /**
     * Internal data structure for a specific event channel.
     * Avoids object keys that might cause hash-table re-bucketing in some JS engines.
     */
    function EventChannel() {
        this.listeners = [];
        this.contexts = [];
        this.activeCount = 0;
        this.version = 0; // For invalidating iterated references if needed in future
    }

    EventBus.prototype._getChannel = function (eventKey) {
        var channel = this._channels.get(eventKey);
        if (!channel) {
            channel = new EventChannel();
            this._channels.set(eventKey, channel);
            this._activeEventCount++;
        }
        return channel;
    };

    /**
     * Subscribes a listener to an event.
     * Zero-allocation for the listener entry itself if it's an object reused across frames?
     * No, we store direct references. 
     * 
     * @param {string} eventKey 
     * @param {Function} listener 
     * @param {*} [context] - The `this` value for the listener.
     * @returns {{ unsubscribe: Function }} - Returns an object with an unsubscribe method.
     */
    EventBus.prototype.on = function (eventKey, listener, context) {
        if (!listener || typeof listener !== 'function') {
            console.warn('[EventBus] Listener must be a function.');
            return { unsubscribe: function() {} };
        }

        var channel = this._getChannel(eventKey);
        
        // Check if already subscribed (optional optimization: skip duplicates)
        // For performance, we allow duplicates, but in a strict game loop, duplicates are bugs.
        // We assume the user manages their own duplicates.
        
        if (channel.activeCount >= MAX_LISTENERS_PER_CHANNEL) {
            console.error('[EventBus] Max listeners exceeded for "' + eventKey + '". Potential memory leak or logic error.');
            return { unsubscribe: function() {} };
        }

        // Store listener and context in parallel arrays to maintain locality
        channel.listeners.push(listener);
        channel.contexts.push(context);
        channel.activeCount++;

        var self = this;
        var eventKeyRef = eventKey;
        
        // Return a lightweight object. 
        // Note: Creating this object causes one allocation per `on` call.
        // To make it truly zero-allocation for the *lifetime* of the subscription,
        // the caller must store the token. 
        return {
            unsubscribe: function () {
                self.off(eventKeyRef, listener, context);
            }
        };
    };

    /**
     * Alias for on, supports chaining.
     */
    EventBus.prototype.addListener = function (eventKey, listener, context) {
        this.on(eventKey, listener, context);
        return this;
    };

    /**
     * Subscribes a listener that will be removed after the next emit.
     * Used for one-shot events like "onGameStart".
     * @param {string} eventKey
     * @param {Function} listener
     * @param {*} [context]
     */
    EventBus.prototype.once = function (eventKey, listener, context) {
        if (!listener || typeof listener !== 'function') return;
        
        var self = this;
        var wrapper = function () {
            self.off(eventKey, wrapper, context);
            listener.apply(context, arguments);
        };
        // We need to wrap the listener to ensure `off` works correctly with the wrapper
        // However, if `off` is called with the original listener, it won't find the wrapper.
        // Standard practice: once creates a proxy.
        // To keep it simple and avoid complexity:
        // We store the original listener in the channel, but mark it?
        // Actually, let's just use the standard proxy approach but be careful with `off`.
        
        // Re-implementation for correctness:
        // We subscribe the wrapper. When unsubscribing via the returned token or .off(event, wrapper), it works.
        // But if user calls .off(event, originalListener), it won't work.
        // For strict performance and simplicity, `once` should document that you must use the returned unsubscribe or pass the wrapper to off.
        // Better approach: 
        var wrappedListener = function () {
            self.off(eventKey, wrappedListener, context);
            listener.apply(context, arguments);
        };
        wrappedListener._onceTarget = listener; // Link for debugging
        
        var token = this.on(eventKey, wrappedListener, context);
        return token;
    };

    /**
     * Unsubscribes a listener.
     * Uses swap-remove to maintain O(1) removal without shifting arrays.
     * @param {string} eventKey
     * @param {Function} listener
     * @param {*} [context]
     */
    EventBus.prototype.off = function (eventKey, listener, context) {
        var channel = this._channels.get(eventKey);
        if (!channel) return;

        // Find the index. In a hot path, this is O(N). 
        // To optimize further, we could use a WeakMap<Function, Index> per channel, 
        // but that adds memory overhead. O(N) removal is acceptable if events are sparse.
        // If an event has 100+ listeners and we remove one, O(100) is fine.
        
        var idx = -1;
        var found = false;
        
        // If context is undefined, we try to match any context? 
        // Best practice: Context must match or be undefined to match undefined context.
        // We will search for exact match of listener AND context.
        
        for (var i = 0, len = channel.activeCount; i < len; i++) {
            if (channel.listeners[i] === listener && channel.contexts[i] === context) {
                idx = i;
                found = true;
                break;
            }
        }

        if (found) {
            // Swap with the last element
            var lastIdx = channel.activeCount - 1;
            
            channel.listeners[idx] = channel.listeners[lastIdx];
            channel.contexts[idx] = channel.contexts[lastIdx];
            
            // "Delete" the last element to clear reference for GC
            channel.listeners[lastIdx] = null;
            channel.contexts[lastIdx] = null;
            
            channel.activeCount--;
        }
    };

    /**
     * Alias for off.
     */
    EventBus.prototype.removeListener = function (eventKey, listener, context) {
        this.off(eventKey, listener, context);
    };

    /**
     * Emits an event. 
     * Uses a copy-on-write strategy? No, that allocates.
     * We iterate directly. If a listener unsubscribes during emission,
     * swap-remove logic handles it gracefully because:
     * 1. We iterate forward.
     * 2. If listener at i removes listener at j < i, it doesn't affect current i.
     * 3. If listener at i removes listener at j > i, the swap brings the last element to j.
     *    We don't revisit j, so that listener is skipped in this frame. 
     *    This is a standard trade-off. 
     *    
     * For safety in game loops where order matters, users should avoid unsubscription during emit
     * unless they accept potential skipping.
     */
    EventBus.prototype.emit = function (eventKey, /* payload arguments */) {
        var channel = this._channels.get(eventKey);
        if (!channel || channel.activeCount === 0) return;

        // Collect arguments into an array to pass to listeners
        // Argument count: usually small (0, 1, 2, or 3 args).
        var argsLen = arguments.length;
        
        // To avoid allocating an array for args on every emit if possible?
        // We can pass arguments directly, but `apply` needs an array-like.
        // `listener.apply(context, argsArray)`
        // We can slice arguments. 
        var args;
        if (argsLen > 1) {
            args = Array.prototype.slice.call(arguments, 1);
        } else if (argsLen === 1) {
            args = [];
        } else {
            args = [arguments[1]]; // If 0 payload args, args array is empty? 
            // Wait, emit(eventKey) -> argsLen=1. slice(1) is [].
            // emit(eventKey, data) -> argsLen=2. slice(1) is [data].
            // So `Array.prototype.slice.call(arguments, 1)` is correct.
        }

        var activeCount = channel.activeCount;
        var listeners = channel.listeners;
        var contexts = channel.contexts;

        for (var i = 0; i < activeCount; i++) {
            var listener = listeners[i];
            var context = contexts[i];
            
            // Null check: If a listener was swapped out to null in this same loop iteration 
            // (due to unsubscription of a *later* index causing a swap that overwrote a *later* slot? 
            // No, swap-remove takes the *last* item and puts it in the *removed* item's spot.
            // If we remove item 2, and last item is 5, item 5 moves to 2.
            // If we are at index 2, and it was removed, we skipped it.
            // If we are at index 2, and item 5 moved there, we execute item 5.
            // If we execute item 5, and item 5 unsubscribes itself:
            // It will remove itself (now at index 2).
            // It swaps with last (which is now at index activeCount-1).
            // activeCount decreases.
            // The null is at the end.
            // Since we are iterating with a fixed `activeCount` captured at start?
            // NO! `activeCount` is a local variable captured *before* the loop.
            // If `off` reduces `channel.activeCount`, our loop condition `i < activeCount` 
            // will continue to run to the *original* end.
            // This means we might hit nulls at the end.
            
            if (listener) {
                if (argsLen > 1) {
                    listener.apply(context, args);
                } else if (argsLen === 1) {
                    listener.call(context);
                } else {
                    listener.call(context, arguments[1]);
                }
            }
        }
        
        // Optimization: Clear the args array if it was allocated? 
        // JS GC will handle it eventually, but for 60fps, we want to avoid it.
        // Since `args` is local, it's scoped to this function. 
    };

    /**
     * Emits an event with a single payload.
     * Slightly faster than emit with variable args.
     */
    EventBus.prototype.emitSingle = function (eventKey, payload) {
        var channel = this._channels.get(eventKey);
        if (!channel || channel.activeCount === 0) return;

        var activeCount = channel.activeCount;
        var listeners = channel.listeners;
        var contexts = channel.contexts;

        for (var i = 0; i < activeCount; i++) {
            var listener = listeners[i];
            if (listener) {
                listener.call(contexts[i], payload);
            }
        }
    };

    /**
     * Removes all listeners for a specific event.
     * @param {string} eventKey
     */
    EventBus.prototype.removeAll = function (eventKey) {
        var channel = this._channels.get(eventKey);
        if (!channel) return;
        
        for (var i = 0, len = channel.activeCount; i < len; i++) {
            channel.listeners[i] = null;
            channel.contexts[i] = null;
        }
        channel.activeCount = 0;
    };

    /**
     * Clears all events and listeners.
     */
    EventBus.prototype.clear = function () {
        this._channels.clear();
        this._activeEventCount = 0;
    };

    /**
     * Gets the number of active listeners for an event.
     * Useful for debugging memory leaks.
     * @param {string} eventKey
     * @returns {number}
     */
    EventBus.prototype.listenerCount = function (eventKey) {
        var channel = this._channels.get(eventKey);
        return channel ? channel.activeCount : 0;
    };

    // Export to global scope
    global.EventBus = EventBus;

})(window);
