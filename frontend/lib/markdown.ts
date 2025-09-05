/**
 * Frontend markdown utilities with sanitization
 */

/**
 * Rehype-sanitize schema for markdown content
 * Only allows safe HTML elements and attributes
 */
export const markdownSanitizeSchema = {
  tagNames: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'del', 's',
    'ul', 'ol', 'li',
    'blockquote',
    'code', 'pre',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  attributes: {
    a: ['href', 'title'],
    code: ['className'],
    pre: ['className'],
  },
  protocols: {
    href: ['http', 'https', 'mailto'],
  },
  strip: ['script', 'style'],
};

/**
 * Strip markdown formatting for plain text preview
 */
export function stripMarkdown(content: string): string {
  if (!content) return '';

  let stripped = content;

  // Remove code blocks
  stripped = stripped.replace(/```[\s\S]*?```/g, '');
  
  // Remove inline code
  stripped = stripped.replace(/`([^`]+)`/g, '$1');
  
  // Remove bold and italic
  stripped = stripped.replace(/(\*\*|__)(.*?)\1/g, '$2');
  stripped = stripped.replace(/(\*|_)(.*?)\1/g, '$2');
  
  // Remove strikethrough
  stripped = stripped.replace(/~~(.*?)~~/g, '$1');
  
  // Remove headings
  stripped = stripped.replace(/^#+\s+/gm, '');
  
  // Remove links but keep text
  stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove blockquotes
  stripped = stripped.replace(/^>\s+/gm, '');
  
  // Remove horizontal rules
  stripped = stripped.replace(/^---+$/gm, '');
  
  // Remove list markers
  stripped = stripped.replace(/^[\*\-\+]\s+/gm, '');
  stripped = stripped.replace(/^\d+\.\s+/gm, '');
  
  return stripped.trim();
}

/**
 * Get a truncated preview of markdown content
 */
export function getMarkdownPreview(content: string, maxLength: number = 200): string {
  const stripped = stripMarkdown(content);
  
  if (stripped.length <= maxLength) {
    return stripped;
  }
  
  // Try to break at a word boundary
  const truncated = stripped.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

/**
 * Validate if a URL is safe for markdown links
 */
export function isUrlSafe(url: string): boolean {
  if (!url) return false;

  const lowerUrl = url.toLowerCase();
  
  // Block dangerous schemes
  const dangerousSchemes = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
    'about:',
    'chrome:',
  ];
  
  for (const scheme of dangerousSchemes) {
    if (lowerUrl.startsWith(scheme)) {
      return false;
    }
  }

  // Allow http, https, mailto, and relative URLs
  if (lowerUrl.startsWith('http://') || 
      lowerUrl.startsWith('https://') ||
      lowerUrl.startsWith('mailto:') ||
      lowerUrl.startsWith('/') ||
      lowerUrl.startsWith('#')) {
    return true;
  }

  // Block everything else
  return false;
}