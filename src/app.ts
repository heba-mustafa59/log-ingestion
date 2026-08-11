import Fastify, { type FastifyInstance } from 'fastify';

import { healthRoutes } from './routes/health.js';
import { logRoutes } from './routes/logs.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true
  });

  app.register(healthRoutes);
  app.register(logRoutes);

  return app;
}
