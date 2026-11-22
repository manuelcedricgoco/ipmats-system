import { assertEnv, env } from './config/env.js';
import { createApp } from './app.js';
import { scheduleDailyFlagCheck } from './jobs/dailyFlagCheck.js';

assertEnv();
const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`IPMATS API (Week 3) listening on http://localhost:${env.port}/api (${env.nodeEnv})`);
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
