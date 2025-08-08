import type { TenantBranding } from 'shared-types';

/**
 * Validates if a string is a valid 3 or 6-digit hex color.
 */
function validateHexColor(hex: string): boolean {
  return /^#?([0-9A-F]{3}){1,2}$/i.test(hex);
}

/**
 * Converts a hex color string to an HSL object.
 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Applies tenant branding to the document root.
 * Sets CSS variables for the primary color hue, saturation, and lightness.
 */
export function applyBranding(branding?: TenantBranding | null) {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;

  // Enable smooth color transitions
  root.style.setProperty('transition', 'background-color 200ms ease-in-out, color 200ms ease-in-out');

  let primary = { h: 265, s: 85, l: 62 }; // Default purple

  if (branding && branding.primaryColor && validateHexColor(branding.primaryColor)) {
    primary = hexToHsl(branding.primaryColor);
  }

  root.style.setProperty('--primary-h', String(primary.h));
  root.style.setProperty('--primary-s', `${primary.s}%`);
  root.style.setProperty('--primary-l', `${primary.l}%`);
  
  // Set secondary color based on primary if not provided
  if (branding && branding.secondaryColor && validateHexColor(branding.secondaryColor)) {
    const secondary = hexToHsl(branding.secondaryColor);
    root.style.setProperty('--secondary', `${secondary.h} ${secondary.s}% ${secondary.l}%`);
  }
}

/**
 * Toggles high-contrast mode by setting a data attribute on the HTML element
 * and persisting the preference in localStorage.
 */
export function toggleHighContrast(enable?: boolean) {
  const root = document.documentElement;
  const isEnabled = enable ?? !root.hasAttribute('data-contrast');
  
  if (isEnabled) {
    root.setAttribute('data-contrast', 'high');
    localStorage.setItem('highContrast', 'true');
  } else {
    root.removeAttribute('data-contrast');
    localStorage.setItem('highContrast', 'false');
  }
}

/**
 * Applies the saved high-contrast preference from localStorage on initial load.
 */
export function applySavedContrastPreference() {
  if (typeof window !== 'undefined') {
    const highContrast = localStorage.getItem('highContrast');
    if (highContrast === 'true') {
      document.documentElement.setAttribute('data-contrast', 'high');
    }
  }
}