"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircularBuffer = void 0;
/**
 * Circular Buffer (Ring Buffer) Data Structure
 * Bounded memory FIFO queue with O(1) push and O(n) full export.
 */
class CircularBuffer {
    capacity;
    buffer;
    head = 0;
    count = 0;
    constructor(capacity) {
        this.capacity = capacity;
        if (capacity <= 0) {
            throw new Error('Capacity must be greater than zero');
        }
        this.buffer = new Array(capacity);
    }
    push(item) {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) {
            this.count++;
        }
    }
    size() {
        return this.count;
    }
    isFull() {
        return this.count === this.capacity;
    }
    isEmpty() {
        return this.count === 0;
    }
    clear() {
        this.buffer = new Array(this.capacity);
        this.head = 0;
        this.count = 0;
    }
    /**
     * Returns all elements ordered chronologically from oldest to newest.
     */
    toArray() {
        if (this.count === 0)
            return [];
        if (this.count < this.capacity) {
            return this.buffer.slice(0, this.count);
        }
        return [
            ...this.buffer.slice(this.head),
            ...this.buffer.slice(0, this.head),
        ];
    }
}
exports.CircularBuffer = CircularBuffer;
//# sourceMappingURL=circular-buffer.js.map