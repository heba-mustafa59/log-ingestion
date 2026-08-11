import { z } from 'zod';

const MAX_FUTURE_OFFSET_MS = 5 * 60 * 1000;

export const logLevels = [
  'debug',
  'info',
  'warn',
  'error'
] as const;

export type LogLevel = (typeof logLevels)[number];

const attributesSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean()
  ])
);

export const logEntrySchema = z.object({
  timestamp: z.iso
    .datetime({ offset: true })
    .refine(
      (value) => {
        const timestamp = new Date(value).getTime();

        return timestamp <= Date.now() + MAX_FUTURE_OFFSET_MS;
      },
      {
        message: 'timestamp must not be more than five minutes in the future'
      }
    ),

  level: z.enum(logLevels),

  service: z.string().min(1, 'service must not be empty'),

  message: z.string().min(1, 'message must not be empty'),

  attributes: attributesSchema.optional().default({})
});

export type LogEntry = z.infer<typeof logEntrySchema>;
