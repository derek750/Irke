# `src/ui/`

Shared presentation tokens for the side panel and options page.

## Files

| File | Responsibility |
|------|----------------|
| `theme.css` | Dark theme CSS variables, base element styles, shared utilities (`.card`, `.row`, `.badge`, `.notice`, buttons) |

## Tokens

Defined on `:root`: `--bg`, `--surface`, `--surface-raised`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-hover`, `--accent-soft`, `--success`, `--warning`, `--danger`, `--radius`.

Both surfaces import this file from their `main.tsx`. Surface-specific layout lives in `sidepanel/sidepanel.css` and `options/options.css` — keep component layout there, keep shared primitives here.

## Conventions

- Prefer existing utility classes over one-off hex colors in TSX.
- Button variants: default, `.primary`, `.ghost`, `.danger`.
- Badges: default, `.accent`, `.warning`, `.success`.
- Notices: `.notice.error`, `.notice.info`.

No TypeScript and no React in this folder.
