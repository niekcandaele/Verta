import type { ForumThreadsPage } from '@/lib/data';
import { FiMessageSquare, FiClock, FiUser, FiLock, FiArchive } from 'react-icons/fi';
import Link from 'next/link';
import { getChannelUrl } from '@/lib/navigation';

interface ForumChannelViewProps {
  threadData: ForumThreadsPage;
  currentPage: number;
}

export default function ForumChannelView({ threadData, currentPage }: ForumChannelViewProps) {
  return (
    <div className="animate-fade-slide-up">
      <div className="glass p-6 mb-6 rounded-2xl border border-base-content/10 bg-gradient-to-r from-primary/5 to-transparent">
        <h1 className="text-3xl font-bold text-base-content bg-gradient-to-r from-primary to-primary-content bg-clip-text text-transparent">
          {threadData.forumName}
        </h1>
        <p className="text-sm text-muted mt-2 flex items-center gap-2">
          <span className="badge badge-primary badge-outline badge-sm">Forum</span>
          <span>{threadData.totalThreads} Threads</span>
          {threadData.totalPages > 1 && (
            <span>• Page {currentPage} of {threadData.totalPages}</span>
          )}
        </p>
      </div>

      {/* Pagination for forums with multiple pages */}
      {threadData.totalPages > 1 && (
        <div className="flex justify-center mb-6">
          <div className="btn-group">
            {currentPage > 1 ? (
              <Link 
                href={`/channel/${threadData.forumId}/${currentPage - 1}`}
                className="btn btn-sm"
              >
                « Previous
              </Link>
            ) : (
              <button className="btn btn-sm btn-disabled">« Previous</button>
            )}
            
            <button className="btn btn-sm btn-active">Page {currentPage}</button>
            
            {currentPage < threadData.totalPages ? (
              <Link 
                href={`/channel/${threadData.forumId}/${currentPage + 1}`}
                className="btn btn-sm"
              >
                Next »
              </Link>
            ) : (
              <button className="btn btn-sm btn-disabled">Next »</button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {threadData.threads.map((thread) => (
          <div 
            key={thread.id} 
            className="card glass glass-hover group focus-ring"
          >
            <div className="card-body">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="card-title text-lg text-base-content line-clamp-2 group-hover:text-primary transition-colors">
                    {thread.name}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-muted mt-1">
                    {thread.archived && (
                      <span className="flex items-center gap-1">
                        <FiArchive className="opacity-60" />
                        Archived
                      </span>
                    )}
                    {thread.locked && (
                      <span className="flex items-center gap-1">
                        <FiLock className="opacity-60" />
                        Locked
                      </span>
                    )}
                    {thread.lastActivity && (
                      <span className="flex items-center gap-1">
                        <FiClock className="opacity-60" />
                        {formatRelativeTime(thread.lastActivity)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {thread.firstMessage && (
                <p className="text-sm text-base-content/70 line-clamp-3 leading-relaxed">
                  {thread.firstMessage.content}
                  {thread.firstMessage.content.length >= 200 && '...'}
                </p>
              )}
              
              <div className="divider my-3 opacity-10"></div>
              
              <div className="card-actions justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="badge badge-primary badge-outline gap-1.5">
                    <FiMessageSquare className="text-xs" />
                    <span className="font-medium">{thread.messageCount}</span>
                  </div>
                </div>
                {thread.slug ? (
                  <Link 
                    href={getChannelUrl(thread.slug)}
                    className="btn btn-primary btn-sm btn-ghost hover:btn-primary group-hover:btn-primary focus-ring"
                  >
                    View Thread
                  </Link>
                ) : (
                  <button className="btn btn-primary btn-sm btn-disabled" disabled>
                    View Thread
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {threadData.threads.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-base-300/50 mb-4">
            <FiMessageSquare className="text-2xl text-muted" />
          </div>
          <h3 className="text-lg font-medium text-base-content mb-2">No threads yet</h3>
          <p className="text-sm text-muted">This forum doesn't have any threads.</p>
        </div>
      )}
    </div>
  );
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