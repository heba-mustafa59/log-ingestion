import { z } from 'zod';

const cursorSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  id: z.string().regex(/^\d+$/)
});

export type LogCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: LogCursor): string {
  return Buffer
    .from(JSON.stringify(cursor))
    .toString('base64url');
}

export function decodeCursor(value: string): LogCursor {
  try {
    const decoded = Buffer
      .from(value, 'base64url')
      .toString('utf8');

    const parsedJson: unknown = JSON.parse(decoded);

    const result = cursorSchema.safeParse(parsedJson);

    if (!result.success) {
      throw new Error();
    }

    return result.data;
  } catch {
    throw new Error('invalid cursor');
  }
}