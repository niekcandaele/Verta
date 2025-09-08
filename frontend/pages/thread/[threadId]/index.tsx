import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { 
  getTenantMetadata,
  getChannel,
  getChannelMessages,
  type MessagePageData,
  type TenantMetadata
} from '@/lib/data';
import type { Channel } from 'shared-types';
import Layout from '@/components/Layout';
import ThreadChannelView from '@/components/channels/ThreadChannelView';

interface ThreadPageProps {
  metadata: TenantMetadata;
  thread: Channel;
  pageData: MessagePageData;
  currentPage: number;
}

export default function ThreadPage({ metadata, thread, pageData, currentPage }: ThreadPageProps) {
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
    <Layout metadata={metadata} currentChannelId={thread.id}>
      <div className="max-w-4xl mx-auto">
        {/* Thread Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{thread.name}</h1>
          <div className="flex items-center gap-4">
            <span className="badge badge-lg">Thread</span>
            {pageData && (
              <span className="text-sm text-base-content/60">
                {pageData.messages.length} messages
              </span>
            )}
          </div>
          
          {/* Parent forum link if available */}
          {thread.parentChannelId && (
            <div className="mt-2">
              <span className="text-sm text-base-content/60">
                From forum: {
                  metadata.channels.find(c => c.id === thread.parentChannelId)?.name || 'Unknown'
                }
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        {pageData && (
          <ThreadChannelView 
            messages={pageData.messages} 
            channelName={thread.name} 
            channels={metadata.channels} 
          />
        )}
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<ThreadPageProps> = async ({ params, query }) => {
  if (!params || typeof params.threadId !== 'string') {
    return { notFound: true };
  }
  
  const threadId = params.threadId;
  const currentPage = query.page ? parseInt(query.page as string, 10) : 1;
  
  if (isNaN(currentPage) || currentPage < 1) {
    return { notFound: true };
  }
  
  const [metadata, thread] = await Promise.all([
    getTenantMetadata(),
    getChannel(threadId),
  ]);
  
  if (!thread || thread.type !== 'thread') {
    return { notFound: true };
  }
  
  // Fetch messages for the thread
  const pageData = await getChannelMessages(threadId, currentPage);
  if (!pageData) {
    return { notFound: true };
  }
  
  return {
    props: {
      metadata,
      thread,
      pageData,
      currentPage,
    },
  };
};