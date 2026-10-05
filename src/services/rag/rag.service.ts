import { prisma } from '../../config/db';
import { llmService } from '../llm/llm.service';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';
import { semanticRerankerService } from '../../modules/engineering-assistant/services/data/semantic-reranker.service';

export const ragService = {
  /**
   * Store Document in Vector DB
   * Handles: Deduplication, Chunking, Embedding, Storage
   */

  async addDocument(text: string | undefined | null, metadata: Record<string, unknown>) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      logger.debug('⚠️ Empty text passed to ragService. Skipping.');
      return;
    }

    const fileHash = crypto.createHash('sha256').update(text).digest('hex');
    const existing =
      (await prisma.$queryRaw`SELECT id FROM "chat_document_chunks" WHERE "fileHash" = ${fileHash} LIMIT 1`) as Array<{
        id: string;
      }>;

    if (existing.length > 0) {
      logger.debug(
        `♻️ Skipping duplicate content (File: ${metadata.filename}, Page: ${metadata.page || 'N/A'})`
      );
      return;
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await splitter.createDocuments([text]);

    logger.debug(`🧠 Vectorizing ${docs.length} chunks for ${metadata.filename}...`);

    const BATCH_SIZE = 20;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (doc) => {
          try {
            const { embedding: vector } = await llmService.embed(doc.pageContent);
            const orgId = metadata.organization_id as string;
            if (!orgId) {
              logger.debug(
                '⚠️ Missing organization_id in metadata for ragService. Skipping embedding.'
              );
              return;
            }
            const vectorStr = `[${vector.join(',')}]`;

            await prisma.$executeRaw`
                        INSERT INTO "chat_document_chunks" (id, content, metadata, "fileHash", embedding, "createdAt", "organization_id")
                        VALUES (gen_random_uuid(), ${doc.pageContent}, ${metadata}, ${fileHash}, ${vectorStr}::vector, NOW(), ${orgId});
                    `;
          } catch (error) {
            logger.debug(`❌ Error embedding chunk: ${error}`);
          }
        })
      );
    }

    logger.debug(`✅ Indexed ${docs.length} chunks successfully.`);
  },

  /**
   * Search Vector DB with semantic re-ranking
   * Handles: Query Embedding, Similarity Search, Metadata Filtering, Re-ranking
   */

  async search(
    query: string,
    limit = 5,
    filter?: { sessionId?: string; organization_id?: string; userId?: string }
  ): Promise<{
    results: Array<{
      content: string;
      metadata: Record<string, unknown>;
      similarity: number;
      relevanceScore?: number;
    }>;
    usage: OpenAI.Embeddings.CreateEmbeddingResponse.Usage | undefined;
  }> {
    const { embedding: queryVector, usage } = await llmService.embed(query);
    const vectorStr = `[${queryVector.join(',')}]`;
    const searchTerms = query
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 5);

    logger.debug(
      `🔍 Multi-tenant Hybrid Search for user ${filter?.userId} in org ${filter?.organization_id}`
    );

    let vectorResults: any[] = [];
    let keywordResults: any[] = [];

    // 1. Vector Search (Semantic similarity with User + Session + Org Isolation)
    if (filter?.organization_id) {
      vectorResults = (await prisma.$queryRaw`
                SELECT content, metadata, 1 - (embedding <=> ${vectorStr}::vector) as similarity
                FROM "chat_document_chunks"
                WHERE "organization_id" = ${filter.organization_id}
                AND (
                  (metadata->>'sessionId' = ${filter.sessionId} AND metadata->>'userId' = ${filter.userId})
                  OR metadata->>'sessionId' IS NULL
                )
                ORDER BY similarity DESC
                LIMIT ${limit * 3};
            `) as any[];

      // 2. Keyword Search (Exact matching with User + Session + Org Isolation)
      if (searchTerms.length > 0) {
        const likeClauses = searchTerms.map((t) => `%${t}%`);

        // Use Prisma.join
        const { Prisma } = require('@prisma/client');
        const conditions = likeClauses.map((clause) => Prisma.sql`"content" ILIKE ${clause}`);

        keywordResults = (await prisma.$queryRaw`
                  SELECT content, metadata, 0.95 as similarity 
                  FROM "chat_document_chunks"
                  WHERE "organization_id" = ${filter.organization_id}
                  AND (
                    (metadata->>'sessionId' = ${filter.sessionId} AND metadata->>'userId' = ${filter.userId})
                    OR metadata->>'sessionId' IS NULL
                  )
                  AND (${Prisma.join(conditions, ' OR ')})
                  LIMIT ${limit};
              `) as any[];
      }
    }

    // 3. Deduplication and Hybrid Merging
    const seen = new Set();
    const hybridPool = [...keywordResults, ...vectorResults].filter((item) => {
      const duplicate = seen.has(item.content);
      seen.add(item.content);
      return !duplicate;
    });

    // 4. Apply semantic re-ranking (Final Verification)
    const reRankedResults = await semanticRerankerService.reRankResults(query, hybridPool, 0.6);

    const finalResults = reRankedResults.slice(0, limit).map((r: any) => ({
      content: r.content,
      metadata: r.metadata,
      similarity: r.similarity,
      relevanceScore: r.relevanceScore,
    }));

    return { results: finalResults, usage };
  },
  /**
   * Get list of files for a session
   */
  async getFiles(sessionId: string, orgId?: string): Promise<string[]> {
    let results: Array<{ filename: string }>;
    if (orgId) {
      results = (await prisma.$queryRaw`
            SELECT DISTINCT metadata->>'filename' as filename
            FROM "chat_document_chunks"
            WHERE metadata->>'sessionId' = ${sessionId}
              AND "organization_id" = ${orgId}
        `) as Array<{ filename: string }>;
    } else {
      results = [];
    }
    return results.map((r) => r.filename).filter(Boolean);
  },
};
