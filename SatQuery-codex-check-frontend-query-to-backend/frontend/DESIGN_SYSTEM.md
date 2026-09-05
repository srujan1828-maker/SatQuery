# SatQuery Frontend Design System

## Color Palette

| Token | HEX | Purpose |
|---|---|---|
| Main background | #141414 | Overall page background |
| Sidebar | #141414 | Left navigation |
| Card | #1B1B1B | Cards and primary content surfaces |
| Secondary surface | #171717 | Panels and sections |
| Elevated surface | #1F1F1F | Buttons, inputs, highlighted areas |
| Border | #2A2A2A | Card and panel boundaries |
| Strong border | #3C3C3C | Inputs and selected elements |

## Typography

### Font family

Primary font:

- System sans-serif stack

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;

  ## Spacing

Use a 4px base spacing unit.

| Token | Value | Usage |
|---|---:|---|
| XS | 4px | Tiny gaps |
| SM | 8px | Compact element gaps |
| MD | 12px | Related content |
| LG | 16px | Standard component spacing |
| XL | 24px | Panel/card spacing |
| 2XL | 32px | Section spacing |
| 3XL | 48px | Major layout separation |
| 4XL | 64px | Large page-level spacing |

## Corner Radius

| Token | Value | Usage |
|---|---:|---|
| Small | 6px | Small controls |
| Medium | 10px | Inputs and buttons |
| Large | 14px | Cards and panels |
| Full | 999px | Pills/status indicators |

## Surface Rules

- Page background uses `#141414`.
- Sidebar uses `#141414`.
- Cards use `#1B1B1B`.
- Secondary panels use `#171717`.
- Buttons, inputs, and highlighted areas use `#1F1F1F`.
- Normal boundaries use `#2A2A2A`.
- Inputs and selected elements use `#3C3C3C`.
- Avoid purple gradients.
- Avoid default browser button/input styling.
- Avoid generic centered-card layouts.