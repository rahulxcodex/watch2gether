/**
 * Circular Buffer (Ring Buffer) Data Structure
 * Bounded memory FIFO queue with O(1) push and O(n) full export.
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(public readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than zero');
    }
    this.buffer = new Array<T | undefined>(capacity);
  }

  public push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  public size(): number {
    return this.count;
  }

  public isFull(): boolean {
    return this.count === this.capacity;
  }

  public isEmpty(): boolean {
    return this.count === 0;
  }

  public clear(): void {
    this.buffer = new Array<T | undefined>(this.capacity);
    this.head = 0;
    this.count = 0;
  }

  /**
   * Returns all elements ordered chronologically from oldest to newest.
   */
  public toArray(): T[] {
    if (this.count === 0) return [];
    if (this.count < this.capacity) {
      return this.buffer.slice(0, this.count) as T[];
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ] as T[];
  }
}
