import { executeAthenaQuery } from './src/modules/industrial-data/utils/athena-query';
async function test() {
    console.log("Starting...");
    const sql = 'SELECT * FROM operation_recommendations limit 1';
    const results = await executeAthenaQuery<any>(sql);
    console.log(Object.keys(results[0]));
    console.log(results[0]);
}
test().catch(e => console.error(e));
