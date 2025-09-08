import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  getTenantMetadata,
  getChannelBySlug,
  getChannelMessagesBySlug, 
  getForumThreadsPage,
  type MessagePageData,
  type TenantMetadata,
  type ForumThreadsPage
} from '@/lib/data';
import { getChannelUrl } from '@/lib/navigation';
import type { Channel } from 'shared-types';
import Layout from '@/components/Layout';
import TextChannelView from '@/components/channels/TextChannelView';
import ForumChannelView from '@/components/channels/ForumChannelView';
import ThreadChannelView from '@/components/channels/ThreadChannelView';
import MessageView from '@/components/MessageView';

interface ChannelPageProps {
  metadata: TenantMetadata;
  channel: Channel;
  pageData?: MessagePageData;
  currentPage: number;
  forumThreadsData?: ForumThreadsPage;
}

export default function ChannelPage({ metadata, channel, pageData, currentPage, forumThreadsData }: ChannelPageProps) {
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
        {/* Forum channels don't need pagination or message count */}
        {channel.type !== 'forum' && (
          <>
            {/* Channel Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2">{channel.name}</h1>
              <div className="flex items-center gap-4">
                <span className="badge badge-lg">{channel.type}</span>
                {pageData && (
                  <span className="text-sm text-base-content/60">
                    Page {currentPage} of {pageData.totalPages}
                  </span>
                )}
              </div>
            </div>

            {/* Pagination */}
            {pageData && pageData.totalPages > 1 && (
              <div className="flex justify-between items-center mb-6">
                <div className="btn-group">
                  {currentPage > 1 ? (
                    <Link 
                      href={`${getChannelUrl(channel.slug!)}?page=${currentPage - 1}`}
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
                      href={`${getChannelUrl(channel.slug!)}?page=${currentPage + 1}`}
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
            )}
          </>
        )}

        {/* Messages - Render based on channel type */}
        {channel.type === 'text' && pageData && (
          <MessageView 
            messages={pageData.messages}
            channelSlug={channel.slug!}
            channels={metadata.channels}
            enableUrlSync={true}
          />
        )}
        {channel.type === 'forum' && forumThreadsData && (
          <ForumChannelView threadData={forumThreadsData} currentPage={currentPage} />
        )}
        {channel.type === 'thread' && pageData && (
          <MessageView
            messages={pageData.messages}
            channelSlug={channel.slug!}
            channels={metadata.channels}
            enableUrlSync={true}
          />
        )}
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<ChannelPageProps> = async ({ params, query }) => {
  if (!params || typeof params.channelSlug !== 'string') {
    return { notFound: true };
  }
  
  const channelSlug = params.channelSlug;
  const currentPage = query.page ? parseInt(query.page as string, 10) : 1;
  
  if (isNaN(currentPage) || currentPage < 1) {
    return { notFound: true };
  }
  
  const [metadata, channel] = await Promise.all([
    getTenantMetadata(),
    getChannelBySlug(channelSlug),
  ]);
  
  if (!channel) {
    return { notFound: true };
  }
  
  // For forum channels, fetch thread summaries page
  if (channel.type === 'forum') {
    const forumThreadsData = await getForumThreadsPage(channel.id, currentPage);
    
    if (!forumThreadsData) {
      return { notFound: true };
    }
    
    return {
      props: {
        metadata,
        channel,
        currentPage,
        forumThreadsData,
      },
    };
  }
  
  // For non-forum channels, fetch messages as usual
  const pageData = await getChannelMessagesBySlug(channelSlug, currentPage);
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