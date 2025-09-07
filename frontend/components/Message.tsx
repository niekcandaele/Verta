import type { MessageWithExtras } from '@/lib/data';
import { generateAvatarUrl } from '@/lib/avatars';
import { processMentionsForMarkdown } from '@/lib/mentions';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import type { Channel, MessageEmojiReaction } from 'shared-types';
import { FiDownload } from 'react-icons/fi';
import MessageActions from './MessageActions';

interface MessageProps {
  message: MessageWithExtras;
  channels: Channel[];
  showChannel?: boolean;
  isHighlighted?: boolean;
  channelSlug?: string;
}

export default function Message({ 
  message, 
  channels,
  showChannel = true,
  isHighlighted = false,
  channelSlug
}: MessageProps) {

  const formatTimestamp = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return (
      <span title={date.toLocaleString()}>
        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    );
  };

  const preprocessContent = (content: string) => {
    let processed = content.replace(/\|\|(.+?)\|\|/g, '~~$1~~');
    processed = processMentionsForMarkdown(processed, channels);
    return processed;
  };

  const aggregatedReactions = message.reactions.reduce((acc, reaction) => {
    const existing = acc.find(r => r.emoji === reaction.emoji);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ ...reaction, count: 1 });
    }
    return acc;
  }, [] as (MessageEmojiReaction & { count: number })[]);

  return (
    <div className="group relative flex items-start gap-4 p-3 rounded-lg hover:bg-base-200/30 transition-all duration-200">
      <div className="avatar flex-shrink-0 mt-0.5">
        <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-base-content/10">
          <img 
            src={generateAvatarUrl(message.anonymizedAuthorId)} 
            alt={`Avatar for ${message.anonymizedAuthorId}`}
            className="transition-opacity group-hover:opacity-90"
          />
        </div>
      </div>
      
      <div className="flex-grow min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-base-content">User {message.anonymizedAuthorId.slice(0, 6)}</span>
          <time className="text-xs text-muted">
            {formatTimestamp(message.platformCreatedAt)}
          </time>
        </div>
        
        <div className="prose prose-sm max-w-none text-base-content/90 leading-relaxed" style={{ lineHeight: '1.6' }}>
          {message.content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeSanitize]}
              components={{
                code: ({ node, inline, className, children, ...props }: any) => {
                  if (inline) {
                    return <code className="px-1.5 py-0.5 bg-base-300/50 border border-base-content/10 rounded text-sm font-mono" {...props}>{children}</code>;
                  }
                  return <pre className="bg-base-300/50 border border-base-content/10 p-3 rounded-lg overflow-x-auto my-2"><code className="text-sm font-mono">{children}</code></pre>;
                },
                blockquote: ({ children }: any) => <blockquote className="border-l-4 border-primary/30 pl-4 my-2 text-base-content/80">{children}</blockquote>,
                a: ({ href, children }: any) => {
                  if (href?.startsWith('channel:')) {
                    return <span className="mention bg-info/15 text-info font-medium rounded px-1">#{children}</span>;
                  } else if (href?.startsWith('user:')) {
                    return <span className="mention bg-primary/15 text-primary font-medium rounded px-1">@{children}</span>;
                  } else if (href?.startsWith('role:')) {
                    return <span className="mention bg-secondary/15 text-secondary font-medium rounded px-1">@{children}</span>;
                  }
                  return <a href={href} className="link link-primary focus-ring" target="_blank" rel="noopener noreferrer">{children}</a>;
                },
                p: ({ children }: any) => <div className="my-1.5">{children}</div>,
                del: ({ children }: any) => <span className="bg-base-content text-base-content hover:bg-transparent transition-colors cursor-pointer rounded px-1">{children}</span>,
              }}
            >
              {preprocessContent(message.content)}
            </ReactMarkdown>
          ) : (
            <em className="text-muted italic">No content</em>
          )}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((attachment, index) => {
              const isImage = attachment.contentType?.startsWith('image/');
              const fileExt = attachment.filename.split('.').pop()?.toLowerCase() || '';
              const fileSize = Number(attachment.fileSize);
              const fileSizeFormatted = fileSize < 1024 
                ? `${fileSize} B`
                : fileSize < 1024 * 1024 
                ? `${(fileSize / 1024).toFixed(1)} KB`
                : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
              
              return (
                <div key={index} className="card glass glass-hover max-w-sm">
                  {isImage && attachment.url ? (
                    <figure className="relative">
                      <img 
                        src={attachment.url} 
                        alt={attachment.filename}
                        className="max-h-48 object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-base-100/80 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                    </figure>
                  ) : null}
                  <div className="card-body p-3">
                    <div className="flex items-start gap-3">
                      <div className="avatar placeholder">
                        <div className="bg-primary/10 text-primary rounded-lg w-10 h-10 flex items-center justify-center">
                          <FiDownload className="text-lg" />
                        </div>
                      </div>
                      <div className="flex-grow min-w-0">
                        <h4 className="font-medium text-sm truncate" title={attachment.filename}>
                          {attachment.filename}
                        </h4>
                        <p className="text-xs text-muted mt-0.5">
                          {fileExt.toUpperCase()} • {fileSizeFormatted}
                        </p>
                      </div>
                    </div>
                    <div className="card-actions justify-end mt-2">
                      <a 
                        href={attachment.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="btn btn-xs btn-primary btn-ghost hover:btn-primary focus-ring"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {aggregatedReactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {aggregatedReactions.map((reaction, index) => (
              <button 
                key={index} 
                className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-base-300/40 hover:bg-primary/10 border border-base-content/10 hover:border-primary/30 rounded-full transition-all duration-200 focus-ring"
                role="button"
                aria-label={`${reaction.emoji} reaction, ${reaction.count} ${reaction.count === 1 ? 'person' : 'people'}`}
              >
                <span className="text-base">{reaction.emoji}</span>
                <span className="text-xs font-medium text-base-content/80">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Message Actions - Appears on hover */}
      <MessageActions 
        message={message}
        channelSlug={channelSlug}
        className="absolute top-3 right-3"
      />
    </div>
  );
}