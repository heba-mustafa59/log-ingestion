import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from 'fastify';

import { ingestRequestSchema } from '../logs/request-schema.js';
import { validateLogBatch } from '../logs/validation.js';
import { insertLogs } from '../logs/repository.js';
import { parseLogQuery } from '../logs/query-validation.js';
import { queryLogs } from '../logs/query-service.js';
import { parseAggregateQuery } from '../logs/aggregate-validation.js';
import { aggregateLogs } from '../logs/aggregate-service.js';

export async function logRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post(
    '/logs',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const bodyResult = ingestRequestSchema.safeParse(request.body);

      if (!bodyResult.success) {
        return reply.code(400).send({
          error: 'request body must contain a non-empty logs array'
        });
      }

      const validation = validateLogBatch(bodyResult.data.logs);

      if (validation.valid.length === 0) {
        return reply.code(400).send({
          accepted: 0,
          rejected: validation.rejected
        });
      }

      await insertLogs(validation.valid);

      return reply.code(200).send({
        accepted: validation.valid.length,
        rejected: validation.rejected
      });
    }
  );
  app.get('/logs', async (request, reply) => {
  let query;

  try {
    query = parseLogQuery(
      request.query as Record<string, unknown>
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'invalid query parameters';

    return reply.code(400).send({
      error: message
    });
  }

  const result = await queryLogs(query);

  return reply.code(200).send(result);
});
app.get('/logs/aggregate', async (request, reply) => {
  let query;

  try {
    query = parseAggregateQuery(
      request.query as Record<string, unknown>
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'invalid query parameters';

    return reply.code(400).send({
      error: message
    });
  }

  const result = await aggregateLogs(query);

  return reply.code(200).send(result);
});
}
