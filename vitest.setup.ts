import { beforeAll } from 'vitest';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load test environment variables before any imports that use them
dotenv.config({ path: resolve(__dirname, '.env.test') });

beforeAll(() => {
  // Environment variables are already loaded above
  console.log('Test environment loaded');
});