import { buildApp } from './app.js';

const PORT = 8080;
const HOST = '0.0.0.0';

async function startServer(): Promise<void> {
  const app = buildApp();

  try {
    await app.listen({
      port: PORT,
      host: HOST
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void startServer();
