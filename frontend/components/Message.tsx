import type { MessageWithExtras } from '@/lib/data';
import { generateAvatarUrl } from '@/lib/avatars';
import { processMentionsForMarkdown } from '@/lib/mentions';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import type { Channel } from 'shared-types';

interface MessageProps {
  message: MessageWithExtras;
  channels: Channel[];
}

export default function Message({ message, channels }: MessageProps) {

  const formatTimestamp = (timestamp: Date | string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Preprocess Discord-style spoilers and mentions
  const preprocessContent = (content: string) => {
    // Convert Discord spoilers ||text|| to strikethrough ~~text~~ for markdown
    let processed = content.replace(/\|\|(.+?)\|\|/g, '~~$1~~');
    
    // Process mentions to markdown links
    processed = processMentionsForMarkdown(processed, channels);
    
    return processed;
  };

  return (
    <div className="chat chat-start mb-4">
      <div className="chat-image avatar">
        <div className="w-10 rounded-full">
          <img 
            src={generateAvatarUrl(message.anonymizedAuthorId)} 
            alt={`Avatar for ${message.anonymizedAuthorId}`}
          />
        </div>
      </div>
      
      <div className="chat-header mb-1">
        <span className="font-medium">User {message.anonymizedAuthorId.slice(0, 8)}</span>
        <time className="text-xs opacity-50 ml-2">
          {formatTimestamp(message.platformCreatedAt)}
        </time>
      </div>
      
      <div className="chat-bubble chat-bubble-primary">
        {message.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeSanitize]}
            components={{
              // Custom renderers for Discord-like styling
              code: ({ node, inline, className, children, ...props }: any) => {
                if (inline) {
                  return (
                    <code className="px-1 py-0.5 bg-base-300 rounded text-sm" {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <pre className="bg-base-300 p-2 rounded-lg overflow-x-auto my-2">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              },
              blockquote: ({ children }: any) => (
                <blockquote className="border-l-4 border-base-300 pl-4 my-2 opacity-80">
                  {children}
                </blockquote>
              ),
              a: ({ href, children }: any) => {
                // Handle mention links
                if (href?.startsWith('channel:')) {
                  const channelId = href.substring(8);
                  const channel = channels.find(c => c.platformChannelId === channelId);
                  return (
                    <span className="mention mention-channel">
                      {children}
                    </span>
                  );
                } else if (href?.startsWith('user:')) {
                  const userId = href.substring(5);
                  return (
                    <span className="mention mention-user">
                      <img 
                        src={generateAvatarUrl(userId)} 
                        alt="" 
                        className="w-5 h-5 rounded-full inline-block mr-1 align-middle"
                      />
                      {children}
                    </span>
                  );
                } else if (href?.startsWith('role:')) {
                  return (
                    <span className="mention mention-role">
                      {children}
                    </span>
                  );
                }
                // Regular links
                return (
                  <a href={href} className="link link-primary" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
              p: ({ children }: any) => <p className="my-1">{children}</p>,
              ul: ({ children }: any) => <ul className="list-disc list-inside my-2">{children}</ul>,
              ol: ({ children }: any) => <ol className="list-decimal list-inside my-2">{children}</ol>,
              // Handle Discord-style spoilers (||text||)
              del: ({ children }: any) => (
                <span className="bg-base-content text-base-content hover:bg-transparent transition-colors cursor-pointer rounded px-1">
                  {children}
                </span>
              ),
            }}
          >
            {preprocessContent(message.content)}
          </ReactMarkdown>
        ) : (
          <em className="opacity-50">No content</em>
        )}
      </div>
      
      {/* Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="chat-footer mt-2">
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((attachment, index) => (
              <div key={index} className="badge badge-outline gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {attachment.filename}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Reactions */}
      {message.reactions && message.reactions.length > 0 && (
        <div className="chat-footer mt-2">
          <div className="flex flex-wrap gap-1">
            {message.reactions.map((reaction, index) => (
              <div key={index} className="badge badge-sm">
                {reaction.emoji} 1
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}