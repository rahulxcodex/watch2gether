/**
 * Lightweight NLP Chat Moderation & Toxicity Classifier
 * Uses token frequency, sentiment heuristics, and pattern matching for real-time safety.
 */
export interface ModerationVerdict {
    isBlocked: boolean;
    isFlagged: boolean;
    toxicityScore: number;
    flaggedKeywords: string[];
}
export declare class ChatModerator {
    private toxicPatterns;
    private profanityList;
    /**
     * Evaluates message text and returns moderation verdict.
     */
    evaluate(text: string): ModerationVerdict;
}
//# sourceMappingURL=moderation.d.ts.map