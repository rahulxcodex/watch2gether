/**
 * Priority Queue (Binary Heap)
 * O(log n) enqueue/dequeue, O(1) peek.
 * Supports custom comparator: comparator(a, b) < 0 means 'a' has higher priority than 'b'.
 */
export type Comparator<T> = (a: T, b: T) => number;
export declare class PriorityQueue<T> {
    private comparator;
    private heap;
    constructor(comparator: Comparator<T>);
    size(): number;
    isEmpty(): boolean;
    peek(): T | undefined;
    enqueue(item: T): void;
    dequeue(): T | undefined;
    toSortedArray(): T[];
    remove(predicate: (item: T) => boolean): boolean;
    private siftUp;
    private siftDown;
    private swap;
}
//# sourceMappingURL=priority-queue.d.ts.map