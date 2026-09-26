"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsistentHashRing = void 0;
/**
 * Consistent Hash Ring with Virtual Nodes
 * Minimizes key re-allocation during horizontal cluster scaling.
 */
class ConsistentHashRing {
    virtualNodes;
    hashFn;
    ring = new Map();
    sortedHashes = [];
    constructor(virtualNodes = 60, hashFn = ConsistentHashRing.defaultHash) {
        this.virtualNodes = virtualNodes;
        this.hashFn = hashFn;
    }
    static defaultHash(key) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return hash >>> 0;
    }
    addNode(node, identifier) {
        for (let i = 0; i < this.virtualNodes; i++) {
            const vKey = `${identifier}#vnode-${i}`;
            const hash = this.hashFn(vKey);
            this.ring.set(hash, node);
        }
        this.rebuildSortedRing();
    }
    removeNode(identifier) {
        for (let i = 0; i < this.virtualNodes; i++) {
            const vKey = `${identifier}#vnode-${i}`;
            const hash = this.hashFn(vKey);
            this.ring.delete(hash);
        }
        this.rebuildSortedRing();
    }
    getNode(key) {
        if (this.sortedHashes.length === 0)
            return undefined;
        const hash = this.hashFn(key);
        // Binary search on sorted virtual node hashes
        let low = 0;
        let high = this.sortedHashes.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.sortedHashes[mid] >= hash) {
                high = mid - 1;
            }
            else {
                low = mid + 1;
            }
        }
        // Wrap around the ring if needed
        const index = low >= this.sortedHashes.length ? 0 : low;
        const ringHash = this.sortedHashes[index];
        return this.ring.get(ringHash);
    }
    rebuildSortedRing() {
        this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
    }
}
exports.ConsistentHashRing = ConsistentHashRing;
//# sourceMappingURL=consistent-hash.js.map