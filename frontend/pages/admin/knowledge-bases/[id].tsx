import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminApi, KnowledgeBaseWithStats, CrawlJob } from '@/lib/admin/api';
import { 
  FiArrowLeft, 
  FiEdit, 
  FiRefreshCw, 
  FiTrash2,
  FiCheck,
  FiX,
  FiClock,
  FiLoader,
  FiExternalLink,
  FiDatabase,
  FiActivity,
  FiAlertCircle,
  FiInfo
} from 'react-icons/fi';

export default function KnowledgeBaseDetail() {
  const router = useRouter();
  const { id } = router.query;
  
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseWithStats | null>(null);
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sitemap_url: ''
  });

  // Polling for status updates when crawling
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchKnowledgeBase();
      fetchCrawlStatus();
    }
  }, [id]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (polling && id && typeof id === 'string') {
      interval = setInterval(() => {
        fetchCrawlStatus();
        fetchKnowledgeBase();
      }, 3000); // Poll every 3 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [polling, id]);

  const fetchKnowledgeBase = async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getKnowledgeBase(id);
      setKnowledgeBase(data);
      setFormData({
        name: data.name,
        description: data.description || '',
        sitemap_url: data.sitemap_url
      });

      // Always stop polling after fetch
      setPolling(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch knowledge base');
      console.error('Error fetching knowledge base:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCrawlStatus = async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      const data = await adminApi.getKnowledgeBaseCrawlStatus(id);
      setCrawlJob(data);
    } catch (err) {
      // Don't show error for crawl status - it might not exist
      setCrawlJob(null);
    }
  };

  const handleUpdate = async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      setActionLoading('update');
      setError(null);
      
      await adminApi.updateKnowledgeBase(id, formData);
      setShowEditModal(false);
      await fetchKnowledgeBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update knowledge base');
      console.error('Error updating knowledge base:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      setActionLoading('delete');
      setError(null);
      
      await adminApi.deleteKnowledgeBase(id);
      router.push('/admin/knowledge-bases');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete knowledge base');
      console.error('Error deleting knowledge base:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCrawl = async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      setActionLoading('crawl');
      setError(null);
      
      await adminApi.crawlKnowledgeBase(id);
      setPolling(true);
      await fetchKnowledgeBase();
      await fetchCrawlStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start crawl');
      console.error('Error starting crawl:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCrawlStatus = (lastCrawlEvent: string | null) => {
    if (!lastCrawlEvent) {
      return { icon: <FiClock className="text-warning" />, text: 'Never crawled', badge: 'badge-warning' };
    }
    const lastCrawled = new Date(lastCrawlEvent);
    const daysSince = (Date.now() - lastCrawled.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) {
      return { icon: <FiCheck className="text-success" />, text: 'Recently crawled', badge: 'badge-success' };
    } else if (daysSince < 14) {
      return { icon: <FiClock className="text-info" />, text: 'Due for crawl', badge: 'badge-info' };
    } else {
      return { icon: <FiX className="text-error" />, text: 'Overdue', badge: 'badge-error' };
    }
  };

  const getCrawlJobStatusBadge = (state: string) => {
    const baseClasses = 'badge badge-sm';
    switch (state) {
      case 'completed':
        return `${baseClasses} badge-success`;
      case 'active':
        return `${baseClasses} badge-info`;
      case 'waiting':
        return `${baseClasses} badge-warning`;
      case 'delayed':
        return `${baseClasses} badge-warning`;
      case 'failed':
        return `${baseClasses} badge-error`;
      default:
        return `${baseClasses} badge-ghost`;
    }
  };

  if (loading && !knowledgeBase) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </AdminLayout>
    );
  }

  if (!knowledgeBase) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <FiDatabase className="mx-auto h-12 w-12 text-base-content/30 mb-4" />
          <h3 className="text-lg font-medium text-base-content mb-2">Knowledge base not found</h3>
          <Link href="/admin/knowledge-bases" className="btn btn-primary">
            Back to Knowledge Bases
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <Head>
        <title>{knowledgeBase.name} - Knowledge Bases - Admin Panel</title>
      </Head>

      <AdminLayout>
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Link 
                href="/admin/knowledge-bases"
                className="btn btn-ghost btn-sm"
              >
                <FiArrowLeft className="mr-2" />
                Back
              </Link>
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-3xl font-bold text-base-content">{knowledgeBase.name}</h1>
                  <div className="flex items-center space-x-2">
                    {getCrawlStatus(knowledgeBase.last_crawl_event).icon}
                    <span className={`badge ${getCrawlStatus(knowledgeBase.last_crawl_event).badge}`}>
                      {getCrawlStatus(knowledgeBase.last_crawl_event).text}
                    </span>
                  </div>
                </div>
                <p className="text-base-content/70 mt-1">
                  {knowledgeBase.sitemap_url}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowEditModal(true)}
                className="btn btn-outline"
              >
                <FiEdit className="mr-2" />
                Edit
              </button>
              <button
                onClick={handleCrawl}
                disabled={actionLoading === 'crawl'}
                className="btn btn-primary"
              >
                {actionLoading === 'crawl' ? (
                  <span className="loading loading-spinner loading-sm mr-2" />
                ) : (
                  <FiRefreshCw className="mr-2" />
                )}
                {actionLoading === 'crawl' ? 'Crawling...' : 'Crawl Now'}
              </button>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert alert-error mb-6">
              <FiX className="h-6 w-6" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="btn btn-sm btn-ghost"
              >
                <FiX />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              {(knowledgeBase.description || !knowledgeBase.description) && (
                <div className="card bg-base-100 shadow-lg">
                  <div className="card-body">
                    <h2 className="card-title">Description</h2>
                    <div className="prose prose-sm max-w-none">
                      {knowledgeBase.description ? (
                        <p className="text-base-content/80">{knowledgeBase.description}</p>
                      ) : (
                        <p className="text-base-content/50 italic">No description provided. Click Edit to add one.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Overview */}
              <div className="card bg-base-100 shadow-lg">
                <div className="card-body">
                  <h2 className="card-title">Overview</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="stat">
                      <div className="stat-title">Total Chunks</div>
                      <div className="stat-value text-2xl">{knowledgeBase.chunk_count?.toLocaleString() || '0'}</div>
                      <div className="stat-desc">Content pieces indexed</div>
                    </div>
                    <div className="stat">
                      <div className="stat-title">Last Crawled</div>
                      <div className="stat-value text-lg">{formatDate(knowledgeBase.last_crawl_event)}</div>
                      <div className="stat-desc">
                        {knowledgeBase.last_crawl_event ? 'Automatic weekly crawls enabled' : 'Never crawled'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Crawl Job */}
              {crawlJob && (
                <div className="card bg-base-100 shadow-lg">
                  <div className="card-body">
                    <h2 className="card-title flex items-center">
                      <FiActivity className="mr-2" />
                      Current Crawl Job
                    </h2>
                    
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">Status:</span>
                        <span className={getCrawlJobStatusBadge(crawlJob.state)}>
                          {crawlJob.state}
                        </span>
                      </div>
                      {crawlJob.progress > 0 && (
                        <div className="text-sm text-base-content/70">
                          Progress: {crawlJob.progress}%
                        </div>
                      )}
                    </div>

                    {crawlJob.progress > 0 && (
                      <progress 
                        className="progress progress-primary w-full mb-4" 
                        value={crawlJob.progress} 
                        max="100"
                      />
                    )}

                    {crawlJob.result && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="font-medium">URLs Processed</div>
                          <div className="text-base-content/70">{crawlJob.result.urlsProcessed}</div>
                        </div>
                        <div>
                          <div className="font-medium">Chunks Created</div>
                          <div className="text-base-content/70">{crawlJob.result.chunksCreated}</div>
                        </div>
                        <div>
                          <div className="font-medium">Chunks Updated</div>
                          <div className="text-base-content/70">{crawlJob.result.chunksUpdated}</div>
                        </div>
                        <div>
                          <div className="font-medium">Processing Time</div>
                          <div className="text-base-content/70">{(crawlJob.result.processingTimeMs / 1000).toFixed(1)}s</div>
                        </div>
                      </div>
                    )}

                    {crawlJob.failedReason && (
                      <div className="alert alert-error mt-4">
                        <FiAlertCircle />
                        <span className="text-sm">{crawlJob.failedReason}</span>
                      </div>
                    )}

                    {crawlJob.result?.errors && crawlJob.result.errors.length > 0 && (
                      <div className="alert alert-warning mt-4">
                        <FiAlertCircle />
                        <div>
                          <div className="font-medium">Errors encountered:</div>
                          <ul className="list-disc list-inside text-sm mt-1">
                            {crawlJob.result.errors.slice(0, 3).map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                            {crawlJob.result.errors.length > 3 && (
                              <li>... and {crawlJob.result.errors.length - 3} more</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Configuration */}
              <div className="card bg-base-100 shadow-lg">
                <div className="card-body">
                  <h3 className="card-title text-lg">Configuration</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="font-medium">Tenant ID</div>
                      <div className="text-base-content/70 font-mono">
                        {knowledgeBase.tenant_id}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Sitemap URL</div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base-content/70 truncate">
                          {knowledgeBase.sitemap_url}
                        </span>
                        <a
                          href={knowledgeBase.sitemap_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-xs"
                        >
                          <FiExternalLink />
                        </a>
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Created</div>
                      <div className="text-base-content/70">
                        {formatDate(knowledgeBase.created_at)}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Last Updated</div>
                      <div className="text-base-content/70">
                        {formatDate(knowledgeBase.updated_at)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card bg-base-100 shadow-lg">
                <div className="card-body">
                  <h3 className="card-title text-lg">Quick Actions</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="btn btn-outline btn-sm w-full justify-start"
                    >
                      <FiEdit className="mr-2" />
                      Edit Settings
                    </button>
                    <button
                      onClick={handleCrawl}
                      disabled={actionLoading === 'crawl'}
                      className="btn btn-primary btn-sm w-full justify-start"
                    >
                      {actionLoading === 'crawl' ? (
                        <span className="loading loading-spinner loading-xs mr-2" />
                      ) : (
                        <FiRefreshCw className="mr-2" />
                      )}
                      Start Crawl
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="btn btn-error btn-outline btn-sm w-full justify-start"
                    >
                      <FiTrash2 className="mr-2" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Help */}
              <div className="card bg-base-100 shadow-lg">
                <div className="card-body">
                  <h3 className="card-title text-lg">
                    <FiInfo className="mr-2" />
                    Help
                  </h3>
                  <div className="text-sm text-base-content/70 space-y-2">
                    <p>
                      Knowledge bases are automatically crawled weekly to keep content up to date.
                    </p>
                    <p>
                      The system detects changes using content checksums and only reprocesses modified pages.
                    </p>
                    <p>
                      Inactive knowledge bases are excluded from searches and automatic crawls.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Modal */}
        {showEditModal && (
          <div className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg mb-4">Edit Knowledge Base</h3>
              
              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Description</span>
                </label>
                <textarea
                  className="textarea textarea-bordered"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description of the knowledge base content"
                />
              </div>

              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Sitemap URL</span>
                </label>
                <input
                  type="url"
                  className="input input-bordered"
                  value={formData.sitemap_url}
                  onChange={(e) => setFormData({ ...formData, sitemap_url: e.target.value })}
                />
              </div>

              <div className="modal-action">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setFormData({
                      name: knowledgeBase.name,
                      description: knowledgeBase.description || '',
                      sitemap_url: knowledgeBase.sitemap_url
                    });
                    setError(null);
                  }}
                  className="btn btn-ghost"
                  disabled={actionLoading === 'update'}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  className="btn btn-primary"
                  disabled={actionLoading === 'update'}
                >
                  {actionLoading === 'update' && (
                    <span className="loading loading-spinner loading-sm mr-2" />
                  )}
                  Save Changes
                </button>
              </div>
            </div>
            <div className="modal-backdrop" onClick={() => setShowEditModal(false)} />
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg mb-4">Delete Knowledge Base</h3>
              <p className="mb-6">
                Are you sure you want to delete <strong>{knowledgeBase.name}</strong>? 
                This will also remove all {knowledgeBase.chunk_count.toLocaleString()} associated chunks and embeddings. 
                This action cannot be undone.
              </p>
              <div className="modal-action">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="btn btn-ghost"
                  disabled={actionLoading === 'delete'}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="btn btn-error"
                  disabled={actionLoading === 'delete'}
                >
                  {actionLoading === 'delete' && (
                    <span className="loading loading-spinner loading-sm mr-2" />
                  )}
                  Delete Knowledge Base
                </button>
              </div>
            </div>
            <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)} />
          </div>
        )}
      </AdminLayout>
    </>
  );
}