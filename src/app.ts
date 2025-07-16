import express, { Application, Request, Response } from 'express';
import { createRouter } from './routes/index.js';
import { errorHandler, requestLogger } from './middleware/index.js';
import type { Kysely } from 'kysely';
import type { Database } from './database/types.js';

export const createApp = (database?: Kysely<Database>): Application => {
  const app = express();

  // Request logging middleware
  app.use(requestLogger);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const router = createRouter(database);
  app.use('/api', router);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Centralized error handling middleware
  app.use(errorHandler);

  return app;
};
