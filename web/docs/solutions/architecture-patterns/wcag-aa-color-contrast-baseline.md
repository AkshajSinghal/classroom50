---
title: "WCAG 2.1 AA color-contrast baseline for the corporate light/dark themes"
date: 2026-07-01
category: architecture-patterns
module: web-theme
problem_type: accessibility
component: daisyui-theme-tokens
symptoms:
  - "Muted text (text-base-content/40|50|60), pure red asterisks, and low-contrast grays failed AA (4.5:1) on white / #fafafa panels"
  - "DaisyUI corporate primary/info/error/success/warning failed AA as text and button labels"
  - "Soft badges and dark-theme button labels sat just under 4.5:1 for small text"
root_cause: untuned_third_party_theme_tokens
resolution_type: code_fix
severity: medium
tags:
  - accessibility
  - wcag
  - color-contrast
  - daisyui
  - design-tokens
  - dark-theme
---

# WCAG 2.1 AA color-contrast baseline for the corporate light/dark themes

## Problem

The app had no color-token file and no contrast baseline. Colors came from three
layers (DaisyUI `corporate` theme tokens, hardcoded hex literals in arbitrary
Tailwind classes, and SVG assets). Many pairings failed WCAG 2.1 **AA** (4.5:1
normal text, 3:1 large text / non-text UI): the low-contrast muted-text ramp
(`text-base-content/40|50|60`), pure-red asterisks (`text-[#f00]`), link blues,
and several stock DaisyUI semantic tokens as text/button labels. A dark theme
(`corporate-dark`) added later inherited the same class of problems.

## The three constraints that made this non-trivial

A single semantic token (e.g. `--color-primary`) is used **three** ways, and the
contrast requirements pull in opposite directions:

1. **Solid button/badge fill** — the `-content` color must clear 4.5:1 on the
   fill.
2. **`text-<token>` links / status text** — the token itself must clear 4.5:1 on
   `base-100`/`base-200`.
3. **`badge-soft`** — DaisyUI renders the raw token as text on an 8% tint of that
   same token, a much tighter pairing.

In **light** mode all three can be satisfied by darkening the token once. In
**dark** mode they conflict: lightening `primary` so `text-primary` links pass
makes white button labels fail, and vice versa. Resolved by lightening the dark
fills **and flipping their `-content` to black** (bright accent buttons, dark
labels), plus a per-theme `.badge-soft` foreground nudge.

## Solution (all centralized in `src/index.css`)

- **Light `corporate` token overrides** — darken `primary`/`info`/`error`/
  `success`/`warning` (same hue, lower lightness) so they clear AA as text and
  button labels; set `error-content`/`warning-content` to white on the darkened
  fills.
- **Dark `corporate-dark` tokens** — lighten `primary`/`info`/`accent`/
  `secondary` and set their `-content` to black so both `text-<token>` links and
  button labels clear AA (a single mid-tone can't do both with white content).
- **`.badge-soft` foreground** — per-theme `color-mix` on `var(--badge-color)`
  (88% + black in light, 75% + white in dark) so every soft badge clears AA
  without touching the fill tokens.
- **Placeholders / `.label`** — raised to `base-content/65` and `/70`.
- **Muted-text sweep** — `text-base-content/40|50|60` → `/70` across ~38 files
  (`/70` is the AA-safe floor everywhere in both themes; icons only gain
  contrast, never lose it).
- **Hex remediation** — `text-[#f00]` → `text-error`, link blues → `text-primary`.
- **Removed hardcoded `btn-error text-white`** — the theme's `error-content` is
  now correct in both modes; the override broke dark mode (white on light red).
- **AppBanner** — dropped `text-error/warning-content` on the tinted bar (those
  `-content` colors are for solid fills; on a 10% tint they were unreadable).

## Baseline (computed via oklch→sRGB→WCAG; ratios are the fixed values)

| Pairing                                                                 | Light              | Dark          |
| ----------------------------------------------------------------------- | ------------------ | ------------- |
| `text-base-content/70` (muted floor) on white/base-300                  | 6.36 / 5.15        | 7.57 / 8.10   |
| `text-primary` on base-100                                              | 5.71               | 4.99          |
| `text-info` / `text-success` / `text-warning` / `text-error` on base    | ≥5.2               | ≥5.3          |
| button label on `primary`/`info`/`accent`/`secondary` fill              | ≥4.85              | ≥5.77 (black) |
| button label on `success`/`warning`/`error` fill                        | ≥5.4               | ≥6.3          |
| `badge-soft` (any semantic tone)                                        | ≥5.38              | ≥6.27         |
| sidebar `text-gray-400` on `#212a3a`, `neutral-content/60` on rail/surf | 5.54 / 6.17 / 5.23 | —             |

All computed pairings meet AA. Large text and non-text/icon uses (which only
need 3:1) clear it with margin. The favicon (`#accefb`) is exempt branding;
in-app icons use `currentColor` or semantic tokens, so they inherit the fixed
contrasts.

## Prevention

- **Fix contrast at the token, once** — override in `src/index.css`, not
  per-component, so every render-time consumer is corrected together.
- **Use `text-base-content/70` as the muted-text floor.** `/40|50|60` fail AA on
  off-white panels; `/70` passes everywhere.
- **Never hardcode `text-white`/`text-black` on a semantic button** — set the
  theme's `*-content` token so it stays correct across themes.
- **`-content` tokens are for solid fills only.** On a `/10` tint, use
  `text-base-content` or the raw `text-<token>` (the soft-badge pattern), not
  `text-<token>-content`.
- **When adding a color, check all three uses** (fill label, `text-` link,
  `badge-soft`) against this baseline in both themes before shipping.
