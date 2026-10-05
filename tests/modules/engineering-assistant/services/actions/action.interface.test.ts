import { formatRAGResults } from '../../../../../src/modules/engineering-assistant/services/actions/action.interface';
import { urlValidator } from '../../../../../src/services/utils/url.validator';

jest.mock('../../../../../src/services/utils/url.validator', () => ({
  urlValidator: {
    isTrustedDomain: jest.fn(),
    cleanUrl: jest.fn(),
  },
}));

describe('Action Interface', () => {
  describe('formatRAGResults', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return empty string for empty input', async () => {
      expect(await formatRAGResults([])).toBe('');
      // @ts-ignore
      expect(await formatRAGResults(null)).toBe('');
      // @ts-ignore
      expect(await formatRAGResults(undefined)).toBe('');
    });

    it('should format basic result without metadata', async () => {
      const results = [{ content: 'Test Content' }];
      const output = await formatRAGResults(results);
      expect(output).toBe('[Source 1]: Test Content');
    });

    it('should format result with filename metadata', async () => {
      const results = [
        {
          content: 'Test Content',
          metadata: { filename: 'test.pdf' },
        },
      ];
      const output = await formatRAGResults(results);
      expect(output).toContain('[Source 1]: Test Content (File: test.pdf)');
    });

    it('should format valid URL from trusted domain', async () => {
      const results = [
        {
          content: 'Stats',
          metadata: { url: 'https://epa.gov/stats' },
        },
      ];

      (urlValidator.isTrustedDomain as jest.Mock).mockReturnValue(true);
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue('https://epa.gov/stats');

      const output = await formatRAGResults(results);
      expect(output).toContain('[Source 1]: Stats [https://epa.gov/stats]');
    });

    it('should ignore URL from untrusted domain', async () => {
      const results = [
        {
          content: 'Stats',
          metadata: { url: 'https://untrusted.com' },
        },
      ];

      (urlValidator.isTrustedDomain as jest.Mock).mockReturnValue(false);

      const output = await formatRAGResults(results);
      expect(output).toBe('[Source 1]: Stats');
      expect(urlValidator.cleanUrl).not.toHaveBeenCalled();
    });

    it('should ignore invalid URL after cleaning', async () => {
      const results = [
        {
          content: 'Stats',
          metadata: { url: 'https://epa.gov/invalid' },
        },
      ];

      (urlValidator.isTrustedDomain as jest.Mock).mockReturnValue(true);
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue(null);

      const output = await formatRAGResults(results);
      expect(output).toBe('[Source 1]: Stats');
    });

    it('should format multiple results', async () => {
      const results = [
        { content: 'Content 1' },
        { content: 'Content 2', metadata: { filename: 'doc.txt' } },
      ];

      const output = await formatRAGResults(results);
      expect(output).toContain('[Source 1]: Content 1');
      expect(output).toContain('[Source 2]: Content 2 (File: doc.txt)');
      expect(output.split('\n\n').length).toBe(2);
    });
  });
});
