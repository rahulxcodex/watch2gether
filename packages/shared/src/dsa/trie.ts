/**
 * Trie (Prefix Tree) Data Structure
 * Fast O(k) prefix matching and command autocomplete.
 */
export interface TrieEntry<T = unknown> {
  word: string;
  metadata?: T;
}

class TrieNode<T> {
  public children: Map<string, TrieNode<T>> = new Map();
  public isEndOfWord = false;
  public metadata?: T;
}

export class Trie<T = unknown> {
  private root = new TrieNode<T>();

  public insert(word: string, metadata?: T): void {
    let current = this.root;
    for (const char of word) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode<T>());
      }
      current = current.children.get(char)!;
    }
    current.isEndOfWord = true;
    current.metadata = metadata;
  }

  public hasWord(word: string): boolean {
    let current = this.root;
    for (const char of word) {
      if (!current.children.has(char)) return false;
      current = current.children.get(char)!;
    }
    return current.isEndOfWord;
  }

  /**
   * Search for all words starting with the given prefix up to maxResults.
   */
  public searchPrefix(prefix: string, maxResults = 10): TrieEntry<T>[] {
    let current = this.root;
    for (const char of prefix) {
      if (!current.children.has(char)) {
        return [];
      }
      current = current.children.get(char)!;
    }

    const results: TrieEntry<T>[] = [];
    this.collectWords(current, prefix, results, maxResults);
    return results;
  }

  private collectWords(
    node: TrieNode<T>,
    currentWord: string,
    results: TrieEntry<T>[],
    maxResults: number
  ): void {
    if (results.length >= maxResults) return;

    if (node.isEndOfWord) {
      results.push({ word: currentWord, metadata: node.metadata });
    }

    for (const [char, childNode] of node.children.entries()) {
      if (results.length >= maxResults) break;
      this.collectWords(childNode, currentWord + char, results, maxResults);
    }
  }
}
