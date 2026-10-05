import { env } from './src/config/config';
import { StartQueryExecutionCommand, AthenaClient, GetQueryExecutionCommand } from '@aws-sdk/client-athena';

const client = new AthenaClient({ region: env.AWS_REGION });

async function run() {
    const db = env.ATHENA_DATABASE;

    const sqls = [
        `DROP TABLE IF EXISTS "${db}"."OPERATION_RECOMMENDATIONS" `
    ];
    
    for (const sql of sqls) {
       console.log("Running", sql);
       const startCommand = new StartQueryExecutionCommand({
           QueryString: sql,
           QueryExecutionContext: { Database: db },
           ResultConfiguration: { OutputLocation: env.ATHENA_OUTPUT_S3 }
       });
       
       const { QueryExecutionId } = await client.send(startCommand);
       let status;
       while (true) {
          const res = await client.send(new GetQueryExecutionCommand({ QueryExecutionId }));
          status = res.QueryExecution?.Status?.State;
          if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED') {
              if (status === 'FAILED') console.error("Failed:", res.QueryExecution?.Status?.StateChangeReason);
              break;
          }
          await new Promise(r => setTimeout(r, 1000));
       }
       console.log("Status", status);
    }
}
run();
