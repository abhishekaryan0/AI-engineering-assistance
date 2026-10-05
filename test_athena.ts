import { executeAthenaQuery } from './src/modules/industrial-data/utils/athena-query';
import { logger } from './src/utils/logger';

async function test() {
    try {
        const sql = 'SELECT id, "" as s3_path FROM anomaly_reviews LIMIT 5';
        const results = await executeAthenaQuery<any>(sql);
        console.log('Athena Results:', JSON.stringify(results, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}
test();
