import { prisma } from '../client';

export const createGroupSessionReservation = async (
  creatorId: string,
  topic?: string,
  expiresAt?: Date,
) =>
  prisma.groupSession.create({
    data: {
      creator: { connect: { id: creatorId } },
      topic: topic ?? null,
      expiresAt: expiresAt ?? null,
    },
  });

export const findSessionById = async (id: string) =>
  prisma.groupSession.findUnique({
    where: { id },
    include: {
      participants: true,
      transactions: true,
    },
  });
