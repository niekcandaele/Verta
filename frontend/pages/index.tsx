import { GetStaticProps } from 'next';
import { getTenantMetadata, type TenantMetadata } from '@/lib/data';
import Layout from '@/components/Layout';

interface HomeProps {
  metadata: TenantMetadata;
}

export default function Home({ metadata }: HomeProps) {
  return (
    <Layout metadata={metadata}>
      <div className="prose max-w-none">
        <h1 className="text-3xl font-bold mb-6">Welcome to {metadata.tenant.name} Archive</h1>
        
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-title">Platform</div>
            <div className="stat-value text-primary">{metadata.tenant.platform}</div>
          </div>
          
          <div className="stat">
            <div className="stat-title">Status</div>
            <div className="stat-value text-secondary">{metadata.tenant.status}</div>
          </div>
          
          <div className="stat">
            <div className="stat-title">Total Channels</div>
            <div className="stat-value">{metadata.channels.length}</div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
          <p className="text-base-content/70">
            Select a channel from the sidebar to view its message history. 
            This archive was generated on {new Date(metadata.generatedAt).toLocaleString()}.
          </p>
        </div>

        {metadata.branding && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">Branding</h2>
            <div className="alert alert-info">
              <span>Custom branding will be applied in a future update.</span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  try {
    const metadata = await getTenantMetadata();
    
    return {
      props: {
        metadata,
      },
    };
  } catch (error) {
    console.error('Failed to load tenant metadata:', error);
    throw error;
  }
};