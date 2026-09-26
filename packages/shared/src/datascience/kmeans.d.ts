/**
 * K-Means Clustering Algorithm (Lloyd's Algorithm)
 * Unsupervised clustering for user engagement and telemetry segmentation.
 */
export interface ClusterResult {
    centroids: number[][];
    assignments: number[];
    iterations: number;
}
export declare function kmeans(data: number[][], k: number, maxIterations?: number, tolerance?: number): ClusterResult;
//# sourceMappingURL=kmeans.d.ts.map