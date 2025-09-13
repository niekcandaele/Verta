import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminApi, KnowledgeBaseWithStats, PaginatedResponse } from '@/lib/admin/api';
import { 
  FiPlus, 
  FiEdit, 
  FiTrash2, 
  FiRefreshCw, 
  FiChevronLeft, 
  FiChevronRight,
  FiX,
  FiExternalLink,
  FiDatabase
} from 'react-icons/fi';

export default function KnowledgeBasesAdmin() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'last_crawled_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sitemap_url: '',
  });

  useEffect(() => {
    fetchKnowledgeBases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder]);

  const fetchKnowledgeBases = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getKnowledgeBases({
        page,
        limit: 20,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setKnowledgeBases(response.data);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch knowledge bases');
      console.error('Error fetching knowledge bases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.sitemap_url.trim()) {
      setError('Name and sitemap URL are required');
      return;
    }

    try {
      setActionLoading('create');
      setError(null);
      
      await adminApi.createKnowledgeBase({
        name: formData.name,
        description: formData.description || null,
        sitemap_url: formData.sitemap_url,
        tenant_id: 'dcc3a375-90d8-40dd-8761-2d622936c90b', // Takaro tenant
      });
      
      setShowCreateModal(false);
      setFormData({ name: '', description: '', sitemap_url: '' });
      await fetchKnowledgeBases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create knowledge base');
      console.error('Error creating knowledge base:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setActionLoading(id);
      setError(null);
      
      await adminApi.deleteKnowledgeBase(id);
      setShowDeleteModal(null);
      await fetchKnowledgeBases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete knowledge base');
      console.error('Error deleting knowledge base:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCrawl = async (id: string) => {
    try {
      setActionLoading(id);
      setError(null);
      
      await adminApi.crawlKnowledgeBase(id);
      await fetchKnowledgeBases();
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


  return (
    <>
      <Head>
        <title>Knowledge Bases - Admin Panel</title>
      </Head>

      <AdminLayout>
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-base-content">Knowledge Bases</h1>
              <p className="text-base-content/70 mt-2">
                Manage external documentation sources and sitemaps
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              <FiPlus className="mr-2" />
              Add Knowledge Base
            </button>
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

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : knowledgeBases.length === 0 ? (
            <div className="text-center py-12">
              <FiDatabase className="mx-auto h-12 w-12 text-base-content/30 mb-4" />
              <h3 className="text-lg font-medium text-base-content mb-2">No knowledge bases</h3>
              <p className="text-base-content/60 mb-6">
                Get started by adding your first knowledge base
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                <FiPlus className="mr-2" />
                Add Knowledge Base
              </button>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="card bg-base-100 shadow-lg">
                <div className="card-body p-0">
                  <div className="overflow-x-auto">
                    <table className="table table-zebra w-full">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Sitemap URL</th>
                          <th className="w-24">Chunks</th>
                          <th>Last Activity</th>
                          <th>Created</th>
                          <th className="w-32">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {knowledgeBases.map((kb) => (
                          <tr key={kb.id}>
                            <td className="min-w-[200px]">
                              <div className="font-medium">{kb.name}</div>
                              {kb.description && (
                                <div className="text-sm text-base-content/60 mt-1 max-w-md">
                                  {kb.description.length > 100
                                    ? `${kb.description.substring(0, 100)}...`
                                    : kb.description}
                                </div>
                              )}
                              <div className="text-xs text-base-content/40 mt-1">
                                {kb.tenant_id}
                              </div>
                            </td>
                            <td className="min-w-[300px]">
                              <div className="flex items-center space-x-2">
                                <span className="truncate max-w-md">
                                  {kb.sitemap_url}
                                </span>
                                <a
                                  href={kb.sitemap_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-ghost btn-xs"
                                >
                                  <FiExternalLink />
                                </a>
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-outline">
                                {kb.chunk_count.toLocaleString()}
                              </span>
                            </td>
                            <td>
                              <span className="text-sm">
                                {kb.last_crawl_event ? formatDate(kb.last_crawl_event) : 'Never'}
                              </span>
                            </td>
                            <td>
                              <span className="text-sm">
                                {formatDate(kb.created_at)}
                              </span>
                            </td>
                            <td>
                              <div className="flex space-x-2">
                                <Link
                                  href={`/admin/knowledge-bases/${kb.id}`}
                                  className="btn btn-ghost btn-xs"
                                >
                                  <FiEdit />
                                </Link>
                                <button
                                  onClick={() => handleCrawl(kb.id)}
                                  disabled={actionLoading === kb.id}
                                  className="btn btn-ghost btn-xs"
                                >
                                  {actionLoading === kb.id ? (
                                    <span className="loading loading-spinner loading-xs" />
                                  ) : (
                                    <FiRefreshCw />
                                  )}
                                </button>
                                <button
                                  onClick={() => setShowDeleteModal(kb.id)}
                                  disabled={actionLoading === kb.id}
                                  className="btn btn-ghost btn-xs text-error"
                                >
                                  <FiTrash2 />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center mt-6">
                  <div className="join">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="join-item btn btn-sm"
                    >
                      <FiChevronLeft />
                    </button>
                    <span className="join-item btn btn-sm btn-disabled">
                      {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="join-item btn btn-sm"
                    >
                      <FiChevronRight />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </AdminLayout>

      {/* Create Modal */}
      {showCreateModal && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => {
              setShowCreateModal(false);
              setFormData({ name: '', description: '', sitemap_url: '' });
              setError(null);
            }}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-base-100 rounded-lg shadow-xl max-w-md w-full p-6 relative">
              <button
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                onClick={() => {
                  setShowCreateModal(false);
                  setFormData({ name: '', description: '', sitemap_url: '' });
                  setError(null);
                }}
              >
                ✕
              </button>
              <h3 className="font-bold text-lg mb-4">Add Knowledge Base</h3>
            
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Name</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Product Documentation"
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
                placeholder="e.g., Official product documentation including API reference and user guides"
                className="textarea textarea-bordered"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              <label className="label">
                <span className="label-text-alt">Optional description of the knowledge base content</span>
              </label>
            </div>

            <div className="form-control mb-6">
              <label className="label">
                <span className="label-text">Sitemap URL</span>
              </label>
              <input
                type="url"
                placeholder="https://docs.example.com/sitemap.xml"
                className="input input-bordered"
                value={formData.sitemap_url}
                onChange={(e) => setFormData({ ...formData, sitemap_url: e.target.value })}
              />
              <label className="label">
                <span className="label-text-alt">Must be a valid XML sitemap URL</span>
              </label>
            </div>

            <div className="modal-action">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setFormData({ name: '', description: '', sitemap_url: '' });
                  setError(null);
                }}
                className="btn btn-ghost"
                disabled={actionLoading === 'create'}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="btn btn-primary"
                disabled={actionLoading === 'create'}
              >
                {actionLoading === 'create' && (
                  <span className="loading loading-spinner loading-sm mr-2" />
                )}
                Create
              </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowDeleteModal(null)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-base-100 rounded-lg shadow-xl max-w-md w-full p-6 relative">
              <button
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                onClick={() => setShowDeleteModal(null)}
              >
                ✕
              </button>
              <h3 className="font-bold text-lg mb-4">Delete Knowledge Base</h3>
            <p className="mb-6">
              Are you sure you want to delete this knowledge base? This will also remove all associated chunks and embeddings. This action cannot be undone.
            </p>
            <div className="modal-action">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="btn btn-ghost"
                disabled={actionLoading !== null}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteModal)}
                className="btn btn-error"
                disabled={actionLoading !== null}
              >
                {actionLoading === showDeleteModal && (
                  <span className="loading loading-spinner loading-sm mr-2" />
                )}
                Delete
              </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}