# Demo Images

This directory contains Marketplace and README visuals for the extension.

## Regenerating GIFs

Install ImageMagick and run:

```bash
npm run demo:gifs
```

The script generates:

| Output | Source frames |
|---|---|
| `02-completion.gif` | `02-completion-ba.png`, `02-completion-balance.png`, `02-completion-http.png` |
| `03-validation.gif` | `03-validation-error.png`, `03-validation-warning.png`, `03-validation-warning-backend.png` |
| `04-hover.gif` | `04-hover-balance.png`, `04-hover-http-request.png`, `04-hover-httpchk.png`, `04-hover-stick-table.png`, `04-hover-timeout.png` |

Keep source frames committed. They make demo updates reviewable and let contributors regenerate GIFs without manual editing.
