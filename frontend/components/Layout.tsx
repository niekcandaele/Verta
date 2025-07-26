import { ReactNode } from 'react';
import Link from 'next/link';
import { TenantMetadata } from '@/lib/data';
import ChannelList from './ChannelList';

interface LayoutProps {
  children: ReactNode;
  metadata: TenantMetadata;
  currentChannelId?: string;
}

export default function Layout({ children, metadata, currentChannelId }: LayoutProps) {
  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="navbar bg-base-200 shadow-lg">
        <div className="flex-1">
          <Link href="/" className="btn btn-ghost text-xl">
            {metadata.tenant.name} Archive
          </Link>
        </div>
        <div className="flex-none">
          <div className="badge badge-outline">
            {metadata.channels.length} channels
          </div>
          <div className="badge badge-outline ml-2">
            {metadata.tenant.platform}
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar with Channel List */}
        <ChannelList 
          channels={metadata.channels} 
          currentChannelId={currentChannelId} 
        />

        {/* Main Content */}
        <div className="flex-1 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}