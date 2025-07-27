import type { TenantBranding } from 'shared-types';

// Default theme colors if no branding is configured
const DEFAULT_THEME = {
  primaryColor: '#570df8', // Purple
  secondaryColor: '#f000b8', // Pink
  accentColor: '#37cdbe', // Teal
};

/**
 * Apply tenant branding colors to the document using CSS variables
 */
export function applyBrandingTheme(branding: TenantBranding | null) {
  const theme = branding || DEFAULT_THEME;
  
  // Apply colors as CSS variables on the root element
  const root = document.documentElement;
  
  // Convert hex colors to HSL for DaisyUI theme system
  const primaryHSL = hexToHSL(theme.primaryColor);
  const secondaryHSL = hexToHSL(theme.secondaryColor);
  const accentHSL = hexToHSL(theme.accentColor);
  
  // Set CSS variables that DaisyUI uses
  root.style.setProperty('--p', primaryHSL);
  root.style.setProperty('--s', secondaryHSL);
  root.style.setProperty('--a', accentHSL);
  
  // Also set the hex values for direct use
  root.style.setProperty('--brand-primary', theme.primaryColor);
  root.style.setProperty('--brand-secondary', theme.secondaryColor);
  root.style.setProperty('--brand-accent', theme.accentColor);
}

/**
 * Convert hex color to HSL format for DaisyUI
 * Returns a string in the format "hue saturation% lightness%"
 */
function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Get a data URL for the tenant logo or return null
 */
export function getTenantLogoUrl(branding: TenantBranding | null): string | null {
  if (!branding || !branding.logo) {
    return null;
  }
  
  // If logo is already a data URL, return it
  if (branding.logo.startsWith('data:')) {
    return branding.logo;
  }
  
  // Otherwise, assume it's base64 and add the data URL prefix
  // Assume PNG format if not specified
  return `data:image/png;base64,${branding.logo}`;
}