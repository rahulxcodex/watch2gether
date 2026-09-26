/**
 * Bloom Filter
 * Space-efficient probabilistic data structure for set membership testing.
 * Uses double hashing: g_i(x) = (h1(x) + i * h2(x)) mod m
 */
export declare class BloomFilter {
    private bits;
    private size;
    private hashCount;
    constructor(sizeBits?: number, hashCount?: number);
    add(item: string): void;
    mightContain(item: string): boolean;
    clear(): void;
    private getIndices;
    private fnv1a;
    private murmurLike;
}
//# sourceMappingURL=bloom-filter.d.ts.map