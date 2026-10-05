const { S3Client, SelectObjectContentCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
require("dotenv").config();

async function run() {
  const client = new S3Client({ region: process.env.AWS_REGION });
  
  try {
     const listCmd = new ListObjectsV2Command({ Bucket: "agentic-energy-ml-models-200937443240", Prefix: "147a92b9-f90a-473d-b443-e6e668c4fbb7/detections/operations/" });
     const listRes = await client.send(listCmd);
     const key = listRes.Contents.find(c => c.Key.endsWith('.parquet')).Key;

    console.log("Found key", key)
    const cmd = new SelectObjectContentCommand({
      Bucket: "agentic-energy-ml-models-200937443240",
      Key: key,
      ExpressionType: "SQL",
      Expression: "SELECT * FROM s3object s",
      InputSerialization: { Parquet: {} },
      OutputSerialization: { JSON: { RecordDelimiter: "\n" } }
    });
    
    await client.send(cmd);
    console.log("Success with .parquet!");
  } catch (err) {
      console.error(err);
  }
}
run();
