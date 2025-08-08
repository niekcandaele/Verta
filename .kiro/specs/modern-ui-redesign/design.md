# Modern UI Redesign Design Document (Dark Theme — Purple Accent)

## Codebase Analysis

### Discovered Patterns and Conventions
- Component Organization: Channel-specific views in `/components/channels/`, shared components in `/components/`
- Styling System: Tailwind utilities with DaisyUI components, minimal custom CSS
- Type Safety: Shared TypeScript types across frontend/backend via `shared-types` package
- Static Generation: All data pre-fetched at build time via `getStaticProps`
- Theme System: CSS variables for dynamic branding with HSL color conversion

### Existing Systems to Extend
1. `Layout.tsx`: Header/sidebar structure to be enhanced for dark theme polish
2. `lib/theme.ts`: CSS variable-based branding; extend for purple accent and high-contrast
3. `/components/channels/`: Follow pattern for channel-specific rendering refinements
4. `Message.tsx`: Improve dark theme readability, mentions, reactions, attachments
5. DaisyUI Components: Use dark theme base with custom purple accent tokens

### Architectural Patterns to Follow
- Static site generation with Next.js `output: 'export'`
- Server-side data fetching only (no client-side state)
- Component composition over inheritance
- TypeScript for all new code
- Tailwind utility-first styling with DaisyUI components

### Implementation Reference Files
- `/frontend/components/Layout.tsx`
- `/frontend/components/Message.tsx`
- `/frontend/styles/globals.css`
- `/frontend/lib/theme.ts`
- `/frontend/components/channels/ForumChannelView.tsx`

### Code Style Requirements
- React functional components with TypeScript
- Tailwind classes for styling (avoid inline styles)
- DaisyUI component classes where applicable
- Type imports from `shared-types` package
- Consistent file naming: PascalCase for components, camelCase for utilities

## Extension vs. Creation Analysis

### Systems to Extend

1. `Layout.tsx` Enhancement
   - Dark theme-first design with glass navbar and elevated surfaces
   - Purple accent applied to interactive states and focus rings
   - Sidebar: collapsible groups, improved contrast, active state glow
   - Mobile drawer with scrim overlay and motion-safe transitions
   - Sync status chip with subtle pulse when active

2. `ChannelList.tsx` Improvements
   - Channel type icons with consistent sizing
   - Hierarchical indentation with accessible guides
   - Hover/active with purple accent ring and subtle background elevation
   - Keyboard navigable tree with ARIA tree/row/level semantics

3. `Message.tsx` Enhancements
   - Improved typography scale for dark backgrounds
   - Rich mentions with role colors and purple highlight for users
   - Reaction pills with compact density and focusable controls
   - Attachment preview cards with file-type icons and metadata

4. Theme System Extensions
   - Purple as primary accent with CSS variables and HSL control
   - High-contrast mode toggle with adjusted neutrals and borders
   - Smooth color transitions and reduced motion support
   - Tokenized elevation system with glass layers

### New Components

1. `MessageActions.tsx`
   - Copy link, copy content, share
   - Appears on hover/focus; accessible with keyboard
   - Emits `ui.message.copy`

2. `PageTransitionWrapper.tsx`
   - Subtle fade/slide transitions between pages
   - Respects `prefers-reduced-motion`
   - Hooks for performance timing

3. `ChannelTypeIcon.tsx`
   - Consistent iconography for channel types
   - Optional Discord `discordType` mapping
   - Accessible labels and sizes

## Overview

This redesign delivers a modern, sleek, dark-themed experience with a purple accent. It emphasizes readability, motion subtlety, and polished micro-interactions while keeping performance and accessibility as first-class goals.

### Key Objectives
- Default dark theme with purple as primary accent
- Modern visual language: glass surfaces, soft shadows, rounded corners
- Intuitive information architecture and discoverability
- High performance with static generation and lazy loading
- WCAG 2.1 AA compliance

### Non-Goals
- Real-time message updates
- Search functionality (deferred)
- Changes to static generation architecture
- Auth or personalization

## Architecture

### Component Hierarchy
```
Layout (dark themed)
├── Navbar (glass, purple accent)
│   ├── Brand Section (logo + name)
│   ├── Stats Display (discrete pills)
│   └── Theme/Contrast Toggle
├── Sidebar (elevated dark panel)
│   ├── ChannelList (tree with icons)
│   │   ├── ChannelCategory
│   │   └── ChannelItem
│   └── MobileDrawer (overlay)
└── Content Area
    ├── PageTransitionWrapper
    └── Channel Views
        ├── TextChannelView
        ├── ForumChannelView
        └── ThreadChannelView
```

### Data Flow
- Static JSON data → Build-time props → React components
- No client-side fetching

## Components and Interfaces

### Extended Components

#### `Layout.tsx` Enhancements
```typescript
interface LayoutProps {
  children: ReactNode;
  metadata: TenantMetadata;
  currentChannelId?: string;
  showMobileMenu?: boolean;
  syncStatus?: {
    lastSyncAt: Date;
    nextSyncAt?: Date;
    isActive: boolean;
  };
  highContrast?: boolean; // new
}
```
Additions:
- Dark glass navbar with backdrop blur and border
- Purple-accented interactive elements (`focus:ring-primary`)
- Sticky header, shadow elevation on scroll
- Sync status chip with subtle pulse when `isActive`
- Footer with build and sync metadata

#### `ChannelList.tsx` Enhancements
```typescript
interface ChannelListProps {
  channels: Channel[];
  currentChannelId?: string;
  collapsed?: boolean;
  onToggleCategory?: (id: string) => void;
}
```
Additions:
- ARIA tree semantics with keyboard navigation
- Icons via `ChannelTypeIcon.tsx`
- Active item purple glow and background elevation
- Expand/collapse with height transitions and motion-safe

#### `Message.tsx` Enhancements
- Typography tuned for dark: larger line-height, reduced contrast for metadata
- Mentions:
  - Users: purple background `bg-primary/15` with `text-primary`
  - Channels: blue background `bg-info/15` with `text-info`
  - Roles: role color or `text-secondary` with `bg-secondary/15`
- Reactions: small pill buttons with count and focusable
- Attachments: card with file icon, name, size, and hover elevation
- Message actions appear on row hover/focus; keyboard accessible

### New Components

#### `ChannelTypeIcon.tsx`
```typescript
interface ChannelTypeIconProps {
  type: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  discordType?: number;
}
```

#### `MessageActions.tsx`
```typescript
interface MessageActionsProps {
  message: Message;
  onCopy?: () => void;
}
```

#### `PageTransitionWrapper.tsx`
```typescript
interface PageTransitionWrapperProps {
  children: ReactNode;
  transitionKey: string;
  onTransitionComplete?: () => void;
}
```

## Data Models
- No changes. Use `TenantBranding` to set purple accent tokens, fallback to default purple when unspecified.

## Theming and Tokens

### CSS Variable Tokens (dark)
Add to `globals.css` and set via `lib/theme.ts`:
```
--bg: 222 14% 10%;          /* base-100 */
--panel: 222 14% 12%;       /* base-200 */
--elev: 222 14% 16%;        /* base-300 */
--text: 220 15% 96%;
--muted: 220 10% 70%;
--border: 220 10% 24%;

--primary-h: 265;           /* Purple hue */
--primary-s: 85%;
--primary-l: 62%;
--primary: var(--primary-h) var(--primary-s) var(--primary-l);

--info: 210 90% 66%;
--success: 142 70% 45%;
--warning: 40 90% 60%;
--error: 0 85% 60%;

/* Elevation/Glass */
--glass-alpha: 0.08;
--glass-alpha-hover: 0.12;
--ring-alpha: 0.35;
```

### Tailwind/DaisyUI Theme Mapping
- Set DaisyUI theme to dark base, override `primary` with HSL above:
  - `primary: hsl(var(--primary))`
  - `base-100: hsl(var(--bg))`, `base-200: hsl(var(--panel))`, `base-300: hsl(var(--elev))`
- Focus ring: `focus:ring-primary/40` for interactive elements

### High-Contrast Mode
- Toggle `data-contrast="high"` on `html` to:
  - Increase borders: `--border: 220 10% 32%`
  - Raise text contrast: `--muted: 220 10% 78%`
  - Stronger focus: `outline-2 outline-offset-2 outline-primary`

## Visual Language

- Dark base with subtle gradients on surfaces
- Purple accent for primary actions, active states, selected nav items
- Glass-morphism: backdrop blur on navbar/drawers/cards when supported
- Rounded corners (`rounded-xl`) and soft shadows for elevation
- Micro-interactions: opacity/transform transitions under 200ms

## Implementation Details

### Glass-morphism Utilities
```css
.glass {
  @apply bg-base-300/60 border border-base-content/10;
}
@supports (backdrop-filter: blur(16px)) {
  .glass { backdrop-filter: blur(16px); }
}
.glass-hover { @apply transition-colors duration-200 hover:bg-base-300/75; }
```

### Animation System
```css
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-slide-up {
  animation: fadeSlideUp 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}
@media (prefers-reduced-motion: reduce) {
  .animate-fade-slide-up { animation: none; }
}
```

### Channel Type Icons Mapping
```typescript
const channelIcons: Record<number, string> = {
  0: '📝',  // GUILD_TEXT
  5: '📢',  // GUILD_ANNOUNCEMENT
  15: '📋', // GUILD_FORUM
  11: '🧵', // PUBLIC_THREAD
  12: '🧵', // PRIVATE_THREAD
};
```

### Responsive Breakpoints
- Use default Tailwind breakpoints; add `xs: '475px'` for tighter layouts:
```js
screens: { xs: '475px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px' }
```

## Accessibility

- WCAG 2.1 AA: contrast checks on all combinations
- Keyboard navigation across tree, messages, reactions, actions
- ARIA roles:
  - Sidebar: `role="tree"`, items: `role="treeitem"`, groups: `role="group"`
  - Reactions: `role="button"` with `aria-pressed` when applicable
  - Mentions: `aria-label="@user"`, `#channel`, `@role`
- Focus styles: visible `ring ring-primary/40` and high-contrast variant
- Reduced motion: respect `prefers-reduced-motion`
- Touch targets: min 44x44px on mobile

## Channel-Specific Views

- Forum: card grid with clear separation, reply counts as purple chips
- Thread: indented hierarchy with connector lines using low-contrast borders
- Expand/collapse controls: caret buttons with keyboard support
- Breadcrumbs with truncation and tooltips for long names

## Message Display

- Markdown rendering with sanitized HTML, code blocks in elevated panels
- Timestamps: relative + tooltip absolute
- Reactions: emoji + count pills with hover and focus states
- Attachments: icon, filename, size; images lazy-loaded with aspect ratio boxes
- Mentions styled with background tints, consistent padding, rounded

## Layout and Navigation

- Fixed sidebar with collapsible categories
- Mobile: drawer activated from navbar, body scroll lock, tappable scrim
- Active channel persists across navigation
- Breadcrumbs in content header; shows channel path and type icon

## Theming and Branding

- Tenant branding supports custom purple hue via `TenantBranding.primary`
- Auto-adjust derived tokens to maintain contrast
- Logo in navbar, monochrome variant used on dark; validate MIME types
- Smooth theme transitions with CSS transitions on color tokens

## Performance

- Target <2s page load; optimize assets and pre-render critical routes
- Pagination for 10,000+ messages with windowed rendering where possible
- 60fps scrolling with `will-change` hints and GPU-friendly transforms
- Lazy-load images/attachments with `loading="lazy"` and `decoding="async"`

## Security Considerations

- Strict sanitization on Markdown (no raw HTML injection)
- Theme variable validation: `validateHexColor` for branding inputs
- CSP headers limiting sources; data URLs only for images
- Defensive fallbacks for logos and avatars

## Testing Strategy

- Unit: theme utilities, icon mapping, mention parser
- Integration: responsive layouts, sidebar tree keyboard nav, page transitions
- E2E: navigation, forum/thread interactions, message actions
- Visual regression: dark theme snapshots across breakpoints
- Accessibility: axe-core checks, keyboard traps, focus order
- Performance: Lighthouse CI with budgets; 90+ performance, 95+ accessibility

## Documentation

- Getting Started: dark theme overview, purple branding guidelines
- Style Guide: elevation, glass, motion, focus, density
- Accessibility Guide: keyboard map, high-contrast toggle
- Developer Guide: theme tokens, adding channel types, testing setup
- Versioned in `/docs`, include component API auto-gen

## Success Metrics

- Page load < 2s
- Lighthouse Performance > 90
- Lighthouse Accessibility > 95
- Mobile Usability > 95
- Zero layout shift during navigation (CLS ~0)

## Implementation Snippets

### Theme Initialization (`lib/theme.ts`)
```typescript
export function applyBranding(branding?: TenantBranding) {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;

  const primary = branding?.primary && validateHexColor(branding.primary)
    ? hexToHsl(branding.primary)
    : { h: 265, s: 85, l: 62 }; // default purple

  root.style.setProperty('--primary-h', String(primary.h));
  root.style.setProperty('--primary-s', `${primary.s}%`);
  root.style.setProperty('--primary-l', `${primary.l}%`);
}
```

### Focus and Density Utilities (in `globals.css`)
```css
.focus-ring {
  @apply focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-0;
}
.density-compact .message {
  @apply py-1.5;
}
```

### Sidebar Item (example Tailwind)
```tsx
<li
  role="treeitem"
  aria-level={level}
  aria-selected={active}
  className={clsx(
    'group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer',
    active
      ? 'bg-base-300/70 shadow-sm ring-1 ring-primary/20 text-base-content'
      : 'hover:bg-base-300/40 text-base-content/80'
  )}
>
  <ChannelTypeIcon discordType={meta?.type} size="sm" className="opacity-90" />
  <span className="truncate">{name}</span>
</li>
```

## Acceptance Criteria Alignment (Dark Theme Focus)

- Dark theme enabled by default, with purple as the primary accent
- Proper contrast ratios preserved across states and surfaces
- Channel icons and types visually distinct and accessible
- Mentions, reactions, and attachments styled for clarity on dark backgrounds
- Responsive behavior for mobile and tablet with drawer and touch targets
- Animations subtle, performant, and reduced when requested
- Theming supports tenant branding without violating contrast
- All interactive elements have visible focus indicators with purple accent

## Out of Scope
- Real-time updates
- Auth/personalization
- Search
- DM archives
- Voice history

## Change Log
- Introduced dark theme tokens and purple accent mapping
- Added high-contrast mode and motion preferences support
- Updated component styling for dark readability and modern look
- Defined glass and elevation system with progressive enhancement
- Strengthened accessibility and testing plans to reflect dark theme needs