const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();
const stream = require('stream');

async function run() {
  const client = new S3Client({ region: process.env.AWS_REGION });
  
  try {
     const listCmd = new ListObjectsV2Command({ Bucket: "agentic-energy-ml-models-200937443240", Prefix: "147a92b9-f90a-473d-b443-e6e668c4fbb7/detections/operations/" });
     const listRes = await client.send(listCmd);
     const key = listRes.Contents.find(c => c.Key.endsWith('.parquet')).Key;

    console.log("Found key", key)
    const cmd = new GetObjectCommand({
      Bucket: "agentic-energy-ml-models-200937443240",
      Key: key
    });
    
    // S3 Select does not work on POST for snappy compressed parquet in some regions/buckets, or has a policy that prevents POST on objects
    // Let's test downloading it!
    const res = await client.send(cmd);
    console.log("Success with .parquet GetObject!");
  } catch (err) {
      console.error(err);
  }
}
run();
