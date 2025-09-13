import { useState } from 'react';
import { FiSave, FiX, FiPlus, FiTrash2 } from 'react-icons/fi';
import { CreateClusterRequest } from '@/lib/admin/api';

interface CreateClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateClusterRequest) => void;
  tenantId: string;
}

export default function CreateClusterModal({
  isOpen,
  onClose,
  onSave,
  tenantId,
}: CreateClusterModalProps) {
  const [representativeText, setRepresentativeText] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [exampleQuestions, setExampleQuestions] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!representativeText.trim()) {
      alert('Please enter representative text');
      return;
    }

    setSaving(true);
    try {
      const data: CreateClusterRequest = {
        tenant_id: tenantId,
        representative_text: representativeText.trim(),
        thread_title: threadTitle.trim() || undefined,
        example_questions: exampleQuestions
          .map(q => q.trim())
          .filter(q => q.length > 0),
      };
      await onSave(data);
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (representativeText.trim() || threadTitle.trim() || exampleQuestions.some(q => q.trim())) {
      if (!confirm('Are you sure you want to discard your changes?')) {
        return;
      }
    }
    setRepresentativeText('');
    setThreadTitle('');
    setExampleQuestions(['']);
    setSaving(false);
    onClose();
  };

  const addExampleQuestion = () => {
    setExampleQuestions([...exampleQuestions, '']);
  };

  const removeExampleQuestion = (index: number) => {
    setExampleQuestions(exampleQuestions.filter((_, i) => i !== index));
  };

  const updateExampleQuestion = (index: number, value: string) => {
    const updated = [...exampleQuestions];
    updated[index] = value;
    setExampleQuestions(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-base-100 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold">Create New Cluster</h3>
            <button
              className="btn btn-sm btn-ghost btn-circle"
              onClick={handleClose}
              disabled={saving}
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Tenant Info */}
            <div>
              <label className="label">
                <span className="label-text font-medium">Tenant ID</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full bg-base-200"
                value={tenantId}
                disabled
              />
            </div>

            {/* Representative Text */}
            <div>
              <label className="label">
                <span className="label-text font-medium">Representative Text *</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full h-24 resize-none"
                placeholder="Enter the representative text for this cluster..."
                value={representativeText}
                onChange={(e) => setRepresentativeText(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Thread Title */}
            <div>
              <label className="label">
                <span className="label-text font-medium">Thread Title (optional)</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="Enter an optional thread title..."
                value={threadTitle}
                onChange={(e) => setThreadTitle(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Example Questions */}
            <div>
              <label className="label">
                <span className="label-text font-medium">Example Questions (optional)</span>
              </label>
              <div className="space-y-2">
                {exampleQuestions.map((question, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      className="input input-bordered flex-1"
                      placeholder={`Example question ${index + 1}...`}
                      value={question}
                      onChange={(e) => updateExampleQuestion(index, e.target.value)}
                      disabled={saving}
                    />
                    {exampleQuestions.length > 1 && (
                      <button
                        className="btn btn-ghost btn-sm btn-circle"
                        onClick={() => removeExampleQuestion(index)}
                        disabled={saving}
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="btn btn-ghost btn-sm inline-flex items-center"
                  onClick={addExampleQuestion}
                  disabled={saving}
                >
                  <FiPlus className="mr-2" />
                  Add Example Question
                </button>
              </div>
              <div className="text-xs text-base-content/50 mt-2">
                Example questions help generate better embeddings for cluster matching
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2 mt-8">
            <button
              className="btn btn-ghost inline-flex items-center"
              onClick={handleClose}
              disabled={saving}
            >
              <FiX className="mr-2" />
              Cancel
            </button>
            <button
              className="btn btn-primary inline-flex items-center"
              onClick={handleSave}
              disabled={saving || !representativeText.trim()}
            >
              {saving ? (
                <>
                  <span className="loading loading-spinner loading-sm mr-2"></span>
                  Creating...
                </>
              ) : (
                <>
                  <FiSave className="mr-2" />
                  Create Cluster
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}