
import { executeAthenaQuery, ensureAthenaSchema, registerPartition, ANOMALY_SUGGESTIONS_TABLE } from './src/modules/industrial-data/utils/athena-query';
import { env } from './src/config/config';

async function finalDebug() {
    const orgId = '147a92b9-f90a-473d-b443-e6e668c4fbb7';

    console.log('FORCE Ensuring schema...');
    await ensureAthenaSchema(true);

    console.log('Registering partition...');
    await registerPartition(
        ANOMALY_SUGGESTIONS_TABLE,
        orgId,
        `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/anomaly_detection/`
    );

    try {
        console.log('Testing SELECT * ...');
        const sqlAll = `SELECT * FROM ${ANOMALY_SUGGESTIONS_TABLE} WHERE organization_id = '${orgId}' LIMIT 1`;
        const results = await executeAthenaQuery(sqlAll);
        console.log('✅ SELECT * is OK. Result:', JSON.stringify(results[0], null, 2));
    } catch (e: any) {
        console.error('❌ SELECT * FAILED:', e.message || e);
    }
}

finalDebug();
