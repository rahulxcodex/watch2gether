/**
 * Collaborative Filtering Recommender
 * Computes item-item cosine similarity on user co-viewing interactions.
 */
export interface Recommendation {
    mediaUrl: string;
    score: number;
}
export declare class CollaborativeRecommender {
    private itemUserMatrix;
    recordInteraction(userId: string, mediaUrl: string): void;
    /**
     * Computes cosine similarity between two items based on user overlap:
     * sim(A, B) = |Users_A ∩ Users_B| / sqrt(|Users_A| * |Users_B|)
     */
    getSimilarity(mediaA: string, mediaB: string): number;
    /**
     * Recommends top-K items for a target media item.
     */
    getRecommendationsForMedia(targetMedia: string, limit?: number): Recommendation[];
}
//# sourceMappingURL=collaborative-filtering.d.ts.map