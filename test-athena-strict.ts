import { executeAthenaQuery } from './src/modules/industrial-data/utils/athena-query';

async function run() {
    const db = 'agentic_energy_web_db';
    const TABLE = 'test_strict_checking';
    const bucket = 'agentic-energy-ml-models-200937443240';
    const loc = 's3://agentic-energy-ml-models-200937443240/147a92b9-f90a-473d-b443-e6e668c4fbb7/detections/anomaly_detection/';

    try {
        console.log('Testing strict type checking property...');
        await executeAthenaQuery(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => { });

        const ddl = `
            CREATE EXTERNAL TABLE IF NOT EXISTS ${TABLE} (
                id string,
                raw_anomaly_data string
            ) 
            STORED AS PARQUET 
            LOCATION '${loc}'
            TBLPROPERTIES (
                "parquet.column.index.access"="true",
                "parquet.strict.type.checking"="false"
            )
        `;
        await executeAthenaQuery(ddl);
        console.log('Table created. Querying...');
        const res = await executeAthenaQuery(`SELECT * FROM ${TABLE} LIMIT 1`);
        console.log('Success!', res);
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}
run();
