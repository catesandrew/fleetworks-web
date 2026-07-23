---
name: Fleetworks
description: Apex marketing site for the Fleetworks infrastructure control-plane suite
colors:
  ink: "#0B0F14"
  paper: "#FFFFFF"
  muted: "#6B7280"
  border: "#E5E7EB"
  surface: "#F9FAFB"
  apex-accent: "#111827"
  yellow-pages-accent: "#1A7F5A"
  rolodex-accent: "#7C3AED"
  chorus-accent: "#10A47A"
  helmsman-accent: "#2E62C9"
  warden-accent: "#2FA25E"
typography:
  display:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 5vw + 1rem, 5.5rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.2vw + 1rem, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Fragment Mono, ui-monospace, \"SF Mono\", \"Cascadia Code\", monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "24px"
  6: "32px"
  7: "48px"
  8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.apex-accent}"
    textColor: "{colors.paper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "14px 24px"
---

# Design System: Fleetworks

## 1. Overview

**Creative North Star: "The Control Room"**

Fleetworks is six instruments on one panel — a service catalog, a directory, DNS, deployments, and cloud governance, all reporting to the same operator. The apex site's job is to make that panel legible at a glance: one visual language, one near-monochrome base, and a single accent light that switches color per instrument. This is a schematic, not a showroom — closer to a well-drawn systems diagram or an avionics panel than a SaaS brochure. Every hero, every app page, is the same fixture wired to a different color.

This explicitly rejects the pastel-gradient, blob-illustration, stock-photo SaaS landing page, and just as deliberately rejects the cream/parchment editorial-magazine look (display serif + italic accents + warm off-white) — the wrong register for a tool built by and for infrastructure engineers, even on a marketing surface. Confidence here reads as restraint and precision, not decoration.

**Key Characteristics:**
- Near-black ink on true white, flat, high-contrast — a schematic, not a soft UI
- Exactly one saturated accent live at a time, swapped per app via a single `accentColor` token, never blended with a second hue
- A constructed, faintly technical display face (Bricolage Grotesque) for headlines, paired with a schematic monospace (Fragment Mono) for coordinates/labels, both sitting on top of the same system-sans body copy already shared by all 6 apps
- Flat elevation — depth from hairline borders and tonal steps, never shadows or glass
- Hero imagery is abstract/illustrative infrastructure diagrammatics (nodes, routes, panels), never a product screenshot

## 2. Colors

Near-monochrome base (ink-on-paper) with exactly one saturated accent live at any moment — the apex home page runs an almost-neutral slate accent; each of the 5 app pages swaps in its own live accent from `@fleet-works/suite-nav`. Reference: Stripe's single-accent-on-white restraint, generalized into a swappable per-tenant accent system.

### Primary
- **Signal Accent** (token `apex-accent`, home default `#111827`; swapped per app — Catalog Green `#1A7F5A`, Directory Violet `#7C3AED`, DNS Teal `#10A47A`, Deploy Blue `#2E62C9`, Governance Green `#2FA25E`): the one live color per page. Used for the hero's focal mark, primary CTA, and active nav state — nowhere else.

### Neutral
- **Deep Ink** (`#0B0F14`): all body text, headlines, and default icon strokes.
- **True Paper** (`#FFFFFF`): base background for every page.
- **Instrument Gray** (`#6B7280`): secondary/muted copy, captions, disabled states.
- **Hairline Border** (`#E5E7EB`): all dividers, card edges, table rules — 1px only.
- **Panel Surface** (`#F9FAFB`): the one tonal step up from paper, used for recessed panels (code blocks, the hero's diagram canvas, footer band).

### Named Rules
**The One Light Rule.** Exactly one accent color is live on any given page. It never mixes with a second saturated hue; when a page needs two visual weights, the second is Deep Ink, not a second accent.

## 3. Typography

**Display Font:** Bricolage Grotesque (variable), with `ui-sans-serif, system-ui, sans-serif` fallback
**Body Font:** the suite's existing system-sans stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) — unchanged from `@fleet-works/ui/tokens.css`, shared with all 6 apps
**Label/Mono Font:** Fragment Mono, with `ui-monospace, "SF Mono", "Cascadia Code", monospace` fallback

**Character:** Bricolage Grotesque's slightly constructed, mechanical letterforms carry the "control room" idea into every headline without tipping into a display-serif editorial register. Fragment Mono is reserved for anything that reads like an instrument readout — coordinates, small caps labels, the accent-color name — never for body prose, so it stays earned rather than costume.

### Hierarchy
- **Display** (600, `clamp(2.75rem, 5vw + 1rem, 5.5rem)`, 1.02 line-height, -0.03em tracking): the hero headline only, one per page.
- **Headline** (600, `clamp(1.5rem, 1.2vw + 1rem, 2.25rem)`, 1.15 line-height, -0.015em tracking): section headers below the hero.
- **Title** (600, 1.25rem, 1.3 line-height): card/tile titles in the 5-app overview grid.
- **Body** (400, 1.0625rem, 1.55 line-height, 65–75ch max width): all prose. Never drop below `#0B0F14`-derived contrast even over the accent color.
- **Label** (400, 0.8125rem, 1.3 line-height, 0.02em tracking, uppercase for standalone tags only): instrument-style captions — app id, coordinates, status text.

### Named Rules
**The Earned Mono Rule.** Monospace only appears where it represents an actual instrument reading (an id, a coordinate, a status). It is never used as generic "developer" set dressing on body copy or navigation.

## 4. Elevation

Flat by default. This system conveys depth the way a technical diagram does — through hairline borders (`#E5E7EB`) and a single tonal step (`#F9FAFB` panel vs `#FFFFFF` paper) — never through drop shadows, glass blur, or lifted cards. The hero's diagram canvas sits on the Panel Surface tone precisely so it reads as an inset instrument display, not a floating card.

### Named Rules
**The Schematic Rule.** No box-shadow anywhere in the hero or app-page templates. Where a boundary is needed, draw a 1px hairline border; where a recess is needed, step to the Panel Surface tone.

## 5. Components

### Buttons
- **Shape:** 6px radius (`{rounded.sm}`) — sharp enough to feel like an instrument toggle, not a soft SaaS pill.
- **Primary:** Deep Ink background, Paper text, 14px/28px padding; on hover, background steps to the page's live accent color (never the reverse — ink is always the resting state).
- **Ghost:** transparent background, Deep Ink text, 1px Hairline Border; hover fills to Panel Surface.

### Hero Visual (signature component)
The reusable diagrammatic hero graphic (nodes/routes/panels rendered in SVG or canvas), parametrized entirely by the page's `accentColor`. Renders on the Panel Surface tone with hairline-border node outlines; the single accent color is reserved for the "active" node/route only, keeping the One Light Rule intact across all 6 pages.

### Navigation
`AppSwitcher` and the site header keep their existing unstyled-chrome treatment from `@fleet-works/ui` — system-sans typography, Hairline Border bottom rule, no new visual layer introduced here. This is deliberate: nav/chrome consistency across all 6 live apps outranks any one page's visual ambition.

## 6. Do's and Don'ts

### Do:
- **Do** keep exactly one saturated accent live per page (the One Light Rule), swapped via the `accentColor` prop, never hardcoded per page.
- **Do** use Bricolage Grotesque only for Display/Headline/Title roles; body copy stays on the shared system-sans stack used by all 6 apps.
- **Do** render hero imagery as abstract infrastructure diagrammatics (nodes, routes, panels) — illustrative, not photographic, and never a real product screenshot.
- **Do** convey depth with hairline borders and the single Panel Surface tonal step (the Schematic Rule) — flat, not lifted.

### Don't:
- **Don't** use a cream/parchment background, italic display type, or drop caps — the editorial-magazine lane is explicitly the wrong register here (PRODUCT.md anti-reference).
- **Don't** use real product screenshots anywhere on the site (PRODUCT.md anti-reference, locked decision).
- **Don't** ship the hero-metric SaaS cliché (big number + label + gradient accent) or identical icon-card grids for the 5-app overview (PRODUCT.md anti-reference).
- **Don't** use `background-clip: text` gradients, glassmorphism, or `box-shadow` anywhere in the hero/app-page templates.
- **Don't** run two saturated accent colors on the same page — one light, per the One Light Rule.
