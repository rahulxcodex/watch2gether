import { buildApp } from './app';
import { config } from './config';
import { closeDatabase } from './db/db';

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Server listening on http://${config.HOST}:${config.PORT}`);

    const shutdown = async (signal: string) => {
      app.log.info(`Received ${signal}. Shutting down gracefully...`);
      try {
        if (app.io) {
          app.io.close();
        }
        if (app.redisService) {
          await app.redisService.close();
        }
        await app.close();
        closeDatabase();
        app.log.info('Server shutdown complete.');
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
