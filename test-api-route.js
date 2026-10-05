console.log('Testing the GET endpoint internally...');
const fetch = require('node-fetch');

async function testApi() {
  try {
    const res = await fetch("http://localhost:3000/api/operational-recommendations", {
      headers: {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSIsIm9yZ19pZCI6IjE0N2E5MmI5LWY5MGEtNDczZC1iNDQzLWU2ZTY2OGM0ZmJiNyIsIm9yZ19uYW1lIjoiVGVzdCBPcmciLCJpYXQiOjE3NzMyMzM1MjV9._kfHSVv0dcwKCD4TqO5rngN7QlQ_H2FBdds9zWq1kZs"
      }
    });

    const body = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", body);
  } catch (err) {
    console.error("Fetch error:", err);
  }
}
testApi();
