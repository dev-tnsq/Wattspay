import { z } from 'zod';

const sendRegex = /^send\s+(?<amount>[0-9]+(?:\.[0-9]+)?)\s*apt\s*(?:to)?\s+(?<target>.+)$/i;

export type ParsedCommand =
  | { type: 'help' }
  | { type: 'balance' }
  | { type: 'history' }
  | { type: 'export' }
  | { type: 'send'; amount: number; rawTarget: string }
  | { type: 'confirm'; accepted: boolean }
  | { type: 'contact-share'; contacts: SharedContact[] }
  | { type: 'unknown' };

export type SharedContact = {
  name?: string;
  phoneNumber: string;
  whatsappId?: string;
};

const contactsSchema = z
  .array(
    z.object({
      wa_id: z.string().optional(),
      profile: z
        .object({ display_name: z.string().optional() })
        .optional()
        .transform((profile) => profile?.display_name),
      addresses: z.any().optional(),
      birthday: z.any().optional(),
      emails: z.any().optional(),
      name: z
        .object({
          formatted_name: z.string().optional(),
        })
        .optional(),
      phones: z
        .array(
          z.object({
            phone: z.string(),
          }),
        )
        .optional(),
    }),
  )
  .optional();

export const parseCommand = (body: string, contactsPayload?: string | null): ParsedCommand => {
  const trimmed = body.trim();

  if (!trimmed) {
    return { type: 'unknown' };
  }

  if (/^help$/i.test(trimmed)) {
    return { type: 'help' };
  }

  if (/^balance$/i.test(trimmed)) {
    return { type: 'balance' };
  }

  if (/^history$/i.test(trimmed)) {
    return { type: 'history' };
  }

  if (/^export$/i.test(trimmed)) {
    return { type: 'export' };
  }

  if (/^(yes|confirm)$/i.test(trimmed)) {
    return { type: 'confirm', accepted: true };
  }

  if (/^(no|cancel)$/i.test(trimmed)) {
    return { type: 'confirm', accepted: false };
  }

  const sendMatch = trimmed.match(sendRegex);
  if (sendMatch?.groups?.amount && sendMatch.groups.target) {
    const amount = Number(sendMatch.groups.amount);
    if (!Number.isNaN(amount) && amount > 0) {
      return {
        type: 'send',
        amount,
        rawTarget: sendMatch.groups.target.trim(),
      };
    }
  }

  if (contactsPayload) {
    try {
      const parsed = contactsSchema.parse(JSON.parse(contactsPayload));
      if (parsed && parsed.length > 0) {
        return {
          type: 'contact-share',
          contacts: parsed
            .map((contact) => {
              const phone = contact.phones?.[0]?.phone;
              if (!phone) return null;
              const sharedContact: SharedContact = {
                phoneNumber: phone,
                name: contact.profile ?? contact.name?.formatted_name ?? undefined,
                whatsappId: contact.wa_id ?? undefined,
              };
              return sharedContact;
            })
            .filter((value): value is SharedContact => value !== null),
        };
      }
    } catch (error) {
      // ignore malformed contact payloads
    }
  }

  if (/^(show|list)\s+group/i.test(trimmed)) {
    return { type: 'unknown' };
  }

  return { type: 'unknown' };
};
