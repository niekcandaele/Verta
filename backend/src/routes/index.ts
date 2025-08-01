import { Router, Request, Response } from 'express';
import { createTenantRouter } from './tenant.js';
import syncRouter from './sync.js';
import { createExportRouter } from './export.js';
import type { Kysely } from 'kysely';
import type { Database } from '../database/types.js';

export function createRouter(database?: Kysely<Database>): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      message: 'Welcome to Verta API',
      version: '1.0.0',
    });
  });

  // Mount tenant routes with the provided database
  const tenantRouter = createTenantRouter(database);
  router.use('/tenants', tenantRouter);

  // Mount sync routes
  router.use('/sync', syncRouter);

  // Mount export routes
  const exportRouter = createExportRouter(database);
  router.use('/export', exportRouter);

  return router;
}
