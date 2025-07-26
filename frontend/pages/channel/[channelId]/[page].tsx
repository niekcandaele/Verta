import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  getChannels, 
  getChannel,
  getChannelMessages, 
  getChannelPageNumbers,
  type MessagePageData 
} from '@/lib/data';
import type { Channel } from 'shared-types';

interface ChannelPageProps {
  channel: Channel;
  pageData: MessagePageData;
  currentPage: number;
}

export default function ChannelPage({ channel, pageData, currentPage }: ChannelPageProps) {
  const router = useRouter();
  
  if (router.isFallback) {
    return <div>Loading...</div>;
  }
  
  return (
    <div>
      <h1>Channel: {channel.name}</h1>
      <p>Type: {channel.type}</p>
      <p>Channel ID: {channel.id}</p>
      <p>Page {currentPage} of {pageData.totalPages}</p>
      
      <nav>
        <Link href="/">← Back to channels</Link>
        {' | '}
        {currentPage > 1 && (
          <>
            <Link href={`/channel/${channel.id}/${currentPage - 1}`}>
              ← Previous
            </Link>
            {' | '}
          </>
        )}
        {currentPage < pageData.totalPages && (
          <Link href={`/channel/${channel.id}/${currentPage + 1}`}>
            Next →
          </Link>
        )}
      </nav>
      
      <h2>Messages ({pageData.messages.length})</h2>
      
      <h3>Raw Page Data (Debug)</h3>
      <pre style={{ overflow: 'auto', maxHeight: '600px' }}>
        {JSON.stringify(pageData, null, 2)}
      </pre>
    </div>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const channels = await getChannels();
  const paths = [];
  
  // Generate paths for all channel/page combinations
  for (const channel of channels) {
    const pageNumbers = await getChannelPageNumbers(channel.id);
    for (const page of pageNumbers) {
      paths.push({
        params: {
          channelId: channel.id,
          page: page.toString(),
        },
      });
    }
  }
  
  return {
    paths,
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<ChannelPageProps> = async ({ params }) => {
  if (!params || typeof params.channelId !== 'string' || typeof params.page !== 'string') {
    return { notFound: true };
  }
  
  const channelId = params.channelId;
  const currentPage = parseInt(params.page, 10);
  
  if (isNaN(currentPage) || currentPage < 1) {
    return { notFound: true };
  }
  
  const channel = await getChannel(channelId);
  if (!channel) {
    return { notFound: true };
  }
  
  const pageData = await getChannelMessages(channelId, currentPage);
  if (!pageData) {
    return { notFound: true };
  }
  
  return {
    props: {
      channel,
      pageData,
      currentPage,
    },
  };
};