# Verta Style Guide

This document outlines the design system and style guide for the Verta application.

## Color Tokens

The application uses a dark theme with a purple accent. The color system is based on HSL values, which are defined as CSS custom properties in `styles/globals.css`.

- **Primary:** `hsl(var(--primary))` - The main brand color, used for interactive elements and highlights.
- **Secondary:** `hsl(var(--secondary))` - A secondary brand color, used for less prominent interactive elements.
- **Accent:** `hsl(var(--accent))` - An accent color, used for special highlights.
- **Neutral:** `hsl(var(--neutral))` - A neutral color, used for text and borders.
- **Base:** `hsl(var(--bg))`, `hsl(var(--panel))`, `hsl(var(--elev))` - The base colors for the application background, panels, and elevated surfaces.

## Elevation and Glass Effect

The application uses a glass-morphism effect for some surfaces, such as the navbar and drawers. This is achieved using the `.glass` utility class, which applies a semi-transparent background color and a backdrop blur effect.

## Animation

The application uses subtle animations to provide a smooth user experience. Page transitions are handled by the `PageTransitionWrapper` component, which uses `framer-motion` to create a fade and slide-up animation.

## Focus States

All interactive elements have a visible focus state, which is implemented using the `.focus-ring` utility class. This class applies a colored ring around the focused element, ensuring that it is clearly visible to keyboard users.
