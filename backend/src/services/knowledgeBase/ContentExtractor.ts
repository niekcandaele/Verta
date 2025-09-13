import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../../utils/logger.js';

export interface HeadingNode {
  level: number;
  text: string;
  id?: string;
}

export interface ExtractedContent {
  title: string;
  content: string;
  headingHierarchy: HeadingNode[];
  metadata: {
    url: string;
    checksum: string;
    extractedAt: string;
    contentLength: number;
    headingCount: number;
    hasMainContent: boolean;
  };
}

export interface ContentExtractionResult {
  success: boolean;
  content?: ExtractedContent;
  error?: string;
}

/**
 * Service for extracting clean text content from HTML pages
 * Focuses on main content while preserving heading structure
 */
export class ContentExtractor {
  private readonly requestTimeout: number = 30000; // 30 seconds
  private readonly maxContentLength: number = 10 * 1024 * 1024; // 10MB
  
  // CSS selectors for content that should be excluded
  private readonly excludeSelectors = [
    'script',
    'style',
    'nav',
    'header',
    'footer', 
    '.navigation',
    '.nav',
    '.menu',
    '.sidebar',
    '.breadcrumb',
    '.ads',
    '.advertisement',
    '.social',
    '.share',
    '.comments',
    '.comment',
    '.related',
    '.pagination',
    '.pager',
    '.cookie',
    '.gdpr',
    '[role="banner"]',
    '[role="navigation"]',
    '[role="complementary"]',
    '[role="contentinfo"]',
  ];

  // CSS selectors for main content areas (in order of preference)
  private readonly mainContentSelectors = [
    'main',
    '[role="main"]',
    '.main-content',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    'article',
    '.markdown-body',
    '.documentation',
    '.docs-content',
  ];

  /**
   * Extract content from a URL
   */
  async extractFromUrl(url: string): Promise<ContentExtractionResult> {
    try {
      logger.info('Extracting content from URL', { url });

      const html = await this.fetchHtmlContent(url);
      const content = this.extractFromHtml(html, url);

      return {
        success: true,
        content,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Failed to extract content from URL', {
        url,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Extract content from HTML string
   */
  extractFromHtml(html: string, url: string): ExtractedContent {
    const $ = cheerio.load(html);
    const extractedAt = new Date().toISOString();

    // Calculate checksum of original HTML for change detection
    const checksum = crypto.createHash('sha256').update(html).digest('hex');

    // Remove excluded elements
    this.excludeSelectors.forEach(selector => {
      $(selector).remove();
    });

    // Extract title
    const title = this.extractTitle($, url);

    // Find main content area
    const mainContentArea = this.findMainContentArea($);

    // Extract heading hierarchy
    const headingHierarchy = this.extractHeadingHierarchy(mainContentArea);

    // Extract clean text content
    const content = this.extractCleanText(mainContentArea);

    // Determine if we found substantial main content
    const hasMainContent = this.hasSubstantialContent(content);

    const extractedContent: ExtractedContent = {
      title,
      content,
      headingHierarchy,
      metadata: {
        url,
        checksum,
        extractedAt,
        contentLength: content.length,
        headingCount: headingHierarchy.length,
        hasMainContent,
      },
    };

    logger.info('Content extracted successfully', {
      url,
      title,
      contentLength: content.length,
      headingCount: headingHierarchy.length,
      hasMainContent,
    });

    return extractedContent;
  }

  /**
   * Fetch HTML content from URL
   */
  private async fetchHtmlContent(url: string): Promise<string> {
    const response = await axios.get(url, {
      timeout: this.requestTimeout,
      headers: {
        'User-Agent': 'Verta Knowledge Base Crawler 1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      maxContentLength: this.maxContentLength,
      maxBodyLength: this.maxContentLength,
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.data || typeof response.data !== 'string') {
      throw new Error('Empty or invalid HTML content');
    }

    return response.data;
  }

  /**
   * Extract page title from various sources
   */
  private extractTitle($: cheerio.CheerioAPI, url: string): string {
    // Try different title sources in order of preference
    const titleSources = [
      'h1',
      'title',
      '[property="og:title"]',
      '[name="twitter:title"]',
      '.page-title',
      '.entry-title',
      '.post-title',
      '.article-title',
    ];

    for (const selector of titleSources) {
      const element = $(selector).first();
      if (element.length > 0) {
        const titleText = selector === '[property="og:title"]' || selector === '[name="twitter:title"]' 
          ? element.attr('content')
          : element.text();
        
        if (titleText && titleText.trim()) {
          return titleText.trim();
        }
      }
    }

    // Fallback to URL-based title
    try {
      const urlPath = new URL(url).pathname;
      return urlPath.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Untitled';
    } catch {
      return 'Untitled';
    }
  }

  /**
   * Find the main content area of the page
   */
  private findMainContentArea($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
    // Try main content selectors in order of preference
    for (const selector of this.mainContentSelectors) {
      const element = $(selector).first();
      if (element.length > 0 && element.text().trim().length > 100) {
        return element;
      }
    }

    // Fallback: use body but try to exclude obvious non-content
    const body = $('body');
    this.excludeSelectors.forEach(selector => {
      body.find(selector).remove();
    });
    
    return body;
  }

  /**
   * Extract heading hierarchy from content
   */
  private extractHeadingHierarchy($content: cheerio.Cheerio<AnyNode>): HeadingNode[] {
    const headings: HeadingNode[] = [];
    
    $content.find('h1, h2, h3, h4, h5, h6').each((_, element) => {
      const $heading = cheerio.load(element);
      const tagName = element.tagName.toLowerCase();
      const level = parseInt(tagName.substring(1), 10);
      const text = $heading.root().text().trim();
      const id = $heading.root().attr('id');

      if (text && text.length > 0 && text.length < 500) { // Reasonable heading length
        headings.push({
          level,
          text,
          id,
        });
      }
    });

    return headings;
  }

  /**
   * Extract clean text content, preserving structure
   */
  private extractCleanText($content: cheerio.Cheerio<AnyNode>): string {
    // Use Cheerio's built-in text() method for simplicity and reliability
    let cleanText = $content.text();
    
    // Normalize whitespace: replace multiple spaces/newlines with single spaces
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    // Clean up common HTML artifacts
    cleanText = cleanText.replace(/\s*\|\s*/g, ' | '); // Normalize table separators
    
    return cleanText;
  }


  /**
   * Determine if extracted content is substantial
   */
  private hasSubstantialContent(content: string): boolean {
    const minLength = 200; // Minimum content length
    const wordCount = content.split(/\s+/).length;
    const minWords = 30; // Minimum word count
    
    return content.length >= minLength && wordCount >= minWords;
  }

  /**
   * Calculate content checksum for change detection
   */
  calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}