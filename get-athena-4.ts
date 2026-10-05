import { GetQueryResultsCommand, AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand } from '@aws-sdk/client-athena';
import { env } from './src/config/config';

const client = new AthenaClient({ region: env.AWS_REGION });

async function run() {
   const db = env.ATHENA_DATABASE;
   const start = new StartQueryExecutionCommand({
       QueryString: `SELECT * FROM \`agentic_energy_ea_db\`.\`OPERATION_RECOMMENDATIONS\` LIMIT 5;`,
       QueryExecutionContext: { Database: db },
       ResultConfiguration: { OutputLocation: env.ATHENA_OUTPUT_S3 }
   });
   const { QueryExecutionId } = await client.send(start);
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

   if (status === 'SUCCEEDED') {
       const results = await client.send(new GetQueryResultsCommand({ QueryExecutionId }));
       console.log("Cols:", results.ResultSet?.Rows?.[0]?.Data?.map(d => d.VarCharValue));
       console.log("Row 1:", results.ResultSet?.Rows?.[1]?.Data?.map(d => d.VarCharValue));
   }
}
run();
