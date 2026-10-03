---
name: Civic Pulse Design System
colors:
  surface: '#f8fafb'
  surface-dim: '#d8dadb'
  surface-bright: '#f8fafb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f5'
  surface-container: '#eceeef'
  surface-container-high: '#e6e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#3d4a3d'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#eff1f2'
  outline: '#6d7b6c'
  outline-variant: '#bccbb9'
  surface-tint: '#006e2e'
  primary: '#006e2e'
  on-primary: '#ffffff'
  primary-container: '#00b14f'
  on-primary-container: '#003a15'
  inverse-primary: '#52e078'
  secondary: '#006d36'
  on-secondary: '#ffffff'
  secondary-container: '#89f6a6'
  on-secondary-container: '#007238'
  tertiary: '#486554'
  on-tertiary: '#ffffff'
  tertiary-container: '#82a08e'
  on-tertiary-container: '#1c3729'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#71fe91'
  primary-fixed-dim: '#52e078'
  on-primary-fixed: '#002109'
  on-primary-fixed-variant: '#005321'
  secondary-fixed: '#8cf9a9'
  secondary-fixed-dim: '#70dc8f'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005227'
  tertiary-fixed: '#caead6'
  tertiary-fixed-dim: '#afceba'
  on-tertiary-fixed: '#042014'
  on-tertiary-fixed-variant: '#314d3e'
  background: '#f8fafb'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system translates the effortless convenience, warmth, and visual ergonomics of consumer super-apps into municipal intelligence and public sector operations. The goal is to strip away the archaic, dense, and intimidating aesthetics of legacy municipal dashboards, replacing them with intuitive clarity, high legibility, and responsive reassurance. 

The emotional tone balances civic authority with approachable utility:
- **Approachability:** The UI feels welcoming, crisp, and tactile rather than bureaucratic.
- **Clarity ("Don't Make Me Think"):** Complex municipal streams (dispatch, citizen issues, infrastructure uptime) are surfaced through card-based encapsulation, clean hierarchy, and immediate visual cues.
- **Reliability & Actionability:** Vibrant status signals guide operational focus with zero cognitive friction.

The style unites **Modern Consumer Minimalism** with **Warm Tactile Card-UI**: pure white elevated cards on soft tinted backdrops, generous pill-shaped touch targets, friendly geometric typography, and gentle ambient elevations.

## Colors

The palette leverages high-vitality greens rooted in civic livability, supported by airy mint fills, neutral slate typography, and decisive status accents:

- **Primary (`#00B14F` / Hover `#008744`):** The operational green. Used for key call-to-actions, active navigation states, primary toggles, and resolved status badges.
- **Mint Highlights (`#DCFCE7`, Light `#E8F8EE`):** Soft contextual fills for badge backgrounds, highlighted selection states, and icon badge containers.
- **Canvas Neutral (`#F7F9FA`):** An ultra-soft off-white canvas that ensures white content cards display clean structural boundaries without heavy borders.
- **Card Surfaces (`#FFFFFF`):** Pure white container surfaces delivering high contrast and visual cleanliness.
- **Typography Neutrals:** Charcoal primary text (`#0F172A` / `#1C252E`) provides crisp contrast, paired with muted slate (`#64748B`) for metadata, subheadings, and field labels.
- **Operational Status Palette:** 
  - **Critical (`#EF4444` / Tint `#FEE2E2`):** Immediate municipal incidents, water main leaks, emergency calls.
  - **High Alert (`#F59E0B` / Tint `#FEF3C7`):** Degraded services, maintenance backlogs, amber alerts.
  - **Resolved / Normal (`#00B14F` / Tint `#DCFCE7`):** Operational stability, completed tickets, active green lights.

## Typography

The typography leverages **Plus Jakarta Sans** uniformly across headlines, body, and labels. Its modern geometric profile, open counters, and subtle humanist curves provide high legibility on mobile field screens and command displays.

- **Headlines:** Set with heavier weights (600–800) and tighter letter spacing to create confident, friendly section titles and key metrics.
- **Body:** Set at 400 weight in charcoal (`#0F172A`) for effortless scanning without eye strain.
- **Labels & Microcopy:** High-contrast, semi-bold/bold weights ensure instant legibility on badges, operational metrics, and quick action chips.

## Layout & Spacing

The layout model is driven by **chunked modularity**. Information is distributed across crisp, card-based surfaces with generous padding and deliberate whitespace to maintain clean separation without reliance on heavy dividers.

- **Grid Strategy:**
  - **Mobile (< 768px):** Single-column fluid stack with `1rem` outer margins and `0.75rem` to `1rem` inter-card gaps.
  - **Tablet (768px – 1024px):** 6-column grid with `1.5rem` outer margins and `1rem` gutters.
  - **Desktop (1024px+):** 12-column grid capped at 1440px maximum content width, with `2rem` outer margins and `1.25rem` gutters.
- **Rhythm Rules:**
  - Elements inside cards use tight spacing (`space-xs` and `space-sm`) to form tight semantic groups (e.g., icon + badge + title).
  - Component containers and functional sections maintain distinct separations using `space-lg` and `space-xl`.

## Elevation & Depth

Visual hierarchy combines clean tonal surfaces with soft, warm-tinted ambient shadows to provide a tactile, consumer-grade feel:

- **Level 0 (Flat / Canvas):** Applied to the base canvas (`#F7F9FA`) and inline secondary containers.
- **Level 1 (Card Resting):** Applied to default operational cards and list panels.
  - `box-shadow: 0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 3px 0 rgba(15, 23, 42, 0.03);`
  - Subtle perimeter border: `1px solid rgba(226, 232, 240, 0.6)`.
- **Level 2 (Interactive Hover / Floating Panels):** Applied to active cards, dropdown sheets, and sticky action buttons.
  - `box-shadow: 0 10px 24px -4px rgba(15, 23, 42, 0.08), 0 4px 8px -2px rgba(15, 23, 42, 0.03);`
- **Level 3 (Modals / Overlays):** Applied to municipal emergency prompts and full modal dialogs.
  - `box-shadow: 0 20px 32px -6px rgba(15, 23, 42, 0.12), 0 8px 16px -4px rgba(15, 23, 42, 0.04);`

## Shapes

The shape system adopts a friendly, accessible geometry that removes sharp corners in favor of generous, smooth radii:

- **Buttons & Pills:** Full pill contour (`rounded-full` / `9999px`) for action triggers, status chips, and quick search bars.
- **Cards & Sheets:** Rounded-2xl (`1rem` to `1.25rem`) corner radii for all primary content containers, dispatch summary modules, and bottom modal drawers.
- **Inputs & Search Wells:** Soft rounded shape (`0.75rem` / `rounded-xl`) to invite input interaction.
- **Avatars & Service Glyphs:** Smooth rounded squircles or circles (`rounded-full` or `rounded-2xl`).

## Components

### Buttons
- **Primary:** Full pill (`9999px`), solid `#00B14F`, label in `#FFFFFF` (`label-lg`), height `48px` (desktop) / `52px` (mobile touch target). Pressed/Hover state: `#008744`.
- **Secondary / Soft:** Full pill, background `#E8F8EE`, label in `#008744` (`label-lg`), zero border.
- **Outline / Ghost:** Full pill, `1.5px` border `#E2E8F0`, label in `#1C252E`, background `#FFFFFF`.

### Status Badges & Chips
- **Structure:** Pill shape (`9999px`), padding `4px 12px`, typography `label-sm`.
- **Critical (P1 Alerts):** Background `#FEE2E2`, text `#DC2626`, 6px indicator dot `#EF4444`.
- **High (Maintenance/Inspection):** Background `#FEF3C7`, text `#D97706`, 6px indicator dot `#F59E0B`.
- **Resolved / Normal:** Background `#DCFCE7`, text `#15803D`, 6px indicator dot `#00B14F`.

### Input Fields & Search Bars
- **Search Header Bar:** Inspired by the signature super-app discovery bar. Full pill or `rounded-xl`, background `#FFFFFF` or soft `#F1F5F9`, border `1px solid transparent`, focusing to `1.5px solid #00B14F`. Accompanied by a leading green-tinted search glyph.
- **Form Fields:** `rounded-xl`, background `#FFFFFF`, border `1px solid #E2E8F0`, padding `12px 16px`, label in `#64748B` positioned outside above the input.

### Cards & Dispatch Modules
- Background `#FFFFFF`, border-radius `1rem` (`rounded-2xl`), subtle border `1px solid rgba(226, 232, 240, 0.6)`.
- Internal padding `16px` or `20px`.
- Visual hierarchy: Prominent top-row service badge/time-stamp, bold issue title, muted location string with a green map-pin glyph, and a floating primary pill action button.

### Checkboxes & Radio Controls
- Circular and smooth squircle selection hit-areas with `#00B14F` active fill and white checkmark icon. Inactive state features `#CBD5E1` border with instantaneous scale micro-interaction upon tap.

### Service Category Grids
- Grid of square-ish rounded cards (`rounded-2xl`), background `#FFFFFF`, soft mint icon background circle (`#E8F8EE`), 24px clean vector service icon, followed by concise two-word title (`label-md`).