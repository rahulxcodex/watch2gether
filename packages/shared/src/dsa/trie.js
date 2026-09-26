"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trie = void 0;
class TrieNode {
    children = new Map();
    isEndOfWord = false;
    metadata;
}
class Trie {
    root = new TrieNode();
    insert(word, metadata) {
        let current = this.root;
        for (const char of word) {
            if (!current.children.has(char)) {
                current.children.set(char, new TrieNode());
            }
            current = current.children.get(char);
        }
        current.isEndOfWord = true;
        current.metadata = metadata;
    }
    hasWord(word) {
        let current = this.root;
        for (const char of word) {
            if (!current.children.has(char))
                return false;
            current = current.children.get(char);
        }
        return current.isEndOfWord;
    }
    /**
     * Search for all words starting with the given prefix up to maxResults.
     */
    searchPrefix(prefix, maxResults = 10) {
        let current = this.root;
        for (const char of prefix) {
            if (!current.children.has(char)) {
                return [];
            }
            current = current.children.get(char);
        }
        const results = [];
        this.collectWords(current, prefix, results, maxResults);
        return results;
    }
    collectWords(node, currentWord, results, maxResults) {
        if (results.length >= maxResults)
            return;
        if (node.isEndOfWord) {
            results.push({ word: currentWord, metadata: node.metadata });
        }
        for (const [char, childNode] of node.children.entries()) {
            if (results.length >= maxResults)
                break;
            this.collectWords(childNode, currentWord + char, results, maxResults);
        }
    }
}
exports.Trie = Trie;
//# sourceMappingURL=trie.js.map