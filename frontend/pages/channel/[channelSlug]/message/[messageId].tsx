import { GetServerSideProps } from 'next';
import { 
  getTenantMetadata,
  getChannelBySlug,
  getMessageWithContext,
  type TenantMetadata,
  type MessageContext
} from '@/lib/data';
import { parseMessageId } from '@/lib/navigation';
import type { Channel } from 'shared-types';
import Layout from '@/components/Layout';
import MessageView from '@/components/MessageView';

interface MessagePermalinkPageProps {
  metadata: TenantMetadata;
  channel: Channel;
  context: MessageContext;
  targetMessageId: string;
}

export default function MessagePermalinkPage({ metadata, channel, context, targetMessageId }: MessagePermalinkPageProps) {
  // Combine all messages in chronological order
  const allMessages = [
    ...context.before,
    context.message,
    ...context.after
  ].sort((a, b) => new Date(a.platformCreatedAt).getTime() - new Date(b.platformCreatedAt).getTime());
  
  return (
    <Layout metadata={metadata} currentChannelId={channel.id}>
      <div className="max-w-4xl mx-auto">
        {/* Channel Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{channel.name}</h1>
          <div className="flex items-center gap-4">
            <span className="badge badge-lg">{channel.type}</span>
            <span className="text-sm text-base-content/60">
              Showing message in context ({allMessages.length} messages)
            </span>
          </div>
        </div>

        {/* Context notice */}
        <div className="alert alert-info mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div>
            <div className="text-sm">Showing {context.before.length} messages before and {context.after.length} messages after the linked message.</div>
          </div>
        </div>

        {/* Messages with highlighting for target */}
        <MessageView 
          messages={allMessages}
          channelSlug={channel.slug!}
          channels={metadata.channels}
          highlightMessageId={targetMessageId}
          enableUrlSync={false}
        />
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<MessagePermalinkPageProps> = async ({ params }) => {
  if (!params || typeof params.channelSlug !== 'string' || typeof params.messageId !== 'string') {
    return { notFound: true };
  }
  
  const channelSlug = params.channelSlug;
  const encodedMessageId = params.messageId;
  
  // Decode the base62 message ID
  const messageId = parseMessageId(encodedMessageId);
  if (!messageId) {
    return { notFound: true };
  }
  
  try {
    const [metadata, channel, context] = await Promise.all([
      getTenantMetadata(),
      getChannelBySlug(channelSlug),
      getMessageWithContext(encodedMessageId, 50, 50)
    ]);
    
    if (!channel || !context) {
      return { notFound: true };
    }
    
    // Verify the message belongs to the channel
    if (context.channel.id !== channel.id) {
      return { notFound: true };
    }
    
    return {
      props: {
        metadata,
        channel,
        context,
        targetMessageId: messageId,
      },
    };
  } catch (error) {
    console.error('Error loading message permalink:', error);
    return { notFound: true };
  }
};