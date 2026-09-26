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

export class TabularQReconciler {
  private qTable = new Map<string, Record<RLAction, number>>();
  private alpha: number; // Learning rate
  private gamma: number; // Discount factor
  private epsilon: number; // Exploration rate

  private actions: RLAction[] = ['NONE', 'RATE_UP', 'RATE_DOWN', 'HARD_SEEK'];

  constructor(alpha = 0.1, gamma = 0.9, epsilon = 0.05) {
    this.alpha = alpha;
    this.gamma = gamma;
    this.epsilon = epsilon;
  }

  /**
   * Discretizes continuous state variables into finite state key.
   */
  public discretize(state: RLState): string {
    const absDrift = Math.abs(state.driftMs);
    let driftBin: string;
    if (absDrift <= 150) driftBin = 'DEADBAND';
    else if (absDrift <= 500) driftBin = state.driftMs < 0 ? 'BEHIND_MILD' : 'AHEAD_MILD';
    else if (absDrift <= 1000) driftBin = state.driftMs < 0 ? 'BEHIND_MODERATE' : 'AHEAD_MODERATE';
    else driftBin = 'CRITICAL';

    const rttBin = state.rttMs < 50 ? 'LOW_RTT' : state.rttMs < 200 ? 'MED_RTT' : 'HIGH_RTT';
    const bufBin = state.bufferSeconds < 2 ? 'LOW_BUF' : state.bufferSeconds < 10 ? 'MED_BUF' : 'HIGH_BUF';

    return `${driftBin}|${rttBin}|${bufBin}`;
  }

  public selectAction(state: RLState): RLAction {
    const stateKey = this.discretize(state);
    this.ensureStateExists(stateKey);

    // Epsilon-greedy exploration
    if (Math.random() < this.epsilon) {
      const randomIndex = Math.floor(Math.random() * this.actions.length);
      return this.actions[randomIndex]!;
    }

    // Greedy exploitation
    const qValues = this.qTable.get(stateKey)!;
    let bestAction: RLAction = 'NONE';
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
  public update(prevState: RLState, action: RLAction, reward: number, nextState: RLState): void {
    const s = this.discretize(prevState);
    const nextS = this.discretize(nextState);

    this.ensureStateExists(s);
    this.ensureStateExists(nextS);

    const currentQ = this.qTable.get(s)![action];
    const nextQValues = this.qTable.get(nextS)!;
    const maxNextQ = Math.max(...this.actions.map((a) => nextQValues[a]));

    const target = reward + this.gamma * maxNextQ;
    const newQ = currentQ + this.alpha * (target - currentQ);
    this.qTable.get(s)![action] = Number(newQ.toFixed(4));
  }

  /**
   * Computes scalar reward: penalizes drift magnitude, rebuffering, and hard seeks.
   */
  public static computeReward(driftMs: number, didStall: boolean, action: RLAction): number {
    let reward = -Math.abs(driftMs) / 100; // Drift penalty
    if (didStall) reward -= 50; // Heavy penalty for player stall
    if (action === 'HARD_SEEK') reward -= 10; // Mild penalty for jarring hard seek
    return Number(reward.toFixed(2));
  }

  private ensureStateExists(stateKey: string): void {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, {
        NONE: 0,
        RATE_UP: 0,
        RATE_DOWN: 0,
        HARD_SEEK: 0,
      });
    }
  }

  public exportQTable(): Record<string, Record<RLAction, number>> {
    const exported: Record<string, Record<RLAction, number>> = {};
    for (const [k, v] of this.qTable.entries()) {
      exported[k] = { ...v };
    }
    return exported;
  }
}
