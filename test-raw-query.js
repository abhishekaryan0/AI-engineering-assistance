const { S3Client, SelectObjectContentCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

async function run() {
  const client = new S3Client({ region: process.env.AWS_REGION });
  
  try {
    const cmd = new SelectObjectContentCommand({
      Bucket: "agentic-energy-ml-models-200937443240",
      Key: "147a92b9-f90a-473d-b443-e6e668c4fbb7/detections/operations/operations.parquet",
      ExpressionType: "SQL",
      Expression: "SELECT * FROM S3Object",
      InputSerialization: { Parquet: {} },
      OutputSerialization: { JSON: { RecordDelimiter: "\n" } }
    });
    
    await client.send(cmd);
    console.log("Success with .parquet!");
  } catch (err) {
    if (err.message && err.message.includes("not allowed against this resource")) {
      console.log("Caught the known SelectObjectContent error.");
    } else {
      console.error(err);
    }
  }
}
run();
