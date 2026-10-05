import { executeAthenaQuery } from './src/modules/industrial-data/utils/athena-query';

async function test() {
    try {
        const sql = 'SELECT * FROM operation_recommendations limit 1';
        const results = await executeAthenaQuery<any>(sql);
        console.log("KEYS:", Object.keys(results[0]));
    } catch (e) {
        console.error('Error:', e);
    }
}
test();
