/**
 * @file jest.setup.ts
 * @description Jest setup file to provide required environment variables for testing
 */

// Set test environment variables BEFORE any modules are loaded
process.env.NODE_ENV = 'development';
process.env.PORT = '3000';
process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test-db';

// Snowflake configuration
process.env.SNOWFLAKE_ACCOUNT = 'test-account-12345';
process.env.SNOWFLAKE_USER = 'test-user';
process.env.SNOWFLAKE_PASSWORD = 'test-password-secure';
process.env.SNOWFLAKE_WAREHOUSE = 'COMPUTE_WH';
process.env.SNOWFLAKE_DATABASE = 'TEST_DB';
process.env.SNOWFLAKE_SCHEMA = 'PUBLIC';
process.env.SNOWFLAKE_ROLE = 'ACCOUNTADMIN';

// OpenAI/LLM configuration
process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-api-key-for-testing';
process.env.OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
process.env.AI_MODEL_NAME = 'openai/gpt-4';
process.env.AI_MODEL_DECISION = 'openai/gpt-4';
process.env.AI_MODEL_VISION = 'openai/gpt-4-vision';
process.env.AI_MODEL_EMBEDDING = 'openai/text-embedding-3-small';

// AWS configuration
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_BUCKET_NAME = 'test-bucket-ea-backend';

// Logging configuration
process.env.LOG_LEVEL = 'error';
