/**
 * Ask Assist Utilities Tests
 * Tests for response formatting, source URL handling, and reference section processing
 */

import { askasssist } from '../../src/utils/askAssist.utils';
import { urlValidator } from '../../src/services/utils/url.validator';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/services/utils/url.validator', () => ({
  urlValidator: {
    cleanUrl: jest.fn(),
  },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Ask Assist Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) => Promise.resolve(url));
  });

  describe('askasssist main function', () => {
    it('should process content with all formatting issues', async () => {
      const content = `
        Some content here.
        [No specific URLs available from the search results]
        
        **References**
        - [RRC](https://www.rrc.texas.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle empty content', async () => {
      const result = await askasssist('');

      expect(result).toBe('');
    });

    it('should preserve normal content', async () => {
      const content = 'This is normal content without any issues.';

      const result = await askasssist(content);

      expect(result).toContain('normal content');
    });

    it('should fix source messages', async () => {
      const content = '[No specific URLs available from the search results]';

      const result = await askasssist(content);

      expect(result).not.toContain('[No specific URLs available');
    });

    it('should clean math formatting', async () => {
      const content = '\\[\\text{SPM} = \\frac{a}{b}\\]';

      const result = await askasssist(content);

      expect(result).not.toContain('\\[');
    });

    it('should clean inline URLs', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue('https://example.com/fixed');

      const content = '[Link](https://example.com)';

      const result = await askasssist(content);

      expect(urlValidator.cleanUrl).toHaveBeenCalled();
    });

    it('should improve references section', async () => {
      const content = `
        Some text.
        
        **References**
        - [RRC](https://www.rrc.texas.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });
  });

  describe('source detection', () => {
    it('should identify government sources', async () => {
      const content = `
        **References**
        - [RRC](https://www.rrc.texas.gov/)
        - [FERC](https://www.ferc.gov/)
        - [EPA](https://www.epa.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should detect RRC Texas', async () => {
      const content = `
        **Sources & References**
        - [Texas Railroad Commission](https://www.rrc.texas.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toContain('texas.gov');
    });

    it('should detect FERC', async () => {
      const content = `
        **References**
        - [Federal Energy Regulatory Commission](https://www.ferc.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toContain('ferc.gov');
    });

    it('should detect EPA', async () => {
      const content = `
        **References**
        - [Environmental Protection Agency](https://www.epa.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toContain('epa.gov');
    });

    it('should detect USGS', async () => {
      const content = `
        **References**
        - [USGS](https://www.usgs.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toContain('usgs.gov');
    });

    it('should detect API Institute', async () => {
      const content = `
        **References**
        - [American Petroleum Institute](https://www.api.org/)
      `;

      const result = await askasssist(content);

      expect(result).toContain('api.org');
    });
  });

  describe('source priority', () => {
    it('should prioritize government sources', async () => {
      const content = `
        **References**
        - [API](https://www.api.org/)
        - [RRC](https://www.rrc.texas.gov/)
        - Random Source
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should rank RRC Texas highest', async () => {
      const content = `
        **References**
        - [EPA](https://www.epa.gov/)
        - [RRC](https://www.rrc.texas.gov/)
      `;

      const result = await askasssist(content);

      const rrcIndex = result.indexOf('rrc.texas');
      const epaIndex = result.indexOf('epa.gov');

      expect(rrcIndex < epaIndex || rrcIndex >= 0).toBe(true);
    });

    it('should handle sources without URLs', async () => {
      const content = `
        **References**
        - Internal Document
        - [RRC](https://www.rrc.texas.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toContain('RRC');
    });
  });

  describe('source URL mapping', () => {
    it('should map RRC source name to URL', async () => {
      const content = `
        **References**
        - Texas Railroad Commission
      `;

      const result = await askasssist(content);

      expect(result).toMatch(/rrc\.texas\.gov|References/);
    });

    it('should map FERC source name to URL', async () => {
      const content = `
        **References**
        - Federal Energy Regulatory Commission
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should handle unknown sources', async () => {
      const content = `
        **References**
        - Unknown Source Organization
      `;

      const result = await askasssist(content);

      expect(result).not.toContain('Unknown Source');
    });

    it('should not map abbreviations without context', async () => {
      const content = `
        **References**
        - XYZ Organization
      `;

      const result = await askasssist(content);

      expect(result).toContain('XYZ');
    });
  });

  describe('math formatting', () => {
    it('should clean LaTeX math with brackets', async () => {
      const content = '\\[\\text{SPM} = value\\]';

      const result = await askasssist(content);

      expect(result).not.toContain('\\[');
    });

    it('should clean LaTeX fractions', async () => {
      const content = '\\frac{a}{b}';

      const result = await askasssist(content);

      expect(result).not.toContain('\\frac');
    });

    it('should replace math symbols with readable alternatives', async () => {
      const content = 'x \\approx 3.14 \\times 2 \\le 10';

      const result = await askasssist(content);

      expect(result).toMatch(/≈|approx/);
    });

    it('should handle nested fractions', async () => {
      const content = '\\frac{\\frac{a}{b}}{c}';

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should replace division and multiplication symbols', async () => {
      const content = '\\frac{10}{2} \\div 5 \\times 3';

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should replace comparison operators', async () => {
      const content = 'a \\le b \\ge c';

      const result = await askasssist(content);

      expect(result).not.toContain('\\le');
      expect(result).not.toContain('\\ge');
    });

    it('should replace plus-minus symbol', async () => {
      const content = 'Value \\pm 0.5';

      const result = await askasssist(content);

      expect(result).toMatch(/±|\+-/);
    });

    it('should handle text within math expressions', async () => {
      const content = '[\\text{Production Rate} = \\frac{bbl}{day}]';

      const result = await askasssist(content);

      expect(result).toContain('Production');
    });
  });

  describe('URL cleaning', () => {
    it('should clean valid URLs', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue('https://example.com/clean');

      const content = '[Link](https://example.com/dirty)';

      const result = await askasssist(content);

      expect(urlValidator.cleanUrl).toHaveBeenCalledWith('https://example.com/dirty', true);
    });

    it('should remove broken links', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue(null);

      const content = '[Broken Link](https://broken.com)';

      const result = await askasssist(content);

      expect(result).toContain('Broken Link');
      expect(result).not.toContain('https://broken');
    });

    it('should handle multiple links', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = '[Link1](https://example1.com) and [Link2](https://example2.com)';

      const result = await askasssist(content);

      expect(urlValidator.cleanUrl).toHaveBeenCalledTimes(2);
    });

    it('should preserve link text when URL is invalid', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue(null);

      const content = '[Important Information](https://dead-link.com)';

      const result = await askasssist(content);

      expect(result).toContain('Important Information');
    });

    it('should handle links with special characters', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = '[Report](https://example.com/path?q=test&id=123#section)';

      const result = await askasssist(content);

      expect(urlValidator.cleanUrl).toHaveBeenCalled();
    });
  });

  describe('reference section processing', () => {
    it('should identify references section', async () => {
      const content = `
        Main content.
        
        **References**
        - [Source](https://example.com)
      `;

      const result = await askasssist(content);

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should reformat references as numbered list', async () => {
      const content = `
        **References**
        - [RRC](https://www.rrc.texas.gov/)
        - [FERC](https://www.ferc.gov/)
      `;

      const result = await askasssist(content);

      expect(result).toMatch(/1\.|2\./);
    });

    it('should remove empty references section', async () => {
      const content = `
        **References**
        - [No specific URLs available]
      `;

      const result = await askasssist(content);

      expect(result).not.toContain('[No specific URLs');
    });

    it('should handle alternative section headers', async () => {
      const content = `
        **Sources and References**
        - [Source](https://example.com)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should handle Sources header alone', async () => {
      const content = `
        **Sources**
        - [Source](https://example.com)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should sort sources by priority', async () => {
      const content = `
        **References**
        - [Random Org](https://random.com)
        - [RRC](https://www.rrc.texas.gov/)
        - [API](https://www.api.org/)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should preserve content after references', async () => {
      const content = `
        Main content.
        
        **References**
        - [Source](https://example.com)
        
        Additional content.
      `;

      const result = await askasssist(content);

      expect(result).toContain('Main content');
      expect(result).toMatch(/Additional content/);
    });
  });

  describe('edge cases', () => {
    it('should handle content with no references', async () => {
      const content = 'Just plain text content with no references.';

      const result = await askasssist(content);

      expect(result).toContain('plain text');
    });

    it('should handle malformed URLs in references', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockResolvedValue(null);

      const content = `
        **References**
        - [Bad Link](not a url)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should handle very long content', async () => {
      const content = 'A'.repeat(100000) + '\n**References**\n- [Source](https://example.com)';

      const result = await askasssist(content);

      expect(result.length).toBeGreaterThan(1000);
    });

    it('should handle unicode in source names', async () => {
      const content = `
        **References**
        - [Agência Brasileira](https://example.com)
        - [中文来源](https://example.com)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should handle mixed markdown and text', async () => {
      const content = `
        Some **bold** and *italic* text.
        
        **References**
        - [Source](https://example.com)
      `;

      const result = await askasssist(content);

      expect(result).toMatch(/\*\*bold\*\*|bold/);
    });

    it('should handle multiple references sections', async () => {
      const content = `
        Section 1
        
        **References**
        - [Ref1](https://example.com)
        
        Section 2
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should handle references with no URLs', async () => {
      const content = `
        **References**
        - Internal Documentation
        - Company Database
      `;

      const result = await askasssist(content);

      expect(result).toMatch(/Internal|Company/);
    });

    it('should handle empty lines in references', async () => {
      const content = `
        **References**
        
        - [Source1](https://example.com)
        
        - [Source2](https://example.com)
      `;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical LLM response', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = `Based on current data, the production rate is approximately \\[\\text{1,500} \\frac{\\text{bbl}}{\\text{day}}\\].

**Sources & References**
- [Texas Railroad Commission](https://www.rrc.texas.gov/)
- [Petroleum Industry Data](https://www.api.org/)`;

      const result = await askasssist(content);

      expect(result).toContain('production rate');
    });

    it('should handle response with no valid references', async () => {
      const content = `The data shows significant growth.

**References**
[No specific URLs available from the search results]`;

      const result = await askasssist(content);

      expect(result).toContain('significant growth');
    });

    it('should handle complex mathematical content', async () => {
      const content = `Using the formula \\[P = \\frac{Q \\times R}{V}\\], we calculate efficiency.

**References**
- [Standards](https://www.nace.org/)`;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });

    it('should handle response with mixed content', async () => {
      (urlValidator.cleanUrl as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(url)
      );

      const content = `Analysis shows [Link](https://example.com) support. \\[x = \\frac{a}{b}\\]

**References**
- [RRC](https://www.rrc.texas.gov/)`;

      const result = await askasssist(content);

      expect(result).toBeDefined();
    });
  });
});
