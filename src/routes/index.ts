import { Router, Request, Response } from 'express';
import { createTenantRouter } from './tenant.js';
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

  return router;
}
