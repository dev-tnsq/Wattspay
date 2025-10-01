import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

prisma.$on('error', (event: unknown) => {
  logger.error('Prisma error', { error: event });
});
