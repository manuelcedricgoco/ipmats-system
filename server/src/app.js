import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ipLimiter, proxyDebug, userLimiter } from './middleware/rateLimits.js';
import publicReports from './routes/publicReports.js';
import api from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: false,
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  // Anonymous report routes: only the IP limiter, no sign-in lookup and no request-detail logging.
  app.use('/api/public', publicReports);
  app.use('/api', proxyDebug, ipLimiter, authenticate, userLimiter, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
