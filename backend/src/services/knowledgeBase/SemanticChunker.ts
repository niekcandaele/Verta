import logger from '../../utils/logger.js';
import type { ExtractedContent, HeadingNode } from './ContentExtractor.js';

export interface ChunkMetadata {
  chunkIndex: number;
  totalChunks: number;
  startCharIndex: number;
  endCharIndex: number;
  overlapWithPrevious: number;
  chunkMethod: 'semantic' | 'fixed_size' | 'structural';
  tokenCount: number;
  title?: string;
  headingHierarchy: HeadingNode[];
}

export interface SemanticChunk {
  content: string;
  metadata: ChunkMetadata;
}

export interface ChunkingResult {
  chunks: SemanticChunk[];
  totalTokens: number;
  averageChunkSize: number;
  chunkingMethod: string;
  processingStats: {
    semanticChunks: number;
    structuralChunks: number;
    fixedSizeChunks: number;
    totalProcessingTimeMs: number;
  };
}

/**
 * Hybrid semantic chunker that uses HTML structure awareness
 * Implements the design document's chunking strategy:
 * - Primary: Semantic chunking with HTML structure awareness
 * - Target: 300-500 tokens with max 800 tokens per chunk
 * - Overlap: 20% overlap between consecutive chunks
 * - Fallback: Fixed-size chunking for unstructured content
 */
export class SemanticChunker {
  private readonly targetChunkSize: number = 400; // Target tokens
  private readonly minChunkSize: number = 300; // Minimum tokens
  private readonly maxChunkSize: number = 800; // Maximum tokens
  private readonly overlapPercentage: number = 0.2; // 20% overlap
  private readonly tokensPerWord: number = 1.3; // Approximate ratio for English

  /**
   * Chunk extracted content using hybrid semantic approach
   */
  async chunkContent(extractedContent: ExtractedContent): Promise<ChunkingResult> {
    const startTime = Date.now();
    
    logger.info('Starting content chunking', {
      url: extractedContent.metadata.url,
      contentLength: extractedContent.content.length,
      headingCount: extractedContent.headingHierarchy.length,
    });

    try {
      const chunks = await this.performChunking(extractedContent);
      const processingTime = Date.now() - startTime;

      // Calculate statistics
      const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.metadata.tokenCount, 0);
      const averageChunkSize = chunks.length > 0 ? totalTokens / chunks.length : 0;
      
      const processingStats = this.calculateProcessingStats(chunks, processingTime);

      const result: ChunkingResult = {
        chunks,
        totalTokens,
        averageChunkSize,
        chunkingMethod: 'hybrid_semantic',
        processingStats,
      };

      logger.info('Content chunking completed', {
        url: extractedContent.metadata.url,
        chunkCount: chunks.length,
        totalTokens,
        averageChunkSize: Math.round(averageChunkSize),
        processingTimeMs: processingTime,
        ...processingStats,
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Content chunking failed', {
        url: extractedContent.metadata.url,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Main chunking logic that applies hybrid strategy
   */
  private async performChunking(extractedContent: ExtractedContent): Promise<SemanticChunk[]> {
    const { content, headingHierarchy } = extractedContent;

    // If content is very short, return as single chunk
    if (this.estimateTokenCount(content) <= this.maxChunkSize) {
      return this.createSingleChunk(content, headingHierarchy);
    }

    // Try structural chunking first if we have good heading structure
    if (this.hasGoodStructure(headingHierarchy, content)) {
      const structuralChunks = this.performStructuralChunking(content, headingHierarchy);
      if (this.areChunksWellSized(structuralChunks)) {
        return this.addOverlapToChunks(structuralChunks);
      }
    }

    // Fall back to semantic chunking
    const semanticChunks = this.performSemanticChunking(content, headingHierarchy);
    if (this.areChunksWellSized(semanticChunks)) {
      return this.addOverlapToChunks(semanticChunks);
    }

    // Final fallback to fixed-size chunking
    const fixedChunks = this.performFixedSizeChunking(content, headingHierarchy);
    return this.addOverlapToChunks(fixedChunks);
  }

  /**
   * Create a single chunk for short content
   */
  private createSingleChunk(content: string, headingHierarchy: HeadingNode[]): SemanticChunk[] {
    return [{
      content: content.trim(),
      metadata: {
        chunkIndex: 0,
        totalChunks: 1,
        startCharIndex: 0,
        endCharIndex: content.length,
        overlapWithPrevious: 0,
        chunkMethod: 'semantic',
        tokenCount: this.estimateTokenCount(content),
        headingHierarchy,
      },
    }];
  }

  /**
   * Check if content has good structural organization for structural chunking
   */
  private hasGoodStructure(headings: HeadingNode[], content: string): boolean {
    const contentTokens = this.estimateTokenCount(content);
    const avgSectionSize = headings.length > 0 ? contentTokens / headings.length : contentTokens;
    
    return (
      headings.length >= 2 && // At least 2 headings
      headings.length <= 20 && // Not too many (overly fragmented)
      avgSectionSize >= this.minChunkSize && // Sections are substantial
      this.hasHierarchicalStructure(headings)
    );
  }

  /**
   * Check if headings have proper hierarchical structure
   */
  private hasHierarchicalStructure(headings: HeadingNode[]): boolean {
    const levels = headings.map(h => h.level);
    const uniqueLevels = new Set(levels);
    
    // Good structure has multiple levels but not too many
    return uniqueLevels.size >= 2 && uniqueLevels.size <= 4;
  }

  /**
   * Perform structural chunking based on heading hierarchy
   */
  private performStructuralChunking(content: string, headings: HeadingNode[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const contentLines = content.split('\n');
    
    // Find heading positions in content
    const headingPositions = this.findHeadingPositions(contentLines, headings);
    
    for (let i = 0; i < headingPositions.length; i++) {
      const startPos = headingPositions[i].position;
      const endPos = i < headingPositions.length - 1 
        ? headingPositions[i + 1].position 
        : contentLines.length;
      
      const sectionContent = contentLines.slice(startPos, endPos).join('\n').trim();
      
      if (sectionContent.length > 50) { // Skip very short sections
        const tokenCount = this.estimateTokenCount(sectionContent);
        
        // If section is too large, split it further
        if (tokenCount > this.maxChunkSize) {
          const subChunks = this.splitLargeSection(sectionContent, headings, i);
          chunks.push(...subChunks);
        } else {
          chunks.push({
            content: sectionContent,
            metadata: {
              chunkIndex: chunks.length,
              totalChunks: 0, // Will be updated later
              startCharIndex: this.calculateCharPosition(contentLines, startPos),
              endCharIndex: this.calculateCharPosition(contentLines, endPos),
              overlapWithPrevious: 0, // Will be calculated later
              chunkMethod: 'structural',
              tokenCount,
              title: headingPositions[i].heading.text,
              headingHierarchy: this.getRelevantHeadings(headings, headingPositions[i].heading),
            },
          });
        }
      }
    }

    // Update total chunks count
    chunks.forEach((chunk, index) => {
      chunk.metadata.chunkIndex = index;
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Perform semantic chunking by analyzing content breaks
   */
  private performSemanticChunking(content: string, headings: HeadingNode[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const sentences = this.splitIntoSentences(content);
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkStartIndex = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokenCount(sentence);
      
      // Check if adding this sentence would exceed max chunk size
      if (currentTokens + sentenceTokens > this.maxChunkSize && currentChunk.length > 0) {
        // Create chunk from current content
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            chunkIndex: chunks.length,
            totalChunks: 0, // Will be updated later
            startCharIndex: chunkStartIndex,
            endCharIndex: chunkStartIndex + currentChunk.length,
            overlapWithPrevious: 0, // Will be calculated later
            chunkMethod: 'semantic',
            tokenCount: currentTokens,
            headingHierarchy: this.getRelevantHeadingsForPosition(headings, chunkStartIndex),
          },
        });
        
        // Start new chunk
        chunkStartIndex = chunkStartIndex + currentChunk.length;
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        // Add sentence to current chunk
        if (currentChunk.length > 0) {
          currentChunk += ' ' + sentence;
        } else {
          currentChunk = sentence;
        }
        currentTokens += sentenceTokens;
      }
      
      // If we have enough content and hit a semantic break, consider chunking
      if (currentTokens >= this.minChunkSize && this.isSemanticBreak(sentences, i)) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            chunkIndex: chunks.length,
            totalChunks: 0,
            startCharIndex: chunkStartIndex,
            endCharIndex: chunkStartIndex + currentChunk.length,
            overlapWithPrevious: 0,
            chunkMethod: 'semantic',
            tokenCount: currentTokens,
            headingHierarchy: this.getRelevantHeadingsForPosition(headings, chunkStartIndex),
          },
        });
        
        chunkStartIndex = chunkStartIndex + currentChunk.length;
        currentChunk = '';
        currentTokens = 0;
      }
    }
    
    // Add remaining content as final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          chunkIndex: chunks.length,
          totalChunks: 0,
          startCharIndex: chunkStartIndex,
          endCharIndex: chunkStartIndex + currentChunk.length,
          overlapWithPrevious: 0,
          chunkMethod: 'semantic',
          tokenCount: currentTokens,
          headingHierarchy: this.getRelevantHeadingsForPosition(headings, chunkStartIndex),
        },
      });
    }

    // Update total chunks count
    chunks.forEach((chunk, index) => {
      chunk.metadata.chunkIndex = index;
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Perform fixed-size chunking as fallback
   */
  private performFixedSizeChunking(content: string, headings: HeadingNode[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const words = content.split(/\s+/);
    const wordsPerChunk = Math.floor(this.targetChunkSize / this.tokensPerWord);
    
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      const chunkContent = chunkWords.join(' ');
      const startCharIndex = this.calculateCharIndexFromWords(words, i);
      
      chunks.push({
        content: chunkContent,
        metadata: {
          chunkIndex: chunks.length,
          totalChunks: 0,
          startCharIndex,
          endCharIndex: startCharIndex + chunkContent.length,
          overlapWithPrevious: 0,
          chunkMethod: 'fixed_size',
          tokenCount: this.estimateTokenCount(chunkContent),
          headingHierarchy: this.getRelevantHeadingsForPosition(headings, startCharIndex),
        },
      });
    }

    // Update total chunks count
    chunks.forEach((chunk, index) => {
      chunk.metadata.chunkIndex = index;
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Add overlap between consecutive chunks
   */
  private addOverlapToChunks(chunks: SemanticChunk[]): SemanticChunk[] {
    if (chunks.length <= 1) return chunks;

    for (let i = 1; i < chunks.length; i++) {
      const prevChunk = chunks[i - 1];
      const currentChunk = chunks[i];
      
      // Calculate overlap size in tokens
      const overlapTokens = Math.floor(prevChunk.metadata.tokenCount * this.overlapPercentage);
      
      if (overlapTokens > 0) {
        // Get overlap content from end of previous chunk
        const overlapContent = this.getOverlapContent(prevChunk.content, overlapTokens);
        
        // Prepend overlap to current chunk
        if (overlapContent) {
          currentChunk.content = overlapContent + ' ' + currentChunk.content;
          currentChunk.metadata.overlapWithPrevious = this.estimateTokenCount(overlapContent);
          currentChunk.metadata.tokenCount += currentChunk.metadata.overlapWithPrevious;
        }
      }
    }

    return chunks;
  }

  /**
   * Get overlap content from the end of a chunk
   */
  private getOverlapContent(content: string, targetTokens: number): string {
    const words = content.split(/\s+/);
    const targetWords = Math.floor(targetTokens / this.tokensPerWord);
    const startIndex = Math.max(0, words.length - targetWords);
    
    return words.slice(startIndex).join(' ');
  }

  /**
   * Check if chunks are well-sized according to our criteria
   */
  private areChunksWellSized(chunks: SemanticChunk[]): boolean {
    if (chunks.length === 0) return false;
    
    const avgSize = chunks.reduce((sum, chunk) => sum + chunk.metadata.tokenCount, 0) / chunks.length;
    const oversizedChunks = chunks.filter(chunk => chunk.metadata.tokenCount > this.maxChunkSize).length;
    const undersizedChunks = chunks.filter(chunk => chunk.metadata.tokenCount < this.minChunkSize).length;
    
    return (
      avgSize >= this.minChunkSize &&
      avgSize <= this.maxChunkSize &&
      oversizedChunks <= chunks.length * 0.1 && // Max 10% oversized
      undersizedChunks <= chunks.length * 0.2    // Max 20% undersized
    );
  }

  /**
   * Estimate token count from text
   */
  private estimateTokenCount(text: string): number {
    if (!text || text.trim().length === 0) return 0;
    
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return Math.ceil(words.length * this.tokensPerWord);
  }

  /**
   * Split content into sentences for semantic analysis
   */
  private splitIntoSentences(content: string): string[] {
    // Simple sentence splitting - could be enhanced with NLP library
    return content
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10); // Filter out very short fragments
  }

  /**
   * Detect semantic breaks in sentence sequence
   */
  private isSemanticBreak(sentences: string[], index: number): boolean {
    if (index >= sentences.length - 1) return true;
    
    const current = sentences[index];
    const next = sentences[index + 1];
    
    // Simple heuristics for semantic breaks
    const breakIndicators = [
      /^(however|therefore|moreover|furthermore|in conclusion|finally)/i,
      /^(on the other hand|in contrast|alternatively)/i,
      /^(first|second|third|next|then|after|before)/i,
    ];
    
    return breakIndicators.some(pattern => pattern.test(next)) ||
           this.hasTopicShift(current, next);
  }

  /**
   * Detect topic shifts between sentences (simplified)
   */
  private hasTopicShift(current: string, next: string): boolean {
    // Very basic topic shift detection - in production, would use embeddings
    const currentWords = new Set(current.toLowerCase().split(/\s+/));
    const nextWords = new Set(next.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...currentWords].filter(x => nextWords.has(x)));
    const union = new Set([...currentWords, ...nextWords]);
    
    const similarity = intersection.size / union.size;
    return similarity < 0.2; // Low similarity indicates topic shift
  }

  // Helper methods for structural chunking
  private findHeadingPositions(contentLines: string[], headings: HeadingNode[]): Array<{heading: HeadingNode, position: number}> {
    const positions: Array<{heading: HeadingNode, position: number}> = [];
    
    for (const heading of headings) {
      const position = contentLines.findIndex(line => 
        line.trim().includes(heading.text.trim()) && 
        line.trim().length < heading.text.length + 20 // Approximate match
      );
      
      if (position !== -1) {
        positions.push({ heading, position });
      }
    }
    
    return positions.sort((a, b) => a.position - b.position);
  }

  private calculateCharPosition(contentLines: string[], lineIndex: number): number {
    return contentLines.slice(0, lineIndex).reduce((sum, line) => sum + line.length + 1, 0);
  }

  private calculateCharIndexFromWords(words: string[], wordIndex: number): number {
    return words.slice(0, wordIndex).reduce((sum, word) => sum + word.length + 1, 0);
  }

  private splitLargeSection(content: string, headings: HeadingNode[], headingIndex: number): SemanticChunk[] {
    // Split large sections using semantic chunking
    return this.performSemanticChunking(content, 
      this.getRelevantHeadings(headings, headings[headingIndex]));
  }

  private getRelevantHeadings(allHeadings: HeadingNode[], currentHeading: HeadingNode): HeadingNode[] {
    const currentIndex = allHeadings.indexOf(currentHeading);
    if (currentIndex === -1) return [];
    
    // Return hierarchy leading to current heading
    const relevantHeadings: HeadingNode[] = [];
    
    for (let i = 0; i <= currentIndex; i++) {
      const heading = allHeadings[i];
      if (heading.level <= currentHeading.level) {
        // Add parent headings and the current heading
        relevantHeadings.push(heading);
      }
    }
    
    return relevantHeadings;
  }

  private getRelevantHeadingsForPosition(headings: HeadingNode[], _position: number): HeadingNode[] {
    // For now, return all headings - in production, would calculate based on position
    return headings.slice(0, 3); // Limit to first 3 for performance
  }

  private calculateProcessingStats(chunks: SemanticChunk[], processingTime: number) {
    const semanticChunks = chunks.filter(c => c.metadata.chunkMethod === 'semantic').length;
    const structuralChunks = chunks.filter(c => c.metadata.chunkMethod === 'structural').length;
    const fixedSizeChunks = chunks.filter(c => c.metadata.chunkMethod === 'fixed_size').length;
    
    return {
      semanticChunks,
      structuralChunks,
      fixedSizeChunks,
      totalProcessingTimeMs: processingTime,
    };
  }
}