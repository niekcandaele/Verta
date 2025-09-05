import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { FiChevronDown, FiChevronUp, FiUsers } from 'react-icons/fi';
import type { FAQItem } from '@/lib/faq';
import { markdownSanitizeSchema } from '@/lib/markdown';

interface FAQProps {
  items: FAQItem[];
}

export default function FAQ({ items }: FAQProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const isExpanded = expandedItems.has(item.id);
        
        return (
          <div
            key={item.id}
            className="glass rounded-xl overflow-hidden border border-base-content/10 hover:border-primary/30 transition-all duration-300"
          >
            <button
              onClick={() => toggleItem(item.id)}
              className="w-full px-6 py-4 text-left hover:bg-primary/5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-expanded={isExpanded}
              aria-controls={`faq-answer-${item.id}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 pr-4">
                  <h3 className="text-lg font-semibold text-base-content">
                    {item.question}
                  </h3>
                  {item.thread_title && (
                    <p className="text-sm text-base-content/50 mt-1">
                      From: {item.thread_title}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center text-xs text-base-content/60">
                      <FiUsers className="mr-1" />
                      Asked {item.popularity} {item.popularity === 1 ? 'time' : 'times'}
                    </span>
                    <span className="text-xs text-base-content/40">
                      Last asked: {new Date(item.last_seen).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {isExpanded ? (
                    <FiChevronUp className="w-5 h-5 text-primary" />
                  ) : (
                    <FiChevronDown className="w-5 h-5 text-base-content/60" />
                  )}
                </div>
              </div>
            </button>
            
            {isExpanded && (
              <div
                id={`faq-answer-${item.id}`}
                className="px-6 pb-4 animate-fade-slide-down"
              >
                <div className="border-t border-base-content/10 pt-4">
                  {item.answer_format === 'markdown' ? (
                    <div className="prose prose-sm max-w-none text-base-content">
                      <ReactMarkdown 
                        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
                      >
                        {item.answer}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-base-content whitespace-pre-wrap">
                      {item.answer}
                    </p>
                  )}
                  <div className="mt-4 pt-4 border-t border-base-content/5">
                    <p className="text-xs text-base-content/40">
                      Answered by {item.answered_by} on {new Date(item.answered_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}