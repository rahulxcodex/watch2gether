import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().default('watch2gether-super-secret-jwt-key-change-in-prod'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000'),
  COOKIE_SECRET: z.string().default('watch2gether-cookie-signing-secret-key-32chars'),
  DATABASE_URL: z.string().optional(),
  DB_TYPE: z.enum(['sqlite', 'postgres', 'memory']).default('sqlite'),
  SQLITE_PATH: z.string().default('./data/watch2gether.db'),
  REDIS_URL: z.string().optional(),
  USE_STANDALONE_REDIS: z.coerce.boolean().default(false),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
