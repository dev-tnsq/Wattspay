import { Prisma, Wallet } from '@prisma/client';
import { prisma } from '../client';

export const findPrimaryWalletForUser = async (userId: string) =>
  prisma.wallet.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });

export const findWalletByAddress = async (address: string) =>
  prisma.wallet.findUnique({ where: { address } });

export const createWallet = async (data: Prisma.WalletCreateInput): Promise<Wallet> =>
  prisma.wallet.create({ data });

export const updateWalletBackupTimestamp = async (walletId: string) =>
  prisma.wallet.update({ where: { id: walletId }, data: { mnemonicBackupSentAt: new Date() } });
