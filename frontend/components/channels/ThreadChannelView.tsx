import { useState, KeyboardEvent } from 'react';
import type { MessageWithExtras } from '@/lib/data';
import Message from '../Message';
import type { Channel } from 'shared-types';
import { FiChevronDown, FiChevronRight, FiMessageCircle, FiGitBranch } from 'react-icons/fi';
import clsx from 'clsx';

interface ThreadChannelViewProps {
  messages: MessageWithExtras[];
  channelName: string;
  channels: Channel[];
}

interface ThreadNode {
  message: MessageWithExtras;
  children: ThreadNode[];
}

export default function ThreadChannelView({ messages, channelName, channels }: ThreadChannelViewProps) {
  const threadTree = buildThreadTree(messages);
  const totalReplies = messages.length - threadTree.length;

  return (
    <div className="animate-fade-slide-up">
      <div className="glass p-6 mb-6 rounded-2xl border border-base-content/10 bg-gradient-to-r from-primary/5 to-transparent">
        <h1 className="text-3xl font-bold text-base-content bg-gradient-to-r from-primary to-primary-content bg-clip-text text-transparent">
          {channelName}
        </h1>
        <p className="text-sm text-muted mt-2 flex items-center gap-2">
          <span className="badge badge-primary badge-outline badge-sm">Thread</span>
          <span className="flex items-center gap-1">
            <FiMessageCircle className="text-xs" />
            {threadTree.length} threads
          </span>
          {totalReplies > 0 && (
            <span className="flex items-center gap-1">
              <FiGitBranch className="text-xs" />
              {totalReplies} replies
            </span>
          )}
        </p>
      </div>

      <div className="space-y-6">
        {threadTree.map((node) => (
          <ThreadNodeComponent key={node.message.id} node={node} channels={channels} />
        ))}
      </div>
      
      {threadTree.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-base-300/50 mb-4">
            <FiMessageCircle className="text-2xl text-muted" />
          </div>
          <h3 className="text-lg font-medium text-base-content mb-2">No threads yet</h3>
          <p className="text-sm text-muted">This thread channel doesn't have any messages.</p>
        </div>
      )}
    </div>
  );
}

interface ThreadNodeComponentProps {
  node: ThreadNode;
  channels: Channel[];
  depth?: number;
}

function ThreadNodeComponent({ node, channels, depth = 0 }: ThreadNodeComponentProps) {
  const [isCollapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const isLastChild = depth === 0; // For simplicity, treat all root nodes as last

  const handleToggle = () => setCollapsed(!isCollapsed);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle();
    }
  };

  return (
    <div className={clsx(
      'relative',
      depth > 0 && 'ml-8'
    )}>
      {/* Thread connection lines */}
      {depth > 0 && (
        <>
          {/* Vertical line */}
          <div 
            className="absolute left-4 top-0 w-px bg-gradient-to-b from-primary/20 to-transparent" 
            style={{ height: isLastChild ? '24px' : '100%' }}
          />
          {/* Horizontal connector */}
          <div className="absolute left-4 top-6 w-6 h-px bg-primary/20" />
          {/* Connection dot */}
          <div className="absolute left-10 top-5 w-2 h-2 rounded-full bg-primary/30 ring-2 ring-primary/10" />
        </>
      )}

      <div className={clsx(
        'relative transition-all duration-200',
        depth > 0 && 'pl-8'
      )}>
        <div className={clsx(
          'rounded-lg',
          depth === 0 && 'border border-base-content/10 hover:border-primary/30 bg-base-100/50',
          depth > 0 && 'bg-base-200/30 hover:bg-base-200/50'
        )}>
          <Message message={node.message} channels={channels} />
        </div>
      </div>

      {hasChildren && (
        <div className="mt-2">
          <button
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 focus-ring',
              'bg-primary/10 hover:bg-primary/20 text-primary hover:text-primary-content',
              'border border-primary/20 hover:border-primary/40',
              depth === 0 ? 'ml-12' : 'ml-20'
            )}
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
            role="button"
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? (
              <FiChevronRight className="transition-transform" />
            ) : (
              <FiChevronDown className="transition-transform" />
            )}
            <FiGitBranch className="text-xs" />
            <span className="font-medium">
              {node.children.length} {node.children.length === 1 ? 'reply' : 'replies'}
            </span>
          </button>

          {!isCollapsed && (
            <div className={clsx(
              'mt-3 space-y-3 animate-fade-slide-up',
              'relative'
            )}>
              {node.children.map((child, index) => (
                <ThreadNodeComponent 
                  key={child.message.id} 
                  node={child} 
                  channels={channels} 
                  depth={depth + 1} 
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildThreadTree(messages: MessageWithExtras[]): ThreadNode[] {
  const messageMap = new Map(messages.map(m => [m.id, { message: m, children: [] } as ThreadNode]));
  const rootNodes: ThreadNode[] = [];

  messages.forEach(message => {
    const node = messageMap.get(message.id)!;
    if (message.replyToId && messageMap.has(message.replyToId)) {
      messageMap.get(message.replyToId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  const sortNodes = (nodes: ThreadNode[]) => {
    nodes.sort((a, b) => new Date(a.message.platformCreatedAt).getTime() - new Date(b.message.platformCreatedAt).getTime());
    nodes.forEach(node => sortNodes(node.children));
  };

  sortNodes(rootNodes);

  return rootNodes;
}