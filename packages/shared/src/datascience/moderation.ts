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

export class ChatModerator {
  private toxicPatterns: RegExp[] = [
    /\b(spam|nuke|botnet|free\s*crypto|scam|phish)\b/i,
    /\b(kill\s*yourself|kys|hate\s*speech)\b/i,
  ];

  private profanityList = new Set([
    'bastard', 'asshole', 'fuck', 'shit', 'bitch', 'crap', 'cunt', 'dick', 'pussy'
  ]);

  /**
   * Evaluates message text and returns moderation verdict.
   */
  public evaluate(text: string): ModerationVerdict {
    const normalized = text.toLowerCase().trim();
    const tokens = normalized.split(/\s+|[.,!?;:()]+/).filter(Boolean);
    const flaggedKeywords: string[] = [];

    let toxicityScore = 0;

    // Check regex patterns
    for (const pattern of this.toxicPatterns) {
      if (pattern.test(normalized)) {
        toxicityScore += 0.6;
        flaggedKeywords.push(pattern.source);
      }
    }

    // Check profanity / toxic lexicon
    for (const token of tokens) {
      if (this.profanityList.has(token)) {
        toxicityScore += 0.35;
        if (!flaggedKeywords.includes(token)) {
          flaggedKeywords.push(token);
        }
      }
    }

    // Check character repetition spam e.g. "aaaaaahhhhhhh"
    if (/(.)\1{7,}/.test(normalized)) {
      toxicityScore += 0.25;
      flaggedKeywords.push('char_repetition_spam');
    }

    // Check ALL-CAPS screaming (if message length > 10)
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    if (text.length > 10 && upperCount / text.length > 0.8) {
      toxicityScore += 0.15;
      flaggedKeywords.push('excessive_caps');
    }

    toxicityScore = Math.min(1.0, Number(toxicityScore.toFixed(3)));

    return {
      isBlocked: toxicityScore >= 0.8,
      isFlagged: toxicityScore >= 0.5,
      toxicityScore,
      flaggedKeywords,
    };
  }
}
