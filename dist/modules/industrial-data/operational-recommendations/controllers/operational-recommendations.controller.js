"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationalRecommendationsController = void 0;
const AppError_1 = require("../../../../utils/AppError");
const llm_service_1 = require("../../../../services/llm/llm.service");
const glossary_1 = require("../../../../modules/glossary");
const config_1 = require("../../../../config/config");
const askAssist_utils_1 = require("../../../../utils/askAssist.utils");
const logger_1 = require("../../../../utils/logger");
const athena_query_1 = require("../../utils/athena-query");
const s3_writer_1 = require("../../utils/s3-writer");
exports.OperationalRecommendationsController = {
    /**
     * Ask a question about a specific operation suggestion
     */
    async askAssistant(req, res, next) {
        try {
            let id = req.params.id;
            const { question } = req.body;
            if (id) {
                id = id.replace(/^["']|["']$/g, '').replace(/^:/, '');
            }
            if (!question) {
                logger_1.logger.debug('Missing question. Request body:', req.body);
                throw new AppError_1.AppError('Question is required', 400);
            }
            const user = req.user;
            const orgId = user?.organization_id;
            if (!orgId) {
                throw new AppError_1.AppError('Organization ID is required', 400);
            }
            // Query Athena instead of Prisma
            const sql = `SELECT * FROM operation_recommendations WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
            const athenaResults = await (0, athena_query_1.executeAthenaQuery)(sql);
            const suggestion = athenaResults[0];
            if (!suggestion) {
                logger_1.logger.debug(`Operation suggestion not found for ID: [${id}]`);
                throw new AppError_1.AppError('Operation suggestion not found', 404);
            }
            let suggestionContext = `
                Action: ${suggestion.action}
                Well ID: ${suggestion.well_id}
                Priority: ${suggestion.priority || 'N/A'}
                Status: ${suggestion.status || 'N/A'}
                Confidence: ${suggestion.confidence_percent ? suggestion.confidence_percent + '%' : 'N/A'}
                Expected Impact: ${suggestion.expected_impact || 'N/A'}
                Production Increase: ${suggestion.production_increase_bbl_day ? suggestion.production_increase_bbl_day + ' bbl/day' : 'N/A'}
                Net Daily Benefit: ${suggestion.net_daily_benefit_usd ? '$' + suggestion.net_daily_benefit_usd : 'N/A'}
                Implementation Cost: ${suggestion.implementation_cost_usd ? '$' + suggestion.implementation_cost_usd : 'N/A'}
                Asset Value Increase: ${suggestion.asset_value_increase_usd ? '$' + suggestion.asset_value_increase_usd : 'N/A'}
                Time Reduced: ${suggestion.time_reduced_hours ? suggestion.time_reduced_hours + ' hours' : 'N/A'}
                Detailed Analysis: ${suggestion.detailed_analysis || 'N/A'}
                Current Performance: ${suggestion.current_performance || 'N/A'}
                Optimal Performance: ${suggestion.optimal_performance || 'N/A'}
                Recommended Model: ${suggestion.recommended_model || 'N/A'}
                Conservative Approach: ${suggestion.conservative_approach || 'N/A'}
                Aggressive Optimization: ${suggestion.aggressive_optimization || 'N/A'}
                Hybrid Model: ${suggestion.hybrid_model || 'N/A'}
            `;
            const glossaryTerms = glossary_1.glossaryService.findTerms(question);
            if (glossaryTerms.length > 0) {
                suggestionContext += `\n\n--- GLOSSARY TERMS ---\n${glossaryTerms.join('\n\n')}\n--------------------------\n`;
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
                        suggestionContext += `\n\n--- WEB SUGGESTIONS (Google) ---\n${searchResponse}\n--------------------------------\n`;
                    }
                }
                catch (searchError) {
                    logger_1.logger.warn(`[OperationalAssistant] Web search failed:`, searchError);
                }
            }
            const messages = [
                {
                    role: 'system',
                    content: "You are an expert petroleum engineer and operations optimizer specializing in oil and gas asset management. Your goal is to help users understand specific operational suggestions by providing technical depth, implementation guidance, and risk-reward analysis based on the provided suggestion data.\n\nInstructions:\n1. RESPONSE STYLE: Answer the user's question DIRECTLY. If they ask 'how', explain the process/methods. If they ask 'what', provide a definition. Keep it SHORT, CONCISE, and DETAILED. Use bullet points for steps or lists.\n2. Use the provided 'Context', 'Glossary Terms', and 'Web Suggestions' to inform your answer. ALWAYS prioritize discussing the cost implications, ROI, and financial feasibility of the operation when relevant.\n3. CONTEXT INTEGRATION: Do NOT broadly list definitions if the user asks a specific question. Use the glossary/web context to construct a direct answer. Only use a 'Definition' format if the user provides a single keyword or explicitly asks for a definition.\n4. STRICT DEFINITION RULE: If the user's input is short or ambiguous (e.g., just a keyword like 'test') and there is NO matching definition in 'Glossary Terms' OR 'Web Suggestions', reply: \"Sorry, that term is not related to this operation.\"\n5. If a term is found but clearly NOT relevant to the current operation, explain what it is first, then state it is not relevant.",
                },
                {
                    role: 'user',
                    content: `I have a question about this operational suggestion:\n\nCONTEXT:\n${suggestionContext}\n\nQUESTION: ${question}`,
                },
            ];
            const { content: assistantResponse } = await llm_service_1.llmService.chat(messages);
            const response = await (0, askAssist_utils_1.askasssist)(assistantResponse);
            res.status(200).json({
                response: response,
            });
        }
        catch (error) {
            logger_1.logger.error('Error in askAboutOperation:', error);
            next(error);
        }
    },
    /**
     * Get all operation suggestions
     */
    async getAllSuggestions(req, res, next) {
        try {
            const user = req.user;
            const orgId = user?.organization_id;
            if (!orgId) {
                throw new AppError_1.AppError('Organization ID is required', 400);
            }
            const { well_id, severity } = req.query;
            // Step 1: Ensure schema is initialized
            await (0, athena_query_1.ensureAthenaSchema)().catch((err) => logger_1.logger.warn('Schema init warning:', err));
            // Step 2: Register partition for the organization
            await (0, athena_query_1.registerPartition)('operation_recommendations', orgId, `s3://${config_1.env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/operations/`);
            // Query Athena instead of Prisma
            let sql = `SELECT * FROM operation_recommendations WHERE organization_id = '${orgId}'`;
            if (well_id) {
                sql += ` AND well_id = '${well_id}'`;
            }
            // Add severity filter (maps to priority column)
            if (severity) {
                const severityArray = Array.isArray(severity)
                    ? severity.map(String)
                    : severity.split(',').map((s) => s.trim());
                if (severityArray.length > 0) {
                    const values = severityArray.map((s) => `'${s.toUpperCase()}'`).join(', ');
                    sql += ` AND priority IN (${values})`;
                }
            }
            sql += ` ORDER BY created_at DESC`;
            logger_1.logger.info(`Fetching suggestions from Athena for org: ${orgId}`);
            const athenaResults = await (0, athena_query_1.executeAthenaQuery)(sql);
            // Map Athena results to match the expected format (parsing numbers and dates)
            const allSuggestions = athenaResults.map((item) => ({
                ...item,
                confidence_percent: item.confidence_percent ? parseFloat(item.confidence_percent) : null,
                production_increase_bbl_day: item.production_increase_bbl_day
                    ? parseFloat(item.production_increase_bbl_day)
                    : null,
                production_increase_percent: item.production_increase_percent
                    ? parseFloat(item.production_increase_percent)
                    : null,
                daily_expense_benefit_usd: item.daily_expense_benefit_usd
                    ? parseFloat(item.daily_expense_benefit_usd)
                    : null,
                implementation_cost_usd: item.implementation_cost_usd
                    ? parseFloat(item.implementation_cost_usd)
                    : null,
                net_daily_benefit_usd: item.net_daily_benefit_usd
                    ? parseFloat(item.net_daily_benefit_usd)
                    : null,
                asset_value_increase_usd: item.asset_value_increase_usd
                    ? parseFloat(item.asset_value_increase_usd)
                    : null,
                time_reduced_hours: item.time_reduced_hours ? parseFloat(item.time_reduced_hours) : null,
                created_at: item.created_at ? new Date(item.created_at) : null,
                updated_at: item.updated_at ? new Date(item.updated_at) : null,
            }));
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const activeSuggestions = allSuggestions.filter((s) => !['Dismissed', 'Completed', 'Rejected'].includes(s.status || ''));
            const PERIODS = {
                day: 1,
                month: 30,
                year: 365,
                tenYears: 3650,
                economicLife: 5475,
            };
            const baseMetrics = activeSuggestions.reduce((acc, item) => {
                return {
                    production: acc.production + (item.production_increase_bbl_day || 0),
                    loe: acc.loe + (item.daily_expense_benefit_usd || 0),
                    investment: acc.investment + (item.implementation_cost_usd || 0),
                    netDailyBenefit: acc.netDailyBenefit + (item.net_daily_benefit_usd || 0),
                    timeReduced: acc.timeReduced + (item.time_reduced_hours || 0),
                };
            }, {
                production: 0,
                loe: 0,
                investment: 0,
                netDailyBenefit: 0,
                timeReduced: 0,
            });
            const calculateMetrics = (multiplier) => {
                const totalBenefit = baseMetrics.netDailyBenefit * multiplier;
                const totalInvestment = baseMetrics.investment;
                let profitabilityIndex = 0;
                if (totalInvestment > 0) {
                    profitabilityIndex = totalBenefit / totalInvestment;
                }
                else if (totalBenefit > 0) {
                    profitabilityIndex = 0;
                }
                return {
                    productionImpact: baseMetrics.production * multiplier,
                    loeImpact: baseMetrics.loe * multiplier,
                    npvImpact: baseMetrics.loe * multiplier, // Following dashboard legacy logic
                    profitabilityIndex: Number(profitabilityIndex.toFixed(2)),
                    unproductiveTimeReduced: baseMetrics.timeReduced, // Returning constant total time reduced
                };
            };
            const metrics = {
                day: calculateMetrics(PERIODS.day),
                month: calculateMetrics(PERIODS.month),
                year: calculateMetrics(PERIODS.year),
                tenYears: calculateMetrics(PERIODS.tenYears),
                economicLife: calculateMetrics(PERIODS.economicLife),
            };
            const paginatedSuggestions = allSuggestions.slice(startIndex, endIndex);
            res.status(200).json({
                suggestions: paginatedSuggestions,
                metrics,
                totalOpportunities: allSuggestions.length,
                activeOpportunities: activeSuggestions.length,
                pagination: {
                    total: allSuggestions.length,
                    page,
                    limit,
                    totalPages: Math.ceil(allSuggestions.length / limit),
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getAllSuggestions:', error);
            next(error);
        }
    },
    /**
     * Update status and reason of an operation suggestion
     */
    async updateStatusAndReason(req, res, next) {
        try {
            let id = req.params.id;
            const { status, reason } = req.body;
            if (id) {
                id = id.replace(/^["']|["']$/g, '').replace(/^:/, '');
            }
            if (!status && !reason) {
                throw new AppError_1.AppError('At least one of status or reason is required', 400);
            }
            const user = req.user;
            const orgId = user?.organization_id;
            if (!orgId) {
                throw new AppError_1.AppError('Organization ID is required', 400);
            }
            // 1. Fetch current suggestion and its S3 path from Athena
            const sql = `SELECT *, "$path" as s3_path FROM operation_recommendations WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
            const athenaResults = await (0, athena_query_1.executeAthenaQuery)(sql);
            const currentSuggestion = athenaResults[0];
            if (!currentSuggestion) {
                throw new AppError_1.AppError('Operation suggestion not found', 404);
            }
            const targetS3Path = currentSuggestion.s3_path;
            // 2. Fetch ALL rows in that specific S3 file using Athena
            const fileRowsSql = `SELECT * FROM operation_recommendations WHERE "$path" = '${targetS3Path}'`;
            const fileRows = await (0, athena_query_1.executeAthenaQuery)(fileRowsSql);
            // 3. Update the specific row
            let updatedCount = 0;
            const updatedRows = fileRows.map(row => {
                if (row.id === id) {
                    updatedCount++;
                    return {
                        ...row,
                        status: status || row.status,
                        status_reason: reason || row.status_reason,
                        updated_at: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
                    };
                }
                return row;
            });
            if (updatedCount === 0)
                logger_1.logger.warn(`[UpdateStatusAndReason] ID ${id} not found in file rows!`);
            // 4. Overwrite the file in S3 using our working parquet writer
            await (0, s3_writer_1.overwriteOperationRecommendationFile)(targetS3Path, updatedRows);
            res.status(200).json({
                message: 'Operation suggestion updated successfully',
                suggestion: updatedRows.find(r => r.id === id) || currentSuggestion,
            });
        }
        catch (error) {
            logger_1.logger.error('Error in updateStatusAndReason:', error);
            next(error);
        }
    },
    /**
     * Create or update a work item for an operation suggestion
     */
    async createWorkItem(req, res, next) {
        try {
            let id = req.params.id;
            if (id) {
                id = id.replace(/^["']|["']$/g, '').replace(/^:/, '');
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
            // Verify if the suggestion exists in Athena
            const checkSql = `SELECT id FROM operation_recommendations WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
            const athenaResults = await (0, athena_query_1.executeAthenaQuery)(checkSql);
            if (athenaResults.length === 0) {
                throw new AppError_1.AppError('Operation suggestion not found', 404);
            }
            const action = {
                id, // Same as OperationSuggestion ID
                title,
                audience,
                location,
                scheduled_date: new Date(scheduledDate),
                description,
                communication_methods: communicationMethods,
                organization_id: orgId,
                created_at: new Date(),
                operation_recommendations_id: id
            };
            // Step 2: Store in S3 as Parquet
            await (0, s3_writer_1.uploadActionToS3)(action, orgId);
            // Step 3: Register partition in Athena (optional but good for discovery)
            await (0, athena_query_1.registerPartition)('operation_actions', orgId, `s3://${config_1.env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/take_actions/operations/`);
            res.status(200).json({
                message: 'Operation action saved successfully to Athena/S3',
                action,
            });
        }
        catch (error) {
            logger_1.logger.error('Error in createWorkItem:', error);
            next(error);
        }
    },
};
