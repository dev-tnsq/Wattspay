import { Prisma, Transaction } from '@prisma/client';
import { prisma } from '../client';

export const createTransaction = async (data: Prisma.TransactionCreateInput) =>
  prisma.transaction.create({ data });

export const updateTransactionStatus = async (
  id: string,
  data: Pick<Transaction, 'status' | 'aptosHash' | 'confirmedAt'>,
) =>
  prisma.transaction.update({
    where: { id },
    data,
  });

export const listRecentTransactionsForWallet = async (walletId: string, limit = 5) =>
  prisma.transaction.findMany({
    where: {
      OR: [{ senderWalletId: walletId }, { recipientWalletId: walletId }],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      sender: true,
      recipient: true,
      groupSession: true,
    },
  });
