import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FiLogOut, FiList, FiHome } from 'react-icons/fi';
import ErrorBoundary from '../ErrorBoundary';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();

  const handleLogout = () => {
    // Clear any stored auth and redirect
    // Basic auth will be cleared when browser session ends
    window.location.href = '/';
  };

  const isActive = (path: string) => {
    return router.pathname === path ? 'bg-primary/20' : '';
  };

  return (
    <div className="min-h-screen bg-base-300">
      {/* Admin Header */}
      <header className="bg-base-100 border-b border-base-content/10">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-primary">Admin Panel</h1>
              <nav className="flex space-x-2">
                <Link 
                  href="/admin"
                  className={`flex items-center px-4 py-2 rounded-lg hover:bg-base-300 transition-colors ${isActive('/admin')}`}
                >
                  <FiList className="mr-2" />
                  Clusters
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <Link 
                href="/"
                className="flex items-center px-4 py-2 rounded-lg hover:bg-base-300 transition-colors"
              >
                <FiHome className="mr-2" />
                Main Site
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center px-4 py-2 rounded-lg hover:bg-error/20 text-error transition-colors"
              >
                <FiLogOut className="mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}