/**
 * CRDT: Last-Writer-Wins Register (LWW-Register) and LWW-Map
 * Commutative, associative, idempotent state convergence.
 */
export interface LWWState<T> {
  value: T;
  timestamp: number;
  peerId: string;
}

export class LWWRegister<T> {
  private _value: T;
  private _timestamp: number;
  private _peerId: string;

  constructor(initialValue: T, timestamp: number = Date.now(), peerId: string = 'system') {
    this._value = initialValue;
    this._timestamp = timestamp;
    this._peerId = peerId;
  }

  public get value(): T {
    return this._value;
  }

  public get timestamp(): number {
    return this._timestamp;
  }

  public get peerId(): string {
    return this._peerId;
  }

  public getState(): LWWState<T> {
    return {
      value: this._value,
      timestamp: this._timestamp,
      peerId: this._peerId,
    };
  }

  /**
   * Update the register locally.
   */
  public update(value: T, timestamp: number = Date.now(), peerId: string = this._peerId): boolean {
    if (
      timestamp > this._timestamp ||
      (timestamp === this._timestamp && peerId > this._peerId)
    ) {
      this._value = value;
      this._timestamp = timestamp;
      this._peerId = peerId;
      return true;
    }
    return false;
  }

  /**
   * Merge with a remote register state.
   */
  public merge(remote: LWWState<T>): boolean {
    return this.update(remote.value, remote.timestamp, remote.peerId);
  }
}

export class LWWMap<K extends string | number, V> {
  private registers = new Map<K, LWWRegister<V>>();

  public set(key: K, value: V, timestamp: number = Date.now(), peerId: string = 'system'): void {
    const reg = this.registers.get(key);
    if (!reg) {
      this.registers.set(key, new LWWRegister<V>(value, timestamp, peerId));
    } else {
      reg.update(value, timestamp, peerId);
    }
  }

  public get(key: K): V | undefined {
    return this.registers.get(key)?.value;
  }

  public has(key: K): boolean {
    return this.registers.has(key);
  }

  public getMap(): Record<string, V> {
    const result: Record<string, V> = {};
    for (const [k, reg] of this.registers.entries()) {
      result[String(k)] = reg.value;
    }
    return result;
  }

  public merge(key: K, remoteState: LWWState<V>): boolean {
    const reg = this.registers.get(key);
    if (!reg) {
      this.registers.set(key, new LWWRegister<V>(remoteState.value, remoteState.timestamp, remoteState.peerId));
      return true;
    }
    return reg.merge(remoteState);
  }
}
