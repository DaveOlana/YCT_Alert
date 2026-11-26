import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const app = buildApp(config);

async function start() {
  try {
    await app.listen({
      port: config.API_PORT,
      host: config.API_HOST,
    });
    console.log(`[YCT Alert API] Server listening on ${config.API_PUBLIC_URL}`);
    console.log(
      `[YCT Alert API] OpenAPI spec available at ${config.API_PUBLIC_URL}/api/v1/openapi.json`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Start only if invoked directly
if (process.env.NODE_ENV !== 'test') {
  start();
}

export { app, config };
