import Fastify, {
  type FastifyInstance
} from 'fastify';

import { healthRoutes } from './routes/health.js';
import { logRoutes } from './routes/logs.js';

export function buildApp(): FastifyInstance {
  const isProduction =
    process.env.NODE_ENV === 'production';

  const app = Fastify({
    logger: !isProduction
  });

  app.register(healthRoutes);
  app.register(logRoutes);

  return app;
}