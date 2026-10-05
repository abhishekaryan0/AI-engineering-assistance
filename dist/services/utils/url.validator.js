"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlValidator = void 0;
const logger_1 = require("../../utils/logger");
/**
 * URL Validator Service
 * Validates, sanitizes, and filters URLs for responses
 * Includes format validation and health checking
 */
const urlHealthCache = new Map();
const CACHE_DURATION_MS = 3600000; // 1 hour
const TRUSTED_DOMAINS = [
    'rrc.texas.gov',
    'epa.gov',
    'ferc.gov',
    'usgs.gov',
    'api.org',
    'iogcc.org',
    'nace.org',
    'energy.gov',
    'doi.gov',
    'glossary.oilfield.com', // Example
    'slb.com',
    'halliburton.com',
    'bakerhughes.com',
    'spe.org',
    'petrowiki.org',
];
exports.urlValidator = {
    /**
     * Check if a URL belongs to a trusted domain
     */
    isTrustedDomain(url) {
        try {
            const hostname = new URL(url).hostname;
            return TRUSTED_DOMAINS.some((d) => hostname.endsWith(d));
        }
        catch {
            return false;
        }
    },
    /**
     * Check if a URL is valid and not a placeholder
     */
    isValidUrl(url) {
        if (!url || typeof url !== 'string')
            return false;
        try {
            const parsed = new URL(url);
            const rejectPatterns = [
                'example.com',
                'domain.com',
                'site.com',
                'test.com',
                'sample.com',
                'placeholder.com',
                'yoursite.com',
                'website.com',
                'iana.org',
                'localhost',
                '127.0.0.1',
                '0.0.0.0',
                'learn more', // Generic link text
                'click here',
                'read more',
                '#',
                'javascript:',
            ];
            const urlLower = url.toLowerCase();
            for (const pattern of rejectPatterns) {
                if (urlLower.includes(pattern)) {
                    return false;
                }
            }
            const validProtocols = ['http:', 'https:'];
            if (!validProtocols.includes(parsed.protocol)) {
                return false;
            }
            if (!parsed.hostname) {
                return false;
            }
            return true;
        }
        catch (_error) {
            return false;
        }
    },
    /**
     * Check if a URL is actually working (returns 200 status)
     * with timeout and caching
     */
    async isUrlWorking(url, timeout = 8000) {
        if (!this.isValidUrl(url)) {
            return false;
        }
        try {
            const cached = urlHealthCache.get(url);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
                return cached.status;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, {
                method: 'HEAD', // Use HEAD request to be lightweight
                redirect: 'follow',
                signal: controller.signal,
            }).catch(() => {
                clearTimeout(timeoutId);
                const controller2 = new AbortController();
                const timeoutId2 = setTimeout(() => controller2.abort(), timeout);
                return fetch(url, {
                    method: 'GET',
                    redirect: 'follow',
                    signal: controller2.signal,
                })
                    .then((r) => {
                    clearTimeout(timeoutId2);
                    return r;
                })
                    .catch(() => {
                    clearTimeout(timeoutId2);
                    throw new Error('Request failed');
                });
            });
            clearTimeout(timeoutId);
            // Accept 2xx (Success)
            // Accept 3xx (Redirects - usually followed but if fetch returns it)
            // Accept 403/401 (Forbidden/Unauthorized) - likely anti-bot, but link exists
            // Accept 405 (Method Not Allowed) - e.g. HEAD not allowed
            // Accept 429 (Too Many Requests)
            const validStatuses = [200, 201, 202, 203, 204, 301, 302, 307, 308, 401, 403, 405, 429];
            const isWorking = validStatuses.includes(response.status) ||
                (response.status >= 200 && response.status < 300);
            urlHealthCache.set(url, {
                status: isWorking,
                timestamp: Date.now(),
            });
            return isWorking;
        }
        catch (error) {
            logger_1.logger.warn(`⚠️ URL health check failed for ${url}:`, error.message);
            urlHealthCache.set(url, {
                status: false,
                timestamp: Date.now(),
            });
            return false;
        }
    },
    /**
     * Batch check multiple URLs and return only working ones
     * Returns array of working URLs
     */
    async filterWorkingUrls(urls) {
        if (!Array.isArray(urls) || urls.length === 0) {
            return [];
        }
        const results = await Promise.all(urls.map(async (url) => ({
            url,
            working: await this.isUrlWorking(url),
        })));
        return results.filter((result) => result.working).map((result) => result.url);
    },
    /**
     * Clear the URL health cache
     */
    clearHealthCache() {
        urlHealthCache.clear();
    },
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            cacheSize: urlHealthCache.size,
            entries: Array.from(urlHealthCache.entries()).map(([url, data]) => ({
                url,
                working: data.status,
                cachedAt: new Date(data.timestamp).toISOString(),
            })),
        };
    },
    /**
     * Extract URLs from text and verify they're working
     */
    async extractWorkingUrls(text) {
        const urlRegex = /https?:\/\/[^\s)"']+/gi;
        const matches = text.match(urlRegex) || [];
        const uniqueUrls = new Set();
        const urlsToCheck = [];
        matches.forEach((url) => {
            if (!uniqueUrls.has(url) && this.isValidUrl(url)) {
                uniqueUrls.add(url);
                urlsToCheck.push(url);
            }
        });
        const workingUrls = await this.filterWorkingUrls(urlsToCheck);
        const workingUrlsSet = new Set(workingUrls);
        const validUrls = [];
        workingUrlsSet.forEach((url) => {
            try {
                const urlObj = new URL(url);
                const source = urlObj.hostname?.replace('www.', '') || 'Source';
                validUrls.push({ url, source });
            }
            catch (_err) {
                /* ignore invalid url */
            }
        });
        return validUrls;
    },
    /**
     * Sanitize and extract URLs from text
     * Returns array of {url, source} objects (FORMAT VALIDATION ONLY - NO HEALTH CHECK)
     * @deprecated Use extractWorkingUrls() instead for health checked URLs
     */
    extractUrls(text) {
        const urlRegex = /https?:\/\/[^\s)"']+/gi;
        const matches = text.match(urlRegex) || [];
        const uniqueUrls = new Set();
        const validUrls = [];
        matches.forEach((url) => {
            if (!uniqueUrls.has(url) && this.isValidUrl(url)) {
                uniqueUrls.add(url);
                try {
                    const urlObj = new URL(url);
                    const source = urlObj.hostname?.replace('www.', '') || 'Source';
                    validUrls.push({ url, source });
                }
                catch (_err) {
                    /* ignore invalid url */
                }
            }
        });
        return validUrls;
    },
    /**
     * Filter out invalid URLs from an array (FORMAT VALIDATION ONLY)
     * @deprecated Use filterWorkingUrls() instead for health checked URLs
     */
    filterValidUrls(urls) {
        return urls.filter((url) => this.isValidUrl(url));
    },
    /**
     * Extract source name and URL from bracketed format
     * Input: "[Source Name](https://example.com)"
     * Output: { source: "Source Name", url: "https://example.com" }
     */
    parseMarkdownLink(text) {
        const match = text.match(/\[(.*?)\]\((.*?)\)/);
        if (match) {
            const [_, source, url] = match;
            return this.isValidUrl(url) ? { source, url } : null;
        }
        return null;
    },
    /**
     * Format URLs for user-friendly output
     * Only includes working URLs with health checks
     */
    async formatSourcesSection(sources) {
        if (!sources || sources.length === 0) {
            return '**Sources:**\nNo external sources were available for this response.';
        }
        const validSources = [];
        for (const source of sources) {
            if (!source.url || (await this.isUrlWorking(source.url))) {
                validSources.push(source);
            }
        }
        if (validSources.length === 0) {
            return '**Sources:**\nInformation based on knowledge base and internal documents.';
        }
        let output = '**Sources & References:**\n';
        validSources.forEach((source, index) => {
            if (source.url) {
                output += `${index + 1}. [${source.source}](${source.url})\n`;
            }
            else {
                output += `${index + 1}. ${source.source}\n`;
            }
        });
        return output;
    },
    /**
     * Clean and validate a single URL
     * Returns working URL or null if not working
     */
    async cleanUrl(url, checkHealth = true) {
        try {
            const urlObj = new URL(url);
            const cleaned = urlObj.toString();
            if (!this.isValidUrl(cleaned)) {
                return null;
            }
            if (checkHealth) {
                const working = await this.isUrlWorking(cleaned);
                return working ? cleaned : null;
            }
            return cleaned;
        }
        catch {
            return null;
        }
    },
    /**
     * Get working URLs only from a list
     */
    async getWorkingUrls(urls) {
        return this.filterWorkingUrls(urls);
    },
};
