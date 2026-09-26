"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollaborativeRecommender = void 0;
class CollaborativeRecommender {
    // Map of mediaUrl -> Set of userIds who watched it
    itemUserMatrix = new Map();
    recordInteraction(userId, mediaUrl) {
        if (!this.itemUserMatrix.has(mediaUrl)) {
            this.itemUserMatrix.set(mediaUrl, new Set());
        }
        this.itemUserMatrix.get(mediaUrl).add(userId);
    }
    /**
     * Computes cosine similarity between two items based on user overlap:
     * sim(A, B) = |Users_A ∩ Users_B| / sqrt(|Users_A| * |Users_B|)
     */
    getSimilarity(mediaA, mediaB) {
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
    getRecommendationsForMedia(targetMedia, limit = 5) {
        const results = [];
        for (const otherMedia of this.itemUserMatrix.keys()) {
            if (otherMedia === targetMedia)
                continue;
            const score = this.getSimilarity(targetMedia, otherMedia);
            if (score > 0) {
                results.push({ mediaUrl: otherMedia, score });
            }
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }
}
exports.CollaborativeRecommender = CollaborativeRecommender;
//# sourceMappingURL=collaborative-filtering.js.map