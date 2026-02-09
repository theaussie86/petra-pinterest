---
name: brand-guidelines
description: Applies Petra Pinterest's brand colors, typography, and component styling to any UI work. Use when building new components, pages, or visual elements that should match the project's look-and-feel.
---

# Petra Pinterest Brand Styling

## Overview

Use this skill to apply Petra Pinterest's brand identity when creating or modifying UI components, pages, or visual elements.

**Keywords**: branding, visual identity, styling, brand colors, typography, design system, UI components

## Brand Guidelines

### Colors

**Main Colors:**

- Background: `#ffffff` — Page backgrounds, card surfaces
- Foreground: `#0a0a0a` — Primary text
- Muted: `#f5f5f5` — Subtle backgrounds, inactive states
- Muted Foreground: `#737373` — Secondary text, placeholders
- Border: `#e5e5e5` — Dividers, input borders

**Brand Colors:**

- Primary (Pinterest Red): `#e60023` — CTAs, active states, brand accents
- Primary Foreground: `#ffffff` — Text on primary backgrounds
- Ring/Focus: `#e60023` — Focus rings, selection indicators

**Semantic Colors:**

- Destructive: `#dc2626` — Error states, delete actions
- Destructive Foreground: `#ffffff` — Text on destructive backgrounds
- Accent: `#f5f5f5` — Hover backgrounds, secondary buttons
- Accent Foreground: `#0a0a0a` — Text on accent backgrounds

**Surface Colors:**

- Card: `#ffffff` with foreground `#0a0a0a`
- Popover: `#ffffff` with foreground `#0a0a0a`
- Input: `#e5e5e5`

### Typography

- **Font Stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif`
- Uses system font stack — no custom fonts required
- Body text is antialiased (`antialiased` class)

### Spacing & Radius

- Default border radius: `0.5rem` (8px)
- Follow Tailwind spacing scale for padding/margins

## Component Patterns

### Buttons

- Primary: Pinterest Red (`bg-primary text-primary-foreground`) with hover darkening
- Secondary/Ghost: Use `bg-accent text-accent-foreground` or transparent with border
- Destructive: `bg-destructive text-destructive-foreground`

### Cards

- White background with subtle border (`border`)
- Use `rounded-lg` (inherits `--radius-default`)
- Card header with title + optional description

### Forms

- Input borders use `border-input`
- Focus rings use `ring-ring` (Pinterest Red)
- Validation errors use destructive color

### Dialogs & Popovers

- White background, dark foreground
- Consistent with card styling
- Use shadcn/ui primitives from `src/components/ui/`

## Design Principles

1. **Clean & minimal** — White space is generous, layouts are uncluttered
2. **Pinterest-inspired** — Red accent used sparingly for CTAs and brand moments
3. **Functional first** — Dashboard UI prioritizes usability over decoration
4. **Consistent surfaces** — Cards, popovers, and dialogs share the same white surface treatment
5. **System fonts** — Fast loading, native feel across platforms

## Technical Details

### CSS Variables

All colors are defined as CSS custom properties in `src/styles.css` under `@theme`. Reference them via Tailwind utilities:
- `bg-primary`, `text-primary`, `border-primary`
- `bg-muted`, `text-muted-foreground`
- `bg-destructive`, `text-destructive`

### Component Library

Uses shadcn/ui ("new-york" style) primitives in `src/components/ui/`. Always use existing shadcn components rather than building custom equivalents.

### Tailwind CSS v4

Styling uses Tailwind CSS v4 with the `@theme` directive for design tokens. No `tailwind.config.js` — configuration lives in `src/styles.css`.
