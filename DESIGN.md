# Starknet (STARKNET) site: design system

This documents the design actually implemented in `web/` and exported to `dist/`. Values are taken from the source; rendered behaviour was confirmed in headless Chromium at 320, 390 and 1440 CSS pixels wide (see `artifacts/validation.md`). Source of truth for every token is `web/src/styles.css`.

## Overview

The audience is a holder or prospective holder of STARKNET, a fixed-supply ERC-20 on Ethereum mainnet, who wants to read the token's live state, check a balance, or send tokens from their own wallet. The site is one page, dark, quiet, and data-forward: a short hero pair, then flat cards on a dark page. Hierarchy comes from two weights, six sizes and one accent colour used only for the single primary action in view. Monospace carries addresses and numbers; prose stays in the system sans-serif.

System-wide rules: dark page with lifted flat surfaces, one filled accent button per card, borders only as dividers, 4px spacing base, tabular numerals on anything that changes. Page-specific arrangement: the two-column grid (action column left, information column right) is the home page's layout, not a rule for every future page.

## Colors

Defined once as custom properties on `:root` in `web/src/styles.css`. Hex notation throughout; components reference only these role tokens.

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#0b1020` | Page background, input background |
| `--color-surface` | `#141a2e` | Card background (`.card`) |
| `--color-surface-raised` | `#1b2340` | Secondary button fill, notice block, ghost-button hover |
| `--color-border` | `#2b3558` | Dividers, input and secondary button borders, wallet chip outline |
| `--color-text` | `#eef1f8` | Primary text |
| `--color-text-secondary` | `#aab3cd` | Secondary text, labels, placeholders, footer |
| `--color-accent` | `#f4c542` | Primary button fill, skip link, brand mark |
| `--color-accent-hover` | `#ffd45c` | Primary button hover (pointer devices only) |
| `--color-on-accent` | `#1a1400` | Text on the accent fill |
| `--color-link` | `#8ab4ff` | Links and ghost buttons |
| `--color-focus` | `#8ab4ff` | 2px `:focus-visible` outline, 2px offset |
| `--color-danger` | `#ff9d94` | Field errors, error status lines, invalid input border |
| `--color-success` | `#8fe3b3` | Success status lines |

Contrast computed from the declared pairs (WCAG 2 relative luminance): text on bg 16.7:1, text on surface 15.3:1, secondary on surface 8.3:1, secondary on raised 7.4:1, on-accent on accent 11.3:1, link on surface 8.3:1, danger on surface 8.6:1, success on surface 11.4:1, focus on bg 9.1:1. The probe's rendered contrast check also passed at every width. There is no light theme; `color-scheme: dark` is declared so native controls match.

## Typography

- Families: `--font-sans` (`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`) for all prose and controls; `--font-mono` (`ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`) for `code`, `.addr`, `.num` and text inputs. No font files ship; the system faces load, so exact rendering differs per platform.
- Weights: 400 (body) and 600 (headings, labels, buttons, stat values). Nothing else.
- Scale, six steps: `--text-xs` 13px (address notes), `--text-sm` 15px (labels, buttons, secondary prose, addresses, status lines), `--text-md` 17px (body, lede, h3, stat values), `--text-lg` 22px (h2), `--text-xl` 24px (unused reserve, 28px at 720+), `--text-2xl` 32px (h1; 40px at 720+). Inputs are fixed at 16px so iOS does not zoom.
- Roles: `h1` is the only display size, weight 600, line-height 1.15, letter-spacing -0.02em, `text-wrap: balance`. `h2` and `h3` share weight 600 and line-height 1.15. Body line-height is 1.5. Paragraphs use `text-wrap: pretty`.
- Numbers and addresses: `.num` and `code` set `font-variant-numeric: tabular-nums`; `.addr` adds `overflow-wrap: anywhere` so a full 42-character address wraps instead of overflowing at 320. Addresses are never ellipsised in the contracts list; the header chip and account row shorten to `0x1234…abcd` with the full value in `title`.
- Measure: `.hero` caps at 44rem; cards cap the column at about 540px on desktop.

## Layout

- Spacing scale on a 4px base: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-6` 24, `--space-8` 32, `--space-12` 48. Intra-group gaps use 8 or 12; inter-group gaps use 16 or 24.
- Page frame: `.site-header`, `.page` and `.site-footer` share `max-width: var(--page-max)` (1080px) and `--page-pad` (16px, 32px from 720px). Header is a flex row: brand at the leading edge, wallet utility at the trailing edge, minimum height 56px.
- Hero: `.hero` is a grid with 12px gap and 24px top padding so the headline sits well clear of the header utilities, then 24px below.
- Grid: `.grid` is a single column; at 880px and wider it becomes `minmax(0,7fr) minmax(0,8fr)` with a 24px gutter. Each `.col` stacks cards with 16px gaps. DOM order equals reading order: wallet, balance lookup, stats, contracts.
- Cards: `.card` is a grid with 16px row gap and 24px padding (16px and a smaller radius below 400px).
- Stats: `.stats` uses `repeat(auto-fit, minmax(13rem, 1fr))`, so it is one column at 390 and two at 1440.
- Forms: `.field-inline` places an input and a button on one row; the input flexes and the button keeps its width. Full-width inputs stay inside the card padding.
- Logical properties are used where direction matters (`inset-inline-start`, `padding-block-start`, `margin-inline-start`). No horizontal overflow at 320, 390 or 1440 (probe `layout` check).

## Elevation and depth

Flat. There are no box shadows. Depth is tonal: page `--color-bg`, cards `--color-surface`, raised controls and notices `--color-surface-raised`. 1px `--color-border` lines separate address rows, the secondary action block and the footer; they never combine with a shadow. Inputs sit on `--color-bg` inside a card so they read as wells.

## Shapes

- `--radius-sm` 8px: buttons, inputs, skip link.
- `--radius-md` 12px: notice block, cards below 400px wide.
- `--radius-lg` 16px: cards.
- Pills (999px): wallet chip in the header only.
- Brand mark: `web/public/favicon.svg`, a 64-unit rounded square (radius 14) with a gold S.

## Components

All live in `web/src/`; classes in `web/src/styles.css`.

- **Button** (`.btn` plus one of `.btn-primary`, `.btn-secondary`, `.btn-ghost`; optional `.btn-sm`). 44px minimum height (36px for `.btn-sm`), 600 weight, 15px text, 8px radius. Primary is the accent fill and appears once per card. Secondary is raised surface with a border. Ghost is link-coloured text for low-emphasis actions such as Copy, Etherscan, Disconnect and Retry. States: hover only under `@media (hover: hover)`, `:active` scales to 0.96 (disabled under reduced motion), `:disabled` is 60% opacity and keeps its label, `:focus-visible` uses the global outline. Transitions name their properties (`background-color, color, border-color, scale`), 120ms, `cubic-bezier(0.2, 0, 0, 1)`.
- **Field** (`.field`, `.field-inline`, `.field-error`). A visible `<label for>` above a 44px input; `aria-invalid` and `aria-describedby` point at the inline error, and the first invalid field receives focus on submit. Errors are sentences that say what to enter. Used in `WalletPanel.tsx` (transfer form) and `BalanceLookup.tsx`.
- **Status** (`ui.tsx`, `.status`, `.status-error`, `.status-success`). A polite live region rendered even when empty (hidden with `:empty`), switching to `role="alert"` for errors. Every async action writes its pending, success and failure text here.
- **Card** (`.card`, `.card-head`). A `section` with its own `h2` (`aria-labelledby`), optional head row with a trailing utility.
- **AddressRow** (`ui.tsx`, `.addr-row`). Label, optional note, full monospace value, Copy and Etherscan ghost buttons. `kind="tx"` links to a transaction, `kind="none"` omits the link (pool id).
- **CopyButton** (`ui.tsx`). Ghost button whose text changes to "Copied" for 1.8s; the accessible name changes with it.
- **Key/value row** (`.kv`). Label at the leading edge, value at the trailing edge, wraps at narrow widths.
- **Stats list** (`.stats`, `.stat`). A `dl` of label (`dt`, secondary) over value (`dd`, 600 weight, tabular).
- **Notice** (`.notice`). Raised block for the wrong-network state with its own action.
- **Header** (`.site-header`, `.brand`, `.wallet-chip`). Brand link with the mark; the trailing slot shows a Connect button until a wallet connects, then the shortened account as a chip.
- **Skip link** (`.skip`). First focusable element; visible only on focus.

## Do's and don'ts

- Start a new page from `.site-header` + `.page` + `.card`; put each task in its own card with an `h2`.
- One `.btn-primary` per card. Secondary and ghost for everything else.
- Status text goes in a `Status`, never in a toast; errors say what to do next and sit beside the field.
- Use `.num` or `code` for any address, hash, amount or count. Never shorten an address in a list; shorten only in the header chip and account row, keeping the full value in `title`.
- Pick sizes from the six tokens; add weight before adding a size. Do not add a third weight or a webfont.
- Group with space first; a 1px `--color-border` divider is the last resort, and never together with a shadow.
- Do not add a light theme, gradients, kicker labels above headings, all-caps labels, or em dashes in interface text.
- To add a page: copy `App.tsx`'s frame (skip link, header, `main.page`, footer), place cards in a `.grid` with one or two `.col`s, reuse `Status`, `AddressRow` and the field classes, and read chain data through `chain.ts` only.
