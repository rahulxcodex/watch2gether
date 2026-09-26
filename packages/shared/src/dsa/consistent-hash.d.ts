/**
 * Consistent Hash Ring with Virtual Nodes
 * Minimizes key re-allocation during horizontal cluster scaling.
 */
export declare class ConsistentHashRing<T = string> {
    private virtualNodes;
    private hashFn;
    private ring;
    private sortedHashes;
    constructor(virtualNodes?: number, hashFn?: (key: string) => number);
    static defaultHash(key: string): number;
    addNode(node: T, identifier: string): void;
    removeNode(identifier: string): void;
    getNode(key: string): T | undefined;
    private rebuildSortedRing;
}
//# sourceMappingURL=consistent-hash.d.ts.map