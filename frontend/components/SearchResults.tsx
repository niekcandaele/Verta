import { SearchResultItem } from 'shared-types';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { getMessageUrl, encodeMessageId } from '@/lib/navigation';

interface SearchResultsProps {
  results: SearchResultItem[];
  onClose: () => void;
}

export default function SearchResults({ results, onClose }: SearchResultsProps) {
  console.log('SearchResults component rendering with:', results);
  // Group results by type
  const goldenAnswers = results.filter(r => r.type === 'golden_answer');
  const knowledgeBase = results.filter(r => r.type === 'knowledge_base');
  const messages = results.filter(r => r.type === 'message');
  console.log('Grouped results:', { goldenAnswers, knowledgeBase, messages });

  return (
    <div className="divide-y divide-base-content/10">
      {/* Golden Answers Section */}
      {goldenAnswers.length > 0 && (
        <div className="p-3">
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-1 h-3 bg-primary rounded-full"></span>
            FAQ Answers
          </h3>
          {goldenAnswers.map((result, index) => {
            // Use the cluster_id from metadata as the FAQ item ID for linking
            const faqItemId = result.metadata?.cluster_id;
            const href = faqItemId ? `/faq#${faqItemId}` : '/faq';
            
            return (
              <Link
                key={`golden-${index}`}
                href={href}
                onClick={onClose}
              >
                <div className="mb-3 p-3 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer">
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
                  <p className="text-xs text-primary mt-2">
                    View in FAQ →
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Knowledge Base Section */}
      {knowledgeBase.length > 0 && (
        <div className="p-3">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-1 h-3 bg-accent rounded-full"></span>
            Documentation
          </h3>
          {knowledgeBase.map((result, index) => {
            const sourceUrl = result.metadata?.source_url;
            const title = result.metadata?.title;
            const kbName = result.metadata?.kb_name;
            
            const content = (
              <div className="mb-3 p-3 bg-accent/5 rounded-lg hover:bg-accent/10 transition-colors cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="badge badge-accent badge-sm">Documentation</div>
                    {kbName && (
                      <span className="text-xs text-base-content/60">{kbName}</span>
                    )}
                  </div>
                  <span className="text-xs text-base-content/60">
                    {Math.round(result.score * 100)}% match
                  </span>
                </div>
                {title && (
                  <p className="text-sm font-medium text-accent mb-2">
                    {title}
                  </p>
                )}
                <p className="text-sm text-base-content/80">
                  {result.excerpt || result.content?.substring(0, 200) + '...'}
                </p>
                {sourceUrl && (
                  <p className="text-xs text-accent mt-2">
                    View source →
                  </p>
                )}
              </div>
            );
            
            return sourceUrl ? (
              <a
                key={`kb-${index}`}
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
              >
                {content}
              </a>
            ) : (
              <div key={`kb-${index}`}>
                {content}
              </div>
            );
          })}
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
            const channelSlug = result.metadata?.channel_slug;
            const platformMessageId = result.metadata?.platform_message_id;
            const channelId = result.metadata?.channel_id;
            
            // Use permalink format if we have slug and platform message ID
            const href = channelSlug && platformMessageId 
              ? getMessageUrl(channelSlug, platformMessageId)
              : null;
            
            const content = (
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
                {href && (
                  <p className="text-xs text-secondary mt-1">
                    View in context →
                  </p>
                )}
              </div>
            );
            
            return href ? (
              <Link
                key={`message-${index}`}
                href={href}
                onClick={onClose}
              >
                {content}
              </Link>
            ) : (
              <div key={`message-${index}`} className="opacity-75">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}