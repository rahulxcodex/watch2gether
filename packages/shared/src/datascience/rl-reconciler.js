"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TabularQReconciler = void 0;
class TabularQReconciler {
    qTable = new Map();
    alpha; // Learning rate
    gamma; // Discount factor
    epsilon; // Exploration rate
    actions = ['NONE', 'RATE_UP', 'RATE_DOWN', 'HARD_SEEK'];
    constructor(alpha = 0.1, gamma = 0.9, epsilon = 0.05) {
        this.alpha = alpha;
        this.gamma = gamma;
        this.epsilon = epsilon;
    }
    /**
     * Discretizes continuous state variables into finite state key.
     */
    discretize(state) {
        const absDrift = Math.abs(state.driftMs);
        let driftBin;
        if (absDrift <= 150)
            driftBin = 'DEADBAND';
        else if (absDrift <= 500)
            driftBin = state.driftMs < 0 ? 'BEHIND_MILD' : 'AHEAD_MILD';
        else if (absDrift <= 1000)
            driftBin = state.driftMs < 0 ? 'BEHIND_MODERATE' : 'AHEAD_MODERATE';
        else
            driftBin = 'CRITICAL';
        const rttBin = state.rttMs < 50 ? 'LOW_RTT' : state.rttMs < 200 ? 'MED_RTT' : 'HIGH_RTT';
        const bufBin = state.bufferSeconds < 2 ? 'LOW_BUF' : state.bufferSeconds < 10 ? 'MED_BUF' : 'HIGH_BUF';
        return `${driftBin}|${rttBin}|${bufBin}`;
    }
    selectAction(state) {
        const stateKey = this.discretize(state);
        this.ensureStateExists(stateKey);
        // Epsilon-greedy exploration
        if (Math.random() < this.epsilon) {
            const randomIndex = Math.floor(Math.random() * this.actions.length);
            return this.actions[randomIndex];
        }
        // Greedy exploitation
        const qValues = this.qTable.get(stateKey);
        let bestAction = 'NONE';
        let bestQ = -Infinity;
        for (const action of this.actions) {
            if (qValues[action] > bestQ) {
                bestQ = qValues[action];
                bestAction = action;
            }
        }
        return bestAction;
    }
    /**
     * Q-learning update step: Q(s, a) = Q(s, a) + alpha * [reward + gamma * max_a' Q(s', a') - Q(s, a)]
     */
    update(prevState, action, reward, nextState) {
        const s = this.discretize(prevState);
        const nextS = this.discretize(nextState);
        this.ensureStateExists(s);
        this.ensureStateExists(nextS);
        const currentQ = this.qTable.get(s)[action];
        const nextQValues = this.qTable.get(nextS);
        const maxNextQ = Math.max(...this.actions.map((a) => nextQValues[a]));
        const target = reward + this.gamma * maxNextQ;
        const newQ = currentQ + this.alpha * (target - currentQ);
        this.qTable.get(s)[action] = Number(newQ.toFixed(4));
    }
    /**
     * Computes scalar reward: penalizes drift magnitude, rebuffering, and hard seeks.
     */
    static computeReward(driftMs, didStall, action) {
        let reward = -Math.abs(driftMs) / 100; // Drift penalty
        if (didStall)
            reward -= 50; // Heavy penalty for player stall
        if (action === 'HARD_SEEK')
            reward -= 10; // Mild penalty for jarring hard seek
        return Number(reward.toFixed(2));
    }
    ensureStateExists(stateKey) {
        if (!this.qTable.has(stateKey)) {
            this.qTable.set(stateKey, {
                NONE: 0,
                RATE_UP: 0,
                RATE_DOWN: 0,
                HARD_SEEK: 0,
            });
        }
    }
    exportQTable() {
        const exported = {};
        for (const [k, v] of this.qTable.entries()) {
            exported[k] = { ...v };
        }
        return exported;
    }
}
exports.TabularQReconciler = TabularQReconciler;
//# sourceMappingURL=rl-reconciler.js.map