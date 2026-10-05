import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./src/config/config";
import * as parquet from 'parquetjs-lite';
import fs from 'fs';

async function run() {
  const client = new S3Client({ region: env.AWS_REGION });
  
  try {
     const listCmd = new ListObjectsV2Command({ Bucket: 'agentic-energy-ml-models-200937443240', Prefix: "147a92b9-f90a-473d-b443-e6e668c4fbb7/detections/operations/" });
     const listRes = await client.send(listCmd);
     const key = listRes.Contents?.find(c => c.Key?.endsWith('.parquet'))?.Key;

    if (!key) return console.log("No key found");
    const cmd = new GetObjectCommand({
      Bucket: 'agentic-energy-ml-models-200937443240',
      Key: key
    });
    
    console.log("Downloading", key);
    const res = await client.send(cmd);
    
    // Convert Readable to buffer using stream consumers or alternative
    const chunks = [];
    for await (const chunk of res.Body as any) {
       chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync('/tmp/test.parquet', buffer);
    
    try {
        let reader = await parquet.ParquetReader.openFile('/tmp/test.parquet');
        let cursor = reader.getCursor();
        let record = null;
        let count = 0;
        let result = [];
        while (record = await cursor.next()) {
             result.push(record);
             count++;
        }
        await reader.close();
        console.log("Success with .parquet length = !", count);
        console.log("first record", JSON.stringify(result[0]));

    } catch(e) {
        console.error("parquet js fail", e);
    }
    
  } catch (err) {
      console.error(err);
  }
}
run();
