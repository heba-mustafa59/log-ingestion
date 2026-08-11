import { z } from 'zod';

export const ingestRequestSchema = z.object({
  logs: z.array(z.unknown()).min(1)
});
