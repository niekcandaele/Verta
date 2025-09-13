#!/usr/bin/env tsx
import { ContentExtractor } from '../src/services/knowledgeBase/ContentExtractor.js';
import logger from '../src/utils/logger.js';

/**
 * Test script to verify title extraction works correctly for module pages
 */
async function testTitleExtraction() {
  const testUrls = [
    'https://modules.takaro.io/module/gimme/0.0.3',
    'https://modules.takaro.io/module/Hangman/latest',
    'https://modules.takaro.io/module/BannedItems/latest',
  ];

  console.log('Testing title extraction with updated ContentExtractor...\n');

  const extractor = new ContentExtractor();

  for (const url of testUrls) {
    console.log(`\n=== Testing URL: ${url} ===`);

    try {
      const result = await extractor.extractFromUrl(url);

      if (result.success && result.content) {
        console.log(`✓ Title: ${result.content.title}`);
        console.log(`✓ Content length: ${result.content.content.length} characters`);
        console.log(`✓ URL: ${result.content.metadata.url}`);

        // Check if we're getting the wrong title
        if (result.content.title.includes('MeeBob_Donator')) {
          console.error('✗ WARNING: Still extracting sidebar title!');
        }
      } else {
        console.error(`✗ Failed to extract content: ${result.error}`);
      }
    } catch (error) {
      console.error(`✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('\n=== Test complete ===');
}

// Run the test
testTitleExtraction().catch(error => {
  logger.error('Test failed', { error });
  process.exit(1);
});