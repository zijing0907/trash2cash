# Design: Trash2Cash web

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: editorial
- Shape of the first page: Narrative Workflow (/); Long Document (/model); app screen (/scan, /guide, /me, /login, /signup)
- Theme: Editorial
- Axes: light/display-condensed/chromatic-green · posture: restrained

## Tokens
`src/tokens.css` is the source of truth. The roles:
```css
:root {
  --color-paper: oklch(97% 0.007 86);  --color-paper-2: oklch(94% 0.010 86);  --color-paper-3: oklch(91% 0.012 84);
  --color-ink: oklch(16% 0.012 280);  --color-ink-2: oklch(29% 0.011 280);  --color-muted: oklch(48% 0.010 75);
  --color-rule: oklch(85% 0.009 85);  --color-rule-2: oklch(64% 0.010 80);
  --color-accent: oklch(49% 0.130 152);  --color-accent-ink: oklch(98% 0.005 88);  --color-focus: oklch(52% 0.135 152);
  --font-display: "Bricolage Grotesque Variable", ui-sans-serif, system-ui, sans-serif;  /* 800, "wdth" 75 */
  --font-body: "Source Serif 4 Variable", ui-serif, Georgia, serif;
  --radius-card: 0;  --radius-pill: 0;  --rule-hair: 1px;  --rule-heavy: 4px;  --shadow-card: none;
}
```
The spacing scale, the type scale, the easings and the durations are the scaffold's and live in `src/tokens.css`.

## Data colours
The seven Malaysian bin colours (`--color-bin-blue`, `-brown`, `-orange`, `-ewaste`, `-textile`, `-food`,
`-general`) are data, not accent: they only ever name a bin (the answer block, a bin's square swatch, the
guide's rule over a bin). Paper-coloured text on each clears 4.5:1. Never use them for decoration.

## Controls
- Primary: ink fill, paper text · square · 48px (40px with a 44px hit target on app screens)
- Secondary: 1px ink outline, ink text · same radius and height
- Links: hairline underline that turns green on hover; the active nav link is underlined in green

## Motion
- Character: still. State changes only (a colour step, a 1px press); no reveal, nothing on scroll; under
  reduced motion everything ends at once.

## Exports
`src/tokens.css` (Tailwind 4 `@theme static` block plus `:root`) in this project. Tailwind, DTCG or shadcn
blocks are added here on request.
