import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import CreateClusterModal from '@/components/admin/CreateClusterModal';
import { adminApi, QuestionCluster, PaginatedResponse, CreateClusterRequest } from '@/lib/admin/api';
import { FiCheck, FiX, FiChevronLeft, FiChevronRight, FiPlus, FiTrash2 } from 'react-icons/fi';

export default function AdminClusters() {
  const [clusters, setClusters] = useState<QuestionCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<'instance_count' | 'last_seen_at'>('instance_count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selection state
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Active tenant (Takaro as mentioned in the plan)
  const ACTIVE_TENANT_ID = 'dcc3a375-90d8-40dd-8761-2d622936c90b';

  useEffect(() => {
    fetchClusters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder]);

  const fetchClusters = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getClusters({
        page,
        limit: 20,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setClusters(response.data);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clusters');
      console.error('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const handleSort = (field: 'instance_count' | 'last_seen_at') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleCreateCluster = async (data: CreateClusterRequest) => {
    try {
      await adminApi.createCluster(data);
      setSuccessMessage('Cluster created successfully!');
      await fetchClusters(); // Refresh the list
      setPage(1); // Go to first page to see the new cluster

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create cluster');
      console.error('Error creating cluster:', err);
    }
  };

  // Selection helpers
  const handleSelectCluster = (clusterId: string) => {
    const newSelection = new Set(selectedClusters);
    if (newSelection.has(clusterId)) {
      newSelection.delete(clusterId);
    } else {
      // Enforce max 10 selections
      if (newSelection.size >= 10) {
        setError('Maximum 10 clusters can be selected at once');
        return;
      }
      newSelection.add(clusterId);
    }
    setSelectedClusters(newSelection);
    setIsSelecting(newSelection.size > 0);
  };

  const handleSelectAll = () => {
    if (selectedClusters.size === clusters.length) {
      // Deselect all
      setSelectedClusters(new Set());
      setIsSelecting(false);
    } else {
      // Select all (up to 10)
      const newSelection = new Set<string>();
      for (let i = 0; i < Math.min(clusters.length, 10); i++) {
        newSelection.add(clusters[i].id);
      }
      setSelectedClusters(newSelection);
      setIsSelecting(true);
      if (clusters.length > 10) {
        setError('Selected first 10 clusters (maximum allowed)');
      }
    }
  };

  const handleBulkDelete = async () => {
    try {
      const clusterIds = Array.from(selectedClusters);
      await adminApi.bulkDeleteClusters(clusterIds);
      setSuccessMessage(`Successfully deleted ${clusterIds.length} clusters`);
      setSelectedClusters(new Set());
      setIsSelecting(false);
      setShowDeleteConfirm(false);
      await fetchClusters(); // Refresh the list

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete clusters');
      console.error('Error deleting clusters:', err);
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>Admin - FAQ</title>
      </Head>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold">FAQ</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-sm btn-primary inline-flex items-center"
              disabled={loading}
            >
              <FiPlus className="mr-2" />
              Create Cluster
            </button>
            <button
              onClick={fetchClusters}
              className="btn btn-sm btn-ghost"
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            <FiX className="w-6 h-6" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success">
            <FiCheck className="w-6 h-6" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Bulk actions toolbar */}
        {isSelecting && (
          <div className="bg-base-200 p-4 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="font-medium">
                {selectedClusters.size} cluster{selectedClusters.size !== 1 ? 's' : ''} selected
              </span>
              {selectedClusters.size === 10 && (
                <span className="text-sm text-warning">(Maximum selection reached)</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setSelectedClusters(new Set());
                  setIsSelecting(false);
                }}
                className="btn btn-sm btn-ghost"
              >
                Clear Selection
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-sm btn-error inline-flex items-center"
              >
                <FiTrash2 className="mr-2" />
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selectedClusters.size === clusters.length && clusters.length > 0}
                        onChange={handleSelectAll}
                        disabled={clusters.length === 0}
                      />
                    </th>
                    <th>Representative Text</th>
                    <th>Thread Title</th>
                    <th 
                      className="cursor-pointer hover:bg-base-200"
                      onClick={() => handleSort('instance_count')}
                    >
                      Instance Count
                      {sortBy === 'instance_count' && (
                        <span className="ml-2">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th>Golden Answer</th>
                    <th
                      className="cursor-pointer hover:bg-base-200"
                      onClick={() => handleSort('last_seen_at')}
                    >
                      Last Seen
                      {sortBy === 'last_seen_at' && (
                        <span className="ml-2">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clusters.map((cluster) => (
                    <tr key={cluster.id} className="hover">
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={selectedClusters.has(cluster.id)}
                          onChange={() => handleSelectCluster(cluster.id)}
                        />
                      </td>
                      <td className="max-w-md">
                        <div className="text-sm">
                          {truncateText(cluster.representative_text, 150)}
                        </div>
                      </td>
                      <td className="max-w-xs">
                        <div className="text-sm">
                          {cluster.thread_title ? truncateText(cluster.thread_title, 50) : '-'}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-primary">{cluster.instance_count}</span>
                      </td>
                      <td>
                        {cluster.has_golden_answer ? (
                          <FiCheck className="text-success w-5 h-5" />
                        ) : (
                          <FiX className="text-base-content/30 w-5 h-5" />
                        )}
                      </td>
                      <td className="text-sm">{formatDate(cluster.last_seen_at)}</td>
                      <td>
                        <Link 
                          href={`/admin/clusters/${cluster.id}`}
                          className="btn btn-sm btn-ghost"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-4">
                <button
                  className="btn btn-sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  <FiChevronLeft />
                </button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                >
                  <FiChevronRight />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Cluster Modal */}
      <CreateClusterModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreateCluster}
        tenantId={ACTIVE_TENANT_ID}
      />

      {/* Bulk Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-4">Confirm Bulk Delete</h3>

            <div className="alert alert-warning mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold">Warning: This action cannot be undone!</p>
                <p className="text-sm">All question instances and golden answers associated with these clusters will also be deleted.</p>
              </div>
            </div>

            <p className="mb-4">
              You are about to delete <span className="font-bold">{selectedClusters.size} cluster{selectedClusters.size !== 1 ? 's' : ''}</span>.
            </p>

            <div className="mb-6">
              <p className="font-semibold mb-2">Clusters to be deleted:</p>
              <div className="max-h-48 overflow-y-auto border rounded p-2">
                {clusters
                  .filter(c => selectedClusters.has(c.id))
                  .map(cluster => (
                    <div key={cluster.id} className="py-1 text-sm">
                      • {truncateText(cluster.representative_text, 80)}
                      {cluster.instance_count > 0 && (
                        <span className="text-error ml-2">
                          ({cluster.instance_count} instance{cluster.instance_count !== 1 ? 's' : ''})
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            <div className="modal-action">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="btn btn-error"
              >
                Delete {selectedClusters.size} Cluster{selectedClusters.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(false)}></div>
        </div>
      )}
    </AdminLayout>
  );
}