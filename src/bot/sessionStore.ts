import { env } from '../config/env';

export type ConfirmationSession = {
  preview: string;
  payload: {
    senderWalletId: string;
    recipientWalletId: string;
    amountOctas: bigint;
  };
  expiresAt: number;
};

export type SessionState = {
  confirmation?: ConfirmationSession;
};

const sessions = new Map<string, SessionState>();

const ttlMs = env.SESSION_TTL_MINUTES * 60 * 1000;

const isExpired = (storedAt: number) => Date.now() > storedAt;

export const getSession = (waId: string): SessionState => {
  const current = sessions.get(waId);
  if (!current) {
    const initial: SessionState = {};
    sessions.set(waId, initial);
    return initial;
  }
  return current;
};

export const saveConfirmation = (waId: string, confirmation: ConfirmationSession) => {
  const session = getSession(waId);
  session.confirmation = confirmation;
  sessions.set(waId, session);
  setTimeout(() => {
    const current = sessions.get(waId);
    if (current?.confirmation && isExpired(current.confirmation.expiresAt)) {
      delete current.confirmation;
      sessions.set(waId, current);
    }
  }, env.CONFIRMATION_TIMEOUT_SECONDS * 1000).unref?.();
};

export const consumeConfirmation = (waId: string) => {
  const session = getSession(waId);
  const confirmation = session.confirmation;
  if (!confirmation) return undefined;
  if (isExpired(confirmation.expiresAt)) {
    delete session.confirmation;
    sessions.set(waId, session);
    return undefined;
  }
  delete session.confirmation;
  sessions.set(waId, session);
  return confirmation;
};

export const cleanupStaleSessions = () => {
  const now = Date.now();
  for (const [key, session] of sessions) {
    const confirmationExpired = session.confirmation && now > session.confirmation.expiresAt;
    if (!session.confirmation && now - sessionTimestamp(session) > ttlMs) {
      sessions.delete(key);
      continue;
    }
    if (confirmationExpired && session.confirmation) {
      delete session.confirmation;
      sessions.set(key, session);
    }
  }
};

const sessionTimestamp = (session: SessionState) =>
  session.confirmation?.expiresAt ?? Date.now();
