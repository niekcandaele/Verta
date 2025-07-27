import type { MessageWithExtras } from '@/lib/data';
import Message from '../Message';

interface ForumChannelViewProps {
  messages: MessageWithExtras[];
  channelName: string;
}

interface ForumPost {
  rootMessage: MessageWithExtras;
  replies: MessageWithExtras[];
}

export default function ForumChannelView({ messages, channelName }: ForumChannelViewProps) {
  // Group messages into forum posts (root messages and their replies)
  const forumPosts = groupIntoForumPosts(messages);

  return (
    <div>
      <div className="mb-4 p-4 bg-base-200 rounded-lg">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span className="text-sm font-medium">Forum Channel</span>
        </div>
        <p className="text-sm text-base-content/60 mt-1">
          Messages are organized by forum posts with replies grouped together
        </p>
      </div>

      <div className="space-y-6">
        {forumPosts.map((post) => (
          <div key={post.rootMessage.id} className="card bg-base-100 shadow-lg">
            <div className="card-body">
              {/* Forum Post Header */}
              <div className="border-b border-base-300 pb-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">
                  {getPostTitle(post.rootMessage)}
                </h3>
                <Message message={post.rootMessage} />
              </div>

              {/* Replies */}
              {post.replies.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-base-content/70 mb-2">
                    {post.replies.length} {post.replies.length === 1 ? 'Reply' : 'Replies'}
                  </h4>
                  <div className="ml-4 space-y-2 border-l-2 border-base-300 pl-4">
                    {post.replies.map((reply) => (
                      <div key={reply.id}>
                        <Message message={reply} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupIntoForumPosts(messages: MessageWithExtras[]): ForumPost[] {
  const posts: ForumPost[] = [];
  const messageMap = new Map(messages.map(m => [m.id, m]));
  const processedIds = new Set<string>();

  // Find all root messages (those without replyToId)
  const rootMessages = messages.filter(m => !m.replyToId);

  for (const rootMessage of rootMessages) {
    if (processedIds.has(rootMessage.id)) continue;

    const replies: MessageWithExtras[] = [];
    
    // Find all direct replies to this root message
    for (const message of messages) {
      if (message.replyToId === rootMessage.id && !processedIds.has(message.id)) {
        replies.push(message);
        processedIds.add(message.id);
      }
    }

    posts.push({
      rootMessage,
      replies: replies.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    });
    processedIds.add(rootMessage.id);
  }

  // Handle any orphaned messages as their own posts
  for (const message of messages) {
    if (!processedIds.has(message.id)) {
      posts.push({
        rootMessage: message,
        replies: [],
      });
    }
  }

  return posts;
}

function getPostTitle(message: MessageWithExtras): string {
  // Try to extract title from metadata or content
  if (message.metadata && typeof message.metadata === 'object' && 'title' in message.metadata) {
    return String(message.metadata.title);
  }
  
  // Use first line of content as title, truncated
  const firstLine = message.content.split('\n')[0];
  if (firstLine.length > 100) {
    return firstLine.substring(0, 97) + '...';
  }
  
  return firstLine || 'Forum Post';
}