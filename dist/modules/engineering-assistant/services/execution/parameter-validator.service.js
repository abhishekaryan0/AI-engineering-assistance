"use strict";
/**
 * Parameter Validator Service
 * Validates and converts tool parameters with type checking and cross-parameter logic
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parameterValidatorService = void 0;
const llm_service_1 = require("../../../../services/llm/llm.service");
const logger_1 = require("../../../../utils/logger");
const config_1 = require("../../../../config/config");
exports.parameterValidatorService = {
    /**
     * Extract and validate tool parameters with type checking
     */
    async extractAndValidateParameters(prompt, tool, chatHistory = []) {
        const startTime = Date.now();
        const errors = [];
        const warnings = [];
        const historyContext = chatHistory
            .slice(-2)
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n');
        // Build parameter schema description
        const paramSchema = tool.parameters
            .map((p) => `- ${p.name} (${p.type})${p.required === false ? ' [optional]' : ''}: ${p.description}`)
            .join('\n');
        const systemPrompt = `You are a parameter extractor for tool: "${tool.name}"
Tool Description: ${tool.description}

Extract parameters from the user query. Handle ambiguous dates using TODAY: ${new Date().toISOString().split('T')[0]}.
Be strict about required parameters - they must be present or inferrable from context.

IMPORTANT: Handle following conversions:
- Date ranges like "last week" → startDate and endDate
- "all" or "everything" → limit: 100
- Relative dates → absolute ISO dates

Parameter Schema:
${paramSchema}

Return ONLY valid JSON:
{
  "tool": "${tool.name}",
  "params": { your extracted parameters }
}`;
        try {
            const userContent = `${historyContext ? `Context:\\n${historyContext}\\n\\n` : ''}Query: "${prompt}"`;
            const startExtract = Date.now();
            const extraction = await llm_service_1.llmService.chatJson([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ], config_1.env.AI_MODEL_DECISION || 'gpt-4o-mini');
            const params = extraction?.content?.params ?? {};
            let confidence = 0.85;
            logger_1.logger.debug(`⏱️  Parameter extraction took ${Date.now() - startExtract}ms for ${tool.name}`);
            // Validate each parameter against schema
            for (const paramDef of tool.parameters) {
                const paramValue = params[paramDef.name];
                // Required parameter check
                if (paramDef.required &&
                    (paramValue === undefined || paramValue === null || paramValue === '')) {
                    errors.push(`✗ Required parameter '${paramDef.name}' is missing or empty`);
                    confidence -= 0.2;
                    continue;
                }
                // Type validation and conversion
                if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
                    const validation = this.validateAndConvertType(paramValue, paramDef.type, paramDef.name);
                    if (!validation.isValid) {
                        errors.push(`✗ ${paramDef.name}: ${validation.error}`);
                        confidence -= 0.15;
                    }
                    else if (validation.warning) {
                        warnings.push(`⚠️  ${paramDef.name}: ${validation.warning}`);
                    }
                    else if (validation.converted !== undefined && validation.converted !== paramValue) {
                        params[paramDef.name] = validation.converted;
                        logger_1.logger.debug(`  Converted ${paramDef.name}: ${paramValue} → ${validation.converted}`);
                    }
                }
            }
            // Cross-parameter validation
            const crossErrors = this.validateParameterLogic(params, tool.name);
            if (crossErrors.length > 0) {
                errors.push(...crossErrors);
                confidence -= 0.1 * crossErrors.length;
            }
            if (errors.length === 0) {
                logger_1.logger.info(`✅ Parameters validated successfully for ${tool.name} (confidence: ${(confidence * 100).toFixed(0)}%)`);
            }
            else {
                logger_1.logger.warn(`⚠️  Parameter validation failed: ${errors.join('; ')}`);
            }
            return {
                isValid: errors.length === 0,
                params,
                errors,
                warnings,
                confidence: Math.max(0, confidence),
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            logger_1.logger.error('❌ Parameter extraction error:', error);
            return {
                isValid: false,
                params: {},
                errors: [error.message],
                warnings: [],
                confidence: 0,
                executionTime: Date.now() - startTime,
            };
        }
    },
    /**
     * Validate and convert parameter to correct type
     */
    validateAndConvertType(value, expectedType, paramName) {
        // Handle ISO date or date string
        if (expectedType.toLowerCase().includes('iso') || expectedType.toLowerCase().includes('date')) {
            let dateStr = value;
            // Handle relative dates
            const today = new Date();
            if (dateStr.toLowerCase().includes('last week')) {
                const lastWeek = new Date(today);
                lastWeek.setDate(lastWeek.getDate() - 7);
                dateStr = lastWeek.toISOString().split('T')[0];
            }
            else if (dateStr.toLowerCase().includes('last month')) {
                const lastMonth = new Date(today);
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                dateStr = lastMonth.toISOString().split('T')[0];
            }
            else if (dateStr.toLowerCase().includes('today')) {
                dateStr = today.toISOString().split('T')[0];
            }
            else if (dateStr.toLowerCase().includes('yesterday')) {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                dateStr = yesterday.toISOString().split('T')[0];
            }
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) {
                    return {
                        isValid: false,
                        error: `Invalid date format: "${value}" - expected ISO date (YYYY-MM-DD)`,
                    };
                }
                const isoString = date.toISOString();
                return { isValid: true, converted: isoString };
            }
            catch {
                return { isValid: false, error: `Cannot parse date: ${value}` };
            }
        }
        // Handle number
        if (expectedType.toLowerCase() === 'number') {
            if (typeof value === 'number') {
                return { isValid: true, converted: value };
            }
            const num = parseFloat(value);
            if (isNaN(num)) {
                return { isValid: false, error: `Expected number, got: ${value}` };
            }
            return { isValid: true, converted: num };
        }
        // Handle string
        if (expectedType.toLowerCase() === 'string') {
            const str = String(value).trim();
            if (str.length === 0) {
                return { isValid: false, error: `Empty string provided for ${paramName}` };
            }
            if (str.length > 1000) {
                return {
                    isValid: true,
                    converted: str,
                    warning: `String is ${str.length} chars, may be too long`,
                };
            }
            return { isValid: true, converted: str };
        }
        // Handle enum or specific values
        if (expectedType.toLowerCase() === 'enum' || expectedType.includes('|')) {
            return { isValid: true, converted: value };
        }
        return { isValid: true, converted: value };
    },
    /**
     * Validate logic between parameters (e.g., startDate < endDate)
     * Enhanced with stricter business logic validation
     */
    validateParameterLogic(params, toolName) {
        const errors = [];
        try {
            // Date range validation (STRICT)
            if (params.startDate && params.endDate) {
                const start = new Date(params.startDate);
                const end = new Date(params.endDate);
                if (isNaN(start.getTime())) {
                    errors.push(`✗ Invalid startDate format: ${params.startDate}. Expected ISO format (YYYY-MM-DD).`);
                }
                else if (isNaN(end.getTime())) {
                    errors.push(`✗ Invalid endDate format: ${params.endDate}. Expected ISO format (YYYY-MM-DD).`);
                }
                else if (start > end) {
                    errors.push(`✗ CRITICAL: startDate must be BEFORE endDate. Got: ${params.startDate} > ${params.endDate}`);
                }
                else if (start.getTime() === end.getTime()) {
                    logger_1.logger.warn(`⚠️  startDate equals endDate. Single day query will be executed.`);
                }
                else {
                    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff > 365) {
                        logger_1.logger.warn(`⚠️  Large date range requested: ${daysDiff.toFixed(0)} days. Query may timeout.`);
                    }
                    if (daysDiff < 0) {
                        errors.push(`✗ Date range is negative (${daysDiff.toFixed(1)} days).`);
                    }
                }
                // Check for future dates
                const now = new Date();
                if (end > now) {
                    logger_1.logger.warn(`⚠️  End date is in the future. Only historical data available.`);
                }
            }
            else {
                // Check individual dates if no range
                if (params.startDate && !params.endDate) {
                    logger_1.logger.warn(`⚠️  startDate specified without endDate. Using current date as endDate.`);
                }
                if (params.endDate && !params.startDate) {
                    logger_1.logger.warn(`⚠️  endDate specified without startDate. Using earliest date as startDate.`);
                }
            }
            // Numeric bounds validation (STRICT)
            if (params.limit) {
                const limit = Number(params.limit);
                if (isNaN(limit)) {
                    errors.push(`✗ limit must be a number, got: ${params.limit}`);
                }
                else if (limit < 1) {
                    errors.push(`✗ limit must be >= 1, got: ${limit}`);
                }
                else if (limit > 1000) {
                    errors.push(`⚠️  limit requested (${limit}) exceeds maximum (1000). Capping at 1000.`);
                    params.limit = 1000;
                }
            }
            // Pressure/Temperature bounds (Oil & Gas specific)
            if (params.minPressure !== undefined && params.maxPressure !== undefined) {
                const minP = Number(params.minPressure);
                const maxP = Number(params.maxPressure);
                if (minP > maxP) {
                    errors.push(`✗ minPressure (${minP}) must be <= maxPressure (${maxP})`);
                }
                if (minP < 0 || maxP < 0) {
                    errors.push(`✗ Pressure values cannot be negative. Got: min=${minP}, max=${maxP}`);
                }
                if (maxP > 10000) {
                    logger_1.logger.warn(`⚠️  maxPressure (${maxP} psi) exceeds typical well pressures. Verify input.`);
                }
            }
            if (params.minTemperature !== undefined && params.maxTemperature !== undefined) {
                const minT = Number(params.minTemperature);
                const maxT = Number(params.maxTemperature);
                if (minT > maxT) {
                    errors.push(`✗ minTemperature (${minT}°F) must be <= maxTemperature (${maxT}°F)`);
                }
                if (minT < -60 || maxT > 500) {
                    logger_1.logger.warn(`⚠️  Temperature out of typical range. Got: ${minT}°F to ${maxT}°F. Verify unit (F vs C).`);
                }
            }
            // Well ID validation (STRICT)
            if (params.well_id && typeof params.well_id === 'string') {
                const wellId = params.well_id.trim();
                if (wellId.length === 0) {
                    errors.push(`✗ well_id cannot be empty`);
                }
                else if (wellId.length > 100) {
                    errors.push(`✗ well_id too long (${wellId.length} chars, max 100)`);
                }
                // Check format (alphanumeric + dash/underscore)
                if (!/^[a-zA-Z0-9\-_]+$/.test(wellId)) {
                    errors.push(`✗ well_id contains invalid characters. Use only letters, numbers, dash, underscore.`);
                }
            }
            // Asset type validation
            if (params.assetType) {
                const validTypes = [
                    'pump',
                    'compressor',
                    'separator',
                    'heater',
                    'valve',
                    'meter',
                    'sensor',
                    'well',
                ];
                const assetType = String(params.assetType).toLowerCase();
                if (!validTypes.includes(assetType)) {
                    logger_1.logger.warn(`⚠️  Unknown assetType: ${assetType}. Valid values: ${validTypes.join(', ')}`);
                }
            }
            // Confidence/Threshold validation
            if (params.confidence || params.threshold) {
                const conf = Number(params.confidence ?? params.threshold ?? 0.5);
                if (isNaN(conf)) {
                    errors.push(`✗ confidence/threshold must be a number, got: ${params.confidence ?? params.threshold}`);
                }
                else if (conf < 0 || conf > 1) {
                    errors.push(`✗ confidence/threshold must be between 0 and 1, got: ${conf}`);
                }
            }
            // Cross-parameter consistency
            if (toolName?.includes('Anomaly') && !params.limit) {
                logger_1.logger.warn(`⚠️  Anomaly tool used without limit. Defaulting to limit=50 for performance.`);
                params.limit = 50;
            }
        }
        catch (error) {
            logger_1.logger.error(`Error in parameter logic validation:`, error);
            errors.push(`Logic validation error: ${error.message}`);
        }
        return errors;
    },
    /**
     * Get validation summary for logging
     */
    getSummary(result) {
        if (result.isValid) {
            return `✅ Valid (confidence: ${(result.confidence * 100).toFixed(0)}%)${result.warnings.length > 0 ? ` with ${result.warnings.length} warnings` : ''}`;
        }
        return `❌ Invalid: ${result.errors.join('; ')}`;
    },
};
