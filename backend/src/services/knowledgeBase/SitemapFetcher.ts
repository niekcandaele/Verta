import axios from 'axios';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import logger from '../../utils/logger.js';

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: string;
}

export interface SitemapFetchResult {
  success: boolean;
  urls: SitemapUrl[];
  errors: string[];
  fetchedAt: string;
  sitemapUrl: string;
}

/**
 * Service for fetching and parsing XML sitemaps
 * Handles both sitemap.xml files and sitemap index files
 */
export class SitemapFetcher {
  private readonly parser: XMLParser;
  private readonly maxUrls: number = 50000; // Reasonable limit to prevent memory issues
  private readonly requestTimeout: number = 30000; // 30 seconds

  constructor() {
    // Configure XML parser for sitemap processing
    this.parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true, // Remove namespace prefixes for simpler processing
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
    });
  }

  /**
   * Fetch and parse a sitemap from the given URL
   * Handles both regular sitemaps and sitemap index files
   */
  async fetchSitemap(sitemapUrl: string): Promise<SitemapFetchResult> {
    const startTime = Date.now();
    const fetchedAt = new Date().toISOString();
    const errors: string[] = [];

    logger.info('Fetching sitemap', { sitemapUrl });

    try {
      // Validate URL format
      if (!this.isValidSitemapUrl(sitemapUrl)) {
        return {
          success: false,
          urls: [],
          errors: ['Invalid sitemap URL format. Must be HTTPS and end with .xml'],
          fetchedAt,
          sitemapUrl,
        };
      }

      // Fetch the sitemap content
      const xmlContent = await this.fetchXmlContent(sitemapUrl);
      
      // Validate XML content
      const validationResult = XMLValidator.validate(xmlContent);
      if (validationResult !== true) {
        const errorMsg = typeof validationResult === 'object' 
          ? `XML validation error at line ${validationResult.err.line}: ${validationResult.err.msg}`
          : 'Invalid XML format';
        
        return {
          success: false,
          urls: [],
          errors: [errorMsg],
          fetchedAt,
          sitemapUrl,
        };
      }

      // Parse XML content
      const parsedXml = this.parser.parse(xmlContent);
      
      // Check if this is a sitemap index or regular sitemap
      const urls = await this.extractUrlsFromParsedXml(parsedXml, sitemapUrl);
      
      if (urls.length > this.maxUrls) {
        errors.push(`Sitemap contains ${urls.length} URLs, truncated to ${this.maxUrls} to prevent memory issues`);
        urls.splice(this.maxUrls);
      }

      const processingTime = Date.now() - startTime;
      logger.info('Sitemap fetched successfully', {
        sitemapUrl,
        urlCount: urls.length,
        processingTimeMs: processingTime,
        hasErrors: errors.length > 0,
      });

      return {
        success: true,
        urls,
        errors,
        fetchedAt,
        sitemapUrl,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const processingTime = Date.now() - startTime;

      logger.error('Failed to fetch sitemap', {
        sitemapUrl,
        error: errorMessage,
        processingTimeMs: processingTime,
      });

      return {
        success: false,
        urls: [],
        errors: [`Failed to fetch sitemap: ${errorMessage}`],
        fetchedAt,
        sitemapUrl,
      };
    }
  }

  /**
   * Validate sitemap URL format
   */
  private isValidSitemapUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return (
        parsedUrl.protocol === 'https:' &&
        (url.endsWith('.xml') || url.includes('sitemap'))
      );
    } catch {
      return false;
    }
  }

  /**
   * Fetch XML content from URL with proper headers and timeout
   */
  private async fetchXmlContent(url: string): Promise<string> {
    const response = await axios.get(url, {
      timeout: this.requestTimeout,
      headers: {
        'User-Agent': 'Verta Knowledge Base Crawler 1.0',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Encoding': 'gzip, deflate',
      },
      responseType: 'text',
      maxContentLength: 50 * 1024 * 1024, // 50MB max
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.data || typeof response.data !== 'string') {
      throw new Error('Empty or invalid response content');
    }

    return response.data;
  }

  /**
   * Extract URLs from parsed XML, handling both sitemaps and sitemap indexes
   */
  private async extractUrlsFromParsedXml(parsedXml: any, originalUrl: string): Promise<SitemapUrl[]> {
    // Check for sitemap index first
    if (parsedXml.sitemapindex && parsedXml.sitemapindex.sitemap) {
      return await this.processSitemapIndex(parsedXml.sitemapindex, originalUrl);
    }

    // Process regular sitemap
    if (parsedXml.urlset && parsedXml.urlset.url) {
      return this.processRegularSitemap(parsedXml.urlset);
    }

    // Try alternative structures (some sitemaps might be structured differently)
    if (parsedXml.sitemap && parsedXml.sitemap.url) {
      return this.processRegularSitemap(parsedXml.sitemap);
    }

    throw new Error('Unrecognized sitemap format: no urlset or sitemapindex found');
  }

  /**
   * Process sitemap index files that reference other sitemaps
   */
  private async processSitemapIndex(sitemapIndex: any, originalUrl: string): Promise<SitemapUrl[]> {
    const sitemaps = Array.isArray(sitemapIndex.sitemap) 
      ? sitemapIndex.sitemap 
      : [sitemapIndex.sitemap];

    const allUrls: SitemapUrl[] = [];
    const errors: string[] = [];

    logger.info('Processing sitemap index', {
      originalUrl,
      childSitemapCount: sitemaps.length,
    });

    // Process each child sitemap (with concurrency limit)
    const processPromises = sitemaps.slice(0, 10).map(async (sitemap: any) => { // Limit to 10 child sitemaps
      try {
        const sitemapUrl = sitemap.loc || sitemap['@_loc'];
        if (!sitemapUrl) {
          errors.push('Sitemap entry missing location URL');
          return [];
        }

        logger.debug('Fetching child sitemap', { childSitemapUrl: sitemapUrl });
        const childResult = await this.fetchSitemap(sitemapUrl);
        
        if (!childResult.success) {
          errors.push(`Failed to fetch child sitemap ${sitemapUrl}: ${childResult.errors.join(', ')}`);
          return [];
        }

        return childResult.urls;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Error processing child sitemap: ${errorMsg}`);
        return [];
      }
    });

    const results = await Promise.allSettled(processPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allUrls.push(...result.value);
      } else {
        errors.push(`Child sitemap ${index} processing failed: ${result.reason}`);
      }
    });

    if (errors.length > 0) {
      logger.warn('Sitemap index processing had errors', {
        originalUrl,
        errorCount: errors.length,
        errors,
      });
    }

    return allUrls;
  }

  /**
   * Process regular sitemap files with URL entries
   */
  private processRegularSitemap(urlSet: any): SitemapUrl[] {
    const urls = Array.isArray(urlSet.url) ? urlSet.url : [urlSet.url];
    const processedUrls: SitemapUrl[] = [];

    for (const urlEntry of urls) {
      try {
        const url = this.extractSitemapUrl(urlEntry);
        if (url) {
          processedUrls.push(url);
        }
      } catch (error) {
        logger.debug('Skipping invalid URL entry', {
          error: error instanceof Error ? error.message : String(error),
          urlEntry,
        });
        // Skip invalid entries rather than failing entire sitemap
        continue;
      }
    }

    return processedUrls;
  }

  /**
   * Extract URL information from a single sitemap URL entry
   */
  private extractSitemapUrl(urlEntry: any): SitemapUrl | null {
    // Handle different XML parser output formats
    const loc = urlEntry.loc || urlEntry['#text'] || (typeof urlEntry === 'string' ? urlEntry : null);
    
    if (!loc || typeof loc !== 'string') {
      return null;
    }

    // Validate the URL
    try {
      new URL(loc);
    } catch {
      return null; // Skip invalid URLs
    }

    const sitemapUrl: SitemapUrl = { loc };

    // Extract optional metadata
    if (urlEntry.lastmod) {
      sitemapUrl.lastmod = urlEntry.lastmod;
    }

    if (urlEntry.changefreq && this.isValidChangefreq(urlEntry.changefreq)) {
      sitemapUrl.changefreq = urlEntry.changefreq;
    }

    if (urlEntry.priority) {
      sitemapUrl.priority = String(urlEntry.priority);
    }

    return sitemapUrl;
  }

  /**
   * Validate changefreq value according to sitemap protocol
   */
  private isValidChangefreq(value: any): value is SitemapUrl['changefreq'] {
    const validValues = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
    return typeof value === 'string' && validValues.includes(value as any);
  }
}