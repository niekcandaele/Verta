/**
 * API v1 route aggregator
 */

import { Router } from 'express';
import contentRouter from './content.js';

const router = Router();

// Mount content routes
router.use('/', contentRouter);

export default router;
