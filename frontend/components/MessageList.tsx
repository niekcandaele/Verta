import type { MessageWithExtras } from '@/lib/data';
import Message from './Message';

interface MessageListProps {
  messages: MessageWithExtras[];
}

export default function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="card bg-base-200">
        <div className="card-body items-center text-center">
          <h2 className="card-title">No Messages</h2>
          <p>This channel doesn't have any messages on this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((message) => (
        <div key={message.id} className="border-b border-base-300 pb-4 last:border-0">
          <Message message={message} />
        </div>
      ))}
    </div>
  );
}