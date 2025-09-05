import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminApi, QuestionCluster, PaginatedResponse } from '@/lib/admin/api';
import { FiCheck, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

export default function AdminClusters() {
  const [clusters, setClusters] = useState<QuestionCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<'instance_count' | 'last_seen_at'>('instance_count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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

  return (
    <AdminLayout>
      <Head>
        <title>Admin - Question Clusters</title>
      </Head>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold">Question Clusters</h2>
          <button
            onClick={fetchClusters}
            className="btn btn-sm btn-primary"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            <FiX className="w-6 h-6" />
            <span>{error}</span>
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
    </AdminLayout>
  );
}