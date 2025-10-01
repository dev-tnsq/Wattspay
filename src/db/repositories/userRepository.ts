import { Prisma, User } from '@prisma/client';
import { prisma } from '../client';

export const findUserByWhatsAppId = async (whatsappId: string) =>
  prisma.user.findUnique({
    where: { whatsappId },
    include: {
      wallets: true,
      contacts: true,
    },
  });

export const findUserByPhoneNumber = async (phoneNumber: string) =>
  prisma.user.findUnique({
    where: { phoneNumber },
    include: {
      wallets: true,
    },
  });

export const createUser = async (data: Prisma.UserCreateInput): Promise<User> => 
  prisma.user.create({ data });

export const upsertUser = async (
  whatsappId: string,
  phoneNumber: string,
  data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'whatsappId' | 'phoneNumber'>>,
) =>
  prisma.user.upsert({
    where: { whatsappId },
    create: {
      whatsappId,
      phoneNumber,
      displayName: data.displayName,
    },
    update: {
      displayName: data.displayName ?? undefined,
    },
    include: {
      wallets: true,
      contacts: true,
    },
  });
