/**
 * Query Cache Service
 * LRU cache for tool results with TTL and metrics
 */

import { logger } from '../../../../utils/logger';
import * as crypto from 'crypto';

export interface CachedQueryResult {
  key: string;
  query: string;
  params: Record<string, unknown>;
  result: any;
  intent: string;
  createdAt: Date;
  ttlSeconds: number;
  hitCount: number;
  accessedAt: Date;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  mostUsedKey: string | null;
  oldestEntry: CachedQueryResult | null;
  newestEntry: CachedQueryResult | null;
}

class QueryCache {
  private cache: Map<string, CachedQueryResult> = new Map();
  private readonly DEFAULT_TTL = 3600; // 1 hour
  private readonly MAX_CACHE_SIZE = 1000; // Max entries
  private stats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
  };

  private generateKey(query: string, params?: Record<string, unknown>): string {
    const combined = `${query}:${JSON.stringify(params || {})}`;
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  /**
   * Get cached result if available and not expired
   */
  get(query: string, params?: Record<string, unknown>, ttlSeconds?: number): any | null {
    const key = this.generateKey(query, params);
    const cached = this.cache.get(key);

    this.stats.totalRequests++;

    if (!cached) {
      this.stats.misses++;
      logger.debug(`💾 Cache MISS: ${query.substring(0, 30)}...`);
      return null;
    }

    // Check if expired
    const ageSeconds = (Date.now() - cached.createdAt.getTime()) / 1000;
    const ttl = ttlSeconds || cached.ttlSeconds;

    if (ageSeconds > ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      logger.debug(
        `⏰ Cache EXPIRED: ${query.substring(0, 30)}... (age: ${ageSeconds.toFixed(0)}s)`
      );
      return null;
    }

    // Update hit count and access time
    cached.hitCount++;
    cached.accessedAt = new Date();
    this.stats.hits++;

    logger.debug(
      `✅ Cache HIT (${cached.hitCount}x): ${query.substring(0, 30)}... (age: ${ageSeconds.toFixed(0)}s)`
    );
    return cached.result;
  }

  /**
   * Set cached result with optional TTL override
   */
  set(
    query: string,
    result: any,
    intent: string,
    params?: Record<string, unknown>,
    ttlSeconds?: number
  ): void {
    const key = this.generateKey(query, params);

    // Don't cache error results
    if (result && typeof result === 'string' && result.includes('Error')) {
      logger.debug(`⚠️  Not caching error result: ${result.substring(0, 30)}...`);
      return;
    }

    // Don't cache empty results
    if (!result || (typeof result === 'string' && result.length < 10)) {
      logger.debug(`⚠️  Not caching empty result`);
      return;
    }

    // Implement LRU: remove oldest if at capacity
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Date.now();

      this.cache.forEach((entry, k) => {
        if (entry.accessedAt.getTime() < oldestTime) {
          oldestTime = entry.accessedAt.getTime();
          oldestKey = k;
        }
      });

      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug(`🗑️  LRU eviction: removed oldest cache entry`);
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

    logger.debug(
      `💾 Cached result for: ${query.substring(0, 30)}... (TTL: ${ttlSeconds || this.DEFAULT_TTL}s, cache size: ${this.cache.size})`
    );
  }

  /**
   * Clear entire cache and reset statistics
   */
  clear(): void {
    const oldSize = this.cache.size;
    this.cache.clear();
    this.resetStats();
    logger.info(`🗑️  Cache cleared (was ${oldSize} entries)`);
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.totalRequests = 0;
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
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
      logger.info(`🗑️  Cleared ${cleared} expired cache entries`);
    }
    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let mostUsedKey: string | null = null;
    let maxHits = 0;
    let oldestEntry: CachedQueryResult | null = null;
    let oldestTime = Date.now();
    let newestEntry: CachedQueryResult | null = null;
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
  getAllEntries(): CachedQueryResult[] {
    return Array.from(this.cache.values());
  }
}

// Export singleton instance
export const queryCache = new QueryCache();

export const queryCacheService = {
  /**
   * Get cached result or null
   */
  get(query: string, params?: Record<string, unknown>): any | null {
    return queryCache.get(query, params);
  },

  /**
   * Cache result with optional TTL
   */
  set(
    query: string,
    result: any,
    intent: string,
    params?: Record<string, unknown>,
    ttlSeconds?: number
  ): void {
    queryCache.set(query, result, intent, params, ttlSeconds);
  },

  /**
   * Clear cache
   */
  clear(): void {
    queryCache.clear();
  },

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    return queryCache.clearExpired();
  },

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    queryCache.resetStats();
  },

  /**
   * Get statistics
   */
  getStats(): CacheStats {
    return queryCache.getStats();
  },

  /**
   * Get all cached entries
   */
  getAllEntries(): CachedQueryResult[] {
    return queryCache.getAllEntries();
  },

  /**
   * Get stats display
   */
  getStatsDisplay(): string {
    const stats = queryCache.getStats();
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
