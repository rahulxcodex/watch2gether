/**
 * Circular Buffer (Ring Buffer) Data Structure
 * Bounded memory FIFO queue with O(1) push and O(n) full export.
 */
export declare class CircularBuffer<T> {
    readonly capacity: number;
    private buffer;
    private head;
    private count;
    constructor(capacity: number);
    push(item: T): void;
    size(): number;
    isFull(): boolean;
    isEmpty(): boolean;
    clear(): void;
    /**
     * Returns all elements ordered chronologically from oldest to newest.
     */
    toArray(): T[];
}
//# sourceMappingURL=circular-buffer.d.ts.map