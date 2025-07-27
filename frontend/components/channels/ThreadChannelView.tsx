import { useState } from 'react';
import type { MessageWithExtras } from '@/lib/data';
import Message from '../Message';

interface ThreadChannelViewProps {
  messages: MessageWithExtras[];
  channelName: string;
}

interface ThreadNode {
  message: MessageWithExtras;
  children: ThreadNode[];
  depth: number;
}

export default function ThreadChannelView({ messages, channelName }: ThreadChannelViewProps) {
  const threadTree = buildThreadTree(messages);
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set());

  const toggleThread = (messageId: string) => {
    const newCollapsed = new Set(collapsedThreads);
    if (newCollapsed.has(messageId)) {
      newCollapsed.delete(messageId);
    } else {
      newCollapsed.add(messageId);
    }
    setCollapsedThreads(newCollapsed);
  };

  return (
    <div>
      <div className="mb-4 p-4 bg-base-200 rounded-lg">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
          <span className="text-sm font-medium">Thread Channel</span>
        </div>
        <p className="text-sm text-base-content/60 mt-1">
          Messages are displayed in threaded conversations with hierarchical relationships
        </p>
      </div>

      <div className="space-y-2">
        {threadTree.map((node) => (
          <ThreadNodeComponent
            key={node.message.id}
            node={node}
            collapsedThreads={collapsedThreads}
            onToggle={toggleThread}
          />
        ))}
      </div>
    </div>
  );
}

interface ThreadNodeComponentProps {
  node: ThreadNode;
  collapsedThreads: Set<string>;
  onToggle: (messageId: string) => void;
}

function ThreadNodeComponent({ node, collapsedThreads, onToggle }: ThreadNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedThreads.has(node.message.id);

  return (
    <div>
      <div 
        className={`relative ${node.depth > 0 ? 'ml-' + Math.min(node.depth * 8, 48) : ''}`}
        style={{ marginLeft: node.depth > 0 ? `${node.depth * 2}rem` : 0 }}
      >
        {/* Thread line */}
        {node.depth > 0 && (
          <div className="absolute left-0 top-0 bottom-0 w-px bg-base-300" 
               style={{ left: '-1rem' }} />
        )}
        
        <div className="flex items-start gap-2">
          {/* Expand/Collapse button */}
          {hasChildren && (
            <button
              onClick={() => onToggle(node.message.id)}
              className="btn btn-xs btn-ghost mt-2"
            >
              {isCollapsed ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          )}
          
          <div className="flex-1">
            <Message message={node.message} />
            
            {hasChildren && !isCollapsed && (
              <div className="text-xs text-base-content/50 mt-1">
                {node.children.length} {node.children.length === 1 ? 'reply' : 'replies'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Child threads */}
      {hasChildren && !isCollapsed && (
        <div className="mt-2">
          {node.children.map((child) => (
            <ThreadNodeComponent
              key={child.message.id}
              node={child}
              collapsedThreads={collapsedThreads}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildThreadTree(messages: MessageWithExtras[]): ThreadNode[] {
  const messageMap = new Map(messages.map(m => [m.id, m]));
  const nodeMap = new Map<string, ThreadNode>();
  const rootNodes: ThreadNode[] = [];

  // Create nodes for all messages
  messages.forEach(message => {
    nodeMap.set(message.id, {
      message,
      children: [],
      depth: 0,
    });
  });

  // Build the tree structure
  messages.forEach(message => {
    const node = nodeMap.get(message.id)!;
    
    if (message.replyToId && nodeMap.has(message.replyToId)) {
      // This is a reply, add it to its parent
      const parentNode = nodeMap.get(message.replyToId)!;
      parentNode.children.push(node);
      node.depth = parentNode.depth + 1;
    } else {
      // This is a root message
      rootNodes.push(node);
    }
  });

  // Sort children by timestamp
  const sortNodes = (nodes: ThreadNode[]) => {
    nodes.sort((a, b) => 
      new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime()
    );
    nodes.forEach(node => sortNodes(node.children));
  };

  sortNodes(rootNodes);

  return rootNodes;
}