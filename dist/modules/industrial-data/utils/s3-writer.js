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
exports.uploadActionToS3 = uploadActionToS3;
exports.uploadAnomalyActionToS3 = uploadAnomalyActionToS3;
exports.uploadAlertActionToS3 = uploadAlertActionToS3;
exports.updateAnomalyReviewFileInPlace = updateAnomalyReviewFileInPlace;
exports.overwriteAnomalyReviewFile = overwriteAnomalyReviewFile;
exports.overwriteOperationRecommendationFile = overwriteOperationRecommendationFile;
exports.overwriteAnomalySuggestionFile = overwriteAnomalySuggestionFile;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("../../../config/config");
const logger_1 = require("../../../utils/logger");
// @ts-ignore
const parquet = __importStar(require("parquetjs-lite"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const s3Client = new client_s3_1.S3Client({
    region: config_1.env.AWS_REGION,
    credentials: {
        accessKeyId: config_1.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: config_1.env.AWS_SECRET_ACCESS_KEY,
    },
});
const operationSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    title: { type: 'UTF8' },
    audience: { type: 'UTF8', optional: true },
    location: { type: 'UTF8', optional: true },
    scheduled_date: { type: 'UTF8', optional: true },
    description: { type: 'UTF8', optional: true },
    communication_methods: { type: 'UTF8', optional: true },
    organization_id: { type: 'UTF8' },
    created_at: { type: 'UTF8' },
    operation_recommendations_id: { type: 'UTF8', optional: true },
});
const anomalySchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    title: { type: 'UTF8' },
    audience: { type: 'UTF8', optional: true },
    location: { type: 'UTF8', optional: true },
    scheduled_date: { type: 'UTF8', optional: true },
    description: { type: 'UTF8', optional: true },
    communication_methods: { type: 'UTF8', optional: true },
    organization_id: { type: 'UTF8' },
    created_at: { type: 'UTF8' },
    anomaly_reviews_id: { type: 'UTF8', optional: true },
});
const anomalyReviewDataSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    well_id: { type: 'UTF8' },
    event_date: { type: 'UTF8' },
    detected_at: { type: 'UTF8', optional: true },
    anomaly_code: { type: 'UTF8' },
    category: { type: 'UTF8', optional: true },
    severity: { type: 'UTF8', optional: true },
    title: { type: 'UTF8', optional: true },
    ui_text: { type: 'UTF8', optional: true },
    impact_value: { type: 'DOUBLE', optional: true },
    chart_data: { type: 'UTF8', optional: true },
    status: { type: 'UTF8', optional: true },
    reason: { type: 'UTF8', optional: true },
    impact_metrics: { type: 'UTF8', optional: true },
    updated_at: { type: 'UTF8', optional: true },
});
const operationRecommendationDataSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    well_id: { type: 'UTF8', optional: true },
    category: { type: 'UTF8', optional: true },
    action: { type: 'UTF8', optional: true },
    status: { type: 'UTF8', optional: true },
    priority: { type: 'UTF8', optional: true },
    confidence_percent: { type: 'UTF8', optional: true },
    production_increase_bbl_day: { type: 'UTF8', optional: true },
    production_increase_percent: { type: 'UTF8', optional: true },
    daily_expense_benefit_usd: { type: 'UTF8', optional: true },
    implementation_cost_usd: { type: 'UTF8', optional: true },
    net_daily_benefit_usd: { type: 'UTF8', optional: true },
    asset_value_increase_usd: { type: 'UTF8', optional: true },
    time_reduced_hours: { type: 'UTF8', optional: true },
    detailed_analysis: { type: 'UTF8', optional: true },
    current_performance: { type: 'UTF8', optional: true },
    optimal_performance: { type: 'UTF8', optional: true },
    conservative_approach: { type: 'UTF8', optional: true },
    aggressive_optimization: { type: 'UTF8', optional: true },
    hybrid_model: { type: 'UTF8', optional: true },
    recommended_model: { type: 'UTF8', optional: true },
    citations: { type: 'UTF8', optional: true },
    referenced_data: { type: 'UTF8', optional: true },
    supporting_analysis: { type: 'UTF8', optional: true },
    data_quality: { type: 'UTF8', optional: true },
    reason: { type: 'UTF8', optional: true },
    expected_impact: { type: 'UTF8', optional: true },
    metrics_json: { type: 'UTF8', optional: true },
    created_at: { type: 'UTF8', optional: true },
    updated_at: { type: 'UTF8', optional: true },
    status_reason: { type: 'UTF8', optional: true },
    organization_id: { type: 'UTF8', optional: true },
});
const anomalySuggestionDataSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    well_id: { type: 'UTF8', optional: true },
    timestamp: { type: 'UTF8', optional: true },
    alert_title: { type: 'UTF8', optional: true },
    severity: { type: 'UTF8', optional: true },
    status: { type: 'UTF8', optional: true },
    confidence: { type: 'UTF8', optional: true },
    description: { type: 'UTF8', optional: true },
    suggested_actions: { type: 'UTF8', optional: true },
    explanation: { type: 'UTF8', optional: true },
    created_at: { type: 'UTF8', optional: true },
    historical_context: { type: 'UTF8', optional: true },
    risk_analysis: { type: 'UTF8', optional: true },
    asset_id: { type: 'UTF8', optional: true },
    reason: { type: 'UTF8', optional: true },
    raw_anomaly_data: { type: 'UTF8', optional: true },
    lift_type: { type: 'UTF8', optional: true },
    category: { type: 'UTF8', optional: true },
    well_status: { type: 'UTF8', optional: true },
    organization_id: { type: 'UTF8', optional: true },
});
const alertActionSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    title: { type: 'UTF8' },
    audience: { type: 'UTF8', optional: true },
    location: { type: 'UTF8', optional: true },
    scheduled_date: { type: 'UTF8', optional: true },
    description: { type: 'UTF8', optional: true },
    communication_methods: { type: 'UTF8', optional: true },
    organization_id: { type: 'UTF8' },
    created_at: { type: 'UTF8' },
    anomaly_suggestions_id: { type: 'UTF8', optional: true },
});
async function uploadActionToS3(actionData, orgId) {
    const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const now = new Date();
    const timestamp = formatDate(now);
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `action_${actionData.id}_${timestamp}.parquet`);
    try {
        const writer = await parquet.ParquetWriter.openFile(operationSchema, tempFilePath);
        await writer.appendRow({
            id: actionData.id,
            title: actionData.title,
            audience: actionData.audience ? JSON.stringify(actionData.audience) : null,
            location: actionData.location || null,
            scheduled_date: actionData.scheduled_date ? formatDate(actionData.scheduled_date) : null,
            description: actionData.description || null,
            communication_methods: actionData.communication_methods ? JSON.stringify(actionData.communication_methods) : null,
            organization_id: orgId,
            created_at: actionData.created_at ? formatDate(actionData.created_at) : timestamp,
            operation_recommendations_id: actionData.operation_recommendations_id || null,
        });
        await writer.close();
        const fileContent = fs.readFileSync(tempFilePath);
        const s3Key = `${orgId}/take_actions/operations/${timestamp}/operations_recommendations.parquet`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: config_1.env.AWS_ML_MODELS_BUCKET_NAME,
            Key: s3Key,
            Body: fileContent,
        }));
        logger_1.logger.info(`✅ Successfully uploaded action parquet to S3: ${s3Key}`);
    }
    catch (error) {
        logger_1.logger.error('Error uploading action to S3:', error);
        throw error;
    }
    finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}
async function uploadAnomalyActionToS3(actionData, orgId) {
    const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const now = new Date();
    const timestamp = formatDate(now);
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `anomaly_action_${actionData.id}_${timestamp}.parquet`);
    try {
        const writer = await parquet.ParquetWriter.openFile(anomalySchema, tempFilePath);
        await writer.appendRow({
            id: actionData.id,
            title: actionData.title,
            audience: actionData.audience ? JSON.stringify(actionData.audience) : null,
            location: actionData.location || null,
            scheduled_date: actionData.scheduled_date ? formatDate(actionData.scheduled_date) : null,
            description: actionData.description || null,
            communication_methods: actionData.communication_methods ? JSON.stringify(actionData.communication_methods) : null,
            organization_id: orgId,
            created_at: actionData.created_at ? formatDate(actionData.created_at) : timestamp,
            anomaly_reviews_id: actionData.anomaly_reviews_id || null,
        });
        await writer.close();
        const fileContent = fs.readFileSync(tempFilePath);
        const s3Key = `${orgId}/take_actions/anomaly_reviews/${timestamp}/anomaly_review_actions.parquet`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: config_1.env.AWS_ML_MODELS_BUCKET_NAME,
            Key: s3Key,
            Body: fileContent,
        }));
        logger_1.logger.info(`✅ Successfully uploaded anomaly action parquet to S3: ${s3Key}`);
    }
    catch (error) {
        logger_1.logger.error('Error uploading anomaly action to S3:', error);
        throw error;
    }
    finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}
async function uploadAlertActionToS3(actionData, orgId) {
    const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const now = new Date();
    const timestamp = formatDate(now);
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `alert_action_${actionData.id}_${timestamp}.parquet`);
    try {
        const writer = await parquet.ParquetWriter.openFile(alertActionSchema, tempFilePath);
        await writer.appendRow({
            id: actionData.id,
            title: actionData.title,
            audience: actionData.audience ? JSON.stringify(actionData.audience) : null,
            location: actionData.location || null,
            scheduled_date: actionData.scheduled_date ? formatDate(actionData.scheduled_date) : null,
            description: actionData.description || null,
            communication_methods: actionData.communication_methods ? JSON.stringify(actionData.communication_methods) : null,
            organization_id: orgId,
            created_at: actionData.created_at ? formatDate(actionData.created_at) : timestamp,
            anomaly_suggestions_id: actionData.anomaly_suggestions_id || null,
        });
        await writer.close();
        const fileContent = fs.readFileSync(tempFilePath);
        const s3Key = `${orgId}/take_actions/anomaly_detection/${timestamp}/alert_actions.parquet`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: config_1.env.AWS_ML_MODELS_BUCKET_NAME,
            Key: s3Key,
            Body: fileContent,
        }));
        logger_1.logger.info(`✅ Successfully uploaded alert action parquet to S3: ${s3Key}`);
    }
    catch (error) {
        logger_1.logger.error('Error uploading alert action to S3:', error);
        throw error;
    }
    finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}
async function updateAnomalyReviewFileInPlace(reviewId, updates, s3Path) {
    const tempDir = os.tmpdir();
    const downloadPath = path.join(tempDir, `download_${Date.now()}.parquet`);
    try {
        if (!s3Path)
            throw new Error('s3Path is empty');
        logger_1.logger.info(`[UpdateInPlace] Starting update for ID: ${reviewId}`);
        let bucket;
        let key;
        if (s3Path.startsWith('s3://')) {
            const pathWithoutProtocol = s3Path.substring(5);
            const firstSlashIndex = pathWithoutProtocol.indexOf('/');
            bucket = firstSlashIndex === -1 ? pathWithoutProtocol : pathWithoutProtocol.substring(0, firstSlashIndex);
            key = firstSlashIndex === -1 ? '' : pathWithoutProtocol.substring(firstSlashIndex + 1);
        }
        else {
            const s3Uri = new URL(s3Path);
            bucket = s3Uri.hostname;
            key = s3Uri.pathname.startsWith('/') ? s3Uri.pathname.substring(1) : s3Uri.pathname;
        }
        logger_1.logger.info(`[UpdateInPlace] Target S3: Bucket=${bucket}, Key=${key}`);
        // 2. Download File
        logger_1.logger.debug(`[UpdateInPlace] Downloading file...`);
        const getCommand = new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await s3Client.send(getCommand);
        if (!response.Body)
            throw new Error('Empty response body from S3');
        const buffer = Buffer.from(await response.Body.transformToByteArray());
        fs.writeFileSync(downloadPath, buffer);
        logger_1.logger.debug(`[UpdateInPlace] File downloaded to ${downloadPath} (${buffer.length} bytes)`);
        // 3. Read Rows and Update
        logger_1.logger.debug(`[UpdateInPlace] Reading parquet file...`);
        const reader = await parquet.ParquetReader.openFile(downloadPath);
        const cursor = reader.getCursor();
        const rows = [];
        let record = null;
        let updateCount = 0;
        while (record = await cursor.next()) {
            if (record.id === reviewId) {
                logger_1.logger.info(`[UpdateInPlace] Found record ${reviewId}, applying updates.`);
                rows.push({
                    ...record,
                    status: updates.status || record.status,
                    reason: updates.reason || record.reason,
                    updated_at: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
                });
                updateCount++;
            }
            else {
                rows.push(record);
            }
        }
        await reader.close();
        logger_1.logger.debug(`[UpdateInPlace] Read ${rows.length} rows, updated ${updateCount}.`);
        if (updateCount === 0) {
            logger_1.logger.warn(`[UpdateInPlace] No record found in file with ID ${reviewId}. IDs present: ${rows.map(r => r.id).join(', ')}`);
        }
        // 4. Overwrite the file with updated rows
        await overwriteAnomalyReviewFile(s3Path, rows);
        logger_1.logger.info(`✅ [UpdateInPlace] Successfully updated s3://${bucket}/${key}`);
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        logger_1.logger.error(`[UpdateInPlace] CRITICAL FAILURE: ${errMsg}`, { stack });
        throw error;
    }
    finally {
        if (fs.existsSync(downloadPath))
            fs.unlinkSync(downloadPath);
    }
}
async function overwriteAnomalyReviewFile(s3Path, rows) {
    const tempDir = os.tmpdir();
    const uploadPath = path.join(tempDir, `upload_overwrite_${Date.now()}.parquet`);
    try {
        if (!s3Path)
            throw new Error('s3Path is empty');
        let bucket;
        let key;
        if (s3Path.startsWith('s3://')) {
            const pathWithoutProtocol = s3Path.substring(5);
            const firstSlashIndex = pathWithoutProtocol.indexOf('/');
            bucket = firstSlashIndex === -1 ? pathWithoutProtocol : pathWithoutProtocol.substring(0, firstSlashIndex);
            key = firstSlashIndex === -1 ? '' : pathWithoutProtocol.substring(firstSlashIndex + 1);
        }
        else {
            const s3Uri = new URL(s3Path);
            bucket = s3Uri.hostname;
            key = s3Uri.pathname.startsWith('/') ? s3Uri.pathname.substring(1) : s3Uri.pathname;
        }
        logger_1.logger.info(`[OverwriteS3] Target S3: Bucket=${bucket}, Key=${key}`);
        // Write to new Parquet
        logger_1.logger.debug(`[OverwriteS3] Writing ${rows.length} rows to updated parquet...`);
        const writer = await parquet.ParquetWriter.openFile(anomalyReviewDataSchema, uploadPath);
        for (const [index, row] of rows.entries()) {
            try {
                await writer.appendRow({
                    id: row.id?.toString() || '',
                    well_id: row.well_id?.toString() || '',
                    event_date: row.event_date?.toString() || '',
                    detected_at: row.detected_at?.toString() || null,
                    anomaly_code: row.anomaly_code?.toString() || '',
                    category: row.category?.toString() || null,
                    severity: row.severity?.toString() || null,
                    title: row.title?.toString() || null,
                    ui_text: row.ui_text ? (typeof row.ui_text === 'string' ? row.ui_text : JSON.stringify(row.ui_text)) : null,
                    impact_value: (row.impact_value !== null && row.impact_value !== undefined && row.impact_value !== '') ? parseFloat(row.impact_value.toString()) : null,
                    chart_data: row.chart_data ? (typeof row.chart_data === 'string' ? row.chart_data : JSON.stringify(row.chart_data)) : null,
                    status: row.status?.toString() || null,
                    reason: row.reason?.toString() || null,
                    impact_metrics: row.impact_metrics ? (typeof row.impact_metrics === 'string' ? row.impact_metrics : JSON.stringify(row.impact_metrics)) : null,
                    updated_at: row.updated_at?.toString() || null
                });
            }
            catch (rowError) {
                logger_1.logger.error(`[OverwriteS3] Error appending row ${index} (ID: ${row.id}): ${rowError.message}`);
                throw rowError;
            }
        }
        await writer.close();
        logger_1.logger.debug(`[OverwriteS3] Parquet writer closed.`);
        // Upload back to the SAME Key
        logger_1.logger.info(`[OverwriteS3] Uploading updated file back to S3...`);
        const fileContent = fs.readFileSync(uploadPath);
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileContent,
        }));
        logger_1.logger.info(`✅ [OverwriteS3] Successfully overwriting s3://${bucket}/${key} with ${rows.length} rows`);
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        logger_1.logger.error(`[OverwriteS3] CRITICAL FAILURE: ${errMsg}`, { stack });
        throw error;
    }
    finally {
        if (fs.existsSync(uploadPath))
            fs.unlinkSync(uploadPath);
    }
}
async function overwriteOperationRecommendationFile(s3Path, rows) {
    const tempDir = os.tmpdir();
    const uploadPath = path.join(tempDir, `upload_ops_overwrite_${Date.now()}.parquet`);
    try {
        if (!s3Path)
            throw new Error('s3Path is empty');
        let bucket;
        let key;
        if (s3Path.startsWith('s3://')) {
            const pathWithoutProtocol = s3Path.substring(5);
            const firstSlashIndex = pathWithoutProtocol.indexOf('/');
            bucket = firstSlashIndex === -1 ? pathWithoutProtocol : pathWithoutProtocol.substring(0, firstSlashIndex);
            key = firstSlashIndex === -1 ? '' : pathWithoutProtocol.substring(firstSlashIndex + 1);
        }
        else {
            const s3Uri = new URL(s3Path);
            bucket = s3Uri.hostname;
            key = s3Uri.pathname.startsWith('/') ? s3Uri.pathname.substring(1) : s3Uri.pathname;
        }
        logger_1.logger.info(`[OverwriteS3] Target S3 (Ops): Bucket=${bucket}, Key=${key}`);
        // Write to new Parquet
        logger_1.logger.debug(`[OverwriteS3] Writing ${rows.length} rows to updated parquet...`);
        const writer = await parquet.ParquetWriter.openFile(operationRecommendationDataSchema, uploadPath);
        for (const [index, row] of rows.entries()) {
            try {
                await writer.appendRow({
                    id: row.id?.toString() || '',
                    well_id: row.well_id?.toString() || null,
                    category: row.category?.toString() || null,
                    action: row.action?.toString() || null,
                    status: row.status?.toString() || null,
                    priority: row.priority?.toString() || null,
                    confidence_percent: row.confidence_percent?.toString() || null,
                    production_increase_bbl_day: row.production_increase_bbl_day?.toString() || null,
                    production_increase_percent: row.production_increase_percent?.toString() || null,
                    daily_expense_benefit_usd: row.daily_expense_benefit_usd?.toString() || null,
                    implementation_cost_usd: row.implementation_cost_usd?.toString() || null,
                    net_daily_benefit_usd: row.net_daily_benefit_usd?.toString() || null,
                    asset_value_increase_usd: row.asset_value_increase_usd?.toString() || null,
                    time_reduced_hours: row.time_reduced_hours?.toString() || null,
                    detailed_analysis: row.detailed_analysis?.toString() || null,
                    current_performance: row.current_performance?.toString() || null,
                    optimal_performance: row.optimal_performance?.toString() || null,
                    conservative_approach: row.conservative_approach?.toString() || null,
                    aggressive_optimization: row.aggressive_optimization?.toString() || null,
                    hybrid_model: row.hybrid_model?.toString() || null,
                    recommended_model: row.recommended_model?.toString() || null,
                    citations: row.citations?.toString() || null,
                    referenced_data: row.referenced_data?.toString() || null,
                    supporting_analysis: row.supporting_analysis?.toString() || null,
                    data_quality: row.data_quality?.toString() || null,
                    reason: row.reason?.toString() || null,
                    expected_impact: row.expected_impact?.toString() || null,
                    metrics_json: row.metrics_json?.toString() || null,
                    created_at: row.created_at?.toString() || null,
                    updated_at: row.updated_at?.toString() || null,
                    status_reason: row.status_reason?.toString() || null,
                    organization_id: row.organization_id?.toString() || null,
                });
            }
            catch (rowError) {
                logger_1.logger.error(`[OverwriteS3] Error appending row ${index} (ID: ${row.id}): ${rowError.message}`);
                throw rowError;
            }
        }
        await writer.close();
        logger_1.logger.debug(`[OverwriteS3] Parquet writer closed.`);
        // Upload back to the SAME Key
        logger_1.logger.info(`[OverwriteS3] Uploading updated Ops file back to S3...`);
        const fileContent = fs.readFileSync(uploadPath);
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileContent,
        }));
        logger_1.logger.info(`✅ [OverwriteS3] Successfully overwriting s3://${bucket}/${key} with ${rows.length} rows`);
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        logger_1.logger.error(`[OverwriteS3] CRITICAL FAILURE: ${errMsg}`, { stack });
        throw error;
    }
    finally {
        if (fs.existsSync(uploadPath))
            fs.unlinkSync(uploadPath);
    }
}
async function overwriteAnomalySuggestionFile(s3Path, rows) {
    const tempDir = os.tmpdir();
    const uploadPath = path.join(tempDir, `upload_anomaly_overwrite_${Date.now()}.parquet`);
    try {
        if (!s3Path)
            throw new Error('s3Path is empty');
        let bucket;
        let key;
        if (s3Path.startsWith('s3://')) {
            const pathWithoutProtocol = s3Path.substring(5);
            const firstSlashIndex = pathWithoutProtocol.indexOf('/');
            bucket = firstSlashIndex === -1 ? pathWithoutProtocol : pathWithoutProtocol.substring(0, firstSlashIndex);
            key = firstSlashIndex === -1 ? '' : pathWithoutProtocol.substring(firstSlashIndex + 1);
        }
        else {
            const s3Uri = new URL(s3Path);
            bucket = s3Uri.hostname;
            key = s3Uri.pathname.startsWith('/') ? s3Uri.pathname.substring(1) : s3Uri.pathname;
        }
        logger_1.logger.info(`[OverwriteS3] Target S3 (Anomaly): Bucket=${bucket}, Key=${key}`);
        // Write to new Parquet
        logger_1.logger.debug(`[OverwriteS3] Writing ${rows.length} rows to updated parquet...`);
        const writer = await parquet.ParquetWriter.openFile(anomalySuggestionDataSchema, uploadPath);
        for (const [index, row] of rows.entries()) {
            try {
                await writer.appendRow({
                    id: row.id?.toString() || '',
                    well_id: row.well_id?.toString() || null,
                    timestamp: row.timestamp?.toString() || null,
                    alert_title: row.alert_title?.toString() || null,
                    severity: row.severity?.toString() || null,
                    status: row.status?.toString() || null,
                    confidence: row.confidence?.toString() || null,
                    description: row.description?.toString() || null,
                    suggested_actions: row.suggested_actions ? (typeof row.suggested_actions === 'string' ? row.suggested_actions : JSON.stringify(row.suggested_actions)) : null,
                    explanation: row.explanation?.toString() || null,
                    created_at: row.created_at?.toString() || null,
                    historical_context: row.historical_context ? (typeof row.historical_context === 'string' ? row.historical_context : JSON.stringify(row.historical_context)) : null,
                    risk_analysis: row.risk_analysis ? (typeof row.risk_analysis === 'string' ? row.risk_analysis : JSON.stringify(row.risk_analysis)) : null,
                    asset_id: row.asset_id?.toString() || null,
                    reason: row.reason?.toString() || null,
                    raw_anomaly_data: row.raw_anomaly_data ? (typeof row.raw_anomaly_data === 'string' ? row.raw_anomaly_data : JSON.stringify(row.raw_anomaly_data)) : null,
                    lift_type: row.lift_type?.toString() || null,
                    category: row.category?.toString() || null,
                    well_status: row.well_status?.toString() || null,
                    organization_id: row.organization_id?.toString() || null,
                });
            }
            catch (rowError) {
                logger_1.logger.error(`[OverwriteS3] Error appending row ${index} (ID: ${row.id}): ${rowError.message}`);
                throw rowError;
            }
        }
        await writer.close();
        logger_1.logger.debug(`[OverwriteS3] Parquet writer closed.`);
        // Upload back to the SAME Key
        logger_1.logger.info(`[OverwriteS3] Uploading updated Anomaly file back to S3...`);
        const fileContent = fs.readFileSync(uploadPath);
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileContent,
        }));
        logger_1.logger.info(`✅ [OverwriteS3] Successfully overwriting s3://${bucket}/${key} with ${rows.length} rows`);
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        logger_1.logger.error(`[OverwriteS3] CRITICAL FAILURE: ${errMsg}`, { stack });
        throw error;
    }
    finally {
        if (fs.existsSync(uploadPath))
            fs.unlinkSync(uploadPath);
    }
}
