import { S3Client, ListObjectsV2Command, SelectObjectContentCommand, PutObjectCommand } from '@aws-sdk/client-s3';
// @ts-ignore
import * as parquet from 'parquetjs-lite';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { env } from './src/config/config';
import { logger } from './src/utils/logger';

const client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET = env.AWS_ML_MODELS_BUCKET_NAME;

const COLS_TO_STRINGIFY = [
    'raw_anomaly_data',
    'historical_context',
    'risk_analysis',
    'suggested_actions',
    'ui_text',
    'chart_data',
    'impact_metrics'
];

async function repairFile(key: string) {
    logger.info(`Scanning s3://${BUCKET}/${key} for schema mismatches...`);
    const tempOut = path.join(os.tmpdir(), `repaired_${path.basename(key)}_${Date.now()}.parquet`);

    try {
        // 1. Use S3 Select to read the Parquet file. 
        // S3 Select is incredibly robust: it can read Parquet files even if they have 
        // complex types or encodings that locally available Node libraries might struggle with.
        const query = "SELECT * FROM s3object";
        const selectResp = await client.send(new SelectObjectContentCommand({
            Bucket: BUCKET,
            Key: key,
            Expression: query,
            ExpressionType: 'SQL',
            InputSerialization: { Parquet: {} },
            OutputSerialization: { JSON: { RecordDelimiter: '\n' } }
        }));

        const rows: any[] = [];
        if (selectResp.Payload) {
            for await (const event of selectResp.Payload) {
                if (event.Records?.Payload) {
                    const chunk = Buffer.from(event.Records.Payload).toString('utf8');
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            rows.push(JSON.parse(line));
                        }
                    }
                }
            }
        }

        if (rows.length === 0) return;

        // 2. Determine if repair is needed
        let needsRepair = false;
        const firstRow = rows[0];
        for (const col of COLS_TO_STRINGIFY) {
            if (firstRow[col] !== undefined && firstRow[col] !== null && typeof firstRow[col] !== 'string') {
                needsRepair = true;
                logger.info(` - Detected complex type in column ${col}. Stringifying for Athena compatibility...`);
                break;
            }
        }

        if (needsRepair) {
            // 3. Dynamic schema creation based on ALL available columns in the row
            const schemaDef: any = {};
            const allCols = Object.keys(firstRow);
            for (const col of allCols) {
                // All columns for Athena should ideally be strings in these tables to avoid future mismatches
                schemaDef[col] = { type: 'UTF8', optional: true };
            }
            const schema = new parquet.ParquetSchema(schemaDef);

            const writer = await parquet.ParquetWriter.openFile(schema, tempOut);
            for (const row of rows) {
                const cleanRow: any = {};
                for (const col of allCols) {
                    const val = row[col];
                    if (val === undefined || val === null) {
                        cleanRow[col] = null;
                    } else if (typeof val === 'object') {
                        cleanRow[col] = JSON.stringify(val);
                    } else {
                        cleanRow[col] = String(val);
                    }
                }
                await writer.appendRow(cleanRow);
            }
            await writer.close();

            // 4. Upload back to S3
            await client.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: fs.readFileSync(tempOut)
            }));
            logger.info(` - ✅ Repaired and uploaded s3://${BUCKET}/${key}`);
        } else {
            logger.info(` - Already compatible.`);
        }
    } catch (err: any) {
        logger.error(` - ❌ Error repairing ${key}: ${err.message || err}`);
    } finally {
        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
    }
}

async function run(specificPrefix?: string) {
    if (specificPrefix) {
        // Targeted repair for a specific organization or path
        const prefix = specificPrefix.endsWith('/') ? specificPrefix : specificPrefix + '/';
        logger.info(`Listing files for targeted prefix: s3://${BUCKET}/${prefix}`);

        const response = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
        for (const file of response.Contents || []) {
            if (file.Key?.endsWith('.parquet') && !file.Key.includes('/history/')) {
                await repairFile(file.Key);
            }
        }
    } else {
        // Full scan logic
        logger.info(`Listing organizations in s3://${BUCKET}...`);
        const response = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Delimiter: '/' }));
        const prefixes = response.CommonPrefixes?.map(p => p.Prefix) || [];

        const PATH_PATTERNS = ["detections/anomaly_detection/", "sensor_data/", "take_actions/anomaly_detection/"];

        for (const orgPrefix of prefixes) {
            for (const pattern of PATH_PATTERNS) {
                const subPrefix = `${orgPrefix}${pattern}`;
                const subResp = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: subPrefix }));
                for (const file of subResp.Contents || []) {
                    if (file.Key?.endsWith('.parquet') && !file.Key.includes('/history/')) {
                        await repairFile(file.Key);
                    }
                }
            }
        }
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    run(args[0]).catch(console.error);
}
