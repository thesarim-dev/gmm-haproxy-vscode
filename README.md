# HAProxy Config — VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/gmm.gmm-haproxy-vscode?label=VS%20Code%20Marketplace&logo=visualstudiocode&logoColor=white&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=gmm.gmm-haproxy-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/gmm.gmm-haproxy-vscode?label=Installs&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=gmm.gmm-haproxy-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/stars/gmm.gmm-haproxy-vscode?label=Rating&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=gmm.gmm-haproxy-vscode)
[![CI](https://github.com/gmm/gmm-haproxy-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/gmm/gmm-haproxy-vscode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**The missing IDE experience for HAProxy.** Stop memorizing directive names, guessing valid options, and discovering config errors only when HAProxy refuses to start.

> Full language support for `.cfg` and `.conf` HAProxy files — with version-aware validation, intelligent autocompletion, and inline documentation right inside VS Code.

---

## Features

### Syntax Highlighting
Every token in your HAProxy config gets meaningful color — section headers, directives, ACL names, backend references, IP addresses, ports, and timeouts.

![Syntax highlighting demo](images/demo-syntax.gif)

---

### Intelligent Autocompletion
Context-aware suggestions that know which directives are valid in each section. No more guessing whether `use_backend` belongs in a `backend` or a `frontend`.

- Filters by section type (`frontend`, `backend`, `global`, etc.)
- Respects `mode http` vs `mode tcp` — only shows relevant options
- Deprecated directives shown with strikethrough
- Every suggestion includes signature and documentation

![Autocompletion demo](images/demo-completion.gif)

---

### Version-Aware Validation
Select your HAProxy version and get real-time diagnostics tailored to it. Directives removed in 2.4? Flagged as errors. Options deprecated in 3.0? Flagged as warnings — with the exact migration path.

- **Errors** — unknown directives, wrong section, removed features, syntax issues
- **Warnings** — deprecated directives with upgrade hints
- **Cross-references** — `use_backend` pointing to an undefined backend

![Validation demo](images/demo-validation.gif)

---

### Hover Documentation
Hover over any directive for instant reference: signature, description, valid sections, version availability, and a direct link to the HAProxy docs.

```
bind  [<address>]:<port_range> [param*]
──────────────────────────────────────
Define the listening address and port for a frontend.

Valid in: frontend, listen
Since: HAProxy 1.0

📖 HAProxy Docs →
```

![Hover demo](images/demo-hover.gif)

---

### Snippets
Start typing a section name and get a fully-formed boilerplate with tabstops. No more blank-page paralysis.

| Prefix | Inserts |
|---|---|
| `global` | Global block with logging, threads, stats socket |
| `defaults` | Defaults with all common timeouts |
| `frontend` | HTTP frontend |
| `frontend-ssl` | HTTPS frontend with SSL termination |
| `backend` | HTTP backend with health check |
| `backend-ssl` | HTTPS backend |
| `listen` | HAProxy stats listener |
| `acl` | ACL definition |
| `use_backend` | Conditional backend routing |
| `server` | Server line with health check params |
| `httpchk` | HTTP health check option |

![Snippets demo](images/demo-snippets.gif)

---

### Document Formatting
One keypress (`Shift+Alt+F`) normalizes your entire config: section headers at column 0, directives indented consistently, blank lines cleaned up — without touching your comments or string values.

---

## Multi-Version HAProxy Support

Validate your config against the exact HAProxy version running in production. Switch versions per workspace — no global settings that affect other projects.

| Version | Type | Status |
|---|---|---|
| **3.1** | Stable | ✅ Latest — default |
| **3.0** | Stable | ✅ Supported |
| **2.8** | LTS | ✅ Recommended LTS |
| **2.6** | LTS | ✅ Supported |
| **2.4** | LTS | ✅ Supported (EOL 2026) |

The status bar shows your active version at all times. Click it to switch instantly.

![Version selector demo](images/demo-version.gif)

---

## Installation

**From VS Code:**
1. Open the Extensions panel (`Ctrl+Shift+X`)
2. Search for `HAProxy Config`
3. Click **Install**

**From the command line:**
```bash
code --install-extension gmm.gmm-haproxy-vscode
```

The extension activates automatically when you open any `.cfg` or `.conf` file named or detected as HAProxy config.

---

## Configuration

All settings are available under `File → Preferences → Settings → HAProxy`.

| Setting | Default | Description |
|---|---|---|
| `haproxy.version` | `3.1` | HAProxy version to validate against |
| `haproxy.validate.enable` | `true` | Enable/disable live validation |
| `haproxy.completion.enable` | `true` | Enable/disable autocompletion |
| `haproxy.trace.server` | `off` | LSP trace level (`off` / `messages` / `verbose`) |

**Per-workspace version** — open `.vscode/settings.json` and add:
```json
{
  "haproxy.version": "2.8"
}
```

This overrides the global setting for that workspace only, so different projects can validate against different HAProxy versions simultaneously.

---

## Commands

| Command | Description |
|---|---|
| `HAProxy: Select Version` | Change validation version via QuickPick |
| `HAProxy: Restart Language Server` | Restart if the server gets into a bad state |

---

## Why this extension?

HAProxy is one of the most widely deployed load balancers in the world. But editing its config has always been a text-editor experience — no hints, no validation, no documentation. You either memorize the manual or keep a browser tab open.

This extension brings the config editing experience up to the same level as editing code:

- **Catch errors before deployment** — not when HAProxy refuses to reload
- **Stay on the right version** — avoid deploying directives that don't exist in your production binary
- **Onboard faster** — new team members get inline docs without needing to read the full manual
- **Move faster** — snippets and completion eliminate the boilerplate

---

## Requirements

- VS Code `1.110.0` or newer
- Node.js is **not** required on the target machine — the language server is bundled

---

## Known Limitations

- Go-to-definition for backend/frontend cross-references is planned for v1.1
- Configs over 10,000 lines disable live validation (syntax highlighting still works)
- Remote/SSH file editing is not supported in the initial release

---

## Contributing

Issues and pull requests are welcome at [github.com/gmm/gmm-haproxy-vscode](https://github.com/gmm/gmm-haproxy-vscode).

**To run locally:**
```bash
git clone https://github.com/gmm/gmm-haproxy-vscode
cd gmm-haproxy-vscode
npm install
npm run compile
```

Then press `F5` in VS Code to open an Extension Development Host with the extension loaded.

**Before submitting a PR:**
- `npm run lint` must pass
- `npm run compile` must pass
- `npm test` must pass
- New directives should include a test in `test/validator/`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## License

[MIT](LICENSE) © Juan Torchia
