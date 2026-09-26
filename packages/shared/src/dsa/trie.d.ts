/**
 * Trie (Prefix Tree) Data Structure
 * Fast O(k) prefix matching and command autocomplete.
 */
export interface TrieEntry<T = unknown> {
    word: string;
    metadata?: T;
}
export declare class Trie<T = unknown> {
    private root;
    insert(word: string, metadata?: T): void;
    hasWord(word: string): boolean;
    /**
     * Search for all words starting with the given prefix up to maxResults.
     */
    searchPrefix(prefix: string, maxResults?: number): TrieEntry<T>[];
    private collectWords;
}
//# sourceMappingURL=trie.d.ts.map