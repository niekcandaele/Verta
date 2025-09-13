import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import GoldenAnswerEditor from '@/components/admin/GoldenAnswerEditor';
import { adminApi, ClusterDetails } from '@/lib/admin/api';
import ReactMarkdown from 'react-markdown';
import { FiArrowLeft, FiEdit, FiPlus, FiTrash, FiTrash2, FiChevronDown, FiChevronUp, FiMessageSquare, FiSave, FiX } from 'react-icons/fi';

export default function ClusterDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [clusterDetails, setClusterDetails] = useState<ClusterDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const [editingRepText, setEditingRepText] = useState(false);
  const [tempRepText, setTempRepText] = useState('');
  const [savingRepText, setSavingRepText] = useState(false);
  const [deletingCluster, setDeletingCluster] = useState(false);

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchClusterDetails(id);
    }
  }, [id]);

  const fetchClusterDetails = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const details = await adminApi.getClusterDetails(clusterId);
      setClusterDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cluster details');
      console.error('Error fetching cluster details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAnswer = async (answer: string, format: 'markdown' | 'plaintext') => {
    if (!id || typeof id !== 'string') return;
    
    try {
      await adminApi.saveGoldenAnswer(id, {
        answer,
        answer_format: format,
        created_by: 'admin',
      });
      await fetchClusterDetails(id);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save golden answer');
    }
  };

  const handleDeleteAnswer = async () => {
    if (!id || typeof id !== 'string' || !clusterDetails?.golden_answer) return;
    
    if (!confirm('Are you sure you want to delete this golden answer?')) return;
    
    try {
      setDeleting(true);
      await adminApi.deleteGoldenAnswer(id);
      await fetchClusterDetails(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete golden answer');
    } finally {
      setDeleting(false);
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

  const toggleInstanceExpanded = (instanceId: string) => {
    setExpandedInstances(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instanceId)) {
        newSet.delete(instanceId);
      } else {
        newSet.add(instanceId);
      }
      return newSet;
    });
  };

  const handleEditRepText = () => {
    setTempRepText(clusterDetails?.cluster.representative_text || '');
    setEditingRepText(true);
  };

  const handleCancelRepTextEdit = () => {
    setEditingRepText(false);
    setTempRepText('');
  };

  const handleSaveRepText = async () => {
    if (!id || typeof id !== 'string' || !tempRepText.trim()) return;

    try {
      setSavingRepText(true);
      await adminApi.updateCluster(id, {
        representative_text: tempRepText.trim()
      });

      // Update the local state with the new text
      if (clusterDetails) {
        setClusterDetails({
          ...clusterDetails,
          cluster: {
            ...clusterDetails.cluster,
            representative_text: tempRepText.trim()
          }
        });
      }

      setEditingRepText(false);
      setTempRepText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update representative text');
    } finally {
      setSavingRepText(false);
    }
  };

  const handleDeleteCluster = async () => {
    if (!id || typeof id !== 'string' || !clusterDetails) return;

    const instanceCount = clusterDetails.cluster.instance_count;
    const hasGoldenAnswer = !!clusterDetails.golden_answer;

    // Create a detailed confirmation message
    let confirmMessage = `Are you sure you want to delete this cluster?\n\nThis action will permanently delete:\n- The cluster and its representative text`;
    if (instanceCount > 0) {
      confirmMessage += `\n- ${instanceCount} question instance${instanceCount > 1 ? 's' : ''}`;
    }
    if (hasGoldenAnswer) {
      confirmMessage += `\n- The associated golden answer`;
    }
    confirmMessage += `\n\nThis action cannot be undone.`;

    if (!confirm(confirmMessage)) return;

    try {
      setDeletingCluster(true);
      await adminApi.deleteCluster(id);

      // Redirect to cluster list on successful deletion
      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete cluster');
    } finally {
      setDeletingCluster(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex flex-col justify-center items-center h-64 space-y-4">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="text-base-content/60">Loading cluster details...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !clusterDetails) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="alert alert-error">
            <div>
              <h3 className="font-bold">Unable to load FAQ entry</h3>
              <p className="text-sm">{error || 'The requested cluster could not be found.'}</p>
            </div>
          </div>
          <Link href="/admin" className="btn btn-primary btn-sm inline-flex items-center">
            <FiArrowLeft className="mr-2" />
            Back to Clusters
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const { cluster, golden_answer, instances } = clusterDetails;

  return (
    <AdminLayout>
      <Head>
        <title>Admin - FAQ Details</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link 
              href="/admin"
              className="btn btn-sm btn-ghost inline-flex items-center"
            >
              <FiArrowLeft className="mr-2" />
              Back to FAQ
            </Link>
            <h2 className="text-2xl font-bold">FAQ Details</h2>
          </div>
        </div>

        {/* Cluster Information */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Cluster Information</h3>
              <button
                className="btn btn-sm btn-error inline-flex items-center"
                onClick={handleDeleteCluster}
                disabled={deletingCluster}
              >
                {deletingCluster ? (
                  <>
                    <span className="loading loading-spinner loading-xs mr-2"></span>
                    Deleting...
                  </>
                ) : (
                  <>
                    <FiTrash2 className="mr-2" />
                    Delete Cluster
                  </>
                )}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-base-content/70 mb-2">Representative Text</p>
                    {editingRepText ? (
                      <div className="space-y-3">
                        <textarea
                          style={{ backgroundColor: '#121218', color: '#f3f4f6' }}
                          className="border border-base-300 placeholder:text-base-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 w-full h-24 font-mono text-sm rounded-lg p-3 resize-none"
                          value={tempRepText}
                          onChange={(e) => setTempRepText(e.target.value)}
                          placeholder="Enter representative text..."
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            className="btn btn-sm btn-primary inline-flex items-center"
                            onClick={handleSaveRepText}
                            disabled={savingRepText || !tempRepText.trim()}
                          >
                            {savingRepText ? (
                              <>
                                <span className="loading loading-spinner loading-xs mr-2"></span>
                                Saving...
                              </>
                            ) : (
                              <>
                                <FiSave className="mr-2" />
                                Save
                              </>
                            )}
                          </button>
                          <button
                            className="btn btn-sm btn-ghost inline-flex items-center"
                            onClick={handleCancelRepTextEdit}
                            disabled={savingRepText}
                          >
                            <FiX className="mr-2" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <p className="font-medium flex-1">{cluster.representative_text}</p>
                        <button
                          className="btn btn-xs btn-ghost inline-flex items-center"
                          onClick={handleEditRepText}
                        >
                          <FiEdit className="mr-1" />
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm text-base-content/70">Thread Title</p>
                <p className="font-medium">{cluster.thread_title || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/70">Instance Count</p>
                <p className="font-medium">{cluster.instance_count}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/70">Last Seen</p>
                <p className="font-medium">{formatDate(cluster.last_seen_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Golden Answer Section */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Golden Answer</h3>
              {!editMode && (
                <div className="space-x-2">
                  {golden_answer ? (
                    <>
                      <button
                        className="btn btn-sm btn-primary inline-flex items-center"
                        onClick={() => setEditMode(true)}
                      >
                        <FiEdit className="mr-2" />
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-error inline-flex items-center"
                        onClick={handleDeleteAnswer}
                        disabled={deleting}
                      >
                        <FiTrash className="mr-2" />
                        Delete
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary inline-flex items-center"
                      onClick={() => setEditMode(true)}
                    >
                      <FiPlus className="mr-2" />
                      Add Answer
                    </button>
                  )}
                </div>
              )}
            </div>

            {editMode ? (
              <GoldenAnswerEditor
                initialAnswer={golden_answer?.answer || ''}
                initialFormat={golden_answer?.answer_format || 'markdown'}
                onSave={handleSaveAnswer}
                onCancel={() => setEditMode(false)}
              />
            ) : golden_answer ? (
              <div className="prose prose-sm max-w-none">
                {golden_answer.answer_format === 'markdown' ? (
                  <ReactMarkdown>{golden_answer.answer}</ReactMarkdown>
                ) : (
                  <p className="whitespace-pre-wrap">{golden_answer.answer}</p>
                )}
                <div className="text-sm text-base-content/50 mt-4">
                  Created by {golden_answer.created_by} on {formatDate(golden_answer.created_at)}
                </div>
              </div>
            ) : (
              <p className="text-base-content/50 italic">No golden answer has been added yet.</p>
            )}
          </div>
        </div>

        {/* Question Instances */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h3 className="card-title mb-4">Question Instances ({instances.length})</h3>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {instances.map((instance) => {
                const isExpanded = expandedInstances.has(instance.id);
                return (
                  <div key={instance.id} className="border rounded-lg border-base-300 p-4 hover:shadow-md transition-shadow">
                    {/* Primary Display - Rephrased Question */}
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-start gap-2">
                          <FiMessageSquare className="text-primary mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            {instance.rephrased_text ? (
                              <p className="font-semibold text-base">{instance.rephrased_text}</p>
                            ) : (
                              <p className="font-semibold text-base text-base-content/50 italic">No rephrased question available</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Metadata Row */}
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-base-content/70">
                          {instance.thread_title && (
                            <>
                              <span className="font-medium">Thread:</span>
                              <span>{instance.thread_title}</span>
                              <span className="text-base-content/40">•</span>
                            </>
                          )}
                          <span className="badge badge-sm badge-outline">
                            {(instance.confidence_score * 100).toFixed(1)}% confidence
                          </span>
                          <span className="text-base-content/40">•</span>
                          <span className="text-xs">{formatDate(instance.created_at)}</span>
                        </div>

                        {/* Toggle Button */}
                        <button
                          onClick={() => toggleInstanceExpanded(instance.id)}
                          className="btn btn-xs btn-ghost gap-1 mt-3"
                        >
                          {isExpanded ? (
                            <>
                              <FiChevronUp className="w-3 h-3" />
                              Hide original conversation
                            </>
                          ) : (
                            <>
                              <FiChevronDown className="w-3 h-3" />
                              Show original conversation
                            </>
                          )}
                        </button>

                        {/* Original Text - Collapsible */}
                        {isExpanded && (
                          <div className="mt-3 p-3 bg-base-200 rounded-lg">
                            <p className="text-xs font-semibold text-base-content/70 mb-2">Original Conversation:</p>
                            <p className="text-sm whitespace-pre-wrap font-mono text-base-content/80 max-h-64 overflow-y-auto">
                              {instance.original_text}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}