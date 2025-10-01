import { Twilio } from 'twilio';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const client = new Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export type OutboundMessageOptions = {
  to: string;
  body: string;
  mediaUrl?: string[];
};

export const sendWhatsAppMessage = async ({ to, body, mediaUrl }: OutboundMessageOptions) => {
  try {
    await client.messages.create({
      from: env.TWILIO_WHATSAPP_NUMBER,
      to,
      body,
      mediaUrl,
    });
    logger.info('Sent WhatsApp message', { to });
  } catch (error) {
    logger.error('Failed to send WhatsApp message', { error, to });
    throw error;
  }
};
