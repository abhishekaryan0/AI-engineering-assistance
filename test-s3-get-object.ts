import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
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
    
    console.log('Querying key via GetObject:', key);
    
    const getCmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3.send(getCmd);
    console.log("Success GetObject!");
  } catch (err) {
    console.error('Error:', err);
  }
}
run().catch(console.error);
