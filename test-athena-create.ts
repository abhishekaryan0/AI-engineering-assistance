import { env } from './src/config/config';
import { StartQueryExecutionCommand, AthenaClient, GetQueryExecutionCommand } from '@aws-sdk/client-athena';

const client = new AthenaClient({ region: env.AWS_REGION });

async function run() {
    const bucket = 'agentic-energy-ml-models-200937443240';
    const db = env.ATHENA_DATABASE;

    const sqls = [
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`OPERATION_RECOMMENDATIONS\` (
            id string, well_id string, action string, priority string, status string,
            confidence_percent double, expected_impact string, production_increase_bbl_day double,
            net_daily_benefit_usd double, implementation_cost_usd double, asset_value_increase_usd double,
            time_reduced_hours double, detailed_analysis string, current_performance string,
            optimal_performance string, recommended_model string, conservative_approach string,
            aggressive_optimization string, hybrid_model string, created_at timestamp,
            status_reason string, daily_expense_benefit_usd double
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,
        
        `ALTER TABLE \`${db}\`.\`OPERATION_RECOMMENDATIONS\` ADD IF NOT EXISTS PARTITION (organization_id='147a92b9-f90a-473d-b443-e6e668c4fbb7') LOCATION 's3://${bucket}/147a92b9-f90a-473d-b443-e6e668c4fbb7/detections/operations/'`,
        
        `SELECT * FROM \`${db}\`.\`OPERATION_RECOMMENDATIONS\` WHERE organization_id='147a92b9-f90a-473d-b443-e6e668c4fbb7' LIMIT 5`
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
