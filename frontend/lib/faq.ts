import { apiClient } from './api-client';

export interface FAQItem {
  id: string;
  question: string;
  thread_title: string | null;
  answer: string;
  answer_format: 'markdown' | 'plaintext';
  popularity: number;
  first_seen: string;
  last_seen: string;
  answered_by: string;
  answered_at: string;
}

export interface FAQResponse {
  data: FAQItem[];
  total: number;
  cached_at?: string;
}

/**
 * Fetch FAQ data from the API
 * Can be used both server-side (getStaticProps) and client-side
 */
export async function fetchFAQ(options?: {
  tenant_id?: string;
  limit?: number;
  useCache?: boolean;
}): Promise<FAQResponse> {
  const { tenant_id, limit = 50, useCache = true } = options || {};
  
  try {
    // Use cached endpoint for better performance
    const endpoint = useCache ? '/faq/cached' : '/faq';
    const response = await apiClient.get<FAQResponse>(endpoint, {
      params: {
        tenant_id,
        limit,
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Failed to fetch FAQ:', error);
    // Return empty FAQ list on error
    return {
      data: [],
      total: 0,
    };
  }
}

/**
 * Fetch FAQ for static generation
 * Used in getStaticProps
 */
export async function getFAQForStaticGeneration(): Promise<FAQResponse> {
  // Get tenant from environment for static generation
  const tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG;
  
  if (!tenantSlug) {
    console.warn('No tenant slug configured for FAQ');
    return {
      data: [],
      total: 0,
    };
  }
  
  // For static generation, we might want to fetch tenant_id first
  // For now, we'll fetch all FAQs and filter client-side if needed
  return fetchFAQ({
    limit: 100, // Get more for static generation
    useCache: false, // Don't use cache for build time
  });
}