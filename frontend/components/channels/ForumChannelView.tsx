import type { MessageWithExtras } from '@/lib/data';
import Message from '../Message';
import type { Channel } from 'shared-types';
import { FiMessageSquare, FiClock, FiUser } from 'react-icons/fi';
import { generateAvatarUrl } from '@/lib/avatars';

interface ForumChannelViewProps {
  messages: MessageWithExtras[];
  channelName: string;
  channels: Channel[];
}

interface ForumPost {
  rootMessage: MessageWithExtras;
  replyCount: number;
  lastReplyAt?: Date;
}

export default function ForumChannelView({ messages, channelName, channels }: ForumChannelViewProps) {
  const forumPosts = groupIntoForumPosts(messages);

  return (
    <div className="animate-fade-slide-up">
      <div className="glass p-6 mb-6 rounded-2xl border border-base-content/10 bg-gradient-to-r from-primary/5 to-transparent">
        <h1 className="text-3xl font-bold text-base-content bg-gradient-to-r from-primary to-primary-content bg-clip-text text-transparent">
          {channelName}
        </h1>
        <p className="text-sm text-muted mt-2 flex items-center gap-2">
          <span className="badge badge-primary badge-outline badge-sm">Forum</span>
          <span>{forumPosts.length} Posts</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {forumPosts.map((post) => (
          <div 
            key={post.rootMessage.id} 
            className="card glass glass-hover group focus-ring"
          >
            <div className="card-body">
              <div className="flex items-start gap-3 mb-3">
                <div className="avatar">
                  <div className="w-8 h-8 rounded-full ring-2 ring-base-content/10 group-hover:ring-primary/30 transition-all">
                    <img 
                      src={generateAvatarUrl(post.rootMessage.anonymizedAuthorId)} 
                      alt={`Avatar for ${post.rootMessage.anonymizedAuthorId}`}
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="card-title text-lg text-base-content line-clamp-2 group-hover:text-primary transition-colors">
                    {getPostTitle(post.rootMessage)}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-muted mt-1">
                    <span className="flex items-center gap-1">
                      <FiUser className="opacity-60" />
                      User {post.rootMessage.anonymizedAuthorId.slice(0, 6)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FiClock className="opacity-60" />
                      {formatRelativeTime(post.rootMessage.platformCreatedAt)}
                    </span>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-base-content/70 line-clamp-3 leading-relaxed">
                {post.rootMessage.content.substring(0, 150)}
                {post.rootMessage.content.length > 150 && '...'}
              </p>
              
              <div className="divider my-3 opacity-10"></div>
              
              <div className="card-actions justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="badge badge-primary badge-outline gap-1.5">
                    <FiMessageSquare className="text-xs" />
                    <span className="font-medium">{post.replyCount}</span>
                  </div>
                  {post.lastReplyAt && (
                    <span className="text-xs text-muted">
                      Last: {formatRelativeTime(post.lastReplyAt)}
                    </span>
                  )}
                </div>
                <button className="btn btn-primary btn-sm btn-ghost hover:btn-primary group-hover:btn-primary focus-ring">
                  View Post
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {forumPosts.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-base-300/50 mb-4">
            <FiMessageSquare className="text-2xl text-muted" />
          </div>
          <h3 className="text-lg font-medium text-base-content mb-2">No posts yet</h3>
          <p className="text-sm text-muted">This forum doesn't have any posts.</p>
        </div>
      )}
    </div>
  );
}

function groupIntoForumPosts(messages: MessageWithExtras[]): ForumPost[] {
  const posts: { [key: string]: ForumPost } = {};
  const messageMap = new Map(messages.map(m => [m.id, m]));

  // First, initialize all root posts
  for (const message of messages) {
    if (!message.replyToId) {
      posts[message.id] = { rootMessage: message, replyCount: 0, lastReplyAt: undefined };
    }
  }

  // Then, count replies and track last reply time
  for (const message of messages) {
    if (message.replyToId) {
      const rootMessage = findRootMessage(message, messageMap);
      if (rootMessage && posts[rootMessage.id]) {
        posts[rootMessage.id].replyCount++;
        const replyDate = new Date(message.platformCreatedAt);
        if (!posts[rootMessage.id].lastReplyAt || replyDate > posts[rootMessage.id].lastReplyAt!) {
          posts[rootMessage.id].lastReplyAt = replyDate;
        }
      }
    }
  }

  return Object.values(posts).sort((a, b) => 
    new Date(b.rootMessage.platformCreatedAt).getTime() - new Date(a.rootMessage.platformCreatedAt).getTime()
  );
}

function findRootMessage(message: MessageWithExtras, messageMap: Map<string, MessageWithExtras>): MessageWithExtras | null {
  let current = message;
  while (current.replyToId) {
    const parent = messageMap.get(current.replyToId);
    if (!parent) {
      return null; // Orphaned reply chain
    }
    current = parent;
  }
  return current;
}

function getPostTitle(message: MessageWithExtras): string {
  if (message.metadata && typeof message.metadata === 'object' && 'title' in message.metadata) {
    return String(message.metadata.title);
  }
  const firstLine = message.content.split('\n')[0];
  return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine || 'Forum Post';
}

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}