import axios from 'axios';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

async function testSearchEndpoint() {
  const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
  const API_KEY = process.env.ADMIN_API_KEY;

  if (!API_KEY) {
    console.error('❌ ADMIN_API_KEY not found in environment');
    process.exit(1);
  }

  console.log(`🔍 Testing search endpoint at ${ML_SERVICE_URL}/api/ml/search`);

  try {
    // Test with mock data since we're just verifying the endpoint structure
    const searchRequest = {
      query: 'How do I configure webhooks?',
      embedding: Array(1024).fill(0.1), // Mock embedding vector
      search_configs: [
        {
          table: 'golden_answers',
          text_field: 'answer',
          vector_field: 'embedding',
          filters: { tenant_id: 'takaro' },
        },
        {
          table: 'messages',
          text_field: 'content',
          vector_field: 'embedding',
          filters: { channel_id: '1234567890' },
        },
      ],
      limit: 10,
      rerank: false, // Skip reranking for initial test
    };

    const response = await axios.post(
      `${ML_SERVICE_URL}/api/ml/search`,
      searchRequest,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        timeout: 10000,
      }
    );

    console.log('✅ Search endpoint responded successfully');
    console.log('📊 Response structure:', {
      query: response.data.query,
      total_results: response.data.total_results,
      processing_time_ms: response.data.processing_time_ms,
      results_count: response.data.results?.length || 0,
    });

    if (response.data.results?.length > 0) {
      console.log('\n📋 Sample result:', response.data.results[0]);
    }
  } catch (error: any) {
    if (error.response) {
      console.error('❌ API Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });

      if (error.response.status === 503) {
        console.log(
          'ℹ️  This is expected if TiDB hybrid search is not available'
        );
      }
    } else if (error.request) {
      console.error('❌ No response from ML service - is it running?');
    } else {
      console.error('❌ Request setup error:', error.message);
    }
    process.exit(1);
  }
}

// Run the test
testSearchEndpoint().catch(console.error);
