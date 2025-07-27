import Link from 'next/link';
import type { Channel } from 'shared-types';

interface ChannelListProps {
  channels: Channel[];
  currentChannelId?: string;
}

export default function ChannelList({ channels, currentChannelId }: ChannelListProps) {
  // Group channels by type
  const channelsByType = channels.reduce((acc, channel) => {
    if (!acc[channel.type]) {
      acc[channel.type] = [];
    }
    acc[channel.type].push(channel);
    return acc;
  }, {} as Record<string, Channel[]>);

  // Sort channel types for consistent display
  const sortedTypes = Object.keys(channelsByType).sort();

  return (
    <div className="w-64 min-h-screen bg-base-200 p-4">
      <h2 className="text-lg font-semibold mb-4">Channels</h2>
      
      {sortedTypes.map((type) => (
        <div key={type} className="mb-6">
          <h3 className="text-sm font-medium text-base-content/60 uppercase mb-2">
            {type} Channels ({channelsByType[type].length})
          </h3>
          <ul className="menu bg-base-100 rounded-box p-2">
            {channelsByType[type].map((channel) => (
              <li key={channel.id}>
                <Link 
                  href={`/channel/${channel.id}/1`}
                  className={`${currentChannelId === channel.id ? 'active' : ''} group`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate flex-1">{channel.name}</span>
                    <span className="badge badge-xs opacity-60 group-hover:opacity-100">
                      {type}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      
      <div className="mt-8 p-4 bg-base-100 rounded-box">
        <div className="stat p-0">
          <div className="stat-title text-xs">Total Channels</div>
          <div className="stat-value text-2xl">{channels.length}</div>
        </div>
      </div>
    </div>
  );
}