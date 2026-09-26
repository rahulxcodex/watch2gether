/**
 * Bloom Filter
 * Space-efficient probabilistic data structure for set membership testing.
 * Uses double hashing: g_i(x) = (h1(x) + i * h2(x)) mod m
 */
export class BloomFilter {
  private bits: Uint8Array;
  private size: number;
  private hashCount: number;

  constructor(sizeBits: number = 2048, hashCount: number = 4) {
    this.size = sizeBits;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(Math.ceil(sizeBits / 8));
  }

  public add(item: string): void {
    const indices = this.getIndices(item);
    for (const index of indices) {
      const byteIndex = Math.floor(index / 8);
      const bitOffset = index % 8;
      this.bits[byteIndex]! |= (1 << bitOffset);
    }
  }

  public mightContain(item: string): boolean {
    const indices = this.getIndices(item);
    for (const index of indices) {
      const byteIndex = Math.floor(index / 8);
      const bitOffset = index % 8;
      if ((this.bits[byteIndex]! & (1 << bitOffset)) === 0) {
        return false;
      }
    }
    return true;
  }

  public clear(): void {
    this.bits.fill(0);
  }

  private getIndices(item: string): number[] {
    const h1 = this.fnv1a(item);
    const h2 = this.murmurLike(item);
    const indices: number[] = [];

    for (let i = 0; i < this.hashCount; i++) {
      const combined = Math.abs((h1 + i * h2) % this.size);
      indices.push(combined);
    }
    return indices;
  }

  private fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private murmurLike(str: string): number {
    let hash = 0xdeadbeef;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(hash ^ str.charCodeAt(i), 0x5bd1e995);
      hash ^= hash >>> 15;
    }
    return hash >>> 0;
  }
}
