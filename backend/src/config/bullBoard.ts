import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { syncQueue } from '../queues/syncQueue.js';
import { channelSyncQueue } from '../queues/channelSyncQueue.js';
import { getAnalysisQueue } from '../queues/analysisQueue.js';
import logger from '../utils/logger.js';

/**
 * Initialize Bull Board with all application queues
 */
export function createBullBoardAdapter() {
  // Create Express adapter for Bull Board
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/api/admin/queues');

  try {
    // Get the analysis queue instance
    const analysisQueue = getAnalysisQueue();

    // Create Bull Board with all queues
    createBullBoard({
      queues: [
        new BullMQAdapter(syncQueue, {
          readOnlyMode: false,
          description: 'Main platform sync queue for tenant synchronization',
        }),
        new BullMQAdapter(channelSyncQueue, {
          readOnlyMode: false,
          description:
            'Channel-specific sync queue for processing individual channels',
        }),
        new BullMQAdapter(analysisQueue, {
          readOnlyMode: false,
          description:
            'Thread analysis queue for question extraction and clustering',
        }),
      ],
      serverAdapter,
      options: {
        uiConfig: {
          boardTitle: 'Verta Queue Dashboard',
          miscLinks: [
            {
              text: 'Verta API',
              url: '/api',
            },
          ],
        },
      },
    });

    logger.info('Bull Board initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Bull Board', { error });
    throw error;
  }

  return serverAdapter;
}
