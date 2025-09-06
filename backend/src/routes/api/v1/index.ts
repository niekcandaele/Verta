/**
 * API v1 route aggregator
 */

import { Router } from 'express';
import contentRouter from './content.js';
import questionsRouter from './questions.js';
import faqRouter from './faq.js';
import searchRouter from './search.js';

const router = Router();

// Mount content routes
router.use('/', contentRouter);

// Mount questions routes
router.use('/questions', questionsRouter);

// Mount FAQ routes
router.use('/faq', faqRouter);

// Mount search routes
router.use('/search', searchRouter);

export default router;
