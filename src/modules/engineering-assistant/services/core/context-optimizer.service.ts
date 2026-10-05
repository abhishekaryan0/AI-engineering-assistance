/**
 * Context Optimizer Service
 * Optimizes context for LLM by prioritizing and packing by relevance and token budget
 */

import { logger } from '../../../../utils/logger';

export interface ContextItem {
  type: 'history' | 'rag' | 'file' | 'glossary';
  content: string;
  relevance: number; // 0-1, higher = more relevant
  estimatedTokens: number;
  priority: number; // 0-1, higher = more important
  metadata?: { source?: string; index?: number };
}

const TOKEN_ESTIMATE_RATIO = 4; // Approximately 1 token per 4 characters

export const contextOptimizerService = {
  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(content: string): number {
    return Math.ceil(content.length / TOKEN_ESTIMATE_RATIO);
  },

  /**
   * Calculate relevance score between query and content (0-1)
   */
  calculateRelevance(query: string, content: string): number {
    if (!query || !content) return 0.3; // Default if inputs invalid

    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const contentLower = content.toLowerCase();

    if (queryWords.length === 0) return 0.3;

    let matches = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        matches++;
      }
    }

    const score = matches / queryWords.length;
    return Math.min(1, score * 1.2); // Slightly boost high scores
  },

  /**
   * Build optimized context within token budget
   */
  async buildOptimizedContext(
    promptText: string,
    ragResults: Array<{ content: string; similarity: number }>,
    chatHistory: any[],
    fileContext: string,
    glossaryTerms: string[],
    maxTokens = 32000 // Boosted for production-grade large context models (GPT-4o/Claude 3.5)
  ): Promise<{ context: string; usedTokens: number; itemsIncluded: number }> {
    const items: ContextItem[] = [];
    let totalTokens = 0;

    logger.debug(
      `📦 Context optimization started (max ${maxTokens} tokens, ${ragResults.length} RAG results, ${chatHistory.length} history messages)`
    );

    // 1. Add file context (highest priority - User just uploaded or referenced it)
    if (fileContext) {
      // Force high relevance for explicit file context
      const relevance = 1.0;

      // Allow file to take up to 60% of context window (increased from 30%)
      const truncated = this.smartTruncate(fileContext, Math.floor(maxTokens * 0.6));
      const tokens = this.estimateTokens(truncated);

      items.push({
        type: 'file',
        content: truncated,
        relevance,
        estimatedTokens: tokens,
        priority: 1.0, // Highest priority
        metadata: { source: 'uploaded_file' },
      });
      totalTokens += tokens;
    }

    // 2. Add most relevant RAG results (medium-high priority)
    const maxRagTokens = Math.floor(maxTokens * 0.5); // Increased RAG precision budget
    let ragTokensUsed = 0;

    for (let i = 0; i < ragResults.length && ragTokensUsed < maxRagTokens; i++) {
      const rag = ragResults[i];
      const tokens = this.estimateTokens(rag.content);

      if (ragTokensUsed + tokens > maxRagTokens) {
        logger.debug(`  Skipping RAG result ${i}: would exceed budget`);
        break;
      }

      items.push({
        type: 'rag',
        content: rag.content,
        relevance: rag.similarity || 0.5,
        estimatedTokens: tokens,
        priority: rag.similarity || 0.5,
        metadata: { source: 'knowledge_base', index: i },
      });

      ragTokensUsed += tokens;
      totalTokens += tokens;
    }

    // 3. Add most relevant history (selective, not all)
    const maxHistoryTokens = Math.floor(maxTokens * 0.4); // 40% of 32K tokens = ~12.8K tokens purely for history
    let historyTokensUsed = 0;

    const relevantHistory = this.selectRelevantHistory(promptText, chatHistory, 50);
    for (const msg of relevantHistory) {
      const content = `${msg.role}: ${msg.content.substring(0, 500)}`;
      const tokens = this.estimateTokens(content);

      if (historyTokensUsed + tokens > maxHistoryTokens) {
        logger.debug(`  Skipping history message: would exceed budget`);
        break;
      }

      items.push({
        type: 'history',
        content,
        relevance: 0.6,
        estimatedTokens: tokens,
        priority: 0.5,
        metadata: { source: 'conversation_history' },
      });

      historyTokensUsed += tokens;
      totalTokens += tokens;
    }

    // 4. Add glossary terms if space available
    if (glossaryTerms.length > 0) {
      const remainingTokens = maxTokens - totalTokens;
      if (remainingTokens > 50) {
        const glossaryText = glossaryTerms.slice(0, Math.floor(remainingTokens / 30)).join('\n\n');
        const tokens = this.estimateTokens(glossaryText);

        if (tokens <= remainingTokens) {
          items.push({
            type: 'glossary',
            content: glossaryText,
            relevance: 0.4,
            estimatedTokens: tokens,
            priority: 0.3,
            metadata: { source: 'glossary' },
          });
          totalTokens += tokens;
        }
      }
    }

    // 5. Pack items by priority within token budget
    const packed = this.packByPriority(items, maxTokens);

    // 6. Format into context string
    const contextString = this.formatContextItems(packed);

    logger.debug(
      `✅ Context optimized: ${items.length} items → ${packed.length} items, ${totalTokens}/${maxTokens} tokens used`
    );

    return {
      context: contextString,
      usedTokens: totalTokens,
      itemsIncluded: packed.length,
    };
  },

  /**
   * Intelligently select most relevant history messages
   */
  selectRelevantHistory(currentQuery: string, history: any[], maxMessages: number): any[] {
    if (history.length <= maxMessages) {
      return history;
    }

    // Score each message by relevance and recency
    const scored = history.map((msg, idx) => ({
      msg,
      relevance: this.calculateRelevance(currentQuery, msg.content),
      recency: (history.length - idx) / history.length,
      score: 0,
    }));

    // Combine scores: 60% relevance, 40% recency
    scored.forEach((item) => {
      item.score = item.relevance * 0.6 + item.recency * 0.4;
    });

    // Select top messages and re-order chronologically
    const selected = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxMessages)
      .sort((a, b) => history.indexOf(a.msg) - history.indexOf(b.msg))
      .map((item) => item.msg);

    logger.debug(
      `📋 Selected ${selected.length}/${history.length} history messages by relevance + recency`
    );
    return selected;
  },

  /**
   * Smart truncate: keep beginning (40%) and end (40%), indicate truncation
   */
  smartTruncate(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    const keepStart = Math.floor(maxChars * 0.4);
    const keepEnd = Math.floor(maxChars * 0.4);

    const start = content.substring(0, keepStart);
    const end = content.substring(content.length - keepEnd);

    return `${start}\n\n[...${content.length - keepStart - keepEnd} chars truncated...]\n\n${end}`;
  },

  /**
   * Pack items by priority within token budget
   */
  packByPriority(items: ContextItem[], maxTokens: number): ContextItem[] {
    // Sort by priority (descending)
    const sorted = [...items].sort((a, b) => b.priority - a.priority);

    const packed: ContextItem[] = [];
    let usedTokens = 0;

    for (const item of sorted) {
      if (usedTokens + item.estimatedTokens <= maxTokens) {
        packed.push(item);
        usedTokens += item.estimatedTokens;
      } else {
        logger.debug(
          `  Item skipped (${item.type}): ${item.estimatedTokens} tokens would exceed ${maxTokens} token budget`
        );
      }
    }

    return packed;
  },

  /**
   * Format context items for LLM consumption
   */
  formatContextItems(items: ContextItem[]): string {
    if (items.length === 0) {
      return '';
    }

    let formatted = '\n';

    // Group by type
    const grouped = items.reduce(
      (acc, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
      },
      {} as Record<string, ContextItem[]>
    );

    // Format file content
    if (grouped.file?.length) {
      formatted += `### USER UPLOADED FILE(S)\n`;
      grouped.file.forEach((item) => {
        formatted += `${item.content}\n\n`;
      });
    }

    // Format RAG results
    if (grouped.rag?.length) {
      formatted += `### KNOWLEDGE BASE (${grouped.rag.length} sources)\n`;
      grouped.rag.forEach((item, idx) => {
        const confidence = Math.round((item.relevance || 0) * 100);
        formatted += `**[Source ${idx + 1}]** (Relevance: ${confidence}%)\n${item.content}\n\n`;
      });
    }

    // Format history
    if (grouped.history?.length) {
      formatted += `### CONVERSATION HISTORY (${grouped.history.length} messages)\n`;
      grouped.history.forEach((item) => {
        formatted += `${item.content}\n\n`;
      });
    }

    // Format glossary
    if (grouped.glossary?.length) {
      formatted += `### INDUSTRY GLOSSARY\n`;
      formatted += grouped.glossary[0].content;
    }

    return formatted;
  },
};
