import { assertEnv, env } from './config/env.js';
import { createApp } from './app.js';
import { scheduleDailyFlagCheck } from './jobs/dailyFlagCheck.js';

assertEnv();
const app = createApp();
const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`IPMATS API listening on port ${env.port} (${env.nodeEnv})`);
});
const flagJob = process.env.NODE_ENV === 'test' ? null : scheduleDailyFlagCheck();

function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  flagJob?.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
