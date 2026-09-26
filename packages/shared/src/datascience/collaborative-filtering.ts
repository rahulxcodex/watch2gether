/**
 * Collaborative Filtering Recommender
 * Computes item-item cosine similarity on user co-viewing interactions.
 */
export interface Recommendation {
  mediaUrl: string;
  score: number;
}

export class CollaborativeRecommender {
  // Map of mediaUrl -> Set of userIds who watched it
  private itemUserMatrix = new Map<string, Set<string>>();

  public recordInteraction(userId: string, mediaUrl: string): void {
    if (!this.itemUserMatrix.has(mediaUrl)) {
      this.itemUserMatrix.set(mediaUrl, new Set());
    }
    this.itemUserMatrix.get(mediaUrl)!.add(userId);
  }

  /**
   * Computes cosine similarity between two items based on user overlap:
   * sim(A, B) = |Users_A ∩ Users_B| / sqrt(|Users_A| * |Users_B|)
   */
  public getSimilarity(mediaA: string, mediaB: string): number {
    const usersA = this.itemUserMatrix.get(mediaA);
    const usersB = this.itemUserMatrix.get(mediaB);

    if (!usersA || !usersB || usersA.size === 0 || usersB.size === 0) {
      return 0;
    }

    let intersectionCount = 0;
    for (const u of usersA) {
      if (usersB.has(u)) {
        intersectionCount++;
      }
    }

    const denominator = Math.sqrt(usersA.size * usersB.size);
    return denominator === 0 ? 0 : Number((intersectionCount / denominator).toFixed(4));
  }

  /**
   * Recommends top-K items for a target media item.
   */
  public getRecommendationsForMedia(targetMedia: string, limit = 5): Recommendation[] {
    const results: Recommendation[] = [];

    for (const otherMedia of this.itemUserMatrix.keys()) {
      if (otherMedia === targetMedia) continue;
      const score = this.getSimilarity(targetMedia, otherMedia);
      if (score > 0) {
        results.push({ mediaUrl: otherMedia, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
