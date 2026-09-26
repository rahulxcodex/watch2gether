/**
 * Consistent Hash Ring with Virtual Nodes
 * Minimizes key re-allocation during horizontal cluster scaling.
 */
export class ConsistentHashRing<T = string> {
  private ring = new Map<number, T>();
  private sortedHashes: number[] = [];

  constructor(
    private virtualNodes: number = 60,
    private hashFn: (key: string) => number = ConsistentHashRing.defaultHash
  ) {}

  public static defaultHash(key: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  public addNode(node: T, identifier: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const vKey = `${identifier}#vnode-${i}`;
      const hash = this.hashFn(vKey);
      this.ring.set(hash, node);
    }
    this.rebuildSortedRing();
  }

  public removeNode(identifier: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const vKey = `${identifier}#vnode-${i}`;
      const hash = this.hashFn(vKey);
      this.ring.delete(hash);
    }
    this.rebuildSortedRing();
  }

  public getNode(key: string): T | undefined {
    if (this.sortedHashes.length === 0) return undefined;

    const hash = this.hashFn(key);
    // Binary search on sorted virtual node hashes
    let low = 0;
    let high = this.sortedHashes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedHashes[mid]! >= hash) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    // Wrap around the ring if needed
    const index = low >= this.sortedHashes.length ? 0 : low;
    const ringHash = this.sortedHashes[index]!;
    return this.ring.get(ringHash);
  }

  private rebuildSortedRing(): void {
    this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }
}
