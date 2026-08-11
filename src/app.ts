import Fastify, { type FastifyInstance } from 'fastify';

export function buildApp(): FastifyInstance {
  return Fastify({
    logger: true
  });
}
