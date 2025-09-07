import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { 
  getTenantMetadata,
  getChannelBySlug,
  getChannelMessagesBySlug,
  type MessagePageData,
  type TenantMetadata
} from '@/lib/data';
import type { Channel } from 'shared-types';
import Layout from '@/components/Layout';
import MessageView from '@/components/MessageView';
import { getChannelUrl } from '@/lib/navigation';

interface TimestampPageProps {
  metadata: TenantMetadata;
  channel: Channel;
  pageData: MessagePageData | null;
  timestamp: string;
  targetMessageId?: string;
}

export default function TimestampPage({ 
  metadata, 
  channel, 
  pageData,
  timestamp,
  targetMessageId
}: TimestampPageProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  if (router.isFallback) {
    return (
      <Layout metadata={metadata}>
        <div className="flex items-center justify-center h-64">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </Layout>
    );
  }
  
  const handleLoadMore = async () => {
    setIsLoading(true);
    // TODO: Implement pagination for loading more messages
    setIsLoading(false);
  };
  
  const parsedTimestamp = new Date(decodeURIComponent(timestamp));
  
  return (
    <Layout metadata={metadata} currentChannelId={channel.id}>
      <div className="max-w-4xl mx-auto">
        {/* Channel Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{channel.name}</h1>
          <div className="flex items-center gap-4">
            <span className="badge badge-lg">
              {channel.type === 'forum' ? 'Forum' : 
               channel.type === 'thread' ? 'Thread' : 
               'Channel'}
            </span>
            {pageData && (
              <span className="text-sm text-base-content/60">
                {pageData.messages.length} messages around {parsedTimestamp.toLocaleDateString()}
              </span>
            )}
          </div>
          
          {/* Navigation back to latest */}
          <div className="mt-4">
            <a 
              href={getChannelUrl(channel.slug!)}
              className="btn btn-sm btn-outline btn-primary"
            >
              ← Back to Latest Messages
            </a>
          </div>
        </div>

        {/* Timestamp Notice */}
        <div className="alert alert-info mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-bold">Historical View</h3>
            <div className="text-sm">
              Showing messages from around {parsedTimestamp.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Messages */}
        {pageData ? (
          <MessageView 
            messages={pageData.messages}
            channelSlug={channel.slug!}
            channels={metadata.channels}
            highlightMessageId={targetMessageId}
            showLoadMore={true}
            onLoadMore={handleLoadMore}
            isLoading={isLoading}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-base-content/60">No messages found around this time</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<TimestampPageProps> = async ({ params, query }) => {
  if (!params || typeof params.channelSlug !== 'string' || typeof params.timestamp !== 'string') {
    return { notFound: true };
  }
  
  const channelSlug = params.channelSlug;
  const timestamp = params.timestamp;
  
  // Parse and validate timestamp
  let parsedDate: Date;
  try {
    parsedDate = new Date(decodeURIComponent(timestamp));
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date');
    }
  } catch (e) {
    return { notFound: true };
  }
  
  const [metadata, channel] = await Promise.all([
    getTenantMetadata(),
    getChannelBySlug(channelSlug),
  ]);
  
  if (!channel) {
    return { notFound: true };
  }
  
  // TODO: Implement timestamp-based message fetching
  // For now, fetch the channel's messages as a placeholder
  const pageData = await getChannelMessagesBySlug(channelSlug, 1);
  
  // Find the closest message to the timestamp
  let targetMessageId: string | undefined;
  if (pageData && pageData.messages.length > 0) {
    // Find message closest to target timestamp
    let closestMessage = pageData.messages[0];
    let closestDiff = Math.abs(new Date(closestMessage.platformCreatedAt).getTime() - parsedDate.getTime());
    
    for (const message of pageData.messages) {
      const diff = Math.abs(new Date(message.platformCreatedAt).getTime() - parsedDate.getTime());
      if (diff < closestDiff) {
        closestDiff = diff;
        closestMessage = message;
      }
    }
    
    targetMessageId = closestMessage.id;
  }
  
  return {
    props: {
      metadata,
      channel,
      pageData,
      timestamp,
      targetMessageId,
    },
  };
};