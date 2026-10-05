import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),

  JWT_SECRET: z.string().min(1),

  DATABASE_URL: z.string().min(1),

  SNOWFLAKE_ACCOUNT: z.string().min(1),
  SNOWFLAKE_USER: z.string().min(1),
  SNOWFLAKE_PASSWORD: z.string().min(1),
  SNOWFLAKE_WAREHOUSE: z.string().min(1),
  SNOWFLAKE_DATABASE: z.string().min(1),
  SNOWFLAKE_SCHEMA: z.string().min(1),
  SNOWFLAKE_ROLE: z.string().min(1),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_BASE: z.string(),
  AI_MODEL_NAME: z.string(),
  AI_MODEL_DECISION: z.string(),
  AI_MODEL_VISION: z.string(),
  AI_MODEL_EMBEDDING: z.string(),
  AI_MODEL_REASONING: z.string().optional(),
  AI_MODEL_SEARCH: z.string().optional(),
  AI_MODEL_HYBRID: z.string().optional(),
  AT_RISK_AI_MODEL_SEARCH: z.string().optional(),

  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_BUCKET_NAME: z.string().min(1),
  AWS_ML_MODELS_BUCKET_NAME: z.string().min(1),

  ATHENA_DATABASE: z.string().default('agentic_energy_ea_db'),
  ATHENA_DB_WEB: z.string().default('agentic_energy_web_db'),
  ATHENA_OUTPUT_S3: z.string().min(1),
  ATHENA_WORKGROUP: z.string().default('primary'),
});

export const env = envSchema.parse(process.env);
