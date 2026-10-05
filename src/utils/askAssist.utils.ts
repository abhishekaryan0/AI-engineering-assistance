import { urlValidator } from '../services/utils/url.validator';
import { logger } from './logger';

/**
 * Detect if a URL is from a government domain (.gov)
 */
const isGovernmentSource = (url: string): boolean => {
  try {
    const domain = new URL(url).hostname || '';
    return domain.includes('.gov');
  } catch {
    return false;
  }
};

/**
 * Map common source names to their URLs
 * Used as fallback when AI doesn't include URLs
 * Only includes URLs that have been verified to work
 */
const getSourceUrl = (sourceName: string): string | null => {
  const lowerName = sourceName.toLowerCase();

  if (lowerName.includes('rrc') || lowerName.includes('texas railroad')) {
    return 'https://www.rrc.texas.gov/';
  }

  if (lowerName.includes('ferc')) {
    return 'https://www.ferc.gov/';
  }

  if (lowerName.includes('epa')) {
    return 'https://www.epa.gov/';
  }

  if (lowerName.includes('usgs')) {
    return 'https://www.usgs.gov/';
  }

  if (lowerName.includes('api')) {
    return 'https://www.api.org/';
  }

  return null;
};

/**
 * Get priority score for a source
 * Higher score = higher priority
 */
const getSourcePriority = (url?: string): number => {
  if (!url) return 1; // Base priority for sources without URLs

  if (isGovernmentSource(url)) {
    if (url.includes('rrc.texas.gov')) return 100;
    if (url.includes('ferc.gov')) return 95;
    if (url.includes('epa.gov')) return 90;
    if (url.includes('usgs.gov')) return 85;
    return 80; // Other .gov domains
  }

  if (url.includes('api.org')) return 70;
  if (url.includes('iogcc.ok.gov')) return 75;
  if (url.includes('nace.org')) return 65;

  return 50;
};

/**
 * Fix poor source messages like "No specific URLs available"
 */
const fixSourceMessages = (content: string): string => {
  const replacements = [
    {
      pattern: /\[No specific URLs available from the search results\]/gi,
      replacement: '',
    },
    {
      pattern: /References\s*\[\s*No specific URLs available[^\]]*\]/gi,
      replacement: '',
    },
    {
      pattern: /no valid URLs? found/gi,
      replacement: 'No external URLs available',
    },
    {
      pattern: /unable to find URLs?/gi,
      replacement: 'External sources not referenced',
    },
  ];

  let result = content;
  replacements.forEach(({ pattern, replacement }) => {
    result = result.replace(pattern, replacement);
  });

  return result;
};

/**
 * Clean and validate inline URLs with health checks
 */
const cleanInlineUrls = async (content: string): Promise<string> => {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let result = content;
  let match;

  const linkMatches: Array<{ fullMatch: string; text: string; url: string }> = [];
  while ((match = linkRegex.exec(content)) !== null) {
    linkMatches.push({
      fullMatch: match[0],
      text: match[1],
      url: match[2],
    });
  }

  for (const link of linkMatches) {
    const cleanedUrl = await urlValidator.cleanUrl(link.url, true); // true = check health
    if (cleanedUrl) {
      result = result.replace(link.fullMatch, `[${link.text}](${cleanedUrl})`);
    } else {
      result = result.replace(link.fullMatch, link.text);
    }
  }

  return result;
};

/**
 * Improve the References/Sources section formatting with health checks
 * Prioritizes government sources
 */
const improveReferencesSection = async (content: string): Promise<string> => {
  const refSectionRegex =
    /(?:\*\*)?(?:Sources?\s*(?:&|and)?\s*References?|References?|Technical\s*Sources?)\*\*[:\s]*([\s\S]*?)(?=\n\n(?:\*\*|[A-Z])|$)/i;
  const match = content.match(refSectionRegex);

  if (!match) {
    logger.debug('📋 No references section found in content');
    return content;
  }

  const fullSection = match[0];
  const refContent = match[1];
  logger.debug('📋 Found references section:', refContent.slice(0, 200));

  const sourceLines = refContent.split('\n').filter((line) => line.trim());
  logger.debug(`📋 Parsed ${sourceLines.length} source lines`);

  if (
    sourceLines.length === 0 ||
    sourceLines.every(
      (line) =>
        line.toLowerCase().includes('no') ||
        line.toLowerCase().includes('not available') ||
        line.trim() === ''
    )
  ) {
    return content.replace(fullSection, '');
  }

  const sourceItems: Array<{ line: string; priority: number; url?: string }> = [];

  for (const line of sourceLines) {
    const urlMatch = line.match(/\[(.*?)\]\((https?:\/\/[^)]+)\)/);
    if (urlMatch) {
      const [_, name, url] = urlMatch;
      logger.debug(`🔗 Found markdown link: [${name}](${url})`);
      const priority = getSourcePriority(url);

      sourceItems.push({
        line: `- [${name}](${url})`,
        priority,
        url,
      });
      logger.debug(`   ✅ Keeping AI-provided URL (priority: ${priority})`);
    } else if (line.trim() && !line.toLowerCase().includes('[no') && line.length > 3) {
      const sourceName = line.trim().replace(/^[-•]\s*/, '');
      const mappedUrl = getSourceUrl(sourceName);

      if (mappedUrl) {
        logger.debug(`📍 No direct URL for "${sourceName}", using fallback: ${mappedUrl}`);
        sourceItems.push({
          line: `- [${sourceName}](${mappedUrl})`,
          priority: getSourcePriority(mappedUrl),
          url: mappedUrl,
        });
      } else {
        logger.debug(`❌ No URL found for: ${sourceName}`);
        sourceItems.push({
          line: `- ${sourceName}`,
          priority: 1,
        });
      }
    }
  }

  if (sourceItems.length === 0) {
    logger.debug('⚠️ No valid sources found, removing references section');
    return content.replace(fullSection, '');
  }

  sourceItems.sort((a, b) => b.priority - a.priority);
  logger.debug(`✅ Found ${sourceItems.length} valid sources after filtering`);

  let newSection = '\n**Sources & References**\n\n';

  sourceItems.forEach((item, index) => {
    const number = index + 1;
    newSection += `${number}. ${item.line.replace(/^- /, '')}\n`;
    logger.debug(`   ${number}. ${item.line.replace(/^- /, '')}`);
  });

  logger.debug('🔄 Replacing old section with new section');
  return content.replace(fullSection, newSection);
};

/**
 * Clean complex LaTeX math formatting to readable text
 * e.g., [ \text{SPM} = \frac{...}{...} ] -> SPM = ... / ...
 */
const cleanMathFormatting = (content: string): string => {
  let result = content;

  result = result.replace(/\\\[(.*?)\\\]/gs, '$1');
  result = result.replace(/\[\s*(\\text\{.*?\}.*?)\s*\]/gs, '$1'); // Target specifically the user's reported pattern [ \text{...} ... ]

  let prevResult = '';
  while (prevResult !== result) {
    prevResult = result;
    result = result.replace(/\\text\{([^{}]+)\}/g, '$1');
  }

  while (result.includes('\\frac{')) {
    const loopPrev = result;
    result = result.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1 / $2)');
    if (result === loopPrev) break; // formatting stabilized or regex failed to match complex nesting
  }

  result = result
    .replace(/\\approx/g, '≈')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\pm/g, '±');

  result = result.replace(/^\s*\[\s*(.*?=\s*.*?)\s*\]\s*$/gm, '$1');

  return result;
};

/**
 * Clean and format the final response (with URL health checks)
 * @async
 */
export const askasssist = async (content: string): Promise<string> => {
  let cleaned = fixSourceMessages(content);

  cleaned = cleanMathFormatting(cleaned);

  cleaned = await cleanInlineUrls(cleaned);

  cleaned = await improveReferencesSection(cleaned);

  return cleaned;
};
