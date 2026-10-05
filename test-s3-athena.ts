import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { env } from './src/config/config';
import { executeAthenaQuery } from './src/utils/athena-query';

async function run() {
  const orgId = '147a92b9-f90a-473d-b443-e6e668c4fbb7';
  console.log('Running query for', orgId);
  try {
     const results = await executeAthenaQuery(`SELECT * FROM "DAILY_PRODUCTION" LIMIT 10`);
     console.log(results);
  } catch (err) {
     console.error("error", err);
  }
}
run().catch(console.error);
