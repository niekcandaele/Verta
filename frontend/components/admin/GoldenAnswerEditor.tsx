import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { FiSave, FiX, FiEye, FiEdit } from 'react-icons/fi';
import { markdownSanitizeSchema } from '@/lib/markdown';

interface GoldenAnswerEditorProps {
  initialAnswer?: string;
  initialFormat?: 'markdown' | 'plaintext';
  onSave: (answer: string, format: 'markdown' | 'plaintext') => void;
  onCancel: () => void;
}

export default function GoldenAnswerEditor({
  initialAnswer = '',
  initialFormat = 'markdown',
  onSave,
  onCancel,
}: GoldenAnswerEditorProps) {
  const [answer, setAnswer] = useState(initialAnswer);
  const [format, setFormat] = useState<'markdown' | 'plaintext'>(initialFormat);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!answer.trim()) {
      alert('Please enter an answer');
      return;
    }
    
    setSaving(true);
    try {
      await onSave(answer.trim(), format);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (answer !== initialAnswer) {
      if (!confirm('Are you sure you want to discard your changes?')) {
        return;
      }
    }
    onCancel();
  };

  return (
    <div className="space-y-4">
      {/* Format Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <label className="label">
            <span className="label-text">Format:</span>
          </label>
          <div className="btn-group">
            <button
              className={`btn btn-sm ${format === 'markdown' ? 'btn-active' : ''}`}
              onClick={() => setFormat('markdown')}
            >
              Markdown
            </button>
            <button
              className={`btn btn-sm ${format === 'plaintext' ? 'btn-active' : ''}`}
              onClick={() => setFormat('plaintext')}
            >
              Plain Text
            </button>
          </div>
        </div>
        
        {format === 'markdown' && (
          <button
            className="btn btn-sm btn-ghost inline-flex items-center"
            onClick={() => setPreview(!preview)}
          >
            {preview ? (
              <>
                <FiEdit className="mr-2" />
                Edit
              </>
            ) : (
              <>
                <FiEye className="mr-2" />
                Preview
              </>
            )}
          </button>
        )}
      </div>

      {/* Editor or Preview */}
      {preview && format === 'markdown' ? (
        <div className="card bg-base-200">
          <div className="card-body">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown 
                rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
              >
                {answer || '*No content to preview*'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <textarea
            style={{ backgroundColor: '#121218', color: '#f3f4f6' }}
            className="border border-base-300 placeholder:text-base-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 w-full h-64 font-mono text-sm rounded-lg p-4 resize-none"
            placeholder={
              format === 'markdown'
                ? 'Enter your answer here...\n\nSupports **bold**, *italic*, [links](url), and lists:\n- Item 1\n- Item 2'
                : 'Enter your answer here...'
            }
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoFocus
          />
          {format === 'markdown' && (
            <div className="text-xs text-base-content/50 mt-2">
              Supports basic markdown: **bold**, *italic*, [links](url), lists (- item)
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <button
          className="btn btn-ghost inline-flex items-center"
          onClick={handleCancel}
          disabled={saving}
        >
          <FiX className="mr-2" />
          Cancel
        </button>
        <button
          className="btn btn-primary inline-flex items-center"
          onClick={handleSave}
          disabled={saving || !answer.trim()}
        >
          {saving ? (
            <>
              <span className="loading loading-spinner loading-sm mr-2"></span>
              Saving...
            </>
          ) : (
            <>
              <FiSave className="mr-2" />
              Save Answer
            </>
          )}
        </button>
      </div>
    </div>
  );
}