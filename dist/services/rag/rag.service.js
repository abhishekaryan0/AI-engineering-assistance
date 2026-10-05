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
exports.ragService = void 0;
const db_1 = require("../../config/db");
const llm_service_1 = require("../llm/llm.service");
const textsplitters_1 = require("@langchain/textsplitters");
const crypto = __importStar(require("crypto"));
const logger_1 = require("../../utils/logger");
const semantic_reranker_service_1 = require("../../modules/engineering-assistant/services/data/semantic-reranker.service");
exports.ragService = {
    /**
     * Store Document in Vector DB
     * Handles: Deduplication, Chunking, Embedding, Storage
     */
    async addDocument(text, metadata) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            logger_1.logger.debug('⚠️ Empty text passed to ragService. Skipping.');
            return;
        }
        const fileHash = crypto.createHash('sha256').update(text).digest('hex');
        const existing = (await db_1.prisma.$queryRaw `SELECT id FROM "chat_document_chunks" WHERE "fileHash" = ${fileHash} LIMIT 1`);
        if (existing.length > 0) {
            logger_1.logger.debug(`♻️ Skipping duplicate content (File: ${metadata.filename}, Page: ${metadata.page || 'N/A'})`);
            return;
        }
        const splitter = new textsplitters_1.RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const docs = await splitter.createDocuments([text]);
        logger_1.logger.debug(`🧠 Vectorizing ${docs.length} chunks for ${metadata.filename}...`);
        const BATCH_SIZE = 20;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (doc) => {
                try {
                    const { embedding: vector } = await llm_service_1.llmService.embed(doc.pageContent);
                    const orgId = metadata.organization_id;
                    if (!orgId) {
                        logger_1.logger.debug('⚠️ Missing organization_id in metadata for ragService. Skipping embedding.');
                        return;
                    }
                    const vectorStr = `[${vector.join(',')}]`;
                    await db_1.prisma.$executeRaw `
                        INSERT INTO "chat_document_chunks" (id, content, metadata, "fileHash", embedding, "createdAt", "organization_id")
                        VALUES (gen_random_uuid(), ${doc.pageContent}, ${metadata}, ${fileHash}, ${vectorStr}::vector, NOW(), ${orgId});
                    `;
                }
                catch (error) {
                    logger_1.logger.debug(`❌ Error embedding chunk: ${error}`);
                }
            }));
        }
        logger_1.logger.debug(`✅ Indexed ${docs.length} chunks successfully.`);
    },
    /**
     * Search Vector DB with semantic re-ranking
     * Handles: Query Embedding, Similarity Search, Metadata Filtering, Re-ranking
     */
    async search(query, limit = 5, filter) {
        const { embedding: queryVector, usage } = await llm_service_1.llmService.embed(query);
        const vectorStr = `[${queryVector.join(',')}]`;
        const searchTerms = query
            .split(/\s+/)
            .filter((w) => w.length > 2)
            .slice(0, 5);
        logger_1.logger.debug(`🔍 Multi-tenant Hybrid Search for user ${filter?.userId} in org ${filter?.organization_id}`);
        let vectorResults = [];
        let keywordResults = [];
        // 1. Vector Search (Semantic similarity with User + Session + Org Isolation)
        if (filter?.organization_id) {
            vectorResults = (await db_1.prisma.$queryRaw `
                SELECT content, metadata, 1 - (embedding <=> ${vectorStr}::vector) as similarity
                FROM "chat_document_chunks"
                WHERE "organization_id" = ${filter.organization_id}
                AND (
                  (metadata->>'sessionId' = ${filter.sessionId} AND metadata->>'userId' = ${filter.userId})
                  OR metadata->>'sessionId' IS NULL
                )
                ORDER BY similarity DESC
                LIMIT ${limit * 3};
            `);
            // 2. Keyword Search (Exact matching with User + Session + Org Isolation)
            if (searchTerms.length > 0) {
                const likeClauses = searchTerms.map((t) => `%${t}%`);
                // Use Prisma.join
                const { Prisma } = require('@prisma/client');
                const conditions = likeClauses.map((clause) => Prisma.sql `"content" ILIKE ${clause}`);
                keywordResults = (await db_1.prisma.$queryRaw `
                  SELECT content, metadata, 0.95 as similarity 
                  FROM "chat_document_chunks"
                  WHERE "organization_id" = ${filter.organization_id}
                  AND (
                    (metadata->>'sessionId' = ${filter.sessionId} AND metadata->>'userId' = ${filter.userId})
                    OR metadata->>'sessionId' IS NULL
                  )
                  AND (${Prisma.join(conditions, ' OR ')})
                  LIMIT ${limit};
              `);
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
        const reRankedResults = await semantic_reranker_service_1.semanticRerankerService.reRankResults(query, hybridPool, 0.6);
        const finalResults = reRankedResults.slice(0, limit).map((r) => ({
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
    async getFiles(sessionId, orgId) {
        let results;
        if (orgId) {
            results = (await db_1.prisma.$queryRaw `
            SELECT DISTINCT metadata->>'filename' as filename
            FROM "chat_document_chunks"
            WHERE metadata->>'sessionId' = ${sessionId}
              AND "organization_id" = ${orgId}
        `);
        }
        else {
            results = [];
        }
        return results.map((r) => r.filename).filter(Boolean);
    },
};
