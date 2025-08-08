import { GetStaticProps } from 'next';
import { getTenantMetadata, type TenantMetadata } from '@/lib/data';
import Layout from '@/components/Layout';

interface HomeProps {
  metadata: TenantMetadata;
}

export default function Home({ metadata }: HomeProps) {
  return (
    <Layout metadata={metadata}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">
            Welcome to <span className="text-gradient-purple">{metadata.tenant.name}</span> Archive
          </h1>
          <p className="text-xl text-muted">Your complete Discord server history, preserved and searchable</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="card glass glass-hover">
            <div className="card-body flex flex-col justify-between">
              <h3 className="text-xs text-muted uppercase tracking-wider font-medium">Platform</h3>
              <p className="text-4xl font-bold text-primary capitalize mt-4">{metadata.tenant.platform}</p>
            </div>
          </div>
          
          <div className="card glass glass-hover">
            <div className="card-body flex flex-col justify-between">
              <h3 className="text-xs text-muted uppercase tracking-wider font-medium">Status</h3>
              <p className="text-4xl font-bold text-success mt-4">{metadata.tenant.status}</p>
            </div>
          </div>
          
          <div className="card glass glass-hover">
            <div className="card-body flex flex-col justify-between">
              <h3 className="text-xs text-muted uppercase tracking-wider font-medium">Total Channels</h3>
              <p className="text-4xl font-bold text-primary mt-4">{metadata.channels.length}</p>
            </div>
          </div>
        </div>

        <div className="card glass">
          <div className="card-body">
            <h2 className="text-2xl font-semibold text-primary">Getting Started</h2>
            <p className="text-base-content/80 text-lg leading-relaxed mt-4">
              Select a channel from the sidebar to view its message history. 
              This archive was generated on {new Date(metadata.generatedAt).toLocaleString()}.
            </p>
          </div>
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