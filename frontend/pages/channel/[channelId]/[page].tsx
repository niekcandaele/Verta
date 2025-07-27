import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  getTenantMetadata,
  getChannels, 
  getChannel,
  getChannelMessages, 
  getChannelPageNumbers,
  type MessagePageData,
  type TenantMetadata 
} from '@/lib/data';
import type { Channel } from 'shared-types';
import Layout from '@/components/Layout';
import TextChannelView from '@/components/channels/TextChannelView';
import ForumChannelView from '@/components/channels/ForumChannelView';
import ThreadChannelView from '@/components/channels/ThreadChannelView';

interface ChannelPageProps {
  metadata: TenantMetadata;
  channel: Channel;
  pageData: MessagePageData;
  currentPage: number;
}

export default function ChannelPage({ metadata, channel, pageData, currentPage }: ChannelPageProps) {
  const router = useRouter();
  
  if (router.isFallback) {
    return (
      <Layout metadata={metadata}>
        <div className="flex items-center justify-center h-64">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout metadata={metadata} currentChannelId={channel.id}>
      <div className="max-w-4xl mx-auto">
        {/* Channel Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{channel.name}</h1>
          <div className="flex items-center gap-4">
            <span className="badge badge-lg">{channel.type}</span>
            <span className="text-sm text-base-content/60">
              Page {currentPage} of {pageData.totalPages}
            </span>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mb-6">
          <div className="btn-group">
            {currentPage > 1 ? (
              <Link 
                href={`/channel/${channel.id}/${currentPage - 1}`}
                className="btn btn-sm"
              >
                « Previous
              </Link>
            ) : (
              <button className="btn btn-sm btn-disabled">« Previous</button>
            )}
            
            <button className="btn btn-sm btn-active">Page {currentPage}</button>
            
            {currentPage < pageData.totalPages ? (
              <Link 
                href={`/channel/${channel.id}/${currentPage + 1}`}
                className="btn btn-sm"
              >
                Next »
              </Link>
            ) : (
              <button className="btn btn-sm btn-disabled">Next »</button>
            )}
          </div>
          
          <div className="text-sm text-base-content/60">
            {pageData.messages.length} messages on this page
          </div>
        </div>

        {/* Messages - Render based on channel type */}
        {channel.type === 'text' && (
          <TextChannelView messages={pageData.messages} channelName={channel.name} />
        )}
        {channel.type === 'forum' && (
          <ForumChannelView messages={pageData.messages} channelName={channel.name} />
        )}
        {channel.type === 'thread' && (
          <ThreadChannelView messages={pageData.messages} channelName={channel.name} />
        )}
      </div>
    </Layout>
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
  
  const [metadata, channel] = await Promise.all([
    getTenantMetadata(),
    getChannel(channelId),
  ]);
  
  if (!channel) {
    return { notFound: true };
  }
  
  const pageData = await getChannelMessages(channelId, currentPage);
  if (!pageData) {
    return { notFound: true };
  }
  
  return {
    props: {
      metadata,
      channel,
      pageData,
      currentPage,
    },
  };
};