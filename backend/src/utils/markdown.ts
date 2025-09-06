/**
 * Markdown sanitization utilities
 * Ensures only safe markdown features are allowed
 */

/**
 * List of allowed markdown features
 * These are considered safe for user-generated content
 */
export const ALLOWED_MARKDOWN_FEATURES = {
  bold: true, // **text** or __text__
  italic: true, // *text* or _text_
  strikethrough: true, // ~~text~~
  headings: true, // # Heading
  lists: true, // - item or 1. item
  links: true, // [text](url) - URLs will be validated
  code: true, // `inline code`
  codeBlocks: true, // ```code blocks```
  blockquotes: true, // > quote
  horizontalRule: true, // ---
  lineBreaks: true, // Two spaces at end of line
};

/**
 * List of HTML tags to strip from markdown
 * These could be used for XSS attacks
 */
const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'style',
  'link',
  'meta',
  'base',
];

/**
 * List of dangerous URL schemes to block
 */
const DANGEROUS_SCHEMES = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'about:',
  'chrome:',
];

/**
 * Sanitize markdown content
 * Removes dangerous HTML and validates URLs
 */
export function sanitizeMarkdown(content: string): string {
  if (!content) return '';

  let sanitized = content;

  // Remove HTML tags that could be dangerous
  DANGEROUS_TAGS.forEach((tag) => {
    const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gi');
    sanitized = sanitized.replace(regex, '');
    const selfClosing = new RegExp(`<${tag}[^>]*/>`, 'gi');
    sanitized = sanitized.replace(selfClosing, '');
  });

  // Remove dangerous URL schemes from links
  DANGEROUS_SCHEMES.forEach((scheme) => {
    const regex = new RegExp(`\\[([^\\]]+)\\]\\(${scheme}[^)]*\\)`, 'gi');
    sanitized = sanitized.replace(regex, '$1'); // Keep text, remove link
  });

  // Remove on* event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Limit heading levels (max h4 for user content)
  sanitized = sanitized.replace(/^#{5,}\s/gm, '#### ');

  return sanitized;
}

/**
 * Validate if a URL is safe to include in markdown
 */
export function isUrlSafe(url: string): boolean {
  if (!url) return false;

  const lowerUrl = url.toLowerCase();

  // Check for dangerous schemes
  for (const scheme of DANGEROUS_SCHEMES) {
    if (lowerUrl.startsWith(scheme)) {
      return false;
    }
  }

  // Allow http, https, and relative URLs
  if (
    lowerUrl.startsWith('http://') ||
    lowerUrl.startsWith('https://') ||
    lowerUrl.startsWith('/') ||
    lowerUrl.startsWith('#')
  ) {
    return true;
  }

  // Block everything else
  return false;
}

/**
 * Strip all markdown formatting
 * Useful for generating plain text previews
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
  stripped = stripped.replace(/^[*\-+]\s+/gm, '');
  stripped = stripped.replace(/^\d+\.\s+/gm, '');

  return stripped.trim();
}

/**
 * Get a safe preview of markdown content
 * Truncates to specified length and strips formatting
 */
export function getMarkdownPreview(
  content: string,
  maxLength: number = 200
): string {
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
