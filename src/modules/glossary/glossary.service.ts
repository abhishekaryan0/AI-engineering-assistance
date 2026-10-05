import * as path from 'path';
import * as fs from 'fs';
import { GlossaryTerm } from './glossary.types';
import { logger } from '../../utils/logger';

export const glossaryService = {
  terms: [] as GlossaryTerm[],
  isInitialized: false,

  /**
   * Initialize the service.
   * Strategy:
   * 1. Try to load from JSON (Fastest local source)
   * 2. (Future) Option to load from DB if configured
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      await this.loadFromJson();
      this.isInitialized = true;
    } catch (error) {
      logger.error('❌ Failed to initialize glossary:', error);
    }
  },

  /**
   * Load terms from the local JSON file.
   * Use this for speed and simplicity.
   */
  async loadFromJson() {
    const filePath = path.resolve(__dirname, 'data/og_glossary.json');

    if (!fs.existsSync(filePath)) {
      logger.warn(`⚠️ Glossary file not found at ${filePath}`);
      return;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent) as GlossaryTerm[];

      this.terms = data;
    } catch (error) {
      logger.error('❌ Error parsing glossary JSON:', error);
    }
  },

  /**
   * Find terms in a query string.
   * Uses in-memory O(N) scan which is extremely fast for < 10,000 terms.
   */
  findTerms(query: string): string[] {
    if (!query || this.terms.length === 0) return [];

    const normalizedQuery = query.toLowerCase();
    const foundTerms: string[] = [];

    const seen = new Set<string>();

    for (const item of this.terms) {
      let isMatch = normalizedQuery.includes(item.term.toLowerCase());

      if (!isMatch && item.related) {
        const relatedTerms = item.related.split(',').map((t) => t.trim().toLowerCase());
        for (const related of relatedTerms) {
          if (related && normalizedQuery.includes(related)) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        if (!seen.has(item.term)) {
          const formatted = `TERM: ${item.term}\nDEFINITION: ${item.definition}\nRELATED: ${item.related || 'None'}`;
          foundTerms.push(formatted);
          seen.add(item.term);
        }
      }
    }

    return foundTerms.slice(0, 5);
  },
};
