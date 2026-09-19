# `src/ui/`

Shared presentation for the side panel and options page: theme tokens, the fonts used in generated documents, and the few React components both surfaces render.

## Files

| File | Responsibility |
|------|----------------|
| `theme.css` | Dark theme CSS variables, base element styles, shared utilities (`.card`, `.row`, `.badge`, `.notice`, buttons, `.sources-*`) |
| `SourcesPopover.tsx` | "Grounded in N" trigger opening a scrollable list of the documents behind a draft |
| `fonts/` | Latin Modern Roman (regular + bold) embedded into generated cover-letter PDFs, plus the GUST licence that permits redistributing them |

## Tokens

Defined on `:root`: `--bg`, `--surface`, `--surface-raised`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-hover`, `--accent-soft`, `--success`, `--warning`, `--danger`, `--radius`.

Both surfaces import this file from their `main.tsx`. Surface-specific layout lives in `sidepanel/sidepanel.css` and `options/options.css` — keep component layout there, keep shared primitives here.

## Conventions

- Prefer existing utility classes over one-off hex colors in TSX.
- Button variants: default, `.primary`, `.ghost`, `.danger`.
- Badges: default, `.accent`, `.warning`, `.success`.
- Notices: `.notice.error`, `.notice.info`.

The fonts are not used by any stylesheet — `lib/documents/cover-letter.ts` imports them with Vite's `?url` suffix and fetches the emitted asset. They are the Computer Modern face that makes a PDF read as LaTeX.

A React component belongs here only when **both** surfaces render it and it holds no surface-specific state — `SourcesPopover` is the bar to clear. Anything used by one surface stays in that surface's folder.
