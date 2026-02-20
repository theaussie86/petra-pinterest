# Pinfinity Brand Guide

## 1. Brand Identity

**Name:** Pinfinity
**Tagline:** "Automatisiere deine Pinterest Pins"
**Product:** Multi-tenant Pinterest scheduling dashboard

### Logo
- Current: SVG path in `src/components/ui/logo.tsx` (Pinterest-style pin shape)
- Supply new logo files to `public/` and update the `<Logo>` component accordingly
- Clear space: minimum 16px on all sides
- Never recolor the logo; use `text-primary` (purple) on light backgrounds

---

## 2. Color Palette

### Light Mode

| Token | OKLCH | Approximate Hex | Usage |
|-------|-------|-----------------|-------|
| `--color-primary` | `oklch(42% 0.25 280)` | `#4B1FA6` | Primary actions, brand accent |
| `--color-secondary` | `oklch(50% 0.26 10)` | `#D81B4A` | Crimson CTA, destructive |
| `--color-background` | `oklch(99% 0.006 280)` | `#FAFAFF` | Page background |
| `--color-foreground` | `oklch(14% 0.02 280)` | `#13101F` | Body text |
| `--color-muted` | `oklch(96% 0.012 280)` | `#F3F2FA` | Muted backgrounds |
| `--color-muted-foreground` | `oklch(52% 0.015 280)` | `#706A80` | Secondary text |
| `--color-card` | `rgba(255,255,255,0.72)` | — | Frosted glass cards |
| `--color-border` | `oklch(90% 0.015 280)` | `#E2DFEE` | Borders |
| `--color-ring` | `oklch(42% 0.25 280 / 50%)` | — | Focus rings |
| `--color-destructive` | `oklch(50% 0.26 10)` | `#D81B4A` | Error/delete states |

### Dark Mode

| Token | OKLCH | Approximate Hex | Usage |
|-------|-------|-----------------|-------|
| `--color-primary` | `oklch(68% 0.2 280)` | `#8B5CF6` | Primary actions (lighter for dark bg) |
| `--color-secondary` | `oklch(62% 0.24 10)` | `#F43F6C` | Crimson CTA |
| `--color-background` | `oklch(11% 0.04 280)` | `#0E0A1F` | Page background |
| `--color-foreground` | `oklch(95% 0.01 280)` | `#F0EFF8` | Body text |
| `--color-muted` | `oklch(19% 0.03 280)` | `#1C1630` | Muted backgrounds |
| `--color-muted-foreground` | `oklch(62% 0.015 280)` | `#8F8AA0` | Secondary text |
| `--color-card` | `rgba(30,18,60,0.72)` | — | Frosted glass cards (dark) |
| `--color-border` | `oklch(24% 0.03 280)` | `#26203A` | Borders |

### Sidebar Tokens

| Context | Token | Value |
|---------|-------|-------|
| Light bg | `--sidebar` | `hsl(280 20% 97%)` |
| Dark bg | `--sidebar` | `hsl(270 35% 10%)` |
| Active accent | `--sidebar-primary` | `hsl(270 80% 42%)` (light) / `hsl(270 80% 65%)` (dark) |
| Active text | `--sidebar-primary-foreground` | `hsl(0 0% 100%)` |

---

## 3. Typography

### Fonts
- **Display / Headings:** [Nunito](https://fonts.google.com/specimen/Nunito) — weights 600, 700, 800
- **Body / UI:** [DM Sans](https://fonts.google.com/specimen/DM+Sans) — weights 300, 400, 500

### Google Fonts Import
```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500&display=swap');
```

### Usage Rules
- `font-family: "DM Sans"` on `body` (all prose, labels, nav items)
- `font-family: "Nunito"` on `h1–h6` (page titles, card headings)
- Heading `letter-spacing: -0.02em`
- Tailwind utilities: `font-sans` (DM Sans), `font-display` (Nunito)

### Scale
| Element | Size | Weight | Font |
|---------|------|--------|------|
| Page title | `text-lg` / `1.125rem` | 600 | Nunito |
| Section heading | `text-base` | 700 | Nunito |
| Body | `text-sm` | 400 | DM Sans |
| Caption / muted | `text-xs` | 400 | DM Sans |
| Brand name in sidebar | `text-lg` | 800 (extrabold) | Nunito |

---

## 4. Components

### Card — Frosted Glass
```
bg: rgba(255,255,255,0.72)  [light] / rgba(30,18,60,0.72)  [dark]
backdrop-filter: blur(4px) saturate(150%)
border-radius: 0.75rem
shadow: 0 2px 16px rgba(75,31,166,0.08)
shadow (hover): 0 4px 24px rgba(75,31,166,0.16)
transform (hover): translateY(-1px)
transition: all 150ms ease
```

### Button Variants
| Variant | Style |
|---------|-------|
| `default` (primary) | Gradient `from-violet-600 to-purple-800`, white text |
| `destructive` | Crimson `--color-destructive` solid fill |
| `outline` | Border + transparent bg, hover fills with accent |
| `ghost` | No bg, hover fills with accent |
| `link` | Text-only, underline on hover |

All buttons: `active:scale-[0.97] transition-transform duration-75`

### Input Focus Ring
- Light: `oklch(42% 0.25 280 / 50%)`
- Dark: `oklch(68% 0.2 280 / 50%)`
- Dark mode bg: `bg-white/5` (semi-transparent)

---

## 5. Motion

### Philosophy
Subtle, purposeful, ease-based. No bounce or spring. Every animation is short and non-intrusive.

### Timings
| Animation | Duration | Timing | Delay |
|-----------|----------|--------|-------|
| Sidebar slide-in | 200ms | ease | — |
| Main content fade-in | 300ms | ease | 100ms |
| Card hover lift | 150ms | ease | — |
| Button press scale | 75ms | ease | — |
| Page header fade | 300ms | ease | — |
| Dialog open | 200ms | ease | — |

### Keyframes
```css
@keyframes slide-in-from-left {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes slide-in-from-top {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Dialogs use Radix UI's built-in `data-[state=open]:animate-in` / `zoom-in-95` — no additional CSS needed.

---

## 6. Sidebar

### Glass Panel Spec
```
background: bg-white/65 (light) / bg-[#0E0A1F]/80 (dark)
backdrop-filter: blur(12px)
border-right: border-purple-100/50 (light) / border-white/5 (dark)
```

### Brand Name
```tsx
<span
  className="bg-gradient-to-r from-violet-600 to-rose-600 bg-clip-text text-transparent font-extrabold text-lg"
  style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}
>
  Pinfinity
</span>
```

### Active Nav State
Uses `bg-sidebar-accent text-sidebar-accent-foreground` which resolves to purple-tinted highlight per mode.

---

## 7. Do / Don't

### Do
- Use `text-primary` (purple) for interactive elements and brand moments
- Use `text-secondary` / `bg-secondary` (crimson) for CTAs and destructive actions
- Use frosted glass (`backdrop-blur-sm`) on cards and overlapping panels
- Load Nunito via Google Fonts for all headings
- Keep animations under 300ms total duration

### Don't
- **Don't use Pinterest Red `#e60023`** — this brand no longer references Pinterest's color
- **Don't use Inter, Roboto, or system fonts** as primary typefaces
- **Don't mix font families** outside Nunito (display) + DM Sans (body)
- **Don't use solid opaque backgrounds** on cards — preserve the frosted glass aesthetic
- **Don't animate with bounce or spring** — ease only, subtle transforms
- **Don't hardcode hex/rgb colors** in components — always use CSS tokens (`text-primary`, `bg-card`, etc.)
