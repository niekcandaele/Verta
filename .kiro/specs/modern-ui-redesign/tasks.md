# Implementation Tasks for Modern UI Redesign (Dark Theme — Purple Accent)

## Phase 1: Foundation and Theme System

- [ ] Set up dark theme CSS variables and tokens in globals.css
  ```
  Create CSS custom properties for dark theme with purple accent:
  - Define base colors (--bg, --panel, --elev, --text, --muted, --border)
  - Set up purple primary with HSL components (--primary-h, --primary-s, --primary-l)
  - Add semantic colors (--info, --success, --warning, --error)
  - Define glass effect alpha values
  - Implement high-contrast mode variables
  ```
  - Requirement: REQ-Theme-001 (Dark theme by default)
  - Design ref: Section "Theming and Tokens"

- [ ] Configure DaisyUI dark theme with custom purple primary
  ```
  Update tailwind.config.js to:
  - Set darkTheme: 'dark' as default
  - Override primary color with HSL custom properties
  - Map base-100/200/300 to dark background tokens
  - Add xs breakpoint (475px) for tighter mobile layouts
  ```
  - Requirement: REQ-Theme-002 (Purple accent color)
  - Design ref: Section "Tailwind/DaisyUI Theme Mapping"

- [ ] Extend theme.ts for dark theme branding support
  ```
  Enhance applyBranding function to:
  - Parse tenant branding colors and validate hex format
  - Convert to HSL and set CSS variables
  - Support purple hue override from tenant branding
  - Add high-contrast mode toggle function
  - Ensure smooth theme transitions
  ```
  - Requirement: REQ-Branding-001 (Dynamic tenant branding)
  - Design ref: Section "Theme Initialization"

- [ ] Create glass-morphism utility classes
  ```
  Add to globals.css:
  - .glass base class with backdrop blur support detection
  - .glass-hover for interactive glass surfaces
  - High-contrast mode adjustments
  - Progressive enhancement fallbacks
  ```
  - Requirement: REQ-Visual-001 (Modern UI patterns)
  - Design ref: Section "Glass-morphism Utilities"

## Phase 2: Layout and Navigation

- [ ] Enhance Layout.tsx with dark theme glass navbar
  ```
  Update Layout component to:
  - Apply glass effect to navbar with dark background
  - Add purple accent to brand section and active states
  - Implement sync status chip with pulse animation when active
  - Add high-contrast mode toggle in navbar
  - Create sticky header with shadow on scroll
  - Add footer with build metadata
  ```
  - Requirement: REQ-Layout-001 (Fixed navbar and sidebar)
  - Design ref: Section "Layout.tsx Enhancements"

- [ ] Implement responsive mobile drawer with dark theme
  ```
  Add mobile navigation drawer to Layout:
  - Dark overlay scrim with body scroll lock
  - Glass effect on drawer panel
  - Smooth slide animation respecting reduced motion
  - Touch-friendly close button and swipe gestures
  - Preserve drawer state across navigation
  ```
  - Requirement: REQ-Mobile-001 (Responsive design)
  - Design ref: Section "Layout and Navigation"

- [ ] Create ChannelTypeIcon.tsx component
  ```
  Build reusable channel icon component:
  - Map Discord channel types to emoji icons
  - Support size variants (sm, md, lg)
  - Add accessible labels for screen readers
  - Apply consistent opacity for dark theme
  ```
  - Requirement: REQ-Nav-001 (Channel type indicators)
  - Design ref: Section "ChannelTypeIcon.tsx"

- [ ] Enhance ChannelList.tsx with tree navigation
  ```
  Update channel list for dark theme and accessibility:
  - Implement ARIA tree semantics (tree, treeitem, group)
  - Add channel type icons using ChannelTypeIcon
  - Apply purple glow to active channel
  - Add hover states with subtle elevation
  - Implement keyboard navigation (arrow keys, enter)
  - Add expand/collapse for categories with smooth transitions
  ```
  - Requirement: REQ-Nav-002 (Hierarchical channel display)
  - Design ref: Section "ChannelList.tsx Enhancements"

## Phase 3: Message Display Enhancements

- [ ] Update Message.tsx typography for dark theme readability
  ```
  Enhance message component styling:
  - Increase line-height and adjust font sizes for dark backgrounds
  - Apply muted color to timestamps and metadata
  - Ensure sufficient contrast for all text elements
  - Add subtle hover state for message rows
  ```
  - Requirement: REQ-Content-001 (Enhanced readability)
  - Design ref: Section "Message.tsx Enhancements"

- [ ] Enhance mention rendering with role-based styling
  ```
  Update mention processing in Message.tsx:
  - User mentions: purple background (bg-primary/15) with text-primary
  - Channel mentions: blue background (bg-info/15) with text-info
  - Role mentions: use role color or secondary with bg-secondary/15
  - Add consistent padding and rounded corners
  - Ensure keyboard accessibility for all mention types
  ```
  - Requirement: REQ-Content-002 (Discord-style mentions)
  - Design ref: Section "Message Display"

- [ ] Improve reaction pills for dark theme
  ```
  Redesign reaction display:
  - Compact pill design with emoji and count
  - Make reactions focusable buttons
  - Add hover state with subtle elevation
  - Apply purple accent to user's own reactions
  - Support keyboard navigation between reactions
  ```
  - Requirement: REQ-Content-003 (Reaction display)
  - Design ref: Section "Message.tsx Enhancements"

- [ ] Create attachment preview cards
  ```
  Build attachment display component:
  - Dark elevated card with file type icon
  - Display filename, size, and metadata
  - Add hover elevation effect
  - Implement lazy loading for images
  - Maintain aspect ratios with placeholder boxes
  ```
  - Requirement: REQ-Content-004 (Attachment display)
  - Design ref: Section "Message Display"

- [ ] Implement MessageActions.tsx component
  ```
  Create message action menu:
  - Copy link, copy content, share actions
  - Appear on message hover/focus
  - Keyboard accessible (tab to focus, enter to activate)
  - Emit ui.message.copy event
  - Apply glass effect to action menu
  ```
  - Requirement: REQ-Interaction-001 (Message actions)
  - Design ref: Section "MessageActions.tsx"

## Phase 4: Channel-Specific Views

- [ ] Enhance ForumChannelView.tsx for dark theme
  ```
  Update forum view styling:
  - Dark elevated cards for posts
  - Purple accent chips for reply counts
  - Clear visual separation between posts
  - Improve contrast for post metadata
  - Add hover states for interactive elements
  ```
  - Requirement: REQ-Channel-001 (Forum channel display)
  - Design ref: Section "Channel-Specific Views"

- [ ] Update ThreadChannelView.tsx with hierarchy visualization
  ```
  Enhance thread view:
  - Indented hierarchy with low-contrast connector lines
  - Caret buttons for expand/collapse with keyboard support
  - Apply consistent dark theme styling
  - Add breadcrumbs with truncation and tooltips
  - Smooth height transitions for collapsing
  ```
  - Requirement: REQ-Channel-002 (Thread channel display)
  - Design ref: Section "Channel-Specific Views"

## Phase 5: Animations and Transitions

- [ ] Implement PageTransitionWrapper.tsx component
  ```
  Create page transition system:
  - Subtle fade and slide-up animation (180ms)
  - Use GPU-friendly transforms
  - Respect prefers-reduced-motion
  - Add performance timing hooks
  - Apply to all channel view changes
  ```
  - Requirement: REQ-UX-001 (Smooth transitions)
  - Design ref: Section "PageTransitionWrapper.tsx"

- [ ] Add micro-interactions and focus states
  ```
  Implement consistent interaction patterns:
  - Focus rings with purple accent (ring-primary/40)
  - Hover transitions under 200ms
  - Button press states with slight scale
  - Loading states with subtle pulse
  - All animations respect reduced motion preference
  ```
  - Requirement: REQ-UX-002 (Micro-interactions)
  - Design ref: Section "Animation System"

## Phase 6: Accessibility and Performance

- [ ] Implement high-contrast mode toggle
  ```
  Add contrast toggle feature:
  - Toggle data-contrast="high" on html element
  - Increase border contrast (--border: 220 10% 32%)
  - Raise text contrast (--muted: 220 10% 78%)
  - Stronger focus outlines (outline-2 outline-primary)
  - Persist preference in localStorage
  ```
  - Requirement: REQ-A11y-001 (High contrast support)
  - Design ref: Section "High-Contrast Mode"

- [ ] Add comprehensive keyboard navigation
  ```
  Implement keyboard support:
  - Channel tree navigation with arrow keys
  - Tab through messages, reactions, and actions
  - Enter/Space to activate buttons
  - Escape to close mobile drawer
  - Focus trap in modal contexts
  ```
  - Requirement: REQ-A11y-002 (Keyboard navigation)
  - Design ref: Section "Accessibility"

- [ ] Optimize performance for dark theme
  ```
  Performance enhancements:
  - Lazy load images with loading="lazy"
  - Add will-change hints for animations
  - Implement windowed rendering for long message lists
  - Optimize glass effect for GPU acceleration
  - Monitor and maintain Lighthouse scores
  ```
  - Requirement: REQ-Perf-001 (Page load < 2s)
  - Design ref: Section "Performance"

## Phase 7: Security and Testing

- [ ] Implement security controls for theming
  ```
  Add security measures:
  - Validate hex colors with regex before applying
  - Sanitize theme variables to prevent CSS injection
  - Restrict data URLs to image MIME types only
  - Add CSP headers for style-src
  - Implement safe fallbacks for invalid theme data
  ```
  - Requirement: REQ-Sec-001 (Theme validation)
  - Design ref: Section "Security Considerations"

- [ ] Set up visual regression testing
  ```
  Configure visual testing:
  - Dark theme snapshots for all components
  - Test across breakpoints (mobile, tablet, desktop)
  - Capture hover and focus states
  - Test high-contrast mode variations
  - Set up Chromatic or Percy integration
  ```
  - Requirement: REQ-Test-001 (Visual consistency)
  - Design ref: Section "Testing Strategy"

- [ ] Create comprehensive test suite
  ```
  Implement testing coverage:
  - Unit tests for theme utilities and color conversion
  - Integration tests for responsive behavior
  - E2E tests for navigation and interactions
  - Accessibility tests with axe-core
  - Performance tests with Lighthouse CI
  ```
  - Requirement: REQ-Test-002 (Test coverage)
  - Design ref: Section "Testing Strategy"

## Phase 8: Documentation and Polish

- [ ] Create dark theme style guide
  ```
  Document design system:
  - Color token reference with usage examples
  - Elevation and glass effect guidelines
  - Animation timing and easing standards
  - Focus state patterns
  - Component spacing and density rules
  ```
  - Requirement: REQ-Doc-001 (Style documentation)
  - Design ref: Section "Documentation"

- [ ] Write user migration guide
  ```
  Create user documentation:
  - Overview of dark theme changes
  - Purple accent usage explanation
  - High-contrast mode instructions
  - Keyboard navigation guide
  - Mobile gesture reference
  ```
  - Requirement: REQ-Doc-002 (User documentation)
  - Design ref: Section "Documentation"

- [ ] Final polish and optimization
  ```
  Complete final refinements:
  - Fine-tune animation timings
  - Adjust color contrast edge cases
  - Optimize bundle size
  - Validate all accessibility requirements
  - Ensure smooth upgrade path for existing users
  ```
  - Requirement: REQ-Polish-001 (Production ready)
  - Design ref: All sections

## Implementation Notes

- Start with Phase 1 to establish the dark theme foundation
- Test each phase thoroughly before proceeding to the next
- Ensure all changes maintain static site generation compatibility
- Keep accessibility as a first-class concern throughout
- Monitor performance metrics continuously
- Document any deviations from the design spec