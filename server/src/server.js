import { assertEnv, env } from './config/env.js';
import { createApp } from './app.js';

assertEnv();
const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`IPMATS API (Week 1) listening on http://localhost:${env.port}/api (${env.nodeEnv})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
