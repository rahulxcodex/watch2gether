/**
 * Sweep Line Concurrency Analyzer
 * Computes peak concurrent users and timeline intervals in O(n log n).
 */
export interface UserSessionInterval {
    userId: string;
    startTime: number;
    endTime: number;
}
export interface PeakConcurrencyResult {
    peakCount: number;
    peakTimeStart: number;
    peakTimeEnd: number;
}
export declare function computePeakConcurrency(sessions: UserSessionInterval[]): PeakConcurrencyResult;
//# sourceMappingURL=concurrency-sweepline.d.ts.map