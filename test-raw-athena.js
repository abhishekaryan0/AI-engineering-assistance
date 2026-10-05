const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');
require('dotenv').config();

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const client = new AthenaClient({ region: process.env.AWS_REGION });
    const db = process.env.ATHENA_DATABASE;
    const s3Path = process.env.ATHENA_OUTPUT_S3;

    console.log("Using DB:", db);

    const bucket = 'agentic-energy-ml-models-200937443240';
    const orgId = '147a92b9-f90a-473d-b443-e6e668c4fbb7';

    // Instead of dropping everything, since the existing user schema may be failing, I just query:
    const res = await executeQuery(client, `SELECT * FROM \`agentic_energy_ea_db\`.\`well_sensor_readings\` LIMIT 5`, db, s3Path);
    if (res && res.ResultSet && res.ResultSet.Rows) {
         console.log(JSON.stringify(res.ResultSet.Rows[0], null, 2));
         console.log(JSON.stringify(res.ResultSet.Rows[1], null, 2));
    }
}

async function executeQuery(client, sql, db, s3Path) {
    console.log("Exec SQL: ", sql.substring(0, 100));
    try {
        const start = await client.send(new StartQueryExecutionCommand({
            QueryString: sql,
            QueryExecutionContext: { Database: db },
            ResultConfiguration: { OutputLocation: s3Path }
        }));
        const QueryExecutionId = start.QueryExecutionId;
        
        let status = 'QUEUED';
        while (status === 'QUEUED' || status === 'RUNNING') {
            const check = await client.send(new GetQueryExecutionCommand({ QueryExecutionId }));
            status = check.QueryExecution.Status.State;
            if (status === 'FAILED') {
                console.error("FAILED SQL:", sql, "---", check.QueryExecution.Status.StateChangeReason);
            }
            await delay(1000);
        }
        
        if (status === 'SUCCEEDED') {
            const { GetQueryResultsCommand } = require('@aws-sdk/client-athena');
            const results = await client.send(new GetQueryResultsCommand({ QueryExecutionId: QueryExecutionId }));
            return results;
        }
    } catch (err) {
        console.error("Crash executing", sql, err.message);
    }
}

run().catch(console.error);
