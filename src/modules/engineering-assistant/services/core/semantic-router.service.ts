import { llmService } from '../../../../services/llm/llm.service';
import { logger } from '../../../../utils/logger';

// Predefined samples for domain routing
const IN_DOMAIN_SAMPLES = [
  'What is the pressure of the boiler?',
  'Analyze the oil and gas production data.',
  'Check the water treatment plant for anomalies.',
  'How do I maintain the centrifugal pump?',
  'Are there any active alerts for the turbine?',
  'Show me the sensor readings for a specific well.',
  'Generate a maintenance checklist for the compressor.',
  'Explain the reverse osmosis process in water treatment.',
  'What are the safety protocols for high voltage transformers?',
  'Give me recommendations for the recent temperature spikes.',
  'Summarize the uploaded piping and instrumentation diagram (P&ID).',
  'What can you do?',
  'In which sector do you help?',
  'What are your capabilities as an engineering assistant?',
  'How can you assist me?',
];

const OUT_DOMAIN_SAMPLES = [
  'Who won the cricket match yesterday?',
  'Write a romantic poem about the moon.',
  'What is the capital of France?',
  'How do you cook spicy Italian pasta?',
  'Tell me a funny joke.',
  'Review the latest Hollywood movie.',
  'What is the meaning of life?',
  'Can you write a React component for a button?',
  'How to tie a tie?',
  "What's the weather like today?",
];

// Cache for embeddings
let inDomainEmbeddings: number[][] | null = null;
let outDomainEmbeddings: number[][] | null = null;

export const semanticRouterService = {
  /**
   * Initializes the embeddings for the samples.
   * This is done lazily on the first request.
   */
  async initializeEmbeddings() {
    if (inDomainEmbeddings !== null && outDomainEmbeddings !== null) {
      return;
    }

    logger.info('🚀 Initializing Semantic Router Embeddings...');
    try {
      // Create embeddings in parallel batches
      const inPromises = IN_DOMAIN_SAMPLES.map((text) => llmService.embed(text));
      const outPromises = OUT_DOMAIN_SAMPLES.map((text) => llmService.embed(text));

      const inResults = await Promise.all(inPromises);
      const outResults = await Promise.all(outPromises);

      inDomainEmbeddings = inResults.map((r: { embedding: number[] }) => r.embedding);
      outDomainEmbeddings = outResults.map((r: { embedding: number[] }) => r.embedding);

      logger.info('✅ Semantic Router Embeddings Initialized.');
    } catch (error) {
      logger.error(`❌ Failed to initialize Semantic Router: ${error}`);
      throw error;
    }
  },

  /**
   * Calculates cosine similarity between two vectors.
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  /**
   * Perform semantic routing to check if a query is in-domain.
   * Returns a boolean indicating if it's in-domain.
   */
  async checkDomain(
    query: string
  ): Promise<{ isAllowed: boolean; confidence: number; reason: string }> {
    try {
      await this.initializeEmbeddings();

      const { embedding: queryVector } = await llmService.embed(query);

      let maxInDomainScore = -1;
      let maxOutDomainScore = -1;

      // Check against In-Domain
      for (const vec of inDomainEmbeddings!) {
        const score = this.cosineSimilarity(queryVector, vec);
        if (score > maxInDomainScore) maxInDomainScore = score;
      }

      // Check against Out-of-Domain
      for (const vec of outDomainEmbeddings!) {
        const score = this.cosineSimilarity(queryVector, vec);
        if (score > maxOutDomainScore) maxOutDomainScore = score;
      }

      logger.debug(
        `🧠 Semantic Router Scores -> In-Domain: ${maxInDomainScore.toFixed(3)}, Out-Domain: ${maxOutDomainScore.toFixed(3)}`
      );

      // Thresholds and Logic
      // If it's closer to out-of-domain explicitly
      if (maxOutDomainScore > maxInDomainScore && maxOutDomainScore > 0.4) {
        return {
          isAllowed: false,
          confidence: maxOutDomainScore,
          reason: 'Matched closely with out-of-domain topics.',
        };
      }

      // If it's weakly related to everything, it might be junk/general
      if (maxInDomainScore < 0.25) {
        return {
          isAllowed: false,
          confidence: 1 - maxInDomainScore,
          reason: 'Did not match any industry domain thresholds.',
        };
      }

      return {
        isAllowed: true,
        confidence: maxInDomainScore,
        reason: 'Matched in-domain industry topics.',
      };
    } catch (error) {
      logger.error(`Semantic Router Check Failed: ${error}`);
      // Fallback to true if embedding fails, so we don't block valid traffic
      return { isAllowed: true, confidence: 0.5, reason: 'Fallback to allowed due to error.' };
    }
  },
};
