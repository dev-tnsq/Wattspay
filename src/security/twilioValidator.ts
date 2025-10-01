import type { Request } from 'express';
import { twiml, validateRequest } from 'twilio';
import { env } from '../config/env';

export const extractTwilioSignature = (req: Request) =>
  (req.headers['x-twilio-signature'] as string | undefined) ?? undefined;

export const verifyTwilioRequest = (req: Request, fullUrl: string): boolean => {
  const signature = extractTwilioSignature(req);
  if (!signature) return false;

  return validateRequest(env.TWILIO_AUTH_TOKEN, signature, fullUrl, req.body as Record<string, string>);
};

export const buildMessagingResponse = () => new twiml.MessagingResponse();
