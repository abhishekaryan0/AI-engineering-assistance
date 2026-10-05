import { S3Client, ListObjectsV2Command, SelectObjectContentCommand } from '@aws-sdk/client-s3';
import { env } from './src/config/config';

async function run() {
  const s3 = new S3Client({ region: env.AWS_REGION });

  const bucket = 'agentic-energy-ml-models-200937443240';
  const prefix = '147a92b9-f90a-473d-b443-e6e668c4fbb7/detections/operations/';
  
  try {
    const listCmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
    const listRes = await s3.send(listCmd);
    
    if (!listRes.Contents || listRes.Contents.length === 0) {
      console.log('No files found in', prefix);
      return;
    }
    
    const key = listRes.Contents.find(c => c.Key?.endsWith('.parquet'))?.Key;
    if (!key) {
      console.log('No parquet file found');
      return;
    }
    
    console.log('Querying key:', key);
    
    const selectCmd = new SelectObjectContentCommand({
      Bucket: bucket,
      Key: key,
      ExpressionType: 'SQL',
      Expression: 'SELECT * FROM s3object s',
      InputSerialization: {
        Parquet: {}
      },
      OutputSerialization: {
        JSON: {
          RecordDelimiter: '\n'
        }
      }
    });

    const response = await s3.send(selectCmd);
    console.log("Success");
  } catch (err) {
    console.error('Error:', err);
  }
}
run().catch(console.error);
