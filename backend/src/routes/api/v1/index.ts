/**
 * API v1 route aggregator
 */

import { Router } from 'express';
import contentRouter from './content.js';
import questionsRouter from './questions.js';

const router = Router();

// Mount content routes
router.use('/', contentRouter);

// Mount questions routes
router.use('/questions', questionsRouter);

export default router;
