import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  TWILIO_ACCOUNT_SID: z.string().min(10),
  TWILIO_AUTH_TOKEN: z.string().min(10),
  TWILIO_WHATSAPP_NUMBER: z.string().regex(/^whatsapp:\+/i, {
    message: 'Must include whatsapp:+ prefix',
  }),
  APTOS_NETWORK: z.enum(['devnet', 'testnet', 'mainnet']).default('devnet'),
  APTOS_NODE_URL: z.string().url(),
  APTOS_FAUCET_URL: z.string().url().optional(),
  // Deployed Smart Contract Addresses
  USER_REGISTRY_ADDRESS: z.string().default('0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615'),
  PAYMENT_COORDINATOR_ADDRESS: z.string().default('0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615'),
  GROUP_TREASURY_ADDRESS: z.string().default('0xe81be9d22cc4ead33878d8e9c95e1fabcebae3a9eee70de3eb39c6883573d615'),
  ENCRYPTION_SECRET: z.string().min(32, {
    message: 'Provide a strong secret (>=32 characters)',
  }),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  CONFIRMATION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
  WEBHOOK_URL: z.string().url().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === 'production';
