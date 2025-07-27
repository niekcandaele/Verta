import type { MessageWithExtras } from '@/lib/data';
import MessageList from '../MessageList';

interface TextChannelViewProps {
  messages: MessageWithExtras[];
  channelName: string;
}

export default function TextChannelView({ messages, channelName }: TextChannelViewProps) {
  return (
    <div>
      <div className="mb-4 p-4 bg-base-200 rounded-lg">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-sm font-medium">Text Channel</span>
        </div>
        <p className="text-sm text-base-content/60 mt-1">
          Messages are displayed in chronological order
        </p>
      </div>
      
      <MessageList messages={messages} />
    </div>
  );
}