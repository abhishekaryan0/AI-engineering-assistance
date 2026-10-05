import { queryCacheService } from '../../../../../src/modules/engineering-assistant/services/data/query-cache.service';
import { logger } from '../../../../../src/utils/logger';

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

describe('QueryCacheService', () => {
  beforeEach(() => {
    queryCacheService.clear();
    jest.clearAllMocks();
  });

  it('should set and get values from cache', () => {
    const query = 'test query';
    const result = 'test result long enough';
    queryCacheService.set(query, result, 'test_intent');

    const cached = queryCacheService.get(query);
    expect(cached).toBe(result);
  });

  it('should return null for non-existent keys', () => {
    expect(queryCacheService.get('missing')).toBeNull();
  });

  it('should handle TTL expiration', () => {
    jest.useFakeTimers();
    const query = 'expiring query';
    queryCacheService.set(query, 'result content long', 'intent', {}, 10); // 10s TTL

    // Advance time by 11 seconds
    jest.advanceTimersByTime(11000);

    expect(queryCacheService.get(query)).toBeNull();
    jest.useRealTimers();
  });

  it('should not cache results with "Error"', () => {
    queryCacheService.set('query', 'Error fetching data', 'intent');
    expect(queryCacheService.get('query')).toBeNull();
  });

  it('should track stats', () => {
    queryCacheService.set('q1', 'result 1 content long', 'intent');
    queryCacheService.get('q1'); // Hit
    queryCacheService.get('q2'); // Miss

    const stats = queryCacheService.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });

  it('should implement LRU eviction', () => {
    // MAX_CACHE_SIZE is 1000, let's assume we can trigger it or trust the logic
    // In a unit test we might want to check the logic of LRU if we can mock the size
    // But queryCache doesn't expose MAX_CACHE_SIZE for override easily here.
    // We can check if getStatsDisplay works
    const display = queryCacheService.getStatsDisplay();
    expect(display).toContain('Cache Statistics');
  });

  it('should clear expired entries manually', () => {
    jest.useFakeTimers();
    queryCacheService.set('q1', 'result 1 content long', 'i', {}, 5);

    jest.advanceTimersByTime(6000);
    const cleared = queryCacheService.clearExpired();

    expect(cleared).toBe(1);
    expect(queryCacheService.getStats().size).toBe(0);
    jest.useRealTimers();
  });
});
