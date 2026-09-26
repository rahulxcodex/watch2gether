"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityQueue = void 0;
class PriorityQueue {
    comparator;
    heap = [];
    constructor(comparator) {
        this.comparator = comparator;
    }
    size() {
        return this.heap.length;
    }
    isEmpty() {
        return this.heap.length === 0;
    }
    peek() {
        return this.heap[0];
    }
    enqueue(item) {
        this.heap.push(item);
        this.siftUp(this.heap.length - 1);
    }
    dequeue() {
        if (this.isEmpty())
            return undefined;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = bottom;
            this.siftDown(0);
        }
        return top;
    }
    toSortedArray() {
        const clone = new PriorityQueue(this.comparator);
        clone.heap = [...this.heap];
        const result = [];
        while (!clone.isEmpty()) {
            result.push(clone.dequeue());
        }
        return result;
    }
    remove(predicate) {
        const index = this.heap.findIndex(predicate);
        if (index === -1)
            return false;
        const bottom = this.heap.pop();
        if (index < this.heap.length) {
            this.heap[index] = bottom;
            this.siftDown(index);
            this.siftUp(index);
        }
        return true;
    }
    siftUp(index) {
        let current = index;
        while (current > 0) {
            const parent = Math.floor((current - 1) / 2);
            if (this.comparator(this.heap[current], this.heap[parent]) < 0) {
                this.swap(current, parent);
                current = parent;
            }
            else {
                break;
            }
        }
    }
    siftDown(index) {
        let current = index;
        const length = this.heap.length;
        while (true) {
            const left = 2 * current + 1;
            const right = 2 * current + 2;
            let smallest = current;
            if (left < length && this.comparator(this.heap[left], this.heap[smallest]) < 0) {
                smallest = left;
            }
            if (right < length && this.comparator(this.heap[right], this.heap[smallest]) < 0) {
                smallest = right;
            }
            if (smallest !== current) {
                this.swap(current, smallest);
                current = smallest;
            }
            else {
                break;
            }
        }
    }
    swap(i, j) {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;
    }
}
exports.PriorityQueue = PriorityQueue;
//# sourceMappingURL=priority-queue.js.map