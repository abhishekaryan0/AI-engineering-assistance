"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const snowflake_1 = require("./utils/snowflake");
async function fetchSchema() {
    try {
        console.log('Fetching Snowflake schema...');
        // Using a more generalized query and a short timeout mechanism inside TS for clarity
        const result = await (0, snowflake_1.executeQuery)('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES LIMIT 10;');
        console.log('Result length:', result ? result.length : null);
        console.log('Results:', result);
    }
    catch (error) {
        console.error('Error in fetchSchema:', error);
    }
    finally {
        process.exit(0);
    }
}
fetchSchema();
