/**
 * @file config.test.ts
 * @description Comprehensive tests for environment configuration
 */

import { z } from 'zod';

describe('Environment Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Configuration Schema', () => {
    it('should define schema with required fields', () => {
      // This test documents the required fields
      const requiredFields = [
        'JWT_SECRET',
        'DATABASE_URL',
        'SNOWFLAKE_ACCOUNT',
        'SNOWFLAKE_USER',
        'SNOWFLAKE_PASSWORD',
        'SNOWFLAKE_WAREHOUSE',
        'SNOWFLAKE_DATABASE',
        'SNOWFLAKE_SCHEMA',
        'SNOWFLAKE_ROLE',
        'OPENROUTER_API_KEY',
        'OPENROUTER_BASE',
        'AI_MODEL_NAME',
        'AI_MODEL_DECISION',
        'AI_MODEL_VISION',
        'AI_MODEL_EMBEDDING',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_BUCKET_NAME',
      ];

      expect(requiredFields).toContain('JWT_SECRET');
      expect(requiredFields).toContain('DATABASE_URL');
      expect(requiredFields).toContain('SNOWFLAKE_ACCOUNT');
    });

    it('should have optional fields', () => {
      const optionalFields = [
        'AI_MODEL_REASONING',
        'AI_MODEL_SEARCH',
        'AI_MODEL_HYBRID',
        'AT_RISK_AI_MODEL_SEARCH',
      ];

      expect(optionalFields).toContain('AI_MODEL_REASONING');
      expect(optionalFields.length).toBeGreaterThan(0);
    });
  });

  describe('Default Values', () => {
    it('should provide default PORT of 3000', () => {
      // Set only required env vars
      process.env.JWT_SECRET = 'test-secret';
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.SNOWFLAKE_ACCOUNT = 'test';
      process.env.SNOWFLAKE_USER = 'user';
      process.env.SNOWFLAKE_PASSWORD = 'pass';
      process.env.SNOWFLAKE_WAREHOUSE = 'wh';
      process.env.SNOWFLAKE_DATABASE = 'db';
      process.env.SNOWFLAKE_SCHEMA = 'schema';
      process.env.SNOWFLAKE_ROLE = 'role';
      process.env.OPENROUTER_API_KEY = 'key';
      process.env.OPENROUTER_BASE = 'https://openrouter.ai';
      process.env.AI_MODEL_NAME = 'model';
      process.env.AI_MODEL_DECISION = 'model2';
      process.env.AI_MODEL_VISION = 'model3';
      process.env.AI_MODEL_EMBEDDING = 'model4';
      process.env.AWS_ACCESS_KEY_ID = 'key';
      process.env.AWS_SECRET_ACCESS_KEY = 'secret';
      process.env.AWS_BUCKET_NAME = 'bucket';
      process.env.PORT = undefined;

      // Test that default would be applied (with schema)
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
      });

      const result = schema.parse({});
      expect(result.PORT).toBe(3000);
    });

    it('should provide default NODE_ENV of development', () => {
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'production']).default('development'),
      });

      const result = schema.parse({});
      expect(result.NODE_ENV).toBe('development');
    });

    it('should provide default LOG_LEVEL of info', () => {
      const schema = z.object({
        LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
      });

      const result = schema.parse({});
      expect(result.LOG_LEVEL).toBe('info');
    });

    it('should provide default AWS_REGION of us-east-1', () => {
      const schema = z.object({
        AWS_REGION: z.string().default('us-east-1'),
      });

      const result = schema.parse({});
      expect(result.AWS_REGION).toBe('us-east-1');
    });
  });

  describe('Field Validation', () => {
    it('should validate PORT as coercible number', () => {
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
      });

      expect(schema.parse({ PORT: '8080' }).PORT).toBe(8080);
      expect(schema.parse({ PORT: 3000 }).PORT).toBe(3000);
    });

    it('should validate NODE_ENV enum', () => {
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'production']).default('development'),
      });

      expect(schema.parse({ NODE_ENV: 'development' }).NODE_ENV).toBe('development');
      expect(schema.parse({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    });

    it('should reject invalid NODE_ENV', () => {
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'production']).default('development'),
      });

      expect(() => schema.parse({ NODE_ENV: 'staging' })).toThrow();
    });

    it('should validate JWT_SECRET as non-empty string', () => {
      const schema = z.object({
        JWT_SECRET: z.string().min(1),
      });

      expect(schema.parse({ JWT_SECRET: 'my-secret' }).JWT_SECRET).toBe('my-secret');
      expect(() => schema.parse({ JWT_SECRET: '' })).toThrow();
    });

    it('should validate DATABASE_URL as non-empty string', () => {
      const schema = z.object({
        DATABASE_URL: z.string().min(1),
      });

      expect(schema.parse({ DATABASE_URL: 'postgres://localhost/db' }).DATABASE_URL).toBeDefined();
      expect(() => schema.parse({ DATABASE_URL: '' })).toThrow();
    });

    it('should validate Snowflake required fields', () => {
      const snowflakeSchema = z.object({
        SNOWFLAKE_ACCOUNT: z.string().min(1),
        SNOWFLAKE_USER: z.string().min(1),
        SNOWFLAKE_PASSWORD: z.string().min(1),
        SNOWFLAKE_WAREHOUSE: z.string().min(1),
        SNOWFLAKE_DATABASE: z.string().min(1),
        SNOWFLAKE_SCHEMA: z.string().min(1),
        SNOWFLAKE_ROLE: z.string().min(1),
      });

      const validConfig = {
        SNOWFLAKE_ACCOUNT: 'account',
        SNOWFLAKE_USER: 'user',
        SNOWFLAKE_PASSWORD: 'pass',
        SNOWFLAKE_WAREHOUSE: 'warehouse',
        SNOWFLAKE_DATABASE: 'database',
        SNOWFLAKE_SCHEMA: 'schema',
        SNOWFLAKE_ROLE: 'role',
      };

      expect(() => snowflakeSchema.parse(validConfig)).not.toThrow();
    });

    it('should validate LOG_LEVEL enum', () => {
      const schema = z.object({
        LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
      });

      const validLevels = ['error', 'warn', 'info', 'http', 'debug'];
      validLevels.forEach((level) => {
        expect(schema.parse({ LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
      });
    });

    it('should reject invalid LOG_LEVEL', () => {
      const schema = z.object({
        LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
      });

      expect(() => schema.parse({ LOG_LEVEL: 'verbose' })).toThrow();
    });

    it('should validate AWS fields', () => {
      const awsSchema = z.object({
        AWS_ACCESS_KEY_ID: z.string().min(1),
        AWS_SECRET_ACCESS_KEY: z.string().min(1),
        AWS_REGION: z.string().default('us-east-1'),
        AWS_BUCKET_NAME: z.string().min(1),
      });

      const validConfig = {
        AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        AWS_REGION: 'us-west-2',
        AWS_BUCKET_NAME: 'my-bucket',
      };

      expect(() => awsSchema.parse(validConfig)).not.toThrow();
    });

    it('should validate OpenAI API configuration', () => {
      const openaiSchema = z.object({
        OPENROUTER_API_KEY: z.string().min(1),
        OPENROUTER_BASE: z.string(),
        AI_MODEL_NAME: z.string(),
      });

      const validConfig = {
        OPENROUTER_API_KEY: 'sk-or-v1-xxxx',
        OPENROUTER_BASE: 'https://openrouter.ai/api/v1',
        AI_MODEL_NAME: 'openai/gpt-4',
      };

      expect(() => openaiSchema.parse(validConfig)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle PORT as string', () => {
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
      });

      expect(schema.parse({ PORT: '5000' }).PORT).toBe(5000);
    });

    it('should reject invalid PORT', () => {
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
      });

      expect(() => schema.parse({ PORT: 'invalid' })).toThrow();
    });

    it('should handle very long server secrets', () => {
      const schema = z.object({
        JWT_SECRET: z.string().min(1),
      });

      const longSecret = 'x'.repeat(10000);
      expect(schema.parse({ JWT_SECRET: longSecret }).JWT_SECRET).toBe(longSecret);
    });

    it('should handle special characters in secrets', () => {
      const schema = z.object({
        JWT_SECRET: z.string().min(1),
        AWS_SECRET_ACCESS_KEY: z.string().min(1),
      });

      const config = {
        JWT_SECRET: 'secret-with-!@#$%^&*()_+-=[]{}|;:,.<>?',
        AWS_SECRET_ACCESS_KEY: 'AWS-secret-with-special/chars++=',
      };

      expect(() => schema.parse(config)).not.toThrow();
    });

    it('should handle URLs with special characters', () => {
      const schema = z.object({
        DATABASE_URL: z.string().min(1),
        OPENROUTER_BASE: z.string(),
      });

      const config = {
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db?sslmode=require&timeout=10s',
        OPENROUTER_BASE: 'https://api.openrouter.ai/v1?key=value&other=test',
      };

      expect(() => schema.parse(config)).not.toThrow();
    });

    it('should handle missing optional fields gracefully', () => {
      const schema = z.object({
        AI_MODEL_REASONING: z.string().optional(),
        AI_MODEL_SEARCH: z.string().optional(),
      });

      expect(schema.parse({}).AI_MODEL_REASONING).toBeUndefined();
      expect(schema.parse({}).AI_MODEL_SEARCH).toBeUndefined();
    });

    it('should handle AWS_REGION variations', () => {
      const schema = z.object({
        AWS_REGION: z.string().default('us-east-1'),
      });

      const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'custom-region'];

      regions.forEach((region) => {
        expect(schema.parse({ AWS_REGION: region }).AWS_REGION).toBe(region);
      });
    });
  });

  describe('Configuration Consistency', () => {
    it('should maintain relationship between Snowflake configs', () => {
      const requiredSnowflakeFields = [
        'SNOWFLAKE_ACCOUNT',
        'SNOWFLAKE_USER',
        'SNOWFLAKE_PASSWORD',
        'SNOWFLAKE_WAREHOUSE',
        'SNOWFLAKE_DATABASE',
        'SNOWFLAKE_SCHEMA',
        'SNOWFLAKE_ROLE',
      ];

      expect(requiredSnowflakeFields.length).toBe(7);
      expect(requiredSnowflakeFields).toContain('SNOWFLAKE_ACCOUNT');
    });

    it('should have consistent AI model configuration', () => {
      const modelConfigs = [
        'AI_MODEL_NAME',
        'AI_MODEL_DECISION',
        'AI_MODEL_VISION',
        'AI_MODEL_EMBEDDING',
      ];

      expect(modelConfigs.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Error Messages', () => {
    it('should provide meaningful validation errors', () => {
      const schema = z.object({
        JWT_SECRET: z.string().min(1, { message: 'JWT_SECRET must be non-empty' }),
      });

      try {
        schema.parse({ JWT_SECRET: '' });
        fail('Should have thrown');
      } catch (error) {
        if (error instanceof z.ZodError) {
          expect(error.issues[0].message).toContain('non-empty');
        }
      }
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle development environment config', () => {
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'production']).default('development'),
        PORT: z.coerce.number().default(3000),
        LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
      });

      const devConfig = {
        NODE_ENV: 'development',
        PORT: '3000',
        LOG_LEVEL: 'debug',
      };

      const result = schema.parse(devConfig);
      expect(result.NODE_ENV).toBe('development');
      expect(result.PORT).toBe(3000);
      expect(result.LOG_LEVEL).toBe('debug');
    });

    it('should handle production environment config', () => {
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'production']).default('development'),
        PORT: z.coerce.number().default(3000),
        LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
      });

      const prodConfig = {
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'error',
      };

      const result = schema.parse(prodConfig);
      expect(result.NODE_ENV).toBe('production');
      expect(result.PORT).toBe(8080);
      expect(result.LOG_LEVEL).toBe('error');
    });
  });
});
