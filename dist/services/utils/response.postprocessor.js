"use strict";
/**
 * Response Post-Processor
 * Cleans up and formats agent responses for better UX
 * - Removes invalid/broken URLs
 * - Only returns working URLs
 * - Improves source formatting
 * - Standardizes references section
 * - Prioritizes government sources (.gov domains) for regulatory content
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.responsePostProcessor = void 0;
const url_validator_1 = require("./url.validator");
const logger_1 = require("../../utils/logger");
exports.responsePostProcessor = {
    /**
     * Detect if a URL is from a government domain (.gov)
     */
    isGovernmentSource(url) {
        try {
            const domain = new URL(url).hostname || '';
            return domain.includes('.gov');
        }
        catch {
            return false;
        }
    },
    /**
     * Map common source names to their URLs
     * Used as fallback when AI doesn't include URLs
     * Only includes URLs that have been verified to work
     */
    getSourceUrl(sourceName) {
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
    },
    /**
     * Get priority score for a source
     * Higher score = higher priority
     */
    getSourcePriority(url) {
        if (!url)
            return 1; // Base priority for sources without URLs
        if (this.isGovernmentSource(url)) {
            if (url.includes('rrc.texas.gov'))
                return 100;
            if (url.includes('ferc.gov'))
                return 95;
            if (url.includes('epa.gov'))
                return 90;
            if (url.includes('usgs.gov'))
                return 85;
            return 80; // Other .gov domains
        }
        if (url.includes('api.org'))
            return 70;
        if (url.includes('iogcc.ok.gov'))
            return 75;
        if (url.includes('nace.org'))
            return 65;
        return 50;
    },
    /**
     * Clean and format the final response (with URL health checks)
     * @async
     */
    async process(content, citations, isWebSearch = false) {
        let cleaned = this.fixSourceMessages(content);
        cleaned = await this.cleanInlineUrls(cleaned);
        cleaned = await this.improveReferencesSection(cleaned);
        // If explicit citations are provided (e.g. from Perplexity), ensure they are added
        if (citations && citations.length > 0) {
            cleaned = await this.ensureReferencesSection(cleaned, isWebSearch, citations);
        }
        return cleaned;
    },
    /**
     * Fix poor source messages like "No specific URLs available"
     */
    fixSourceMessages(content) {
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
    },
    /**
     * Improve the References/Sources section formatting with health checks
     * Prioritizes government sources
     */
    async improveReferencesSection(content) {
        const refSectionRegex = /(?:^|\n)(?:#{1,4}\s*|\*\*|)(?:Sources?\s*(?:&|and)?\s*References?|References?|Technical\s*Sources?)(?:\*\*|:|)\s*[:\n]+([\s\S]*?)(?=\n\n(?:\*\*|#{1,4}|[A-Z])|$)/i;
        const match = content.match(refSectionRegex);
        if (!match) {
            logger_1.logger.debug('📋 No references section found in content (Regex mismatch)');
            return content;
        }
        const fullSection = match[0];
        const refContent = match[1];
        logger_1.logger.debug('📋 Found references section content:', refContent.slice(0, 100));
        const sourceLines = refContent.split('\n').filter((line) => line.trim());
        const sourceItems = [];
        for (const line of sourceLines) {
            const cleanContent = line.replace(/^[-*•\d.\s]+/, '').trim();
            const lowerContent = cleanContent.toLowerCase();
            if (cleanContent.length < 3)
                continue; // Skip artifacts
            if (lowerContent.includes('provided definition') ||
                lowerContent.includes('provided context') ||
                lowerContent.includes('oil/gas context') ||
                lowerContent.startsWith('glossary') ||
                lowerContent.startsWith('term:') ||
                lowerContent.startsWith(':') ||
                lowerContent.includes('based on available') ||
                lowerContent.includes('no specific url')) {
                logger_1.logger.debug(`🗑️ Filtered ignored line: ${line}`);
                continue;
            }
            const mdMatch = line.match(/\[(.*?)\]\((https?:\/\/[^)]+)\)/);
            if (mdMatch) {
                const [_, name, url] = mdMatch;
                const isWorking = await url_validator_1.urlValidator.isUrlWorking(url);
                if (isWorking) {
                    sourceItems.push({
                        line: `- [${name}](${url})`,
                        priority: this.getSourcePriority(url),
                        url,
                    });
                }
                else {
                    const mapped = this.getSourceUrl(name);
                    if (mapped) {
                        sourceItems.push({
                            line: `- [${name}](${mapped})`,
                            priority: this.getSourcePriority(mapped),
                            url: mapped,
                        });
                    }
                }
                continue;
            }
            const laxMatch = line.match(/([^(:]+)[(:]\s*(https?:\/\/[^)\s]+)\)?/);
            if (laxMatch) {
                const name = laxMatch[1].trim();
                const url = laxMatch[2].trim();
                const isWorking = await url_validator_1.urlValidator.isUrlWorking(url);
                if (isWorking) {
                    sourceItems.push({
                        line: `- [${name}](${url})`,
                        priority: this.getSourcePriority(url),
                        url,
                    });
                    continue;
                }
            }
            const cleanName = cleanContent; // Already cleaned at top of loop
            const mappedUrl = this.getSourceUrl(cleanName);
            if (mappedUrl) {
                sourceItems.push({
                    line: `- [${cleanName}](${mappedUrl})`,
                    priority: this.getSourcePriority(mappedUrl),
                    url: mappedUrl,
                });
            }
        }
        if (sourceItems.length === 0) {
            logger_1.logger.debug('⚠️ No valid sources found, removing references section');
            return content.replace(fullSection, ''); // Remove section entirely if no valid sources
        }
        sourceItems.sort((a, b) => b.priority - a.priority);
        logger_1.logger.debug(`✅ Found ${sourceItems.length} valid sources after filtering`);
        let newSection = '\n**Sources & References**\n\n';
        sourceItems.forEach((item, index) => {
            const number = index + 1;
            newSection += `${number}. ${item.line.replace(/^- /, '')}\n`;
            logger_1.logger.debug(`   ${number}. ${item.line.replace(/^- /, '')}`);
        });
        logger_1.logger.debug('🔄 Replacing old section with new section');
        return content.replace(fullSection, newSection);
    },
    /**
     * Clean and validate inline URLs with health checks
     */
    async cleanInlineUrls(content) {
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let result = content;
        let match;
        const linkMatches = [];
        while ((match = linkRegex.exec(content)) !== null) {
            linkMatches.push({
                fullMatch: match[0],
                text: match[1],
                url: match[2],
            });
        }
        for (const link of linkMatches) {
            const cleanedUrl = await url_validator_1.urlValidator.cleanUrl(link.url, true); // true = check health
            if (cleanedUrl) {
                result = result.replace(link.fullMatch, `[${link.text}](${cleanedUrl})`);
            }
            else {
                result = result.replace(link.fullMatch, link.text);
            }
        }
        return result;
    },
    /**
     * Add References section if missing, using provided citations
     */
    async ensureReferencesSection(content, isWebSearch, citations) {
        if (!isWebSearch || !citations || citations.length === 0) {
            return content;
        }
        const hasRefSection = /(?:^|\n)(?:#{1,4}\s*|\*\*|)(?:Sources?\s*(?:&|and)?\s*References?|References?|Technical\s*Sources?)(?:\*\*|:|)/i.test(content);
        const formattedCitations = await Promise.all(citations.slice(0, 8).map(async (url, idx) => {
            // PERF: Skip deep health check (isUrlWorking) here for speed.
            // Trust Search Engine results mostly, just validate format.
            const isValid = url_validator_1.urlValidator.isValidUrl(url);
            if (!isValid)
                return null;
            // User wants the text to be the URL itself, clickable
            return `${idx + 1}. [${url}](${url})`;
        }));
        const validCitations = formattedCitations.filter(Boolean);
        if (validCitations.length === 0)
            return content;
        const citationBlock = `\n\n**Sources & References**\n\n${validCitations.join('\n')}`;
        if (hasRefSection) {
            // If the AI has already generated the references section properly,
            // DO NOT append the raw unformatted URLs from the aggregator, as this creates duplicates.
            return content;
        }
        return content + citationBlock;
    },
    /**
     * Format sources for better readability in responses
     * Only includes working URLs, prioritizes government sources
     */
    async formatSourcesList(sources) {
        if (!sources || sources.length === 0) {
            return '';
        }
        const sourceItems = [];
        for (const source of sources) {
            if (!source.url) {
                const mappedUrl = this.getSourceUrl(source.name);
                if (mappedUrl) {
                    const priority = this.getSourcePriority(mappedUrl);
                    sourceItems.push({ name: source.name, url: mappedUrl, priority });
                }
            }
            else {
                const working = await url_validator_1.urlValidator.isUrlWorking(source.url);
                if (working) {
                    const priority = this.getSourcePriority(source.url);
                    sourceItems.push({ ...source, priority });
                }
                else {
                    logger_1.logger.warn(`⚠️ Skipping broken URL: ${source.url}`);
                    const mappedUrl = this.getSourceUrl(source.name);
                    if (mappedUrl) {
                        sourceItems.push({
                            name: source.name,
                            url: mappedUrl,
                            priority: this.getSourcePriority(mappedUrl),
                        });
                    }
                }
            }
        }
        if (sourceItems.length === 0) {
            return '';
        }
        sourceItems.sort((a, b) => b.priority - a.priority);
        let output = '**Sources & References**\n\n';
        sourceItems.forEach((source, index) => {
            const number = index + 1;
            if (source.url) {
                output += `${number}. [${source.name}](${source.url})\n`;
            }
            else {
                output += `${number}. ${source.name}\n`;
            }
        });
        return output;
    },
};
