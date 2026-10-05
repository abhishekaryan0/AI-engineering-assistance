export interface GlossaryTerm {
  id?: string;
  term: string;
  definition: string;
  related?: string;
  source?: string;
}

export interface SearchResult {
  term: GlossaryTerm;
  matchType: 'exact' | 'partial' | 'semantic';
  score?: number;
}
