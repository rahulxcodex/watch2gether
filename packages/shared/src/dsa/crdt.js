"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LWWMap = exports.LWWRegister = void 0;
class LWWRegister {
    _value;
    _timestamp;
    _peerId;
    constructor(initialValue, timestamp = Date.now(), peerId = 'system') {
        this._value = initialValue;
        this._timestamp = timestamp;
        this._peerId = peerId;
    }
    get value() {
        return this._value;
    }
    get timestamp() {
        return this._timestamp;
    }
    get peerId() {
        return this._peerId;
    }
    getState() {
        return {
            value: this._value,
            timestamp: this._timestamp,
            peerId: this._peerId,
        };
    }
    /**
     * Update the register locally.
     */
    update(value, timestamp = Date.now(), peerId = this._peerId) {
        if (timestamp > this._timestamp ||
            (timestamp === this._timestamp && peerId > this._peerId)) {
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
    merge(remote) {
        return this.update(remote.value, remote.timestamp, remote.peerId);
    }
}
exports.LWWRegister = LWWRegister;
class LWWMap {
    registers = new Map();
    set(key, value, timestamp = Date.now(), peerId = 'system') {
        const reg = this.registers.get(key);
        if (!reg) {
            this.registers.set(key, new LWWRegister(value, timestamp, peerId));
        }
        else {
            reg.update(value, timestamp, peerId);
        }
    }
    get(key) {
        return this.registers.get(key)?.value;
    }
    has(key) {
        return this.registers.has(key);
    }
    getMap() {
        const result = {};
        for (const [k, reg] of this.registers.entries()) {
            result[String(k)] = reg.value;
        }
        return result;
    }
    merge(key, remoteState) {
        const reg = this.registers.get(key);
        if (!reg) {
            this.registers.set(key, new LWWRegister(remoteState.value, remoteState.timestamp, remoteState.peerId));
            return true;
        }
        return reg.merge(remoteState);
    }
}
exports.LWWMap = LWWMap;
//# sourceMappingURL=crdt.js.map