"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRAGResults = formatRAGResults;
const url_validator_1 = require("../../../../services/utils/url.validator");
async function formatRAGResults(results) {
    if (!Array.isArray(results) || results.length === 0)
        return '';
    const formatted = await Promise.all(results.map(async (r, index) => {
        let sourceInfo = `[Source ${index + 1}]: ${r.content}`;
        const metadata = r.metadata;
        if (metadata && metadata.filename) {
            sourceInfo += ` (File: ${metadata.filename})`;
        }
        if (metadata && metadata.url) {
            const rawUrl = metadata.url;
            if (url_validator_1.urlValidator.isTrustedDomain(rawUrl)) {
                const validUrl = await url_validator_1.urlValidator.cleanUrl(rawUrl);
                if (validUrl)
                    sourceInfo += ` [${validUrl}]`;
            }
        }
        return sourceInfo;
    }));
    return formatted.join('\n\n');
}
