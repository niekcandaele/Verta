import { SearchResultItem } from 'shared-types';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface SearchResultsProps {
  results: SearchResultItem[];
  onClose: () => void;
}

export default function SearchResults({ results, onClose }: SearchResultsProps) {
  console.log('SearchResults component rendering with:', results);
  // Group results by type
  const goldenAnswers = results.filter(r => r.type === 'golden_answer');
  const messages = results.filter(r => r.type === 'message');
  console.log('Grouped results:', { goldenAnswers, messages });

  return (
    <div className="divide-y divide-base-content/10">
      {/* Golden Answers Section */}
      {goldenAnswers.length > 0 && (
        <div className="p-3">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-1 h-3 bg-primary rounded-full"></span>
            FAQ Answers
          </h3>
          {goldenAnswers.map((result, index) => (
            <div
              key={`golden-${index}`}
              className="mb-3 p-3 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer"
              onClick={onClose}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="badge badge-primary badge-sm">Golden Answer</div>
                <span className="text-xs text-base-content/60">
                  {Math.round(result.score * 100)}% match
                </span>
              </div>
              {result.metadata?.question && (
                <p className="text-sm font-medium text-primary mb-2">
                  {result.metadata.question}
                </p>
              )}
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                >
                  {result.content || ''}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages Section */}
      {messages.length > 0 && (
        <div className="p-3">
          <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-1 h-3 bg-secondary rounded-full"></span>
            Message Archive
          </h3>
          {messages.map((result, index) => {
            const channelId = result.metadata?.channel_id;
            const messageId = result.message_id;
            
            return (
              <Link
                key={`message-${index}`}
                href={channelId ? `/channel/${channelId}/1#${messageId}` : '#'}
                onClick={onClose}
              >
                <div className="mb-2 p-3 rounded-lg hover:bg-secondary/10 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="badge badge-secondary badge-sm">Message</div>
                      {result.metadata?.created_at && (
                        <span className="text-xs text-base-content/60">
                          {new Date(result.metadata.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-base-content/60">
                      {Math.round(result.score * 100)}%
                    </span>
                  </div>
                  <p className="text-sm text-base-content/80">
                    {result.excerpt}
                  </p>
                  <p className="text-xs text-secondary mt-1">
                    View in context →
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}