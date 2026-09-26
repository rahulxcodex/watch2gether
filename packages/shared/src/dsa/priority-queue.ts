/**
 * Priority Queue (Binary Heap)
 * O(log n) enqueue/dequeue, O(1) peek.
 * Supports custom comparator: comparator(a, b) < 0 means 'a' has higher priority than 'b'.
 */
export type Comparator<T> = (a: T, b: T) => number;

export class PriorityQueue<T> {
  private heap: T[] = [];

  constructor(private comparator: Comparator<T>) {}

  public size(): number {
    return this.heap.length;
  }

  public isEmpty(): boolean {
    return this.heap.length === 0;
  }

  public peek(): T | undefined {
    return this.heap[0];
  }

  public enqueue(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  public dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.siftDown(0);
    }
    return top;
  }

  public toSortedArray(): T[] {
    const clone = new PriorityQueue<T>(this.comparator);
    clone.heap = [...this.heap];
    const result: T[] = [];
    while (!clone.isEmpty()) {
      result.push(clone.dequeue()!);
    }
    return result;
  }

  public remove(predicate: (item: T) => boolean): boolean {
    const index = this.heap.findIndex(predicate);
    if (index === -1) return false;
    const bottom = this.heap.pop()!;
    if (index < this.heap.length) {
      this.heap[index] = bottom;
      this.siftDown(index);
      this.siftUp(index);
    }
    return true;
  }

  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.comparator(this.heap[current]!, this.heap[parent]!) < 0) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.heap.length;
    while (true) {
      const left = 2 * current + 1;
      const right = 2 * current + 2;
      let smallest = current;

      if (left < length && this.comparator(this.heap[left]!, this.heap[smallest]!) < 0) {
        smallest = left;
      }
      if (right < length && this.comparator(this.heap[right]!, this.heap[smallest]!) < 0) {
        smallest = right;
      }

      if (smallest !== current) {
        this.swap(current, smallest);
        current = smallest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = temp;
  }
}
