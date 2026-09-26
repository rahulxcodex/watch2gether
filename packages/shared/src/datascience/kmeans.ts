/**
 * K-Means Clustering Algorithm (Lloyd's Algorithm)
 * Unsupervised clustering for user engagement and telemetry segmentation.
 */
export interface ClusterResult {
  centroids: number[][];
  assignments: number[]; // Index of cluster per data point
  iterations: number;
}

export function kmeans(
  data: number[][],
  k: number,
  maxIterations = 50,
  tolerance = 1e-4
): ClusterResult {
  if (data.length === 0 || k <= 0) {
    return { centroids: [], assignments: [], iterations: 0 };
  }

  const n = data.length;
  const dimensions = data[0]!.length;
  const numClusters = Math.min(k, n);

  // Initialize centroids with k distinct points
  const centroids: number[][] = [];
  const chosenIndices = new Set<number>();
  for (let i = 0; i < numClusters; i++) {
    let index = Math.floor((i * n) / numClusters);
    while (chosenIndices.has(index)) {
      index = (index + 1) % n;
    }
    chosenIndices.add(index);
    centroids.push([...data[index]!]);
  }

  let assignments = new Array<number>(n).fill(0);
  let iter = 0;

  for (; iter < maxIterations; iter++) {
    let changed = false;

    // Assignment step: assign each point to nearest centroid
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < numClusters; c++) {
        const dist = euclideanDistanceSq(data[i]!, centroids[c]!);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed && iter > 0) break;

    // Update step: recompute centroids
    const sums = Array.from({ length: numClusters }, () => new Array<number>(dimensions).fill(0));
    const counts = new Array<number>(numClusters).fill(0);

    for (let i = 0; i < n; i++) {
      const c = assignments[i]!;
      counts[c]++;
      for (let d = 0; d < dimensions; d++) {
        sums[c]![d] += data[i]![d]!;
      }
    }

    let maxShift = 0;
    for (let c = 0; c < numClusters; c++) {
      if (counts[c]! > 0) {
        for (let d = 0; d < dimensions; d++) {
          const newCoord = sums[c]![d]! / counts[c]!;
          const diff = Math.abs(newCoord - centroids[c]![d]!);
          if (diff > maxShift) maxShift = diff;
          centroids[c]![d] = newCoord;
        }
      }
    }

    if (maxShift < tolerance) break;
  }

  return {
    centroids: centroids.map((c) => c.map((v) => Number(v.toFixed(4)))),
    assignments,
    iterations: iter + 1,
  };
}

function euclideanDistanceSq(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return sum;
}
