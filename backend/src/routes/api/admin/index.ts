/**
 * Admin API route aggregator
 */

import { Router } from 'express';
import analysisRouter from './analysis.js';
import { createBullBoardAdapter } from '../../../config/bullBoard.js';
import { bullBoardAuth } from '../../../middleware/basicAuth.js';

const router = Router();

// Mount admin routes
router.use('/analysis', analysisRouter);

// Mount Bull Board with basic authentication
const bullBoardAdapter = createBullBoardAdapter();
router.use('/queues', bullBoardAuth, bullBoardAdapter.getRouter());

export default router;
