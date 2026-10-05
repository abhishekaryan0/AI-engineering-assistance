import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../../utils/AppError';
import { llmService } from '../../../../services/llm/llm.service';
import { glossaryService } from '../../../../modules/glossary';
import { askasssist } from '../../../../utils/askAssist.utils';
import { env } from '../../../../config/config';
import { logger } from '../../../../utils/logger';
import { executeAthenaQuery, ensureAthenaSchema, registerPartition, ANOMALY_SUGGESTIONS_TABLE, WELL_STATUS_TABLE } from '../../utils/athena-query';
import { uploadAlertActionToS3, overwriteAnomalySuggestionFile } from '../../utils/s3-writer';

export const AtRiskAssistantController = {
  /**
   * Ask a question about a specific anomaly alert
   */
  async atRiskAssistant(req: Request, res: Response, next: NextFunction) {
    try {
      let id = req.params.id as string;

      if (id && id.startsWith(':')) {
        id = id.substring(1);
      }

      const { question } = req.body;

      if (!question) {
        throw new AppError('Question is required', 400);
      }

      const user = (req as Request & { user?: { id: string; organization_id?: string } }).user;
      const orgId = user?.organization_id;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400);
      }

      // Step 1: Ensure schema is initialized
      await ensureAthenaSchema().catch((err: any) => logger.warn('Schema init warning:', err));

      // Step 2: Register partition for the organization
      await registerPartition(
        ANOMALY_SUGGESTIONS_TABLE,
        orgId,
        `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/anomaly_detection/`
      );

      // Query Athena instead of Prisma, joining on well_status table
      const sql = `
        SELECT
               t1.id,
               t1.well_id,
               t1.timestamp,
               t1.alert_title,
               t1.severity,
               t1.status,
               t1.confidence,
               t1.description,
               t1.explanation,
               t1.created_at,
               t1.asset_id,
               t1.reason,
               t1.lift_type,
               t1.category,
               t1.well_status,
               t1.organization_id,
               t2.status as s3_status, 
               t2.lift_type as s3_lift_type,
               t2.last_reading_timestamp,
               t2.strokes_per_minute,
               t2.motor_current,
               t2.status_reason as s3_status_reason
        FROM ${ANOMALY_SUGGESTIONS_TABLE} t1
        LEFT JOIN (
           SELECT *
           FROM (
             SELECT TRIM(well_id) as filtered_well_id, organization_id as filtered_org_id, *,
                    ROW_NUMBER() OVER (
                      PARTITION BY LOWER(TRIM(well_id)), organization_id 
                      ORDER BY COALESCE(updated_at, last_reading_timestamp) DESC
                    ) as row_num
             FROM ${WELL_STATUS_TABLE}
             WHERE organization_id = '${orgId}'
           ) WHERE row_num = 1
        ) t2 ON LOWER(TRIM(t1.well_id)) = LOWER(TRIM(t2.filtered_well_id)) AND t1.organization_id = t2.filtered_org_id
        WHERE t1.id = '${id}' AND t1.organization_id = '${orgId}' 
          AND "$path" LIKE '%/anomaly_suggestions_run_ts=%'
          AND "$path" NOT LIKE '%/history/%'
        LIMIT 1
      `;
      const athenaResults = await executeAthenaQuery<any>(sql);
      const alert = athenaResults[0];

      if (!alert) {
        logger.warn(`[AtRiskAssistant] Alert not found for ID: ${id} in org: ${orgId}`);
        throw new AppError('Alert not found', 404);
      }

      let alertContext = `
                Alert Title: ${alert.alert_title || 'N/A'}
                Well ID: ${alert.well_id}
                Timestamp: ${alert.timestamp}
                Severity: ${alert.severity || 'N/A'}
                Status: ${alert.status || 'N/A'}
                Well Status (S3): ${alert.s3_status || 'Unknown'}
                Confidence: ${alert.confidence || 'N/A'}
                Description: ${alert.description || 'N/A'}
                Explanation: ${alert.explanation || 'N/A'}
                Lift Type: ${alert.s3_lift_type || alert.lift_type || 'N/A'}
            `;

      const glossaryTerms = glossaryService.findTerms(question);
      if (glossaryTerms.length > 0) {
        alertContext += `\n\n--- GLOSSARY TERMS ---\n${glossaryTerms.join('\n\n')}\n--------------------------\n`;
      }

      if (env.AT_RISK_AI_MODEL_SEARCH) {
        try {
          const searchMessages = [
            {
              role: 'system' as const,
              content:
                "You are a specialized research assistant capable of using Google Search/Web Browsing. Your task is to find information related to the user's question, but you must STRICTLY filter your search and results to concepts related to the OIL, GAS, and WATER management industries. \n\nDirectives:\n1. Search for the terms in the user's question.\n2. Filter results: Only keep information relevant to petroleum engineering, well operations, or water injection systems.\n3. Output: Provide a concise technical summary of the terms or concepts found. If the term has no relation to oil/gas/water, clearly state that no relevant industrial context was found.",
            },
            {
              role: 'user' as const,
              content: `Find oil/gas/water industry context for this question: "${question}"`,
            },
          ];

          const { content: searchResponse } = await llmService.atRiskAssistantChat(
            searchMessages,
            env.AT_RISK_AI_MODEL_SEARCH
          );
          if (searchResponse && searchResponse.trim().length > 0) {
            alertContext += `\n\n--- WEB SUGGESTIONS (Google) ---\n${searchResponse}\n--------------------------------\n`;
          }
        } catch (searchError) {
          logger.warn(`[AtRiskAssistant] Web search failed:`, searchError);
        }
      }

      const messages = [
        {
          role: 'system' as const,
          content:
            "You are an expert petroleum engineer and data scientist specializing in anomaly detection for oil and gas assets. Your goal is to help users understand specific alerts based on the provided context.\n\nInstructions:\n1. RESPONSE STYLE: Answer the user's question DIRECTLY. If they ask 'how', explain the process/methods. If they ask 'what', provide a definition. Keep it SHORT, CONCISE, and DETAILED. Use bullet points for steps or lists.\n2. Use the provided 'Alert Context', 'Glossary Terms', and 'Web Suggestions' to inform your answer.\n3. CONTEXT INTEGRATION: Do NOT broadly list definitions if the user asks a specific question. Use the glossary/web context to construct a direct answer. Only use a 'Definition' format if the user provides a single keyword or explicitly asks for a definition.\n4. STRICT DEFINITION RULE: If the user's input is short or ambiguous (e.g., just a keyword like 'test') and there is NO matching definition in 'Glossary Terms' OR 'Web Suggestions', reply: \"Sorry, that term is not related to this anomaly.\"\n5. If a term is found but clearly NOT relevant to the current anomaly, explain what it is first, then state it is not relevant.\n6. Only explain the general anomaly alert if the user explicitly asks about the alert/anomaly or if the term is relevant.",
        },
        {
          role: 'user' as const,
          content: `I have a question about this anomaly alert:\n\nCONTEXT:\n${alertContext}\n\nQUESTION: ${question}`,
        },
      ];

      const { content: assistantResponse } = await llmService.chat(messages);
      const response = await askasssist(assistantResponse);

      res.status(200).json({
        response: response,
      });
    } catch (error) {
      logger.error('Error in askAboutAlert:', error);
      next(error);
    }
  },

  /**
   * Get all anomaly alerts
   */
  async getAtRiskAssets(req: Request, res: Response, next: NextFunction) {
    try {
      const { well_id, severity } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const user = (req as Request & { user?: { id: string; organization_id?: string } }).user;
      const orgId = user?.organization_id;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400);
      }

      // Step 1: Ensure schema is initialized
      await ensureAthenaSchema().catch((err: any) => logger.warn('Schema init warning:', err));

      // Step 2: Register partition for the organization
      await registerPartition(
        ANOMALY_SUGGESTIONS_TABLE,
        orgId,
        `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/anomaly_detection/`
      );

      // Step 3: Register partition for well status
      await registerPartition(
        WELL_STATUS_TABLE,
        orgId,
        `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/sensor_data/`
      );

      // Query Athena instead of Prisma, joining on well_status table
      // We use a Window function to get the latest version of each anomaly suggestion (deduping if files are updated)
      let sql = `
        SELECT
               t1.id,
               t1.well_id,
               t1.timestamp,
               t1.alert_title,
               t1.severity,
               t1.status,
               t1.confidence,
               t1.description,
               t1.explanation,
               t1.created_at,
               t1.asset_id,
               t1.reason,
               t1.lift_type,
               t1.category,
               t1.well_status,
               t1.organization_id,
               t2.status as s3_status, 
               t2.lift_type as s3_lift_type,
               t2.last_reading_timestamp,
               t2.last_reading_age_hours,
               t2.strokes_per_minute,
               t2.motor_current,
               t2.injection_rate,
               t2.anomaly_count_24h,
               t2.critical_anomaly_count_24h,
               t2.status_reason as s3_status_reason,
               t2.updated_at as s3_updated_at
        FROM (
          SELECT * FROM (
            SELECT *, row_number() OVER (PARTITION BY id ORDER BY COALESCE(created_at, timestamp) DESC) as row_num 
            FROM ${ANOMALY_SUGGESTIONS_TABLE} 
            WHERE organization_id = '${orgId}'
              AND "$path" LIKE '%/anomaly_suggestions_run_ts=%'
              AND "$path" NOT LIKE '%/history/%'
          ) WHERE row_num = 1
        ) t1
        LEFT JOIN (
          SELECT *
          FROM (
            SELECT TRIM(well_id) as filtered_well_id, organization_id as filtered_org_id, *,
                   ROW_NUMBER() OVER (
                     PARTITION BY LOWER(TRIM(well_id)), organization_id 
                     ORDER BY COALESCE(updated_at, last_reading_timestamp) DESC
                   ) as row_num
            FROM ${WELL_STATUS_TABLE}
            WHERE organization_id = '${orgId}'
          ) WHERE row_num = 1
        ) t2 ON LOWER(TRIM(t1.well_id)) = LOWER(TRIM(t2.filtered_well_id)) AND t1.organization_id = t2.filtered_org_id
        WHERE 1=1
      `;

      if (well_id) {
        sql += ` AND t1.well_id = '${well_id}'`;
      }

      if (severity) {
        const severityArray = Array.isArray(severity)
          ? (severity as any[]).map(String)
          : (severity as string).split(',').map((s) => s.trim());

        if (severityArray.length > 0) {
          const values = severityArray.map((s) => `'${s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()}'`).join(', ');
          sql += ` AND t1.severity IN (${values})`;
        }
      }

      sql += ` ORDER BY t1.timestamp DESC`;

      logger.info(`Fetching anomaly suggestions with S3 well status for org: ${orgId}`);
      const athenaResults = await executeAthenaQuery<any>(sql);

      const safeParse = (val: any): any => {
        if (val == null || val === '') return null;
        if (typeof val !== 'string') return val;
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      };

      // Map Athena results and handle "Unknown" status fallback
      const allAlerts = athenaResults.map((item: any) => ({
        ...item,
        well_status: item.s3_status || 'Unknown',
        s3_status: item.s3_status || 'Unknown',
        lift_type: item.s3_lift_type || item.lift_type || 'Unknown',

        // Core Columns
        id: item.id,

        // Complex/JSON fields (safe parse for Athena struct/array string output)
        raw_anomaly_data: safeParse(item.raw_anomaly_data),
        historical_context: safeParse(item.historical_context),
        risk_analysis: safeParse(item.risk_analysis),
        suggested_actions: safeParse(item.suggested_actions),

        last_reading_timestamp: item.last_reading_timestamp,
        last_reading_age_hours: item.last_reading_age_hours ? parseFloat(item.last_reading_age_hours) : null,
        strokes_per_minute: item.strokes_per_minute ? parseFloat(item.strokes_per_minute) : null,
        motor_current: item.motor_current ? parseFloat(item.motor_current) : null,
        injection_rate: item.injection_rate ? parseFloat(item.injection_rate) : null,
        anomaly_count_24h: item.anomaly_count_24h ? parseInt(item.anomaly_count_24h) : 0,
        critical_anomaly_count_24h: item.critical_anomaly_count_24h ? parseInt(item.critical_anomaly_count_24h) : 0,
        s3_status_reason: item.s3_status_reason,
        s3_updated_at: item.s3_updated_at,
        timestamp: item.timestamp ? new Date(item.timestamp) : null,
        created_at: item.created_at ? new Date(item.created_at) : null,
      }));

      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAlerts = allAlerts.slice(startIndex, endIndex);

      const criticalCount = allAlerts.filter(
        (a: any) => a.severity?.toLowerCase() === 'critical'
      ).length;
      const highCount = allAlerts.filter((a: any) => a.severity?.toLowerCase() === 'high').length;
      const mediumCount = allAlerts.filter((a: any) => a.severity?.toLowerCase() === 'medium').length;
      const lowCount = allAlerts.filter((a: any) => a.severity?.toLowerCase() === 'low').length;

      res.status(200).json({
        alerts: paginatedAlerts,
        counts: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        },
        pagination: {
          total: allAlerts.length,
          page,
          limit,
          totalPages: Math.ceil(allAlerts.length / limit),
        },
      });
    } catch (error) {
      logger.error('Error in getAtRiskAssets:', error);
      next(error);
    }
  },

  /**
   * Update alert status and reason
   */
  async updateAlertStatus(req: Request, res: Response, next: NextFunction) {
    try {
      let id = req.params.id as string;

      if (id && id.startsWith(':')) {
        id = id.substring(1);
      }

      const { status, reason } = req.body;

      if (!status) {
        throw new AppError('Status is required', 400);
      }

      const user = (req as Request & { user?: { id: string; organization_id?: string } }).user;
      const orgId = user?.organization_id;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400);
      }

      // 1. Fetch current alert and its S3 path from Athena
      const sql = `SELECT *, "$path" as s3_path FROM ${ANOMALY_SUGGESTIONS_TABLE} WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
      const athenaResults = await executeAthenaQuery<any>(sql);
      const currentAlert = athenaResults[0];

      if (!currentAlert) {
        throw new AppError('Alert not found', 404);
      }

      const targetS3Path = currentAlert.s3_path;

      // 2. Fetch ALL rows in that specific S3 file using Athena
      const fileRowsSql = `SELECT * FROM ${ANOMALY_SUGGESTIONS_TABLE} WHERE "$path" = '${targetS3Path}'`;
      const fileRows = await executeAthenaQuery<any>(fileRowsSql);

      // 3. Update the specific row
      let updatedCount = 0;
      const updatedRows = fileRows.map((row: any) => {
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

      if (updatedCount === 0) logger.warn(`[UpdateAlertStatus] ID ${id} not found in file rows!`);

      // 4. Overwrite the file in S3
      await overwriteAnomalySuggestionFile(targetS3Path, updatedRows);

      res.status(200).json({
        message: 'Alert updated successfully',
        alert: updatedRows.find((r: any) => r.id === id) || currentAlert,
      });
    } catch (error) {
      logger.error('Error in updateAlertStatus:', error);
      next(error);
    }
  },

  /**
   * Create or update a work item for an alert
   */
  async createWorkItem(req: Request, res: Response, next: NextFunction) {
    try {
      let id = req.params.id as string;

      if (id && id.startsWith(':')) {
        id = id.substring(1);
      }

      const { title, audience, location, scheduledDate, description, communicationMethods } =
        req.body;

      if (!title || !scheduledDate) {
        throw new AppError('Title and Scheduled Date are required', 400);
      }

      const user = (req as Request & { user?: { id: string; organization_id?: string } }).user;
      const orgId = user?.organization_id;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400);
      }

      // Verify if the alert exists in Athena
      const checkSql = `SELECT id FROM ${ANOMALY_SUGGESTIONS_TABLE} WHERE id = '${id}' AND organization_id = '${orgId}' LIMIT 1`;
      const athenaResults = await executeAthenaQuery<any>(checkSql);

      if (athenaResults.length === 0) {
        throw new AppError('Alert not found', 404);
      }

      const action = {
        id, // Same as AnomalySuggestion ID
        title,
        audience,
        location,
        scheduled_date: new Date(scheduledDate),
        description,
        communication_methods: communicationMethods,
        organization_id: orgId,
        created_at: new Date(),
        anomaly_suggestions_id: id
      };

      // Step 2: Store in S3 as Parquet
      await uploadAlertActionToS3(action, orgId);

      // Step 3: Register partition in Athena
      await registerPartition(
        'alert_actions',
        orgId,
        `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/take_actions/anomaly_detection/`
      );

      res.status(200).json({
        message: 'Alert action saved successfully to Athena/S3',
        action,
      });
    } catch (error) {
      logger.error('Error in createWorkItem:', error);
      next(error);
    }
  },
};
