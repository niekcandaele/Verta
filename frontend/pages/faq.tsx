import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Layout from '@/components/Layout';
import FAQ from '@/components/FAQ';
import { getTenantMetadata } from '@/lib/data';
import { getFAQForStaticGeneration, FAQResponse } from '@/lib/faq';
import type { TenantMetadata } from '@/lib/data';

interface FAQPageProps {
  metadata: TenantMetadata;
  faqData: FAQResponse;
}

export default function FAQPage({ metadata, faqData }: FAQPageProps) {
  return (
    <Layout metadata={metadata}>
      <Head>
        <title>FAQ - {metadata.tenant.name}</title>
        <meta name="description" content={`Frequently asked questions about ${metadata.tenant.name}`} />
      </Head>
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="glass p-6 mb-8 rounded-2xl border border-base-content/10 bg-gradient-to-r from-primary/5 to-transparent">
          <h1 className="text-4xl font-bold text-base-content bg-gradient-to-r from-primary to-primary-content bg-clip-text text-transparent">
            Frequently Asked Questions
          </h1>
          <p className="text-base-content/70 mt-2">
            Find answers to the most commonly asked questions from our community.
          </p>
          {faqData.total > 0 && (
            <p className="text-sm text-base-content/50 mt-4">
              Showing {faqData.total} answered questions, ordered by popularity
            </p>
          )}
        </div>
        
        {faqData.total > 0 ? (
          <FAQ items={faqData.data} />
        ) : (
          <div className="glass p-8 rounded-2xl text-center">
            <p className="text-lg text-base-content/70">
              No FAQ items available yet.
            </p>
            <p className="text-sm text-base-content/50 mt-2">
              Check back later for answers to frequently asked questions.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<FAQPageProps> = async () => {
  try {
    // Fetch tenant metadata
    const metadata = await getTenantMetadata();
    
    // Fetch FAQ data
    const faqData = await getFAQForStaticGeneration();
    
    return {
      props: {
        metadata,
        faqData,
      },
    };
  } catch (error) {
    console.error('Failed to generate FAQ page:', error);
    
    // Return minimal props on error
    return {
      props: {
        metadata: await getTenantMetadata(),
        faqData: {
          data: [],
          total: 0,
        },
      },
    };
  }
};