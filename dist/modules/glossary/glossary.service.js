"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.glossaryService = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const logger_1 = require("../../utils/logger");
exports.glossaryService = {
    terms: [],
    isInitialized: false,
    /**
     * Initialize the service.
     * Strategy:
     * 1. Try to load from JSON (Fastest local source)
     * 2. (Future) Option to load from DB if configured
     */
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            await this.loadFromJson();
            this.isInitialized = true;
        }
        catch (error) {
            logger_1.logger.error('❌ Failed to initialize glossary:', error);
        }
    },
    /**
     * Load terms from the local JSON file.
     * Use this for speed and simplicity.
     */
    async loadFromJson() {
        const filePath = path.resolve(__dirname, 'data/og_glossary.json');
        if (!fs.existsSync(filePath)) {
            logger_1.logger.warn(`⚠️ Glossary file not found at ${filePath}`);
            return;
        }
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(fileContent);
            this.terms = data;
        }
        catch (error) {
            logger_1.logger.error('❌ Error parsing glossary JSON:', error);
        }
    },
    /**
     * Find terms in a query string.
     * Uses in-memory O(N) scan which is extremely fast for < 10,000 terms.
     */
    findTerms(query) {
        if (!query || this.terms.length === 0)
            return [];
        const normalizedQuery = query.toLowerCase();
        const foundTerms = [];
        const seen = new Set();
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
