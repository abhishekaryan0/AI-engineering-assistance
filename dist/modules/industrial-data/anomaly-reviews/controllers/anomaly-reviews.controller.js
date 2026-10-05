"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnomalyReviewController = void 0;
const AppError_1 = require("../../../../utils/AppError");
const llm_service_1 = require("../../../../services/llm/llm.service");
const glossary_1 = require("../../../../modules/glossary");
const config_1 = require("../../../../config/config");
const askAssist_utils_1 = require("../../../../utils/askAssist.utils");
const logger_1 = require("../../../../utils/logger");
const athena_query_1 = require("../../utils/athena-query");
const s3_writer_1 = require("../../utils/s3-writer");
exports.AnomalyReviewController = {
    async getAnomalyReviews(req, res, next) {
        try {
            const user = req.user;
            const orgId = user?.organization_id;
            if (!orgId) {
                throw new AppError_1.AppError('Organization ID is required', 400);
            }
            // Step 1: Ensure schema is initialized
            await (0, athena_query_1.ensureAthenaSchema)().catch((err) => logger_1.logger.warn('Schema init warning:', err));
            // Step 2: Register partition for the organization
            await (0, athena_query_1.registerPartition)('anomaly_reviews', orgId, `s3://${config_1.env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/anomaly_review/`);
            // Query Athena instead of Prisma using a Window function to get the latest version of each record
            // We use COALESCE on updated_at to ensure it works even if some files lack that column (using detected_at as fallback)
            let sql = `
        SELECT * FROM (
          SELECT *, row_number() OVER (PARTITION BY id ORDER BY COALESCE(updated_at, detected_at) DESC) as row_num 
          FROM anomaly_reviews 
          WHERE organization_id = '${orgId}'
        ) WHERE row_num = 1
        ORDER BY detected_at DESC
      `;
            logger_1.logger.info(`Fetching anomaly reviews from Athena for org: ${orgId}`);
            const reviews = await (0, athena_query_1.executeAthenaQuery)(sql);
            // Map Athena results (parsing numbers/dates)
            const mappedReviews = reviews.map((item) => ({
                ...item,
                impact_value: item.impact_value ? parseFloat(item.impact_value) : null,
                detected_at: item.detected_at ? new Date(item.detected_at) : null,
                event_date: item.event_date ? new Date(item.event_date) : null,
                reason: item.reason || null,
                ui_text: item.ui_text ? (typeof item.ui_text === 'string' ? JSON.parse(item.ui_text) : item.ui_text) : null,
                chart_data: item.chart_data ? (typeof item.chart_data === 'string' ? JSON.parse(item.chart_data) : item.chart_data) : null,
                impact_metrics: item.impact_metrics ? (typeof item.impact_metrics === 'string' ? JSON.parse(item.impact_metrics) : item.impact_metrics) : null,
            }));
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedReviews = mappedReviews.slice(startIndex, endIndex);
            res.status(200).json({
                reviews: paginatedReviews,
                pagination: {
                    total: mappedReviews.length,
                    page,
                    limit,
                    totalPages: Math.ceil(mappedReviews.length / limit),
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getAnomalyReviews:', error);
            next(error);
        }
    },
    async updateStatus(req, res, next) {
        try {
            let id = req.params.id;
            if (id && id.startsWith(':')) {
                id = id.substring(1).trim();
            }
            else if (id) {
                id = id.trim();
            }
            const { status, reason } = req.body;
            if (!status && !reason) {
                throw new AppError_1.AppError('Status or Reason is required', 400);
            }
            const user = req.user;
            const orgId = user?.organization_id;
            if (!orgId) {
                throw new AppError_1.AppError('Organization ID is required', 400);
            }
            // 1. Fetch current review from Athena, including the S3 path
            const sql = `SELECT *, "$path" as s3_path FROM anomaly_reviews WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
            const athenaResults = await (0, athena_query_1.executeAthenaQuery)(sql);
            const currentReview = athenaResults[0];
            if (!currentReview) {
                throw new AppError_1.AppError('Anomaly review not found in Athena', 404);
            }
            const targetS3Path = currentReview.s3_path;
            // 2. Fetch ALL rows in that specific S3 file using Athena
            // This bypasses the need for our Node app to parse complex Parquet V2 files
            const fileRowsSql = `SELECT * FROM anomaly_reviews WHERE "$path" = '${targetS3Path}'`;
            const fileRows = await (0, athena_query_1.executeAthenaQuery)(fileRowsSql);
            // 3. Update the specific row
            let updatedCount = 0;
            const updatedRows = fileRows.map(row => {
                if (row.id === id) {
                    updatedCount++;
                    return {
                        ...row,
                        status: status || row.status,
                        reason: reason || row.reason,
                        updated_at: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
                    };
                }
                return row;
            });
            if (updatedCount === 0)
                logger_1.logger.warn(`[UpdateStatus] ID ${id} not found in file rows!`);
            // 4. Overwrite the file in S3 using our working parquet writer
            await (0, s3_writer_1.overwriteAnomalyReviewFile)(targetS3Path, updatedRows);
            res.status(200).json({
                message: 'Status updated successfully in S3',
                review: updatedRows.find(r => r.id === id) || currentReview,
            });
        }
        catch (error) {
            logger_1.logger.error('Error in updateStatus (S3):', error);
            next(error);
        }
    },
    async takeAction(req, res, next) {
        try {
            let id = req.params.id;
            if (id && id.startsWith(':')) {
                id = id.substring(1);
            }
            const { title, audience, location, scheduledDate, description, communicationMethods } = req.body;
            if (!title || !scheduledDate) {
                throw new AppError_1.AppError('Title and Scheduled Date are required', 400);
            }
            const user = req.user;
            const orgId = user?.organization_id;
            if (!orgId) {
                throw new AppError_1.AppError('Organization ID is required', 400);
            }
            // Verify if the anomaly exists in Athena
            const checkSql = `SELECT id FROM anomaly_reviews WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
            const athenaResults = await (0, athena_query_1.executeAthenaQuery)(checkSql);
            if (athenaResults.length === 0) {
                throw new AppError_1.AppError('Anomaly review not found', 404);
            }
            const action = {
                id, // Same as AnomalyReview ID
                title,
                audience,
                location,
                scheduled_date: new Date(scheduledDate),
                description,
                communication_methods: communicationMethods,
                organization_id: orgId,
                created_at: new Date(),
                anomaly_reviews_id: id
            };
            // Step 2: Store in S3 as Parquet
            await (0, s3_writer_1.uploadAnomalyActionToS3)(action, orgId);
            // Step 3: Register partition in Athena
            await (0, athena_query_1.registerPartition)('anomaly_review_actions', orgId, `s3://${config_1.env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/take_actions/anomaly_reviews/`);
            res.status(200).json({
                message: 'Action taken successfully and saved to Athena/S3',
                action,
            });
        }
        catch (error) {
            logger_1.logger.error('Error in takeAction:', error);
            next(error);
        }
    },
    async askAssistant(req, res, next) {
        try {
            let id = req.params.id;
            if (id && id.startsWith(':')) {
                id = id.substring(1);
            }
            const { question } = req.body;
            if (!question) {
                throw new AppError_1.AppError('Question is required', 400);
            }
            const user = req.user;
            const orgId = user?.organization_id;
            if (!orgId) {
                throw new AppError_1.AppError('Organization ID is required', 400);
            }
            // Query Athena instead of Prisma
            const sql = `SELECT * FROM anomaly_reviews WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
            const athenaResults = await (0, athena_query_1.executeAthenaQuery)(sql);
            let review = athenaResults[0];
            if (!review) {
                throw new AppError_1.AppError('Anomaly review not found', 404);
            }
            // Map Athena result
            review = {
                ...review,
                impact_value: review.impact_value ? parseFloat(review.impact_value) : null,
                detected_at: review.detected_at ? new Date(review.detected_at) : null,
                event_date: review.event_date ? new Date(review.event_date) : null,
                ui_text: review.ui_text ? (typeof review.ui_text === 'string' ? JSON.parse(review.ui_text) : review.ui_text) : null,
                chart_data: review.chart_data ? (typeof review.chart_data === 'string' ? JSON.parse(review.chart_data) : review.chart_data) : null,
                impact_metrics: review.impact_metrics ? (typeof review.impact_metrics === 'string' ? JSON.parse(review.impact_metrics) : review.impact_metrics) : null,
            };
            const eventDate = review.event_date ? new Date(review.event_date).toISOString() : 'N/A';
            const detectedAt = review.detected_at ? new Date(review.detected_at).toISOString() : 'N/A';
            const impactValue = review.impact_value !== null && review.impact_value !== undefined
                ? review.impact_value
                : 'N/A';
            const impactMetrics = review.impact_metrics ? JSON.stringify(review.impact_metrics) : 'N/A';
            let uiText = 'N/A';
            try {
                uiText = review.ui_text ? JSON.stringify(review.ui_text) : 'N/A';
            }
            catch (_e) {
                uiText = 'Invalid UI text';
            }
            let chartSummary = 'None';
            try {
                chartSummary = review.chart_data ? JSON.stringify(review.chart_data).slice(0, 500) : 'None';
            }
            catch (_e) {
                chartSummary = 'Available';
            }
            let reviewContext = `
                Title: ${review.title || 'N/A'}
                Well ID: ${review.well_id}
                Event Date: ${eventDate}
                Detected At: ${detectedAt}
                Anomaly Code: ${review.anomaly_code}
                Category: ${review.category || 'N/A'}
                Severity: ${review.severity || 'N/A'}
                Status: ${review.status || 'N/A'}
                Reason: ${review.reason || 'N/A'}
                Impact Value: ${impactValue}
                Impact Metrics: ${impactMetrics}
                Description/UI Text: ${uiText}
                Chart Data Summary: ${chartSummary}
            `;
            const glossaryTerms = glossary_1.glossaryService.findTerms(question);
            if (glossaryTerms.length > 0) {
                reviewContext += `\n\n--- GLOSSARY TERMS ---\n${glossaryTerms.join('\n\n')}\n--------------------------\n`;
            }
            if (config_1.env.AT_RISK_AI_MODEL_SEARCH) {
                try {
                    const searchMessages = [
                        {
                            role: 'system',
                            content: "You are a specialized research assistant capable of using Google Search/Web Browsing. Your task is to find information related to the user's question, but you must STRICTLY filter your search and results to concepts related to the OIL, GAS, and WATER management industries. \n\nDirectives:\n1. Search for the terms in the user's question.\n2. Filter results: Only keep information relevant to petroleum engineering, well operations, or water injection systems.\n3. Output: Provide a concise technical summary of the terms or concepts found. If the term has no relation to oil/gas/water, clearly state that no relevant industrial context was found.",
                        },
                        {
                            role: 'user',
                            content: `Find oil/gas/water industry context for this question: "${question}"`,
                        },
                    ];
                    const { content: searchResponse } = await llm_service_1.llmService.atRiskAssistantChat(searchMessages, config_1.env.AT_RISK_AI_MODEL_SEARCH);
                    if (searchResponse && searchResponse.trim().length > 0) {
                        reviewContext += `\n\n--- WEB SUGGESTIONS (Google) ---\n${searchResponse}\n--------------------------------\n`;
                    }
                }
                catch (searchError) {
                    logger_1.logger.warn(`[AnomalyReviewAssistant] Web search failed:`, searchError);
                }
            }
            const messages = [
                {
                    role: 'system',
                    content: "You are an expert petroleum engineer and data scientist specializing in anomaly detection for oil and gas assets. Your goal is to help users understand specific anomaly reviews based on the provided context.\n\nInstructions:\n1. RESPONSE STYLE: Answer the user's question DIRECTLY. If they ask 'how', explain the process/methods. If they ask 'what', provide a definition. Keep it SHORT, CONCISE, and DETAILED. Use bullet points for steps or lists.\n2. Use the provided 'Context', 'Glossary Terms', and 'Web Suggestions' to inform your answer.3. CONTEXT INTEGRATION: Do NOT broadly list definitions if the user asks a specific question. Use the glossary/web context to construct a direct answer. Only use a 'Definition' format if the user provides a single keyword or explicitly asks for a definition.\n4. STRICT DEFINITION RULE: If the user's input is short or ambiguous (e.g., just a keyword like 'test') and there is NO matching definition in 'Glossary Terms' OR 'Web Suggestions', reply: \"Sorry, that term is not related to this anomaly.\"\n5. If a term is found but clearly NOT relevant to the current anomaly, explain what it is first, then state it is not relevant.\n6. Only explain the general anomaly if the user explicitly asks about the alert/anomaly or if the term is relevant.",
                },
                {
                    role: 'user',
                    content: `I have a question about this anomaly review:\n\nCONTEXT:\n${reviewContext}\n\nQUESTION: ${question}`,
                },
            ];
            const { content: assistantResponse } = await llm_service_1.llmService.chat(messages);
            const response = await (0, askAssist_utils_1.askasssist)(assistantResponse);
            res.status(200).json({
                response: response,
            });
        }
        catch (error) {
            logger_1.logger.error('Error in askAssistant:', error);
            next(error);
        }
    },
};
