import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const deriveKey = () => crypto.createHash('sha256').update(env.ENCRYPTION_SECRET).digest();

export type EncryptedPayload = {
  cipherText: string;
  iv: string;
  authTag: string;
};

export const encryptString = (value: string): EncryptedPayload => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
};

export const decryptString = (payload: EncryptedPayload): string => {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};
