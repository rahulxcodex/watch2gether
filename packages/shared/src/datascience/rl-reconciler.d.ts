/**
 * Reinforcement Learning: Tabular Q-Learning Drift Reconciler
 * Learns optimal playback reconciliation action per network and buffer condition.
 */
export type RLAction = 'NONE' | 'RATE_UP' | 'RATE_DOWN' | 'HARD_SEEK';
export interface RLState {
    driftMs: number;
    rttMs: number;
    bufferSeconds: number;
}
export declare class TabularQReconciler {
    private qTable;
    private alpha;
    private gamma;
    private epsilon;
    private actions;
    constructor(alpha?: number, gamma?: number, epsilon?: number);
    /**
     * Discretizes continuous state variables into finite state key.
     */
    discretize(state: RLState): string;
    selectAction(state: RLState): RLAction;
    /**
     * Q-learning update step: Q(s, a) = Q(s, a) + alpha * [reward + gamma * max_a' Q(s', a') - Q(s, a)]
     */
    update(prevState: RLState, action: RLAction, reward: number, nextState: RLState): void;
    /**
     * Computes scalar reward: penalizes drift magnitude, rebuffering, and hard seeks.
     */
    static computeReward(driftMs: number, didStall: boolean, action: RLAction): number;
    private ensureStateExists;
    exportQTable(): Record<string, Record<RLAction, number>>;
}
//# sourceMappingURL=rl-reconciler.d.ts.map