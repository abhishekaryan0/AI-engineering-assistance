import { glossaryService } from '../../../src/modules/glossary/glossary.service';
import * as fs from 'fs';
import { GlossaryTerm } from '../../../src/modules/glossary/glossary.types';

jest.mock('fs');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('GlossaryService', () => {
  const mockTerms: GlossaryTerm[] = [
    { term: 'API', definition: 'Application Programming Interface', related: 'REST, GraphQL' },
    { term: 'Database', definition: 'Organized collection of data', related: 'SQL, NoSQL' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    glossaryService.terms = [];
    glossaryService.isInitialized = false;
  });

  describe('initialize', () => {
    it('should load terms from JSON if initialized', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockTerms));

      await glossaryService.initialize();

      expect(glossaryService.terms).toEqual(mockTerms);
      expect(glossaryService.isInitialized).toBe(true);
    });

    it('should not reload if already initialized', async () => {
      glossaryService.isInitialized = true;
      await glossaryService.initialize();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle missing file gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      await glossaryService.loadFromJson();
      expect(glossaryService.terms).toEqual([]);
    });

    it('should handle JSON parse error', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      await glossaryService.loadFromJson();
      expect(glossaryService.terms).toEqual([]);
    });
  });

  describe('findTerms', () => {
    beforeEach(() => {
      glossaryService.terms = mockTerms;
    });

    it('should return matching terms', () => {
      const result = glossaryService.findTerms('Tell me about API');
      expect(result.length).toBe(1);
      expect(result[0]).toContain('TERM: API');
    });

    it('should return terms matching related keywords', () => {
      const result = glossaryService.findTerms('How does REST work?');
      expect(result.length).toBe(1);
      expect(result[0]).toContain('TERM: API'); // Matches because REST is related to API
    });

    it('should find terms regardless of case', () => {
      const result = glossaryService.findTerms('Is the DATABASE ready?');
      expect(result.length).toBe(1);
      expect(result[0]).toContain('TERM: Database');
    });

    it('should return empty list if no match found', () => {
      const result = glossaryService.findTerms('Nothing here');
      expect(result).toEqual([]);
    });
  });
});
