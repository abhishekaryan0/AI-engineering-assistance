"use strict";
/**
 * Query Cache Service
 * LRU cache for tool results with TTL and metrics
 */
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
exports.queryCacheService = exports.queryCache = void 0;
const logger_1 = require("../../../../utils/logger");
const crypto = __importStar(require("crypto"));
class QueryCache {
    constructor() {
        this.cache = new Map();
        this.DEFAULT_TTL = 3600; // 1 hour
        this.MAX_CACHE_SIZE = 1000; // Max entries
        this.stats = {
            hits: 0,
            misses: 0,
            totalRequests: 0,
        };
    }
    generateKey(query, params) {
        const combined = `${query}:${JSON.stringify(params || {})}`;
        return crypto.createHash('md5').update(combined).digest('hex');
    }
    /**
     * Get cached result if available and not expired
     */
    get(query, params, ttlSeconds) {
        const key = this.generateKey(query, params);
        const cached = this.cache.get(key);
        this.stats.totalRequests++;
        if (!cached) {
            this.stats.misses++;
            logger_1.logger.debug(`💾 Cache MISS: ${query.substring(0, 30)}...`);
            return null;
        }
        // Check if expired
        const ageSeconds = (Date.now() - cached.createdAt.getTime()) / 1000;
        const ttl = ttlSeconds || cached.ttlSeconds;
        if (ageSeconds > ttl) {
            this.cache.delete(key);
            this.stats.misses++;
            logger_1.logger.debug(`⏰ Cache EXPIRED: ${query.substring(0, 30)}... (age: ${ageSeconds.toFixed(0)}s)`);
            return null;
        }
        // Update hit count and access time
        cached.hitCount++;
        cached.accessedAt = new Date();
        this.stats.hits++;
        logger_1.logger.debug(`✅ Cache HIT (${cached.hitCount}x): ${query.substring(0, 30)}... (age: ${ageSeconds.toFixed(0)}s)`);
        return cached.result;
    }
    /**
     * Set cached result with optional TTL override
     */
    set(query, result, intent, params, ttlSeconds) {
        const key = this.generateKey(query, params);
        // Don't cache error results
        if (result && typeof result === 'string' && result.includes('Error')) {
            logger_1.logger.debug(`⚠️  Not caching error result: ${result.substring(0, 30)}...`);
            return;
        }
        // Don't cache empty results
        if (!result || (typeof result === 'string' && result.length < 10)) {
            logger_1.logger.debug(`⚠️  Not caching empty result`);
            return;
        }
        // Implement LRU: remove oldest if at capacity
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            let oldestKey = null;
            let oldestTime = Date.now();
            this.cache.forEach((entry, k) => {
                if (entry.accessedAt.getTime() < oldestTime) {
                    oldestTime = entry.accessedAt.getTime();
                    oldestKey = k;
                }
            });
            if (oldestKey) {
                this.cache.delete(oldestKey);
                logger_1.logger.debug(`🗑️  LRU eviction: removed oldest cache entry`);
            }
        }
        this.cache.set(key, {
            key,
            query,
            params: params || {},
            result,
            intent,
            createdAt: new Date(),
            ttlSeconds: ttlSeconds || this.DEFAULT_TTL,
            hitCount: 0,
            accessedAt: new Date(),
        });
        logger_1.logger.debug(`💾 Cached result for: ${query.substring(0, 30)}... (TTL: ${ttlSeconds || this.DEFAULT_TTL}s, cache size: ${this.cache.size})`);
    }
    /**
     * Clear entire cache and reset statistics
     */
    clear() {
        const oldSize = this.cache.size;
        this.cache.clear();
        this.resetStats();
        logger_1.logger.info(`🗑️  Cache cleared (was ${oldSize} entries)`);
    }
    /**
     * Reset cache statistics
     */
    resetStats() {
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.stats.totalRequests = 0;
    }
    /**
     * Clear expired entries
     */
    clearExpired() {
        let cleared = 0;
        const now = Date.now();
        this.cache.forEach((entry, key) => {
            const ageSeconds = (now - entry.createdAt.getTime()) / 1000;
            if (ageSeconds > entry.ttlSeconds) {
                this.cache.delete(key);
                cleared++;
            }
        });
        if (cleared > 0) {
            logger_1.logger.info(`🗑️  Cleared ${cleared} expired cache entries`);
        }
        return cleared;
    }
    /**
     * Get cache statistics
     */
    getStats() {
        let mostUsedKey = null;
        let maxHits = 0;
        let oldestEntry = null;
        let oldestTime = Date.now();
        let newestEntry = null;
        let newestTime = 0;
        this.cache.forEach((entry) => {
            if (entry.hitCount > maxHits) {
                mostUsedKey = entry.key;
                maxHits = entry.hitCount;
            }
            if (entry.createdAt.getTime() < oldestTime) {
                oldestTime = entry.createdAt.getTime();
                oldestEntry = entry;
            }
            if (entry.createdAt.getTime() > newestTime) {
                newestTime = entry.createdAt.getTime();
                newestEntry = entry;
            }
        });
        const hitRate = this.stats.totalRequests > 0 ? this.stats.hits / this.stats.totalRequests : 0;
        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: Number(hitRate.toFixed(3)),
            mostUsedKey,
            oldestEntry: oldestEntry || null,
            newestEntry: newestEntry || null,
        };
    }
    /**
     * Get all entries (for debugging)
     */
    getAllEntries() {
        return Array.from(this.cache.values());
    }
}
// Export singleton instance
exports.queryCache = new QueryCache();
exports.queryCacheService = {
    /**
     * Get cached result or null
     */
    get(query, params) {
        return exports.queryCache.get(query, params);
    },
    /**
     * Cache result with optional TTL
     */
    set(query, result, intent, params, ttlSeconds) {
        exports.queryCache.set(query, result, intent, params, ttlSeconds);
    },
    /**
     * Clear cache
     */
    clear() {
        exports.queryCache.clear();
    },
    /**
     * Clear expired entries
     */
    clearExpired() {
        return exports.queryCache.clearExpired();
    },
    /**
     * Reset cache statistics
     */
    resetStats() {
        exports.queryCache.resetStats();
    },
    /**
     * Get statistics
     */
    getStats() {
        return exports.queryCache.getStats();
    },
    /**
     * Get all cached entries
     */
    getAllEntries() {
        return exports.queryCache.getAllEntries();
    },
    /**
     * Get stats display
     */
    getStatsDisplay() {
        const stats = exports.queryCache.getStats();
        return `
    📊 Cache Statistics:
    ├─ Size: ${stats.size} entries
    ├─ Hit Rate: ${(stats.hitRate * 100).toFixed(1)}% (${stats.hits} hits, ${stats.misses} misses)
    ├─ Most Used: ${stats.mostUsedKey?.substring(0, 8)}...
    ├─ Oldest: ${stats.oldestEntry?.query.substring(0, 20)}...
    └─ Newest: ${stats.newestEntry?.query.substring(0, 20)}...
    `;
    },
};
