/**
 * CRDT: Last-Writer-Wins Register (LWW-Register) and LWW-Map
 * Commutative, associative, idempotent state convergence.
 */
export interface LWWState<T> {
    value: T;
    timestamp: number;
    peerId: string;
}
export declare class LWWRegister<T> {
    private _value;
    private _timestamp;
    private _peerId;
    constructor(initialValue: T, timestamp?: number, peerId?: string);
    get value(): T;
    get timestamp(): number;
    get peerId(): string;
    getState(): LWWState<T>;
    /**
     * Update the register locally.
     */
    update(value: T, timestamp?: number, peerId?: string): boolean;
    /**
     * Merge with a remote register state.
     */
    merge(remote: LWWState<T>): boolean;
}
export declare class LWWMap<K extends string | number, V> {
    private registers;
    set(key: K, value: V, timestamp?: number, peerId?: string): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    getMap(): Record<string, V>;
    merge(key: K, remoteState: LWWState<V>): boolean;
}
//# sourceMappingURL=crdt.d.ts.map