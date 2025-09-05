import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { TenantMetadata } from '@/lib/data';
import { applyBranding, applySavedContrastPreference } from '@/lib/theme';
import ChannelList from './ChannelList';
import { FiMenu, FiX } from 'react-icons/fi'; // Using react-icons for menu icons

interface LayoutProps {
  children: ReactNode;
  metadata: TenantMetadata;
  currentChannelId?: string;
  syncStatus?: {
    lastSyncAt: Date;
    isActive: boolean;
  };
}

export default function Layout({ children, metadata, currentChannelId, syncStatus }: LayoutProps) {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    applyBranding(metadata.branding);
    applySavedContrastPreference();
    
    // Add scroll listener for navbar shadow (now listening to main content area)
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      setHasScrolled(target.scrollTop > 10);
    };
    
    // Find the scrollable content area after component mounts
    const scrollableElement = document.querySelector('.overflow-y-auto');
    if (scrollableElement) {
      scrollableElement.addEventListener('scroll', handleScroll);
      return () => scrollableElement.removeEventListener('scroll', handleScroll);
    }
  }, [metadata.branding]);

  return (
    <div className="h-screen overflow-hidden bg-base-100 text-base-content relative">
      {/* Purple Radial Glow Background */}
      <div className="fixed inset-0 z-0 pointer-events-none radial-glow-purple" />
      
      <header className={`fixed top-0 left-0 right-0 h-16 z-30 glass glass-hover border-b border-primary/20 ${hasScrolled ? 'shadow-lg shadow-primary/10' : ''} transition-all duration-300`}>
        <div className="navbar h-full px-4 lg:px-6">
          <div className="navbar-start">
            <button 
              className="btn btn-ghost btn-circle lg:hidden focus-ring hover:bg-primary/10" 
              onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Open menu"
            >
              {isMobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
            </button>
            <Link href="/" className="btn btn-ghost text-xl normal-case focus-ring hover:bg-primary/10 hover:text-primary">
              <span className="font-bold text-gradient-purple text-2xl">{metadata.tenant.name}</span>
              <span className="ml-2 text-base-content/90">Archive</span>
            </Link>
          </div>
          
          {/* Stats Display and FAQ Link - Hidden on mobile */}
          <div className="navbar-center hidden lg:flex gap-2 items-center">
            <div className="badge badge-primary badge-outline">
              <span className="text-primary-content/80 mr-1">Channels:</span>
              <span className="font-semibold">{metadata.channels.length}</span>
            </div>
            <div className="badge badge-primary badge-outline">
              <span className="text-primary-content/80 mr-1">Platform:</span>
              <span className="capitalize font-semibold">{metadata.tenant.platform}</span>
            </div>
            <Link 
              href="/faq" 
              className="btn btn-sm btn-ghost text-primary hover:bg-primary/10 ml-2"
            >
              FAQ
            </Link>
          </div>
          
          <div className="navbar-end gap-2">
            {syncStatus && (
              <div className={`badge badge-primary badge-outline ${syncStatus.isActive ? 'animate-pulse' : ''}`}>
                {syncStatus.isActive ? 'Syncing' : 'Synced'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div className={`fixed inset-0 z-20 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:hidden`}>
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        />
        <div className="relative w-80 h-full bg-panel glass-strong border-r border-primary/20">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-primary flex items-center gap-2">
                <span className="w-1 h-4 bg-primary rounded-full"></span>
                Channels
              </h2>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-ghost btn-circle btn-sm focus-ring hover:bg-primary/10"
                aria-label="Close menu"
              >
                <FiX size={16} />
              </button>
            </div>
            <div className="mb-4">
              <Link 
                href="/faq" 
                className="btn btn-block btn-primary btn-outline"
                onClick={() => setMobileMenuOpen(false)}
              >
                View FAQ
              </Link>
            </div>
            <ChannelList channels={metadata.channels} currentChannelId={currentChannelId} />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-16 bottom-0 w-64 overflow-y-auto bg-panel border-r border-primary/10 z-10">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-primary rounded-full"></span>
            Channels
          </h2>
          <ChannelList channels={metadata.channels} currentChannelId={currentChannelId} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="pt-16 lg:pl-64 h-screen flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <main className="p-4 sm:p-6 lg:p-8 animate-fade-slide-up">
            {children}
          </main>
          
          {/* Footer */}
          <footer className="border-t border-base-content/10 p-4 mt-8">
            <div className="text-center text-sm text-muted">
              <p>
                Archive generated on {new Date(metadata.generatedAt).toLocaleDateString()}
                {metadata.dataVersion && ` • v${metadata.dataVersion}`}
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}