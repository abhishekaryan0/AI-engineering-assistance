"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(3000),
    NODE_ENV: zod_1.z.enum(['development', 'production']).default('development'),
    JWT_SECRET: zod_1.z.string().min(1),
    DATABASE_URL: zod_1.z.string().min(1),
    SNOWFLAKE_ACCOUNT: zod_1.z.string().min(1),
    SNOWFLAKE_USER: zod_1.z.string().min(1),
    SNOWFLAKE_PASSWORD: zod_1.z.string().min(1),
    SNOWFLAKE_WAREHOUSE: zod_1.z.string().min(1),
    SNOWFLAKE_DATABASE: zod_1.z.string().min(1),
    SNOWFLAKE_SCHEMA: zod_1.z.string().min(1),
    SNOWFLAKE_ROLE: zod_1.z.string().min(1),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
    OPENROUTER_API_KEY: zod_1.z.string().min(1),
    OPENROUTER_BASE: zod_1.z.string(),
    AI_MODEL_NAME: zod_1.z.string(),
    AI_MODEL_DECISION: zod_1.z.string(),
    AI_MODEL_VISION: zod_1.z.string(),
    AI_MODEL_EMBEDDING: zod_1.z.string(),
    AI_MODEL_REASONING: zod_1.z.string().optional(),
    AI_MODEL_SEARCH: zod_1.z.string().optional(),
    AI_MODEL_HYBRID: zod_1.z.string().optional(),
    AT_RISK_AI_MODEL_SEARCH: zod_1.z.string().optional(),
    AWS_ACCESS_KEY_ID: zod_1.z.string().min(1),
    AWS_SECRET_ACCESS_KEY: zod_1.z.string().min(1),
    AWS_REGION: zod_1.z.string().default('us-east-1'),
    AWS_BUCKET_NAME: zod_1.z.string().min(1),
    AWS_ML_MODELS_BUCKET_NAME: zod_1.z.string().min(1),
    ATHENA_DATABASE: zod_1.z.string().default('agentic_energy_ea_db'),
    ATHENA_DB_WEB: zod_1.z.string().default('agentic_energy_web_db'),
    ATHENA_OUTPUT_S3: zod_1.z.string().min(1),
    ATHENA_WORKGROUP: zod_1.z.string().default('primary'),
});
exports.env = envSchema.parse(process.env);
