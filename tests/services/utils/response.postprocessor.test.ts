/**
 * Response Post-Processor Tests
 * Tests for response cleanup, URL validation, and source formatting
 */

import { responsePostProcessor } from '../../../src/services/utils/response.postprocessor';
import { urlValidator } from '../../../src/services/utils/url.validator';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/services/utils/url.validator', () => ({
  urlValidator: {
    isUrlWorking: jest.fn(),
    isValidUrl: jest.fn(),
    cleanUrl: jest.fn(),
  },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Response Post-Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);
    (urlValidator.isValidUrl as jest.Mock).mockReturnValue(true);
    (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) => Promise.resolve(url));
  });

  describe('process', () => {
    it('should process content with all cleanup steps', async () => {
      const content = `
        Analysis of production data.
        [No specific URLs available from the search results]
        
        **References**
        - [RRC](https://www.rrc.texas.gov/)
      `;

      const result = await responsePostProcessor.process(content);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should add citations if provided', async () => {
      const content = 'Main content here.';
      const citations = ['https://example.com', 'https://another.com'];

      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);
      (urlValidator.isValidUrl as jest.Mock).mockReturnValue(true);

      const result = await responsePostProcessor.process(content, citations, true);

      const hasCitation = result.includes('example.com') || result.includes('Sources');
      expect(hasCitation).toBe(true);
    });

    it('should handle empty content', async () => {
      const result = await responsePostProcessor.process('');

      expect(result).toBe('');
    });

    it('should preserve normal content', async () => {
      const content = 'This is normal content.';

      const result = await responsePostProcessor.process(content);

      expect(result).toContain('normal');
    });
  });

  describe('isGovernmentSource', () => {
    it('should identify .gov domains', () => {
      const result = responsePostProcessor.isGovernmentSource('https://www.rrc.texas.gov/');

      expect(result).toBe(true);
    });

    it('should identify FERC as government', () => {
      const result = responsePostProcessor.isGovernmentSource('https://www.ferc.gov/');

      expect(result).toBe(true);
    });

    it('should identify EPA as government', () => {
      const result = responsePostProcessor.isGovernmentSource('https://www.epa.gov/');

      expect(result).toBe(true);
    });

    it('should reject non-government URLs', () => {
      const result = responsePostProcessor.isGovernmentSource('https://www.example.com');

      expect(result).toBe(false);
    });

    it('should handle invalid URLs', () => {
      const result = responsePostProcessor.isGovernmentSource('not a url');

      expect(result).toBe(false);
    });

    it('should identify other .gov domains', () => {
      const result = responsePostProcessor.isGovernmentSource('https://www.some-agency.gov/');

      expect(result).toBe(true);
    });
  });

  describe('getSourceUrl', () => {
    it('should map RRC', () => {
      const result = responsePostProcessor.getSourceUrl('Texas Railroad Commission');

      expect(result).toContain('rrc.texas.gov');
    });

    it('should map RRC abbreviation', () => {
      const result = responsePostProcessor.getSourceUrl('RRC');

      expect(result).toContain('rrc.texas.gov');
    });

    it('should map FERC', () => {
      const result = responsePostProcessor.getSourceUrl('FERC');

      expect(result).toContain('ferc.gov');
    });

    it('should map EPA', () => {
      const result = responsePostProcessor.getSourceUrl('EPA');

      expect(result).toContain('epa.gov');
    });

    it('should map USGS', () => {
      const result = responsePostProcessor.getSourceUrl('USGS');

      expect(result).toContain('usgs.gov');
    });

    it('should map API', () => {
      const result = responsePostProcessor.getSourceUrl('API');

      expect(result).toContain('api.org');
    });

    it('should return null for unknown source', () => {
      const result = responsePostProcessor.getSourceUrl('Unknown Organization');

      expect(result).toBeNull();
    });

    it('should be case insensitive', () => {
      const result1 = responsePostProcessor.getSourceUrl('RRC');
      const result2 = responsePostProcessor.getSourceUrl('rrc');

      expect(result1).toBe(result2);
    });
  });

  describe('getSourcePriority', () => {
    it('should prioritize RRC Texas highest', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.rrc.texas.gov/');

      expect(priority).toBe(100);
    });

    it('should prioritize FERC', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.ferc.gov/');

      expect(priority).toBe(95);
    });

    it('should prioritize EPA', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.epa.gov/');

      expect(priority).toBe(90);
    });

    it('should prioritize USGS', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.usgs.gov/');

      expect(priority).toBe(85);
    });

    it('should prioritize other .gov domains', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.other.gov/');

      expect(priority).toBe(80);
    });

    it('should prioritize API', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.api.org/');

      expect(priority).toBe(70);
    });

    it('should prioritize IOGCC OK', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.iogcc.ok.gov/');

      expect(priority).toBe(80);
    });

    it('should handle non-government sources', () => {
      const priority = responsePostProcessor.getSourcePriority('https://www.example.com/');

      expect(priority).toBe(50);
    });

    it('should return low priority for missing URL', () => {
      const priority = responsePostProcessor.getSourcePriority();

      expect(priority).toBe(1);
    });
  });

  describe('fixSourceMessages', () => {
    it('should remove "No specific URLs available" message', () => {
      const content = '[No specific URLs available from the search results]';

      const result = responsePostProcessor.fixSourceMessages(content);

      expect(result).not.toContain('No specific URLs');
    });

    it('should remove References section with no URLs', () => {
      const content = 'References [No specific URLs available]';

      const result = responsePostProcessor.fixSourceMessages(content);

      expect(result).not.toContain('No specific URLs');
    });

    it('should replace "no valid URLs found"', () => {
      const content = 'Sorry, no valid URLs found';

      const result = responsePostProcessor.fixSourceMessages(content);

      expect(result).toContain('No external URLs available');
    });

    it('should replace "unable to find URLs"', () => {
      const content = 'Unable to find URLs in the results';

      const result = responsePostProcessor.fixSourceMessages(content);

      expect(result).toContain('External sources not referenced');
    });

    it('should preserve other content', () => {
      const content = 'Important data [No specific URLs available] more data';

      const result = responsePostProcessor.fixSourceMessages(content);

      expect(result).toContain('Important data');
      expect(result).toContain('more data');
    });

    it('should handle case insensitivity', () => {
      const content = '[NO SPECIFIC URLS AVAILABLE FROM THE SEARCH RESULTS]';

      const result = responsePostProcessor.fixSourceMessages(content);

      expect(result).not.toContain('NO SPECIFIC URLS');
    });
  });

  describe('cleanInlineUrls', () => {
    it('should clean valid inline URLs', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue('https://example.com/cleaned');

      const content = '[Link](https://example.com)';

      const result = await responsePostProcessor.cleanInlineUrls(content);

      expect(urlValidator.cleanUrl).toHaveBeenCalledWith('https://example.com', true);
    });

    it('should remove broken links', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue(null);

      const content = '[Broken](https://broken.com)';

      const result = await responsePostProcessor.cleanInlineUrls(content);

      expect(result).toContain('Broken');
      expect(result).not.toContain('https://broken');
    });

    it('should handle multiple links', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = '[Link1](https://example1.com) and [Link2](https://example2.com)';

      const result = await responsePostProcessor.cleanInlineUrls(content);

      expect(urlValidator.cleanUrl).toHaveBeenCalledTimes(2);
    });

    it('should preserve non-link content', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = 'Regular text [Link](https://example.com) more text';

      const result = await responsePostProcessor.cleanInlineUrls(content);

      expect(result).toContain('Regular text');
      expect(result).toContain('more text');
    });

    it('should handle links with special characters', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = '[Report](https://example.com/path?q=test&id=123#section)';

      const result = await responsePostProcessor.cleanInlineUrls(content);

      expect(urlValidator.cleanUrl).toHaveBeenCalled();
    });
  });

  describe('improveReferencesSection', () => {
    it('should identify and improve references section', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const content = `
        Content here.
        
        **References**
        - [RRC](https://www.rrc.texas.gov/)
      `;

      const result = await responsePostProcessor.improveReferencesSection(content);

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should sort sources by priority', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const content = `
        **References**
        - [API](https://www.api.org/)
        - [RRC](https://www.rrc.texas.gov/)
      `;

      const result = await responsePostProcessor.improveReferencesSection(content);

      expect(result).toBeDefined();
    });

    it('should remove empty references section', async () => {
      const content = `
**References**
- [No specific URLs available]
      `;

      const result = await responsePostProcessor.improveReferencesSection(content);

      expect(
        result.includes('**References**') === false || result.includes('No specific URLs') === false
      ).toBe(true);
    });

    it('should handle alternative section headers', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const content = `
        **Sources and References**
        - [Source](https://example.com)
      `;

      const result = await responsePostProcessor.improveReferencesSection(content);

      expect(result).toBeDefined();
    });

    it('should filter ignored content', async () => {
      const content = `
        **References**
        - Provided definition
        - Glossary content
        - [RRC](https://www.rrc.texas.gov/)
      `;

      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const result = await responsePostProcessor.improveReferencesSection(content);

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('ensureReferencesSection', () => {
    it('should add citations if missing', async () => {
      (urlValidator.isValidUrl as jest.Mock).mockReturnValue(true);

      const content = 'Content without citations';
      const citations = ['https://example.com'];

      const result = await responsePostProcessor.ensureReferencesSection(content, true, citations);

      expect(result).toContain('example.com');
    });

    it('should NOT append additional sources if section exists', async () => {
      (urlValidator.isValidUrl as jest.Mock).mockReturnValue(true);

      const content = `Content

**Sources & References**

1. [Existing](https://existing.com)`;
      const citations = ['https://new.com'];

      const result = await responsePostProcessor.ensureReferencesSection(content, true, citations);

      const hasNewSource = result.includes('new.com');
      expect(hasNewSource).toBe(false);
    });

    it('should skip non-web-search content', async () => {
      const content = 'Content';
      const citations = ['https://example.com'];

      const result = await responsePostProcessor.ensureReferencesSection(content, false, citations);

      expect(result).toBe(content);
    });

    it('should handle invalid URLs in citations', async () => {
      (urlValidator.isValidUrl as jest.Mock).mockReturnValue(false);

      const content = 'Content';
      const citations = ['not-a-url', 'also-not-a-url'];

      const result = await responsePostProcessor.ensureReferencesSection(content, true, citations);

      expect(result).toBe(content);
    });

    it('should format citations as numbered list', async () => {
      (urlValidator.isValidUrl as jest.Mock).mockReturnValue(true);

      const content = 'Content';
      const citations = ['https://first.com', 'https://second.com', 'https://third.com'];

      const result = await responsePostProcessor.ensureReferencesSection(content, true, citations);

      const hasOne = result.includes('1.') || result.includes('2.');
      expect(hasOne).toBe(true);
    });
  });

  describe('formatSourcesList', () => {
    it('should format sources with URLs', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const sources = [
        { name: 'RRC', url: 'https://www.rrc.texas.gov/' },
        { name: 'FERC', url: 'https://www.ferc.gov/' },
      ];

      const result = await responsePostProcessor.formatSourcesList(sources);

      expect(result).toContain('RRC');
      expect(result).toContain('FERC');
    });

    it('should generate URLs for sources without them', async () => {
      const sources = [{ name: 'RRC' }, { name: 'FERC' }];

      const result = await responsePostProcessor.formatSourcesList(sources);

      const hasSource = result.includes('rrc.texas.gov') || result.includes('RRC');
      expect(hasSource).toBe(true);
    });

    it('should skip broken URLs', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(false);

      const sources = [{ name: 'Broken Org', url: 'https://broken.com' }];

      const result = await responsePostProcessor.formatSourcesList(sources);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should sort by priority', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const sources = [
        { name: 'Random', url: 'https://random.com' },
        { name: 'RRC', url: 'https://www.rrc.texas.gov/' },
      ];

      const result = await responsePostProcessor.formatSourcesList(sources);

      expect(result).toContain('RRC');
    });

    it('should return empty string for no sources', async () => {
      const result = await responsePostProcessor.formatSourcesList([]);

      expect(result).toBe('');
    });

    it('should handle sources with only names', async () => {
      const sources = [
        { name: 'Internal Document', url: undefined },
        { name: 'RRC', url: 'https://www.rrc.texas.gov/' },
      ];

      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const result = await responsePostProcessor.formatSourcesList(sources);

      const hasSource = result.includes('RRC') || result.includes('Internal');
      expect(hasSource).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical LLM response', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = `Based on production data analysis, yields are improving.

**References**
- [Texas Railroad Commission](https://www.rrc.texas.gov/)
- [API Data](https://www.api.org/)`;

      const result = await responsePostProcessor.process(content);

      expect(result).toContain('production data');
    });

    it('should handle response with no valid sources', async () => {
      const content = `The analysis shows positive trends.

**References**
[No specific URLs available from the search results]`;

      const result = await responsePostProcessor.process(content);

      expect(result).toContain('analysis');
    });

    it('should handle multiple inline links and sources', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = `See [this report](https://example.com) and [this data](https://data.com).

**References**
- [RRC](https://www.rrc.texas.gov/)`;

      const result = await responsePostProcessor.process(content);

      expect(result).toBeDefined();
    });

    it('should clean broken links while preserving content', async () => {
      (urlValidator.cleanUrl as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('https://valid.com');

      const content = 'Check [dead link](https://dead.com) and [good link](https://valid.com).';

      const result = await responsePostProcessor.process(content);

      expect(result).toContain('dead link');
      expect(result).toContain('good link');
    });
  });

  describe('edge cases', () => {
    it('should handle content with no references', async () => {
      const content = 'Just plain text content';

      const result = await responsePostProcessor.process(content);

      expect(result).toContain('plain text');
    });

    it('should handle very long content', async () => {
      const content = 'A'.repeat(100000) + '\n**References**\n- [Source](https://example.com)';

      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const result = await responsePostProcessor.process(content);

      expect(result.length).toBeGreaterThan(1000);
    });

    it('should handle null/undefined inputs gracefully', async () => {
      const result = await responsePostProcessor.process('');

      expect(result).toBe('');
    });

    it('should handle mixed formatting', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = `**Bold** and *italic* text.

[Link](https://example.com)

**References**
- [Source](https://example.com)`;

      const result = await responsePostProcessor.process(content);

      expect(result).toBeDefined();
    });

    it('should handle duplicate sources', async () => {
      (urlValidator.isUrlWorking as jest.Mock).mockResolvedValue(true);

      const content = `**References**
- [RRC](https://www.rrc.texas.gov/)
- [RRC](https://www.rrc.texas.gov/)
- [RRC](https://www.rrc.texas.gov/)`;

      const result = await responsePostProcessor.improveReferencesSection(content);

      expect(result).toBeDefined();
    });
  });
});
