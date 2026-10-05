import { semanticRouterService } from '../../../../../src/modules/engineering-assistant/services/core/semantic-router.service';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { logger } from '../../../../../src/utils/logger';

// Mock Dependencies
jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    embed: jest.fn(),
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Semantic Router Service', () => {
  // Clear mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // We cannot easily unset the internal module variables (`inDomainEmbeddings`, `outDomainEmbeddings`)
    // directly, so we must be mindful that initializeEmbeddings() only runs once across all tests
    // unless we reset modules.
  });

  describe('cosineSimilarity', () => {
    it('should correctly calculate cosine similarity', () => {
      const vecA = [1, 0, 0];
      const vecB = [1, 0, 0];
      const vecC = [0, 1, 0];
      const vecD = [0.5, 0.5, 0];

      expect(semanticRouterService.cosineSimilarity(vecA, vecB)).toBe(1);
      expect(semanticRouterService.cosineSimilarity(vecA, vecC)).toBe(0);
      expect(semanticRouterService.cosineSimilarity(vecA, vecD)).toBeCloseTo(0.707, 3);
    });

    it('should handle zero vectors by returning 0', () => {
      const vecA = [0, 0, 0];
      const vecB = [1, 1, 1];

      expect(semanticRouterService.cosineSimilarity(vecA, vecB)).toBe(0);
      expect(semanticRouterService.cosineSimilarity(vecA, vecA)).toBe(0);
    });
  });

  describe('initializeEmbeddings and checkDomain', () => {
    it('should initialize embeddings and allow strong in-domain query', async () => {
      // Mock llmService.embed globally for initialization and the first query
      // The service has 11 IN_DOMAIN and 10 OUT_DOMAIN samples = 21 initialization calls
      // Plus 1 call for the query itself.

      // Mock implementation to return fake embeddings based on length or prefix
      (llmService.embed as jest.Mock).mockImplementation((text: string) => {
        if (text === 'IN_DOMAIN_QUERY') {
          return Promise.resolve({ embedding: [1, 0, 0] }); // Match exactly with an in-domain vector
        } else if (text === 'OUT_DOMAIN_QUERY') {
          return Promise.resolve({ embedding: [0, 1, 0] }); // Match exactly with an out-domain vector
        } else if (text === 'AMBIGUOUS_QUERY') {
          return Promise.resolve({ embedding: [0, 0, 1] }); // Orthogonal to everything (low score)
        }

        // Setup initial embeddings: let's say all in-domain are [1, 0, 0] and out-domain are [0, 1, 0]
        // IN_DOMAIN_SAMPLES are 11 strings, OUT_DOMAIN_SAMPLES are 10 strings.
        // The texts are predefined sentences in semantic-router.service.ts.
        if (
          text.includes('pressure') ||
          text.includes('oil') ||
          text.includes('treatment') ||
          text.includes('pump') ||
          text.includes('turbine') ||
          text.includes('well') ||
          text.includes('compressor') ||
          text.includes('osmosis') ||
          text.includes('voltage') ||
          text.includes('temperature') ||
          text.includes('piping') ||
          text.includes('do') ||
          text.includes('sector') ||
          text.includes('capabilities') ||
          text.includes('assist')
        ) {
          return Promise.resolve({ embedding: [1, 0, 0] });
        } else {
          // Assuming it's an out-domain text from the predefined list
          return Promise.resolve({ embedding: [0, 1, 0] });
        }
      });

      const result = await semanticRouterService.checkDomain('IN_DOMAIN_QUERY');

      expect(result.isAllowed).toBe(true);
      expect(result.confidence).toBe(1);
      expect(result.reason).toBe('Matched in-domain industry topics.');
      expect(llmService.embed).toHaveBeenCalled();
    });

    it('should reject strong out-of-domain query', async () => {
      // Since initializeEmbeddings() caches the embeddings, it won't be called again here.
      // We only need to provide the embed response for the query.
      (llmService.embed as jest.Mock).mockResolvedValue({ embedding: [0, 1, 0] });

      const result = await semanticRouterService.checkDomain('OUT_DOMAIN_QUERY');

      expect(result.isAllowed).toBe(false);
      expect(result.confidence).toBe(1); // Since maxOutDomainScore is 1
      expect(result.reason).toBe('Matched closely with out-of-domain topics.');
    });

    it('should reject ambiguous / low-confidence query', async () => {
      // Orthogonal vector [0, 0, 1] meaning score with [1,0,0] is 0, score with [0,1,0] is 0
      (llmService.embed as jest.Mock).mockResolvedValue({ embedding: [0, 0, 1] });

      const result = await semanticRouterService.checkDomain('AMBIGUOUS_QUERY');

      expect(result.isAllowed).toBe(false);
      expect(result.confidence).toBe(1); // 1 - maxInDomainScore (1 - 0)
      expect(result.reason).toBe('Did not match any industry domain thresholds.');
    });

    it('should fallback to allowed if embedding fails', async () => {
      (llmService.embed as jest.Mock).mockRejectedValue(new Error('Embedding API down'));

      const result = await semanticRouterService.checkDomain('Any query');

      expect(result.isAllowed).toBe(true);
      expect(result.confidence).toBe(0.5);
      expect(result.reason).toBe('Fallback to allowed due to error.');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Semantic Router Check Failed')
      );
    });
  });

  describe('Initialization errors', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should throw an error if initializeEmbeddings fails on first use', async () => {
      let rejected = false;
      jest.doMock('../../../../../src/services/llm/llm.service', () => ({
        llmService: {
          embed: jest.fn().mockImplementation(() => {
            if (!rejected) {
              rejected = true;
              return Promise.reject(new Error('Init Failed'));
            }
            return new Promise(() => {}); // hang to avoid unhandled rejections
          }),
        },
      }));
      jest.doMock('../../../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
      }));

      const {
        semanticRouterService: freshRouterService,
      } = require('../../../../../src/modules/engineering-assistant/services/core/semantic-router.service');
      const { logger: mockLogger } = require('../../../../../src/utils/logger');

      await expect(freshRouterService.initializeEmbeddings()).rejects.toThrow('Init Failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize Semantic Router')
      );
    });

    it('checkDomain should return fallback and allowed=true if initialize fails during checkDomain', async () => {
      let checkDomainRejected = false;
      jest.doMock('../../../../../src/services/llm/llm.service', () => ({
        llmService: {
          embed: jest.fn().mockImplementation(() => {
            if (!checkDomainRejected) {
              checkDomainRejected = true;
              return Promise.reject(new Error('Init Failed Inside CheckDomain'));
            }
            return new Promise(() => {}); // hang to avoid unhandled rejections
          }),
        },
      }));
      jest.doMock('../../../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
      }));

      const {
        semanticRouterService: freshRouterService,
      } = require('../../../../../src/modules/engineering-assistant/services/core/semantic-router.service');

      const result = await freshRouterService.checkDomain('Test');
      expect(result.isAllowed).toBe(true);
      expect(result.confidence).toBe(0.5);
      expect(result.reason).toBe('Fallback to allowed due to error.');
    });
  });
});
