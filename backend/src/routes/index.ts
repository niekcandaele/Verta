import { Router, Request, Response } from 'express';
import { createTenantRouter } from './tenant.js';
import syncRouter from './sync.js';
import v1Router from './api/v1/index.js';
import adminRouter from './api/admin/index.js';
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

  // Mount v1 API routes for public content
  router.use('/v1', v1Router);

  // Mount admin API routes
  router.use('/admin', adminRouter);

  // Mount tenant routes with the provided database
  const tenantRouter = createTenantRouter(database);
  router.use('/tenants', tenantRouter);

  // Mount sync routes
  router.use('/sync', syncRouter);

  return router;
}
