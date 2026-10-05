import { executeAthenaQuery } from './src/modules/industrial-data/utils/athena-query';

async function test() {
    try {
        const sql = 'SELECT id, "$path" as s3_path FROM anomaly_reviews LIMIT 1';
        const results = await executeAthenaQuery<any>(sql);
        console.log('Sample row:', results[0]);
        if (results.length > 0) {
            const sql2 = `SELECT * FROM anomaly_reviews WHERE "$path" = '${results[0].s3_path}'`;
            const results2 = await executeAthenaQuery<any>(sql2);
            console.log('Number of rows in that file:', results2.length);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
test();
