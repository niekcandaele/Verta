import type { MessageWithExtras } from '@/lib/data';
import { generateAvatarUrl } from '@/lib/avatars';

interface MessageProps {
  message: MessageWithExtras;
}

export default function Message({ message }: MessageProps) {
  const formatTimestamp = (timestamp: Date | string) => {
    return new Date(timestamp).toLocaleString();
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
        {message.content || <em className="opacity-50">No content</em>}
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