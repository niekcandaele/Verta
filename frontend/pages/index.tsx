import { GetStaticProps } from 'next';
import Link from 'next/link';
import { getTenantMetadata, type TenantMetadata } from '@/lib/data';

interface HomeProps {
  metadata: TenantMetadata;
}

export default function Home({ metadata }: HomeProps) {
  return (
    <div>
      <h1>Tenant Archive: {metadata.tenant.name}</h1>
      <p>Platform: {metadata.tenant.platform}</p>
      <p>Status: {metadata.tenant.status}</p>
      <p>Generated at: {new Date(metadata.generatedAt).toLocaleString()}</p>
      
      <h2>Channels ({metadata.channels.length})</h2>
      <ul>
        {metadata.channels.map((channel) => (
          <li key={channel.id}>
            <Link href={`/channel/${channel.id}/1`}>
              {channel.name} ({channel.type})
            </Link>
          </li>
        ))}
      </ul>
      
      <h2>Raw Metadata (Debug)</h2>
      <pre>{JSON.stringify(metadata, null, 2)}</pre>
    </div>
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