import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export const upsertContact = async (
  ownerId: string,
  phoneNumber: string,
  data: Omit<Prisma.ContactUpsertArgs['create'], 'owner'>,
) =>
  prisma.contact.upsert({
    where: {
      ownerId_phoneNumber: { ownerId, phoneNumber },
    },
    create: {
      owner: { connect: { id: ownerId } },
      phoneNumber,
      whatsappId: data.whatsappId ?? null,
      displayName: data.displayName ?? null,
      wallet: data.walletId ? { connect: { id: data.walletId } } : undefined,
    },
    update: {
      whatsappId: data.whatsappId ?? undefined,
      displayName: data.displayName ?? undefined,
      wallet: data.walletId ? { connect: { id: data.walletId } } : undefined,
    },
    include: { wallet: true },
  });
